import { CapacitorHttp } from '@capacitor/core';
import { icon, iconForMime } from './icons.js';
import { blobRefOf } from './sha224.js';
import * as up from './upload.js';
import { jellyfin } from './jellyfin.js';

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
    f_cf_title: 'Cloudflare Access — không bắt buộc (chỉ khi dùng tunnel)',
    f_cf_hint: 'Để TRỐNG nếu bạn dùng Perkeep qua LAN hoặc chỉ cần tài khoản/mật khẩu ở trên. Chỉ điền khi server nằm sau Cloudflare Tunnel + Zero Trust: tạo Service Token trong Cloudflare Zero Trust → Access → Service Auth, rồi thêm rule Service Auth vào policy của ứng dụng. App gửi cả hai kiểu cùng lúc nếu bạn điền cả hai.',
    f_cf_id: 'CF-Access-Client-Id', f_cf_secret: 'CF-Access-Client-Secret',
    auth_basic: 'tài khoản/mật khẩu', auth_cf: 'Cloudflare Access',
    login_how: 'Cách xác thực (chọn 1 hoặc cả 2, đều không bắt buộc):\n• Perkeep userpass → điền Tài khoản / Mật khẩu\n• Cloudflare Access → dán Service Token ở mục bên dưới',
    ob_connect: 'Kết nối →', ob_skip: 'Dùng thử không cần server →',
    ob_bad: 'URL phải bắt đầu http(s)://', ob_fail: 'Không kết nối được. Kiểm tra IP / WiFi / firewall 3179.',
    ob_cf: 'Server đang yêu cầu xác thực Cloudflare Access. Hãy tạo Service Token và dán vào mục Cloudflare Access bên dưới.',
    ob_ok_cf: 'Đã kết nối qua Cloudflare Access',
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
    diag_crash: 'Lỗi crash lần trước', diag_log: 'Log thao tác gần đây',
    diag_clear: 'Xoá log crash', diag_cleared: 'Đã xoá log crash',
    diag_crash_found: 'Có log crash lần trước — mở Cài đặt → Chẩn đoán để xem.',
    diag_crash: 'Lỗi crash lần trước', diag_log: 'Log thao tác gần đây',
    diag_clear: 'Xoá log crash', diag_cleared: 'Đã xoá log crash',
    diag_crash_found: 'Có log crash lần trước — mở Cài đặt → Chẩn đoán để xem.',
    set_about_sub: 'Lưu trữ dữ liệu suốt đời',
    set_vid: 'Thumbnail video', on: 'Bật', off: 'Tắt',
    set_hint: 'Đổi / sửa / xóa dịch vụ: mở mục “Dịch vụ Perkeep”, hoặc chạm avatar trên thanh tìm kiếm.',
    svc_title: 'Dịch vụ Perkeep', svc_add: '+ Thêm dịch vụ', ed_add: 'Thêm dịch vụ', ed_edit: 'Sửa dịch vụ',
    confirm_del: (n) => `Xóa dịch vụ "${n}"?`, keep_one: 'Giữ lại ít nhất 1 dịch vụ.',
    lang_title: 'Ngôn ngữ / Language', diag_title: 'Chẩn đoán',
    about_title: 'Giới thiệu Perkeep',
    about_body: 'Perkeep lưu giữ dữ liệu của bạn suốt đời: mọi thứ được định danh bằng nội dung và không bao giờ bị sửa. Website: perkeep.org',
    empty: 'Không có kết quả.', loading: 'Đang tải…', feed_more: 'Tải thêm', feed_end: 'Đã hết',
    found: (n, s) => `${n} kết quả · ${s}`,
    fa_download: 'Tải về máy', fa_share: 'Sao chép link', fa_open: 'Mở trong Perkeep', fa_detail: 'Chi tiết',
    tag_add: 'Thêm tag', tag_section: 'Tag', tag_ph: 'Nhập tag rồi bấm Thêm', tag_btn: 'Thêm',
    tag_note: 'Tag giúp bạn tìm lại nhanh: đặt “Tìm theo → Tag” rồi gõ tag.',
    tag_added: (v) => `Đã thêm tag “${v}”`, tag_removed: (v) => `Đã bỏ tag “${v}”`,
    tag_fail: 'Không đổi được tag', tag_need_permanode: 'Mục này không phải permanode nên chưa gắn tag được.',
    tag_remove: 'Bỏ tag này',
    vw_view: 'Xem trong app', vw_open_ext: 'Mở bằng ứng dụng khác', vw_unsupported: 'Loại file này không xem được trong app. Bạn mở bằng ứng dụng khác nhé.',
    vw_open_app: 'Mở bằng VLC / ứng dụng khác', vw_downloading: 'Đang tải file để mở bằng ứng dụng khác…', vw_no_app: 'Không mở được, thử tải về máy',
    cache_play: 'Tải về để xem mượt', cache_start: 'Bắt đầu tải về máy…',
    cache_progress: 'Đang tải', cache_done: 'Đã tải xong, phát từ máy', cache_running: 'File này đang tải…',
    cache_fail: 'Tải về thất bại', cache_native: 'Chỉ chạy trong app Android',
    vw_need_auth: 'Server cần đăng nhập nên app không phát trực tiếp được. Mở bằng ứng dụng khác hoặc tải về máy nhé.',
    vw_codec: (c) => `Video dùng codec ${c} — máy này không giải mã được. Mở bằng VLC / MX Player, hoặc xem bản đã chuyển sang H.264.`,
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
    fab_link: 'Thêm link video (YouTube…)',
    link_add: 'Thêm link video', link_url: 'Link video', link_title: 'Tên video',
    link_dur: 'Thời lượng (mm:ss)', link_tags: 'Tag (cách nhau dấu phẩy)',
    link_hint: 'Link + thông tin được lưu thành 1 mục trong Perkeep (file JSON) nên tìm lại được mãi, kể cả khi video bị xoá trên YouTube.',
    link_fetching: 'Đang lấy thông tin video…', link_generic: 'Link ngoài',
    link_need_title: 'Nhập tên video', link_bad: 'Link phải bắt đầu bằng http(s)://',
    link_saving: 'Đang lưu…', link_ok: 'Đã lưu link video', link_fail: 'Không lưu được link',
    link_play: 'Xem', link_open: 'Mở YouTube', link_unreadable: 'Không đọc được dữ liệu link này.',
    up_waiting: 'Chờ mạng…', up_preparing: 'Đang chuẩn bị…', up_uploading: 'Đang tải lên',
    up_signing: 'Đang tạo mục…', up_done: 'Đã tải lên', up_failed: 'Lỗi', up_canceled: 'Đã huỷ',
    up_title: 'Đang tải lên', up_retry: 'Thử lại', up_cancel: 'Huỷ', up_clear: 'Xoá mục xong',
    up_need_native: 'Tải nền chỉ chạy trong app Android. Hãy build APK rồi thử.',
    up_none: 'Chưa có file nào trong hàng đợi.',
    set_wifi: 'Chỉ tải khi dùng Wi-Fi',
    set_jf: 'Jellyfin (phát mượt)',
    jf_off: 'Chưa bật — video lớn vẫn phát trực tiếp',
    jf_on: (b, m) => `${b.replace(/^https?:\/\//, '')} · ${m} Mbps`,
    jf_title: 'Jellyfin — chuyển mã video lớn',
    jf_hint: 'Video 4K/AV1 hoặc bitrate cao sẽ được Jellyfin chuyển sang H.264 ~8 Mbps để phát mượt, tua được, không copy dung lượng. Cần Jellyfin trỏ vào thư mục mount của Perkeep (xem scripts/start-perkeep-jellyfin.ps1).',
    jf_base: 'Địa chỉ Jellyfin', jf_user: 'Tài khoản', jf_pass: 'Mật khẩu',
    jf_connect: 'Kết nối', jf_disconnect: 'Ngắt kết nối',
    jf_ok: 'Đã kết nối Jellyfin', jf_fail: 'Không kết nối được Jellyfin',
    jf_bad_auth: 'Sai tài khoản hoặc mật khẩu Jellyfin',
    jf_bad_url: 'Địa chỉ phải bắt đầu http(s)://',
    jf_quality: 'Chất lượng khi chuyển mã',
    jf_mode: 'Khi nào dùng Jellyfin',
    jf_mode_auto: 'Tự động (video lớn / codec lạ)',
    jf_mode_always: 'Luôn dùng',
    jf_mode_off: 'Tắt',
    jf_play: 'Phát qua Jellyfin',
    jf_no_item: 'Jellyfin chưa thấy video này',
    jf_starting: 'Jellyfin đang chuyển mã…',
    jf_badge: 'Jellyfin',
    perm_title: 'Cho phép thông báo',
    perm_body: 'App cần quyền thông báo để hiện tiến trình khi tải file lên chạy nền (giống Google Drive). Nếu không cấp, upload vẫn chạy nhưng bạn không thấy tiến trình và không huỷ được từ thông báo.',
    perm_allow: 'Cho phép', perm_later: 'Để sau',
    perm_on: 'Đã cấp', perm_off: 'Chưa cấp — chạm để xin lại',
    set_perm: 'Quyền thông báo',
    perm_granted: 'Đã cấp quyền thông báo', perm_denied: 'Chưa được cấp. Bật trong Cài đặt Android → Ứng dụng → pk-app → Thông báo.',
    perm_android_only: 'Chỉ áp dụng trong app Android',
    set_font: 'Cỡ chữ', fs_s: 'Nhỏ', fs_m: 'Vừa (mặc định)', fs_l: 'Lớn', fs_xl: 'Rất lớn',
    set_cache: 'File đã tải để xem mượt', cache_empty: 'Chưa tải file nào về máy',
    cache_clear: 'Xoá hết file đã tải', cache_cleared: 'Đã xoá, giải phóng',
    cache_hint: 'File tải về nằm trong cache của app (Android tự dọn khi cần chỗ). Video xem từ máy sẽ mượt và tua tức thì.',
    copied: 'Đã sao chép link', prompt_title: 'Tìm kiếm',
    ph_q: 'Tên tệp, hoặc tag:x / after:2026-01-01',
    ph_name: 'Tên gợi nhớ (vd: PC nhà)', ph_url: 'http://192.168.123.9:3179', ph_user: 'Tài khoản', ph_pass: 'Mật khẩu',
    no_server: 'Chưa có dịch vụ', search_err: 'Câu tìm kiếm không hợp lệ.', conn_err: 'Lỗi kết nối.'
  },
  en: {
    ob_title: 'Connect Perkeep', ob_sub: 'Enter your server address to start',
    f_name: 'Display name', f_url: 'Server address', f_user: 'Username (if any)', f_pass: 'Password',
    f_cf_title: 'Cloudflare Access — optional (tunnels only)',
    f_cf_hint: 'Leave EMPTY if you reach Perkeep on the LAN or only need username/password above. Fill this only when the server sits behind a Cloudflare Tunnel + Zero Trust: create a Service Token in Cloudflare Zero Trust → Access → Service Auth and add a Service Auth rule to the app policy. If you fill both, the app sends both.',
    f_cf_id: 'CF-Access-Client-Id', f_cf_secret: 'CF-Access-Client-Secret',
    auth_basic: 'username/password', auth_cf: 'Cloudflare Access',
    login_how: 'Authentication (pick one or both — none required):\n• Perkeep userpass → fill Username / Password\n• Cloudflare Access → paste a Service Token below',
    ob_connect: 'Connect →', ob_skip: 'Try without a server →',
    ob_bad: 'URL must start with http(s)://', ob_fail: 'Cannot connect. Check IP / WiFi / firewall 3179.',
    ob_cf: 'This server requires Cloudflare Access. Create a Service Token and paste it under Cloudflare Access below.',
    ob_ok_cf: 'Connected via Cloudflare Access',
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
    diag_crash: 'Last crash', diag_log: 'Recent activity log',
    diag_clear: 'Clear crash log', diag_cleared: 'Crash log cleared',
    diag_crash_found: 'A crash was recorded — open Settings → Diagnostics to see it.',
    diag_crash: 'Last crash', diag_log: 'Recent activity log',
    diag_clear: 'Clear crash log', diag_cleared: 'Crash log cleared',
    diag_crash_found: 'A crash was recorded — open Settings → Diagnostics to see it.',
    set_about_sub: 'Keep your data for life',
    set_vid: 'Video thumbnails', on: 'On', off: 'Off',
    set_hint: 'Switch / edit / delete services: open “Perkeep services”, or tap the avatar in the search bar.',
    svc_title: 'Perkeep services', svc_add: '+ Add service', ed_add: 'Add service', ed_edit: 'Edit service',
    confirm_del: (n) => `Delete service "${n}"?`, keep_one: 'Keep at least 1 service.',
    lang_title: 'Ngôn ngữ / Language', diag_title: 'Diagnostics',
    about_title: 'About Perkeep',
    about_body: 'Perkeep keeps your stuff for life: everything is content-addressed and never modified. Website: perkeep.org',
    empty: 'No results.', loading: 'Loading…', feed_more: 'Load more', feed_end: 'End of list',
    found: (n, s) => `${n} results · ${s}`,
    fa_download: 'Download', fa_share: 'Copy link', fa_open: 'Open in Perkeep', fa_detail: 'Details',
    tag_add: 'Add tag', tag_section: 'Tags', tag_ph: 'Type a tag then Add', tag_btn: 'Add',
    tag_note: 'Tags make search easy: set “Search by → Tag” and type the tag.',
    tag_added: (v) => `Added tag “${v}”`, tag_removed: (v) => `Removed tag “${v}”`,
    tag_fail: 'Could not change tag', tag_need_permanode: 'This item is not a permanode, cannot tag it.',
    tag_remove: 'Remove this tag',
    vw_view: 'View in app', vw_open_ext: 'Open with another app', vw_unsupported: 'This file type cannot be previewed in the app. Open it with another app?',
    vw_open_app: 'Open with VLC / another app', vw_downloading: 'Downloading to open with another app…', vw_no_app: 'Could not open, try downloading',
    cache_play: 'Download for smooth playback', cache_start: 'Downloading to device…',
    cache_progress: 'Downloading', cache_done: 'Downloaded — playing from device', cache_running: 'Already downloading…',
    cache_fail: 'Download failed', cache_native: 'Android app only',
    vw_need_auth: 'The server requires sign-in, so the app cannot stream this. Open with another app or download it.',
    vw_codec: (c) => `This video uses ${c} — this device cannot decode it. Open with VLC / MX Player, or use an H.264 version.`,
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
    fab_link: 'Add video link (YouTube…)',
    link_add: 'Add video link', link_url: 'Video link', link_title: 'Video title',
    link_dur: 'Duration (mm:ss)', link_tags: 'Tags (comma separated)',
    link_hint: 'The link and its metadata are stored as one item in Perkeep (a JSON file), so you can always find it again — even if the video is deleted on YouTube.',
    link_fetching: 'Fetching video info…', link_generic: 'External link',
    link_need_title: 'Enter a video title', link_bad: 'Link must start with http(s)://',
    link_saving: 'Saving…', link_ok: 'Video link saved', link_fail: 'Could not save the link',
    link_play: 'Play', link_open: 'Open YouTube', link_unreadable: 'Could not read this link item.',
    up_waiting: 'Waiting for network…', up_preparing: 'Preparing…', up_uploading: 'Uploading',
    up_signing: 'Creating item…', up_done: 'Uploaded', up_failed: 'Failed', up_canceled: 'Canceled',
    up_title: 'Uploads', up_retry: 'Retry', up_cancel: 'Cancel', up_clear: 'Clear finished',
    up_need_native: 'Background upload runs in the Android app only. Build the APK to try it.',
    up_none: 'Nothing in the queue yet.',
    set_wifi: 'Wi-Fi only',
    set_jf: 'Jellyfin (smooth playback)',
    jf_off: 'Off — large videos play directly',
    jf_on: (b, m) => `${b.replace(/^https?:\/\//, '')} · ${m} Mbps`,
    jf_title: 'Jellyfin — transcode big videos',
    jf_hint: '4K/AV1 or high-bitrate videos get transcoded to H.264 ~8 Mbps: smooth, seekable, and no extra storage. Jellyfin must point at the Perkeep mount (see scripts/start-perkeep-jellyfin.ps1).',
    jf_base: 'Jellyfin address', jf_user: 'Username', jf_pass: 'Password',
    jf_connect: 'Connect', jf_disconnect: 'Disconnect',
    jf_ok: 'Jellyfin connected', jf_fail: 'Could not reach Jellyfin',
    jf_bad_auth: 'Wrong Jellyfin username or password',
    jf_bad_url: 'Address must start with http(s)://',
    jf_quality: 'Transcode quality',
    jf_mode: 'When to use Jellyfin',
    jf_mode_auto: 'Auto (big videos / odd codecs)',
    jf_mode_always: 'Always',
    jf_mode_off: 'Off',
    jf_play: 'Play via Jellyfin',
    jf_no_item: 'Jellyfin has not indexed this video',
    jf_starting: 'Jellyfin is transcoding…',
    jf_badge: 'Jellyfin',
    perm_title: 'Allow notifications',
    perm_body: 'The app needs notification permission to show background upload progress (like Google Drive). Without it, uploads still run but you cannot see progress or cancel from the notification.',
    perm_allow: 'Allow', perm_later: 'Later',
    perm_on: 'Granted', perm_off: 'Not granted — tap to ask again',
    set_perm: 'Notification permission',
    perm_granted: 'Notification permission granted', perm_denied: 'Not granted. Enable it in Android Settings → Apps → pk-app → Notifications.',
    perm_android_only: 'Android app only',
    set_font: 'Text size', fs_s: 'Small', fs_m: 'Default', fs_l: 'Large', fs_xl: 'Extra large',
    set_cache: 'Downloaded for smooth playback', cache_empty: 'Nothing downloaded yet',
    cache_clear: 'Delete all downloaded files', cache_cleared: 'Deleted, freed',
    cache_hint: 'Downloaded files live in the app cache (Android clears it when space is needed). Playing from the device is smooth and seeks instantly.',
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
  renderJfState();
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
  const h = { ...extra };
  if (a?.user) h.Authorization = 'Basic ' + btoa(`${a.user}:${a.pass || ''}`);
  // Cloudflare Access Service Token (khi Perkeep nằm sau Cloudflare Tunnel + Zero Trust)
  if (a?.cfId) {
    h['CF-Access-Client-Id'] = a.cfId;
    h['CF-Access-Client-Secret'] = a.cfSecret || '';
  }
  return h;
}

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join('\n');
  const prev = outEl.textContent ? outEl.textContent.split('\n') : [];
  prev.push(line);
  outEl.textContent = prev.slice(-200).join('\n');
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
  video: '(filename:*.mp4 or filename:*.mov or filename:*.mkv or filename:*.webm or filename:*.avi or tag:video-link)',
  audio: '(filename:*.mp3 or filename:*.m4a or filename:*.wav or filename:*.flac or filename:*.ogg)',
  doc: '(filename:*.pdf or filename:*.doc or filename:*.docx or filename:*.xls or filename:*.xlsx or filename:*.ppt or filename:*.pptx or filename:*.txt)'
};

