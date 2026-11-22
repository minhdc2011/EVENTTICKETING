KẾT LUẬN: Phần kiểm chứng chạy được bằng Supabase cục bộ (Docker) đã chạy xong. Phần cần project Supabase hosted (P2 hosted, P6) **chưa chạy** vì tài khoản không có quyền tạo project. Phát hiện quan trọng: **người thua cuộc đua duyệt giá nhận 504 sau 60 giây, không nhận 409** (mục 4.5).

# Kiểm chứng Sprint 2 trên Supabase cục bộ (thay cho P2–P6 hosted)

## 1. Mục đích

Đóng các mục "chưa kiểm chứng" của Sprint 2 ở mức có thể mà không cần tạo project hosted: chuỗi migration từ đầu, pgTAP, OTP thật qua Auth, Realtime và độ trễ giá, chu kỳ định giá tự động, hai cuộc đua đồng thời, quyền hàm, ghi trực tiếp, advisors. Bản kế hoạch gốc (P2–P6) dùng một project sandbox hosted; `supabase projects create` bị từ chối (`Your account does not have the necessary privileges to access this endpoint`), nên toàn bộ chạy trên Supabase CLI cục bộ.

## 2. Môi trường

| Thành phần | Giá trị |
|---|---|
| Ngày chạy | 22/11/2026, múi giờ Asia/Saigon |
| Commit mã nguồn | `1e3f60c` (nhánh `docs/sprint2-supabase-sandbox`, đã gồm `main` có W6) cộng các script mới của báo cáo này |
| Supabase CLI | 3.2.0 (`npx --yes supabase@3.2.0`) |
| PostgreSQL | 17.6 (image `postgres:17.6.1.166`, **trùng** bản của staging theo báo cáo P1) |
| Auth (GoTrue) | v2.198.0 (**trùng** staging) |
| PostgREST | v14.5 (bản hosted chưa biết) |
| Realtime | v2.167.0; email: Mailpit v1.31.3 |
| Cấu hình Auth | `supabase/config.toml`: `otp_expiry = 300`, `max_frequency = "60s"`, mẫu `magic_link` chứa mã |
| Khóa | Khóa cục bộ mặc định của Supabase CLI, không ghi vào báo cáo |

**Giới hạn của môi trường cục bộ (nói thẳng khi báo cáo):** mạng là localhost nên độ trễ không đại diện cho hosted; SMTP là Mailpit nên chưa kiểm việc gửi email thật tới hộp thư người dùng; PostgREST hosted có thể khác phiên bản. Cục bộ không có project hosted nên **không chạy được** `test db --linked` và Advisors của dashboard.

## 3. Các bước đã làm

1. `npm run db:start`, `npm run db:reset` (áp 25 migration từ đầu), `npm run db:test`.
2. Truy vấn chỉ đọc cấu trúc, RLS, publication Realtime, quyền EXECUTE của hàm, quyền bảng, policy, trigger (qua `psql` trong container).
3. `scripts/verify-direct-writes.mjs`: thử ghi trực tiếp qua REST bằng khóa anon và JWT từng vai trò.
4. `scripts/verify-otp-local.mjs`: OTP thật, đọc mã từ hộp thư Mailpit; chờ thời gian thật (60 giây, 300 giây).
5. `scripts/measure-price-latency.mjs`: đo độ trễ duyệt → Realtime, dùng đúng hàm đăng ký của giao diện.
6. `scripts/verify-pricing-cycle-local.mjs`: chạy `scripts/run-pricing-cycle.mjs --nhanh` với dữ liệu bán ghế thật, đối chiếu với engine.
7. `scripts/concurrency-limit.mjs` ×5 và `scripts/concurrency-approve.mjs` ×(nhiều lần).
8. `supabase db advisors --type all`.

## 4. Kết quả theo tiêu chí

### 4.1. Chuỗi migration và pgTAP (phần cục bộ của P2)

| Kiểm tra | Kết quả |
|---|---|
| Áp 25 migration từ DB trống | Đạt (`db reset` mã thoát 0) |
| pgTAP (`db:test`) | **Đạt**: 14 file, 820 test, `Result: PASS` (chạy ba lần trong ngày) |
| Bảng Sprint 2 có RLS | `QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA`, `NHAT_KY_CAU_HINH_MUA_VE`, `CAU_HINH_SU_KIEN`: đều bật |
| Cột Sprint 2 | `GIU_CHO.NguoiDungID`, `CHI_TIET_GIU_CHO.DonGiaChot`, `GHE.NgayCapNhatTrangThai`, `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP`: có |
| Publication Realtime | `GHE`, `KHU_VUC` |
| `test db --linked` trên hosted | **Chưa chạy** (không có project) |

