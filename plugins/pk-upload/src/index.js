import { registerPlugin } from '@capacitor/core';

// Plugin chỉ có bản Android. Trên web, mọi method báo lỗi để app tự fallback.
const PkUpload = registerPlugin('PkUpload');

export default PkUpload;

/**
 * Kiểu dữ liệu (JS/JSDoc):
 * Job = {
 *   id: string,
 *   uri: string,          // content:// do pickFiles trả về
 *   name: string,
 *   mime: string,
 *   size: number,
 *   state: 'queued'|'preparing'|'uploading'|'signing'|'done'|'failed'|'canceled',
 *   uploaded: number,
 *   error?: string
 * }
 */
