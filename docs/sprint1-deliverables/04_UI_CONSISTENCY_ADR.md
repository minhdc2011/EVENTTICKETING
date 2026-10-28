# 04 — ADR: Đồng bộ Super Concert và event do BTC tạo

## Trạng thái

Accepted — Sprint 1, cập nhật ngày 27/10/2026.

## Vấn đề

Super Concert từng có một page tree và HTML fragment riêng, trong khi event do BTC tạo đi qua template dữ liệu chung. Hệ quả:

- User thấy hierarchy, ticket CTA và thông tin chính sách khác nhau giữa các event.
- BTC nhập dữ liệu nhưng event đặc thù vẫn có giá/nội dung hard-code.
- Cùng một khái niệm hạng vé/địa điểm/chính sách tồn tại ở hai component tree.
- Mỗi event “đẹp” mới có nguy cơ cần đội kỹ thuật làm riêng.

## Quyết định

Mọi route chi tiết event đi qua `GenericEventPage` và một `EventTemplate` duy nhất. Core luôn gồm:

1. Header và trạng thái bán.
2. Hero với tên, mô tả, thời gian, địa điểm và CTA.
3. Chọn suất diễn.
4. Tổng quan.
5. Hạng vé lấy từ `PublicTicketTier`.
6. Địa điểm, media, chính sách, liên hệ BTC.
7. Booking summary desktop và mobile sticky CTA.

`SUPER_CONCERT_2026` cung cấp extension slots cho ambient/starfield, lineup và sơ đồ SVG chuyên biệt. Artifact `seating.html` được giữ có chủ đích vì chứa hình học sân Mỹ Đình đã tinh chỉnh cùng camera zoom/drill-down; chỉ template key này được phép render artifact. Sự kiện BTC tạo luôn dùng `SeatMapSection` React tự sinh từ catalog. Legacy pricing/guide, footer/team modal không còn nằm trong rendered tree; dữ liệu giá/tồn, trạng thái bán và giới hạn chọn vé vẫn dùng chung service/domain. Lineup đọc `SU_KIEN_NGHE_SI`/`NGHE_SI` và chỉ giữ mock fallback riêng cho Super Concert.

Footer và thông tin đồ án/nhóm 4 đã được chuyển sang React component chuẩn hóa (`EventFooter`, `TeamInfoDialog`) dùng chung cho mọi sự kiện:
- Brand copy và bản quyền hiển thị tự động theo loại sự kiện.
- Nút lịch trình chỉ hiển thị khi có dữ liệu lịch trình hợp lệ và gọi trực tiếp controlled callback của `EventTemplate`.
- Dialog thông tin nhóm 4 tuân thủ nghiêm ngặt accessibility: focus trapping Tab/Shift+Tab, phím Escape, backdrop click, khóa scroll nền và touch target >= 44px.
- Cầu nối custom event `eventticketing:open-schedule` và các inline dispatcher đã bị loại bỏ triệt để khỏi toàn bộ mã nguồn.

Runtime overlays của Super Concert cũng đã chuyển sang React component (`SeatTooltip`, `RuntimeToastContainer`, `BookingHoldModal`). `concertRuntime.js` chỉ phát payload có cấu trúc qua adapter `runtimeOverlays`; không còn tạo toast/modal bằng chuỗi HTML hay global `simulateNextSprint`. Modal giữ chỗ dùng thời gian hold thực, có focus trap, Escape, backdrop close, trả focus và thông điệp trung thực rằng đây chưa phải thanh toán hoàn tất.

Timeline cũng đã được chuyển sang lát cắt dữ liệu dùng chung:

`LICH_TRINH` → `scheduleService` → chuẩn hóa/sắp xếp ở `publicSchedule` → state trong `EventTemplate` → `ScheduleDialog`.

- Dữ liệu database là nguồn chính; fallback chỉ dành cho định danh ổn định `SUPER_CONCERT_2026` khi môi trường mock/backend rỗng hoặc không sẵn sàng.
- Event do BTC tạo chỉ hiện nút lịch trình khi thật sự có bản ghi hợp lệ.
- Header, hero, mobile sticky và footer dùng 100% callback React; cầu nối custom event đã được gỡ bỏ hoàn toàn, không còn thao tác class trực tiếp trên DOM.
- Modal hỗ trợ Escape, focus trap Tab/Shift+Tab, trả focus về nút mở, backdrop close và khóa scroll nền.
- Parser loại bản ghi thiếu tên/giờ hoặc giờ sai chuẩn 24 giờ; request cũ không được phép ghi đè lịch khi người dùng chuyển event.

## Tiêu chuẩn UI chung

- Category có thể đổi accent token; spacing, typography hierarchy, component anatomy và CTA semantics không đổi.
- Nội dung optional không có dữ liệu thì ẩn hoàn toàn.
- Trạng thái sale gồm upcoming/on-sale/sold-out/closed; không dùng CTA mua khi chức năng chưa có.
- Touch target tối thiểu 44px; có focus-visible; reduced motion; không dùng font nhỏ dưới 12px trong template.
- Mobile giữ CTA chính nhưng không che nội dung; desktop dùng booking panel sticky.
- Mobile sticky dùng cùng một dark/frosted surface cho mọi loại event; category chỉ đổi accent token.
- Nội dung CTA phải phản ánh trạng thái bán: event đóng bán chỉ cho xem thông tin/sơ đồ, không dùng ngôn ngữ mua vé.
- Mã dữ liệu nội bộ dạng `AM_NHAC` không được hiển thị như slogan hoặc tiêu đề nội dung.
- Preview bản nháp phải có banner và đường quay lại Studio BTC.

## Hệ quả

- Tích cực: event mới đạt độ hoàn thiện cơ bản chỉ bằng dữ liệu; giảm hard-code và test được invariant kiến trúc; footer và team modal đã hoàn toàn đồng nhất và loại bỏ custom event bridge.
- Đánh đổi: Super Concert còn một adapter markup/runtime chuyên biệt để bảo toàn trải nghiệm đã nghiệm thu; bundle frontend vẫn lớn do nhiều lát cắt đi chung entry chunk. `concertRuntime.js` có guard `#stadium-svg` và không chạy trên sơ đồ React của sự kiện BTC tạo.
- Bước tiếp theo: kiểm thử đồng thời hai phiên giữ ghế trên staging, bổ sung load test và hoàn thiện payment/QR/refund ở Sprint 2.

## Ghi chú về công cụ thiết kế

Nguyên tắc Wix Studio được dùng như design reference: design library/tài sản tái sử dụng, typography và color theme dùng chung, grid/stack responsive, breakpoint cascade và kiểm tra accessibility. Các nguyên tắc này được ánh xạ vào token CSS, `EventTemplate`, extension slots và responsive contracts của codebase; dự án không được chuyển sang Wix hosting/CMS.

OpenDesign Cloud không chạy được do giới hạn balance, sau đó người dùng chọn **Local Codex**. Local Codex đã tạo và xác minh project `eventticketing-react-seat-map-local` theo hướng **Product UI → Evolve existing brand → Foundations + core components**, gồm prototype HTML, brand spec và component spec. Artifact được lưu cùng bộ hồ sơ Sprint 1; code, test, ADR và `07_EVENTTICKETING_DESIGN_SYSTEM.md` vẫn là nguồn sự thật khi có chênh lệch.

Tham khảo chính thức:

- https://support.wix.com/en/article/about-wix-studio
- https://support.wix.com/en/article/studio-editor-about-site-styles
- https://support.wix.com/en/article/about-the-wix-studio-add-on-tools

