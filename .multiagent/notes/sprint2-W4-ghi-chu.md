# Ghi chú bàn giao Sprint 2 – Đợt W4 (OTP, giới hạn vé theo tài khoản, giá chốt, cấu hình mua vé; phần máy chủ và dịch vụ)

Phạm vi W4 (ban A): cổng OTP và giới hạn vé trong `tao_giu_cho_theo_suat`, ghi `NguoiDungID` + `DonGiaChot`, RPC cấu hình mua vé có phân quyền và audit bất biến, dịch vụ OTP phía client, kịch bản hai phiên đồng thời. **Không** làm giao diện (W5), thanh toán, vé đã mua, CAPTCHA, SMS, Edge Function/Auth hook.

## 0. Cách đợt này được thực hiện và kiểm chứng (đọc trước)

- agentkit chạy 8 task. **T1, T3, T5, T7 được duyệt bình thường.** **T2 dừng vì lỗi hạ tầng của worker `agy`** (`failed to start conversation: backend returned an empty conversation id`, hai lần liên tiếp), kéo theo T4, T6, T8 bị chặn. Phần còn lại làm tay như sau:
  - **T2:** lấy migration từ nhánh attempt `agentkit/team-20261121-225231-A-T2-attempt` (đã qua 3 vòng đồng thuận kế hoạch của agentkit), đọc toàn bộ, áp lên DB cục bộ, tất cả pgTAP cũ vẫn đạt. **Không lấy** `tests/sprint2-purchase-config.test.mjs` của nhánh đó (test Node đọc file `.sql` bằng regex, vi phạm spec §0 và §8).
  - **T4:** viết tay `supabase/tests/sprint2_purchase_config.sql` (62 khẳng định), đã chạy.
  - **T6:** thêm tay kiểu dữ liệu vào `src/types/database.types.ts`.
  - **T8:** ghi chú này, viết tay.
- Đã chạy sau merge (máy Windows, Docker, Supabase CLI 3.2.0, 22/11/2026):
  - `npm run check`: đạt, 732/732 test node, build đạt.
  - `npm run db:reset` áp được `20261115090000` và `20261115100000`; `npm run db:test`: **13 file pgTAP, 797 test, `Result: PASS`**.
  - `scripts/concurrency-limit.mjs` chạy với khóa cục bộ: **hai phiên của cùng một tài khoản giữ 3 + 3 vé đồng thời: một thành công, một nhận `VUOT_GIOI_HAN_VE` (22023); tổng vé còn giữ = 3 (≤ 4); dọn dữ liệu sạch** (không còn bản ghi thừa).
- **Chưa chạy:** OTP thật qua email trên dự án Supabase hosted; giao diện (W5); script hai BTC duyệt đồng thời (W6).

## 1. Bảng tiêu chí chấp nhận (phần máy chủ/dịch vụ)

Trạng thái: `db:test đạt` = pgTAP đã chạy và đạt; `chạy thật` = đã chạy script với DB cục bộ; `gate` = test node trong `npm run check`; `W5` = phần giao diện; `chưa kiểm chứng`.

