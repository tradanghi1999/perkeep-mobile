package org.perkeep.mobile.upload

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo

/** Notification tiến trình upload (kiểu Google Drive) + nút Huỷ. */
class UploadNotifier(private val ctx: Context) {

    private val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Tải lên Perkeep",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Tiến trình tải file lên server Perkeep" }
            manager.createNotificationChannel(ch)
        }
    }

    fun foregroundInfo(job: UploadJob, progress: Int, indeterminate: Boolean = false): ForegroundInfo {
        ensureChannel()
        val id = notificationId(job.id)
        val n = build(job, progress, indeterminate)
        // Android 14+ bắt buộc khai báo type của foreground service khi start.
        // Khai rõ dataSync thay vì dựa vào mặc định để tránh
        // MissingForegroundServiceTypeException.
        return try {
            ForegroundInfo(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } catch (t: Throwable) {
            Log.w(TAG, "ForegroundInfo có type lỗi, dùng mặc định", t)
            ForegroundInfo(id, n)
        }
    }

    fun update(job: UploadJob, progress: Int, indeterminate: Boolean = false) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            manager.areNotificationsEnabled().not()
        ) return
        try {
            ensureChannel()
            manager.notify(notificationId(job.id), build(job, progress, indeterminate))
        } catch (t: Throwable) {
            Log.w(TAG, "update notification lỗi", t)
        }
    }

    fun finish(job: UploadJob, ok: Boolean) {
        try {
            ensureChannel()
            val text = if (ok) "Đã tải lên xong" else "Tải lên thất bại"
            val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle(job.name.ifEmpty { "Tệp" })
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(openApp())
                .build()
            manager.notify(notificationId(job.id), n)
        } catch (t: Throwable) {
            Log.w(TAG, "finish notification lỗi", t)
        }
    }

    private fun build(job: UploadJob, progress: Int, indeterminate: Boolean): Notification {
        val label = when (job.state) {
            UploadJob.STATE_PREPARING -> "Đang chuẩn bị…"
            UploadJob.STATE_SIGNING -> "Đang tạo mục trong Perkeep…"
            UploadJob.STATE_FAILED -> "Lỗi: ${job.error ?: "không rõ"}"
            else -> "Đang tải lên…"
        }
        val b = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(job.name.ifEmpty { "Tệp" })
            .setContentText(label)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setContentIntent(openApp())
            .addAction(0, "Huỷ", cancelIntent(job.id))
        if (indeterminate) b.setProgress(0, 0, true) else b.setProgress(100, progress, false)
        return b.build()
    }

    private fun openApp(): PendingIntent {
        val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        return PendingIntent.getActivity(
            ctx, 0, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun cancelIntent(id: String): PendingIntent {
        val i = Intent(ctx, CancelReceiver::class.java).setAction(CancelReceiver.ACTION).putExtra("id", id)
        return PendingIntent.getBroadcast(
            ctx, id.hashCode(), i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun notificationId(id: String) = ID_BASE + (id.hashCode() and 0xFFFF)

    companion object {
        private const val TAG = "PkUpload"
        const val CHANNEL_ID = "pk-upload"
        private const val ID_BASE = 41000
    }
}
