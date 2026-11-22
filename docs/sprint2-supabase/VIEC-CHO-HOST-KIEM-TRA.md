# Việc cần host (người có quyền quản trị Supabase và GitHub) kiểm tra

Ghi ngày 22/11/2026. Mỗi mục nêu: việc cần làm, vì sao, cách kiểm. Chi tiết kỹ thuật ở `P1-kiem-tra-truoc-staging.md` và `P2-P5-kiem-chung-supabase-cuc-bo.md`.

## 0. Lỗi đang thấy: "Chưa thể mở phần chọn vé"

**Triệu chứng:** trang sự kiện hiện khung "Chọn ghế / vé: Chưa thể mở phần chọn vé. Lỗi: Không đọc được cấu hình mua vé nên phần chọn vé tạm thời chưa mở", chỉ có nút "Thử lại".

**Nguyên nhân (đã kiểm chứng bằng một yêu cầu chỉ đọc):** giao diện Sprint 2 đọc cột `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP`. Staging (`qxkgkbayxxaakkwtepss`) chưa có migration Sprint 2 nên cột này không tồn tại:

```
GET /rest/v1/CAU_HINH_SU_KIEN?select=YeuCauXacMinhOTP  ->  400  42703  column CAU_HINH_SU_KIEN.YeuCauXacMinhOTP does not exist
GET /rest/v1/CAU_HINH_SU_KIEN?select=SoVeToiDaMoiDon,ThoiGianGiuChoPhut  ->  200
```

Cổng chọn vé được thiết kế **đóng khi không đọc được cấu hình** (không bao giờ mở nhầm khi lỗi), nên **mọi sự kiện** trên môi trường này không chọn được ghế/vé.

