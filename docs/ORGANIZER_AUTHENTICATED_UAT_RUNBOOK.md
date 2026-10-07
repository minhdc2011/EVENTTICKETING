# Runbook: Kiểm thử chấp nhận xác thực Ban tổ chức (Organizer Authenticated UAT)

Tài liệu này hướng dẫn chi tiết quy trình chạy UAT (User Acceptance Testing) luồng xác thực và quản lý sự kiện của Ban tổ chức trên môi trường Supabase Staging (`qxkgkbayxxaakkwtepss`).

> [!NOTE]
> **Trạng thái thực thi nghiệm thu (06/10/2026)**:
> - **Tổng thể**: `CORE ORGANIZER FLOW VERIFIED` (Kịch bản 1: **PASS**; Kịch bản 2: **TẠO BẢN NHÁP PASS / CÁCH LY ẨN DANH TRÌNH DUYỆT PENDING / NOT EXECUTED**; Kịch bản 3: **PASS**; Kịch bản 4: **PENDING CONFIRMATION**).
> - **Phạm vi đã nghiệm thu (PASS)**:
>   - Kịch bản 1: Đăng ký tài khoản Alpha Owner qua email thật, xác nhận email, đăng nhập Studio, Onboarding tạo tổ chức `UAT Alpha Media` (`uat-alpha-media`) thành công qua RPC `tao_to_chuc_cua_toi`.
>   - Kịch bản 2 (Tạo bản nháp): Tạo bản nháp `UAT Acoustic Night 2026` (`uat-acoustic-night-2026`) thành công kèm 1 suất diễn và hạng vé tiêu chuẩn (sức chứa 500, giá 250.000 ₫), thẻ sự kiện chuyển sang trạng thái Bản nháp trong Studio.
>   - Kịch bản 3: Công bố sự kiện thành công; thẻ Studio hiển thị liên kết chính xác `/?route=/events/uat-acoustic-night-2026` (đã khắc phục triệt để lỗi nhân đôi slug); điều hướng SPA sang Generic Event Page hiển thị đầy đủ thông tin, địa điểm, 1 suất diễn, sức chứa 500/500 và hạng vé 250.000 ₫; Marketplace hiển thị cả 2 sự kiện với đường dẫn chuẩn; Super Concert tương thích ngược hoàn toàn.
> - **Phạm vi đang chờ / Chưa ghi nhận trực tiếp (PENDING / NOT EXECUTED / NOT CAPTURED)**:
>   - Kịch bản 2 (Kiểm tra ẩn danh trên trình duyệt - Bước 4): **PENDING / NOT EXECUTED** — chưa mở cửa sổ ẩn danh để kiểm tra URL bản nháp trước khi bấm công bố (không suy diễn PASS từ kết quả công bố sau đó; cách ly bản nháp ở tầng cơ sở dữ liệu / RLS được ghi nhận riêng qua test pgTAP `product_foundation.sql`).
>   - Kịch bản 4: Danh tính Tài khoản 2 (Beta) đã được tạo trong GoTrue nhưng chưa hoàn tất xác nhận email trong hộp thư thực tế. Do đó, việc kiểm thử trực quan trên trình duyệt cho luồng chuyển đổi tổ chức đa vai trò và vô hiệu hóa nút ghi đối với vai trò `SOAT_VE` đang tạm hoãn chờ xác nhận email. (Lưu ý: kiểm thử bảo mật RLS và multi-tenant tầng cơ sở dữ liệu đã đạt 23/23 test pgTAP trong `supabase/tests/marketplace_organizer_mvp.sql`).
>   - Bằng chứng 7 (F12 Network tab RPC 200/204): **NOT CAPTURED / PENDING** — chưa ghi lại ảnh chụp trực tiếp tab Network trong DevTools; các chuyển đổi trạng thái giao diện thành công và dữ liệu công bố hiển thị trên Marketplace đóng vai trò bằng chứng gián tiếp.

---

## 1. Mục đích và phạm vi

