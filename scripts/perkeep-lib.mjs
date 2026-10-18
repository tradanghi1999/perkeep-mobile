/**
 * Thư viện Perkeep dùng chung cho MCP server và bridge.
 * - đọc: discovery, search, describe, getText
 * - ghi: upload blob, ký claim, tạo video-link, gắn/bỏ tag
 *
 * ENV: PK_BASE (mặc định http://127.0.0.1:3179), PK_USER, PK_PASS.
 */

import { createHash, randomBytes } from 'node:crypto';

export const BASE = (process.env.PK_BASE || 'http://127.0.0.1:3179').replace(/\/+$/, '');
const USER = process.env.PK_USER || '';
const PASS = process.env.PK_PASS || '';

/** File trong vault gắn tag này; mọi search mặc định ẩn chúng. */
export const VAULT_TAG = process.env.PK_VAULT_TAG || 'pkvault';

export function hideVaultExpr(expression) {
  const e = String(expression || '').trim();
  if (/(^|\s)-tag:pkvault(\s|$)/.test(e)) return e;
  return e ? `(${e}) -tag:pkvault` : '-tag:pkvault';
}

export const authHeaders = (extra = {}) => {
  const h = { ...extra };
  if (USER) h.Authorization = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  return h;
};

export async function pkFetch(path, { method = 'GET', body, headers = {}, raw = false, timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: authHeaders({ ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Perkeep HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return raw ? res : await res.json();
  } finally {
    clearTimeout(tm);
  }
}

// ---------- discovery ----------
let disc = null;
export async function discovery() {
  if (disc) return disc;
  const j = await pkFetch('/?camli.mode=config');
  disc = {
    blobRoot: j.blobRoot || '/bs-and-maybe-also-index/',
    jsonSignRoot: j.jsonSignRoot || '/sighelper/',
    signerPubKey: j.signing?.publicKeyBlobRef || ''
  };
  if (!disc.signerPubKey) throw new Error('Perkeep không có signing.publicKeyBlobRef');
  return disc;
}

// ---------- sha224 / sign / upload ----------
export const blobRef = (text) => 'sha224-' + createHash('sha224').update(text, 'utf8').digest('hex');

export async function signJson(unsigned) {
  const d = await discovery();
  const res = await fetch(BASE + d.jsonSignRoot + 'camli/sig/sign', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: 'json=' + encodeURIComponent(unsigned)
  });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith('{')) throw new Error(`sign HTTP ${res.status}: ${text.slice(0, 160)}`);
  return text;
}

