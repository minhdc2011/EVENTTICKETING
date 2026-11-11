# EventTicketing — Hồ sơ Sprint 1

## Mục tiêu trình bày

Bộ hồ sơ này chứng minh chuỗi **yêu cầu khách hàng → phân tích nghiệp vụ → thiết kế hệ thống → triển khai → kiểm thử**. Đây là phần cốt lõi của môn Phân tích và thiết kế hệ thống; giao diện chỉ là một biểu hiện của thiết kế, không phải toàn bộ hệ thống.

## Phạm vi Sprint 1

- Người mua: xem danh mục và chi tiết sự kiện, suất diễn, hạng vé, sơ đồ ghế/phân khu, trạng thái mở bán và cập nhật trạng thái ghế realtime. Giữ chỗ tối đa 5 phút thuộc FR-T3-01 (Sprint 3); repo đã có lát cắt kỹ thuật nhưng không tính nghiệm thu Sprint 1.
- Ban tổ chức (BTC): đăng nhập, quản lý tổ chức, tạo/sửa/xem trước/công bố sự kiện, suất diễn và hạng vé trong đúng phạm vi tổ chức.
- Nền tảng: dữ liệu đa sự kiện, RLS/RBAC, realtime trạng thái ghế, giao diện sự kiện dùng chung và extension cho nội dung đặc thù.
- Chưa hoàn thành trong Sprint 1: cổng thanh toán thật, ví vé/QR động, hoàn tiền tự động, hàng đợi quy mô lớn, chống bot hoàn chỉnh và dashboard doanh thu hoàn chỉnh.

## Trạng thái hiện tại (10/11/2026)

- Sprint 1 (SRS phiên bản 1.2): hoàn thành, `npm run check` pass (TypeScript, **263/263 tests**, build 174 modules).
- Sprint 2 đang triển khai: xác minh OTP và giới hạn 4 vé mỗi đơn (`FR-T2-01`, `FR-T2-02`), Dynamic Pricing (`FR-T4-02`, `FR-T4-04`). Phần đã có sẵn trong repo (hạ tầng đăng nhập người mua, cột cấu hình `SoVeToiDaMoiDon`) được trình bày là phần dựng trước; chỉ trình bày những gì repo đã thực hiện.
- Tài khoản demo (Ban tổ chức, người mua) và kịch bản reset dữ liệu do nhóm chuẩn bị riêng; không ghi mật khẩu trong tài liệu nộp.

### Phân loại phần repo so với SRS

| Loại | Nội dung | Xử lý |
|---|---|---|
| **A. Đã là yêu cầu** | Cổng Ban tổ chức (`FR-T1-03`); tài khoản người mua đăng nhập (cần cho OTP, thuộc `FR-T2-01`) | Đã có trong SRS / làm trong Sprint 2 |
| **B. Hạ tầng, không là FR** | Marketplace danh mục, tìm kiếm, EventTemplate, design system, realtime, RLS | Ghi là nền tảng, không viết thành FR |
| **C. Đóng băng** | Artist discovery carousel, ảnh curated, dữ liệu seed, rà soát UI/UX | Không tính vào phạm vi; dừng thêm tính năng cho đến khi xong WBS Sprint 2 |

Không đưa `.agentkit.yaml`, `.multiagent/`, `dist/`, `node_modules` vào gói nộp.

## Danh mục tài liệu

1. `01_SRS_REQUIREMENTS.md` — đặc tả yêu cầu và phạm vi.
2. `02_ANALYSIS_AND_SYSTEM_DESIGN.md` — actor, use case (mã UC-T1/UC-BTC/UC-T3 thống nhất với tài liệu đặc tả), activity, kiến trúc, class diagram và 6 sequence (SD-01..04 Sprint 1, SD-05..06 Sprint 3).
3. `03_DATABASE_DESIGN.md` — ERD, ràng buộc và data dictionary cốt lõi.
4. `04_UI_CONSISTENCY_ADR.md` — quyết định kiến trúc đồng bộ Super Concert với event do BTC tạo.
5. `05_TRACEABILITY_TEST_AND_CLOSURE.md` — ma trận truy vết, bằng chứng kiểm thử, tồn đọng và kết luận Sprint 1.
6. `06_SUPABASE_LIVE_READINESS_AUDIT.md` — kiểm tra live database, ACL/RLS, dữ liệu, vận hành và điều kiện mở khóa demo.
7. `07_EVENTTICKETING_DESIGN_SYSTEM.md` — foundations, tokens, component states, data-to-UI contract và handoff prompt cho OpenDesign.
8. `08_SUPABASE_SCHEMA_EXPORT.md` — bản xuất đủ cột và RLS policy của 14 bảng từ Supabase live (03/11/2026), dùng để đối chiếu ERD và Class Diagram.

## Kịch bản demo đề xuất (8–10 phút)

1. Nêu vấn đề: người mua cần mua vé minh bạch (yêu cầu gốc của customer); BTC cần tự tạo và vận hành nhiều sự kiện (bổ sung ở SRS v1.1 khi phân tích Use Case).
2. Trình bày use case và kiến trúc 3 lớp.
3. Demo BTC tạo bản nháp → thêm suất diễn/hạng vé → preview → công bố.
4. Mở Super Concert và một event mới cạnh nhau để chứng minh cùng template, cùng hierarchy và cùng dữ liệu nguồn; mở Timeline để chỉ chuỗi `SU_KIEN.MoTaChiTiet` → parser an toàn `parseTimelineFromDescription` → React dialog (bảng `LICH_TRINH` đã được loại bỏ và gộp gọn vào Description).
5. Demo chọn hạng vé/sơ đồ (Sprint 1), sau đó giới thiệu lát cắt kỹ thuật Sprint 3: cơ chế giữ chỗ 5 phút bằng transaction + row lock (phân biệt khu ghế ngồi có `GheID` và khu đứng `GheID = NULL`).
6. Mở ERD 14 bảng, giải thích 3 loại quan hệ (1–1, 1–N, N–N), 3 chú thích kỹ thuật (FK dư thừa có trigger, GheID NULLable, timeline gộp vào sự kiện), Class Diagram 14 lớp Entity kết hợp tầng Service, và Ma trận liên kết kiến trúc (UC → ERD → Class → Sequence).
7. Mở audit Supabase, giải thích lỗi ACL đã được phát hiện bằng đối chiếu thiết kế–triển khai và chỉ trình bày live sau khi remediation được áp dụng/xác minh.
8. Kết thúc bằng giới hạn Sprint 1 và backlog (Should-Have Sprint 1: xóa/nhân bản bản nháp; việc sinh ghế chi tiết `GHE` đã làm khi lưu bản nháp, không phải khi công bố); không tuyên bố các chức năng chưa triển khai.

