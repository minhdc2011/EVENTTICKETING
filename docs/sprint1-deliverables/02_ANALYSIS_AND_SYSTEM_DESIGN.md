# 02 — Phân tích và thiết kế hệ thống

## 1. Use case tổng quan

```mermaid
flowchart LR
  U[Người mua] --> UC1[Xem danh mục và chi tiết event]
  U --> UC2[Chọn suất diễn và hạng vé]
  U --> UC3[Xem sơ đồ và giữ tối đa 4 vé]
  U --> UC4[Hủy/đợi hết hạn giữ chỗ]
  O[BTC/Biên tập] --> OC1[Đăng nhập và chọn tổ chức]
  O --> OC2[Tạo/sửa bản nháp]
  O --> OC3[Cấu hình suất diễn và hạng vé]
  O --> OC4[Preview và công bố]
  V[Vận hành/Soát vé] --> OC5[Xem dữ liệu vận hành]
  S[Hệ thống] --> SC1[Kiểm tra RLS/RBAC]
  S --> SC2[Khóa ghế và hết hạn sau 5 phút]
  S --> SC3[Phát realtime trạng thái ghế]
```

## 2. Activity — luồng BTC tạo và công bố event

```mermaid
flowchart TD
  A[Đăng nhập BTC] --> B{Có tổ chức?}
  B -- Chưa --> C[Tạo tổ chức]
  B -- Có --> D[Chọn tổ chức đang làm việc]
  C --> D
  D --> E[Tạo bản nháp sự kiện]
  E --> F[Nhập thông tin, địa điểm, chính sách]
  F --> G[Thêm suất diễn]
  G --> H[Thêm hạng vé/phân khu]
  H --> I[Lưu aggregate trong transaction]
  I --> J[Preview bằng template dùng chung]
  J --> K{Đủ điều kiện công bố?}
  K -- Không --> F
  K -- Có --> L[Công bố]
  L --> M[Event xuất hiện ở marketplace]
```

## 3. Activity — luồng người mua

```mermaid
flowchart TD
  A[Mở marketplace] --> B[Chọn event]
  B --> C[Chọn suất diễn]
  C --> D[Xem hạng vé, chính sách, địa điểm]
  D --> E[Chọn 1–4 vé/ghế]
  E --> F{Server giữ được?}
  F -- Không --> G[Thông báo hết/chỗ đã bị giữ]
  G --> E
  F -- Có --> H[Tạo GIU_CHO, hết hạn +5 phút]
  H --> I[Realtime cập nhật ghế DANG_GIU]
  I --> J{Thanh toán trong hạn?}
  J -- Sprint 1 chưa có --> K[Hủy hoặc hết hạn, trả ghế TRONG]
  J -- Tương lai --> L[CONVERTED và phát hành vé]
```

## 4. Kiến trúc logic

```mermaid
flowchart TB
  subgraph Client[React/Vite Client]
    R[Router/App]
    MP[Marketplace]
    EP[EventTemplate dùng chung]
    EX[Extension: lineup/seating/timeline]
    OP[Organizer Portal]
    R --> MP
    R --> EP
    EP --> EX
    R --> OP
  end

  subgraph Service[Service layer]
    ES[eventService]
    OS[organizerService]
    BS[bookingService]
    RT[seatRealtimeService]
  end

  subgraph Supabase[Supabase/PostgreSQL]
    AUTH[Auth]
    DB[(Tables + constraints)]
    RPC[Transactional RPC]
    RLS[RLS/RBAC policies]
    WS[Realtime publication]
  end

  MP --> ES
  EP --> ES
  OP --> OS
  EX --> BS
  EX --> RT
  ES --> DB
  OS --> AUTH
  OS --> RPC
  BS --> RPC
  RT --> WS
  RLS --> DB
```

## 5. Sequence — giữ chỗ 5 phút và chống bán trùng

```mermaid
sequenceDiagram
  actor U as Người mua
  participant UI as React UI
  participant S as bookingService
  participant RPC as tao_giu_cho RPC
  participant DB as PostgreSQL
  participant WS as Realtime

  U->>UI: Chọn 1–4 vé/ghế
  UI->>S: createHold(items, sessionId)
  S->>RPC: eventId, showId, sessionId, items
  RPC->>DB: BEGIN; expire holds cũ
  RPC->>DB: SELECT zone/seat FOR UPDATE
  alt Ghế TRONG và đủ tồn
    RPC->>DB: INSERT GIU_CHO expiresAt = now + 5m
    RPC->>DB: UPDATE GHE = DANG_GIU
    RPC->>DB: INSERT CHI_TIET_GIU_CHO
    DB-->>WS: Phát thay đổi GHE
    RPC-->>S: holdId, expiresAt, ACTIVE
    S-->>UI: Hiển thị countdown
  else Không đủ tồn/đã bị giữ
    RPC-->>S: Lỗi nghiệp vụ
    S-->>UI: Yêu cầu chọn lại
  end
```

## 6. Thiết kế component chi tiết event

```mermaid
flowchart TD
  A[GenericEventPage] --> B[resolveEventTemplateSlots]
  A --> C[loadPublicTicketTiers]
  B -->|DEFAULT| D[Không extension]
  B -->|SUPER_CONCERT_2026| E[Ambient + Lineup + Seating + Modals]
  C --> F[EventTemplate]
  D --> F
  E --> F
  F --> G[Shared Header + Hero + ShowSwitcher]
  F --> H[Overview + TicketTiers + Venue + Media + Policy + Contact]
  F --> I[BookingSummary + MobileSticky]
```

Điểm thiết kế chính: template quyết định **cấu trúc chuẩn**, còn specialization chỉ bổ sung nội dung. Vì vậy BTC tạo event mới không cần code riêng, trong khi Super Concert vẫn giữ trải nghiệm đặc thù.