Quyền EXECUTE hàm Sprint 2 (cục bộ):

| Hàm | SECURITY DEFINER | anon | authenticated | service_role | search_path cố định |
|---|---|---|---|---|---|
| `da_xac_minh_otp` | có | không | có | có | có |
| `duyet_de_xuat_gia` | có | không | có | **không** | có |
| `tu_choi_de_xuat_gia` | có | không | có | **không** | có |
| `luu_de_xuat_gia` | có | không | có | có | có |
| `luu_cau_hinh_mua_ve` | có | không | có | có | có |
| `tao_giu_cho_theo_suat`, `tao_giu_cho` | có | không | có | có | có |
| `lay_so_lieu_dinh_gia`, `mo_phong_nhu_cau` | có | không | có | có | có |

Hàm SECURITY DEFINER mà `anon` gọi được trong toàn schema `public`: `co_quyen_bien_tap_to_chuc`, `huy_giu_cho`, `la_ban_to_chuc` (2 dạng), `la_thanh_vien_to_chuc`, `lay_loai_tai_khoan` (2 dạng), `kiem_tra_khong_tu_nang_cap_loai_tai_khoan`, `kiem_tra_trang_thai_cong_bo_su_kien`, `tao_ho_so_nguoi_dung_moi`. Đây là hàm trợ giúp/trigger của Sprint 1, không thuộc Sprint 2; ghi lại để biết.

### 4.2. OTP thật (P3)

Chạy `scripts/verify-otp-local.mjs`, email gửi thật qua Auth và đọc từ Mailpit. Mã OTP không được ghi ở bất kỳ đâu.

| Tiêu chí | Kịch bản | Kết quả thực tế | Trạng thái |
|---|---|---|---|
| AC-T2-01.7 | Đăng nhập mật khẩu (amr=`password`), giữ chỗ sự kiện bật OTP | `da_xac_minh_otp()`=false; giữ chỗ bị từ chối `42501 Can xac minh OTP de giu cho` | Đạt |
| AC-T2-01.7 | Giữ chỗ khi chưa đăng nhập (anon) | Từ chối `42501 permission denied for function` (anon không có EXECUTE). Không phải `28000` như mô tả ở W4, nhưng vẫn bị chặn | Đạt (sai khác mã lỗi, xem mục 6) |
| AC-T2-01.8 | Giữ chỗ sự kiện tắt OTP | Thành công không cần OTP | Đạt |
| AC-T2-01.1 | Gửi OTP, email có mã 6 số | Email tiêu đề "Ma xac minh EventTicketing", mã 6 số hiển thị | Đạt |
| AC-T2-01.5 | Gửi lại ngay (< 60 giây) | `429 over_email_send_rate_limit: you can only request this after 59 seconds` | Đạt |
| AC-T2-01.5 | Gửi lại sau 62 giây, mã cũ có còn dùng không | Gửi thành công; mã cũ bị từ chối (`403 otp_expired`) | Đạt |
| AC-T2-01.2 | Nhập sai mã | `403 otp_expired: Token has expired or is invalid`. **Auth không trả "số lần còn lại"**: bộ đếm hiển thị là của giao diện | Đạt (giới hạn đã biết) |
| AC-T2-01.3 | Sai 6 lần liên tiếp rồi nhập mã đúng | **Mã đúng vẫn dùng được** → Auth **không** khóa/hủy mã sau nhiều lần sai | Xác nhận: khóa 15 phút chỉ là của giao diện |
| AC-T2-01.1 | Nhập đúng mã còn hạn | verifyOtp thành công; JWT có `amr=[otp]`; `da_xac_minh_otp()`=true | Đạt |
| AC-T2-01.1/.7 | Giữ chỗ sự kiện bật OTP sau xác minh | Thành công | Đạt |
| AC-T2-01.4 | Nhập đúng mã sau 301 giây | `403 otp_expired` | Đạt |

**Không kiểm chứng được:** gửi email tới hộp thư thật qua SMTP hosted (SMTP mặc định của Supabase hosted bị giới hạn số email), mẫu email trên dự án hosted. Việc còn lại cho bạn: một lần gửi OTP thật tới hộp thư của bạn trên môi trường hosted.

