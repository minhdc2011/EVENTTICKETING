# Thay đổi luồng: OTP ở bước Thanh toán (23/11/2026)

> **Đã thay thế một phần ngày 24/11/2026:** luồng đúng là **giữ chỗ trước, OTP xác nhận thanh toán sau** (xem mục cuối "Bổ sung (24/11/2026)"). Mục "Luồng mới" và "Máy chủ vẫn là nơi cưỡng chế" bên dưới mô tả bản 23/11, nơi OTP chặn ở bước giữ chỗ; chỉ giữ để đối chiếu lịch sử.

## Luồng mới

1. Ai cũng xem và chọn ghế/vé đứng tự do, không cần đăng nhập. Không có thanh nhắc, không có cổng OTP chặn.
2. Bấm **Thanh toán N vé**:
   - chưa đăng nhập: hộp thoại đăng nhập làm mờ nền; đăng nhập xong tự tiếp tục, lựa chọn ghế được giữ nguyên;
   - đã đăng nhập, sự kiện bật OTP, chưa xác minh trong 24 giờ: hộp thoại OTP làm mờ nền; mã 6 số gửi về **email của tài khoản đang đăng nhập** (hiển thị đã che, ví dụ `b****@demo.vn`).
3. Nhập đúng mã: hệ thống tự tiếp tục, giữ chỗ trên máy chủ rồi hiện **Xác nhận thanh toán thành công** kèm đồng hồ 5 phút.
4. Nhập sai: ở lại hộp thoại, giữ nguyên lựa chọn (giới hạn gửi lại và nhập sai như cũ).

## Máy chủ vẫn là nơi cưỡng chế

`tao_giu_cho_theo_suat` từ chối khi chưa đăng nhập (401, 42501 permission denied) hoặc khi sự kiện bật OTP mà phiên chưa có `amr=otp` trong 24 giờ (42501, "Can xac minh OTP de giu cho"). Giao diện chỉ phiên dịch hai lỗi này thành hộp thoại đăng nhập hoặc OTP. Không đổi migration nào.

## Giới hạn trung thực

- "Thanh toán" là **mô phỏng**: chưa có cổng thanh toán và chưa phát hành vé. Máy chủ chỉ giữ chỗ 5 phút; hộp thoại xác nhận nói rõ điều này.
- Trước khi bấm Thanh toán ghế **chưa được giữ**; người khác vẫn có thể chọn ghế bạn đang xem. Sau khi đăng nhập hoặc OTP, nếu ghế đã bị lấy thì thao tác báo lỗi xung đột và ghế đó bị bỏ khỏi lựa chọn.
- Đồng hồ 5 phút chỉ chạy sau khi giữ chỗ thành công (trước đây Super Concert chạy đồng hồ ngay khi chọn ghế, dễ gây hiểu nhầm).

## Ảnh hưởng tới tài liệu yêu cầu và thiết kế

| Mục | Trước | Nay |
|---|---|---|
| FR-T2-01 | OTP trước khi vào bước chọn ghế | OTP khi bấm Thanh toán (trước khi giữ chỗ) |
| AC-T2-01 "chưa xác minh thì không mount phần chọn vé" | có | **bỏ**; thay bằng "chưa xác minh thì không giữ chỗ/thanh toán được" |
| Sequence `SD_OTP_VaoBuocChonGhe` | cổng chặn trước sơ đồ | đổi thành: chọn ghế → Thanh toán → (đăng nhập) → OTP → giữ chỗ → xác nhận |
| Use Case "Xác minh OTP" | include của "Chọn ghế" | include của "Thanh toán" |

## Kiểm thử

- `scripts/nfr/checkout-flow.mjs` (sơ đồ BTC) và `scripts/nfr/checkout-flow-super-concert.mjs` (Super Concert), Chrome thật, chế độ mock: tất cả bước đạt.
- `tests/sprint2-integration.test.mjs` (T1 và xuyên suốt) đã đổi theo luồng mới.
- Chưa kiểm trên staging thật với email thật cho luồng mới; máy chủ và SMTP đã kiểm ở bước trước (`PHUONG-AN-OTP-VA-SMTP.md`, mục 5).

## Bổ sung (23/11/2026): OTP mặc định cho sự kiện mới, dấu cấm khi đủ vé, sơ đồ viền tím

