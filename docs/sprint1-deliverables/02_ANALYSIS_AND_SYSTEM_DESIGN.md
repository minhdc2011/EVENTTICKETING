# 02 — Phân tích và thiết kế hệ thống

## 1. Use case tổng quan và danh mục Use Case

Hệ thống EventTicketing được phân tách thành 3 nhóm tác nhân chính (`Người mua`, `Ban tổ chức / Biên tập`, `Vận hành / Soát vé`) và hệ thống nền tảng.

```mermaid
flowchart LR
  subgraph Buyers[Nhóm Khách hàng / Người mua]
    U[Người mua]
  end
  subgraph Organizers[Nhóm Ban tổ chức / Quản trị]
    O[BTC / Biên tập]
    V[Vận hành / Soát vé]
  end
  subgraph SystemPlatform[Hệ thống nền tảng]
    S[Hệ thống Engine]
  end

  U --> UC1[UC-01: Xem danh mục & Chi tiết event, Timeline, Nghệ sĩ]
  U --> UC2[UC-02: Chọn suất diễn & Xem cơ cấu hạng vé]
  U --> UC3[UC-03: Xem sơ đồ ghế realtime & Giữ tối đa 4 chỗ]
  U --> UC4[UC-04: Hủy giữ chỗ hoặc Đợi hết hạn giữ chỗ 5 phút]

  O --> OC1[UC-05: Đăng nhập, phân loại tài khoản & Quản lý tổ chức]
  O --> OC2[UC-06: Tạo & Lưu bản nháp sự kiện toàn diện]
  O --> OC3[UC-07: Cấu hình địa điểm, sơ đồ, suất diễn & phân khu]
  O --> OC4[UC-08: Xem trước bản nháp Preview & Công bố sự kiện]

  V --> OC5[UC-09: Xem dữ liệu vận hành sự kiện theo quyền tổ chức]

  S --> SC1[Kiểm tra RLS / RBAC đa tổ chức]
  S --> SC2[Khóa giao dịch FOR UPDATE & Tự động hết hạn hold sau 5 phút]
  S --> SC3[Phát Realtime WebSocket trạng thái ghế theo suất diễn]
```

### Bảng danh mục Use Case chuẩn hóa

| Mã Use Case | Tên Use Case | Tác nhân chính | Phạm vi dữ liệu & Nghiệp vụ cốt lõi |
|---|---|---|---|
| **UC-01** | Xem danh mục & Chi tiết sự kiện | Người mua | Tải thông tin sự kiện `SU_KIEN`, bóc tách timeline từ `MoTaChiTiet` **[Chú thích 3]**, tải lineup nghệ sĩ từ `SU_KIEN_NGHE_SI` và `NGHE_SI`. |
| **UC-02** | Chọn suất diễn & Xem cơ cấu hạng vé | Người mua | Tải danh sách suất diễn `SUAT_DIEN`, thông tin phân khu / giá vé từ `KHU_VUC`. |
| **UC-03** | Xem sơ đồ ghế Realtime & Giữ chỗ 5 phút | Người mua | Nhận luồng Realtime `GHE`, gọi RPC `tao_giu_cho_theo_suat` tạo `GIU_CHO`, `CHI_TIET_GIU_CHO` (phân biệt ghế ngồi và vé đứng **[Chú thích 2]**). |
| **UC-04** | Hủy / Hết hạn giữ chỗ | Người mua / Hệ thống | Giải phóng ghế đang giữ về `TRONG`, đổi trạng thái `GIU_CHO` sang `RELEASED` hoặc `EXPIRED` qua cron `expire_seat_holds`. |
| **UC-05** | Đăng nhập & Quản lý tổ chức / RBAC | Ban tổ chức | Xác thực Supabase Auth, phân loại `LoaiTaiKhoan` trên `HO_SO_NGUOI_DUNG`, quản lý `TO_CHUC` và quyền `THANH_VIEN_TO_CHUC`. |
| **UC-06** | Tạo & Lưu sự kiện toàn diện | Ban tổ chức | Lưu aggregate trong 1 transaction qua RPC `luu_su_kien_toan_dien`: `SU_KIEN`, cấu hình 1–1 `CAU_HINH_SU_KIEN`, timeline Markdown, lineup nghệ sĩ. |
| **UC-07** | Cấu hình địa điểm, sơ đồ & phân khu | Ban tổ chức | Thiết lập thông tin `DIA_DIEM`, sơ đồ `PHIEN_BAN_SO_DO`, suất diễn `SUAT_DIEN` và phân bổ phân khu `KHU_VUC`, ghế `GHE`. |
| **UC-08** | Xem trước bản nháp & Công bố | Ban tổ chức | Kiểm tra tính sẵn sàng `kiem_tra_dieu_kien_cong_bo`, mở route Preview bảo mật và gọi RPC `cong_bo_su_kien`. |
| **UC-09** | Tra cứu dữ liệu vận hành sự kiện | Vận hành / Soát vé | Kiểm tra quyền thành viên tổ chức `la_thanh_vien_tochuc`, xem danh sách khán đài, suất diễn và số lượng vé phát hành. |

