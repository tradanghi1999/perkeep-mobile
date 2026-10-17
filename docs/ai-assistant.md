# Trợ lý AI (GĐ1–3)

## Thành phần
| Thành phần | Vai trò | Chạy ở đâu |
|---|---|---|
| `scripts/ai-bridge.mjs` | HTTP API cho app (`:4180`), token | PC |
| `.opencode/opencode.jsonc` | agent `librarian` + MCP `perkeep` | PC (OpenCode) |
| `scripts/perkeep-mcp.mjs` | tool đọc/ghi Perkeep cho agent | PC (OpenCode tự chạy) |
| `scripts/perkeep-lib.mjs` | search + tạo video-link + tag | PC |
| `scripts/watch-run.mjs` | job kiểm tra kênh (Task Scheduler gọi) | PC |
| App | tab Trợ lý, ✨ tìm kiếm, gợi ý tag, kênh, bộ sưu tập | điện thoại |

## Cài đặt trên app (1 lần)
1. Cài đặt → **Trợ lý AI**
2. Địa chỉ bridge: `https://desktop-9clnd5v.tailffa535.ts.net:10000` (dùng được cả ở nhà lẫn ra ngoài)
3. Token: đọc file `%LOCALAPPDATA%\pk-ai-token.txt` trên PC
4. Bấm **Kiểm tra** → thấy agent/model là OK.

## Dùng ngoài LAN (Tailscale)
PC và điện thoại cùng một tailnet (đăng nhập Google). `tailscale serve` đã map:
| Cổng | Dịch vụ | Ghi chú |
|---|---|---|
| `443` | Perkeep `:3179` | Funnel đang bật (công khai, vẫn cần userpass) |
| `8443` | Jellyfin `:8096` | chỉ tailnet |
| `10000` | AI bridge `:4180` | chỉ tailnet, vẫn cần token |

- Điện thoại ra ngoài: bật Tailscale, giữ nguyên URL `*.ts.net` — không đổi IP, không mở port.
- Muốn Perkeep **chỉ trong tailnet** (khuyến nghị): tắt Funnel rồi giữ serve 443:
  `tailscale funnel reset` → `tailscale serve --bg --https=443 3179`.
- Cài đặt → **Sao lưu cấu hình**: mã base64 chứa server + tài khoản + token AI + Jellyfin; dán vào máy mới là xong, không nhập lại.
- APK từ CI được ký bằng **cùng một keystore** nên cài đè giữ nguyên dữ liệu (trước đây mỗi build một khoá → buộc gỡ app → mất cấu hình).

## Tính năng
### GĐ1 — chỉ đọc
- **✨ trên ô tìm**: gõ câu tự nhiên → dịch thành biểu thức Perkeep, hiện "AI hiểu" + số kết quả.
- **Tab Trợ lý**: chat; agent dùng `perkeep_search/stats/describe/get_text`, trả lời kèm tool đã dùng.
- **Gợi ý tag** trong form thêm link (AI điền, bạn vẫn bấm Lưu).

### GĐ2 — có ghi, qua xác nhận
- **FAB → Thêm video từ kênh**: dán link kênh → RSS trả danh sách → tick → **Lưu**. Chống trùng theo tiêu đề.
- **Gắn tag hàng loạt**: sau khi ✨ tìm, bấm nút **＋** trên thanh AI → nhập tag → gắn cho tất cả kết quả.
- **Tìm mục trùng**: chat "có mục nào trùng không?" → agent dùng `perkeep_dupes` (chỉ báo, không tự xoá).

### GĐ3
- **Tóm tắt video link**: trong viewer của link YouTube → **Tóm tắt bằng AI**. YouTube đang chặn `timedtext` nên thường chỉ tóm tắt từ **mô tả**; UI ghi rõ nguồn.
- **Bộ sưu tập** (Home): là tag; thêm/xoá trong "Quản lý"; chạm chip để lọc.
- **Theo dõi kênh** (Cài đặt): thêm/sửa/xoá kênh, giờ chạy, số video, tag; task Windows tự chạy mỗi ngày; kết quả vào **hàng chờ** để duyệt.

## Cách trả lời (streaming + fast path)
- **Fast path** cho câu hỏi tra cứu: router model → biểu thức Perkeep → bridge tự search → model chỉ viết 1–2 câu tổng kết. Không mở session/tool, ~6–7s.
- **Agent path** cho hành động (thêm video, tag, web): session OpenCode + MCP, stream thật qua `session.text.delta`.
- **Không lặp thông tin**: khi có danh sách file, text chỉ là câu tổng kết; app render **file card** (bấm mở viewer). Prompt agent cấm liệt kê tên file trong text.
- Streaming: bridge phát SSE `delta` / `tool` / `done`; app đọc bằng fetch + ReadableStream, hiện cursor và nút Dừng.

## Bảo mật
- Bridge chỉ mở `:4180` với token; OpenCode vẫn ở `127.0.0.1`.
- Agent `librarian` bị **deny toàn bộ** trừ tool đọc Perkeep + websearch/webfetch.
- Mọi thao tác ghi từ app đều do người dùng bấm (Lưu/Gắn tag), không có auto-write.

## Giới hạn đã biết
- **YouTube chặn phụ đề** với request ẩn danh → tóm tắt dựa trên mô tả.
- **Task theo dõi** chỉ chạy khi PC bật và bridge đang chạy (bridge tự bật khi đăng nhập).
- Mỗi câu hỏi dùng model → tốn token; giới hạn steps 10.
- Bridge/MCP dùng key DeepSeek của bạn; free tier của OpenCode bị chặn cho client ngoài.

## Endpoint
| Endpoint | Việc |
|---|---|
| `GET /ai/health` | trạng thái |
| `POST /ai/search {text}` | câu nói → biểu thức |
| `POST /ai/ask {text}` | chat có tool |
| `POST /ai/ask/stream {text}` | chat dạng SSE (fast path hoặc agent) |
| `POST /ai/tags` | gợi ý tag |
| `POST /ai/channel {url,limit}` | video mới của kênh (RSS) |
| `POST /ai/save_links {links,tags}` | tạo video-link |
| `POST /ai/tag {refs,tag}` | gắn tag hàng loạt |
| `POST /ai/dupes` | nhóm trùng |
| `POST /ai/summary {url}` | tóm tắt |
| `POST /ai/watch {action,…}` | CRUD + hàng chờ theo dõi kênh |

Tất cả cần header `x-pk-token`.
