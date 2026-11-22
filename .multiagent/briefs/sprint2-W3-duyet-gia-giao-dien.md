# Đợt W3 Sprint 2: duyệt giá và giao diện định giá (ban A và ban B)

Chạy bằng `agentkit team`. **Đọc trước:** `.multiagent/briefs/sprint2-spec.md` (mục 2, 5, 7, 8).

**Mục tiêu:** BTC cấu hình khung giá, chạy tính giá, duyệt hoặc từ chối đề xuất; khán giả thấy giá đổi không cần tải lại.
**WBS:** 4.3, 4.7, 4.8. **Điều kiện đầu vào:** W1 và W2 đã merge (có `pricingEngine.js`, `pricingService.ts`, các RPC giá, `mo_phong_nhu_cau`); migration mới nhất `20261113100000`. Mọi màn hình phải chạy được ở chế độ mock (`VITE_USE_MOCK_DATA=true`).

## Gợi ý chia task

| Task | Ban | Chế độ | Sau | Việc | Tiêu chí |
|---|---|---|---|---|---|
| T1 | A | pair | | Migration `20261114090000_sprint2_price_approval.sql`: `duyet_de_xuat_gia(p_de_xuat_id, p_ghi_chu, p_gia_dieu_chinh DEFAULT NULL)`, `tu_choi_de_xuat_gia(p_de_xuat_id, p_ly_do)` | Mỗi hàm một giao dịch: khóa dòng đề xuất (`FOR UPDATE`), kiểm vai trò `CHU_SO_HUU`/`QUAN_TRI` bằng `auth.uid()` (không cho `service_role`), TTL 120 phút, khung sàn/trần, khóa lạc quan (giá hiện hành phải bằng `GiaHienTai` của đề xuất, nếu không lỗi mã `40001`); duyệt cập nhật `KHU_VUC.GiaVeNiemYet`, đổi `APPROVED`, ghi `NHAT_KY_GIA` (giá cũ/mới, phần trăm, người, lý do); giá điều chỉnh phải trong khung (loại `DIEU_CHINH_THU_CONG`); từ chối giữ giá và đổi `REJECTED`; `SECURITY DEFINER`, `SET search_path`, `REVOKE` từ `PUBLIC` và `anon`; tham khảo hàm `duyet_de_xuat_gia` trong bản nháp SQL |
| T2 | A | pair | T1 | pgTAP `supabase/tests/sprint2_price_approval.sql` | `plan(N)` đúng; phủ: duyệt đổi giá và ghi nhật ký, giá điều chỉnh trong và ngoài khung, từ chối, `40001` khi giá đã đổi, `42501` cho vai trò sai và cho `service_role`, hết hạn; tự tạo fixture |
| T3 | B | pair | | Màn hình cấu hình giá (UC-T4-01) trong `src/components/organizer-ui/` | Kiểm tra từng trường trước khi gọi `luu_quy_tac_gia` (sàn > 0, sàn ≤ gốc ≤ trần, bước nhảy > 0, biên độ trong (0,1], ngưỡng thấp < cao, trọng số ≥ 0) và hiện lỗi theo từng trường; chỉ `CHU_SO_HUU`/`QUAN_TRI` thấy và dùng; nút **Chạy ngay** gọi `lay_so_lieu_dinh_gia`, `pricingEngine`, `luu_de_xuat_gia` qua `pricingService`; nút chạy Demand Simulator khi sự kiện có cờ mô phỏng; chạy được ở mock; logic kiểm tra tách thuần và có test node |
| T4 | B | pair | T1 | Màn hình **Đề xuất giá** (UC-T4-03) | Danh sách `PENDING` có khu, giá hiện hành, giá đề xuất, phần trăm đổi, `r`, `u`, `T_rem`, khung sàn/trần, hạn xử lý, nhãn cảnh báo; nút Duyệt, Duyệt với giá điều chỉnh (trong khung), Từ chối (lý do không bắt buộc); lỗi 403, ngoài khung hoặc hết hạn, 409 (giá đã đổi, nút tải lại) có thông báo rõ; không dựa vào màu; bàn phím dùng được; mock chạy được |
| T5 | B | solo | | Giá thời gian thực cho khán giả (UC-T4-04) | Nghe thay đổi `KHU_VUC` theo mẫu `seatRealtimeService`; tooltip và bảng giá đổi mà không tải lại; mất kết nối thì hiện trạng thái đang kết nối lại; ghế đang giữ không đổi giá hiển thị đã chốt (nếu có dữ liệu); không phá hành vi sơ đồ hiện có (test cũ vẫn đạt) |
| T6 | A | solo | T1–T5 | Ghi chú `.multiagent/notes/sprint2-W3-ghi-chu.md` theo spec mục 7 | Có bảng AC (AC-T4-01.1, AC-T4-03.1 đến .4), **cách mở từng màn hình mới ở chế độ mock** (đường dẫn, tài khoản mock BTC, dữ liệu mẫu, thao tác từng bước) để người dùng tự chụp ảnh, tài liệu cần cập nhật |

## Ngoài phạm vi

Sửa `tao_giu_cho_theo_suat` (đợt W4 sửa một lần duy nhất), OTP, giới hạn vé, `pg_cron`.

## Nghiệm thu đợt (người làm sau khi merge)

`npm run db:reset` rồi `npm run db:test`; chạy `npm run dev` ở chế độ mock, cấu hình giá, bấm Chạy ngay, duyệt một đề xuất, mở trang khán giả ở tab khác và xem giá đổi (ghi lại độ trễ, mục tiêu ≤ 5 giây); chụp ảnh hai màn hình mới.
