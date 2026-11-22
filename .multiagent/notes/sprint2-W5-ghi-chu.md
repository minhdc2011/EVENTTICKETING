# Ghi chú nghiệm thu đợt W5 Sprint 2: OTP và giới hạn vé, phần giao diện

Đợt W5 làm xong T1–T6 qua agentkit. T3 và T7 gặp lỗi hạ tầng của worker `agy` (`empty conversation id`), nên T3 được lấy từ nhánh attempt và T7 (ghi chú này) viết tay. Ghi chú này chỉ dùng kết quả đã chạy lại trên `sprint2/integration`, không suy từ báo cáo của worker.

## 1. Cổng kiểm tra

| Kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `npm run check` (tsc, `node --test`, vite build) | Đạt: 923/923 test, build thành công | Chạy sau khi gộp T1–T6. Sửa một test của T3 (xem mục 6) |
| pgTAP (`db:test`) | Không chạy lại ở W5 | W5 không sửa migration hay RPC. Kết quả W4 là 13 file, 797 test PASS |
| Thao tác bằng trình duyệt (bàn phím, 360 px, ảnh) | **Chưa kiểm chứng** | Chưa ai mở giao diện. Đây là việc của người dùng, xem mục 5 |
| OTP thật qua Supabase hosted | **Chưa kiểm chứng** | Chỉ có thể thử khi gắn project Supabase thật |

## 2. Bảng tiêu chí (phần giao diện)

"Có bằng chứng" nghĩa là có test hành vi đã chạy trong `npm run check`. Test này chạy bằng node với DOM giả, chưa phải thao tác trên trình duyệt thật. Kiểm chứng phía máy chủ nằm ở ghi chú W4.

| Tiêu chí | Phần giao diện | Bằng chứng | Trạng thái |
|---|---|---|---|
| AC-T2-01.1 | Mã đúng, còn hạn thì mở cổng; sự kiện bật OTP chưa xác minh thì không mount phần chọn ghế/vé đứng, cả khi vào bằng CTA, anchor hay đường dẫn trực tiếp | `src/components/event-template/PurchaseAccessGate.tsx`, `src/domain/otpGate.js`; `tests/otp-gate.test.mjs`, `tests/otp-access-gate-ui.test.mjs` | Có bằng chứng bằng test; chưa thử trên trình duyệt |
| AC-T2-01.2 | Sai mã: hiển thị số lần còn lại (bộ đếm client, tối đa 5) | `src/components/event-template/OtpVerificationPanel.tsx`, `src/domain/otpServiceCore.js`; `tests/otp-service.test.mjs` | Có bằng chứng bằng test; chưa thử trên trình duyệt |
| AC-T2-01.5 | Nút gửi lại bị vô hiệu 60 giây sau lần gửi thành công, hiển thị thời gian chờ; tối đa 3 lần/giờ ở client | `OtpVerificationPanel.tsx`, `otpServiceCore.js`; `tests/otp-service.test.mjs`, `tests/otp-access-gate-ui.test.mjs` | Phần giao diện có bằng chứng. Cưỡng chế 60 giây của Auth chưa thử với Supabase thật. "3 lần/giờ" chỉ là bộ đếm client |
| AC-T2-01.8 | Sự kiện tắt OTP bỏ qua bước OTP; BTC bật/tắt theo sự kiện | `PurchaseAccessGate.tsx`; `OrganizerPurchaseConfig.tsx`, `purchaseConfigController.js`; `tests/organizer-purchase-config.test.mjs`, `tests/purchase-config.test.mjs` | Có bằng chứng bằng test. Chế độ mock đọc lại đúng cờ ở trang khán giả |
| AC-T2-01.9 | Label/aria-label, `aria-describedby` cho lỗi, `aria-live`, bàn phím Tab/Enter, thông báo có chữ ngoài màu, CSS co và xuống dòng ở 360 px | `OtpVerificationPanel.tsx`, `OtpVerificationPanel.css`; test DOM kiểm thuộc tính | **Chỉ chứng minh thuộc tính trong mã.** Bàn phím và 360 px thật chưa kiểm chứng (mục 5) |
| AC-T2-02.1 | Bộ đếm "Đã chọn x/giới hạn" cho ghế ngồi và vé đứng; mỗi lần chọn tối đa min(4, giới hạn) | `SeatMapSection.tsx`, `SelectionSummary.tsx`, `src/legacy/concertRuntime.js`, `src/legacy/fragments/seating.html`; `tests/purchase-limit-presentation.test.mjs` | Có bằng chứng bằng test cho cả React lẫn Super Concert |
| AC-T2-02.3 | Thông báo `VUOT_GIOI_HAN_VE` nêu giới hạn và số vé còn được chọn lấy từ máy chủ, tồn tại ít nhất 5 giây | `src/domain/purchaseLimitError.js`, `purchaseLimitPresentation.js`; `tests/purchase-limit-error.test.mjs`, `tests/purchase-limit-presentation.test.mjs` | Có bằng chứng bằng test với đồng hồ giả (4999/5001 ms) |
| AC-T2-02.6 | BTC đổi `SoVeToiDaMoiDon` (1–20) và `YeuCauXacMinhOTP`; chỉ `CHU_SO_HUU`/`QUAN_TRI`; kiểm tra giá trị trước khi gọi RPC | `OrganizerPurchaseConfig.tsx`, `src/domain/purchaseConfig.js`, `src/services/purchaseConfigService.ts`; `tests/organizer-purchase-config.test.mjs`, `tests/purchase-config.test.mjs` | Phần giao diện có bằng chứng. Audit và phân quyền phía DB thuộc kiểm chứng W4 (pgTAP) |

