# 05 — Ma trận truy vết, kiểm thử và đóng Sprint 1

## 1. Ma trận liên kết kiến trúc (UC → Bảng ERD → Lớp Class → Sequence Diagram)

Ma trận này thiết lập sự liên kết 4 chiều chặt chẽ giữa:
1. **Use Case (`UC-01` .. `UC-09`)** trong [`02_ANALYSIS_AND_SYSTEM_DESIGN.md`](file:///home/xloxkwize/Desktop/EVENTTICKETING/docs/sprint1-deliverables/02_ANALYSIS_AND_SYSTEM_DESIGN.md)
2. **14 Bảng CSDL Schema `public`** trong [`03_DATABASE_DESIGN.md`](file:///home/xloxkwize/Desktop/EVENTTICKETING/docs/sprint1-deliverables/03_DATABASE_DESIGN.md)
3. **Các lớp Entity & Lớp Service** trong Class Diagram
4. **Bộ 5 Sequence Diagrams (`SD-01` .. `SD-05`)**

| Mã UC | Tên Use Case | Bảng ERD tham gia (14 bảng) | Lớp Entity & Lớp Service tương ứng | Mã Sequence Diagram | Luồng tương tác & Ràng buộc cốt lõi |
|---|---|---|---|:---:|---|
| **UC-01** | Xem danh mục & Chi tiết sự kiện (Timeline, Lineup) | `SU_KIEN`, `SUAT_DIEN`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | `SuKien`, `SuatDien`, `NgheSi`, `SuKienNgheSi`<br>• `EventService`<br>• `ScheduleService`<br>• `ArtistService` | **SD-01** | Người mua mở chi tiết sự kiện công khai; bóc tách timeline từ Markdown trong `SU_KIEN.MoTaChiTiet` **[Chú thích 3]**; tải danh sách nghệ sĩ sắp xếp theo `ThuTuHienThi`. |
| **UC-02** | Chọn suất diễn & Xem cơ cấu hạng vé | `SUAT_DIEN`, `KHU_VUC`, `DIA_DIEM` | `SuatDien`, `KhuVuc`, `DiaDiem`<br>• `EventService`<br>• `TicketDataService` | **SD-01**<br>**SD-02** | Chọn suất diễn để tính trạng thái mở bán (`deriveSaleStatus`); tải danh sách phân khu `KHU_VUC`, giá niêm yết và quyền lợi. |
| **UC-03** | Xem sơ đồ ghế Realtime & Giữ tối đa 4 chỗ | `KHU_VUC`, `GHE`, `GIU_CHO`, `CHI_TIET_GIU_CHO`, `SUAT_DIEN`, `SU_KIEN` | `KhuVuc`, `Ghe`, `GiuCho`, `ChiTietGiuCho`<br>• `BookingService`<br>• `SeatRealtimeService` | **SD-02** | Subscribe Realtime trạng thái ghế; gọi RPC `tao_giu_cho_theo_suat` với `FOR UPDATE`; trigger kiểm tra `SuatDienID`/`SuKienID` **[Chú thích 1]**; `GheID` NULLable cho khu đứng **[Chú thích 2]**. |
| **UC-04** | Hủy / Hết hạn giữ chỗ 5 phút | `GIU_CHO`, `CHI_TIET_GIU_CHO`, `GHE` | `GiuCho`, `ChiTietGiuCho`, `Ghe`<br>• `BookingService` | **SD-03** | Hủy chủ động qua RPC `huy_giu_cho` (đổi `RELEASED`, trả ghế `TRONG`); hoặc pg_cron tự động quét mỗi 10 giây qua `expire_seat_holds` (đổi `EXPIRED`). |
| **UC-05** | Đăng nhập & Quản lý tổ chức / RBAC | `HO_SO_NGUOI_DUNG`, `TO_CHUC`, `THANH_VIEN_TO_CHUC` *(và `auth.users`)* | `HoSoNguoiDung`, `ToChuc`, `ThanhVienToChuc`<br>• `BuyerAuthService`<br>• `OrganizerService` | **SD-04** | Xác thực Supabase Auth; đọc và chặn sửa trái phép `LoaiTaiKhoan` trên `HO_SO_NGUOI_DUNG`; tạo `TO_CHUC` và phân quyền 5 cấp bậc trong `THANH_VIEN_TO_CHUC`. |
| **UC-06** | Tạo & Lưu sự kiện toàn diện (Cấu hình 1–1) | `SU_KIEN`, `CAU_HINH_SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `NGHE_SI`, `SU_KIEN_NGHE_SI` | `SuKien`, `CauHinhSuKien`, `SuatDien`, `KhuVuc`, `NgheSi`, `SuKienNgheSi`<br>• `OrganizerService` | **SD-05** | Gọi RPC nguyên tử `luu_su_kien_toan_dien`: lưu sự kiện, lưu cấu hình 1–1 `CAU_HINH_SU_KIEN` (`PK=FK`, `TuyChonMoRong JSONB`), gộp timeline vào `MoTaChiTiet` **[Chú thích 3]**, đồng bộ lineup nghệ sĩ. |
| **UC-07** | Cấu hình địa điểm, sơ đồ & phân khu | `DIA_DIEM`, `PHIEN_BAN_SO_DO`, `SUAT_DIEN`, `KHU_VUC`, `GHE` | `DiaDiem`, `PhienBanSoDo`, `SuatDien`, `KhuVuc`, `Ghe`<br>• `OrganizerService`<br>• `TicketDataService` | **SD-05** | Quản lý danh mục `DIA_DIEM`, sơ đồ `PHIEN_BAN_SO_DO`, tạo suất diễn `SUAT_DIEN` và tạo phân khu/ghế (cưỡng chế trigger `SuatDienID`/`SuKienID` **[Chú thích 1]**). |
| **UC-08** | Xem trước bản nháp Preview & Công bố | `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC` | `SuKien`, `SuatDien`, `KhuVuc`<br>• `OrganizerService`<br>• `EventService` | **SD-05** | Mở route Preview dùng chung `EventTemplate`; kiểm tra tính sẵn sàng `evaluatePublishReadiness` (client) và kiểm tra trong RPC `cong_bo_su_kien`; gọi RPC `cong_bo_su_kien` chuyển sang `CONG_KHAI`. |
| **UC-09** | Tra cứu dữ liệu vận hành sự kiện | `TO_CHUC`, `THANH_VIEN_TO_CHUC`, `SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `GIU_CHO` | `ToChuc`, `ThanhVienToChuc`, `SuKien`, `SuatDien`, `KhuVuc`, `GiuCho`<br>• `OrganizerService` | **SD-04** | Kiểm tra quyền thành viên tổ chức qua helper `la_thanh_vien_to_chuc`; chỉ đọc dữ liệu khán đài, suất diễn và danh sách giữ chỗ thuộc tổ chức của mình. |

---

## 2. Requirements Traceability Matrix

| Requirement | Thiết kế / Dữ liệu ERD | Hiện thực mã nguồn | Bằng chứng kiểm thử | Trạng thái |
|---|---|---|---|---|
| **FR-U01/02** | Route event/show; `SU_KIEN 1:N SUAT_DIEN` | `App.tsx`, `publicRoute`, `EventCatalog` | `tests/product-foundation.test.mjs` | **Pass** |
| **FR-U03** | `KHU_VUC` theo suất diễn (Cha chính `SuatDienID`) | `eventService`, `TicketTiersSection` | `tests/event-template.test.mjs` | **Pass** |
| **FR-U04** | `GHE`, Realtime WebSocket subscription | `seatRealtimeService`, `seatRealtime` domain | `tests/seat-realtime.test.mjs` | **Pass** |
| **FR-U05** | `GIU_CHO`, `CHI_TIET_GIU_CHO`, RPC transaction 5 phút | `bookingService`, `tao_giu_cho_theo_suat` | `tests/database-relationships.test.mjs` | **Pass** |
| **FR-U06** | Lịch trình sự kiện gộp trong `SU_KIEN.MoTaChiTiet` | `SU_KIEN.MoTaChiTiet`, `parseTimelineFromDescription`, `ScheduleDialog` | `tests/database-relationships.test.mjs` + `tests/public-schedule.test.mjs` | **Pass** |
| **FR-O01** | Ranh giới tài khoản `USER` và `ORGANIZER` | `BuyerAuth`, `OrganizerAuthView`, `HO_SO_NGUOI_DUNG` | `tests/account-boundary.test.mjs` | **Pass** |
| **FR-O02** | `TO_CHUC`, RBAC đa tổ chức trong `THANH_VIEN_TO_CHUC` | `organizerService` + RLS policies | `tests/account-boundary.test.mjs` + pgTAP | **Pass** |
| **FR-O03** | Aggregate sự kiện: Cấu hình 1–1 `CAU_HINH_SU_KIEN`, Show, Tier, Lineup | `OrganizerEventWizard`, `luu_su_kien_toan_dien` | `tests/organizer-schedule-lineup.test.mjs` + `tests/database-relationships.test.mjs` | **Pass live** |
| **FR-O04** | Preview bản nháp dùng chung `EventTemplate` | Route `/preview/:slug` + `EventHeader` banner | `tests/event-template.test.mjs` | **Pass** |
| **FR-O05** | Kiểm tra điều kiện & Công bố `cong_bo_su_kien` | `organizerLogic` + RPC `cong_bo_su_kien` | `tests/organizer-uat.test.mjs` | **Pass** |
| **FR-O06** | Mọi event dùng chung 1 template; đặc thù cắm Extension | `GenericEventPage`, `EventTemplate` | Architecture invariant tests | **Pass** |
| **NFR-01** | RLS 14/14 bảng, RPC `SECURITY DEFINER` an toàn | Migrations `20261027120000`, `20261028100000` | System catalog live audit + tests | **Pass live** |
| **NFR-02** | Row lock `FOR UPDATE` + hết hạn 5 phút | RPC `tao_giu_cho_theo_suat`, pg_cron | Unit checks + static review | **Pass** |
| **NFR-05/06** | Accessibility (WCAG) & Responsive contracts | `event-template.css`, `index.css` | Invariant CSS tests | **Pass** |

---

## 3. Kết quả verification toàn diện (Automated Suite Status)

Lệnh thực thi kiểm tra chất lượng:
```bash
npm run check
```

- **TypeScript Type-check (`tsc --noEmit`)**: **Pass**, 0 lỗi.
- **Automated Test Suite (`node --test tests/*.test.mjs`)**: **142/142 tests PASS (0 fail, 0 skipped)**.
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
| **4. BTC tạo và công bố event** | Wizard 4 bước trong Organizer Portal | Nhập thông tin, timeline, lưu aggregate 1–1 vào CSDL, preview chuẩn xác và công bố thành công. |
| **5. Giữ chỗ 5 phút & Realtime** | Sơ đồ ghế tương tác | Giữ 1–4 vé, ghế đổi màu `DANG_GIU`, hiển thị đếm ngược 5 phút; hủy giữ chỗ trả ghế về `TRONG`. |

---

## 5. Definition of Done Sprint 1

- [x] Sơ đồ ERD chuẩn hóa đủ 14 bảng `public`, có PK, FK, UK, kiểu dữ liệu và ký hiệu bội số rõ ràng.
- [x] Đánh dấu và chứng minh đầy đủ 3 loại quan hệ (1–1, 1–N, N–N) ở tầng DDL.
- [x] Ghi rõ 3 chú thích kỹ thuật bắt buộc trong ERD và Data Dictionary.
- [x] Class Diagram trích xuất từ repo với 14 lớp Entity tương ứng 1–1 với 14 bảng ERD kết hợp các lớp Service.
- [x] Bộ 5 Sequence Diagrams phủ trọn các luồng nghiệp vụ chính của Người mua, BTC và Vận hành.
- [x] Ma trận liên kết kiến trúc 4 chiều (UC → ERD → Class → Sequence) được hoàn thiện đầy đủ.
- [x] Kiểm tra thực tế trên Supabase Live xác nhận đủ 14 bảng và kiểm thử tự động đạt 142/142 tests pass.
