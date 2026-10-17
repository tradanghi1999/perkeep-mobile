// Export file gốc từ Perkeep ra ổ đĩa (vd SSD) để Jellyfin/app phát nhanh hơn.
//
// Vi sao: Perkeep luu blob content-addressed (khong phai file thuong) va blobs
// co the nam tren o cham (USB/HDD). Jellyfin chi doc duoc filesystem, nen can
// buoc export nay. Script lay ten file goc, kich thuoc; tai ve thu muc dich.
//
// Dung:
//   bun scripts/export-media.mjs --out C:\pk-export                 # video (mac dinh)
//   bun scripts/export-media.mjs --out C:\pk-export --type all      # moi file
//   bun scripts/export-media.mjs --out C:\pk-export --type image
//   bun scripts/export-media.mjs --out C:\pk-export --expression 'filename:bbb_test.mp4'
//   bun scripts/export-media.mjs --out C:\pk-export --dry-run       # chi liet ke
//
// Tuy chon: --server http://localhost:3179  --user U --pass P  --limit 50
//           --overwrite  --force   (mac dinh: bo qua file da co dung kich thuoc)

import { mkdir, open, rename, stat, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';

// ---------- tham so dong lenh ----------
function parseArgs(argv) {
  const a = { server: 'http://localhost:3179', type: 'video', limit: 50 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--out') a.out = argv[++i];
    else if (k === '--server') a.server = argv[++i];
    else if (k === '--type') a.type = argv[++i];
    else if (k === '--expression') a.expression = argv[++i];
    else if (k === '--limit') a.limit = Number(argv[++i]) || 50;
    else if (k === '--user') a.user = argv[++i];
    else if (k === '--pass') a.pass = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--faststart') a.faststart = true;
    else if (k === '--overwrite' || k === '--force') a.overwrite = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else console.warn(`bo qua tham so la: ${k}`);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
if (args.help || !args.out) {
  console.log(`Export file goc tu Perkeep ra dia.\n
  --out <dir>            (bat buoc) thu muc dich, vd C:\\pk-export
  --type video|image|audio|doc|all   (mac dinh video)
  --expression "<expr>"  ghi de expression Perkeep
  --server <url>         mac dinh http://localhost:3179
  --user/--pass          Basic auth neu server bat
  --limit <n>            kich thuoc trang (mac dinh 50)
  --dry-run              chi liet ke, khong tai
  --faststart            chuyen moov len dau bang ffmpeg -c copy (khong re-encode)
  --overwrite            tai lai du file da ton tai`);
  process.exit(args.help ? 0 : 1);
}

// ---------- hang so ----------
const DESC = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };
const TYPE_EXPR = {
  video: '(filename:*.mp4 or filename:*.mov or filename:*.mkv or filename:*.webm or filename:*.avi or filename:*.m4v)',
  image: '(filename:*.jpg or filename:*.jpeg or filename:*.png or filename:*.gif or filename:*.webp or filename:*.heic or filename:*.avif)',
  audio: '(filename:*.mp3 or filename:*.m4a or filename:*.wav or filename:*.flac or filename:*.ogg)',
  doc: '(filename:*.pdf or filename:*.doc or filename:*.docx or filename:*.xls or filename:*.xlsx or filename:*.ppt or filename:*.pptx or filename:*.txt)',
  all: 'filename:*'
};
const expression = args.expression || TYPE_EXPR[args.type] || TYPE_EXPR.video;

const authHeaders = () =>
  args.user ? { Authorization: 'Basic ' + Buffer.from(`${args.user}:${args.pass || ''}`).toString('base64') } : {};
const fmt = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B');

// Ten file an toan cho Windows
function safeName(name, fallback) {
  let n = (name || fallback || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  n = n.replace(/[. ]+$/, ''); // Windows khong nhan ten ket thuc bang '.' hoac ' '
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = '_' + n;
  if (n.length > 120) {
    const e = extname(n);
    n = n.slice(0, 120 - e.length) + e;
  }
  return n || 'file';
}

// ---------- faststart: chuyen "moov" len dau file ----------
// Vi sao can: file ghi bang dien thoai/ffmpeg mac dinh de moov o CUOI, nen player
// phai tai gan het file moi biet codec/index -> bat dau phat rat cham hoac khong phat.
// Remux "-c copy" chi doi cho atom, KHONG nen lai video nen chi mat vai giay.
async function isFaststart(file) {
  // Doc 1MB dau bang Bun.file().slice (lazy, khong doc ca file).
  // File faststart luon co moov trong doan dau; file thuong co mdat truoc.
  const head = Buffer.from(await Bun.file(file).slice(0, 1 << 20).arrayBuffer());
  let pos = 0;
  while (pos + 8 <= head.length) {
    let sz = head.readUInt32BE(pos);
    const typ = head.toString('latin1', pos + 4, pos + 8);
    if (sz === 1) sz = Number(head.readBigUInt64BE(pos + 8));
    if (typ === 'moov') return true;
    if (typ === 'mdat') return false; // mdat truoc moov -> chua faststart
    if (sz < 8) return false;
    pos += sz;
  }
  return false; // khong thay moov trong 1MB dau -> coi nhu chua faststart
}

function run(cmd, argv) {
  return new Promise((resolve) => {
    let err = '';
    const p = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => resolve({ code: -1, err: `${cmd} khong chay duoc` }));
    p.on('close', (code) => resolve({ code, err }));
  });
}

async function remuxFaststart(file) {
  if (await isFaststart(file)) return 'already';
  const tmp = file + '.fs.mp4';
  const { code, err } = await run(process.env.FFMPEG || 'ffmpeg',
    ['-v', 'error', '-y', '-i', file, '-c', 'copy', '-movflags', '+faststart', tmp]);
  if (code !== 0) {
    await rm(tmp, { force: true });
    return `loi (${(err || '').trim().split('\n').pop() || 'ffmpeg'})`;
  }
  await rm(file, { force: true });
  await rename(tmp, file);
  return 'ok';
}

// ---------- discovery ----------
async function discover() {
  const r = await fetch(args.server.replace(/\/+$/, '') + '/?camli.mode=config', { headers: authHeaders() });
  const j = await r.json();
  return { searchRoot: j.searchRoot || '/my-search/', uiRoot: j.uiRoot || '/ui/' };
}

// ---------- lay danh sach file (phan trang bang "continue") ----------
async function listFiles(disc) {
  const url = args.server.replace(/\/+$/, '') + disc.searchRoot + 'camli/search/query';
  const out = [];
  let cont = '';
  let page = 0;
  do {
    page++;
    const body = { expression, limit: args.limit, sort: '-created', describe: DESC };
    if (cont) body.continue = cont;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.split('\n')[0]);
    for (const b of j.blobs || []) {
      const meta = j.description?.meta?.[b.blob];
      const fileRef = meta?.permanode?.attr?.camliContent?.[0] || '';
      if (!fileRef) continue;
      const file = j.description?.meta?.[fileRef]?.file;
      if (!file) continue;
      out.push({
        permRef: b.blob,
        fileRef,
        name: file.fileName || meta?.permanode?.attr?.title?.[0] || b.blob,
        size: file.size || 0,
        mime: file.mimeType || ''
      });
    }
    cont = j.continue || '';
    process.stdout.write(`\r  da liet ke: ${out.length} file (trang ${page})...`);
  } while (cont);
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  return out;
}

// ---------- tai 1 file (stream + .part + rename) ----------
async function downloadOne(disc, item, dest) {
  const url = args.server.replace(/\/+$/, '') + disc.uiRoot + 'download/' + encodeURIComponent(item.fileRef);
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const part = dest + '.part';
  const fh = await open(part, 'w');
  let got = 0;
  const t0 = Date.now();
  try {
    const reader = r.body.getReader();
    let lastLog = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await fh.write(value);
      got += value.length;
      const now = Date.now();
      if (now - lastLog > 1000) {
        lastLog = now;
        const mb = got / 1048576;
        process.stdout.write(`\r    ${mb.toFixed(0)}/${(item.size / 1048576).toFixed(0)} MB  (${(mb / ((now - t0) / 1000)).toFixed(1)} MB/s)`);
      }
    }
  } finally {
    await fh.close();
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  if (item.size && got !== item.size) {
    await rm(part, { force: true });
    throw new Error(`kich thuoc lech: nhan ${got}, mong ${item.size}`);
  }
  await rm(dest, { force: true });
  await rename(part, dest);
  return { got, sec: (Date.now() - t0) / 1000 };
}

// ---------- chay ----------
const disc = await discover();
await mkdir(args.out, { recursive: true });

// Doc manifest cu (neu co): luu kich thuoc THUC TE sau khi remux, vi faststart
// doi kich thuoc file so voi ban goc tren Perkeep -> khong dung kich thuoc goc de
// kiem tra "da co" duoc (se tai lai mai).
const prev = new Map();
try {
  const old = JSON.parse(await Bun.file(join(args.out, 'manifest.json')).text());
  for (const f of old.files || []) if (f.fileRef) prev.set(f.fileRef, f);
} catch {}
const sizeOf = async (p) => { try { return (await stat(p)).size; } catch { return 0; } };
console.log(`Server:     ${args.server}`);
console.log(`Thu muc:    ${args.out}`);
console.log(`Expression: ${expression}`);

const files = await listFiles(disc);
console.log(`Tim thay:  ${files.length} file\n`);

const used = new Set();
let ok = 0, skip = 0, fail = 0, bytes = 0;
const manifest = [];

for (let i = 0; i < files.length; i++) {
  const it = files[i];
  let name = safeName(it.name, it.fileRef);
  if (used.has(name.toLowerCase())) {
    const e = extname(name);
    name = name.slice(0, -e.length) + '_' + it.fileRef.slice(0, 12) + e;
  }
  used.add(name.toLowerCase());
  const dest = join(args.out, name);
  const label = `[${i + 1}/${files.length}] ${name} (${fmt(it.size)})`;

  let exists = false;
  try {
    const s = await stat(dest);
    const old = prev.get(it.fileRef);
    // Hop le neu khop kich thuoc tren Perkeep, hoac khop kich thuoc thuc te da remux
    exists = s.size > 0 && (!it.size || s.size === it.size || (old && old.localSize === s.size));
  } catch {}

  if (exists && !args.overwrite) {
    console.log(`${label}  -> bo qua (da co)`);
    skip++; bytes += it.size; manifest.push({ ...it, name, path: dest, status: 'cached' });
    continue;
  }
  if (args.dryRun) {
    console.log(`${label}  -> se tai`);
    skip++; bytes += it.size; manifest.push({ ...it, name, path: dest, status: 'dry-run' });
    continue;
  }
  try {
    console.log(`${label}  -> dang tai...`);
    const { got, sec } = await downloadOne(disc, it, dest);
    console.log(`    xong ${fmt(got)} trong ${sec.toFixed(1)}s (${(got / 1048576 / sec).toFixed(1)} MB/s)`);
    ok++; bytes += got; manifest.push({ ...it, name, path: dest, status: 'exported' });
  } catch (e) {
    console.log(`    LOI: ${e.message}`);
    fail++;
  }
}

// faststart: xu ly ca file vua tai lan file da co san (idempotent, bo qua file da chuan)
if (args.faststart && !args.dryRun && manifest.length) {
  console.log('\n--- faststart: chuyen moov len dau (khong re-encode) ---');
  let fixed = 0;
  for (const it of manifest) {
    let exists = false;
    try { exists = (await stat(it.path)).size > 0; } catch {}
    if (!exists) continue;
    const r = await remuxFaststart(it.path);
    if (r === 'already') console.log(`  ${it.name}: da faststart`);
    else {
      console.log(`  ${it.name}: ${r}`);
      if (r === 'ok') fixed++;
    }
  }
  console.log(`  -> da chuyen ${fixed} file`);
}

// manifest de app/Jellyfin doi chieu fileRef <-> file.
// Ghi SAU faststart va luu localSize (kich thuoc thuc te) de lan chay sau biet
// file da remux ma bo qua, khong tai lai.
if (!args.dryRun && manifest.length) {
  for (const it of manifest) it.localSize = await sizeOf(it.path);
  await Bun.write(join(args.out, 'manifest.json'), JSON.stringify({ server: args.server, expression, faststart: !!args.faststart, generatedAt: new Date().toISOString(), files: manifest }, null, 2));
}

console.log(`\n--- ket qua ---`);
console.log(`export: ${ok}  bo qua: ${skip}  loi: ${fail}  tong: ${fmt(bytes)}`);
console.log(`thu muc: ${args.out}`);
