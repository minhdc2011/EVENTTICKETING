# EventTicketing — Hồ sơ Sprint 1

## Mục tiêu trình bày

Bộ hồ sơ này chứng minh chuỗi **yêu cầu khách hàng → phân tích nghiệp vụ → thiết kế hệ thống → triển khai → kiểm thử**. Đây là phần cốt lõi của môn Phân tích và thiết kế hệ thống; giao diện chỉ là một biểu hiện của thiết kế, không phải toàn bộ hệ thống.

## Phạm vi Sprint 1

- Người mua: xem danh mục và chi tiết sự kiện, suất diễn, hạng vé, sơ đồ ghế/phân khu, trạng thái mở bán và giữ chỗ tối đa 5 phút.
- Ban tổ chức (BTC): đăng nhập, quản lý tổ chức, tạo/sửa/xem trước/công bố sự kiện, suất diễn và hạng vé trong đúng phạm vi tổ chức.
- Nền tảng: dữ liệu đa sự kiện, RLS/RBAC, realtime trạng thái ghế, giao diện sự kiện dùng chung và extension cho nội dung đặc thù.
- Chưa hoàn thành trong Sprint 1: cổng thanh toán thật, ví vé/QR động, hoàn tiền tự động, hàng đợi quy mô lớn, chống bot hoàn chỉnh và dashboard doanh thu hoàn chỉnh.

## Danh mục tài liệu

1. `01_SRS_REQUIREMENTS.md` — đặc tả yêu cầu và phạm vi.
2. `02_ANALYSIS_AND_SYSTEM_DESIGN.md` — actor, use case, activity, kiến trúc và sequence giữ chỗ.
3. `03_DATABASE_DESIGN.md` — ERD, ràng buộc và data dictionary cốt lõi.
4. `04_UI_CONSISTENCY_ADR.md` — quyết định kiến trúc đồng bộ Super Concert với event do BTC tạo.
5. `05_TRACEABILITY_TEST_AND_CLOSURE.md` — ma trận truy vết, bằng chứng kiểm thử, tồn đọng và kết luận Sprint 1.
6. `06_SUPABASE_LIVE_READINESS_AUDIT.md` — kiểm tra live database, ACL/RLS, dữ liệu, vận hành và điều kiện mở khóa demo.
7. `07_EVENTTICKETING_DESIGN_SYSTEM.md` — foundations, tokens, component states, data-to-UI contract và handoff prompt cho OpenDesign.

## Kịch bản demo đề xuất (8–10 phút)

1. Nêu vấn đề từ customer: người mua cần mua vé minh bạch; BTC cần tự tạo và vận hành nhiều sự kiện.
2. Trình bày use case và kiến trúc 3 lớp.
3. Demo BTC tạo bản nháp → thêm suất diễn/hạng vé → preview → công bố.
4. Mở Super Concert và một event mới cạnh nhau để chứng minh cùng template, cùng hierarchy và cùng dữ liệu nguồn; mở Timeline để chỉ chuỗi `LICH_TRINH` → service/domain → React dialog.
5. Demo chọn hạng vé/sơ đồ và giải thích cơ chế giữ chỗ 5 phút bằng transaction + row lock.
6. Mở ERD và ma trận truy vết để chỉ ra mỗi yêu cầu được hiện thực và kiểm thử ở đâu.
7. Mở audit Supabase, giải thích lỗi ACL đã được phát hiện bằng đối chiếu thiết kế–triển khai và chỉ trình bày live sau khi remediation được áp dụng/xác minh.
8. Kết thúc bằng giới hạn Sprint 1 và backlog Sprint 2; không tuyên bố các chức năng chưa triển khai.