## 3. Hướng dẫn mở từng màn hình ở chế độ mock

**Chuẩn bị.** Trong `Eventticketing/.env`, đặt `VITE_USE_MOCK_DATA=true`, rồi chạy `npm run dev`. Mở địa chỉ Vite in ra (thường `http://localhost:5173`). Nếu trước đó từng chạy bản cũ, mở DevTools > Application > Local Storage và xóa các khóa bắt đầu bằng `eventticketing` để bắt đầu sạch.

**Tài khoản mock.** Chế độ mock chấp nhận email bất kỳ có ký tự `@` và mật khẩu từ 6 ký tự (xem `signInBuyer`). Hai email được gán sẵn hồ sơ: `buyer@demo.vn` là người mua, `organizer@demo.vn` là BTC. Mã OTP mock cố định là `123456`. Chỉ ghi ở tài liệu này, giao diện không hiển thị mã mẫu.

**Sự kiện dùng để thử** (seed trong `src/domain/mockPurchaseConfig.js` và `src/services/eventService.ts`):

| Mục đích | Sự kiện | Cấu hình ban đầu | Đường dẫn gợi ý |
|---|---|---|---|
| Trang React, bật OTP, giới hạn 2 vé | Creative Tech Summit 2026 (ID 2) | OTP bật, giới hạn 2 | `/events/creative-tech-summit-2026/shows/ngay-1` |
| Super Concert (legacy), OTP tắt | Super Concert 2026 (ID 1) | OTP tắt, giới hạn 4 | `/events/super-concert-2026/shows/ngay-1` |
| Cấu hình BTC | Cùng hai sự kiện trên | Đổi bằng màn hình BTC | `/organizer/login`, sau đó `/organizer/dashboard` |

Đường dẫn chính xác phụ thuộc cách chạy (`base` của Vite). Nếu một đường dẫn không mở, vào danh sách sự kiện ở trang chủ rồi bấm vào sự kiện.

