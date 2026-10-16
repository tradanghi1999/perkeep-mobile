// Khai báo API cho TypeScript (không bắt buộc dùng).
export interface UploadJob {
  id: string;
  uri: string;
  name: string;
  mime: string;
  size: number;
  state: 'queued' | 'preparing' | 'uploading' | 'signing' | 'done' | 'failed' | 'canceled';
  uploaded: number;
  error?: string;
}

export interface ServerConfig {
  base: string;          // vd http://192.168.1.10:3179
  blobRoot?: string;     // mặc định /bs-and-maybe-also-index/
  jsonSignRoot?: string; // mặc định /sighelper/
  user?: string;
  pass?: string;
  tag?: string;          // gắn kèm vào permanode, vd 'mobile'
}

export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
  size: number;
}

export interface PkUploadPlugin {
  pickFiles(): Promise<{ files: PickedFile[] }>;
  enqueue(options: { files: PickedFile[]; server: ServerConfig; wifiOnly?: boolean }): Promise<{ ids: string[] }>;
  list(): Promise<{ jobs: UploadJob[] }>;
  cancel(options: { id: string }): Promise<void>;
  retry(options: { id: string }): Promise<void>;
  clearFinished(): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  addListener(event: 'progress', cb: (job: UploadJob) => void): Promise<{ remove: () => void }>;
}
