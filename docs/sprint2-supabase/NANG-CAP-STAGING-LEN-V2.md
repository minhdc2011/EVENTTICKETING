KẾT LUẬN: Diễn tập nâng cấp Supabase staging (`qxkgkbayxxaakkwtepss`) lên V2 trên **bản sao cục bộ** đã thành công. Chưa ghi gì lên staging thật. Chờ bạn duyệt trước khi chạy bước 5.

# Nâng cấp database cũ (staging) lên V2: kết quả diễn tập và kế hoạch

## 1. Mục đích

Có **một môi trường duy nhất** (staging cũ) chứa V2 thay vì hai project: giữ lịch sử và dữ liệu hiện có, chỉ áp phần còn thiếu, đúng thực hành "cập nhật tăng dần".

## 2. Vì sao cần "baseline" thay vì `db push` thẳng

Staging được dựng thủ công, **không có bảng lịch sử migration** (`supabase_migrations.schema_migrations`). Nếu `db push` thẳng, công cụ sẽ coi như DB trống và áp lại cả 15 migration cũ lên schema đã tồn tại; một số migration cũ có `DROP TABLE IF EXISTS` nên có thể mất dữ liệu. Cách an toàn: xác minh staging đã có những gì, đánh dấu các migration đó là "đã áp" (baseline), rồi chỉ áp phần mới.

## 3. Môi trường và dữ liệu diễn tập

