# Ghi chú bàn giao Sprint 2 – Đợt W3 (duyệt giá, màn hình định giá, giá realtime cho khán giả)

Phạm vi W3: RPC duyệt/từ chối đề xuất giá, pgTAP tương ứng, dịch vụ + mock duyệt giá, dữ liệu demo dùng chung BTC/khán giả, màn hình Cấu hình giá, màn hình Đề xuất giá, luồng giá realtime (thật + mock), cập nhật giá trên giao diện React và trên runtime concert cũ. **Không** làm OTP, giới hạn 4 vé, `pg_cron`, và **không** sửa `tao_giu_cho_theo_suat` (W4 sửa một lần).

## 0. Cách đợt này được thực hiện và kiểm chứng (đọc trước)

- agentkit chạy 11 task. T1–T9 được duyệt bình thường (commit `99aab87` … `a14d0fa`). **T10 và T11 không đi hết vòng agentkit:** Astra (codex) hết hạn mức đến 22:04 ngày 21/11, nên T10 được **duyệt tay** (đọc diff theo tiêu chí kế hoạch, sau đó chạy `npm run check`) và T11 (ghi chú này) viết tay. Phần T10 nằm ở nhánh attempt đã merge (`405b2ed`).
- Đã chạy sau merge (máy Windows, Docker, Supabase CLI 3.2.0, ngày 21/11/2026):
  - `npm run check`: **701/701 test node đạt, build đạt**.
  - `npm run db:reset` áp được migration `20261114090000`; `npm run db:test`: **11 file pgTAP, 679 test, `Result: PASS`**, gồm `sprint2_price_approval.sql`.
  - Trước đó `sprint2_demand_simulator.sql` (W2) lỗi ép kiểu `ROW()`; đã sửa ở commit `b45d980` (lỗi bài test, không phải hàm).
- **Chưa chạy, không được coi là đạt:** trình duyệt thật (cả mock lẫn Supabase), độ trễ giá ≤ 5 giây, hai BTC duyệt đồng thời bằng hai phiên thật (pgTAP gọi tuần tự, không chứng minh cạnh tranh), Realtime trên Supabase hosted. Test Node dùng client/storage giả lập.

## 1. Bảng tiêu chí chấp nhận

Trạng thái: `gate` = test node trong `npm run check` đạt; `db:test đạt` = pgTAP đã chạy và đạt ở mục 0; `chưa kiểm chứng` = chưa có bằng chứng chạy.

| AC | Bằng chứng | Trạng thái |
|---|---|---|
| AC-T4-01.1 (lưu cấu hình khi sàn ≤ gốc ≤ trần, lỗi theo trường) | `src/components/organizer-ui/pricingFormLogic.js`, `tests/pricing-form.test.mjs`; màn hình `OrganizerPricingConfig.tsx`, điều phối `pricingPanelController.js` | gate (logic); giao diện `chưa kiểm chứng` trên trình duyệt |
| AC-T4-03.1 (duyệt → giá đổi, có `NHAT_KY_GIA`) | RPC `duyet_de_xuat_gia` trong `supabase/migrations/20261114090000_sprint2_price_approval.sql`; `supabase/tests/sprint2_price_approval.sql`; mock `src/domain/mockPricing.js`, `tests/mock-pricing.test.mjs` | db:test đạt (SQL); gate (mock) |
| AC-T4-03.1 (khán giả thấy ≤ 5 giây, không tải lại) | `src/services/priceRealtimeService.ts`, `src/domain/priceRealtime.js`, `tests/price-realtime.test.mjs`; `pricePresentation.js` | gate với client giả lập; **độ trễ chưa đo** |
| AC-T4-03.2 (từ chối giữ giá) | `tu_choi_de_xuat_gia` cùng migration; `sprint2_price_approval.sql`; `tests/price-proposals.test.mjs` | db:test đạt; gate |
| AC-T4-03.3 (hai BTC duyệt cùng lúc: một thành công, một 409) | khóa `FOR UPDATE` + khóa lạc quan mã `40001` trong cùng RPC; pgTAP kiểm duyệt lần hai trả `40001` tuần tự | tuần tự đã db:test đạt; **đồng thời thật chưa kiểm chứng** (script `concurrency-approve.mjs` thuộc W6) |
| AC-T4-03.4 (vai trò sai → 403) | RPC kiểm `CHU_SO_HUU`/`QUAN_TRI` bằng `auth.uid()`, chặn `service_role` (`42501`); `pricingServiceCore.js` đổi `42501` thành 403; pgTAP phủ VAN_HANH, SOAT_VE, khán giả, anon, service_role | db:test đạt; gate |
| AC-T4-04.1 (giá chốt cho ghế đang giữ) | Phía giao diện: `buildHeldPriceSnapshot` (`pricePresentation.js`), `heldPriceSnapshot` trong `concertRuntime.js`, `tests/price-presentation.test.mjs`, `tests/concert-price-realtime.test.mjs`. Giá chốt phía máy chủ (`DonGiaChot`) **chưa có** | giao diện: gate; phía máy chủ: **chờ W4** |

