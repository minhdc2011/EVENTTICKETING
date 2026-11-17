ĐỢT W3 SPRINT 2: GIAO DIỆN ĐỊNH GIÁ VÀ DUYỆT GIÁ (WBS 4.3, 4.7, 4.8)

Điều kiện: W1 và W2 đã được merge. Đọc .multiagent/briefs/sprint2-spec.md (mục 2 và 5).

Việc cần làm:
1. UC-T4-01 trong cổng BTC (src/components/organizer-ui/): màn hình cấu hình khung giá sàn và trần từng khu, bước nhảy, biên độ chu kỳ, ngưỡng lấp đầy, trọng số, bật tắt định giá, nút Chạy ngay (gọi chu kỳ tính giá ở chế độ nhanh). Kiểm tra từng trường, lỗi hiển thị theo trường, chỉ CHU_SO_HUU và QUAN_TRI thấy và dùng được.
2. Migration mới: RPC duyet_de_xuat_gia(p_de_xuat_id, p_ghi_chu, p_gia_dieu_chinh mặc định NULL) và tu_choi_de_xuat_gia(p_de_xuat_id, p_ly_do) theo mục 2 của đặc tả (một giao dịch: cập nhật giá, đổi trạng thái, ghi NHAT_KY_GIA; khóa lạc quan, mã 40001 cho xung đột; kiểm vai trò, TTL, khung). Tham khảo duyet_de_xuat_gia trong dp_schema_draft.sql.txt.
3. UC-T4-03: màn hình Đề xuất giá: danh sách PENDING (khu, giá hiện hành, giá đề xuất, phần trăm đổi, r, u, T_rem, khung sàn trần, hạn xử lý, nhãn cảnh báo), nút Duyệt, Duyệt với giá điều chỉnh (trong khung), Từ chối (lý do không bắt buộc); lỗi 403, khung hoặc hết hạn, 409 hiển thị rõ ràng.
4. UC-T4-04: giao diện khán giả cập nhật giá hiện hành (tooltip và bảng giá) qua Realtime khi KHU_VUC đổi, theo mẫu seatRealtimeService; mất kết nối thì hiện trạng thái đang kết nối lại.
5. Mọi màn hình chạy được ở chế độ mock; test hành vi cho logic thuần (kiểm tra khung giá, định dạng, trạng thái nút). pgTAP supabase/tests/sprint2_approval_rpc.sql cho duyệt, từ chối, 409, 403, vai trò.

Nghiệm thu: npm run check đạt; AC-T4-01.1, AC-T4-03.1 đến .4 có bằng chứng (nêu rõ phần cần Supabase thật chưa chạy); mô tả cách mở từng màn hình mới ở chế độ mock (đường dẫn, tài khoản mock BTC, dữ liệu mẫu) và các trạng thái rỗng, lỗi, có dữ liệu để tôi tự chụp ảnh; bàn phím dùng được.
Không làm: sửa tao_giu_cho_theo_suat (đợt W4 sửa một lần duy nhất); OTP; giới hạn vé.
