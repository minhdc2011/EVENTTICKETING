# 02 — Phân tích và thiết kế hệ thống

## 1. Use case tổng quan và danh mục Use Case

> **Quy ước mã thống nhất (02/11/2026).** Mã yêu cầu theo SRS: `FR-T1-01..04` (Sprint 1), `FR-T3-01` (Sprint 3). `FR-T1-03` (cổng Ban tổ chức, `REQ-T1-08`) gồm `FR-T1-03.1..03.6`. Mã Use Case theo tài liệu đặc tả `Requirements_UseCases_Sprint1`: `UC-T1-01..05`, `UC-BTC-01..05`, `UC-T3-01..02`. NFR dùng đúng số hiệu ở Phần 2 của SRS.

Sơ đồ UML chuẩn (ranh giới hệ thống, «include»/«extend») là Hình 5.1 và Hình 5.5 trong tài liệu đặc tả `Requirements_UseCases_Sprint1`. Sơ đồ dưới đây là bản tóm tắt để đối chiếu với thiết kế; nét đứt là quan hệ «include»/«extend».

```mermaid
flowchart LR
  K([Khán giả])
  B([Ban tổ chức])
  subgraph S1K["Sprint 1 - cụm Khán giả"]
    T101([UC-T1-01 Xem thông tin sự kiện])
    T102([UC-T1-02 Xem sơ đồ và trạng thái ghế])
    T103([UC-T1-03 Zoom/Pan sơ đồ])
    T104([UC-T1-04 Tooltip ghế/giá vé])
    T105([UC-T1-05 Cập nhật trạng thái ghế realtime])
  end
  subgraph S1B["Sprint 1 - cụm Ban tổ chức, FR-T1-03"]
    B01([UC-BTC-01 Đăng nhập BTC])
    B02([UC-BTC-02 Tạo tổ chức])
    B03([UC-BTC-03 Tạo/sửa nháp sự kiện])
    B04([UC-BTC-04 Xem trước])
    B05([UC-BTC-05 Công bố sự kiện])
  end
  subgraph S3["Sprint 3 - nền tảng đã dựng sớm, không tính nghiệm thu Sprint 1"]
    T301([UC-T3-01 Chọn ghế])
    T302([UC-T3-02 Giữ chỗ 5 phút])
  end
  K --- T101
  K --- T102
  K --- T301
  K --- T302
  T101 -. include .-> T102
  T103 -. extend .-> T102
  T104 -. extend .-> T102
  T105 -. extend .-> T102
  T301 -. include .-> T102
  T301 -. include .-> T302
  B --- B01
  B --- B02
  B --- B03
  B --- B04
  B --- B05
  B05 -. include .-> B04
```

### Bảng danh mục Use Case chuẩn hóa

| Mã UC | Tên Use Case | Actor | FR | Sprint | Dữ liệu và nghiệp vụ cốt lõi | Mã cũ |
|---|---|---|---|:---:|---|---|
| **UC-T1-01** | Xem thông tin sự kiện (suất diễn, timeline, lineup, trạng thái mở bán) | Khán giả | FR-T1-01 | 1 | `SU_KIEN`, `SUAT_DIEN`; timeline bóc từ `MoTaChiTiet` **[Chú thích 3]**; lineup `SU_KIEN_NGHE_SI` + `NGHE_SI`; trạng thái mở bán `deriveSaleStatus` | UC-01, UC-02 |
| **UC-T1-02** | Xem sơ đồ khu vực/ghế, bảng giá và trạng thái ghế | Khán giả | FR-T1-02 | 1 | `KHU_VUC`, `GHE` theo `SuatDienID` qua `loadTicketingCatalog` | UC-02, UC-03 (phần xem) |
| **UC-T1-03** | Zoom/Pan sơ đồ | Khán giả | FR-T1-04 | 1 | Xử lý trên giao diện bằng dữ liệu đã tải | — |
| **UC-T1-04** | Tooltip ghế/giá vé, lọc khu, tìm ghế | Khán giả | FR-T1-04 | 1 | Xử lý trên giao diện bằng dữ liệu đã tải | — |
| **UC-T1-05** | Cập nhật trạng thái ghế realtime | Khán giả | FR-T1-02 | 1 | Supabase Realtime trên `GHE`, lọc theo `KhuVucID` của suất diễn | UC-03 (phần realtime) |
| **UC-BTC-01** | Đăng nhập BTC, phân loại tài khoản | BTC | FR-T1-03.1 | 1 | Supabase Auth; `HO_SO_NGUOI_DUNG.LoaiTaiKhoan` | UC-05 |
| **UC-BTC-02** | Tạo tổ chức, phân quyền thành viên (vai trò `VAN_HANH`, `SOAT_VE` chỉ xem) | BTC | FR-T1-03.2 | 1 | RPC `tao_to_chuc_cua_toi`; `TO_CHUC`, `THANH_VIEN_TO_CHUC`; `la_thanh_vien_to_chuc` | UC-05, UC-09 |
| **UC-BTC-03** | Tạo/sửa nháp sự kiện (suất diễn, phân khu/hạng vé, timeline, nghệ sĩ) | BTC | FR-T1-03.3 | 1 | RPC `luu_su_kien_toan_dien`: `SU_KIEN`, `CAU_HINH_SU_KIEN`, `SUAT_DIEN`, `KHU_VUC`, `SU_KIEN_NGHE_SI`, `NGHE_SI` (chưa sinh `GHE`) | UC-06, UC-07 |
| **UC-BTC-04** | Xem trước bản nháp | BTC | FR-T1-03.4 | 1 | `loadEventForPreview`; trang sự kiện với `?preview=1` | UC-08 |
| **UC-BTC-05** | Công bố sự kiện | BTC | FR-T1-03.5 | 1 | `evaluatePublishReadiness` (client) + RPC `cong_bo_su_kien` | UC-08 |
| **UC-T3-01** | Chọn ghế (tối đa 4) | Khán giả | FR-T3-01 | 3 | `evaluateSeatSelection` | UC-03 (phần chọn) |
| **UC-T3-02** | Giữ chỗ 5 phút, hủy, hết hạn | Khán giả | FR-T3-01 | 3 | RPC `tao_giu_cho_theo_suat`, `huy_giu_cho`, `expire_seat_holds` (pg_cron); `GIU_CHO`, `CHI_TIET_GIU_CHO` | UC-03 (phần giữ), UC-04 |

`FR-T1-03.6` (mọi sự kiện dùng chung template) là ràng buộc thiết kế của UC-T1-01, xem mục 7 và `04_UI_CONSISTENCY_ADR.md`.

## 2. Activity — Luồng Ban tổ chức tạo và công bố sự kiện

