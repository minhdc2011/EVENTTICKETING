Dưới đây là báo cáo tổng hợp toàn diện dự án **EventTicketing** (React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Supabase backend), được tổng hợp và đối soát từ kết quả khảo sát mã nguồn và phân tích kiến trúc hệ thống.

---

# BÁO CÁO TỔNG HỢP KIẾN TRÚC & CHỨC NĂNG HỆ THỐNG EVENTTICKETING

---

## PHẦN 1: DANH SÁCH TẤT CẢ ROUTE / TRANG

Hệ thống định tuyến được giải quyết tập trung qua [src/domain/publicRoute.js](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L32-L78) (`resolvePublicRoute`), hỗ trợ đồng thời cả pathname tiêu chuẩn, query param SPA (`?route=/...` tại [src/domain/publicRoute.js:33](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L33)), và hash SPA (`#/...` tại [src/domain/publicRoute.js:34](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L34)). Điều hướng được điều phối tại [src/App.tsx](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L37-L45).

| STT | Loại Route (`kind`) | URL Pattern hỗ trợ | Component phụ trách | Mục đích & Hành vi nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `catalog` | `/`, `/events`, `/index.html` ([src/domain/publicRoute.js:63-67](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L63-L67)) | [`EventCatalog`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L38) ([src/App.tsx:92](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L92)) | Trang chủ / Sàn sự kiện Marketplace: tìm kiếm, bộ lọc 7 thể loại, thẻ sự kiện nổi bật và danh sách sự kiện đang mở bán. |
| 2 | `detail` | `/events/:eventSlug` ([src/domain/publicRoute.js:77](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L77)) | [`GenericEventPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L28) ([src/App.tsx:100](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L100)) | Trang chi tiết sự kiện mặc định (tự động chọn suất diễn đầu tiên). |
| 3 | `detail` | `/events/:eventSlug/shows/:showSlug` ([src/domain/publicRoute.js:75](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L75)) | [`GenericEventPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L28) ([src/App.tsx:100](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L100)) | Trang chi tiết sự kiện cho một suất diễn cụ thể trong sự kiện đa suất. |
| 4 | `detail` (Preview) | `/events/:eventSlug?preview=1` ([src/App.tsx:53-65](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L53-L65)) | [`GenericEventPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L28) ([src/App.tsx:100](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L100)) | Chế độ xem trước dành cho BTC đối với sự kiện bản nháp (`BAN_NHAP`). |
| 5 | `organizer` | `/organizer`, `/organizer/dashboard` ([src/domain/publicRoute.js:15, 50](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L15)) | [`OrganizerPortal`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L96) ([src/App.tsx:93](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L93)) | Bảng điều khiển Studio Ban tổ chức: quản lý tổ chức, thống kê, danh sách sự kiện và mở Wizard tạo/sửa sự kiện. |
| 6 | `organizer` | `/organizer/login` ([src/domain/publicRoute.js:15, 52](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L15)) | [`OrganizerPortal`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L96) ([src/App.tsx:93](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L93)) | Màn hình đăng nhập / đăng ký chuyên biệt dành cho tài khoản Ban tổ chức. |
| 7 | `account` | `/account`, `/account/overview` ([src/domain/publicRoute.js:16, 60](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L16)) | [`BuyerAuth`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27) ([src/App.tsx:94](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L94)) | Xem thông tin hồ sơ tài khoản khán giả / người mua vé đã đăng nhập. |
| 8 | `account` | `/login`, `/account/login` ([src/domain/publicRoute.js:54-60](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L54-L60)) | [`BuyerAuth`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27) ([src/App.tsx:94](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27)) | Form đăng nhập tài khoản khán giả. |
| 9 | `account` | `/register`, `/account/register` ([src/domain/publicRoute.js:54-60](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L54-L60)) | [`BuyerAuth`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27) ([src/App.tsx:94](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27)) | Form đăng ký tài khoản khán giả mới. |
| 10 | `notfound` | Bất kỳ URL không khớp cú pháp nào ([src/domain/publicRoute.js:41, 51, 58, 66, 74](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L41)) | [`NotFoundPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/NotFoundPage.tsx#L8) ([src/App.tsx:91](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L91)) | Trang lỗi 404 độc lập kèm nút quay lại khám phá sự kiện. |

---

## PHẦN 2: DANH SÁCH COMPONENT CHÍNH

### 1. Component Cấp Ứng dụng & Điều phối (`src/` & `src/components/`)
- [`App`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L25) ([src/App.tsx:25-101](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L25-L101)): Root component điều phối route, nạp dữ liệu chi tiết sự kiện và render trạng thái Loading/Error/404.
- [`AppLoadingState`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L1) ([src/components/SprintOneStates.tsx:1-12](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L1-L12)): Màn hình chờ khi đang đồng bộ thông tin sự kiện.
- [`AppErrorState`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L14) ([src/components/SprintOneStates.tsx:14-25](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L14-L25)): Giao diện lỗi kết nối tải dữ liệu kèm nút Retry.
- [`EventNotFoundState`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L27) ([src/components/SprintOneStates.tsx:27-38](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L27-L38)): Giao diện 404 khi không tìm thấy slug sự kiện.
- [`EventCatalog`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L38) ([src/components/EventCatalog.tsx:38-352](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L38-L352)): Trang danh mục sự kiện Marketplace, lọc 7 thể loại, tìm kiếm và thẻ sự kiện nổi bật.
- [`GenericEventPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L28) ([src/components/GenericEventPage.tsx:28-63](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L28-L63)): Lớp adapter tải hạng vé và tiêm slot template phù hợp (`resolveEventTemplateSlots` tại [dòng 10-26](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L10-L26)).
- [`BuyerAuth`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27) ([src/components/BuyerAuth.tsx:27-356](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L27-L356)): Trang xác thực & hồ sơ người mua vé (đăng nhập, đăng ký, xem thông tin session, đăng xuất).
- [`OrganizerPortal`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L96) ([src/components/OrganizerPortal.tsx:96-160](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L96-L160)): Cổng điều phối Studio Ban tổ chức, kiểm tra phiên làm việc và phân quyền RBAC.
- [`OrganizerDashboard`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L179) ([src/components/OrganizerPortal.tsx:179-436](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L179-L436)): Không gian làm việc nội bộ của BTC (chuyển đổi tổ chức, xuất bản sự kiện, mở wizard).
- [`OrganizerFrame`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L162) ([src/components/OrganizerPortal.tsx:162-177](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L162-L177)): Khung bọc giao diện studio kèm thanh điều hướng `OrganizerTopBar`.
- [`ArtistLineup`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L43) ([src/components/ConcertSections.tsx:43-45](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L43-L45)): Lớp bọc thích ứng cho dàn nghệ sĩ.
- [`SeatingSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L47) ([src/components/ConcertSections.tsx:47-56](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L47-L56)): Rẽ nhánh hiển thị sơ đồ ghế: trả về `seating.html` cho `SUPER_CONCERT_2026` hoặc `SeatMapSection` cho các sự kiện thông thường.
- [`ConcertRuntimeOverlays`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L58) ([src/components/ConcertSections.tsx:58-138](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L58-L138)): Quản lý overlay React (tooltip ghế, toast thông báo, modal xác nhận giữ chỗ).

### 2. Component Trang Chung & Marketplace (`src/components/site/` & `src/components/common/`)
- [`GlobalHeader`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/GlobalHeader.tsx#L43) ([src/components/site/GlobalHeader.tsx:43-114](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/GlobalHeader.tsx#L43-L114)): Header toàn trang hỗ trợ duyệt danh mục, điều hướng tài khoản, đăng nhập/đăng ký và cổng BTC.
- [`FeaturedEvent`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/FeaturedEvent.tsx#L8) ([src/components/site/FeaturedEvent.tsx:8-58](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/FeaturedEvent.tsx#L8-L58)): Thẻ Hero Banner hiển thị sự kiện nổi bật nhất với màu sắc theo chủ đề thể loại.
- [`EventRow`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/EventRow.tsx#L8) ([src/components/site/EventRow.tsx:8-60](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/EventRow.tsx#L8-L60)): Thẻ sự kiện trong danh sách kết quả tìm kiếm kèm nút "Tìm vé".
- [`SearchBlock`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/SearchBlock.tsx#L11) ([src/components/site/SearchBlock.tsx:11-34](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/SearchBlock.tsx#L11-L34)): Ô nhập liệu tìm kiếm sự kiện theo tên hoặc địa điểm tổ chức.
- [`NotFoundPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/NotFoundPage.tsx#L8) ([src/components/site/NotFoundPage.tsx:8-40](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/NotFoundPage.tsx#L8-L40)): Trang 404 độc lập khi route không tìm thấy.
- **Hệ thống Icon chung** ([src/components/common/Icons.tsx:1-275](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/common/Icons.tsx#L1-L275)): `IconSearch`, `IconClose`, `IconCalendar`, `IconMapPin`, `IconTicket`, `IconUser`, `IconShieldCheck`, `CategoryIcon`, v.v.

### 3. Component Template Chi Tiết Sự Kiện (`src/components/event-template/`)
- [`EventTemplate`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventTemplate.tsx#L48) ([src/components/event-template/EventTemplate.tsx:48-328](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventTemplate.tsx#L48-L328)): Khung bố cục chuẩn hoá 6 section chính, quản lý vòng đời tải lịch trình, trạng thái mở bán và kích hoạt concert legacy runtime.
- [`EventHeader`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventHeader.tsx#L21) ([src/components/event-template/EventHeader.tsx:21-137](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventHeader.tsx#L21-L137)): Thanh tiêu đề trang sự kiện, hiển thị badge preview nháp, trạng thái mở bán và các nút điều hướng.
- [`EventHero`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventHero.tsx#L21) ([src/components/event-template/EventHero.tsx:21-189](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventHero.tsx#L21-L189)): Khu vực Hero lớn hiển thị poster/banner, slogan, địa điểm, thời gian, CTA và widget đếm ngược.
- [`EventCountdown`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventCountdown.tsx#L14) ([src/components/event-template/EventCountdown.tsx:14-94](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventCountdown.tsx#L14-L94)): Đồng hồ đếm ngược thời gian thực đến thời điểm mở bán hoặc diễn ra sự kiện.
- [`ShowSwitcher`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ShowSwitcher.tsx#L17) ([src/components/event-template/ShowSwitcher.tsx:17-35](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ShowSwitcher.tsx#L17-L35)): Thanh tab chuyển đổi giữa các suất diễn (tự ẩn nếu sự kiện chỉ có 1 suất).
- [`ArtistLineupSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ArtistLineupSection.tsx#L14) ([src/components/event-template/ArtistLineupSection.tsx:14-158](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ArtistLineupSection.tsx#L14-L158)): Section danh sách nghệ sĩ/khách mời dạng lưới ảnh kèm vai trò biểu diễn.
- [`TicketTiersSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TicketTiersSection.tsx#L11) ([src/components/event-template/TicketTiersSection.tsx:11-117](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TicketTiersSection.tsx#L11-L117)): Section 02 - Bảng giá vé niêm yết, phân loại vé ngồi/đứng, tồn kho thời gian thực và danh sách quyền lợi.
- [`SeatMapSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.tsx#L52) ([src/components/event-template/SeatMapSection.tsx:52-838](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.tsx#L52-L838)): Sơ đồ chọn chỗ tương tác toàn diện, tích hợp WebSocket realtime Supabase, zoom, lọc phân khu, chọn vé đứng và gọi RPC giữ chỗ (`createSeatHold`).
- [`MapToolbar`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/MapToolbar.tsx#L20) ([src/components/event-template/MapToolbar.tsx:20-181](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/MapToolbar.tsx#L20-L181)): Toolbar của sơ đồ ghế: nút chuyển đổi phân khu, ô tìm kiếm ghế, nút zoom và chỉ báo realtime.
- [`StadiumOverview`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StadiumOverview.tsx#L13) ([src/components/event-template/StadiumOverview.tsx:13-178](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StadiumOverview.tsx#L13-L178)): Bản đồ SVG mô phỏng tổng quan sân vận động và các khối khán đài (click để drill-down).
- [`ZoneSeatGrid`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ZoneSeatGrid.tsx#L45) ([src/components/event-template/ZoneSeatGrid.tsx:45-187](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ZoneSeatGrid.tsx#L45-L187)): Lưới ghế chi tiết của từng phân khu theo hàng chữ cái (A, B, C...) và hình học sector.
- [`SeatButton`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatButton.tsx#L19) ([src/components/event-template/SeatButton.tsx:19-58](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatButton.tsx#L19-L58)): Nút biểu diễn một ghế ngồi (trống, đã bán, đang giữ, đang chọn; hỗ trợ accessibility).
- [`StandingTicketPicker`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StandingTicketPicker.tsx#L14) ([src/components/event-template/StandingTicketPicker.tsx:14-60](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StandingTicketPicker.tsx#L14-L60)): Bộ đếm tăng giảm số lượng vé đứng (DUNG_STAND).
- [`SelectionSummary`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SelectionSummary.tsx#L29) ([src/components/event-template/SelectionSummary.tsx:29-201](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SelectionSummary.tsx#L29-L201)): Bảng tóm tắt vé đã chọn, tổng tiền, cảnh báo giới hạn 4 vé và nút xác nhận giữ chỗ.
- [`OfficialSeatingMap`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/OfficialSeatingMap.tsx#L28) ([src/components/event-template/OfficialSeatingMap.tsx:28-112](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/OfficialSeatingMap.tsx#L28-L112)): Sơ đồ khán đài SVG tương tác chính thức theo phong cách Ticketmaster.
- [`HoldConfirmationDialog`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/HoldConfirmationDialog.tsx#L16) ([src/components/event-template/HoldConfirmationDialog.tsx:16-166](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/HoldConfirmationDialog.tsx#L16-L166)): Dialog xác nhận giữ chỗ thành công với đồng hồ đếm ngược và nút hủy giữ chỗ (`releaseSeatHold`).
- [`EventVenueSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventVenueSection.tsx#L8) ([src/components/event-template/EventVenueSection.tsx:8-122](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventVenueSection.tsx#L8-L122)): Section 03 - Địa điểm tổ chức (OFFLINE, ONLINE, HYBRID, TBA).
- [`EventMediaSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventMediaSection.tsx#L9) ([src/components/event-template/EventMediaSection.tsx:9-62](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventMediaSection.tsx#L9-L62)): Section 04 - Hình ảnh sơ đồ tĩnh và video trailer.
- [`EventPolicySection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventPolicySection.tsx#L8) ([src/components/event-template/EventPolicySection.tsx:8-51](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventPolicySection.tsx#L8-L51)): Section 05 - Điều khoản: giới hạn độ tuổi, chính sách hoàn hủy.
- [`EventContactSection`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventContactSection.tsx#L8) ([src/components/event-template/EventContactSection.tsx:8-81](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventContactSection.tsx#L8-L81)): Section 06 - Liên hệ BTC (email, hotline, fanpage, giấy phép).
- [`EventFooter`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventFooter.tsx#L12) ([src/components/event-template/EventFooter.tsx:12-120](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventFooter.tsx#L12-L120)): Footer sự kiện với bản quyền thương hiệu, nút cuộn đầu trang và link mở modal đồ án.
- [`ScheduleDialog`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ScheduleDialog.tsx#L27) ([src/components/event-template/ScheduleDialog.tsx:27-337](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ScheduleDialog.tsx#L27-L337)): Dialog timeline lịch trình chi tiết (hỗ trợ focus trap và Escape).
- [`TeamInfoDialog`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TeamInfoDialog.tsx#L15) ([src/components/event-template/TeamInfoDialog.tsx:15-206](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TeamInfoDialog.tsx#L15-L206)): Dialog thông tin đề tài Phân tích thiết kế hệ thống và nhóm sinh viên thực hiện.
- [`MobileStickyBar`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/MobileStickyBar.tsx#L13) ([src/components/event-template/MobileStickyBar.tsx:13-123](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/MobileStickyBar.tsx#L13-L123)): Thanh điều hướng cố định đáy màn hình mobile kèm giá vé min và nút CTA.
- [`SeatTooltip`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatTooltip.tsx#L9) ([src/components/event-template/SeatTooltip.tsx:9-72](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatTooltip.tsx#L9-L72)): Tooltip vị trí và thông tin giá vé nổi theo con trỏ khi hover ghế.
- [`RuntimeToastContainer`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/RuntimeToastContainer.tsx#L98) ([src/components/event-template/RuntimeToastContainer.tsx:98-138](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/RuntimeToastContainer.tsx#L98-L138)): Khung chứa thông báo Toast.
- [`BookingHoldModal`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/BookingHoldModal.tsx#L30) ([src/components/event-template/BookingHoldModal.tsx:30-270](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/BookingHoldModal.tsx#L30-L270)): Dialog kết quả giữ chỗ thành công cho luồng runtime concert.

### 4. Component Quản Lý Ban Tổ Chức (`src/components/organizer-ui/`)
- [`OrganizerTopBar`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerTopBar.tsx#L10) ([src/components/organizer-ui/OrganizerTopBar.tsx:10-59](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerTopBar.tsx#L10-L59)): Thanh TopBar studio kèm badge "STUDIO BAN TỔ CHỨC", nút quay lại marketplace và nút đăng xuất.
- [`OrganizerSidebar`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerSidebar.tsx#L20) ([src/components/organizer-ui/OrganizerSidebar.tsx:20-126](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerSidebar.tsx#L20-L126)): Thanh Sidebar quản lý tổ chức (Workspace Switcher), hiển thị vai trò (`CHU_SO_HUU`, `QUAN_TRI`, `BIEN_TAP`...).
- [`OrganizerStatsCards`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerStatsCards.tsx#L9) ([src/components/organizer-ui/OrganizerStatsCards.tsx:9-44](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerStatsCards.tsx#L9-L44)): Bộ 3 thẻ thống kê: Tổng số sự kiện, Số sự kiện Live và Số sự kiện Draft.
- [`OrganizerEventCard`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventCard.tsx#L30) ([src/components/organizer-ui/OrganizerEventCard.tsx:30-137](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventCard.tsx#L30-L137)): Thẻ quản lý từng sự kiện: badge trạng thái, nút Chỉnh sửa, Xem trước (`?preview=1`) và nút Công bố (`publishEvent`).
- [`OrganizerEmptyState`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEmptyState.tsx#L11) ([src/components/organizer-ui/OrganizerEmptyState.tsx:11-73](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEmptyState.tsx#L11-L73)): Hiển thị trạng thái rỗng thông minh: `loading`, `error`, hoặc `no-events`.
- [`OrganizerOnboarding`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerOnboarding.tsx#L19) ([src/components/organizer-ui/OrganizerOnboarding.tsx:19-108](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerOnboarding.tsx#L19-L108)): Giao diện khởi tạo tổ chức đầu tiên khi tài khoản BTC mới đăng nhập lần đầu.
- [`OrganizerAuthView`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAuthView.tsx#L21) ([src/components/organizer-ui/OrganizerAuthView.tsx:21-239](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAuthView.tsx#L21-L239)): Form đăng nhập/đăng ký dành riêng cho BTC.
- [`OrganizerAccessDeniedView`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAccessDeniedView.tsx#L12) ([src/components/organizer-ui/OrganizerAccessDeniedView.tsx:12-88](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAccessDeniedView.tsx#L12-L88)): Màn hình 403 từ chối truy cập khi tài khoản `USER` cố truy cập Studio BTC.
- [`OrganizerEventWizard`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventWizard.tsx#L66) ([src/components/organizer-ui/OrganizerEventWizard.tsx:66-1988](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventWizard.tsx#L66-L1988)): Trình Wizard tạo/sửa sự kiện 6 bước toàn diện ([src/components/organizer-ui/organizerLogic.js:50-57](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L50-L57)).
- **Icons Ban tổ chức** ([src/components/organizer-ui/OrganizerIcons.tsx:1-260](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerIcons.tsx#L1-L260)): `IconShield`, `IconEdit`, `IconPublish`, `IconLogout`, `IconCheck`, v.v.

### 5. Thành phần Legacy (`src/legacy/`)
- [`initConcertRuntime`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/legacy/concertRuntime.js#L1669) ([src/legacy/concertRuntime.js:1669-1705](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/legacy/concertRuntime.js#L1669-L1705)): Hàm khởi tạo runtime DOM thuần cho Super Concert 2026.
- [`teardownConcertRuntime`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/legacy/concertRuntime.js#L1731) ([src/legacy/concertRuntime.js:1731-1777](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/legacy/concertRuntime.js#L1731-L1777)): Hàm dọn dẹp timer, event listener và observer khi unmount.
- [src/legacy/fragments/seating.html](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/legacy/fragments/seating.html#L1-L461): HTML tĩnh chứa SVG khán đài Super Concert 2026 nạp thô qua Vite `?raw` ([src/components/ConcertSections.tsx:2](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/ConcertSections.tsx#L2)).

---

## PHẦN 3: DANH SÁCH CHỨC NĂNG HỆ THỐNG

### 1. Phân hệ Khán Giả / Người Mua Vé (Buyer / Public Audience)
- [ ] Khám phá & duyệt danh sách sự kiện trên Marketplace ([src/components/EventCatalog.tsx:38-352](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L38-L352))
- [ ] Lọc sự kiện theo 7 thể loại âm nhạc / nghệ thuật ([src/components/EventCatalog.tsx:64-98](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L64-L98))
- [ ] Tìm kiếm sự kiện theo từ khóa tên hoặc địa điểm ([src/components/site/SearchBlock.tsx:11-34](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/SearchBlock.tsx#L11-L34))
- [ ] Xem thẻ sự kiện nổi bật Hero Banner ([src/components/site/FeaturedEvent.tsx:8-58](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/site/FeaturedEvent.tsx#L8-L58))
- [ ] Xem chi tiết sự kiện và chuyển đổi suất diễn ([src/components/event-template/ShowSwitcher.tsx:17-35](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ShowSwitcher.tsx#L17-L35))
- [ ] Xem đồng hồ đếm ngược thời gian mở bán / thời điểm diễn ra ([src/components/event-template/EventCountdown.tsx:14-94](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventCountdown.tsx#L14-L94))
- [ ] Xem danh sách nghệ sĩ và vai trò biểu diễn ([src/components/event-template/ArtistLineupSection.tsx:14-158](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ArtistLineupSection.tsx#L14-L158))
- [ ] Xem bảng giá vé, tồn kho thời gian thực & danh sách quyền lợi ([src/components/event-template/TicketTiersSection.tsx:11-117](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TicketTiersSection.tsx#L11-L117))
- [ ] Xem sơ đồ sân khấu tổng quan & drill-down phân khu ([src/components/event-template/StadiumOverview.tsx:13-178](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StadiumOverview.tsx#L13-L178))
- [ ] Chọn ghế ngồi tương tác trực quan trên lưới ghế SVG ([src/components/event-template/ZoneSeatGrid.tsx:45-187](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ZoneSeatGrid.tsx#L45-L187))
- [ ] Chọn số lượng vé đứng không cố định chỗ ngồi ([src/components/event-template/StandingTicketPicker.tsx:14-60](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StandingTicketPicker.tsx#L14-L60))
- [ ] Kiểm tra giới hạn số lượng vé chọn (tối đa 4 vé/lần giữ) ([src/components/event-template/SelectionSummary.tsx:55-80](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SelectionSummary.tsx#L55-L80))
- [ ] Gửi yêu cầu giữ chỗ vé tạm thời (RPC `tao_giu_cho_theo_suat`) ([src/services/bookingService.ts:30-45](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/services/bookingService.ts#L30-L45))
- [ ] Đếm ngược thời gian hiệu lực giữ chỗ (Hold Timer Countdown) ([src/components/event-template/HoldConfirmationDialog.tsx:35-50](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/HoldConfirmationDialog.tsx#L35-L50))
- [ ] Hủy giữ chỗ chủ động (RPC `huy_giu_cho`) ([src/components/event-template/HoldConfirmationDialog.tsx:52-68](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/HoldConfirmationDialog.tsx#L52-L68))
- [ ] Xem timeline lịch trình sự kiện dạng Dialog ([src/components/event-template/ScheduleDialog.tsx:27-337](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ScheduleDialog.tsx#L27-L337))
- [ ] Xem thông tin địa điểm tổ chức (OFFLINE, ONLINE, HYBRID, TBA) ([src/components/event-template/EventVenueSection.tsx:8-122](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventVenueSection.tsx#L8-L122))
- [ ] Xem hình ảnh sơ đồ khán đài tĩnh và video trailer ([src/components/event-template/EventMediaSection.tsx:9-62](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventMediaSection.tsx#L9-L62))
- [ ] Xem chính sách quy định, giới hạn độ tuổi và điều lệ hoàn vé ([src/components/event-template/EventPolicySection.tsx:8-51](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventPolicySection.tsx#L8-L51))
- [ ] Xem thông tin liên hệ chính thức của BTC & giấy phép tổ chức ([src/components/event-template/EventContactSection.tsx:8-81](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventContactSection.tsx#L8-L81))
- [ ] Xem thông tin nhóm phát triển và đề tài môn học ([src/components/event-template/TeamInfoDialog.tsx:15-206](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TeamInfoDialog.tsx#L15-L206))
- [ ] Điều hướng nhanh khi xem trên thiết bị di động (Mobile Sticky Bar) ([src/components/event-template/MobileStickyBar.tsx:13-123](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/MobileStickyBar.tsx#L13-L123))
- [ ] Đăng nhập tài khoản khán giả bằng Email và Mật khẩu ([src/components/BuyerAuth.tsx:110-185](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L110-L185))
- [ ] Đăng ký tài khoản khán giả mới ([src/components/BuyerAuth.tsx:186-250](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L186-L250))
- [ ] Xem thông tin hồ sơ tài khoản khán giả & đăng xuất ([src/components/BuyerAuth.tsx:251-310](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L251-L310))
- [ ] Nhận cập nhật trạng thái ghế theo thời gian thực qua Supabase Realtime ([src/legacy/seatRealtime.js:282-286](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/legacy/seatRealtime.js#L282-L286))

### 2. Phân hệ Ban Tổ Chức (Organizer)
- [ ] Đăng nhập cổng quản trị Ban tổ chức ([src/components/organizer-ui/OrganizerAuthView.tsx:21-140](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAuthView.tsx#L21-L140))
- [ ] Đăng ký tài khoản tổ chức mới ([src/components/organizer-ui/OrganizerAuthView.tsx:141-239](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAuthView.tsx#L141-L239))
- [ ] Kiểm soát phân quyền truy cập Studio (RBAC: `ORGANIZER`, `ADMIN` vs chặn `USER`) ([src/components/OrganizerPortal.tsx:103-125](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L103-L125))
- [ ] Màn hình từ chối quyền truy cập (403) dành cho tài khoản không phải BTC ([src/components/organizer-ui/OrganizerAccessDeniedView.tsx:12-88](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerAccessDeniedView.tsx#L12-L88))
- [ ] Khởi tạo hồ sơ tổ chức đầu tiên khi mới đăng ký (Organizer Onboarding) ([src/components/organizer-ui/OrganizerOnboarding.tsx:19-108](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerOnboarding.tsx#L19-L108))
- [ ] Chuyển đổi không gian làm việc giữa các tổ chức (Workspace Switcher) ([src/components/organizer-ui/OrganizerSidebar.tsx:35-70](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerSidebar.tsx#L35-L70))
- [ ] Xem thống kê tổng quan: Tổng sự kiện, Sự kiện Live, Sự kiện Bản nháp ([src/components/organizer-ui/OrganizerStatsCards.tsx:9-44](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerStatsCards.tsx#L9-L44))
- [ ] Quản lý danh sách sự kiện kèm trạng thái phát hành ([src/components/organizer-ui/OrganizerEventCard.tsx:30-137](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventCard.tsx#L30-L137))
- [ ] Tạo mới và chỉnh sửa sự kiện qua Trình Wizard 6 bước ([src/components/organizer-ui/OrganizerEventWizard.tsx:66-1988](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventWizard.tsx#L66-L1988))
- [ ] Wizard Bước 1: Nhập thông tin cơ bản (Tên, Slug, Thể loại, Mô tả chi tiết) ([src/components/organizer-ui/organizerLogic.js:51](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L51))
- [ ] Wizard Bước 2: Thiết lập địa điểm & lịch trình suất diễn (hỗ trợ đa suất) ([src/components/organizer-ui/organizerLogic.js:52](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L52))
- [ ] Wizard Bước 3: Cấu hình phân khu, hạng vé, giá niêm yết & loại vé ngồi/đứng ([src/components/organizer-ui/organizerLogic.js:53](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L53))
- [ ] Wizard Bước 4: Thiết lập hình ảnh banner, poster, sơ đồ tĩnh & video trailer ([src/components/organizer-ui/organizerLogic.js:54](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L54))
- [ ] Wizard Bước 5: Cấu hình quy định, độ tuổi, điều lệ hoàn vé & liên hệ pháp lý ([src/components/organizer-ui/organizerLogic.js:55](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L55))
- [ ] Wizard Bước 6: Kiểm tra chỉ số sẵn sàng xuất bản (Readiness Score) & Lưu nháp ([src/components/organizer-ui/organizerLogic.js:56](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/organizerLogic.js#L56))
- [ ] Lưu sự kiện toàn diện qua RPC nguyên tử `luu_su_kien_toan_dien` ([src/services/organizerService.ts:480-515](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/services/organizerService.ts#L480-L515))
- [ ] Tự động sinh danh sách ghế cho phân khu có chỗ ngồi (`ensureSeatsForSeatedTiers`) ([src/services/organizerService.ts:517-543](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/services/organizerService.ts#L517-L543))
- [ ] Xem trước sự kiện bản nháp dành riêng cho BTC (`/events/:slug?preview=1`) ([src/App.tsx:53-65](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L53-L65))
- [ ] Công bố sự kiện công khai qua RPC `cong_bo_su_kien` ([src/components/organizer-ui/OrganizerEventCard.tsx:48-62](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventCard.tsx#L48-L62))
- [ ] Khóa chỉnh sửa thương mại (giá vé, sức chứa) khi sự kiện đã có vé giữ/bán ([src/components/organizer-ui/OrganizerEventWizard.tsx:1091](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/organizer-ui/OrganizerEventWizard.tsx#L1091))

### 3. Phân hệ Quản Trị & Hệ Thống (System & Platform)
- [ ] Định tuyến URL đa năng (hỗ trợ Pathname, Hash SPA và Query Param SPA) ([src/domain/publicRoute.js:32-78](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js#L32-L78))
- [ ] Điều phối trạng thái nạp dữ liệu toàn cục (Loading, Error, Not Found) ([src/App.tsx:78-98](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/App.tsx#L78-L98))
- [ ] Duy trì phiên làm việc và tự động làm mới JWT token ([src/services/supabaseClient.ts:15-19](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/services/supabaseClient.ts#L15-L19))
- [ ] Tự động dọn dẹp các vé giữ hết hạn theo chu kỳ 10 giây qua `pg_cron` ([20260929120000_sprint1_hold_hardening.sql:226-230](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/supabase/migrations/20260929120000_sprint1_hold_hardening.sql#L226-L230))
- [ ] Ngăn chặn leo thang đặc quyền người dùng trái phép qua Trigger database ([20261006210000_user_organizer_boundary.sql:42-59](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/supabase/migrations/20261006210000_user_organizer_boundary.sql#L42-L59))
- [ ] Áp dụng bảo vệ dữ liệu Row-Level Security (RLS) cho sự kiện công khai và nội bộ tổ chức ([20261005090000_product_foundation.sql:258-292](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/supabase/migrations/20261005090000_product_foundation.sql#L258-L292))

---

## PHẦN 4: SHAPE DỮ LIỆU TỪNG ENTITY (TYPESCRIPT TYPES)

> [!NOTE]
> Các shape dữ liệu dưới đây được chuẩn hóa và tổng hợp từ cấu trúc bảng PostgreSQL trong thư mục `supabase/migrations/`, các schema PostgREST và các model dữ liệu thực tế tại `src/services/` và `src/domain/`.

```typescript
// ==========================================
// 1. Phân loại & Hồ sơ Người dùng (User & Role)
// ==========================================

export type AccountKind = 'USER' | 'ORGANIZER' | 'ADMIN';

export interface UserProfile {
  id: string; // UUID liên kết auth.users
  email: string;
  fullName: string;
  phone?: string | null;
  accountKind: AccountKind;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 2. Không gian Tổ chức (Organization & Workspace)
// ==========================================

export type MemberRole = 'CHU_SO_HUU' | 'QUAN_TRI' | 'BIEN_TAP' | 'XEM';

export interface Organization {
  id: string; // ToChucID (UUID)
  name: string; // TenToChuc
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: MemberRole; // VaiTro
  joinedAt: string;
}

// ==========================================
// 3. Sự kiện & Thể loại (Event & Category)
// ==========================================

export type EventStatus = 'BAN_NHAP' | 'CONG_KHAI' | 'HUY' | 'KET_THUC';
export type VenueType = 'OFFLINE' | 'ONLINE' | 'HYBRID' | 'TBA';
export type EventCategoryKey = 'music' | 'orchestra' | 'edm' | 'indie' | 'theatre' | 'sport' | 'conference';

export interface EventScheduleItem {
  time: string; // "18:00"
  activity: string; // "Check-in & Welcoming"
  description?: string;
}

export interface EventArtist {
  name: string;
  role: string;
  avatarUrl: string;
}

export interface EventPolicy {
  ageLimit: string; // "16+"
  refundPolicy: string;
  regulations: string[];
}

export interface EventContact {
  email: string;
  hotline: string;
  fanpageUrl?: string;
  licenseNumber?: string; // Giấy phép tổ chức
}

export interface EventEntity {
  id: string; // SuKienID (UUID)
  organizationId: string; // ToChucID
  name: string; // TenSuKien
  slug: string;
  category: EventCategoryKey; // TheLoai
  status: EventStatus; // TrangThai
  shortDescription?: string;
  descriptionHtml?: string;
  bannerUrl?: string;
  posterUrl?: string;
  trailerUrl?: string;
  seatingChartUrl?: string;
  venueType: VenueType; // HinhThuc
  venueName?: string; // TenDiaDiem
  venueAddress?: string; // DiaChi
  venueMapUrl?: string;
  onlineMeetingUrl?: string;
  policy: EventPolicy;
  contact: EventContact;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 4. Suất diễn (Show)
// ==========================================

export type ShowStatus = 'BAN_NHAP' | 'CONG_KHAI' | 'DA_HUY' | 'DA_DIEN_RA';

export interface ShowEntity {
  id: string; // SuatDienID (UUID)
  eventId: string; // SuKienID
  showSlug: string;
  startTime: string; // BatDauLuc (ISO Timestamp)
  endTime?: string | null; // KetThucLuc
  doorsOpenTime?: string | null; // MoCuaLuc
  status: ShowStatus; // TrangThai
  schedule: EventScheduleItem[];
  artists: EventArtist[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 5. Phân khu & Hạng vé (Zone & Ticket Tier)
// ==========================================

export type ZoneType = 'NGOI_SEATED' | 'DUNG_STAND';

export interface ZoneEntity {
  id: string; // KhuVucID (UUID)
  showId: string; // SuatDienID
  zoneCode: string; // MaKhuVuc, ví dụ: 'VIP', 'CAT1', 'GA'
  zoneName: string; // TenKhuVuc
  zoneType: ZoneType; // LoaiKhuVuc
  ticketCode: string; // MaHangVe
  ticketTierName: string; // TenHangVe
  price: number; // GiaVeNiemYet (VNĐ)
  totalCapacity: number; // TongSoGhe
  remainingCount?: number; // SoChoConLai (tính toán hoặc realtime)
  colorCode: string; // Hex color: '#E11D48'
  perks: string[]; // Danh sách đặc quyền
  gateInfo?: string; // 'Cổng 1 & 2'
  sortOrder: number;
}

// ==========================================
// 6. Ghế ngồi (Seat)
// ==========================================

export type SeatStatus = 'TRONG' | 'DANG_GIU' | 'DA_BAN' | 'KHOA';

export interface SeatEntity {
  id: string; // GheID (UUID)
  zoneId: string; // KhuVucID
  fullSeatCode: string; // MaGheDayDu, ví dụ: 'VIP-A-12'
  rowCode: string; // HangGhe, ví dụ: 'A'
  seatNumber: number; // SoGhe, ví dụ: 12
  status: SeatStatus; // TrangThai
  xCoord?: number | null; // Toạ độ SVG
  yCoord?: number | null;
  updatedAt: string;
}

// ==========================================
// 7. Giữ chỗ (Seat Hold & Hold Details)
// ==========================================

export type HoldStatus = 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONVERTED';

export interface SeatHoldDetail {
  id: string; // ChiTietGiuChoID (UUID)
  holdId: string; // GiuChoID
  zoneId: string; // KhuVucID
  seatId?: string | null; // GheID (null nếu là vé đứng)
  ticketCode: string;
  zoneCode: string;
  quantity: number; // 1 với vé ngồi, n với vé đứng
  priceAtHold: number;
}

export interface SeatHoldEntity {
  id: string; // GiuChoID (UUID)
  showId: string; // SuatDienID
  clientSessionId: string; // PhienNguoiDung (UUID từ client)
  userId?: string | null; // NguoiDungID (nếu đã đăng nhập)
  status: HoldStatus; // TrangThai
  expiresAt: string; // HetHanLuc (ISO Timestamp, thường là now() + 10 phút)
  createdAt: string; // TaoLuc
  items?: SeatHoldDetail[];
}

// ==========================================
// 8. Đơn hàng, Thanh toán & Vé phát hành (Order, Payment, Ticket)
// (Thực thể phân tích kiến trúc cho giai đoạn tiếp theo)
// ==========================================

export type OrderStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED' | 'FAILED';
export type PaymentGateway = 'VNPAY' | 'MOMO' | 'BANK_TRANSFER';
export type TicketStatus = 'HIEU_LUC' | 'DA_SOAT' | 'HUY';

export interface OrderEntity {
  id: string; // DonHangID (UUID)
  userId: string; // NguoiDungID
  holdId: string; // GiuChoID (UNIQUE)
  totalAmount: number; // TongTien (VNĐ)
  status: OrderStatus;
  expiresAt: string; // HetHanLuc (phiên thanh toán 10-15 phút)
  createdAt: string;
}

export interface PaymentTransaction {
  id: string; // GiaoDichID (UUID)
  orderId: string; // DonHangID
  gateway: PaymentGateway; // CongThanhToan
  gatewayTransactionId: string; // MaGiaoDichCong (UNIQUE - Idempotency)
  amount: number;
  isSignatureValid: boolean;
  rawPayload: Record<string, unknown>;
  receivedAt: string;
}

export interface IssuedTicket {
  id: string; // VeID (UUID)
  orderId: string; // DonHangID
  zoneId: string; // KhuVucID
  seatId?: string | null; // GheID
  ticketCode: string; // MaVe (chuỗi duy nhất)
  qrNonce: string; // Nonce bí mật xoay vòng TOTP
  status: TicketStatus;
  checkedInAt?: string | null; // SoatLuc
  checkedInBy?: string | null; // SoatBoi (User ID nhân viên soát vé)
}
```

---

## PHẦN 5: CÁC CHỨC NĂNG BẮT BUỘC CẦN BACKEND THẬT (MOCK CLIENT KHÔNG THỂ LÀM ĐƯỢC)

Dưới đây là 6 cụm chức năng cốt lõi bắt buộc phải có môi trường backend thực thi, phân tích dựa trên kiến trúc cơ sở dữ liệu Supabase và các quy tắc thương mại của sàn bán vé:

### 1. Khóa Ghế & Kiểm Soát Tranh Chấp Đồng Thời (Concurrency & Seat Locking)
- **Bản chất kỹ thuật:** Hai hoặc nhiều trình duyệt độc lập không thể tự nhận biết hành động của nhau. Nếu chỉ dùng Client/Mock (`localStorage`), khi có đợt mở bán hàng nghìn lượt truy cập đồng thời, hiện tượng Race Condition chắc chắn xảy ra dẫn đến bán trùng ghế (Double Booking).
- **Hiện trạng trên PostgreSQL:** Đã triển khai RPC `tao_giu_cho_theo_suat` sử dụng kỹ thuật khóa dòng bi quan (`SELECT ... FROM GHE ... FOR UPDATE`) và kiểm tra `TrangThai = 'TRONG'`. Phân khu đứng được tuần tự hóa qua khóa bản ghi `KHU_VUC ... FOR UPDATE`.
- **Lỗ hổng cần khắc phục trên backend:**
  - *Nguy cơ Deadlock (`40P01`):* Client gửi danh sách ghế không theo thứ tự cố định. Nếu Request 1 gửi `[A, B]` và Request 2 gửi `[B, A]`, hai transaction sẽ chờ chéo nhau. Backend cần sắp xếp lại danh sách ghế trước khi khóa (`ORDER BY GheID`).
  - *Tấn công giữ chỗ ảo:* `PhienNguoiDung` hiện do client tự sinh ngẫu nhiên qua UUID và RPC cấp quyền cho cả `anon`. Kẻ xấu có thể chạy script sinh hàng loạt phiên ẩn danh để khóa sạch tồn kho. Cần backend ép buộc xác thực (`auth.uid()`) và giới hạn trần số vé giữ theo từng tài khoản.

### 2. Xử Lý Thanh Toán & Webhook Callback (IPN)
- **Bản chất kỹ thuật:**
  - *Bảo mật bí mật cổng thanh toán:* Secret keys (như VNPAY `vnp_HashSecret`, MoMo `secretKey`) không bao giờ được xuất hiện trong code bundle phía trình duyệt.
  - *Xác thực chữ ký số HMAC:* Chỉ có server mới có thể băm và so khớp chữ ký SHA256/HMAC của webhook gửi từ cổng thanh toán. Phía client hoàn toàn có thể bị kẻ gian giả mạo URL redirect để kích hoạt "thanh toán thành công".
  - *Xử lý Idempotency & Đối soát:* Webhook thanh toán có thể được gửi lại nhiều lần hoặc đến chậm hơn thời gian hết hạn của phiên giữ chỗ. Chỉ có backend mới đảm bảo transaction nguyên tử: kiểm tra hold còn hạn, chuyển `GHE` -> `DA_BAN`, ghi nhận thanh toán `ON CONFLICT DO NOTHING`, hoặc tự động đẩy vào hàng đợi hoàn tiền nếu đơn hàng đã quá hạn.

### 3. Bảo Vệ Dữ Liệu Tầng Sâu & Khóa Thương Mại (Row-Level Security & Triggers)
- **Bản chất kỹ thuật:** Anon key của Supabase nằm công khai ở phía front-end. Người dùng am hiểu kỹ thuật có thể mở DevTools và gọi trực tiếp PostgREST API để đọc/ghi database, hoàn toàn vượt qua các logic kiểm tra trên giao diện React.
- **Lỗ hổng hiện tại:**
  - Logic khóa thương mại (không cho sửa giá/sức chứa khi đã bán vé) hiện mới chỉ nằm trong RPC `luu_su_kien_toan_dien`.
  - Nhưng chính sách RLS `Editors manage show zones` và `Editors manage show seats` lại đang mở quyền `FOR ALL`. Một Editor có thể gọi thẳng `PATCH /rest/v1/KHU_VUC` sửa giá vé về 0 VNĐ hoặc `PATCH /rest/v1/GHE` đổi ghế từ `DANG_GIU` thành `TRONG`.
  - *Giải pháp backend:* Bắt buộc cấu hình Trigger `BEFORE UPDATE/DELETE` trên database để chặn ghi đè trực tiếp, hoặc thu hồi quyền update cột `TrangThai` từ vai trò `authenticated`.

### 4. Phát Hành & Soát Vé Điện Tử Chống Gian Lận (QR Code Verification)
- **Bản chất kỹ thuật:**
  - Nếu mã QR chỉ sinh từ phía client, người dùng có thể dễ dàng sao chép hoặc tự tạo mã giả.
  - Soát vé tại cổng yêu cầu tính nguyên tử tuyệt đối: khi hai cổng cùng quét một mã vé trong cùng một giây, chỉ duy nhất một cổng được báo hợp lệ.
  - Backend cần hàm RPC `soat_ve(token)` chạy câu lệnh có điều kiện: `UPDATE VE SET TrangThai='DA_SOAT', SoatLuc=NOW() WHERE VeID=... AND TrangThai='HIEU_LUC' RETURNING ...`. Nếu số dòng trả về là 0, vé bị từ chối ngay lập tức.
  - Chống chụp màn hình vé chuyền tay: Backend cấp token động (Dynamic QR xoay vòng theo thời gian TOTP nonce).

### 5. Quản Lý Phiên Xác Thực, Rate Limit & Chống Bot
- **Bản chất kỹ thuật:** Chế độ Mock hiện tại tự giả lập session trong `localStorage`, không có giá trị bảo mật.
- **Yêu cầu backend:**
  - Quản lý JWT an toàn, tự động refresh token và thu hồi phiên khi phát hiện bất thường.
  - Áp dụng Rate Limiting tại tầng Edge Function hoặc API Gateway để ngăn chặn bot spam request trong các đợt Flash Sale.
  - Tích hợp Captcha (Turnstile/hCaptcha) phía server trước khi cho phép gọi RPC giữ chỗ.

### 6. Xử Lý Tác Vụ Ngầm (Background Jobs & Broadcast Realtime)
- **Bản chất kỹ thuật:** Trình duyệt của người dùng có thể bị tắt, mất mạng hoặc tắt máy bất cứ lúc nào.
- **Yêu cầu backend:**
  - `pg_cron` chạy ngầm định kỳ 10 giây quét sạch các hold hết hạn để trả ghế về trạng thái `TRONG`.
  - Đồng bộ số lượng vé khu đứng: `postgres_changes` chỉ bắt sự kiện trên từng dòng của bảng `GHE`, không thể realtime cho khu đứng (`DUNG_STAND`). Cần backend phát sự kiện qua Supabase Broadcast Channel khi có biến động tồn kho.

---

## TỔNG KẾT & TRẠNG THÁI KIỂM TOÁN

- [x] **Nguyên tắc phân tích:** Chỉ đọc phân tích hệ thống, **không** tạo, sửa, xóa bất kỳ tệp mã nguồn nào.
- [x] **An toàn bảo mật:** Không truy cập các file cấu hình bí mật (`.env`, secrets, credentials).
- [x] **Không chạy code mới.** Toàn bộ nội dung trên sẵn sàng để anh/chị duyệt và đưa ra định hướng cho các bước tiếp theo.

*Dừng lại chờ phê duyệt.*