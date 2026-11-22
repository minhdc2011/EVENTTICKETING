# Ghi chú nghiệm thu đợt W6 và tổng kết Sprint 2

W6 tích hợp OTP, giới hạn vé và Dynamic Pricing, không thêm tính năng. Task T1–T4 chạy qua agentkit; T5–T9 làm tay vì hạn mức 5 giờ của gói Claude (đến 22:00 ngày 22/11/2026) làm worker dừng. Ghi chú này chỉ nêu kết quả đã chạy lại trên nhánh `sprint2/w6-tich-hop`.

## 1. Kết quả kiểm chứng (22/11/2026, máy cục bộ)

| Kiểm tra | Kết quả |
|---|---|
| `npm run check` (tsc, `node --test`, vite build) | Đạt: 946/946 test, build thành công |
| `npm run db:reset` rồi `npm run db:test` | `Result: PASS`: 14 file, 820 test |
| `scripts/concurrency-approve.mjs` (hai BTC duyệt cùng một đề xuất, Supabase cục bộ) | `pass: true`: một lời gọi thành công, một nhận `40001 DE_XUAT_DA_XU_LY`; đề xuất `APPROVED`; giá 500.000 → 600.000; đúng một dòng `NHAT_KY_GIA` |
| `scripts/concurrency-limit.mjs` (hai phiên cùng giữ vé, chạy ở W4) | Đạt: một thành công, một `VUOT_GIOI_HAN_VE`, tổng vé 3 ≤ 4 |
| Trình duyệt thật (bàn phím, 360 px, ảnh, độ trễ giá ≤ 5 giây) | **Chưa kiểm chứng** |
| OTP thật qua Supabase hosted, Realtime trên hosted | **Chưa kiểm chứng** |

## 2. Việc W6 đã làm

- **T1 (sửa lỗi):** `bookingService.ts` lấy tài khoản mock từ phiên BTC trong khi khán giả đăng nhập bằng khóa phiên riêng, nên giới hạn vé mock đếm sai tài khoản. Đã chuyển sang phiên người mua.
- **T2:** giá hiện hành nối với giá chốt của giữ chỗ mock.
- **T3:** `tests/sprint2-integration.test.mjs` (đăng nhập, OTP, giữ 3 vé, xin thêm 2 bị từ chối, engine tạo `PENDING`, duyệt đổi giá, giữ chỗ cũ giữ `DonGiaChot`, `ban_nhanh` rồi `ban_cham`) và `supabase/tests/sprint2_integration.sql` (23 test).
- **T4:** rà tiếp cận hai màn hình định giá BTC (`tests/sprint2-pricing-accessibility.test.mjs`).
- **Làm tay:** `scripts/concurrency-approve.mjs` (từ nhánh attempt của T6), `scripts/DEMO_SPRINT2.md`, thay các test tĩnh còn tồn (mục 5), sửa fixture pgTAP tích hợp.

**Phát hiện khi chạy thật:** `sprint2_integration.sql` do worker viết chưa từng được chạy (worker không có DB) và lỗi ngay ở fixture (chèn sự kiện `CONG_KHAI` khi chưa có suất và quyền biên tập). Đã sửa; đây là lý do bảng dưới chỉ ghi "db:test đạt" cho test này sau khi tôi chạy.

## 3. Bảng tiêu chí chấp nhận tổng cho Sprint 2

Quy ước: **máy chủ** = pgTAP trên DB cục bộ đã chạy; **gate** = test node trong `npm run check` (DOM/client giả); **chưa** = chưa kiểm chứng. Ghi chú chi tiết từng đợt nằm ở `sprint2-W1…W5-ghi-chu.md`.

### OTP (FR-T2-01)

