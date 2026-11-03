# SPEC — EventTicketing

EventTicketing là một SPA viết bằng React 19, TypeScript 5.8, Vite 6 và Tailwind 4 (`package.json`). Ứng dụng không dùng React Router. `src/App.tsx` tự định tuyến bằng `resolvePublicRoute` (`src/domain/publicRoute.js:15-40`). Backend là Supabase, gồm Auth, PostgREST/RPC, RLS, Realtime và pg_cron. Schema nằm trong `supabase/migrations/*.sql`, kiểm thử pgTAP nằm trong `supabase/tests/*.sql`. Ngoài ra còn một nhánh REST/WebSocket dự phòng: các service gọi `/api/v1/...` và `/ws/events/:eventId/seats` khi không cấu hình Supabase (`src/services/eventService.ts:165-171`, `src/services/seatRealtimeService.ts:59-72`).

**Chế độ dữ liệu.** Cờ được khai báo là `runtimeConfig.useMockData = import.meta.env.VITE_USE_MOCK_DATA !== 'false'` (`src/config/runtime.ts:10`). Vì vậy mặc định ứng dụng chạy ở chế độ mock.

- **Chế độ mock:**
  - Sơ đồ ghế đọc `public/data_zones.json` và `public/data_seats.json` cho **mọi** sự kiện (`src/services/ticketDataService.ts:87-95`).
  - Sự kiện mẫu lấy từ hằng `MOCK_EVENTS` (`src/services/eventService.ts:37-81`).
  - Dữ liệu của BTC nằm trong localStorage: `eventticketing:mock-organizer-events`, `eventticketing:mock-organizer-orgs`, `eventticketing:mock-organizer-session`, `eventticketing:mock-account-kind` (`src/services/organizerService.ts:86-89`).
  - Phiên khán giả nằm trong `eventticketing:mock-buyer-session` (`src/services/buyerAuthService.ts:11`).
- **Chế độ thật:** đặt `VITE_USE_MOCK_DATA=false`, kèm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (`src/config/runtime.ts:6-7,37-38`). Workflow GitHub Pages build ở chế độ này (`.github/workflows/deploy.yml:48`).

**Cấu trúc thư mục chính:**
- `src/App.tsx`: gốc định tuyến. Gọi `setActiveEventContext` sau khi tải sự kiện (`App.tsx:77-82`).
- `src/components/`: `EventCatalog`, `GenericEventPage`, `BuyerAuth`, `OrganizerPortal`, `ConcertSections`, `SprintOneStates`.
- `src/components/event-template/`: các khối của trang chi tiết sự kiện và sơ đồ ghế React.
- `src/components/organizer-ui/`: Studio của Ban tổ chức (BTC).
- `src/domain/`: logic thuần, gồm route, trạng thái bán, sơ đồ ghế, validation, theme thể loại, realtime, overlay.
- `src/services/`: ranh giới giữa mock, Supabase và REST.
- `src/types/`: `ticketing.ts` (type nghiệp vụ) và `database.types.ts` (type Supabase sinh tự động, **đã lỗi thời**, xem mục 6).
- `src/legacy/`: runtime concert cũ và các fragment HTML.
- `supabase/`: 13 migration và 5 file pgTAP.
- `tests/`: chạy bằng `node --test`.
- `scripts/`: kiểm tra staging.
- `prototype/`: HTML tĩnh cũ.

## 1. Route / trang

Mọi liên kết được sinh theo dạng `<base>/?route=/<target>` (`buildPublicPath`, `publicRoute.js:42-63`). Nếu target có query thì query được nối thêm bằng `&`, ví dụ `?route=/events/x&preview=1`. Resolver cũng đọc được hash `#/...` và clean path (`publicRoute.js:16-17`). Thứ tự ưu tiên là: `organizer` > (`account` | `login` | `register`) > `events` > catalog (`publicRoute.js:22-34`).

| Route (URL thực tế) | Trang / component render | Ai dùng | Ghi chú (tham số, điều kiện) |
|---|---|---|---|
| `/` hoặc `/?route=/` | `EventCatalog` (`src/components/EventCatalog.tsx`) | Khách | Mọi path không chứa `events`/`organizer`/`account`/`login`/`register` đều rơi về catalog (`publicRoute.js:34`). Không có trang 404 chung. |
| `/?route=/events` | `EventCatalog` | Khách | Tìm theo tên hoặc địa điểm, lọc theo thể loại. Sự kiện nổi bật là `events[0]` (`EventCatalog.tsx:87`). |
| `/?route=/events/:eventSlug` | `App` → `GenericEventPage` → `EventTemplate` | Khách | Tải bằng `loadPublicEvent(eventSlug)`. Nếu gặp `PublicEventNotFoundError` thì thử tiếp `loadEventForPreview` (`App.tsx:61-74`). Slug bị lặp đôi được rút gọn bằng `deduplicateSlug`. Mặc định chọn suất đầu tiên theo `ThoiGianBatDau` (`eventService.ts:94,291-292`). |
| `/?route=/events/:eventSlug/shows/:showSlug` | Như trên, kèm `ShowSwitcher` (`EventCatalog.tsx:584`) | Khách | `showSlug` không tồn tại thì báo 404 (`eventService.ts:300`). `ShowSwitcher` chỉ hiện khi có từ 2 suất trở lên. |
| `/?route=/events/:eventSlug&preview=1` | Như trên, có banner "CHẾ ĐỘ XEM TRƯỚC" (`EventHeader.tsx:30`) | BTC | Gọi `loadEventForPreview` (`App.tsx:57-59`). Ở chế độ thật, việc đọc bản nháp phụ thuộc RLS "Members read their events" (`20261005150000_marketplace_organizer_mvp.sql:208`). Link được sinh từ `OrganizerEventCard.tsx:46` và `OrganizerEventWizard.tsx:1866`. |
| `/?route=/events/super-concert-2026` | `GenericEventPage` với slot riêng cho concert (`GenericEventPage.tsx:10`) | Khách | Áp dụng khi `templateKey === 'SUPER_CONCERT_2026'`. `mapEvent` cũng gán template này cho `SuKienID = 1` (`eventService.ts:101`). Sơ đồ ghế dùng `seating.html` cùng `src/legacy/concertRuntime.js` (nạp động ở `EventTemplate.tsx:154-159`). |
| (trạng thái của route chi tiết) | `AppLoadingState` / `EventNotFoundState` / `AppErrorState` (`SprintOneStates.tsx`) | Khách | 404 chỉ dùng khi sự kiện không tồn tại hoặc chưa công bố (`App.tsx:106`). |
| `/?route=/login` | `BuyerAuth page="login"` | Khách | Đăng nhập thành công thì chuyển sang `events` sau 600 ms (`BuyerAuth.tsx:76-80`). |
| `/?route=/register` | `BuyerAuth page="register"` | Khách | Mật khẩu ≥ 6 ký tự và phải khớp ô xác nhận (`BuyerAuth.tsx:64-72`). Hỗ trợ luồng xác nhận email (`BuyerAuth.tsx:87-92`). |
| `/?route=/account/login` | `BuyerAuth page="login"` | Khách | **Alias** của `/login`: resolver lấy segment sau `account` (`publicRoute.js:27-30`), `BuyerAuth` đặt `mode='login'` (`BuyerAuth.tsx:49-52`). Test kỳ vọng tại `tests/public-auth-nav.test.mjs:11`. |
| `/?route=/account/register` | `BuyerAuth page="register"` | Khách | **Alias** của `/register` (cùng nguồn như trên). |
| `/?route=/account` | `BuyerAuth page="overview"` | Khách đã đăng nhập | Có session thì hiện thẻ hồ sơ, chưa có thì hiện form đăng nhập (`BuyerAuth.tsx:156`). |
| `/?route=/account/:sub` (khác `login`/`register`) | `BuyerAuth page=":sub"` | — | Resolver chấp nhận mọi giá trị. `BuyerAuth` không xử lý riêng nên hiển thị như `/account` (form ở chế độ đăng nhập hoặc thẻ hồ sơ). Không có trang con nào khác. |
| `/?route=/organizer` | `OrganizerPortal page="dashboard"` | BTC | Chưa có session: hiện `OrganizerAuthView`. `accountKind` không phải ORGANIZER/ADMIN: hiện `OrganizerAccessDeniedView`. Còn lại: hiện `OrganizerDashboard`. |
| `/?route=/organizer/login` | `OrganizerPortal` → `OrganizerAuthView` | BTC | Có tab đăng nhập và đăng ký Studio. Khi đã đăng nhập thì hiện thẻ "Mở Studio làm việc". |
| `/?route=/organizer/:other` | `OrganizerPortal` (dashboard) | BTC | Ngoài `login`, tham số `page` bị bỏ qua (`OrganizerPortal.tsx:131`). Wizard là modal, không có route riêng. |
| Anchor `#events`, `#tickets`, `#seating-section`, `#pricing-section`, `#concert-guide-section`, `#artist-lineup`, `#overview` | Các section | — | Chỉ là anchor cuộn trang, không phải route (`EventHeader.tsx:79-108`). |
| `prototype/index-static.html`, `prototype/index2.html` | HTML tĩnh | — | App không route tới. |

## 2. Component chính

### Khung app

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `App` | `src/App.tsx` | Đọc route, nghe `popstate`/`hashchange`, tải sự kiện (public hoặc preview), gọi `setActiveEventContext({eventId: slug, eventDatabaseId, showId, showSlug})` | Tất cả |
| `AppLoadingState`, `AppErrorState`, `EventNotFoundState` | `src/components/SprintOneStates.tsx` | Trạng thái đang tải, lỗi, 404 của trang chi tiết | `events/:slug` |
| `SaleStatusBanner` | `src/components/SprintOneStates.tsx` | Banner trạng thái bán | Không được import ở đâu |
| `SiteChrome` | `src/components/SiteChrome.tsx` | Bọc header kèm starfield | Không được import ở đâu |
| `Icons` | `src/components/common/Icons.tsx` | Bộ icon SVG, `CategoryIcon` | Catalog, BuyerAuth |

### Catalog

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `EventCatalog` | `src/components/EventCatalog.tsx` | Marketplace: nav, hero nổi bật, tìm kiếm, lọc thể loại kèm đếm số, lưới thẻ sự kiện, footer, phiên khách | `/`, `events` |
| `ShowSwitcher` | `src/components/EventCatalog.tsx:584` | Chuyển suất diễn | `events/:slug[/shows/:show]` |

### Chi tiết sự kiện và đặt vé

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `GenericEventPage` (alias `EventDetailPage`) | `src/components/GenericEventPage.tsx` | Tải hạng vé (`loadPublicTicketTiers`), chọn slot cho Super Concert | `events/:slug` |
| `EventTemplate` | `event-template/EventTemplate.tsx` | Bố cục chung. Tính `saleStatus` mỗi 30 s, tải lịch trình, quản lý hạng vé đang chọn và modal | `events/:slug` |
| `EventHeader` | `event-template/EventHeader.tsx` | Header, banner preview, nav (concert và sự kiện thường khác nhau) | `events/:slug` |
| `EventHero`, `EventCountdown` | `event-template/EventHero.tsx`, `EventCountdown.tsx` | Hero, CTA, đếm ngược tới giờ mở bán hoặc khai mạc (dùng `event.startsAt`, `eventTemplateLogic.js:252-268`) | `events/:slug` |
| `TicketTiersSection` | `event-template/TicketTiersSection.tsx` | Bảng hạng vé (giá, sức chứa, còn lại), chọn hạng | `events/:slug` |
| `BookingSummaryPanel`, `BookingAssistModal` | `event-template/BookingSummaryPanel.tsx` | Tóm tắt đặt vé. CTA "Liên hệ đặt vé" mở modal tel/mailto | `events/:slug` |
| `MobileStickyBar` | `event-template/MobileStickyBar.tsx` | CTA dính đáy màn hình mobile, hiện giá thấp nhất | `events/:slug` |
| `ArtistLineupSection` | `event-template/ArtistLineupSection.tsx` | Dàn nghệ sĩ (`loadPublicArtists`) | `events/:slug` |
| `ScheduleDialog` | `event-template/ScheduleDialog.tsx` | Modal lịch trình | `events/:slug` |
| `EventVenueSection`, `EventMediaSection`, `EventPolicySection`, `EventContactSection` | `event-template/*.tsx` | Địa điểm/online, trailer và ảnh sơ đồ, quy định, liên hệ và giấy phép. Tự ẩn khi không có dữ liệu | `events/:slug` |
| `EventFooter`, `TeamInfoDialog` | `event-template/EventFooter.tsx`, `TeamInfoDialog.tsx` | Footer; modal thông tin nhóm và SRS | `events/:slug` |

