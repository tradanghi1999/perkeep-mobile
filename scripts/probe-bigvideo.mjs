// Lay ftyp + moov cua video 1.4GB roi ghep lai de ffprobe doc thong so that
import { writeFileSync } from 'node:fs';

const base = 'http://localhost:3179';
const post = async (body) => (await fetch(base + '/my-search/camli/search/query', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})).json();
const DESC = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };
const q = await post({ expression: 'filename:*20260926_095420*', limit: 3, describe: DESC });
const b = q.blobs[0].blob;
const ref = q.description.meta[b].permanode.attr.camliContent[0];
const f = q.description.meta[ref].file;
console.log('file:', f.fileName, (f.size / 1048576).toFixed(0), 'MB', f.mimeType);
const size = f.size;

const get = async (range) => {
  const r = await fetch(base + '/ui/download/' + encodeURIComponent(ref), { headers: { Range: range } });
  return Buffer.from(await r.arrayBuffer());
};

const head = await get('bytes=0-262143');
const walk = (buf, label) => {
  let off = 0;
  const boxes = [];
  while (off + 8 <= buf.length) {
    const s = buf.readUInt32BE(off);
    const t = buf.toString('latin1', off + 4, off + 8);
    if (!/^[\x20-\x7e]{4}$/.test(t) || s < 8) break;
    boxes.push({ type: t, off, size: s });
    off += s;
  }
  console.log(`\n${label}:`, boxes.map((x) => `${x.type}(${x.size})`).join(' '));
  return boxes;
};
walk(head, 'box dau file');
const brands = head.toString('latin1', 8, 32).replace(/[^\x20-\x7e]/g, '.');
console.log('ftyp brands:', brands);

// moov co the nam cuoi -> lay 8MB cuoi
const tail = await get(`bytes=${size - 8 * 1024 * 1024}-`);
const moovAt = tail.indexOf(Buffer.from('moov'));
console.log('tim thay "moov" trong 8MB cuoi:', moovAt >= 0);
if (moovAt >= 4) {
  const start = moovAt - 4;
  const boxSize = tail.readUInt32BE(start);
  console.log('moov size =', boxSize);
  if (start + boxSize <= tail.length) {
    // Lay dung kich thuoc box ftyp dau tien (file nay ftyp = 24 byte, khong phai 32)
    const ftypSize = head.readUInt32BE(0);
    const out = Buffer.concat([head.subarray(0, ftypSize), tail.subarray(start, start + boxSize)]);
    const p = process.env.TEMP + '\\big-meta.mp4';
    writeFileSync(p, out);
    console.log('da ghi', p, out.length, 'bytes (ftyp', ftypSize, '+ moov', boxSize, ')');
  } else {
    console.log('moov vuot qua 8MB, can lay nhieu hon');
  }
}
