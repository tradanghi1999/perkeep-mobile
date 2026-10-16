# perkeep-mobile — app Android cho Perkeep (Vite + Capacitor)

Client Perkeep cho Android: tìm kiếm, thumbnail, upload chạy nền. Web chỉ để dev; APK build trên GitHub Actions.

## Tính năng
- **Tìm kiếm không cần cú pháp**: gõ từ khóa tự nhiên (không dấu cũng được) + nút **Bộ lọc** cho Loại tệp / Thời gian / Sắp xếp. Không phải học cú pháp Perkeep.
  - Bộ lọc đang bật hiện thành chip, bấm ✕ để bỏ từng cái; có nút "Xoá bộ lọc".
  - Sheet lọc hiện luôn **câu lệnh sẽ gửi tới Perkeep** (để ai muốn học thì thấy), và ghi rõ phần nào lọc ngay trên máy.
  - Ô "Nâng cao" cho phép nhập thẳng cú pháp Perkeep nếu cần.
  - Vì sao lọc thời gian/từ khóa làm ở máy: `after:` của Perkeep so mốc khác nhau tuỳ câu truy vấn (thời gian file vs permanode), còn `filename:` là glob **phân biệt hoa/thường**. Lọc ở máy cho kết quả đúng như ngày/tên đang hiển thị.
- **Xem file trong app**: chạm vào dòng để mở trình xem toàn màn hình — ảnh, video (có điều khiển, tự phát), audio.
  - Chuyển file bằng nút ‹ › hoặc **vuốt ngang**; **vuốt xuống để đóng**; Esc khi test desktop.
  - PDF và loại khác: WebView Android không render được → nút **Mở bằng ứng dụng khác** (Chrome/ứng dụng PDF) và **Tải về máy**.
  - Server bật auth: ảnh lấy qua endpoint thumbnail; video/audio dùng nút mở ngoài.
- **Kéo xuống để tải lại** (pull-to-refresh) ở tab Nhà / Ảnh / Tệp; **vuốt xuống để đóng** mọi bottom sheet.
- **Thumbnail**: ảnh do server sinh; video do app tự lấy khung hình.
- **Upload nền** kiểu Google Drive (WorkManager + notification tiến trình).
- **Nhiều dịch vụ Perkeep** + song ngữ VI/EN.

## 1. Cài tối thiểu (không cài Android Studio)
- Bun + VS Code
- Không cần java / flutter / adb local

## 2. Dev không emulator
```powershell
bun install
bun run dev -- --host
```
- PC và điện thoại chung WiFi.
- Trên Chrome điện thoại mở `http://<IP-PC>:3179` trước. Nếu không mở được: firewall / Perkeep chưa `--listen 0.0.0.0:3179`.
- Mở `http://<IP-PC>:5173` trên điện thoại để test app.
- Trong app: nhập địa chỉ + tài khoản/mật khẩu (nếu có), bấm `Test`, rồi tìm thử `health` hoặc chọn chip.

Tìm kiếm dùng: `POST {searchRoot}/camli/search/query` với `{"expression":"title:health","limit":50,"describe":{...}}`.

## 3. Build APK trên cloud (không chạy Gradle local)
```powershell
git init; git add -A; git commit -m "init"; git branch -M main
git remote add origin https://github.com/<user>/perkeep-mobile.git
git push -u origin main
```
Vào tab Actions → tải artifact `pk-app-debug` → file `app-debug.apk` (~2-3MB).

Local chỉ chạy `bun run build`, không cần `android/` (CI tự `cap add android`).
Nếu muốn cài APK local sau này: `adb install app-debug.apk`.

## Lưu ý kỹ thuật
- Mỗi server lưu thêm tài khoản/mật khẩu (nếu Perkeep bật `auth userpass`). Request gửi `Authorization: Basic ...`.
- Perkeep không hỗ trợ CORS nên app dùng native HTTP của Capacitor (không bị chặn). Test trên Chrome desktop/điện thoại sẽ báo CORS — phải test trên APK thật.
- Mật khẩu lưu plaintext trong localStorage của máy (chỉ dùng LAN nhà, không dùng qua mạng công cộng không HTTPS).

## API Perkeep đã kiểm chứng (2026-10)
Verify trực tiếp trên `perkeepd` local:

| Việc | Request | Ghi chú |
|---|---|---|
| Tìm kiếm | `POST {searchRoot}/camli/search/query` | `{expression, limit, sort, describe}` ở **top level**, KHÔNG lồng trong `query` |
| Kèm metadata | thêm `describe: {rules:[{attrs:["*"],rules:[{attrs:["*"]}]}]}` | trả `description.meta[...]` trong cùng 1 request (bỏ N+1) |
| Thumbnail | `GET {uiRoot}/thumbnail/<fileBlobref>?mw=&mh=` | server tự sinh **chỉ cho ảnh**; mw/mh ≤ 2000 |
| Tải file | `GET {uiRoot}/download/<fileBlobref>` | có `Content-Disposition` + tên gốc, hỗ trợ `Range` |
| Tải blob thô | `GET {blobRoot}<blobref>` | không có tên file |
| Sống/chết | `GET {base}/` → 301 `/ui/` | auth userpass thì cần Basic |
| Discovery | `GET {base}/?camli.mode=config` | trả về blobRoot/searchRoot/uiRoot... |

