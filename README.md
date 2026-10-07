# EventTicketing

Ứng dụng React 19, TypeScript và Vite gồm ba trải nghiệm dùng chung một miền dữ liệu:

- marketplace công khai tại `/` và `/events`;
- mẫu sự kiện chung tại `/events/:eventSlug`;
- giao diện riêng của Super Concert qua `TemplateKey=SUPER_CONCERT_2026`;
- Organizer Studio tại `/organizer`.

## Chạy dự án

```bash
npm install
npm run dev
```

Kiểm tra kiểu dữ liệu và bản build production:

```bash
npm run lint
npm run build
npm run test:uat
npm run check
```

## Cấu trúc hiện tại

- `src/App.tsx`: composition root của trang sự kiện.
- `src/components/EventCatalog.tsx`: marketplace, tìm kiếm và lọc thể loại.
- `src/components/GenericEventPage.tsx`: mẫu mặc định cho sự kiện mới.
- `src/components/OrganizerPortal.tsx`: đăng nhập, workspace, tạo draft và công bố.
- `src/services/organizerService.ts`: ranh giới Supabase Auth và RPC phía BTC.
- `src/components/ConcertSections.tsx`: các component cấp khu vực.
- `src/services/ticketDataService.ts`: ranh giới tải dữ liệu khu vực và ghế.
- `src/services/supabaseClient.ts`: Supabase browser client có kiểu dữ liệu.
- `src/services/apiClient.ts`: HTTP client dùng chung, cookie session và lỗi API.
- `src/services/bookingService.ts`: hợp đồng tạo/giải phóng lượt giữ ghế 300 giây.
- `src/services/seatRealtimeService.ts`: kênh WebSocket nhận thay đổi trạng thái ghế.
- `src/types/ticketing.ts`: kiểu dữ liệu dùng chung với API/PostgreSQL.
- `docs/api-contract.md`: request/response và quy tắc khóa ghế cho backend.
- `src/legacy/`: markup và runtime đã được kiểm chứng, tạm giữ để chuyển đổi dần
  mà không làm hỏng SVG camera zoom, countdown và logic chọn ghế.
- `prototype/index-static.html`: bản HTML trước khi chuyển sang React để đối chiếu.

## Product Foundation sau Sprint 1

Migration `20261005090000_product_foundation.sql` mở rộng theo hướng additive,
không mở lại hay làm mất trạng thái `VERIFIED` của Sprint 1:

- `SU_KIEN` có slug công khai và thuộc một `TO_CHUC`.
- `SU_KIEN 1:N SUAT_DIEN`; lịch diễn, cửa sổ bán và trạng thái tồn kho nằm ở từng suất.
- `KHU_VUC` và `GIU_CHO` được gắn với `SuatDienID`; RPC mới
  `tao_giu_cho_theo_suat` khóa tồn kho theo đúng suất diễn.
- `HO_SO_NGUOI_DUNG`, `THANH_VIEN_TO_CHUC`, địa điểm và phiên bản sơ đồ là nền
  cho Supabase Auth, phân quyền Ban tổ chức và tái sử dụng mặt bằng.
- RLS chỉ công khai sự kiện đã xuất bản; thành viên chỉ quản lý dữ liệu tổ chức của mình.
- RPC `tao_giu_cho` cũ được giữ như adapter trong một chu kỳ chuyển đổi.

Các tuyến frontend không cần React Router:

- `/` và `/events`: danh mục sự kiện đã công bố.
- `/events/:eventSlug`: chi tiết sự kiện và suất đầu tiên.
- `/events/:eventSlug/shows/:showSlug`: chi tiết một suất diễn cụ thể.
- `/organizer/login`: Supabase Auth cho Ban tổ chức.
- `/organizer`: workspace theo organization.

Ứng dụng đọc được cả clean path ở máy chủ có SPA rewrite, hash route cũ và query
route. Liên kết được sinh dạng `/?route=/events/...` để refresh vẫn hoạt động trên
GitHub Pages mà không cần cấu hình rewrite.

Migration `20261005150000_marketplace_organizer_mvp.sql` bổ sung `TemplateKey`,
thể loại marketplace và ba RPC có kiểm tra quyền: tạo tổ chức, tạo nhanh bản nháp
sự kiện + suất diễn + hạng vé, và công bố sau khi validation. Sau khi chạy migration
trên staging, chạy lần lượt
`supabase/tests/sprint1_hardening.sql` và
`supabase/tests/product_foundation.sql`, `supabase/tests/marketplace_organizer_mvp.sql`.
Không chạy migration Product Foundation
riêng lẻ trước bốn migration Sprint 1.

## Lộ trình chuyển đổi tiếp theo