// Video link (YouTube...) = 1 permanode + 1 blob JSON, tag "video-link".
// Tên file: "<Tiêu đề> [YouTube].json" -> tìm theo tên là ra, giữ được mãi.
const LINK_TAG = 'video-link';
const LINK_RE = /\[(youtube|video|vimeo|bilibili|dailymotion|tiktok)\][^/]*\.json$/i;
const isVideoLink = (meta) => !!(meta && ((meta.tags || []).includes(LINK_TAG) || LINK_RE.test(meta.name || '')));
// Tên hiển thị gọn: bỏ đuôi " [YouTube].json" (tên file vẫn giữ nguyên trên Perkeep để search)
const displayName = (meta) => (isVideoLink(meta)
  ? String(meta.name || '').replace(/\s*\[[^\]]+\][^/]*\.json$/i, '')
  : meta.name);

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

async function query(expression, limit = 50, sort = '', cont = '') {
  const b = base();
  if (!b) throw new Error('no server');
  const body = { expression, limit, describe: DESCRIBE };
  if (sort) body.sort = sort;
  // Token "continue" của Perkeep: lấy trang kế tiếp của cùng query/limit/sort
  if (cont) body.continue = cont;
  log(`POST ${b}/my-search/camli/search/query`, body);
  const r = await http(b + '/my-search/camli/search/query', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  const j = JSON.parse(r.text);
  if (j.error) throw new Error(j.error.split('\n')[0]);
  const blobs = (j.blobs || []).map((x) => x.blob).filter(Boolean);
  return { blobs, description: j.description, continue: j.continue || '' };
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
  if (isVideoLink(meta)) {
    loadLink(meta).then((d) => {
      if (!d) return;
      if (d.thumbnail) {
        const img = document.createElement('img');
        img.alt = ''; img.loading = 'lazy';
        img.onerror = () => img.remove();
        img.src = d.thumbnail;
        slot.textContent = '';
        slot.appendChild(img);
      }
      const line = [siteLabel(d.site), d.author, fmtDur(d.duration)].filter(Boolean).join(' · ');
      const row = slot.closest('.frow, .vcard');
      const sub = row && row.querySelector('.fx small, .vmeta');
      if (sub && line) sub.textContent = line;
    });
    return;
  }
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
    <div class="fic">${isVideoLink(meta) ? icon('video') : iconFor(meta.mime)}</div>
    <div class="fx"><b>${esc(displayName(meta))}</b><small>${esc(metaLine(meta))}</small></div>
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
    <span class="vthumb">${isVideoLink(meta) ? icon('video', 34) : icon(iconForMime(meta.mime), 34)}</span>
    <span class="vname">${isStarred(meta) ? '★ ' : ''}${esc(displayName(meta))}</span>
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

// ============================================================
// Infinite scroll: nạp theo trang bằng token "continue" của Perkeep.
// Chỉ dựng DOM cho mục đã cuộn tới (mục ngoài màn hình bị trình duyệt
// bỏ qua layout/paint nhờ content-visibility) -> tiết kiệm RAM/CPU/dữ liệu.
// ============================================================
const PAGE_SIZE = 30;          // số mục mỗi trang
const MAX_PAGES_PER_TICK = 6;  // gom tối đa bấy nhiêu trang/lần cuộn khi lọc ở máy ra 0 mục

const feeds = new Map(); // target -> feed

function feedFor(target, expression, render, emptyMsg) {
  const cur = feeds.get(target);
  if (cur && cur.expression === expression && cur.render === render) return cur;
  if (cur?.io) cur.io.disconnect();
  const feed = { target, expression, render, emptyMsg, sort: '', cont: '', done: false, loading: false, gen: 0, items: [], rendered: 0, foot: null, io: null, err: '', visible: false };
  feeds.set(target, feed);
  return feed;
}

/** Lọc ở máy 1 trang kết quả (giữ nguyên quy tắc cũ: từ khoá theo tên, thời gian). */
function pageItems(blobs, description) {
  let items = blobs.map((b) => ({ blob: b, meta: metaFor(b, description) }));
  if (filters.by === 'name' && filters.keyword.trim()) {
    const needle = norm(filters.keyword);
    items = items.filter((it) => norm(it.meta.name || '').includes(needle));
  }
  if (filters.time !== 'any') {
    const from = timeFrom(filters.time);
    if (from) items = items.filter((it) => (it.meta.date || '').slice(0, 10) >= from);
  }
  if (filters.sort === 'name' && filters.time !== 'any') {
    items.sort((a, b) => (a.meta.name || '').localeCompare(b.meta.name || '', lang === 'vi' ? 'vi' : 'en'));
  }
  return items;
}

/** Chân danh sách: vừa là "sentinel" cho observer, vừa hiện trạng thái tải/hết. */
function feedFoot(feed, state) {
  if (!feed.foot || !feed.foot.isConnected) {
    feed.foot = document.createElement('div');
    feed.foot.className = 'feed-foot';
    feed.target.appendChild(feed.foot);
  }
  feed.foot.innerHTML = '';
  if (state === 'loading') {
    feed.foot.innerHTML = `<span class="feed-spin"></span><span>${esc(t('loading'))}</span>`;
  } else if (state === 'end') {
    feed.foot.innerHTML = `<span>${esc(t('feed_end'))}</span>`;
  } else if (state === 'more') {
    const btn = document.createElement('button');
    btn.className = 'feed-more';
    btn.textContent = t('feed_more');
    btn.onclick = () => feedLoad(feed);
    feed.foot.appendChild(btn);
  }
  return feed.foot;
}

function feedObserve(feed) {
  // Không có IntersectionObserver (WebView cũ): để nút "Tải thêm" cho người dùng bấm.
  if (!('IntersectionObserver' in window)) { feedFoot(feed, 'more'); return; }
  if (feed.io) return;
  feed.io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.target === feed.foot) feed.visible = !!e.isIntersecting;
    // Sentinel lọt vào tầm nhìn -> nạp trang kế. Nhờ vậy cuộn tới đâu nạp tới đó.
    if (feed.visible) feedLoad(feed);
  }, { root: null, rootMargin: '600px 0px' });
  feed.io.observe(feed.foot);
}