### Sơ đồ ghế

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `SeatMapSection` (alias `SeatingSection`) | `event-template/SeatMapSection.tsx` | Sơ đồ ghế React **chỉ cho ghế ngồi có bản ghi `GHE`**. Gồm: tải catalog; báo `empty` khi không có zone **hoặc** không có ghế (`:124`); nhận realtime; chọn tối đa 4 ghế; giữ và hủy giữ; đếm ngược. Yêu cầu giữ chỗ chỉ được tạo từ `selectedSeats` (`:337`). Không có thao tác chọn số lượng vé đứng: trong `event-template/` và `domain/seatMap.js` không có tham chiếu nào tới `DUNG_STAND`, `LoaiKhuVuc` hay `quantity` | `events/:slug` (sự kiện không phải concert) |
| `MapToolbar`, `StadiumOverview`, `ZoneSeatGrid`, `SeatButton`, `SelectionSummary`, `HoldConfirmationDialog` | `event-template/*.tsx` | Lọc, tìm, zoom; tổng quan phân khu SVG; lưới ghế theo hàng; tóm tắt lựa chọn; hộp thoại giữ ghế | `events/:slug` |
| `SeatingSection` (bản concert) | `src/components/ConcertSections.tsx:57` | Concert dùng `seating.html` qua `StaticMarkup`; sự kiện khác dùng `SeatMapSection` | `events/super-concert-2026` |
| `ConcertRuntimeOverlays` (alias `FooterAndModals`) | `src/components/ConcertSections.tsx:68` | Nghe `CustomEvent` từ runtime legacy để hiện `SeatTooltip`, `RuntimeToastContainer`, `BookingHoldModal` | Concert |
| `BookingHoldModal`, `SeatTooltip`, `RuntimeToastContainer` | `event-template/*.tsx` | Overlay React cho runtime concert. Có nút "Mô phỏng Sprint 3" | Concert |

### Tài khoản khách

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `BuyerAuth` | `src/components/BuyerAuth.tsx` | Đăng nhập, đăng ký, hiện/ẩn mật khẩu, xem hồ sơ, đăng xuất | `login`, `register`, `account`, `account/login`, `account/register`, `account/:sub` |

### Cổng ban tổ chức

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `OrganizerPortal`, `OrganizerDashboard`, `OrganizerFrame` | `src/components/OrganizerPortal.tsx` | Gác phiên và vai trò. Workspace: chọn tổ chức, lọc sự kiện theo tổ chức (`:252`), công bố, mở wizard | `organizer` |
| `OrganizerAuthView` | `organizer-ui/OrganizerAuthView.tsx` | Đăng nhập và đăng ký BTC | `organizer`, `organizer/login` |
| `OrganizerAccessDeniedView` | `organizer-ui/OrganizerAccessDeniedView.tsx` | Chặn tài khoản USER | `organizer` |
| `OrganizerTopBar`, `OrganizerSidebar`, `OrganizerStatsCards` | `organizer-ui/*.tsx` | Thanh trên; danh sách tổ chức kèm vai trò; thống kê tổng / công khai / nháp | `organizer` |
| `OrganizerOnboarding` | `organizer-ui/OrganizerOnboarding.tsx` | Form tạo tổ chức đầu tiên | `organizer` |
| `OrganizerEventCard` | `organizer-ui/OrganizerEventCard.tsx` | Thẻ sự kiện: sửa, xem trước hoặc mở trang công khai, công bố | `organizer` |
| `OrganizerEventWizard` | `organizer-ui/OrganizerEventWizard.tsx` | Wizard 6 bước: suất diễn, hạng vé, lịch trình, nghệ sĩ, lưu nháp, kiểm tra readiness, công bố | `organizer` (modal) |
| `OrganizerEmptyState`, `OrganizerIcons` | `organizer-ui/*.tsx` | Trạng thái rỗng/lỗi/đang tải, icon | `organizer` |

### Legacy

| Component | File | Vai trò | Dùng ở route nào |
|---|---|---|---|
| `concertRuntime.js` | `src/legacy/concertRuntime.js` | Runtime DOM cho SVG sân vận động: chọn ghế, chọn số lượng vé đứng (`:999-1013`), thêm vé đứng vào tạm tính (`:1015-1049`), giữ chỗ, realtime, đếm ngược | Concert (import động) |
| `seating.html` | `src/legacy/fragments/seating.html` | Markup sơ đồ concert | Concert |
| `HeroSection`, `PricingSection` | `src/components/ConcertSections.tsx:45,53` | Bọc fragment tĩnh | Không được render |
| `ConcertGuideSection`, `ConcertMobileSticky` | `src/components/ConcertSections.tsx:154,342` | Bản cũ của phần hướng dẫn và thanh sticky concert | Không được render |
| `footer-modals.html`, `artist-lineup.html` | `src/legacy/fragments/` | Fragment cũ | Không được import |

## 3. Chức năng

### Khách vãng lai
- [x] Xem danh mục sự kiện đã công bố (`src/components/EventCatalog.tsx`, `src/services/eventService.ts` – `loadPublicEvents`)
- [x] Xem sự kiện nổi bật ở hero của catalog (`src/components/EventCatalog.tsx`)
- [x] Tìm kiếm sự kiện theo tên hoặc địa điểm (`src/components/EventCatalog.tsx`)
- [x] Lọc sự kiện theo thể loại (`src/components/EventCatalog.tsx`, `src/domain/categoryThemes.js`)
- [x] Xem số sự kiện của từng thể loại (`src/components/EventCatalog.tsx`)
- [x] Xem phần hero (tổng quan) của sự kiện (`event-template/EventHero.tsx`)
- [x] Xem bảng hạng vé gồm giá, sức chứa, số còn lại (`event-template/TicketTiersSection.tsx`)
- [x] Xem tên và địa chỉ địa điểm tổ chức (`event-template/EventVenueSection.tsx`)
- [x] Mở link tham gia online của sự kiện (`event-template/EventVenueSection.tsx` – `event.onlineLink`)
- [x] Xem hướng dẫn tham gia online (`event-template/EventVenueSection.tsx` – `event.onlineInstructions`)
- [x] Xem trailer sự kiện (`event-template/EventMediaSection.tsx`)
- [x] Xem ảnh sơ đồ trong phần media (`event-template/EventMediaSection.tsx`)
- [x] Xem quy định độ tuổi (`event-template/EventPolicySection.tsx`)
- [x] Xem chính sách hoàn hủy (`event-template/EventPolicySection.tsx`)
- [x] Xem điều khoản tham gia (`event-template/EventPolicySection.tsx`)
- [x] Xem thông tin liên hệ của BTC (`event-template/EventContactSection.tsx`)
- [x] Xem số giấy phép biểu diễn (`event-template/EventContactSection.tsx`)
- [x] Chuyển giữa các suất diễn (`src/components/EventCatalog.tsx` – `ShowSwitcher`)
- [x] Xem trạng thái bán: Sắp mở / Đang mở / Hết vé / Đã đóng (`src/domain/eventStatus.js`)
- [x] Xem đếm ngược tới giờ mở bán hoặc giờ khai mạc (`event-template/EventCountdown.tsx`, `eventTemplateLogic.js`)
- [x] Xem dàn nghệ sĩ (`event-template/ArtistLineupSection.tsx`, `src/services/artistService.ts`)
- [x] Xem lịch trình trong modal (`event-template/ScheduleDialog.tsx`, `src/services/scheduleService.ts`)
- [x] Chọn hạng vé (`event-template/TicketTiersSection.tsx`)
- [x] Nhận CTA tương ứng với trạng thái bán của hạng vé đã chọn (`event-template/eventTemplateLogic.js` – `resolveCtaState`)
- [x] Mở hộp thoại "Liên hệ đặt vé" (`event-template/BookingSummaryPanel.tsx` – `BookingAssistModal`)
- [x] Gọi hotline BTC từ hộp thoại liên hệ đặt vé (`event-template/BookingSummaryPanel.tsx:279`)
- [x] Gửi email đặt vé cho BTC từ hộp thoại liên hệ đặt vé (`event-template/BookingSummaryPanel.tsx:291`)
- [x] Mở link do BTC cung cấp từ hộp thoại liên hệ đặt vé (`event-template/BookingSummaryPanel.tsx:304`)
- [x] Xem CTA dính đáy màn hình trên mobile (`event-template/MobileStickyBar.tsx`)
- [x] Xem sơ đồ ghế ngồi React (`event-template/SeatMapSection.tsx`)
- [x] Lọc sơ đồ theo phân khu (`event-template/MapToolbar.tsx`)
- [x] Tìm ghế theo mã (`src/domain/seatMap.js` – `findZoneForSeatQuery`)
- [x] Phóng to sơ đồ (`event-template/SeatMapSection.tsx:262` – `handleZoomIn`, `event-template/MapToolbar.tsx`)
- [x] Thu nhỏ sơ đồ (`event-template/SeatMapSection.tsx:266` – `handleZoomOut`, `event-template/MapToolbar.tsx`)
- [x] Đặt lại mức zoom sơ đồ (`event-template/SeatMapSection.tsx:270` – `handleZoomReset`, `event-template/MapToolbar.tsx`)
- [x] Chọn ghế còn trống khi đang mở bán, tối đa 4 ghế (`src/domain/seatMap.js` – `evaluateSeatSelection`, `MAX_SELECTION_CAP`)
- [x] Bỏ chọn ghế bằng cách bấm lại vào ghế đã chọn trên sơ đồ (`src/domain/seatMap.js:156` – `toggleSeatSelection`)
- [x] Bỏ chọn một ghế khỏi lựa chọn (`event-template/SeatMapSection.tsx` – `handleRemoveSeat`)
- [x] Bỏ chọn tất cả ghế (`event-template/SeatMapSection.tsx` – `handleClearAll`)
- [x] Giữ ghế đã chọn (`event-template/SeatMapSection.tsx` – `handleProceedHold`, `src/services/bookingService.ts` – `createSeatHold`)
- [x] Xem đếm ngược thời gian giữ ghế (`event-template/HoldConfirmationDialog.tsx`)
- [x] Hủy giữ ghế (`event-template/SeatMapSection.tsx` – `handleReleaseHold`, `bookingService.ts` – `releaseSeatHold`)
- [x] Nhận cập nhật trạng thái khi ghế bị người khác bán hoặc giữ (`event-template/SeatMapSection.tsx`, `src/services/seatRealtimeService.ts`)
- [x] Tự bỏ ghế khỏi lựa chọn khi ghế đó bị người khác bán hoặc giữ (`src/domain/seatMap.js` – `reconcileSelectionAfterUpdate`)
- [x] Mở ảnh sơ đồ tổng quan do BTC đính kèm (`event-template/SeatMapSection.tsx`)
- [ ] Chọn ghế trên sơ đồ SVG của Super Concert (`src/legacy/concertRuntime.js`)
- [ ] Tăng số lượng vé đứng của Super Concert (`src/legacy/concertRuntime.js:999` – `updateStandingQuantity` với `delta > 0`)
- [ ] Giảm số lượng vé đứng của Super Concert (`src/legacy/concertRuntime.js:999` – `updateStandingQuantity` với `delta < 0`)
- [ ] Thêm vé đứng vào tạm tính của Super Concert (`src/legacy/concertRuntime.js:1015` – `addStandingTickets`)
- [ ] Giữ chỗ trên sơ đồ Super Concert (`src/legacy/concertRuntime.js`, `event-template/BookingHoldModal.tsx`)
- [ ] Xem tooltip thông tin ghế của Super Concert (`event-template/SeatTooltip.tsx`)
- [ ] Bấm "Mô phỏng Sprint 3" để nhận toast giới thiệu (`event-template/BookingHoldModal.tsx`, `src/domain/runtimeOverlays.js`)
- [ ] Đăng ký tài khoản khán giả (`src/components/BuyerAuth.tsx`, `src/services/buyerAuthService.ts` – `signUpBuyer`)
- [ ] Nhận thông báo cần xác nhận email sau khi đăng ký (`src/components/BuyerAuth.tsx:87-92`)
- [ ] Đăng nhập tài khoản khán giả (`src/components/BuyerAuth.tsx`, `buyerAuthService.ts` – `signInBuyer`)
- [ ] Chuyển giữa tab đăng nhập và tab đăng ký (`src/components/BuyerAuth.tsx:317-331`)
- [ ] Bật/tắt hiển thị mật khẩu (`src/components/BuyerAuth.tsx:388`)
- [ ] Bật/tắt hiển thị mật khẩu xác nhận (`src/components/BuyerAuth.tsx:37`)
- [x] Xem thông tin nhóm và SRS (`event-template/TeamInfoDialog.tsx`)