- **OTP mặc định cho sự kiện mới.** Khi chủ sở hữu hoặc quản trị tổ chức tạo bản nháp sự kiện, ứng dụng gọi RPC `luu_cau_hinh_mua_ve` để bật OTP ngay (có kiểm quyền và nhật ký như mọi lần lưu). Biên tập viên không đủ quyền ghi cấu hình nên sự kiện của họ giữ mặc định cũ (tắt OTP) cho tới khi chủ sở hữu bật ở màn Cấu hình mua vé. Không đổi hàm máy chủ nào: sự kiện chưa có dòng cấu hình vẫn được coi là không yêu cầu OTP (giữ nguyên hành vi và bộ pgTAP hiện có). Mọi sự kiện đang có trên staging (6) và dữ liệu mô phỏng (3) đã bật OTP.
- **Đủ số vé tối đa.** Ghế còn trống chưa chọn hiện dấu cấm (vòng tròn viền đỏ gạch chéo), mờ đi và không chọn thêm được; ghế đã chọn vẫn bấm được để bỏ chọn. Áp dụng cho lưới ghế (nhà hát, arena) và Super Concert.
- **Sơ đồ BTC.** Bấm một khu thì khu đó được tô viền bằng màu của nó, các khu xung quanh mờ đi (không phóng to); lưới ghế gốc nằm ngay bên dưới.

## Bổ sung (23/11/2026, đợt 2): vòng đời giữ chỗ khi đăng xuất, sự kiện không có sơ đồ, khung gộp

### Đăng xuất hoặc đổi tài khoản khi đang giữ chỗ

Quy tắc: **trả chỗ lại ngay** và đưa giao diện về trạng thái "chưa giữ".

| Tình huống | Hành vi |
|---|---|
| Đang giữ chỗ, bấm Đăng xuất (hoặc phiên chuyển sang tài khoản khác) | Gọi `huy_giu_cho`, đóng hộp thoại xác nhận, tắt đồng hồ, xóa lựa chọn ghế, báo "Bạn đã đăng xuất nên chỗ đang giữ đã được trả lại" |
| Khách ẩn danh đăng nhập | Không đổi gì (lựa chọn giữ nguyên, tiếp tục thanh toán) |
| Làm mới token cùng tài khoản | Không đổi gì |
| Đăng xuất khi chưa giữ chỗ | Không đổi gì |

Lý do: lượt giữ thuộc về tài khoản; sau khi đăng xuất người dùng không còn thấy hay hủy được nó, trong khi người khác bị chặn ghế đó tới 5 phút. Lựa chọn ghế cũng bị xóa để máy dùng chung không để lại lựa chọn cho người sau. `huy_giu_cho` xác thực bằng mã phiên trình duyệt chứ không bằng `auth.uid()` nên vẫn gọi được ngay sau khi đăng xuất. Hàm thuần `src/domain/holdSessionGuard.js` giữ quy tắc này (có test); React (`SeatMapSection`) và Super Concert (`concertRuntime.js`) dùng chung.

Chưa xử lý: tải lại trang khi đang giữ chỗ vẫn làm mất trạng thái trên giao diện (lượt giữ trên máy chủ hết hạn sau 5 phút do tác vụ dọn tự động); nếu cần khôi phục thì phải thêm RPC đọc lượt giữ đang hoạt động của tài khoản.

### Sự kiện không có sơ đồ chỗ ngồi

Khi mọi khu đều là vé đứng và sự kiện không có sơ đồ BTC (áp dụng cho cả sự kiện tạo sau này), trang chỉ hiện bảng "Vé đứng (không chọn ghế)" và bảng tóm tắt; không có bản đồ, thanh công cụ, ô tìm ghế hay chú giải. Chữ đổi từ "ghế" sang "vé".

### Khung gộp khi bấm một khu của sơ đồ BTC

Một khung duy nhất: sơ đồ phóng vừa phải vào khu (khoảng 30% toàn cảnh) làm nền, khu đang chọn tô viền, các khu xung quanh mờ đi và bấm được để chuyển khu; bảng chọn ghế hiện tại (nền tím nhạt, nút ghế khối nổi, hướng sân khấu) nổi giữa khung. Nút "Thu nhỏ toàn cảnh" quay về sơ đồ đầy đủ và giữ nguyên lựa chọn.