| AC | Bằng chứng | Trạng thái |
|---|---|---|
| AC-T2-01.1 (đúng mã còn hạn → xác minh, vào bước chọn ghế) | Dịch vụ `src/services/otpService.ts` + `src/domain/otpServiceCore.js` (`xacMinhOtpLogic`), `tests/otp-service.test.mjs`; cổng `da_xac_minh_otp()` | gate; luồng giao diện W5; OTP thật `chưa kiểm chứng` |
| AC-T2-01.2 (sai: hiện số lần còn lại) | `ghiNhanSai`, `thongBaoLoiOtp` trong `otpServiceCore.js`, `tests/otp-service.test.mjs` | gate (bộ đếm hiển thị) |
| AC-T2-01.3 (sai 5 lần: hủy mã, khóa 15 phút) | `SO_LAN_SAI_TOI_DA = 5`, `CUA_SO_SAI_GIAY = 900` trong `otpServiceCore.js` | **chỉ hiển thị phía client; Supabase Auth không khóa** (mục 5) |
| AC-T2-01.4 (quá 5 phút bị từ chối kể cả đúng) | `HIEU_LUC_GIAY = 300`; `otp_expiry = 300` trong `supabase/config.toml` | cấu hình cục bộ; dự án thật `chưa kiểm chứng` |
| AC-T2-01.5 (gửi lại < 60 giây hoặc > 3 lần/giờ bị từ chối; mã mới vô hiệu mã cũ) | 60 giây: `max_frequency = "60s"` (Supabase cưỡng chế); 3 lần/giờ: `SO_LAN_GUI_LAI_TOI_DA = 3` | 60 giây: cấu hình; **3 lần/giờ chỉ hiển thị phía client** (mục 5) |
| AC-T2-01.6 (không lưu/log OTP) | `otpService.ts` không ghi mã; `tests/otp-service.test.mjs` | gate |
| AC-T2-01.7 (gọi trực tiếp API giữ ghế khi chưa xác minh → 403) | `tao_giu_cho_theo_suat` lỗi `42501` khi sự kiện yêu cầu OTP mà `da_xac_minh_otp()` sai; `supabase/tests/sprint2_otp_limit.sql` (JWT `amr` giả lập: có OTP trong 24 giờ, quá 24 giờ, không có OTP) | db:test đạt |
| AC-T2-01.8 (BTC bật/tắt theo sự kiện) | `luu_cau_hinh_mua_ve` (`p_yeu_cau_otp`); `supabase/tests/sprint2_purchase_config.sql` (vai trò, biên, audit) | db:test đạt; giao diện W5 |
| AC-T2-02.1 (chọn tối đa 4) | Giới hạn mỗi lượt 1–4 vé vẫn giữ (mục 3) | db:test đạt (Sprint 1 + `sprint2_otp_limit.sql`) |
| AC-T2-02.2 (server từ chối kể cả gọi API trực tiếp) | `VUOT_GIOI_HAN_VE` (22023) trong `tao_giu_cho_theo_suat`; pgTAP vé thứ 5 và cộng dồn nhiều lần chọn | db:test đạt |
| AC-T2-02.3 (thông báo nêu giới hạn và số vé còn lại) | Mã lỗi và thông điệp ở máy chủ; hiển thị là việc giao diện | **W5** |
| AC-T2-02.4 (hai phiên đồng thời không vượt) | Khóa `pg_advisory_xact_lock(hashtext(user_id \|\| ':' \|\| su_kien_id))` trước khi đếm; `scripts/concurrency-limit.mjs` | **chạy thật đạt** (một thành công, một `VUOT_GIOI_HAN_VE`, tổng ≤ 4) |
| AC-T2-02.5 (hết hạn giữ chỗ giải phóng số đếm) | Đếm chỉ `GIU_CHO` `ACTIVE` chưa hết hạn; pgTAP có ca hết hạn | db:test đạt |
| AC-T2-02.6 (BTC đổi `SoVeToiDaMoiDon`, chỉ vai trò được phép, có audit) | `luu_cau_hinh_mua_ve`, bảng `NHAT_KY_CAU_HINH_MUA_VE`, trigger; `supabase/tests/sprint2_purchase_config.sql` | db:test đạt |
| AC-T2-02.7 (không áp dụng chéo giữa các sự kiện) | Khóa và đếm theo (tài khoản, sự kiện); pgTAP kiểm hai sự kiện | db:test đạt |
| AC-T4-04.1 (ghế đang giữ giữ `DonGiaChot`) | `CHI_TIET_GIU_CHO.DonGiaChot` được ghi khi giữ chỗ (cả ghế ngồi và vé đứng); `sprint2_otp_limit.sql` | db:test đạt (phía máy chủ; hiển thị ở giao diện đã có từ W3) |

## 2. Thay đổi CSDL

Hai migration mới (theo thứ tự):

