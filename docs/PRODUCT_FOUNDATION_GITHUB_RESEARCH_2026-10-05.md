# Product Foundation — GitHub Research & Implementation Record

**Ngày:** 05/10/2026  
**Phạm vi:** phần mở rộng sau Sprint 1  
**Nguyên tắc quản trị:** Sprint 1 vẫn giữ trạng thái `VERIFIED`; thay đổi này là
Product Foundation, không sửa lại baseline hay tiêu chí nghiệm thu Sprint 1.

## 1. Nguồn tham khảo công khai

Nghiên cứu được thực hiện độc lập bởi GPT và Gemini/AGY, sau đó đối chiếu lại với
SRS v1.1, CR-001 và Product Foundation Requirements. Chỉ học kiến trúc; không sao
chép mã nguồn từ các dự án tham khảo.

1. [Pretix](https://github.com/pretix/pretix) — mô hình Event/SubEvent, quota tách
   khỏi sản phẩm, audit log và phân quyền theo organizer/team.
2. [Hi.Events](https://github.com/HiEventsDev/hi.events) — React/TypeScript,
   recurring/multi-date event, checkout, check-in và vai trò nhiều người dùng.
3. [Alf.io](https://github.com/alfio-event/alf.io) — vòng đời reservation rõ ràng,
   hết hạn giữ chỗ và vận hành cho hội nghị/sự kiện.
4. [FOSSAsia Open Event Server](https://github.com/fossasia/open-event-server) —
   API sự kiện, lịch trình, vai trò và import/export. Repo đã archived nên chỉ dùng
   như tài liệu lịch sử, không chọn làm nền tảng.

### Cảnh báo giấy phép

Pretix và Hi.Events dùng AGPL; Alf.io và Open Event dùng GPL hoặc giấy phép copyleft.
Không copy component, migration hay source code vào EventTicketing. Chỉ áp dụng các
pattern miền nghiệp vụ đã được mô tả lại độc lập.

## 2. Kết luận kiến trúc

### Phải làm ngay trong Product Foundation

- Tách `Event` và `Show`: một sự kiện có nhiều suất diễn; thời gian, cửa sổ bán,
  trạng thái, venue map và inventory thuộc về Show.
- Dùng slug ổn định cho URL công khai; không dùng `SuKienID=1` trong route sản phẩm.
- Tồn kho/giữ chỗ được quyết định trong transaction PostgreSQL, không kiểm tra rồi
  cập nhật ở React.
- Giá niêm yết được đọc từ database. Client chỉ gửi mã phân khu/ghế và số lượng.
- Dữ liệu tổ chức được cô lập bằng RLS dựa trên membership và `auth.uid()`.
- Giữ adapter tương thích dữ liệu cũ ít nhất một release để không phá demo Sprint 1.

### Không gộp vào lát cắt hiện tại

- Thanh toán thật, webhook và hoàn tiền.
- QR ticket/check-in.
- Trang CRUD đầy đủ cho Ban tổ chức.
- Tách Orders và Payments, quota pool dùng chung, promo code và waitlist.

Các mục này là backlog bắt buộc trước production nhưng không nên chen vào migration
nền tảng đầu tiên vì sẽ làm tăng rủi ro hồi quy của sơ đồ ghế đã nghiệm thu.

## 3. Những gì đã triển khai trong repo

### Database

Migration `supabase/migrations/20261005090000_product_foundation.sql` bổ sung:

- `TO_CHUC`, `HO_SO_NGUOI_DUNG`, `THANH_VIEN_TO_CHUC`.
- `DIA_DIEM`, `PHIEN_BAN_SO_DO`.
- `SUAT_DIEN` với quan hệ `SU_KIEN 1:N SUAT_DIEN`.
- `Slug`, `ToChucID` cho `SU_KIEN`; `SuatDienID` cho `KHU_VUC` và `GIU_CHO`.
- Backfill Super Concert thành `/events/super-concert-2026`, show `dem-chinh`.
- RLS public/organizer, profile trigger và RPC kiểm tra trước khi công bố.
- RPC `tao_giu_cho_theo_suat` và adapter `tao_giu_cho` cũ.

### Frontend

- Danh mục `/events`.
- Chi tiết `/events/:eventSlug`.
- Chọn show `/events/:eventSlug/shows/:showSlug`.
- Context runtime theo show để vùng vé, giữ chỗ và realtime không còn phụ thuộc cấu
  hình cố định `SuKienID=1`.
- Giữ `/` làm tuyến tương thích cho demo Super Concert hiện có.

### Kiểm thử

- Unit test route ở localhost và GitHub Pages sub-path.
- Guard test bảo đảm migration additive và có RPC show-aware.
- SQL acceptance test cho backfill, quan hệ Event 1:N Show và ẩn draft với anon.

## 4. Definition of Done cho lát cắt này

- [x] Không drop bảng hoặc phá dữ liệu Sprint 1.
- [x] Super Concert cũ được backfill sang Event + Show.
- [x] URL không còn bắt buộc dựa vào ID cố định.
- [x] Giữ chỗ mới có biên Show; adapter cũ còn hoạt động.
- [x] Draft không xuất hiện trong public catalog.
- [x] Có mô hình organization/membership và RLS nền tảng.
- [x] Có kiểm thử frontend và SQL staging.
- [ ] Migration đã được chạy và acceptance SQL đã PASS trên Supabase staging.
- [ ] Tạo ít nhất hai event và ba show trên staging để nghiệm thu dữ liệu thực.
- [ ] Mời hai tài khoản thuộc hai organization và chứng minh không đọc chéo dữ liệu.

Chỉ đánh dấu Product Foundation slice này là `VERIFIED` sau ba mục cuối. Việc build
và unit test cục bộ PASS không thay thế kiểm thử RLS/transaction trên Supabase.

## 5. Backlog khuyến nghị theo thứ tự

### PF-02 — Organizer Minimum Viable Portal

1. Đăng nhập Supabase Auth.
2. Dashboard theo organization.
3. Tạo draft Event, thêm Show, thêm zone/capacity.
4. Preview bằng anon contract.
5. Publish qua `cong_bo_su_kien`, không update trạng thái trực tiếp.
6. Audit log cho create/update/publish.

### PF-03 — Order & Payment Boundary

1. `DON_HANG`, `CHI_TIET_DON_HANG`, `THANH_TOAN`, `WEBHOOK_EVENT`.
2. Mỗi lần retry thanh toán tạo một payment attempt mới.
3. Webhook có idempotency key; replay không tạo vé trùng.
4. Giá và tổng tiền tính hoàn toàn phía server.
5. Không cấp quyền insert/update trực tiếp các bảng tài chính cho anon/authenticated.

### PF-04 — Operational Readiness

1. Audit log bất biến.
2. Dashboard inventory và sold-out theo Show.
3. Load test lượt giữ ghế cuối cùng với nhiều request đồng thời.
4. Monitoring RPC error, webhook failure và realtime reconnect.
5. Backup/restore rehearsal trước khi dùng dữ liệu thật.

## 6. Cách nghiệm thu tiếp theo

1. Chạy toàn bộ migration theo timestamp trên project staging.
2. Chạy `supabase/tests/sprint1_hardening.sql` để xác nhận không hồi quy.
3. Chạy `supabase/tests/product_foundation.sql`.
4. Chạy `npm run check` và `npm run verify:staging`.
5. Mở `/events`, `/events/super-concert-2026` và
   `/events/super-concert-2026/shows/dem-chinh`.
6. Lưu output SQL, ảnh các route và log test vào hồ sơ nghiệm thu Product Foundation.

