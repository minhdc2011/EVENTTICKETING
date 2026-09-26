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
- `src/types/ticketing.ts`: kiểu dữ liệu dùng chung với API/MySQL.
- `src/legacy/`: markup và runtime đã được kiểm chứng, tạm giữ để chuyển đổi dần
  mà không làm hỏng SVG camera zoom, countdown và logic chọn ghế.
- `prototype/index-static.html`: bản HTML trước khi chuyển sang React để đối chiếu.

## Lộ trình chuyển đổi tiếp theo

1. Thay từng fragment tĩnh bằng JSX và React state, bắt đầu từ Hero và Timeline.
2. Chuyển sơ đồ ghế sang hook/store riêng, chỉ render ghế của phân khu đang zoom.
3. Thay adapter JSON bằng REST API và WebSocket.
4. Tích hợp OTP, giới hạn bốn vé, khóa ghế 300 giây và thanh toán ở Sprint 2–3.