Phát hiện quan trọng:
- Endpoint `.../camli/search/status` **không tồn tại**; `/status.json` cũng không (dùng `GET /`).
- Expression là **bắt buộc hợp lệ**: từ khóa trần (`hello`) báo lỗi. App tự đổi chữ thường thành `title:...`.
- `is:image` / `is:video` / `recent:` **không dùng được** ở bản này; dùng `format:jpg`, `filename:*.mp4`, `after:YYYY-MM-DD`.
- Response lỗi vẫn HTTP 200 kèm `{error, errorType}` — app phải check field `error`.
- Thumbnail tự sinh on-demand rồi cache; **không** sinh cho video/audio/PDF/tài liệu (app hiện icon theo MIME).

## Thumbnail theo loại file
Server (Perkeep) chỉ tạo thumbnail cho **ảnh**: JPEG, PNG, GIF, WebP, TIFF, HEIC/HEIF, AVIF, CR2/raw Canon (lấy JPEG nhúng). SVG chỉ đọc được kích thước. Video/audio/PDF/epub/json → `500 image: unknown format`.

App bù phần thiếu:
- **Ảnh**: `GET {uiRoot}/thumbnail/<ref>?mw=&mh=`.
- **Video**: app tự lấy 1 khung hình bằng `<video>` (seek ~10% thời lượng) — không dùng canvas nên không bị “tainted canvas”.
  - Không auth: trỏ thẳng `<video src="{uiRoot}/download/<ref}">`, trình duyệt tự gửi Range.
  - Có auth: tải 4 MB đầu bằng native HTTP rồi tạo `blob:` URL (cùng origin); nếu thiếu `moov` và file < 80 MB thì tải cả file.
  - Giới hạn 2 video cùng lúc, chỉ chạy khi cuộn tới, timeout 15 s → thất bại thì hiện icon.
  - Tắt được trong Cài đặt → “Thumbnail video” (tốn dữ liệu).
- **Loại khác**: icon SVG theo MIME.

Script kiểm chứng: `bun run scripts/check-search.mjs` (cần Perkeep đang chạy ở `localhost:3179`).

## Upload nền (job hoá) — plugin `plugins/pk-upload`

Capacitor không có sẵn upload nền, nên có plugin local tự viết (Android/Kotlin):

**Kiến trúc**
- `PkUploadPlugin.kt` — API JS: `pickFiles`, `enqueue`, `list`, `cancel`, `retry`, `clearFinished`, `wifiOnly`/`setWifiOnly`, `requestNotificationPermission`, event `progress`. Chọn file bằng SAF (`ACTION_OPEN_DOCUMENT`) + `takePersistableUriPermission` để worker đọc được khi app đã đóng.
- `UploadWorker.kt` — `CoroutineWorker`: cắt chunk 1 MiB + sha224 → `camli/stat` (resume mức chunk) → `camli/upload` phần còn thiếu → blob `file` → ký permanode + claim (`camliContent`, `title`, `mimeType`, `tag`) qua `camli/sig/sign`.
- `UploadStore.kt` — hàng đợi + cấu hình lưu trong SharedPreferences (sống qua kill app).
- `UploadNotifier.kt` — notification tiến trình (channel `pk-upload`), nút **Huỷ` (CancelReceiver).
- `PerkeepUploader.kt` — phần HTTP/Perkeep thuần: sha224, stat, multipart upload, ký.

**Chạy nền thật:** WorkManager + foreground service type `dataSync` (khai trong `plugins/pk-upload/android/src/main/AndroidManifest.xml`). Notification hiện tiến trình %, app đóng vẫn chạy. Ràng buộc mạng: `UNMETERED` khi bật "chỉ Wi-Fi" (`set-wifi`), retry backoff exponential.

**Giới hạn đã biết**
- Chỉ Android; trên web nút Tải lên báo "chỉ chạy trong app Android".
- Thumbnail/upload đều cần cleartext HTTP cho LAN (CI đã bật `usesCleartextTraffic`).
- **Đã verify bằng CI**: build xanh, APK ~4.7 MB, `include ':pk-upload'` có trong `capacitor.settings.gradle`, manifest merge đủ `FOREGROUND_SERVICE_DATA_SYNC` + `POST_NOTIFICATIONS` + `foregroundServiceType="dataSync"`.
- Chưa verify trên máy thật: luồng chọn file → chunk → `camli/stat` → upload → tạo permanode cần chạy thử trên thiết bị.

**Cách kiểm tra CI** (workflow `android-apk`):
1. Tab Actions → run mới nhất → tải artifact `pk-app-debug`.
2. Log bước “Capacitor sync” in `capacitor.settings.gradle` để biết plugin đã nạp.
3. Log bước “Kiểm tra manifest merge + APK” in quyền + `foregroundServiceType` + dung lượng APK.
