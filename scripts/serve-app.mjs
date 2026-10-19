// Static server cho app + APK (thay `vite preview`).
// Lý do: vite/sirv không biết MIME của .apk -> Content-Type rỗng -> Chrome/Android
// đoán là application/zip và đổi đuôi file thành .zip khi tải.
//
//   /            -> dist/index.html (SPA)
//   /*           -> file tĩnh trong dist/
//   /app-debug.apk -> application/vnd.android.package-archive + filename="pk-app-debug.apk"
//   /pk/*        -> proxy sang perkeepd (http://127.0.0.1:3179/*), giữ nguyên method/headers
//
// Chạy: bun scripts/serve-app.mjs   (PORT=4173, PK_BASE=http://127.0.0.1:3179)

import { join, extname, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = join(ROOT, 'dist');
const QR = join(ROOT, 'docs', 'qr');
const PORT = Number(process.env.PORT || 4173);
const PK = (process.env.PK_BASE || 'http://127.0.0.1:3179').replace(/\/+$/, '');

const MIME = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  txt: 'text/plain; charset=utf-8',
  apk: 'application/vnd.android.package-archive',
  zip: 'application/zip',
  mp4: 'video/mp4'
};

function safePath(pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/' || p === '') p = '/index.html';
  const full = normalize(join(DIST, p));
  // chặn path traversal
  if (!full.startsWith(normalize(DIST))) return null;
  return full;
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url);

    // ---------- proxy Perkeep ----------
    if (url.pathname === '/pk' || url.pathname.startsWith('/pk/')) {
      const target = PK + url.pathname.replace(/^\/pk/, '') + url.search;
      const headers = new Headers(req.headers);
      headers.delete('host');
      try {
        const r = await fetch(target, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
          redirect: 'manual'
        });
        const out = new Headers(r.headers);
        out.delete('content-encoding'); // fetch đã giải nén
        out.delete('content-length');
        return new Response(r.body, { status: r.status, headers: out });
      } catch (e) {
        return new Response(`proxy error: ${e.message}`, { status: 502 });
      }
    }

    // ---------- /docs/* (wireframe, tai lieu tinh) ----------
    if (url.pathname.startsWith('/docs/')) {
      const name = url.pathname.replace(/^\/docs\//, '');
      const full = normalize(join(ROOT, 'docs', name));
      if (!full.startsWith(normalize(join(ROOT, 'docs')))) return new Response('bad path', { status: 400 });
      const f = Bun.file(full);
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      const ext = extname(name).slice(1).toLowerCase();
      return new Response(f, { headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' } });
    }

    // ---------- trang QR (giu ngoai dist de khong bi `bun run build` xoa) ----------
    if (url.pathname === '/qr' || url.pathname === '/qr.html' || url.pathname.startsWith('/qr/')) {
      const name = url.pathname === '/qr' || url.pathname === '/qr.html'
        ? 'index.html'
        : url.pathname.replace(/^\/qr\//, '');
      const f = Bun.file(join(QR, name));
      if (await f.exists()) {
        const ext = extname(name).slice(1).toLowerCase();
        return new Response(f, { headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' } });
      }
      return new Response('not found', { status: 404 });
    }

    // ---------- file tĩnh ----------
    const full = safePath(url.pathname);
    if (!full) return new Response('bad path', { status: 400 });

    let file = Bun.file(full);
    if (!(await file.exists())) {
      // SPA: đường dẫn không có phần mở rộng -> index.html
      if (!extname(url.pathname)) {
        file = Bun.file(join(DIST, 'index.html'));
      } else {
        return new Response('not found', { status: 404 });
      }
    }

    const ext = extname(full).slice(1).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === 'html' ? 'no-cache' : 'public, max-age=60'
    };
    if (ext === 'apk') {
      headers['Content-Type'] = MIME.apk;
      headers['Content-Disposition'] = 'attachment; filename="pk-app-debug.apk"';
      headers['Cache-Control'] = 'no-cache';
    }
    return new Response(file, { headers });
  }
});

console.log(`serve: http://0.0.0.0:${server.port}/  (dist, proxy /pk -> ${PK})`);
console.log(`APK : http://<LAN-IP>:${server.port}/app-debug.apk  (application/vnd.android.package-archive)`);