```mermaid
flowchart TD
  A[Đăng nhập Ban tổ chức] --> B{Đã có tổ chức?}
  B -- Chưa có --> C[Tạo tổ chức mới TO_CHUC]
  B -- Đã có --> D[Chọn tổ chức đang làm việc]
  C --> D
  D --> E[Mở Wizard tạo bản nháp sự kiện]
  E --> F[Nhập thông tin cơ bản, mô tả gộp timeline Markdown & cấu hình 1-1]
  F --> G[Thêm suất diễn SUAT_DIEN & Địa điểm DIA_DIEM]
  G --> H[Thêm phân khu KHU_VUC, hạng vé & Lineup nghệ sĩ]
  H --> I[Lưu Aggregate toàn diện qua RPC luu_su_kien_toan_dien]
  I --> J[Xem trước Preview bằng EventTemplate dùng chung]
  J --> K{Đủ điều kiện công bố?}
  K -- Chưa đủ --> F
  K -- Hợp lệ --> L[Gọi RPC cong_bo_su_kien đổi trạng thái CONG_KHAI]
  L --> M[Sự kiện xuất hiện trên Marketplace công khai]
```

---

## 3. Activity — Luồng Người mua xem vé (Sprint 1) và giữ chỗ (Sprint 3)

```mermaid
flowchart TD
  A[Mở Marketplace khám phá sự kiện] --> B[Chọn sự kiện và xem chi tiết, timeline & lineup]
  B --> C[Chọn suất diễn mong muốn]
  C --> D[Xem danh sách phân khu vé, giá niêm yết và chính sách]
  D --> E[Sprint 3: Chọn 1–4 vé hoặc chọn ghế trực quan trên sơ đồ]
  E --> F{Gọi RPC tao_giu_cho_theo_suat}
  F -- Thất bại / Hết vé / Ghế bị tranh chấp --> G[Hiển thị Toast thông báo lỗi & yêu cầu chọn lại]
  G --> E
  F -- Thành công --> H[Tạo bản ghi GIU_CHO & CHI_TIET_GIU_CHO]
  H --> I[Hệ thống phát Realtime đổi trạng thái ghế sang DANG_GIU]
  I --> J[Client khởi chạy đồng hồ đếm ngược 5 phút]
  J --> K{Người mua xử lý?}
  K -- Chủ động bấm Hủy giữ chỗ --> L[Gọi RPC huy_giu_cho: Trả ghế TRONG, đổi RELEASED]
  K -- Hết 5 phút không thao tác --> M[Cron expire_seat_holds tự động hoàn lại ghế TRONG, đổi EXPIRED]
  K -- Sang bước thanh toán --> N[Thanh toán FR-T3-02 chưa triển khai; chuyển đổi CONVERTED khi có thanh toán]
```

Nghiệm thu Sprint 1 dừng ở bước D (xem sự kiện, suất diễn, hạng vé và sơ đồ ghế). Từ bước E trở đi là FR-T3-01 (Sprint 3); repo đã có lát cắt kỹ thuật nhưng không tính nghiệm thu Sprint 1.

---

## 4. Kiến trúc logic 3 lớp (Logical Architecture)

```mermaid
flowchart TB
  subgraph ClientLayer["Tầng Trình bày (React 19 / Vite Client)"]
    R[App Router]
    MP[Marketplace / Catalog View]
    EP[EventTemplate dùng chung đa sự kiện]
    EX[Extension Slots: Lineup / Seating Map / Timeline Dialog]
    OP[Organizer Portal & Event Creation Wizard]
    RO[React Runtime Overlays: Tooltip / Toast / Hold Modal]
    R --> MP
    R --> EP
    EP --> EX
    EP --> RO
    R --> OP
  end

  subgraph ServiceLayer["Tầng Dịch vụ & Domain Logic (src/services & src/domain)"]
    BAS[BuyerAuthService: Đăng nhập & Session người mua]
    OS[OrganizerService: Quản trị tổ chức & Lưu Aggregate sự kiện]
    ES[EventService: Truy vấn danh mục sự kiện & Suất diễn]
    SS[ScheduleService: Bóc tách Timeline từ Description]
    AS[ArtistService: Chuẩn hóa & Sắp xếp Lineup nghệ sĩ]
    TDS[TicketDataService: Truy vấn phân khu & hạng vé]
    BS[BookingService: Điều phối Giữ chỗ & Khóa ghế 5 phút]
    SRS[SeatRealtimeService: WebSocket quản lý trạng thái ghế]
  end

  subgraph SupabaseLayer["Tầng Dữ liệu & Nền tảng Cloud (Supabase / PostgreSQL 15+)"]
    AUTH[Supabase Auth: Quản lý danh tính auth.users]
    DB[("14 Bảng CSDL Schema public + Ràng buộc toàn vẹn")]
    RPC[Hàm giao dịch Transactional RPC: SECURITY DEFINER]
    RLS[Hệ thống chính sách bảo mật dòng Row Level Security]
    WS[Kênh phát Realtime Publications: GHE, KHU_VUC]
    CRON[pg_cron: Tác vụ tự động quét hết hạn hold mỗi 10 giây]
  end

  MP --> ES
  EP --> ES
  EP --> SS
  EP --> AS
  EP --> TDS
  OP --> OS
  OP --> BAS
  EX --> BS
  EX --> SRS
  RO --> BS

  ES --> DB
  SS --> DB
  AS --> DB
  TDS --> DB
  OS --> RPC
  OS --> DB
  BAS --> AUTH
  BS --> RPC
  SRS --> WS
  RLS --> DB
  CRON --> RPC
```

---

## 5. Thiết kế hướng đối tượng — Class Diagram từ Repository (Phân định B-C-E theo Cụm Phân hệ)

Sơ đồ lớp được trích xuất trực tiếp từ cấu trúc mã nguồn dự án (`src/components/`, `src/services/` và `src/domain/`), được **phân nhóm và gắn ký hiệu chuẩn mực theo mô hình Boundary – Control – Entity (B-C-E)**:
- **Nhóm Boundary (`<<Boundary>>`)**: Các lớp giao diện đại diện cho màn hình và thành phần UI tương tác với người dùng.
- **Nhóm Control (`<<Control>>`)**: Các lớp Service chịu trách nhiệm điều phối nghiệp vụ, xử lý logic use case và kết nối hạ tầng.
- **Nhóm Entity (`<<Entity>>`)**: **Đảm bảo mỗi bảng trong số 14 bảng ERD đều có đúng một lớp Entity tương ứng** lưu trữ dữ liệu và mô hình hóa hành vi nghiệp vụ.