### 4.3. Realtime và độ trễ giá (P4)

`scripts/measure-price-latency.mjs`: 12 lần duyệt, mỗi lần một khu và đề xuất `PENDING` mới, hai khán giả anon dùng hàm `subscribeToPriceUpdatesWithClient` của giao diện. Đồng hồ `performance.now()` trong cùng một tiến trình.

| Số liệu | Giá trị |
|---|---|
| Số lần duyệt | 12 (cả 12 RPC thành công, 9–52 ms) |
| Lượt nhận Realtime | 23/24 |
| Lượt không nhận trong 15 giây | 1 (khán giả 0, lần 1, ngay sau khi kết nối) |
| Trung vị (từ lúc gọi RPC đến lúc nhận) | 522 ms |
| p95 / lớn nhất | 533 ms / 534 ms |
| Nhỏ nhất | 22 ms |

Mọi lần đo (ms): 469, 190, 190, 534, 533, 518, 518, 523, 523, 522, 522, 524, 524, 22, 22, 525, 525, 522, 522, 522, 522, 520, 520. Ghi chú: các giá trị chụm quanh 520 ms cho thấy Realtime gom sự kiện theo nhịp ~0,5 giây. Giá trị 22 ms xuất hiện khi sự kiện đến trước khi chu kỳ gom kế tiếp.

Giải thích lượt thiếu: hàm đăng ký của giao diện có đọc lại giá khi vừa kết nối (`SUBSCRIBED`) và bỏ qua sự kiện trùng giá đã đọc, nên khả năng lớn là giá đã đến qua lần đọc lại. Tôi chưa kiểm chứng giả thuyết này; ghi nhận là một lượt không thấy sự kiện.

| Tiêu chí | Trạng thái |
|---|---|
| AC-T4-03.1 độ trễ ≤ 5 giây | **Đạt ở môi trường cục bộ (lớn nhất 0,53 giây)**. Hosted và độ trễ vẽ lại DOM trên trình duyệt: **chưa đo** |

### 4.4. Chu kỳ định giá tự động (P4, phần engine)

`scripts/verify-pricing-cycle-local.mjs`: 3 khu 20 ghế với 18, 1 và 10 ghế đã bán, chạy `run-pricing-cycle.mjs --nhanh`.

| Khu | Tỷ lệ lấp đầy | Đề xuất đã lưu | Engine tính lại | Khớp |
|---|---|---|---|---|
| GAN_DAY | 90% | 600.000, `PENDING`, `BINH_THUONG` | 600.000 | Có |
| VANG | 5% | 410.000 | 410.000 | Có |
| VUA | 50% | 600.000 | 600.000 | Có |

Đây kiểm **đường ống** (đọc đúng số liệu, lưu đúng giá, đúng loại cảnh báo), không thay cho bốn ví dụ chuẩn trong `tests/pricing-engine.test.mjs` (đã đạt với giá trị tính tay). Khu "VUA" (50%) được đề xuất tăng vì ghế vừa bán xong nên tốc độ bán cao; đó là hành vi đúng của công thức nhưng cần giải thích nếu hỏi.

### 4.5. Cuộc đua đồng thời (P5)

| Script | Số lần | Kết quả |
|---|---|---|
| `concurrency-limit.mjs` (hai phiên cùng giữ vé 3+3, giới hạn 4) | 5 | **5/5 đạt**: mỗi lần một thành công, một `22023 VUOT_GIOI_HAN_VE`, dọn sạch (AC-T2-02.4) |
| `concurrency-approve.mjs` (hai BTC duyệt cùng một đề xuất) | lần đầu trong ngày: 1; sau đó: 13 lần | Lần đầu **đạt** (người thua nhận `40001 DE_XUAT_DA_XU_LY`). **Từ đó 13/13 lần người thua nhận `504 The upstream server is timing out` sau 61 giây** |

**Dữ liệu vẫn đúng ở cả hai trường hợp:** luôn có đúng một người thắng, đề xuất `APPROVED`, giá khu = giá đề xuất, đúng một dòng `NHAT_KY_GIA`. Cái sai nằm ở phản hồi cho người thua.

**Nguyên nhân (đã tái hiện độc lập với mã Sprint 2):** PostgREST v14.5 **tự thử lại vô hạn khi hàm ném `SQLSTATE 40001`** và chỉ dừng khi cổng Kong báo 504 sau 60 giây. Bằng chứng: tạo hàm thử nghiệm tạm trên DB cục bộ (đã xóa).

