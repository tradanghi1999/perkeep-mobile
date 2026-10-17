# perkeep-mobile — app Android cho Perkeep (Vite + Capacitor)

Client Perkeep cho Android: tìm kiếm, thumbnail, upload chạy nền. Web chỉ để dev; APK build trên GitHub Actions.

## Tính năng
- **Tìm kiếm không cần cú pháp**: thanh chip lọc **luôn hiện** dưới ô tìm kiếm (kiểu Google Drive):
  - `Loại tệp: Tất cả ▾` — Ảnh / Video / Âm thanh / Tài liệu (ẩn ở tab Ảnh vì tab đó vốn là ảnh)
  - `Thời gian: Bất kỳ ▾` — Hôm nay / 7 ngày qua / Tháng này / Năm nay
  - `Sắp xếp: Mới nhất ▾` — Mới nhất / Cũ nhất / Tên A→Z
  - `Tìm theo: Tên tệp ▾` — **Tên tệp** (mặc định) / **Tag** / **Cú pháp Perkeep**
  - Chạm một chip để mở sheet riêng của nhóm đó; sheet luôn hiện **câu lệnh sẽ gửi tới Perkeep**
  - Khi gõ từ khoá sẽ có chip `Từ khoá: … ✕` để bỏ nhanh; có nút "Xoá bộ lọc"
  - Ô nhập đổi gợi ý theo kiểu tìm (`Nhập tên tệp…` / `Nhập tag (đúng chính xác)…` / `vd: tag:phone before:2026`)
- **Vì sao lọc thời gian/từ khoá-theo-tên làm ở máy**: `after:` của Perkeep so mốc khác nhau tuỳ câu truy vấn (thời gian file vs permanode), còn `filename:` là glob **phân biệt hoa/thường**; lọc ở máy cho kết quả đúng như ngày/tên đang hiển thị, bỏ dấu tiếng Việt. Tìm theo Tag thì dùng `tag:` của server (khớp chính xác).
- **Xem file trong app**: chạm vào dòng để mở trình xem toàn màn hình — ảnh, video (có điều khiển, tự phát), audio.
  - Chuyển file bằng nút ‹ › hoặc **vuốt ngang**; **vuốt xuống để đóng**; Esc khi test desktop.
  - PDF và loại khác: WebView Android không render được → nút **Mở bằng ứng dụng khác** (Chrome/ứng dụng PDF) và **Tải về máy**.
  - Server bật auth: ảnh lấy qua endpoint thumbnail; video/audio dùng nút mở ngoài.
  - Thay cho tab Ảnh cũ: muốn xem riêng ảnh thì dùng `Loại tệp: Ảnh` + `Kiểu xem: Lưới lớn`.
- **Kéo xuống để tải lại** (pull-to-refresh) ở tab Nhà / Ảnh / Tệp; **vuốt xuống để đóng** mọi bottom sheet.
- **Cuộn vô hạn (infinite scroll)**: danh sách nạp theo **trang 30 mục** bằng token `continue` của Perkeep — cuộn tới đâu tải tới đó, không tải cả kho một lần.
  - Chân danh sách hiện trạng thái đang tải / **Đã hết**; máy không có `IntersectionObserver` thì hiện nút **Tải thêm**.
  - Lọc thời gian/từ khoá vẫn làm ở máy **theo từng trang**; nếu cả trang bị lọc hết, app tự nạp tiếp (tối đa 6 trang/lần) hoặc để nút **Tải thêm**, tránh nạp liên tục.
  - Mục ngoài màn hình dùng `content-visibility: auto` → trình duyệt bỏ qua layout/paint, nhẹ RAM/CPU khi kho có hàng nghìn file.
- **Thumbnail**: ảnh do server sinh; video do app tự lấy khung hình.
- **Upload nền** kiểu Google Drive (WorkManager + notification tiến trình).
- **Nhiều dịch vụ Perkeep** + song ngữ VI/EN.
- **Ghim (Starred)**: tab **Ghim** liệt kê mọi file đã ghim; trong menu ⋮ của file có **Ghim / Bỏ ghim**.
  - Ghim = tag `star` trên Perkeep (không phải lưu cục bộ) nên **đồng bộ giữa các thiết bị** và tìm lại được bằng `Tìm theo → Tag`.
