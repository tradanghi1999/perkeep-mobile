package org.perkeep.mobile.upload

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Log
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
import java.io.File
import java.util.Date
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
        data.clipData?.let { cd ->
            for (i in 0 until cd.itemCount) {
                cd.getItemAt(i)?.uri?.let { u -> uris.add(u) }
            }
        }
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
        if (call.hasOption("wifiOnly")) store.setWifiOnly(call.getBoolean("wifiOnly", true) ?: true)

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
        }
        // LƯU hàng đợi TRƯỚC khi xếp lịch, nếu không worker có thể chạy trước
        // khi job được ghi và job bị bỏ im lặng.
        val all = store.jobs().toMutableList()
        all.addAll(list)
        store.save(all)
        // Xếp lịch từng job; lỗi 1 job không làm hỏng cả hàng đợi
        for (job in list) {
            try {
                enqueueWork(job)
            } catch (t: Throwable) {
                Log.e(TAG, "enqueue lỗi cho ${job.id}", t)
                job.state = UploadJob.STATE_FAILED
                job.error = t.message ?: t.javaClass.simpleName
                store.update(job)
            }
        }
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
        UploadStore(context).setWifiOnly(call.getBoolean("value", true) ?: true)
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
        try {
            requestPermissionForAlias("notifications", call, "notifResult")
        } catch (t: Throwable) {
            // Không xin được quyền thì vẫn cho chạy tiếp: notification chỉ là phụ
            Log.w(TAG, "requestPermissionForAlias lỗi", t)
            call.resolve(JSObject().put("granted", false))
        }
    }

    /** URL phát media qua proxy nội bộ (dùng khi server đòi đăng nhập). */
    @PluginMethod
    fun mediaUrl(call: PluginCall) {
        val ref = call.getString("fileRef") ?: run { call.reject("Thiếu fileRef"); return }
        val base = (call.getString("base") ?: "").trimEnd('/')
        if (base.isEmpty()) {
            call.resolve(JSObject().put("url", org.json.JSONObject.NULL))
            return
        }
        try {
            val srv = MediaProxyServer.get(context)
            srv.configure(base, call.getString("user"), call.getString("pass"), call.getString("cfId"), call.getString("cfSecret"))
            call.resolve(JSObject().put("url", srv.urlFor(ref)))
        } catch (t: Throwable) {
            Log.w(TAG, "không tạo được media proxy url", t)
            call.resolve(JSObject().put("url", org.json.JSONObject.NULL))
        }
    }

    /** Mở file bằng app khác (VLC/MX Player): tải về cache rồi ACTION_VIEW. */
    @PluginMethod
    fun openExternally(call: PluginCall) {
        val ref = call.getString("fileRef") ?: run { call.reject("Thiếu fileRef"); return }
        val args = MediaOpener.Args(
            base = call.getString("base") ?: "",
            user = call.getString("user"),
            pass = call.getString("pass"),
            fileRef = ref,
            mime = call.getString("mime") ?: "",
            name = call.getString("name") ?: "",
            cfId = call.getString("cfId"),
            cfSecret = call.getString("cfSecret")
        )
        if (args.base.isBlank()) {
            call.resolve(JSObject().put("opened", false))
            return
        }
        // Tải file có thể lâu (file to) -> chạy thread nền, không chặn bridge
        Thread {
            val ok = try {
                MediaOpener.downloadAndOpen(context.applicationContext, args)
            } catch (t: Throwable) {
                Log.w(TAG, "openExternally lỗi", t)
                false
            }
            call.resolve(JSObject().put("opened", ok))
        }.start()
    }

    /** Tải file về thư mục Downloads (native DownloadManager, có Basic auth). */
    @PluginMethod
    fun saveToDownloads(call: PluginCall) {
        val ref = call.getString("fileRef") ?: run { call.reject("Thiếu fileRef"); return }
        val args = MediaOpener.Args(
            base = call.getString("base") ?: "",
            user = call.getString("user"),
            pass = call.getString("pass"),
            fileRef = ref,
            mime = call.getString("mime") ?: "",
            name = call.getString("name") ?: "",
            cfId = call.getString("cfId"),
            cfSecret = call.getString("cfSecret")
        )
        if (args.base.isBlank()) {
            call.resolve(JSObject().put("saved", false))
            return
        }
        try {
            MediaOpener.saveToDownloads(context.applicationContext, args)
            call.resolve(JSObject().put("saved", true))
        } catch (t: Throwable) {
            Log.w(TAG, "saveToDownloads lỗi", t)
            call.reject(t.message ?: "download failed")
        }
    }

    /** Tải file về cache để xem mượt; phát lại qua proxy cache (Range, tua tức thì). */
    @PluginMethod
    fun cacheMedia(call: PluginCall) {
        val ref = call.getString("fileRef") ?: run { call.reject("Thiếu fileRef"); return }
        val base = (call.getString("base") ?: "").trimEnd('/')
        if (base.isEmpty()) {
            call.resolve(JSObject().put("url", org.json.JSONObject.NULL))
            return
        }
        val name = call.getString("name") ?: ""
        val size = call.getLong("size", 0L) ?: 0L
        val user = call.getString("user")
        val pass = call.getString("pass")
        val cfId = call.getString("cfId")
        val cfSecret = call.getString("cfSecret")
        Thread {
            try {
                val srv = MediaProxyServer.get(context)
                val f = MediaCache.ensure(context.applicationContext, base, user, pass, cfId, cfSecret, ref, name, size) { got, total ->
                    val o = JSObject()
                    o.put("fileRef", ref)
                    o.put("got", got)
                    o.put("total", total)
                    try { notifyListeners("cacheProgress", o, true) } catch (_: Throwable) {}
                }
                srv.configure(base, user, pass, cfId, cfSecret)
                val res = JSObject()
                res.put("url", srv.cacheUrlFor(f.name))
                res.put("name", f.name)
                res.put("size", f.length())
                call.resolve(res)
            } catch (t: Throwable) {
                Log.w(TAG, "cacheMedia lỗi", t)
                call.reject(t.message ?: "cache error")
            }
        }.start()
    }

    /** Xoá file đã tải về cache (giải phóng dung lượng). */
    @PluginMethod
    fun clearMediaCache(call: PluginCall) {
        Thread {
            var freed = 0L
            var n = 0
            try {
                MediaCache.dir(context.applicationContext).listFiles()?.forEach {
                    freed += it.length()
                    if (it.delete()) n++
                }
            } catch (t: Throwable) {
                Log.w(TAG, "không xoá được cache", t)
            }
            val res = JSObject()
            res.put("files", n)
            res.put("bytes", freed)
            call.resolve(res)
        }.start()
    }

    /** Dung lượng cache media hiện tại. */
    @PluginMethod
    fun mediaCacheInfo(call: PluginCall) {
        val files = MediaCache.dir(context.applicationContext).listFiles()
        val res = JSObject()
        res.put("files", files?.size ?: 0)
        res.put("bytes", files?.sumOf { it.length() } ?: 0L)
        call.resolve(res)
    }

    /**
     * Lấy link người dùng vừa "Chia sẻ" sang app (ShareActivity ghi vào SharedPreferences).
     * Trả {} nếu không có gì; ngược lại { text, url, sharedAt }.
     */
    @PluginMethod
    fun takeShare(call: PluginCall) {
        val sp = context.getSharedPreferences(ShareActivity.PREFS, android.content.Context.MODE_PRIVATE)
        val text = sp.getString(ShareActivity.KEY_TEXT, null)
        val at = sp.getLong(ShareActivity.KEY_TIME, 0L)
        val res = JSObject()
        if (!text.isNullOrBlank()) {
            // đọc xong xoá luôn để không xử lý lại
            sp.edit().remove(ShareActivity.KEY_TEXT).remove(ShareActivity.KEY_TIME).apply()
            res.put("text", text)
            res.put("url", Regex("https?://\\S+").find(text)?.value ?: "")
            res.put("sharedAt", at)
        }
        call.resolve(res)
    }

    /** Log crash lần trước (không cần adb). */
    @PluginMethod
    fun getLastCrash(call: PluginCall) {
        val txt = runCatching { File(context.filesDir, CRASH_FILE).takeIf { it.exists() }?.readText() }.getOrNull()
        call.resolve(JSObject().put("crash", txt ?: org.json.JSONObject.NULL))
    }

    @PluginMethod
    fun clearCrash(call: PluginCall) {
        runCatching { File(context.filesDir, CRASH_FILE).delete() }
        call.resolve()
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun notifResult(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    companion object {
        private const val TAG = "PkUpload"
        private const val CRASH_FILE = "last-crash.txt"

        /** Bắt exception không lường trước -> ghi ra file để app đọc lại lần sau. */
        fun installCrashHandler(ctx: android.content.Context) {
            val f = File(ctx.filesDir, CRASH_FILE)
            val prev = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { t, e ->
                try {
                    val head = "=== ${Date()} | thread=${t.name} | Android ${Build.VERSION.SDK_INT} ===\n"
                    f.writeText(head + Log.getStackTraceString(e))
                } catch (_: Throwable) {
                }
                prev?.uncaughtException(t, e)
            }
        }
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
        try {
            installCrashHandler(context.applicationContext)
        } catch (t: Throwable) {
            Log.w(TAG, "không cài được crash handler", t)
        }
    }

    override fun handleOnDestroy() {
        unregister(this)
        super.handleOnDestroy()
    }
}