**A. Màn hình OTP (React, ID 2)**
1. Chưa đăng nhập, mở đường dẫn sự kiện ID 2. Phần chọn ghế không hiện, thay bằng cổng yêu cầu đăng nhập. Chụp ảnh màn hình này.
2. Bấm đăng nhập (hoặc mở `/account/login`), đăng nhập bằng `buyer@demo.vn` và mật khẩu bất kỳ từ 6 ký tự. Hệ thống đưa về lại đúng sự kiện và suất diễn.
3. Cổng OTP hiện: bấm gửi mã. Chụp ảnh bộ đếm hiệu lực 300 giây và thời gian chờ gửi lại 60 giây (nút gửi lại bị vô hiệu).
4. Nhập sai mã (ví dụ `000000`): thông báo nêu số lần còn lại. Chụp ảnh.
5. Nhập `123456`: cổng mở, phần chọn ghế xuất hiện.
6. Thử bàn phím: chỉ dùng Tab, Shift+Tab và Enter để gửi và xác minh.

**B. Chọn vé và lỗi giới hạn**
1. Ở sự kiện ID 2 (giới hạn 2), chọn ghế: bộ đếm hiện `Đã chọn x/2`.
2. Giữ chỗ 2 ghế, quay lại chọn thêm rồi giữ chỗ lần nữa. Lần giữ vượt giới hạn trả lỗi chuẩn hóa, giao diện hiện thông báo nêu giới hạn và số vé còn lại, tồn tại ít nhất 5 giây, lựa chọn được giữ nguyên. Chụp ảnh trong 5 giây đầu.
3. Giữ chỗ trước để tái hiện: kho giữ chỗ mock đếm tổng quantity của hold còn hiệu lực theo tài khoản và sự kiện, cộng mọi suất diễn (`src/domain/mockBooking.js`). Chạm giới hạn sau vài lần giữ liên tiếp trên cùng tài khoản. Hủy giữ chỗ để thấy số đếm giảm.
4. Với cấu hình lớn hơn 4 (ví dụ 10): mỗi lần chỉ chọn tối đa 4, bộ đếm hiện mẫu số 10 kèm giải thích hai giới hạn.
5. Lặp lại trên Super Concert (ID 1): bộ đếm gồm cả ghế ngồi và vé đứng.

**C. Màn hình BTC**
1. Mở `/organizer/login`, đăng nhập `organizer@demo.vn` và mật khẩu bất kỳ từ 6 ký tự.
2. Trên thẻ sự kiện, bấm **Cấu hình mua vé**. Chụp ảnh form.
3. Đổi giới hạn (1–20) và công tắc OTP, lưu. Nhập giá trị ngoài khoảng (0, 21, 2,5, để trống) và xác nhận lỗi hiện cạnh trường, không gọi lưu.
4. Mở lại trang khán giả cùng sự kiện: cờ OTP và giới hạn đã khớp. Cấu hình áp dụng cho lần chọn sau, không đổi giữ chỗ đã tạo.
5. Đăng nhập bằng tài khoản khác vai trò (ví dụ `buyer@demo.vn`): không thấy nút này.

**Bật/tắt OTP.** Dùng màn hình BTC ở mục C: tắt OTP cho ID 2 thì khán giả vào thẳng bước chọn ghế; bật OTP cho ID 1 thì Super Concert cũng hiện cổng OTP.

**Các màn hình cần chụp.** (1) Cổng đăng nhập, (2) panel OTP có hai bộ đếm, (3) lỗi sai mã, (4) bộ đếm `x/giới hạn`, (5) thông báo vượt giới hạn, (6) form cấu hình BTC và lỗi theo trường, (7) từng màn hình trên ở viền 360 px (DevTools > Toggle device toolbar > 360 × 800).

## 4. Giới hạn đã biết