### Khách đã đăng nhập
- [ ] Xem hồ sơ gồm email, họ tên, loại tài khoản (`src/components/BuyerAuth.tsx`)
- [x] Thấy badge tài khoản trên nav của catalog (`src/components/EventCatalog.tsx`)
- [ ] Đăng xuất từ trang tài khoản (`src/components/BuyerAuth.tsx` – `handleSignOut`)
- [x] Đăng xuất từ nav của catalog (`src/components/EventCatalog.tsx`)
- [ ] Đi tới Studio BTC từ trang tài khoản (`src/components/BuyerAuth.tsx`)

### Ban tổ chức
- [ ] Đăng nhập Studio (`organizer-ui/OrganizerAuthView.tsx`, `src/services/organizerService.ts` – `signInOrganizer`)
- [ ] Đăng ký tài khoản Studio (`organizer-ui/OrganizerAuthView.tsx`, `organizerService.ts` – `signUpOrganizer`)
- [ ] Bị chặn vào Studio nếu tài khoản là USER (`src/components/OrganizerPortal.tsx`, `organizerValidation.js` – `isOrganizerAccount`)
- [ ] Tạo tổ chức với tên ≥ 3 ký tự và slug hợp lệ (`organizer-ui/OrganizerOnboarding.tsx`, `organizerService.ts` – `createOrganization`)
- [ ] Chọn tổ chức đang làm việc (`organizer-ui/OrganizerSidebar.tsx`)
- [ ] Ghi nhớ tổ chức đang chọn theo từng user (`organizerValidation.js:27-60` – `saveActiveOrganizationId`)
- [ ] Xem danh sách sự kiện của tổ chức đang chọn (`OrganizerPortal.tsx:252`, `organizerValidation.js:18` – `filterEventsByOrganization`)
- [ ] Xem thống kê tổng / công khai / nháp (`organizer-ui/OrganizerStatsCards.tsx`)
- [ ] Chỉ `CHU_SO_HUU`/`QUAN_TRI`/`BIEN_TAP` thấy thao tác sửa; `VAN_HANH`/`SOAT_VE` chỉ xem (`organizerValidation.js:23` – `canManageOrganizationEvents`)
- [ ] Mở wizard tạo sự kiện mới (`organizer-ui/OrganizerEventWizard.tsx`)
- [ ] Chuyển qua lại giữa các bước của wizard (`OrganizerEventWizard.tsx`)
- [ ] Thêm suất diễn (`OrganizerEventWizard.tsx:94` – `addShow`)
- [ ] Xóa suất diễn (`OrganizerEventWizard.tsx:167` – `removeShow`)
- [ ] Sửa thông tin suất diễn: tên, slug, giờ diễn, giờ mở cửa, cửa sổ bán (`OrganizerEventWizard.tsx:178` – `updateShow`)
- [ ] Thêm hạng vé cho một suất (`OrganizerEventWizard.tsx:186` – `addTier`)
- [ ] Xóa hạng vé (`OrganizerEventWizard.tsx:204` – `removeTier`)
- [ ] Sửa hạng vé: mã, tên, loại đứng/ngồi, giá, sức chứa, màu, quyền lợi, min/max mỗi đơn (`OrganizerEventWizard.tsx:212` – `updateTier`)
- [ ] Sao chép toàn bộ hạng vé của một suất sang mọi suất khác (`OrganizerEventWizard.tsx:220,1102` – `cloneTiersToAllShows`)
- [ ] Thêm mục lịch trình (`OrganizerEventWizard.tsx:242` – `addScheduleItem`)
- [ ] Xóa mục lịch trình (`OrganizerEventWizard.tsx:273` – `removeScheduleItem`)
- [ ] Sửa mục lịch trình (`OrganizerEventWizard.tsx:282` – `updateScheduleItem`)
- [ ] Đổi thứ tự mục lịch trình (`OrganizerEventWizard.tsx:290` – `moveScheduleItem`)
- [ ] Thêm nghệ sĩ (`OrganizerEventWizard.tsx:303` – `addArtistItem`)
- [ ] Xóa nghệ sĩ (`OrganizerEventWizard.tsx:320` – `removeArtistItem`)
- [ ] Sửa thông tin nghệ sĩ (`OrganizerEventWizard.tsx:329` – `updateArtistItem`)
- [ ] Đổi thứ tự nghệ sĩ (`OrganizerEventWizard.tsx:337` – `moveArtistItem`)
- [ ] Lưu bản nháp sự kiện (`OrganizerEventWizard.tsx:350` – `handleSaveDraft`, `organizerService.ts` – `saveFullEventDraft`)
- [ ] Xem danh sách điều kiện công bố gồm blockers và warnings (`organizerValidation.js` – `evaluatePublishReadiness`)
- [ ] Công bố sự kiện từ wizard (`OrganizerEventWizard.tsx:375` – `handlePublish`)
- [ ] Công bố sự kiện từ thẻ sự kiện (`OrganizerPortal.tsx` – `publish`, `organizerService.ts` – `publishEvent`)
- [ ] Mở sự kiện đã có để sửa (`OrganizerPortal.tsx` – `handleStartEdit`, `organizerService.ts` – `loadEventForEditing`)
- [ ] Xem trước bản nháp trên trang public bằng `preview=1` (`organizer-ui/OrganizerEventCard.tsx`, `organizerService.ts` – `loadEventForPreview`)
- [ ] Mở trang công khai của sự kiện đã công bố (`organizer-ui/OrganizerEventCard.tsx`)
- [ ] Đăng xuất Studio (`OrganizerPortal.tsx`, `organizerService.ts` – `signOutOrganizer`)

### Hệ thống
- [ ] Định tuyến bằng query, hash hoặc path mà không cần SPA rewrite (`src/domain/publicRoute.js`)
- [ ] Rút gọn slug bị lặp đôi (`src/domain/publicRoute.js` – `deduplicateSlug`)
- [ ] Chuyển giữa mock và thật bằng `VITE_USE_MOCK_DATA` (`src/config/runtime.ts`)
- [ ] Dùng REST/WS dự phòng khi tắt mock mà không cấu hình Supabase (`src/services/eventService.ts`, `seatRealtimeService.ts`, `bookingService.ts`)
- [ ] Tính trạng thái bán từ mốc mở/đóng bán, trạng thái DB và tồn kho (`src/domain/eventStatus.js`)
- [ ] Áp theme màu theo thể loại, có xử lý alias (`src/domain/categoryThemes.js`)
- [ ] Đăng ký realtime `UPDATE` trên bảng `GHE` theo suất, filter chia nhỏ ≤ 100 phân khu mỗi lần (`src/domain/seatRealtime.js:18,229,279-286`)
- [ ] Bỏ qua payload realtime của phân khu không thuộc suất đang xem (`src/domain/seatRealtime.js:114-152`)
- [ ] Đồng bộ lại lựa chọn khi giữ ghế lỗi hoặc xung đột (`src/domain/seatMap.js` – `reconcileSelectionWithCatalog`)
- [ ] Tự hủy trạng thái giữ ghế phía client khi hết giờ (`event-template/SeatMapSection.tsx:187-213`)
- [ ] Nhả lượt giữ khi đổi sự kiện hoặc đổi suất (`event-template/SeatMapSection.tsx:88-113`)
- [ ] Phân tích lịch trình từ mô tả sự kiện (`src/domain/publicSchedule.js` – `parseTimelineFromDescription`)
- [ ] Chuẩn hóa dòng nghệ sĩ từ Supabase (`src/domain/artistLineup.js` – `normalizeArtistRow`)
- [ ] Chuẩn hóa dòng lịch trình (`src/domain/publicSchedule.js` – `normalizeScheduleRow`)
- [ ] Dịch lỗi Auth sang thông điệp tiếng Việt (`src/domain/organizerValidation.js` – `mapAuthError`)
- [ ] Dịch mã lỗi Postgres (42501, 23505, 23514, 22023) sang thông điệp tiếng Việt (`organizerValidation.js` – `mapDatabaseError`)
- [ ] Bus sự kiện overlay (toast, tooltip, booking modal) giữa runtime legacy và React (`src/domain/runtimeOverlays.js`)
- [ ] Giữ chỗ trong transaction, khóa hàng bằng `FOR UPDATE`, tối đa 4 vé mỗi lượt (`supabase/migrations/20261005090000_product_foundation.sql:387-465` – `tao_giu_cho_theo_suat`)
- [ ] Tự hết hạn lượt giữ chỗ mỗi 10 giây bằng pg_cron (`20260929120000_sprint1_hold_hardening.sql:6-43,226-230` – `expire_seat_holds`)
- [ ] Lưu toàn bộ sự kiện của BTC trong một RPC (`20261028100000_…sql:145-709` – `luu_su_kien_toan_dien`)
- [ ] Chặn đổi giá hạng vé khi sự kiện đã có lượt giữ hoặc bán (`20261028100000_…sql:261-273,446-453`)
- [ ] Chặn giảm sức chứa hạng vé khi sự kiện đã có lượt giữ hoặc bán (`20261028100000_…sql:261-273,446-453`)
- [ ] Chặn đổi giờ bắt đầu suất diễn khi sự kiện đã có lượt giữ hoặc bán (`20261028100000_…sql:261-273,383-390`)
- [ ] Chặn xóa phân khu đã có lượt giữ hoặc bán (`20261028100000_…sql:482-508`)
- [ ] Chặn xóa suất diễn đã có lượt giữ hoặc bán (`20261028100000_…sql:523-550`)
- [ ] Kiểm tra điều kiện công bố phía server (`20261006190000_…sql:524-604` – `cong_bo_su_kien`, `kiem_tra_trang_thai_cong_bo_su_kien`)
- [ ] Chặn tự nâng loại tài khoản (`20261006210000_user_organizer_boundary.sql:42-59`)
- [ ] Deploy GitHub Pages ở chế độ thật (`.github/workflows/deploy.yml`)
- [ ] Script kiểm tra hợp đồng công khai trên staging (`scripts/verify-supabase-public.mjs`)
- [ ] Script kiểm tra nền tảng sản phẩm trên staging (`scripts/verify-product-foundation-staging.mjs`)

## 4. Shape dữ liệu từng entity