export async function uploadText(text, fileName) {
  const d = await discovery();
  const ref = blobRef(text);
  const fd = new FormData();
  fd.append(ref, new Blob([text], { type: 'application/octet-stream' }), String(fileName || ref).replace(/["\r\n]/g, '_'));
  const res = await fetch(BASE + d.blobRoot + 'camli/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: fd
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`upload HTTP ${res.status}: ${body.slice(0, 160)}`);
  let j = null;
  try { j = JSON.parse(body); } catch {}
  if (j?.errorText) throw new Error(`upload: ${String(j.errorText).slice(0, 160)}`);
  return ref;
}

/** Claim đã ký + upload. fields: {claimType, permaNode, attribute?, value?} */
export async function signClaim(fields) {
  const d = await discovery();
  const unsigned = JSON.stringify({
    attribute: fields.attribute,
    camliSigner: d.signerPubKey,
    camliType: 'claim',
    camliVersion: 1,
    claimDate: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    claimType: fields.claimType,
    permaNode: fields.permaNode,
    ...(fields.value !== undefined ? { value: fields.value } : {})
  });
  const signed = await signJson(unsigned);
  await uploadText(signed);
  return blobRef(signed);
}

/** Permanode riêng cho mỗi mục: PHẢI có claimDate + random, nếu không chữ ký trùng. */
export async function createPermanode() {
  const d = await discovery();
  const unsigned = JSON.stringify({
    camliVersion: 1,
    camliSigner: d.signerPubKey,
    camliType: 'permanode',
    claimDate: new Date().toISOString(),
    random: randomBytes(20).toString('base64')
  });
  const signed = await signJson(unsigned);
  const ref = blobRef(signed);
  await uploadText(signed);
  return ref;
}

// ---------- search ----------
export const DESCRIBE = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };

export function mapItem(blob, desc) {
  const meta = desc?.meta?.[blob] || {};
  const attr = meta.permanode?.attr || {};
  const fileRef = attr.camliContent?.[0] || '';
  const fm = fileRef ? desc?.meta?.[fileRef]?.file : null;
  return {
    blobref: blob,
    name: fm?.fileName || attr.title?.[0] || blob,
    mime: fm?.mimeType || attr.mimeType?.[0] || '',
    size: fm?.size || 0,
    date: meta.permanode?.modtime || fm?.time || '',
    tags: attr.tag || [],
    fileRef
  };
}

export async function search(expression, limit = 20, sort = '-created', opts = {}) {
  const expr = opts.includeVault ? expression : hideVaultExpr(expression);
  const j = await pkFetch('/my-search/camli/search/query', {
    method: 'POST',
    body: { expression: expr, limit, describe: DESCRIBE, sort }
  });
  if (j.error) throw new Error(j.error.split('\n')[0]);
  return (j.blobs || []).map((b) => mapItem(b.blob, j.description));
}

export async function getText(ref, maxBytes = 50000) {
  const res = await pkFetch(`/ui/download/${encodeURIComponent(ref)}`, { raw: true });
  const buf = new Uint8Array(await res.arrayBuffer());
  const slice = buf.slice(0, maxBytes);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  return { text, bytes: buf.length, truncated: buf.length > maxBytes, binary: text.includes('\u0000') };
}

// ---------- ghi ----------
const siteLabel = (site) => ({ youtube: 'YouTube', vimeo: 'Vimeo', tiktok: 'TikTok' }[site] || 'Video');
const sanitizeName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);

export async function createVideoLink(info) {
  const text = JSON.stringify({
    type: 'pk.video.link',
    site: info.site || 'web',
    url: info.url,
    title: info.title || '',
    duration: Number(info.duration) || 0,
    author: info.author || '',
    thumbnail: info.thumbnail || '',
    addedAt: new Date().toISOString()
  }, null, 2);

  const fileName = `${sanitizeName(info.title) || 'video'} [${siteLabel(info.site)}].json`;
  const contentRef = await uploadText(text, fileName);
  const size = Buffer.byteLength(text, 'utf8');
  const schema = JSON.stringify({
    camliType: 'file',
    camliVersion: 1,
    fileName,
    parts: [{ blobRef: contentRef, size }],
    size
  });
  const fileRef = await uploadText(schema);
  const permaRef = await createPermanode();

  await signClaim({ claimType: 'set-attribute', permaNode: permaRef, attribute: 'camliContent', value: fileRef });
  if (info.title) await signClaim({ claimType: 'set-attribute', permaNode: permaRef, attribute: 'title', value: info.title });
  await signClaim({ claimType: 'set-attribute', permaNode: permaRef, attribute: 'mimeType', value: 'application/json' });
  await signClaim({ claimType: 'add-attribute', permaNode: permaRef, attribute: 'tag', value: 'video-link' });
  for (const tag of info.tags || []) {
    if (tag && tag !== 'video-link') {
      await signClaim({ claimType: 'add-attribute', permaNode: permaRef, attribute: 'tag', value: tag });
    }
  }
  return { permaRef, fileRef, contentRef, fileName };
}

export async function setTag(permaRef, tag, add = true) {
  return signClaim({
    claimType: add ? 'add-attribute' : 'del-attribute',
    permaNode: permaRef,
    attribute: 'tag',
    value: tag
  });
}

/** Nhóm các mục trùng nội dung (cùng camliContent/fileRef). */
export async function findDupes(limit = 200) {
  const items = await search('', limit);
  const byRef = new Map();
  for (const it of items) {
    if (!it.fileRef) continue;
    if (!byRef.has(it.fileRef)) byRef.set(it.fileRef, []);
    byRef.get(it.fileRef).push(it);
  }
  return [...byRef.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([fileRef, items]) => ({ fileRef, items }));
}
