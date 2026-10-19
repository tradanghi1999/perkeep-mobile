# UX Plan — Perkeep Mobile theo kiểu Google Drive (user phổ thông)

## 1. Nguyên tắc
- **Giấu kỹ thuật:** blobref, claim, camliContent/Member/Path, signer, describe JSON, POST log → chỉ trong Cài đặt → Chẩn đoán.
- **Hiện thứ user hiểu:** tên, ảnh, ngày, dung lượng, tag, album, nút Chia sẻ / Ghim / Tải về.
- **Học Drive:** search bar trên cùng + avatar đổi server, bottom nav 4 mục, FAB `+`, bottom sheet thao tác file, snackbar thay dialog chặn.

## 2. Cấu trúc app (4 tab dưới)
1. **Nhà** — “Mới đây / Đề xuất” = `GET recent?n=30` + vài query mẫu. Không dump blob thô.
2. **Ảnh** — grid thumbnail, mặc định. Lọc chip: [Ảnh][Video][Tháng này].
3. **Tệp** — list tất cả, toggle list/grid, sort Mới nhất/Tên/Loại.
4. **Cài đặt** — Dịch vụ (servers), Ghim, Offline, Chẩn đoán (log kỹ thuật).

Server switcher đặt ở **avatar trong thanh tìm kiếm** (như Drive đổi tài khoản), không chiếm 1 tab.

## 3. Tìm kiếm tiếng Việt → Perkeep expression
| User gõ/chạm | App dịch thành expression |
|---|---|
| `ảnh đà lạt` | `is:image title:đà lạt` |
| Chip [Ảnh] | `is:image` |
| Chip [Tháng này] | `after:2026-10-01` |
| Chip [Giấy tờ] | `format:pdf` |
| `cmnd` | `title:cmnd` (+ gợi ý chip Loại) |
| Rỗng + Enter | `recent:30` |

Luôn `POST {searchRoot}/camli/search/query` rồi `POST .../describe` để lấy tên/ngày/thumb. Power-user mở “Nâng cao” mới thấy expression gốc.

## 4. Thao tác file (bottom sheet khi chạm ⋮)
`Tải về máy · Chia sẻ link · Ghim · Lưu offline · Chi tiết` — vuốt xuống đóng, làm 1 tay được.
Bản đầu chỉ làm: Tải về (qua `/ui/?p=` + download handler của instance), Chia sẻ (copy link), Ghim (local).

## 5. Thêm server (như thêm tài khoản Google)
Mỗi server: **tên gợi nhớ + URL + auth (nếu có)**. List hiện chấm online (test `GET /` → redirect `/ui/` là sống).
Thêm mới chỉ 2 ô. Có import/export JSON khi đã ổn định. Auth userpass lưu theo từng server.

## 6. Không làm (để khỏi rối như bản kỹ thuật cũ)
- Không hiện blobref/hash, claim, signer, JSON describe ngoài màn hình chính.
- Không bắt user học `tag:`, `attr:`, `camliContent`.
- Không nút “Test /status.json” (endpoint này không tồn tại trên Perkeep — đã verify 404).
- Không upload/scan ở bản đầu, trừ khi bạn chốt cần.

## 7. Đề xuất chốt
Bản tiếp theo code: Home (recent) + Search chips + Server-switcher avatar + bottom sheet 4 thao tác. Upload/scan để bản sau.
