# Marketplace & Organizer MVP — Research, Implementation and Verification

**Ngày:** 05/10/2026 (Cập nhật nghiệm thu Staging: 06/10/2026)  
**Trạng thái:** `STAGING VERIFIED — DATABASE, RLS & PUBLIC CONTRACT`; `CORE ORGANIZER FLOW VERIFIED` (06/10/2026); `MULTI-TENANT / ROLE-SWITCH UAT PENDING`  
**Nhóm thực hiện:** GPT (kiến trúc, tích hợp, kiểm thử) + Gemini/AGY (nghiên cứu độc lập, sửa lỗi slug & nghiệm thu luồng lõi)

## 1. Mục tiêu và quyết định sản phẩm

EventTicketing không còn là một landing page chỉ dành cho Super Concert. Kiến trúc
mới có ba lớp rõ ràng:

1. **Marketplace công khai:** người dùng tìm, lọc và mở các sự kiện đã công bố.
2. **Event template registry:** sự kiện mới dùng mẫu chung; Super Concert tiếp tục
   dùng trải nghiệm concert tùy biến hiện có qua `TemplateKey`.
3. **Organizer Studio:** BTC đăng nhập, tạo tổ chức, tạo bản nháp và công bố sự kiện.

Thanh toán, doanh thu, đơn hàng, QR và số liệu bán vé không được giả lập thành dữ
liệu thật. Những phần đó thuộc Product Foundation tiếp theo và phải đi qua RPC/
webhook phía server.

## 2. Nghiên cứu sản phẩm Việt Nam