**`20261115090000_sprint2_otp_limit_hold.sql`**
- `public.da_xac_minh_otp() RETURNS BOOLEAN` (`STABLE`, `SECURITY DEFINER`, `search_path = public`; `REVOKE` từ `PUBLIC`, `anon`; `GRANT` cho `authenticated`): TRUE khi `auth.jwt() -> 'amr'` có phần tử `method = 'otp'` với `timestamp` kiểu số trong 24 giờ gần nhất và không ở tương lai; mọi trường hợp thiếu hoặc sai dạng trả FALSE, không ném lỗi.
- `public.tao_giu_cho_theo_suat(p_suat_dien_id BIGINT, p_phien_id UUID, p_items JSONB) RETURNS JSONB` viết lại **toàn bộ** (`CREATE OR REPLACE`, giữ chữ ký và dạng kết quả JSONB).
- `public.tao_giu_cho(p_su_kien_id INT, p_phien_id UUID, p_items JSONB)` (hàm bọc theo sự kiện) tạo lại để gọi hàm mới.

**`20261115100000_sprint2_purchase_config.sql`**
- Bảng mới duy nhất: `public."NHAT_KY_CAU_HINH_MUA_VE"` (`NhatKyCauHinhMuaVeID`, `SuKienID`, `NguoiThucHienID`, `VaiTroToChuc` ∈ {CHU_SO_HUU, QUAN_TRI}, `ThoiGian`, `SoVeToiDaCu/Moi`, `YeuCauOtpCu/Moi`; CHECK phải có ít nhất một giá trị đổi; **không khóa ngoại**). RLS bật: thành viên tổ chức sở hữu sự kiện được `SELECT`; không ai được `INSERT/UPDATE/DELETE/TRUNCATE` trực tiếp; trigger chặn `UPDATE/DELETE/TRUNCATE` kể cả chủ bảng và `service_role`.
- `public.luu_cau_hinh_mua_ve(p_su_kien_id INT, p_so_ve_toi_da INT, p_yeu_cau_otp BOOLEAN) RETURNS JSONB` (`SECURITY DEFINER`, `search_path = public`; `EXECUTE` cho `authenticated`, thu hồi `PUBLIC`/`anon`). Mã lỗi: `42501` (`CAU_HINH_MUA_VE_CAN_DANG_NHAP`, `CAU_HINH_MUA_VE_KHONG_CO_QUYEN`), `22023` (`CAU_HINH_MUA_VE_KHONG_HOP_LE`), `P0002` (`SU_KIEN_KHONG_TON_TAI`).
- Hai trigger trên `CAU_HINH_SU_KIEN`: `trg_khoa_cau_hinh_mua_ve` (BEFORE INSERT/UPDATE: khóa dòng `SU_KIEN` khi INSERT, chặn đổi `SuKienID`) và `trg_kiem_soat_cau_hinh_mua_ve` (AFTER INSERT/UPDATE/DELETE: **nơi duy nhất** kiểm vai trò `CHU_SO_HUU`/`QUAN_TRI` bằng `auth.uid()` và ghi audit, chỉ khi một trong hai giá trị đổi). Không có nhánh bỏ qua cho `service_role`, không có cờ do client đặt.
- Chính sách RLS `CAU_HINH_SU_KIEN`: thay chính sách `FOR ALL` "Editors manage event configuration" bằng hai chính sách INSERT và UPDATE cho người có quyền biên tập; **thu hồi DELETE/TRUNCATE** của `PUBLIC`/`anon`/`authenticated` (và TRUNCATE của `service_role`).
- `luu_su_kien_toan_dien(JSONB)` được bọc lại: nếu payload không gửi cấu hình thì giữ giá trị đang lưu (không tự đặt lại về 4); khi gửi cấu hình thì đi qua cùng trigger kiểm quyền và audit.
- Khối tự kiểm ở cuối migration: lỗi ngay nếu ACL/RLS/trigger không đúng như thiết kế.
- Không thêm cột vào `CAU_HINH_SU_KIEN`; không sửa migration cũ; thứ tự khóa luôn `SU_KIEN` → `CAU_HINH_SU_KIEN`.

