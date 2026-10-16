package org.perkeep.mobile.upload

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Mở file bằng ứng dụng khác (VLC / MX Player...) — đúng cách Android:
 *  1. tải file về cache (kèm Basic auth nếu server đòi đăng nhập)
 *  2. chia sẻ qua FileProvider dưới dạng content:// + đúng MIME
 *  3. bắn ACTION_VIEW -> hệ thống hiện danh sách app (VLC, MX Player, Chrome...)
 *
 * Vì sao phải tải về: nếu chỉ đưa URL http:// thì hệ thống luôn mở trình duyệt,
 * và VLC cũng không gửi được header Authorization.
 */
object MediaOpener {

    private const val TAG = "PkMediaOpen"

    class Args(
        val base: String,
        val user: String?,
        val pass: String?,
        val fileRef: String,
        val mime: String,
        val name: String
    )

    /** Trả về true nếu đã mở được bằng app khác. Chạy ở thread nền. */
    fun downloadAndOpen(ctx: Context, args: Args): Boolean {
        val safeName = args.name.ifBlank { args.fileRef }.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)
        val dir = File(ctx.cacheDir, "media").apply { mkdirs() }
        val out = File(dir, safeName.ifEmpty { "media" })

        if (!out.exists() || out.length() == 0L) {
            val url = URL(args.base.trimEnd('/') + "/ui/download/" + URLEncoder.encode(args.fileRef, "UTF-8"))
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000
                readTimeout = 0
                if (!args.user.isNullOrEmpty()) {
                    val token = android.util.Base64.encodeToString(
                        "${args.user}:${args.pass ?: ""}".toByteArray(Charsets.UTF_8),
                        android.util.Base64.NO_WRAP
                    )
                    setRequestProperty("Authorization", "Basic $token")
                }
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "tải thất bại HTTP $code")
                return false
            }
            conn.inputStream.use { input -> out.outputStream().use { input.copyTo(it) } }
            Log.i(TAG, "đã tải ${out.length()} bytes vào ${out.name}")
        }

        val mime = args.mime.ifBlank { "application/octet-stream" }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.pkupload.files", out)
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            // createChooser để người dùng chọn VLC / MX Player / ...
            ctx.startActivity(Intent.createChooser(view, "Mở bằng").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "không có app nào mở được $mime", e)
            // thử mở bằng trình duyệt với URL gốc
            try {
                ctx.startActivity(
                    Intent(Intent.ACTION_VIEW, android.net.Uri.parse(args.base.trimEnd('/') + "/ui/?p=" + args.fileRef))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                true
            } catch (e2: Throwable) {
                Log.w(TAG, "mở bằng trình duyệt cũng lỗi", e2)
                false
            }
        } catch (t: Throwable) {
            Log.w(TAG, "startActivity lỗi", t)
            false
        }
    }
}
