# Hợp đồng API EventTicketing

Frontend dùng `VITE_EVENT_ID` làm mã sự kiện công khai. Mọi REST response
thành công trả về dạng `{ "data": ... }`; phiên đăng nhập truyền bằng cookie
`HttpOnly`, vì frontend luôn gửi request với `credentials: include`.

## Danh sách phân khu

`GET /api/v1/events/:eventId/zones`

`data` là mảng phân khu có các trường: `KhuVucID`, `MaKhuVuc`, `TenKhuVuc`,
`LoaiKhuVuc`, `GiaVe`, `SucChua`, `MoBan`, `MauSac`, `MoTa`.

## Danh sách ghế

`GET /api/v1/events/:eventId/seats`

`data` là mảng ghế có các trường: `GheID`, `KhuVucID`, `MaGhe`, `HangGhe`,
`SoGhe`, `TrangThai`. Trạng thái hợp lệ: `TRONG`, `DANG_GIU`, `DA_BAN`,
`KHONG_MO_BAN`.

## Tạo lượt giữ chỗ

`POST /api/v1/holds`

```json
{
  "eventId": "SUPER_CONCERT_2026",
  "items": [
    {"ticketCode": "KDB-G-03", "zoneCode": "ZONE_B_T2"},
    {"ticketCode": "GA_STAND_1", "zoneCode": "GA_STAND_1", "quantity": 2}
  ]
}
```

Backend phải khóa ghế bằng transaction/unique lock, giới hạn tối đa 4 vé mỗi
lượt và trả HTTP `409` nếu ghế vừa được người khác giữ. Response:

```json
{
  "data": {
    "holdId": "uuid",
    "eventId": "SUPER_CONCERT_2026",
    "status": "ACTIVE",
    "expiresAt": "2026-10-01T03:05:00.000Z",
    "items": []
  }
}
```

Thời gian giữ do server quyết định, mặc định 300 giây. Frontend chỉ hiển thị
`expiresAt`, không tự coi đồng hồ trên trình duyệt là nguồn sự thật.

## Giải phóng lượt giữ

`DELETE /api/v1/holds/:holdId`

Trả `204 No Content`. Endpoint phải idempotent để người dùng có thể bấm xóa
hoặc đóng trang mà không gây lỗi nghiệp vụ.

## Cập nhật ghế thời gian thực

`WS /ws/events/:eventId/seats`

```json
{
  "type": "SEAT_STATUS_CHANGED",
  "eventId": "SUPER_CONCERT_2026",
  "seatId": 39,
  "seatCode": "KDB-G-03",
  "zoneCode": "ZONE_B_T2",
  "status": "DANG_GIU",
  "occurredAt": "2026-10-01T03:00:00.000Z"
}
```

Frontend tự kết nối lại theo exponential backoff khi WebSocket bị gián đoạn.

## Mã lỗi tối thiểu

- `400`: dữ liệu request không hợp lệ.
- `401`: chưa đăng nhập hoặc phiên hết hạn.
- `404`: không tìm thấy sự kiện, ghế hoặc lượt giữ.
- `409`: ghế không còn trống, giữ chỗ hết hạn hoặc xung đột đặt vé.
- `422`: vượt giới hạn vé hoặc vi phạm quy tắc nghiệp vụ.