1. **Xác thực toàn trình (End-to-End Auth)**: Đăng ký tài khoản, đăng nhập, duy trì phiên, làm mới phiên (refresh token), và đăng xuất.
2. **Khởi tạo tổ chức (Onboarding)**: Tài khoản mới chưa có tổ chức có thể tạo tổ chức đầu tiên và truy cập ngay không gian làm việc mà không cần tải lại trang.
3. **Cách ly dữ liệu bản nháp (Draft Isolation)**: Đảm bảo người dùng ẩn danh (public / unauthenticated) không thể thấy hoặc truy cập bản nháp sự kiện dưới mọi hình thức (API lẫn UI).
4. **Công bố sự kiện (Publish Transition)**: Xác nhận sự kiện sau khi công bố chuyển đổi trạng thái nguyên tử, xuất hiện trên Marketplace và trang chi tiết generic template.
5. **Cách ly đa tổ chức & Phân quyền vai trò (Multi-tenant & Role Boundaries)**: Xác nhận các thành viên thuộc tổ chức khác nhau không thể can thiệp dữ liệu của nhau; các vai trò chỉ xem (`SOAT_VE`, `VAN_HANH`) bị vô hiệu hóa toàn bộ hành động ghi.

---

## 2. Tài khoản thử nghiệm dùng một lần (Disposable Staging Accounts)

> [!CAUTION]
> Tuyệt đối không ghi mật khẩu thật, Service Role Key, Anon Key hoặc địa chỉ email cá nhân vào mã nguồn và tài liệu repository.
>
> **Kết quả kiểm tra thực tế cấu hình Staging Auth (`qxkgkbayxxaakkwtepss`)**:
> - Endpoint cấu hình Auth công khai (`GET /auth/v1/settings`) xác nhận: **`mailer_autoconfirm: false`** (Kích hoạt email là **BẮT BUỘC** - Confirm email: ON).
> - Do đó, **email giả không nhận được thư (như `@example.org`, `@example.com`, hoặc miền không có hộp thư thật) HOÀN TOÀN KHÔNG THỂ HOÀN TẤT ĐĂNG NHẬP**. Khi cố đăng nhập, Supabase sẽ từ chối với lỗi `Email not confirmed`.
> - **Không bắt buộc phải có 2 hộp thư vật lý riêng biệt**: Người kiểm thử chỉ cần **01 hộp thư thực tế** có hỗ trợ kỹ thuật bí danh RFC 5233 (plus-addressing: Gmail, Google Workspace, Outlook, ProtonMail, Fastmail...). Cả hai địa chỉ `+alpha-owner` và `+beta-scanner` sẽ nhận mail tại cùng một hộp thư.
> - **Cấu hình mật khẩu**: GoTrue yêu cầu tối thiểu 6 ký tự (`minimum_password_length: 6`). Người kiểm thử đặt mật khẩu thử nghiệm tạm thời (khuyến nghị >= 8 ký tự, gồm chữ và số, ví dụ qua biến môi trường untracked `UAT_ORGANIZER_PASSWORD`), tuyệt đối không commit mật khẩu vào git.

- **Tài khoản 1 (Chủ sở hữu Tổ chức Alpha)**:
  - Email đề xuất: `tester+alpha-owner@<your-inbox-domain>` (hoặc `uat-org+alpha-<run>@<your-inbox-domain>`)
  - Vai trò: `CHU_SO_HUU` (sau khi tạo tổ chức)
- **Tài khoản 2 (Thành viên Tổ chức Beta / Soát vé)**:
  - Email đề xuất: `tester+beta-scanner@<your-inbox-domain>` (hoặc `uat-org+beta-<run>@<your-inbox-domain>`)
  - Vai trò: `CHU_SO_HUU` của Tổ chức Beta, hoặc được gán `SOAT_VE` để kiểm tra phân quyền.

> [!TIP]
> Trước khi bắt đầu kiểm thử, có thể chạy lệnh kiểm tra trạng thái xác thực Staging:
> ```bash
> node --env-file=.env.local scripts/verify-supabase-auth-config.mjs
> ```

---

## 3. Dữ liệu thử nghiệm chuẩn (Exact Test Fixtures)