async function feedLoad(feed) {
  if (feed.loading || feed.done) return;
  const gen = feed.gen;
  feed.loading = true;
  feed.err = '';
  feedFoot(feed, 'loading');
  let appended = 0;
  try {
    for (let pages = 0; pages < MAX_PAGES_PER_TICK; pages++) {
      const { blobs, description, continue: cont } = await query(feed.expression, PAGE_SIZE, feed.sort, feed.cont);
      if (gen !== feed.gen) return; // bộ lọc/tab đã đổi -> bỏ kết quả cũ
      feed.cont = cont;
      feed.done = !cont;
      for (const it of pageItems(blobs, description)) {
        feed.items.push(it);
        // Trình xem cần danh sách của tab đang xem để chuyển qua lại
        if (els().includes(feed.target)) currentItems.push(it);
        feed.target.insertBefore(feed.render(it.blob, it.meta, feed.items.length - 1), feed.foot);
        feed.rendered++; appended++;
      }
      if (appended > 0 || feed.done || !blobs.length) break;
    }
  } catch (e) {
    if (gen !== feed.gen) return;
    feed.done = true;
    feed.err = String(e.message).includes('expression') ? t('search_err') : t('conn_err');
    log(`FAIL: ${e.message}`);
  } finally {
    if (gen === feed.gen) {
      feed.loading = false;
      if (feed.rendered === 0) {
        showEmpty(feed.target, feed.err || feed.emptyMsg);
      } else if (feed.done) {
        feedFoot(feed, 'end');
      } else if (!feed.io || appended === 0) {
        // Không có observer, hoặc trang vừa rồi bị lọc hết -> để nút bấm,
        // tránh tự nạp liên tục khi bộ lọc không khớp mục nào.
        feedFoot(feed, 'more');
      } else {
        feedFoot(feed, '');
        // Sentinel vẫn trong tầm nhìn (màn hình cao/chưa đầy) -> nạp tiếp cho đầy.
        if (feed.visible) feedLoad(feed);
      }
      log(`feed: +${appended} mục (tổng ${feed.items.length}${feed.done ? ' · hết' : ' · còn'}) · "${feed.expression || '(trống)'}"`);
    }
  }
}