---

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

## 3. Activity — Luồng Người mua xem vé và giữ chỗ

```mermaid
flowchart TD
  A[Mở Marketplace khám phá sự kiện] --> B[Chọn sự kiện và xem chi tiết, timeline & lineup]
  B --> C[Chọn suất diễn mong muốn]
  C --> D[Xem danh sách phân khu vé, giá niêm yết và chính sách]
  D --> E[Chọn 1–4 vé hoặc chọn ghế trực quan trên sơ đồ]
  E --> F{Gọi RPC tao_giu_cho_theo_suat}
  F -- Thất bại / Hết vé / Ghế bị tranh chấp --> G[Hiển thị Toast thông báo lỗi & yêu cầu chọn lại]
  G --> E
  F -- Thành công --> H[Tạo bản ghi GIU_CHO & CHI_TIET_GIU_CHO]
  H --> I[Hệ thống phát Realtime đổi trạng thái ghế sang DANG_GIU]
  I --> J[Client khởi chạy đồng hồ đếm ngược 5 phút]
  J --> K{Người mua xử lý?}
  K -- Chủ động bấm Hủy giữ chỗ --> L[Gọi RPC huy_giu_cho: Trả ghế TRONG, đổi RELEASED]
  K -- Hết 5 phút không thao tác --> M[Cron expire_seat_holds tự động hoàn lại ghế TRONG, đổi EXPIRED]
  K -- Sang bước thanh toán --> N[Sprint 1 kết thúc tại mốc giữ chỗ an toàn; chuyển đổi CONVERTED ở Sprint sau]
```

---

## 4. Kiến trúc logic 3 lớp (Logical Architecture)

