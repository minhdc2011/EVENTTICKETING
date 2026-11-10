# 01 — Software Requirements Specification (Sprint 1)

> **Quy ước mã thống nhất (02/11/2026).** Mã yêu cầu theo SRS: `FR-T1-01..04` (Sprint 1), `FR-T3-01` (Sprint 3). `FR-T1-03` (cổng Ban tổ chức, `REQ-T1-08`) gồm `FR-T1-03.1..03.6`. Mã Use Case theo tài liệu đặc tả `Requirements_UseCases_Sprint1`: `UC-T1-01..05`, `UC-BTC-01..05`, `UC-T3-01..02`. NFR dùng đúng số hiệu ở Phần 2 của SRS.

## 1. Bối cảnh và vấn đề

EventTicketing phải phục vụ đồng thời hai nhóm chính:

- **Người mua (user):** tìm sự kiện đáng tin cậy, hiểu rõ giá/quyền lợi, chọn suất diễn và ghế/phân khu, không bị bán trùng vé.
- **Ban tổ chức (customer):** tự tạo, chỉnh sửa, xem trước, công bố và quản lý nhiều sự kiện mà không cần đội phát triển làm landing page riêng.

Vấn đề hiện hữu là Super Concert từng được tinh chỉnh như sản phẩm đơn lẻ nên khác rõ rệt với event do BTC tạo. Điều này tạo hai nguồn hiển thị, hard-code dữ liệu và làm giảm độ tin cậy của sản phẩm đa sự kiện.

## 2. Actor và quyền

- `USER`: xem event công khai, xem suất diễn/hạng vé/sơ đồ; tạo hoặc hủy giữ chỗ thuộc FR-T3-01 (Sprint 3, đã có lát cắt kỹ thuật).
- `CHU_SO_HUU`, `QUAN_TRI`, `BIEN_TAP`: quản lý sự kiện trong tổ chức theo quyền biên tập.
- `VAN_HANH`, `SOAT_VE`: chỉ xem trong lát cắt hiện tại; thao tác ghi bị chặn.
- `ANON`: chỉ đọc sự kiện đã công bố; không được thấy bản nháp của BTC khác.
- `SYSTEM`: hết hạn giữ chỗ, cập nhật trạng thái ghế và phát realtime.

## 3. Yêu cầu chức năng

> `FR-T1-03` (`REQ-T1-08`) và `FR-T1-04` được bổ sung ở SRS phiên bản 1.1 (02/11/2026). `FR-T1-03` là yêu cầu suy ra từ vai trò Ban tổ chức trong biên bản làm việc, không phải trích dẫn trực tiếp của customer. `FR-T1-04` truy vết `REQ-T1-05`. Từ SRS phiên bản 1.2 (10/11/2026), `FR-T4-02` và `FR-T4-04` thuộc Sprint 2.

| ID | Yêu cầu | Ưu tiên | Sprint | Trạng thái |
|---|---|---|---|---|
| FR-T1-01 | Xem danh mục sự kiện công khai, trang chi tiết theo slug, chọn suất diễn; thấy thời gian, địa điểm, timeline, lineup và trạng thái mở bán | Must | 1 | Đã triển khai |
| FR-T1-02 | Xem sơ đồ phân khu/ghế, hạng vé, giá, quyền lợi và trạng thái ghế; cập nhật trạng thái ghế realtime theo suất diễn | Must | 1 | Đã triển khai |
| FR-T1-03.1 | BTC đăng nhập; hệ thống phân biệt tài khoản người mua (USER) và BTC (ORGANIZER) | Must | 1 | Đã triển khai |
| FR-T1-03.2 | Tạo tổ chức, quản lý dữ liệu theo vai trò thành viên | Must | 1 | Nền tảng/RLS đã triển khai |
| FR-T1-03.3 | Tạo/sửa bản nháp sự kiện, nhiều suất diễn, hạng vé, timeline, nghệ sĩ | Must | 1 | Đã triển khai (chưa sinh ghế chi tiết `GHE` cho sự kiện do BTC tạo) |
| FR-T1-03.4 | Xem trước bản nháp bằng template công khai | Must | 1 | Đã triển khai |
| FR-T1-03.5 | Kiểm tra điều kiện tối thiểu và công bố | Must | 1 | Đã triển khai |
| FR-T1-03.6 | Mọi sự kiện dùng một template chuẩn; phần đặc thù là extension | Must | 1 | Đã triển khai |
| FR-T1-04 | Sơ đồ hỗ trợ zoom/pan, lọc khu, tìm ghế, tooltip | Must | 1 | Triển khai một phần (chưa cuộn chuột/kéo; tìm ghế chưa báo "không tìm thấy" ở sơ đồ tổng quan; sửa ở Sprint 2) |
| FR-T3-01 | Chọn ghế và giữ 1–4 vé trong 5 phút, chống hai phiên giữ cùng ghế | Must | 3 | Lát cắt kỹ thuật backend đã có; không tính nghiệm thu Sprint 1 |
| FR-T3-02, FR-T3-03 | Thanh toán đa kênh, hoàn tiền, phát hành vé/QR | Must | 3 | Backlog |
| FR-T4-01 | Hàng chờ ảo, hiển thị vị trí/ETA | Must | 4 | Backlog |
| FR-T4-02, FR-T4-04 | Khung giá sàn/trần và định giá động | Must | 2 | Chưa triển khai |
| FR-T4-03 | Dashboard doanh thu/tồn kho/check-in realtime | Should | 4 | Backlog |