### OTP

Mọi sự kiện đang mở bán trên staging (Super Concert, Hanou) và trong dữ liệu mô phỏng đã bật OTP; hai sự kiện UAT đã đóng cũng giữ cờ bật (không ảnh hưởng vì không mua được).

## Bổ sung (23/11/2026, đợt 3): sơ đồ chỗ ngồi kiểu Ticketmaster

Mục tiêu: người mua nhìn thấy ghế ngay trên bản đồ, phóng to/di chuyển tự do, bấm một chỗ thì thông tin và giá hiện bên cạnh.

### Sơ đồ BTC (nhà hát, arena) và mọi sự kiện sau này dùng sơ đồ SVG của BTC

| Thành phần | Hành vi |
|---|---|
| Ghế | Chấm tròn vẽ ngay trong chính SVG, xếp theo hình thật của từng khu (`src/domain/zoneSeatLayout.js`). Còn trống = xanh dương, đang chọn = đen viền vàng, đã bán / đang giữ = xám |
| Camera | Bấm một khu thì phóng vào khu đó; kéo thả để di chuyển; chụm hai ngón hoặc Ctrl + cuộn hoặc nút ＋ − để thu phóng; nhấp đúp phóng nhanh; phím +, −, 0 và mũi tên khi bản đồ đang được lấy tiêu điểm; nút làm mới về toàn cảnh |
| Bản đồ nhỏ | Góc dưới bên phải, có khung vàng cho vùng đang xem, bấm để dịch camera |
| Khung thông tin vé | Cạnh bản đồ (dưới bản đồ trên điện thoại): Khu, Hàng, Ghế, giá, nút Thêm vào lựa chọn / Bỏ chọn. Bấm chấm chỉ mở khung này, ghế chỉ vào lựa chọn khi bấm Thêm. Ghế đã bán, đang giữ, đủ vé hoặc chưa mở bán thì nút bị khóa và nêu lý do |
| Đủ số vé tối đa | Mọi chấm còn trống chưa chọn đổi sang xám viền đỏ; bỏ chọn một ghế thì trở lại bình thường |

Chấm ghế chỉ hiện khi đã phóng to hoặc có khu đang mở; ở toàn cảnh bản đồ giữ nguyên bản vẽ của BTC. Chỉ chấm của khu đang mở bấm được (chọn khu trước, rồi chọn ghế).

### Super Concert (sơ đồ riêng, giữ camera theo khu)

Ghế đổi từ ô cung sang chấm tròn cùng bảng màu; bấm chấm thì khung thông tin vé hiện ở góc phải bản đồ (Khu, Hàng, Ghế, giá, nút Thêm / Bỏ chọn); nhấp đúp chọn nhanh. Đủ số vé thì chấm còn trống hiện dấu cấm đỏ và khung thông tin nêu cả hai giới hạn.

### Giới hạn trung thực

- Super Concert **chưa có** kéo thả tự do và bản đồ nhỏ: sơ đồ này vẫn là camera theo khu của bản cũ (phóng vào khu, nút Thu nhỏ toàn cảnh). Muốn có đủ như hai sơ đồ kia phải chuyển Super Concert sang bản đồ SVG chung, kéo theo việc bỏ bộ chạy riêng (`concertRuntime.js`) đang điều khiển cả đồng hồ đếm ngược trang chủ, nên chưa làm.
- Chưa có bộ lọc giá, loại vé, ghế dành cho người khuyết tật như Ticketmaster.
- Thu phóng bằng cuộn chuột cần giữ Ctrl để không cướp thao tác cuộn trang.
- Mới kiểm tra ở chế độ mô phỏng (mỗi khu 40 ghế); chưa kiểm với dữ liệu staging cho hai sơ đồ BTC vì staging chỉ có sơ đồ Super Concert.
- Ghế trên điện thoại vẫn nhỏ (chấm), nhưng có thể phóng to bằng chụm hai ngón hoặc nút ＋.

## Bổ sung (23/11/2026, đợt 4): Super Concert dùng bản đồ chung, sửa ghế tràn, xem toàn cảnh, kéo chuột

### Super Concert chuyển sang bản đồ chung