```mermaid
flowchart TB
  subgraph ClientLayer[Tầng Trình bày (React 19 / Vite Client)]
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

  subgraph ServiceLayer[Tầng Dịch vụ & Domain Logic (src/services & src/domain)]
    BAS[BuyerAuthService: Đăng nhập & Session người mua]
    OS[OrganizerService: Quản trị tổ chức & Lưu Aggregate sự kiện]
    ES[EventService: Truy vấn danh mục sự kiện & Suất diễn]
    SS[ScheduleService: Bóc tách Timeline từ Description]
    AS[ArtistService: Chuẩn hóa & Sắp xếp Lineup nghệ sĩ]
    TDS[TicketDataService: Truy vấn phân khu & hạng vé]
    BS[BookingService: Điều phối Giữ chỗ & Khóa ghế 5 phút]
    SRS[SeatRealtimeService: WebSocket quản lý trạng thái ghế]
  end

  subgraph SupabaseLayer[Tầng Dữ liệu & Nền tảng Cloud (Supabase / PostgreSQL 15+)]
    AUTH[Supabase Auth: Quản lý danh tính auth.users]
    DB[(14 Bảng CSDL Schema public + Ràng buộc toàn vẹn)]
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

## 5. Thiết kế hướng đối tượng — Class Diagram từ Repository

Sơ đồ lớp được trích xuất trực tiếp từ cấu trúc mã nguồn dự án (`src/domain/` và `src/services/`). **Đảm bảo mỗi bảng trong số 14 bảng ERD đều có đúng một lớp Entity tương ứng**, kết hợp với các lớp Service chịu trách nhiệm điều phối nghiệp vụ:

```mermaid
classDiagram
  direction TB

  %% 14 LỚP ENTITY TƯƠNG ỨNG 14 BẢNG ERD
  class ToChuc {
    +uuid toChucId
    +string tenToChuc
    +string slug
    +string trangThai
    +isActive() boolean
    +validateInput() boolean
  }

  class HoSoNguoiDung {
    +uuid nguoiDungId
    +string hoTen
    +string anhDaiDienUrl
    +string loaiTaiKhoan
    +isOrganizer() boolean
    +isAdmin() boolean
  }

  class ThanhVienToChuc {
    +uuid id
    +uuid toChucId
    +uuid nguoiDungId
    +string vaiTro
    +canEdit() boolean
    +canManage() boolean
  }

  class SuKien {
    +int suKienId
    +uuid toChucId
    +string tenSuKien
    +string slug
    +string moTaChiTiet
    +string theLoai
    +string templateKey
    +string trangThaiCongBo
    +parseTimelineFromDescription() PublicScheduleItem[]
    +isPublished() boolean
  }

  class CauHinhSuKien {
    +int suKienId
    +int thoiGianGiuChoPhut
    +int soVeToiDaMoiDon
    +boolean choPhepChonCho
    +boolean yeuCauCccd
    +boolean choPhepChuyenNhuong
    +Json tuyChonMoRong
    +validateHoldLimits(count) boolean
    +getCustomOption(key) any
  }

  class DiaDiem {
    +bigint diaDiemId
    +uuid toChucId
    +string tenDiaDiem
    +string diaChi
    +string muiGio
    +int sucChua
    +hasCapacity() boolean
  }

  class PhienBanSoDo {
    +uuid phienBanSoDoId
    +bigint diaDiemId
    +int soPhienBan
    +string tenPhienBan
    +Json duLieuSoDo
    +boolean daKhoa
    +isLocked() boolean
  }

  class SuatDien {
    +bigint suatDienId
    +int suKienId
    +string slug
    +string tenSuatDien
    +Date thoiGianBatDau
    +Date thoiGianKetThuc
    +Date thoiGianMoBanVe
    +Date thoiGianDongBanVe
    +string trangThai
    +derivePublicSaleState() string
    +isInSaleWindow() boolean
  }

  class KhuVuc {
    +int khuVucId
    +bigint suatDienId
    +int suKienId
    +string maKhuVuc
    +string tenKhuVuc
    +string loaiKhuVuc
    +numeric giaVeNiemYet
    +int tongSoGhe
    +parseTierBenefits() string[]
    +computeZoneLayouts() Layout
    +isStanding() boolean
  }

  class Ghe {
    +int gheId
    +int khuVucId
    +string soHang
    +string soGhe
    +string maGheDayDu
    +string trangThai
    +evaluateSeatSelection(selected) Result
    +reconcileSeatUpdate(newSeat) Ghe
    +isAvailable() boolean
  }

  class GiuCho {
    +uuid giuChoId
    +bigint suatDienId
    +int suKienId
    +uuid phienNguoiDung
    +string trangThai
    +Date hetHanLuc
    +calculateRemainingSeconds() int
    +isExpired() boolean
    +canRelease() boolean
  }

  class ChiTietGiuCho {
    +bigint id
    +uuid giuChoId
    +int khuVucId
    +int gheId
    +string maVe
    +int soLuong
    +isSeatSpecific() boolean
  }

  class NgheSi {
    +int ngheSiId
    +string hoTen
    +string ngheDanh
    +string vaiTroChinh
    +string tieuSu
    +string hinhAnhUrl
    +normalizeArtistRow() ArtistItem
  }

  class SuKienNgheSi {
    +int id
    +int suKienId
    +int ngheSiId
    +string vaiTroTrongSuKien
    +int thuTuHienThi
    +sortArtists() SuKienNgheSi[]
  }

  %% CÁC LỚP SERVICE TẦNG THỰC THI (src/services/)
  class BuyerAuthService {
    +getBuyerSession()
    +signInBuyer(email, password)
    +signUpBuyer(email, password)
  }

  class OrganizerService {
    +getOrganizerSession()
    +loadOrganizerWorkspace()
    +createOrganization(name, slug)
    +saveFullEventDraft(input)
    +publishEvent(eventId)
  }

  class EventService {
    +loadPublicEventCatalog()
    +loadPublicEventDetail(slug)
    +loadEventShows(eventId)
  }

  class ScheduleService {
    +loadPublicSchedule(event)
    +extractTimelineFromMarkdown(desc)
  }

  class ArtistService {
    +loadEventArtists(eventId)
  }

  class TicketDataService {
    +loadTicketTiers(showId)
    +loadSeatsForZone(zoneId)
  }

  class BookingService {
    +createSeatHold(payload)
    +releaseSeatHold(holdId)
  }

  class SeatRealtimeService {
    +subscribeSeatUpdates(showId, onUpdate)
    +unsubscribe()
  }

  %% MỐI QUAN HỆ GIỮA CÁC LỚP ENTITY
  ToChuc "1" <-- "0..N" ThanhVienToChuc
  HoSoNguoiDung "1" <-- "0..N" ThanhVienToChuc
  ToChuc "1" <-- "0..N" SuKien
  SuKien "1" <--> "1" CauHinhSuKien
  ToChuc "1" <-- "0..N" DiaDiem
  DiaDiem "1" <-- "0..N" PhienBanSoDo
  SuKien "1" <-- "1..N" SuatDien
  DiaDiem "1" <-- "0..N" SuatDien
  PhienBanSoDo "0..1" <-- "0..N" SuatDien
  SuatDien "1" <-- "1..N" KhuVuc
  KhuVuc "1" <-- "0..N" Ghe
  SuatDien "1" <-- "0..N" GiuCho
  GiuCho "1" <-- "1..N" ChiTietGiuCho
  KhuVuc "1" <-- "0..N" ChiTietGiuCho
  Ghe "0..1" <-- "0..N" ChiTietGiuCho
  SuKien "1" <-- "0..N" SuKienNgheSi
  NgheSi "1" <-- "0..N" SuKienNgheSi

  %% SERVICE LIÊN KẾT ENTITY
  EventService ..> SuKien : retrieves
  EventService ..> SuatDien : retrieves
  ScheduleService ..> SuKien : parses description
  ArtistService ..> SuKienNgheSi : queries
  ArtistService ..> NgheSi : queries
  TicketDataService ..> KhuVuc : loads
  TicketDataService ..> Ghe : loads
  BookingService ..> GiuCho : creates/releases
  BookingService ..> ChiTietGiuCho : manages
  OrganizerService ..> ToChuc : manages
  OrganizerService ..> SuKien : saves aggregate
  OrganizerService ..> CauHinhSuKien : configures
  BuyerAuthService ..> HoSoNguoiDung : authenticates
