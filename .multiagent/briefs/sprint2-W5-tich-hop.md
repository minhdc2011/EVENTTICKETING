ĐỢT W5 SPRINT 2: TÍCH HỢP, HỒI QUY VÀ DEMO (WBS 5.1, 5.2 phần mã)

Điều kiện: W1 đến W4 đã được merge. Đọc .multiagent/briefs/sprint2-spec.md.

Việc cần làm:
1. Tích hợp luồng đầu cuối: đăng nhập, xác minh OTP (nếu sự kiện yêu cầu), chọn ghế tối đa 4, thấy giá hiện hành, BTC duyệt đề xuất và khán giả thấy giá đổi không cần tải lại. Sửa mọi chỗ gãy giữa các tính năng (không thêm tính năng mới).
2. Kịch bản demo chạy được ở chế độ mock trong scripts/DEMO_SPRINT2.md: các bước, dữ liệu mẫu, kịch bản Demand Simulator ban_nhanh rồi ban_cham, thứ tự thao tác của BTC và khán giả, kết quả mong đợi từng bước.
3. Test tích hợp bằng node (logic và mock): luồng OTP, vượt giới hạn, đề xuất giá, duyệt, giá đổi, DonGiaChot. Script scripts/concurrency-approve.mjs cho AC-T4-03.3 (hai BTC duyệt cùng lúc: một thành công, một nhận 409), đọc khóa từ biến môi trường, dùng dữ liệu dùng một lần.
4. Hồi quy: toàn bộ test Sprint 1 vẫn đạt; không thay đổi hành vi FR-T1-01 đến FR-T1-04.
5. Rà tiếp cận và responsive cho 4 màn hình mới (OTP, bộ đếm vé, cấu hình giá, duyệt giá): tab được, aria-label, focus rõ, thông báo không chỉ dựa vào màu; ghi kết quả thật vào scripts/DEMO_SPRINT2.md.

Nghiệm thu: npm run check đạt; bảng AC / bằng chứng cho toàn bộ AC của đặc tả với cột đã chạy hay chưa; danh sách việc người phải làm tay (áp dụng migration lên Supabase, chạy pgTAP, chạy hai script đồng thời, cấu hình Auth).
Không làm: tính năng ngoài Sprint 2.
