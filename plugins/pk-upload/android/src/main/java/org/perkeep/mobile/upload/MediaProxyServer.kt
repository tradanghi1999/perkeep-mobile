package org.perkeep.mobile.upload

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

/**
 * Proxy HTTP nội bộ để PHÁT media khi server Perkeep đòi đăng nhập.
 *
 * Vì sao cần: thẻ <video>/<img> trong WebView không gửi được header
 * `Authorization`, còn Service Worker thì bị CORS chặn khi gắn header đó.
 * Nên: <video src="http://127.0.0.1:<port>/m/<ref>?t=<token>"> -> server này
 * thêm Basic auth rồi stream (có chuyển tiếp Range) từ Perkeep.
 *
 * Chỉ listen trên 127.0.0.1, kèm token ngẫu nhiên mỗi lần chạy app.
 */
class MediaProxyServer(private val ctx: Context) : NanoHTTPD("127.0.0.1", 0) {

    @Volatile private var base: String = ""
    @Volatile private var authHeader: String? = null
    @Volatile private var cfId: String? = null
    @Volatile private var cfSecret: String? = null
    private val token: String = UUID.randomUUID().toString().replace("-", "")

    fun configure(baseUrl: String, user: String?, pass: String?, cfClientId: String? = null, cfClientSecret: String? = null) {
        base = baseUrl.trimEnd('/')
        authHeader = if (!user.isNullOrEmpty()) {
            "Basic " + android.util.Base64.encodeToString(
                "$user:${pass ?: ""}".toByteArray(Charsets.UTF_8),
                android.util.Base64.NO_WRAP
            )
        } else null
        cfId = cfClientId?.takeIf { it.isNotEmpty() }
        cfSecret = cfClientSecret
    }

    /** URL nội bộ để JS gán vào <video>/<img>. */
    fun urlFor(fileRef: String): String =
        "http://127.0.0.1:$listeningPort/m/${URLEncoder.encode(fileRef, "UTF-8")}?t=$token"

    /** URL nội bộ phát file ĐÃ TẢI VỀ CACHE (xem mượt, tua tức thì). */
    fun cacheUrlFor(name: String): String =
        "http://127.0.0.1:$listeningPort/c/${URLEncoder.encode(name, "UTF-8")}?t=$token"

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: return err(Response.Status.BAD_REQUEST, "bad request")
        if (session.parameters["t"]?.firstOrNull() != token) return err(Response.Status.FORBIDDEN, "forbidden")
        return when {
            uri.startsWith("/m/") -> serveUpstream(uri.substring(3), session)
            uri.startsWith("/c/") -> serveCache(uri.substring(3), session)
            else -> err(Response.Status.NOT_FOUND, "not found")
        }
    }

    /** Phát file đã tải trong cache, có hỗ trợ Range để tua. */
    private fun serveCache(encodedName: String, session: IHTTPSession): Response {
        val name = java.net.URLDecoder.decode(encodedName, "UTF-8")
        val f = File(MediaCache.dir(ctx), name)
        if (!f.exists() || f.length() == 0L) return err(Response.Status.NOT_FOUND, "chưa tải về máy")
        val total = f.length()
        var start = 0L
        var end = total - 1
        var partial = false
        val range = session.headers["range"]
        if (range != null && range.startsWith("bytes=")) {
            val spec = range.removePrefix("bytes=").split("-")
            start = spec.getOrNull(0)?.toLongOrNull() ?: 0L
            if (start < 0 || start >= total) start = 0L
            end = spec.getOrNull(1)?.toLongOrNull() ?: (total - 1)
            if (end >= total) end = total - 1
            if (end < start) end = start
            partial = true
        }
        val len = end - start + 1
        val mime = java.net.URLConnection.guessContentTypeFromName(f.name) ?: "application/octet-stream"
        val ins = java.io.FileInputStream(f)
        if (start > 0) ins.channel.position(start)
        val status = if (partial) Response.Status.PARTIAL_CONTENT else Response.Status.OK
        val res = newFixedLengthResponse(status, mime, ins, len)
        if (partial) res.addHeader("Content-Range", "bytes $start-$end/$total")
        res.addHeader("Accept-Ranges", "bytes")
        res.addHeader("Access-Control-Allow-Origin", "*")
        return res
    }

    private fun serveUpstream(ref: String, session: IHTTPSession): Response {
        if (base.isBlank()) return err(Response.Status.INTERNAL_ERROR, "chưa cấu hình server")
        return try {
            val target = URL("$base/ui/download/" + URLEncoder.encode(ref, "UTF-8"))
            val conn = (target.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000
                readTimeout = 0 // stream dài, không cắt giữa video
                authHeader?.let { setRequestProperty("Authorization", it) }
                cfId?.let {
                    setRequestProperty("CF-Access-Client-Id", it)
                    setRequestProperty("CF-Access-Client-Secret", cfSecret ?: "")
                }
                session.headers["range"]?.let { setRequestProperty("Range", it) } // tua video
                setRequestProperty("Accept", "*/*")
            }
            val code = conn.responseCode
            val stream: InputStream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: return err(Response.Status.lookup(code) ?: Response.Status.INTERNAL_ERROR, "lỗi upstream $code"))
            val status = Response.Status.lookup(code) ?: Response.Status.OK
            val mime = conn.contentType ?: "application/octet-stream"
            val len = conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L

            val res = if (len >= 0) newFixedLengthResponse(status, mime, stream, len)
            else newChunkedResponse(status, mime, stream)
            conn.getHeaderField("Content-Range")?.let { res.addHeader("Content-Range", it) }
            conn.getHeaderField("Accept-Ranges")?.let { res.addHeader("Accept-Ranges", it) }
            // Cho phép WebView đọc (origin là https://localhost)
            res.addHeader("Access-Control-Allow-Origin", "*")
            res
        } catch (t: Throwable) {
            Log.w(TAG, "proxy media lỗi", t)
            err(Response.Status.INTERNAL_ERROR, t.message ?: "proxy error")
        }
    }

    private fun err(status: Response.IStatus, msg: String) =
        newFixedLengthResponse(status, "text/plain", msg)

    companion object {
        private const val TAG = "PkMediaProxy"

        @Volatile private var instance: MediaProxyServer? = null

        /** Khởi động (1 lần) và trả về server đang chạy. */
        @Synchronized
        fun get(ctx: Context): MediaProxyServer {
            instance?.let { return it }
            val s = MediaProxyServer(ctx.applicationContext)
            s.start(SOCKET_READ_TIMEOUT, false) // daemon, không chặn thoát app
            instance = s
            Log.i(TAG, "media proxy chạy ở cổng ${s.listeningPort}")
            return s
        }
    }
}