Để tối ưu khả năng đọc hiểu và quan sát luồng tương tác, **các lớp Boundary, Control và Entity tương ứng với nhau được gom nhóm lại gần nhau theo 4 Cụm Phân hệ Nghiệp vụ (Subsystem Packages)**:
1. **Cụm 1: Quản trị Ban Tổ Chức & Phân quyền (Organizer Portal & RBAC)**: `OrganizerPortalView` (B) $\rightarrow$ `OrganizerService` (C) $\rightarrow$ `ToChuc`, `ThanhVienToChuc` (E).
2. **Cụm 2: Khám phá & Chi tiết Sự kiện (Event Detail & Catalog)**: `EventDetailPage` (B) $\rightarrow$ `EventService`, `ScheduleService`, `ArtistService` (C) $\rightarrow$ `SuKien`, `CauHinhSuKien`, `SuatDien`, `DiaDiem`, `SuKienNgheSi`, `NgheSi` (E).
3. **Cụm 3: Sơ đồ ghế, Phân khu & Giữ chỗ (Seating Map, Realtime & Booking)**: `SeatMapView`, `TicketTiersSection` (B) $\rightarrow$ `TicketDataService`, `SeatRealtimeService`, `BookingService` (C) $\rightarrow$ `PhienBanSoDo`, `KhuVuc`, `Ghe`, `GiuCho`, `ChiTietGiuCho` (E).
4. **Cụm 4: Định danh & Tài khoản (Buyer Auth & Identity)**: `BuyerAuthModal` (B) $\rightarrow$ `BuyerAuthService` (C) $\rightarrow$ `HoSoNguoiDung` (E).

---

### 5.1. Sơ đồ lớp tổng thể toàn hệ thống (Gom cụm B-C-E tương ứng)

```mermaid
classDiagram
  direction TB

  %% ==============================================================
  %% CỤM 1: QUẢN TRỊ BAN TỔ CHỨC & PHÂN QUYỀN (ORGANIZER & RBAC)
  %% ==============================================================
  class OrganizerPortalView {
    <<Boundary>>
    +renderDashboard()
    +onCreateEventWizard()
    +onPreviewEvent(eventId)
    +onPublishEvent(eventId)
  }

  class OrganizerService {
    <<Control>>
    +getOrganizerSession()
    +loadOrganizerWorkspace()
    +createOrganization(name, slug)
    +saveFullEventDraft(input)
    +loadEventForPreview(eventId)
    +publishEvent(eventId)
  }

  class ToChuc {
    <<Entity>>
    +uuid toChucId
    +string tenToChuc
    +string slug
    +string trangThai
    +Date ngayTao
    +Date ngayCapNhat
    +isActive() boolean
    +validateInput() boolean
  }

  class ThanhVienToChuc {
    <<Entity>>
    +uuid id
    +uuid toChucId
    +uuid nguoiDungId
    +string vaiTro
    +Date ngayTao
    +canEdit() boolean
    +canManage() boolean
  }

  OrganizerPortalView ..> OrganizerService : administers
  OrganizerService ..> ToChuc : manages
  OrganizerService ..> ThanhVienToChuc : authorizes
  ToChuc "1" <-- "0..N" ThanhVienToChuc

  %% ==============================================================
  %% CỤM 2: KHÁM PHÁ & CHI TIẾT SỰ KIỆN (EVENT DETAIL & CATALOG)
  %% ==============================================================
  class EventDetailPage {
    <<Boundary>>
    +render()
    +onSelectShow(showId)
    +onViewSchedule()
  }

  class EventService {
    <<Control>>
    +loadPublicEvents()
    +loadPublicEvent(slug)
    +loadPublicTicketTiers(event)
  }

  class ScheduleService {
    <<Control>>
    +loadPublicSchedule(event)
    +parseTimelineFromDescription(description, eventId)
  }

  class ArtistService {
    <<Control>>
    +loadPublicArtists(event)
  }

  class SuKien {
    <<Entity>>
    +int suKienId
    +uuid toChucId
    +string tenSuKien
    +string slug
    +string moTaChiTiet
    +string theLoai
    +string templateKey
    +string trangThaiCongBo
    +string loaiHinhSuKien
    +string slogan
    +Date thoiGianBatDau
    +Date thoiGianKetThuc
    +Date thoiGianMoBanVe
    +Date thoiGianDongBanVe
    +string trangThaiMoBan
    +string diaDiem
    +string tenSanVanDong
    +int sucChua
    +string bannerUrl
    +string posterUrl
    +string trailerUrl
    +isPublished() boolean
    +isDraft() boolean
    +isSaleActive() boolean
    +isConcert() boolean
  }

  class CauHinhSuKien {
    <<Entity>>
    +int cauHinhId
    +int suKienId
    +int thoiGianGiuChoGiay
    +int soVeToiDaMoiDon
    +boolean choPhepChonGhe
    +boolean yeuCauXacMinhOtp
    +Date ngayTao
    +Date ngayCapNhat
    +isValidHoldDuration() boolean
    +validateHoldLimits(count) boolean
  }

  class DiaDiem {
    <<Entity>>
    +int diaDiemId
    +uuid toChucId
    +string tenDiaDiem
    +string diaChi
    +int sucChuaToiDa
    +Date ngayTao
    +validateCapacity() boolean
  }

  class SuatDien {
    <<Entity>>
    +int suatDienId
    +int suKienId
    +int diaDiemId
    +Date thoiGianBatDau
    +Date thoiGianKetThuc
    +string trangThaiMoBanOverride
    +string ghiChu
    +isUpcoming() boolean
    +isCompleted() boolean
    +deriveSaleStatus() string
  }

  class NgheSi {
    <<Entity>>
    +int ngheSiId
    +uuid toChucId
    +string hoTen
    +string ngheDanh
    +string vaiTroChinh
    +string tieuSu
    +string hinhAnhUrl
    +string getDisplayName() string
  }

  class SuKienNgheSi {
    <<Entity>>
    +int id
    +int suKienId
    +int ngheSiId
    +string vaiTroTrongSuKien
    +int thuTuHienThi
    +sortArtists() SuKienNgheSi[]
  }

  EventDetailPage ..> EventService : triggers load
  EventDetailPage ..> ScheduleService : triggers parse
  EventDetailPage ..> ArtistService : triggers lineup
  EventService ..> SuKien : retrieves
  EventService ..> SuatDien : retrieves
  ScheduleService ..> SuKien : parses description
  ArtistService ..> SuKienNgheSi : queries
  ArtistService ..> NgheSi : queries
  SuKien "1" <--> "1" CauHinhSuKien
  SuKien "1" <-- "1..N" SuatDien
  DiaDiem "1" <-- "0..N" SuatDien
  SuKien "1" <-- "0..N" SuKienNgheSi
  NgheSi "1" <-- "0..N" SuKienNgheSi

  %% ==============================================================
  %% CỤM 3: SƠ ĐỒ GHẾ, PHÂN KHU & GIỮ CHỖ (SEATING & BOOKING)
  %% ==============================================================
  class SeatMapView {
    <<Boundary>>
    +renderSeatGrid()
    +onSelectZone(zoneId)
    +onSelectSeat(seatId)
    +zoomPan(scale, offset)
  }

  class TicketTiersSection {
    <<Boundary>>
    +renderTiers()
    +onSelectTier(zoneId)
    +onBookSeats()
  }

  class TicketDataService {
    <<Control>>
    +loadTicketingCatalog()
  }

  class SeatRealtimeService {
    <<Control>>
    +subscribeToSeatUpdates(listener, onConnectionStatus, options) unsubscribeFn
  }

  class BookingService {
    <<Control>>
    +createSeatHold(payload)
    +releaseSeatHold(holdId)
  }

  class PhienBanSoDo {
    <<Entity>>
    +int phienBanId
    +int diaDiemId
    +string tenPhienBan
    +json cauHinhToaDo
    +boolean dangHoatDong
    +Date ngayTao
    +isActive() boolean
  }

  class KhuVuc {
    <<Entity>>
    +int khuVucId
    +int suatDienId
    +int suKienId
    +string maKhuVuc
    +string tenKhuVuc
    +string loaiPhanKhu
    +decimal giaVe
    +int tongSoVe
    +int soVeDaBan
    +string[] danhSachQuyenLoi
    +isStanding() boolean
    +isSeated() boolean
    +isSoldOut() boolean
    +getAvailableCount() int
  }

  class Ghe {
    <<Entity>>
    +int gheId
    +int khuVucId
    +string maGhe
    +string hangGhe
    +int soGhe
    +string trangThai
    +boolean khoaBoiAdmin
    +isAvailable() boolean
    +isLocked() boolean
    +canSelect() boolean
  }

  class GiuCho {
    <<Entity>>
    +int giuChoId
    +int suKienId
    +int suatDienId
    +uuid nguoiDungId
    +string phienNguoiDung
    +string trangThai
    +Date thoiGianGiuCho
    +Date thoiGianHetHan
    +isExpired() boolean
    +isActive() boolean
    +canRelease() boolean
  }

  class ChiTietGiuCho {
    <<Entity>>
    +int chiTietGiuChoId
    +int giuChoId
    +int khuVucId
    +int gheId
    +int soLuong
    +decimal giaTien
    +isStandingHold() boolean
    +isSeatHold() boolean
    +getSubtotal() decimal
  }

  SeatMapView ..> TicketDataService : loads zones/seats
  SeatMapView ..> SeatRealtimeService : listens realtime
  TicketTiersSection ..> BookingService : requests hold
  TicketDataService ..> KhuVuc : loads
  TicketDataService ..> Ghe : loads
  BookingService ..> GiuCho : creates/releases
  BookingService ..> ChiTietGiuCho : manages
  DiaDiem "1" <-- "0..N" PhienBanSoDo
  PhienBanSoDo "0..1" <-- "0..N" SuatDien
  SuatDien "1" <-- "1..N" KhuVuc
  KhuVuc "1" <-- "0..N" Ghe
  SuatDien "1" <-- "0..N" GiuCho
  GiuCho "1" <-- "1..N" ChiTietGiuCho
  KhuVuc "1" <-- "0..N" ChiTietGiuCho
  Ghe "0..1" <-- "0..N" ChiTietGiuCho

  %% ==============================================================
  %% CỤM 4: ĐỊNH DANH & TÀI KHOẢN (BUYER AUTH & IDENTITY)
  %% ==============================================================
  class BuyerAuthModal {
    <<Boundary>>
    +open(mode)
    +onSubmitLogin(email, password)
    +onSubmitOtp(email, otp)
  }

  class BuyerAuthService {
    <<Control>>
    +getBuyerSession()
    +signInBuyer(email, password)
    +signUpBuyer(email, password)
    +requestBuyerOtp(email)
    +verifyBuyerOtp(email, token)
  }

  class HoSoNguoiDung {
    <<Entity>>
    +uuid nguoiDungId
    +string hoTen
    +string anhDaiDienUrl
    +string loaiTaiKhoan
    +Date ngayTao
    +Date ngayCapNhat
    +isOrganizer() boolean
    +isAdmin() boolean
  }

  BuyerAuthModal ..> BuyerAuthService : authenticates
  BuyerAuthService ..> HoSoNguoiDung : loads/validates

  %% ==============================================================
  %% LIÊN KẾT LIÊN CỤM (CROSS-CLUSTER RELATIONSHIPS)
  %% ==============================================================
  HoSoNguoiDung "1" <-- "0..N" ThanhVienToChuc
  ToChuc "1" <-- "0..N" SuKien
  ToChuc "1" <-- "0..N" DiaDiem
  OrganizerService ..> SuKien : saves aggregate
  OrganizerService ..> CauHinhSuKien : configures
```