| AC | Bằng chứng | Trạng thái |
|---|---|---|
| T2-01.1 mã đúng còn hạn vào bước chọn ghế | `otpService.ts`, `otpGate.js`; `tests/otp-service.test.mjs`, `tests/otp-gate.test.mjs`, `tests/otp-access-gate-ui.test.mjs`, `tests/sprint2-integration.test.mjs` | gate (mock). OTP thật chưa |
| T2-01.2 sai mã nêu số lần còn lại | `otpServiceCore.js`; `tests/otp-service.test.mjs` | gate |
| T2-01.3 sai 5 lần hủy mã, khóa 15 phút | `SO_LAN_SAI_TOI_DA`, `CUA_SO_SAI_GIAY` | **Chỉ hiển thị ở client; Supabase Auth không khóa 15 phút.** Không báo là đạt |
| T2-01.4 quá 5 phút bị từ chối | `otp_expiry = 300` trong `supabase/config.toml` | Cấu hình cục bộ; dự án hosted chưa |
| T2-01.5 gửi lại < 60 giây hoặc > 3 lần/giờ | 60 giây: `max_frequency = "60s"`; 3 lần/giờ: bộ đếm client | 60 giây theo cấu hình (chưa thử hosted); **3 lần/giờ chỉ ở client** |
| T2-01.6 không lưu/log OTP | `otpService.ts`; test không ghi mã vào storage, log, URL | gate |
| T2-01.7 gọi trực tiếp giữ ghế khi chưa xác minh bị từ chối | `tao_giu_cho_theo_suat` ném `42501`; `supabase/tests/sprint2_otp_limit.sql`, `sprint2_integration.sql` | máy chủ (JWT `amr` giả lập, không phải OTP thật) |
| T2-01.8 BTC bật/tắt theo sự kiện | `luu_cau_hinh_mua_ve`; `sprint2_purchase_config.sql`; `OrganizerPurchaseConfig.tsx`; `tests/organizer-purchase-config.test.mjs` | máy chủ + gate; giao diện chưa thử trình duyệt |
| T2-01.9 bàn phím, responsive, không chỉ màu | thuộc tính `aria-*`, CSS 360 px trong `OtpVerificationPanel.*` | gate (thuộc tính). **Thao tác thật chưa** |

### Giới hạn vé (FR-T2-02)

| AC | Bằng chứng | Trạng thái |
|---|---|---|
| T2-02.1 chọn tối đa 4 | `SeatMapSection.tsx`, `concertRuntime.js`; `tests/purchase-limit-presentation.test.mjs` | gate |
| T2-02.2 server từ chối kể cả gọi API trực tiếp | `VUOT_GIOI_HAN_VE` (22023); `sprint2_otp_limit.sql`, `sprint2_integration.sql` | máy chủ |
| T2-02.3 thông báo nêu giới hạn và số còn lại | `purchaseLimitError.js`, `purchaseLimitPresentation.js`; tests cùng tên | gate (giữ ≥ 5 giây bằng đồng hồ giả) |
| T2-02.4 hai phiên đồng thời không vượt | khóa advisory; `scripts/concurrency-limit.mjs` | **chạy thật đạt** |
| T2-02.5 hết hạn giải phóng số đếm | `sprint2_otp_limit.sql`; `tests/mock-booking.test.mjs` | máy chủ + gate |
| T2-02.6 BTC đổi `SoVeToiDaMoiDon`, chỉ vai trò phép, có audit | `luu_cau_hinh_mua_ve`, `NHAT_KY_CAU_HINH_MUA_VE`; `sprint2_purchase_config.sql` (62 test) | máy chủ |
| T2-02.7 không áp chéo giữa sự kiện | đếm theo (tài khoản, sự kiện); pgTAP hai sự kiện | máy chủ |

### Dynamic Pricing (FR-T4)

| AC | Bằng chứng | Trạng thái |
|---|---|---|
| T4-01.1 lưu khi sàn ≤ gốc ≤ trần, lỗi theo trường | `pricingFormLogic.js`; `tests/pricing-form.test.mjs`; `chk_khung_gia_hop_le`; `sprint2_data_foundation.sql` | gate + máy chủ; giao diện chưa thử trình duyệt |
| T4-02.1 khớp 4 ví dụ (1.790.000; 1.250.000 `CHAM_GIA_TRAN`; 480.000 `CHAM_GIA_SAN`; không đề xuất) | `pricingEngine.js`; `tests/pricing-engine.test.mjs` | gate |
| T4-02.2 deadband, một `PENDING` mỗi khu | chỉ mục duy nhất, `luu_de_xuat_gia`; `sprint2_pricing_rpc.sql`, `mock-pricing.test.mjs` | máy chủ + gate |
| T4-02.3 chạm trần/sàn có cảnh báo | `LoaiCanhBao`; `sprint2_pricing_rpc.sql` | máy chủ + gate |
| T4-02.4 đổi kịch bản Demand Simulator thì đề xuất đổi hướng | `mockPricing.js`; `sprint2_demand_simulator.sql`; `tests/sprint2-integration.test.mjs` (`ban_nhanh` tăng, `ban_cham` giảm) | gate + máy chủ. **Video demo là việc của người làm** |
| T4-03.1 duyệt → giá đổi, có `NHAT_KY_GIA`; khán giả thấy ≤ 5 giây | `duyet_de_xuat_gia`; `sprint2_price_approval.sql`; `priceRealtime.js` | giá đổi + audit: máy chủ. **Độ trễ ≤ 5 giây chưa đo** |
| T4-03.2 từ chối giữ giá | `tu_choi_de_xuat_gia`; `sprint2_price_approval.sql` | máy chủ |
| T4-03.3 hai BTC duyệt cùng lúc: một thành công, một lỗi | khóa `FOR UPDATE` + `40001`; `scripts/concurrency-approve.mjs` | **chạy thật đạt** (lỗi là `40001`; ứng dụng đổi thành 409 ở lớp dịch vụ) |
| T4-03.4 vai trò không đủ quyền bị chặn | `co_quyen_dinh_gia`, chặn `service_role` (`42501`); `sprint2_price_approval.sql` | máy chủ |
| T4-04.1 ghế đang giữ giữ `DonGiaChot` | `CHI_TIET_GIU_CHO.DonGiaChot`; `sprint2_otp_limit.sql`, `sprint2_integration.sql`, `sprint2-integration.test.mjs` | máy chủ + gate |
| T4-05.1 đề xuất vượt khung bị chặn, giá giữ nguyên, có audit | PriceGuard trong `luu_de_xuat_gia`; `sprint2_pricing_rpc.sql`, `sprint2_pricing_security.sql` | máy chủ |

