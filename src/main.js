import { CapacitorHttp } from '@capacitor/core';
import { icon, iconForMime } from './icons.js';
import * as up from './upload.js';

// ============================================================
// Perkeep Mobile — UI theo wireframe: searchbar + bottom nav + sheet + FAB
// API đã kiểm chứng trên perkeepd: SearchQuery top-level + describe gộp 1 request.
// ============================================================

const $ = (id) => document.getElementById(id);

// ---------- HTTP: native (không CORS) + fallback fetch ----------
async function http(url, { method = 'GET', headers = {}, body } = {}) {
  try {
    const r = await CapacitorHttp.request({ url, method, headers, data: body });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text };
  } catch {
    const r = await fetch(url, { method, headers, body });
    return { status: r.status, ok: r.ok, text: await r.text() };
  }
}

// Tải nhị phân (1 phần file) qua native HTTP -> Uint8Array. Dùng cho thumbnail video.
async function httpBytes(url, headers = {}) {
  try {
    const r = await CapacitorHttp.request({ url, method: 'GET', headers, responseType: 'arraybuffer' });
    const b64 = typeof r.data === 'string' ? r.data : '';
    if (!b64) throw new Error('empty');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { ok: r.status < 300, bytes: out };
  } catch {
    const r = await fetch(url, { headers });
    if (!r.ok) return { ok: false, bytes: null };
    return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()) };
  }
}

