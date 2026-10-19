// Kiểm chứng luồng thêm/xoá tag: sign claim -> upload -> search lại
// Kết thúc bằng xoá tag để trạng thái store trở về như cũ.
const base = 'http://localhost:3179';
const crypto = await import('node:crypto');
const sha224 = (buf) => 'sha224-' + crypto.createHash('sha224').update(buf).digest('hex');

const postJson = async (path, body) => (await fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})).json();

// 1. discovery
const disc = await (await fetch(base + '/?camli.mode=config')).json();
const { blobRoot, jsonSignRoot } = disc;
const pub = disc.signing.publicKeyBlobRef;
console.log('blobRoot=%s jsonSignRoot=%s signer=%s…', blobRoot, jsonSignRoot, pub.slice(0, 18));

// 2. lấy permanode của 1 file mp4
const q = await postJson('/my-search/camli/search/query', {
  expression: '(filename:*.mp4)', limit: 1, describe: { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] }
});
const permaRef = q.blobs[0].blob;
const meta = q.description.meta[permaRef];
console.log('permanode=%s name=%s tags hien tai=%j', permaRef,
  meta.permanode?.attr?.title?.[0] || q.description.meta[meta.permanode?.attr?.camliContent?.[0]]?.file?.fileName,
  meta.permanode?.attr?.tag || []);

// 3. ký + upload 1 claim
async function claim(claimType, attribute, value) {
  const unsigned = JSON.stringify({
    attribute,
    camliSigner: pub,
    camliType: 'claim',
    camliVersion: 1,
    claimDate: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    claimType,
    permaNode: permaRef,
    value
  });
  const form = 'json=' + encodeURIComponent(unsigned);
  const signed = await (await fetch(base + jsonSignRoot + 'camli/sig/sign', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
  })).text();
  if (!signed.startsWith('{')) throw new Error('sign lỗi: ' + signed.slice(0, 200));
  const ref = sha224(Buffer.from(signed, 'utf8'));

  const boundary = '----pk' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${ref}"; filename="${ref}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    Buffer.from(signed, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const up = await fetch(base + blobRoot + 'camli/upload', {
    method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body
  });
  console.log('  %s -> upload HTTP %s (blob %s)', claimType, up.status, ref.slice(0, 20) + '…');
  return ref;
}

const tag = 'zz_probe_tag';
await claim('add-attribute', 'tag', tag);
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await postJson('/my-search/camli/search/query', { expression: `tag:${tag}`, limit: 5, describe: { rules: [{ attrs: ['*'] }] } });
  const n = (r.blobs || []).length;
  console.log(`  [${i}] tag:${tag} -> ${n}`);
  if (n > 0) {
    console.log('     tags: %j', r.description.meta[r.blobs[0].blob]?.permanode?.attr?.tag);
    break;
  }
}

// 4. xoá tag để trả về trạng thái cũ
await claim('del-attribute', 'tag', tag);
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await postJson('/my-search/camli/search/query', { expression: `tag:${tag}`, limit: 5 });
  const n = (r.blobs || []).length;
  console.log(`  [${i}] sau khi xoá -> ${n}`);
  if (n === 0) break;
}