1. Thay từng fragment tĩnh bằng JSX và React state, bắt đầu từ Hero và Timeline.
2. Chuyển sơ đồ ghế sang hook/store riêng, chỉ render ghế của phân khu đang zoom.
3. Tích hợp Supabase Auth/OTP và phân quyền người dùng.
4. Chuyển lượt giữ chỗ thành đơn hàng và tích hợp thanh toán ở Sprint 2–3.

## Trạng thái nghiệm thu Sprint 1

Vòng hardening ngày 29/09/2026 đã bổ sung:

- Trạng thái `Sắp mở bán`, `Đang mở bán`, `Hết vé`, `Đã đóng bán` tính từ thời gian server và trạng thái database.
- Chế độ chỉ xem trước giờ mở bán; camera zoom và tooltip vẫn hoạt động nhưng không thể chọn/giữ vé.
- Trang 404 cho sự kiện không tồn tại hoặc chưa công bố.
- Loading, lỗi cục bộ và nút tải lại riêng cho sơ đồ; không âm thầm dùng dữ liệu mẫu khi nguồn thật lỗi.
- Chỉ báo Supabase Realtime, reconnect và tải lại snapshot khi kết nối phục hồi.
- RLS publication policy tại migration `20260929090000_sprint1_publication_policy.sql`.
- Unit test cho sale-state và kiểm tra production build.

Chạy toàn bộ kiểm tra cục bộ bằng `npm run check`. Kết quả kiểm tra và các giới hạn NFR được ghi trong `docs/SPRINT1_CLOSURE.md`.

## Kết nối Supabase

1. Chạy các migration trong `supabase/migrations` trên Supabase project.
2. Sao chép `.env.example` thành `.env.local`.
3. Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` từ **Project Settings → API**.
4. Đổi `VITE_USE_MOCK_DATA=false`, sau đó khởi động lại Vite.

Chỉ dùng `anon`/publishable key trong frontend. Tuyệt đối không đưa
`service_role` key vào file bắt đầu bằng `VITE_`. RLS chỉ cho phép đọc
dữ liệu công khai; việc khóa và nhả ghế đi qua hai RPC `tao_giu_cho` và
`huy_giu_cho` để được xử lý trong transaction phía PostgreSQL.

Sau hai migration hardening ngày 29/09/2026, chạy
`supabase/tests/sprint1_hardening.sql` trên staging rồi dùng
`npm run verify:staging` để xác minh public contract bằng anon key. Trạng thái
nghiệm thu và bằng chứng nằm tại `docs/SPRINT1_VERIFICATION_REPORT.md`.

Sau hai migration Product Foundation ngày 05/10/2026, dùng
`npm run verify:foundation` để xác minh slug/template/show backfill và biên
anonymous của Organizer RPC. Bằng chứng staging ngày 06/10/2026 nằm tại
`docs/MARKETPLACE_ORGANIZER_MVP_2026-10-05.md`.

Kịch bản UAT xác thực dành cho Ban tổ chức nằm tại
`docs/ORGANIZER_AUTHENTICATED_UAT_RUNBOOK.md`. Bộ test `npm run test:uat` kiểm tra
validation, cô lập dữ liệu nhiều tổ chức, quyền ghi theo từng tổ chức và việc
khôi phục tổ chức đang chọn sau khi tải lại trang. Việc nghiệm thu giao diện Auth
trên staging vẫn cần hai hộp thư kiểm thử thật mà nhóm có quyền truy cập.

Chạy `npm run verify:auth-config` để kiểm tra cấu hình Supabase Auth công khai
trước buổi UAT. Staging hiện yêu cầu xác nhận email, vì vậy có thể dùng hai địa
chỉ plus-alias từ cùng một hộp thư thật, nhưng không thể dùng địa chỉ giả không
nhận được thư xác nhận.

## REST API dự phòng

- `GET /api/v1/events/:eventId/zones`
- `GET /api/v1/events/:eventId/seats`
- `POST /api/v1/holds`
- `DELETE /api/v1/holds/:holdId`
- `WS /ws/events/:eventId/seats`

Khi không cấu hình Supabase, frontend vẫn có thể dùng backend REST/WebSocket
theo hợp đồng trên. Các REST response trả về dạng `{ "data": ... }`. WebSocket gửi sự kiện
`SEAT_STATUS_CHANGED` với `seatCode`, `zoneCode`, `status` và `occurredAt`.
Sao chép `.env.example` thành `.env.local`, giữ mock data trong lúc chưa có
backend; đổi `VITE_USE_MOCK_DATA=false` khi API và WebSocket đã hoạt động.
Nếu frontend và backend cùng domain, có thể để trống hai URL; frontend sẽ dùng
REST và WebSocket cùng origin. Chi tiết payload nằm trong `docs/api-contract.md`.