// ---------- i18n ----------
const I18N = {
  vi: {
    ob_title: 'Kết nối Perkeep', ob_sub: 'Nhập địa chỉ server để bắt đầu',
    f_name: 'Tên gợi nhớ', f_url: 'Địa chỉ server', f_user: 'Tài khoản (nếu có)', f_pass: 'Mật khẩu',
    ob_connect: 'Kết nối →', ob_skip: 'Dùng thử không cần server →',
    ob_bad: 'URL phải bắt đầu http(s)://', ob_fail: 'Không kết nối được. Kiểm tra IP / WiFi / firewall 3179.',
    btn_search: 'Tìm', btn_close: 'Đóng', btn_save: 'Lưu', btn_cancel: 'Hủy', btn_edit: 'Sửa', btn_del: 'Xóa',
    home_title: 'Được đề xuất', photo_title: 'Ảnh', files_title: 'Tệp', set_title: 'Cài đặt',
    nav_home: 'Nhà', nav_photo: 'Ảnh', nav_files: 'Tệp', nav_set: 'Cài đặt',
    set_svc: 'Dịch vụ Perkeep', set_lang: 'Ngôn ngữ', set_diag: 'Chẩn đoán',
    set_diag_sub: 'Log kỹ thuật, blob, JSON', set_about: 'Giới thiệu Perkeep',
    set_about_sub: 'Lưu trữ dữ liệu suốt đời',
    set_vid: 'Thumbnail video', on: 'Bật', off: 'Tắt',
    set_hint: 'Đổi / sửa / xóa dịch vụ: mở mục “Dịch vụ Perkeep”, hoặc chạm avatar trên thanh tìm kiếm.',
    svc_title: 'Dịch vụ Perkeep', svc_add: '+ Thêm dịch vụ', ed_add: 'Thêm dịch vụ', ed_edit: 'Sửa dịch vụ',
    confirm_del: (n) => `Xóa dịch vụ "${n}"?`, keep_one: 'Giữ lại ít nhất 1 dịch vụ.',
    lang_title: 'Ngôn ngữ / Language', diag_title: 'Chẩn đoán',
    about_title: 'Giới thiệu Perkeep',
    about_body: 'Perkeep lưu giữ dữ liệu của bạn suốt đời: mọi thứ được định danh bằng nội dung và không bao giờ bị sửa. Website: perkeep.org',
    empty: 'Không có kết quả.', empty_photo: 'Chưa có ảnh trong kho.', loading: 'Đang tải…',
    found: (n, s) => `${n} kết quả · ${s}`,
    fa_download: 'Tải về máy', fa_share: 'Sao chép link', fa_open: 'Mở trong Perkeep', fa_detail: 'Chi tiết',
    fab_title: 'Tạo mới', fab_upload: 'Tải tệp lên (chạy nền)', fab_note: 'Tạo ghi chú', fab_soon: '(sắp có)',
    up_waiting: 'Chờ mạng…', up_preparing: 'Đang chuẩn bị…', up_uploading: 'Đang tải lên',
    up_signing: 'Đang tạo mục…', up_done: 'Đã tải lên', up_failed: 'Lỗi', up_canceled: 'Đã huỷ',
    up_title: 'Đang tải lên', up_retry: 'Thử lại', up_cancel: 'Huỷ', up_clear: 'Xoá mục xong',
    up_need_native: 'Tải nền chỉ chạy trong app Android. Hãy build APK rồi thử.',
    up_none: 'Chưa có file nào trong hàng đợi.',
    set_wifi: 'Chỉ tải khi dùng Wi-Fi',
    copied: 'Đã sao chép link', prompt_title: 'Tìm kiếm',
    ph_q: 'Tên tệp, hoặc tag:x / after:2026-01-01',
    ph_name: 'Tên gợi nhớ (vd: PC nhà)', ph_url: 'http://192.168.123.9:3179', ph_user: 'Tài khoản', ph_pass: 'Mật khẩu',
    no_server: 'Chưa có dịch vụ', search_err: 'Câu tìm kiếm không hợp lệ.', conn_err: 'Lỗi kết nối.'
  },
  en: {
    ob_title: 'Connect Perkeep', ob_sub: 'Enter your server address to start',
    f_name: 'Display name', f_url: 'Server address', f_user: 'Username (if any)', f_pass: 'Password',
    ob_connect: 'Connect →', ob_skip: 'Try without a server →',
    ob_bad: 'URL must start with http(s)://', ob_fail: 'Cannot connect. Check IP / WiFi / firewall 3179.',
    btn_search: 'Search', btn_close: 'Close', btn_save: 'Save', btn_cancel: 'Cancel', btn_edit: 'Edit', btn_del: 'Delete',
    home_title: 'Suggested', photo_title: 'Photos', files_title: 'Files', set_title: 'Settings',
    nav_home: 'Home', nav_photo: 'Photos', nav_files: 'Files', nav_set: 'Settings',
    set_svc: 'Perkeep services', set_lang: 'Language', set_diag: 'Diagnostics',
    set_diag_sub: 'Technical log, blobs, JSON', set_about: 'About Perkeep',
    set_about_sub: 'Keep your data for life',
    set_vid: 'Video thumbnails', on: 'On', off: 'Off',
    set_hint: 'Switch / edit / delete services: open “Perkeep services”, or tap the avatar in the search bar.',
    svc_title: 'Perkeep services', svc_add: '+ Add service', ed_add: 'Add service', ed_edit: 'Edit service',
    confirm_del: (n) => `Delete service "${n}"?`, keep_one: 'Keep at least 1 service.',
    lang_title: 'Ngôn ngữ / Language', diag_title: 'Diagnostics',
    about_title: 'About Perkeep',
    about_body: 'Perkeep keeps your stuff for life: everything is content-addressed and never modified. Website: perkeep.org',
    empty: 'No results.', empty_photo: 'No photos in store yet.', loading: 'Loading…',
    found: (n, s) => `${n} results · ${s}`,
    fa_download: 'Download', fa_share: 'Copy link', fa_open: 'Open in Perkeep', fa_detail: 'Details',
    fab_title: 'Create', fab_upload: 'Upload files (background)', fab_note: 'New note', fab_soon: '(coming soon)',
    up_waiting: 'Waiting for network…', up_preparing: 'Preparing…', up_uploading: 'Uploading',
    up_signing: 'Creating item…', up_done: 'Uploaded', up_failed: 'Failed', up_canceled: 'Canceled',
    up_title: 'Uploads', up_retry: 'Retry', up_cancel: 'Cancel', up_clear: 'Clear finished',
    up_need_native: 'Background upload runs in the Android app only. Build the APK to try it.',
    up_none: 'Nothing in the queue yet.',
    set_wifi: 'Wi-Fi only',
    copied: 'Link copied', prompt_title: 'Search',
    ph_q: 'File name, or tag:x / after:2026-01-01',
    ph_name: 'Name (e.g. Home PC)', ph_url: 'http://192.168.123.9:3179', ph_user: 'Username', ph_pass: 'Password',
    no_server: 'No service yet', search_err: 'Invalid search query.', conn_err: 'Connection error.'
  }
};
let lang = localStorage.getItem('pk-lang-v1') || 'vi';
const t = (k) => I18N[lang][k] ?? k;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string') el.textContent = v;
  });
  qEl.placeholder = t('ph_q');
  $('ob-name').placeholder = t('ph_name');
  $('ob-url').placeholder = t('ph_url');
  $('ob-user').placeholder = t('ph_user');
  $('ob-pass').placeholder = t('ph_pass');
  langSubEl.textContent = lang === 'vi' ? 'Tiếng Việt ✓' : 'English ✓';
  $('seg-vi').className = lang === 'vi' ? 'on' : '';
  $('seg-en').className = lang === 'en' ? 'on' : '';
  $('close').innerHTML = icon('close') + `<span>${esc(t('btn_close'))}</span>`;
  renderChips();
  renderSvcSub();
}

// Gắn icon SVG cho các chỗ đánh dấu data-ico (nav, cài đặt, search).
function paintIcons() {
  document.querySelectorAll('[data-ico]').forEach((el) => {
    el.innerHTML = icon(el.dataset.ico, el.classList.contains('chev') ? 20 : 22);
  });
  $('s-ico').innerHTML = icon('search', 18);
  $('fab').innerHTML = icon('plus', 26);
}
function setLang(l) {
  lang = l;
  localStorage.setItem('pk-lang-v1', l);
  applyLang();
  paintIcons();
  if ($('onboarding').hidden) reloadTab(currentTab());
}

