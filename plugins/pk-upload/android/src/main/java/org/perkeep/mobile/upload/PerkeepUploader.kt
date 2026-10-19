package org.perkeep.mobile.upload

import android.content.ContentResolver
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException

/** Một chunk nội dung file. */
data class Part(val ref: String, val size: Int, val offset: Long)

object Sha224 {
    private val md: ThreadLocal<MessageDigest> = ThreadLocal.withInitial {
        try {
            MessageDigest.getInstance("SHA-224")
        } catch (e: NoSuchAlgorithmException) {
            // Một số máy hiếm không có SHA-224 -> báo lỗi rõ ràng thay vì crash
            throw IllegalStateException("Thiết bị không hỗ trợ SHA-224: ${e.message}", e)
        }
    }

    fun hex(bytes: ByteArray): String {
        val d = md.get().digest(bytes)
        val sb = StringBuilder(d.size * 2)
        for (b in d) sb.append("%02x".format(b))
        return sb.toString()
    }

    fun blobRef(bytes: ByteArray): String = "sha224-" + hex(bytes)
    fun blobRef(text: String): String = blobRef(text.toByteArray(Charsets.UTF_8))
}

/**
 * Nói chuyện với Perkeep để upload file:
 *  - cắt file thành chunk 1 MiB, mỗi chunk là 1 blob (sha224)
 *  - camli/stat để biết server đã có blob nào (resume được)
 *  - camli/upload multipart để gửi các blob còn thiếu
 *  - blob "file" (schema) trỏ tới các chunk
 *  - ký permanode + claim qua jsonSignRoot để item hiện trong search
 */
