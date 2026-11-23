KẾT LUẬN: Chuỗi 25 migration và toàn bộ test máy chủ chạy đạt trên Supabase **hosted** (project sandbox mới). Phát hiện mới cần xử lý trước khi triển khai: cấu hình Auth mặc định của hosted **sai với đặc tả OTP** (hết hạn 3600 giây, mẫu email không có mã) và gói Free **không cho sửa mẫu email** nếu không cấu hình SMTP riêng. Lỗi `40001` bị PostgREST thử lại cũng **xảy ra trên hosted**.

# Kiểm chứng Sprint 2 trên Supabase hosted (project sandbox)

Báo cáo này bổ sung `P2-P5-kiem-chung-supabase-cuc-bo.md` (cùng kịch bản, chạy trên hosted). Chỉ ghi điều đã chạy.

## 1. Mục đích

Đóng các mục "chưa kiểm chứng trên hosted" của Sprint 2: áp migration từ đầu, pgTAP, cấu trúc và quyền, OTP, Realtime và độ trễ giá, chu kỳ định giá, cuộc đua đồng thời, ghi trực tiếp, advisors.

## 2. Môi trường

| Thành phần | Giá trị |
|---|---|
| Ngày chạy | 23/11/2026, Asia/Saigon |
| Project | `eventticketing-s2-sandbox` (ref `knmcvwwwusyneogqcgls`), tổ chức Team4_SysDes, vùng ap-southeast-1, **gói Free**, tạo bằng Supabase CLI sau khi tài khoản được cấp quyền. **Không phải** staging `qxkgkbayxxaakkwtepss` (không bị động tới) |
| PostgreSQL | 17.12 (staging: 17.6) |
| Auth (GoTrue) | v2.198.0 (trùng staging) |
| Supabase CLI | 3.2.0 |
| Khóa | Lưu ở `.env.sandbox.local` (bị `.gitignore` bỏ qua); không có trong báo cáo |
| Máy chạy | Windows, mạng Việt Nam tới ap-southeast-1 (RPC khứ hồi 88 đến 130 ms) |

## 3. Các bước đã làm

1. `supabase projects create` (sau khi bạn xác nhận), lấy khóa API vào file môi trường.
2. `supabase db push --remote`: áp 25 migration từ project trống.
3. `supabase test db --remote`: chạy pgTAP trên hosted (qua Docker).
4. Truy vấn chỉ đọc cấu trúc, RLS, Realtime, quyền hàm (`supabase db query --remote`).
5. `supabase config diff/push --remote`: so và đẩy cấu hình Auth.
6. Các script kiểm chứng: `verify-otp-local.mjs` (chế độ không hộp thư), `measure-price-latency.mjs`, `verify-pricing-cycle-local.mjs`, `concurrency-limit.mjs`, `concurrency-approve.mjs`, `verify-direct-writes.mjs`; `supabase db advisors --remote`.

## 4. Kết quả theo tiêu chí

### 4.1. Migration và pgTAP

| Kiểm tra | Kết quả |
|---|---|
| Áp 25 migration từ project trống | **Đạt**, mất 13 giây, không migration nào lỗi. Hosted có lịch sử migration đầy đủ (khác staging cũ) |
| pgTAP trên hosted | **14 file, 820 test, PASS** (trùng số liệu cục bộ) |
| Lưu ý | Lần chạy đầu chỉ 11/14 file đạt: ba file Sprint 1 (`marketplace_organizer_mvp`, `organizer_event_creation_slice`, `server_side_seat_generation`) cần người dùng mẫu `11111111-aaaa-…` do `supabase/seed.sql` tạo, mà `seed.sql` chỉ chạy khi `db reset` cục bộ. Nạp seed vào sandbox rồi chạy lại thì cả 14 file đạt. Đây là đặc điểm đã ghi ở `LOCAL_DEV_DATABASE.md`, không phải lỗi mã |
| Số bảng | 20 bảng public (14 Sprint 1 + 6 Sprint 2) |
| RLS | Bật trên cả 7 bảng Sprint 2 và `CAU_HINH_SU_KIEN` |
| Realtime | Publication gồm `GHE`, `KHU_VUC` |
| Quyền ghi trực tiếp bảng `GHE` | `anon`, `authenticated`: không INSERT, UPDATE, DELETE được |
| Quyền hàm Sprint 2 | Giống hệt cục bộ: `anon` không có EXECUTE; `duyet_de_xuat_gia` và `tu_choi_de_xuat_gia` không cho `service_role`; tất cả `SECURITY DEFINER` |

### 4.2. Cấu hình Auth: mặc định của hosted sai với đặc tả OTP

`supabase config diff` giữa `supabase/config.toml` và sandbox vừa tạo:

| Tham số | Hosted mặc định | Đặc tả (config.toml) | Hệ quả nếu không chỉnh |
|---|---|---|---|
| `otp_expiry` | **3600 giây** | 300 giây | Mã sống 1 giờ, trái AC-T2-01.4 |
| `otp_length` | **8 số** | 6 số | Giao diện nhận 6 đến 10 số nên vẫn dùng được, nhưng khác thiết kế |
| Mẫu email magic link | Tiêu đề "Your sign-in link", nội dung mặc định (theo mặc định của Supabase chỉ có liên kết, không có mã) | Có `{{ .Token }}` | Người dùng có thể **không thấy mã** trong thư. Chưa xác minh bằng thư thật |
| Gửi email | Email mặc định của Supabase | SMTP riêng | Xem dưới |

**Đã chỉnh trên sandbox:** `config push` thành công cho `otp_expiry = 300` và `otp_length = 6` (kèm một số tham số khác của `config.toml`: xác nhận email tắt, MFA TOTP tắt, `site_url`, SMS). Kiểm chứng: Auth tạo mã 6 số; mã bị từ chối sau 301 giây (mục 4.3).

**Không chỉnh được:** việc đẩy mẫu email bị từ chối với thông báo nguyên văn: *"Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or configure a custom SMTP provider."* Vậy trên gói Free, muốn mã OTP hiện trong thư phải cấu hình **SMTP riêng** (Authentication > SMTP Settings) rồi sửa mẫu `magic_link` (nội dung ở `supabase/templates/magic_link.html`).

**Gửi email thật:** với email mặc định, gửi OTP tới `…@example.test` và `…@example.com` đều trả `400 email_address_invalid`. Email mặc định chỉ gửi tới địa chỉ thật thuộc thành viên nhóm và bị giới hạn số thư mỗi giờ (theo tài liệu Supabase, chưa đo). Vì vậy việc gửi thư thật, mẫu thư và khoảng chờ 60 giây giữa hai lần gửi **chưa kiểm chứng**; cần một hộp thư thật.

Chưa đẩy: số kết nối của pooler và kho vector (không liên quan Sprint 2).

### 4.3. OTP trên hosted (chế độ không hộp thư, mã lấy bằng Admin API)

| Tiêu chí | Kịch bản | Kết quả thực tế | Trạng thái |
|---|---|---|---|
| AC-T2-01.7 | Đăng nhập mật khẩu (`amr`=`password`), giữ chỗ sự kiện bật OTP | `da_xac_minh_otp()`=false; giữ chỗ bị từ chối `42501` | Đạt |
| AC-T2-01.7 | Chưa đăng nhập | `42501 permission denied for function` | Đạt |
| AC-T2-01.8 | Sự kiện tắt OTP | Giữ chỗ thành công | Đạt |
| AC-T2-01.2 | Nhập sai mã | `403 otp_expired`; Auth không có "số lần còn lại" | Đạt (giới hạn đã biết) |
| AC-T2-01.5 | Mã mới vô hiệu mã cũ | Mã cũ bị từ chối | Đạt |
| AC-T2-01.3 | Sai 6 lần rồi nhập mã đúng | Xác minh thành công: Auth không khóa | Xác nhận khóa 15 phút chỉ ở giao diện |
| AC-T2-01.1 | Nhập đúng mã còn hạn | `amr`=`otp`; `da_xac_minh_otp()`=true; giữ chỗ sự kiện bật OTP thành công | Đạt |
| AC-T2-01.4 | Nhập đúng mã sau 301 giây | `403 otp_expired` (xác nhận `otp_expiry=300` đã có hiệu lực) | Đạt |
| AC-T2-01.1 | Email có mã 6 số hiển thị | Cần SMTP hoặc hộp thư thật | Chưa chạy |
| AC-T2-01.5 | Gửi lại dưới 60 giây bị từ chối | Cần hộp thư thật (đã đạt trên Auth cục bộ cùng phiên bản) | Chưa chạy |

### 4.4. Realtime và độ trễ giá (hosted)

12 lần duyệt, hai khán giả, dùng đúng hàm đăng ký của giao diện:

| Số liệu | Giá trị |
|---|---|
| Lượt nhận Realtime | **24/24** (cục bộ: 23/24) |
| Trung vị | **529 ms** |
| p95 / lớn nhất / nhỏ nhất | 535 ms / 537 ms / 196 ms |
| RPC duyệt (khứ hồi) | 88 đến 130 ms |

AC-T4-03.1 (không quá 5 giây): **đạt ở tầng dịch vụ Realtime trên hosted** (lớn nhất 0,54 giây). Chưa đo thời gian vẽ lại giao diện trên trình duyệt thật. Các giá trị chụm quanh 530 ms cho thấy Realtime gom sự kiện theo nhịp khoảng 0,5 giây.

### 4.5. Chu kỳ định giá và cuộc đua đồng thời (hosted)

| Hạng mục | Kết quả |
|---|---|
| Chu kỳ định giá tự động (3 khu: 90%, 5%, 50% lấp đầy) | 3/3 đề xuất khớp engine (600.000, 410.000, 600.000) |
| `concurrency-limit.mjs` ×5 (hai phiên giữ vé 3+3, giới hạn 4) | **5/5 đạt** (AC-T2-02.4) |
| `concurrency-approve.mjs` ×2 (hai BTC duyệt cùng đề xuất) | Dữ liệu **đúng** cả hai lần (một người thắng, đề xuất `APPROVED`, giá 600.000, một dòng nhật ký). **Người thua nhận `upstream request timeout` sau khoảng 130 giây** thay vì 409 |