// ---------- state ----------
const LS_SERVERS = 'pk-servers-v1';
const LS_ACTIVE = 'pk-active-v1';
const LS_RECENT = 'pk-recent-v1';
const LS_ONBOARD = 'pk-onboarded-v1';

const seed = [{ id: 'local', name: 'Localhost', url: 'http://localhost:3179' }];
function loadServers() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SERVERS));
    if (Array.isArray(s) && s.length) return s;
  } catch {}
  return [...seed];
}
let servers = loadServers();
let activeId = localStorage.getItem(LS_ACTIVE) || servers[0]?.id;
let editingId = null;

const qEl = $('q');
const listEl = $('home-list');
const photoEl = $('photo-grid');
const fileEl = $('file-list');
const outEl = $('out');
const chipsEl = $('chips');
const sheetEl = $('sheet');
const sheetBody = $('sheet-body');
const snackEl = $('snack');
const langSubEl = $('set-lang-sub');

function save() {
  localStorage.setItem(LS_SERVERS, JSON.stringify(servers));
  localStorage.setItem(LS_ACTIVE, activeId);
}
const active = () => servers.find((s) => s.id === activeId) || servers[0];
const base = () => (active()?.url || '').trim().replace(/\/+$/, '');
function authHeaders(extra = {}) {
  const a = active();
  return a?.user ? { ...extra, Authorization: 'Basic ' + btoa(`${a.user}:${a.pass || ''}`) } : extra;
}

function log(...args) {
  outEl.textContent = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join('\n');
}
function snack(msg) {
  snackEl.textContent = msg;
  snackEl.hidden = false;
  clearTimeout(snack._t);
  snack._t = setTimeout(() => { snackEl.hidden = true; }, 1800);
}
function openSheet(html) {
  sheetBody.innerHTML = html;
  sheetEl.hidden = false;
}
function closeSheet() { sheetEl.hidden = true; sheetBody.innerHTML = ''; }
$('close').onclick = closeSheet;

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortBlob = (b) => (b.length > 28 ? b.slice(0, 18) + '…' + b.slice(-8) : b);
const isImage = (m) => /^image\//i.test(m || '');
function iconFor(mime) { return icon(iconForMime(mime)); }
const fmtSize = (n) => {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// ============================================================
// Tìm kiếm Perkeep
// ============================================================
// Perkeep không nhận từ khóa trần ("hello" -> lỗi). Chữ thường -> title:...
function toExpression(input) {
  return /(^|\s)-?[a-zA-Z]+:/.test(input) ? input : `title:${input}`;
}
const DESCRIBE = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };

async function query(expression, limit = 50) {
  const b = base();
  if (!b) throw new Error('no server');
  const body = { expression, limit, describe: DESCRIBE };
  log(`POST ${b}/my-search/camli/search/query`, body);
  const r = await http(b + '/my-search/camli/search/query', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  const j = JSON.parse(r.text);
  if (j.error) throw new Error(j.error.split('\n')[0]);
  const blobs = (j.blobs || []).map((x) => x.blob).filter(Boolean);
  return { blobs, description: j.description };
}

// Gộp meta permanode + file đính kèm.
function metaFor(blob, description) {
  const meta = description?.meta?.[blob];
  if (!meta) return { name: shortBlob(blob), mime: '', size: 0, date: '', fileRef: '' };
  const attr = meta.permanode?.attr || {};
  const fileRef = attr.camliContent?.[0] || '';
  const fm = fileRef ? description.meta?.[fileRef]?.file : null;
  return {
    name: fm?.fileName || attr.title?.[0] || shortBlob(blob),
    mime: fm?.mimeType || attr.mimeType?.[0] || '',
    size: fm?.size || 0,
    date: meta.permanode?.modtime || fm?.time || '',
    fileRef,
    raw: meta
  };
}

const thumbUrl = (fileRef, w = 320) => `${base()}/ui/thumbnail/${encodeURIComponent(fileRef)}?mw=${w}&mh=${w}`;
async function thumbObjectUrl(fileRef, w = 320) {
  const r = await http(`${base()}/ui/thumbnail/${encodeURIComponent(fileRef)}?mw=${w}&mh=${w}`, { headers: authHeaders() });
  if (!r.ok || !r.text || r.text.startsWith('image:')) throw new Error('no thumb');
  return r.text;
}

// ============================================================
// Thumbnail video: Perkeep không tạo được, nên app tự lấy 1 khung hình.
// - Không auth: trỏ thẳng <video src="{uiRoot}/download/<ref}"> (trình duyệt tự range).
// - Có auth: tải 1 đoạn đầu qua native HTTP -> blob URL (blob cùng origin, không vướng CORS).
// - Không cần canvas nên không bị "tainted canvas".
// ============================================================
const VID_RANGE = 4 * 1024 * 1024;     // đoạn đầu tải thử
const VID_FULL_LIMIT = 80 * 1024 * 1024; // nếu đoạn đầu không đủ và file nhỏ hơn mức này thì tải cả file
const vidCache = new Map();  // ref -> src | null
const vidQueue = [];
let vidActive = 0;

function enqueueVid(task) {
  return new Promise((resolve) => {
    vidQueue.push({ task, resolve });
    pumpVid();
  });
}
function pumpVid() {
  while (vidActive < 2 && vidQueue.length) {
    const { task, resolve } = vidQueue.shift();
    vidActive++;
    task()
      .then(resolve, () => resolve(null))
      .finally(() => { vidActive--; pumpVid(); });
  }
}

const vidEnabled = () => localStorage.getItem('pk-vidthumb-v1') !== '0';

async function videoSrc(ref, meta) {
  if (vidCache.has(ref)) return vidCache.get(ref);
  let src = null;
  try {
    if (active()?.user) {
      const url = `${base()}/ui/download/${encodeURIComponent(ref)}`;
      let r = await httpBytes(url, authHeaders({ Range: `bytes=0-${VID_RANGE - 1}` }));
      if (r.ok && r.bytes?.length) {
        src = URL.createObjectURL(new Blob([r.bytes], { type: meta.mime || 'video/mp4' }));
      }
      // Đoạn đầu thiếu moov -> thử tải cả file nếu nhỏ
      if (!src && meta.size && meta.size < VID_FULL_LIMIT) {
        r = await httpBytes(url, authHeaders());
        if (r.ok && r.bytes?.length) src = URL.createObjectURL(new Blob([r.bytes], { type: meta.mime || 'video/mp4' }));
      }
    } else {
      src = `${base()}/ui/download/${encodeURIComponent(ref)}`;
    }
  } catch { src = null; }
  vidCache.set(ref, src);
  return src;
}

// Gắn <video> đã seek sẵn 1 khung vào slot. true = thành công.
async function mountVideoThumb(slot, meta) {
  const ref = meta.fileRef;
  if (!ref || !vidEnabled()) return false;
  const src = await enqueueVid(() => videoSrc(ref, meta));
  if (!src) return false;
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.className = 'thumb-vid';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) {
        slot.textContent = '';
        slot.appendChild(v);
      } else {
        try { v.removeAttribute('src'); v.load(); } catch {}
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 15000);
    v.onloadeddata = () => { if (v.readyState >= 2 && !v.currentTime) { v.pause(); finish(true); } };
    v.onloadedmetadata = () => {
      try { v.currentTime = Math.min(1, Math.max(0.1, (v.duration || 2) * 0.1)); }
      catch { finish(true); }
    };
    v.onseeked = () => { v.pause(); finish(true); };
    v.onerror = () => finish(false);
    v.src = src;
    v.load();
  });
}
function applyThumb(slot, meta) {
  if (isImage(meta.mime) && meta.fileRef) {
    const img = document.createElement('img');
    img.alt = ''; img.loading = 'lazy';
    img.onerror = () => img.remove();
    if (active()?.user) thumbObjectUrl(meta.fileRef).then((u) => { img.src = u; }).catch(() => {});
    else img.src = thumbUrl(meta.fileRef);
    slot.textContent = '';
    slot.appendChild(img);
    return;
  }
  if (/^video\//i.test(meta.mime)) {
    mountVideoThumb(slot, meta).then((ok) => {
      if (!ok) log(`video thumb: bỏ qua ${meta.name}`);
      else log(`video thumb: OK ${meta.name}`);
    });
  }
}

// Chỉ tạo thumbnail khi phần tử vào gần viewport (đỡ tốn dữ liệu).
let thumbObserver = null;
function lazyThumb(el, slot, meta) {
  const run = () => applyThumb(slot, meta);
  if (!('IntersectionObserver' in window)) return run();
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          thumbObserver.unobserve(e.target);
          const cb = e.target._thumbCb;
          if (cb) cb();
        }
      }
    }, { root: null, rootMargin: '250px' });
  }
  el._thumbCb = run;
  thumbObserver.observe(el);
}

// ---------- render 1 dòng file ----------
function fileRow(blob, meta) {
  const row = document.createElement('div');
  row.className = 'frow';
  row.innerHTML = `
    <div class="fic">${iconFor(meta.mime)}</div>
    <div class="fx"><b>${esc(meta.name)}</b><small>${esc([fmtSize(meta.size), fmtDate(meta.date)].filter(Boolean).join(' · '))}</small></div>
    <button class="dot-ico" aria-label="menu">${icon('more', 20)}</button>`;
  const slot = row.querySelector('.fic');
  lazyThumb(row, slot, meta);
  row.querySelector('.dot-ico').onclick = () => fileActions(blob, meta);
  return row;
}
function photoTile(blob, meta) {
  const b = document.createElement('button');
  b.className = 'tile';
  b.innerHTML = `<span class="noimg">${iconFor(meta.mime)}</span><span class="cap">${esc(meta.name)}</span>`;
  const slot = b.querySelector('.noimg');
  lazyThumb(b, slot, meta);
  b.onclick = () => fileActions(blob, meta);
  return b;
}