---

### 5.2. Các sơ đồ B-C-E chi tiết theo từng Phân hệ Nghiệp vụ

Để dễ dàng theo dõi kiến trúc khi phân tích từng ca sử dụng độc lập, 4 sơ đồ dưới đây cô lập bộ ba Boundary – Control – Entity của từng phân hệ:

#### 1. Phân hệ Quản trị Ban Tổ Chức & Phân quyền
```mermaid
classDiagram
  direction LR
  class OrganizerPortalView {
    <<Boundary>>
    +renderDashboard()
    +onCreateEventWizard()
    +onPreviewEvent(eventId)
    +onPublishEvent(eventId)
  }
  class OrganizerService {
    <<Control>>
    +getOrganizerSession()
    +loadOrganizerWorkspace()
    +createOrganization(name, slug)
    +saveFullEventDraft(input)
    +publishEvent(eventId)
  }
  class ToChuc {
    <<Entity>>
    +uuid toChucId
    +string tenToChuc
    +string slug
    +string trangThai
    +isActive() boolean
  }
  class ThanhVienToChuc {
    <<Entity>>
    +uuid id
    +uuid toChucId
    +string vaiTro
    +canEdit() boolean
  }

  OrganizerPortalView ..> OrganizerService : thao tác quản trị
  OrganizerService ..> ToChuc : quản lý tổ chức
  OrganizerService ..> ThanhVienToChuc : kiểm tra quyền hạn
  ToChuc "1" <-- "0..N" ThanhVienToChuc : chứa thành viên
```

#### 2. Phân hệ Khám phá & Chi tiết Sự kiện
```mermaid
classDiagram
  direction LR
  class EventDetailPage {
    <<Boundary>>
    +render()
    +onSelectShow(showId)
    +onViewSchedule()
  }
  class EventService {
    <<Control>>
    +loadPublicEvents()
    +loadPublicEvent(slug)
  }
  class ScheduleService {
    <<Control>>
    +loadPublicSchedule(event)
    +parseTimelineFromDescription()
  }
  class ArtistService {
    <<Control>>
    +loadPublicArtists(event)
  }
  class SuKien {
    <<Entity>>
    +int suKienId
    +string tenSuKien
    +string moTaChiTiet
    +isPublished() boolean
  }
  class CauHinhSuKien {
    <<Entity>>
    +int cauHinhId
    +int thoiGianGiuChoGiay
    +int soVeToiDaMoiDon
  }
  class SuatDien {
    <<Entity>>
    +int suatDienId
    +Date thoiGianBatDau
    +deriveSaleStatus() string
  }
  class NgheSi {
    <<Entity>>
    +int ngheSiId
    +string ngheDanh
  }
  class SuKienNgheSi {
    <<Entity>>
    +int suKienId
    +int ngheSiId
    +int thuTuHienThi
  }

  EventDetailPage ..> EventService : gọi tải dữ liệu
  EventDetailPage ..> ScheduleService : gọi bóc tách lịch
  EventDetailPage ..> ArtistService : gọi tải nghệ sĩ
  EventService ..> SuKien : truy vấn
  EventService ..> SuatDien : truy vấn
  ScheduleService ..> SuKien : phân tích mô tả
  ArtistService ..> SuKienNgheSi : truy vấn thứ tự
  ArtistService ..> NgheSi : nạp thông tin
  SuKien "1" <--> "1" CauHinhSuKien
  SuKien "1" <-- "1..N" SuatDien
  SuKien "1" <-- "0..N" SuKienNgheSi
  NgheSi "1" <-- "0..N" SuKienNgheSi
```

