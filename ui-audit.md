Dưới đây là báo cáo tổng hợp và hoàn chỉnh về **Audit UI/UX phía người dùng và khách hàng (buyer)** cho các phân hệ: **Marketplace (`/events`)**, **Trang sự kiện (`event-template`)**, **Sơ đồ ghế & Đặt vé (`SeatMapSection`, `BookingSummaryPanel`)**, **Xác thực Buyer (`BuyerAuth`)**, và **Header/Footer (`SiteChrome`, `EventHeader`, `EventFooter`)**.

Tất cả các phát hiện được phân loại rõ ràng theo mức độ ưu tiên từ **P0 → P1 → P2**. Mỗi hạng mục được thiết kế cô lập, khả thi để triển khai dưới dạng một task độc lập (dưới khoảng 300 dòng diff).

---

### Mức ưu tiên P0 (Nghiêm trọng: Đứt gãy luồng đặt vé, sai lệch trạng thái, che khuất nội dung hoặc lỗi tương phản/hiển thị cốt lõi)

#### 1. [P0] Hai luồng chọn vé rời rạc trên cùng một trang sự kiện (`TicketTiersSection` + `BookingSummaryPanel` vs `SeatMapSection` + `SelectionSummary`)
- **File & dòng:**
  - [`EventTemplate.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventTemplate.tsx#L259-L296)
  - [`BookingSummaryPanel.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/BookingSummaryPanel.tsx#L39-L86)
  - [`SeatMapSection.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.tsx#L495-L652)
- **Vấn đề cụ thể (Luồng đặt vé & Bố cục):**
  - Trong `et-main` (grid 2 cột trên desktop), cột trái render cả `TicketTiersSection` lẫn `SeatMapSection`. Bản thân `SeatMapSection` lại chia grid 2 cột (`minmax(0, 1fr) 336px`) chứa `SelectionSummary` bên trong cột trái của `et-main`, trong khi cột phải của `et-main` đang giữ sticky `BookingSummaryPanel`.
  - Hệ quả: Xuất hiện **2 panel tóm tắt đặt vé song song** trên màn hình desktop nhưng không đồng bộ state. Chọn hạng vé ở `TicketTiersSection` không lọc khu vực trên `SeatMapSection`; ngược lại, chọn ghế ở `SeatMapSection` vẫn khiến `BookingSummaryPanel` và `MobileStickyBar` báo *"Chưa chọn hạng vé nào"*. Ngoài ra, không gian ngang của `SeatMapSection` bị ép hẹp do nằm lồng trong cột trái (`1.25fr`).
- **Cách sửa:**
  - Đồng bộ hóa `selectedTierId` từ `EventTemplate` xuống `SeatMapSection` (để tự động chọn khu vực tương ứng khi bấm hạng vé) và truyền danh sách `selectedSeats` / `activeHold` từ `SeatMapSection` lên `BookingSummaryPanel` & `MobileStickyBar`, hoặc cho phép `SeatMapSection` chiếm full-width thoát khỏi cột hẹp khi sự kiện có sơ đồ ghế.
- **Tiêu chí chấp nhận (AC):**
  - Khi người dùng chọn 1 hạng vé ở `TicketTiersSection` hoặc chọn ghế trên `SeatMapSection`, trạng thái chọn và tổng tiền trên `BookingSummaryPanel` / `MobileStickyBar` phản ánh nhất quán 100%, và sơ đồ ghế có tối thiểu `720px` chiều rộng hiển thị trên viewport `1280px`.

---

#### 2. [P0] `SeatMapSection` tính toán `saleStatus` tĩnh và bỏ qua tồn kho thực tế, lệch trạng thái với `EventTemplate`
- **File & dòng:**
  - [`SeatMapSection.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.tsx#L71-L83)
  - [`EventTemplate.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventTemplate.tsx#L172-L187)
- **Vấn đề cụ thể (Luồng đặt vé & Tính nhất quán):**
  - Tại `SeatMapSection.tsx`, `saleStatus` được tính bằng `useMemo(..., [event])` với `now: new Date()` (không cập nhật theo đồng hồ `clock` như `EventTemplate`) và hardcode `hasAvailability: true`.
  - Khi sự kiện chuyển từ `UPCOMING` sang `ON_SALE` trong lúc người dùng đang mở trang (đồng hồ đếm ngược về 0), hoặc khi toàn bộ `tiers` đã hết vé (`SOLD_OUT`), `EventHero` và `TicketTiersSection` cập nhật trạng thái nhưng `SeatMapSection` vẫn giữ trạng thái cũ, dẫn đến khóa/mở chọn ghế sai. Đồng thời tại dòng 218, thông báo hardcode *"Sự kiện đã đóng bán"* ngay cả khi `saleStatus === 'UPCOMING'` (Sắp mở bán).
- **Cách sửa:**
  - Truyền trực tiếp prop `saleStatus` đã tính chuẩn từ `EventTemplate` xuống `SeatMapSection` (và fallback sang `deriveSaleStatus` khi không truyền prop). Sửa nội dung `realtimeBanner` ở dòng 217–220 theo đúng từng trạng thái `UPCOMING`, `SOLD_OUT`, `CLOSED`.
- **Tiêu chí chấp nhận (AC):**
  - Với sự kiện `UPCOMING`, banner trong `SeatMapSection` hiển thị đúng *"Sự kiện sắp mở bán · Sơ đồ đang ở chế độ xem trước"*; khi `saleStatus` trên `EventTemplate` đổi sang `ON_SALE` hoặc `SOLD_OUT`, `SeatMapSection` cập nhật trạng thái tương tác ngay lập tức mà không cần tải lại trang.

---

#### 3. [P0] Bị ẩn thông tin khi dùng chức năng Tìm kiếm hoặc Lọc trên Marketplace (`/events`) do Hero và Trust Strip không thu gọn, đồng thời hiển thị cả khi danh sách sự kiện đang lỗi/đang tải
- **File & dòng:**
  - [`EventCatalog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L87-L88)
  - [`EventCatalog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L178-L310)
  - [`EventCatalog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L380-L487)
- **Vấn đề cụ thể (Bố cục, Trạng thái Loading/Lỗi & UX Tìm kiếm):**
  1. Ô tìm kiếm nằm ở `.marketplace-nav` (trên đỉnh trang), nhưng kết quả tìm kiếm (`.marketplace-query-feedback` và `.marketplace-grid`) lại nằm dưới `.marketplace-hero` (`min-height: 600px`) và `.marketplace-trust-strip`. Khi người dùng gõ từ khóa tìm kiếm trên laptop/mobile, màn hình vẫn bị chiếm trọn bởi Hero của `events[0]`, người dùng không thấy danh sách kết quả đang lọc bên dưới.
  2. Khi bấm nút *"Thử lại ngay"* lúc lỗi mạng (`fetchEvents`), `events` cũ không được xóa hoặc khi `state === 'loading'`, lưới `.marketplace-grid` bên dưới vẫn render song song với `.marketplace-state-box`.
- **Cách sửa:**
  - Ẩn hoặc thu gọn `.marketplace-hero` và `.marketplace-trust-strip` khi `query.trim().length > 0` để đẩy kết quả tìm kiếm lên ngay dưới thanh điều hướng.
  - Chỉ render `.marketplace-grid` khi `state === 'ready' && filtered.length > 0`.
- **Tiêu chí chấp nhận (AC):**
  - Khi nhập từ khóa vào ô tìm kiếm trên `/events`, `.marketplace-query-feedback` và kết quả đầu tiên nằm ngay trong viewport đầu tiên (`top < 250px`) mà không cần cuộn qua Hero. Khi `state === 'loading'` hoặc `state === 'error'`, `.marketplace-grid` không xuất hiện trong DOM.

---

#### 4. [P0] Lỗi mất tương phản và sai lệch giao diện ở `ArtistLineupSection` trên nền sáng `.et-body-surface` của `EventTemplate`
- **File & dòng:**
  - [`ArtistLineupSection.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ArtistLineupSection.tsx#L53-L116)
  - [`event-template.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/event-template.css#L714-L734)
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L1075-L1112)
- **Vấn đề cụ thể (Tương phản, Bố cục & Tính nhất quán):**
  - Trong `EventTemplate`, các section nội dung nằm trong `.et-body-surface` có nền sáng (`background: #f8f9fb; color: #0f172a`). Tuy nhiên:
    - Ở trạng thái `isLoading` và `hasError`, `section#artist-lineup` bị gán rule global `#artist-lineup { background: var(--paper) !important; padding-top: 76px; padding-bottom: 88px; }` từ `index.css`, trong khi nút `.et-artist-retry-btn` có chữ trắng (`#ffffff`) trên nền `rgba(255,255,255,0.1)` và `.et-artist-error-box` có chữ `#fca5a5` (hồng nhạt) trên nền giấy sáng `#f1efe7` → **Tỷ lệ tương phản chỉ đạt ~1.4:1**, gần như không thể đọc được.
    - Số thứ tự section hiển thị cố định `01 / 03` nằm kẹp giữa `01 / TỔNG QUAN SỰ KIỆN` và `02 / HẠNG VÉ & GIÁ VÉ`, gây lộn xộn hệ thống đánh số phân đoạn.
- **Cách sửa:**
  - Chuyển `ArtistLineupSection` sang sử dụng cấu trúc `.et-content-section`, `.et-section-header`, `.et-section-kicker`, `.et-section-title` đồng bộ với `EventTemplate`, và sửa màu nền/chữ của `.et-artist-loading-pill`, `.et-artist-error-box`, `.et-artist-retry-btn` đạt chuẩn tương phản WCAG AA (≥ 4.5:1) trên nền sáng.
- **Tiêu chí chấp nhận (AC):**
  - Trạng thái lỗi và nút *"Thử lại"* của `ArtistLineupSection` có độ tương phản ≥ 4.5:1; header của section đồng nhất kiểu chữ và số thứ tự với các mục khác trong `EventTemplate`.

---

#### 5. [P0] Hai thanh Sticky Header (`et-preview-banner` và `et-header`) chồng lấp lên nhau khi xem trước sự kiện
- **File & dòng:**
  - [`EventHeader.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventHeader.tsx#L30-L50)
  - [`event-template.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/event-template.css#L48-L52)
  - [`event-template.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/event-template.css#L109-L113)
- **Vấn đề cụ thể (Bố cục & Sticky Positioning):**
  - Cả `.et-preview-banner` (`top: 0; z-index: 60`) và `.et-header` (`top: 0; z-index: 50`) đều là anh em trực tiếp trong `.et-shell` và cùng đặt `position: sticky; top: 0`. Khi người dùng cuộn trang xuống, `.et-header` trượt lên `top: 0` và bị `.et-preview-banner` đè khuất một phần lớn (do `.et-preview-banner` cao ~68px).
- **Cách sửa:**
  - Bọc `.et-preview-banner` và `.et-header` vào chung một thẻ `<div className="et-sticky-top-stack">` có `position: sticky; top: 0; z-index: 60`, và bỏ `position: sticky` riêng lẻ trên từng phần tử con.
- **Tiêu chí chấp nhận (AC):**
  - Khi cuộn trang ở chế độ xem trước (`isPreview === true`), `.et-preview-banner` và `.et-header` xếp chồng nối tiếp nhau theo chiều dọc mà không đè lên nhau ở mọi vị trí cuộn.

---

### Mức ưu tiên P1 (Quan trọng: Accessibility, Điều hướng bàn phím, Responsive Mobile, Trạng thái Focus/ARIA và Đồng bộ CSS)

#### 6. [P1] Mất bù trừ cuộn neo (`scroll-margin-top`) khiến tiêu đề các phần bị Sticky Header che khuất khi bấm link điều hướng
- **File & dòng:**
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L709)
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L919)
  - [`EventTemplate.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventTemplate.tsx#L258)
  - [`EventTemplate.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventTemplate.tsx#L276)
- **Vấn đề cụ thể (Bố cục & Điều hướng):**
  - Dòng 709 của `index.css` đặt `section[id] { scroll-margin-top: 72px; }`, nhưng dòng 919 lại ghi đè `section[id] { scroll-margin-top: 0; }`.
  - Trong `EventTemplate.tsx`, các điểm neo `#pricing-section` (dòng 258) và `#concert-guide-section` (dòng 276) là thẻ `<div id="..." aria-hidden="true" />` rỗng nằm ngoài `<section>`, cách `<section>` bên dưới `48px` (do `gap: 48px` của `.et-content-col`). Khi bấm *"Hạng vé"*, *"Sơ đồ ghế"*, hoặc *"Lưu ý & Địa điểm"* trên `EventHeader`, trình duyệt cuộn sát mép trên viewport và bị `.et-header` (`68px`) che mất tiêu đề mục.
- **Cách sửa:**
  - Xóa dòng `section[id] { scroll-margin-top: 0; }` tại `index.css#L919`, đặt `scroll-margin-top: 84px` cho `section[id], [id$="-section"]`, và gộp neo `#pricing-section` / `#concert-guide-section` trực tiếp vào phần tử section tương ứng thay vì tạo thẻ `<div>` rỗng.
- **Tiêu chí chấp nhận (AC):**
  - Khi bấm bất kỳ link neo nào trên `EventHeader` hoặc `EventHero`, phần tử đích dừng lại cách đáy của `.et-header` tối thiểu `16px` và không có khoảng trống thừa `48px` giữa các section.

---

#### 7. [P1] Tự động chuyển focus (`backButtonRef.current?.focus()`) khi gõ tìm kiếm mã ghế làm mất focus khỏi ô `<input>` trong `SeatMapSection`
- **File & dòng:**
  - [`SeatMapSection.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.tsx#L234-L245)
  - [`ZoneSeatGrid.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ZoneSeatGrid.tsx#L43-L46)
- **Vấn đề cụ thể (Accessibility & Điều hướng bàn phím):**
  - Trong `SeatMapSection.tsx`, mỗi khi người dùng gõ ký tự vào ô `#search` (`handleSearchChange`), hàm `findZoneForSeatQuery` tự động cập nhật `setSelectedZoneId(matchingZoneId)`.
  - Khi `selectedZoneId` thay đổi, `ZoneSeatGrid` mount hoặc thay đổi `zone.KhuVucID`, kích hoạt `useEffect(() => { backButtonRef.current?.focus(); }, [zone.KhuVucID])`.
  - Hệ quả: Người dùng vừa gõ chữ cái đầu tiên (ví dụ `"A"` trong `"A-01"`), focus lập tức bị giật khỏi ô `<input id="search">` nhảy xuống nút *"← Tổng quan sân vận động"*, làm gián đoạn hoàn toàn việc nhập liệu.
- **Cách sửa:**
  - Chỉ auto-focus vào `backButtonRef` khi người dùng chủ động click/nhấn Enter vào một phân khu từ `StadiumOverview` (truyền cờ `shouldAutoFocus` hoặc kiểm tra `document.activeElement?.id !== 'search'`).
- **Tiêu chí chấp nhận (AC):**
  - Khi đang đứng ở chế độ Tổng quan sân vận động và gõ liên tiếp chuỗi `"VIP-A-01"` vào ô tìm kiếm ghế, focus vẫn giữ nguyên vẹn trong `<input id="search">` từ ký tự đầu đến ký tự cuối.

---

#### 8. [P1] Lỗi Accessibility (ARIA Tablist / Tabpanel & Điều hướng phím mũi tên) ở bộ lọc danh mục `EventCatalog` và tab `BuyerAuth`
- **File & dòng:**
  - [`EventCatalog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L324-L364)
  - [`BuyerAuth.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L314-L339)
- **Vấn đề cụ thể (Accessibility & Điều hướng bàn phím):**
  - Cả `.marketplace-categories` trong `EventCatalog.tsx` và `.buyer-auth-tabs` trong `BuyerAuth.tsx` đều khai báo `role="tablist"` và các nút con `role="tab"`, nhưng:
    1. Không hỗ trợ điều hướng bằng phím mũi tên (`ArrowLeft` / `ArrowRight` / `Home` / `End`) và roving `tabIndex` (`0` cho tab đang chọn, `-1` cho các tab còn lại) theo chuẩn WAI-ARIA Tabs Pattern.
    2. Thiếu `aria-controls` và vùng nội dung tương ứng không có `role="tabpanel"` (hoặc đối với bộ lọc danh mục trong `EventCatalog`, ngữ nghĩa phù hợp hơn là `role="group"` với `aria-pressed`).
- **Cách sửa:**
  - Tại `EventCatalog.tsx`: Chuyển các nút lọc thể loại sang `aria-pressed={isActive}` trong `<div className="marketplace-categories" role="group" aria-label="Phân loại thể loại sự kiện">`.
  - Tại `BuyerAuth.tsx`: Bổ sung `onKeyDown` hỗ trợ `ArrowLeft`/`ArrowRight`, roving `tabIndex`, và gắn `role="tabpanel"` + `aria-labelledby` cho form bên dưới.
- **Tiêu chí chấp nhận (AC):**
  - Trong `BuyerAuth`, nhấn phím `ArrowRight` / `ArrowLeft` khi đang focus ở tab *"Đăng nhập"* sẽ chuyển sang tab *"Đăng ký"* và cập nhật focus; trong `EventCatalog`, trình đọc màn hình đọc đúng trạng thái `aria-pressed` cho từng nút thể loại.

---

#### 9. [P1] Lệch hệ thống class CSS của `ShowSwitcher` khiến bộ chọn suất diễn không ăn giao diện thiết kế từ `event-template.css`
- **File & dòng:**
  - [`EventCatalog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/EventCatalog.tsx#L584-L602)
  - [`event-template.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/event-template.css#L642-L709)
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L5208-L5213)
- **Vấn đề cụ thể (Tính nhất quán & Bố cục):**
  - Trong `event-template.css` (dòng 642–709), hệ thống thiết kế đã định nghĩa đầy đủ `.et-show-switcher`, `.et-show-switcher-inner`, `.et-show-switcher-label`, `.et-show-pill`, `.et-show-pill-name`, `.et-show-pill-time` (hỗ trợ màu chủ đề `--et-cat-accent` và căn lề chuẩn `1320px`).
  - Tuy nhiên, component `ShowSwitcher` trong `EventCatalog.tsx` vẫn dùng class cũ `.show-switcher` (từ `index.css` với màu cố định `#0b0d0c` và viền `#d8ff3e`), đặt nằm giữa `EventHero` (nền tối) và `.et-body-surface` (nền sáng), gây lệch căn lề và lệch màu chủ đề. Đồng thời thiếu `aria-current="page"` trên suất diễn đang chọn.
- **Cách sửa:**
  - Cập nhật `ShowSwitcher` sang sử dụng các class `.et-show-switcher`, `.et-show-switcher-inner`, `.et-show-switcher-label`, `.et-show-pill` và thêm `aria-current={show.id === event.selectedShow.id ? 'page' : undefined}`.
- **Tiêu chí chấp nhận (AC):**
  - Với sự kiện có từ 2 suất diễn trở lên, thanh chuyển suất diễn hiển thị đúng biến màu `--et-cat-accent` của danh mục sự kiện đó, căn thẳng hàng với `et-hero-inner` (`max-width: 1320px`), và có `aria-current="page"` trên suất đang chọn.

---

#### 10. [P1] Điều hướng sau khi Đăng nhập / Đăng ký ở `BuyerAuth` luôn ép về `/events`, làm mất ngữ cảnh sự kiện khách đang đặt vé
- **File & dòng:**
  - [`BuyerAuth.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L80)
  - [`BuyerAuth.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/BuyerAuth.tsx#L86)
  - [`EventHeader.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventHeader.tsx#L76-L153)
- **Vấn đề cụ thể (Luồng đặt vé & Tính nhất quán Header):**
  1. `EventHeader` trên trang chi tiết sự kiện hoàn toàn không hiển thị trạng thái tài khoản Buyer (không có nút Đăng nhập / Tên tài khoản như `.marketplace-nav`), khiến khách hàng đang xem sự kiện không biết mình đã đăng nhập hay chưa.
  2. Trong `BuyerAuth.tsx`, sau khi đăng nhập/đăng ký thành công (dòng 80, 86), hệ thống hardcode `navigatePublicRoute('events')` thay vì quay lại trang sự kiện trước đó (`returnTo` query/state).
- **Cách sửa:**
  - Hỗ trợ đọc tham số `returnTo` (hoặc lưu route sự kiện trước đó) trong `BuyerAuth.tsx` để chuyển hướng người dùng về đúng trang sự kiện vừa xem sau khi đăng nhập; đồng thời hiển thị badge tài khoản / link đăng nhập nhỏ gọn trên `EventHeader`.
- **Tiêu chí chấp nhận (AC):**
  - Khi người dùng từ trang sự kiện `/events/<slug>` bấm sang Đăng nhập và hoàn tất đăng nhập, trình duyệt tự động điều hướng trở lại `/events/<slug>`.

---

#### 11. [P1] Lỗi thu phóng (`zoom`) bằng cả `transform: scale(zoom)` và `width: zoom * 100%` làm biến dạng kép trên `StadiumOverview` và cắt tràn ngang trên `ZoneSeatGrid`
- **File & dòng:**
  - [`StadiumOverview.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/StadiumOverview.tsx#L39-L43)
  - [`ZoneSeatGrid.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ZoneSeatGrid.tsx#L83-L86)
  - [`SeatMapSection.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.css#L304-L315)
- **Vấn đề cụ thể (SVG/Canvas Zoom & Responsive Mobile):**
  - Trong `StadiumOverview.tsx`, thẻ `<svg>` vừa gán `transform: scale(${zoom})` vừa gán `width: ${Math.round(zoom * 100)}%` và `maxWidth: ${Math.round(760 * zoom)}px`. Điều này làm tỷ lệ phóng đại bị nhân đôi (`zoom * zoom`, ví dụ `1.4 * 1.4 = 1.96x`) và vì `.et-map-viewport` dùng `display: flex; justify-content: center; align-items: center; overflow: auto`, khi phần tử con phóng to vượt khung chứa, phần rìa bên trái và bên trên của SVG/lưới ghế bị đẩy sang tọa độ âm, **không thể cuộn ngang/dọc tới để xem hoặc bấm chọn ghế đầu hàng** trên mobile.
- **Cách sửa:**
  - Trên `StadiumOverview.tsx`: Chỉ dùng kích thước layout (`width: ${Math.round(zoom * 100)}%`, bỏ `transform: scale(${zoom})`) để trình duyệt tính đúng scrollHeight/scrollWidth của vùng cuộn.
  - Trên `ZoneSeatGrid.tsx` và `.et-map-viewport`: Đổi `justify-content: center` sang `margin: 0 auto` trên phần tử con để khi tràn ngang trên mobile (`375px`), người dùng có thể cuộn từ ghế số 1 đến ghế cuối hàng mà không bị mất mép trái.
- **Tiêu chí chấp nhận (AC):**
  - Ở màn hình `375px` khi bấm Zoom In (`140%`), người dùng có thể cuộn ngang trong `.et-map-viewport` để nhìn thấy và click được cả ghế đầu tiên (bên trái nhất) lẫn ghế cuối cùng (bên phải nhất) của mọi hàng ghế.

---

#### 12. [P1] Touch target trên Mobile bị thu nhỏ dưới chuẩn 44×44px tại Header/Category của `EventCatalog` và nút ghế của `SeatMapSection`
- **File & dòng:**
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L2773-L2783)
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L4898-L4909)
  - [`index.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/index.css#L5147-L5167)
  - [`SeatMapSection.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/SeatMapSection.css#L1036-L1039)
- **Vấn đề cụ thể (Responsive Mobile & Accessibility):**
  - Nút xóa tìm kiếm `.marketplace-search-clear` chỉ có `padding: 2px` + icon `16px` = `20×20px` (rất khó chạm chính xác trên điện thoại).
  - Ở `@media (max-width: 640px)` và `(max-width: 480px)`, các nút `.marketplace-organizer-link`, `.marketplace-register`, `.marketplace-login` chỉ cao ~`28px` (`padding: 6px 8px; font-size: 10px`), và `.marketplace-categories button` bị hạ xuống `min-height: 40px`.
  - Ở `@media (max-width: 540px)` trong `SeatMapSection.css` (dòng 1036), `.et-seat` bị giảm `width: 38px; min-width: 38px`.
- **Cách sửa:**
  - Tăng kích thước vùng chạm của `.marketplace-search-clear` lên `min-width: 36px; min-height: 36px` (tối ưu `44px`), giữ `min-height: 44px` cho `.marketplace-categories button` và các nút điều hướng trên mobile.
- **Tiêu chí chấp nhận (AC):**
  - Kiểm tra trên viewport `375×812px`, tất cả các nút tương tác chính (`.marketplace-categories button`, `.marketplace-login`, `.marketplace-register`, `.marketplace-search-clear`) có chiều cao vùng chạm thực tế (`getBoundingClientRect().height`) ≥ `36px`–`44px`.

---

### Mức ưu tiên P2 (Cải thiện: Tinh chỉnh UX, Accessibility chi tiết, Tương phản phụ và Dọn dẹp thành phần thừa)

#### 13. [P2] `HoldConfirmationDialog` không khóa cuộn trang (`body.style.overflow`) và sử dụng đồng hồ đếm ngược thiếu `aria-live` hợp lý
- **File & dòng:**
  - [`HoldConfirmationDialog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/HoldConfirmationDialog.tsx#L35-L91)
  - [`HoldConfirmationDialog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/HoldConfirmationDialog.tsx#L133-L139)
- **Vấn đề cụ thể (Accessibility & Modal UX):**
  - Khác với `BookingAssistModal`, `ScheduleDialog`, và `TeamInfoDialog` đều khóa `document.body.style.overflow = 'hidden'` khi mở, `HoldConfirmationDialog` quên khóa cuộn body khiến trang phía sau vẫn bị cuộn khi người dùng lăn chuột trên hộp thoại giữ ghế.
  - Ngoài ra, hộp thoại giữ ghế hiện chỉ có nút *"Hủy giữ ghế"* và nút đóng `×`, thiếu hướng dẫn/CTA tiếp theo rõ ràng (ví dụ nút *"Tiếp tục xem thông tin"* hoặc hướng dẫn hoàn tất thanh toán).
- **Cách sửa:**
  - Thêm logic lưu và đặt `document.body.style.overflow = 'hidden'` trong `useEffect` khi `isOpen === true` tại `HoldConfirmationDialog.tsx`, đồng thời bổ sung nút phụ *"Tiếp tục xem thông tin"* cạnh nút *"Hủy giữ ghế"*.
- **Tiêu chí chấp nhận (AC):**
  - Khi `HoldConfirmationDialog` đang mở, `document.body.style.overflow` là `'hidden'` và được khôi phục về giá trị ban đầu ngay khi đóng modal.

---

#### 14. [P2] Tương phản chữ phụ và đường phân cách trong `EventFooter`, `ScheduleDialog` và `EventNotFoundState` chưa đồng bộ SPA / WCAG AA
- **File & dòng:**
  - [`EventFooter.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/EventFooter.css#L47-L51)
  - [`ScheduleDialog.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/ScheduleDialog.tsx#L192)
  - [`SprintOneStates.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SprintOneStates.tsx#L82)
- **Vấn đề cụ thể (Tương phản & Điều hướng SPA):**
  - Trong `EventFooter.css`, `.et-footer-copy` dùng màu `#64748b` (`12px`) trên nền tối `#070707` / `rgba(12, 21, 39, 0.92)` có độ tương phản ~`3.7:1` (dưới mức chuẩn 4.5:1 của WCAG AA cho chữ nhỏ).
  - Trong `ScheduleDialog` (`index.css#L2392`), `.schedule-title span` dùng `rgba(255,255,255,0.28)` có độ tương phản chỉ `2.1:1`.
  - Trong `SprintOneStates.tsx` (dòng 82), `EventNotFoundState` dùng `<a href="./">Quay về trang chính</a>` gây reload toàn trang thay vì dùng `buildPublicPath` + `navigatePublicRoute('events')` như các màn hình khác.
- **Cách sửa:**
  - Nâng màu `.et-footer-copy` lên `#94a3b8` (tương phản ~`6.4:1`), nâng `.schedule-title span` lên `rgba(255,255,255,0.6)`, và cập nhật link trong `EventNotFoundState` sang điều hướng SPA về `'events'`.
- **Tiêu chí chấp nhận (AC):**
  - Toàn bộ chữ `12px` ở `EventFooter` và tiêu đề phụ `ScheduleDialog` đạt tỷ lệ tương phản ≥ `4.5:1`; bấm *"Quay về trang chính"* ở màn hình 404 chuyển về `/events` qua SPA mà không reload toàn trang.

---

#### 15. [P2] Không thể bỏ chọn hạng vé (`selectedTierId`) sau khi đã chọn và thiếu đồng bộ hoàn toàn biến CSS chủ đề danh mục từ `categoryThemes.js`
- **File & dòng:**
  - [`TicketTiersSection.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/TicketTiersSection.tsx#L120-L137)
  - [`event-template.css`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/event-template/event-template.css#L1695-L1770)
  - [`categoryThemes.js`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/categoryThemes.js#L180-L185)
- **Vấn đề cụ thể (Tính nhất quán & Tương tác):**
  1. Trong `TicketTiersSection.tsx`, nút chọn hạng vé có `aria-pressed={isSelected}` (ngữ nghĩa là toggle button), nhưng khi bấm lại vào hạng vé đang chọn thì vẫn gọi `onSelectTier(tier.id)` thay vì bỏ chọn (`null`).
  2. Trong `categoryThemes.js`, các danh mục phụ như `TRIEN_LAM`, `CONG_NGHE`, `GIAI_TRI`, `CONG_DONG` được ánh xạ về theme tương ứng, nhưng trong `event-template.css` chỉ khai báo selector cứng cho 7 danh mục gốc (`.et-shell[data-category="AM_NHAC"]`, v.v.). Nếu sự kiện có `category === 'TRIEN_LAM'` hoặc `'CONG_NGHE'`, `.et-shell` sẽ rơi về màu mặc định thay vì nhận đúng bộ biến màu chủ đề.
- **Cách sửa:**
  - Cho phép toggle `onSelectTier(isSelected ? null : tier.id)` trong `TicketTiersSection.tsx`.
  - Trong `EventTemplate.tsx`, dùng `getCategoryTheme(event.category).key` cho thuộc tính `data-category` trên `.et-shell` để mọi alias danh mục luôn nhận đúng bộ biến CSS.
- **Tiêu chí chấp nhận (AC):**
  - Bấm lần thứ 2 vào nút *"Đã chọn hạng vé"* sẽ bỏ chọn hạng vé đó (`aria-pressed="false"`); sự kiện thuộc danh mục `CONG_NGHE` hoặc `TRIEN_LAM` hiển thị đúng bộ màu chủ đề tương ứng của `HOI_THAO` / `THAM_QUAN`.

---

#### 16. [P2] Component `SiteChrome.tsx` bị dư thừa và chèn trùng ID `#stA`, `#stB` nếu được sử dụng
- **File & dòng:**
  - [`SiteChrome.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/SiteChrome.tsx#L1-L19)
  - [`GenericEventPage.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx#L16-L21)
- **Vấn đề cụ thể (Tính nhất quán kiến trúc):**
  - `SiteChrome.tsx` hiện không được import ở các luồng chính (`App.tsx`, `EventCatalog.tsx`, `EventTemplate.tsx` đều tự quản lý header/footer riêng), nhưng lại chứa `<div id="stA" />`, `<div id="stB" />` và `<EventHeader />` trùng lặp với `GenericEventPage.tsx` và `EventTemplate.tsx`. Ngoài ra `SiteChrome` không truyền `onOpenSchedule` và `hasSchedule` vào `EventHeader`, khiến nút Lịch trình bị mất nếu dùng qua `SiteChrome`.
- **Cách sửa:**
  - Chuẩn hóa `SiteChrome` thành wrapper header/footer dùng chung hoặc truyền đầy đủ props `onOpenSchedule`, `hasSchedule` và loại bỏ việc khai báo trùng `#stA`, `#stB`.
- **Tiêu chí chấp nhận (AC):**
  - Không còn trường hợp thiếu prop `onOpenSchedule` / `hasSchedule` trên `EventHeader` hoặc trùng lặp ID `#stA`, `#stB` trong DOM.