async function fillList(target, expression, render, emptyMsg, limit = 50) {
  target.innerHTML = `<p class="empty">${esc(t('loading'))}</p>`;
  try {
    const { blobs, description } = await query(expression, limit);
    target.innerHTML = '';
    if (!blobs.length) {
      target.innerHTML = `<p class="empty">${esc(emptyMsg)}</p>`;
      return;
    }
    for (const blob of blobs) target.appendChild(render(blob, metaFor(blob, description)));
    log(`HTTP 200 · ${blobs.length} blobs · expression="${expression}"`);
  } catch (e) {
    target.innerHTML = `<p class="empty">${esc(String(e.message).includes('expression') ? t('search_err') : t('conn_err'))}</p>`;
    log(`FAIL: ${e.message}`);
  }
}

// Tab Nhà = mọi thứ mới nhất; Ảnh = ảnh; Tệp = tất cả.
const EXPR_PHOTOS = '(filename:*.jpg or filename:*.jpeg or filename:*.png or filename:*.gif or filename:*.webp or filename:*.heic)';
const EXPR_VIDEOS = '(filename:*.mp4 or filename:*.mov or filename:*.mkv or filename:*.webm or filename:*.avi)';
const EXPR_DOCS = '(filename:*.pdf or filename:*.doc or filename:*.docx or filename:*.xls or filename:*.xlsx)';

const loadHome = () => fillList(listEl, '', fileRow, t('empty'));
const loadPhotos = () => fillList(photoEl, EXPR_PHOTOS, photoTile, t('empty_photo'));
const loadFiles = () => fillList(fileEl, '', fileRow, t('empty'));
function reloadTab(tab) {
  if (tab === 't-home') loadHome();
  else if (tab === 't-photo') loadPhotos();
  else if (tab === 't-files') loadFiles();
}

// ---------- chips ----------
function quickChips() {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  return lang === 'vi'
    ? [
        { label: 'Ảnh', expr: EXPR_PHOTOS },
        { label: 'Video', expr: EXPR_VIDEOS },
        { label: 'Giấy tờ', expr: EXPR_DOCS },
        { label: 'Tháng này', expr: `after:${y}-${m}-01` }
      ]
    : [
        { label: 'Photos', expr: EXPR_PHOTOS },
        { label: 'Videos', expr: EXPR_VIDEOS },
        { label: 'Documents', expr: EXPR_DOCS },
        { label: 'This month', expr: `after:${y}-${m}-01` }
      ];
}
function renderChips() {
  if (!chipsEl) return;
  chipsEl.innerHTML = '';
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(LS_RECENT)) || []; } catch {}
  const quick = quickChips();
  const seen = new Set(quick.map((q) => q.label));
  const items = [
    ...quick,
    ...recent.filter((r) => r && !seen.has(r.label)).map((r) => ({ label: r.label, expr: r.expr }))
  ].slice(0, 6);
  for (const it of items) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = it.label;
    btn.onclick = () => doSearch(it.expr, it.label);
    chipsEl.appendChild(btn);
  }
}
// Lịch sử lưu nhãn + expression để chip hiển thị dễ đọc.
function pushRecent(label, expr) {
  let r = [];
  try { r = JSON.parse(localStorage.getItem(LS_RECENT)) || []; } catch {}
  r = r.filter((x) => x && typeof x === 'object' && x.label !== label);
  localStorage.setItem(LS_RECENT, JSON.stringify([{ label, expr }, ...r].slice(0, 3)));
  renderChips();
}

// ---------- search từ thanh trên ----------
function switchTab(tab) {
  document.querySelectorAll('.tabs').forEach((x) => x.classList.remove('on'));
  $(tab).classList.add('on');
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  $('fab').hidden = tab === 't-set';
  $('chips').hidden = qEl.value.trim() !== '';
}
document.querySelectorAll('.nav button').forEach((b) => {
  b.onclick = () => {
    switchTab(b.dataset.t);
    if (b.dataset.t !== 't-set') reloadTab(b.dataset.t);
  };
});

async function doSearch(raw, label) {
  const input = (raw ?? qEl.value).trim();
  if (!input) return;
  qEl.value = input;
  const expr = toExpression(input);
  pushRecent(label || input, expr);
  switchTab('t-home');
  await fillList(listEl, expr, fileRow, t('empty'));
}