## 2. Thay đổi CSDL

Một migration mới: `20261114090000_sprint2_price_approval.sql`. Không có bảng/cột mới, không sửa migration cũ, không đổi `tao_giu_cho_theo_suat`. `KHU_VUC` đã nằm trong publication Realtime từ migration `20260927000000`, W3 không thêm publication trùng.

Hàm (đều `SECURITY DEFINER`, `search_path = public`, `REVOKE` từ `PUBLIC`, `anon`, `service_role`, `GRANT` cho `authenticated`; thân hàm vẫn chặn `service_role` và `auth.uid()` rỗng bằng `42501`):

- `public.duyet_de_xuat_gia(p_de_xuat_id BIGINT, p_ghi_chu TEXT, p_gia_dieu_chinh NUMERIC DEFAULT NULL)`
- `public.tu_choi_de_xuat_gia(p_de_xuat_id BIGINT, p_ly_do TEXT)`

Hợp đồng lỗi: `42501` sai quyền; `40001` đề xuất đã xử lý hoặc giá hiện hành khác `GiaHienTai`; giá điều chỉnh ngoài khung và đề xuất hết hạn trả **kết quả lỗi nghiệp vụ có mã** (không RAISE) để cập nhật trạng thái `EXPIRED` không bị rollback. Kiểu TypeScript khớp ở `src/types/database.types.ts`.

Khác với bản nháp SQL: **thứ tự khóa là `KHU_VUC` → `QUY_TAC_GIA` → `DE_XUAT_GIA`**, cùng thứ tự với RPC W2 (bản nháp khóa ngược). Ranh giới TTL 120 phút nhất quán với RPC hết hạn của W2.

## 3. Thay đổi phía client

- Dịch vụ/mock: `pricingService.ts`, `pricingServiceCore.js`, `mockPricing.js` thêm đọc danh sách đề xuất, duyệt, từ chối; mock có cùng điều kiện quyền/trạng thái/TTL/khung/xung đột, và tương thích dữ liệu mock v1 đã lưu.
- Dữ liệu demo: `src/domain/pricingMockDemo.js` (sự kiện `990001`, suất `990101`, khu `990201–990203`, slug `demo-dinh-gia-mo-phong`, tổ chức `mock-org-1`); mọi dữ liệu mô phỏng có nhãn `[MÔ PHỎNG]`.
- Màn hình BTC: `OrganizerPricingPanel.tsx`, `OrganizerPricingConfig.tsx`, `OrganizerPriceProposals.tsx`, CSS đi kèm; nối từ `OrganizerPortal.tsx` và nút "Cấu hình giá" ở `OrganizerEventCard.tsx`.
- Khán giả: `GenericEventPage.tsx`, `SeatMapSection.tsx`, `TicketTiersSection.tsx`, `SeatTooltip.tsx`, `SelectionSummary.tsx` nhận giá realtime; `src/legacy/concertRuntime.js` + `fragments/seating.html` cho `SUPER_CONCERT_2026` (đăng ký giá có phạm vi sự kiện/suất, thanh trạng thái kết nối giá, dọn listener và kênh khi teardown).