#### 3. Phân hệ Sơ đồ ghế, Phân khu & Giữ chỗ đặt vé
```mermaid
classDiagram
  direction LR
  class SeatMapView {
    <<Boundary>>
    +renderSeatGrid()
    +onSelectSeat(seatId)
    +zoomPan(scale, offset)
  }
  class TicketTiersSection {
    <<Boundary>>
    +renderTiers()
    +onBookSeats()
  }
  class TicketDataService {
    <<Control>>
    +loadTicketingCatalog()
  }
  class SeatRealtimeService {
    <<Control>>
    +subscribeToSeatUpdates()
  }
  class BookingService {
    <<Control>>
    +createSeatHold(payload)
    +releaseSeatHold(holdId)
  }
  class KhuVuc {
    <<Entity>>
    +int khuVucId
    +string tenKhuVuc
    +decimal giaVe
    +isSoldOut() boolean
  }
  class Ghe {
    <<Entity>>
    +int gheId
    +string maGhe
    +string trangThai
    +isAvailable() boolean
  }
  class GiuCho {
    <<Entity>>
    +int giuChoId
    +Date thoiGianHetHan
    +isExpired() boolean
  }
  class ChiTietGiuCho {
    <<Entity>>
    +int chiTietGiuChoId
    +int soLuong
    +decimal giaTien
  }

  SeatMapView ..> TicketDataService : nạp ghế
  SeatMapView ..> SeatRealtimeService : lắng nghe WebSocket
  TicketTiersSection ..> BookingService : gửi yêu cầu giữ chỗ
  TicketDataService ..> KhuVuc : nạp phân khu
  TicketDataService ..> Ghe : nạp trạng thái ghế
  BookingService ..> GiuCho : tạo / hủy giữ chỗ
  BookingService ..> ChiTietGiuCho : ghi chi tiết vé
  KhuVuc "1" <-- "0..N" Ghe
  GiuCho "1" <-- "1..N" ChiTietGiuCho
  KhuVuc "1" <-- "0..N" ChiTietGiuCho
  Ghe "0..1" <-- "0..N" ChiTietGiuCho
```

#### 4. Phân hệ Định danh & Tài khoản Khán giả
```mermaid
classDiagram
  direction LR
  class BuyerAuthModal {
    <<Boundary>>
    +open(mode)
    +onSubmitLogin(email, password)
    +onSubmitOtp(email, otp)
  }
  class BuyerAuthService {
    <<Control>>
    +getBuyerSession()
    +signInBuyer(email, password)
    +verifyBuyerOtp(email, token)
  }
  class HoSoNguoiDung {
    <<Entity>>
    +uuid nguoiDungId
    +string hoTen
    +string loaiTaiKhoan
    +isOrganizer() boolean
  }

  BuyerAuthModal ..> BuyerAuthService : gửi thông tin xác thực
  BuyerAuthService ..> HoSoNguoiDung : nạp hồ sơ & phân loại vai trò
```

---

> **Chú thích về Class Diagram phân định B-C-E.** (1) Sơ đồ phân tách tường minh 3 nhóm: **Boundary (`<<Boundary>>`)** là các component giao diện người dùng; **Control (`<<Control>>`)** là các lớp Service điều phối luồng nghiệp vụ; **Entity (`<<Entity>>`)** gồm đúng **14 lớp ánh xạ 1–1 với 14 bảng ERD**. (2) Các lớp Boundary không thao tác trực tiếp lên Entity mà thông qua Control/Service; Control tương tác với Entity và điều phối cơ sở dữ liệu. (3) `GiuCho`, `ChiTietGiuCho` và `BookingService` phục vụ UC-T3-02 (Sprint 3, đã dựng nền tảng từ Sprint 1). (4) Phương thức của các lớp Entity là hành vi nghiệp vụ được mô hình hóa theo quy tắc trong SRS/RPC.

### Bảng phân loại chi tiết theo Mô hình Boundary – Control – Entity (B-C-E)

#### 1. Nhóm Boundary (`<<Boundary>>` — Giao diện người dùng)
| Lớp Boundary | File mã nguồn tương ứng | Vai trò giao diện & Người dùng tương tác |
|---|---|---|
| `EventDetailPage` | `src/views/EventDetailView.tsx` | Màn hình chi tiết sự kiện công khai (Lineup, Lịch trình, nút Mua vé) — Khán giả. |
| `SeatMapView` | `src/components/seatmap/SeatMapSection.tsx` | Sơ đồ phân khu sân khấu, hiển thị ghế, zoom/pan và chọn ghế — Khán giả. |
| `TicketTiersSection` | `src/components/event/TicketTiersSection.tsx` | Bảng chọn hạng vé, hiển thị giá niêm yết và số lượng đặt — Khán giả. |
| `OrganizerPortalView` | `src/views/OrganizerPortal.tsx` | Bảng điều khiển quản trị viên: tạo sự kiện, kiểm tra điều kiện công bố — Ban Tổ Chức. |
| `BuyerAuthModal` | `src/components/auth/BuyerAuthModal.tsx` | Hộp thoại xác thực tài khoản và xác minh OTP — Khán giả. |

#### 2. Nhóm Control (`<<Control>>` — Lớp điều phối nghiệp vụ / Services)
| Lớp Control | File mã nguồn tương ứng | Nhiệm vụ điều phối Use Case |
|---|---|---|
| `EventService` | `src/services/eventService.ts` | Điều phối UC-T1-01: nạp danh mục và chi tiết sự kiện đã công bố. |
| `ScheduleService` | `src/services/scheduleService.ts` | Bóc tách và định dạng lịch trình timeline từ mô tả sự kiện. |
| `ArtistService` | `src/services/artistService.ts` | Truy vấn và sắp xếp danh sách nghệ sĩ biểu diễn theo thứ tự hiển thị. |
| `TicketDataService` | `src/services/ticketDataService.ts` | Nạp dữ liệu khu vực, hạng vé và danh sách ghế của suất diễn cho sơ đồ. |
| `SeatRealtimeService` | `src/services/seatRealtimeService.ts` | Điều phối kênh WebSocket Realtime lắng nghe trạng thái ghế thay đổi (`UC-T1-05`). |
| `BookingService` | `src/services/bookingService.ts` | Điều phối giao dịch giữ chỗ 5 phút, giải phóng ghế và kiểm soát giới hạn vé. |
| `OrganizerService` | `src/services/organizerService.ts` | Điều phối toàn bộ nghiệp vụ BTC: tạo tổ chức, lưu nháp sự kiện, kiểm tra và công bố. |
| `BuyerAuthService` | `src/services/buyerAuthService.ts` | Quản lý phiên đăng nhập và định danh người mua vé. |

