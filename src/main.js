import { CapacitorHttp } from '@capacitor/core';
import { icon, iconForMime } from './icons.js';
import { blobRefOf } from './sha224.js';
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
    home_title: 'Được đề xuất', star_title: 'Đã ghim', files_title: 'Tệp', set_title: 'Cài đặt',
    nav_home: 'Nhà', nav_star: 'Ghim', nav_files: 'Tệp', nav_set: 'Cài đặt',
    view_list: 'Danh sách', view_grid: 'Lưới lớn',
    star_add: 'Ghim (đánh dấu)', star_removed: 'Bỏ ghim',
    star_on: 'Đã ghim', star_off: 'Đã bỏ ghim',
    empty_star: 'Chưa ghim file nào. Mở ⋮ của file và chọn “Ghim”.',
    star_is_tag: 'Ghim dùng tag “star” trên Perkeep nên đồng bộ mọi thiết bị.',
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
    empty: 'Không có kết quả.', loading: 'Đang tải…',
    found: (n, s) => `${n} kết quả · ${s}`,
    fa_download: 'Tải về máy', fa_share: 'Sao chép link', fa_open: 'Mở trong Perkeep', fa_detail: 'Chi tiết',
    tag_add: 'Thêm tag', tag_section: 'Tag', tag_ph: 'Nhập tag rồi bấm Thêm', tag_btn: 'Thêm',
    tag_note: 'Tag giúp bạn tìm lại nhanh: đặt “Tìm theo → Tag” rồi gõ tag.',
    tag_added: (v) => `Đã thêm tag “${v}”`, tag_removed: (v) => `Đã bỏ tag “${v}”`,
    tag_fail: 'Không đổi được tag', tag_need_permanode: 'Mục này không phải permanode nên chưa gắn tag được.',
    tag_remove: 'Bỏ tag này',
    vw_view: 'Xem trong app', vw_open_ext: 'Mở bằng ứng dụng khác', vw_unsupported: 'Loại file này không xem được trong app. Bạn mở bằng ứng dụng khác nhé.',
    ptr: 'Đang tải lại…',
    fl_title: 'Bộ lọc', fl_type: 'Loại tệp', fl_time: 'Thời gian', fl_sort: 'Sắp xếp',
    fl_all: 'Tất cả', fl_image: 'Ảnh', fl_video: 'Video', fl_audio: 'Âm thanh', fl_doc: 'Tài liệu',
    fl_any_time: 'Bất kỳ', fl_today: 'Hôm nay', fl_week: '7 ngày qua', fl_month: 'Tháng này', fl_year: 'Năm nay',
    fl_newest: 'Mới nhất', fl_oldest: 'Cũ nhất', fl_name: 'Tên A→Z',
    fl_clear: 'Xoá bộ lọc', fl_kw: 'Từ khoá', fl_adv_chip: 'Cú pháp riêng',
    fl_by: 'Tìm theo', fl_by_name: 'Tên tệp', fl_by_tag: 'Tag', fl_by_raw: 'Cú pháp Perkeep',
    fl_ph_name: 'Nhập tên tệp…', fl_ph_tag: 'Nhập tag (đúng chính xác)…', fl_ph_raw: 'vd: tag:phone before:2026',
    fl_advanced: 'Nâng cao: cú pháp Perkeep (để trống nếu không dùng)',
    fl_expr: 'Câu lệnh gửi tới Perkeep', fl_apply: 'Áp dụng',
    fl_local: 'Lọc ngay trên máy',
    fab_title: 'Tạo mới', fab_upload: 'Tải tệp lên (chạy nền)', fab_note: 'Tạo ghi chú', fab_soon: '(sắp có)',
    up_waiting: 'Chờ mạng…', up_preparing: 'Đang chuẩn bị…', up_uploading: 'Đang tải lên',
    up_signing: 'Đang tạo mục…', up_done: 'Đã tải lên', up_failed: 'Lỗi', up_canceled: 'Đã huỷ',
    up_title: 'Đang tải lên', up_retry: 'Thử lại', up_cancel: 'Huỷ', up_clear: 'Xoá mục xong',
    up_need_native: 'Tải nền chỉ chạy trong app Android. Hãy build APK rồi thử.',
    up_none: 'Chưa có file nào trong hàng đợi.',
    set_wifi: 'Chỉ tải khi dùng Wi-Fi',
    set_font: 'Cỡ chữ', fs_s: 'Nhỏ', fs_m: 'Vừa (mặc định)', fs_l: 'Lớn', fs_xl: 'Rất lớn',
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
    home_title: 'Suggested', star_title: 'Starred', files_title: 'Files', set_title: 'Settings',
    nav_home: 'Home', nav_star: 'Starred', nav_files: 'Files', nav_set: 'Settings',
    view_list: 'List', view_grid: 'Big icons',
    star_add: 'Add star', star_removed: 'Remove star',
    star_on: 'Starred', star_off: 'Removed star',
    empty_star: 'Nothing starred yet. Open a file’s ⋮ menu and pick “Add star”.',
    star_is_tag: 'Starring uses the Perkeep tag “star”, so it syncs across devices.',
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
    empty: 'No results.', loading: 'Loading…',
    found: (n, s) => `${n} results · ${s}`,
    fa_download: 'Download', fa_share: 'Copy link', fa_open: 'Open in Perkeep', fa_detail: 'Details',
    tag_add: 'Add tag', tag_section: 'Tags', tag_ph: 'Type a tag then Add', tag_btn: 'Add',
    tag_note: 'Tags make search easy: set “Search by → Tag” and type the tag.',
    tag_added: (v) => `Added tag “${v}”`, tag_removed: (v) => `Removed tag “${v}”`,
    tag_fail: 'Could not change tag', tag_need_permanode: 'This item is not a permanode, cannot tag it.',
    tag_remove: 'Remove this tag',
    vw_view: 'View in app', vw_open_ext: 'Open with another app', vw_unsupported: 'This file type cannot be previewed in the app. Open it with another app?',
    ptr: 'Reloading…',
    fl_title: 'Filters', fl_type: 'File type', fl_time: 'Time', fl_sort: 'Sort',
    fl_all: 'All', fl_image: 'Photos', fl_video: 'Videos', fl_audio: 'Audio', fl_doc: 'Documents',
    fl_any_time: 'Any time', fl_today: 'Today', fl_week: 'Last 7 days', fl_month: 'This month', fl_year: 'This year',
    fl_newest: 'Newest', fl_oldest: 'Oldest', fl_name: 'Name A→Z',
    fl_clear: 'Clear filters', fl_kw: 'Keyword', fl_adv_chip: 'Custom query',
    fl_by: 'Search by', fl_by_name: 'File name', fl_by_tag: 'Tag', fl_by_raw: 'Perkeep query',
    fl_ph_name: 'Type a file name…', fl_ph_tag: 'Type an exact tag…', fl_ph_raw: 'e.g. tag:phone before:2026',
    fl_advanced: 'Advanced: raw Perkeep query (leave empty to ignore)',
    fl_expr: 'Query sent to Perkeep', fl_apply: 'Apply',
    fl_local: 'Filtered on device',
    fab_title: 'Create', fab_upload: 'Upload files (background)', fab_note: 'New note', fab_soon: '(coming soon)',
    up_waiting: 'Waiting for network…', up_preparing: 'Preparing…', up_uploading: 'Uploading',
    up_signing: 'Creating item…', up_done: 'Uploaded', up_failed: 'Failed', up_canceled: 'Canceled',
    up_title: 'Uploads', up_retry: 'Retry', up_cancel: 'Cancel', up_clear: 'Clear finished',
    up_need_native: 'Background upload runs in the Android app only. Build the APK to try it.',
    up_none: 'Nothing in the queue yet.',
    set_wifi: 'Wi-Fi only',
    set_font: 'Text size', fs_s: 'Small', fs_m: 'Default', fs_l: 'Large', fs_xl: 'Extra large',
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
  renderFilters();
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
const starEl = $('star-list');
const fileEl = $('file-list');
const outEl = $('out');
const filtersEl = $('filters');
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
  sheetEl.style.transform = '';
  sheetEl.style.transition = '';
  sheetEl.scrollTop = 0;
  sheetEl.hidden = false;
}
function closeSheet() {
  sheetEl.hidden = true;
  sheetEl.style.transform = '';
  sheetEl.style.transition = '';
  sheetBody.innerHTML = '';
}
$('close').onclick = closeSheet;

