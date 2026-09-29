# EventTicketing

Frontend Sprint 1 hiện chạy bằng React 19, TypeScript và Vite. Giao diện concert
đã được đưa vào React root, chia theo ranh giới chức năng và giữ nguyên prototype
đã kiểm thử trong quá trình chuyển đổi.

## Chạy dự án

```bash
npm install
npm run dev
```

Kiểm tra kiểu dữ liệu và bản build production:

```bash
npm run lint
npm run build
```

## Cấu trúc hiện tại

- `src/App.tsx`: composition root của trang sự kiện.
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