class PerkeepUploader(
    private val base: String,
    private val blobRoot: String,
    private val jsonSignRoot: String,
    private val authHeader: String?,
    private val resolver: ContentResolver,
    private val chunkSize: Int = 1 shl 20,
    private val batchChunks: Int = 5
) {

    // ---------- Chunk + hash (có cache để resume) ----------
    fun prepare(uriStr: String, partsFile: File, onProgress: (Long) -> Unit): List<Part> {
        if (partsFile.exists()) {
            runCatching { return parseParts(partsFile.readText()) }
        }
        val parts = ArrayList<Part>()
        var offset = 0L
        open(uriStr).use { ins ->
            val buf = ByteArray(chunkSize)
            while (true) {
                val n = readFully(ins, buf)
                if (n <= 0) break
                val chunk = buf.copyOf(n)
                parts.add(Part(Sha224.blobRef(chunk), n, offset))
                offset += n
                onProgress(offset)
            }
        }
        partsFile.writeText(partsToJson(parts))
        return parts
    }

    // ---------- Blob "file" (schema) ----------
    fun fileSchemaBlob(name: String, size: Long, parts: List<Part>): ByteArray {
        // Go marshals map -> key sắp xếp a-z, nên giữ đúng thứ tự này cho canonical.
        val sb = StringBuilder()
        sb.append("{\"camliType\":\"file\",\"camliVersion\":1")
        sb.append(",\"fileName\":").append(jsonString(name))
        sb.append(",\"parts\":[")
        parts.forEachIndexed { i, p ->
            if (i > 0) sb.append(',')
            sb.append("{\"blobRef\":\"").append(p.ref).append("\",\"size\":").append(p.size).append('}')
        }
        sb.append("],\"size\":").append(size).append('}')
        return sb.toString().toByteArray(Charsets.UTF_8)
    }

    // ---------- stat / upload ----------
    /** Trả về tập blobref server ĐÃ có. */
    fun stat(refs: List<String>): Set<String> {
        if (refs.isEmpty()) return emptySet()
        val have = HashSet<String>()
        refs.chunked(200).forEach { group ->
            val form = StringBuilder("camliversion=1")
            group.forEachIndexed { i, r -> form.append("&blob").append(i + 1).append('=').append(urlEncode(r)) }
            val res = request(
                "POST", "$base$blobRoot" + "camli/stat",
                "application/x-www-form-urlencoded", form.toString().toByteArray(Charsets.UTF_8)
            )
            if (res.code !in 200..299) throw IOException("stat HTTP ${res.code}")
            val arr = JSONObject(res.text).optJSONArray("stat") ?: JSONArray()
            for (i in 0 until arr.length()) {
                val r = arr.optJSONObject(i)?.optString("blobRef").orEmpty()
                if (r.isNotEmpty()) have.add(r)
            }
        }
        return have
    }

    /** Upload nội dung file, chỉ gửi chunk chưa có. Trả về số byte đã gửi. */
    fun uploadChunks(uriStr: String, parts: List<Part>, have: Set<String>, onProgress: (Long) -> Unit): Long {
        val missingIdx = parts.indices.filter { parts[it].ref !in have }
        if (missingIdx.isEmpty()) return 0
        var sent = 0L
        open(uriStr).use { ins ->
            var pos = 0L
            var i = 0
            while (i < missingIdx.size) {
                val group = missingIdx.subList(i, minOf(i + batchChunks, missingIdx.size))
                val blobs = ArrayList<Pair<String, ByteArray>>(group.size)
                for (idx in group) {
                    val p = parts[idx]
                    if (p.offset < pos) throw IOException("parts không theo thứ tự tăng dần")
                    if (p.offset > pos) {
                        skipTo(ins, p.offset - pos)
                        pos = p.offset
                    }
                    blobs.add(p.ref to readExact(ins, p.size))
                    pos += p.size
                }
                uploadMultipart(blobs)
                sent += group.sumOf { parts[it].size.toLong() }
                onProgress(sent)
                i += group.size
            }
        }
        return sent
    }

    private fun skipTo(ins: InputStream, n: Long) {
        var left = n
        val buf = ByteArray(64 * 1024)
        while (left > 0) {
            val r = ins.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
            if (r < 0) throw IOException("EOF khi seek")
            left -= r
        }
    }

    fun uploadBlob(ref: String, bytes: ByteArray) {
        uploadMultipart(listOf(ref to bytes))
    }

    private fun uploadMultipart(blobs: List<Pair<String, ByteArray>>) {
        val boundary = "----pk-" + Sha224.hex((System.nanoTime().toString() + Math.random()).toByteArray()).substring(0, 20)
        val out = ByteArrayOutputStream()
        for ((ref, bytes) in blobs) {
            out.write("--$boundary\r\n".toByteArray())
            out.write("Content-Disposition: form-data; name=\"$ref\"; filename=\"$ref\"\r\n".toByteArray())
            out.write("Content-Type: application/octet-stream\r\n\r\n".toByteArray())
            out.write(bytes)
            out.write("\r\n".toByteArray())
        }
        out.write("--$boundary--\r\n".toByteArray())
        val res = request(
            "POST", "$base$blobRoot" + "camli/upload",
            "multipart/form-data; boundary=$boundary", out.toByteArray()
        )
        if (res.code !in 200..299) throw IOException("upload HTTP ${res.code}: ${res.text.take(300)}")
    }

    // ---------- Ký (permanode + claim) ----------
    /** Gửi JSON chưa ký, nhận lại JSON đã ký (đúng bytes để hash thành blobref). */
    fun sign(unsignedJson: String): String {
        val form = "json=" + urlEncode(unsignedJson)
        val res = request(
            "POST", "$base$jsonSignRoot" + "camli/sig/sign",
            "application/x-www-form-urlencoded", form.toByteArray(Charsets.UTF_8)
        )
        if (res.code !in 200..299) throw IOException("sign HTTP ${res.code}: ${res.text.take(300)}")
        return res.text.trim()
    }

    /** URL blob cho ảnh/file đã upload (dùng cho app). */
    fun downloadUrl(fileRef: String) = "$base/ui/download/${urlEncode(fileRef)}"

    // ---------- helpers ----------
    data class HttpResult(val code: Int, val text: String)

    private fun request(method: String, url: String, contentType: String?, body: ByteArray?): HttpResult {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 180000
            doInput = true
            if (body != null) doOutput = true
            contentType?.let { setRequestProperty("Content-Type", it) }
            authHeader?.let { setRequestProperty("Authorization", it) }
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (body != null) {
                conn.setFixedLengthStreamingMode(body.size)
                conn.outputStream.use { it.write(body) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return HttpResult(code, text)
        } finally {
            conn.disconnect()
        }
    }

    private fun open(uriStr: String): InputStream =
        resolver.openInputStream(Uri.parse(uriStr)) ?: throw IOException("Không mở được $uriStr")

    private fun readFully(ins: InputStream, buf: ByteArray): Int {
        var off = 0
        while (off < buf.size) {
            val r = ins.read(buf, off, buf.size - off)
            if (r < 0) break
            off += r
        }
        return off
    }

    private fun readExact(ins: InputStream, n: Int): ByteArray {
        val b = ByteArray(n)
        var off = 0
        while (off < n) {
            val r = ins.read(b, off, n - off)
            if (r < 0) throw IOException("EOF khi đọc chunk")
            off += r
        }
        return b
    }

    private fun urlEncode(s: String): String =
        java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    private fun jsonString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
        }
        return sb.append('"').toString()
    }

    private fun partsToJson(parts: List<Part>): String {
        val arr = JSONArray()
        parts.forEach {
            arr.put(JSONObject().put("ref", it.ref).put("size", it.size).put("offset", it.offset))
        }
        return arr.toString()
    }

    private fun parseParts(text: String): List<Part> {
        val arr = JSONArray(text)
        val out = ArrayList<Part>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(Part(o.getString("ref"), o.getInt("size"), o.getLong("offset")))
        }
        return out
    }
}