Kiểu TypeScript: `src/types/database.types.ts` đã thêm bảng `NHAT_KY_CAU_HINH_MUA_VE` (Row/Insert/Update, `Relationships: []` vì không có khóa ngoại) và hàm `da_xac_minh_otp`, `luu_cau_hinh_mua_ve`.

## 3. Đối chiếu `tao_giu_cho_theo_suat` cũ và mới

| Hành vi | Trước (`20261005090000`) | Sau (`20261115090000`) |
|---|---|---|
| Người gọi | Cho phép phiên ẩn danh (`PhienNguoiDung`) | **Bắt buộc tài khoản đăng nhập** (`auth.uid()`; lỗi `28000` khi thiếu); ẩn danh bị từ chối |
| Cổng OTP | Không có | Sự kiện `YeuCauXacMinhOTP = TRUE` mà `da_xac_minh_otp()` sai → `42501` |
| Giới hạn vé | Mỗi lượt 1–4 vé | **Giữ nguyên 4 vé mỗi lượt**, thêm giới hạn **tổng theo (tài khoản, sự kiện)**, cộng mọi suất, theo `COALESCE(SoVeToiDaMoiDon, 4)`; vượt → `VUOT_GIOI_HAN_VE` (22023) |
| Chống đồng thời | – | Khóa `pg_advisory_xact_lock` theo (tài khoản, sự kiện) trước khi đếm |
| `GIU_CHO.NguoiDungID` | Không ghi | Ghi từ `auth.uid()` (payload không mang người dùng hay giá) |
| `CHI_TIET_GIU_CHO.DonGiaChot` | Không ghi | Ghi giá niêm yết hiện hành, cả ghế ngồi và vé đứng |
| Kiểm tra suất, thời gian bán, hết vé, ghế trống, số lượng 1–4, vé ghế ngồi chỉ SL 1 | Có | **Giữ nguyên** |
| Chữ ký, dạng kết quả JSONB, ACL (`REVOKE` từ `PUBLIC`/`anon`, `GRANT` `authenticated`) | – | Giữ nguyên |
| Khi sự kiện không có dòng cấu hình | – | Dùng mặc định 4 (bản nháp trước đó bỏ qua giới hạn khi không có dòng: đã sửa) |

**Hệ quả cho giao diện (W5):** vì ẩn danh không còn giữ chỗ được, người dùng phải đăng nhập trước khi chọn ghế. Test Sprint 1 (`supabase/tests/sprint1_hardening.sql`) đã được chuyển từ phiên anon sang fixture tài khoản đăng nhập và test anon bị từ chối; đạt.

## 4. Bịt đường ghi cấu hình (không né phân quyền hoặc audit)

- Bản gốc có chính sách `FOR ALL` cho biên tập viên trên `CAU_HINH_SU_KIEN` và `luu_su_kien_toan_dien` ghi thẳng `SoVeToiDaMoiDon`. Nếu chỉ thêm RPC thì biên tập viên vẫn đổi được hai tham số bằng `UPDATE` trực tiếp hoặc xóa dòng rồi tạo lại.
- Cách xử lý: mọi đường ghi (RPC, `luu_su_kien_toan_dien`, `UPDATE`/`INSERT` trực tiếp) đi qua cùng trigger kiểm quyền + audit trên chính bảng; `DELETE`/`TRUNCATE` bị thu hồi; đổi `SuKienID` bị chặn.
- Bằng chứng (`supabase/tests/sprint2_purchase_config.sql`, db:test đạt): `BIEN_TAP` không đổi được hai tham số bằng `UPDATE` trực tiếp nhưng vẫn sửa được cấu hình không liên quan (ví dụ `ThoiGianGiuChoPhut`); `DELETE` bị từ chối; `service_role` không có người dùng bị từ chối; qua `luu_su_kien_toan_dien`, `BIEN_TAP` đổi giới hạn bị từ chối, `CHU_SO_HUU` đổi được và đúng một dòng audit; lưu sự kiện không gửi cấu hình thì giữ nguyên giá trị.

## 5. Giới hạn đã biết (đưa vào báo cáo)