/** Nạp lại danh sách từ đầu (reset feed) — gọi khi đổi tab/bộ lọc/kéo tải lại. */
async function fillList(target, expression, render, emptyMsg) {
  const feed = feedFor(target, expression, render, emptyMsg);
  feed.sort = serverSort();
  feed.gen++;
  feed.cont = '';
  feed.done = false;
  feed.loading = false;
  feed.items = [];
  feed.rendered = 0;
  feed.foot = null;
  feed.err = '';
  feed.visible = false;
  if (feed.io) { feed.io.disconnect(); feed.io = null; }
  if (els().includes(target)) currentItems = [];
  setContainerMode(target, filters.view === 'grid');
  target.innerHTML = '';
  target.classList.remove('is-empty');
  feedFoot(feed, 'loading');
  feedObserve(feed);
  await feedLoad(feed);
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
    seg.hidden = currentTab() === 't-set';
  }
  updateTabTitle();
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

// ============================================================
// Dò codec video bằng header MP4 (không cần ffprobe):
//  - 32 byte đầu là box "ftyp": brand chính ở 8..12, các brand phụ ở 16..32
//    (vd "....ftypisom....isomav01iso2mp41" -> có "av01")
//  - gửi kèm header Range nên chỉ tải 32 byte
// ============================================================
const brandCache = new Map();
const CODEC_LABEL = {
  av01: 'AV1', hvc1: 'HEVC (H.265)', hev1: 'HEVC (H.265)', dvh1: 'Dolby Vision',
  dvhe: 'Dolby Vision', vp09: 'VP9', avc1: 'H.264', avc3: 'H.264'
};
// Codec mà WebView Android thường không giải mã được (tuỳ chip)
const CODEC_RISKY = ['av01', 'hvc1', 'hev1', 'dvhe', 'dvh1'];
async function sniffMp4Codec(ref) {
  if (!ref) return null;
  if (brandCache.has(ref)) return brandCache.get(ref);
  let codec = null;
  try {
    const r = await httpBytes(directUrl(ref), authHeaders({ Range: 'bytes=0-31' }));
    if (r.ok && r.bytes?.length >= 12) {
      const head = new TextDecoder('latin1').decode(r.bytes);
      for (const tag of ['av01', 'hvc1', 'hev1', 'dvhe', 'dvh1', 'vp09', 'avc1', 'avc3']) {
        if (head.includes(tag)) { codec = tag; break; }
      }
    }
  } catch {}
  brandCache.set(ref, codec);
  return codec;
}
const codecLabel = (codec) => (codec ? CODEC_LABEL[codec] || codec : '');

// Khi server THẬT SỰ chặn truy cập ẩn danh thì <video> không gửi được header xác thực,
// phải phát qua proxy nội bộ hoặc tải hẳn về rồi phát từ blob (chỉ file vừa phải).
const BLOB_PLAY_LIMIT = 150 * 1024 * 1024;
// Cloudflare Access: OkHttp tự đi theo redirect nên nhận về HTML trang đăng nhập.
// Regex phải CHẶT: chỉ dùng dấu hiệu đặc trưng của Cloudflare, KHÔNG dùng cụm
// "Cloudflare Access" vì cụm đó có trong i18n của chính app -> báo nhầm.
const CF_RE = /cloudflareaccess\.com|cf-access-jwt|cf_chl_|__cf_bm|cf-mitigated/i;
let authProbe = { base: null, needed: false };

/** Gọi endpoint discovery của Perkeep để biết server có cho truy cập ẩn danh không.
 *  - Trả JSON có blobRoot  -> Perkeep trả lời bình thường (không cần xác thực)
 *  - 401/403, HTML, trang Cloudflare... -> cần xác thực  */
async function probeServer(url, headers = {}) {
  const b = String(url || '').replace(/\/+$/, '');
  try {
    const r = await http(b + '/?camli.mode=config', { headers });
    let j = null;
    try { j = JSON.parse(r.text); } catch {}
    const ok = !!(r.ok && j && j.blobRoot);
    return { ok, cf: !ok && CF_RE.test(r.text || ''), status: r.status, json: j };
  } catch (e) {
    return { ok: false, cf: false, status: 0, error: e.message };
  }
}

async function serverNeedsAuth() {
  const b = base();
  if (authProbe.base === b) return authProbe.needed;
  const p = await probeServer(b); // KHÔNG gửi thông tin đăng nhập
  authProbe = { base: b, needed: !p.ok };
  return authProbe.needed;
}

/** URL xem được:
 *  - đã tải về máy (cache) -> phát từ file local, mượt + tua tức thì
 *  - server không đòi đăng nhập: phát trực tiếp (Range, tua được, mọi kích thước)
 *  - server đòi đăng nhập: qua proxy nội bộ của app (proxy thêm auth rồi stream)
 *  - nếu proxy không có (chạy web): ảnh dùng endpoint thumbnail, còn lại chịu
 */
async function mediaUrl(meta, big = false) {
  if (!meta.fileRef) return null;
  const cached = cacheUrls.get(meta.fileRef);
  if (cached) return cached;
  if (!(await serverNeedsAuth())) return directUrl(meta.fileRef);
  const proxied = await up.mediaProxyUrl(active(), meta.fileRef);
  if (proxied) return proxied;
  if (isImage(meta.mime)) return await thumbObjectUrl(meta.fileRef, big ? 1600 : 400);
  return null;
}

// ============================================================
// Tải về máy để xem mượt (video điện thoại thường 1080p60 ~28Mbps, xem trực tiếp
// qua Wi-Fi yếu hoặc qua tunnel sẽ giật; tải về rồi phát từ máy thì mượt)
// ============================================================
const cacheUrls = new Map(); // fileRef -> url phát từ cache
const cacheJobs = new Map();
let cacheListenersOn = false;

function setupCacheProgress() {
  if (cacheListenersOn) return;
  cacheListenersOn = true;
  up.onCacheProgress((p) => {
    const j = cacheJobs.get(p.fileRef);
    if (!j) return;
    j.got = p.got;
    j.total = p.total || j.total || 0;
    const pct = j.total ? Math.round((j.got / j.total) * 100) : 0;
    snack(`${t('cache_progress')} ${pct}% · ${fmtSize(j.got)}${j.total ? ' / ' + fmtSize(j.total) : ''}`);
    log(`cache ${p.fileRef.slice(0, 20)}… ${pct}% ${fmtSize(j.got)}/${fmtSize(j.total)}`);
  }).catch(() => {});
}

async function cacheAndPlay(meta, index) {
  if (!up.uploadSupported()) return snack(t('cache_native'));
  if (!meta?.fileRef) return;
  if (cacheUrls.has(meta.fileRef)) {
    if (index >= 0) return openViewer(index);
    return;
  }
  if (cacheJobs.has(meta.fileRef)) return snack(t('cache_running'));
  setupCacheProgress();
  cacheJobs.set(meta.fileRef, { got: 0, total: meta.size || 0 });
  snack(t('cache_start'));
  try {
    const r = await up.cacheMedia(active(), meta);
    cacheJobs.delete(meta.fileRef);
    if (!r?.url) throw new Error(t('cache_fail'));
    cacheUrls.set(meta.fileRef, r.url);
    snack(t('cache_done'));
    log(`cache xong: ${r.name} ${fmtSize(r.size)}`);
    if (index >= 0) openViewer(index);
    else if (!viewerEl.hidden) renderViewer();
  } catch (e) {
    cacheJobs.delete(meta.fileRef);
    snack(`${t('cache_fail')}: ${e.message}`);
    log(`cache FAIL: ${e.message}`);
  }
}

function viewerFallback(meta, why, codec) {
  const hint =
    why === 'codec' ? t('vw_codec')(codec || '?')
    : why === 'auth' ? t('vw_need_auth')
    : t('vw_unsupported');
  const canJf = jellyfin.enabled() && /^video\//i.test(meta.mime || '') && jfMode() !== 'off';
  vwBody.innerHTML = `<div class="vw-note">${esc(hint)}
    <div class="vw-actions">
      ${canJf ? `<button id="vw-jf">${icon('video')}<span>${esc(t('jf_play'))}</span></button>` : ''}
      <button id="vw-cache">${icon('download')}<span>${esc(t('cache_play'))}</span></button>
      <button id="vw-open-ext">${icon('external')}<span>${esc(t('vw_open_app'))}</span></button>
      <button class="alt" id="vw-download">${icon('link')}<span>${esc(t('fa_download'))}</span></button>
    </div></div>`;
  if (canJf) {
    vwBody.querySelector('#vw-jf').onclick = () => {
      jfFailed.delete(meta.fileRef);
      forceJf = true;
      renderViewer();
    };
  }
  vwBody.querySelector('#vw-cache').onclick = () => cacheAndPlay(meta, -1);
  vwBody.querySelector('#vw-open-ext').onclick = () => openWithOtherApp(meta);
  vwBody.querySelector('#vw-download').onclick = () => window.open(directUrl(meta.fileRef), '_blank');
}

/** Mở file bằng VLC/MX Player (tải về cache rồi chia sẻ), không thì mở trình duyệt. */
async function openWithOtherApp(meta) {
  if (up.uploadSupported()) {
    snack(t('vw_downloading'));
    const ok = await up.openExternally(active(), meta);
    if (ok) return;
    snack(t('vw_no_app'));
  }
  window.open(directUrl(meta.fileRef), '_blank');
}