Kết luận: PostgREST trên hosted cũng tự thử lại khi hàm báo `SQLSTATE 40001`, giống bản cục bộ (v14.5). Trên hosted lỗi quá thời gian xuất hiện sau khoảng 130 giây (cục bộ: 60 giây). Vì vậy AC-T4-03.3 vẫn chỉ đạt một phần (toàn vẹn dữ liệu đạt, phản hồi cho người thua sai) và quyết định đổi sang `PT409` (đã thử cục bộ: HTTP 409 sau 119 ms) càng cần thiết. Chưa thử `PT409` trên hosted.

### 4.6. Ghi trực tiếp qua REST theo vai trò (hosted)

40 phép thử: **chỉ 4 được phép**, đúng như bản cục bộ: chủ sở hữu ghi `CAU_HINH_SU_KIEN` (có audit), và **BIEN_TAP cùng CHU_SO_HUU đổi trực tiếp được `KHU_VUC.GiaVeNiemYet`**, vòng qua kiểm soát giá, duyệt và nhật ký giá. Mọi đường ghi vào bảng giá, đề xuất, nhật ký, ghế và giữ chỗ bị chặn đúng với mọi vai trò.

### 4.7. Advisors của Supabase (hosted)

`supabase db advisors --remote --type all`: 52 cảnh báo, 0 mức lỗi.

| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| `anon_security_definer_function_executable` | 10 | Chính là 10 hàm trợ giúp Sprint 1 liệt kê ở báo cáo cục bộ (không phải RPC Sprint 2) |
| `authenticated_security_definer_function_executable` | 28 | Gồm các RPC Sprint 2 dùng cho người đăng nhập (chủ ý) và hàm trợ giúp; cần rà từng cái nếu muốn thu hẹp |
| `auth_leaked_password_protection` | 1 | Cài đặt dự án (kiểm tra mật khẩu bị lộ), chưa bật |
| `auth_insufficient_mfa_options` | 1 | Cài đặt dự án |
| `auth_rls_initplan` (3), `multiple_permissive_policies` (9) | 12 | Hiệu năng, giống bản cục bộ, phần lớn từ Sprint 1 |

Cục bộ advisors không báo nhóm `*_security_definer_function_executable`; hosted có, nên các cảnh báo bảo mật ở đây là mới so với báo cáo cục bộ.

## 5. Số liệu đo

Xem 4.4. Đo từ máy phát triển tới ap-southeast-1, đồng hồ cùng tiến trình, gồm thời gian RPC.

## 6. Sự cố và cách xử lý

1. `projects create` trước đó bị từ chối quyền; sau khi bạn được cấp quyền, tạo thành công.
2. `test db --remote` cần Docker; Docker Desktop đang tắt, khởi động lại rồi chạy.
3. Lần đầu chạy pgTAP 3 file Sprint 1 lỗi do thiếu người dùng mẫu của `seed.sql` (mục 4.1); nạp seed vào sandbox, chạy lại đạt.
4. `config push` bị từ chối khi có khối mẫu email (gói Free): tách khối đó ra và đẩy phần còn lại.
5. Gửi OTP tới địa chỉ giả bị từ chối: chuyển script sang chế độ lấy mã bằng Admin API; các nhãn "gửi" được đổi để không gây hiểu nhầm.
6. Fixture của các script (tổ chức, sự kiện, nhật ký bất biến) và 6 người dùng mẫu từ seed còn lại trong sandbox, không xóa được hết; xem mục 7.

## 7. Việc còn lại

- **Quyết định môi trường V2:** sandbox đã chứng minh chuỗi migration chạy từ đầu và cấu hình OTP áp được; staging cũ vẫn thiếu migration và còn để `anon` ghi được `GHE`. Chọn dùng project mới (sạch, có lịch sử migration) cho V2 hay nâng cấp staging. Sandbox hiện chứa dữ liệu thử nên cần đặt lại hoặc tạo project sạch trước khi dùng cho demo.
- **SMTP riêng** (Resend, Gmail với mật khẩu ứng dụng, SendGrid…): cần để mã OTP hiện trong thư và gửi được tới người dùng thử. Cần quyền của chủ dự án; tôi không tự tạo tài khoản dịch vụ ngoài.
- Gửi OTP thật tới một hộp thư thành viên nhóm và chụp ảnh thư; kiểm khoảng chờ 60 giây.
- Quyết định đổi `40001` sang `PT409` và chặn đổi giá trực tiếp.
- Thời gian vẽ lại giao diện, bàn phím, 360 px trên trình duyệt thật.

## 8. Phụ lục

Số liệu thô nằm ở đầu ra của từng script (không chứa khóa). Cách chạy: xem phần phụ lục của báo cáo cục bộ; với hosted đặt `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` từ `.env.sandbox.local` và bỏ trống `MAIL_URL` khi chạy `verify-otp-local.mjs`.