## 4. Quyết định về dọn dữ liệu của `concurrency-approve.mjs`

`NHAT_KY_GIA` là nhật ký bất biến (trigger chặn DELETE, kể cả `service_role`) và các khóa ngoại `RESTRICT` giữ lại khu, đề xuất, người duyệt. Vì báo cáo cấm sửa migration, script **không xóa** dữ liệu nó tạo: kết quả đạt/không đạt chỉ dựa vào cuộc đua, phần còn lại in ra ở `cleanup.leftovers`, và người chạy `npm run db:reset` sau đó. Script chỉ dùng trên DB cục bộ có thể reset; không chạy lên DB demo hoặc production.

## 5. Test tĩnh đã gỡ (D1–D3)

Đã xóa `tests/sprint2-pricing-security.test.mjs` và `tests/sprint2-demand-simulator.test.mjs` (đọc `.sql` bằng regex; đã có pgTAP `sprint2_pricing_security.sql`, `sprint2_demand_simulator.sql`), và bỏ ba case đọc mã nguồn ở `tests/pricing-service.test.mjs` và `tests/pricing-cycle.test.mjs`. Test Sprint 1 cũ ngoài phạm vi Sprint 2 (`account-boundary`, `database-relationships`, `product-foundation`, `organizer-schedule-lineup`, `seat-generation-scheme`) vẫn đọc `.sql`/mã nguồn; không đụng tới vì không thuộc Sprint 2.

## 6. Việc người phải làm tay

- [ ] Chạy `npm run dev` ở chế độ mock, đi hết `scripts/DEMO_SPRINT2.md` Phần 1; kiểm bàn phím, 360 px, chụp ảnh.
- [ ] Quay video Demand Simulator đổi kịch bản (AC-T4-02.4).
- [ ] Đo độ trễ từ lúc bấm Duyệt đến lúc khán giả thấy giá mới (mục tiêu ≤ 5 giây).
- [ ] Kiểm OTP thật trên Supabase hosted: mẫu email `{{ .Token }}`, hiệu lực 300 giây, chờ gửi lại 60 giây.
- [ ] Thử Realtime `KHU_VUC` trên Supabase hosted.
- [ ] Quyết định có áp migration Sprint 2 lên staging `qxkgkbayxxaakkwtepss` hay không (chưa áp).

## 7. Tài liệu cần cập nhật

- Báo cáo chính và Word: FR-T2-01, FR-T2-02, FR-T4-02/03/04; nêu rõ 3 lần/giờ và khóa 15 phút chỉ ở client; nêu `DonGiaChot` do máy chủ ghi.
- ERD: cột `GIU_CHO.NguoiDungID`, `CHI_TIET_GIU_CHO.DonGiaChot`, bảng `DE_XUAT_GIA`, `NHAT_KY_GIA`, `NHAT_KY_CAU_HINH_MUA_VE`, `QUY_TAC_GIA`.
- Sơ đồ tuần tự: OTP, giữ chỗ có giới hạn, duyệt giá, giá realtime.
- Ma trận truy vết và Test Log: 946 test node, 14 file pgTAP / 820 test, hai script đồng thời đã chạy.
- `docs/` hoặc README của repo: lệnh `db:*` và hai script.
