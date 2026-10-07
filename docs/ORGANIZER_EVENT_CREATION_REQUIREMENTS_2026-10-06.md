# Đặc tả Yêu cầu & Bản thiết kế Kỹ thuật: Quy trình Tạo Sự kiện cho Ban tổ chức (Organizer Event Creation Blueprint)

**Tài liệu:** `docs/ORGANIZER_EVENT_CREATION_REQUIREMENTS_2026-10-06.md`  
**Ngày lập:** 06/10/2026  
**Dự án:** EventTicketing Platform (`COSH301` — Phân tích và Thiết kế Hệ thống)  
**Tác giả:** Research Analyst / Technical Product Lead  
**Đối tượng thụ hưởng:** Senior Engineer & Architectural Review Board  
**Trạng thái phê duyệt:** `ACCEPTED & IMPLEMENTED VERTICAL SLICE (2026-10-06)`  
**Ranh giới kỹ thuật:** Bảo toàn tương thích `SUPER_CONCERT_2026`, kế thừa Product Foundation (Supabase / React / Vite), tuân thủ RLS, hoàn toàn không suy diễn hoặc giả lập thanh toán / QR / check-in.

---

## 1. Tóm tắt điều hành (Executive Summary)

Quy trình tạo sự kiện hiện tại của EventTicketing mới chỉ dừng ở mức biểu mẫu tối thiểu một màn hình (MVP Form tại [`src/components/OrganizerPortal.tsx#L618-L709`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L618-L709)), trong đó bắt buộc nhập cứng một lần toàn bộ 12 trường và tự động tạo 1 sự kiện kèm duy nhất 1 suất diễn (`suat-1`) cùng 1 hạng vé (`GENERAL_ADMISSION`). Khảo sát thực tế các nền tảng bán vé tại Việt Nam (Ticketbox, CTicket, TicketGo) và quốc tế (Eventbrite, Ticket Tailor, pretix, Hi.Events) khẳng định kiến trúc này chưa đáp ứng được nhu cầu vận hành thực tế của các đơn vị tổ chức (BTC). Các sự kiện thông thường luôn đòi hỏi quản lý đa suất diễn (multi-show), nhiều hạng vé (multi-tier: Early Bird, Standard, VIP), hình ảnh nhận diện đa tỷ lệ (desktop banner 16:9, mobile poster), chế độ địa điểm (trực tiếp, trực tuyến, công bố sau), giới hạn số vé mỗi đơn hàng, thông tin hotline/hỗ trợ người tham dự, và các chính sách quy định độ tuổi/hoàn vé.

Bản thiết kế này chuẩn hóa một **Wizard 6 bước liền mạch** (Thông tin cơ bản → Suất diễn & Địa điểm → Hạng vé & Phân khu → Media & Nhận diện → Chính sách & Liên hệ → Xem trước & Kiểm tra xuất bản). Bản nháp được hỗ trợ lưu từng phần (save-draft) với các ràng buộc lỏng, trong khi khâu xuất bản (publish) kích hoạt bộ kiểm tra sẵn sàng nghiêm ngặt (pre-flight readiness checklist) ở cả React client và PostgreSQL RPC/Trigger. Toàn bộ giải pháp được đối chiếu chi tiết với lược đồ cơ sở dữ liệu hiện tại, tận dụng tối đa các cột đã có trong `SU_KIEN` và vạch ra lát cắt triển khai tối thiểu không làm xáo trộn dữ liệu nghiệm thu Sprint 1 / Product Foundation.

---

## 2. Bằng chứng hiện trạng & Phân tích khoảng cách (Current Baseline & Primary Evidence)

