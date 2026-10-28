# 01 — Software Requirements Specification (Sprint 1)

## 1. Bối cảnh và vấn đề

EventTicketing phải phục vụ đồng thời hai nhóm chính:

- **Người mua (user):** tìm sự kiện đáng tin cậy, hiểu rõ giá/quyền lợi, chọn suất diễn và ghế/phân khu, không bị bán trùng vé.
- **Ban tổ chức (customer):** tự tạo, chỉnh sửa, xem trước, công bố và quản lý nhiều sự kiện mà không cần đội phát triển làm landing page riêng.

Vấn đề hiện hữu là Super Concert từng được tinh chỉnh như sản phẩm đơn lẻ nên khác rõ rệt với event do BTC tạo. Điều này tạo hai nguồn hiển thị, hard-code dữ liệu và làm giảm độ tin cậy của sản phẩm đa sự kiện.

## 2. Actor và quyền

- `USER`: xem event công khai, xem suất diễn/hạng vé/sơ đồ, tạo hoặc hủy giữ chỗ.
- `CHU_SO_HUU`, `QUAN_TRI`, `BIEN_TAP`: quản lý sự kiện trong tổ chức theo quyền biên tập.
- `VAN_HANH`, `SOAT_VE`: chỉ xem trong lát cắt hiện tại; thao tác ghi bị chặn.
- `ANON`: chỉ đọc sự kiện đã công bố; không được thấy bản nháp của BTC khác.
- `SYSTEM`: hết hạn giữ chỗ, cập nhật trạng thái ghế và phát realtime.

## 3. Yêu cầu chức năng

| ID | Yêu cầu | Ưu tiên | Sprint 1 |
|---|---|---:|---|
| FR-U01 | Xem danh mục sự kiện công khai và mở trang chi tiết theo slug | Must | Đã triển khai |
| FR-U02 | Chọn suất diễn; thấy thời gian, địa điểm, trạng thái bán | Must | Đã triển khai |
| FR-U03 | Xem hạng vé, giá, quyền lợi và tồn khả dụng | Must | Đã triển khai |
| FR-U04 | Xem sơ đồ phân khu/ghế và cập nhật trạng thái realtime | Must | Đã triển khai nền tảng; subscription được scope theo suất diễn |
| FR-U05 | Giữ 1–4 vé trong 5 phút, chống hai phiên giữ cùng ghế | Must | Backend đã triển khai; checkout UI còn giới hạn |
| FR-U06 | Hiển thị vị trí/ETA trong hàng đợi khi tải lớn | Should | Backlog |
| FR-U07 | Thanh toán nhiều phương thức, tạo vé/QR động và ví vé | Must sản phẩm | Backlog sau Sprint 1 |
| FR-U08 | Yêu cầu hoàn tiền và nhận kết quả tự động | Should | Backlog |
| FR-O01 | Đăng nhập và phân biệt tài khoản USER/BTC | Must | Đã triển khai |
| FR-O02 | Tạo tổ chức và quản lý thành viên theo vai trò | Must | Nền tảng/RLS đã triển khai |
| FR-O03 | Tạo/sửa bản nháp sự kiện, nhiều suất diễn và hạng vé | Must | Đã triển khai |
| FR-O04 | Preview bản nháp trước khi công bố | Must | Đã triển khai |
| FR-O05 | Kiểm tra điều kiện và công bố event | Must | Đã triển khai |
| FR-O06 | Mọi event dùng một template chuẩn; phần đặc thù là extension | Must | Đã triển khai |
| FR-O07 | Thiết lập giá sàn/trần và dynamic pricing | Should | Chưa triển khai |
| FR-O08 | Dashboard doanh thu/tồn kho/check-in realtime | Should | Backlog |

## 4. Quy tắc nghiệp vụ

- BR-01: Một sự kiện thuộc đúng một tổ chức; một sự kiện có một hoặc nhiều suất diễn.
- BR-02: Chỉ sự kiện `CONG_KHAI` được đọc công khai; preview bản nháp chỉ dành cho BTC có quyền.
- BR-03: Mỗi hạng vé thuộc một suất diễn; mã hạng vé là duy nhất trong suất diễn.
- BR-04: Một lượt giữ tối đa 4 vé; thời hạn giữ là 5 phút tính theo thời gian máy chủ.
- BR-05: Ghế ngồi được khóa hàng (`FOR UPDATE`) trước khi đổi sang `DANG_GIU`; ghế không `TRONG` bị từ chối.
- BR-06: Giữ chỗ hết hạn phải trả ghế về `TRONG`; các trạng thái giữ hợp lệ gồm `ACTIVE`, `EXPIRED`, `RELEASED`, `CONVERTED`.
- BR-07: Thành viên chỉ thao tác dữ liệu thuộc tổ chức của mình; vai trò chỉ xem không được gọi thao tác ghi.
- BR-08: Dữ liệu tên, giá, tồn vé và chính sách trên UI phải đến từ record sự kiện/hạng vé, không hard-code theo template.

## 5. Yêu cầu phi chức năng

- NFR-01 Bảo mật: Supabase RLS, hàm `SECURITY DEFINER` có `search_path = public`, phân quyền theo tổ chức.
- NFR-02 Nhất quán: transaction và row lock ngăn double-selling trong giữ chỗ.
- NFR-03 Hiệu năng mục tiêu: thao tác scan/check-in dưới 1 giây và chịu tải concert là yêu cầu mục tiêu, chưa được chứng minh bằng load test Sprint 1.
- NFR-04 Khả dụng: trạng thái loading/error/not-found rõ ràng; empty optional sections tự ẩn.
- NFR-05 Accessibility: focus-visible, touch target tối thiểu 44px, hỗ trợ reduced motion.
- NFR-06 Responsive: hỗ trợ mobile từ 320/375px, tablet và desktop.
- NFR-07 Maintainability: một composition chi tiết event; category chỉ đổi token/extension, không fork toàn trang.

## 6. Tiêu chí chấp nhận Sprint 1

- BTC tạo một event âm nhạc mới mà không sửa code, preview và công bố được.
- Super Concert và event mới có cùng header, hero hierarchy, suất diễn, hạng vé, địa điểm, chính sách, liên hệ và CTA.
- Super Concert vẫn giữ lineup, sơ đồ ghế tương tác và timeline như extension.
- Tài khoản/role ngoài tổ chức không sửa được event.
- Full suite type-check, test và build pass; các chức năng chưa có được gắn nhãn/backlog minh bạch.

