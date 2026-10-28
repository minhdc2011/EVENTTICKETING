# Sprint 1 Verification Report

Xem báo cáo verification và ma trận truy vết tại [`sprint1-deliverables/05_TRACEABILITY_TEST_AND_CLOSURE.md`](./sprint1-deliverables/05_TRACEABILITY_TEST_AND_CLOSURE.md).

Verification gần nhất ngày 28/10/2026: `npm run check` — TypeScript pass, **137/137 tests pass**, production build pass (151 modules transformed). Regression QA xác nhận `SUPER_CONCERT_2026` đã khôi phục đúng sơ đồ SVG móng ngựa và các chức năng cũ: filter/search, zoom tổng, tooltip phân khu, animated camera drill-down, render ghế database và inventory/tạm tính. Browser QA mở VVIP thành công với `viewBox="300.00 165.00 400.00 260.00"`, render 12 `camera-seat-cell` và zoom tổng đổi từ 100% lên 110%. Sự kiện BTC tạo vẫn dùng `SeatMapSection.tsx` với các trạng thái `loading`, `error` + retry, `empty`, `ready`, realtime và giới hạn tối đa 4 vé; `concertRuntime.js` có guard nên không can thiệp vào DOM React của nhánh này.

Đã hoàn thành xác minh trọn vẹn cả Review Round 2 và Round 3 với 15/15 bài test trong `tests/seat-map.test.mjs`:
- **Round 3:** Giải quyết chính xác mã phân khu backend (`ZoneRecord.MaKhuVuc`) qua helper thuần `buildHoldItems`; fail-closed khi thiếu phân khu, không bao giờ gửi tên hiển thị hoặc ID số.
- **Round 3:** Bảo vệ race condition realtime trước khi RPC trả về (`pendingHoldSeatCodesRef`), kết hợp ref realtime và dọn dẹp sạch trong `finally`.
- **Round 3:** Tái hòa giải catalog trả về đối tượng ghế mới nhất (`fresh`), kiểm thử thành công trường hợp giá vé thay đổi khi ghế vẫn còn `TRONG`.
- **Round 3:** Vòng đời giữ ghế hoàn chỉnh: dọn snapshot khi hết hạn, ngăn chặn double-click gửi trùng request hủy giữ (`isReleasePending`), giữ nguyên dialog và đếm ngược trung thực khi hủy giữ thất bại.
- **Round 2:** Bảo toàn snapshot ghế đã giữ trong dialog xác nhận và xử lý race condition cập nhật realtime của chính phiên giữ (`activeHoldRef`).
- **Round 2:** Xác nhận trung thực khi hủy giữ chỗ (`releaseSeatHold` chỉ xóa state khi thành công, giữ countdown và báo lỗi khi thất bại).
- **Round 2:** Tái hòa giải lựa chọn ghế với catalog mới sau khi gặp lỗi 409 conflict (`reconcileSelectionWithCatalog`).
- **Round 2:** Reset an toàn ranh giới event/show, hủy bỏ kết quả async đến trễ từ scope cũ (`activeScopeRef`).
- **Round 2:** Trả về catalog rỗng trung thực khi không có phân khu thay vì báo lỗi mạng.
- **Round 2:** Loại bỏ các tuyên bố về thuế VAT không có nguồn dữ liệu và chuỗi địa điểm giả định.
- **Round 2:** Gắn kết ref khôi phục tiêu điểm bàn phím cho nút CTA `#hold`.
- **Round 2:** Mặc định các trạng thái CSDL lạ/bất thường về `'blocked'` an toàn (fail-closed).