- **"3 lần gửi lại mỗi giờ" và "5 lần sai thì khóa 15 phút" chỉ là bộ đếm ở client.** Auth chỉ cưỡng chế chờ 60 giây giữa hai lần gửi và hiệu lực 300 giây. Giao diện không được tuyên bố máy chủ khóa tài khoản hay hủy mã sau 5 lần sai. Người dùng mở tab ẩn danh hoặc xóa localStorage sẽ qua được bộ đếm này.
- **Mock khác Auth thật:** mã cố định `123456`, không gửi email, bằng chứng mock hết hiệu lực sau 24 giờ ở client, không có `amr` của JWT. Với Supabase thật, `da_xac_minh_otp()` đọc `amr` của phiên và là cổng duy nhất mà máy chủ tin.
- **Người chưa đăng nhập không giữ chỗ được ở nhánh thật** (W4 bắt buộc tài khoản). Vì vậy giao diện đưa người dùng đăng nhập trước khi chọn ghế.
- **Mâu thuẫn chưa giải quyết:** không có. Hai việc còn mở là phần kiểm chứng ở mục 1 (trình duyệt thật và OTP hosted).

## 5. Việc người dùng kiểm chứng sau khi merge

- [ ] `npm run check` đạt trên máy mình (tôi đã chạy: 923/923).
- [ ] Đi hết luồng A, B, C ở mục 3 ở chế độ mock.
- [ ] **Bàn phím:** chỉ Tab/Shift+Tab/Enter/Escape; focus nhìn thấy rõ; hộp thoại cấu hình BTC giữ focus bên trong và trả focus khi đóng.
- [ ] **360 px:** panel OTP, bộ đếm, thông báo vượt giới hạn và form BTC không tràn ngang, không che nút giữ chỗ.
- [ ] Chụp các ảnh ở mục 3 để đưa vào báo cáo.
- [ ] Luồng thật (không mock): bật Supabase Auth, kiểm tra email OTP có mã (mẫu email dùng `{{ .Token }}`), thời hạn 300 giây, khoảng gửi lại 60 giây, rồi giữ chỗ bị từ chối trước khi xác minh.

## 6. Thay đổi CSDL và giao diện RPC

W5 **không sửa migration và không sửa RPC.** Giao diện dùng các RPC của W4:

| RPC | Nơi dùng |
|---|---|
| `da_xac_minh_otp()` | `otpService.ts` kiểm tra bằng chứng sau `verifyOtp` và khi mở lại cổng |
| `luu_cau_hinh_mua_ve(p_su_kien_id, p_so_ve_toi_da, p_yeu_cau_otp)` | `purchaseConfigService.ts` cho màn hình BTC |
| `tao_giu_cho_theo_suat` (lỗi `VUOT_GIOI_HAN_VE`, mã 22023) | `bookingService.ts` chuẩn hóa lỗi qua `purchaseLimitError.js` |

**Một sửa nhỏ khi hoàn tất T3 tay:** test `tests/otp-access-gate-ui.test.mjs` (kiểm tra vòng đời runtime Super Concert) dùng bản giả của `config/runtime` thiếu `isSupabaseConfigured`, `isApiConfigured`, `isWebSocketConfigured` nên esbuild báo lỗi sau khi T5 đổi đường nhập. Đã bổ sung ba hàm đó vào bản giả; không đổi mã sản phẩm.

## 7. Tài liệu cần cập nhật

- Báo cáo chính: mô tả FR-T2-01 và FR-T2-02 theo cách hai lớp (giao diện + máy chủ), nêu rõ 3 lần/giờ và khóa 15 phút chỉ ở client.
- Hướng dẫn demo (`DEMO_SPRINT2.md`, làm ở W6): thêm luồng A, B, C của mục 3.
- Bảng truy vết tiêu chí: điền AC-T2-01.1/.2/.5/.8/.9 và AC-T2-02.1/.3/.6 với trạng thái "có bằng chứng bằng test, chưa thử trình duyệt".
- Nhật ký giới hạn Sprint 2: thêm mục lỗi `agy` ở W5 và các việc chưa kiểm chứng ở mục 1.