| Hàm thử | SQLSTATE | Phản hồi |
|---|---|---|
| `zz_tmp_22023` | `22023` | HTTP 400 sau 139 ms |
| `zz_tmp_40001` | `40001` | **HTTP 504 sau 60.108 ms** (cả sau `db reset` sạch) |
| `zz_tmp_pt409` | `PT409` (mã tùy biến của PostgREST) | **HTTP 409 sau 119 ms**, thân có `code` và `details` |

Lần chạy đầu tiên trong ngày cho kết quả đạt **không tái hiện được** (tôi không giải thích được; môi trường Docker đã được dựng lại giữa chừng). Vì vậy bằng chứng đã công bố ở ghi chú W6 cho AC-T4-03.3 ("chạy thật đạt") cần sửa: dữ liệu nhất quán thì đúng, nhưng người thua không nhận được lỗi 409/40001 như đặc tả.

| Tiêu chí | Trạng thái |
|---|---|
| AC-T4-03.3 (một thành công, một nhận lỗi) | **Một phần**: toàn vẹn dữ liệu đạt; phản hồi cho người thua là 504 sau 60 giây qua PostgREST v14.5, không phải 409. Chưa biết bản PostgREST hosted có cùng hành vi không |

**Đề xuất sửa (chưa thực hiện, cần bạn quyết định vì đổi mã lỗi và cần migration mới):** trong `duyet_de_xuat_gia` và `tu_choi_de_xuat_gia`, thay `ERRCODE '40001'` của các trường hợp `DE_XUAT_DA_XU_LY`, `GIA_DA_THAY_DOI`, `DE_XUAT_XUNG_DOT` bằng `ERRCODE 'PT409'` (đã thử: trả HTTP 409 ngay). Cần cập nhật các assertion pgTAP đang chờ `40001`, ánh xạ trong `pricingServiceCore.js`, `scripts/concurrency-approve.mjs` và tài liệu.

### 4.6. Ghi trực tiếp và bảo mật (P5)

`scripts/verify-direct-writes.mjs`: bốn vai trò (anon, người mua không thuộc tổ chức, biên tập BIEN_TAP, chủ sở hữu CHU_SO_HUU) thử ghi qua REST.

| Đối tượng | anon | người mua | BIEN_TAP | CHU_SO_HUU |
|---|---|---|---|---|
| `QUY_TAC_GIA` INSERT/UPDATE | chặn (42501) | chặn | chặn | chặn |
| `DE_XUAT_GIA` INSERT | chặn | chặn | chặn | chặn |
| `NHAT_KY_GIA` INSERT | chặn | chặn | chặn | chặn |
| `NHAT_KY_CAU_HINH_MUA_VE` INSERT | chặn | chặn | chặn | chặn |
| `GHE` INSERT | chặn | chặn | chặn | chặn |
| `GIU_CHO` INSERT | chặn (trigger/RLS) | chặn | chặn (RLS) | chặn (RLS) |
| `CAU_HINH_SU_KIEN` INSERT/UPDATE | chặn | chặn | chặn (`CAU_HINH_MUA_VE_KHONG_CO_QUYEN`) | **cho phép** (có audit qua trigger) |
| **`KHU_VUC.GiaVeNiemYet` UPDATE trực tiếp** | chặn | chặn | **CHO PHÉP** | **CHO PHÉP** |

**Phát hiện (mức trung):** người biên tập tổ chức (kể cả `BIEN_TAP`) đổi trực tiếp được giá niêm yết của khu bằng REST, vòng qua PriceGuard, bước duyệt và `NHAT_KY_GIA`. Nguyên nhân: policy `Editors manage show zones` (`FOR ALL`) cho phép UPDATE cột giá và chỉ có trigger nhất quán suất diễn/sự kiện, không có trigger bảo vệ cột `GiaVeNiemYet`. Điều này mâu thuẫn với mô tả "chỉ `duyet_de_xuat_gia` đổi giá hiện hành". Chủ sở hữu đổi `CAU_HINH_SU_KIEN` trực tiếp là chủ ý (trigger ghi audit). Chưa vá; đề xuất một migration chặn đổi `GiaVeNiemYet` khi khu có `QUY_TAC_GIA` đang kích hoạt, trừ khi đi qua RPC duyệt. Quyết định này là của bạn vì giá khu cũng được sửa lúc thiết lập sự kiện.