// ---------- sheet thao tác file ----------
function fileActions(blob, meta) {
  const rows = [
    { k: 'download', ico: 'download', label: t('fa_download') },
    { k: 'share', ico: 'link', label: t('fa_share') },
    { k: 'open', ico: 'external', label: t('fa_open') },
    { k: 'detail', ico: 'info', label: t('fa_detail') }
  ];
  openSheet(`<h3>${esc(meta.name)}</h3>
    <p class="meta">${esc([meta.mime, fmtSize(meta.size), fmtDate(meta.date)].filter(Boolean).join(' · '))}</p>
    ${rows.map((r) => `<button class="rowbtn" data-k="${r.k}">${icon(r.ico)}<span>${esc(r.label)}</span></button>`).join('')}`);
  sheetBody.querySelectorAll('[data-k]').forEach((b) => {
    b.onclick = async () => {
      const ref = meta.fileRef || blob;
      if (b.dataset.k === 'download') {
        window.open(`${base()}/ui/download/${encodeURIComponent(ref)}`, '_blank');
        closeSheet();
      } else if (b.dataset.k === 'share') {
        const link = `${base()}/ui/?p=${encodeURIComponent(ref)}`;
        try { await navigator.clipboard.writeText(link); snack(t('copied')); } catch { snack(link); }
        closeSheet();
      } else if (b.dataset.k === 'open') {
        window.open(`${base()}/ui/?p=${encodeURIComponent(ref)}`, '_blank');
        closeSheet();
      } else {
        openSheet(`<h3>${esc(t('fa_detail'))}</h3><pre>${esc(JSON.stringify({ blob, meta }, null, 2))}</pre>`);
      }
    };
  });
}

// ---------- FAB ----------
// ============================================================
// Upload nền (Android): chọn file -> WorkManager -> notification
// ============================================================
const uploadsEl = $('uploads');
const uploadJobs = new Map();

function uploadLabel(job) {
  switch (job.state) {
    case 'preparing': return t('up_preparing');
    case 'uploading': return t('up_uploading');
    case 'signing': return t('up_signing');
    case 'done': return t('up_done');
    case 'failed': return t('up_failed') + (job.error ? ': ' + job.error : '');
    case 'canceled': return t('up_canceled');
    default: return t('up_waiting');
  }
}

function renderUploads() {
  const jobs = [...uploadJobs.values()];
  uploadsEl.hidden = jobs.length === 0;
  uploadsEl.innerHTML = '';
  if (!jobs.length) return;
  const head = document.createElement('div');
  head.className = 'up-head';
  head.innerHTML = `<b>${esc(t('up_title'))}</b>`;
  const clear = document.createElement('button');
  clear.className = 'chip';
  clear.textContent = t('up_clear');
  clear.onclick = async () => {
    await up.clearFinished();
    await refreshUploads();
  };
  head.appendChild(clear);
  uploadsEl.appendChild(head);

  for (const job of jobs) {
    const pct = job.size > 0 ? Math.min(100, Math.round((job.uploaded / job.size) * 100)) : 0;
    const row = document.createElement('div');
    row.className = 'up-row up-' + job.state;
    row.innerHTML = `
      <div class="up-top">
        <span class="up-ico">${icon(iconForMime(job.mime), 20)}</span>
        <span class="up-name">
          <b>${esc(job.name || job.uri)}</b>
          <small>${esc(uploadLabel(job))}${job.state === 'uploading' ? ` · ${pct}%` : ''}</small>
        </span>
        <span class="up-act"></span>
      </div>
      <div class="up-bar"><i style="width:${job.state === 'done' ? 100 : pct}%"></i></div>`;
    const act = row.querySelector('.up-act');
    if (job.state === 'failed' || job.state === 'canceled') {
      act.innerHTML = `<button class="mini">${esc(t('up_retry'))}</button>`;
      act.querySelector('.mini').onclick = async () => { await up.retryJob(job.id); await refreshUploads(); };
    } else if (job.state !== 'done') {
      act.innerHTML = `<button class="mini danger-text">${esc(t('up_cancel'))}</button>`;
      act.querySelector('.mini').onclick = async () => { await up.cancelJob(job.id); await refreshUploads(); };
    }
    uploadsEl.appendChild(row);
  }
}

async function refreshUploads() {
  if (!up.uploadSupported()) {
    uploadsEl.hidden = true;
    return;
  }
  const jobs = await up.listJobs();
  uploadJobs.clear();
  for (const j of jobs) uploadJobs.set(j.id, j);
  renderUploads();
}

$('fab').onclick = () => {
  if (!up.uploadSupported()) {
    openSheet(`<h3>${esc(t('fab_title'))}</h3>
      <button class="rowbtn">${icon('upload')}<span>${esc(t('fab_upload'))}</span></button>
      <p class="meta">${esc(t('up_need_native'))}</p>`);
    sheetBody.querySelector('.rowbtn').onclick = async () => {
      closeSheet();
      snack(t('up_need_native'));
    };
    return;
  }
  openSheet(`<h3>${esc(t('fab_title'))}</h3>
    <button class="rowbtn" data-k="upload">${icon('upload')}<span>${esc(t('fab_upload'))}</span></button>
    <button class="rowbtn" disabled>${icon('doc')}<span>${esc(t('fab_note'))} ${esc(t('fab_soon'))}</span></button>`);
  sheetBody.querySelector('[data-k="upload"]').onclick = async () => {
    closeSheet();
    try {
      const wifiOnly = await up.getWifiOnly();
      const a = active();
      const res = await up.pickAndUpload(a, { wifiOnly, tag: 'mobile' });
      if (res.ids.length) {
        snack(`${res.ids.length} file → ${t('up_title')}`);
        switchTab('t-home');
        await refreshUploads();
      }
    } catch (e) {
      snack(String(e?.message || e));
    }
  };
};

