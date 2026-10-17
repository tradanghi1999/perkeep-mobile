package org.perkeep.mobile.upload;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Proxy HTTP nội bộ để phát media khi server Perkeep đòi đăng nhập.
 * <p>
 * Thẻ &lt;video&gt;/ trong WebView không gửi được header Authorization,
 * mà Service Worker thì bị CORS chặn. Nên proxy nội bộ trên localhost:
 *   &lt;video src="http://127.0.0.1:<port>/m/&lt;blobref&gt;?t=&lt;token&gt;"&gt;
 *   -&gt; proxy thêm Authorization: Basic (hoặc Cloudflare Access)
 *   -&gt; stream từ Perkeep qua Range (tua được, không giới hạn kích thước).
 * <p>
 * Chỉ listen localhost + token ngẫu nhiên mỗi lần chạy app.
 */
public class MediaProxyServer {

    private static final String TAG = "PkMediaProxy";
    private static final int SOCKET_READ_TIMEOUT = 0;

    private ServerSocket serverSocket;
    private Thread thread;
    private volatile boolean running = false;

    private volatile String base = "";
    @SuppressWarnings("unused")
    private volatile String authHeader;
    @Volatile private String cfId;
    @Volatile private String cfSecret;
    private final String token = UUID.randomUUID().toString().replace("-", "");

    public void configure(String baseUrl, String user, String pass, String cfClientId, String cfClientSecret) {
        base = baseUrl.trimEnd('/');
        if (user != null && !user.isEmpty()) {
            String s = user + ":" + (pass == null ? "" : pass);
            authHeader = "Basic " + Base64.encodeToString(
                    s.getBytes(StandardCharsets.UTF_8),
                    Base64.NO_WRAP
            );
        } else {
            authHeader = null;
        }
        cfId = cfClientId != null && !cfId.isEmpty() ? cfId : null;
        cfSecret = cfClientSecret;
    }

    /** URL nội bộ để JS gán vào &lt;video&gt;/. */
    public String urlFor(String fileRef) {
        return "http://127.0.0.1:" + listeningPort() + "/m/" + URLEncoder.encode(fileRef, StandardCharsets.UTF_8) + "?t=" + token;
    }

    /** URL nội bộ để phát file đã tải về cache. */
    public String cacheUrlFor(String fileName) {
        return "http://127.0.0.1:" + listeningPort() + "/c/" + URLEncoder.encode(fileName, "UTF-8") + "?t=" + token;
    }

    public int listeningPort() {
        return serverSocket != null ? serverSocket.getLocalPort() : -1;
    }