- **"Sai 5 lần thì khóa 15 phút" và "gửi lại tối đa 3 lần/giờ/tài khoản" chỉ là bộ đếm hiển thị phía giao diện** (`SO_LAN_SAI_TOI_DA`, `CUA_SO_SAI_GIAY`, `SO_LAN_GUI_LAI_TOI_DA`, `CUA_SO_GUI_LAI_GIAY` trong `otpServiceCore.js`). **Supabase Auth không có hai cơ chế này** và không khẳng định máy chủ cưỡng chế chúng.
- Phân biệt với hai thứ **được cưỡng chế thật**: khoảng cách gửi lại 60 giây (`max_frequency`) và hiệu lực mã 300 giây (`otp_expiry`) trong `supabase/config.toml`; và cổng AMR 24 giờ trong `da_xac_minh_otp()` (đã kiểm chứng trên Supabase cục bộ).
- Dự án Supabase hosted phải đặt tay ở Dashboard: mẫu email có `{{ .Token }}`, expiry 300 giây, tần suất 60 giây. **Chưa kiểm chứng trên dự án thật.**
- Chế độ mock dùng mã cố định `123456` và chỉ khi `useMockData` (`MA_MO_PHONG`); mọi trường hợp mô phỏng mang nhãn `MO_PHONG`.
- Audit cấu hình mua vé cần `auth.uid()`: ghi dữ liệu mẫu có giá trị khác mặc định (4/FALSE) bằng `service_role` không có người dùng sẽ bị từ chối. Fixture pgTAP đã phải đặt `request.jwt.claim.sub` của chủ sở hữu (đã sửa trong `sprint2_otp_limit.sql`).
- Chưa có test giao diện (W5).

## 6. Kiểm chứng sau merge (người nghiệm thu)

Đã chạy ở mục 0 (`npm run check`: 732/732; pgTAP: 13 file, 797 test; kịch bản đồng thời đạt). Việc còn lại cho người nghiệm thu: thử OTP thật trên dự án hosted sau khi cấu hình Dashboard; làm theo giao diện ở W5.

Lệnh lặp lại: `npm run check`; `npm run db:reset` rồi `npm run db:test`; `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (lấy từ `npm run db:status`, **không commit**) rồi `node scripts/concurrency-limit.mjs`.

## 7. Tài liệu cần cập nhật (chỉ liệt kê, không sửa `docs/`)

ERD (thêm bảng `NHAT_KY_CAU_HINH_MUA_VE`; các cột đã có `YeuCauXacMinhOTP`, `GIU_CHO.NguoiDungID`, `CHI_TIET_GIU_CHO.DonGiaChot`); đặc tả Use Case xác minh OTP và giữ chỗ có giới hạn; sơ đồ tuần tự OTP, giữ chỗ (đăng nhập, OTP, khóa, đếm, giá chốt) và cấu hình mua vé của BTC; ma trận truy vết (AC-T2-01.x, AC-T2-02.x, AC-T4-04.1); Test Log (13 file pgTAP, 797 test, kịch bản đồng thời đã chạy).

## 8. Rủi ro và việc còn lại

- Task T2/T4/T6/T8 làm tay vì lỗi hạ tầng `agy`; T2 vẫn qua 3 vòng đồng thuận kế hoạch của agentkit, nhưng phần mã SQL của T2 chưa qua vòng duyệt của Astra (đã đọc đủ, áp dụng và test bằng pgTAP).
- Hai tệp test Node đọc văn bản trong nhánh attempt bị loại; các test vi phạm spec cũ vẫn còn (xem `GIOI_HAN_DA_BIET_VA_QUYET_DINH_SPRINT2.md`, mục D).
- Hành vi mới "phải đăng nhập mới giữ chỗ" cần luồng đăng nhập + OTP ở giao diện (W5); nếu giao diện chưa có thì người dùng ẩn danh sẽ không giữ chỗ được ở chế độ Supabase thật (chế độ mock không bị ảnh hưởng nếu mock bỏ qua cổng này; cần kiểm ở W5).
- Ngoài phạm vi W4: giao diện, thanh toán, vé đã mua, CAPTCHA, SMS, Edge Function/Auth hook.
