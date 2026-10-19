package org.perkeep.mobile.upload

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Cấu hình server để upload (lưu kèm hàng đợi). */
data class ServerConfig(
    val base: String,
    val blobRoot: String = "/bs-and-maybe-also-index/",
    val jsonSignRoot: String = "/sighelper/",
    val user: String? = null,
    val pass: String? = null,
    val tag: String? = null
) {
    val authHeader: String?
        get() = if (!user.isNullOrEmpty()) {
            "Basic " + android.util.Base64.encodeToString(
                "$user:${pass ?: ""}".toByteArray(Charsets.UTF_8),
                android.util.Base64.NO_WRAP
            )
        } else null
}

/** Một job upload, lưu bền trong SharedPreferences để sống qua kill app. */
data class UploadJob(
    val id: String,
    val uri: String,
    val name: String,
    val mime: String,
    val size: Long,
    var state: String = STATE_QUEUED,
    var uploaded: Long = 0,
    var error: String? = null,
    var partsPath: String? = null,
    var fileRef: String? = null
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("uri", uri).put("name", name).put("mime", mime).put("size", size)
        .put("state", state).put("uploaded", uploaded)
        .put("error", error ?: JSONObject.NULL)
        .put("partsPath", partsPath ?: JSONObject.NULL)
        .put("fileRef", fileRef ?: JSONObject.NULL)

    companion object {
        const val STATE_QUEUED = "queued"
        const val STATE_PREPARING = "preparing"
        const val STATE_UPLOADING = "uploading"
        const val STATE_SIGNING = "signing"
        const val STATE_DONE = "done"
        const val STATE_FAILED = "failed"
        const val STATE_CANCELED = "canceled"

        fun fromJson(o: JSONObject) = UploadJob(
            id = o.getString("id"),
            uri = o.getString("uri"),
            name = o.optString("name"),
            mime = o.optString("mime"),
            size = o.optLong("size"),
            state = o.optString("state", STATE_QUEUED),
            uploaded = o.optLong("uploaded"),
            error = o.optString("error").takeIf { it.isNotEmpty() && it != "null" },
            partsPath = o.optString("partsPath").takeIf { it.isNotEmpty() && it != "null" },
            fileRef = o.optString("fileRef").takeIf { it.isNotEmpty() && it != "null" }
        )
    }
}

/** Hàng đợi + cấu hình, lưu trong SharedPreferences. */
class UploadStore(private val ctx: Context) {

    private val prefs = ctx.getSharedPreferences("pk_upload", Context.MODE_PRIVATE)

    fun server(): ServerConfig {
        val o = runCatching { JSONObject(prefs.getString(KEY_SERVER, "{}")!!) }.getOrElse { JSONObject() }
        return ServerConfig(
            base = o.optString("base").trimEnd('/'),
            blobRoot = o.optString("blobRoot", "/bs-and-maybe-also-index/"),
            jsonSignRoot = o.optString("jsonSignRoot", "/sighelper/"),
            user = o.optString("user").takeIf { it.isNotEmpty() },
            pass = o.optString("pass").takeIf { it.isNotEmpty() },
            tag = o.optString("tag").takeIf { it.isNotEmpty() }
        )
    }

    fun setServer(s: ServerConfig) {
        prefs.edit().putString(
            KEY_SERVER,
            JSONObject()
                .put("base", s.base).put("blobRoot", s.blobRoot).put("jsonSignRoot", s.jsonSignRoot)
                .put("user", s.user ?: "").put("pass", s.pass ?: "").put("tag", s.tag ?: "")
                .toString()
        ).apply()
    }

    fun wifiOnly(): Boolean = prefs.getBoolean(KEY_WIFI, true)
    fun setWifiOnly(v: Boolean) = prefs.edit().putBoolean(KEY_WIFI, v).apply()

    @Synchronized
    fun jobs(): MutableList<UploadJob> {
        val arr = runCatching { JSONArray(prefs.getString(KEY_JOBS, "[]")!!) }.getOrElse { JSONArray() }
        val out = ArrayList<UploadJob>(arr.length())
        for (i in 0 until arr.length()) out.add(UploadJob.fromJson(arr.getJSONObject(i)))
        return out
    }

    @Synchronized
    fun save(list: List<UploadJob>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        prefs.edit().putString(KEY_JOBS, arr.toString()).apply()
    }

    @Synchronized
    fun update(job: UploadJob) {
        val list = jobs()
        val i = list.indexOfFirst { it.id == job.id }
        if (i >= 0) list[i] = job else list.add(job)
        save(list)
    }

    @Synchronized
    fun get(id: String): UploadJob? = jobs().firstOrNull { it.id == id }

    @Synchronized
    fun remove(id: String) {
        save(jobs().filterNot { it.id == id })
    }

    @Synchronized
    fun clearFinished() {
        save(jobs().filter { it.state != UploadJob.STATE_DONE && it.state != UploadJob.STATE_CANCELED && it.state != UploadJob.STATE_FAILED })
    }

    companion object {
        private const val KEY_SERVER = "server"
        private const val KEY_JOBS = "jobs"
        private const val KEY_WIFI = "wifi_only"
    }
}