### Tổ chức Alpha
- **Tên tổ chức**: `UAT Alpha Media`
- **Slug**: `uat-alpha-media`

### Tổ chức Beta
- **Tên tổ chức**: `UAT Beta Productions`
- **Slug**: `uat-beta-productions`

### Bản nháp sự kiện UAT
- **Tên sự kiện**: `UAT Acoustic Night 2026`
- **Slug**: `uat-acoustic-night-2026`
- **Thể loại**: `AM_NHAC` (Âm nhạc)
- **Địa điểm**: `Cung Điền Kinh Mỹ Đình`
- **Địa chỉ**: `Trần Hữu Dực, Cầu Diễn, Nam Từ Liêm, Hà Nội`
- **Mô tả**: `Đêm nhạc acoustic thử nghiệm quy trình xác thực Organizer UAT.`
- **Thời gian bắt đầu**: Ngày `D+15` lúc `19:30` (ví dụ: `2026-11-20T19:30`)
- **Thời gian kết thúc**: Ngày `D+15` lúc `22:30` (ví dụ: `2026-11-20T22:30`)
- **Mở bán vé**: Ngày `D+1` lúc `09:00` (ví dụ: `2026-10-15T09:00`)
- **Đóng bán vé**: Ngày `D+14` lúc `18:00` (ví dụ: `2026-11-19T18:00`)
- **Giá vé mặc định**: `250000` (250.000 ₫)
- **Sức chứa**: `500` vé

---

## 4. Các kịch bản kiểm thử từng bước (Step-by-Step Test Scenarios)

### Kịch bản 1: Đăng ký, Đăng nhập & Onboarding tổ chức (Tài khoản 1) — [PASS 06/10/2026]

1. Mở trình duyệt, truy cập trang Studio: `/?route=/organizer/login` (hoặc click nút **Đăng nhập** trên Marketplace).
2. Chuyển sang tab **Tạo tài khoản**:
   - Nhập email: `tester+alpha-owner@<your-inbox-domain>`
   - Nhập mật khẩu: Tối thiểu 6 ký tự.
   - Bấm **Tạo tài khoản BTC**.
3. **Kích hoạt tài khoản và đăng nhập (Bắt buộc do Staging bật Confirm email)**:
   - Khi bấm **Tạo tài khoản BTC**, frontend gọi GoTrue `signUp`. Do Staging yêu cầu xác thực email (`mailer_autoconfirm: false`), GoTrue trả về trạng thái chưa có phiên (`hasSession: false`).
   - Giao diện lập tức hiển thị thông báo: `Tài khoản đã được tạo thành công! Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập.` và tự động chuyển về tab **Đăng nhập**.
   - **Xác thực email**: Người kiểm thử mở hộp thư `<your-inbox-domain>`, kiểm tra email do Supabase gửi tới địa chỉ `tester+alpha-owner@<your-inbox-domain>` và nhấp vào đường dẫn xác thực (Confirm email).
   - **Đăng nhập vào Studio**: Sau khi xác thực email thành công, quay lại tab **Đăng nhập**, nhập email và mật khẩu vừa đăng ký, bấm **Đăng nhập vào Studio**. Hệ thống điều hướng vào Studio (`/?route=/organizer`).
   - *(Lưu ý: Nếu thử đăng nhập trước khi xác thực email, Supabase sẽ từ chối với lỗi `Email not confirmed`, giao diện hiển thị thông báo: `Tài khoản chưa được kích hoạt qua email. Vui lòng kiểm tra hộp thư của bạn.`)*
4. **Onboarding tổ chức đầu tiên**:
   - Màn hình Studio phát hiện người dùng chưa có tổ chức và hiển thị form **BƯỚC KHỞI TẠO: Tạo tổ chức đầu tiên**.
   - Nhập Tên tổ chức: `UAT Alpha Media`.
   - Quan sát ô Slug: Tự động điền `uat-alpha-media` khi rời con trỏ chuột khỏi ô tên.
   - Bấm **Tạo tổ chức**.
