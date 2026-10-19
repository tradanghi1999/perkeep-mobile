// Đồng bộ video (và tuỳ chọn: ảnh) từ Perkeep ra một thư mục thật để Jellyfin quét.
//
// Cách dùng (PowerShell):
//   $env:PK_BASE="http://127.0.0.1:3179"
//   $env:PK_DEST="D:\media\perkeep"
//   bun run scripts/sync-to-jellyfin.mjs
//
// Tuỳ chọn:
//   PK_USER / PK_PASS   -> nếu Perkeep bật auth userpass
//   PK_CF_ID / PK_CF_SECRET -> nếu Perkeep sau Cloudflare Access
//   PK_TYPES            -> "video" (mặc định) | "video,image" | "all"

const base = (process.env.PK_BASE || 'http://127.0.0.1:3179').replace(/\/+$/, '');
const dest = process.env.PK_DEST || 'D:\\media\\perkeep';
const types = (process.env.PK_TYPES || 'video').toLowerCase();

const headers = {};
if (process.env.PK_USER) {
  headers.Authorization = 'Basic ' + Buffer.from(`${process.env.PK_USER}:${process.env.PK_PASS || ''}`).toString('base64');
}
if (process.env.PK_CF_ID) {
  headers['CF-Access-Client-Id'] = process.env.PK_CF_ID;
  headers['CF-Access-Client-Secret'] = process.env.PK_CF_SECRET || '';
}

const EXPR = {
  video: '(filename:*.mp4 or filename:*.mkv or filename:*.mov or filename:*.avi or filename:*.webm or filename:*.m4v)',
  image: '(filename:*.jpg or filename:*.jpeg or filename:*.png or filename:*.gif or filename:*.webp or filename:*.heic)'
};

function exprFor(t) {
  if (t === 'all') return '';
  const parts = t.split(',').map((x) => EXPR[x.trim()]).filter(Boolean);
  return parts.length ? `(${parts.join(' or ')})` : '';
}

const DESCRIBE = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };

async function query(expression) {
  const r = await fetch(`${base}/my-search/camli/search/query`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression, limit: 2000, describe: DESCRIBE })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.split('\n')[0]);
  return { blobs: (j.blobs || []).map((x) => x.blob), description: j.description };
}

const fs = await import('node:fs');
const path = await import('node:path');
fs.mkdirSync(dest, { recursive: true });

const { blobs, description } = await query(exprFor(types));
console.log(`Tìm thấy ${blobs.length} mục trong Perkeep (${types})`);
console.log(`Đích: ${dest}\n`);

let ok = 0;
let skipped = 0;
let failed = 0;

for (const blob of blobs) {
  const meta = description.meta?.[blob];
  const attr = meta?.permanode?.attr || {};
  const ref = attr.camliContent?.[0];
  if (!ref) continue;
  const file = description.meta?.[ref]?.file;
  if (!file?.fileName) continue;

  // giữ tên file, tránh path traversal
  const safe = path.basename(String(file.fileName).replace(/[\\/:*?"<>|]/g, '_'));
  const out = path.join(dest, safe);
  const size = file.size || 0;

  if (fs.existsSync(out) && fs.statSync(out).size === size) {
    skipped++;
    continue;
  }
  try {
    const r = await fetch(`${base}/ui/download/${encodeURIComponent(ref)}`, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(out, buf);
    ok++;
    console.log(`  ✓ ${(buf.length / 1048576).toFixed(1).padStart(7)} MB  ${safe.slice(0, 60)}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${safe.slice(0, 60)}: ${e.message}`);
  }
}

console.log(`\nXong: ${ok} tải mới, ${skipped} bỏ qua (đã có), ${failed} lỗi`);
console.log('Giờ vào Jellyfin → Dashboard → Libraries → Add Media Library → chọn thư mục trên.');
