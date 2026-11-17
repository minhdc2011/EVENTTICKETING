# CSDL cục bộ (Supabase) cho phát triển và kiểm thử

Mục tiêu: ai clone repo cũng dựng được **đúng** CSDL từ chuỗi migration và chạy được toàn bộ test pgTAP, không cần dùng dự án Supabase đang chạy demo.

## Yêu cầu

- Docker Desktop đang chạy (lần đầu tải khoảng 2 GB image, các lần sau rất nhanh).
- Node 22 trở lên. Không cần cài Supabase CLI: các lệnh dưới đây dùng `npx` với phiên bản được ghim trong `package.json`.

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `npm run db:start` | Khởi động Supabase cục bộ và áp dụng **toàn bộ** migration từ đầu |
| `npm run db:reset` | Xóa CSDL cục bộ và dựng lại từ migration (dùng khi thêm hoặc đổi migration) |
| `npm run db:test` | Chạy toàn bộ pgTAP trong `supabase/tests/` (hiện còn 2 file chưa xanh, xem mục Trạng thái) |
| `npm run db:test:ci` | Chạy các file pgTAP đang xanh (đây là bộ chạy trên GitHub cho mọi PR đụng `supabase/`) |
| `npm run db:status` | In URL và khóa cục bộ (API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`) |
| `npm run db:stop` | Dừng các container |

Dùng khóa in ra từ `npm run db:status` cho các script cần `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`. Khóa cục bộ là khóa mặc định của Supabase CLI, không phải bí mật của dự án thật; **không** dán khóa của dự án staging hoặc production vào đây.

## Quy tắc để chuỗi migration luôn chạy lại được

1. Chỉ **thêm** migration mới với mốc thời gian lớn hơn mọi migration hiện có; không sửa migration đã áp dụng ở staging. Ngoại lệ duy nhất đến nay: `20261104100000_seed_ticketgo_and_ticketmaster_events.sql` được sửa một lần (tắt rồi bật lại trigger `trg_kiem_tra_cong_bo_su_kien` quanh dữ liệu mẫu) vì dữ liệu mẫu đã công bố không thể chèn khi chưa có người dùng đăng nhập, khiến chuỗi migration không chạy lại được từ đầu. Việc sửa không làm đổi kết quả trên staging (CSDL đã ghi nhận migration theo phiên bản).
2. Dữ liệu mẫu đã công bố chèn bằng migration phải tự xử lý trigger bảo vệ công bố như trên, hoặc chèn ở trạng thái nháp rồi cập nhật qua hàm hợp lệ.
3. Mỗi migration mới phải idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`).
4. Trước khi mở PR chứa migration: `npm run db:reset` rồi `npm run db:test:ci` phải xanh. Workflow `DB replay` trên GitHub chạy dựng CSDL từ đầu và bộ `db:test:ci` cho mọi PR đụng tới `supabase/`.
5. File pgTAP mới phải **tự tạo fixture** trong giao dịch của nó (`auth.users`, `HO_SO_NGUOI_DUNG` với `LoaiTaiKhoan`, `TO_CHUC`, `THANH_VIEN_TO_CHUC`) và kết thúc bằng `ROLLBACK`. `supabase/seed.sql` chỉ có fixture cục bộ cho các file cũ; quyền sửa sự kiện yêu cầu hồ sơ `ORGANIZER` hoặc `ADMIN`.

## Lưu ý

- CSDL cục bộ dùng cổng 54321 đến 54324. Nếu cổng đang bị chiếm, dừng dịch vụ khác hoặc đổi cổng trong `supabase/config.toml`.
- Dữ liệu cục bộ mất khi chạy `db:reset`; đừng để dữ liệu quan trọng ở đó.

## Trạng thái pgTAP (17/11/2026, dựng từ đầu bằng `npm run db:reset`)

| File | Kết quả |
|---|---|
| `marketplace_organizer_mvp.sql` | đạt 23/23 |
| `server_side_seat_generation.sql` | đạt 27/27 (file này trước đó chưa từng được chạy) |
| `product_foundation.sql`, `sprint1_hardening.sql` | đạt (là script khẳng định không dùng TAP; đã thêm dòng `plan`, `pass`, `finish` ở cuối để `supabase test db` ghi nhận) |
| `account_role_boundary.sql` | **27/31**: ba khẳng định 22 đến 24 và khẳng định 12 chưa đạt (xem dưới) |
| `organizer_event_creation_slice.sql` | 18 khẳng định đều đạt nhưng khai báo `plan(19)`; cần tìm khẳng định thứ 19 không chạy |
| `tests-stale/organizer_schedule_lineup_slice.sql` | đã chuyển ra khỏi bộ chạy: kiểm thử dựa trên bảng `LICH_TRINH`, bảng này đã bị bỏ có chủ ý ở migration `20261028100000` (lịch trình lưu trong mô tả sự kiện); cần viết lại |

Cần rà soát `account_role_boundary.sql`, vì có thể là **lệch giữa chuỗi migration và dự án staging** (chuỗi migration dựng từ đầu cho kết quả khác):
- Khẳng định 23 và 24: `lay_loai_tai_khoan(uuid)` và `la_ban_to_chuc(uuid)` cho `anon` và `authenticated` gọi được và trả kết quả cho UUID của người khác (test mong đợi lỗi `42501`).
- Khẳng định 22: người mua cập nhật trực tiếp `LoaiTaiKhoan` của chính mình không bị chặn trong môi trường test (test mong đợi lỗi `42501`).
- Khẳng định 12: khẳng định `anon` không gọi được `gan_loai_tai_khoan`; ACL đúng (chỉ `postgres` và `service_role`) nên nhiều khả năng test chưa chuyển vai trò đúng cách.
Chưa kết luận đây là lỗ hổng thật hay lỗi test; cần người đọc `20261006210000_user_organizer_boundary.sql` và `20261007090000_fix_account_role_function_overload.sql`.
