package org.perkeep.mobile.upload

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import java.util.concurrent.TimeUnit

/**
 * API JS:
 *   pickFiles()      -> { files: [{uri,name,mime,size}] }   (SAF, giữ quyền đọc lâu dài)
 *   enqueue({files, server, wifiOnly}) -> { ids }
 *   list()           -> { jobs }
 *   cancel({id}) / retry({id}) / clearFinished()
 *   setWifiOnly({value}) / wifiOnly()
 *   requestNotificationPermission() -> { granted }
 *   event "progress" -> job
 */
@CapacitorPlugin(
    name = "PkUpload",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")]
)
class PkUploadPlugin : Plugin() {

    // ---------- Chọn file qua SAF ----------
    @PluginMethod
    fun pickFiles(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(call, intent, "pickFilesResult")
    }

    @ActivityCallback
    private fun pickFilesResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        if (result.resultCode != android.app.Activity.RESULT_OK || data == null) {
            call.reject("Người dùng không chọn file")
            return
        }
        val uris = ArrayList<Uri>()
        data.clipData?.let { cd -> for (i in 0 until cd.count) uris.add(cd.getUri(i)) }
        data.data?.let { uris.add(it) }
        val files = JSArray()
        for (u in uris) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    u, Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: SecurityException) {
            }
            files.put(fileInfo(u))
        }
        val res = JSObject()
        res.put("files", files)
        call.resolve(res)
    }

    private fun fileInfo(u: Uri): JSObject {
        var name = u.lastPathSegment ?: "file"
        var size = 0L
        var mime = context.contentResolver.getType(u) ?: "application/octet-stream"
        context.contentResolver.query(u, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val si = c.getColumnIndex(OpenableColumns.SIZE)
                if (ni >= 0) name = c.getString(ni) ?: name
                if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
            }
        }
        return JSObject().apply {
            put("uri", u.toString())
            put("name", name)
            put("mime", mime)
            put("size", size)
        }
    }

    // ---------- Hàng đợi ----------
    @PluginMethod
    fun enqueue(call: PluginCall) {
        val files = call.getArray("files") ?: run { call.reject("Thiếu files"); return }
        val srv = call.getObject("server") ?: run { call.reject("Thiếu server"); return }
        val store = UploadStore(context)
        store.setServer(
            ServerConfig(
                base = (srv.getString("base") ?: "").trimEnd('/'),
                blobRoot = srv.getString("blobRoot") ?: "/bs-and-maybe-also-index/",
                jsonSignRoot = srv.getString("jsonSignRoot") ?: "/sighelper/",
                user = srv.getString("user"),
                pass = srv.getString("pass"),
                tag = srv.getString("tag")
            )
        )
        if (call.hasOption("wifiOnly")) store.setWifiOnly(call.getBoolean("wifiOnly", true))

        val ids = JSArray()
        val list = ArrayList<UploadJob>()
        for (i in 0 until files.length()) {
            val o = files.getJSONObject(i)
            val id = "u" + System.currentTimeMillis() + "-" + i
            val job = UploadJob(
                id = id,
                uri = o.getString("uri"),
                name = o.optString("name"),
                mime = o.optString("mime"),
                size = o.optLong("size")
            )
            list.add(job)
            ids.put(id)
            enqueueWork(job)
        }
        val all = store.jobs().toMutableList()
        all.addAll(list)
        store.save(all)
        val res = JSObject()
        res.put("ids", ids)
        call.resolve(res)
    }

    private fun enqueueWork(job: UploadJob) {
        val store = UploadStore(context)
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (store.wifiOnly()) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .build()
        val req = OneTimeWorkRequestBuilder<UploadWorker>()
            .setInputData(workDataOf(UploadWorker.KEY_ID to job.id))
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag("pk-upload")
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(UploadWorker.uniqueName(job.id), ExistingWorkPolicy.REPLACE, req)
    }

    @PluginMethod
    fun list(call: PluginCall) {
        val arr = JSArray()
        UploadStore(context).jobs().forEach { arr.put(toJS(it)) }
        val res = JSObject()
        res.put("jobs", arr)
        call.resolve(res)
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("Thiếu id"); return }
        val store = UploadStore(context)
        store.get(id)?.let {
            it.state = UploadJob.STATE_CANCELED
            store.update(it)
            emitProgress(context, it)
        }
        WorkManager.getInstance(context).cancelUniqueWork(UploadWorker.uniqueName(id))
        call.resolve()
    }

    @PluginMethod
    fun retry(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("Thiếu id"); return }
        val store = UploadStore(context)
        val job = store.get(id) ?: run { call.reject("Không có job"); return }
        job.state = UploadJob.STATE_QUEUED
        job.error = null
        job.uploaded = 0
        store.update(job)
        enqueueWork(job)
        call.resolve()
    }

    @PluginMethod
    fun clearFinished(call: PluginCall) {
        UploadStore(context).clearFinished()
        call.resolve()
    }

    @PluginMethod
    fun setWifiOnly(call: PluginCall) {
        UploadStore(context).setWifiOnly(call.getBoolean("value", true))
        call.resolve()
    }

    @PluginMethod
    fun wifiOnly(call: PluginCall) {
        val res = JSObject()
        res.put("value", UploadStore(context).wifiOnly())
        call.resolve(res)
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("notifications", call, "notifResult")
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun notifResult(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    companion object {
        /** Job -> dữ liệu cho JS. */
        fun toJS(job: UploadJob): JSObject = JSObject().apply {
            put("id", job.id)
            put("uri", job.uri)
            put("name", job.name)
            put("mime", job.mime)
            put("size", job.size)
            put("state", job.state)
            put("uploaded", job.uploaded)
            put("error", job.error ?: org.json.JSONObject.NULL)
            put("fileRef", job.fileRef ?: org.json.JSONObject.NULL)
        }

        /** Bắn sự kiện "progress" cho JS (nếu app đang mở). */
        fun emitProgress(ctx: android.content.Context, job: UploadJob) {
            instances().forEach { p ->
                try {
                    p.notifyListeners("progress", toJS(job), true)
                } catch (_: Throwable) {
                }
            }
        }

        private val INSTANCES = java.util.Collections.synchronizedList(ArrayList<PkUploadPlugin>())

        private fun instances(): List<PkUploadPlugin> = ArrayList(INSTANCES)

        fun register(p: PkUploadPlugin) {
            INSTANCES.add(p)
        }

        fun unregister(p: PkUploadPlugin) {
            INSTANCES.remove(p)
        }
    }

    override fun load() {
        register(this)
    }

    override fun handleOnDestroy() {
        unregister(this)
        super.handleOnDestroy()
    }
}
