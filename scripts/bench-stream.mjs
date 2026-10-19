// Tim video lon nhat trong Perkeep va do toc do /ui/download
const base = 'http://localhost:3179';
const post = async (body) => (await fetch(base + '/my-search/camli/search/query', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})).json();
const DESC = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };
const q = await post({ expression: '(filename:*.mp4 or filename:*.mkv or filename:*.mov)', limit: 30, describe: DESC });

const items = [];
for (const b of q.blobs || []) {
  const m = q.description.meta[b.blob];
  const ref = m?.permanode?.attr?.camliContent?.[0];
  const f = ref ? q.description.meta[ref]?.file : null;
  if (ref && f?.size) items.push({ name: f.fileName, ref, size: f.size, mime: f.mimeType });
}
items.sort((a, b) => b.size - a.size);
console.log('--- video trong kho (lon nhat truoc) ---');
for (const it of items.slice(0, 6)) {
  console.log(`  ${(it.size / 1048576).toFixed(0).padStart(6)} MB  ${it.name?.slice(0, 50)}`);
}

// Do toc do: tai 64MB dau cua file lon nhat, khong ghi ra dia (chi dem byte)
for (const it of items.slice(0, 2)) {
  const bytes = Math.min(64 * 1024 * 1024, it.size);
  const t0 = Date.now();
  const r = await fetch(base + '/ui/download/' + encodeURIComponent(it.ref), {
    headers: { Range: `bytes=0-${bytes - 1}` }
  });
  let got = 0;
  const reader = r.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
  }
  const sec = (Date.now() - t0) / 1000;
  console.log(`\n${it.name?.slice(0, 40)}`);
  console.log(`  HTTP ${r.status} | ${(got / 1048576).toFixed(1)} MB trong ${sec.toFixed(2)}s = ${(got / 1048576 / sec).toFixed(1)} MB/s`);
  console.log(`  header: accept-ranges=${r.headers.get('accept-ranges')} content-range=${r.headers.get('content-range')} content-encoding=${r.headers.get('content-encoding')}`);
}

// Do them: 8 request range nho song song (mo phong seek cua trinh phat)
const it = items[0];
if (it) {
  const chunk = 4 * 1024 * 1024;
  const t0 = Date.now();
  const jobs = [];
  for (let i = 0; i < 8; i++) {
    const from = i * chunk;
    jobs.push(fetch(base + '/ui/download/' + encodeURIComponent(it.ref), {
      headers: { Range: `bytes=${from}-${from + chunk - 1}` }
    }).then((r) => r.arrayBuffer()).then((b) => b.byteLength).catch(() => 0));
  }
  const sizes = await Promise.all(jobs);
  const sec = (Date.now() - t0) / 1000;
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(`\n8 range song song: ${(total / 1048576).toFixed(1)} MB trong ${sec.toFixed(2)}s = ${(total / 1048576 / sec).toFixed(1)} MB/s`);
}
