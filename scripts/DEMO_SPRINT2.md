# Kịch bản demo Sprint 2: OTP, giới hạn 4 vé, định giá động

Kịch bản có hai phần. **Phần 1** chạy ở chế độ mock (không cần Supabase) để quay video và chụp ảnh. **Phần 2** chạy trên Supabase cục bộ để chứng minh phía máy chủ. Mỗi bước ghi kết quả mong đợi; nếu thực tế khác, ghi lại là lỗi, đừng sửa kết quả cho khớp.

Giới hạn cần nói thẳng khi trình bày:
- OTP trong mock là mã cố định `123456`. Mã OTP thật chỉ kiểm chứng được khi gắn Supabase Auth thật.
- Giới hạn "3 lần gửi lại/giờ" và "khóa 15 phút sau 5 lần sai" chỉ là bộ đếm ở giao diện. Máy chủ chỉ cưỡng chế chờ 60 giây giữa hai lần gửi và hiệu lực 300 giây.
- Demand Simulator chỉ là dữ liệu mô phỏng, được gắn nhãn `[MÔ PHỎNG]`; không phải dữ liệu bán vé thật.

## Chuẩn bị (mock)

1. Trong `.env` đặt `VITE_USE_MOCK_DATA=true`, chạy `npm run dev`, mở địa chỉ Vite in ra.
2. DevTools > Application > Local Storage: xóa các khóa bắt đầu bằng `eventticketing` để bắt đầu sạch.
3. Tài khoản mock: email bất kỳ có `@` và mật khẩu từ 6 ký tự. `organizer@demo.vn` là BTC, `buyer@demo.vn` là người mua. Mã OTP mock: `123456`.

## Phần 1A. BTC: bật OTP, đặt giới hạn, dữ liệu demo định giá

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/organizer/login`, đăng nhập `organizer@demo.vn` | Vào trang Trung tâm Ban tổ chức |
| 2 | Bấm **[MÔ PHỎNG] Khởi tạo / khôi phục dữ liệu demo định giá** | Thông báo có nhãn mô phỏng; xuất hiện sự kiện demo định giá |
| 3 | Ở thẻ sự kiện bấm **Cấu hình mua vé**, bật OTP, giới hạn 4, lưu | Báo lưu thành công; ghi chú áp dụng cho lần chọn sau |
| 4 | Nhập giới hạn 0, 21, 2,5 hoặc để trống | Lỗi hiện cạnh trường, không lưu |
| 5 | Bấm **Cấu hình giá**, chọn suất và khu, đặt giá gốc/sàn/trần; thử sàn lớn hơn gốc | Lưu được khi hợp lệ; sàn > gốc báo lỗi theo từng trường |

## Phần 1B. Khán giả: OTP và giới hạn 4 vé

Mở **tab ẩn danh hoặc trình duyệt khác** cho khán giả để phiên BTC không lẫn vào.

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/events/demo-dinh-gia-mo-phong/shows/suat-demo` khi chưa đăng nhập | Phần chọn ghế không hiện; có cổng yêu cầu đăng nhập |
| 2 | Đăng nhập `buyer@demo.vn` (mật khẩu bất kỳ 6 ký tự trở lên) | Quay về đúng sự kiện và suất; hiện cổng OTP |
| 3 | Bấm gửi mã | Thấy hiệu lực 300 giây; nút gửi lại bị vô hiệu 60 giây |
| 4 | Nhập `000000` | Báo sai, nêu số lần còn lại |
| 5 | Nhập `123456` | Cổng mở, thấy sơ đồ chọn ghế |
| 6 | Chọn 4 ghế rồi thử chọn ghế thứ 5 | Bộ đếm `Đã chọn 4/4`; không chọn thêm được |
| 7 | Giữ chỗ 3 ghế, sau đó xin thêm 2 ghế | Thông báo nêu giới hạn 4, đang giữ 3, còn chọn thêm 1; tồn tại ít nhất 5 giây; lựa chọn được giữ |
| 8 | Hủy giữ chỗ | Số đếm giảm; chọn lại được |
| 9 | Ở BTC tắt OTP rồi tải lại trang khán giả | Vào thẳng bước chọn ghế, không có cổng OTP |

## Phần 1C. Demand Simulator và duyệt giá