// Vuốt xuống để đóng sheet (đỡ phải bấm nút Đóng, nhất là máy màn hình lớn)
function setupSheetDrag() {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  const atTop = () => sheetEl.scrollTop <= 0;
  const reset = () => {
    sheetEl.classList.remove('dragging');
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
  };

  sheetEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    dragging = atTop();
    startY = e.touches[0].clientY;
    dy = 0;
    if (dragging) sheetEl.style.transition = 'none';
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) {
      sheetEl.style.transform = '';
      return;
    }
    if (!atTop()) { // nội dung đã cuộn thì không kéo đóng nữa
      dragging = false;
      reset();
      return;
    }
    sheetEl.classList.add('dragging');
    sheetEl.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheetEl.classList.remove('dragging');
    const shouldClose = dy > 90;
    sheetEl.style.transition = 'transform .18s ease-out';
    sheetEl.style.transform = shouldClose ? 'translateY(100%)' : 'translateY(0)';
    setTimeout(() => (shouldClose ? closeSheet() : reset()), 170);
  };
  sheetEl.addEventListener('touchend', end, { passive: true });
  sheetEl.addEventListener('touchcancel', end, { passive: true });
}
setupSheetDrag();

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Bỏ dấu tiếng Việt + về chữ thường để tìm tên file dễ hơn
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
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
// Người dùng chọn bộ lọc trực quan; app tự dịch sang expression Perkeep.
// (Perkeep không nhận từ khóa trần: "hello" -> lỗi, nên phải thành title:hello)
const DESCRIBE = { rules: [{ attrs: ['*'], rules: [{ attrs: ['*'] }] }] };

