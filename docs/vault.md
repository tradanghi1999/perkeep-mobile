# Vault (nhiều vault, mật khẩu)

Thiết kế đã duyệt: `docs/wireframe-vault.html` · link LAN: `http://192.168.123.9:4173/docs/wireframe-vault.html`

## Dùng
1. **Cài đặt → Vault → Tạo vault**: tên + mật khẩu (≥ 6 ký tự).
2. Mở vault → màn vault riêng, tìm kiếm **chỉ trong vault**.
3. Thêm file:
   - Trong vault: nút **＋** → chọn file từ thư viện chính.
   - Ngoài thư viện: long-press/⋮ file → **Đưa vào vault**.
4. **Lấy ra khỏi vault** trong menu file khi đang ở trong vault.
5. **⋮ → Xoá vault**: gõ tên vault để xác nhận. Các file **hiện lại** trong thư viện, không bị xoá.

## Cơ chế
- Mỗi file trong vault gắn 2 tag: `pkvault` và `pkvault-<vaultId>`.
- Mọi tìm kiếm thư viện chính (Home/Tệp/⭐/tìm kiếm) tự thêm `-tag:pkvault`.
- AI bridge + MCP `perkeep_search`/stats/dupes cũng dùng `-tag:pkvault`.
- Vault query riêng: `tag:pkvault-<vaultId>` (+ `filename`/`title` khi tìm).
- **1 file thuộc 1 vault**: thêm vào vault khác = chuyển vault.
- **Xoá vault** = gỡ tag của toàn bộ file; blob gốc không bị xoá.
- Mật khẩu: **PBKDF2-SHA256 + salt** (150k vòng), lưu hash; không lưu plaintext.
- Mở khoá giữ trong phiên; nút **Khoá**; đóng app là khoá; tự khoá sau **5 phút** ở nền.
- **Quên mật khẩu**: vẫn xoá được vault (gõ tên) để file hiện lại — không cần mật khẩu.
- Mã **Sao lưu cấu hình** có `pk-vaults-v1` (metadata + hash); file/tag nằm trong Perkeep.

## Giới hạn
- Đây là vault **cấp app** (ẩn + mật khẩu), **không mã hoá blob**.
- Perkeep Web UI, Jellyfin và client khác vẫn thấy/thao tác file gốc.
- Jellyfin/rclone gateway chưa lọc vault; nếu cần ẩn cả Jellyfin phải lọc ở gateway (chưa làm).
- Upload trực tiếp trong vault chưa có: upload bình thường rồi **Đưa vào vault**.
- Vault screen hiển thị tối đa 100 file/lần tìm; đủ cho v1.
- Nếu cần “không ai đọc được kể cả có server” → giai đoạn 2: mã hoá client-side trước khi upload.

## File
- `src/main.js`: UI/state vault, PBKDF2, add/remove/delete, query filter.
- `scripts/perkeep-lib.mjs`: `hideVaultExpr`, `search()` mặc định ẩn vault.
- `scripts/ai-bridge.mjs`: count `/ai/search` lọc vault.
- `.opencode` MCP dùng `perkeep-lib` nên tự lọc.
