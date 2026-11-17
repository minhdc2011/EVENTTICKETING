# Số đo NFR — Sprint 1 (11/11/2026)

Tài liệu này chỉ ghi **số liệu đã đo thật**. Phép đo nào chưa thực hiện được thì ghi **"chưa đo"** kèm lý do; không có ngưỡng hay số liệu suy đoán. Dữ liệu thô nằm trong `docs/nfr-results/`.

## Tóm tắt

| NFR | Trạng thái | Kết quả |
|---|---|---|
| NFR-07 Accessibility / responsive | **Đã đo** | Lighthouse Accessibility **100** ở cả 8 lượt (4 trang × mobile/desktop); luồng bàn phím 16/16 bước đạt |
| NFR-03 Tải sơ đồ | **Đã đo một phần** | Sơ đồ sẵn sàng P50 **5,68 s**, P95 **6,33 s** trên 4G giả lập, CPU chậm 4 lần (dữ liệu mock). **Realtime: chưa đo** |
| NFR-02 Không bán trùng ghế | **Chưa đo** | Script có sẵn, chưa chạy (cần Supabase staging/local) |
| NFR-01 Chịu tải | **Chưa đo** | Không có môi trường staging/local an toàn; không chạy trên production |
| NFR-09 Bảo mật (quyền ghi `GHE`) | **Đã chạy trên Postgres giả lập (PGlite): 29/29**; pgTAP và live **chưa chạy** | Migration `20261111090000` đã thực thi thật trên Postgres trong tiến trình (schema thay thế tối thiểu); pgTAP 27 kiểm tra chưa chạy vì không có Supabase |

---

## 1. NFR-07 — Accessibility và responsive

### 1.1 Lighthouse 12 (Chrome headless, 11/11/2026)

- Môi trường: bản build production phục vụ bằng `vite preview` trên máy phát triển, Lighthouse mặc định (mobile mô phỏng Moto G Power + throttling "simulated"; desktop 1350×940, RTT 40 ms, 10 Mbit/s).
- Lưu ý quan trọng: bản build production dùng `.env.production`, tức **đọc dữ liệu công khai từ Supabase thật** (chỉ đọc, qua khoá anon, không ghi). Điểm Performance vì vậy phụ thuộc cả mạng tới Supabase và dao động giữa các lần chạy (cùng một trang đo ra 61–81 ở desktop trang chủ trong các lượt khác nhau); **chỉ nên đọc điểm Accessibility/CLS là ổn định**, còn Performance chỉ mang tính tham khảo.
- Trang đo: Trang chủ (`/`), Chi tiết sự kiện `autumn-arena-festival-2026`, Super Concert `super-concert-2026`, Cổng BTC (`organizer/login`).

| Trang | Thiết bị | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Trang chủ | mobile | 66 | **100** | 100 | 100 | 7,7 s | 0,011 | 110 ms |
| Trang chủ | desktop | 81 | **100** | 100 | 100 | 2,3 s | 0,006 | 0 ms |
| Chi tiết sự kiện | mobile | 79 | **100** | 96 | 100 | 4,1 s | 0,002 | 130 ms |
| Chi tiết sự kiện | desktop | 80 | **100** | 96 | 100 | 2,2 s | 0,022 | 20 ms |
| Super Concert | mobile | 78 | **100** | 96 | 100 | 4,9 s | 0,019 | 10 ms |
| Super Concert | desktop | 92 | **100** | 96 | 100 | 1,7 s | 0,022 | 0 ms |
| Cổng BTC (đăng nhập) | mobile | 83 | **100** | 100 | 100 | 3,3 s | 0 | 270 ms |
| Cổng BTC (đăng nhập) | desktop | 100 | **100** | 100 | 100 | 0,6 s | 0,002 | 0 ms |

Dữ liệu thô: `docs/nfr-results/lighthouse-2026-11-11.json`.

**Trước khi sửa** (cùng cách đo, đầu ngày 11/11/2026): Accessibility 92–100. Lỗi tìm thấy và đã sửa:

| Lỗi | Nơi | Cách sửa |
|---|---|---|
| `color-contrast` 1,1:1 (chữ tối trên nền đen) | thẻ nghệ sĩ trang Super Concert | gỡ class `group` làm rule cũ vẽ nền `#0b0b0b` (đây là **lỗi hồi quy do thay đổi giao diện trước đó**) |
| `color-contrast` 4,2–4,5:1 | mô tả mục, chân trang, nhãn "hết vé", nút trailer, nhãn thể loại | đổi màu chữ; nhãn thể loại dùng hàm `accessibleBadgeColors` (có test) |
| `aria-required-children` | danh sách nghệ sĩ `role="list"` chứa `button` | đổi thành `role="group"` |
| `label-content-name-mismatch` | nút CTA hero, liên hệ, thanh dưới điện thoại, logo BTC, thẻ băng chuyền | bỏ `aria-label` trùng/khác chữ hiển thị (chuyển thông tin sang `title` khi cần) |
| `aria-prohibited-attr` | `<g id="stadium-seat-layer" aria-label>` không có role | thêm `role="group"` |
| CLS 0,51 (mobile) và 0,83 (desktop) ở trang chủ | băng chuyền và bộ lọc nghệ sĩ xuất hiện sau khi tải | giữ chỗ (skeleton) trong lúc tải → CLS còn 0,006–0,011 |

### 1.2 Luồng bàn phím (`scripts/nfr/keyboard-flow.mjs`)

Chạy trên bản app **dữ liệu mock** (đã chặn mọi request tới `*.supabase.co`), 16/16 bước đạt:

- chọn khu bằng bàn phím (radio + Space) mở lưới ghế;
- ghế là `button`, có tên truy cập gồm **mã ghế, trạng thái và giá** (ví dụ "SEC_104-A-01, Còn trống, 1.200.000 ₫"), nhận focus, có viền focus 2 px;
- chú giải gọi tên đủ 4 trạng thái bằng chữ (Còn trống / Đã bán / Đang giữ / Đã chọn); ghế có ký hiệu riêng cho từng trạng thái (không chỉ màu);
- Enter chọn ghế; có vùng `aria-live="polite"` thông báo;
- nút giữ chỗ mở hộp thoại `aria-modal`, focus chuyển vào hộp thoại, **Tab và Shift+Tab không thoát khỏi hộp thoại**, Escape đóng và trả focus về nút mở.

Giới hạn: chưa chạy với trình đọc màn hình thật (NVDA/VoiceOver); chưa kiểm tra tablet vật lý. Responsive được kiểm bằng mô phỏng viewport (Lighthouse mobile, 412 px).

---

## 2. NFR-03 — Tải sơ đồ và cập nhật realtime

### 2.1 Thời gian sơ đồ sẵn sàng (`scripts/nfr/measure-map-load.mjs`)

- Định nghĩa "sẵn sàng": sơ đồ phân khu hiển thị **và** ô tìm ghế có kích thước > 0.
- Môi trường: bản build production **dữ liệu mock** (không gọi Supabase), `vite preview` cục bộ; Chrome mô phỏng mạng 4G (RTT 150 ms, 1,6 Mbit/s xuống, 750 kbit/s lên), CPU chậm 4 lần, viewport 412×915; mỗi lượt là một browser context mới (cache lạnh); **20 lượt, 0 lỗi**.
- Trang: `events/autumn-arena-festival-2026` (sơ đồ BTC cung cấp).

| Chỉ số | Giá trị |
|---|---|
| P50 | **5 681 ms** |
| P95 | **6 328 ms** |
| Min / Max | 5 419 ms / 6 386 ms |

Dữ liệu thô: `docs/nfr-results/map-load-2026-11-11.json`.

**Giới hạn của phép đo (đọc trước khi trích dẫn):**
- Là đo **phía giao diện với dữ liệu mock**: không gồm thời gian truy vấn Supabase, nên **không phải số đầu-cuối của production**.
- Tải JS/CSS khoảng 1,1 MB (`index` 587 kB, `supabaseClient` 227 kB, CSS 324 kB) qua 1,6 Mbit/s chiếm phần lớn 5,7 s; đây là cơ hội tối ưu (tách chunk, nén) chứ chưa phải kết luận đạt/không đạt vì SRS chưa nêu ngưỡng số.
- Một máy, một cấu hình; chưa lặp qua nhiều giờ/ngày.