// ============================================================
// Dịch vụ: danh sách + sửa/xóa
// ============================================================
function renderSvcSub() {
  const a = active();
  $('set-svc-sub').textContent = a ? `${a.name} · ${a.url.replace(/^https?:\/\//, '')}` : t('no_server');
  $('av').textContent = (a?.name || 'P').trim().charAt(0).toUpperCase();
}
function renderSvcSheet() {
  let html = `<h3>${esc(t('svc_title'))}</h3>`;
  for (const s of servers) {
    let host = s.url;
    try { host = new URL(s.url).host; } catch {}
    html += `<div class="svc${s.id === activeId ? ' active' : ''}">
      <button class="pick" data-pick="${esc(s.id)}">
        <span class="sd"></span>
        <span class="st"><b>${esc(s.name)}</b><small>${esc(host)}${s.user ? ' · ' + esc(s.user) : ''}</small></span>
      </button>
      <button class="ib" data-edit="${esc(s.id)}" title="${esc(t('btn_edit'))}">${icon('edit', 19)}</button>
      <button class="ib danger-text" data-rm="${esc(s.id)}" title="${esc(t('btn_del'))}">${icon('trash', 19)}</button>
    </div>`;
  }
  html += `<button class="rowbtn" data-add>${icon('plus')}<span>${esc(t('svc_add').replace(/^\+\s*/, ''))}</span></button>`;
  openSheet(html);
  sheetBody.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => { activeId = b.dataset.pick; save(); renderSvcSub(); openSvcSheet(); reloadTab(currentTab()); };
  });
  sheetBody.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => svcEditor(b.dataset.edit);
  });
  sheetBody.querySelectorAll('[data-rm]').forEach((b) => {
    b.onclick = () => removeServer(b.dataset.rm);
  });
  sheetBody.querySelector('[data-add]').onclick = () => svcEditor(null);
}
const openSvcSheet = renderSvcSheet;
$('av').onclick = renderSvcSheet;
$('set-svc').onclick = renderSvcSheet;