5. **Kỳ vọng**:
   - Nút hiển thị trạng thái `Đang tạo tổ chức…` và tự vô hiệu hóa để chống nhấn đúp.
   - Không cần F5 / reload lại trang, không gian làm việc hiển thị ngay:
     - Tên tổ chức `UAT Alpha Media` xuất hiện trên thanh bên (sidebar).
     - Huy hiệu `Vai trò: Chủ sở hữu` hiển thị rõ ràng.
     - Thống kê: `0` Sự kiện, `0` Đã công bố, `0` Bản nháp.
     - Nút **+ Tạo sự kiện** ở trạng thái khả dụng (enabled).

---

### Kịch bản 2: Tạo bản nháp sự kiện & Xác minh ẩn danh không đọc được (Draft Isolation) — [TẠO BẢN NHÁP PASS; CÁCH LY ẨN DANH TRÌNH DUYỆT PENDING / NOT EXECUTED]

1. Tại Dashboard của `UAT Alpha Media`, bấm nút **+ Tạo sự kiện**.
2. Modal **TẠO NHANH MVP** xuất hiện:
   - Các trường mốc thời gian đã được tự động điền giá trị mặc định hợp lệ.
   - Nhập thông tin:
     - Tên sự kiện: `UAT Acoustic Night 2026`
     - Slug: `uat-acoustic-night-2026`
     - Thể loại: `Âm nhạc`
     - Địa điểm: `Cung Điền Kinh Mỹ Đình`
     - Địa chỉ: `Trần Hữu Dực, Cầu Diễn, Nam Từ Liêm, Hà Nội`
     - Giá vé: `250000`, Sức chứa: `500`
   - Bấm **Lưu bản nháp**.
3. **Kỳ vọng trong Studio [ĐÃ ĐẠT 06/10/2026]**:
   - Modal đóng lại mượt mà, thông báo `Đã tạo bản nháp sự kiện thành công.` hiển thị.
   - Thẻ sự kiện xuất hiện với huy hiệu `Bản nháp`, số suất diễn: `1`.
   - Thống kê cập nhật: `1` Sự kiện, `1` Bản nháp, `0` Đã công bố.
   - Nút **Công bố** hiển thị khả dụng.
4. **Xác minh ẩn danh (Incognito Window) [PENDING / NOT EXECUTED TRÊN TRÌNH DUYỆT]**:
   - *(Ghi chú kiểm thử thực tế đợt 06/10/2026: Chưa thực hiện mở cửa sổ ẩn danh để kiểm tra URL bản nháp trước khi bấm công bố; không đánh giá PASS bước này chỉ dựa trên kết quả công bố sau đó. Tính năng cách ly bản nháp ở tầng cơ sở dữ liệu / RLS đã được xác minh độc lập qua kiểm thử pgTAP `supabase/tests/product_foundation.sql`).*
   - Quy trình kiểm thử khi chạy bổ sung:
     - Mở một cửa sổ ẩn danh mới (không có phiên đăng nhập).
     - Truy cập Marketplace: `/?route=/events` -> Kỳ vọng: Sự kiện `UAT Acoustic Night 2026` **hoàn toàn KHÔNG xuất hiện** trên danh sách.
     - Truy cập trực tiếp URL sự kiện: `/?route=/events/uat-acoustic-night-2026` -> Kỳ vọng: Giao diện hiển thị lỗi không tìm thấy sự kiện (`PublicEventNotFoundError`).

---

### Kịch bản 3: Xuất bản sự kiện & Xác minh hiển thị công khai (Publish & Marketplace) — [PASS 06/10/2026]

1. Quay lại phiên đăng nhập của Tài khoản 1 trong Studio.
2. Tại thẻ sự kiện `UAT Acoustic Night 2026`, bấm **Công bố**.
3. **Kỳ vọng trong Studio**:
   - Nút chuyển trạng thái `Đang công bố…` và tự vô hiệu hóa.
   - Khi hoàn tất, thông báo `Công bố sự kiện thành công! Sự kiện đã xuất hiện trên marketplace.` hiển thị.
   - Huy hiệu sự kiện chuyển thành `Đã công bố`.
   - Thống kê cập nhật: `1` Đã công bố, `0` Bản nháp.
   - Nút "Công bố" được thay thế bằng liên kết `Mở trang công khai ↗` với URL chính xác `/?route=/events/uat-acoustic-night-2026` (đã loại bỏ hoàn toàn lỗi nhân đôi slug).