- [Ticketbox](https://ticketbox.vn/) xác nhận mô hình điều hướng cốt lõi: tìm kiếm,
  danh mục sự kiện, “Tạo sự kiện”, “Vé của tôi” và đăng nhập.
- [CTicket](https://cticket.vn/) củng cố cách tách trải nghiệm mua vé công khai khỏi
  tài khoản và vận hành của đối tác/BTC.
- [TicketGo](https://ticketgo.vn/) dùng nhóm thể loại rõ ràng (âm nhạc, sân khấu,
  workshop, thể thao…) và có điểm vào riêng cho đối tác gửi sự kiện.
- [web_event_ticketting](https://github.com/thanhhaitrn/web_event_ticketting) gợi ý
  miền dữ liệu Event → Show → Zone → Sale Phase. Repo không có license nên tuyệt đối
  không sao chép source.

## 3. Các repository đã khảo sát thêm

- [Adminiumjs/event-ticketing](https://github.com/Adminiumjs/event-ticketing): tách
  attendee/organizer, giữ vé có thời hạn và lớp data source. AGPL — chỉ học pattern.
- [Hi.Events](https://github.com/HiEventsDev/Hi.Events): multi-user roles, recurring
  events, branding và analytics. AGPL — không lấy code.
- [pretix](https://github.com/pretix/pretix): quota, sub-event, check-in và inventory
  trưởng thành. AGPL — không lấy code.
- [Eyevinn/openevents](https://github.com/Eyevinn/openevents): dashboard BTC,
  ticket types, vai trò và báo cáo.
- [prasadaniket/SocialUp](https://github.com/prasadaniket/SocialUp): React/Vite/
  Supabase cho discovery, auth và organizer flow.
- [psang39/tickify](https://github.com/psang39/tickify): sơ đồ, pricing, realtime,
  check-in và vận hành organizer.
- [michaelchu/roster](https://github.com/michaelchu/roster): React/Supabase, RBAC,
  organizer CRUD và export.

Mọi nguồn chỉ dùng để đối chiếu luồng và rủi ro. Không đưa mã nguồn bên thứ ba vào repo.

## 4. Phần đã triển khai

### Frontend công khai

- `/` và `/events`: hero, tìm kiếm, lọc thể loại, event cards responsive.
- `/events/:slug`: tự chọn template bằng `TemplateKey`.
- `DEFAULT`: trang chung có mô tả, địa điểm, nhiều suất diễn và hạng vé.
- `SUPER_CONCERT_2026`: giữ nguyên concert runtime/SVG/giữ chỗ đã nghiệm thu.
- Điều hướng dùng query route để tiếp tục chạy trên GitHub Pages không có SPA rewrite.

### Organizer Studio

- Supabase Auth email/password, phản ứng thời gian thực qua listener phiên làm việc (`onAuthStateChange`).
- Thông báo lỗi đăng nhập/đăng ký được chuẩn hóa sang tiếng Việt; đăng ký phân biệt rõ trường hợp có phiên đăng nhập ngay và trường hợp cần xác nhận email.
- Onboarding tạo tổ chức đầu tiên qua RPC, hỗ trợ đồng thời cả mock localStorage và Supabase staging.
- Phân định quyền chặt chẽ: `CHU_SO_HUU`, `QUAN_TRI`, `BIEN_TAP` được tạo và công bố; `SOAT_VE`, `VAN_HANH` chỉ được xem workspace.
- Workspace nhiều tổ chức chỉ hiển thị sự kiện và thống kê của tổ chức đang chọn; quyền tạo/công bố cũng được tính lại theo vai trò tại đúng tổ chức đó.
- Tổ chức đang chọn được lưu theo từng tài khoản và khôi phục sau khi tải lại trang; lựa chọn không còn hợp lệ sẽ tự động quay về tổ chức đầu tiên mà người dùng vẫn có quyền truy cập.
- Workspace hiển thị số sự kiện, draft và sự kiện đã công bố bằng dữ liệu thật (xử lý phòng vệ cho PostgREST nested queries dạng object/array).
- Form MVP tạo đồng thời Event + Show đầu tiên + ticket tier mặc định, kiểm tra thứ tự thời gian hợp lệ ở client trước khi gọi RPC.
- Công bố qua RPC có validation chặt chẽ; trigger cơ sở dữ liệu ngăn chặn hoàn toàn việc client tự cập nhật cột trạng thái `CONG_KHAI`.
- Chế độ mock hoàn thiện luồng kiểm thử: sự kiện công bố trong mock mode hiển thị ngay trên marketplace và trang chi tiết generic.

### Database và bảo mật

Migration `20261005150000_marketplace_organizer_mvp.sql` & `20261005090000_product_foundation.sql`:

- thêm `TemplateKey`, `TheLoai` và index catalog;
- backfill Super Concert sang template riêng `SUPER_CONCERT_2026`;
- kiểm tra vai trò biên tập: `co_quyen_bien_tap_to_chuc` (`CHU_SO_HUU`, `QUAN_TRI`, `BIEN_TAP`);
- tách bạch RLS: mọi thành viên (`la_thanh_vien_to_chuc`) được đọc dữ liệu tổ chức; chỉ editor (`co_quyen_bien_tap_to_chuc`) mới được INSERT/UPDATE/DELETE;
- RPC `tao_to_chuc_cua_toi` và `tao_ban_nhap_su_kien` có `SECURITY DEFINER SET search_path = public`, thu hồi quyền từ `PUBLIC`;
- harden RPC `cong_bo_su_kien` để xác thực quyền editor, tối thiểu 1 suất diễn hợp lệ, và ít nhất 1 phân khu bán vé được (`TongSoGhe > 0` và `GiaVeNiemYet >= 0`), chuyển đổi trạng thái nguyên tử (`SAP_MO_BAN` + `CONG_KHAI`);
- trigger `trg_kiem_tra_cong_bo_su_kien` chặn mọi hành vi bypass trực tiếp qua lệnh UPDATE/INSERT của client; hàm trigger thu hồi quyền execute từ `PUBLIC`;
- adapter giữ chỗ Sprint 1 (`tao_giu_cho`) lọc bỏ các suất diễn bản nháp (`BAN_NHAP`).

## 5. Kết quả kiểm tra cục bộ

- `npm run lint`: PASS (tsc --noEmit không có lỗi).
- `npm run test:uat`: PASS 11/11 (validation, chống nhân đôi slug công khai, cô lập tổ chức, quyền theo tổ chức và khôi phục lựa chọn workspace).
- `npm run check`: PASS TypeScript, PASS 23/23 test (11 unit/UAT + 12 product-foundation) và PASS production build.
- `npm run build`: PASS.
- Smoke test trình duyệt: marketplace, generic detail, organizer login và studio hoạt động ổn định;
- SQL acceptance (100% tương thích Supabase SQL Editor và psql, không dùng meta-command `\gset`):
  - `supabase/tests/marketplace_organizer_mvp.sql` (23 bài test pgTAP bao phủ multi-tenant, direct-table RLS cho scanner/org B owner/org A owner, sellable zone và trigger chặn bypass).
  - `supabase/tests/product_foundation.sql` (bắt ID fixture trước khi đổi role, truy vấn trực tiếp theo ID trên `SUAT_DIEN`, `KHU_VUC`, `GHE` dưới role `anon` mà không join `SU_KIEN`, đảm bảo không bị pass rỗng, kiểm tra tính tương thích của Event 1).

## 6. Bằng chứng staging ngày 06/10/2026

Project đích: `qxkgkbayxxaakkwtepss`.

- PASS — chạy `20261005090000_product_foundation.sql` trên Supabase SQL Editor.
- PASS — chạy `20261005150000_marketplace_organizer_mvp.sql` sau migration nền.
- PASS — `npm run verify:staging`: Event 1 công khai, trạng thái bán vé đúng và RPC nội bộ bị chặn ở anonymous.
- PASS — `npm run verify:foundation`: slug `super-concert-2026`, template
  `SUPER_CONCERT_2026`, thể loại `AM_NHAC`, show `dem-chinh`; anonymous không
  thể gọi RPC tạo tổ chức.
- PASS — `supabase/tests/product_foundation.sql`: Event 1:N Show, backfill và
  ẩn event/show/zone/seat bản nháp với role `anon`. Toàn bộ fixture rollback.
- PASS 23/23 — `supabase/tests/marketplace_organizer_mvp.sql`: phân tách tenant,
  role chỉ xem, editor, publish validation, direct-write bypass và chuyển trạng
  thái nguyên tử. Toàn bộ fixture rollback.
- PASS — smoke test trình duyệt với dữ liệu staging: marketplace hiển thị
  Super Concert; route `/events/super-concert-2026` nạp template riêng và 72 ghế
  mở bán từ Supabase; `/organizer` hiển thị luồng Auth/BTC.
- PASS — `npm run verify:auth-config`: GoTrue `v2.197.0`, đăng ký email đang bật
  và `mailer_autoconfirm=false`; UAT bắt buộc xác nhận email qua một hộp thư có
  thể truy cập (có thể dùng hai plus-alias từ cùng một hộp thư).
- PASS — Nghiệm thu luồng lõi Organizer (Core Organizer Flow - Alpha Owner):
  - Đăng ký tài khoản qua GoTrue email, hoàn tất kích hoạt qua hộp thư thực tế và đăng nhập Studio thành công.
  - Onboarding tạo tổ chức đầu tiên `UAT Alpha Media` (slug: `uat-alpha-media`) qua RPC `tao_to_chuc_cua_toi` thành công; giao diện cập nhật ngay lập tức sang workspace với vai trò `CHU_SO_HUU`.
  - Tạo bản nháp sự kiện `UAT Acoustic Night 2026` (slug: `uat-acoustic-night-2026`) thành công kèm 1 suất diễn và hạng vé tiêu chuẩn (sức chứa 500, giá 250.000 ₫); thẻ sự kiện hiển thị trạng thái `Bản nháp`.
  - Công bố sự kiện qua RPC `cong_bo_su_kien` thành công, trạng thái chuyển nguyên tử sang `Đã công bố`.
  - Khắc phục triệt để lỗi nhân đôi slug: thẻ sự kiện trong Studio hiển thị liên kết công khai chính xác là `/?route=/events/uat-acoustic-night-2026` (thay vì bị nhân đôi `uat-acoustic-night-2026uat-acoustic-night-2026`).
  - Chuẩn hóa bản ghi UAT đã tạo trên staging bằng quyền của Alpha Owner: cập nhật `SU_KIEN.Slug` trả về HTTP 200; truy vấn anonymous sau đó thấy đúng một bản ghi `CONG_KHAI` với slug sạch `uat-acoustic-night-2026`.
  - Nhấp liên kết điều hướng SPA mượt mà sang Generic Event Page: hiển thị đầy đủ tên sự kiện, mô tả, địa điểm `Cung Điền Kinh Mỹ Đình`, 1 suất diễn, sức chứa 500/500 và hạng vé `Vé tiêu chuẩn - 250.000 ₫`.
  - Quay lại Marketplace (`/?route=/events`): danh sách hiển thị đồng thời cả `Super Concert 2026` và `UAT Acoustic Night 2026` với đường dẫn sạch chính xác; tương thích ngược hoàn toàn với Super Concert (`/events/super-concert-2026`).
- PENDING / NOT EXECUTED — Kiểm tra cách ly bản nháp trên trình duyệt (Browser Draft Isolation - Kịch bản 2 bước 4 & Bằng chứng 3):
  - Trong đợt kiểm thử thực tế, người kiểm thử chưa mở cửa sổ ẩn danh để kiểm tra URL bản nháp trước khi bấm công bố (không suy diễn PASS chỉ từ kết quả công bố sau đó).
  - Ghi chú: tính năng ẩn bản nháp với người dùng ẩn danh ở tầng cơ sở dữ liệu đã được chứng minh riêng qua bài test pgTAP `supabase/tests/product_foundation.sql`.
- PENDING / NOT CAPTURED — Ảnh chụp DevTools Network F12 cho các lệnh RPC (Bằng chứng 7):
  - Chưa chụp trực tiếp log HTTP 200/204 từ tab F12 Network; các bước chuyển đổi giao diện mượt mà và dữ liệu công bố hiển thị đúng trên Marketplace/Generic Detail đóng vai trò bằng chứng gián tiếp.
- PENDING — Tài khoản Beta và kiểm thử phân quyền đa tổ chức (Kịch bản 4 & Bằng chứng 6):
  - Danh tính Tài khoản 2 (Beta) đã được khởi tạo trong GoTrue nhưng chưa hoàn tất xác nhận email trong hộp thư thực tế.
  - Do đó, kịch bản chuyển đổi tổ chức và kiểm tra trực quan nút bị vô hiệu hóa cho vai trò `SOAT_VE` trên giao diện trình duyệt chưa hoàn tất (PENDING).
  - Ghi chú: tính năng cách ly multi-tenant và phân quyền RLS ở tầng database đã được chứng minh an toàn và đạt 23/23 test pgTAP trong `supabase/tests/marketplace_organizer_mvp.sql`.

Phạm vi `CORE ORGANIZER FLOW VERIFIED` (06/10/2026) bao gồm toàn bộ luồng vòng đời
cốt lõi của một tổ chức: đăng ký danh tính thật qua GoTrue → xác thực email →
đăng nhập → tạo tổ chức → tạo bản nháp → công bố → thẻ Studio hiển thị liên kết
chuẩn xác (không nhân đôi slug) → trang chi tiết generic hiển thị đầy đủ thông tin
và hạng vé → marketplace công khai hiển thị đồng thời sự kiện mới và Super Concert.

Hạng mục còn lại: kiểm tra cách ly bản nháp trên trình duyệt (Kịch bản 2 bước 4),
bằng chứng DevTools F12 (Bằng chứng 7), và kiểm thử giao diện phân quyền đa tổ chức
(Multi-tenant & Role-switch UI - Kịch bản 4) đang ở trạng thái `PENDING / NOT EXECUTED`.
Chưa nâng trạng thái lên `ORGANIZER AUTH UAT VERIFIED` hoặc `MULTI-TENANT ROLE VERIFIED`
cho đến khi hoàn tất các bước kiểm thử này trên trình duyệt.

## 7. Backlog đúng thứ tự

1. Wizard đầy đủ: media upload, nhiều show, nhiều tier/zone, preview draft có quyền.
2. Audit log bất biến cho create/update/publish.
3. Order/payment boundary, VietQR/webhook idempotent và expiry worker.
4. E-ticket QR có chữ ký và check-in atomic.
5. Analytics thật, export CSV/Excel, vai trò kế toán/soát vé.
6. Load test giữ vé cuối cùng và phòng chờ cho sale drop lớn.

Không mở rộng nhãn `VERIFIED` sang thanh toán, đơn hàng, QR, check-in
hoặc analytics cho đến khi các hạng mục backlog tương ứng được triển khai.