function svcEditor(id) {
  editingId = id;
  const s = id ? servers.find((x) => x.id === id) : null;
  openSheet(`<h3>${esc(t(editingId ? 'ed_edit' : 'ed_add'))}</h3>
    <div class="edt">
      <label>${esc(t('f_name'))}</label><input id="e-n" value="${esc(s?.name || '')}" />
      <label>${esc(t('f_url'))}</label><input id="e-u" value="${esc(s?.url || '')}" inputmode="url" />
      <label>${esc(t('f_user'))}</label><input id="e-us" value="${esc(s?.user || '')}" autocomplete="username" />
      <label>${esc(t('f_pass'))}</label><input id="e-p" type="password" value="${esc(s?.pass || '')}" autocomplete="current-password" />
      <div class="btns"><button data-save>${esc(t('btn_save'))}</button><button class="cx" data-cx>${esc(t('btn_cancel'))}</button></div>
    </div>
    <p class="err" id="e-err" hidden></p>`);
  sheetBody.querySelector('[data-cx]').onclick = renderSvcSheet;
  sheetBody.querySelector('[data-save]').onclick = () => {
    const url = sheetBody.querySelector('#e-u').value.trim().replace(/\/+$/, '');
    const errEl = sheetBody.querySelector('#e-err');
    if (!/^https?:\/\//i.test(url)) { errEl.textContent = t('ob_bad'); errEl.hidden = false; return; }
    const patch = {
      name: sheetBody.querySelector('#e-n').value.trim() || `Server ${servers.length + 1}`,
      url,
      user: sheetBody.querySelector('#e-us').value.trim(),
      pass: sheetBody.querySelector('#e-p').value
    };
    if (editingId) Object.assign(servers.find((x) => x.id === editingId), patch);
    else { const nid = 's' + Date.now(); servers.push({ id: nid, ...patch }); activeId = nid; }
    editingId = null;
    save(); renderSvcSub(); renderSvcSheet(); reloadTab(currentTab());
  };
}
function removeServer(id) {
  const s = servers.find((x) => x.id === id);
  if (!s) return;
  if (servers.length <= 1) return snack(t('keep_one'));
  if (!confirm(t('confirm_del')(s.name))) return;
  servers = servers.filter((x) => x.id !== id);
  if (activeId === id) activeId = servers[0].id;
  save(); renderSvcSub(); renderSvcSheet(); reloadTab(currentTab());
}

// ---------- Cài đặt: ngôn ngữ / chẩn đoán / giới thiệu ----------
$('set-lang').onclick = () => {
  openSheet(`<h3>${esc(t('lang_title'))}</h3>
    <button class="rowbtn" data-l="vi">Tiếng Việt${lang === 'vi' ? ' ✓' : ''}</button>
    <button class="rowbtn" data-l="en">English${lang === 'en' ? ' ✓' : ''}</button>`);
  sheetBody.querySelectorAll('[data-l]').forEach((b) => {
    b.onclick = () => { setLang(b.dataset.l); closeSheet(); };
  });
};
// Bật/tắt tạo thumbnail video trên máy (tốn dữ liệu)
function renderVidState() {
  const on = vidEnabled();
  $('set-vid-state').innerHTML = icon(on ? 'check' : 'close', 20);
  $('set-vid-state').style.color = on ? 'var(--green)' : '#bbb';
  $('set-vid-sub').textContent = t(on ? 'on' : 'off');
}
$('set-vid').onclick = () => {
  localStorage.setItem('pk-vidthumb-v1', vidEnabled() ? '0' : '1');
  renderVidState();
  snack(t(vidEnabled() ? 'on' : 'off'));
  if (vidEnabled()) reloadTab(currentTab());
};
// Bật/tắt "chỉ Wi-Fi" cho upload nền
function renderWifiState() {
  const on = localStorage.getItem('pk-wifi-only-v1') !== '0';
  $('set-wifi-state').innerHTML = icon(on ? 'check' : 'close', 20);
  $('set-wifi-state').style.color = on ? 'var(--green)' : '#bbb';
  $('set-wifi-sub').textContent = t(on ? 'on' : 'off');
}
$('set-wifi').onclick = async () => {
  const next = localStorage.getItem('pk-wifi-only-v1') === '0';
  localStorage.setItem('pk-wifi-only-v1', next ? '1' : '0');
  if (up.uploadSupported()) {
    try { await up.setWifiOnly(next); } catch {}
  }
  renderWifiState();
  snack(t(next ? 'on' : 'off'));
};

$('set-diag').onclick = () => {  openSheet(`<h3>${esc(t('diag_title'))}</h3><pre>${esc(outEl.textContent || '—')}</pre>`);
};
$('set-about').onclick = () => {
  openSheet(`<div style="text-align:center"><img src="/keepy.png" alt="Keepy" style="width:120px" /></div>
    <h3>${esc(t('about_title'))}</h3><p style="font-size:14px;line-height:1.5;margin:0 2px">
    ${esc(t('about_body'))}</p>`);
};
const currentTab = () => document.querySelector('.tabs.on')?.id || 't-home';

// ============================================================
// Kết nối: kiểm tra server sống
// ============================================================
async function testServer() {
  const b = base();
  if (!b) return false;
  try {
    const r = await http(b + '/', { headers: authHeaders() });
    log(`GET ${b}/ → HTTP ${r.status}`);
    return r.ok;
  } catch (e) {
    log(`FAIL: ${e.message}`);
    return false;
  }
}

// ============================================================
// Onboarding
// ============================================================
$('seg-vi').onclick = () => setLang('vi');
$('seg-en').onclick = () => setLang('en');
const onboardingEl = $('onboarding');
function showOnboard(v) { onboardingEl.hidden = !v; }

$('ob-connect').onclick = async () => {
  const errEl = $('ob-err');
  const name = $('ob-name').value.trim() || 'Perkeep';
  const url = $('ob-url').value.trim().replace(/\/+$/, '');
  const user = $('ob-user').value.trim();
  const pass = $('ob-pass').value;
  if (!/^https?:\/\//i.test(url)) { errEl.textContent = t('ob_bad'); errEl.hidden = false; return; }
  errEl.hidden = true;
  $('ob-connect').disabled = true;
  try {
    const headers = user ? { Authorization: 'Basic ' + btoa(`${user}:${pass}`) } : {};
    const r = await http(url + '/', { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    servers = [{ id: 's' + Date.now(), name, url, user, pass }];
    activeId = servers[0].id;
    save();
    localStorage.setItem(LS_ONBOARD, '1');
    renderSvcSub();
    showOnboard(false);
    boot();
  } catch {
    errEl.textContent = t('ob_fail');
    errEl.hidden = false;
  } finally {
    $('ob-connect').disabled = false;
  }
};
$('ob-skip').onclick = () => {
  localStorage.setItem(LS_ONBOARD, '1');
  showOnboard(false);
  boot();
};

// ============================================================
// boot
// ============================================================
function boot() {
  paintIcons();
  renderSvcSub();
  renderVidState();
  renderWifiState();
  renderChips();
  qEl.placeholder = t('ph_q');
  switchTab('t-home');
  loadHome();
  refreshUploads();
  up.onProgress((job) => {
    uploadJobs.set(job.id, job);
    renderUploads();
    if (job.state === 'done') loadHome();
  }).catch(() => {});
}
$('btn-search').onclick = () => doSearch();
qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { qEl.blur(); doSearch(); } });
qEl.addEventListener('input', () => { $('chips').hidden = qEl.value.trim() !== ''; });

applyLang();
paintIcons();
renderSvcSub();
renderChips();
renderVidState();
renderWifiState();
refreshUploads();
up.onProgress((job) => {
  uploadJobs.set(job.id, job);
  renderUploads();
  if (job.state === 'done') loadHome();
}).catch(() => {});
if (!localStorage.getItem(LS_ONBOARD)) showOnboard(true);
else boot();
