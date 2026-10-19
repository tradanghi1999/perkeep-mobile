package org.perkeep.mobile.upload

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Nhận "Chia sẻ" (ACTION_SEND text/plain) từ YouTube / Chrome / trình duyệt.
 *
 * Cách hoạt động:
 *  1. Lưu text được chia sẻ vào SharedPreferences (app có thể chưa chạy).
 *  2. Mở MainActivity (nếu app đang chạy thì chỉ đưa lên trước).
 *  3. JS gọi PkUpload.takeShare() khi app hiện lên -> lấy link -> mở form thêm video.
 *
 * Activity này không có UI nên dùng theme trong suốt và finish ngay.
 */
class ShareActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = when (intent?.action) {
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
                ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
            else -> null
        }
        if (!text.isNullOrBlank()) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_TEXT, text.trim())
                .putLong(KEY_TIME, System.currentTimeMillis())
                .apply()
        }
        // Mở app chính
        try {
            packageManager.getLaunchIntentForPackage(packageName)?.let { i ->
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(i)
            }
        } catch (_: Exception) {
            // không mở được thì thôi, người dùng bấm icon app
        }
        finish()
    }

    companion object {
        const val PREFS = "pk_share"
        const val KEY_TEXT = "pending_text"
        const val KEY_TIME = "pending_time"
    }
}