**Mức xác minh** (ghi ở đầu mỗi khối):
- **[DB]**: đọc trực tiếp từ DDL trong `supabase/migrations/*.sql`. Shape được tính sau khi áp đủ 13 migration theo thứ tự tên file. Chưa đối chiếu với cơ sở dữ liệu staging đang chạy.
- **[TS]**: type được khai báo trong `src/types/*.ts`, `src/services/*.ts` hoặc `src/domain/*.d.ts`.
- **[MAP]**: shape suy từ hàm ánh xạ hàng → object trong service.
- **[JSON]**: shape của dữ liệu mock trong `public/*.json`.

**Quy ước đổi kiểu SQL sang TS:** `INT`/`SERIAL`/`BIGINT`/`BIGSERIAL`/`NUMERIC` → `number`; `TIMESTAMPTZ` → `string` (ISO); `TIME` → `string`; `UUID`/`VARCHAR`/`TEXT` → `string`; `JSONB` → `Json`; cột cho phép NULL → `| null`.

Mỗi entity tách thành 3 loại: **Row** là bản ghi DB; **projection** là object client nhận sau khi map; **request** là payload gửi đi.

`src/types/database.types.ts` **không** được dùng làm nguồn vì đã lỗi thời so với migration (xem mục 6, ghi chú 1).

```ts
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
```

### 4.1 Sự kiện — `SU_KIEN`

```ts
// [DB] 20260927000000_event_ticketing_sprint1.sql:25-46; TrangThaiCongBo: 20260929090000_sprint1_publication_policy.sql:5,12;
//      Slug, ToChucID: 20261005090000_product_foundation.sql:56-58,75-83; TemplateKey, TheLoai: 20261005150000_marketplace_organizer_mvp.sql:4-12;
//      LoaiHinhSuKien…SoGiayPhepBieuDien: 20261006190000_organizer_event_creation_slice.sql:5-18.
type SuKienRow = {
  SuKienID: number;                 // SERIAL PK
  TenSuKien: string;                // VARCHAR(255) NOT NULL
  Slug: string;                     // VARCHAR(160) NOT NULL UNIQUE, CHECK ^[a-z0-9]+(?:-[a-z0-9]+)*$
  ToChucID: string;                 // UUID NOT NULL → TO_CHUC
  Slogan: string | null;
  MoTaChiTiet: string | null;       // TEXT; từ 20261028100000 còn chứa lịch trình dạng văn bản
  TheLoai: 'AM_NHAC' | 'SAN_KHAU' | 'THE_THAO' | 'HOI_THAO' | 'WORKSHOP' | 'THAM_QUAN' | 'KHAC'; // NOT NULL DEFAULT 'KHAC'
  TemplateKey: 'DEFAULT' | 'SUPER_CONCERT_2026';                                                // NOT NULL DEFAULT 'DEFAULT'
  ThoiGianBatDau: string;           // NOT NULL; luu_su_kien_toan_dien đồng bộ = MIN của các suất
  ThoiGianKetThuc: string;          // NOT NULL; CHECK > ThoiGianBatDau
  ThoiGianMoBanVe: string;          // NOT NULL
  ThoiGianDongBanVe: string | null;
  DiaDiem: string;                  // NOT NULL (địa chỉ)
  TenSanVanDong: string;            // NOT NULL (tên địa điểm)
  SucChua: number;                  // NOT NULL DEFAULT 40000; RPC lưu đồng bộ = tổng TongSoGhe
  BannerURL: string | null;
  PosterURL: string | null;
  TrailerURL: string | null;
  SoDoTongQuanURL: string | null;
  TrangThaiMoBan: string;           // VARCHAR(50) NOT NULL DEFAULT 'SAP_MO_BAN' (không có CHECK)
  TrangThaiCongBo: 'BAN_NHAP' | 'CONG_KHAI' | 'DA_AN'; // NOT NULL DEFAULT 'BAN_NHAP'
  QuyDinhDoTuoi: string | null;     // DEFAULT '14+'
  LoaiHinhSuKien: 'OFFLINE' | 'ONLINE' | 'HYBRID' | 'TBA'; // NOT NULL DEFAULT 'OFFLINE'
  DuongDanTrucTuyen: string | null;
  HuongDanThamGiaTrucTuyen: string | null;
  ChinhSachHoanHuy: string | null;
  QuyDinhThamGia: string | null;
  EmailLienHe: string | null;       // VARCHAR(150)
  HotlineLienHe: string | null;     // VARCHAR(30)
  FanpageURL: string | null;
  SoGiayPhepBieuDien: string | null;
  NgayTao: string;
  NgayCapNhat: string;
};

// [TS] src/services/eventService.ts:9-19 (projection cho trang chi tiết). [MAP] mapEvent :93-123.
// Các mốc thời gian lấy từ SUẤT ĐANG CHỌN (:117-118), không lấy từ SU_KIEN.
type PublicEventRecord = {
  id: number;                       // ← SuKienID
  code: string;                     // ← Slug (mock: mã viết hoa)
  slug: string;                     // ← deduplicateSlug(Slug)
  name: string;                     // ← TenSuKien
  slogan?: string; description?: string;
  templateKey: 'DEFAULT' | 'SUPER_CONCERT_2026'; // ← TemplateKey, hoặc ép thành concert khi SuKienID = 1 (:101)
  category: string;                 // ← TheLoai || 'KHAC'
  bannerUrl?: string; posterUrl?: string; trailerUrl?: string;
  seatingMapUrl?: string;           // ← SoDoTongQuanURL
  ageRestriction?: string;          // ← QuyDinhDoTuoi
  refundPolicy?: string;            // ← ChinhSachHoanHuy
  termsAndConditions?: string;      // ← QuyDinhThamGia
  contactEmail?: string; contactHotline?: string; fanpageUrl?: string;
  permitNumber?: string;            // ← SoGiayPhepBieuDien
  locationMode?: string;            // ← LoaiHinhSuKien
  onlineLink?: string; onlineInstructions?: string;
  startsAt: string;                 // BẮT BUỘC ← selectedShow.startsAt (:15, :117); dùng cho đếm ngược (eventTemplateLogic.js:253)
  endsAt: string;                   // ← selectedShow.endsAt
  saleStartsAt: string; saleEndsAt?: string;
  venueName: string;                // ← TenSanVanDong || 'Địa điểm tổ chức'
  address: string;                  // ← DiaDiem || ''
  capacity: number;                 // ← SucChua || 100
  databaseSaleStatus: string;       // ← selectedShow.databaseSaleStatus (= SUAT_DIEN.TrangThai)
  publicationStatus: 'CONG_KHAI' | 'BAN_NHAP' | 'DA_AN';
  selectedShow: PublicShowRecord;
  shows: PublicShowRecord[];
};

// [TS] eventService.ts:21-23 (projection cho catalog). [MAP] :192-199.
type PublicEventSummary = Pick<PublicEventRecord,
  'id' | 'slug' | 'name' | 'slogan' | 'description' | 'venueName' | 'startsAt' | 'publicationStatus' | 'category' | 'bannerUrl' | 'posterUrl'
> & { showCount: number };          // startsAt ← SU_KIEN.ThoiGianBatDau; showCount ← số dòng SUAT_DIEN nhúng kèm

// [TS] src/services/organizerService.ts:12-23 (projection cho dashboard BTC). [MAP] :269-280.
type OrganizerEvent = {
  id: number; organizationId: string; name: string; slug: string;
  status: string;                   // ← TrangThaiCongBo
  category: string; startsAt: string; showCount: number;
  bannerUrl?: string; posterUrl?: string;
};
```

### 4.2 Suất diễn — `SUAT_DIEN`

```ts
// [DB] 20261005090000_product_foundation.sql:85-104; ThoiGianMoCua: 20261006190000_…sql:20-21.
type SuatDienRow = {
  SuatDienID: number;               // BIGSERIAL PK
  SuKienID: number;                 // NOT NULL → SU_KIEN ON DELETE CASCADE
  Slug: string;                     // NOT NULL; UNIQUE (SuKienID, Slug)
  TenSuatDien: string;              // NOT NULL
  DiaDiemID: number | null;         // → DIA_DIEM
  PhienBanSoDoID: string | null;    // → PHIEN_BAN_SO_DO
  MuiGio: string;                   // NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'
  ThoiGianBatDau: string;
  ThoiGianKetThuc: string;          // CHECK > ThoiGianBatDau
  ThoiGianMoCua: string | null;
  ThoiGianMoBanVe: string;
  ThoiGianDongBanVe: string | null; // CHECK NULL hoặc > ThoiGianMoBanVe
  TrangThai: 'BAN_NHAP' | 'SAP_MO_BAN' | 'DANG_MO_BAN' | 'HET_VE' | 'DONG_BAN' | 'HUY' | 'DA_DIEN_RA'; // DEFAULT 'SAP_MO_BAN'
  NgayTao: string; NgayCapNhat: string;
};

// [TS] eventService.ts:4-7. [MAP] mapShow :83-91.
type PublicShowRecord = {
  id: number; slug: string; name: string;     // ← SuatDienID, Slug, TenSuatDien
  startsAt: string; endsAt: string;
  saleStartsAt: string; saleEndsAt?: string;
  timezone: string;                           // ← MuiGio
  databaseSaleStatus: string;                 // ← TrangThai
};

// [TS] src/domain/organizerValidation.d.ts:30-40 (request, nằm trong payload của luu_su_kien_toan_dien).
type FullEventShowInput = {
  showId?: number;                  // có → UPDATE (RPC kiểm tra suất thuộc đúng sự kiện); không có → INSERT với TrangThai 'BAN_NHAP'
  slug: string; name: string; startsAt: string; endsAt: string;
  doorsOpenAt?: string;             // → ThoiGianMoCua
  saleStartsAt: string; saleEndsAt?: string;
  ticketTiers: FullEventTierInput[];
};
```

### 4.3 Hạng vé / phân khu — `KHU_VUC`

```ts
// [DB] 20260927000000_…sql:83-95; SuatDienID: 20261005090000_…sql:138-153; SoVe*: 20261006190000_…sql:23-33.
type KhuVucRow = {
  KhuVucID: number;                 // SERIAL PK
  SuKienID: number;                 // NOT NULL; trigger buộc khớp với SuatDienID (20261005090000_…sql:172-188)
  SuatDienID: number;               // NOT NULL; UNIQUE (SuatDienID, MaKhuVuc)
  MaKhuVuc: string; TenKhuVuc: string;
  LoaiKhuVuc: string;               // NOT NULL DEFAULT 'GHE_NGOI', không có CHECK ở DB; giá trị thực tế 'GHE_NGOI' | 'DUNG_STAND'
  GiaVeNiemYet: number;             // NUMERIC(15,2) NOT NULL CHECK >= 0
  MauSacHex: string;                // NOT NULL
  MoTaQuyenLoi: string | null;
  TongSoGhe: number;                // INT NOT NULL DEFAULT 0 (với khu đứng: sức chứa)
  SoVeToiThieuMoiDon: number;       // DEFAULT 1, CHECK >= 1
  SoVeToiDaMoiDon: number;          // DEFAULT 4, CHECK >= SoVeToiThieuMoiDon
};

// [TS] eventService.ts:25-28 (projection hạng vé). [MAP] :344-352.
type PublicTicketTier = {
  id: number; code: string; name: string; price: number; color: string; description?: string;
  capacity: number;                 // ← TongSoGhe
  available: number;                // = số GHE có TrangThai 'TRONG'; nếu khu không có ghế thì = TongSoGhe (:350), không trừ lượt đang giữ
};

// [TS] src/types/ticketing.ts:3-9 (projection cho sơ đồ ghế). [MAP] ticketDataService.ts:37-43.
// Ở chế độ thật, service không lấy LoaiKhuVuc nên client không phân biệt được khu đứng với khu ngồi.
type ZoneRecord = {
  KhuVucID: number; MaKhuVuc: string; TenKhuVuc: string; GiaVeNiemYet: number;
  MauSacHex?: string;
};

// [JSON] public/data_zones.json: shape thực tế của mock, được ép kiểu thẳng thành ZoneRecord[] (ticketDataService.ts:90-92).
type MockZoneJson = ZoneRecord & {
  LoaiKhuVuc: 'GHE_NGOI' | 'DUNG_STAND';
  SoGheMauDemo: number; SoGheTrong: number; SoGheDaBan: number; SoGheDangGiu: number;
  TyLeLapDayPhanTram: number | null; // null khi SoGheMauDemo = 0 (data_zones.json:39,52,65,104)
};

// [TS] organizerValidation.d.ts:17-28 (request).
type FullEventTierInput = {
  tierId?: number;                  // có → UPDATE (RPC kiểm tra khu thuộc đúng suất và sự kiện)
  code: string; name: string;
  type?: 'DUNG_STAND' | 'GHE_NGOI'; // RPC mặc định 'DUNG_STAND' (20261028100000_…sql:423)
  price: number; capacity: number; color?: string;
  benefits?: string;                // → MoTaQuyenLoi
  minPerOrder?: number;             // → SoVeToiThieuMoiDon (mặc định 1)
  maxPerOrder?: number;             // → SoVeToiDaMoiDon (mặc định 4)
};
```