const TYPE_EXPR = {
  image: '(filename:*.jpg or filename:*.jpeg or filename:*.png or filename:*.gif or filename:*.webp or filename:*.heic)',
  video: '(filename:*.mp4 or filename:*.mov or filename:*.mkv or filename:*.webm or filename:*.avi)',
  audio: '(filename:*.mp3 or filename:*.m4a or filename:*.wav or filename:*.flac or filename:*.ogg)',
  doc: '(filename:*.pdf or filename:*.doc or filename:*.docx or filename:*.xls or filename:*.xlsx or filename:*.ppt or filename:*.pptx or filename:*.txt)'
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function timeFrom(kind) {
  const d = new Date();
  if (kind === 'today') return iso(d);
  if (kind === 'week') { d.setDate(d.getDate() - 7); return iso(d); }
  if (kind === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  if (kind === 'year') return `${d.getFullYear()}-01-01`;
  return '';
}

// Bộ lọc hiện tại (nhớ cho lần mở sau)
const filters = Object.assign(
  { type: 'all', time: 'any', sort: 'newest', by: 'name', view: 'list', keyword: '', advanced: '' },
  JSON.parse(localStorage.getItem('pk-filters-v1') || '{}')
);
const saveFilters = () => localStorage.setItem('pk-filters-v1', JSON.stringify(filters));
const filterActive = () =>
  filters.type !== 'all' || filters.time !== 'any' || filters.sort !== 'newest' || filters.by !== 'name' || !!filters.keyword || !!filters.advanced;

// "Ghim" = tag "star" trên Perkeep -> đồng bộ mọi thiết bị
const STAR_TAG = 'star';
const isStarred = (meta) => (meta.tags || []).includes(STAR_TAG);

/** Dịch bộ lọc thành expression Perkeep.
 *  - Lọc thời gian + từ khoá theo tên làm ở máy (xem fillList)
 *  - "Tìm theo = Tag" thì thêm tag:<kw> cho server
 *  - "Tìm theo = Cú pháp Perkeep" thì ghép cú pháp người dùng nhập
 */
function buildExpression(forceType) {
  const type = forceType || filters.type;
  const parts = [];
  if (type !== 'all' && TYPE_EXPR[type]) parts.push(TYPE_EXPR[type]);
  const kw = filters.keyword.trim();
  if (filters.by === 'tag' && kw) parts.push(`tag:${/\s/.test(kw) ? `"${kw}"` : kw}`);
  if (filters.by === 'raw' && filters.advanced.trim()) parts.push(filters.advanced.trim());
  return parts.join(' ');
}
// Perkeep chỉ nhận sort "-created" / "created" / "map".
// Có lọc thời gian thì luôn lấy trang mới nhất để không sót mục gần đây.
function serverSort() {
  if (filters.time !== 'any') return '-created';
  return filters.sort === 'oldest' ? 'created' : '-created';
}

async function query(expression, limit = 50, sort = '') {
  const b = base();
  if (!b) throw new Error('no server');
  const body = { expression, limit, describe: DESCRIBE };
  if (sort) body.sort = sort;
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
  if (!meta) return { name: shortBlob(blob), mime: '', size: 0, date: '', fileRef: '', tags: [], raw: null };
  const attr = meta.permanode?.attr || {};
  const fileRef = attr.camliContent?.[0] || '';
  const fm = fileRef ? description.meta?.[fileRef]?.file : null;
  return {
    name: fm?.fileName || attr.title?.[0] || shortBlob(blob),
    mime: fm?.mimeType || attr.mimeType?.[0] || '',
    size: fm?.size || 0,
    date: meta.permanode?.modtime || fm?.time || '',
    fileRef,
    tags: attr.tag || [],
    isPermanode: meta.camliType === 'permanode',
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

// ---------- render 1 dòng file (kiểu danh sách) ----------
function fileRow(blob, meta, index = 0) {
  const row = document.createElement('div');
  row.className = 'frow';
  row.innerHTML = `
    <div class="fic">${iconFor(meta.mime)}</div>
    <div class="fx"><b>${esc(meta.name)}</b><small>${esc(metaLine(meta))}</small></div>
    <button class="dot-ico" aria-label="menu">${icon('more', 20)}</button>`;
  lazyThumb(row, row.querySelector('.fic'), meta);
  row.querySelector('.dot-ico').onclick = (e) => {
    e.stopPropagation();
    fileActions(blob, meta);
  };
  row.onclick = () => openViewer(index); // chạm vào dòng = mở xem
  return row;
}

// ---------- render 1 ô file (kiểu lưới lớn) ----------
function gridCard(blob, meta, index = 0) {
  const c = document.createElement('button');
  c.className = 'vcard';
  c.innerHTML = `
    <span class="vthumb">${icon(iconForMime(meta.mime), 34)}</span>
    <span class="vname">${isStarred(meta) ? '★ ' : ''}${esc(meta.name)}</span>
    <span class="vmeta">${esc(metaLine(meta))}</span>
    <button class="vmore" aria-label="menu">${icon('more', 18)}</button>`;
  lazyThumb(c, c.querySelector('.vthumb'), meta);
  c.querySelector('.vmore').onclick = (e) => {
    e.stopPropagation();
    fileActions(blob, meta);
  };
  c.onclick = () => openViewer(index);
  return c;
}

const metaLine = (meta) =>
  [fmtSize(meta.size), fmtDate(meta.date), ...(meta.tags || []).map((x) => '#' + x)].filter(Boolean).join(' · ');

/** Chọn cách render theo "View by". */
const renderer = () => {
  if (filters.view !== 'grid') return fileRow;
  return gridCard;
};
/** Container thành danh sách/lưới tuỳ chế độ xem. */
function setContainerMode(el, on) {
  els().forEach((x) => x.classList.remove('gridmode'));
  if (el) el.classList.toggle('gridmode', on);
}
const els = () => [listEl, starEl, fileEl].filter(Boolean);

/** Hiện thông báo rỗng/lỗi và căn giữa khoảng trống còn lại. */
function showEmpty(target, msg) {
  target.innerHTML = `<p class="empty">${esc(msg)}</p>`;
  target.classList.add('is-empty');
}
function clearEmpty(target) {
  target.classList.remove('is-empty');
}

async function fillList(target, expression, render, emptyMsg, limit = 50) {
  target.innerHTML = `<p class="empty">${esc(t('loading'))}</p>`;
  target.classList.add('is-empty');
  setContainerMode(target, filters.view === 'grid');
  try {
    const wantKw = filters.by === 'name' && !!filters.keyword.trim();
    // Tìm theo tên ở máy -> lấy trang rộng hơn để đỡ sót
    const { blobs, description } = await query(expression, wantKw ? 150 : limit, serverSort());
    target.innerHTML = '';
    clearEmpty(target);
    if (!blobs.length) {
      showEmpty(target, emptyMsg);
      if (els().includes(target)) currentItems = [];
      return;
    }
    let items = blobs.map((b) => ({ blob: b, meta: metaFor(b, description) }));

    // Từ khóa: khớp tên hiển thị, không phân biệt hoa/thường và dấu tiếng Việt
    if (wantKw) {
      const needle = norm(filters.keyword);
      items = items.filter((it) => norm(it.meta.name || '').includes(needle));
    }
    // Thời gian: lọc theo đúng ngày đang hiển thị cho người dùng
    if (filters.time !== 'any') {
      const from = timeFrom(filters.time);
      if (from) items = items.filter((it) => (it.meta.date || '').slice(0, 10) >= from);
    }
    if (filters.sort === 'name' && filters.time !== 'any') {
      items.sort((a, b) => (a.meta.name || '').localeCompare(b.meta.name || '', lang === 'vi' ? 'vi' : 'en'));
    }

    if (!items.length) {
      showEmpty(target, emptyMsg);
      if (els().includes(target)) currentItems = [];
      return;
    }
    // Trình xem cần danh sách của tab đang xem để chuyển qua lại
    if (els().includes(target)) currentItems = items;
    items.forEach((it, i) => target.appendChild(render(it.blob, it.meta, i)));
    log(`HTTP 200 · ${items.length}/${blobs.length} blobs · expression="${expression || '(trống)'}" · sort=${serverSort()}`);
  } catch (e) {
    showEmpty(target, String(e.message).includes('expression') ? t('search_err') : t('conn_err'));
    log(`FAIL: ${e.message}`);
  }
}

// Tab Nhà / Tệp / Ghim dùng bộ lọc; Ghim thêm điều kiện tag:star.
const loadHome = () => fillList(listEl, buildExpression(), renderer(), t('empty'));
const loadFiles = () => fillList(fileEl, buildExpression(), renderer(), t('empty'));
const loadStarred = () =>
  fillList(starEl, [buildExpression(), `tag:${STAR_TAG}`].filter(Boolean).join(' '), renderer(), t('empty_star'));
function reloadTab(tab) {
  if (tab === 't-home') loadHome();
  else if (tab === 't-star') loadStarred();
  else if (tab === 't-files') loadFiles();
}

// ---------- Bộ lọc trực quan (thay cho việc bắt gõ cú pháp Perkeep) ----------
const TYPE_OPTS = [
  { v: 'all', k: 'fl_all', ico: 'folder' },
  { v: 'image', k: 'fl_image', ico: 'image' },
  { v: 'video', k: 'fl_video', ico: 'video' },
  { v: 'audio', k: 'fl_audio', ico: 'audio' },
  { v: 'doc', k: 'fl_doc', ico: 'doc' }
];
const TIME_OPTS = [
  { v: 'any', k: 'fl_any_time' },
  { v: 'today', k: 'fl_today' },
  { v: 'week', k: 'fl_week' },
  { v: 'month', k: 'fl_month' },
  { v: 'year', k: 'fl_year' }
];
const SORT_OPTS = [
  { v: 'newest', k: 'fl_newest' },
  { v: 'oldest', k: 'fl_oldest' },
  { v: 'name', k: 'fl_name' }
];
const BY_OPTS = [
  { v: 'name', k: 'fl_by_name' },
  { v: 'tag', k: 'fl_by_tag' },
  { v: 'raw', k: 'fl_by_raw' }
];
const optLabel = (list, v) => t((list.find((o) => o.v === v) || list[0]).k);

// Nhóm bộ lọc: chip luôn hiện trên màn hình, chạm để đổi
const FILTER_GROUPS = [
  { key: 'type', label: 'fl_type', opts: TYPE_OPTS, def: 'all', clearTo: 'all', queryOnly: true },
  { key: 'time', label: 'fl_time', opts: TIME_OPTS, def: 'any', clearTo: 'any' },
  { key: 'sort', label: 'fl_sort', opts: SORT_OPTS, def: 'newest', clearTo: 'newest', queryOnly: true },
  { key: 'by', label: 'fl_by', opts: BY_OPTS, def: 'name', clearTo: 'name' }
];
const isDefault = (g) => filters[g.key] === g.def;

/** Thanh chip: 4 nhóm lọc + từ khoá + xoá. Ẩn nhóm không liên quan ở tab Ảnh. */
function renderFilters() {
  const el = $('filters');
  if (!el) return;
  el.innerHTML = '';
  const groups = FILTER_GROUPS;

  for (const g of groups) {
    const b = document.createElement('button');
    b.className = 'fchip' + (isDefault(g) ? '' : ' active');
    b.innerHTML = `<span class="lab">${esc(t(g.label))}:</span><b>${esc(optLabel(g.opts, filters[g.key]))}</b><span class="caret">▾</span>`;
    b.onclick = () => openGroupSheet(g);
    el.appendChild(b);
  }

  if (filters.keyword) {
    const used = filters.by === 'name' || filters.by === 'tag';
    if (used) {
      const b = document.createElement('button');
      b.className = 'fchip active';
      b.innerHTML = `<span class="lab">${esc(t('fl_kw'))}:</span><b>${esc(filters.keyword)}</b><span class="caret">✕</span>`;
      b.onclick = () => { filters.keyword = ''; qEl.value = ''; saveFilters(); renderFilters(); reloadTab(currentTab()); };
      el.appendChild(b);
    }
  }
  if (filterActive()) {
    const clr = document.createElement('button');
    clr.className = 'fchip clear';
    clr.innerHTML = `${icon('filterOff', 16)}<b>${esc(t('fl_clear'))}</b>`;
    clr.onclick = () => {
      Object.assign(filters, { type: 'all', time: 'any', sort: 'newest', by: 'name', keyword: '', advanced: '' });
      qEl.value = '';
      saveFilters(); renderFilters(); reloadTab(currentTab());
    };
    el.appendChild(clr);
  }

  // Gợi ý placeholder theo kiểu tìm
  qEl.placeholder = filters.by === 'tag' ? t('fl_ph_tag') : filters.by === 'raw' ? t('fl_ph_raw') : t('fl_ph_name');
  // Nút kiểu xem: 2 ô, ô đang dùng được tô sáng
  const seg = $('viewseg');
  if (seg) {
    $('btn-view-list').innerHTML = icon('list', 20);
    $('btn-view-grid').innerHTML = icon('grid', 20);
    $('btn-view-list').classList.toggle('on', filters.view !== 'grid');
    $('btn-view-grid').classList.toggle('on', filters.view === 'grid');
    $('btn-view-list').title = t('view_list');
    $('btn-view-grid').title = t('view_grid');
  }
  el.hidden = false;
}

// Đổi kiểu xem Danh sách <-> Lưới lớn
function setView(v) {
  if (filters.view === v) return;
  filters.view = v;
  saveFilters();
  snack(t(v === 'grid' ? 'view_grid' : 'view_list'));
  renderFilters();
  reloadTab(currentTab());
}
$('btn-view-list').onclick = () => setView('list');
$('btn-view-grid').onclick = () => setView('grid');

const optRow = (list, value) => list.map((o) => {
  const on = o.v === value;
  return `<button class="opt${on ? ' on' : ''}" data-v="${o.v}">${o.ico ? icon(o.ico, 20) : ''}<span>${esc(t(o.k))}</span>${on ? `<span class="tick">${icon('check', 18)}</span>` : ''}</button>`;
}).join('');

/** Sheet cho 1 nhóm lọc (Loại tệp / Thời gian / Sắp xếp / Tìm theo). */
function openGroupSheet(g) {
  const showAdv = g.key === 'by' && filters.by === 'raw';
  openSheet(`<h3>${esc(t(g.label))}</h3>${optRow(g.opts, filters[g.key])}
    ${showAdv ? `<div class="sec">${esc(t('fl_advanced'))}</div>
      <input class="adv" id="g-adv" value="${esc(filters.advanced)}" placeholder="${esc(t('fl_ph_raw'))}" />` : ''}
    <div class="sec">${esc(t('fl_expr'))}</div>
    <div class="expr" id="g-expr"></div>
    <p class="meta" id="g-note"></p>
    ${showAdv ? `<button class="rowbtn" id="g-apply">${icon('check')}<span>${esc(t('fl_apply'))}</span></button>` : ''}
    <button class="rowbtn" id="g-reset">${icon('filterOff')}<span>${esc(t('fl_clear'))}</span></button>`);

  const advInput = sheetBody.querySelector('#g-adv');
  const paintExpr = () => {
    if (advInput) {
      const saved = filters.advanced;
      filters.advanced = advInput.value.trim();
      sheetBody.querySelector('#g-expr').textContent = buildExpression() || '(trống)';
      filters.advanced = saved;
    } else {
      sheetBody.querySelector('#g-expr').textContent = buildExpression() || '(trống)';
    }
    const note = [];
    if (filters.time !== 'any') note.push(`${t('fl_time')}: ${optLabel(TIME_OPTS, filters.time)}`);
    if (filters.by === 'name' && filters.keyword.trim()) note.push(`${t('fl_kw')}: ${filters.keyword.trim()}`);
    if (filters.sort === 'name' && filters.time !== 'any') note.push(t('fl_name'));
    sheetBody.querySelector('#g-note').textContent = note.length ? `${t('fl_local')}: ${note.join(' · ')}` : '';
  };
  if (advInput) advInput.addEventListener('input', paintExpr);
  paintExpr();

  sheetBody.querySelectorAll('.opt').forEach((b) => {
    b.onclick = () => {
      filters[g.key] = b.dataset.v;
      saveFilters();
      closeSheet();
      renderFilters();
      reloadTab(currentTab());
    };
  });
  sheetBody.querySelector('#g-reset').onclick = () => {
    Object.assign(filters, { type: 'all', time: 'any', sort: 'newest', by: 'name', keyword: '', advanced: '' });
    qEl.value = '';
    saveFilters(); closeSheet(); renderFilters(); reloadTab(currentTab());
  };
  const applyBtn = sheetBody.querySelector('#g-apply');
  if (applyBtn) {
    applyBtn.onclick = () => {
      filters.advanced = advInput.value.trim();
      saveFilters(); closeSheet(); renderFilters(); reloadTab(currentTab());
    };
  }
}

// ============================================================
// Trình xem file trong app (ảnh / video / audio)
// PDF và loại khác: WebView Android không render được -> mở bằng app ngoài
// ============================================================
let currentItems = [];
let viewIndex = -1;

const viewerEl = $('viewer');
const vwBody = $('vw-body');
const vwName = $('vw-name');
const vwSub = $('vw-sub');
const vwCount = $('vw-count');

function paintViewer() {
  $('vw-close').innerHTML = icon('close');
  $('vw-external').innerHTML = icon('external');
  $('vw-prev').innerHTML = icon('chevron', 22).replace('<svg', '<svg style="transform:rotate(180deg)"');
  $('vw-next').innerHTML = icon('chevron');
}

const directUrl = (ref) => `${base()}/ui/download/${encodeURIComponent(ref)}`;

/** URL xem được. Có auth thì <img>/<video> không gửi được header -> dùng blob URL. */
async function mediaUrl(meta, big = false) {
  if (!meta.fileRef) return null;
  if (!active()?.user) return directUrl(meta.fileRef);
  if (isImage(meta.mime)) return await thumbObjectUrl(meta.fileRef, big ? 1600 : 400);
  return null; // video/audio + auth: không stream trực tiếp được
}

function viewerFallback(meta) {
  vwBody.innerHTML = `<div class="vw-note">${esc(t('vw_unsupported'))}
    <div class="vw-actions">
      <button id="vw-open-ext">${icon('external')}<span>${esc(t('vw_open_ext'))}</span></button>
      <button class="alt" id="vw-download">${icon('download')}<span>${esc(t('fa_download'))}</span></button>
    </div></div>`;
  vwBody.querySelector('#vw-open-ext').onclick = () => window.open(directUrl(meta.fileRef), '_blank');
  vwBody.querySelector('#vw-download').onclick = () => window.open(directUrl(meta.fileRef), '_blank');
}

async function renderViewer() {
  const it = currentItems[viewIndex];
  if (!it) return closeViewer();
  const meta = it.meta;
  vwName.textContent = meta.name || it.blob;
  vwSub.textContent = [meta.mime, fmtSize(meta.size), fmtDate(meta.date)].filter(Boolean).join(' · ');
  vwCount.textContent = `${viewIndex + 1}/${currentItems.length}`;
  vwBody.innerHTML = `<p class="vw-note">${esc(t('loading'))}</p>`;
  const mime = meta.mime || '';

  if (isImage(mime)) {
    let src = null;
    try { src = await mediaUrl(meta, true); } catch {}
    if (!src) return viewerFallback(meta);
    if (viewIndex !== currentItems.indexOf(it)) return; // người dùng đã chuyển file
    const img = document.createElement('img');
    img.alt = meta.name || '';
    img.onerror = () => viewerFallback(meta);
    img.src = src;
    vwBody.innerHTML = '';
    vwBody.appendChild(img);
    return;
  }

  if (/^(video|audio)\//i.test(mime)) {
    let src = null;
    try { src = await mediaUrl(meta); } catch {}
    if (!src) return viewerFallback(meta);
    if (viewIndex !== currentItems.indexOf(it)) return;
    const tag = /^video\//i.test(mime) ? 'video' : 'audio';
    const el = document.createElement(tag);
    el.controls = true;
    el.autoplay = true;
    if (tag === 'video') {
      el.playsInline = true;
      el.setAttribute('playsinline', '');
    }
    el.onerror = () => viewerFallback(meta);
    el.src = src;
    vwBody.innerHTML = '';
    vwBody.appendChild(el);
    return;
  }

  viewerFallback(meta);
}

function openViewer(i) {
  if (i < 0 || i >= currentItems.length) return;
  viewIndex = i;
  paintViewer();
  viewerEl.hidden = false;
  renderViewer();
}
function closeViewer() {
  viewerEl.hidden = true;
  vwBody.innerHTML = ''; // dừng phát video/audio
  viewIndex = -1;
}
const stepViewer = (d) => {
  if (viewIndex < 0) return;
  const n = viewIndex + d;
  if (n < 0 || n >= currentItems.length) return;
  viewIndex = n;
  renderViewer();
};

$('vw-close').onclick = closeViewer;
$('vw-prev').onclick = () => stepViewer(-1);
$('vw-next').onclick = () => stepViewer(1);
$('vw-external').onclick = () => {
  const it = currentItems[viewIndex];
  if (it?.meta.fileRef) window.open(directUrl(it.meta.fileRef), '_blank');
};
document.addEventListener('keydown', (e) => {
  if (viewerEl.hidden) return;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft') stepViewer(-1);
  else if (e.key === 'ArrowRight') stepViewer(1);
});
// Vuốt ngang để chuyển file, vuốt xuống để đóng
let vwTouch = null;
viewerEl.addEventListener('touchstart', (e) => {
  vwTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
viewerEl.addEventListener('touchend', (e) => {
  if (!vwTouch) return;
  const dx = e.changedTouches[0].clientX - vwTouch.x;
  const dy = e.changedTouches[0].clientY - vwTouch.y;
  vwTouch = null;
  if (Math.abs(dy) > Math.abs(dx)) {
    if (dy > 70) closeViewer(); // vuốt xuống = đóng
    return;
  }
  if (Math.abs(dx) < 60) return;
  stepViewer(dx < 0 ? 1 : -1);
}, { passive: true });

// ============================================================
// Kéo xuống để tải lại (pull-to-refresh)
// ============================================================
const ptrEl = $('ptr');
function setupPullToRefresh(el, onRefresh) {
  let startY = 0;
  let dist = 0;
  let armed = false;
  const THRESHOLD = 70;

  el.addEventListener('touchstart', (e) => {
    armed = el.scrollTop <= 0;
    startY = e.touches[0].clientY;
    dist = 0;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!armed) return;
    dist = e.touches[0].clientY - startY;
    if (dist > 0) ptrEl.classList.toggle('on', dist > THRESHOLD * 0.6);
    else armed = dist > -10 ? armed : false;
  }, { passive: true });

  el.addEventListener('touchend', () => {
    const should = armed && dist > THRESHOLD;
    armed = false;
    dist = 0;
    if (!should) {
      ptrEl.classList.remove('on');
      return;
    }
    ptrEl.classList.add('on');
    Promise.resolve(onRefresh()).finally(() => setTimeout(() => ptrEl.classList.remove('on'), 400));
  }, { passive: true });
}
['t-home', 't-star', 't-files'].forEach((id) => {
  setupPullToRefresh($(id), () => reloadTab(id));
});

// ---------- search từ thanh trên: gõ tự do, không cần cú pháp ----------
function switchTab(tab) {
  document.querySelectorAll('.tabs').forEach((x) => x.classList.remove('on'));
  $(tab).classList.add('on');
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  $('fab').hidden = tab === 't-set';
  renderFilters();
}
document.querySelectorAll('.nav button').forEach((b) => {
  b.onclick = () => {
    switchTab(b.dataset.t);
    if (b.dataset.t !== 't-set') reloadTab(b.dataset.t);
  };
});

// Gõ từ khóa -> tự tìm sau khi ngừng gõ; Enter để tìm ngay
let searchTimer = null;
function runKeywordSearch(immediate) {
  filters.keyword = qEl.value.trim();
  filters.advanced = ''; // gõ từ khóa thì bỏ cú pháp nâng cao cũ
  saveFilters();
  renderFilters();
  clearTimeout(searchTimer);
  if (immediate) reloadTab(currentTab());
  else searchTimer = setTimeout(() => reloadTab(currentTab()), 400);
}
qEl.addEventListener('input', () => runKeywordSearch(false));
qEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    qEl.blur();
    runKeywordSearch(true);
  }
});

// ---------- sheet thao tác file ----------
// ============================================================
// Tag: thêm/bỏ tag = ký claim (add/del-attribute) rồi upload blob
// Dùng chung cho cả app Android (native HTTP) và web (fetch, dev).
// ============================================================
let discCache = null;
async function getDisc(force = false) {
  if (!discCache || force) discCache = await up.discovery(base(), authHeaders());
  return discCache;
}
const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

async function signUnsigned(unsigned) {
  const d = await getDisc();
  const r = await http(`${base()}${trimSlash(d.jsonSignRoot)}/camli/sig/sign`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: 'json=' + encodeURIComponent(unsigned)
  });
  const text = (r.text || '').trim();
  if (!r.ok || !text.startsWith('{')) throw new Error(text.slice(0, 140) || `HTTP ${r.status}`);
  return text;
}

async function uploadBlobText(ref, text) {
  const d = await getDisc();
  const boundary = '----pk' + Date.now().toString(36);
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${ref}"; filename="${ref}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n' +
    text +
    `\r\n--${boundary}--\r\n`;
  const r = await http(`${base()}${trimSlash(d.blobRoot)}/camli/upload`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': `multipart/form-data; boundary=${boundary}` }),
    body
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(r.text || '').slice(0, 120)}`);
}

/** Thêm/bỏ 1 tag trên permanode (claimType: add-attribute | del-attribute). */
async function setTag(permaRef, tag, add) {
  const d = await getDisc();
  const unsigned = JSON.stringify({
    attribute: 'tag',
    camliSigner: d.signerPubKey,
    camliType: 'claim',
    camliVersion: 1,
    claimDate: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    claimType: add ? 'add-attribute' : 'del-attribute',
    permaNode: permaRef,
    value: tag
  });
  const signed = await signUnsigned(unsigned);
  const ref = blobRefOf(signed);
  log(`claim ${add ? 'add' : 'del'}-attribute tag=${tag} → ${ref}`);
  await uploadBlobText(ref, signed);
  return ref;
}

async function changeTag(blob, meta, tag, add, msg) {
  const permaRef = meta.isPermanode ? blob : null;
  if (!permaRef) return snack(t('tag_need_permanode'));
  try {
    snack(msg || (add ? t('tag_added')(tag) : t('tag_removed')(tag)));
    await setTag(permaRef, tag, add);
    // index cập nhật async -> chờ chút rồi tải lại
    setTimeout(() => reloadTab(currentTab()), 900);
  } catch (e) {
    snack(t('tag_fail') + ': ' + e.message);
    log(`tag FAIL: ${e.message}`);
  }
}

/** Sheet thêm tag cho 1 file. */
function openTagSheet(blob, meta) {
  if (!meta.isPermanode) return snack(t('tag_need_permanode'));
  openSheet(`<h3>${esc(t('tag_add'))}</h3>
    <p class="meta">${esc(meta.name)}</p>
    ${meta.tags.length ? `<div class="tags">${meta.tags.map((x) => `<span class="tagchip">#${esc(x)}</span>`).join('')}</div>` : ''}
    <input class="adv" id="tag-in" placeholder="${esc(t('tag_ph'))}" autocomplete="off" />
    <button class="rowbtn" id="tag-go">${icon('plus')}<span>${esc(t('tag_btn'))}</span></button>
    <p class="meta">${esc(t('tag_note'))}</p>
    <p class="meta">${esc(t('star_is_tag'))}</p>`);
  const input = sheetBody.querySelector('#tag-in');
  input.focus();
  const submit = async () => {
    const v = input.value.trim().replace(/^#/, '');
    if (!v) return;
    closeSheet();
    await changeTag(blob, meta, v, true);
  };
  sheetBody.querySelector('#tag-go').onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

function fileActions(blob, meta) {
  const idx = currentItems.findIndex((x) => x.blob === blob);
  const rows = [
    { k: 'star', ico: 'star', label: isStarred(meta) ? t('star_removed') : t('star_add') },
    { k: 'tag', ico: 'plus', label: t('tag_add') },
    { k: 'view', ico: 'image', label: t('vw_view') },
    { k: 'external', ico: 'external', label: t('vw_open_ext') },
    { k: 'download', ico: 'download', label: t('fa_download') },
    { k: 'share', ico: 'link', label: t('fa_share') },
    { k: 'detail', ico: 'info', label: t('fa_detail') }
  ];
  openSheet(`<h3>${esc(meta.name)}</h3>
    <p class="meta">${esc([meta.mime, fmtSize(meta.size), fmtDate(meta.date)].filter(Boolean).join(' · '))}</p>
    ${meta.tags.length ? `<div class="tags">${meta.tags.map((x) => `<span class="tagchip">#${esc(x)}<button data-untag="${esc(x)}" title="${esc(t('tag_remove'))}">✕</button></span>`).join('')}</div>` : ''}
    ${rows.map((r) => `<button class="rowbtn" data-k="${r.k}">${icon(r.ico)}<span>${esc(r.label)}</span></button>`).join('')}`);
  sheetBody.querySelectorAll('[data-untag]').forEach((x) => {
    x.onclick = (e) => { e.stopPropagation(); closeSheet(); changeTag(blob, meta, x.dataset.untag, false); };
  });
  sheetBody.querySelectorAll('[data-k]').forEach((b) => {
    b.onclick = async () => {
      const ref = meta.fileRef || blob;
      if (b.dataset.k === 'star') {
        closeSheet();
        const on = !isStarred(meta);
        await changeTag(blob, meta, STAR_TAG, on, t(on ? 'star_on' : 'star_off'));
      } else if (b.dataset.k === 'tag') {
        closeSheet();
        openTagSheet(blob, meta);
      } else if (b.dataset.k === 'view') {
        closeSheet();
        openViewer(idx >= 0 ? idx : 0);
      } else if (b.dataset.k === 'external') {
        window.open(directUrl(ref), '_blank');
        closeSheet();
      } else if (b.dataset.k === 'download') {
        window.open(directUrl(ref), '_blank');
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
  clear.className = 'fchip';
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

// Cỡ chữ: đổi hệ số --fs cho toàn app (mọi cỡ chữ dùng rem)
const FONT_STEPS = [
  { v: 's', k: 'fs_s', scale: 0.9 },
  { v: 'm', k: 'fs_m', scale: 1 },
  { v: 'l', k: 'fs_l', scale: 1.12 },
  { v: 'xl', k: 'fs_xl', scale: 1.25 }
];
const fontStep = () => localStorage.getItem('pk-font-v1') || 'm';
function renderFontState() {
  const st = FONT_STEPS.find((f) => f.v === fontStep()) || FONT_STEPS[1];
  $('set-font-sub').textContent = t(st.k);
}
function applyFontScale() {
  const st = FONT_STEPS.find((f) => f.v === fontStep()) || FONT_STEPS[1];
  document.documentElement.style.setProperty('--fs', String(st.scale));
}
$('set-font').onclick = () => {
  const cur = fontStep();
  openSheet(`<h3>${esc(t('set_font'))}</h3>` + FONT_STEPS.map((f) =>
    `<button class="opt${f.v === cur ? ' on' : ''}" data-v="${f.v}"><span>${esc(t(f.k))}</span>${f.v === cur ? `<span class="tick">${icon('check', 18)}</span>` : ''}</button>`
  ).join(''));
  sheetBody.querySelectorAll('.opt').forEach((b) => {
    b.onclick = () => {
      localStorage.setItem('pk-font-v1', b.dataset.v);
      applyFontScale();
      renderFontState();
      closeSheet();
      snack(t(FONT_STEPS.find((f) => f.v === b.dataset.v).k));
    };
  });
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
  paintViewer();
  applyFontScale();
  renderSvcSub();
  renderVidState();
  renderWifiState();
  renderFilters();
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

applyLang();
paintIcons();
renderSvcSub();
renderFilters();
renderVidState();
renderWifiState();
renderFontState();
refreshUploads();
up.onProgress((job) => {
  uploadJobs.set(job.id, job);
  renderUploads();
  if (job.state === 'done') loadHome();
}).catch(() => {});
if (!localStorage.getItem(LS_ONBOARD)) showOnboard(true);
else boot();
