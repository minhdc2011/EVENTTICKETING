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

## Phần 1B. Khán giả: giữ chỗ, OTP xác nhận thanh toán, giới hạn 4 vé và trả chỗ khi đăng xuất

Mở **tab ẩn danh hoặc trình duyệt khác** cho khán giả để phiên BTC không lẫn vào. Luồng: chọn ghế tự do, **bấm Giữ chỗ** (cần đăng nhập, đồng hồ 5 phút bắt đầu), **bấm Xác nhận thanh toán** (sự kiện bật OTP thì nhập OTP). "Thanh toán" là mô phỏng: chưa có cổng thanh toán, chưa phát hành vé.

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Mở trang một sự kiện có sơ đồ khi chưa đăng nhập, bấm một khu rồi chọn ghế | Chọn được ghế, không có cổng chặn, không có đồng hồ (chưa giữ chỗ) |
| 2 | Bấm **Giữ chỗ N vé** | Hộp thoại đăng nhập hiện lên, nền phía sau làm mờ, lựa chọn ghế được giữ nguyên |
| 3 | Đăng nhập `buyer@demo.vn` (mật khẩu bất kỳ 6 ký tự trở lên) | Hộp thoại đóng, hệ thống tự giữ chỗ; hiện "Đã giữ chỗ thành công" kèm đồng hồ 05:00, nút Xác nhận thanh toán và Hủy giữ chỗ. **Chưa hỏi OTP** |
| 4 | Bấm **Xác nhận thanh toán** | Sự kiện bật OTP: hộp thoại OTP hiện lên (nền làm mờ), nêu email nhận mã đã che; ghế vẫn đang được giữ (giữ chỗ được gia hạn một lần) |
| 5 | Bấm Gửi mã | Thấy hiệu lực 5:00 đếm ngược; nút gửi lại bị vô hiệu 60 giây |
| 6 | Nhập `000000` | Báo sai, nêu số lần còn lại, ở lại hộp thoại, ghế vẫn giữ |
| 7 | Nhập `123456` | Hộp thoại đóng, hiện **Thanh toán thành công (mô phỏng)**, đồng hồ tắt, lựa chọn bị xóa |
| 8 | Chọn đủ 4 ghế | Ghế còn trống hiện dấu cấm (vòng tròn viền đỏ gạch chéo), không chọn thêm được |
| 9 | Giữ chỗ 3 ghế, sau đó xin thêm 2 ghế | Thông báo nêu giới hạn 4, đang giữ 3, còn chọn thêm 1; tồn tại ít nhất 5 giây; lựa chọn được giữ |
| 10 | Đang giữ chỗ, bấm **Đăng xuất** | Chỗ được trả lại ngay, đồng hồ tắt, lựa chọn bị xóa, hiện thông báo đã trả chỗ |
| 11 | Ở BTC tắt OTP rồi giữ chỗ và bấm Xác nhận thanh toán bằng tài khoản đã đăng nhập | Không hiện hộp thoại OTP, thanh toán thành công ngay |

Ghi chú: mã OTP cố định `123456` chỉ có ở chế độ mô phỏng (hộp thoại OTP có dòng gợi ý mã). Trên môi trường thật, mã 6 số gửi qua email của tài khoản đang đăng nhập; tài khoản đăng nhập nhanh `buyer@demo.vn` không có hộp thư thật nên không qua được OTP của sự kiện bật OTP, dùng tài khoản có email thật cho buổi demo.

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
Mong đợi: `Result: PASS`, 16 file, 860 test (số liệu 24/11/2026, gồm `sprint2_xac_nhan_thanh_toan.sql`). Gồm `sprint2_integration.sql` (OTP gate, giới hạn theo tài khoản và sự kiện, giá chốt `DonGiaChot`, duyệt đề xuất) và các file của W1–W4.

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

- Thao tác bàn phím đầy đủ và cảm ứng trên điện thoại thật.
- Độ trễ giá ≤ 5 giây trên staging và thời gian vẽ lại màn hình (đã đo 522 ms cục bộ và 529 ms trên một project hosted riêng).
- Luồng giữ chỗ và thanh toán mới với nhiều tài khoản và email thật trên bản triển khai công khai (máy chủ và SMTP đã kiểm bằng API ở bước trước).
- pgTAP trực tiếp trên staging (tài khoản CLI thiếu quyền schema auth); đã bù bằng pgTAP trên bản sao đã nâng cấp và trên project hosted riêng.

Staging `qxkgkbayxxaakkwtepss` đã được nâng lên V2 ngày 23/11/2026 (27 migration); xem `docs/sprint2-supabase/NANG-CAP-STAGING-LEN-V2.md`.