| # | Thao tác (BTC) | Kết quả mong đợi |
|---|---|---|
| 1 | Mở **Cấu hình giá** của sự kiện demo, chọn kịch bản `ban_nhanh`, bấm **Chạy ngay** | Có đề xuất giá chờ duyệt theo hướng **tăng** |
| 2 | Mở **Đề xuất giá**, xem đề xuất | Hiện giá cũ, giá đề xuất, lý do |
| 3 | Khán giả đang giữ 2 ghế khu đó (từ 1B) | Ghế giữ có giá chốt tại thời điểm giữ |
| 4 | BTC bấm **Duyệt** | Giá hiện hành của khu đổi; khán giả thấy giá mới ở tab đang mở, không cần tải lại |
| 5 | Kiểm tra ghế đã giữ trước khi duyệt | **Giá chốt không đổi** |
| 6 | Chọn kịch bản `ban_cham`, **Chạy ngay** | Đề xuất mới đổi hướng (giảm), không vượt sàn |
| 7 | Thử duyệt với giá ngoài khung sàn/trần | Bị từ chối kèm lý do |
| 8 | Bấm **Từ chối** một đề xuất | Trạng thái đổi, giá không đổi |

**Quay video (AC-T4-02.4):** quay liên tục bước 1, 4, 6 để thấy đổi kịch bản làm đổi hướng đề xuất. Khi nói "giá đổi trong ít giây", chỉ nói đúng điều đã quan sát; **độ trễ ≤ 5 giây chưa đo bằng trình duyệt thật.**

Nếu tab khán giả không cập nhật, kiểm tra `localStorage` có bị chặn không; mock đồng bộ giữa các tab qua `localStorage` và thanh trạng thái sẽ nêu giới hạn đó.

## Phần 2. Máy chủ (Supabase cục bộ, cần Docker)

```
npm run db:start
npm run db:reset
npm run db:test
```
Mong đợi: `Result: PASS`, 14 file, 820 test (số liệu 22/11/2026). Gồm `sprint2_integration.sql` (OTP gate, giới hạn theo tài khoản và sự kiện, giá chốt `DonGiaChot`, duyệt đề xuất) và các file của W1–W4.

**Hai BTC duyệt cùng một đề xuất:**

```
eval "$(npx --yes supabase@3.2.0 status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/concurrency-approve.mjs
```
Mong đợi: `"pass": true`; một lời gọi thành công, lời gọi kia nhận mã `PT409` (HTTP 409, `DE_XUAT_DA_XU_LY`) trong vài giây; đề xuất `APPROVED`, giá khu bằng giá đề xuất, đúng một dòng `NHAT_KY_GIA`.
Lưu ý: yêu cầu CSDL đã áp migration `20261123090000_sprint2_pt409_va_khoa_gia_truc_tiep.sql`. Với CSDL chưa có migration này (mã lỗi cũ `40001`), PostgREST tự thử lại và người thua nhận lỗi quá thời gian sau 60 đến 130 giây, script báo `pass: false` dù dữ liệu vẫn đúng.
Script **không xóa** dữ liệu mà nó tạo, vì `NHAT_KY_GIA` là nhật ký bất biến. Danh sách còn lại được in ở `cleanup.leftovers`. Chạy `npm run db:reset` sau đó. Chỉ dùng khóa service_role cục bộ, không bao giờ dán vào file hoặc commit.

**Hai phiên cùng giữ vé vượt giới hạn:** `node scripts/concurrency-limit.mjs` với cùng hai biến môi trường. Mong đợi: một phiên thành công, phiên kia nhận `VUOT_GIOI_HAN_VE`, tổng vé không quá 4.

Dọn dẹp: `npm run db:stop`.

## Việc chưa kiểm chứng (không được báo là đạt)

- Mọi thao tác Phần 1 trên trình duyệt thật: bàn phím, màn hình 360 px, ảnh chụp.
- OTP thật qua Supabase hosted (mẫu email dùng `{{ .Token }}`, hiệu lực 300 giây, khoảng gửi lại 60 giây).
- Độ trễ giá ≤ 5 giây và Realtime trên Supabase hosted.
- Chưa áp migration Sprint 2 lên Supabase staging `qxkgkbayxxaakkwtepss`.