// ---------- Jellyfin: phát qua transcode (HLS) ----------
// Video >200MB hoặc codec máy không giải mã được (AV1/HEVC/Dolby) -> đưa qua Jellyfin.
const JF_AUTO_SIZE = 200 * 1024 * 1024;
const jfFailed = new Set();   // fileRef đã thử Jellyfin và thất bại -> đừng thử lại
let jfHls = null;
let forceJf = false;

function stopJfPlayback() {
  if (jfHls) { try { jfHls.destroy(); } catch {} jfHls = null; }
  try { jellyfin.stop(); } catch {}
}

async function wantJellyfin(meta) {
  if (!jellyfin.enabled()) return false;
  if (!/^video\//i.test(meta.mime || '')) return false;
  if (jfFailed.has(meta.fileRef)) return false;
  const mode = jfMode();
  if (mode === 'off' && !forceJf) return false;
  if (mode === 'always' || forceJf) return true;
  const codec = await sniffMp4Codec(meta.fileRef);
  if (codec && CODEC_RISKY.includes(codec)) return true;
  return (meta.size || 0) > JF_AUTO_SIZE;
}

/** Gắn HLS Jellyfin vào <video>. false = không dùng được, quay lại phát trực tiếp. */
async function playJellyfin(el, meta) {
  const item = await jellyfin.findItem(meta.name);
  if (!item) { log('jellyfin: chưa thấy item cho ' + meta.name); return false; }

  const ps = 'pk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const url = jellyfin.hlsUrl(item.id, jfMbps(), ps);

  let Hls = null;
  try {
    const mod = await import('hls.js/dist/hls.light.min.js');
    Hls = mod.default || mod.Hls;
  } catch (e) { log('jellyfin: không nạp được hls.js'); return false; }

  if (!Hls || !Hls.isSupported()) {
    if (el.canPlayType('application/vnd.apple.mpegurl')) { el.src = url; return true; }
    return false;
  }

  const ok = await new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(tm); resolve(v); };
    const tm = setTimeout(() => {
      log('jellyfin: quá 15s chưa có manifest');
      try { jfHls && jfHls.destroy(); } catch {}
      jfHls = null;
      finish(false);
    }, 15000);
    try {
      jfHls = new Hls({ maxBufferLength: 30 });
      jfHls.on(Hls.Events.MANIFEST_PARSED, () => finish(true));
      jfHls.on(Hls.Events.ERROR, (ev, data) => {
        if (!data || !data.fatal) return;
        log(`jellyfin HLS lỗi: ${data.type}/${data.details}`);
        try { jfHls && jfHls.destroy(); } catch {}
        jfHls = null;
        finish(false);
      });
      jfHls.loadSource(url);
      jfHls.attachMedia(el);
    } catch (e) {
      log('jellyfin HLS: ' + e.message);
      finish(false);
    }
  });

  if (!ok) return false;

  jellyfin.start(item.id, ps);
  el.addEventListener('timeupdate', () => jellyfin.pos(el.currentTime, el.paused));
  el.addEventListener('pause', () => jellyfin.pos(el.currentTime, true));
  el.addEventListener('play', () => jellyfin.pos(el.currentTime, false));
  log(`jellyfin: phát ${item.name} · ${jfMbps()} Mbps`);
  return true;
}

/** Viewer cho mục video-link: thumbnail + nhúng iframe + mở YouTube. */
async function renderLinkViewer(meta) {
  const d = await loadLink(meta);
  if (!d) {
    vwBody.innerHTML = `<div class="vw-note">${esc(t('link_unreadable'))}</div>`;
    return;
  }
  const { id } = linkIdOf(d.url);
  const embed = d.site === 'youtube' && id
    ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`
    : '';
  const dur = fmtDur(d.duration);
  vwBody.innerHTML = `<div class="lk">
    <div class="lk-top" id="lk-top">
      ${d.thumbnail ? `<img src="${esc(d.thumbnail)}" alt="" />` : ''}
      <button class="lk-play" id="lk-play">${icon('video', 34)}<span>${esc(t('link_play'))}</span></button>
    </div>
    <div class="lk-info">
      <b>${esc(d.title || meta.name)}</b>
      <small>${esc([siteLabel(d.site), d.author, dur].filter(Boolean).join(' · '))}</small>
    </div>
    <div class="vw-actions">
      <button id="lk-open">${icon('external')}<span>${esc(t('link_open'))}</span></button>
      <button class="alt" id="lk-copy">${icon('link')}<span>${esc(t('fa_share'))}</span></button>
    </div>
  </div>`;

  const openBtn = vwBody.querySelector('#lk-open');
  if (openBtn) openBtn.onclick = () => window.open(d.url, '_blank');
  const copyBtn = vwBody.querySelector('#lk-copy');
  if (copyBtn) copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(d.url); snack(t('copied')); }
    catch { snack(d.url); }
  };
  const play = vwBody.querySelector('#lk-play');
  if (play) play.onclick = () => {
    if (!embed) return window.open(d.url, '_blank');
    const top = vwBody.querySelector('#lk-top');
    top.classList.add('emb');
    top.innerHTML = `<iframe src="${esc(embed)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen frameborder="0"></iframe>`;
  };
}

async function renderViewer() {
  const it = currentItems[viewIndex];
  if (!it) return closeViewer();
  stopJfPlayback();
  const meta = it.meta;
  vwName.textContent = displayName(meta);
  vwSub.textContent = [meta.mime, fmtSize(meta.size), fmtDate(meta.date)].filter(Boolean).join(' · ');
  vwCount.textContent = `${viewIndex + 1}/${currentItems.length}`;
  vwBody.innerHTML = `<p class="vw-note">${esc(t('loading'))}</p>`;
  const mime = meta.mime || '';

  if (isVideoLink(meta)) {
    await renderLinkViewer(meta);
    return;
  }

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
    const tag = /^video\//i.test(mime) ? 'video' : 'audio';
    const el = document.createElement(tag);
    el.controls = true;
    el.autoplay = true;
    if (tag === 'video') {
      el.playsInline = true;
      el.setAttribute('playsinline', '');
    }

    // 1) Video lớn / codec lạ -> để Jellyfin chuyển mã H.264 (mượt + tua được)
    let usingJf = false;
    if (tag === 'video' && (await wantJellyfin(meta))) {
      vwBody.innerHTML = `<p class="vw-note">${esc(t('jf_starting'))}</p>`;
      try { usingJf = await playJellyfin(el, meta); } catch (e) { log(`jellyfin FAIL: ${e.message}`); }
      if (viewIndex !== currentItems.indexOf(it)) { stopJfPlayback(); return; }
      if (!usingJf) jfFailed.add(meta.fileRef);
    }

    // 2) Không dùng Jellyfin (hoặc lỗi) -> phát trực tiếp như trước
    if (!usingJf) {
      stopJfPlayback();
      let src = null;
      try { src = await mediaUrl(meta); } catch (e) { log(`media FAIL: ${e.message}`); }
      if (!src) { forceJf = false; return viewerFallback(meta, 'unsupported'); }
      if (viewIndex !== currentItems.indexOf(it)) return;
      el.onerror = async () => {
      const code = el.error?.code;
      // 1) Server đòi đăng nhập -> thẻ media không gửi được header.
      //    Thử tải hẳn file rồi phát từ blob (chỉ với file vừa phải).
      if (await serverNeedsAuth()) {
        if (meta.size && meta.size <= BLOB_PLAY_LIMIT) {
          try {
            const r = await httpBytes(directUrl(meta.fileRef), authHeaders());
            if (r.ok && r.bytes?.length) {
              el.onerror = null;
              el.src = URL.createObjectURL(new Blob([r.bytes], { type: mime }));
              el.load();
              log(`media: đã tải ${(r.bytes.length / 1048576).toFixed(1)}MB và phát từ blob`);
              return;
            }
          } catch (e) { log(`media blob FAIL: ${e.message}`); }
        } else {
          log(`media: cần đăng nhập và file ${fmtSize(meta.size)} quá lớn để tải hẳn về`);
        }
        return viewerFallback(meta, 'auth');
      }
      // 2) Không cần đăng nhập -> nhiều khả năng do codec máy không giải mã được.
      //    Dò codec bằng 32 byte đầu của file (không cần ffprobe).
      const codec = code === 4 ? await sniffMp4Codec(meta.fileRef) : null;
      const risky = codec && CODEC_RISKY.includes(codec);
      log(`media error: code=${code ?? '?'} codec=${codec || '(không rõ)'}`);
      viewerFallback(meta, risky ? 'codec' : 'unsupported', risky ? codecLabel(codec) : '');
      };
      el.src = src;
    }

    forceJf = false;
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
  stopJfPlayback();
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
// Kéo xuống để tải lại — mô phỏng Google Chrome:
//  - nội dung trôi xuống có kháng lực (pull 2px thì nội dung đi 1px)
//  - vòng cung lớn dần theo tay kéo, quay nhẹ
//  - nhả tay: qua ngưỡng thì vòng xoay tròn + nội dung giữ nguyên cho tới khi xong
//  - chưa qua ngưỡng thì bật về, vòng thu nhỏ
// ============================================================
const ptrEl = $('ptr');
const ptrArc = $('ptr-arc');
const contentEl = $('content');
const ARC_C = 2 * Math.PI * 16; // chu vi vòng r=16
const PTR_THRESHOLD = 64;       // ngưỡng theo độ trôi của nội dung
const PTR_MAX = 96;

function setArc(fraction) {
  const len = ARC_C * Math.min(1, Math.max(0.02, fraction));
  ptrArc.style.strokeDasharray = `${len} ${ARC_C}`;
}
function ptrReset(animate) {
  contentEl.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
  ptrEl.style.transition = animate ? 'opacity .2s, transform .28s' : 'none';
  contentEl.style.transform = 'translateY(0)';
  ptrEl.style.opacity = '0';
  ptrEl.style.transform = 'scale(.6)';
  ptrEl.classList.remove('refreshing');
}

function setupPullToRefresh(el, onRefresh) {
  let startY = 0;
  let offset = 0;
  let armed = false;
  let busy = false;

  el.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1) { armed = false; return; }
    armed = el.scrollTop <= 0;
    startY = e.touches[0].clientY;
    offset = 0;
    if (armed) ptrReset(false);
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!armed || busy) return;
    const raw = e.touches[0].clientY - startY;
    if (raw <= 0) { // kéo lên -> trả về bình thường
      offset = 0;
      contentEl.style.transform = 'translateY(0)';
      ptrEl.style.opacity = '0';
      ptrEl.style.transform = 'scale(.6)';
      return;
    }
    if (el.scrollTop > 0) { armed = false; return; }
    // kháng lực: càng kéo xa càng nặng tay
    offset = Math.min(PTR_MAX, raw * (raw > PTR_THRESHOLD * 2 ? 0.3 : 0.5));
    const p = Math.min(1, offset / PTR_THRESHOLD);
    contentEl.style.transition = 'none';
    contentEl.style.transform = `translateY(${offset.toFixed(1)}px)`;
    ptrEl.style.transition = 'none';
    ptrEl.style.opacity = String(0.25 + 0.75 * p);
    ptrEl.style.transform = `scale(${(0.6 + 0.4 * p).toFixed(2)}) rotate(${(p * 100).toFixed(0)}deg)`;
    setArc(0.08 + 0.92 * p);
  }, { passive: true });

  const end = async () => {
    if (!armed) return;
    const shouldRefresh = offset >= PTR_THRESHOLD;
    armed = false;
    if (!shouldRefresh) {
      ptrReset(true);
      return;
    }
    // đang tải: giữ nguyên độ trôi + vòng xoay
    busy = true;
    contentEl.style.transition = 'transform .2s ease-out';
    ptrEl.style.transition = 'opacity .15s, transform .15s';
    contentEl.style.transform = `translateY(${PTR_THRESHOLD}px)`;
    ptrEl.style.opacity = '1';
    ptrEl.style.transform = 'scale(1) rotate(0deg)';
    setArc(0.28);
    ptrEl.classList.add('refreshing');
    try {
      await onRefresh();
    } catch {}
    ptrEl.classList.remove('refreshing');
    ptrReset(true);
    busy = false;
  };
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', end, { passive: true });
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
  $('viewseg').hidden = tab === 't-set'; // tab Cài đặt không cần đổi kiểu xem
  updateTabTitle();
  renderFilters();
}