- **Kiểu xem List / Lưới lớn**: nút cạnh ô tìm kiếm đổi giữa **Danh sách** và **Lưới lớn** (2 cột, icon to có thumbnail), nhớ lựa chọn cho lần sau.
- **Tag**: mở file → **Thêm tag** để gắn tag, chip tag hiện trong sheet (bấm ✕ để bỏ); tag cũng hiện luôn trên dòng file (`#tag`). Tìm lại bằng **Tìm theo → Tag**.
  - Cách làm: app ký claim `add-attribute` / `del-attribute` qua sign handler của Perkeep rồi upload blob claim. Cần SHA-224 trong JS vì WebCrypto không hỗ trợ SHA-224 (`src/sha224.js`, đã test với vector NIST + đối chiếu Node).
- **Cỡ chữ**: Cài đặt → Cỡ chữ (Nhỏ / Vừa / Lớn / Rất lớn). Mọi cỡ chữ trong app dùng `rem` với biến `--fs`, nên chỉnh một chỗ là đổi toàn bộ. Cỡ mặc định đã theo chuẩn Android (chữ danh sách 16px, phụ chú 13px, nhãn tab 12px).

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
- **Cloudflare Access**: nếu Perkeep nằm sau Cloudflare Tunnel + Zero Trust, điền **Service Token** (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) trong form dịch vụ — app gửi 2 header này trên mọi request (tìm kiếm, thumbnail, upload, proxy media, mở bằng VLC).
  - Tạo token: Cloudflare Zero Trust → **Access → Service Auth → Create Service Token**, rồi thêm rule **Service Auth** vào policy của ứng dụng.
  - **Không dùng được luồng OTP email**: Access phát JWT qua cookie `CF_Authorization` sau khi nhập OTP trong trình duyệt; app không nhúng được trang đăng nhập đó và cookie không dùng được cho request native. Service Token là cách Cloudflare khuyến nghị cho máy-với-máy.
  - App tự nhận diện CF Access (redirect tới trang đăng nhập Cloudflare) và báo rõ, tự mở sẵn mục nhập token.
- **Proxy media nội bộ**: `<video>` không gửi được header xác thực, nên khi server chặn truy cập ẩn danh app mở một HTTP server nhỏ (`MediaProxyServer`, NanoHTTPD) trên `127.0.0.1` + token ngẫu nhiên, thêm header xác thực rồi chuyển tiếp `Range` → phát và tua được mọi kích thước.
- **Mở bằng VLC/MX Player**: file được tải về cache rồi chia sẻ qua `FileProvider` (`PkFileProvider`, authority `<package>.pkupload.files`) — cần thiết cho video AV1/HEVC mà WebView không giải mã được.
- **Phát hiện codec**: chỉ cần 32 byte đầu (`ftyp`) để biết AV1/HEVC; không nhúng ffprobe/ffmpeg (nặng 50–100MB mà không giúp giải mã).
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
| Phân trang | thêm `continue: "<token>"` vào body | trả `{blobs, description, continue}`; token chỉ dùng lại với **đúng** expression/limit/sort, hết trang thì `continue` rỗng |
| Tải blob thô | `GET {blobRoot}<blobref>` | không có tên file |
| Sống/chết | `GET {base}/` → 301 `/ui/` | auth userpass thì cần Basic |
| Discovery | `GET {base}/?camli.mode=config` | trả về blobRoot/searchRoot/uiRoot... |

