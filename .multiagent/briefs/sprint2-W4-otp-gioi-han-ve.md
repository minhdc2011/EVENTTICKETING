ĐỢT W4 SPRINT 2: OTP VÀ GIỚI HẠN 4 VÉ (WBS 2.3 đến 2.6, 3.2 đến 3.5, DonGiaChot)

Điều kiện: W1 đã được merge. Đọc .multiagent/briefs/sprint2-spec.md (mục 3, 4) và .multiagent/briefs/limit4_draft.sql.txt (chỉ là đoạn nháp bổ sung, không phải bản vá rời).

Việc cần làm:
1. Tìm định nghĩa hiện tại của tao_giu_cho_theo_suat(p_suat_dien_id BIGINT, p_phien_id UUID, p_items JSONB) trong supabase/migrations. Tạo MỘT migration CREATE OR REPLACE toàn bộ hàm, giữ nguyên chữ ký và hành vi cũ, và bổ sung: (a) cổng OTP: sự kiện có YeuCauXacMinhOTP bằng true mà phiên chưa xác minh trong 24 giờ thì lỗi 42501 (nhận biết qua claim amr của JWT; nếu không đủ thông tin thì dừng và báo, đừng đoán); (b) đếm vé đang giữ theo tài khoản và sự kiện với pg_advisory_xact_lock rồi so với SoVeToiDaMoiDon (mặc định 4), vượt thì lỗi VUOT_GIOI_HAN_VE mã 22023; (c) ghi GIU_CHO.NguoiDungID và CHI_TIET_GIU_CHO.DonGiaChot bằng giá niêm yết hiện hành.
2. Migration hoặc RPC cho BTC cấu hình SoVeToiDaMoiDon và YeuCauXacMinhOTP theo sự kiện (chỉ CHU_SO_HUU và QUAN_TRI, có validation và audit).
3. Dịch vụ OTP phía client (src/services/): signInWithOtp với shouldCreateUser false và verifyOtp qua Supabase Auth; không lưu và không log mã; đếm ngược hiệu lực và thời gian gửi lại 60 giây; nhánh mock dùng mã cố định chỉ khi useMockData. Ghi rõ trong báo cáo tham số nào do Supabase Auth thực thi được và tham số nào chỉ là hiển thị.
4. Giao diện: nhập OTP (đếm ngược, gửi lại, thông báo lỗi nêu số lần còn lại, bàn phím dùng được, không chỉ dựa vào màu); cổng chặn: sự kiện yêu cầu OTP mà chưa xác minh thì không vào bước chọn ghế; bộ đếm đã chọn x trên 4 và thông báo khi vượt giới hạn (nêu giới hạn và số vé còn lại, hiển thị ít nhất 5 giây); màn hình BTC cấu hình hai tham số.
5. Test: logic thuần (đếm ngược, định dạng, trạng thái) trong tests/; pgTAP supabase/tests/sprint2_otp_limit.sql (403 khi chưa xác minh, VUOT_GIOI_HAN_VE, không áp dụng chéo giữa sự kiện, hết hạn giữ chỗ giải phóng số đếm, DonGiaChot được ghi); script thử đồng thời scripts/concurrency-limit.mjs (đọc khóa từ biến môi trường, dùng dữ liệu dùng một lần và dọn sau khi chạy) cho AC-T2-02.4.

Nghiệm thu: npm run check đạt và mọi test Sprint 1 vẫn đạt; AC-T2-01.1 đến .9 và AC-T2-02.1 đến .7, AC-T4-04.1 có bằng chứng (ghi rõ chưa chạy với Supabase thật).
Không làm: thanh toán, vé đã mua, CAPTCHA, SMS cố định.