### 4.4 Ghế — `GHE`

```ts
// [DB] 20260927000000_…sql:98-108.
type GheRow = {
  GheID: number;                    // SERIAL PK
  KhuVucID: number;                 // NOT NULL; UNIQUE (KhuVucID, MaGheDayDu)
  SoHang: string; SoGhe: string; MaGheDayDu: string;
  TrangThai: string;                // VARCHAR(30) NOT NULL DEFAULT 'TRONG', không có CHECK ở DB
  ToaDoX: number | null; ToaDoY: number | null;
};

// [TS] ticketing.ts:1,11-25. [MAP] ticketDataService.ts:61-73 (GiaVeNiemYet và TenKhuVuc lấy từ zone khi join).
type DatabaseSeatStatus = 'TRONG' | 'DA_BAN' | 'DANG_GIU' | 'KHONG_MO_BAN';
type SeatRecord = {
  GheID: number | string;           // TS rộng hơn DB (INT)
  KhuVucID: number; TenKhuVuc?: string;
  SoHang: string; SoGhe: string; MaGheDayDu: string;
  TrangThai: DatabaseSeatStatus;
  GiaVeNiemYet?: number;
};
type TicketingCatalog = { zones: ZoneRecord[]; seats: SeatRecord[] };
type UiSeatStatus = 'available' | 'sold' | 'held' | 'selected' | 'blocked'; // [TS] src/domain/seatMap.d.ts:3
```

### 4.5 Sự kiện realtime trạng thái ghế

```ts
// [TS] ticketing.ts:51-59. [MAP] src/domain/seatRealtime.js:143-151 (Supabase); seatRealtimeService.ts:81-83 (WS).
// Nguồn phát: postgres_changes với event 'UPDATE' trên public.GHE, filter "KhuVucID=in.(…)", kênh 'show-{showId}-seats-{uuid}'.
type SeatStatusEvent = {
  type: 'SEAT_STATUS_CHANGED';
  eventId: string;                  // = ActiveEventContext.eventId (slug); WS lọc theo field này (seatRealtimeService.ts:82)
  seatId?: number | string;         // ← GheID
  seatCode: string;                 // ← MaGheDayDu
  zoneCode: string;                 // ← MaKhuVuc của zone; '' nếu không tra được
  status: DatabaseSeatStatus;
  occurredAt: string;               // ← commit_timestamp, hoặc thời điểm client nhận
};
type RealtimeConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'; // [TS] seatRealtimeService.ts:12
```

### 4.6 Giữ chỗ — `GIU_CHO` và `CHI_TIET_GIU_CHO`

```ts
// [DB] 20260927120000_secure_seat_holds.sql:15-25; SuatDienID: 20261005090000_…sql:156-169.
// RLS đã bật nhưng không có policy SELECT nào, nên client không đọc trực tiếp được; chỉ thao tác qua RPC SECURITY DEFINER.
type GiuChoRow = {
  GiuChoID: string;                 // UUID PK
  SuKienID: number;                 // NOT NULL → SU_KIEN
  SuatDienID: number;               // NOT NULL → SUAT_DIEN; trigger buộc khớp SuKienID
  PhienNguoiDung: string;           // UUID NOT NULL; client sinh và lưu ở localStorage 'eventticketing-session-id' (bookingService.ts:8-16)
  TrangThai: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONVERTED';
  HetHanLuc: string;                // DEFAULT NOW() + 5 phút
  NgayTao: string; NgayCapNhat: string;
};

// [DB] 20260927120000_…sql:27-35.
type ChiTietGiuChoRow = {
  ID: number;                       // BIGSERIAL PK
  GiuChoID: string;                 // → GIU_CHO ON DELETE CASCADE
  KhuVucID: number;                 // → KHU_VUC
  GheID: number | null;             // NULL với vé đứng (tao_giu_cho_theo_suat :446-448), có giá trị với ghế ngồi (:455-456)
  MaVe: string;                     // ghế: MaGheDayDu; vé đứng: ticketCode hoặc '{MaKhuVuc}-{holdId}'
  SoLuong: number;                  // DEFAULT 1, CHECK 1..4; ghế ngồi luôn bằng 1
};

// [TS] ticketing.ts:32-49 (request và response phía client).
type HoldItem = { ticketCode: string; zoneCode: string; quantity?: number }; // quantity chỉ runtime concert dùng cho vé đứng
type CreateHoldRequest = { eventId: string; items: HoldItem[] };
// Chế độ thật: eventId KHÔNG được gửi lên. Service gọi tao_giu_cho_theo_suat(p_suat_dien_id = ActiveEventContext.showId,
// p_phien_id, p_items), và chỉ fallback sang tao_giu_cho(p_su_kien_id = eventDatabaseId) khi gặp 42883/PGRST202
// (bookingService.ts:19-45). eventId chỉ được gửi theo đường REST (:48-53) và được trả lại ở mock (:56-62).
type HoldRecord = {
  holdId: string; eventId: string;  // RPC trả eventId = SU_KIEN.Slug (20261005090000_…sql:460)
  status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONVERTED';
  expiresAt: string; items: HoldItem[];
};                                  // RPC còn trả thêm showId, không có trong type TS
type ActiveHold = { holdId: string; expiresAt: string; seatCodes: string[] }; // state, SeatMapSection.tsx:48-52
type BookingHoldItem = {            // [TS] src/domain/runtimeOverlays.d.ts:24 (payload overlay của concert)
  ticketCode: string; zoneCode?: string; zoneName: string;
  price: number; priceFormatted?: string; quantity?: number;
};
```

### 4.7 Đơn hàng, vé, thanh toán

```ts
// Đã kiểm tra:
// - Mọi CREATE TABLE trong supabase/migrations/*.sql và EventTicketing_Sprint1_MySQL.sql: không có bảng đơn hàng, vé hay thanh toán.
// - Mọi file trong src/services/ và src/types/: không có type hay hàm nào cho các khái niệm này.
// Thứ gần nhất: GIU_CHO.TrangThai có giá trị 'CONVERTED', nhưng không RPC nào đã đọc đặt giá trị này;
// GHE.TrangThai 'DA_BAN' chỉ có trong dữ liệu seed.
// Kết luận chỉ áp dụng cho phạm vi đã đọc nói trên; không kiểm tra DB staging.
type Order = never;
type Ticket = never;
type Payment = never;
```

### 4.8 Nghệ sĩ — `NGHE_SI` và bảng nối `SU_KIEN_NGHE_SI`

```ts
// [DB] 20260927000000_…sql:49-57.
type NgheSiRow = {
  NgheSiID: number;                 // SERIAL PK
  HoTen: string;                    // VARCHAR(150) NOT NULL
  NgheDanh: string;                 // VARCHAR(150) NOT NULL
  VaiTroChinh: string | null;
  TieuSu: string | null;
  HinhAnhURL: string | null;
  NgayTao: string;
};

// [DB] 20260927000000_…sql:60-67.
type SuKienNgheSiRow = {
  ID: number;                       // SERIAL PK
  SuKienID: number;                 // → SU_KIEN ON DELETE CASCADE
  NgheSiID: number;                 // → NGHE_SI ON DELETE CASCADE; UNIQUE (SuKienID, NgheSiID)
  VaiTroTrongSuKien: string;        // NOT NULL DEFAULT 'Main Act'
  ThuTuHienThi: number;             // NOT NULL DEFAULT 1
};

// [TS] src/domain/artistLineup.d.ts:1-12 (projection; query nhúng SU_KIEN_NGHE_SI + NGHE_SI ở artistService.ts:86-104).
type PublicArtistRecord = {
  id: number;                       // ← NgheSiID
  name: string;                     // NgheDanh, nếu trống thì HoTen
  stageName?: string; realName?: string;
  role: string; primaryRole?: string; eventRole?: string;
  bio?: string; imageUrl?: string;
  order: number;                    // ← ThuTuHienThi
};

// [TS] organizerValidation.d.ts:53-62 (request). RPC còn nhận các khóa alias stageName/ngheDanh/hoTen/… (20261028100000_…sql:578-587).
type FullEventArtistInput = {
  artistId?: number; id?: number; name: string; realName?: string;
  role?: string; bio?: string; imageUrl?: string; order?: number;
};
```

### 4.9 Lịch trình

```ts
// [DB] Bảng LICH_TRINH (20260927000000_…sql:70-80) ĐÃ BỊ XÓA tại 20261028100000_…sql:27.
// Từ migration này, lịch trình chỉ còn là văn bản trong SU_KIEN.MoTaChiTiet, mục "### LỊCH TRÌNH CHƯƠNG TRÌNH (TIMELINE)".
// Không còn Row nào cho lịch trình.

// [TS] src/domain/publicSchedule.d.ts:1-10 (projection; parse từ mô tả hoặc lấy fallback).
type PublicScheduleItem = {
  id: number; eventId: number;
  startTime: string; endTime?: string;  // 'HH:mm'
  title: string; description?: string; location?: string;
  order: number;
};

// [TS] organizerValidation.d.ts:42-51 (request). Có trong FullEventAggregateInput.schedule,
// nhưng phiên bản cuối của luu_su_kien_toan_dien không đọc khóa 'schedule' (xem mục 6).
type FullEventScheduleInput = {
  scheduleId?: number; id?: number; startTime: string; endTime: string;
  title: string; description?: string; location?: string; order?: number;
};
```

### 4.10 Người dùng — `auth.users` và `HO_SO_NGUOI_DUNG`

```ts
// [DB] 20261005090000_…sql:17-23; LoaiTaiKhoan: 20261006210000_user_organizer_boundary.sql:8-13.
// Quan hệ 1-1 với auth.users. Hàng được tạo bởi trigger tao_ho_so_nguoi_dung_moi, luôn gán 'USER' (:62-74).
// RLS: chỉ đọc và sửa hồ sơ của chính mình; trigger chặn tự đổi LoaiTaiKhoan (:42-59).
type HoSoNguoiDungRow = {
  NguoiDungID: string;              // UUID PK → auth.users(id) ON DELETE CASCADE
  HoTen: string | null;             // VARCHAR(150); trigger lấy full_name trong metadata, nếu không có thì lấy email
  AnhDaiDienURL: string | null;
  LoaiTaiKhoan: 'USER' | 'ORGANIZER' | 'ADMIN'; // NOT NULL DEFAULT 'USER'
  NgayTao: string; NgayCapNhat: string;
};

// [TS] src/services/buyerAuthService.ts:4-9 (projection).
type BuyerSession = {
  userId: string;                   // ← auth user id
  email: string;
  fullName?: string;                // ← user_metadata.full_name (KHÔNG đọc từ HO_SO_NGUOI_DUNG.HoTen)
  accountKind?: string;             // ← HO_SO_NGUOI_DUNG.LoaiTaiKhoan, mặc định 'USER'
};
// [TS] organizerService.ts:5 (projection).
type OrganizerSession = { userId: string; email: string; accountKind?: string };

// Kết quả đăng ký. [TS] buyerAuthService.ts:140; organizerService.ts:191.
type SignUpBuyerResult = { session: BuyerSession | null; requiresEmailConfirmation: boolean };
type SignUpOrganizerResult = { userId?: string; email?: string; hasSession: boolean };
type AccountKind = 'USER' | 'ORGANIZER' | 'ADMIN'; // organizerValidation.js:3-7
```