### 2.1. Kiểm tra mã nguồn giao diện Ban tổ chức (`OrganizerPortal.tsx`)
- **Vị trí quan sát:** [`src/components/OrganizerPortal.tsx`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx) dòng 618–709.
- **Thực tế ghi nhận:** Modal tạo sự kiện `TẠO NHANH MVP` là một `<form>` phẳng chứa 12 `input` đồng cấp: `name`, `slug`, `category`, `venueName`, `address`, `description`, `startsAt`, `endsAt`, `saleStartsAt`, `saleEndsAt`, `price`, `capacity`.
- **Hạn chế hành vi:**
  1. *Cứng nhắc số lượng thực thể:* Khi submit, form gửi lệnh gọi hàm `createEventDraft` ([`src/services/organizerService.ts#L244-L289`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/services/organizerService.ts#L244-L289)), RPC sinh tự động 1 suất diễn duy nhất (`suat-1` - "Suất diễn 1") và 1 phân khu duy nhất (`GENERAL_ADMISSION` - "Vé tiêu chuẩn"). BTC không có cách nào cấu hình sự kiện 2 đêm hoặc chia nhiều hạng vé.
  2. *Thiếu tính năng xem trước bản nháp:* Dòng 596 hiển thị trực tiếp chuỗi văn bản giữ chỗ: `<span>Xem trước có sau bước media</span>`. Người dùng không thể xem trước giao diện sự kiện trước khi công bố.
  3. *Không thể cập nhật/chỉnh sửa:* Giao diện chỉ có nút "Công bố" ([`OrganizerPortal.tsx#L598`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L598)), hoàn toàn không có nút "Chỉnh sửa" (Edit) hoặc màn hình sửa thông tin bản nháp.
  4. *Lưu bản nháp bị ràng buộc quá sớm:* Nút "Lưu bản nháp" đòi hỏi người dùng phải điền đủ cả địa điểm, 4 mốc thời gian, giá vé và sức chứa thì mới được lưu. Nếu BTC chỉ muốn nhập tên và ý tưởng trước, form sẽ chặn lại vì thuộc tính `required` của HTML5.

### 2.2. Kiểm tra logic kiểm thực miền nghiệp vụ (`organizerValidation.js`)
- **Vị trí quan sát:** [`src/domain/organizerValidation.js`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/organizerValidation.js) dòng 71–114.
- **Quy tắc hiện có:**
  - `name.length >= 5`.
  - `slug` khớp biểu thức chính quy `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
  - `category` nằm trong tập cố định 7 giá trị: `['AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC']`.
  - Bắt buộc các bất biến thứ tự thời gian: `endsAt > startsAt`, `saleStartsAt < startsAt`, `saleEndsAt > saleStartsAt`, `saleEndsAt <= startsAt`.
  - `price >= 0` và `capacity >= 1`.
- **Khoảng cách miền:** Validation hiện chỉ kiểm tra cho 1 cặp mốc thời gian duy nhất và 1 mức giá duy nhất. Chưa có hàm kiểm thực danh sách suất diễn (Multi-show date consistency), chưa có kiểm thực danh sách hạng vé (Tier pricing/capacity consistency), và chưa hỗ trợ URL media hoặc số điện thoại hotline.

### 2.3. Kiểm tra cơ sở dữ liệu & RPC Supabase
- **Vị trí quan sát:** Migration [`supabase/migrations/20261005150000_marketplace_organizer_mvp.sql`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/supabase/migrations/20261005150000_marketplace_organizer_mvp.sql).
- **Hàm `public.tao_ban_nhap_su_kien` (dòng 57–125):**
  - Nhận 13 tham số cố định.
  - Chèn bản ghi vào `SU_KIEN` với `BannerURL = NULL`, `PosterURL = NULL`, `TrailerURL = NULL`, `SoDoTongQuanURL = NULL`.
  - Tạo 1 bản ghi `SUAT_DIEN` (`Slug = 'suat-1'`, `TrangThai = 'BAN_NHAP'`).
  - Tạo 1 bản ghi `KHU_VUC` (`MaKhuVuc = 'GENERAL_ADMISSION'`, `TenKhuVuc = 'Vé tiêu chuẩn'`, `LoaiKhuVuc = 'DUNG_STAND'`).
- **Hàm `public.cong_bo_su_kien` (dòng 129–162):**
  - Đã có kiểm tra xác thực quyền biên tập (`co_quyen_bien_tap_to_chuc`).
  - Đã có kiểm tra tồn tại ít nhất 1 suất diễn hợp lệ và mỗi suất diễn phải có ít nhất 1 phân khu bán vé được (`TongSoGhe > 0` và `GiaVeNiemYet >= 0`).
  - Chuyển đổi trạng thái nguyên tử: mọi suất diễn `BAN_NHAP` của sự kiện chuyển sang `SAP_MO_BAN`, và sự kiện chuyển sang `CONG_KHAI`.
- **Trigger `trg_kiem_tra_cong_bo_su_kien` (dòng 166–200):**
  - Đã chặn thành công hành vi cập nhật tắt `TrangThaiCongBo = 'CONG_KHAI'` từ phía client nếu không thỏa mãn điều kiện.
- **Khả năng ghi trực tiếp của Editor qua RLS:**
  - Dòng 208–284 cấp quyền `FOR ALL TO authenticated` cho các thành viên có vai trò biên tập (`co_quyen_bien_tap_to_chuc`) trên các bảng `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`. Điều này có nghĩa là kiến trúc hiện tại **đã cho phép** client thực hiện các thao tác UPDATE/INSERT/DELETE bổ sung phân khu hoặc suất diễn qua PostgREST, nhưng giao diện frontend chưa khai thác năng lực này.

---

## 3. Nghiên cứu khảo sát các nền tảng bán vé (Comparative Industry Research)

Để xây dựng một quy trình đáp ứng chuẩn mực vận hành thực tế nhưng không sa vào danh sách tính năng viển vông, chúng tôi tiến hành khảo sát có đối chứng giữa các nền tảng tại Việt Nam và các nền tảng quốc tế/mã nguồn mở uy tín.

### 3.1. Thị trường Việt Nam (Ưu tiên đối chứng)

> [!NOTE]
> **Phân định phương pháp luận khảo sát:** Trong đợt nghiên cứu này, các dữ liệu về Ticketbox, CTicket và TicketGo được thu thập từ cổng đối tác công khai, quy chế hoạt động sàn TMĐT, tài liệu hỗ trợ khách hàng và quy trình đặt vé thực tế. Do không có phiên đăng nhập của nhà tổ chức thương mại đã qua thẩm định pháp lý (Authenticated Organizer Session) trên hệ thống nội bộ của các sàn này, mọi kết luận về giao diện wizard bên trong của BTC được phân định rõ ràng giữa **Thực tế quan sát từ tài liệu/cổng công khai** và **Suy luận kiến trúc / Chưa kiểm chứng trực tiếp**.

| Nền tảng | Nguồn dẫn chứng chính thức | Phân định Thực tế quan sát (Observed Facts) vs Suy luận / Chưa kiểm chứng (Inference / Unverified) | Giấy phép & Ràng buộc pháp lý |
| :--- | :--- | :--- | :--- |
| **Ticketbox** | Website: [`ticketbox.vn`](https://ticketbox.vn/)<br>Cổng BTC: [`organizer.ticketbox.vn`](https://organizer.ticketbox.vn/)<br>Tài liệu đối tác Ticketbox Helpdesk | **Thực tế quan sát từ cổng công khai & trợ giúp:**<br>1. Cung cấp cổng riêng "Organizer Center", form đăng ký thông tin đối tác.<br>2. Form tạo sự kiện yêu cầu: Tên, Thể loại, Mô tả nội dung phong phú, Đơn vị tổ chức.<br>3. Media: Banner sự kiện bắt buộc tỷ lệ ngang (chuẩn web desktop) và ảnh đại diện/poster.<br>4. Vé: Cho phép tạo nhiều hạng vé (VVIP, VIP, GA), cấu hình số lượng, giá bán, "Ngày bắt đầu bán" và "Ngày ngưng bán".<br>5. Check-in: Phân tách công cụ kiểm soát vé sang ứng dụng di động riêng "Ticketbox Event Manager" quét QR offline.<br>**Suy luận / Chưa kiểm chứng trực tiếp qua tài khoản BTC:**<br>Cơ chế thiết lập nhiều đêm diễn (multi-date/sessions) độc lập có cấu hình vé riêng và luồng wizard lưu nháp nhiều bước là suy luận từ cấu trúc dữ liệu hiển thị và tài liệu hướng dẫn công khai; chưa được kiểm chứng trực tiếp bằng tài khoản đối tác có phiên đăng nhập thật. | Bản quyền thuộc Tiki Corporation. Proprietary SaaS.<br>Không sao chép giao diện hay mã nguồn; chỉ học hỏi cấu trúc trường dữ liệu và luồng nghiệp vụ. |
| **CTicket** | Website: [`cticket.vn`](https://cticket.vn/)<br>Quy chế hoạt động sàn TMĐT CTicket (Cresta JSC) | **Thực tế quan sát từ quy chế sàn & hợp đồng mẫu:**<br>1. CTicket áp dụng mô hình **Kiểm duyệt tập trung (Managed / Curated Onboarding)**: Đơn vị tổ chức không tự do xuất bản mà phải qua thẩm định.<br>2. Bắt buộc hồ sơ pháp lý và **giấy phép tổ chức hợp pháp** (văn bản chấp thuận biểu diễn theo Nghị định 144/2020/NĐ-CP) trước khi mở bán.<br>3. Danh mục vé phong phú: Vé trận, vé ngày, vé vòng đấu, vé trọn giải, vé Fan Zone (Esports & Live concert).<br>4. Soát vé qua ứng dụng CTicket Event Manager.<br>**Suy luận / Chưa kiểm chứng trực tiếp qua tài khoản BTC:**<br>Giao diện backoffice phân bổ hạn ngạch vé và quy trình phê duyệt điện tử nội bộ là suy luận từ điều khoản quy chế hoạt động, chưa được kiểm chứng qua tài khoản BTC thực tế. | Bản quyền thuộc Công ty Cổ phần Cresta. Proprietary.<br>Chỉ học hỏi mô hình kiểm soát pháp lý và phân loại vé. |
| **TicketGo** | Website: [`ticketgo.vn`](https://ticketgo.vn/)<br>Mục "Gửi sự kiện" & Hợp tác đối tác | **Thực tế quan sát từ cổng công khai:**<br>1. Điểm tiếp nhận đối tác qua form "Gửi sự kiện" (Tên, SĐT, Email, Mô tả).<br>2. Chuẩn kích thước Banner khuyến nghị rõ ràng: **1500 x 600 px**.<br>3. Hỗ trợ truyền thông miễn phí cho các sự kiện văn hóa nghệ thuật của sinh viên / CLB phi lợi nhuận (rất sát với bối cảnh FTU Entertainment Lab).<br>**Suy luận / Chưa kiểm chứng trực tiếp qua tài khoản BTC:**<br>Luồng duyệt sự kiện (thủ công qua email/hotline hay qua dashboard tự động) là suy luận từ form tiếp nhận công khai. | Bản quyền thuộc TicketGo. Proprietary.<br>Chỉ tham khảo tỷ lệ ảnh và quy trình đối tác sinh viên/văn hóa. |

### 3.2. Nền tảng Quốc tế & Mã nguồn mở (Khảo sát Kiến trúc & Workflow)

| Nền tảng | Nguồn tài liệu chính thức | Phân định Thực tế quan sát (Observed Facts) vs Suy luận (Inference) | Giấy phép (License Constraint) |
| :--- | :--- | :--- | :--- |
| **Eventbrite** | [Eventbrite Help Center: How to create an event (551351)](https://www.eventbrite.com/help/en-us/articles/551351/how-to-create-an-event/) | **Thực tế quan sát:**<br>1. Wizard chuẩn gồm các bước: Basic Info → Location (Venue / Online / TBA) → Date & Time (Single vs Recurring series) → Media & Description → Tickets (Paid, Free, Donation; Price, Capacity, Sales window, Min/Max per order) → Order Form → Publish.<br>2. Luôn có nút "Save Draft" ở mọi bước; kiểm tra lỗi chỉ kích hoạt khi bấm "Publish".<br>3. Cho phép cấu hình giới hạn số vé mỗi đơn hàng (Ticket Limit per order). | Proprietary commercial service. |
| **Ticket Tailor** | [Ticket Tailor: How to create your first event](https://help.tickettailor.com/en/articles/15804203-how-to-create-your-first-event-with-ticket-tailor)<br>[Ticket Tailor: How to manage ticket types and groups](https://help.tickettailor.com/en/articles/948763-how-to-manage-ticket-types-and-groups)<br>[Ticket Tailor: How to create a seated event](https://help.tickettailor.com/en/articles/16213774-how-to-create-a-seated-event) | **Thực tế quan sát:**<br>1. Tách biệt rõ "Event Details" và "Ticket Types and Groups" (Standard, VIP, Group tickets).<br>2. Hỗ trợ cấu hình seated event và phân nhóm vé/sức chứa riêng biệt.<br>3. Cho phép kiểm thử bằng vé miễn phí (test mode) trước khi đưa sự kiện lên trạng thái công bố chính thức. | Proprietary commercial SaaS. |
| **pretix** | [pretix Documentation: Creating an event](https://docs.pretix.eu/en/latest/user/events/create.html)<br>GitHub: [`pretix/pretix`](https://github.com/pretix/pretix) | **Thực tế quan sát:**<br>1. Mô hình miền tách biệt hoàn toàn giữa `Event` (thực thể bao bọc) và `SubEvent` (suất diễn con). Cờ `has_subevents` được thiết lập khi khởi tạo.<br>2. Quản lý hạn ngạch (Quota management) độc lập với Hạng vé (Product/Item). Nhiều hạng vé có thể cùng chia sẻ một kho ghế/sức chứa chung.<br>3. Audit log bất biến ghi lại mọi lịch sử chỉnh sửa cấu hình sự kiện của người dùng. | **AGPL-3.0**.<br>Nghiêm cấm sao chép mã nguồn, component hoặc schema migration vào dự án. Chỉ học hỏi mô hình quan hệ Event – SubEvent – Quota. |
| **Hi.Events** | [Hi.Events Documentation](https://github.com/HiEventsDev/hi.events)<br>GitHub: `HiEventsDev/hi.events` | **Thực tế quan sát:**<br>1. Ngăn xếp công nghệ tương đồng: Laravel backend, React / TypeScript frontend.<br>2. Tổ chức giao diện dạng các tab/bước quản lý: General info → Tickets (Free, Paid, Tiered) → Design & Branding (Cover image, Accent color) → Order Form → Settings.<br>3. Hỗ trợ multi-user RBAC trong tổ chức và API OpenAPI chuẩn hóa. | **AGPL-3.0**.<br>Nghiêm cấm sao chép mã nguồn; áp dụng tư duy thiết kế phân tách tab quản lý và giao diện người dùng. |

---

## 4. Danh mục trường dữ liệu chuẩn hóa (Field Catalog & Domain Taxonomy)

Dựa trên phân tích pháp lý, thông lệ thị trường Việt Nam và kiến trúc Event 1:N Show, danh mục trường được phân loại thành 6 nhóm logic và 3 mức độ ưu tiên:
- **Bắt buộc (Required):** Bắt buộc phải có giá trị hợp lệ để được công bố sự kiện (`CONG_KHAI`).
- **Tùy chọn (Optional):** Cho phép để trống, hệ thống áp dụng giá trị mặc định hoặc bỏ qua hiển thị.
- **Tương lai (Future):** Đã được định nghĩa trong mô hình thiết kế nhưng hoãn triển khai sang các pha sau (như thanh toán, thuế, check-in).

```
+--------------------------------------------------------------------------------------------------+
|                                  EVENTTICKETING FIELD CATALOG                                    |
+------------------------------------+-------------------------------------------------------------+
| Nhóm trường                        | Các thực thể liên quan & Mục đích quản lý                   |
+------------------------------------+-------------------------------------------------------------+
| 1. Thông tin chung & Nhận diện     | SU_KIEN (Tên sự kiện, Slug URL, Thể loại, Slogan, Mô tả)    |
| 2. Hình ảnh & Đa phương tiện       | SU_KIEN (Banner 16:9, Poster đứng, Video trailer, Sơ đồ)    |
| 3. Chế độ địa điểm & Không gian   | DIA_DIEM, SU_KIEN (Offline, Online, Hybrid, TBA)            |
| 4. Lịch trình & Đa suất diễn       | SUAT_DIEN (Tên suất, Giờ bắt đầu, Giờ kết thúc, Cửa sổ bán) |
| 5. Phân khu & Hạng vé              | KHU_VUC, GHE (Tên hạng vé, Giá VND, Sức chứa, Giới hạn đơn)  |
| 6. Chính sách, Liên hệ & Pháp lý   | SU_KIEN, TO_CHUC (Độ tuổi, Hoàn hủy, Hotline, Giấy phép)    |
+------------------------------------+-------------------------------------------------------------+
```

### Bảng chi tiết đặc tả danh mục trường

| Mã trường | Tên hiển thị (Tiếng Việt) | Nhóm | Kiểu dữ liệu & Ràng buộc | Bắt buộc / Tùy chọn / Tương lai | Ánh xạ CSDL hiện tại | Ghi chú vận hành & Mặc định |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `name` | Tên sự kiện | 1 | `VARCHAR(255)`, dài 5–255 ký tự | **Bắt buộc** | `SU_KIEN.TenSuKien` | Tiêu đề chính thức của sự kiện |
| `slug` | Định danh URL (Slug) | 1 | `VARCHAR(160)`, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` | **Bắt buộc** | `SU_KIEN.Slug` | Tự động sinh từ tên tiếng Việt, duy nhất toàn hệ thống |
| `category` | Thể loại sự kiện | 1 | `VARCHAR(40)`, thuộc tập enum cho phép | **Bắt buộc** | `SU_KIEN.TheLoai` | `AM_NHAC`, `SAN_KHAU`, `THE_THAO`, `HOI_THAO`, `WORKSHOP`, `THAM_QUAN`, `KHAC` |
| `slogan` | Thông điệp ngắn / Slogan | 1 | `VARCHAR(255)` | Tùy chọn | `SU_KIEN.Slogan` | Hiển thị dưới tiêu đề chính trên banner |
| `description` | Mô tả chi tiết chương trình | 1 | `TEXT`, tối thiểu 20 ký tự khi công bố | **Bắt buộc khi Publish** (Tùy chọn ở Draft) | `SU_KIEN.MoTaChiTiet` | Hỗ trợ định dạng văn bản giới thiệu nghệ sĩ, diễn giả, nội dung |
| `templateKey` | Mẫu giao diện hiển thị | 1 | `VARCHAR(40)` | **Bắt buộc** (Hệ thống gán) | `SU_KIEN.TemplateKey` | Mặc định `DEFAULT`; Super Concert giữ `SUPER_CONCERT_2026` |
| `bannerUrl` | Ảnh bìa ngang (Hero Banner) | 2 | `VARCHAR(500)`, URL định dạng HTTPS | **Bắt buộc khi Publish** (Khuyến nghị 16:9, ~1500x600) | `SU_KIEN.BannerURL` | Cột đã có sẵn trong bảng `SU_KIEN`, chỉ cần đưa lên form UI |
| `posterUrl` | Ảnh poster đứng (Poster) | 2 | `VARCHAR(500)`, URL định dạng HTTPS | Tùy chọn (Tỷ lệ 2:3 hoặc 9:16) | `SU_KIEN.PosterURL` | Hiển thị trên thẻ sự kiện mobile và danh mục |
| `trailerUrl` | Video giới thiệu (Trailer) | 2 | `VARCHAR(500)`, URL YouTube embed/watch | Tùy chọn | `SU_KIEN.TrailerURL` | Cột đã có sẵn trong bảng `SU_KIEN` |
| `seatingMapUrl` | Sơ đồ khán đài tổng thể | 2 | `VARCHAR(500)`, URL ảnh hoặc file vector | Tùy chọn | `SU_KIEN.SoDoTongQuanURL` | Minh họa vị trí các phân khu cho người mua |
| `locationMode` | Hình thức tổ chức | 3 | Enum: `OFFLINE`, `ONLINE`, `HYBRID`, `TBA` | **Bắt buộc** | *Cột mới bổ sung* (`SU_KIEN.LoaiHinhSuKien`) | Mặc định `OFFLINE`. Nếu `ONLINE`, không bắt buộc địa chỉ thực |
| `venueName` | Tên địa điểm / Tòa nhà | 3 | `VARCHAR(200)` | **Bắt buộc** (với Offline) | `SU_KIEN.TenSanVanDong` / `DIA_DIEM.TenDiaDiem` | Ví dụ: Trung tâm Hội nghị Quốc gia, SVĐ Mỹ Đình |
| `address` | Địa chỉ cụ thể | 3 | `TEXT` | **Bắt buộc** (với Offline) | `SU_KIEN.DiaDiem` / `DIA_DIEM.DiaChi` | Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố |
| `onlineLink` | Đường dẫn tham gia trực tuyến | 3 | `TEXT`, URL cuộc họp trực tuyến | Tùy chọn (Bắt buộc nếu Online) | *Cột mới bổ sung* (`SU_KIEN.DuongDanTrucTuyen`) | Link Zoom, Google Meet hoặc nền tảng streaming |
| `onlineInstructions` | Hướng dẫn tham gia online | 3 | `TEXT` | Tùy chọn | *Cột mới bổ sung* (`SU_KIEN.HuongDanThamGiaTrucTuyen`) | Ví dụ: Link truy cập sẽ gửi qua email trước 2 giờ |
| `showList` | Danh sách suất diễn | 4 | Mảng đối tượng Suất diễn (Tối thiểu 1 suất) | **Bắt buộc** | Bảng `SUAT_DIEN` | Quan hệ 1 sự kiện có N suất diễn |
| `show.name` | Tên suất diễn | 4 | `VARCHAR(200)` | **Bắt buộc** | `SUAT_DIEN.TenSuatDien` | Ví dụ: "Đêm 1 · Khởi động", "Đêm diễn chính", "Suất sáng" |
| `show.slug` | Slug của suất diễn | 4 | `VARCHAR(120)`, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` | **Bắt buộc** | `SUAT_DIEN.Slug` | Duy nhất trong phạm vi sự kiện (VD: `dem-1`, `dem-2`) |
| `show.startsAt` | Thời gian bắt đầu suất diễn | 4 | `TIMESTAMPTZ` (ISO 8601) | **Bắt buộc** | `SUAT_DIEN.ThoiGianBatDau` | Giờ mở màn chính thức |
| `show.endsAt` | Thời gian kết thúc suất diễn | 4 | `TIMESTAMPTZ` (ISO 8601) | **Bắt buộc** | `SUAT_DIEN.ThoiGianKetThuc` | Phải sau thời gian bắt đầu |
| `show.doorsOpenAt` | Thời gian mở cửa đón khách | 4 | `TIMESTAMPTZ` (ISO 8601) | Tùy chọn | *Cột mới bổ sung* (`SUAT_DIEN.ThoiGianMoCua`) | Thường trước giờ diễn 60–120 phút |
| `show.saleStartsAt` | Thời gian mở cổng bán vé | 4 | `TIMESTAMPTZ` (ISO 8601) | **Bắt buộc** | `SUAT_DIEN.ThoiGianMoBanVe` | Phải trước thời gian bắt đầu suất diễn |
| `show.saleEndsAt` | Thời gian đóng cổng bán vé | 4 | `TIMESTAMPTZ` (ISO 8601) | Tùy chọn | `SUAT_DIEN.ThoiGianDongBanVe` | Phải sau mở bán và không muộn hơn giờ bắt đầu |
| `ticketTiers` | Danh sách hạng vé theo suất | 5 | Mảng phân khu (Tối thiểu 1 hạng vé/suất) | **Bắt buộc** | Bảng `KHU_VUC` | Mỗi suất diễn phải có ít nhất 1 hạng vé bán được |
| `tier.code` | Mã phân khu / Hạng vé | 5 | `VARCHAR(50)`, chữ hoa, số và gạch dưới | **Bắt buộc** | `KHU_VUC.MaKhuVuc` | Duy nhất trong suất diễn (VD: `EARLY_BIRD`, `VIP`, `GA`) |
| `tier.name` | Tên hiển thị hạng vé | 5 | `VARCHAR(150)` | **Bắt buộc** | `KHU_VUC.TenKhuVuc` | Ví dụ: "Vé Tiêu chuẩn", "Vé VIP Diamond" |
| `tier.price` | Giá vé niêm yết (VNĐ) | 5 | `DECIMAL(15,2)`, >= 0, làm tròn hàng nghìn | **Bắt buộc** | `KHU_VUC.GiaVeNiemYet` | 0 đ nếu vé miễn phí; > 0 đ với vé có thu tiền |
| `tier.capacity` | Sức chứa / Số lượng vé phát hành | 5 | `INT`, >= 1 | **Bắt buộc** | `KHU_VUC.TongSoGhe` | Số lượng vé tối đa được bán ra cho hạng vé này |
| `tier.type` | Loại phân khu | 5 | `VARCHAR(50)`: `DUNG_STAND` hoặc `GHE_NGOI` | **Bắt buộc** | `KHU_VUC.LoaiKhuVuc` | Mặc định `DUNG_STAND` cho vé tự do; `GHE_NGOI` khi có số ghế |
| `tier.color` | Mã màu đại diện trên sơ đồ | 5 | `VARCHAR(20)`, mã HEX hợp lệ (`#RRGGBB`) | Tùy chọn (Mặc định `#84CC16`) | `KHU_VUC.MauSacHex` | Dùng để tô màu trực quan trên thẻ vé và sơ đồ |
| `tier.benefits` | Đặc quyền / Quyền lợi hạng vé | 5 | `TEXT` | Tùy chọn | `KHU_VUC.MoTaQuyenLoi` | Ví dụ: Bao gồm đồ uống, soundcheck, lối vào riêng |
| `tier.minPerOrder` | Số vé tối thiểu mỗi đơn | 5 | `INT`, >= 1 | Tùy chọn (Mặc định 1) | *Cột mới bổ sung* (`KHU_VUC.SoVeToiThieuMoiDon`) | Ngăn chặn đơn hàng rỗng |
| `tier.maxPerOrder` | Số vé tối đa mỗi đơn | 5 | `INT`, từ 1 đến 10 | Tùy chọn (Mặc định 4) | *Cột mới bổ sung* (`KHU_VUC.SoVeToiDaMoiDon`) | Chống đầu cơ vé chợ đen |
| `ageRestriction` | Quy định độ tuổi tham gia | 6 | `VARCHAR(100)`, mặc định `14+` | Tùy chọn | `SU_KIEN.QuyDinhDoTuoi` | Cột đã có sẵn trong bảng `SU_KIEN` (`All ages`, `14+`, `18+`) |
| `refundPolicy` | Chính sách hoàn / hủy / đổi vé | 6 | `TEXT` | **Bắt buộc khi Publish** | *Cột mới bổ sung* (`SU_KIEN.ChinhSachHoanHuy`) | Quy định rõ vé đã mua có được hoàn trả hay đổi suất không |
| `termsAndConditions`| Quy định an ninh & Vật dụng cấm | 6 | `TEXT` | Tùy chọn | *Cột mới bổ sung* (`SU_KIEN.QuyDinhThamGia`) | Cấm chất cháy nổ, máy quay phim chuyên nghiệp, đồ ăn ngoài |
| `contactEmail` | Email hỗ trợ người mua vé | 6 | `VARCHAR(150)`, định dạng email hợp lệ | **Bắt buộc khi Publish** | *Cột mới bổ sung* (`SU_KIEN.EmailLienHe`) | Kênh tiếp nhận thắc mắc cho khán giả |
| `contactHotline` | Số điện thoại Hotline hỗ trợ | 6 | `VARCHAR(30)`, định dạng SĐT Việt Nam | **Bắt buộc khi Publish** | *Cột mới bổ sung* (`SU_KIEN.HotlineLienHe`) | Hỗ trợ khẩn cấp qua điện thoại / Zalo |
| `organizerFanpage` | Trang cộng đồng / Fanpage | 6 | `VARCHAR(500)`, URL Facebook/Instagram | Tùy chọn | *Cột mới bổ sung* (`SU_KIEN.FanpageURL`) | Kênh cập nhật thông báo chính thức của BTC |
| `permitNumber` | Số giấy phép / Văn bản biểu diễn | 6 | `VARCHAR(100)` | Tùy chọn (Khuyến nghị biểu diễn) | *Cột mới bổ sung* (`SU_KIEN.SoGiayPhepBieuDien`) | Số văn bản chấp thuận của Sở VHTT theo NĐ 144/2020 |
| `bankAccountInfo` | Thông tin tài khoản thụ hưởng | 6 | Cấu trúc JSONB (Ngân hàng, Số TK, Tên) | **Tương lai (Future Scope)** | Bảng cấu hình thanh toán tương lai | Chưa triển khai ở pha hiện tại; tránh giả lập settlement |
| `vatInvoiceSupport`| Hỗ trợ xuất hóa đơn GTGT | 6 | `BOOLEAN`, mặc định `FALSE` | **Tương lai (Future Scope)** | Quản lý hóa đơn doanh nghiệp tương lai | Khán giả yêu cầu xuất hóa đơn công ty |

---

## 5. Quy tắc kiểm thực & Bất biến quan hệ liên trường (Validation Rules & Cross-Field Invariants)

Hệ thống phân tách rành mạch hai cấp độ kiểm thực:
1. **Kiểm thực lưu bản nháp (Permissive Draft Validation):** Chỉ kiểm tra tính hợp lệ cơ bản của dữ liệu đang nhập để người dùng không bao giờ bị mất dữ liệu giữa chừng.
2. **Kiểm thực xuất bản sự kiện (Strict Publish Invariants):** Đảm bảo tính toàn vẹn dữ liệu ở cấp độ cơ sở dữ liệu, chặn mọi trạng thái mâu thuẫn trước khi công bố ra thị trường công khai.

### 5.1. Bất biến thứ tự thời gian (Chronological Invariants)
Đối với mỗi suất diễn $s \in S$:
1. **Thời gian biểu diễn:**  
   $$\text{ThoiGianKetThuc}(s) > \text{ThoiGianBatDau}(s)$$  
   *Thông báo lỗi:* "Thời gian kết thúc suất diễn phải sau thời gian bắt đầu."
2. **Thời gian mở cửa đón khách (nếu có):**  
   $$\text{ThoiGianMoCua}(s) \le \text{ThoiGianBatDau}(s)$$  
   *Thông báo lỗi:* "Thời gian mở cửa phải trước hoặc trùng với giờ bắt đầu suất diễn."
3. **Cửa sổ bán vé:**  
   $$\text{ThoiGianMoBanVe}(s) < \text{ThoiGianBatDau}(s)$$  
   *Thông báo lỗi:* "Thời gian mở bán vé phải diễn ra trước khi suất diễn bắt đầu."
4. **Thời điểm đóng bán vé:**  
   $$\text{ThoiGianDongBanVe}(s) > \text{ThoiGianMoBanVe}(s) \quad \text{và} \quad \text{ThoiGianDongBanVe}(s) \le \text{ThoiGianBatDau}(s)$$  
   *Thông báo lỗi:* "Thời gian đóng bán vé phải sau thời gian mở bán và không được muộn hơn giờ bắt đầu biểu diễn."
5. **Quan hệ thời gian giữa các suất diễn (Multi-show ordering):**  
   Các suất diễn trong cùng một sự kiện không được có mốc thời gian hoàn toàn trùng lặp nếu diễn ra tại cùng một địa điểm khán phòng. Nếu Suất 2 diễn ra sau Suất 1, khuyến nghị $\text{ThoiGianBatDau}(s_2) \ge \text{ThoiGianKetThuc}(s_1)$.

### 5.2. Bất biến sức chứa, phân khu & giá vé (Capacity & Pricing Invariants)
Đối với mỗi phân khu / hạng vé $z \in Z_s$ thuộc suất diễn $s$:
1. **Giá vé hợp lệ:**  
   $$\text{GiaVeNiemYet}(z) \ge 0$$  
   Giá vé phải là số nguyên (không có xu lẻ tại Việt Nam) và khuyến nghị là bội số của 1.000 VNĐ nếu $\text{GiaVeNiemYet} > 0$.
2. **Sức chứa từng hạng vé:**  
   $$\text{TongSoGhe}(z) \ge 1$$  
   Không được phép tạo hạng vé có sức chứa bằng 0.
3. **Tổng sức chứa của suất diễn so với địa điểm:**  
   $$\sum_{z \in Z_s} \text{TongSoGhe}(z) \le \text{DiaDiem.SucChua} \quad (\text{nếu } \text{DiaDiem.SucChua} \text{ được cấu hình})$$  
   *Cảnh báo an toàn:* Tổng số vé phát hành của các phân khu không được vượt quá tải trọng an toàn của địa điểm tổ chức.
4. **Giới hạn số lượng vé trên đơn hàng (Order limits):**  
   $$1 \le \text{SoVeToiThieuMoiDon}(z) \le \text{SoVeToiDaMoiDon}(z) \le 10$$  
   Mặc định: Tối thiểu 1 vé, tối đa 4 vé để phòng ngừa hiện tượng đầu cơ vé.

### 5.3. Bất biến định danh & Chuẩn hóa dữ liệu (Identity & Normalization)
1. **Slug duy nhất và chuẩn hóa URL:**  
   - Slug sự kiện: Biểu thức chính quy `^[a-z0-9]+(?:-[a-z0-9]+)*$`, độ dài 3–160 ký tự, không chứa ký tự viết hoa hoặc khoảng trắng.  
   - Tự động chuẩn hóa dấu tiếng Việt: xóa dấu thanh, chuyển `đ/Đ` thành `d`, chuyển ký tự đặc biệt thành dấu gạch nối `-`, loại bỏ dấu gạch nối lặp lại hoặc ở đầu/cuối chuỗi (tương thích logic [`toSlug`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/OrganizerPortal.tsx#L33-L41) và [`deduplicateSlug`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/domain/publicRoute.js)).
2. **Slug suất diễn cục bộ:**  
   Mỗi suất diễn có một slug con duy nhất trong phạm vi sự kiện đó (`UNIQUE("SuKienID", "Slug")`), ví dụ: `dem-1`, `dem-2`, `suat-chieu`.

---

## 6. Kiến trúc Wizard nhiều bước & Cơ chế Lưu bản nháp (Multi-Step Wizard & Save-Draft Blueprint)

Thay cho modal đơn màn hình hiện tại, chúng tôi đề xuất cấu trúc **Wizard 6 bước** rõ ràng, có thanh tiến trình (progress bar), hỗ trợ quay lại bước trước mà không mất dữ liệu, và nút **"Lưu bản nháp"** luôn thường trực ở góc trên bên phải.

```
+----------------------------------------------------------------------------------------------------+
|                                    ORGANIZER EVENT WIZARD                                          |
+----------------------------------------------------------------------------------------------------+
|  [1. Thông tin]  -->  [2. Suất diễn]  -->  [3. Hạng vé]  -->  [4. Media]  -->  [5. Chính sách]  -->  [6. Xuất bản]  |
+----------------------------------------------------------------------------------------------------+
|  Tiêu đề, Slug,        Mô hình địa điểm,    Bảng phân khu,     Hero Banner,      Độ tuổi,          Kiểm tra checklist,  |
|  Thể loại, Slogan,     đa suất diễn,        giá bán, sức       Poster đứng,      Hoàn hủy,         Xem trước (Preview), |
|  Mô tả chi tiết        cửa sổ bán vé        chứa, quyền lợi    Trailer video     Hotline, Email    Công bố chính thức   |
+------------------------------------+-----------------------------------+---------------------------+
|  [<- Quay lại]                     |  [Lưu bản nháp tạm thời]          |  [Tiếp tục bước sau ->]   |
+------------------------------------+-----------------------------------+---------------------------+
```

### 6.1. Chi tiết từng bước trong Wizard

#### Bước 1: Thông tin cơ bản & Thể loại (Basic Details & Categorization)
- **Mục tiêu:** Định hình nhận diện ban đầu của sự kiện.
- **Trường nhập:** Tên sự kiện, Slug (có cơ chế tự sinh từ tên và nút mở khóa để tùy chỉnh thủ công), Thể loại (chọn từ 7 nhóm chuẩn), Slogan ngắn, Mô tả chi tiết (khung soạn thảo văn bản).
- **Hành vi khi Lưu nháp:** Chỉ cần Tên sự kiện $\ge 5$ ký tự và Tổ chức hợp lệ là hệ thống cho phép tạo bản ghi `BAN_NHAP` ngay lập tức và sinh ra `SuKienID`.

#### Bước 2: Thời gian, Địa điểm & Suất diễn (Multi-show Schedule & Location)
- **Mục tiêu:** Cấu hình một hoặc nhiều buổi diễn và địa điểm tổ chức.
- **Lựa chọn chế độ địa điểm:**
  - *Sự kiện trực tiếp (In-person / Offline):* Nhập Tên địa điểm, Địa chỉ chi tiết.
  - *Sự kiện trực tuyến (Online):* Nhập nền tảng tổ chức (Zoom/Meet/Stream) và Hướng dẫn tham gia.
  - *Địa điểm công bố sau (To be announced - TBA):* Đánh dấu cờ tạm thời chưa công bố địa điểm.
- **Quản lý đa suất diễn (Multi-show manager):**
  - Mặc định khởi tạo Suất diễn 1.
  - Nút **"+ Thêm suất diễn"** cho phép tạo thêm Suất 2, Suất 3...
  - Mỗi suất có: Tên suất diễn, Slug suất, Giờ bắt đầu, Giờ kết thúc, Giờ mở cửa, Thời gian mở bán và đóng bán vé.

#### Bước 3: Phân khu & Hạng vé (Ticket Tiers & Capacity)
- **Mục tiêu:** Thiết lập các loại vé và sức chứa bán vé cho từng suất diễn.
- **Cơ chế phân bổ vé:**
  - Hiển thị danh sách vé theo từng suất diễn.
  - Cung cấp tính năng **"Sao chép hạng vé từ Suất 1"** (Copy tiers from Show 1) để tiết kiệm thời gian cho các sự kiện biểu diễn nhiều đêm tương đồng.
  - Mỗi hạng vé gồm: Tên vé (VD: Early Bird, Regular, VIP), Mã vé, Giá vé (VNĐ), Sức chứa, Loại phân khu (`DUNG_STAND` hoặc `GHE_NGOI`), Màu sắc phân biệt, Quyền lợi đi kèm, Giới hạn vé tối đa/tối thiểu mỗi đơn hàng.
  - Thống kê trực quan: Tự động cộng tổng sức chứa của các phân khu và hiển thị tổng doanh thu dự kiến nếu bán hết vé.

#### Bước 4: Media & Nhận diện thương hiệu (Media & Visual Assets)
- **Mục tiêu:** Tải lên hình ảnh nhận diện hiển thị trên Marketplace và trang sự kiện.
- **Trường nhập:**
  - *Ảnh Hero Banner (16:9 / chuẩn web desktop):* Bắt buộc khi công bố. Có khung xem trước tỷ lệ thực.
  - *Ảnh Poster đứng (2:3 hoặc 3:4):* Tối ưu hiển thị cho thiết bị di động và danh mục sự kiện.
  - *Đường dẫn Video Trailer (YouTube):* Xem trước video nhúng trực tiếp.
  - *Sơ đồ khán đài (Seating map preview):* Ảnh tĩnh minh họa vị trí các phân khu.

#### Bước 5: Chính sách, Liên hệ & Pháp lý (Policies, Guidelines & Contact)
- **Mục tiêu:** Đảm bảo quyền lợi khách hàng và minh bạch thông tin hỗ trợ theo chuẩn sàn TMĐT Việt Nam.
- **Trường nhập:**
  - Quy định độ tuổi tham gia (chọn nhanh `All ages`, `14+`, `16+`, `18+` hoặc nhập tùy biến).
  - Chính sách hoàn / hủy / đổi vé (các mẫu văn bản gợi ý sẵn: "Vé không hoàn hủy", "Hỗ trợ đổi suất trước 48h"...).
  - Quy định an ninh & vật dụng cấm mang vào sự kiện.
  - Email hỗ trợ và Số điện thoại Hotline tiếp nhận giải đáp thắc mắc.
  - Link Fanpage Facebook / Instagram chính thức của BTC.
  - Số giấy phép biểu diễn / Văn bản phê duyệt (nếu có).

#### Bước 6: Xem trước & Sẵn sàng xuất bản (Preview & Publish Readiness Checklist)
- **Mục tiêu:** Tổng hợp toàn bộ thông tin, phát hiện lỗi thiếu sót và cho phép xem trước trang sự kiện thật trước khi bấm nút Công bố.
- **Nội dung:**
  - Bảng kiểm tra điều kiện xuất bản (Readiness Checklist) dạng đèn tín hiệu Xanh / Đỏ.
  - Nút **"Xem trước trang sự kiện"** (Authenticated Preview) mở trang giao diện công khai trong chế độ xem trước dành riêng cho thành viên tổ chức.
  - Nút **"Công bố sự kiện"** (chỉ khả dụng khi toàn bộ các điều kiện bắt buộc đạt trạng thái Hợp lệ).

### 6.2. Vòng đời Bản nháp & Cơ chế Lưu từng phần (Save-Draft Lifecycle)

Khác với RPC `tao_ban_nhap_su_kien` hiện tại (bắt buộc truyền đủ 13 tham số mới chèn dữ liệu), mô hình mới hỗ trợ lưu bản nháp linh hoạt:
1. **Khởi tạo bản nháp (Draft Creation):** Khi hoàn tất Bước 1, hệ thống chèn bản ghi vào `SU_KIEN` với `TrangThaiCongBo = 'BAN_NHAP'`.
2. **Cập nhật từng phần (Incremental Auto-save / Manual Save):** Khi người dùng chuyển bước hoặc bấm "Lưu bản nháp", client gửi cập nhật từng phần (partial update) vào cơ sở dữ liệu. Dữ liệu chưa hoàn thiện ở các bước sau không làm lỗi bản ghi ở các bước trước.
3. **Cách ly hoàn toàn với người dùng ẩn danh:** Nhờ chính sách RLS `Public reads published events` (`TrangThaiCongBo = 'CONG_KHAI'`), toàn bộ các bản ghi sự kiện, suất diễn và phân khu ở trạng thái `BAN_NHAP` hoàn toàn vô hình đối với người mua vé trên Marketplace.

---

## 7. Quy tắc Đa suất diễn & Đa hạng vé (Multi-Show & Multi-Tier Business Rules)

### 7.1. Cấu trúc quan hệ Suất diễn và Hạng vé
Trong thực tế tổ chức sự kiện, có hai mô hình cấu hình hạng vé:
- **Mô hình A (Độc lập theo suất - Show-isolated Tiers):** Mỗi suất diễn có một tập hợp phân khu riêng biệt trong bảng `KHU_VUC` (`SuatDienID` là khóa ngoại bắt buộc). Đây chính là kiến trúc đã được triển khai trong Product Foundation ([`20261005090000_product_foundation.sql#L138-L154`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/supabase/migrations/20261005090000_product_foundation.sql#L138-L154)).
- **Mô hình B (Ma trận vé chia sẻ hạn ngạch - Shared Quota Matrix):** Một hạng vé áp dụng chung cho mọi đêm diễn và chia sẻ kho vé (phổ biến ở pretix).

**Quyết định kiến trúc cho EventTicketing:**
Áp dụng nhất quán **Mô hình A** để tương thích 100% với lược đồ CSDL hiện tại. Để giải quyết bất tiện phải nhập lại nhiều lần cho BTC, giao diện Wizard cung cấp nút chức năng **"Sao chép hạng vé sang các suất khác"** (Clone tier configuration to other shows). Khi bấm nút này, frontend sẽ tự động nhân bản danh sách phân khu của Suất 1 sang Suất 2 với các mã phân khu tương ứng, giúp BTC chỉ cần điều chỉnh lại giá vé hoặc sức chứa nếu có chênh lệch.

### 7.2. Phân loại vé: Ghế ngồi (`GHE_NGOI`) vs Vé đứng (`DUNG_STAND`)
- **Vé đứng / Tự do (`DUNG_STAND`):**
  - Áp dụng cho các sự kiện phổ thông, workshop, hội thảo, nhạc hội sinh viên.
  - Quản lý tồn kho dựa trên số đếm sức chứa (`TongSoGhe`).
  - Khi giữ chỗ hoặc mua vé, RPC `tao_giu_cho_theo_suat` trừ trực tiếp số lượng vé khả dụng mà không yêu cầu tọa độ ghế.
- **Vé có số ghế (`GHE_NGOI`):**
  - Áp dụng cho nhà hát, khán phòng có sơ đồ cố định hoặc Super Concert.
  - Cần có danh sách bản ghi chi tiết trong bảng `GHE` gắn với `KhuVucID`.
  - Đối với các sự kiện mẫu chung (`DEFAULT`), khuyến nghị BTC sử dụng hình thức `DUNG_STAND` (General Admission / Free Seating) để đơn giản hóa vận hành; mẫu `SUPER_CONCERT_2026` tiếp tục sử dụng hệ thống ghế SVG chuyên biệt.

---

## 8. Bảng kiểm tra sẵn sàng xuất bản & Cơ chế Xem trước (Publish Readiness & Preview Checklist)

Trước khi kích hoạt RPC `cong_bo_su_kien`, hệ thống hiển thị một bảng kiểm tra tự động (Pre-flight Inspection) tại Bước 6 của Wizard.

### 8.1. Danh mục các mục kiểm tra sẵn sàng (Pre-flight Checklist)

| STT | Hạng mục kiểm tra | Mức độ nghiêm trọng | Tiêu chí hợp lệ | Trạng thái hiển thị |
| :---: | :--- | :---: | :--- | :---: |
| 1 | **Tên sự kiện & Slug** | **BẮT BUỘC (Blocker)** | Tên $\ge 5$ ký tự, slug hợp lệ và không trùng lặp | 🟢 Đạt / 🔴 Lỗi |
| 2 | **Thể loại & Mô tả** | **BẮT BUỘC (Blocker)** | Thể loại hợp lệ, mô tả chi tiết $\ge 20$ ký tự | 🟢 Đạt / 🔴 Lỗi |
| 3 | **Địa điểm tổ chức** | **BẮT BUỘC (Blocker)** | Có tên địa điểm & địa chỉ (nếu Offline) hoặc link (nếu Online) | 🟢 Đạt / 🔴 Lỗi |
| 4 | **Số lượng suất diễn** | **BẮT BUỘC (Blocker)** | Tối thiểu có ít nhất 1 suất diễn | 🟢 Đạt / 🔴 Lỗi |
| 5 | **Thời gian suất diễn** | **BẮT BUỘC (Blocker)** | Giờ kết thúc > giờ bắt đầu cho mọi suất diễn | 🟢 Đạt / 🔴 Lỗi |
| 6 | **Cửa sổ bán vé** | **BẮT BUỘC (Blocker)** | Mở bán < giờ diễn; Đóng bán > mở bán và $\le$ giờ diễn | 🟢 Đạt / 🔴 Lỗi |
| 7 | **Hạng vé bán được** | **BẮT BUỘC (Blocker)** | Mỗi suất diễn phải có ít nhất 1 hạng vé có `TongSoGhe > 0` và `GiaVe >= 0` | 🟢 Đạt / 🔴 Lỗi |
| 8 | **Ảnh Banner chính** | **BẮT BUỘC (Blocker)** | Có URL ảnh Banner 16:9 hợp lệ | 🟢 Đạt / 🔴 Lỗi |
| 9 | **Thông tin hỗ trợ** | **BẮT BUỘC (Blocker)** | Có Email và Hotline liên hệ hỗ trợ hợp lệ | 🟢 Đạt / 🔴 Lỗi |
| 10 | **Chính sách hoàn hủy**| **BẮT BUỘC (Blocker)** | Đã nêu rõ quy định hoàn vé cho khán giả | 🟢 Đạt / 🔴 Lỗi |
| 11 | **Ảnh Poster đứng** | *KHUYẾN NGHỊ (Warning)* | Có ảnh poster đứng để tối ưu hiển thị mobile | 🟡 Cảnh báo nếu thiếu |
| 12 | **Quy định độ tuổi** | *KHUYẾN NGHỊ (Warning)* | Đã thiết lập độ tuổi tham gia (mặc định 14+) | 🟡 Cảnh báo nếu thiếu |

*Quy tắc kích hoạt nút "Công bố":* Nút chỉ chuyển sang trạng thái khả dụng (enabled) khi 100% các mục **BẮT BUỘC (Blocker)** đạt trạng thái 🟢 Đạt. Các mục Khuyến nghị chỉ hiển thị cảnh báo màu vàng nhưng không chặn xuất bản.

### 8.2. Giải pháp kỹ thuật cho chế độ Xem trước bản nháp (Authenticated Draft Preview)
- **Vấn đề kỹ thuật hiện tại:**  
  Trang chi tiết công khai ([`src/services/eventService.ts#L248-L249`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/services/eventService.ts#L248-L249)) truy vấn bằng bộ lọc cứng `.eq('TrangThaiCongBo', 'CONG_KHAI')`. Người dùng ẩn danh không thể xem bản nháp, nhưng chính thành viên BTC khi bấm xem thử cũng bị báo lỗi `PublicEventNotFoundError`.
- **Giải pháp kiến trúc đề xuất:**
  1. Thêm tuyến đường xem trước dành riêng cho BTC: `/?route=/organizer/preview/:eventSlug` hoặc thêm tham số `?preview=true`.
  2. Hàm `loadEventForPreview(slug)` trong `organizerService.ts` thực hiện truy vấn với phiên xác thực của BTC (`authenticated`). RLS chính sách `"Members read their events"` ([`20261005150000_marketplace_organizer_mvp.sql#L208-L211`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/supabase/migrations/20261005150000_marketplace_organizer_mvp.sql#L208-L211)) cho phép thành viên tổ chức đọc bản ghi `BAN_NHAP` của chính họ mà không làm lộ dữ liệu ra công chúng.
  3. Giao diện xem trước tái sử dụng 100% component [`GenericEventPage`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/src/components/GenericEventPage.tsx), hiển thị một thanh banner màu vàng ở đầu trang: `[CHẾ ĐỘ XEM TRƯỚC - BẢN NHÁP CHƯA CÔNG BỐ]`, kèm nút "Quay lại chỉnh sửa Wizard".

---

## 9. Ánh xạ Lược đồ Cơ sở Dữ liệu & Phân tích Khoảng cách Kỹ thuật (Schema & RPC Mapping)

### 9.1. Các cột hiện có trong CSDL có thể tái sử dụng ngay lập tức
Bảng `SU_KIEN` hiện tại (được khởi tạo từ [`EventTicketing_Sprint1_MySQL.sql`](file:///D:/FTU/Year%203/First/Ph%C3%A2n%20t%C3%ADch%20v%C3%A0%20thi%E1%BA%BFt%20k%E1%BA%BF%20h%E1%BB%87%20th%E1%BB%91ng/Eventticketing/EventTicketing_Sprint1_MySQL.sql) và mở rộng qua migration) **đã có sẵn** nhiều cột giá trị nhưng chưa được khai thác trên UI của BTC:
- `BannerURL`: URL ảnh ngang của sự kiện.
- `PosterURL`: URL ảnh poster đứng.
- `TrailerURL`: URL video trailer YouTube.
- `SoDoTongQuanURL`: URL ảnh sơ đồ khán đài.
- `QuyDinhDoTuoi`: Quy định độ tuổi (mặc định `'14+'`).
- `Slogan`: Thông điệp truyền thông.

*Kết luận:* Frontend hoàn toàn có thể đưa ngay các trường này lên Wizard mà **không cần tạo thêm cột mới** cho các mục trên.

### 9.2. Các cột đề xuất bổ sung có kiểm soát (Additive Schema Delta)
Để đáp ứng đầy đủ các yêu cầu nghiệp vụ chuyên sâu mà không ảnh hưởng tới dữ liệu cũ, đề xuất migration bổ sung:

```sql
-- Migration bổ sung (Additive Delta): Không phá vỡ dữ liệu cũ
ALTER TABLE public."SU_KIEN"
  ADD COLUMN IF NOT EXISTS "LoaiHinhSuKien" VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
    CHECK ("LoaiHinhSuKien" IN ('OFFLINE', 'ONLINE', 'HYBRID', 'TBA')),
  ADD COLUMN IF NOT EXISTS "DuongDanTrucTuyen" TEXT,
  ADD COLUMN IF NOT EXISTS "HuongDanThamGiaTrucTuyen" TEXT,
  ADD COLUMN IF NOT EXISTS "ChinhSachHoanHuy" TEXT,
  ADD COLUMN IF NOT EXISTS "QuyDinhThamGia" TEXT,
  ADD COLUMN IF NOT EXISTS "EmailLienHe" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "HotlineLienHe" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "FanpageURL" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "SoGiayPhepBieuDien" VARCHAR(100);

ALTER TABLE public."SUAT_DIEN"
  ADD COLUMN IF NOT EXISTS "ThoiGianMoCua" TIMESTAMPTZ;

ALTER TABLE public."KHU_VUC"
  ADD COLUMN IF NOT EXISTS "SoVeToiThieuMoiDon" INT NOT NULL DEFAULT 1 CHECK ("SoVeToiThieuMoiDon" >= 1),
  ADD COLUMN IF NOT EXISTS "SoVeToiDaMoiDon" INT NOT NULL DEFAULT 4 CHECK ("SoVeToiDaMoiDon" >= "SoVeToiThieuMoiDon");
```

### 9.3. Kiến trúc Thao tác Dữ liệu: RPC Lưu trữ vs PostgREST Trực tiếp

Hiện tại, việc tạo sự kiện đi qua RPC nguyên khối `tao_ban_nhap_su_kien`. Khi chuyển sang Wizard nhiều bước với nhiều suất diễn và nhiều phân khu, có hai phương án kiến trúc:

| Tiêu chí | Phương án 1: Tạo thêm các RPC chuyên biệt (`them_suat_dien`, `them_phan_khu`...) | Phương án 2: Kết hợp PostgREST CRUD trực tiếp + RPC Quản trị (`cong_bo_su_kien`) (Khuyến nghị) |
| :--- | :--- | :--- |
| **Cách thức hoạt động** | Viết riêng từng hàm PL/pgSQL `SECURITY DEFINER` cho mỗi thao tác tạo/sửa suất diễn, tạo/sửa hạng vé. | Khai thác chính sách RLS hiện có (`Editors manage their events`, `Editors manage their shows`, `Editors manage show zones`) để client thực hiện INSERT/UPDATE/DELETE trực tiếp theo chuẩn Supabase. |
| **Ưu điểm** | Đóng gói 100% logic trong database. | Tận dụng tối đa chuẩn Supabase JS Client; code linh hoạt; không cần viết hàng loạt hàm RPC vụn vặt; RLS đã được kiểm chứng pgTAP 23/23 test. |
| **Bảo mật** | Chặt chẽ qua tham số hàm. | **Tuyệt đối an toàn:** Trigger `trg_kiem_tra_cong_bo_su_kien` đã có sẵn ngăn chặn triệt để việc client tự ý chuyển trạng thái sang `CONG_KHAI`. Chỉ RPC `cong_bo_su_kien` mới được quyền xuất bản sau khi kiểm tra đủ điều kiện. |
| **Lựa chọn** | Dự phòng khi có logic giao dịch phức tạp | **ĐƯỢC CHỌN CHO BẢN THIẾT KẾ NÀY** |

---

## 10. Lát cắt Triển khai Khả thi Tiếp theo (Phased Implementation Slice)

Để bàn giao ngay giá trị cho người dùng mà không mở rộng phạm vi sang thanh toán, QR code hay check-in, lộ trình được chia thành 3 lát cắt rõ ràng:

### Lát cắt 1 (Phase 1 — Sẽ thực hiện ở vòng kế tiếp): Frontend Wizard UI & Dịch vụ Quản trị Đa suất diễn
- **Mục tiêu:** Thay thế modal 1 màn hình bằng Wizard 6 bước, hỗ trợ thêm nhiều suất diễn và nhiều hạng vé.
- **Phạm vi mã nguồn:**
  1. Cập nhật `src/components/OrganizerPortal.tsx`: Thay thế modal phẳng bằng component `OrganizerEventWizard` 6 bước.
  2. Bổ sung `src/domain/organizerValidation.js`: Mở rộng các hàm kiểm thực danh sách suất diễn, danh sách phân khu và kiểm tra readiness checklist.
  3. Cập nhật `src/services/organizerService.ts`: Bổ sung các phương thức lưu bản nháp từng phần, thêm/xóa/sửa suất diễn và phân khu qua PostgREST, nạp dữ liệu bản nháp để chỉnh sửa.
  4. Bổ sung giao diện Xem trước bản nháp (`PreviewMode`) dành cho BTC.
- **Ràng buộc:** Giữ nguyên 100% tính tương thích của Super Concert và các test UAT hiện có (`npm run test:uat`).

### Lát cắt 2 (Phase 2): Tối ưu hóa Bản mẫu Hạng vé & Tải ảnh Media
- **Mục tiêu:** Hỗ trợ tính năng sao chép phân khu giữa các suất diễn và tích hợp tải ảnh trực tiếp qua Supabase Storage bucket `event-media` (hoặc nhập URL ảnh ngoài).
- **Phạm vi mã nguồn:** Cấu hình Storage bucket, RLS cho phép Editor tải ảnh theo thư mục tổ chức `org_id/*`.

### Các hạng mục Nằm ngoài Phạm vi Hiện tại (Out of Scope / Future Backlog)
- Tích hợp cổng thanh toán trực tuyến, VietQR, Webhook và xử lý hoàn tiền.
- Phát hành mã vé E-ticket QR có chữ ký số.
- Ứng dụng di động soát vé tại cửa (Check-in Scanner App).
- Kê khai thuế, xuất hóa đơn VAT điện tử và quyết toán tài chính (KYC / Settlement).
- Báo cáo số liệu phân tích tài chính chuyên sâu (Analytics Dashboard).

---

## 11. Bảng Phân định Trách nhiệm Quyền hạn (RBAC Matrix)

Dựa trên cấu trúc vai trò thành viên tổ chức đã được kiểm chứng trong `THANH_VIEN_TO_CHUC`:

| Hành động trên Sự kiện | Chủ sở hữu (`CHU_SO_HUU`) | Quản trị viên (`QUAN_TRI`) | Biên tập viên (`BIEN_TAP`) | Vận hành (`VAN_HANH`) | Soát vé (`SOAT_VE`) | Người dùng công khai (`anon`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Xem danh sách bản nháp trong Studio | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép (Chỉ xem) | ❌ Chặn | ❌ Chặn |
| Tạo bản nháp sự kiện mới | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ❌ Chặn (Read-only) | ❌ Chặn | ❌ Chặn |
| Thêm/Sửa/Xóa Suất diễn & Hạng vé | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ❌ Chặn (Read-only) | ❌ Chặn | ❌ Chặn |
| Xem trước trang sự kiện (Preview) | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ❌ Chặn | ❌ Chặn |
| Công bố sự kiện (`cong_bo_su_kien`) | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ❌ Chặn | ❌ Chặn | ❌ Chặn |
| Xem sự kiện đã công bố trên Marketplace| ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép |

---

## 12. Kế hoạch Nghiệm thu Kỹ thuật (Acceptance & Verification Plan)

Khi lát cắt kỹ thuật tiếp theo được triển khai, kỹ sư cấp cao có thể nghiệm thu chất lượng thông qua các tiêu chí sau:

1. **Kiểm thử đơn vị & Tích hợp (Unit & Validation Tests):**
   - Chạy `npm run test`: Đảm bảo 100% các bài test hiện tại tiếp tục PASS.
   - Bổ sung bộ test mới cho kiểm thực đa suất diễn (multi-show chronological order), đa hạng vé (multi-tier positive capacity & price), và bộ kiểm tra readiness checklist.
2. **Kiểm thử giao diện người dùng (Studio UI Walkthrough):**
   - Đăng nhập tài khoản BTC thuộc tổ chức có quyền biên tập.
   - Khởi tạo sự kiện mới qua Wizard 6 bước.
   - Tạo ít nhất 2 suất diễn riêng biệt (ví dụ: "Đêm 1" và "Đêm 2").
   - Mỗi suất diễn cấu hình ít nhất 2 hạng vé khác nhau (ví dụ: "Standard - 200.000 ₫" và "VIP - 500.000 ₫").
   - Nhập URL ảnh banner, thông tin hotline và chính sách hoàn hủy.
   - Thử nghiệm tính năng "Lưu bản nháp": Xác nhận bản nháp lưu thành công, tải lại trang (F5) không bị mất thông tin.
   - Mở cửa sổ ẩn danh (Incognito): Xác nhận sự kiện bản nháp **hoàn toàn không xuất hiện** trên Marketplace và URL sự kiện trả về lỗi không tìm thấy.
   - Nhấp nút "Xem trước sự kiện" (Preview): Xác nhận trang hiển thị đầy đủ hero banner, 2 suất diễn trên bộ chuyển đổi `ShowSwitcher`, và danh sách hạng vé chính xác.
   - Bấm "Công bố sự kiện": Xác nhận quá trình xuất bản thành công, chuyển đổi trạng thái nguyên tử, và sự kiện xuất hiện ngay lập tức trên Marketplace công khai.
3. **Bảo toàn tính tương thích (Backward Compatibility):**
   - Truy cập route `/events/super-concert-2026`: Toàn bộ giao diện concert tùy biến, sơ đồ SVG và cơ chế giữ chỗ 72 ghế tiếp tục hoạt động hoàn hảo không hồi quy.

---

## 13. Các khẳng định chưa kiểm chứng & Câu hỏi mở (Unverified / Open Questions)

Nhằm đảm bảo tính chuẩn xác và kỷ luật nghiên cứu, phần này ghi nhận toàn bộ các vấn đề chưa được kiểm chứng thực tế hoặc đang chờ quyết định sản phẩm:

### 13.1. Các khẳng định chưa kiểm chứng (Unverified claims)
1. *Cấu hình Supabase Storage trên môi trường Staging:*  
   - *Hiện trạng:* Chưa trực tiếp kiểm tra xem project Supabase staging (`qxkgkbayxxaakkwtepss`) đã bật bucket `storage` công khai cho ảnh sự kiện hay chưa.  
   - *Cách xác nhận:* Cần chạy một script Node.js kiểm tra endpoint `supabase.storage.getBucket('event-media')` trong vòng triển khai tới. Nếu bucket chưa sẵn sàng, giải pháp an toàn là cho phép BTC nhập đường dẫn ảnh ngoài (External Image URL) như Unsplash/CDN.
2. *Hiệu năng tải trang Marketplace khi số lượng sự kiện lớn:*  
   - *Hiện trạng:* Hiện tại truy vấn `loadPublicEvents` nạp danh sách sự kiện kèm mảng `SUAT_DIEN(SuatDienID)`. Với số lượng dưới 50 sự kiện, PostgREST phản hồi tức thì. Chưa kiểm chứng thời gian phản hồi khi có trên 1.000 sự kiện có nhiều suất diễn.
3. *Luồng wizard nội bộ và phân bổ vé của các sàn Việt Nam (Ticketbox, CTicket, TicketGo):*  
   - *Hiện trạng:* Do trong đợt khảo sát này chưa có tài khoản tổ chức thương mại đã ký kết hợp đồng đại lý và định danh pháp lý (Authenticated Merchant/Organizer Session) trên Ticketbox Organizer Center hoặc CTicket Backoffice, các nhận định về quy trình wizard từng bước nội bộ, cơ chế lưu nháp dở dang, và kiểm soát phân bổ hạn ngạch vé giữa các phiên của các sàn Việt Nam là suy luận chuyên môn (Inference) dựa trên tài liệu trợ giúp công khai, điều khoản sàn và giao diện luồng mua vé phía khán giả. Các đặc tả này chưa được đối chứng thực nghiệm trực tiếp qua màn hình quản trị nội bộ của BTC.
   - *Cách xác nhận:* Cần cấp tài khoản đối tác thử nghiệm (Staging / Partner Sandbox) từ Ticketbox/CTicket để đối soát từng trường nhập liệu nội bộ trong đợt phát triển tiếp theo.

### 13.2. Các Quyết định Sản phẩm Đã Phê duyệt & Triển khai (Adopted Architectural Decisions)

Toàn bộ 5 quyết định sản phẩm đã được Architectural Review Board và Tech Lead chính thức phê duyệt và triển khai trong lát cắt kỹ thuật `20261006190000`:

1. **`DECISION 1: EVENT_EDIT_AFTER_PUBLISH` — [ĐÃ CHẤP THUẬN (ACCEPTED)]**  
   - *Quyết định:* Cho phép BTC chỉnh sửa thông tin mô tả, banner, trailer, thông tin liên hệ và chính sách sau khi sự kiện đã xuất bản (`CONG_KHAI`).
   - *Cơ chế khóa thương mại (Post-publish commercial locks):* Kích hoạt kiểm soát giao dịch ở RPC `luu_su_kien_toan_dien` và Trigger: Khóa cứng giá vé không được thay đổi, khóa sức chứa không được giảm xuống dưới số vé đã bán/đang giữ chỗ, và không được đẩy lùi giờ bắt đầu nếu đã phát sinh giữ chỗ hoặc vé hợp lệ.

2. **`DECISION 2: SEATING_MAP_BUILDER_FOR_GENERIC_EVENTS` — [ĐÃ CHẤP THUẬN (ACCEPTED)]**  
   - *Quyết định:* Các sự kiện tiêu chuẩn (`DEFAULT`) sử dụng mô hình vé phân khu tự do (Standing / GA / Tiered capacity) và hỗ trợ tải ảnh sơ đồ khán đài tĩnh (`seatingMapUrl`) để người mua đối chiếu vị trí. Không xây dựng công cụ kéo thả SVG phức tạp trong pha này; bảo toàn 100% công cụ SVG riêng biệt của Super Concert 2026.

3. **`DECISION 3: MEDIA_STORAGE` — [ĐÃ CHẤP THUẬN (ACCEPTED)]**  
   - *Quyết định:* Sử dụng đường dẫn ảnh HTTPS bên ngoài (External CDN, Unsplash, Cloudinary, Imgur, v.v.) với cơ chế xác thực URL client và hiển thị ảnh xem trước tức thì trên Wizard. Không phụ thuộc vào cấu hình bucket Supabase Storage nội bộ trong lát cắt này.

4. **`DECISION 4: DRAFT_SAVE_BEHAVIOR` — [ĐÃ CHẤP THUẬN (ACCEPTED)]**  
   - *Quyết định:* Áp dụng chiến lược Lưu bản nháp lỏng (Permissive Draft Save): Cho phép BTC lưu dở dang ở bất kỳ bước nào của Wizard chỉ với Tên (>= 5 ký tự) và Slug hợp lệ. Ngược lại, khâu Công bố (`CONG_KHAI`) kích hoạt toàn bộ Pre-flight Readiness Checklist nghiêm ngặt ở cả React UI và cơ sở dữ liệu.

5. **`DECISION 5: MULTI_SHOW_STRUCTURE & UNIFIED RPC` — [ĐÃ CHẤP THUẬN (ACCEPTED)]**  
   - *Quyết định:* Xây dựng RPC giao dịch JSONB `luu_su_kien_toan_dien` để lưu trữ đồng thời toàn bộ aggregate: Sự kiện + Danh sách Suất diễn + Danh sách Phân khu hạng vé trong một giao dịch nguyên tử (ACID transaction). Giữ nguyên tương thích ngược với RPC cũ `tao_ban_nhap_su_kien` cho các bài kiểm thử tự động hiện hữu.
