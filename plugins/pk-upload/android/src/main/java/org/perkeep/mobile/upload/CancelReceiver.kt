package org.perkeep.mobile.upload

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.WorkManager

/** Nút "Huỷ" trên notification -> huy job tương ứng. */
class CancelReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val store = UploadStore(ctx)
        store.get(id)?.let {
            it.state = UploadJob.STATE_CANCELED
            store.update(it)
        }
        WorkManager.getInstance(ctx).cancelUniqueWork(UploadWorker.uniqueName(id))
    }

    companion object {
        const val ACTION = "org.perkeep.mobile.upload.CANCEL"
    }
}