### 2.2 Độ trễ realtime (DB đổi trạng thái ghế → UI cập nhật) — **chưa đo**

Lý do: cần một dự án Supabase staging/local có bật Realtime để đổi `GHE.TrangThai` và đo thời gian UI nhận. Dự án duy nhất cấu hình trong repo là dự án production nên **không chạy**; máy phát triển không có Docker daemon/Supabase CLI chạy được. Logic đối soát realtime phía client đã có test hành vi (`tests/seat-realtime.test.mjs`), nhưng đó không phải số đo độ trễ.

---

## 3. NFR-02 — Không bán trùng ghế (giữ chỗ ~5 phút) — **chưa đo**

- Thiết kế: RPC `tao_giu_cho_theo_suat` khoá hàng ghế (`FOR UPDATE`), hết hạn giữ chỗ 5 phút bằng `pg_cron` — đã xem xét qua đọc mã, **chưa có kết quả chạy thật**.
- Script kiểm chứng đã viết: `scripts/nfr/hold-contention.mjs` — N phiên (mặc định 20) cùng giữ **một** ghế; kỳ vọng đúng 1 thành công, N−1 bị từ chối, đúng 1 chi tiết giữ chỗ `ACTIVE` cho ghế; dọn dẹp trong `finally`. Script **từ chối chạy** nếu không đặt `ALLOW_NON_PRODUCTION=yes`.
- Chưa chạy vì không có Supabase staging/local. Kiểm tra hết hạn 5 phút và nhả ghế cũng chưa thực hiện.

## 4. NFR-01 — Chịu tải — **chưa đo**

- Các đường đọc công khai (danh sách sự kiện, chi tiết sự kiện, catalog ghế) đi qua **Supabase REST/Realtime** nên chỉ test tải trên backend thật mới có ý nghĩa. Backend duy nhất có thể truy cập là production, **bị loại** theo ràng buộc của công việc này.
- Chạy tải vào `vite preview` cục bộ chỉ đo máy chủ tệp tĩnh, **không đại diện** cho NFR-01 nên không thực hiện để tránh một con số dễ bị hiểu nhầm.
- Cần làm khi có staging: k6/Artillery với 10 → 50 → 100 → 200 người dùng ảo, ghi RPS, P95, tỷ lệ lỗi. Đây chỉ là baseline cho capacity planning, không phải khẳng định chịu được hàng chục nghìn người.

---

## 5. NFR-09 — Quyền ghi bảng `GHE`