#### 3. Nhóm Entity (`<<Entity>>` — 14 Thực thể dữ liệu miền nghiệp vụ tương ứng 14 Bảng ERD)
### Bảng đối chiếu 14 Bảng ERD ↔ 14 Lớp Entity ↔ Lớp Service & File nguồn

| Bảng CSDL | Lớp Entity | Lớp Service xử lý chính | File nguồn trong Repo | Vai trò và hành vi chính |
|---|---|---|---|---|
| `TO_CHUC` | `ToChuc` | `OrganizerService` | `src/services/organizerService.ts` | Quản lý định danh tổ chức, workspace của ban tổ chức. |
| `HO_SO_NGUOI_DUNG` | `HoSoNguoiDung` | `BuyerAuthService`, `OrganizerService` | `src/services/buyerAuthService.ts` | Hồ sơ người dùng, phân loại tài khoản `USER` / `ORGANIZER`. |
| `THANH_VIEN_TO_CHUC` | `ThanhVienToChuc` | `OrganizerService` | `src/services/organizerService.ts` | Phân quyền RBAC đa cấp độ cho thành viên tổ chức. |
| `SU_KIEN` | `SuKien` | `EventService`, `OrganizerService` | `src/services/eventService.ts` | Quản lý sự kiện, bóc tách timeline qua `parseTimelineFromDescription`. |
| `CAU_HINH_SU_KIEN` | `CauHinhSuKien` | `OrganizerService` | `src/services/organizerService.ts` | Cấu hình 1–1 (thời gian giữ chỗ, tối đa 4 vé, tùy chọn mở rộng). |
| `DIA_DIEM` | `DiaDiem` | `EventService`, `OrganizerService` | `src/services/eventService.ts` | Danh mục địa điểm, địa chỉ và sức chứa. |
| `PHIEN_BAN_SO_DO` | `PhienBanSoDo` | `TicketDataService` | `src/services/ticketDataService.ts` | Phiên bản sơ đồ ghế ngồi của địa điểm. |
| `SUAT_DIEN` | `SuatDien` | `EventService`, `OrganizerService` | `src/domain/eventStatus.js` | Suất diễn, tính toán trạng thái mở bán `deriveSaleStatus`. |
| `KHU_VUC` | `KhuVuc` | `TicketDataService`, `OrganizerService` | `src/domain/seatMap.js` | Phân khu vé, tính giá tiền, bóc tách quyền lợi `parseTierBenefits`. |
| `GHE` | `Ghe` | `TicketDataService`, `SeatRealtimeService` | `src/domain/seatMap.js` | Ghế ngồi vật lý, kiểm tra hợp lệ chọn ghế `evaluateSeatSelection`. |
| `GIU_CHO` | `GiuCho` | `BookingService` | `src/services/bookingService.ts` | Header giữ chỗ 5 phút, đếm ngược `calculateRemainingSeconds`. |
| `CHI_TIET_GIU_CHO` | `ChiTietGiuCho` | `BookingService` | `src/services/bookingService.ts` | Dòng giữ chỗ chi tiết (phân biệt khu đứng và ghế ngồi). |
| `NGHE_SI` | `NgheSi` | `ArtistService`, `OrganizerService` | `src/domain/artistLineup.js` | Danh mục nghệ sĩ, chuẩn hóa dữ liệu `normalizeArtistRow`. |
| `SU_KIEN_NGHE_SI` | `SuKienNgheSi` | `ArtistService`, `OrganizerService` | `src/services/artistService.ts` | Liên kết Lineup nghệ sĩ, sắp xếp thứ tự diễn `sortArtists`. |

---

## 6. Sequence Diagrams (`SD-01` .. `SD-06`)

Sprint 1: SD-01 đến SD-04. Sprint 3 (nền tảng đã dựng sớm): SD-05, SD-06. Bản phân tích mức nghiệp vụ (lớp Boundary/Control/Entity) nằm ở Hình 5.3–5.8 của tài liệu đặc tả; các sơ đồ dưới đây là mức thiết kế, dùng đúng tên hàm và RPC trong mã nguồn.

> **Quy ước biểu diễn đối tượng UML & Phân định B-C-E (Stereotyped Object Lifelines)**:
> 1. **Đối tượng thực thi (Objects/Instances)**: Theo chuẩn phân tích thiết kế hướng đối tượng (OOAD/UML), tác nhân (Actor) tương tác ở runtime với các thực thể đối tượng cụ thể chứ không tương tác với Lớp tĩnh (Class). Do đó, tên đối tượng được ký hiệu chuẩn theo cú pháp vô danh `:TênLớp`.
> 2. **Ký hiệu phân loại B-C-E**: Mỗi đối tượng tham gia tương tác (Lifeline) được gắn ký hiệu phân loại chuẩn mực: **`«Boundary»`** (Giao diện người dùng), **`«Control»`** (Dịch vụ điều phối nghiệp vụ & Stored Procedures), và **`«Entity»`** (Tầng dữ liệu / CSDL lưu trữ).

### SD-01: Người mua xem danh mục, chi tiết sự kiện, suất diễn, lineup và timeline (UC-T1-01, Sprint 1)


```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as «Boundary»<br/>:EventDetailPage
  participant ES as «Control»<br/>:EventService
  participant SS as «Control»<br/>:ScheduleService
  participant AS as «Control»<br/>:ArtistService
  participant DB as «Entity»<br/>:PostgreSQL

  U->>UI: Truy cập URL /events/:slug
  UI->>ES: loadPublicEvent(slug)
  ES->>DB: SELECT * FROM SU_KIEN WHERE Slug = slug AND TrangThaiCongBo = 'CONG_KHAI'
  DB-->>ES: Trả về bản ghi SU_KIEN (kèm MoTaChiTiet)
  ES->>DB: SELECT * FROM SUAT_DIEN WHERE SuKienID = eventId
  DB-->>ES: Trả về danh sách suất diễn
  ES-->>UI: Dữ liệu sự kiện & Suất diễn

  par Tải Timeline từ Mô tả sự kiện
    UI->>SS: loadPublicSchedule(event)
    SS->>SS: parseTimelineFromDescription(event.MoTaChiTiet)
    SS-->>UI: Danh sách PublicScheduleItem[] hiển thị trên Timeline modal
  and Tải Lineup Nghệ sĩ biểu diễn
    UI->>AS: loadPublicArtists(event)
    AS->>DB: SELECT * FROM SU_KIEN_NGHE_SI JOIN NGHE_SI ORDER BY ThuTuHienThi
    DB-->>AS: Danh sách nghệ sĩ
    AS-->>UI: LineupSection hiển thị danh sách nghệ sĩ
  end
```