```

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
| `SUAT_DIEN` | `SuatDien` | `EventService`, `OrganizerService` | `src/domain/eventStatus.js` | Suất diễn, tính toán trạng thái mở bán `derivePublicSaleState`. |
| `KHU_VUC` | `KhuVuc` | `TicketDataService`, `OrganizerService` | `src/domain/seatMap.js` | Phân khu vé, tính giá tiền, bóc tách quyền lợi `parseTierBenefits`. |
| `GHE` | `Ghe` | `TicketDataService`, `SeatRealtimeService` | `src/domain/seatSelection.js` | Ghế ngồi vật lý, kiểm tra hợp lệ chọn ghế `evaluateSeatSelection`. |
| `GIU_CHO` | `GiuCho` | `BookingService` | `src/services/bookingService.ts` | Header giữ chỗ 5 phút, đếm ngược `calculateRemainingSeconds`. |
| `CHI_TIET_GIU_CHO` | `ChiTietGiuCho` | `BookingService` | `src/services/bookingService.ts` | Dòng giữ chỗ chi tiết (phân biệt khu đứng và ghế ngồi). |
| `NGHE_SI` | `NgheSi` | `ArtistService`, `OrganizerService` | `src/domain/publicArtists.js` | Danh mục nghệ sĩ, chuẩn hóa dữ liệu `normalizeArtistRow`. |
| `SU_KIEN_NGHE_SI` | `SuKienNgheSi` | `ArtistService`, `OrganizerService` | `src/services/artistService.ts` | Liên kết Lineup nghệ sĩ, sắp xếp thứ tự diễn `sortArtists`. |

---

## 6. Bộ 5 Sequence Diagrams chuẩn (`SD-01` .. `SD-05`)

### SD-01: Người mua xem danh mục, chi tiết sự kiện, suất diễn, lineup & timeline (UC-01, UC-02)

```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as EventDetail UI
  participant ES as eventService
  participant SS as scheduleService
  participant AS as artistService
  participant DB as Supabase PostgreSQL

  U->>UI: Truy cập URL /events/:slug
  UI->>ES: loadPublicEventDetail(slug)
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
    UI->>AS: loadEventArtists(eventId)
    AS->>DB: SELECT * FROM SU_KIEN_NGHE_SI JOIN NGHE_SI ORDER BY ThuTuHienThi
    DB-->>AS: Danh sách nghệ sĩ
    AS-->>UI: LineupSection hiển thị danh sách nghệ sĩ
  end