### 4.11 Tổ chức — `TO_CHUC` và `THANH_VIEN_TO_CHUC`

```ts
// [DB] 20261005090000_…sql:7-15.
type ToChucRow = {
  ToChucID: string;                 // UUID PK
  TenToChuc: string;                // VARCHAR(200) NOT NULL
  Slug: string;                     // VARCHAR(120) NOT NULL UNIQUE
  TrangThai: 'HOAT_DONG' | 'TAM_KHOA'; // NOT NULL DEFAULT 'HOAT_DONG'
  NgayTao: string; NgayCapNhat: string;
};

// [DB] 20261005090000_…sql:25-33.
type OrganizerRole = 'CHU_SO_HUU' | 'QUAN_TRI' | 'BIEN_TAP' | 'VAN_HANH' | 'SOAT_VE';
type ThanhVienToChucRow = {
  ID: string;                       // UUID PK
  ToChucID: string;                 // → TO_CHUC ON DELETE CASCADE
  NguoiDungID: string;              // → auth.users ON DELETE CASCADE; UNIQUE (ToChucID, NguoiDungID)
  VaiTro: OrganizerRole;
  NgayTao: string;
};

// [TS] organizerService.ts:6-11 (projection; query THANH_VIEN_TO_CHUC nhúng TO_CHUC, :242-255).
type OrganizerMembership = {
  organizationId: string; organizationName: string; organizationSlug: string;
  role: string;                     // ← VaiTro
};

// Request và response của RPC tao_to_chuc_cua_toi (20261006210000_…sql:188-219).
type CreateOrganizationRequest = { p_ten_to_chuc: string; p_slug: string };
type CreateOrganizationResult = { organizationId: string; name: string; slug: string; role: 'CHU_SO_HUU' };
```

### 4.12 Địa điểm — `DIA_DIEM` và phiên bản sơ đồ — `PHIEN_BAN_SO_DO`

```ts
// [DB] 20261005090000_…sql:35-43. Client chưa có projection riêng: địa điểm nằm phẳng trong SU_KIEN
// (TenSanVanDong, DiaDiem → venueName, address). Không service nào truy vấn DIA_DIEM.
type DiaDiemRow = {
  DiaDiemID: number;                // BIGSERIAL PK
  ToChucID: string | null;          // → TO_CHUC ON DELETE SET NULL
  TenDiaDiem: string;               // VARCHAR(200) NOT NULL
  DiaChi: string;                   // TEXT NOT NULL
  MuiGio: string;                   // NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'
  SucChua: number | null;           // CHECK NULL hoặc > 0
  NgayTao: string;
};

// [DB] 20261005090000_…sql:45-54. Không service nào truy vấn bảng này.
// Public chỉ đọc được bản đã khóa (DaKhoa) thuộc suất đã công bố (:248-257).
type PhienBanSoDoRow = {
  PhienBanSoDoID: string;           // UUID PK
  DiaDiemID: number;                // NOT NULL → DIA_DIEM ON DELETE RESTRICT; UNIQUE (DiaDiemID, SoPhienBan)
  SoPhienBan: number;               // CHECK > 0
  TenPhienBan: string;              // VARCHAR(150) NOT NULL
  DuLieuSoDo: Json;                 // JSONB NOT NULL DEFAULT '{}'
  DaKhoa: boolean;                  // NOT NULL DEFAULT FALSE
  NgayTao: string;
};
```

### 4.13 Cấu hình sự kiện — `CAU_HINH_SU_KIEN` và aggregate của BTC

```ts
// [DB] 20261028100000_…sql:32-45. Quan hệ 1-1 với SU_KIEN (PK = FK).
// Quyền ghi giới hạn cho biên tập viên (20261103090000_…sql:9-24). Không service nào đọc bảng này.
type CauHinhSuKienRow = {
  SuKienID: number;                 // PK → SU_KIEN ON DELETE CASCADE
  ThoiGianGiuChoPhut: number;       // DEFAULT 5, CHECK 1..60
  SoVeToiDaMoiDon: number;          // DEFAULT 4, CHECK 1..20
  ChoPhepChonCho: boolean;          // DEFAULT TRUE
  YeuCauCCCD: boolean;              // DEFAULT FALSE
  ChoPhepChuyenNhuong: boolean;     // DEFAULT TRUE
  TuyChonMoRong: Json;              // JSONB NOT NULL DEFAULT '{}'; seed của sự kiện 1 có soundcheck_vip, do_tuoi_toi_thieu, …
  NgayCapNhat: string;
};

// [TS] organizerValidation.d.ts:64-91 (request, gửi dưới dạng p_payload của luu_su_kien_toan_dien).
type FullEventAggregateInput = {
  eventId?: number; organizationId: string;
  name: string;                     // RPC yêu cầu ≥ 5 ký tự
  slug: string; category: string; slogan?: string; description?: string;
  locationMode: 'OFFLINE' | 'ONLINE' | 'HYBRID' | 'TBA';
  venueName?: string; address?: string; onlineLink?: string; onlineInstructions?: string;
  bannerUrl?: string; posterUrl?: string; trailerUrl?: string; seatingMapUrl?: string;
  ageRestriction?: string; refundPolicy?: string; termsAndConditions?: string;
  contactEmail?: string; contactHotline?: string; fanpageUrl?: string; permitNumber?: string;
  shows: FullEventShowInput[];
  schedule?: FullEventScheduleInput[];   // RPC bỏ qua
  artists?: FullEventArtistInput[];
  // RPC còn nhận khóa 'configuration' | 'cauHinh' (20261028100000_…sql:322-345) nhưng type TS không khai báo và client không gửi.
};
type SaveFullEventResult = { eventId: number; slug: string; status: string }; // RPC :703-707; organizerService.ts:483-487
type PublishReadinessResult = {
  isReady: boolean;
  blockers: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
};
// [TS] organizerService.ts:24-38 (request của luồng cũ tao_ban_nhap_su_kien; DB tạo 1 suất 'suat-1' và 1 khu DUNG_STAND
// tên 'GENERAL_ADMISSION', 20261005150000_…sql:57-125).
type CreateDraftInput = {
  organizationId: string; name: string; slug: string; description: string; category: string;
  venueName: string; address: string; startsAt: string; endsAt: string;
  saleStartsAt: string; saleEndsAt: string; price: number; capacity: number;
};
```

### 4.14 Trạng thái bán, ngữ cảnh runtime, theme, overlay (chỉ có ở client)

```ts
// [TS] src/domain/eventStatus.js, src/config/runtime.ts:13-25.
type SaleStatus = 'UPCOMING' | 'ON_SALE' | 'SOLD_OUT' | 'CLOSED';
type ActiveEventContext = {
  eventId: string;          // slug; mặc định VITE_EVENT_ID || 'SUPER_CONCERT_2026'
  eventDatabaseId: number;  // SuKienID; mặc định VITE_EVENT_DATABASE_ID || 1
  showId: number;           // SuatDienID; mặc định VITE_SHOW_DATABASE_ID || 1
  showSlug: string;         // mặc định VITE_SHOW_SLUG || 'dem-chinh'
};
// [TS] src/domain/categoryThemes.d.ts
type CategoryTheme = {
  key: string; label: string; tagline: string; primary: string; primaryLight: string; primaryDark: string;
  inkOnLight: string; badgeBg: string; badgeBorder: string; badgeText: string; glow: string;
  cardBorder: string; cardBg: string; gradient: string; iconSvg: string;
};
// [TS] src/domain/runtimeOverlays.d.ts
type ToastPayload = { id?: string; message: string; type?: 'info' | 'success' | 'warning' | 'error'; durationMs?: number };
type SeatTooltipPayload = {
  visible: boolean; x?: number; y?: number; seatCode?: string; zoneName?: string; row?: string;
  number?: string | number; price?: number; priceFormatted?: string; status?: string; statusText?: string;
};
type BookingModalPayload = {
  open: boolean; holdId?: string; expiresAt?: string; remainingSeconds?: number;
  items?: BookingHoldItem[]; totalQuantity?: number; totalAmount?: number; totalAmountFormatted?: string;
};
```

## 5. Chức năng cần backend thật (mock không làm được)

Mock chỉ **mô phỏng phía client** (form, luồng màn hình, lưu trong localStorage của một trình duyệt). Nó không bảo đảm được quyền truy cập, tính giao dịch hay đồng bộ giữa nhiều người dùng. Cột thứ ba ghi rõ thành phần backend nào **đã có trong migration**, và phần nào **chưa có**.

