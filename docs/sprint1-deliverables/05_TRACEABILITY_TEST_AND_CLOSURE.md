# 05 — Ma trận truy vết, kiểm thử và đóng Sprint 1

## 1. Ma trận liên kết kiến trúc (UC → Bảng ERD → Lớp Class → Sequence Diagram)

> **Quy ước mã thống nhất (02/11/2026).** Mã yêu cầu theo SRS: `FR-T1-01..04` (Sprint 1), `FR-T3-01` (Sprint 3). `FR-T1-03` (cổng Ban tổ chức) gồm `FR-T1-03.1..03.6`, trước đây ký hiệu `FR-O01..O06`. Mã Use Case theo tài liệu đặc tả `Requirements_UseCases_Sprint1`: `UC-T1-01..05`, `UC-BTC-01..05`, `UC-T3-01..02`. NFR dùng đúng số hiệu ở Phần 2 của SRS; các ràng buộc chất lượng nội bộ ghi là `QA-xx`.

| Mã UC | FR | Sprint | Bảng ERD tham gia | Lớp Entity / Service (thiết kế) | Lớp phân tích (đặc tả) | Sequence |
|---|---|:---:|---|---|---|:---:|
| **UC-T1-01** | FR-T1-01 | 1 | `SU_KIEN`, `SUAT_DIEN`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | `SuKien`, `SuatDien`, `NgheSi`, `SuKienNgheSi` • `EventService`, `ScheduleService`, `ArtistService` | `EventDetailPage`, `EventController`, `Event` | SD-01 |
| **UC-T1-02** | FR-T1-02 | 1 | `SUAT_DIEN`, `KHU_VUC`, `GHE`, `PHIEN_BAN_SO_DO` | `KhuVuc`, `Ghe`, `PhienBanSoDo` • `TicketDataService` | `SeatMapView`, `SeatMapController`, `SeatMap`, `Zone`, `Seat` | SD-02 |
| **UC-T1-03** | FR-T1-04 | 1 | (dữ liệu đã tải) | — (xử lý giao diện) | `SeatMapView` | — |
| **UC-T1-04** | FR-T1-04 | 1 | `KHU_VUC`, `GHE` | `KhuVuc`, `Ghe` | `SeatMapView`, `TicketClass` | — |
| **UC-T1-05** | FR-T1-02 | 1 | `GHE` | `Ghe` • `SeatRealtimeService` | `RealtimeSeatController`, `Seat` | SD-02 |
| **UC-BTC-01** | FR-T1-03.1 | 1 | `HO_SO_NGUOI_DUNG` *(và `auth.users`)* | `HoSoNguoiDung` • `OrganizerService` | — | SD-03 |
| **UC-BTC-02** | FR-T1-03.2 | 1 | `TO_CHUC`, `THANH_VIEN_TO_CHUC` | `ToChuc`, `ThanhVienToChuc` • `OrganizerService` | — | SD-03 |
| **UC-BTC-03** | FR-T1-03.3 | 1 | `SU_KIEN`, `CAU_HINH_SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | `SuKien`, `CauHinhSuKien`, `SuatDien`, `KhuVuc`, `NgheSi`, `SuKienNgheSi` • `OrganizerService` | `EventEditorPage`, `EventAdminController` | SD-04 |
| **UC-BTC-04** | FR-T1-03.4 | 1 | `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC` | `SuKien`, `SuatDien`, `KhuVuc` • `OrganizerService`, `EventService` | `EventEditorPage`, `EventAdminController` | SD-04 |
| **UC-BTC-05** | FR-T1-03.5 | 1 | `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC` | `SuKien`, `SuatDien`, `KhuVuc` • `OrganizerService` | `EventAdminController` | SD-04 |
| **UC-T3-01** | FR-T3-01 | 3 | `KHU_VUC`, `GHE` | `KhuVuc`, `Ghe` | `SeatMapView` | SD-05 |
| **UC-T3-02** | FR-T3-01 | 3 | `GIU_CHO`, `CHI_TIET_GIU_CHO`, `GHE`, `KHU_VUC`, `SUAT_DIEN` | `GiuCho`, `ChiTietGiuCho`, `Ghe` • `BookingService` | `SeatHoldController`, `SeatLock`, `Seat` | SD-05, SD-06 |

Bảng `DIA_DIEM` chưa được UC nào ghi trực tiếp trong V1 (địa điểm của sự kiện do BTC tạo đang lưu bằng cột văn bản của `SU_KIEN`); bảng có trong CSDL để `SUAT_DIEN` tham chiếu.

---

## 2. Requirements Traceability Matrix

| Requirement | Thiết kế / Dữ liệu ERD | Hiện thực mã nguồn | Bằng chứng kiểm thử | Trạng thái |
|---|---|---|---|---|
| **FR-T1-01** | Route event/show; `SU_KIEN 1:N SUAT_DIEN` | `App.tsx`, `publicRoute`, `EventCatalog` | `tests/product-foundation.test.mjs` | **Pass** |
| **FR-T1-02** (hạng vé, giá) | `KHU_VUC` theo suất diễn (Cha chính `SuatDienID`) | `eventService`, `TicketTiersSection` | `tests/event-template.test.mjs` | **Pass** |
| **FR-T1-02** (realtime, UC-T1-05) | `GHE`, Realtime WebSocket subscription | `seatRealtimeService`, `seatRealtime` domain | `tests/seat-realtime.test.mjs` | **Pass** |
| **FR-T3-01** *(Sprint 3, lát cắt kỹ thuật)* | `GIU_CHO`, `CHI_TIET_GIU_CHO`, RPC transaction 5 phút | `bookingService`, `tao_giu_cho_theo_suat` | `tests/database-relationships.test.mjs` | **Pass** |
| **FR-T1-01** (timeline) | Lịch trình sự kiện gộp trong `SU_KIEN.MoTaChiTiet` | `SU_KIEN.MoTaChiTiet`, `parseTimelineFromDescription`, `ScheduleDialog` | `tests/database-relationships.test.mjs` + `tests/public-schedule.test.mjs` | **Pass** |
| **FR-T1-03.1** | Ranh giới tài khoản `USER` và `ORGANIZER` | `BuyerAuth`, `OrganizerAuthView`, `HO_SO_NGUOI_DUNG` | `tests/account-boundary.test.mjs` | **Pass** |
| **FR-T1-03.2** | `TO_CHUC`, RBAC đa tổ chức trong `THANH_VIEN_TO_CHUC` | `organizerService` + RLS policies | `tests/account-boundary.test.mjs` + pgTAP | **Pass** |
| **FR-T1-03.3** | Aggregate sự kiện: Cấu hình 1–1 `CAU_HINH_SU_KIEN`, Show, Tier, Lineup | `OrganizerEventWizard`, `luu_su_kien_toan_dien` | `tests/organizer-schedule-lineup.test.mjs` + `tests/database-relationships.test.mjs` | **Pass live** |
| **FR-T1-03.4** | Preview bản nháp dùng chung `EventTemplate` | Trang sự kiện với `?preview=1` (`loadEventForPreview`) + `EventHeader` banner | `tests/event-template.test.mjs` | **Pass** |
| **FR-T1-03.5** | Kiểm tra điều kiện & Công bố `cong_bo_su_kien` | `evaluatePublishReadiness` + RPC `cong_bo_su_kien` | `tests/organizer-uat.test.mjs` | **Pass** |
| **FR-T1-03.6** | Mọi event dùng chung 1 template; đặc thù cắm Extension | `GenericEventPage`, `EventTemplate` | Architecture invariant tests | **Pass** |
| **NFR-09 / QA-01** (bảo mật) | RLS 14/14 bảng, RPC `SECURITY DEFINER` an toàn | Migrations `20261027120000`, `20261028100000` | System catalog live audit + tests | **Pass live** |
| **NFR-02 / QA-02** | Row lock `FOR UPDATE` + hết hạn 5 phút | RPC `tao_giu_cho_theo_suat`, pg_cron | Unit checks + static review | **Pass** |
| **NFR-07 / QA-05, QA-06** | Accessibility (WCAG) & Responsive contracts | `event-template.css`, `index.css` | Invariant CSS tests | **Pass** |

---

## 3. Kết quả verification toàn diện (Automated Suite Status)

Lệnh thực thi kiểm tra chất lượng:
```bash
npm run check
```

- **TypeScript Type-check (`tsc --noEmit`)**: **Pass**, 0 lỗi.
- **Automated Test Suite (`node --test tests/*.test.mjs`)**: **145/145 tests PASS (0 fail, 0 skipped)**.
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
- [x] Kiểm tra thực tế trên Supabase Live xác nhận đủ 14 bảng và kiểm thử tự động đạt 145/145 tests pass.
