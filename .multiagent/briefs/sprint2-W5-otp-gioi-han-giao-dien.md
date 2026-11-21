# Đợt W5 Sprint 2: OTP và giới hạn 4 vé, phần giao diện (ban B)

Chạy bằng `agentkit team`. **Đọc trước:** `.multiagent/briefs/sprint2-spec.md` (mục 3, 4, 7, 8).

**Mục tiêu:** khán giả xác minh OTP và thấy bộ đếm vé; BTC cấu hình hai tham số. Mọi màn hình chạy được ở chế độ mock (`VITE_USE_MOCK_DATA=true`).
**WBS:** 2.5, 3.4, 3.5 (phần giao diện). **Điều kiện đầu vào:** W4 đã merge (có `otpService.ts`, `da_xac_minh_otp`, `luu_cau_hinh_mua_ve`, lỗi `VUOT_GIOI_HAN_VE`).

## Gợi ý chia task

| Task | Ban | Chế độ | Sau | Việc | Tiêu chí |
|---|---|---|---|---|---|
| T1 | B | pair | | Màn hình nhập OTP và cổng chặn trước bước chọn ghế | Sự kiện có `YeuCauXacMinhOTP` mà chưa xác minh thì không vào bước chọn ghế; sự kiện không yêu cầu thì bỏ qua; có đếm ngược hiệu lực mã, nút gửi lại bị vô hiệu đến hết 60 giây (hiển thị thời gian chờ còn lại); báo lỗi nêu số lần còn lại, **không** chỉ dựa vào màu; tab được và dùng bàn phím; `aria-label` và `aria-live` cho thông báo; không bao giờ hiển thị hay ghi log mã OTP; nhánh mock dùng mã cố định; dùng `otpService`; logic trạng thái tách thuần và có test node |
| T2 | B | solo | | Bộ đếm `đã chọn x/4` và thông báo vượt giới hạn | Hiển thị `x/giới hạn` theo cấu hình sự kiện (mặc định 4); khi nhận lỗi `VUOT_GIOI_HAN_VE` hiện thông báo nêu giới hạn và số vé còn được chọn, tồn tại tối thiểu 5 giây; hiển thị đúng ở 360 pixel; không phá hành vi chọn tối đa 4 ghế mỗi lần của Sprint 1 (test cũ vẫn đạt) |
| T3 | B | solo | | Màn hình BTC cấu hình `SoVeToiDaMoiDon` và `YeuCauXacMinhOTP` theo sự kiện | Gọi `luu_cau_hinh_mua_ve`; kiểm tra giá trị hợp lệ trước khi gọi, lỗi hiển thị theo trường; chỉ `CHU_SO_HUU`/`QUAN_TRI` thấy và dùng; mock chạy được; logic kiểm tra tách thuần có test node |
| T4 | A | solo | T1–T3 | Ghi chú `.multiagent/notes/sprint2-W5-ghi-chu.md` theo spec mục 7 | Có bảng AC (AC-T2-01.1, .2, .5, .8, .9 phần giao diện; AC-T2-02.1, .3, .6 phần giao diện), **cách mở từng màn hình ở chế độ mock** (đường dẫn, tài khoản mock, mã OTP mock, thao tác từng bước) để người dùng tự chụp ảnh, tài liệu cần cập nhật |

## Ngoài phạm vi

Sửa migration hay RPC (đợt W4 đã làm), thanh toán, CAPTCHA, SMS.

## Nghiệm thu đợt (người làm sau khi merge)

`npm run check`; chạy `npm run dev` ở chế độ mock, thử luồng đăng nhập, OTP, chọn ghế, chạm giới hạn 4 vé; kiểm tra bàn phím và màn hình 360 pixel; chụp ảnh các màn hình mới.