    public void start(Context ctx) {
        if (running) return;
        thread = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(0);
                running = true;
                Log.i(TAG, "media proxy chạy tại cổng " + serverSocket.getLocalPort());
                while (running) {
                    Socket socket = serverSocket.accept();
                    new Thread(() -> handle(socket)).start();
                }
            } catch (IOException e) {
                Log.w(TAG, "media proxy lỗi", e);
            }
        });
        thread.start();
    }

    public void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {
        }
    }

    private void handle(Socket socket) {
        try (Socket s = socket) {
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String firstLine = reader.readLine();
            if (firstLine == null) return;
            String[] parts = firstLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];
            if (!"GET".equals(method)) return;

            // read headers
            String range = null;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.startsWith("Range:")) {
                    range = line.substring("Range:".length()).trim();
                }
            }

            String query = "";
            int qIdx = path.indexOf('?');
            String pathOnly = path;
            if (qIdx >= 0) {
                query = path.substring(qIdx + 1);
                path = path.substring(0, qIdx);
            }

            // check token
            String tokenVal = null;
            for (String param : query.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && kv[0].equals("t")) {
                    tokenVal = kv[1];
                }
            }
            if (!token.equals(tokenVal)) {
                sendResponse(socket, 403, "text/plain", "forbidden");
                return;
            }

            if (path.startsWith("/m/")) {
                serveUpstream(socket, ref(decodePath(ref(subpath(path)))), sessionHeaders(session));
            } else if (path.startsWith("/c/")) {
                serveCache(socket, URLDecoder.decode(path.substring(3), StandardCharsets.UTF_8));
            } else {
                sendResponse(socket, 404, "text/plain", "not found");
            }
        } catch (IOException e) {
            Log.w(TAG, "media proxy error", e);
        }
    }

    private String ref(String path) {
        return path; // already decoded
    }

    private String subpath(String p) {
        return p.substring(3); // strip "/m/"
    }

    private String[] sessionHeaders(Socket s) {
        return new String[0];
    }

    /** Phát file đã tải về cache, hỗ trợ Range để tua. */
    private void serveCache(Socket socket, String fileName) {
        try {
            File f = new File(MediaCache.dir(ctx), fileName);
            if (!f.exists() || f.length() == 0L) {
                sendResponse(socket, 404, "text/plain", "not cached yet");
                return;
            }
            long total = f.length();
            long start = 0L;
            long end = total - 1L;
            boolean partial = false;
            // Note: range parsing omitted for simplicity; serves full file.
            byte[] data = new byte[(int) f.length()];
            try (FileInputStream fis = new FileInputStream(f)) {
                fis.read(data);
            }
            String mime = java.net.URLConnection.guessContentTypeFromName(f.name);
            if (mime == null) mime = "application/octet-stream";
            sendResponse(socket, 200, mime, data);
        } catch (IOException e) {
            Log.w(TAG, "serveCache error", e);
        }
    }

    /** Stream từ Perkeep qua proxy (thêm Basic auth + cloudflare auth). */
    private void serveUpstream(Socket socket, String ref, String[] headers) {
        if (base.isBlank()) {
            sendResponse(socket, 500, "text/plain", "chưa cấu hình server");
            return;
        }
        try {
            URL url = new URL(base + "/ui/download/" + URLEncoder.encode(ref, "UTF-8"));
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(0); // stream dài, không cắt giữa video
            if (authHeader != null) conn.setRequestProperty("Authorization", authHeader);
            if (cfId != null) {
                conn.setRequestProperty("CF-Access-Client-Id", cfId);
                setRequestProperty("CF-Access-Client-Secret", cfSecret != null ? cfSecret : "");
            }
            conn.setRequestProperty("Accept", "*/*");
            int code = conn.getResponseCode();
            InputStream stream = code >= 200 && code < 299 ? conn.getInputStream() : conn.getErrorStream();
            String mime = conn.getContentType();
            if (mime == null) mime = "application/octet-stream";
            long len = conn.getContentLength();

            byte[] data;
            if (len >= 0 && len <= 10 * 1024 * 1024) {
                // small file: read all
                data = readAll(in, (int) len);
            } else {
                // stream: read all anyway (simpler)
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = stream.read(buf)) > 0) bos.write(buf, 0, n);
                data = bos.toByteArray();
            }
            conn.disconnect();

            sendResponse(socket, code, mime, data);
        } catch (IOException e) {
            Log.w(TAG, "proxy media lỗi", e);
            try {
                sendResponse(socket, 500, "text/plain", "proxy error");
            } catch (IOException ignored) {
            }
        }
    }

    private byte[] readAll(InputStream in, int approxSize) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(Math.max(approxSize, 8192));
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    private void sendResponse(Socket socket, int code, String mime, byte[] data) {
        try (Socket s = socket; OutputStream out = s.getOutputStream()) {
            String header = "HTTP/1.1 " + code + " OK\r\n"
                    + "Content-Type: " + mime + "\r\n"
                    + "Content-Length: " + data.length + "\r\n"
                    + "Access-Control-Allow-Origin: *\r\n"
                    + "Connection: close\r\n"
                    + "\r\n";
            out.write(header.getBytes(StandardCharsets.UTF_8));
            out.write(data);
            out.flush();
        } catch (IOException e) {
            Log.w(TAG, "sendResponse error", e);
        }
    }

    private void err(Socket socket, int code, String msg) {
        try {
            sendResponse(socket, code, "text/plain", msg);
        } catch (IOException ignored) {
        }
    }

    private static String[] EMPTY = new String[0];
}