Ba sơ đồ (Super Concert, nhà hát, arena) nay cùng dùng `OfficialSeatingMap` và `SeatMapSection`, nên cùng một trải nghiệm kiểu Ticketmaster và cùng một luồng chọn vé, giữ chỗ, giới hạn vé, giá thời gian thực, OTP, đăng xuất.

- Hình sân vận động được sinh ra thành `public/maps/super-concert-stadium.svg` bằng `scripts/build-super-concert-map.mjs`, lấy đúng hình học của bộ chạy cũ (các khu hình vành elip, khu vé đứng, sân khấu). Mỗi khu có `data-zone-code` trùng mã khu trong cơ sở dữ liệu; khu hình vành có `data-arc` để xếp ghế theo vành.
- Super Concert luôn dùng sơ đồ này, bỏ qua địa chỉ ảnh cũ trong cột `SoDoTongQuanURL` của staging (đang trỏ tới một tệp ảnh ở máy chủ khác).
- Danh sách chọn khu chỉ gồm khu có hình trên bản đồ, nên không hiện VIP Platinum 2 và Standing 2 (cũng không hiện ở bản cũ); vé đứng vẫn chọn ở bảng "Vé đứng".
- Bộ chạy cũ (`src/legacy/concertRuntime.js`, `seating.html`) **không còn được dùng cho sơ đồ**. Phần còn lại của nó chỉ là hiệu ứng nền sao, làm mờ các mục khi cuộn và đồng hồ lật số mà HTML của đồng hồ đó đã không còn trên trang. Tệp và test của nó vẫn được giữ trong kho để đối chiếu, chưa xóa.

### Sửa các lỗi người dùng báo

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Ghế tràn ra ngoài khu hình bình hành (Orchestra Right) | Khu là nhóm `<g>` nên bản đồ chỉ biết hộp bao chữ nhật, không biết cạnh nghiêng | Dùng hình thật của `path` con; bề ngang mỗi hàng là giao của ba độ cao (trên, giữa, dưới hàng) và chừa lề theo bán kính ghế |
| Vào một khu rồi không xem lại được toàn cảnh | Nút làm mới chỉ đưa camera về, khu vẫn đang chọn nên các khu khác vẫn mờ; không có nút rõ ràng | Nút "← Xem toàn cảnh" (góc trên trái, chữ rõ ràng), nút làm mới và phím Escape đều thoát khu (bỏ chọn khu, camera về toàn cảnh) |
| Kéo chuột trong sơ đồ ảnh hưởng giao diện khác | Nhấn chuột trên bản đồ bắt đầu bôi đen chữ, kéo thả phần tử, và cờ "đã kéo" không được xóa nên cú bấm sau bị nuốt | Chặn bôi đen và kéo thả khi nhấn chuột trên bản đồ, lớp `et-tm-dragging` chặn bôi đen toàn trang khi đang kéo và được dọn khi thả, xóa cờ kéo |

## Bổ sung (24/11/2026): giữ chỗ trước, OTP xác nhận thanh toán sau, gia hạn một lần

### Vì sao đổi

Bản 23/11 hiện "Xác nhận thanh toán thành công" kèm đồng hồ 5 phút ngay sau OTP. Nghĩa của giữ chỗ là tạm khóa ghế trong lúc người mua hoàn tất thanh toán, nên hiện "thanh toán thành công" kèm đồng hồ là mâu thuẫn (và máy chủ chưa hề có thanh toán). Luồng đúng:

| Bước | Hành vi |
|---|---|
| 1. Chọn ghế | Ai cũng chọn tự do; chưa giữ chỗ, chưa có đồng hồ; người khác vẫn chọn được ghế đó |
| 2. Bấm **Giữ chỗ N vé** | Cần đăng nhập (chưa đăng nhập thì hộp thoại đăng nhập làm mờ nền, đăng nhập xong tự tiếp tục). **Không cần OTP.** Máy chủ giữ ghế 5 phút, đồng hồ bắt đầu; hộp thoại "Đã giữ chỗ thành công" có hai nút: Xác nhận thanh toán, Hủy giữ chỗ |
| 3. Bấm **Xác nhận thanh toán** | Sự kiện tắt OTP: xác nhận ngay. Sự kiện bật OTP: máy chủ yêu cầu OTP; giao diện **gia hạn giữ chỗ một lần** (thêm 5 phút, đúng hiệu lực mã OTP) rồi mở hộp thoại OTP (mã gửi về email của tài khoản đang đăng nhập) |
| 4. Nhập đúng OTP | Tự gọi lại xác nhận: giữ chỗ thành `CONVERTED`, ghế thành `DA_BAN`; hộp thoại "Thanh toán thành công (mô phỏng)", đồng hồ tắt, lựa chọn bị xóa |
| 5. "Để sau" ở hộp thoại OTP | Giữ chỗ vẫn còn, đồng hồ vẫn chạy; bấm "Xem giữ chỗ và thanh toán" để quay lại |