---

### SD-02: Xem sơ đồ ghế và cập nhật trạng thái realtime (UC-T1-02, UC-T1-05, Sprint 1)

Luồng Sprint 1 chỉ đọc: tải danh mục khu vực/ghế của suất diễn, vẽ sơ đồ, rồi nhận thay đổi trạng thái ghế qua Supabase Realtime (US-T1-01 Scenario 2, ví dụ ghế chuyển sang Đã bán). Sơ đồ chỉ hiển thị thay đổi; trong repo hiện tại, thay đổi trên `GHE` phát sinh từ lát cắt giữ chỗ UC-T3-02 (Sprint 3).

```mermaid
sequenceDiagram
  actor U as Người mua A
  participant UI as «Boundary»<br/>:SeatMapView
  participant TDS as «Control»<br/>:TicketDataService
  participant SRS as «Control»<br/>:SeatRealtimeService
  participant DB as «Entity»<br/>:PostgreSQL
  participant WS as «Control»<br/>:SupabaseRealtime

  U->>UI: Mở sơ đồ ghế của suất diễn showId
  UI->>TDS: loadTicketingCatalog()
  TDS->>DB: SELECT KHU_VUC WHERE SuatDienID = showId
  TDS->>DB: SELECT GHE WHERE KhuVucID IN (khu của suất)
  DB-->>TDS: Danh sách khu vực, ghế, giá, trạng thái
  TDS-->>UI: Catalog
  UI->>UI: Vẽ sơ đồ, tô màu theo TrangThai, khóa chọn nếu chưa mở bán
  UI->>SRS: subscribeToSeatUpdates(listener, onConnectionStatus)
  SRS->>WS: Kênh show-showId - postgres_changes UPDATE trên GHE, lọc KhuVucID IN (...)
  WS-->>SRS: SUBSCRIBED
  SRS-->>UI: CONNECTED
  Note over DB,WS: Ghế đổi trạng thái trong bảng GHE (ví dụ chuyển sang Đã bán)
  DB-->>WS: UPDATE GHE (TrangThai mới)
  WS-->>SRS: Payload thay đổi ghế
  SRS-->>UI: listener(seatEvent)
  UI->>UI: Đổi màu ghế, không tải lại trang
  alt Mất kết nối (CHANNEL_ERROR / TIMED_OUT / CLOSED)
    SRS-->>UI: DISCONNECTED / ERROR
    UI->>U: Cảnh báo dữ liệu có thể chưa cập nhật
    UI->>TDS: Tải lại catalog khi kết nối lại
  end
```

---

### SD-03: Đăng nhập BTC, phân loại tài khoản, tạo tổ chức và phân quyền (UC-BTC-01, UC-BTC-02, Sprint 1)

```mermaid
sequenceDiagram
  actor O as Ban tổ chức
  participant UI as «Boundary»<br/>:OrganizerPortalView
  participant OS as «Control»<br/>:OrganizerService
  participant AUTH as «Control»<br/>:SupabaseAuth
  participant DB as «Entity»<br/>:PostgreSQL

  O->>UI: Nhập email và mật khẩu
  UI->>OS: signInOrganizer(email, password)
  OS->>AUTH: auth.signInWithPassword()
  AUTH-->>OS: Session (auth.uid)
  UI->>OS: getOrganizerSession()
  OS->>DB: SELECT LoaiTaiKhoan FROM HO_SO_NGUOI_DUNG WHERE NguoiDungID = auth.uid()
  DB-->>OS: LoaiTaiKhoan
  OS-->>UI: session.accountKind
  alt accountKind không phải ORGANIZER (tài khoản người mua)
    UI->>O: Từ chối vào cổng BTC (isOrganizerAccount = false)
  else Tài khoản BTC
    UI->>OS: loadOrganizerWorkspace()
    OS->>DB: SELECT TO_CHUC, SU_KIEN của tổ chức (RLS: la_thanh_vien_to_chuc)
    DB-->>OS: Workspace
    opt Chưa thuộc tổ chức nào (UC-BTC-02)
      O->>UI: Nhập tên tổ chức và slug
      UI->>OS: createOrganization(name, slug)
      OS->>DB: RPC tao_to_chuc_cua_toi(p_ten_to_chuc, p_slug)
      DB->>DB: INSERT TO_CHUC + INSERT THANH_VIEN_TO_CHUC (VaiTro = CHU_SO_HUU)
      DB-->>OS: ToChucID
    end
    OS-->>UI: Hiển thị workspace, vai trò VAN_HANH/SOAT_VE chỉ xem, thao tác ghi bị RLS chặn
  end
```

---

### SD-04: BTC tạo/lưu sự kiện, xem trước và công bố (UC-BTC-03, UC-BTC-04, UC-BTC-05, Sprint 1)


```mermaid
sequenceDiagram
  actor O as Ban tổ chức
  participant UI as «Boundary»<br/>:OrganizerPortalView
  participant OS as «Control»<br/>:OrganizerService
  participant RPC_SAVE as «Control»<br/>:RPCLuuSuKien
  participant RPC_PUB as «Control»<br/>:RPCCongBoSuKien
  participant DB as «Entity»<br/>:PostgreSQL

  O->>UI: Nhập thông tin sự kiện, timeline Markdown, cấu hình 1-1, suất diễn, hạng vé & nghệ sĩ
  UI->>OS: saveFullEventDraft(payload)
  OS->>RPC_SAVE: luu_su_kien_toan_dien(p_payload JSONB)
  RPC_SAVE->>DB: Kiểm tra quyền co_quyen_bien_tap_to_chuc(orgId)
  RPC_SAVE->>DB: INSERT / UPDATE SU_KIEN (lưu MoTaChiTiet gộp timeline)
  RPC_SAVE->>DB: INSERT / UPDATE CAU_HINH_SU_KIEN (quan hệ 1-1 SuKienID, TuyChonMoRong)
  RPC_SAVE->>DB: Đồng bộ SUAT_DIEN và KHU_VUC/hạng vé (kèm trigger kiểm tra SuKienID, chưa sinh GHE)
  RPC_SAVE->>DB: Đồng bộ SU_KIEN_NGHE_SI và master catalog NGHE_SI
  DB-->>RPC_SAVE: Thành công
  RPC_SAVE-->>OS: Trả về eventId, slug, status: 'BAN_NHAP'
  OS-->>UI: Lưu bản nháp thành công

  O->>UI: Nhấn nút "Xem trước (Preview)"
  UI->>OS: loadEventForPreview(eventId)
  UI->>UI: Mở trang xem trước (?preview=1) với EventTemplate chuẩn dùng chung

  O->>UI: Nhấn "Công bố sự kiện"
  UI->>UI: evaluatePublishReadiness(form) - chặn nếu còn tiêu chí chưa đạt
  UI->>OS: publishEvent(eventId)
  OS->>RPC_PUB: cong_bo_su_kien(eventId)
  RPC_PUB->>DB: Kiểm tra điều kiện (có >=1 suất diễn, >=1 phân khu vé)
  RPC_PUB->>DB: UPDATE SU_KIEN SET TrangThaiCongBo = 'CONG_KHAI'
  DB-->>RPC_PUB: Cập nhật thành công
  RPC_PUB-->>OS: Sự kiện đã công bố
  OS-->>UI: Chuyển trạng thái sang CONG_KHAI, xuất hiện trên Marketplace
```

