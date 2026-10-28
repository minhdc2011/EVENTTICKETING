# Sprint 1 Closure

Bản đóng Sprint 1 đầy đủ nằm tại [`sprint1-deliverables/05_TRACEABILITY_TEST_AND_CLOSURE.md`](./sprint1-deliverables/05_TRACEABILITY_TEST_AND_CLOSURE.md).

Kết luận ngắn: code hiện pass type-check (`tsc --noEmit`), **137/137 automated tests** và production build Vite (151 modules transformed). Kiến trúc sơ đồ ghế dùng chiến lược hybrid có chủ đích: `SUPER_CONCERT_2026` giữ lại artifact SVG móng ngựa đã được tinh chỉnh cùng camera zoom, drill-down ghế, tooltip, filter/search và inventory; sự kiện do BTC tạo dùng module React chuẩn hóa (`src/components/event-template/SeatMapSection.tsx` và `src/domain/seatMap.js`) tự sinh hình học từ catalog. Cả hai vẫn nằm trong cùng `EventTemplate`, dùng chung dữ liệu giá/tồn, trạng thái bán và giới hạn chọn tối đa 4 vé.

Đặc biệt, hệ thống đã hoàn thiện đầy đủ các yêu cầu kiểm thử và độ tin cậy chuyên sâu qua các vòng review:
1. **Backend zone identity (Round 3):** `buildHoldItems` giải quyết chính xác `KhuVucID → ZoneRecord.MaKhuVuc` từ danh sách phân khu thực tế; dừng an toàn và thông báo lỗi rõ ràng nếu không xác định được mã phân khu, không bao giờ dùng tên hiển thị hay ID số làm fallback.
2. **Pre-response own-hold realtime race (Round 3):** ghi nhận đồng bộ `pendingHoldSeatCodesRef` ngay trước khi gọi RPC `createSeatHold`; listener realtime bảo toàn sự kiện `DANG_GIU` cho các ghế đang pending; dọn dẹp ref trong `finally`; tự động tái hòa giải với catalog mới khi hold gặp lỗi/conflict để loại bỏ ghế bị bên thứ ba chiếm giữ.
3. **Fresh catalog reconciliation (Round 3):** `reconcileSelectionWithCatalog` trả về đối tượng ghế mới nhất từ catalog (`fresh`) thay vì đối tượng cũ, đảm bảo giá tiền, trạng thái và phân khu luôn cập nhật khi ghế vẫn còn `TRONG`.
4. **Hold lifecycle cleanup (Round 3):** xóa sạch `heldSeatsSnapshot` khi đồng hồ giữ chỗ đếm ngược về 0; ngăn chặn gửi trùng lặp yêu cầu hủy giữ (`isReleasePending` khóa nút hủy); duy trì dialog và đồng hồ trung thực nếu hủy giữ gặp lỗi.
5. **Release truthfulness:** chỉ xóa phiên giữ và thông báo thành công khi `releaseSeatHold` xác nhận thành công; giữ nguyên đồng hồ đếm ngược và báo lỗi rõ ràng nếu giải phóng thất bại.
6. **Event/show boundary safety:** reset sạch selection, snapshot, banner, hold khi đổi route/show; dùng `activeScopeRef` chặn race condition từ các response bất đồng bộ đến trễ.
7. **No-zone state:** `loadTicketingCatalog` trả về `{ zones: [], seats: [] }` khi không có phân khu thay vì quăng ngoại lệ kết nối, hiển thị đúng empty state trung thực.
8. **Data & sample truthfulness:** bỏ nhận định chưa có căn cứ về thuế VAT/phí; loại bỏ chuỗi địa điểm giả định ("Sân vận động Quốc gia", "Khu vực khán đài chính") và hiển thị trạng thái trung lập cập nhật.
9. **Dialog focus restoration:** chuyển và gắn `holdButtonRef` vào nút CTA `#hold`, khôi phục focus chính xác khi đóng dialog.
10. **Unknown status safety:** ánh xạ fail-closed các trạng thái ghế không xác định về `'blocked'`.

Payment, QR động, refund, waiting room, concurrency evidence và load test chưa được coi là hoàn thành.