## 4. Hướng dẫn nghiệm thu bằng tay (chế độ mock)

Chạy `npm run dev` với `VITE_USE_MOCK_DATA=true` (mặc định là mock trừ khi đặt `false`).

1. Mở `/organizer/login`, đăng nhập tài khoản mock `organizer@demo.vn` (vai trò ORGANIZER; mật khẩu mock: **chưa xác minh trong ghi chú này**, xem `src/domain/accountAccess.js`).
2. Ở trang `/organizer` (Trung tâm Ban tổ chức) bấm **"[MÔ PHỎNG] Khởi tạo / khôi phục dữ liệu demo định giá"**. Nút chỉ có ở mock, không xóa sự kiện khác.
3. Ở thẻ sự kiện demo bấm **"Cấu hình giá"**; chọn suất/khu, sửa tham số, lưu (thử nhập sàn > gốc để thấy lỗi theo từng trường).
4. Bấm **Chạy ngay** để tạo đề xuất; chọn kịch bản `ban_nhanh` / `ban_cham` / `ban_deu` ở khối simulator (chỉ hiện khi sự kiện có cờ mô phỏng) rồi Chạy ngay lại để thấy hướng đề xuất đổi.
5. Mở màn hình **Đề xuất giá**: thử Duyệt, Duyệt với giá điều chỉnh (trong/ngoài khung), Từ chối.
6. Ở tab khác mở trang khán giả `/events/demo-dinh-gia-mo-phong/shows/suat-demo`; sau khi duyệt, ghi nhận bảng hạng vé/tooltip/sơ đồ đổi giá **không tải lại**. Tab cùng trình duyệt đồng bộ qua `localStorage`; nếu `localStorage` bị chặn, thanh trạng thái phải nói rõ giới hạn đồng bộ giữa tab.
7. Với runtime concert (`SUPER_CONCERT_2026`), kiểm tra riêng sơ đồ SVG: giá khu trong nhãn, tooltip đang mở, vé đang giữ không đổi giá.
8. Chụp ảnh hai màn hình mới (Cấu hình giá, Đề xuất giá). Đo độ trễ từ lúc bấm Duyệt đến lúc khán giả thấy giá mới, mục tiêu ≤ 5 giây (chưa đo).

Kiểm tra hai BTC duyệt đồng thời: để W6 (`scripts/concurrency-approve.mjs`).

## 5. Tài liệu cần cập nhật (chỉ liệt kê)

ERD (không thêm bảng ở W3, nhưng hai hàm mới), đặc tả Use Case UC-T4-01/03/04, sơ đồ tuần tự duyệt giá và giá realtime, ma trận truy vết (AC-T4-01.1, 03.1–03.4, 04.1), Test Log (11 file pgTAP/679 test, 701 test node, phần nào chưa chạy).

## 6. Rủi ro và việc dở dang

- **`DonGiaChot` phía máy chủ chưa có** (W4 thêm `CHI_TIET_GIU_CHO.DonGiaChot`); hiện giá "chốt" chỉ là snapshot hiển thị phía giao diện, không phải bảo đảm của máy chủ.
- **Khóa ngoại nhật ký khi sửa/xóa khu:** `NHAT_KY_GIA` tham chiếu khu; sửa hoặc xóa khu có nhật ký có thể bị chặn hoặc cần xử lý riêng (hợp đồng ID lịch sử đã ghi ở ghi chú W2, mục 3.3).
- **T10 chưa qua vòng duyệt của Astra** (duyệt tay một lần). Runtime concert là mã legacy lớn; nên thử tay kỹ ở bước 7.
- Realtime thật qua Supabase hosted chưa thử; cần Realtime bật cho `KHU_VUC` và RLS cho phép khán giả đọc giá khu của sự kiện công khai.
- Ngoài phạm vi W3: OTP, giới hạn vé, `pg_cron`, sửa `tao_giu_cho_theo_suat`.
