# Thay đổi luồng: OTP ở bước Thanh toán (23/11/2026)

## Luồng mới

1. Ai cũng xem và chọn ghế/vé đứng tự do, không cần đăng nhập. Không có thanh nhắc, không có cổng OTP chặn.
2. Bấm **Thanh toán N vé**:
   - chưa đăng nhập: hộp thoại đăng nhập làm mờ nền; đăng nhập xong tự tiếp tục, lựa chọn ghế được giữ nguyên;
   - đã đăng nhập, sự kiện bật OTP, chưa xác minh trong 24 giờ: hộp thoại OTP làm mờ nền; mã 6 số gửi về **email của tài khoản đang đăng nhập** (hiển thị đã che, ví dụ `b****@demo.vn`).
3. Nhập đúng mã: hệ thống tự tiếp tục, giữ chỗ trên máy chủ rồi hiện **Xác nhận thanh toán thành công** kèm đồng hồ 5 phút.
4. Nhập sai: ở lại hộp thoại, giữ nguyên lựa chọn (giới hạn gửi lại và nhập sai như cũ).

## Máy chủ vẫn là nơi cưỡng chế

`tao_giu_cho_theo_suat` từ chối khi chưa đăng nhập (401, 42501 permission denied) hoặc khi sự kiện bật OTP mà phiên chưa có `amr=otp` trong 24 giờ (42501, "Can xac minh OTP de giu cho"). Giao diện chỉ phiên dịch hai lỗi này thành hộp thoại đăng nhập hoặc OTP. Không đổi migration nào.

## Giới hạn trung thực

- "Thanh toán" là **mô phỏng**: chưa có cổng thanh toán và chưa phát hành vé. Máy chủ chỉ giữ chỗ 5 phút; hộp thoại xác nhận nói rõ điều này.
- Trước khi bấm Thanh toán ghế **chưa được giữ**; người khác vẫn có thể chọn ghế bạn đang xem. Sau khi đăng nhập hoặc OTP, nếu ghế đã bị lấy thì thao tác báo lỗi xung đột và ghế đó bị bỏ khỏi lựa chọn.
- Đồng hồ 5 phút chỉ chạy sau khi giữ chỗ thành công (trước đây Super Concert chạy đồng hồ ngay khi chọn ghế, dễ gây hiểu nhầm).

## Ảnh hưởng tới tài liệu yêu cầu và thiết kế

| Mục | Trước | Nay |
|---|---|---|
| FR-T2-01 | OTP trước khi vào bước chọn ghế | OTP khi bấm Thanh toán (trước khi giữ chỗ) |
| AC-T2-01 "chưa xác minh thì không mount phần chọn vé" | có | **bỏ**; thay bằng "chưa xác minh thì không giữ chỗ/thanh toán được" |
| Sequence `SD_OTP_VaoBuocChonGhe` | cổng chặn trước sơ đồ | đổi thành: chọn ghế → Thanh toán → (đăng nhập) → OTP → giữ chỗ → xác nhận |
| Use Case "Xác minh OTP" | include của "Chọn ghế" | include của "Thanh toán" |

## Kiểm thử

- `scripts/nfr/checkout-flow.mjs` (sơ đồ BTC) và `scripts/nfr/checkout-flow-super-concert.mjs` (Super Concert), Chrome thật, chế độ mock: tất cả bước đạt.
- `tests/sprint2-integration.test.mjs` (T1 và xuyên suốt) đã đổi theo luồng mới.
- Chưa kiểm trên staging thật với email thật cho luồng mới; máy chủ và SMTP đã kiểm ở bước trước (`PHUONG-AN-OTP-VA-SMTP.md`, mục 5).
