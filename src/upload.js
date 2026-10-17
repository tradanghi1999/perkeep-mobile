import { Capacitor, CapacitorHttp } from '@capacitor/core';
import PkUpload from 'pk-upload';

// Upload nền chỉ có trên Android (WorkManager + foreground service).
export const uploadSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** GET JSON qua native HTTP (tránh CORS của Perkeep) + fallback fetch cho web. */
async function getJson(url, headers) {
  try {
    const r = await CapacitorHttp.request({ url, method: 'GET', headers });
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } catch {
    const r = await fetch(url, { headers });
    return r.json();
  }
}

/** Lấy blobRoot/jsonSignRoot từ discovery của server. */
export async function discovery(base, auth) {
  const url = base.replace(/\/+$/, '') + '/?camli.mode=config';
  try {
    const j = await getJson(url, auth || {});
    return {
      blobRoot: j.blobRoot || '/bs-and-maybe-also-index/',
      jsonSignRoot: j.jsonSignRoot || '/sighelper/',
      signerPubKey: j.signing?.publicKeyBlobRef || ''
    };
  } catch {
    return { blobRoot: '/bs-and-maybe-also-index/', jsonSignRoot: '/sighelper/', signerPubKey: '' };
  }
}

export function basicAuth(server) {
  return server?.user ? { Authorization: 'Basic ' + btoa(`${server.user}:${server.pass || ''}`) } : {};
}

export async function ensureNotificationPermission() {
  if (!uploadSupported()) return true;
  try {
    const r = await PkUpload.requestNotificationPermission();
    return !!r.granted;
  } catch {
    return false;
  }
}

/** Trạng thái quyền thông báo: 'granted' | 'prompt' | 'denied' */
export async function notificationPermission() {
  if (!uploadSupported()) return 'granted';
  try {
    const r = await PkUpload.checkPermissions();
    return r?.notifications || 'prompt';
  } catch {
    return 'prompt';
  }
}

/** URL phát media qua proxy nội bộ (Android) — để <video> xem được file cần xác thực. */
export async function mediaProxyUrl(server, fileRef) {
  if (!uploadSupported()) return null;
  try {
    const r = await PkUpload.mediaUrl({
      fileRef,
      base: server?.url || '',
      user: server?.user,
      pass: server?.pass,
      cfId: server?.cfId,
      cfSecret: server?.cfSecret
    });
    return r?.url || null;
  } catch {
    return null;
  }
}

/** Tải file về cache máy để xem mượt (kiểu "xem ngoại tuyến" của Drive). */
export async function cacheMedia(server, meta) {
  if (!uploadSupported()) return null;
  const r = await PkUpload.cacheMedia({
    fileRef: meta.fileRef,
    base: server?.url || '',
    user: server?.user,
    pass: server?.pass,
    cfId: server?.cfId,
    cfSecret: server?.cfSecret,
    name: meta.name || '',
    size: meta.size || 0
  });
  return r?.url ? { url: r.url, name: r.name, size: r.size } : null;
}

export async function onCacheProgress(cb) {
  if (!uploadSupported()) return { remove() {} };
  return PkUpload.addListener('cacheProgress', cb);
}
export const mediaCacheInfo = async () => {
  if (!uploadSupported()) return { files: 0, bytes: 0 };
  try { return await PkUpload.mediaCacheInfo(); } catch { return { files: 0, bytes: 0 }; }
};
export const clearMediaCache = async () => {
  if (!uploadSupported()) return { files: 0, bytes: 0 };
  try { return await PkUpload.clearMediaCache(); } catch { return { files: 0, bytes: 0 }; }
};

/** Mở file bằng app khác (VLC/MX Player): tải về cache rồi hiện danh sách app. */
export async function openExternally(server, meta) {
  if (!uploadSupported()) return false;
  try {
    const r = await PkUpload.openExternally({
      fileRef: meta.fileRef,
      base: server?.url || '',
      user: server?.user,
      pass: server?.pass,
      cfId: server?.cfId,
      cfSecret: server?.cfSecret,
      mime: meta.mime || '',
      name: meta.name || ''
    });
    return !!r?.opened;
  } catch {
    return false;
  }
}

/** Chọn file rồi đưa vào hàng đợi upload nền. */
export async function pickAndUpload(server, { wifiOnly = true, tag = 'mobile' } = {}) {
  const picked = await PkUpload.pickFiles();
  const files = picked?.files || [];
  if (!files.length) return { ids: [] };
  await ensureNotificationPermission();
  const disc = await discovery(server.url, basicAuth(server));
  const res = await PkUpload.enqueue({
    files,
    wifiOnly,
    server: {
      base: server.url,
      blobRoot: disc.blobRoot,
      jsonSignRoot: disc.jsonSignRoot,
      user: server.user,
      pass: server.pass,
      tag
    }
  });
  return { ids: res?.ids || [] };
}

/** Link người dùng vừa "Chia sẻ" sang app (Android share sheet). null nếu không có. */
export async function takeShare() {
  if (!uploadSupported()) return null;
  try {
    const r = await PkUpload.takeShare();
    if (!r || !r.text) return null;
    return { text: r.text, url: r.url || '', sharedAt: r.sharedAt || 0 };
  } catch {
    return null;
  }
}

export const listJobs = async () => {
  if (!uploadSupported()) return [];
  try {
    const r = await PkUpload.list();
    return r?.jobs || [];
  } catch {
    return [];
  }
};
export const cancelJob = (id) => PkUpload.cancel({ id });
export const retryJob = (id) => PkUpload.retry({ id });
export const clearFinished = () => PkUpload.clearFinished();
/** Log crash lần trước (bắt bằng uncaught handler ở native) — để chẩn đoán không cần adb. */
export const getLastCrash = async () => {
  if (!uploadSupported()) return null;
  try { return (await PkUpload.getLastCrash())?.crash || null; } catch { return null; }
};
export const clearCrash = async () => {
  if (!uploadSupported()) return;
  try { await PkUpload.clearCrash(); } catch {}
};
export const getWifiOnly = async () => {
  if (!uploadSupported()) return true;
  try { return !!(await PkUpload.wifiOnly()).value; } catch { return true; }
};
export const setWifiOnly = (value) => PkUpload.setWifiOnly({ value });

/** Nghe tiến trình khi app đang mở. */
export async function onProgress(cb) {
  if (!uploadSupported()) return { remove() {} };
  return PkUpload.addListener('progress', cb);
}
