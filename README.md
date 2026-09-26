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
- `src/services/apiClient.ts`: HTTP client dùng chung, cookie session và lỗi API.
- `src/services/bookingService.ts`: hợp đồng tạo/giải phóng lượt giữ ghế 300 giây.
- `src/services/seatRealtimeService.ts`: kênh WebSocket nhận thay đổi trạng thái ghế.
- `src/types/ticketing.ts`: kiểu dữ liệu dùng chung với API/MySQL.
- `docs/api-contract.md`: request/response và quy tắc khóa ghế cho backend.
- `src/legacy/`: markup và runtime đã được kiểm chứng, tạm giữ để chuyển đổi dần
  mà không làm hỏng SVG camera zoom, countdown và logic chọn ghế.
- `prototype/index-static.html`: bản HTML trước khi chuyển sang React để đối chiếu.

## Lộ trình chuyển đổi tiếp theo

1. Thay từng fragment tĩnh bằng JSX và React state, bắt đầu từ Hero và Timeline.
2. Chuyển sơ đồ ghế sang hook/store riêng, chỉ render ghế của phân khu đang zoom.
3. Thay adapter JSON bằng REST API và WebSocket.
4. Tích hợp OTP, giới hạn bốn vé, khóa ghế 300 giây và thanh toán ở Sprint 2–3.

## Hợp đồng API frontend đang chờ backend

- `GET /api/v1/events/:eventId/zones`
- `GET /api/v1/events/:eventId/seats`
- `POST /api/v1/holds`
- `DELETE /api/v1/holds/:holdId`
- `WS /ws/events/:eventId/seats`

Các REST response trả về dạng `{ "data": ... }`. WebSocket gửi sự kiện
`SEAT_STATUS_CHANGED` với `seatCode`, `zoneCode`, `status` và `occurredAt`.
Sao chép `.env.example` thành `.env.local`, giữ mock data trong lúc chưa có
backend; đổi `VITE_USE_MOCK_DATA=false` khi API và WebSocket đã hoạt động.
Nếu frontend và backend cùng domain, có thể để trống hai URL; frontend sẽ dùng
REST và WebSocket cùng origin. Chi tiết payload nằm trong `docs/api-contract.md`.
