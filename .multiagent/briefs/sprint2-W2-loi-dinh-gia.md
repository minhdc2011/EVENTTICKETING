ĐỢT W2 SPRINT 2: LÕI ĐỊNH GIÁ (WBS 4.1, 4.4, 4.5, 4.6)

Điều kiện: W1 đã được merge (có 3 bảng và cột mới). Đọc .multiagent/briefs/sprint2-spec.md, nhất là mục 2 (mô hình 5 bước, 4 ví dụ chuẩn, kiến trúc triển khai).

Việc cần làm:
1. src/domain/pricingEngine.js và pricingEngine.d.ts: hàm thuần tính 5 bước. Test hành vi trong tests/ cho đúng 4 ví dụ chuẩn (khớp đến từng đồng) và các biên: r=0, r=1, N_total=0, v_target=0, giá sàn bằng giá trần, đề xuất bằng giá hiện hành.
2. Migration mới: RPC luu_quy_tac_gia (kiểm khung sàn gốc trần, vai trò CHU_SO_HUU hoặc QUAN_TRI, audit), lay_so_lieu_dinh_gia (số liệu từng khu để engine tính, theo sự kiện), luu_de_xuat_gia (PriceGuard phía máy chủ: trong khung sàn trần, biên độ, deadband, một PENDING mỗi khu, vai trò; vi phạm thì không áp dụng và ghi audit), het_han_de_xuat_gia (PENDING quá 120 phút thành EXPIRED). Mọi RPC SECURITY DEFINER, SET search_path = public, REVOKE từ PUBLIC và anon.
3. src/services/pricingService.ts: gọi RPC; có nhánh mock khi useMockData (lưu localStorage) để giao diện chạy được không cần CSDL.
4. Demand Simulator: kịch bản ban_nhanh, ban_cham, ban_deu chỉ chạy trên sự kiện có TuyChonMoRong moPhong bằng true; LyDoDeXuat bắt đầu bằng [MÔ PHỎNG]; có bản mock.
5. scripts/run-pricing-cycle.mjs với tham số --su-kien và --nhanh, đọc khóa từ biến môi trường, không commit khóa.
6. pgTAP supabase/tests/sprint2_pricing_rpc.sql: PriceGuard chặn đề xuất vượt khung từ mọi nguồn, deadband, một PENDING mỗi khu, vai trò không đủ quyền nhận lỗi 42501, hết hạn.

Nghiệm thu: npm run check đạt; AC-T4-02.1, .2, .3, AC-T4-05.1 có bằng chứng (test engine và pgTAP đã viết; ghi rõ cái nào chưa chạy); AC-T4-02.4 có kịch bản demo chạy được ở chế độ mock.
Không làm: giao diện BTC, RPC duyệt và từ chối (đợt W3), giữ chỗ và OTP (đợt W4).
