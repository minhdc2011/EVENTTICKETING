# 05 — Ma trận truy vết, kiểm thử và đóng Sprint 1

## 1. Ma trận liên kết kiến trúc (UC → Bảng ERD → Lớp Class → Sequence Diagram)

> **Quy ước mã thống nhất (02/11/2026).** Mã yêu cầu theo SRS: `FR-T1-01..04` (Sprint 1), `FR-T3-01` (Sprint 3). `FR-T1-03` (cổng Ban tổ chức, `REQ-T1-08`) gồm `FR-T1-03.1..03.6`. Mã Use Case theo tài liệu đặc tả `Requirements_UseCases_Sprint1`: `UC-T1-01..05`, `UC-BTC-01..05`, `UC-T2-01..02`, `UC-T4-01..05` (Sprint 2), `UC-T3-01..02`. NFR dùng đúng số hiệu ở Phần 2 của SRS.

| Mã UC | FR | Sprint | Bảng ERD tham gia | Lớp Entity / Service (thiết kế) | Lớp phân tích (đặc tả) | Sequence |
|---|---|:---:|---|---|---|:---:|
| **UC-T1-01** | FR-T1-01 | 1 | `SU_KIEN`, `SUAT_DIEN`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | `SuKien`, `SuatDien`, `NgheSi`, `SuKienNgheSi` • `EventService`, `ScheduleService`, `ArtistService` | `EventDetailPage`, `EventController`, `Event` | SD-01 |
| **UC-T1-02** | FR-T1-02 | 1 | `SUAT_DIEN`, `KHU_VUC`, `GHE`, `CAU_HINH_SU_KIEN` | `KhuVuc`, `Ghe`, `CauHinhSuKien` • `TicketDataService`, `EventService` | `SeatMapView`, `SeatMapController`, `SeatMap`, `Zone`, `Seat` | SD-02 |
| **UC-T1-03** | FR-T1-04 | 1 | (dữ liệu đã tải) | — (xử lý giao diện) | `SeatMapView` | — |
| **UC-T1-04** | FR-T1-04 | 1 | `KHU_VUC`, `GHE` | `KhuVuc`, `Ghe` | `SeatMapView`, `TicketClass` | — |
| **UC-T1-05** | FR-T1-02 | 1 | `GHE` | `Ghe` • `SeatRealtimeService` | `RealtimeSeatController`, `Seat` | SD-02 |
| **UC-BTC-01** | FR-T1-03.1 | 1 | `HO_SO_NGUOI_DUNG` *(và `auth.users`)* | `HoSoNguoiDung` • `OrganizerService` | — | SD-03 |
| **UC-BTC-02** | FR-T1-03.2 | 1 | `TO_CHUC`, `THANH_VIEN_TO_CHUC` | `ToChuc`, `ThanhVienToChuc` • `OrganizerService` | — | SD-03 |
| **UC-BTC-03** | FR-T1-03.3 | 1 | `SU_KIEN`, `CAU_HINH_SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `GHE`, `GIU_CHO`, `CHI_TIET_GIU_CHO`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | `SuKien`, `CauHinhSuKien`, `SuatDien`, `KhuVuc`, `Ghe`, `GiuCho`, `ChiTietGiuCho`, `NgheSi`, `SuKienNgheSi` • `OrganizerService` | `EventEditorPage`, `EventAdminController` | SD-04 |
| **UC-BTC-04** | FR-T1-03.4 | 1 | `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC` | `SuKien`, `SuatDien`, `KhuVuc` • `OrganizerService`, `EventService` | `EventEditorPage`, `EventAdminController` | SD-04 |
| **UC-BTC-05** | FR-T1-03.5 | 1 | `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC` | `SuKien`, `SuatDien`, `KhuVuc` • `OrganizerService` | `EventAdminController` | SD-04 |
| **UC-T2-01** | FR-T2-01 | 2 | `CAU_HINH_SU_KIEN` (cột `YeuCauXacMinhOTP`), `HO_SO_NGUOI_DUNG` | `CauHinhSuKien`, `HoSoNguoiDung` | — (hoàn thiện cuối kỳ) | SD OTP (Sprint 2) |
| **UC-T2-02** | FR-T2-02 | 2 | `CAU_HINH_SU_KIEN` (cột `SoVeToiDaMoiDon`), `GIU_CHO`, `CHI_TIET_GIU_CHO` | `CauHinhSuKien`, `GiuCho`, `ChiTietGiuCho` | — (hoàn thiện cuối kỳ) | SD OTP + 4 vé (Sprint 2) |
| **UC-T4-01** | FR-T4-02 | 2 | `QUY_TAC_GIA`, `KHU_VUC` | `QuyTacGia`, `KhuVuc` | — (hoàn thiện cuối kỳ) | SD DP cấu hình khung giá (Sprint 2) |
| **UC-T4-02** | FR-T4-04 | 2 | `QUY_TAC_GIA`, `DE_XUAT_GIA`, `KHU_VUC` | `QuyTacGia`, `DeXuatGia` | — (hoàn thiện cuối kỳ) | SD DP tính đề xuất giá (Sprint 2) |
| **UC-T4-03** | FR-T4-04 | 2 | `DE_XUAT_GIA`, `NHAT_KY_GIA`, `KHU_VUC` | `DeXuatGia`, `NhatKyGia` | — (hoàn thiện cuối kỳ) | SD DP duyệt/từ chối (Sprint 2) |
| **UC-T4-04** | FR-T4-04 | 2 | `KHU_VUC`, `NHAT_KY_GIA` | `KhuVuc`, `NhatKyGia` | — (hoàn thiện cuối kỳ) | SD DP giá hiện hành (Sprint 2) |
| **UC-T4-05** | FR-T4-02 | 2 | `QUY_TAC_GIA`, `KHU_VUC` | `QuyTacGia`, `KhuVuc` | — (hoàn thiện cuối kỳ) | SD DP kiểm tra sàn/trần (Sprint 2) |
| **UC-T3-01** | FR-T3-01 | 3 | `KHU_VUC`, `GHE` | `KhuVuc`, `Ghe` | `SeatMapView` | SD-05 |
| **UC-T3-02** | FR-T3-01 | 3 | `GIU_CHO`, `CHI_TIET_GIU_CHO`, `GHE`, `KHU_VUC`, `SUAT_DIEN` | `GiuCho`, `ChiTietGiuCho`, `Ghe` • `BookingService` | `SeatHoldController`, `SeatLock`, `Seat` | SD-05, SD-06 |

Các dòng Sprint 2 điền theo ERD 17 bảng (`QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA` là bảng mới; OTP là cột `YeuCauXacMinhOTP` của `CAU_HINH_SU_KIEN`) và các sequence đã soạn trong kế hoạch Sprint 2; cột lớp phân tích sẽ hoàn thiện ở cuối kỳ.

Bảng `DIA_DIEM` chưa được UC nào ghi trực tiếp trong V1 (địa điểm của sự kiện do BTC tạo đang lưu bằng cột văn bản của `SU_KIEN`); bảng có trong CSDL để `SUAT_DIEN` tham chiếu.

---

## 2. Requirements Traceability Matrix

| Requirement | Thiết kế / Dữ liệu ERD | Hiện thực mã nguồn | Bằng chứng kiểm thử | Trạng thái |
|---|---|---|---|---|
| **FR-T1-01** | Route event/show; `SU_KIEN 1:N SUAT_DIEN` | `App.tsx`, `publicRoute`, `EventCatalog` | `tests/product-foundation.test.mjs` | **Pass** |
| **FR-T1-02** (hạng vé, giá) | `KHU_VUC` theo suất diễn (Cha chính `SuatDienID`) | `eventService`, `TicketTiersSection` | `tests/event-template.test.mjs` | **Pass** |
| **FR-T1-02** (AC-02.4, khu hết ghế trên sơ đồ tổng quát) | `GHE.TrangThai` theo `KhuVucID` | `summarizeZoneAvailability` (`seatMap.js`), `StadiumOverview` | `tests/zone-availability.test.mjs` (hành vi) + kiểm tra trình duyệt 11/11/2026 (TC-T1-09) | **Pass** (khu hết ghế bị làm mờ, viền đứt, nhãn chữ "× HẾT VÉ"; vẫn mở được để xem) |
| **FR-T1-02** (realtime, UC-T1-05) | `GHE`, Realtime WebSocket subscription | `seatRealtimeService`, `seatRealtime` domain | `tests/seat-realtime.test.mjs` | **Pass** |
| **FR-T1-04** | Zoom/pan, lọc khu, tìm ghế, tooltip trên dữ liệu `KHU_VUC`, `GHE` đã tải | `SeatMapSection`, `MapPanZoom`, `ZoneSeatGrid`, `SeatButton`; logic thuần `seatSearch.js`, `panZoom.js` | `tests/seat-search.test.mjs`, `tests/pan-zoom.test.mjs` (hành vi) + `tests/seat-map.test.mjs` + kiểm tra trình duyệt 11/11/2026 | **Pass** theo kiểm tra trình duyệt tự động (TC-T1-12: nút ±, Ctrl+cuộn, kéo, pinch, phím; TC-T1-15: mã sai báo "Không tìm thấy ghế", mã đúng làm nổi bật và đưa ghế vào khung nhìn). Cần chạy tay lại Test Log để xác nhận chính thức |
| **FR-T3-01** *(Sprint 3, lát cắt kỹ thuật)* | `GIU_CHO`, `CHI_TIET_GIU_CHO`, RPC transaction 5 phút | `bookingService`, `tao_giu_cho_theo_suat` | `tests/database-relationships.test.mjs` | **Pass** |
| **FR-T1-01** (timeline) | Lịch trình sự kiện gộp trong `SU_KIEN.MoTaChiTiet` | `SU_KIEN.MoTaChiTiet`, `parseTimelineFromDescription`, `ScheduleDialog` | `tests/database-relationships.test.mjs` + `tests/public-schedule.test.mjs` | **Pass** |
| **FR-T1-03.1** | Ranh giới tài khoản `USER` và `ORGANIZER` | `BuyerAuth`, `OrganizerAuthView`, `HO_SO_NGUOI_DUNG` | `tests/account-boundary.test.mjs` | **Pass** |
| **FR-T1-03.2** | `TO_CHUC`, RBAC đa tổ chức trong `THANH_VIEN_TO_CHUC` | `organizerService` + RLS policies | `tests/account-boundary.test.mjs` + pgTAP | **Pass** |
| **FR-T1-03.3** | Aggregate sự kiện: Cấu hình 1–1 `CAU_HINH_SU_KIEN`, Show, Tier, Lineup | `OrganizerEventWizard`, `luu_su_kien_toan_dien` | `tests/organizer-schedule-lineup.test.mjs` + `tests/database-relationships.test.mjs` | **Pass live** |
| **FR-T1-03.4** | Preview bản nháp dùng chung `EventTemplate` | Trang sự kiện với `?preview=1` (`loadEventForPreview`) + `EventHeader` banner | `tests/event-template.test.mjs` | **Pass** |
| **FR-T1-03.5** | Kiểm tra điều kiện & Công bố `cong_bo_su_kien` | `evaluatePublishReadiness` + RPC `cong_bo_su_kien` | `tests/organizer-uat.test.mjs` | **Pass** |
| **FR-T1-03.6** | Mọi event dùng chung 1 template; đặc thù cắm Extension | `GenericEventPage`, `EventTemplate` | Architecture invariant tests | **Pass** |
| **NFR-09** (bảo mật) | RLS 14/14 bảng, RPC `SECURITY DEFINER` an toàn; ghi `CAU_HINH_SU_KIEN` chỉ cho vai trò biên tập; **ghế (`GHE`) chỉ ghi qua RPC** | Migrations `20261027120000`, `20261028100000`, `20261103090000`; **`20261111090000_server_side_seat_generation.sql` (mới)** | System catalog live audit + tests; `supabase/tests/server_side_seat_generation.sql` (27 kiểm tra) | **Pass live** cho các migration đến `20261103090000`. Migration `20261111090000` đã viết nhưng **chưa áp dụng lên Supabase live và test pgTAP chưa được chạy** (chưa có Supabase local) |
| **NFR-02** | Row lock `FOR UPDATE` + hết hạn 5 phút | RPC `tao_giu_cho_theo_suat`, pg_cron | Static review; `scripts/nfr/hold-contention.mjs` (20 phiên cùng giữ 1 ghế) đã viết | **Chưa đo**: thiết kế đúng theo đọc mã, chưa có kết quả chạy thật vì cần Supabase staging/local (xem `docs/NFR_MEASUREMENTS.md`) |
| **NFR-07** | Accessibility (WCAG) & Responsive contracts | `event-template.css`, `index.css`, `MapPanZoom`, `colorContrast.js` | Lighthouse 11/11/2026 (4 trang × mobile/desktop): Accessibility 100 ở cả 8 lượt; luồng bàn phím 16/16 bước đạt; `tests/color-contrast.test.mjs` | **Pass** (số đo trong `docs/NFR_MEASUREMENTS.md`) |

---

## 3. Kết quả verification toàn diện (Automated Suite Status)

Lệnh thực thi kiểm tra chất lượng:
```bash
npm run check
```

- **TypeScript Type-check (`tsc --noEmit`)**: **Pass**, 0 lỗi.
- **Automated Test Suite (`node --test tests/*.test.mjs`)**: **293/293 tests PASS (0 fail, 0 skipped)** (chạy 11/11/2026 trên nhánh `docs/sprint1-closure-update`, chưa merge `main`; mốc 10/11/2026 trên `main` là 263/263, mốc 03/11/2026 là 146/146; 30 test tăng thêm là test hành vi cho tìm ghế, zoom/pan, khu hết ghế, tương phản màu và quy tắc sinh ghế). `npm audit`: 0 lỗ hổng.
- **Production Build (`vite build`)**: **Pass**, đóng gói thành công ra thư mục `dist/`.
- **Cơ sở dữ liệu Supabase Live (`qxkgkbayxxaakkwtepss`)**:
  - Đầy đủ **14 bảng `public`** đã bật RLS, xác nhận qua REST API probe.
  - Bảng `CAU_HINH_SU_KIEN` thiết lập quan hệ 1–1 tuyệt đối (`PK = FK`).
  - Toàn bộ timeline đã được di chuyển thành công vào `SU_KIEN.MoTaChiTiet` và bóc tách qua parser an toàn; bảng cũ `LICH_TRINH` đã xóa triệt để khỏi hệ thống.
  - Hai trigger cưỡng chế toàn vẹn `trg_khuvuc_suatdien_sukien` và `trg_giucho_suatdien_sukien` hoạt động chính xác.
  - RPC `luu_su_kien_toan_dien` và `tao_giu_cho_theo_suat` đã cập nhật khớp hoàn toàn với kiến trúc 14 bảng mới.

---

## 4. Kịch bản trình diễn (UAT Demo Checklist)

| Kịch bản | Dữ liệu kiểm thử | Kết quả mong đợi |
|---|---|---|
| **1. Chứng minh 3 loại quan hệ** | ERD 14 bảng trong `03_DATABASE_DESIGN.md` | Chỉ rõ: 1-1 (`SU_KIEN ↔ CAU_HINH_SU_KIEN`), 1-N (`SUAT_DIEN → KHU_VUC`), N-N (`SU_KIEN ↔ NGHE_SI` qua `SU_KIEN_NGHE_SI`). |
| **2. Giải thích 3 chú thích kỹ thuật** | Mục 3 tài liệu `03_DATABASE_DESIGN.md` | Trình bày rành mạch: (1) FK dư thừa có trigger; (2) `GheID` NULLable cho khu đứng; (3) Timeline gộp vào `SU_KIEN.MoTaChiTiet`. |
| **3. Truy vết Ma trận liên kết** | Mục 1 tài liệu `05_TRACEABILITY_TEST_AND_CLOSURE.md` | Dẫn chứng chuỗi liên kết xuyên suốt từ Use Case → Bảng ERD → Lớp Entity/Service → Sequence Diagram tương ứng. |
| **4. BTC tạo và công bố event** | Wizard 6 bước trong Organizer Portal | Nhập thông tin, timeline, lưu aggregate 1–1 vào CSDL, preview chuẩn xác và công bố thành công. |
| **5. Realtime (Sprint 1) và giữ chỗ 5 phút (Sprint 3, lát cắt kỹ thuật)** | Sơ đồ ghế tương tác của Super Concert | Giữ 1–4 vé, ghế đổi màu `DANG_GIU`, hiển thị đếm ngược 5 phút; hủy giữ chỗ trả ghế về `TRONG`. |

---

## 5. Definition of Done Sprint 1

- [x] Sơ đồ ERD chuẩn hóa đủ 14 bảng `public`, có PK, FK, UK, kiểu dữ liệu và ký hiệu bội số rõ ràng.
- [x] Đánh dấu và chứng minh đầy đủ 3 loại quan hệ (1–1, 1–N, N–N) ở tầng DDL.
- [x] Ghi rõ 3 chú thích kỹ thuật bắt buộc trong ERD và Data Dictionary.
- [x] Class Diagram trích xuất từ repo với 14 lớp Entity tương ứng 1–1 với 14 bảng ERD kết hợp các lớp Service.
- [x] 4 Sequence Diagram cho Sprint 1 (SD-01..04) và 2 Sequence Diagram cho nền tảng Sprint 3 (SD-05, SD-06).
- [x] Ma trận liên kết (UC → FR → ERD → Class thiết kế/phân tích → Sequence) dùng mã UC thống nhất với tài liệu đặc tả.
- [x] Kiểm tra thực tế trên Supabase Live xác nhận đủ 14 bảng và kiểm thử tự động đạt 293/293 tests pass (chạy lại 11/11/2026 trên nhánh tích hợp, chưa merge `main`).