Quy tắc giữ ghế khi đang nhập OTP: gia hạn đúng **một lần**, +5 phút tính từ lúc bấm Xác nhận thanh toán mà cần OTP. Hết cả thời gian đó mà chưa nhập đúng thì ghế được trả. Không gia hạn nhiều lần để không giữ ghế vô hạn bằng cách mở OTP liên tục. "Thanh toán" vẫn là mô phỏng (chưa có cổng thanh toán, chưa phát hành vé); hàm xác nhận chỉ chuyển giữ chỗ thành đã mua.

### Máy chủ (migration `20261124090000_sprint2_giu_cho_truoc_otp_xac_nhan_thanh_toan.sql`)

| Thay đổi | Nội dung |
|---|---|
| `tao_giu_cho_theo_suat` | Bỏ kiểm OTP (chỉ còn bắt buộc đăng nhập). Vé đã xác nhận (`CONVERTED`) được tính vào hạn mức 4 vé và tồn kho vé đứng |
| `gia_han_giu_cho(giu_cho_id, phien_id)` (mới) | Chỉ chủ giữ chỗ; còn hạn; gia hạn một lần (+5 phút, cột mới `GIU_CHO.DaGiaHan`); gọi lại trả hạn đã gia hạn; hết hạn thì `GIU_CHO_HET_HAN` (P0001) |
| `xac_nhan_thanh_toan(giu_cho_id, phien_id)` (mới) | Chỉ chủ giữ chỗ; còn hạn; sự kiện bật OTP thì cần OTP (42501 "Can xac minh OTP de xac nhan thanh toan"); thành công: `GIU_CHO` → `CONVERTED`, `GHE` `DANG_GIU` → `DA_BAN`; gọi lại thành công (idempotent) |
| ACL | Hai hàm mới: `authenticated` được gọi, `anon` bị thu hồi |
| `huy_giu_cho`, `expire_seat_holds` | Không đổi: không đụng giữ chỗ đã `CONVERTED` (ghế đã bán không bị trả) |

Hệ quả khác: số ghế bán (`DA_BAN`) nay tăng khi người mua xác nhận, nên tỷ lệ lấp đầy mà định giá động đọc phản ánh cả giao dịch xác nhận.

### Giao diện

`SeatMapSection` (nút "Giữ chỗ N vé" → hộp thoại giữ chỗ → "Xác nhận thanh toán" → OTP → "Thanh toán thành công (mô phỏng)"), `HoldConfirmationDialog` (hai pha `held` và `paid`), `bookingService` (`createSeatHold` chỉ cần đăng nhập; `extendSeatHold`; `confirmSeatPayment`), lớp mô phỏng `mockBooking` (`giaHan`, `xacNhan`, vé đã xác nhận tính vào hạn mức).

### Kiểm thử

- `npm run check`: 997 test đạt (thêm bốn test gia hạn một lần, xác nhận trong hạn gia hạn, hết hạn, idempotent, hạn mức tính vé đã xác nhận).
- Chrome thật, chế độ mô phỏng: `scripts/nfr/checkout-flow.mjs` (cả arena và Super Concert), `logout-hold-flow.mjs`, `tm-map-flow.mjs`: đạt.
- pgTAP: `sprint2_otp_limit.sql` và `sprint2_integration.sql` đã sửa theo luồng mới; thêm `sprint2_xac_nhan_thanh_toan.sql` (26 ca: giữ chỗ không cần OTP, xác nhận cần OTP, đúng chủ và đúng phiên, idempotent, `huy_giu_cho` không trả ghế đã bán, vé đã xác nhận tính vào hạn mức và tồn kho vé đứng, gia hạn một lần, hết hạn, ACL). Kết quả chạy xem phần cuối file này.

### Chưa làm hoặc giới hạn