```

---

### SD-02: Xem sơ đồ ghế Realtime & Tạo giữ chỗ 5 phút chống bán trùng (UC-03)

Biểu diễn luồng chọn vé với hai trường hợp: **khu ghế ngồi** (`GheID` cụ thể) và **khu vé đứng** (`GheID = NULL`), đồng thời thể hiện cơ chế kiểm tra trigger giữa `SuatDienID` và `SuKienID`:

```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as Seating / Booking UI
  participant SRS as seatRealtimeService
  participant BS as bookingService
  participant RPC as RPC tao_giu_cho_theo_suat
  participant TRG as Trigger trg_giucho_suatdien_sukien
  participant DB as PostgreSQL
  participant WS as Realtime Publication

  U->>UI: Mở sơ đồ chọn chỗ của suất diễn showId
  UI->>SRS: subscribeSeatUpdates(showId)
  SRS->>WS: Lắng nghe kênh GHE theo KhuVucID của showId

  U->>UI: Chọn 1–4 chỗ (Ghế ngồi hoặc Vé đứng)
  UI->>BS: createHold({ eventId, showId, sessionId, items })
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

### SD-03: Hủy giữ chỗ chủ động & Hết hạn giữ chỗ tự động qua cron (UC-04)

```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as Booking UI
  participant BS as bookingService
  participant RPC_HUY as RPC huy_giu_cho
  participant CRON as pg_cron Service
  participant RPC_EXP as RPC expire_seat_holds
  participant DB as PostgreSQL
  participant WS as Realtime Publication

  alt Trường hợp 1: Người mua chủ động hủy
    U->>UI: Nhấn nút "Hủy giữ chỗ"
    UI->>BS: releaseHold(holdId, sessionId)
    BS->>RPC_HUY: Gọi huy_giu_cho(holdId, sessionId)
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

### SD-04: Đăng nhập, phân loại tài khoản, tạo tổ chức & phân quyền thành viên (UC-05, UC-09)

```mermaid
sequenceDiagram
  actor O as Người dùng / BTC
  participant UI as Organizer Portal
  participant BAS as buyerAuthService
  participant OS as organizerService
  participant AUTH as Supabase Auth
  participant DB as PostgreSQL

  O->>UI: Đăng nhập email / mật khẩu
  UI->>BAS: signIn(email, password)
  BAS->>AUTH: auth.signInWithPassword()
  AUTH-->>BAS: Trả về Session JWT (chứa auth.uid)
  BAS->>DB: SELECT LoaiTaiKhoan FROM HO_SO_NGUOI_DUNG WHERE NguoiDungID = auth.uid()
  DB-->>BAS: Trả về loaiTaiKhoan ('USER' hoặc 'ORGANIZER')
  BAS-->>UI: Xác thực thành công

  alt Nếu là tài khoản ORGANIZER và tạo tổ chức mới
    O->>UI: Nhập tên tổ chức & Slug
    UI->>OS: createOrganization(name, slug)
    OS->>DB: INSERT INTO TO_CHUC (TenToChuc, Slug) RETURNING ToChucID
    OS->>DB: INSERT INTO THANH_VIEN_TO_CHUC (ToChucID, NguoiDungID, VaiTro = 'CHU_SO_HUU')
    DB-->>OS: Hoàn tất tạo tổ chức & Phân quyền quản trị
    OS-->>UI: Cập nhật danh sách tổ chức đang quản lý
  else Nếu là nhân viên Vận hành / Soát vé (UC-09)
    UI->>OS: loadOperationalData(eventId)
    OS->>DB: SELECT * FROM SU_KIEN WHERE SuKienID = eventId AND la_thanh_vien_tochuc(ToChucID)
    DB-->>OS: Trả về dữ liệu suất diễn, hạng vé và sức chứa
    OS-->>UI: Hiển thị bảng điều khiển vận hành sự kiện
  end