4. **Kiểm tra điều hướng mượt mà (SPA Navigation)**:
   - Bấm vào `Mở trang công khai ↗`:
     - Trang chuyển trực tiếp sang trang chi tiết sự kiện `/?route=/events/uat-acoustic-night-2026` mà **không bị tải lại toàn bộ trang (hard reload)**.
     - Hiển thị đầy đủ thông tin: Tên `UAT Acoustic Night 2026`, thể loại `Âm nhạc`, thời gian, địa điểm `Cung Điền Kinh Mỹ Đình`.
     - Panel hạng vé hiển thị: `Vé tiêu chuẩn` - `250.000 ₫` (Còn 500/500 vé).
5. **Kiểm tra hiển thị trên Marketplace**:
   - Bấm vào **Tất cả sự kiện** (hoặc `← Về trang bán vé`):
     - Trang chuyển về `/?route=/events`.
     - Sự kiện `UAT Acoustic Night 2026` hiển thị trên lưới sự kiện (Marketplace Grid) với nhãn `ÂM NHẠC` và `1 suất diễn`.
     - Bấm lọc thể loại `Âm nhạc` -> Sự kiện vẫn hiển thị; bấm lọc `Thể thao` -> Sự kiện ẩn đi.
6. **Kiểm tra tương thích ngược Event 1**:
   - Truy cập `/?route=/events/super-concert-2026`.
   - Xác nhận sự kiện Super Concert 2026 vẫn mở đúng mẫu giao diện riêng (`SUPER_CONCERT_2026`), sơ đồ ghế SVG và tương tác giữ vé không bị ảnh hưởng.

---

### Kịch bản 4: Phân quyền & Cách ly Multi-tenant / Chuyển đổi tổ chức (Multi-org Role Switching) — [PENDING CONFIRMATION]

1. **Đăng xuất và đăng nhập tài khoản thứ 2**:
   - Trong Studio, bấm nút **Đăng xuất** ở thanh bên: phiên đăng nhập được dọn dẹp sạch sẽ, chuyển về `/?route=/organizer/login`.
   - Nếu Tài khoản 2 chưa được tạo trước:
     - Chọn tab **Tạo tài khoản**, nhập email: `tester+beta-scanner@<your-inbox-domain>` và mật khẩu (tối thiểu 6 ký tự).
     - Bấm **Tạo tài khoản BTC**.
     - Mở hộp thư thực tế, nhấp vào liên kết xác thực gửi tới `tester+beta-scanner`.
     - Quay lại tab **Đăng nhập**, nhập email và mật khẩu của Tài khoản 2.
   - Nếu Tài khoản 2 đã kích hoạt: Nhập email `tester+beta-scanner@<your-inbox-domain>` và mật khẩu để đăng nhập.
   - Tạo tổ chức `UAT Beta Productions` (slug: `uat-beta-productions`).
2. **Xác minh cách ly Multi-tenant độc lập**:
   - Dashboard của Tài khoản 2 chỉ hiển thị tổ chức `UAT Beta Productions`.
   - Danh sách sự kiện: `0 sự kiện`, Thống kê: `0` (hoàn toàn không thấy bản nháp hay sự kiện đã công bố của `UAT Alpha Media`).
