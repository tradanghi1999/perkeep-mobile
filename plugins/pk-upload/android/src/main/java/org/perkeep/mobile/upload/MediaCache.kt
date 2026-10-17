package org.perkeep.mobile.upload

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Tải media về cache để xem mượt (kiểu "Make available offline" của Google Drive).
 *
 * Vì sao cần: video quay bằng điện thoại thường 1080p60 ~25-30 Mbps. Xem trực tiếp
 * qua Wi-Fi yếu hoặc qua Cloudflare Tunnel (giới hạn bởi băng thông upload của nhà)
 * thì không đủ băng thông -> giật. Tải hẳn về rồi phát từ bộ nhớ máy thì mượt và tua tức thì.
 */
object MediaCache {

    private const val TAG = "PkMediaCache"

    fun safeName(name: String, fallback: String): String =
        name.ifBlank { fallback }.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifEmpty { "media" }

    fun dir(ctx: Context): File = File(ctx.cacheDir, "media").apply { mkdirs() }

    fun fileFor(ctx: Context, name: String, fallback: String): File = File(dir(ctx), safeName(name, fallback))

    /** Tải nếu chưa có (hoặc file cũ không khớp kích thước). Trả về file trong cache. */
    fun ensure(
        ctx: Context,
        base: String,
        user: String?,
        pass: String?,
        cfId: String?,
        cfSecret: String?,
        fileRef: String,
        name: String,
        expectedSize: Long,
        onProgress: (Long, Long) -> Unit
    ): File {
        val out = fileFor(ctx, name, fileRef)
        if (out.exists() && out.length() > 0 && (expectedSize <= 0 || out.length() == expectedSize)) {
            Log.i(TAG, "đã có trong cache: ${out.name} (${out.length()} bytes)")
            onProgress(out.length(), out.length())
            return out
        }
        val tmp = File(out.parentFile, out.name + ".part")
        val url = URL(base.trimEnd('/') + "/ui/download/" + URLEncoder.encode(fileRef, "UTF-8"))
        val conn = (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 0
            if (!user.isNullOrEmpty()) {
                setRequestProperty(
                    "Authorization",
                    "Basic " + android.util.Base64.encodeToString(
                        "$user:${pass ?: ""}".toByteArray(Charsets.UTF_8),
                        android.util.Base64.NO_WRAP
                    )
                )
            }
            if (!cfId.isNullOrEmpty()) {
                setRequestProperty("CF-Access-Client-Id", cfId)
                setRequestProperty("CF-Access-Client-Secret", cfSecret ?: "")
            }
        }
        val code = conn.responseCode
        if (code !in 200..299) throw IllegalStateException("HTTP $code")
        val total = conn.contentLengthLong.takeIf { it > 0 } ?: expectedSize
        var got = 0L
        var lastTick = 0L
        conn.inputStream.use { input ->
            tmp.outputStream().use { output ->
                val buf = ByteArray(256 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    output.write(buf, 0, n)
                    got += n
                    val now = System.currentTimeMillis()
                    if (now - lastTick > 500) { // báo tiến trình ~2 lần/giây
                        lastTick = now
                        onProgress(got, total)
                    }
                }
            }
        }
        if (out.exists()) out.delete()
        tmp.renameTo(out)
        onProgress(got, total)
        Log.i(TAG, "tải xong ${out.name}: $got bytes")
        return out
    }
}