| Chức năng | Mock mô phỏng được gì (phía client) | Cần backend bảo đảm (trạng thái trong migration) | File liên quan |
|---|---|---|---|
| Đăng ký / đăng nhập | Kiểm tra email có `@` và mật khẩu ≥ 6 ký tự, rồi ghi phiên vào localStorage. Không xác thực mật khẩu, không gửi email (`buyerAuthService.ts:96-105,145-154`; `organizerService.ts:178-181,192-198`). | **Có:** Supabase Auth. Trigger `tao_ho_so_nguoi_dung_moi` tạo hồ sơ `USER` (`20261006210000_…sql:62-74`). | `BuyerAuth.tsx`, `OrganizerAuthView.tsx`, `buyerAuthService.ts`, `organizerService.ts` |
| Phân loại tài khoản USER / ORGANIZER | `accountKind` lấy từ localStorage. Nếu không có thì email chứa "buyer" được coi là USER, còn lại là ORGANIZER (`organizerService.ts:114`). Chặn USER chỉ ở giao diện. | **Có:** cột `LoaiTaiKhoan`, trigger chặn tự nâng quyền, `lay_loai_tai_khoan`/`la_ban_to_chuc` chống dò người khác, `gan_loai_tai_khoan` chỉ cho `service_role` (`20261006210000_…sql:42-154`; `20261027120000_…sql:7-60`). **Chưa có:** luồng UI để quản trị viên nâng quyền. | `OrganizerPortal.tsx`, `organizerValidation.js` |
| Tách dữ liệu theo tổ chức | Có phân tách phía client: lọc sự kiện theo `organizationId` (`organizerValidation.js:18`, `OrganizerPortal.tsx:252`); nhớ tổ chức đang chọn theo key `eventticketing:organizer-active-org:{userId}` (`organizerValidation.js:27-29`). Đây **không** phải bảo đảm bảo mật. Ở mock, mọi phiên cùng `userId='mock-user'` (`organizerService.ts:115`); danh sách tổ chức và danh sách sự kiện nằm ở **hai key localStorage riêng** là `eventticketing:mock-organizer-orgs` và `eventticketing:mock-organizer-events` (`organizerService.ts:88-89`), mỗi key dùng chung cho mọi phiên mock (`:225-238`); tổ chức mới không gắn với user nào (`:305-312`). | **Có:** RLS dựa trên `la_thanh_vien_to_chuc` / `co_quyen_bien_tap_to_chuc`; hai hàm này kiểm tra cả membership lẫn `LoaiTaiKhoan` (`20261006210000_…sql:160-185`). Policy đọc và ghi cho `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `GHE`, `DIA_DIEM`, `PHIEN_BAN_SO_DO` (`20261005150000_…sql:208-313`) và `CAU_HINH_SU_KIEN` (`20261103090000_…sql`). | `OrganizerPortal.tsx`, `organizerService.ts`, `organizerValidation.js` |
| Phân quyền theo vai trò trong tổ chức | Ẩn nút sửa với `VAN_HANH`/`SOAT_VE` (`organizerValidation.js:14-25`). Ở mock, mọi tổ chức đều mang vai trò `CHU_SO_HUU` (`organizerService.ts:94,309`). | **Có:** `co_quyen_bien_tap_to_chuc` chỉ chấp nhận `CHU_SO_HUU`/`QUAN_TRI`/`BIEN_TAP` với `LoaiTaiKhoan` là `ORGANIZER`/`ADMIN` (`20261006210000_…sql:173-183`). Các RPC biên tập sự kiện đã xác minh gọi hàm này: `luu_su_kien_toan_dien` (`20261028100000_…sql:232`), `cong_bo_su_kien` (`20261006190000_…sql:531`), `tao_ban_nhap_su_kien` (`20261006190000_…sql:58`), cùng trigger `kiem_tra_trang_thai_cong_bo_su_kien` (`20261006190000_…sql:577`). Các RPC ghi khác có điều kiện riêng: `tao_to_chuc_cua_toi` không dùng hàm này mà yêu cầu `auth.uid()` khác NULL và `la_ban_to_chuc(auth.uid())` (tài khoản `ORGANIZER`/`ADMIN`), không đòi membership vì người gọi chưa có tổ chức, rồi tự gán người gọi làm `CHU_SO_HUU` (`20261006210000_…sql:188-219`); `tao_giu_cho_theo_suat` được cấp cho cả `anon` lẫn `authenticated`, không kiểm tra người dùng hay vai trò, chỉ kiểm tra `p_phien_id` khác NULL, `p_items` là mảng không rỗng, sự kiện `CONG_KHAI`, suất không ở `BAN_NHAP`/`HUY`/`DONG_BAN`/`DA_DIEN_RA`/`HET_VE`, đang trong cửa sổ bán và tổng 1–4 vé (`20261005090000_…sql:387-465`). **Chưa có:** RPC hay UI để mời thành viên hoặc đổi vai trò. | `OrganizerSidebar.tsx`, `organizerLogic.js` |
| Tạo tổ chức | Thêm một phần tử vào localStorage, kiểm tra quyền chỉ ở client (`organizerService.ts:289-319`). | **Có:** `tao_to_chuc_cua_toi` yêu cầu `la_ban_to_chuc`, trả 42501 với anon và USER, ghi `TO_CHUC` cùng `THANH_VIEN_TO_CHUC` trong một hàm (`20261006210000_…sql:188-219`). | `OrganizerOnboarding.tsx` |
| Lưu sự kiện (nháp) | Ghi toàn bộ aggregate vào một mảng localStorage, kể cả nhiều suất, nhiều hạng vé, lịch trình, nghệ sĩ (`organizerService.ts:390-475`). Trang public mock của sự kiện này chỉ dựng **1 suất** và **1 hạng `GENERAL_ADMISSION`** (`eventService.ts:210-245,317-331`); trang preview thì đọc đủ các suất (`organizerService.ts:746-758`). | **Có:** `luu_su_kien_toan_dien` (SECURITY DEFINER, anon bị thu hồi quyền) ghi nguyên tử `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `NGHE_SI`, `SU_KIEN_NGHE_SI`, `CAU_HINH_SU_KIEN`. Hàm kiểm tra id con thuộc đúng sự kiện, áp khóa thương mại và fork nghệ sĩ dùng chung (`20261028100000_…sql:145-713`). **Chưa có:** lưu lịch trình (khóa `schedule` bị bỏ qua); sinh bản ghi `GHE` cho hạng `GHE_NGOI`. | `OrganizerEventWizard.tsx`, `organizerService.ts` |
| Sửa sự kiện | Đọc lại từ localStorage (`organizerService.ts:491-579`). | Đọc `SU_KIEN` + `SUAT_DIEN` + `KHU_VUC` + `SU_KIEN_NGHE_SI` qua RLS. **Rủi ro:** service vẫn truy vấn `LICH_TRINH` và ném lỗi nếu truy vấn hỏng (`organizerService.ts:590-594,618-623`), trong khi bảng đã bị xóa (`20261028100000_…sql:27`). | `organizerService.ts` – `loadEventForEditing` |
| Công bố sự kiện | Chỉ kiểm tra `capacity >= 1` rồi đổi `status` (`organizerService.ts:862-873`). Readiness phía client (`evaluatePublishReadiness`) chỉ là kiểm tra giao diện. | **Có:** `cong_bo_su_kien` cùng trigger `kiem_tra_trang_thai_cong_bo_su_kien` kiểm tra quyền biên tập, ≥ 1 suất, thứ tự thời gian, mỗi suất có khu `TongSoGhe>0` và `GiaVeNiemYet>=0`, link online. Hàm cũng chuyển suất `BAN_NHAP` sang `SAP_MO_BAN` (`20261006190000_…sql:524-604`). | `OrganizerPortal.tsx`, `OrganizerEventCard.tsx` |
| Chỉ hiện sự kiện đã công bố; xem trước bản nháp | Catalog mock gộp sự kiện mẫu với sự kiện có `status==='CONG_KHAI'` trong localStorage (`eventService.ts:144-160`). Preview đọc thẳng localStorage, không kiểm tra quyền. | **Có:** policy công khai theo `TrangThaiCongBo='CONG_KHAI'` và suất khác `BAN_NHAP` (`20261005090000_…sql:238-292`); thành viên đọc được bản nháp (`20261005150000_…sql:208,219,242,262`). | `App.tsx`, `eventService.ts`, `organizerService.ts` – `loadEventForPreview` |
| Sơ đồ ghế theo từng sự kiện | Mọi sự kiện đều dùng cùng `public/data_*.json` của Super Concert (`ticketDataService.ts:87-95`). | **Có:** `KHU_VUC` theo `SuatDienID`, `GHE` theo `KhuVucID` (`ticketDataService.ts:20-57`). **Chưa có:** nơi tạo `GHE` cho sự kiện do BTC lập; khi đó sơ đồ báo trống (`SeatMapSection.tsx:124`). | `SeatMapSection.tsx`, `ticketDataService.ts` |
| Giữ chỗ có hết hạn | Trả `holdId='mock-…'` và `expiresAt = now + 300 s`, không thay đổi tồn kho. Hủy giữ không làm gì (`bookingService.ts:56-62,66`). Đồng hồ đếm ngược chạy phía client. | **Có:** `GIU_CHO`/`CHI_TIET_GIU_CHO`; `tao_giu_cho_theo_suat` kiểm tra công bố, cửa sổ bán, trạng thái suất, tối đa 4 vé, sức chứa khu đứng, ghế còn `TRONG` (`20261005090000_…sql:387-465`); `huy_giu_cho` kiểm tra đúng phiên (`20260927120000_…sql:174-214`); pg_cron gọi `expire_seat_holds` mỗi 10 s (`20260929120000_…sql:226-230`). Thời hạn **cứng 5 phút** trong RPC, không đọc `CAU_HINH_SU_KIEN.ThoiGianGiuChoPhut`. | `SeatMapSection.tsx`, `bookingService.ts`, `concertRuntime.js` |
| Chống đặt trùng khi nhiều người thao tác | Không có, vì mock không có kho dữ liệu dùng chung. | **Có:** `SELECT … FOR UPDATE` trên `KHU_VUC` và `GHE` trong cùng transaction của RPC (`20261005090000_…sql:435-454`). Client tải lại catalog và đối chiếu lựa chọn khi giữ chỗ lỗi (`SeatMapSection.tsx:366-405`). | `seatMap.js`, `SeatMapSection.tsx` |
| Realtime trạng thái ghế | Báo `CONNECTED` rồi không phát sự kiện nào (`seatRealtimeService.ts:36-39`). Vì vậy kết nối được coi là đáng tin và cho phép giữ ghế (`SeatMapSection.tsx:85`). | **Có:** publication `supabase_realtime` cho `GHE` và `KHU_VUC` (`20260927000000_…sql:130-131`). Client đăng ký `UPDATE` trên `GHE` với filter ≤ 100 khu (`seatRealtime.js:213-325`). Dự phòng WS `/ws/events/:eventId/seats`. | `seatRealtime.js`, `seatRealtimeService.ts` |
| Vé đứng | Runtime concert cho chọn số lượng và gửi `quantity` (`concertRuntime.js:999-1049`). Sơ đồ React không có luồng này. | **Có:** RPC xử lý `LoaiKhuVuc='DUNG_STAND'` theo `SoLuong` và `TongSoGhe` (`20261005090000_…sql:439-448`). **Chưa có:** UI vé đứng cho sự kiện không phải concert. | `concertRuntime.js`, `SeatMapSection.tsx` |
| Thanh toán | Chỉ có modal liên hệ BTC và nút "Mô phỏng Sprint 3" phát toast. | **Chưa có** bảng, RPC hay service nào (mục 4.7). Cần: đơn hàng, thanh toán, webhook phía server, chuyển `GIU_CHO` sang `CONVERTED` và ghế sang `DA_BAN`. | `BookingSummaryPanel.tsx`, `BookingHoldModal.tsx`, `runtimeOverlays.js` |
| Phát hành vé / soát vé | Không có. | **Chưa có** entity vé hay check-in. Vai trò `SOAT_VE` tồn tại trong CHECK của `THANH_VIEN_TO_CHUC` nhưng chưa có chức năng nào dùng. | `organizerLogic.js` (`ROLE_LABELS`) |
| Trạng thái bán đáng tin | `deriveSaleStatus` dùng đồng hồ trình duyệt. | **Có:** RPC giữ chỗ tự kiểm tra `NOW()` so với `ThoiGianMoBanVe`/`ThoiGianDongBanVe` và `SUAT_DIEN.TrangThai` (`20261005090000_…sql:413-419`). | `eventStatus.js` |

## 6. Ghi chú và điểm chưa rõ

1. **`src/types/database.types.ts` lỗi thời.**
   - File chỉ có 9 bảng (`CHI_TIET_GIU_CHO`, `GHE`, `GIU_CHO`, `KHU_VUC`, `CAU_HINH_SU_KIEN`, `LICH_TRINH`, `NGHE_SI`, `SU_KIEN`, `SU_KIEN_NGHE_SI`; dòng 42-434). Thiếu `SUAT_DIEN`, `TO_CHUC`, `THANH_VIEN_TO_CHUC`, `HO_SO_NGUOI_DUNG`, `DIA_DIEM`, `PHIEN_BAN_SO_DO`, trong khi vẫn còn `LICH_TRINH` đã bị xóa.
   - `SU_KIEN` trong file thiếu `Slug`, `ToChucID`, `TheLoai`, `TemplateKey`, `TrangThaiCongBo` và các cột của `20261006190000`. `KHU_VUC` thiếu `SuatDienID` và `SoVeToi*`. `GIU_CHO` thiếu `SuatDienID`.
   - Chỉ khai báo 2 RPC: `huy_giu_cho` và `tao_giu_cho`.
   - Các service bỏ qua vấn đề này bằng cách ép `as any`.
   - Mục 4 vì vậy lấy shape DB từ migration.
2. **Lịch trình ở chế độ thật** (xác minh bằng cách đọc migration và service; chưa chạy trên staging).
   - Migration `20261028100000` xóa bảng `LICH_TRINH` (`:27`). Phiên bản cuối của `luu_su_kien_toan_dien` không đọc khóa `schedule`. Vì vậy lịch trình nhập trong wizard **không được lưu** ở chế độ thật.
   - Phía public, `loadPublicSchedule` parse từ `MoTaChiTiet`. Nếu truy vấn `LICH_TRINH` lỗi thì trả fallback, không ném lỗi (`scheduleService.ts:40-45,108-111`).
   - Phía BTC, `loadEventForEditing` vẫn truy vấn `LICH_TRINH` và **ném lỗi** "Không thể tải lịch trình sự kiện" nếu truy vấn lỗi (`organizerService.ts:590-594,618-623`). Nếu DB đã áp `20261028100000` thì việc mở sự kiện để sửa sẽ thất bại.
   - Test vẫn kỳ vọng hai service gọi `.from('LICH_TRINH')` (`tests/organizer-schedule-lineup.test.mjs:317`, `tests/public-schedule.test.mjs:204`). Đó là kỳ vọng của test, không phải bằng chứng bảng còn tồn tại.