| Mục | Giá trị |
|---|---|
| Ngày | 23/11/2026 |
| Sao lưu staging (chỉ đọc) | `D:\backup-supabase\staging-20261123-162921\` (schema 465.531 byte, data 53.585 byte; ngoài repo, không commit). Lược đồ có cùng giá trị băm với bản sao lưu P1 ngày 22/11 nên cấu trúc không đổi |
| Bản sao | Stack Supabase cục bộ riêng (project tạm `STGREHEARSAL`), khôi phục schema và dữ liệu `public` từ bản sao lưu, không có bảng lịch sử migration, y hệt staging thật |
| Dữ liệu bản sao | 6 sự kiện, 6 suất, 16 khu, 48 ghế, 8 giữ chỗ, 5 hồ sơ người dùng, 3 tổ chức, 6 cấu hình sự kiện (khớp số liệu P1) |

Hai khác biệt do **cách khôi phục** (không có ở staging thật), đã xử lý trong diễn tập: (1) bộ đếm tự tăng cần `setval` từ bản sao lưu, nếu thiếu thì thêm bản ghi mới đụng ID cũ; (2) stack cục bộ tự cấp thêm quyền EXECUTE mặc định cho một số hàm, đã thu hồi 8 quyền đó cho khớp staging thật (xác minh bằng truy vấn chỉ đọc lên staging thật).

## 4. Kết quả

### 4.1. Staging đang ở đâu (so với 15 migration cũ)

Dùng "dấu vân tay" cấu trúc (`fingerprint-cau-truc.sql`: cột, ràng buộc, chỉ mục, policy, trigger, thân hàm, quyền EXECUTE, quyền bảng, RLS, publication), chạy **trực tiếp trên staging thật bằng chế độ chỉ đọc** và đối chiếu với DB dựng từ từng mốc migration:

| Mốc migration dùng làm chuẩn | Độ lệch với staging thật (dòng thiếu / dòng khác) |
|---|---|
| ≤ `20261103090000` đến `20261104100000` | **3 / 3 chỉ ở thân 3 hàm** (khớp nhất) |
| ≤ `20261111090000` | 18 / 42 (lệch hơn: staging **chưa** có migration này) |

Staging khớp hoàn toàn 15 migration cũ ở mọi thứ **trừ thân 3 hàm**: `gan_loai_tai_khoan`, `kiem_tra_khong_tu_nang_cap_loai_tai_khoan`, `tao_to_chuc_cua_toi`. Staging chạy bản cũ của ba hàm này (thiếu lớp phòng thủ "ACL drift" và chú thích chặn tự nâng cấp vai trò). Quyền EXECUTE của chúng trên staging thật đã đúng (không cấp cho `anon`/`authenticated`). Tác vụ cron dọn giữ chỗ hết hạn có thật và đang chạy trên staging (`eventticketing-expire-seat-holds`, mỗi 10 giây).

Vì vậy cần thêm **một migration đồng bộ**: `20261123100000_dong_bo_ham_tai_khoan_voi_staging.sql` (tạo lại 3 hàm bằng `CREATE OR REPLACE` với định nghĩa hiện hành, giữ nguyên quyền; có tự kiểm tra cuối file; không đổi gì trên DB mới).

### 4.2. Diễn tập nâng cấp trên bản sao

| Bước | Kết quả |
|---|---|
| Đánh dấu 15 migration cũ là "đã áp" (`migration repair`) | Đạt |
| `migration up`: áp 12 migration còn lại (`20261111090000`, 9 migration Sprint 2, `20261123090000` PT409 và khóa giá, `20261123100000` đồng bộ hàm) | **Đạt**, không lỗi. Lịch sử migration 27/27 |
| Dữ liệu sau nâng cấp | **Còn nguyên**: 6 sự kiện, 6 suất, 16 khu, 48 ghế, 8 giữ chỗ, 5 hồ sơ, 3 tổ chức; 6 cấu hình sự kiện đều `YeuCauXacMinhOTP = false` (OTP tắt, không đổi hành vi); 20 bảng |
| So cấu trúc với DB dựng mới từ đầu (26 migration) | **Giống hệt** (0 dòng khác sau khi bỏ nhiễu pgTAP và Realtime) |
| pgTAP trên bản sao đã nâng cấp | 14 trong 15 file đạt, 833 trong 834 test. File lỗi duy nhất `sprint1_hardening.sql` kiểm tác vụ cron mà bản sao không khôi phục (cron có thật trên staging). Ba file Sprint 1 cũ cần người dùng mẫu của `seed.sql` (như đã biết) đạt sau khi nạp seed vào bản sao |
| Giữ vé đồng thời ×2 | 2/2 đạt |
| Hai BTC duyệt đồng thời ×2 | 2/2 đạt, người thua nhận `PT409` ngay |
| Ghi trực tiếp theo vai trò | BIEN_TAP và CHU_SO_HUU **bị chặn** khi đổi giá khu; chỉ còn chủ sở hữu ghi cấu hình mua vé (chủ ý, có audit) |
| Chu kỳ định giá tự động | 3/3 khớp engine |

## 5. Kế hoạch áp thật (bước 5, CHƯA chạy)

Thực hiện từ máy có CLI đã đăng nhập, theo thứ tự, dừng ngay nếu có bước lỗi:

1. Sao lưu mới (đã có `staging-20261123-162921`; tạo lại ngay trước khi áp nếu có thay đổi dữ liệu).
2. `supabase migration repair --status applied 20260927000000 20260927120000 20260929090000 20260929120000 20261005090000 20261005150000 20261006190000 20261006210000 20261007090000 20261027120000 20261027130000 20261028100000 20261103090000 20261103221500 20261104100000 --remote=qxkgkbayxxaakkwtepss`
3. `supabase db push --remote=qxkgkbayxxaakkwtepss --dry-run` rồi kiểm tra danh sách đúng 12 migration kể trên.
4. `supabase db push --remote=qxkgkbayxxaakkwtepss`. Mỗi migration chạy trong một giao dịch; nếu lỗi thì dừng, lịch sử cho biết đã áp đến đâu.
5. Chạy lại dấu vân tay trên staging, so với DB dựng mới: phải giống.
6. `supabase test db --remote=qxkgkbayxxaakkwtepss` và các script kiểm chứng (cùng bộ đã chạy trên bản sao).
7. Đẩy cấu hình Auth đã kiểm chứng (`otp_expiry = 300`, `otp_length = 6`, bỏ xác nhận email); gói Free vẫn không sửa được mẫu email nếu dùng email mặc định.
8. Trỏ lại `deploy.yml`, `.env.production`, `.env.local` về staging cũ.
9. Tạo hai tài khoản demo trên staging (`seed-demo-accounts.mjs`) nếu cần nút đăng nhập nhanh.
10. Xóa project `eventticketing-s2-sandbox` (bạn tự xác nhận trên dashboard).

Rủi ro và lưu ý:
- **Thay đổi hành vi:** sau khi áp, người dùng ẩn danh không giữ chỗ được nữa; ứng dụng đã có thanh "Cần đăng nhập để giữ ghế". Migration `20261111090000` thu hồi quyền ghi trực tiếp bảng `GHE` của `anon` và `authenticated` (đóng lỗ hổng hiện có trên staging).
- **Hoàn tác:** nếu một migration lỗi, giao dịch của nó tự hoàn tác. Nếu cần quay lại hoàn toàn, khôi phục từ bản sao lưu ở bước 1 (cần làm trên DB trống, nên đây là phương án cuối).
- **Thời gian chết:** các migration mất vài giây (áp 25 migration từ đầu trên project mới mất 13 giây).

## 6. Việc cần bạn duyệt

Bạn đồng ý áp thật (bước 5) lên staging cũ. Tôi sẽ chạy từng bước 1 đến 8 và báo kết quả; bước 10 (xóa sandbox) để bạn tự làm.
