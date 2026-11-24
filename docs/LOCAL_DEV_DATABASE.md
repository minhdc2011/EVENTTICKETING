# CSDL cục bộ (Supabase) cho phát triển và kiểm thử

Mục tiêu: ai clone repo cũng dựng được **đúng** CSDL từ chuỗi migration và chạy được toàn bộ test pgTAP, không cần dùng dự án Supabase đang chạy demo.

## Yêu cầu

- Docker Desktop đang chạy (lần đầu tải khoảng 2 GB image, các lần sau rất nhanh).
- Node 22 trở lên. Không cần cài Supabase CLI: các lệnh dưới đây dùng `npx` với phiên bản được ghim trong `package.json`.

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `npm run db:start` | Khởi động Supabase cục bộ và áp dụng **toàn bộ** migration từ đầu, rồi nạp `supabase/seed.sql` |
| `npm run db:reset` | Xóa CSDL cục bộ và dựng lại từ migration (dùng khi thêm hoặc đổi migration) |
| `npm run db:test` | Chạy toàn bộ pgTAP trong `supabase/tests/` (đây cũng là bộ chạy trên GitHub cho mọi PR đụng `supabase/`) |
| `npm run db:status` | In URL và khóa cục bộ (API `http://127.0.0.1:54321`, hộp thư thử `http://127.0.0.1:54324`) |
| `npm run db:stop` | Dừng các container |

Dùng khóa in ra từ `npm run db:status` cho các script cần `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`. Khóa cục bộ là khóa mặc định của Supabase CLI, không phải bí mật của dự án thật; **không** dán khóa của dự án staging hoặc production vào đây.

## Quy tắc để chuỗi migration luôn chạy lại được

1. Chỉ **thêm** migration mới với mốc thời gian lớn hơn mọi migration hiện có; không sửa migration đã áp dụng ở staging. Ngoại lệ duy nhất đến nay: `20261104100000_seed_ticketgo_and_ticketmaster_events.sql` được sửa một lần (tắt rồi bật lại trigger `trg_kiem_tra_cong_bo_su_kien` quanh dữ liệu mẫu) vì dữ liệu mẫu đã công bố không thể chèn khi chưa có người dùng đăng nhập, khiến chuỗi migration không chạy lại được từ đầu. Việc sửa không làm đổi kết quả trên staging (CSDL đã ghi nhận migration theo phiên bản).
2. Dữ liệu mẫu đã công bố chèn bằng migration phải tự xử lý trigger bảo vệ công bố như trên, hoặc chèn ở trạng thái nháp rồi cập nhật qua hàm hợp lệ.
3. Mỗi migration mới phải idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`).
4. Trước khi mở PR chứa migration: `npm run db:reset` rồi `npm run db:test` phải xanh. Workflow `DB replay` làm đúng hai bước này cho mọi PR đụng tới `supabase/`.

## Viết file pgTAP mới

- Đặt trong `supabase/tests/`, tự chạy được bằng `npm run db:test` (không cần đăng ký ở đâu khác).
- **Tự tạo toàn bộ fixture** trong giao dịch của file: `auth.users`, `HO_SO_NGUOI_DUNG` với `LoaiTaiKhoan` (quyền sửa sự kiện yêu cầu `ORGANIZER` hoặc `ADMIN`), `TO_CHUC`, `THANH_VIEN_TO_CHUC`. Bắt đầu bằng `BEGIN; SELECT plan(N);`, kết thúc bằng `SELECT * FROM finish(); ROLLBACK;`, và `N` phải đúng số khẳng định.
- Khi giả lập người dùng, đặt **cả hai**: `SET LOCAL ROLE authenticated;` rồi `SET LOCAL "request.jwt.claim.sub" = '<uuid>';` và `SET LOCAL "request.jwt.claim.role" = 'authenticated';`. Hàm `auth.role()` đọc claim `role`; thiếu dòng này thì các kiểm tra "chặn người khác" không chạy và test báo sai. Với người ẩn danh dùng `SET LOCAL ROLE anon;`, với quản trị hệ thống dùng `SET LOCAL ROLE service_role;` kèm claim `role = 'service_role'`. Nhớ `RESET ROLE;` sau mỗi đoạn.
- `supabase/seed.sql` chỉ có fixture cục bộ cho các file cũ (nạp khi `db:start` và `db:reset`, không bao giờ áp lên dự án từ xa); file mới không được dựa vào nó.

## OTP email (FR-T2-01) trên môi trường cục bộ

Đã kiểm chứng trên Supabase cục bộ (17/11/2026):

- `signInWithOtp({email, options: {shouldCreateUser: false}})` rồi `verifyOtp({email, token, type: 'email'})` chạy được; thư nằm ở hộp thư thử `http://127.0.0.1:54324`.
- **Email phải chứa mã 6 số**: mẫu mặc định chỉ có đường dẫn. `supabase/config.toml` khai báo mẫu `supabase/templates/magic_link.html` dùng `{{ .Token }}`. **Dự án thật cũng phải đặt mẫu tương tự** (Dashboard > Authentication > Emails > Magic link).
- Hiệu lực mã và khoảng cách gửi lại là cấu hình của Supabase Auth: `[auth.email] otp_expiry = 300` (5 phút) và `max_frequency = "60s"` trong `config.toml`; trên dự án thật chỉnh ở Dashboard (Authentication).
- Token sau khi xác minh có claim `amr = [{"method":"otp","timestamp":<giây>}]`, giữ nguyên `timestamp` sau khi làm mới phiên. Máy chủ đọc claim này (`auth.jwt() -> 'amr'`): `da_xac_minh_otp()` (OTP trong 24 giờ) và, cho thanh toán, `moc_otp_moi_nhat()`; từ 24/11/2026 `xac_nhan_thanh_toan` đòi **một OTP mới cho mỗi lần thanh toán** (xác minh sau khi giữ chỗ được tạo và chưa dùng cho giao dịch khác), kiểm chứng thật bằng `scripts/verify-otp-moi-lan-local.mjs`.
- Supabase Auth **không** có cơ chế khóa tài khoản 15 phút sau 5 lần nhập sai; chỉ có giới hạn tốc độ xác minh chung (`[auth.rate_limit] token_verifications`). Phần "sai 5 lần thì khóa" chỉ có thể là giới hạn hiển thị phía giao diện.