## 4. Quy tắc nghiệp vụ

Quy tắc chung của hệ thống ghi `BR-Gxx` để không trùng với quy tắc theo use case (`BR-01.x`, `BR-02.x`, `BR-BTC…`, `BR-HOLD-…`) trong tài liệu đặc tả.


- BR-G01: Một sự kiện thuộc đúng một tổ chức; một sự kiện có một hoặc nhiều suất diễn.
- BR-G02: Chỉ sự kiện `CONG_KHAI` được đọc công khai; preview bản nháp chỉ dành cho BTC có quyền.
- BR-G03: Mỗi hạng vé thuộc một suất diễn; mã hạng vé là duy nhất trong suất diễn.
- BR-G04 (Sprint 3): Một lượt giữ tối đa 4 vé; thời hạn giữ là 5 phút tính theo thời gian máy chủ.
- BR-G05 (Sprint 3): Ghế ngồi được khóa hàng (`FOR UPDATE`) trước khi đổi sang `DANG_GIU`; ghế không `TRONG` bị từ chối.
- BR-G06 (Sprint 3): Giữ chỗ hết hạn phải trả ghế về `TRONG`; các trạng thái giữ hợp lệ gồm `ACTIVE`, `EXPIRED`, `RELEASED`, `CONVERTED`.
- BR-G07: Thành viên chỉ thao tác dữ liệu thuộc tổ chức của mình; vai trò chỉ xem không được gọi thao tác ghi.
- BR-G08: Dữ liệu tên, giá, tồn vé và chính sách trên UI phải đến từ record sự kiện/hạng vé, không hard-code theo template.

## 5. Ràng buộc chất lượng và NFR tương ứng trong SRS

| NFR (Phần 2 SRS) | Ràng buộc |
|---|---|
| NFR-09 (Security, T1; bổ sung ở SRS v1.1) | Bảo mật: Supabase RLS, hàm `SECURITY DEFINER` có `search_path = public`, phân quyền theo tổ chức |
| NFR-02 | Nhất quán: transaction và row lock ngăn bán trùng khi giữ chỗ |
| NFR-01, NFR-03 | Hiệu năng: tải sơ đồ và trạng thái ghế đủ nhanh; tải concert là mục tiêu, chưa chứng minh bằng load test Sprint 1 |
| NFR-07 | Khả dụng: trạng thái loading/error/not-found rõ ràng; phần tùy chọn trống tự ẩn. Accessibility: focus-visible, vùng chạm tối thiểu 44px, hỗ trợ reduced motion, không chỉ dùng màu. Responsive: mobile từ 320/375px, tablet và desktop |
| Nội bộ (không thuộc NFR của SRS) | Maintainability: một composition chi tiết event; category chỉ đổi token/extension |

## 6. Tiêu chí chấp nhận Sprint 1

- BTC tạo một event âm nhạc mới mà không sửa code, preview và công bố được.
- Super Concert và event mới có cùng header, hero hierarchy, suất diễn, hạng vé, địa điểm, chính sách, liên hệ và CTA.
- Super Concert vẫn giữ lineup, sơ đồ ghế tương tác và timeline như extension.
- Tài khoản/role ngoài tổ chức không sửa được event.
- Full suite type-check, test và build pass; các chức năng chưa có được gắn nhãn/backlog minh bạch.