3. **Kiểm thử chuyển đổi đa tổ chức (Multi-org Switching) & Phân quyền theo tổ chức**:
   - Để kiểm thử tình huống một người dùng thuộc nhiều tổ chức với các vai trò khác nhau:
     - Gán tài khoản hiện tại vào cả 2 tổ chức:
       - Tổ chức 1 (`UAT Alpha Media`): vai trò `CHU_SO_HUU` (hoặc `BIEN_TAP`).
       - Tổ chức 2 (`UAT Beta Productions`): vai trò `SOAT_VE` (hoặc `VAN_HANH` - chỉ xem).
     - Tải lại Studio hoặc mở lại trang:
       - Thanh bên xuất hiện dropdown **Tổ chức đang chọn** chứa cả 2 tổ chức.
   - **Khi chọn tổ chức `UAT Alpha Media`**:
     - Huy hiệu vai trò hiển thị: `Vai trò: Chủ sở hữu` (hoặc `Biên tập viên`).
     - Thống kê và danh sách sự kiện: Chỉ hiển thị các sự kiện của Alpha (ví dụ: `UAT Acoustic Night 2026`).
     - Nút **+ Tạo sự kiện**: Khả dụng (enabled).
     - Nút **Công bố** trên thẻ sự kiện bản nháp của Alpha: Khả dụng (enabled).
   - **Khi chuyển sang tổ chức `UAT Beta Productions`**:
     - Huy hiệu vai trò lập tức chuyển thành: `Vai trò: Soát vé (Chỉ xem)`.
     - Thống kê và danh sách sự kiện: Lọc chính xác chỉ sự kiện của Beta (`0 sự kiện`, hiển thị `Chưa có sự kiện. Hãy tạo bản nháp đầu tiên.`), các sự kiện của Alpha hoàn toàn biến mất khỏi giao diện.
     - Nút **+ Tạo sự kiện**: Bị vô hiệu hóa (`disabled`) kèm tooltip thông báo phân quyền (`Chỉ chủ sở hữu, quản trị viên hoặc biên tập viên mới có thể tạo sự kiện`).
     - Mọi bản nháp nếu có trong Beta: Nút **Công bố** bị vô hiệu hóa (`disabled`) kèm tooltip phân quyền.
   - **Kiểm tra giữ trạng thái khi tải lại trang (Persistence across refresh)**:
     - Đang chọn `UAT Beta Productions`, bấm F5 (Reload trang):
     - Không gian làm việc tải lại mượt mà, dropdown vẫn giữ nguyên `UAT Beta Productions`, vai trò và trạng thái vô hiệu hóa nút ghi được duy trì chính xác, không bị rơi vào trạng thái rỗng hay văng lỗi.
4. **Xác minh chặn ở tầng backend / RLS**:
   - Mọi yêu cầu cố ý gọi trực tiếp RPC hoặc sửa bảng dưới vai trò `SOAT_VE` / `VAN_HANH` đều bị chặn bởi Postgres RLS với mã lỗi `42501` (`Bạn không có quyền thực hiện thao tác này`).

---

## 5. Quy trình dọn dẹp dữ liệu thử nghiệm (Cleanup Procedure)

Sau khi hoàn tất buổi UAT, chạy đoạn SQL sau trong **Supabase Web SQL Editor** để dọn dẹp các bản ghi thử nghiệm mà không làm ảnh hưởng đến dữ liệu sản phẩm hoặc Super Concert 2026:

```sql
BEGIN;

-- 1. Xóa các sự kiện thử nghiệm UAT (cascade xóa suất diễn, khu vực vé)
DELETE FROM public."SU_KIEN"
WHERE "Slug" = 'uat-acoustic-night-2026';

-- 2. Xóa các tổ chức thử nghiệm UAT (cascade xóa thành viên tổ chức)
DELETE FROM public."TO_CHUC"
WHERE "Slug" IN ('uat-alpha-media', 'uat-beta-productions');

-- 3. Xác nhận lại Super Concert vẫn an toàn
SELECT "SuKienID", "Slug", "TemplateKey", "TrangThaiCongBo"
FROM public."SU_KIEN"
WHERE "SuKienID" = 1;

COMMIT;
```

