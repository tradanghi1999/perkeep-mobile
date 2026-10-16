const base = 'http://localhost:3179';
const post = async (body) => {
  const r = await fetch(base + '/my-search/camli/search/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json();
};
const toExpression = (input) => (/(^|\s)-?[a-zA-Z]+:/.test(input) ? input : `title:${input}`);

function metaFor(blob, description) {
  const meta = description?.meta?.[blob];
  if (!meta) return null;
  const attr = meta.permanode?.attr || {};
  const fileRef = attr.camliContent?.[0] || '';
  const fileMeta = fileRef ? description.meta?.[fileRef] : null;
  const file = fileMeta?.file;
  return {
    type: meta.camliType,
    fileRef,
    mimeType: file?.mimeType || attr.mimeType?.[0] || '',
    size: file?.size || 0,
    fileName: file?.fileName || attr.title?.[0] || ''
  };
}

async function run(raw) {
  const expression = toExpression(raw);
  const j = await post({ expression, limit: 50, describe: { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] } });
  if (j.error) return console.log(`"${raw}" -> ${expression}  ERR`);
  const blobs = (j.blobs || []).map((x) => x.blob);
  console.log(`\n"${raw}"  =>  ${expression}   [${blobs.length}]`);
  for (const b of blobs.slice(0, 4)) {
    const m = metaFor(b, j.description);
    console.log(`   ${m.type}  ${m.mimeType || '-'}  ${m.size || '-'}  ${m.fileName || '(no name)'}  content=${m.fileRef ? 'yes' : 'no'}`);
  }
}

await run('health');
await run('(filename:*.mp4 or filename:*.mov or filename:*.mkv)');
await run('(format:jpg or format:png or format:jpeg)');
await run('after:2026-01-01');
await run('is:untagged');