const TAB_TITLES = { 't-home': 'home_title', 't-star': 'star_title', 't-files': 'files_title', 't-set': 'set_title' };
function updateTabTitle() {
  $('tab-title').textContent = t(TAB_TITLES[currentTab()] || 'home_title');
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
// Xin quyền trước khi vào app (thông báo cho upload nền)
// ============================================================
function renderPermState() {
  const sub = $('set-perm-sub');
  if (!sub) return;
  if (!up.uploadSupported()) {
    sub.textContent = t('perm_android_only');
    return;
  }
  up.notificationPermission().then((st) => {
    sub.textContent = t(st === 'granted' ? 'perm_on' : 'perm_off');
  }).catch(() => {});
}

/** Hỏi quyền; trả về khi người dùng đã chọn (hoặc đã có quyền). */
function askNotificationPermission(force = false) {
  return new Promise((resolve) => {
    if (!up.uploadSupported()) return resolve(false);
    up.notificationPermission().then((state) => {
      if (state === 'granted') return resolve(true);
      const asked = localStorage.getItem('pk-notif-asked-v1') === '1';
      if (!force && asked) return resolve(false);
      openSheet(`<h3>${esc(t('perm_title'))}</h3>
        <p class="meta">${esc(t('perm_body'))}</p>
        <button class="rowbtn" id="perm-yes">${icon('check')}<span>${esc(t('perm_allow'))}</span></button>
        <button class="rowbtn" id="perm-no">${icon('close')}<span>${esc(t('perm_later'))}</span></button>`);
      sheetBody.querySelector('#perm-no').onclick = () => {
        localStorage.setItem('pk-notif-asked-v1', '1');
        closeSheet();
        resolve(false);
      };
      sheetBody.querySelector('#perm-yes').onclick = async () => {
        localStorage.setItem('pk-notif-asked-v1', '1');
        closeSheet();
        const ok = await up.ensureNotificationPermission();
        renderPermState();
        snack(t(ok ? 'perm_granted' : 'perm_denied'));
        resolve(ok);
      };
    }).catch(() => resolve(false));
  });
}

$('set-perm').onclick = () => askNotificationPermission(true).then(renderPermState);

// Dung lượng đã tải về máy (cache media) + nút xoá
async function renderCacheState() {
  const sub = $('set-cache-sub');
  if (!sub) return;
  const info = await up.mediaCacheInfo();
  sub.textContent = info.files ? `${info.files} file · ${fmtSize(info.bytes)}` : t('cache_empty');
}
$('set-cache').onclick = async () => {
  const info = await up.mediaCacheInfo();
  openSheet(`<h3>${esc(t('set_cache'))}</h3>
    <p class="meta">${esc(info.files ? `${info.files} file · ${fmtSize(info.bytes)}` : t('cache_empty'))}</p>
    <button class="rowbtn" id="cache-clear">${icon('trash')}<span>${esc(t('cache_clear'))}</span></button>
    <p class="meta">${esc(t('cache_hint'))}</p>`);
  const btn = sheetBody.querySelector('#cache-clear');
  btn.onclick = async () => {
    const freed = await up.clearMediaCache();
    cacheUrls.clear();
    snack(`${t('cache_cleared')} ${fmtSize(freed.bytes)}`);
    closeSheet();
    renderCacheState();
  };
};

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

async function uploadBlobText(ref, text, fileName) {
  const d = await getDisc();
  const boundary = '----pk' + Date.now().toString(36);
  const safeName = String(fileName || ref).replace(/["\r\n]/g, '_');
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${ref}"; filename="${safeName}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n' +
    text +
    `\r\n--${boundary}--\r\n`;
  const r = await http(`${base()}${trimSlash(d.blobRoot)}/camli/upload`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': `multipart/form-data; boundary=${boundary}` }),
    body
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(r.text || '').slice(0, 120)}`);
  // Perkeep trả 200 kèm errorText khi từ chối blob. "received" là [{blobRef,size}]
  // (rỗng nếu blob đã có sẵn) nên KHÔNG dùng nó để kết luận lỗi.
  let j = null;
  try { j = JSON.parse(r.text || '{}'); } catch {}
  if (j && j.errorText && !/already (exists|received)/i.test(j.errorText)) {
    throw new Error(`blob bị từ chối: ${String(j.errorText).trim().slice(0, 160)}`);
  }
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

// ============================================================
// Video link (YouTube...) = 1 mục Perkeep giữ vĩnh viễn
//   - blob JSON: { type, site, url, title, duration, author, thumbnail, addedAt }
//   - permanode: camliContent -> JSON, title, tag=video-link
//   - tên file: "<Tiêu đề> [YouTube].json"  -> search theo tên là ra
// Không phụ thuộc YouTube còn sống hay không: link + metadata nằm trong Perkeep.
// ============================================================
const linkCache = new Map();     // fileRef -> JSON | null

const fmtDur = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
    : `${m}:${String(x).padStart(2, '0')}`;
};

const sanitizeName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
const siteLabel = (site) => ({ youtube: 'YouTube', vimeo: 'Vimeo', tiktok: 'TikTok' }[site] || 'Video');

function linkIdOf(raw) {
  try {
    const u = new URL(String(raw).trim());
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') return { site: 'youtube', id: u.pathname.slice(1).split('/')[0] };
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return { site: 'youtube', id: u.searchParams.get('v') || '' };
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) return { site: 'youtube', id: m[2] };
    }
    if (host === 'vimeo.com') return { site: 'vimeo', id: u.pathname.split('/').filter(Boolean).pop() || '' };
    if (host.endsWith('tiktok.com')) return { site: 'tiktok', id: u.pathname.split('/').filter(Boolean).pop() || '' };
    return { site: 'web', id: '' };
  } catch { return { site: 'web', id: '' }; }
}

/** Lấy tiêu đề / kênh / thời lượng / thumbnail (oEmbed + trang watch). */
async function fetchLinkMeta(raw) {
  const url = String(raw || '').trim();
  const { site, id } = linkIdOf(url);
  const out = { url, site, id, title: '', duration: 0, author: '', thumbnail: '', embed: '' };
  if (site === 'youtube' && id) {
    out.thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    out.embed = `https://www.youtube.com/embed/${id}`;
    try {
      const r = await http(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      if (r.ok && r.text) {
        const j = JSON.parse(r.text);
        out.title = j.title || '';
        out.author = j.author_name || '';
        if (j.thumbnail_url) out.thumbnail = j.thumbnail_url;
      }
    } catch (e) { log(`link oembed FAIL: ${e.message}`); }
    try {
      const r = await http(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`);
      const m = /"lengthSeconds":"(\d+)"/.exec(r.text || '');
      if (m) out.duration = Number(m[1]) || 0;
    } catch (e) { log(`link page FAIL: ${e.message}`); }
  }
  return out;
}

/** Ký + upload 1 claim. */
async function signClaim(fields) {
  const d = await getDisc();
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
  const signed = await signUnsigned(unsigned);
  await uploadBlobText(blobRefOf(signed), signed);
  log(`claim ${fields.claimType}${fields.attribute ? ' ' + fields.attribute : ''} → ${blobRefOf(signed).slice(0, 16)}…`);
  return signed;
}

async function uploadBlobNamed(text, name) {
  const ref = blobRefOf(text);
  await uploadBlobText(ref, text, name);
  return ref;
}

/**
 * Tạo permanode: blob JSON camliType=permanode + chữ ký, ref = hash blob đó.
 * (Giống hệt plugin upload: {"camliSigner":..,"camliType":"permanode","camliVersion":1})
 */
async function createPermanode() {
  const d = await getDisc();
  const unsigned = JSON.stringify({
    camliSigner: d.signerPubKey,
    camliType: 'permanode',
    camliVersion: 1
  });
  const signed = await signUnsigned(unsigned);
  const ref = blobRefOf(signed);
  await uploadBlobText(ref, signed);
  log(`permanode → ${ref.slice(0, 18)}…`);
  return ref;
}

/** Tạo 1 mục video-link: blob nội dung + blob "file" schema + permanode + claim. */
async function createVideoLink(info) {
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
  log(`link: upload JSON "${fileName}"`);
  const contentRef = await uploadBlobNamed(text, fileName);
  const size = new TextEncoder().encode(text).length;

  // Blob "file" (schema) — nhờ nó app/Perkeep mới có fileName + mở/tải được
  const schema = JSON.stringify({
    camliType: 'file',
    camliVersion: 1,
    fileName,
    parts: [{ blobRef: contentRef, size }],
    size
  });
  const fileRef = blobRefOf(schema);
  await uploadBlobText(fileRef, schema);
  log(`link: file blob ${fileRef.slice(0, 18)}… (${size} B)`);

  const permaRef = await createPermanode();
  await signClaim({ claimType: 'set-attribute', permaNode: permaRef, attribute: 'camliContent', value: fileRef });
  if (info.title) await signClaim({ claimType: 'set-attribute', permaNode: permaRef, attribute: 'title', value: info.title });
  await signClaim({ claimType: 'set-attribute', permaNode: permaRef, attribute: 'mimeType', value: 'application/json' });
  await signClaim({ claimType: 'add-attribute', permaNode: permaRef, attribute: 'tag', value: LINK_TAG });
  for (const tag of (info.tags || [])) {
    if (tag && tag !== LINK_TAG) await signClaim({ claimType: 'add-attribute', permaNode: permaRef, attribute: 'tag', value: tag });
  }
  log(`link: ${fileName} → permanode ${permaRef}`);
  return { permaRef, contentRef, fileName };
}

/** Đọc JSON của 1 mục link (cache theo fileRef). */
async function loadLink(meta) {
  if (!meta?.fileRef) return null;
  if (linkCache.has(meta.fileRef)) return linkCache.get(meta.fileRef);
  let data = null;
  try {
    const r = await http(directUrl(meta.fileRef), { headers: authHeaders() });
    if (r.ok && r.text) data = JSON.parse(r.text);
  } catch (e) { log(`link JSON FAIL: ${e.message}`); }
  linkCache.set(meta.fileRef, data);
  return data;
}

/** Sheet thêm link video. */
function openAddLinkSheet() {
  openSheet(`<h3>${esc(t('link_add'))}</h3>
    <div class="edt">
      <label>${esc(t('link_url'))}</label>
      <input id="lk-url" inputmode="url" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off" />
      <div class="lk-prev" id="lk-prev" hidden></div>
      <label>${esc(t('link_title'))}</label><input id="lk-title" autocomplete="off" />
      <label>${esc(t('link_dur'))}</label><input id="lk-dur" inputmode="numeric" placeholder="12:34" autocomplete="off" />
      <label>${esc(t('link_tags'))}</label><input id="lk-tags" autocomplete="off" />
      <div class="btns"><button data-save>${esc(t('btn_save'))}</button><button class="cx" data-cx>${esc(t('btn_cancel'))}</button></div>
    </div>
    <p class="err" id="lk-err" hidden></p>
    <p class="meta">${esc(t('link_hint'))}</p>`);

  const errEl = sheetBody.querySelector('#lk-err');
  const urlEl = sheetBody.querySelector('#lk-url');
  const titleEl = sheetBody.querySelector('#lk-title');
  const durEl = sheetBody.querySelector('#lk-dur');
  const tagsEl = sheetBody.querySelector('#lk-tags');
  const prev = sheetBody.querySelector('#lk-prev');
  let meta = null;

  const parseDur = (v) => {
    const s = String(v || '').trim();
    if (!s) return 0;
    const p = s.split(':').map(Number);
    if (p.some((n) => Number.isNaN(n))) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0] || 0;
  };

  const fill = async () => {
    const url = urlEl.value.trim();
    if (!url) return;
    prev.hidden = false;
    prev.textContent = t('link_fetching');
    try {
      meta = await fetchLinkMeta(url);
      if (meta.title && !titleEl.value.trim()) titleEl.value = meta.title;
      if (meta.duration) durEl.value = fmtDur(meta.duration);
      prev.innerHTML = meta.thumbnail
        ? `<img src="${esc(meta.thumbnail)}" alt="" /><span>${esc([siteLabel(meta.site), meta.author, fmtDur(meta.duration)].filter(Boolean).join(' · '))}</span>`
        : esc(meta.site === 'web' ? t('link_generic') : siteLabel(meta.site));
      log(`link meta: ${meta.site}/${meta.id} · ${meta.title || '(no title)'} · ${meta.duration}s`);
    } catch (e) {
      prev.hidden = true;
      log(`link meta FAIL: ${e.message}`);
    }
  };

  urlEl.addEventListener('change', fill);
  urlEl.addEventListener('blur', fill);
  urlEl.addEventListener('paste', () => setTimeout(fill, 60));
  sheetBody.querySelector('[data-cx]').onclick = closeSheet;
  sheetBody.querySelector('[data-save]').onclick = async () => {
    errEl.hidden = true;
    const url = urlEl.value.trim();
    if (!/^https?:\/\//i.test(url)) { errEl.textContent = t('link_bad'); errEl.hidden = false; return; }
    if (!meta || meta.url !== url) meta = await fetchLinkMeta(url);
    const title = titleEl.value.trim() || meta.title || '';
    if (!title) { errEl.textContent = t('link_need_title'); errEl.hidden = false; return; }
    const tags = tagsEl.value.split(',').map((s) => s.trim()).filter(Boolean);
    const btn = sheetBody.querySelector('[data-save]');
    btn.disabled = true;
    try {
      snack(t('link_saving'));
      await createVideoLink({
        url,
        site: meta.site,
        title,
        duration: parseDur(durEl.value) || meta.duration || 0,
        author: meta.author,
        thumbnail: meta.thumbnail,
        tags
      });
      linkCache.clear();
      closeSheet();
      snack(t('link_ok'));
      setTimeout(() => reloadTab(currentTab()), 900);
    } catch (e) {
      btn.disabled = false;
      errEl.textContent = `${t('link_fail')}: ${e.message}`;
      errEl.hidden = false;
      log(`link FAIL: ${e.message} :: ${(e.stack || '').split('\n').slice(0, 3).join(' | ')}`);
    }
  };
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
    ...(/^(video|audio)\//i.test(meta.mime) ? [{ k: 'cache', ico: 'download', label: t('cache_play') }] : []),
    { k: 'external', ico: 'external', label: t('vw_open_app') },
    { k: 'download', ico: 'link', label: t('fa_download') },
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
      } else if (b.dataset.k === 'cache') {
        closeSheet();
        const i = currentItems.findIndex((x) => x.blob === blob);
        await cacheAndPlay(meta, i);
      } else if (b.dataset.k === 'tag') {
        closeSheet();
        openTagSheet(blob, meta);
      } else if (b.dataset.k === 'view') {
        closeSheet();
        openViewer(idx >= 0 ? idx : 0);
      } else if (b.dataset.k === 'external') {
        closeSheet();
        await openWithOtherApp(meta);
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
  const native = up.uploadSupported();
  openSheet(`<h3>${esc(t('fab_title'))}</h3>
    <button class="rowbtn" data-k="upload">${icon('upload')}<span>${esc(t('fab_upload'))}</span></button>
    <button class="rowbtn" data-k="link">${icon('video')}<span>${esc(t('fab_link'))}</span></button>
    <button class="rowbtn" disabled>${icon('doc')}<span>${esc(t('fab_note'))} ${esc(t('fab_soon'))}</span></button>
    ${native ? '' : `<p class="meta">${esc(t('up_need_native'))}</p>`}`);
  sheetBody.querySelector('[data-k="link"]').onclick = () => {
    closeSheet();
    openAddLinkSheet();
  };
  sheetBody.querySelector('[data-k="upload"]').onclick = async () => {
    closeSheet();
    if (!native) return snack(t('up_need_native'));
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
    const badges = [s.user ? t('auth_basic') : null, s.cfId ? t('auth_cf') : null].filter(Boolean);
    html += `<div class="svc${s.id === activeId ? ' active' : ''}">
      <button class="pick" data-pick="${esc(s.id)}">
        <span class="sd"></span>
        <span class="st"><b>${esc(s.name)}</b><small>${esc(host)}${badges.length ? ' · ' + esc(badges.join(' + ')) : ''}</small></span>
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
      <details class="cfbox"${s?.cfId ? ' open' : ''}>
        <summary>${esc(t('f_cf_title'))}</summary>
        <p class="meta">${esc(t('f_cf_hint'))}</p>
        <label>${esc(t('f_cf_id'))}</label><input id="e-cfid" value="${esc(s?.cfId || '')}" autocomplete="off" />
        <label>${esc(t('f_cf_secret'))}</label><input id="e-cfsecret" type="password" value="${esc(s?.cfSecret || '')}" autocomplete="off" />
      </details>
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
      pass: sheetBody.querySelector('#e-p').value,
      cfId: sheetBody.querySelector('#e-cfid').value.trim(),
      cfSecret: sheetBody.querySelector('#e-cfsecret').value
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

// ---------- Jellyfin: phát mượt video lớn (transcode HLS) ----------
const jfMbps = () => Number(localStorage.getItem('pk-jf-mbps-v1')) || 8;
const jfMode = () => localStorage.getItem('pk-jf-mode-v1') || 'auto';
const JF_MBPS = [4, 8, 12, 20];

function renderJfState() {
  const on = jellyfin.enabled();
  const st = $('set-jf-state');
  if (!st) return;
  $('set-jf-sub').textContent = on ? t('jf_on')(jellyfin.base(), jfMbps()) : t('jf_off');
  st.innerHTML = icon(on ? 'check' : 'close', 20);
  st.style.color = on ? 'var(--green)' : '#bbb';
}

function jfSheet() {
  const c = jellyfin.cfg();
  const chipGroup = (title, items, cur, attr) =>
    `<b style="display:block;margin:10px 2px 6px">${esc(title)}</b>` +
    items.map(({ v, label }) => `<button class="opt${String(v) === String(cur) ? ' on' : ''}" data-${attr}="${esc(String(v))}"><span>${esc(label)}</span>${String(v) === String(cur) ? `<span class="tick">${icon('check', 18)}</span>` : ''}</button>`).join('');
  openSheet(`<h3>${esc(t('jf_title'))}</h3>
    <p class="meta">${esc(t('jf_hint'))}</p>
    <div class="edt">
      <label>${esc(t('jf_base'))}</label><input id="jf-b" value="${esc(c.base || 'http://192.168.123.9:8096')}" inputmode="url" />
      <label>${esc(t('jf_user'))}</label><input id="jf-u" value="${esc(c.userName || '')}" autocomplete="username" />
      <label>${esc(t('jf_pass'))}</label><input id="jf-p" type="password" value="" autocomplete="current-password" />
      <div class="btns"><button data-save>${esc(t('jf_connect'))}</button><button class="cx" data-cx>${esc(t('btn_cancel'))}</button></div>
    </div>
    <p class="err" id="jf-err" hidden></p>
    ${chipGroup(t('jf_quality'), JF_MBPS.map((v) => ({ v, label: v + ' Mbps' })), jfMbps(), 'mb')}
    ${chipGroup(t('jf_mode'), [
      { v: 'auto', label: t('jf_mode_auto') },
      { v: 'always', label: t('jf_mode_always') },
      { v: 'off', label: t('jf_mode_off') }
    ], jfMode(), 'md')}
    <button class="rowbtn" id="jf-off2">${icon('close')}<span>${esc(t('jf_disconnect'))}</span></button>`);

  const errEl = sheetBody.querySelector('#jf-err');
  sheetBody.querySelector('[data-cx]').onclick = closeSheet;
  sheetBody.querySelector('[data-save]').onclick = async () => {
    const base = sheetBody.querySelector('#jf-b').value.trim();
    const user = sheetBody.querySelector('#jf-u').value.trim();
    const pass = sheetBody.querySelector('#jf-p').value;
    errEl.hidden = true;
    if (!/^https?:\/\//i.test(base)) { errEl.textContent = t('jf_bad_url'); errEl.hidden = false; return; }
    try {
      snack(t('jf_starting'));
      await jellyfin.login(base, user, pass);
      renderJfState();
      closeSheet();
      snack(t('jf_ok'));
      log(`jellyfin: ${base} · ${user}`);
    } catch (e) {
      errEl.textContent = /jf-auth/.test(e.message) ? t('jf_bad_auth') : t('jf_fail');
      errEl.hidden = false;
      log(`jellyfin login FAIL: ${e.message}`);
    }
  };
  sheetBody.querySelectorAll('[data-mb]').forEach((b) => {
    b.onclick = () => {
      localStorage.setItem('pk-jf-mbps-v1', b.dataset.mb);
      renderJfState();
      jfSheet();
    };
  });
  sheetBody.querySelectorAll('[data-md]').forEach((b) => {
    b.onclick = () => {
      localStorage.setItem('pk-jf-mode-v1', b.dataset.md);
      jfSheet();
    };
  });
  sheetBody.querySelector('#jf-off2').onclick = () => {
    jellyfin.logout();
    renderJfState();
    closeSheet();
    snack(t('jf_off'));
  };
}
$('set-jf').onclick = jfSheet;

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
  const p = await probeServer(b, authHeaders());
  log(`GET ${b}/?camli.mode=config → HTTP ${p.status}${p.ok ? ' · Perkeep OK' : p.cf ? ' · Cloudflare Access chặn' : ''}`);
  return p.ok;
}

// ============================================================
// Onboarding
// ============================================================
$('seg-vi').onclick = () => setLang('vi');
$('seg-en').onclick = () => setLang('en');
const onboardingEl = $('onboarding');
function showOnboard(v) { onboardingEl.hidden = !v; }

// ============================================================
// Onboarding -> xin quyền -> vào app
// ============================================================
async function finishOnboarding() {
  localStorage.setItem(LS_ONBOARD, '1');
  // Xin quyền thông báo NGAY LÚC NÀY (trước khi vào app) để upload nền
  // có tiến trình, thay vì hỏi giữa chừng lúc bấm upload.
  await askNotificationPermission(true);
  showOnboard(false);
  boot();
}

$('ob-connect').onclick = async () => {
  const errEl = $('ob-err');
  const name = $('ob-name').value.trim() || 'Perkeep';
  const url = $('ob-url').value.trim().replace(/\/+$/, '');
  const user = $('ob-user').value.trim();
  const pass = $('ob-pass').value;
  const cfId = $('ob-cfid').value.trim();
  const cfSecret = $('ob-cfsecret').value;
  if (!/^https?:\/\//i.test(url)) { errEl.textContent = t('ob_bad'); errEl.hidden = false; return; }
  errEl.hidden = true;
  $('ob-connect').disabled = true;
  try {
    const headers = {};
    if (user) headers.Authorization = 'Basic ' + btoa(`${user}:${pass}`);
    if (cfId) {
      headers['CF-Access-Client-Id'] = cfId;
      headers['CF-Access-Client-Secret'] = cfSecret;
    }
    const p = await probeServer(url, headers);
    if (!p.ok) {
      const box = $('ob-cf');
      if (p.cf && !cfId) {
        if (box) box.open = true;
        throw new Error('CF Access');
      }
      throw new Error('HTTP ' + p.status);
    }
    servers = [{ id: 's' + Date.now(), name, url, user, pass, cfId, cfSecret }];
    activeId = servers[0].id;
    save();
    renderSvcSub();
    await finishOnboarding();
  } catch (e) {
    errEl.textContent = e?.message === 'CF Access' ? t('ob_cf') : t('ob_fail');
    errEl.hidden = false;
    if (e?.message === 'CF Access') {
      const box = $('ob-cf');
      if (box) box.open = true;
    }
  } finally {
    $('ob-connect').disabled = false;
  }
};
$('ob-skip').onclick = () => finishOnboarding();

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
  // Nếu lần trước app bị crash, nhắc ngay để người dùng mở Chẩn đoán
  up.getLastCrash().then((c) => { if (c) snack(t('diag_crash_found')); }).catch(() => {});
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
renderPermState();
renderCacheState();
refreshUploads();
up.onProgress((job) => {
  uploadJobs.set(job.id, job);
  renderUploads();
  if (job.state === 'done') loadHome();
}).catch(() => {});
if (!localStorage.getItem(LS_ONBOARD)) showOnboard(true);
else boot();