- Gia hạn chỉ xảy ra khi người dùng bấm Xác nhận thanh toán và cần OTP; mã OTP gửi lại muộn có thể còn hiệu lực lâu hơn hạn giữ chỗ (khi đó phải giữ chỗ lại).
- Tải lại trang khi đang giữ chỗ vẫn mất trạng thái giữ trên giao diện (máy chủ tự trả sau khi hết hạn).
- Chưa kiểm trên staging với email thật cho luồng mới (xem mục kết quả triển khai nếu đã áp migration).

### Kết quả triển khai (24/11/2026)

- **pgTAP cục bộ (Docker):** 16 file, 860 test đạt sau `db reset` áp lại toàn bộ migration.
- **OTP thật cục bộ** (`scripts/verify-otp-local.mjs`, thư thật qua hộp thư cục bộ): 17 kiểm tra đạt, gồm giữ chỗ chỉ cần đăng nhập, xác nhận thanh toán bị 42501 khi chưa OTP, xác nhận thành công (CONVERTED) sau OTP thật.
- **Áp lên staging `qxkgkbayxxaakkwtepss`:** `db push --remote=qxkgkbayxxaakkwtepss` (chạy thử trước), áp 2 migration: `20261123120000_seed_super_concert_upper_tier_seats.sql` (seed ghế Upper Tier đã có sẵn trên main, idempotent) và `20261124090000_...`. Các bước tự kiểm tra trong migration đạt; chạy lại chạy thử cho kết quả "Remote database is up to date".
- **Kiểm chỉ đọc bằng khóa công khai:** `xac_nhan_thanh_toan` và `gia_han_giu_cho` tồn tại và `anon` bị từ chối 42501 (permission denied for function).
- **Chưa kiểm:** luồng đầy đủ với tài khoản và email thật trên bản triển khai công khai.

## Bổ sung (24/11/2026): mã demo thay OTP cho tài khoản @demo.vn

Tài khoản đăng nhập nhanh (`buyer@demo.vn`) không có hộp thư thật nên không nhận được OTP. Để demo, có **mã demo thay OTP** (migration `20261124100000_sprint2_ma_demo_bo_qua_otp.sql`):

| Ràng buộc | Cách thực hiện |
|---|---|
| Kiểm ở máy chủ | `xac_nhan_thanh_toan(p_giu_cho_id, p_phien_id, p_ma_demo DEFAULT NULL)`; trình duyệt chỉ gửi mã người dùng nhập |
| Mã không nằm trong mã nguồn | Chỉ lưu SHA-256 trong bảng riêng `CAU_HINH_DEMO` (khóa `MA_DEMO_BO_QUA_OTP`); `authenticated` và `anon` không đọc được; migration không chứa mã nào |
| Chỉ tài khoản demo | Email kết thúc `@demo.vn` (không phân biệt hoa thường); người dùng thật nhập đúng mã vẫn bị từ chối |
| Không lộ thông tin | Sai mã, mã quá ngắn, chưa cấu hình mã, tài khoản không phải demo: đều trả cùng lỗi 42501 như thiếu OTP |

**Đặt hoặc đổi mã** (người quản trị làm trên Supabase Dashboard, SQL Editor; thay `<MA>` bằng mã riêng của nhóm, **không ghi mã vào repo hay tài liệu**):

```sql
INSERT INTO public."CAU_HINH_DEMO" ("Khoa", "GiaTri")
VALUES ('MA_DEMO_BO_QUA_OTP', encode(sha256(convert_to('<MA>', 'UTF8')), 'hex'))
ON CONFLICT ("Khoa") DO UPDATE SET "GiaTri" = EXCLUDED."GiaTri", "NgayCapNhat" = NOW();
```

**Tắt mã demo:** `DELETE FROM public."CAU_HINH_DEMO" WHERE "Khoa" = 'MA_DEMO_BO_QUA_OTP';` (làm sau buổi bảo vệ).

Giao diện: ô OTP của tài khoản `@demo.vn` nhận thêm chữ; mã có chữ được gửi lên máy chủ thay vì qua Supabase Auth, không cần bấm Gửi mã. Sai mã thì báo "Mã không đúng" và mở lại hộp thoại OTP, ghế vẫn được giữ. Ở chế độ mô phỏng không có máy chủ nên mã demo bị từ chối (dùng mã mô phỏng 123456).

