package org.perkeep.mobile.upload

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.io.File

/**
 * Worker chạy nền: cắt chunk + hash, stat để resume, upload phần thiếu,
 * tạo blob "file", ký permanode + claim để item hiện trong search.
 *
 * Chạy dưới dạng foreground service (type dataSync) nên vẫn tiếp tục khi
 * app bị đưa ra nền hoặc đóng.
 */
class UploadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.failure()
        val store = UploadStore(applicationContext)
        val notifier = UploadNotifier(applicationContext)
        val job = store.get(id) ?: return Result.success()
        if (job.state == UploadJob.STATE_CANCELED || job.state == UploadJob.STATE_DONE) return Result.success()

        val server = store.server()
        if (server.base.isBlank()) {
            fail(store, notifier, job, "Chưa cấu hình server")
            return Result.failure()
        }

        val uploader = PerkeepUploader(
            base = server.base,
            blobRoot = server.blobRoot,
            jsonSignRoot = server.jsonSignRoot,
            authHeader = server.authHeader,
            resolver = applicationContext.contentResolver
        )

        // Notification tiến trình (bắt đầu ngay để WorkManager nâng lên foreground)
        setForeground(notifier.foregroundInfo(job, 0, indeterminate = true))

        try {
            var lastNotify = 0L
            val notify = { pct: Int, indeterminate: Boolean ->
                val now = System.currentTimeMillis()
                if (indeterminate || now - lastNotify > 900 || pct >= 100) {
                    lastNotify = now
                    notifier.update(job, pct, indeterminate)
                }
            }

            // 1) Cắt chunk + hash (cache lại để resume)
            val partsFile = File(applicationContext.cacheDir, "pk-upload/$id.parts.json").apply {
                parentFile?.mkdirs()
            }
            if (partsFile.exists().not()) {
                job.state = UploadJob.STATE_PREPARING
                store.update(job)
                notify(0, true)
            }
            val parts = uploader.prepare(job.uri, partsFile) { done ->
                val pct = if (job.size > 0) ((done * 100) / job.size).toInt() else 0
                notify(pct.coerceIn(0, 100), true)
            }
            if (isStopped) return Result.retry()

            // 2) Hỏi server đã có blob nào (resume ở mức chunk)
            val have = uploader.stat(parts.map { it.ref })

            // 3) Upload chunk còn thiếu
            job.state = UploadJob.STATE_UPLOADING
            store.update(job)
            if (parts.any { it.ref !in have }) {
                uploader.uploadChunks(job.uri, parts, have) { sent ->
                    job.uploaded = sent
                    val total = if (job.size > 0) job.size else 1
                    notify(((sent * 100) / total).toInt().coerceIn(0, 100), false)
                }
            }
            if (isStopped) return Result.retry()

            // 4) Blob "file" (schema) trỏ tới các chunk
            val totalSize = if (job.size > 0) job.size else parts.sumOf { it.size.toLong() }
            val fileBytes = uploader.fileSchemaBlob(job.name, totalSize, parts)
            val fileRef = Sha224.blobRef(fileBytes)
            if (fileRef !in uploader.stat(listOf(fileRef))) {
                uploader.uploadBlob(fileRef, fileBytes)
            }

            // 5) Permanode + claim (ký qua sign handler) để hiện trong search
            job.state = UploadJob.STATE_SIGNING
            store.update(job)
            notify(100, true)
            val permaRef = createPermanode(uploader, server, job, fileRef)

            job.fileRef = fileRef
            job.state = UploadJob.STATE_DONE
            job.uploaded = totalSize
            store.update(job)
            notifier.finish(job, true)
            PkUploadPlugin.emitProgress(applicationContext, job)
            // giữ parts cache để lần sau resume; xoá khi job xong
            partsFile.delete()
            return Result.success()
        } catch (t: Throwable) {
            if (isStopped) return Result.retry()
            val msg = t.message ?: t.javaClass.simpleName
            job.state = UploadJob.STATE_FAILED
            job.error = msg
            store.update(job)
            notifier.finish(job, false)
            PkUploadPlugin.emitProgress(applicationContext, job)
            // Thử lại tối đa vài lần rồi bỏ (WorkManager lo backoff)
            return if (runAttemptCount < 4) Result.retry() else Result.failure()
        }
    }

    /** Tạo permanode + gắn camliContent/title/mimeType/(tag) — trả về blobref permanode. */
    private fun createPermanode(
        uploader: PerkeepUploader,
        server: ServerConfig,
        job: UploadJob,
        fileRef: String
    ): String {
        val pubKey = signerPubKey(server)
        val permaUnsigned = """{"camliSigner":"$pubKey","camliType":"permanode","camliVersion":1}"""
        val permaSigned = uploader.sign(permaUnsigned)
        val permaRef = Sha224.blobRef(permaSigned)
        if (permaRef !in uploader.stat(listOf(permaRef))) {
            uploader.uploadBlob(permaRef, permaSigned.toByteArray(Charsets.UTF_8))
        }

        val attrs = mutableListOf("camliContent" to fileRef)
        if (job.name.isNotEmpty()) attrs.add("title" to job.name)
        if (job.mime.isNotEmpty()) attrs.add("mimeType" to job.mime)
        if (!server.tag.isNullOrEmpty()) attrs.add("tag" to server.tag)

        val now = rfc3339Now()
        val claims = ArrayList<String>()
        for ((attr, value) in attrs) {
            val unsigned = buildString {
                append("{\"attribute\":").append(jsonStr(attr))
                append(",\"camliSigner\":").append(jsonStr(pubKey))
                append(",\"camliType\":\"claim\",\"camliVersion\":1")
                append(",\"claimDate\":").append(jsonStr(now))
                append(",\"claimType\":\"set-attribute\"")
                append(",\"permaNode\":").append(jsonStr(permaRef))
                append(",\"value\":").append(jsonStr(value))
                append('}')
            }
            val signed = uploader.sign(unsigned)
            claims.add(signed)
        }
        val blobs = claims.map { Sha224.blobRef(it) to it.toByteArray(Charsets.UTF_8) }
        val have = uploader.stat(blobs.map { it.first })
        for ((ref, bytes) in blobs) {
            if (ref !in have) uploader.uploadBlob(ref, bytes)
        }
        return permaRef
    }

    /** Lấy blobref public key của signer từ discovery. */
    private fun signerPubKey(server: ServerConfig): String {
        val url = "${server.base}/?camli.mode=config"
        val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 30000
            server.authHeader?.let { setRequestProperty("Authorization", it) }
        }
        try {
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            val o = org.json.JSONObject(text)
            val ref = o.optJSONObject("signing")?.optString("publicKeyBlobRef").orEmpty()
            if (ref.isEmpty()) throw IllegalStateException("Server không có jsonSignRoot/publicKey")
            return ref
        } finally {
            conn.disconnect()
        }
    }

    private fun rfc3339Now(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date())
    }

    private fun jsonStr(s: String): String {        val out = StringBuilder("\"")
        for (c in s) when (c) {
            '"' -> out.append("\\\"")
            '\\' -> out.append("\\\\")
            '\n' -> out.append("\\n")
            '\r' -> out.append("\\r")
            else -> out.append(c)
        }
        return out.append('"').toString()
    }

    private fun fail(store: UploadStore, notifier: UploadNotifier, job: UploadJob, msg: String) {
        job.state = UploadJob.STATE_FAILED
        job.error = msg
        store.update(job)
        notifier.finish(job, false)
        PkUploadPlugin.emitProgress(applicationContext, job)
    }

    companion object {
        const val KEY_ID = "id"
        fun uniqueName(id: String) = "pk-upload-$id"
    }
}
