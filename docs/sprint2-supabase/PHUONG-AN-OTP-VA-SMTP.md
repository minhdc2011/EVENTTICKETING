# Phương án cho OTP và email trên môi trường V2

Ngày 23/11/2026. Mục đích: giải quyết việc mã OTP không đến được người dùng trên Supabase gói Free, và đề xuất phương án thay thế nếu không cấu hình được email.

## 1. Vấn đề

Khi dùng email mặc định của Supabase (gói Free):
- Chỉ gửi được tới địa chỉ thuộc thành viên tổ chức; địa chỉ khác bị từ chối (`email_address_invalid`).
- Giới hạn số thư rất thấp mỗi giờ.
- **Không sửa được mẫu email** (lỗi nguyên văn: `Email template modification is not available for free tier projects using the default email provider`). Mẫu mặc định của "Magic Link" chỉ có liên kết, không có mã 6 số, nên người dùng có thể không thấy mã.

Mã và logic OTP đã được kiểm chứng (Auth cục bộ và hosted): gửi, hết hạn 300 giây, mã mới vô hiệu mã cũ, JWT có `amr=otp`, cổng giữ chỗ. Chỉ còn **kênh gửi thư**.

## 2. Phương án A (khuyến nghị): SMTP riêng, giữ nguyên yêu cầu OTP

Không đổi mã nguồn, không đổi tài liệu yêu cầu. Cấu hình SMTP riêng cho Supabase Auth, sau đó sửa được mẫu email để có `{{ .Token }}` và gửi được tới người dùng bất kỳ.

| Nhà cung cấp | Thiết lập | Ưu | Nhược |
|---|---|---|---|
| **Gmail** (khuyến nghị cho đồ án) | `smtp.gmail.com`, cổng 465, tài khoản Gmail bật xác minh 2 bước, tạo **Mật khẩu ứng dụng** | Miễn phí, gửi được tới mọi người nhận, 5 phút cấu hình | Dùng tài khoản Gmail cá nhân làm người gửi; giới hạn khoảng 500 thư/ngày |
| Brevo (Sendinblue) | SMTP relay, xác minh một địa chỉ người gửi | 300 thư/ngày miễn phí, không cần tên miền | Phải đăng ký tài khoản mới |
| Resend | SMTP `smtp.resend.com` | Giao diện tốt | Bản miễn phí chỉ gửi tới email của chính chủ nếu chưa xác minh tên miền |

Việc bạn làm (tôi không thể tạo hộ vì cần tài khoản và mật khẩu của bạn):
1. Gmail: bật xác minh 2 bước, vào Mật khẩu ứng dụng, tạo mật khẩu cho "EventTicketing" (16 ký tự).
2. Điền vào `Eventticketing/.env.staging.local` (file đã bị gitignore, không dán vào chat):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=<địa chỉ gmail>
   SMTP_PASS=<mật khẩu ứng dụng 16 ký tự>
   ```
3. Nhắn tôi "đã điền SMTP". Tôi sẽ: đẩy cấu hình SMTP và mẫu email magic link (có `{{ .Token }}`, nội dung ở `supabase/templates/magic_link.html`) lên Supabase staging, rồi gửi một OTP thật tới email bạn đưa và bạn dán mã cho tôi kiểm tra đủ vòng (gửi, nhập đúng, vào bước chọn ghế).

Mẫu cấu hình tôi sẽ đẩy (mật khẩu đọc từ biến môi trường, không ghi vào file):

```toml
[auth.email.smtp]
enabled = true
host = "env(SMTP_HOST)"
port = 465
user = "env(SMTP_USER)"
pass = "env(SMTP_PASS)"
admin_email = "env(SMTP_USER)"
sender_name = "EventTicketing"

[auth.email.template.magic_link]
subject = "Ma xac minh EventTicketing"
content_path = "./supabase/templates/magic_link.html"
```

Lưu ý: Supabase vẫn giới hạn mặc định 30 thư/giờ khi dùng SMTP riêng; đủ cho buổi demo và User Testing nhỏ, có thể tăng trong cài đặt.

## 3. Phương án thay thế nếu không cấu hình được email

Mỗi phương án nêu rõ phải sửa gì trong tài liệu gốc (FR-T2-01, AC-T2-01.x) và trong mã.

| Phương án | Cách hoạt động | Sửa tài liệu | Sửa mã | Công sức | Đánh giá |
|---|---|---|---|---|---|
| **B. OTP mô phỏng cho demo** (đã có) | Chế độ mô phỏng nhận mã cố định `123456`, không gửi thư | Ghi rõ "OTP qua email; môi trường demo dùng mã mô phỏng" và nêu giới hạn | Không | Không | Trung thực nếu nêu rõ; yêu cầu OTP vẫn được thiết kế và kiểm chứng, nhưng demo không có thư thật |
| **C. TOTP (ứng dụng xác thực)** | Người dùng quét QR bằng Google Authenticator một lần, sau đó nhập mã 6 số đổi mỗi 30 giây. Supabase hỗ trợ sẵn (MFA TOTP), miễn phí, không cần email | Đổi "OTP qua email" thành "OTP qua ứng dụng xác thực (TOTP)"; sửa AC-T2-01.4 và .5 (30 giây thay cho 300 và 60) | Có: màn hình đăng ký QR, màn hình nhập mã, `da_xac_minh_otp()` nhận `totp` và cấp độ phiên `aal2`, test, pgTAP | Khoảng 1 ngày | Mạnh và không phụ thuộc email, nhưng trải nghiệm nặng hơn và đổi nhiều thứ |
| **D. CAPTCHA** (hCaptcha hoặc Cloudflare Turnstile) | Chặn bot bằng thử thách "tôi không phải robot" khi đăng nhập hoặc trước khi giữ ghế. Supabase Auth hỗ trợ sẵn | Đổi "xác minh OTP" thành "xác minh người thật bằng CAPTCHA"; bỏ AC về hết hạn và gửi lại | Có: gắn token CAPTCHA vào đăng nhập, bỏ cổng OTP hoặc giữ song song | Khoảng nửa ngày | Chống bot tốt nhưng **không xác minh danh tính** như OTP; đổi bản chất yêu cầu |
| E. OTP qua SMS | Gửi mã tới điện thoại | Đổi kênh | Có | 1 đến 2 ngày | **Không khuyến nghị**: cần nhà cung cấp SMS có phí |

## 4. Khuyến nghị

1. Làm **A (Gmail SMTP)**: nhanh nhất, giữ nguyên toàn bộ yêu cầu, và chứng minh được OTP thật bằng một lá thư thật.
2. Nếu không thể dùng tài khoản email của nhóm: dùng **B** cho buổi demo và ghi rõ giới hạn trong báo cáo (mục 6.5, GH-06).
3. Chỉ chọn **C** nếu giảng viên yêu cầu OTP phải chạy thật mà không có email; chọn **D** chỉ khi chấp nhận đổi bản chất yêu cầu từ "định danh" sang "chống bot".

Nếu đổi yêu cầu (C hoặc D), tôi sẽ viết lại các mục FR-T2-01, AC-T2-01.x, Use Case và Sequence tương ứng trong nội dung viết tiếp báo cáo.