Kiểm thử: pgTAP `sprint2_ma_demo_otp.sql` (14 ca: chưa cấu hình, sai mã, mã ngắn, thiếu mã, tài khoản thật, đúng mã thành công và ghế đã bán, email viết hoa, OTP thật vẫn chạy, xóa cấu hình thì ngừng, ACL, định nghĩa hàm không chứa mã); `scripts/nfr/demo-code-flow.mjs` (giao diện, Chrome thật, chế độ mô phỏng). Tổng pgTAP: 17 file, 874 test đạt.

Giới hạn: chưa giới hạn số lần thử mã; mã là cửa sau có chủ đích chỉ cho tài khoản demo, nên xóa dòng cấu hình sau buổi bảo vệ.

## Bổ sung (24/11/2026): khu vé đứng gộp trong khung thông tin vé, BTC xóa sự kiện

### Khu vé đứng trên bản đồ đại diện cho cả nhóm hạng vé đứng

Bấm khu vé đứng trên bản đồ (ví dụ GA Fanzone Standing 1) thì khung thông tin vé hiện **đủ các hạng vé đứng** của suất (Standing 1 và Standing 2), mỗi hạng một bộ chọn số lượng. Khi đã có khu đứng vẽ trên bản đồ, khối "Vé đứng (không chọn ghế)" ở dưới sơ đồ được ẩn; nếu không có khu đứng nào vẽ trên bản đồ (hoặc sự kiện chỉ có vé đứng) khối đó vẫn hiện như cũ để không có hạng vé nào bị mất lối chọn. Kiểm: `scripts/nfr/standing-panel-flow.mjs`.

### Giữ chỗ hoạt động với mọi sự kiện

Giữ chỗ, xác nhận thanh toán và OTP lấy sự kiện và suất theo **trang sự kiện đang mở** (`setActiveEventContext` ở `App.tsx`), không gắn riêng Super Concert; hàm máy chủ làm việc theo suất diễn. Điều kiện: sự kiện công khai, đang trong thời gian mở bán, có ghế hoặc khu vé đứng.

### BTC xóa sự kiện (xóa mềm)

Migration `20261124110000_sprint2_xoa_mem_su_kien.sql`, hàm `xoa_su_kien(p_su_kien_id)`:

| Quy tắc | Nội dung |
|---|---|
| Ai được xóa | Chỉ chủ sở hữu hoặc quản trị viên của tổ chức (tài khoản ORGANIZER hoặc ADMIN); biên tập viên và tổ chức khác bị từ chối (42501) |
| Xóa được khi | Là bản nháp, hoặc **đã kết thúc** (sự kiện và mọi suất đã qua thời gian kết thúc) |
| Không xóa được | Sự kiện đang bán chưa kết thúc (`SU_KIEN_CHUA_KET_THUC`); sự kiện còn giữ chỗ đang hiệu lực (`SU_KIEN_DANG_CO_GIU_CHO`) |
| Cách xóa | **Xóa mềm**: `TrangThaiCongBo` = `DA_AN`. Ẩn khỏi danh sách BTC và khỏi trang công khai; dữ liệu giữ lại |
| Gọi lại | Thành công (idempotent) |

Lý do không xóa cứng: nhật ký giá và đề xuất giá là bất biến (trigger chặn xóa, khóa ngoại RESTRICT) và vé đã bán cần giữ để đối chiếu.

Giao diện: nút **Xóa** trên thẻ sự kiện (chỉ chủ sở hữu và quản trị thấy), khóa khi sự kiện đang bán chưa kết thúc, có hộp xác nhận ngay trong thẻ. Kiểm: pgTAP `sprint2_xoa_mem_su_kien.sql` (13 ca), `scripts/nfr/delete-event-flow.mjs` (Chrome thật, chế độ mô phỏng).

**Không có tự động xóa theo thời hạn.** Đã cân nhắc "xóa sau N ngày kể từ khi kết thúc" nhưng không bật: Super Concert 2026 đã kết thúc ngày 01/11/2026 nên một tác vụ 30 ngày sẽ ẩn sự kiện demo chính trước hạn nộp bài. Khi cần có thể thêm tác vụ định kỳ gọi cùng quy tắc.

Tổng pgTAP sau đợt này: 18 file, 887 test đạt.