---

### SD-05: Giữ chỗ 5 phút chống bán trùng (UC-T3-02, Sprint 3)


Sprint 3 (FR-T3-01) – lát cắt kỹ thuật đã dựng sớm, không tính nghiệm thu Sprint 1. Biểu diễn luồng chọn vé với hai trường hợp: **khu ghế ngồi** (`GheID` cụ thể) và **khu vé đứng** (`GheID = NULL`), đồng thời thể hiện cơ chế kiểm tra trigger giữa `SuatDienID` và `SuKienID`:

```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as «Boundary»<br/>:SeatMapView
  participant BS as «Control»<br/>:BookingService
  participant RPC as «Control»<br/>:RPCTaoGiuCho
  participant TRG as «Control»<br/>:TriggerKiemTraSuatDien
  participant DB as «Entity»<br/>:PostgreSQL
  participant WS as «Control»<br/>:RealtimePublication

  Note over U,UI: Tiền điều kiện: đã xem sơ đồ (SD-02), sự kiện đang mở bán

  U->>UI: Chọn 1–4 chỗ (Ghế ngồi hoặc Vé đứng)
  UI->>BS: createSeatHold({ eventId, showId, sessionId, items })
  BS->>RPC: Gọi RPC giao dịch tao_giu_cho_theo_suat(p_payload)
  RPC->>DB: BEGIN TRANSACTION;
  RPC->>DB: Khóa hàng SELECT FOR UPDATE trên KHU_VUC và GHE

  alt Cột SuatDienID không khớp SuKienID
    RPC->>TRG: Kích hoạt Trigger kiểm tra
    TRG-->>RPC: Báo lỗi Check Violation 23514 (Suat dien khong thuoc su kien)
    RPC->>DB: ROLLBACK;
    RPC-->>BS: Báo lỗi bất đồng bộ suất diễn
    BS-->>UI: Hiển thị lỗi hệ thống
  else Hợp lệ & Đủ tồn kho
    RPC->>DB: INSERT INTO GIU_CHO (SuKienID, SuatDienID, HetHanLuc = now() + 5m)
    alt Đối với Phân khu ghế ngồi (GHE_NGOI)
      RPC->>DB: UPDATE GHE SET TrangThai = 'DANG_GIU' WHERE GheID = item.gheId
      RPC->>DB: INSERT INTO CHI_TIET_GIU_CHO (GiuChoID, KhuVucID, GheID, SoLuong = 1)
      DB-->>WS: Phát sự kiện Realtime đổi màu ghế sang DANG_GIU
    else Đối với Phân khu đứng (DUNG_STAND)
      RPC->>DB: INSERT INTO CHI_TIET_GIU_CHO (GiuChoID, KhuVucID, GheID = NULL, SoLuong = item.qty)
    end
    RPC->>DB: COMMIT TRANSACTION;
    RPC-->>BS: Trả về holdId, hetHanLuc (5 phút), status: 'ACTIVE'
    BS-->>UI: Khởi động Countdown 5 phút & hiển thị xác nhận giữ chỗ
  end
```

---

### SD-06: Hủy giữ chỗ chủ động và hết hạn tự động qua pg_cron (UC-T3-02 luồng A2/A3, Sprint 3)


```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as «Boundary»<br/>:SeatMapView
  participant BS as «Control»<br/>:BookingService
  participant RPC_HUY as «Control»<br/>:RPCHuyGiuCho
  participant CRON as «Control»<br/>:CronService
  participant RPC_EXP as «Control»<br/>:RPCExpireHolds
  participant DB as «Entity»<br/>:PostgreSQL
  participant WS as «Control»<br/>:RealtimePublication

  alt Trường hợp 1: Người mua chủ động hủy
    U->>UI: Nhấn nút "Hủy giữ chỗ"
    UI->>BS: releaseSeatHold(holdId)
    BS->>RPC_HUY: Gọi huy_giu_cho(p_giu_cho_id, p_phien_id = getBrowserSessionId())
    RPC_HUY->>DB: UPDATE GIU_CHO SET TrangThai = 'RELEASED'
    RPC_HUY->>DB: UPDATE GHE SET TrangThai = 'TRONG' WHERE GheID IN (chi_tiet)
    DB-->>WS: Phát Realtime trả ghế về màu TRONG
    RPC_HUY-->>BS: Thành công
    BS-->>UI: Đóng modal giữ chỗ, trả lại trạng thái ban đầu
  else Trường hợp 2: Hết hạn 5 phút tự động qua cron
    CRON->>RPC_EXP: Quét định kỳ mỗi 10 giây expire_seat_holds()
    RPC_EXP->>DB: SELECT * FROM GIU_CHO WHERE TrangThai = 'ACTIVE' AND HetHanLuc <= now()
    RPC_EXP->>DB: UPDATE GIU_CHO SET TrangThai = 'EXPIRED'
    RPC_EXP->>DB: UPDATE GHE SET TrangThai = 'TRONG' WHERE GheID IN (ghe_bi_het_han)
    DB-->>WS: Phát Realtime trả ghế về màu TRONG cho toàn bộ client
  end
```

---

## 7. Thiết kế component chi tiết event (EventTemplate Architecture)

```mermaid
flowchart TD
  A[GenericEventPage / SuperConcertPage] --> B[resolveEventTemplateSlots]
  A --> C[loadPublicTicketTiers]
  B -->|DEFAULT| D[Không extension: Rendering data-driven chuẩn]
  B -->|SUPER_CONCERT_2026| E[Ambient FX + Lineup Slot + Seating Slot + Overlays]
  C --> F[EventTemplate Dùng Chung]
  D --> F
  E --> F
  F --> G[Shared Header + Hero + ShowSwitcher]
  F --> H[Overview + TicketTiers + Venue + Media + Policy + Contact]
  F --> I[BookingSummary + MobileSticky Bar]
```

Điểm thiết kế chính: Template quyết định **cấu trúc chuẩn và trải nghiệm người dùng thống nhất**, các phần đặc thù của từng thể loại sự kiện (như sơ đồ ghế tương tác, lineup nghệ sĩ biểu diễn) được cắm vào qua cơ chế **Extension Slots**, đảm bảo không nhân bản trang hay hard-code mã nguồn.