> [!NOTE]
> **Thứ tự dọn dẹp và ràng buộc toàn vẹn cơ sở dữ liệu**:
> - Khóa ngoại `public."SU_KIEN"."ToChucID"` được thiết lập `ON DELETE RESTRICT`. Do đó, **bắt buộc phải xóa sự kiện UAT trước khi xóa tổ chức**.
> - Lệnh xóa `SU_KIEN` tự động cascade xóa `SUAT_DIEN` (`ON DELETE CASCADE`) và `KHU_VUC` (`ON DELETE CASCADE`). Luồng MVP không tạo bản ghi `GHE` vật lý nên không có rác tồn đọng.
> - Lệnh xóa `TO_CHUC` tự động cascade xóa `THANH_VIEN_TO_CHUC` (`ON DELETE CASCADE`).
> - **Dọn dẹp tài khoản Auth**: Để xóa sạch các tài khoản kiểm thử khỏi Supabase Auth (`auth.users`), quản trị viên thực hiện:
>   - Cách 1: Vào **Supabase Dashboard > Authentication > Users**, tìm kiếm tiền tố email thử nghiệm (ví dụ `tester+alpha-owner`, `tester+beta-scanner`) và nhấn **Delete user**.
>   - Cách 2: Trong **Supabase Web SQL Editor** (chạy dưới quyền postgres superuser):
>     ```sql
>     DELETE FROM auth.users WHERE email LIKE 'tester+%@<your-inbox-domain>';
>     ```
>   *(Lưu ý: Xóa `auth.users` tự động cascade xóa `HO_SO_NGUOI_DUNG` và `THANH_VIEN_TO_CHUC` do ràng buộc `ON DELETE CASCADE`, nhưng không tự động xóa `TO_CHUC` hoặc `SU_KIEN`. Vì vậy, luôn tuân thủ thứ tự: 1. `SU_KIEN` -> 2. `TO_CHUC` -> 3. `auth.users`).*

---

## 6. Danh mục bằng chứng cần thu thập (Evidence Checklist)

Ghi nhận kết quả thực tế đợt UAT ngày 06/10/2026:

- [x] **Bằng chứng 1**: Ảnh chụp màn hình Onboarding "Tạo tổ chức đầu tiên" và Dashboard ngay sau khi tạo tổ chức thành công (thể hiện vai trò Chủ sở hữu `UAT Alpha Media`) — **PASS (06/10/2026)**.
- [x] **Bằng chứng 2**: Ảnh chụp màn hình modal tạo bản nháp sự kiện và thẻ bản nháp `UAT Acoustic Night 2026` xuất hiện trong Studio — **PASS (06/10/2026)**.
- [ ] **Bằng chứng 3**: Ảnh chụp màn hình cửa sổ ẩn danh truy cập Marketplace và URL trực tiếp của bản nháp (thể hiện lỗi 404 / Không tìm thấy sự kiện trước khi công bố) — **NOT EXECUTED / PENDING** (chưa mở cửa sổ ẩn danh kiểm tra trước khi công bố; DB RLS draft isolation đã PASS riêng trong bài test pgTAP `product_foundation.sql`).
- [x] **Bằng chứng 4**: Ảnh chụp màn hình Studio sau khi bấm Công bố (thể hiện nhãn Đã công bố và liên kết công khai chính xác `/?route=/events/uat-acoustic-night-2026`, đã triệt tiêu lỗi nhân đôi slug) — **PASS (06/10/2026)**.
- [x] **Bằng chứng 5**: Ảnh chụp màn hình Marketplace hiển thị cả hai sự kiện (`Super Concert 2026` & `UAT Acoustic Night 2026`) và trang Generic Event Page với bảng giá vé (500/500 vé, 250.000 ₫) — **PASS (06/10/2026)**.
- [ ] **Bằng chứng 6**: Ảnh chụp màn hình tài khoản thuộc tổ chức Beta (chứng minh cách ly multi-tenant) và giao diện nút bị vô hiệu hóa của vai trò Soát vé — **PENDING CONFIRMATION** (Tài khoản Beta đã tạo trong GoTrue, đang chờ xác nhận email trong hộp thư thực tế; tầng DB RLS đã PASS 23/23 test).
- [ ] **Bằng chứng 7**: Network tab (F12) ghi nhận các lệnh gọi RPC `tao_to_chuc_cua_toi`, `tao_ban_nhap_su_kien`, `cong_bo_su_kien` trả về mã HTTP `200`/`204` thành công — **NOT CAPTURED / PENDING** (chưa chụp log DevTools Network trực tiếp; sự thay đổi trạng thái giao diện thành công và dữ liệu công bố hiển thị trên Marketplace đóng vai trò bằng chứng gián tiếp).