3. **Chưa có đơn hàng, vé, thanh toán.**
   - Phạm vi đã kiểm tra: mọi `CREATE TABLE` trong `supabase/migrations/` và `EventTicketing_Sprint1_MySQL.sql`, cùng toàn bộ `src/services/` và `src/types/`. Không có entity, RPC, service hay route nào cho các khái niệm này.
   - Trang `account` không có lịch sử đơn hay "vé của tôi".
   - Toast của nút "Mô phỏng Sprint 3" nhắc tới OTP, nhưng chưa có mã OTP nào.
4. **Định danh khi giữ chỗ.**
   - Sơ đồ React gửi `eventId: event.slug` (`SeatMapSection.tsx:350`). Runtime concert gửi `runtimeConfig.eventId`.
   - Ở chế độ Supabase, `createSeatHold` **bỏ qua** `eventId` và dùng `ActiveEventContext.showId` do `App` đặt từ suất đang chọn (`App.tsx:77-82`, `bookingService.ts:22-24`). Chỉ khi RPC `tao_giu_cho_theo_suat` không tồn tại mới fallback sang `tao_giu_cho(eventDatabaseId)`.
   - `eventId` chỉ có tác dụng ở đường REST và để lọc thông điệp WS.
5. **Sơ đồ React và vé đứng.**
   - `SeatMapSection` luôn được render cho sự kiện không phải concert (`EventTemplate.tsx:269-273`).
   - Nó chỉ làm việc với bản ghi `GHE`: catalog không có ghế thì báo trống (`:124`); yêu cầu giữ chỗ được dựng từ `selectedSeats` (`:337`); thư mục `event-template/` không xử lý `DUNG_STAND` hay `quantity`.
   - Vì vậy "render component sơ đồ" không đồng nghĩa với "có luồng đặt vé đứng". Luồng chọn số lượng vé đứng chỉ có trong runtime concert (`concertRuntime.js:999-1049`).
   - Thêm vào đó, `luu_su_kien_toan_dien` không sinh `GHE`. Với sự kiện do BTC tạo ở chế độ thật, sơ đồ React sẽ trống, và hạng `GHE_NGOI` không giữ được chỗ vì RPC cần một hàng `GHE` có trạng thái `TRONG` (`20261005090000_…sql:451-453`).
   - Lựa chọn hạng vé ("Liên hệ đặt vé") và lựa chọn ghế vẫn không liên kết với nhau.
6. **Giới hạn số vé không thống nhất.**
   - Client giới hạn cứng 4 ghế (`MAX_SELECTION_CAP`), RPC cũng cứng 4 vé (`20261005090000_…sql:421-425`).
   - Cả hai đều không đọc `KHU_VUC.SoVeToiThieuMoiDon`/`SoVeToiDaMoiDon` hay `CAU_HINH_SU_KIEN.SoVeToiDaMoiDon` (giá trị cho phép tới 20).
   - Thời hạn giữ cứng 5 phút trong RPC, không đọc `ThoiGianGiuChoPhut`. Banner client cũng ghi cứng "5 phút" (`SeatMapSection.tsx:364`).
7. **Số vé còn lại của hạng vé.** `loadPublicTicketTiers` đếm ghế `TRONG`. Với khu không có ghế (khu đứng), nó trả `available = TongSoGhe` và không trừ các lượt đang giữ (`eventService.ts:350`).
8. **Danh sách thể loại không thống nhất.**
   - DB và RPC có 7 giá trị (`20261005150000_…sql:12`, `20261028100000_…sql:243`). `VALID_CATEGORIES` cũng có 7 (`organizerValidation.js:129`).
   - `CATEGORY_LABELS` có 10 giá trị, thêm `TRIEN_LAM`, `GIAI_TRI`, `CONG_DONG` (`organizerLogic.js:40`).
   - `CATEGORY_MAP` có thêm `CONG_NGHE` (`eventTemplateLogic.js:10`).
9. **Cách nhận diện Super Concert không nhất quán.**
   - `mapEvent` ép `templateKey` thành concert khi `SuKienID === 1` (`eventService.ts:101`).
   - `isSuperConcertEvent` trong `artistLineup.js` cũng coi `{id: 1}` là concert (`tests/artist-lineup.test.mjs:192`).
   - Ngược lại, bản trong `publicSchedule.js:219` cố ý không dựa vào ID số.
10. **Trạng thái bán phía client.** `SeatMapSection` chỉ tính `saleStatus` khi `event` đổi, với `hasAvailability: true` (`:72-81`). `EventTemplate` thì tính lại mỗi 30 s. Vì vậy sơ đồ ghế không tự mở khi tới giờ bán nếu không tải lại trang; RPC vẫn là nơi quyết định cuối cùng.
11. **Route chưa hoàn chỉnh.**
    - `account/:sub` (ngoài `login`/`register`) và `organizer/:other` được resolve nhưng không có trang riêng.
    - Path lạ rơi về catalog thay vì 404.
    - `App` thử `loadEventForPreview` ngay cả khi không có `preview=1` (`App.tsx:63-70`).
12. **Vai trò chưa có giao diện.**
    - `ADMIN` là `accountKind` hợp lệ nhưng không có màn quản trị.
    - Tài khoản BTC đăng ký mới mặc định là `USER`, cần gọi `gan_loai_tai_khoan` bằng `service_role` (`OrganizerAuthView.tsx:195`). Repo không có luồng nào cho việc này.
    - Không có RPC hay UI mời thành viên vào tổ chức.
13. **Bảng chưa được client sử dụng.** `DIA_DIEM`, `PHIEN_BAN_SO_DO` và `CAU_HINH_SU_KIEN` có trong schema nhưng không service nào truy vấn. Wizard cũng không gửi khóa `configuration`, nên mỗi lần lưu chỉ tạo hàng cấu hình mặc định.
14. **Mã chết hoặc không được render.** `SiteChrome`, `SaleStatusBanner`, `HeroSection`, `PricingSection`, `ConcertGuideSection`, `ConcertMobileSticky`; các fragment `hero.html`, `pricing.html`, `footer-modals.html`, `artist-lineup.html`; `prototype/*.html`; `scripts/audit_backend_vs_frontend.mjs` là file rỗng.
15. **Lệch nhỏ về dữ liệu.**
    - `metadata.json` ghi "96 ghế", trong khi seed và `data_seats.json` có 48 ghế (`20260927000000_…sql:203-252`).
    - Các cột thống kê `SoGheMauDemo`, `SoGheTrong`, `SoGheDaBan`, `SoGheDangGiu`, `TyLeLapDayPhanTram` chỉ có trong `public/data_zones.json`; không có view hay cột DB tương ứng trong migration.
    - Seed đặt `TongSoGhe` của khu đứng bằng 200 (`20260927120000_…sql:7-9`), trong khi lưới ghế mẫu chỉ có 12 ghế mỗi khu.
16. **Mức xác minh chung.** Shape và hành vi backend ở mục 4 và 5 lấy từ migration và service trong repo. Chưa kiểm tra DB staging đã áp đủ 13 migration hay chưa; điều này ảnh hưởng trực tiếp tới ghi chú 2.

### 6.1 Kế hoạch xử lý mục 6

Phạm vi được duyệt (03/11/2026): được sửa giao diện và lớp dữ liệu phía client (`src/services`, `src/types`, `src/domain`). **Không** sửa `supabase/`, `*.sql`, `docs/`. Mục nào cần đổi database thì ghi vào mục 7 kèm lý do.
Trang thực hiện: P1 Catalog · P2 Chi tiết sự kiện và sơ đồ ghế · P3 Super Concert · P4 Tài khoản khách · P5 Cổng BTC · P6 Hệ thống.

- [ ] (6-1, P6) Cập nhật `src/types/database.types.ts` theo migration: thêm 6 bảng còn thiếu, bỏ `LICH_TRINH`, bổ sung cột và RPC đang dùng, giảm `as any` trong service
- [ ] (6-2a, P5) Mở sự kiện để sửa không còn lỗi khi bảng `LICH_TRINH` không tồn tại (`organizerService.ts` – `loadEventForEditing`)
- [ ] (6-2b, P5) Lịch trình nhập trong wizard được lưu ở chế độ thật
- [ ] (6-3, P6) Đơn hàng, vé, thanh toán
- [x] (6-4, P2) Thống nhất định danh sự kiện/suất gửi khi giữ chỗ giữa sơ đồ React và runtime concert
- [x] (6-5a, P2) Sơ đồ React có luồng chọn số lượng vé đứng (`DUNG_STAND`) cho sự kiện không phải concert
- [x] (6-5b, P2) Liên kết lựa chọn hạng vé với sơ đồ ghế
- [ ] (6-5c, P5) Sinh bản ghi `GHE` cho hạng `GHE_NGOI` của sự kiện do BTC tạo
- [x] (6-6, P2) Giới hạn số vé mỗi đơn và thời hạn giữ chỗ phía client đọc từ cấu hình (`SoVeToiDaMoiDon`, `ThoiGianGiuChoPhut`) thay vì ghi cứng
- [ ] (6-7, P2) Số vé còn lại của khu đứng trừ các lượt đang giữ
- [ ] (6-8, P5) Thống nhất danh sách thể loại giữa DB, `VALID_CATEGORIES`, `CATEGORY_LABELS`, `CATEGORY_MAP`
- [ ] (6-9, P3) Thống nhất cách nhận diện Super Concert (không dựa vào `SuKienID === 1`)
- [x] (6-10, P2) Sơ đồ ghế tự cập nhật trạng thái bán khi tới giờ mở/đóng bán, không cần tải lại trang
- [ ] (6-11a, P6) Path lạ, `account/:sub` và `organizer/:other` không hợp lệ hiển thị trang 404
- [x] (6-11b, P2) Chỉ tải bản xem trước khi URL có `preview=1`
- [ ] (6-12, P5) Giao diện cho vai trò `ADMIN`, nâng loại tài khoản và mời thành viên vào tổ chức
- [ ] (6-13, P5) Wizard gửi khóa `configuration`; client đọc `CAU_HINH_SU_KIEN`, `DIA_DIEM`, `PHIEN_BAN_SO_DO` khi cần
- [ ] (6-14, P6) Dọn mã chết và fragment không được render
- [ ] (6-15, P6) Sửa lệch dữ liệu nhỏ (`metadata.json` ghi 96 ghế; thống kê chỉ có trong `data_zones.json`)
- [ ] (6-16, P6) Xác minh trên DB staging đã áp đủ migration

## 7. Chưa làm được

Mục nào bị kẹt được ghi ở đây kèm lý do và việc cần làm tiếp; checkbox tương ứng ở trên vẫn để trống.

| Mục | Lý do | Cần gì để làm tiếp |
|---|---|---|
| 6-7 (P2) Số vé khu đứng trừ lượt đang giữ | Cần biết các lượt giữ chỗ đang hoạt động. `GIU_CHO` và `CHI_TIET_GIU_CHO` không có policy đọc công khai, nên client không đọc được; thêm view/RPC là thay đổi DB (đang khóa). | Migration mới: RPC hoặc view trả số lượng đang giữ theo khu, cấp quyền cho `anon`; sau đó `loadPublicTicketTiers` trừ số này. |
| 6-6 (P2) phần máy chủ | Client đã đọc `SoVeToiDaMoiDon`/`ThoiGianGiuChoPhut` nhưng RPC `tao_giu_cho_theo_suat` vẫn cứng 4 vé và 5 phút, nên client chặn ở mức tối đa 4 vé (`SERVER_MAX_TICKETS_PER_ORDER`). | Migration cập nhật RPC đọc `CAU_HINH_SU_KIEN`; sau đó bỏ trần 4 trong `src/domain/purchaseLimits.js`. |
