// ============================================================
// Jellyfin: phat video Perkeep qua transcode HLS cua Jellyfin.
// - KHONG copy dung luong: Jellyfin doc mount C:\pk-media (xem scripts/jellyfin-gateway.mjs).
// - Chi bat khi da cau hinh (base + token). Khong co Jellyfin thi app chay y nhu cu.
// - Media (m3u8/ts) xac thuc bang header Authorization, KHONG nhet token vao URL.
// ============================================================

const CFG_KEY = 'pk-jf-v1';
const MATCH_KEY = 'pk-jf-match-v1';
const MATCH_TTL = 7 * 86400000;

function readCfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch { return {}; }
}
function patchCfg(p) {
  const next = { ...readCfg(), ...p };
  try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch {}
  return next;
}
function deviceId() {
  const c = readCfg();
  if (c.deviceId) return c.deviceId;
  const id = 'pk-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  patchCfg({ deviceId: id });
  return id;
}

/** Header chuẩn Jellyfin (không cần token khi đăng nhập). */
export function jfAuthHeader(token) {
  const tk = token === undefined ? readCfg().token : token;
  let h = `MediaBrowser Client="pk-app", Device="Android", DeviceId="${deviceId()}", Version="1.0.0"`;
  if (tk) h += `, Token="${tk}"`;
  return h;
}

async function api(path, { method = 'GET', body, token, timeout = 15000 } = {}) {
  const c = readCfg();
  if (!c.base) throw new Error('jf-no-base');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  const headers = { Authorization: jfAuthHeader(token) };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const r = await fetch(c.base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!r.ok) {
      const e = new Error('jf-http-' + r.status);
      e.status = r.status;
      throw e;
    }
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Đăng nhập + lưu token. Ném lỗi 'jf-auth' khi sai tài khoản. */
export async function jfLogin(base, user, pass) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(b)) throw new Error('jf-url');
  const r = await fetch(b + '/Users/AuthenticateByName', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: jfAuthHeader('') },
    body: JSON.stringify({ Username: user, Pw: pass })
  });
  if (r.status === 401) throw new Error('jf-auth');
  if (!r.ok) throw new Error('jf-http-' + r.status);
  const j = await r.json();
  if (readCfg().base && readCfg().base !== b) {
    try { localStorage.removeItem(MATCH_KEY); } catch {}  // đổi server -> bỏ cache ánh xạ item
  }
  patchCfg({
    base: b,
    token: j.AccessToken,
    userId: j.User && j.User.Id,
    serverId: j.ServerId,
    userName: user,
    serverName: j.ServerName || ''
  });
  return j;
}

/** Đăng xuất: xoá token, giữ lại base để lần sau chỉ cần nhập mật khẩu. */
export function jfLogout() {
  jfStop();
  patchCfg({ token: '', userId: '' });
}

/** Kiểm tra server + token còn sống. */
export async function jfTest() {
  await api('/System/Info', { timeout: 8000 });
  return true;
}

const baseName = (p) => String(p || '').split(/[\\/]/).pop().toLowerCase();

/** Tìm item Jellyfin theo tên file Perkeep (có cache 7 ngày). */
export async function jfFindItem(name) {
  const c = readCfg();
  if (!c.base || !c.token || !name) return null;
  const key = String(name).toLowerCase();
  let map = {};
  try { map = JSON.parse(localStorage.getItem(MATCH_KEY) || '{}') || {}; } catch {}
  const hit = map[key];
  if (hit && Date.now() - (hit.t || 0) < MATCH_TTL && hit.id) return hit;

  const q = key.replace(/\.[^.]+$/, '');
  let items = [];
  try {
    const r = await api('/Items?Recursive=true&IncludeItemTypes=Video,Movie&Limit=25&Fields=Path&SearchTerm=' + encodeURIComponent(q));
    items = (r && r.Items) || [];
  } catch (e) {
    // Jellyfin chết / mất mạng -> coi như không có, app phát trực tiếp
    return null;
  }
  const it = items.find((x) =>
    baseName(x.Path) === key ||
    baseName(x.Path) === q ||
    String(x.Name || '').toLowerCase() === q
  ) || null;
  if (!it) return null;

  const rec = { id: it.Id, name: it.Name, t: Date.now() };
  map[key] = rec;
  try { localStorage.setItem(MATCH_KEY, JSON.stringify(map)); } catch {}
  return rec;
}

