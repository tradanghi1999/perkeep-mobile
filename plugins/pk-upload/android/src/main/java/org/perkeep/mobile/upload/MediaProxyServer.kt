package org.perkeep.mobile.upload

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
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

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: return err(Response.Status.BAD_REQUEST, "bad request")
        if (!uri.startsWith("/m/")) return err(Response.Status.NOT_FOUND, "not found")
        if (session.parameters["t"]?.firstOrNull() != token) return err(Response.Status.FORBIDDEN, "forbidden")
        if (base.isBlank()) return err(Response.Status.INTERNAL_ERROR, "chưa cấu hình server")

        val ref = uri.substring(3)
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