**Rủi ro nhỏ có sẵn từ Sprint 1:** vé đứng không truyền `ticketCode` tự sinh mã `MaKhuVuc || '-' || <uuid 36 ký tự>` vào cột 50 ký tự, nên mã khu dài hơn 13 ký tự gây `22001 value too long` khi giữ vé đứng. Không phải do Sprint 2 gây ra.

### 4.7. Advisors (P5)

`supabase db advisors --type all` cục bộ: **0 cảnh báo bảo mật**, 12 cảnh báo hiệu năng (`auth_rls_initplan` ×3 trên `HO_SO_NGUOI_DUNG`, `THANH_VIEN_TO_CHUC`; `multiple_permissive_policies` ×9 trên `CAU_HINH_SU_KIEN`, `DIA_DIEM`, `GHE`, `KHU_VUC`, `NGHE_SI`, `PHIEN_BAN_SO_DO`, `SUAT_DIEN`, `SU_KIEN`, `SU_KIEN_NGHE_SI`). Phần lớn thuộc Sprint 1; `CAU_HINH_SU_KIEN` và `KHU_VUC` có liên quan Sprint 2 ở mức hiệu năng, không ảnh hưởng đúng/sai. Chưa tự sửa.

## 5. Số liệu đo

Xem mục 4.3. Độ trễ đo trên localhost, đồng hồ cùng tiến trình, gồm thời gian chạy RPC. Chưa đo từ trình duyệt thật.

## 6. Sự cố và cách xử lý

1. Không tạo được project sandbox (`projects create` bị từ chối quyền): chuyển sang Supabase cục bộ, thay phạm vi như mục 2.
2. Lần chạy đầu `verify-otp-local.mjs` lỗi do kịch bản (mã khu dài gây `22001`; kỳ vọng `28000` cho anon trong khi thực tế `42501`): sửa kịch bản, ghi rõ sai khác mã lỗi (W4 mô tả `28000`; thực tế anon không có EXECUTE nên là `42501`; cả hai đều chặn).
3. `verify-direct-writes.mjs` ban đầu dùng sai tên cột nên có thể giả "bị chặn": kiểm cột thật rồi sửa, thêm phân loại `PAYLOAD_LOI`.
4. `concurrency-approve.mjs` thất bại từ lần chạy thứ hai: điều tra đến nguyên nhân PostgREST ở mục 4.5, hàm thử nghiệm đã xóa khỏi DB cục bộ.
5. Các script ghi dữ liệu fixture không xóa được hết (audit bất biến): chạy `npm run db:reset` sau khi dùng.

## 7. Việc còn lại cho người dùng

- **Quyết định A:** đổi `40001` thành `PT409` trong RPC duyệt/từ chối (mục 4.5). Tôi đề nghị làm, nhưng cần cập nhật pgTAP và tài liệu; chưa làm.
- **Quyết định B:** chặn đổi giá trực tiếp khi khu có quy tắc giá (mục 4.6).
- **Quyết định C (môi trường):** staging cũ đang để `anon`/`authenticated` ghi trực tiếp `GHE` (báo cáo P1, thiếu migration `20261111090000`). Chọn giữ hay dựng môi trường V2 mới; cần người có quyền tạo project.
- Chưa chạy: hosted `test db --linked`, Advisors dashboard, gửi OTP tới hộp thư thật, độ trễ trên hosted, độ trễ vẽ DOM, giao diện với dữ liệu thật trên môi trường hosted (P6).
- Chụp ảnh, video Demand Simulator, bàn phím/360 px, User Testing V2 (không agent nào làm được).

## 8. Phụ lục

Script mới đã đưa vào repo (chỉ chạy trên Supabase cục bộ, rồi `npm run db:reset`):

```
scripts/verify-direct-writes.mjs        # ghi trực tiếp theo vai trò
scripts/verify-otp-local.mjs            # OTP thật, mất ~8 phút
scripts/measure-price-latency.mjs       # độ trễ duyệt → Realtime
scripts/verify-pricing-cycle-local.mjs  # chu kỳ định giá tự động so với engine
```

Chạy (khóa lấy từ `npx --yes supabase@3.2.0 status -o env`, không dán vào file):

```
eval "$(npx --yes supabase@3.2.0 status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/<tên>.mjs
```