**Phạm vi ảnh hưởng cần host kiểm:**
- `.env.local` và `.env.production` đều có `VITE_USE_MOCK_DATA=false` trỏ vào staging.
- `.github/workflows/deploy.yml` tự triển khai nhánh `main` lên GitHub Pages với cùng cấu hình (staging, mock tắt). Các PR Sprint 2 (W5 #61, W6 #62) đã merge vào `main`.
- **Việc:** mở tab Actions của repo, xem workflow `deploy` sau hai lần merge đó có chạy và thành công không, rồi mở trang công khai `…/EVENTTICKETING/` thử chọn vé một sự kiện. Nếu cùng lỗi như trên, **trang demo công khai đang không chọn được vé** (không do lỗi mã, do DB chưa nâng cấp).

**Cách xử lý (host chọn, tôi đề xuất theo thứ tự):**
1. Đúng nhất: đưa staging lên đủ migration (mục 1). Khi đó lỗi tự hết.
2. Tạm thời để demo không gãy: sửa `deploy.yml` đặt `VITE_USE_MOCK_DATA: 'true'` cho tới khi staging được nâng cấp (mất kết nối CSDL thật trên trang công khai), hoặc hoàn tác merge W5/W6 trên `main`.
3. Chỉ để chạy thử trên máy: đặt `VITE_USE_MOCK_DATA=true` trong `.env.local` (đã kiểm: chế độ mock không bao giờ báo lỗi này).
4. (Cần quyết định sản phẩm, tôi chưa làm) cho phép cổng coi "DB chưa có cột OTP" như "OTP tắt". Đánh đổi: bỏ tính "đóng khi lỗi" riêng cho trường hợp thiếu cột; hợp lý vì DB cũ cũng không ép OTP ở phía máy chủ.

## 1. Đưa staging lên đủ migration (cần quyền quản trị)

Kết luận của báo cáo P1: **NO-GO** cho đến khi xử lý hai điều.
- Staging không có `supabase_migrations.schema_migrations` (25/25 migration chỉ ở máy local). Không chạy `supabase db push` thẳng, vì CLI có thể áp lại cả chuỗi lên schema đã tồn tại. Không dùng `migration repair` nếu chưa xác minh từng migration đã áp vật lý.
- Staging chưa có migration `20261111090000_server_side_seat_generation.sql`, nên `anon` và `authenticated` đang có quyền INSERT/UPDATE/DELETE trực tiếp bảng ghế `GHE` (**lỗ hổng đang tồn tại trên staging**, ai có khóa anon đều ghi được ghế).

Đề xuất: dựng một project Supabase mới sạch bằng `supabase db push` toàn chuỗi (kiểm được trên project mới, có lịch sử migration), rồi trỏ giao diện demo V2 vào đó; staging cũ giữ cho Sprint 1 hoặc áp riêng `20261111090000` sau khi duyệt. Việc tạo project cần quyền của host (tài khoản hiện tại bị từ chối: `Your account does not have the necessary privileges to access this endpoint`).

Sao lưu staging đã có ở `D:\backup-supabase\staging-20261122-230249\` (ngoài repo, không commit).

## 2. OTP thật trên môi trường hosted

Đã kiểm bằng Auth cục bộ (cùng GoTrue v2.198.0). Cần xác nhận trên hosted:
- [ ] Mẫu email "Magic Link" có `{{ .Token }}` (người dùng thấy mã 6 số).
- [ ] `Email OTP Expiration` = 300 giây; khoảng gửi lại tối thiểu = 60 giây.
- [ ] SMTP: SMTP mặc định của Supabase chỉ gửi rất ít email mỗi giờ và chỉ tới thành viên nhóm. Cần SMTP riêng nếu thử với người dùng thật.
- [ ] Gửi một OTP tới hộp thư thật, nhập mã, rồi giữ chỗ một sự kiện bật OTP: phải thành công; trước khi nhập mã phải bị từ chối.
- Nhắc lại: "3 lần gửi lại/giờ" và "khóa 15 phút sau 5 lần sai" chỉ là bộ đếm giao diện (Auth không khóa, đã kiểm: sai 6 lần vẫn dùng được mã đúng).

## 3. Phản hồi của người thua cuộc đua duyệt giá (PostgREST)

Cục bộ (PostgREST v14.5) khi hai BTC cùng duyệt một đề xuất, người thua nhận 504 sau 60 giây vì PostgREST tự thử lại khi gặp `SQLSTATE 40001`. Cần biết bản PostgREST hosted có cùng hành vi không.
- [ ] Host chạy một truy vấn thử trên project sandbox: tạo hàm tạm ném `40001`, gọi qua REST, xem có 504 sau 60 giây không (hoặc xin tôi script). Xóa hàm sau khi thử.
- Quyết định đi kèm: đổi `40001` thành `PT409` trong `duyet_de_xuat_gia`/`tu_choi_de_xuat_gia` (đã thử cục bộ: HTTP 409 sau 119 ms).

## 4. Việc đo trên hosted chưa làm

- [ ] Độ trễ duyệt giá → khán giả thấy giá mới (mục tiêu ≤ 5 giây): cục bộ trung vị 0,52 giây, lớn nhất 0,53 giây; hosted chưa đo.
- [ ] `supabase test db --linked` (pgTAP trên hosted) và Advisors trên dashboard.
- [ ] Realtime của `KHU_VUC` bật trên project hosted.

## 5. Ba quyết định cần host/nhóm

| # | Quyết định | Gợi ý |
|---|---|---|
| A | Đổi `40001` → `PT409` ở RPC duyệt/từ chối giá | Nên làm (migration mới + cập nhật pgTAP, dịch vụ, tài liệu) |
| B | Chặn đổi trực tiếp `KHU_VUC.GiaVeNiemYet` khi khu có quy tắc giá kích hoạt (hiện BIEN_TAP và CHU_SO_HUU đổi được qua REST, vòng qua PriceGuard và nhật ký) | Nên làm; hoặc ghi rõ là giới hạn đã biết |
| C | Staging cũ: giữ cho Sprint 1, hay thay bằng project mới đủ migration | Đề xuất thay bằng project mới cho V2 |