/** URL HLS transcode (h264/aac) cho 1 item.
 *  Lưu ý: PHẢI gửi VideoBitrate/AudioBitrate, nếu không Jellyfin mặc định 256 kbps
 *  và trả về 416x234. MaxWidth/MaxHeight để khỏi chuyển mã 4K (CPU không kịp).
 *  8 Mbps -> 720p (mượt), 12+ -> 1080p. */
export function jfHlsUrl(id, mbps, playSessionId) {
  const c = readCfg();
  const m = Math.max(2, Number(mbps) || 8);
  const capH = m <= 8 ? 720 : 1080;
  const capW = Math.round(capH * 16 / 9);
  const audio = 192000;
  const video = Math.max(800000, Math.round(m * 1000000) - audio);
  const q = new URLSearchParams({
    MediaSourceId: id,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    VideoBitrate: String(video),
    AudioBitrate: String(audio),
    MaxWidth: String(capW),
    MaxHeight: String(capH),
    MaxStreamingBitrate: String(Math.round(m * 1000000)),
    PlaySessionId: playSessionId,
    // Jellyfin 12: query auth dùng đúng tham số "ApiKey" (api_key thường -> 401).
    // Segment con không cần token, chỉ cần MediaSourceId + PlaySessionId.
    ApiKey: c.token
  });
  return `${c.base}/Videos/${id}/master.m3u8?${q.toString()}`;
}

// ---------- Báo tiến độ (Continue Watching) ----------
let sess = null;
function post(path, body) { api(path, { method: 'POST', body }).catch(() => {}); }

export function jfStart(itemId, playSessionId) {
  jfStop();
  sess = { itemId, playSessionId, pos: 0, paused: false, timer: null };
  post('/Sessions/Playing', {
    ItemId: itemId,
    PlaySessionId: playSessionId,
    MediaSourceId: itemId,
    PositionTicks: 0,
    CanSeek: true,
    IsPaused: false,
    PlayMethod: 'Transcode'
  });
  sess.timer = setInterval(() => {
    if (!sess) return;
    post('/Sessions/Playing/Progress', {
      ItemId: sess.itemId,
      PlaySessionId: sess.playSessionId,
      MediaSourceId: sess.itemId,
      PositionTicks: Math.round((sess.pos || 0) * 1e7),
      IsPaused: !!sess.paused,
      CanSeek: true,
      PlayMethod: 'Transcode'
    });
  }, 10000);
}

export function jfPos(seconds, paused) {
  if (!sess) return;
  sess.pos = Number(seconds) || 0;
  sess.paused = !!paused;
}

export function jfStop() {
  if (!sess) return;
  clearInterval(sess.timer);
  post('/Sessions/Playing/Stopped', {
    ItemId: sess.itemId,
    PlaySessionId: sess.playSessionId,
    MediaSourceId: sess.itemId,
    PositionTicks: Math.round((sess.pos || 0) * 1e7)
  });
  sess = null;
}

// ---------- Cấu hình ----------
export const jellyfin = {
  cfg: readCfg,
  set: patchCfg,
  login: jfLogin,
  logout: jfLogout,
  test: jfTest,
  findItem: jfFindItem,
  hlsUrl: jfHlsUrl,
  authHeader: jfAuthHeader,
  start: jfStart,
  pos: jfPos,
  stop: jfStop,
  /** Đã cấu hình và có token chưa */
  enabled() { const c = readCfg(); return !!(c.base && c.token); },
  base() { return readCfg().base || ''; },
  userName() { return readCfg().userName || ''; }
};
