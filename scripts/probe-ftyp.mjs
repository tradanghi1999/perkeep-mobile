const base = 'http://localhost:3179';
const get = async (ref) => {
  const r = await fetch(base + '/ui/download/' + encodeURIComponent(ref), { headers: { Range: 'bytes=0-31' } });
  const b = new Uint8Array(await r.arrayBuffer());
  const s = new TextDecoder('latin1').decode(b);
  const tags = [];
  for (const t of ['av01', 'hvc1', 'hev1', 'dvhe', 'dvh1', 'vp09', 'avc1', 'avc3', 'mp4a']) if (s.includes(t)) tags.push(t);
  return { size: b.length, ascii: s.replace(/[^\x20-\x7e]/g, '.'), tags };
};

const post = async (body) => (await fetch(base + '/my-search/camli/search/query', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})).json();
const q = await post({ expression: '(filename:*.mp4)', limit: 20, describe: { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] } });
for (const b of q.blobs || []) {
  const m = q.description.meta[b.blob];
  const ref = m.permanode?.attr?.camliContent?.[0];
  const name = (ref && q.description.meta[ref]?.file?.fileName) || '';
  const info = await get(ref);
  console.log(`${info.tags.join(',') || '(khong ro)'.padEnd(6)}  ${info.ascii}  <- ${name.slice(0, 42)}`);
}
