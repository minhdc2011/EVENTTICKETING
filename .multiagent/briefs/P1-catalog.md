TRANG P1 — CATALOG (route `/` và `/?route=/events`, component chính `src/components/EventCatalog.tsx`).

Dựng lại giao diện trang catalog theo phong cách ticketmaster.com, chỉ với các chức năng ĐÃ CÓ trong repo.
Đọc trước: `.multiagent/briefs/ticketmaster-style.md` (quy tắc thương hiệu, ngôn ngữ thiết kế, mẫu trang) và `SPEC.md`.

Các checkbox của trang này trong SPEC.md (mục 3) phải chạy đúng sau khi làm lại:
- Xem danh mục sự kiện đã công bố
- Xem sự kiện nổi bật ở hero của catalog
- Tìm kiếm sự kiện theo tên hoặc địa điểm
- Lọc sự kiện theo thể loại
- Xem số sự kiện của từng thể loại
- Thấy badge tài khoản trên nav của catalog (khách đã đăng nhập)
- Đăng xuất từ nav của catalog

Yêu cầu:
1. Tách header toàn cục (thanh xanh, wordmark EventTicketing, nav thể loại, nút đăng nhập/tài khoản) và khối tìm kiếm
   thành component dùng lại được (ví dụ `src/components/site/GlobalHeader.tsx`) để các trang P2–P4 dùng tiếp.
   Đặt design token (màu, bo góc, font, khoảng cách) ở một chỗ (CSS variables) để các trang sau dùng chung.
2. Catalog: hero/featured, tab hoặc chip thể loại có đếm số, danh sách thẻ sự kiện kiểu Ticketmaster (khối ngày
   THỨ/THÁNG/NGÀY, tên, địa điểm, giờ, nút "Tìm vé"), trạng thái loading/rỗng/lỗi rõ ràng. Responsive 360px–1440px.
3. Giữ nguyên hành vi hiện có: dữ liệu từ `loadPublicEvents`, link sang `/?route=/events/<slug>`, phiên khách,
   đăng xuất. Không thêm chức năng mới. Test hiện có phải pass; thêm/sửa test nếu hành vi thay đổi chỗ hiển thị.
4. Không sửa supabase/, *.sql, docs/. Không dùng tên, logo, hình, chữ của Ticketmaster.