- Vấn đề: chính sách `"Editors manage show seats"` là `FOR ALL`, biên tập viên ghi trực tiếp được `TrangThai` (kể cả `DA_BAN`, `DANG_GIU`) và bỏ qua RPC giữ chỗ.
- Thay đổi (migration `20261111090000_server_side_seat_generation.sql`): gỡ chính sách, thu hồi INSERT/UPDATE/DELETE/TRUNCATE trên `GHE` của `authenticated`, `anon`; sinh ghế chuyển vào RPC `dong_bo_ghe_su_kien` chạy trong cùng giao dịch với `luu_su_kien_toan_dien`.
- **Quyết định thiết kế:** lỗi sinh ghế (ví dụ vượt 50.000 ghế mỗi sự kiện, BR-02.7) **hủy cả lần lưu** (nguyên tử), khác hành vi cũ chỉ cảnh báo. Lý do: không để sự kiện có hạng vé ghế ngồi nhưng thiếu ghế.
- Kiểm thử: `supabase/tests/server_side_seat_generation.sql` (27 kiểm tra pgTAP, **chưa chạy**: nhãn hàng, sinh đủ ghế, lưu lặp không trùng, tăng/giảm sức chứa, biên tập viên không UPDATE/INSERT/DELETE được, người ngoài tổ chức/thành viên không có quyền biên tập/`anon` không gọi được, ghế đã bán/đang giữ không bị xoá khi giảm sức chứa, vượt 50.000 ghế bị từ chối và không để lại sự kiện). **Chưa chạy** vì không có Supabase local; cần chạy `supabase test db` trước khi áp dụng lên staging/live.
- **Đã thực thi migration trên Postgres thật (PGlite, trong tiến trình)** bằng `scripts/db/verify-seat-generation-pglite.mjs`: 29/29 kiểm tra đạt — migration áp dụng được hai lần (idempotent); nhãn hàng `nhan_hang_ghe` trùng `rowLabel` của JS cho chỉ số 0..1500; lưu sinh đúng số ghế, lưu lặp không thêm, tăng sức chứa chỉ thêm phần thiếu, ghế bị xóa được sinh lại (lấp chỗ trống); giảm sức chứa chỉ xóa ghế `TRONG` không thuộc giữ chỗ (ghế đã bán, đang giữ, hoặc có `CHI_TIET_GIU_CHO` đều còn nguyên; khi mọi ghế đã bán thì không xóa gì); 60.000 ghế bị từ chối `22023` và **không để lại sự kiện/khu/ghế**, đúng 50.000 ghế được chấp nhận; thành viên không có quyền biên tập và người chưa đăng nhập bị `42501`; `authenticated` không INSERT/UPDATE/DELETE được `GHE` nhưng vẫn SELECT; hàm `_core` không gọi trực tiếp được; `anon` không gọi được RPC lưu.
- **Lần chạy đó tìm ra lỗi trong chính test pgTAP đã viết** (dùng ghế `SEAT-E-01` không tồn tại với sức chứa 31); đã sửa thành `SEAT-D-01`. Điều này cho thấy test pgTAP chưa chạy vẫn có thể còn lỗi nhỏ.
- Giới hạn của lần chạy PGlite: dùng **schema thay thế tối thiểu** và **hàm lưu thay thế** (không phải thân `luu_su_kien_toan_dien` thật), không có RLS của các bảng khác, không có `pg_cron`. Vì vậy vẫn cần chạy pgTAP trên staging trước khi áp dụng lên live.
- Khoảng trống còn lại của pgTAP: chưa có ca ghế bị tham chiếu bởi `CHI_TIET_GIU_CHO` (bảng thật yêu cầu bản ghi `GIU_CHO` cha); ca này mới được kiểm trong lần chạy PGlite, với bảng thay thế không có khóa ngoại tới `GIU_CHO`.
- Hành vi cần xác nhận trên staging: `luu_su_kien_toan_dien` được đổi tên phần thân thành `luu_su_kien_toan_dien_core` và bọc lại; chữ ký và quyền gọi giữ nguyên.

---

## 6. Kiểm chứng chức năng TC-T1-09 / 12 / 15 (trình duyệt tự động, 11/11/2026)

Đây là kiểm tra tự động bằng Chrome điều khiển (không thay thế lượt chạy tay Test Log của nhóm):

| TC | Kết quả |
|---|---|
| TC-T1-15 (tìm ghế) | Mã sai `ZZZ-999`: thông báo "Không tìm thấy ghế" (`role="status"`) + nút "Xóa tìm kiếm", sơ đồ BTC giữ nguyên, xóa thì thông báo biến mất. Mã đúng (viết thường, có khoảng trắng): mở đúng khu từ sơ đồ BTC, đúng 1 ghế được đánh dấu, nằm trong khung nhìn |
| TC-T1-12 (zoom/pan) | 21/21 bước: nút ±/Đặt lại; Ctrl+cuộn zoom và **không** cuộn trang; cuộn thường không đổi zoom; kéo pan, không đổi zoom, không chọn ghế, bị giới hạn ở mép nội dung; bấm ghế vẫn chọn/bỏ chọn; pinch hai ngón và kéo một ngón (cảm ứng); phím +, −, 0 và mũi tên; giới hạn 60% và 400% khóa nút tương ứng |
| TC-T1-09 (khu hết ghế) | Khu có 0 ghế `TRONG` được gắn `data-sold-out`, làm mờ, viền đứt, nhãn chữ "× HẾT VÉ", `aria-label` nói rõ "hết vé"; các khu khác không bị ảnh hưởng. Kiểm tra trên một trang thử riêng (render `StadiumOverview` với dữ liệu đã chỉnh), **chưa trên luồng BTC thật** |

Hồi quy: toàn bộ test tự động tiếp tục đạt (xem mục kiểm chứng trong báo cáo cuối).