## Trạng thái pgTAP (17/11/2026, dựng từ đầu bằng `npm run db:reset`)

Toàn bộ **6 file, 101 khẳng định đạt**: `account_role_boundary` (31), `marketplace_organizer_mvp` (23), `organizer_event_creation_slice` (18), `product_foundation`, `server_side_seat_generation` (27), `sprint1_hardening`.

Các sửa đã làm để đạt trạng thái này (không có thay đổi nào ở mã nghiệp vụ hay migration ngoài file seed nói ở quy tắc 1):

- Test cũ giả định fixture đã có sẵn trên staging; nay có `supabase/seed.sql` cho môi trường cục bộ.
- `account_role_boundary.sql` từng có 4 khẳng định không đạt (dò loại tài khoản người khác, tự nâng quyền, anon gọi hàm quản trị). Nguyên nhân là test thiếu claim `role` trong phiên giả lập (và một đoạn chạy bằng quyền superuser thay vì `anon`), **không phải** lỗ hổng ở hàm hay migration; sau khi sửa test, hàm chặn đúng như thiết kế.
- `organizer_event_creation_slice.sql` khai báo sai số khẳng định (19, thực tế 18) và thiếu cột `MauSacHex` bắt buộc ở dữ liệu mẫu.
- `product_foundation.sql` và `sprint1_hardening.sql` là script khẳng định không dùng TAP; đã thêm `plan`, `pass`, `finish` ở cuối để `supabase test db` ghi nhận.
- `supabase/tests-stale/organizer_schedule_lineup_slice.sql` đã chuyển ra khỏi bộ chạy: nó kiểm thử dựa trên bảng `LICH_TRINH`, bảng này đã bị bỏ có chủ ý ở migration `20261028100000` (lịch trình lưu trong mô tả sự kiện). Cần viết lại theo thiết kế hiện tại rồi chuyển về `supabase/tests/`.

## Lưu ý

- CSDL cục bộ dùng cổng 54321 đến 54324. Nếu cổng đang bị chiếm, dừng dịch vụ khác hoặc đổi cổng trong `supabase/config.toml`.
- Dữ liệu cục bộ mất khi chạy `db:reset`; đừng để dữ liệu quan trọng ở đó.
