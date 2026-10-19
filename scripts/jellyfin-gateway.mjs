// WebDAV gateway: cho Jellyfin đọc video TRỰC TIẾP từ Perkeep, không copy file.
//
// Chạy:  bun run scripts/jellyfin-gateway.mjs
// Rồi map thành ổ đĩa (PowerShell, chạy 1 lần):
//   net use J: http://127.0.0.1:8099/ /persistent:yes
// Sau đó: Jellyfin → Dashboard → Libraries → Add Media Library → chọn J:\
//
// Tuỳ chọn (biến môi trường):
//   PK_BASE   mặc định http://127.0.0.1:3179
//   PK_USER / PK_PASS           nếu Perkeep bật auth userpass
//   PK_CF_ID / PK_CF_SECRET     nếu Perkeep sau Cloudflare Access
//   PK_TYPES  "video" (mặc định) | "video,image" | "all"
//   PORT      mặc định 8099
//
// Lưu ý Windows WebDAV: mặc định giới hạn file 50MB. Nâng lên 4GB (chạy PowerShell admin):
//   Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Services\WebClient\Parameters `
//     -Name FileSizeLimitInBytes -Value 4294967295 -Type DWord
//   Restart-Service WebClient
// (Hoặc dùng rclone mount nếu muốn ổn định hơn với file lớn.)

import http from 'node:http';

const PK = (process.env.PK_BASE || 'http://127.0.0.1:3179').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 8099);
const TYPES = (process.env.PK_TYPES || 'video').toLowerCase();

const pkAuth = {};
if (process.env.PK_USER) {
  pkAuth.Authorization = 'Basic ' + Buffer.from(`${process.env.PK_USER}:${process.env.PK_PASS || ''}`).toString('base64');
}
if (process.env.PK_CF_ID) {
  pkAuth['CF-Access-Client-Id'] = process.env.PK_CF_ID;
  pkAuth['CF-Access-Client-Secret'] = process.env.PK_CF_SECRET || '';
}

const EXPR = {
  video: '(filename:*.mp4 or filename:*.mkv or filename:*.mov or filename:*.avi or filename:*.webm or filename:*.m4v)',
  image: '(filename:*.jpg or filename:*.jpeg or filename:*.png or filename:*.gif or filename:*.webp or filename:*.heic)'
};
const exprFor = (t) => {
  if (t === 'all') return '';
  const parts = t.split(',').map((x) => EXPR[x.trim()]).filter(Boolean);
  return parts.length ? `(${parts.join(' or ')})` : '';
};
const DESCRIBE = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };

// ---------- chỉ mục file (làm mới mỗi 60s) ----------
let index = { at: 0, files: [] }; // files: { name, ref, size, mime, date }
const TTL = 60_000;

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || 'file';
}

async function buildIndex() {
  const r = await fetch(`${PK}/my-search/camli/search/query`, {
    method: 'POST',
    headers: { ...pkAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression: exprFor(TYPES), limit: 2000, describe: DESCRIBE })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.split('\n')[0]);

  const files = [];
  const used = new Set();
  for (const b of j.blobs || []) {
    const blob = b.blob;
    const meta = j.description?.meta?.[blob];
    const attr = meta?.permanode?.attr || {};
    const ref = attr.camliContent?.[0];
    if (!ref) continue;
    const f = j.description?.meta?.[ref]?.file;
    if (!f) continue;
    let name = safeName(f.fileName || blob);
    // tên trùng nhau -> thêm hậu tố ngắn để Jellyfin thấy 2 file khác nhau
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const suffix = ' [' + blob.slice(7, 13) + ']';
      name = dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix;
    }
    used.add(name);
    files.push({
      name,
      ref,
      size: f.size || 0,
      mime: f.mimeType || 'application/octet-stream',
      date: meta?.permanode?.modtime || f.time || new Date().toISOString()
    });
  }
  index = { at: Date.now(), files };
  console.log(`[index] ${files.length} file (${TYPES})`);
}

async function ensureIndex() {
  if (Date.now() - index.at > TTL) await buildIndex();
}

const byName = () => new Map(index.files.map((f) => [f.name, f]));

// ---------- WebDAV ----------
const XML = '<?xml version="1.0" encoding="utf-8"?>';
const href = (n) => '/' + encodeURIComponent(n);
const entryXml = (f) => `<D:response><D:href>${href(f.name)}</D:href><D:propstat><D:prop>
<D:displayname>${f.name.replace(/[<&>]/g, '')}</D:displayname>
<D:getcontentlength>${f.size}</D:getcontentlength>
<D:getcontenttype>${f.mime}</D:getcontenttype>
<D:getlastmodified>${new Date(f.date).toUTCString()}</D:getlastmodified>
<D:resourcetype/></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;

const rootXml = () => `<D:response><D:href>/</D:href><D:propstat><D:prop>
<D:displayname>Perkeep</D:displayname>
<D:resourcetype><D:collection/></D:resourcetype></D:prop>
<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    if (req.method === 'OPTIONS') {
      res.writeHead(200, { DAV: '1,2', Allow: 'OPTIONS,GET,HEAD,PROPFIND', 'Content-Length': '0' });
      res.end();
      return;
    }

    if (req.method === 'PROPFIND') {
      await ensureIndex();
      const depth = req.headers.depth || '1';
      let body = '';
      if (!name) {
        body = XML + '<D:multistatus xmlns:D="DAV:">' + rootXml();
        if (depth !== '0') for (const f of index.files) body += entryXml(f);
        body += '</D:multistatus>';
      } else {
        const f = byName().get(name);
        if (!f) { res.writeHead(404); res.end(); return; }
        body = XML + '<D:multistatus xmlns:D="DAV:">' + entryXml(f) + '</D:multistatus>';
      }
      res.writeHead(207, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!name) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Perkeep WebDAV gateway\n'); return; }
      await ensureIndex();
      const f = byName().get(name);
      if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }

      const up = await fetch(`${PK}/ui/download/${encodeURIComponent(f.ref)}`, {
        headers: { ...pkAuth, ...(req.headers.range ? { Range: req.headers.range } : {}) }
      });
      const h = {
        'Content-Type': up.headers.get('content-type') || f.mime,
        'Accept-Ranges': 'bytes',
        'Last-Modified': new Date(f.date).toUTCString()
      };
      const cr = up.headers.get('content-range');
      const cl = up.headers.get('content-length');
      if (cr) h['Content-Range'] = cr;
      if (cl) h['Content-Length'] = cl;
      res.writeHead(up.status, h);
      if (req.method === 'HEAD') { res.end(); return; }
      const reader = up.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) await new Promise((r) => res.once('drain', r));
      }
      res.end();
      return;
    }

    res.writeHead(405, { Allow: 'OPTIONS,GET,HEAD,PROPFIND' });
    res.end();
  } catch (e) {
    console.error('[error]', e.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('gateway error: ' + e.message);
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`WebDAV gateway: http://127.0.0.1:${PORT}/  ->  ${PK}`);
  console.log('Map ổ đĩa (PowerShell):  net use J: http://127.0.0.1:' + PORT + '/ /persistent:yes');
  try { await buildIndex(); } catch (e) { console.error('[index] lỗi:', e.message); }
});