```

---

### SD-05: BTC tạo/lưu sự kiện toàn diện, xem trước & công bố sự kiện (UC-06, UC-07, UC-08)

```mermaid
sequenceDiagram
  actor O as Ban tổ chức
  participant UI as Organizer Event Wizard
  participant OS as organizerService
  participant RPC_SAVE as RPC luu_su_kien_toan_dien
  participant RPC_PUB as RPC cong_bo_su_kien
  participant DB as PostgreSQL

  O->>UI: Nhập thông tin sự kiện, timeline Markdown, cấu hình 1-1, suất diễn, hạng vé & nghệ sĩ
  UI->>OS: saveFullEventDraft(payload)
  OS->>RPC_SAVE: luu_su_kien_toan_dien(p_payload JSONB)
  RPC_SAVE->>DB: Kiểm tra quyền co_quyen_bien_tap_to_chuc(orgId)
  RPC_SAVE->>DB: INSERT / UPDATE SU_KIEN (lưu MoTaChiTiet gộp timeline)
  RPC_SAVE->>DB: INSERT / UPDATE CAU_HINH_SU_KIEN (quan hệ 1-1 SuKienID, TuyChonMoRong)
  RPC_SAVE->>DB: Đồng bộ SUAT_DIEN và KHU_VUC (kèm trigger kiểm tra SuKienID)
  RPC_SAVE->>DB: Đồng bộ SU_KIEN_NGHE_SI và master catalog NGHE_SI
  DB-->>RPC_SAVE: Thành công
  RPC_SAVE-->>OS: Trả về eventId, slug, status: 'BAN_NHAP'
  OS-->>UI: Lưu bản nháp thành công

  O->>UI: Nhấn nút "Xem trước (Preview)"
  UI->>UI: Mở route /preview/:slug với EventTemplate chuẩn dùng chung

  O->>UI: Nhấn "Công bố sự kiện"
  UI->>OS: publishEvent(eventId)
  OS->>RPC_PUB: cong_bo_su_kien(eventId)
  RPC_PUB->>DB: Kiểm tra điều kiện (có >=1 suất diễn, >=1 phân khu vé)
  RPC_PUB->>DB: UPDATE SU_KIEN SET TrangThaiCongBo = 'CONG_KHAI'
  DB-->>RPC_PUB: Cập nhật thành công
  RPC_PUB-->>OS: Sự kiện đã công bố
  OS-->>UI: Chuyển trạng thái sang CONG_KHAI, xuất hiện trên Marketplace
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
