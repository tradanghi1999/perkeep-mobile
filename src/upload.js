import { Capacitor } from '@capacitor/core';
import PkUpload from 'pk-upload';

// Upload nền chỉ có trên Android (WorkManager + foreground service).
export const uploadSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** Lấy blobRoot/jsonSignRoot từ discovery của server. */
export async function discovery(base, auth) {
  const url = base.replace(/\/+$/, '') + '/?camli.mode=config';
  try {
    const r = await fetch(url, { headers: auth || {} });
    const j = await r.json();
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