Phát hiện quan trọng:
- Endpoint `.../camli/search/status` **không tồn tại**; `/status.json` cũng không (dùng `GET /`).
- Expression là **bắt buộc hợp lệ**: từ khóa trần (`hello`) báo lỗi. App tự đổi chữ thường thành `title:...`.
- `is:image` / `is:video` / `recent:` **không dùng được** ở bản này; dùng `format:jpg`, `filename:*.mp4`, `after:YYYY-MM-DD`.
- Response lỗi vẫn HTTP 200 kèm `{error, errorType}` — app phải check field `error`.
- Thumbnail tự sinh on-demand rồi cache; **không** sinh cho video/audio/PDF/tài liệu (app hiện icon theo MIME).

## Export file gốc ra đĩa (Jellyfin / phát nhanh hơn)

Perkeep lưu blob **content-addressed** chứ không phải file trên filesystem, và blob có thể nằm trên ổ chậm (USB/HDD). Video gốc 1080p60 (~25–30 Mbps) lại **không được transcode**, nên phát trực tiếp dễ giật. Muốn dùng **Jellyfin** (transcode + HLS) làm "backend phát" thì phải có **file thật** trên đĩa → cần bước export:

```powershell
# video (mặc định) -> thư mục trên SSD, kèm faststart (moov lên đầu)
bun scripts/export-media.mjs --out C:\pk-export --faststart

# mọi loại / ảnh / nhạc / tài liệu
bun scripts/export-media.mjs --out C:\pk-export --type all
bun scripts/export-media.mjs --out C:\pk-export --type image

# chỉ 1 file, hoặc xem trước không tải
bun scripts/export-media.mjs --out C:\pk-export --expression 'filename:bbb_test.mp4'
bun scripts/export-media.mjs --out C:\pk-export --dry-run
```

- Giữ **tên file gốc** qua `GET {uiRoot}/download/<ref>`; phân trang bằng `continue`; ghi `.part` rồi mới đổi tên; **bỏ qua file đã có** nên chạy lại rất nhanh (idempotent).
- **`--faststart`**: chuyển atom `moov` lên đầu bằng `ffmpeg -c copy -movflags +faststart` — **không re-encode** (vài giây, giữ nguyên chất lượng).
  - Vì sao cần: file quay bằng điện thoại/ffmpeg thường để `moov` ở **cuối** file, nên player phải tải gần hết file mới biết codec/index → bắt đầu phát rất chậm hoặc **không phát được**. Đo thực tế trên 5 file trong Perkeep: **cả 5 đều có `moov` ở 98–99.99%**.
- Ghi kèm `manifest.json` (`fileRef`, `name`, `size`, `localSize`, `mime`, `status`) để app/Jellyfin đối chiếu. `localSize` là kích thước **sau** faststart (khác bản gốc) — nhờ đó lần chạy sau không tải lại.
- Máy dev này: SSD là `C:` (SATA), blob Perkeep nằm trên `D:` (USB) → export sang `C:\pk-export` để phát mượt hơn.
- Đo codec/bitrate thực tế (`ffprobe`) — quyết định có cần Jellyfin transcode hay không:

| File | Codec | Độ phân giải | Bitrate | Ghi chú |
|---|---|---|---|---|
| `20260926_095420.mp4` | H.264 | 1920x1080 | **~28 Mbps** | bitrate quá cao cho WiFi/4G → phải transcode |
| `Tu_Bat_Hao_Thanh_Bac_Si_Tap_2_Long_Tieng.mp4` | H.264 | 1920x1080 | 1.8 Mbps | phát trực tiếp được sau faststart |
| `Kasaba_Doktoru_Tap_15_Long_Tieng_Tieng_Viet.mp4` | **AV1** | 1280x720 | 0.28 Mbps | WebView thường **không giải mã AV1** |
| `video_gan_vs_silicon_tieng_viet_chuan.mp4` | **AV1** | **3840x2160** | 2.0 Mbps | AV1 + 4K → không phát trong WebView |
| `bbb_test.mp4` | H.264 | 320x176 | 0.3 Mbps | file test nhỏ |

→ H.264 thì chỉ cần faststart là phát tốt; **AV1 và file bitrate cao cần Jellyfin transcode** (hoặc nút "Mở bằng VLC").

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
