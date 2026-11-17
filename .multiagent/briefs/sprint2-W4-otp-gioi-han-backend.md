# Đợt W4 Sprint 2: OTP và giới hạn 4 vé, phần máy chủ và dịch vụ (ban A)

Chạy bằng `agentkit team`. **Đọc trước:** `.multiagent/briefs/sprint2-spec.md` (mục 3, 4, 7, 8) và `.multiagent/briefs/limit4_draft.sql.txt` (chỉ là đoạn nháp bổ sung, **không** phải bản vá rời).

**Mục tiêu:** máy chủ chặn đúng (OTP, vượt giới hạn vé), ghi giá chốt khi giữ chỗ, BTC cấu hình được hai tham số, dịch vụ OTP phía client. Giao diện làm ở đợt W5.
**WBS:** 2.3, 2.4 (một phần), 2.6, 3.2, 3.3, 3.5 (phần RPC), `DonGiaChot`. **Điều kiện đầu vào:** W1 đến W3 đã merge; migration mới nhất `20261114090000`.

## Gợi ý chia task

| Task | Ban | Chế độ | Sau | Việc | Tiêu chí |
|---|---|---|---|---|---|
| T1 | A | pair | | Migration `20261115090000_sprint2_otp_limit_hold.sql`: hàm `da_xac_minh_otp()` và **`CREATE OR REPLACE` toàn bộ** `tao_giu_cho_theo_suat(p_suat_dien_id BIGINT, p_phien_id UUID, p_items JSONB)` | Tìm định nghĩa hiện tại của `tao_giu_cho_theo_suat` (hiện ở `20261005090000_product_foundation.sql`, kiểm tra các migration sau xem có định nghĩa lại không) và giữ nguyên chữ ký cùng toàn bộ hành vi cũ; **chỉ thêm**: (a) `da_xac_minh_otp()` đọc `auth.jwt() -> 'amr'`, đúng khi có phần tử `method = 'otp'` với `timestamp` trong 24 giờ gần nhất; sự kiện có `YeuCauXacMinhOTP` mà chưa xác minh thì lỗi `42501`; (b) `pg_advisory_xact_lock(hashtext(user || ':' || su_kien))`, đếm vé đang giữ của tài khoản theo sự kiện (mọi suất, `GIU_CHO` `ACTIVE` chưa hết hạn), so với `COALESCE(SoVeToiDaMoiDon, 4)`, vượt thì lỗi `VUOT_GIOI_HAN_VE` mã `22023`; (c) ghi `GIU_CHO.NguoiDungID` và `CHI_TIET_GIU_CHO.DonGiaChot` (giá niêm yết hiện hành). Ghi vào ghi chú bản so sánh phần đã thêm so với hàm gốc |
| T2 | A | solo | T1 | Migration `20261115100000_sprint2_purchase_config.sql`: `luu_cau_hinh_mua_ve(p_su_kien_id, p_so_ve_toi_da, p_yeu_cau_otp)` | Chỉ `CHU_SO_HUU`/`QUAN_TRI` của tổ chức; `SoVeToiDaMoiDon` theo ràng buộc CHECK hiện có (đọc migration tạo cột); `SECURITY DEFINER`, `SET search_path`, `REVOKE` từ `PUBLIC` và `anon`; không tạo bảng mới (nếu `CAU_HINH_SU_KIEN` chưa có cột người/thời điểm cập nhật thì ghi chú là chưa có, không bịa) |
| T3 | A | pair | T1, T2 | pgTAP `supabase/tests/sprint2_otp_limit.sql` | `plan(N)` đúng; phủ: `da_xac_minh_otp` với `request.jwt.claims` giả lập (có `otp` trong 24 giờ, quá 24 giờ, không có `otp`); `42501` khi sự kiện yêu cầu OTP mà chưa xác minh; sự kiện không yêu cầu OTP thì qua; `VUOT_GIOI_HAN_VE` ở vé thứ 5 và khi cộng dồn nhiều lần chọn; không áp dụng chéo giữa hai sự kiện; hết hạn giữ chỗ thì số đếm giảm; `DonGiaChot` và `NguoiDungID` được ghi; `luu_cau_hinh_mua_ve` đúng vai trò; tự tạo fixture, đặt cả claim `sub` và `role` |
| T4 | A | solo | | `src/services/otpService.ts` (client) và test logic thuần | Gate đạt; `signInWithOtp({email, options: {shouldCreateUser: false}})` và `verifyOtp({email, token, type: 'email'})`; **không lưu, không log** mã OTP; tách hàm thuần (đếm ngược hiệu lực 5 phút, thời gian chờ gửi lại 60 giây, bộ đếm số lần nhập sai hiển thị) có test node; nhánh mock dùng mã cố định `123456` **chỉ khi** `useMockData`; thông báo lỗi tiếng Việt, nêu số lần còn lại |
| T5 | A | solo | | `scripts/concurrency-limit.mjs` | Đọc `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` (thiếu thì dừng); tạo dữ liệu dùng một lần (người dùng, sự kiện, ghế) và **dọn sạch** sau khi chạy; mô phỏng hai phiên của cùng một tài khoản giữ chỗ đồng thời, kết quả mong đợi: tổng vé không vượt giới hạn; in kết quả rõ ràng |
| T6 | A | solo | T1–T5 | Ghi chú `.multiagent/notes/sprint2-W4-ghi-chu.md` theo spec mục 7 | Có bảng AC (AC-T2-01.1 đến .8 phần máy chủ, AC-T2-02.1 đến .7, AC-T4-04.1), chữ ký đầy đủ hàm mới, bản so sánh `tao_giu_cho_theo_suat` cũ và mới, nêu rõ phần "sai 5 lần thì khóa 15 phút" chỉ là hiển thị phía giao diện (Supabase Auth không có khóa này), tài liệu cần cập nhật |

## Ngoài phạm vi

Giao diện (đợt W5), thanh toán, vé đã mua, CAPTCHA, SMS, sửa `config.toml` hay mẫu email (đã cấu hình sẵn), tạo bảng xác minh OTP riêng.

## Nghiệm thu đợt (người làm sau khi merge)

`npm run db:reset` rồi `npm run db:test` (test cũ về giữ chỗ phải còn đạt); `npm run db:start` rồi chạy `scripts/concurrency-limit.mjs` với khóa từ `npm run db:status`.
