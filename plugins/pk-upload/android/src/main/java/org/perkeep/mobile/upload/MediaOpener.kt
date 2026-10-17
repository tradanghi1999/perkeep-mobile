package org.perkeep.mobile.upload

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
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
        val name: String,
        val cfId: String? = null,
        val cfSecret: String? = null
    )

    /** Trả về true nếu đã mở được bằng app khác. Chạy ở thread nền. */
    fun downloadAndOpen(ctx: Context, args: Args): Boolean {        val out = MediaCache.ensure(
            ctx, args.base, args.user, args.pass, args.cfId, args.cfSecret,
            args.fileRef, args.name, 0L
        ) { _, _ -> }

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

    /** Tải thẳng vào thư mục Downloads của máy (DownloadManager, không qua cache). */
    fun saveToDownloads(ctx: Context, args: Args): Boolean {
        val url = args.base.trimEnd('/') + "/ui/download/" + URLEncoder.encode(args.fileRef, "UTF-8")
        val name = downloadName(args.name, args.fileRef)
        val req = DownloadManager.Request(Uri.parse(url))
            .setTitle(name)
            .setDescription("Perkeep")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            .setMimeType(args.mime.ifBlank { "application/octet-stream" })
        if (!args.user.isNullOrEmpty()) {
            req.addRequestHeader(
                "Authorization",
                "Basic " + android.util.Base64.encodeToString(
                    "${args.user}:${args.pass ?: ""}".toByteArray(Charsets.UTF_8),
                    android.util.Base64.NO_WRAP
                )
            )
        }
        if (!args.cfId.isNullOrEmpty()) {
            req.addRequestHeader("CF-Access-Client-Id", args.cfId)
            req.addRequestHeader("CF-Access-Client-Secret", args.cfSecret ?: "")
        }
        val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        dm.enqueue(req)
        return true
    }

    private fun downloadName(name: String, fallback: String): String {
        val cleaned = name.ifBlank { fallback }
            .replace(Regex("[\\\\/:*?\"<>|\\r\\n\\t]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(110)
        return cleaned.ifEmpty { "perkeep-file" }
    }
}
