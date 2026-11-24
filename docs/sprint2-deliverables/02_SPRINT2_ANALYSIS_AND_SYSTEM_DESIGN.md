# 02 — Phân tích và Thiết kế Hệ thống Sprint 2 (B-C-E)

> Tài liệu này cung cấp đầy đủ bộ sơ đồ phân tích & thiết kế cho Sprint 2 dưới cả 2 định dạng: **ảnh độ phân giải cao (PNG 2x + SVG)** đồng nhất chuẩn thị giác Sprint 1 và **mã nguồn Mermaid** có thể kiểm soát phiên bản trực tiếp trong Git.

---

## 1. Sơ đồ Use Case Sprint 2

![Sơ đồ Use Case Sprint 2](./images/uc_sprint2_overview.png)

*(Vector: [uc_sprint2_overview.svg](./images/uc_sprint2_overview.svg))*

```mermaid
flowchart LR
  KG([Khán giả])
  BTC([Ban tổ chức])
  subgraph S2K["Cụm Khán giả — Giữ chỗ, OTP thanh toán & Ví vé"]
    T201([UC-T2-01 Giữ chỗ & Xác minh OTP thanh toán])
    T202([UC-T2-02 Kiểm soát hạn mức 4 vé lũy kế])
    EXT([Gia hạn giữ chỗ +5p 1 lần / Mã Demo])
    T203([UC-T2-03 Xem Ví Vé của tôi])
    T404([UC-T4-04 Xem giá Realtime & % Biến động])
  end
  subgraph S2B["Cụm Ban tổ chức — Dynamic Pricing & Vận hành"]
    T401([UC-T4-01 Cấu hình Quy tắc giá])
    T402([UC-T4-02 Mô phỏng nhu cầu & Tính Đề xuất])
    T403([UC-T4-03 Phê duyệt / Từ chối & Audit Trail])
    T405([UC-T4-05 Kiểm soát PriceGuard & Khóa sửa giá])
    B06([UC-BTC-06 Cấu hình hạn mức vé & OTP])
    B07([UC-BTC-07 Xóa mềm sự kiện DA_AN])
  end
  KG --- T201
  KG --- T202
  KG --- T203
  KG --- T404
  T201 -. include .-> T202
  EXT -. extend .-> T201
  BTC --- T401
  BTC --- T402
  BTC --- T403
  BTC --- B06
  BTC --- B07
  T402 -. include .-> T405
  T403 -. Realtime KHU_VUC .-> T404
```

---

## 2. Activity Diagrams (Sơ đồ Hoạt động theo Swimlane)

### 2.1 ACT-S2-01: Giữ chỗ, Hạn mức 4 vé, Gia hạn 1 lần & OTP Xác nhận thanh toán

![Activity Diagram 01 — Giữ chỗ & OTP thanh toán](./images/act_s2_01_hold_otp_checkout.png)

*(Vector: [act_s2_01_hold_otp_checkout.svg](./images/act_s2_01_hold_otp_checkout.svg))*

```mermaid
flowchart TD
  S([Bắt đầu]) --> A[Khán giả chọn 1-4 ghế trên sơ đồ - không cần đăng nhập]
  A --> B[Kiểm tra phiên đăng nhập -> BuyerAuthModal nếu chưa login]
  B --> C[Gọi RPC tao_giu_cho_theo_suat: KHÔNG check OTP, Advisory Lock, check ACTIVE+CONVERTED <= SoVeToiDaMoiDon]
  C --> D{Đủ ghế & trong hạn mức?}
  D -- Không --> E[Toast lỗi tranh chấp / vượt hạn mức -> Chọn lại]
  E --> A
  D -- Có --> F[Tạo GIU_CHO ACTIVE 5p + Chốt DonGiaChot + GHE = DANG_GIU]
  F --> G[Mở HoldConfirmationDialog phase=held + gắn holdSessionGuard]
  G --> H{Hành động khán giả?}
  H -- Hủy / Đăng xuất / Hết 5p --> I[huy_giu_cho hoặc pg_cron expire_seat_holds -> Trả ghế TRONG]
  H -- Bấm Xác nhận thanh toán --> J[Gọi RPC xac_nhan_thanh_toan]
  J --> K{YeuCauXacMinhOTP = TRUE & chưa có OTP tươi sau NgayTao?}
  K -- Có - Mã 42501 --> L[Gọi gia_han_giu_cho +5p 1 lần duy nhất DaGiaHan=TRUE & Mở CheckoutOtpDialog]
  L --> M[Nhập OTP 6 số Email hoặc Mã Demo @demo.vn]
  M --> N[verifyOtp hoặc truyền p_ma_demo -> Gọi lại xac_nhan_thanh_toan]
  N --> O[Xác thực moc_otp_moi_nhat / SHA-256 CAU_HINH_DEMO]
  K -- Không cần OTP --> O
  O --> P[Ghi MocOtpDaDung + GIU_CHO=CONVERTED + GHE=DA_BAN]
  P --> Q[Hiển thị phase=paid & Xem vé tại /my-tickets]
  Q --> Z([Kết thúc])
```

### 2.2 ACT-S2-02: Dynamic Pricing 5 bước, Mô phỏng, PriceGuard & Human-in-the-Loop

![Activity Diagram 02 — Dynamic Pricing & PriceGuard](./images/act_s2_02_dynamic_pricing_guard.png)

*(Vector: [act_s2_02_dynamic_pricing_guard.svg](./images/act_s2_02_dynamic_pricing_guard.svg))*

```mermaid
flowchart TD
  S([Bắt đầu]) --> A[BTC cấu hình QUY_TAC_GIA: P0, Pmin, Pmax, S, DeltaMax, wr/wv/wt]
  A --> B[RPC luu_quy_tac_gia -> UPSERT QUY_TAC_GIA + INSERT NHAT_KY_DINH_GIA]
  B --> C[Tùy chọn: RPC mo_phong_nhu_cau ban_nhanh / ban_cham / ban_deu -> MO_PHONG_GHE]
  C --> D[RPC lay_so_lieu_dinh_gia -> r, u, u_exp, Trem]
  D --> E[PricingEngine 5 bước: r,u,Trem -> P_raw -> DeltaMax -> Step S -> Clamp & Deadband]
  E --> F[RPC luu_de_xuat_gia: PriceGuard kiểm tra NgayCapNhat & khung giá]
  F --> G{PriceGuard hợp lệ?}
  G -- Không --> H[Chặn lưu & ghi NHAT_KY_DINH_GIA CHAN_DE_XUAT]
  G -- Có --> I[Tạo DE_XUAT_GIA CHO_DUYET -> BTC xem giải trình r, u, Trem]
  I --> J{BTC quyết định?}
  J -- Từ chối --> K[RPC tu_choi_de_xuat_gia -> DA_TU_CHOI, giữ giá cũ]
  J -- Phê duyệt --> L[RPC duyet_de_xuat_gia: SELECT FOR UPDATE, kiểm tra xung đột PT409]
  L --> M[Cập nhật KHU_VUC.GiaVeNiemYet + INSERT NHAT_KY_GIA bất biến + Phát Realtime]
  K --> Z([Kết thúc])
  M --> Z
```

---

## 3. Sơ đồ Lớp Kiến trúc B-C-E (Class Diagrams)

### 3.1 Sơ đồ Lớp B-C-E Trọng tâm Sprint 2 (25 lớp)

![Sơ đồ Lớp B-C-E trọng tâm Sprint 2](./images/cd_sprint2_bce_focus.png)

*(Vector: [cd_sprint2_bce_focus.svg](./images/cd_sprint2_bce_focus.svg))*

### 3.2 Sơ đồ Lớp B-C-E Toàn hệ thống Sprint 1 + Sprint 2 (41 lớp — 21 bảng Entity thật)

![Sơ đồ Lớp B-C-E toàn hệ thống](./images/class_diagram_bce_overview.png)

*(Vector: [class_diagram_bce_overview.svg](./images/class_diagram_bce_overview.svg))*

---

## 4. Sequence Diagrams Sprint 2 (4 sơ đồ chuẩn `:ObjectName` & B-C-E)

### 4.1 SD-S2-01: Giữ chỗ, Hạn mức 4 vé, Gia hạn & OTP Xác nhận thanh toán

![SD-S2-01: Giữ chỗ & OTP thanh toán](./images/sd_s2_01_hold_otp_checkout.png)

*(Vector: [sd_s2_01_hold_otp_checkout.svg](./images/sd_s2_01_hold_otp_checkout.svg))*

```mermaid
sequenceDiagram
  autonumber
  actor U as Người mua
  participant UI as <<Boundary>> :OfficialSeatingMap
  participant OTPUI as <<Boundary>> :CheckoutOtpDialog
  participant BS as <<Control>> :BookingService
  participant OTPS as <<Control>> :OtpService
  participant AUTH as <<Control>> :SupabaseAuth
  participant DB as <<Entity>> :PostgreSQL

  U->>UI: Chọn ghế (xem tự do) -> Đăng nhập & Giữ chỗ
  UI->>BS: createSeatHold(suatDienId, seats)
  BS->>DB: RPC tao_giu_cho_theo_suat() [Không check OTP]
  DB->>DB: pg_advisory_xact_lock + Đếm ACTIVE+CONVERTED <= SoVeToiDaMoiDon
  DB->>DB: Chốt CHI_TIET_GIU_CHO.DonGiaChot = GiaVeNiemYet
  DB-->>UI: holdId (ACTIVE, 5 phút) -> Mở HoldConfirmationDialog
  U->>UI: Bấm Xác nhận thanh toán
  UI->>BS: confirmSeatHoldPayment(holdId)
  BS->>DB: RPC xac_nhan_thanh_toan(holdId, phienId, NULL)
  alt YeuCauXacMinhOTP = TRUE & chưa có OTP tươi sau GIU_CHO.NgayTao
    DB-->>UI: Lỗi 42501 (Yêu cầu OTP xác nhận thanh toán)
    UI->>BS: extendSeatHold -> RPC gia_han_giu_cho() (+5p, 1 lần)
    BS->>DB: UPDATE GIU_CHO SET DaGiaHan=TRUE, ThoiGianHetHan + 5m
    UI->>OTPUI: Mở CheckoutOtpDialog
    alt Nhập OTP 6 số gửi qua Email
      OTPUI->>OTPS: requestOtp(email) -> signInWithOtp()
      OTPS->>AUTH: Gửi mã OTP 6 chữ số (TTL 120s, chờ 60s)
      U->>OTPUI: Nhập mã OTP 6 số
      OTPUI->>AUTH: verifyOtp(email, token)
      OTPUI->>DB: xac_nhan_thanh_toan() -> Check moc_otp_moi_nhat()
    else Tài khoản @demo.vn nhập Mã demo
      U->>OTPUI: Nhập mã demo (p_ma_demo)
      OTPUI->>DB: xac_nhan_thanh_toan(p_ma_demo) -> Check SHA-256 CAU_HINH_DEMO
    end
  end
  DB->>DB: Ghi MocOtpDaDung + GIU_CHO=CONVERTED + GHE=DA_BAN
  DB-->>UI: Thanh toán thành công (phase=paid) & Lưu Vé của tôi
```

### 4.2 SD-S2-02: Dynamic Pricing — Cấu hình Quy tắc, Mô phỏng & Tạo Đề xuất (PriceGuard)

![SD-S2-02: Dynamic Pricing đề xuất giá](./images/sd_s2_02_dynamic_pricing_propose.png)

*(Vector: [sd_s2_02_dynamic_pricing_propose.svg](./images/sd_s2_02_dynamic_pricing_propose.svg))*

```mermaid
sequenceDiagram
  autonumber
  actor O as Ban tổ chức
  participant UI as <<Boundary>> :OrganizerPricingPanel
  participant PS as <<Control>> :PricingService
  participant ENG as <<Control>> :PricingEngine
  participant DB as <<Entity>> :PostgreSQL

  O->>UI: Cấu hình P0, Pmin, Pmax, S, DeltaMax, wr/wv/wt
  UI->>PS: savePriceRule(khuVucId, rule)
  PS->>DB: RPC luu_quy_tac_gia() -> UPSERT QUY_TAC_GIA
  DB->>DB: INSERT NHAT_KY_DINH_GIA (CAP_NHAT_QUY_TAC)
  DB-->>UI: Lưu thành công & Hết hiệu lực đề xuất cũ nếu đổi khung
  opt BTC chạy Mô phỏng nhu cầu (Demo/Test)
    O->>UI: Chọn kịch bản (ban_nhanh / ban_cham / ban_deu)
    UI->>PS: simulateDemand(khuVucId, scenario)
    PS->>DB: RPC mo_phong_nhu_cau() -> Ghi MO_PHONG_GHE & GHE
  end
  O->>UI: Bấm Tính đề xuất giá khu vực
  UI->>PS: loadPricingMetrics(khuVucId)
  PS->>DB: RPC lay_so_lieu_dinh_gia() -> r, u, u_exp, Trem
  DB-->>PS: PricingMetrics + NgayCapNhat quy tắc
  PS->>ENG: computePriceProposal(rule, metrics) [5 bước]
  ENG->>ENG: P_raw -> Giới hạn DeltaMax -> Bước S -> Clamp -> Deadband
  ENG-->>PS: P_propose, CoCanhBaoVuotKhung, LyDoDeXuat
  PS->>DB: RPC luu_de_xuat_gia() [PriceGuard]
  alt PriceGuard chặn (Quy tắc vừa đổi / Ngoài [Pmin, Pmax])
    DB->>DB: INSERT NHAT_KY_DINH_GIA (CHAN_DE_XUAT)
    DB-->>UI: Từ chối lưu & Yêu cầu tính lại
  else Hợp lệ
    DB->>DB: INSERT DE_XUAT_GIA (CHO_DUYET)
    DB-->>UI: Hiển thị thẻ Đề xuất kèm giải trình r, u, Trem
  end
```

### 4.3 SD-S2-03: Dynamic Pricing — BTC Phê duyệt (`PT409`), Audit Trail & Realtime Giá

![SD-S2-03: Dynamic Pricing phê duyệt & Realtime](./images/sd_s2_03_dynamic_pricing_approve_realtime.png)

*(Vector: [sd_s2_03_dynamic_pricing_approve_realtime.svg](./images/sd_s2_03_dynamic_pricing_approve_realtime.svg))*

```mermaid
sequenceDiagram
  autonumber
  actor O as Ban tổ chức
  participant UI as <<Boundary>> :OrganizerPriceProposals
  participant PS as <<Control>> :PricingService
  participant DB as <<Entity>> :PostgreSQL
  participant WS as <<Control>> :SupabaseRealtime
  participant PRS as <<Control>> :PriceRealtimeService
  participant BUI as <<Boundary>> :OfficialSeatingMap

  O->>UI: Xem danh sách DE_XUAT_GIA (CHO_DUYET)
  alt BTC Phê duyệt (DA_DUYET)
    O->>UI: Bấm Phê duyệt (deXuatId, ghiChuDuyet)
    UI->>PS: approvePriceProposal(deXuatId, ghiChu)
    PS->>DB: RPC duyet_de_xuat_gia() [SELECT FOR UPDATE]
    alt GiaVeNiemYet != GiaHienTai (Xung đột đồng thời)
      DB-->>UI: ROLLBACK + Mã lỗi PT409
    else Khớp giá hiện tại
      DB->>DB: UPDATE DE_XUAT_GIA = DA_DUYET + NguoiDuyetID
      DB->>DB: UPDATE KHU_VUC.GiaVeNiemYet = GiaDeXuat
      DB->>DB: INSERT NHAT_KY_GIA (Immutable trigger)
      DB-->>WS: Phát UPDATE KHU_VUC
      WS-->>PRS: Payload giá mới
      PRS-->>BUI: Cập nhật giá & Badge % (Giữ DonGiaChot cũ)
      DB-->>UI: Hoàn tất duyệt & Cập nhật Nhật ký Audit
    end
  else BTC Từ chối (DA_TU_CHOI)
    O->>UI: Bấm Từ chối & Nhập lý do
    UI->>PS: rejectPriceProposal(deXuatId, ghiChu)
    PS->>DB: RPC tu_choi_de_xuat_gia() -> DA_TU_CHOI (Giữ giá cũ)
    DB-->>UI: Cập nhật trạng thái Đã từ chối
  end
```

### 4.4 SD-S2-04: Cấu hình Mua vé (Audit), Ví Vé của tôi & Xóa mềm Sự kiện

![SD-S2-04: Cấu hình Mua vé, Ví vé & Xóa mềm](./images/sd_s2_04_purchase_config_wallet_soft_delete.png)

*(Vector: [sd_s2_04_purchase_config_wallet_soft_delete.svg](./images/sd_s2_04_purchase_config_wallet_soft_delete.svg))*

```mermaid
sequenceDiagram
  autonumber
  actor O as Ban tổ chức
  actor U as Khán giả
  participant OUI as <<Boundary>> :OrganizerPortal
  participant WUI as <<Boundary>> :MyTickets
  participant PCS as <<Control>> :PurchaseConfigService
  participant TWS as <<Control>> :TicketWalletService
  participant OS as <<Control>> :OrganizerService
  participant DB as <<Entity>> :PostgreSQL

  opt 1. BTC cập nhật Cấu hình mua vé & Ghi Audit bất biến
    O->>OUI: Đổi SoVeToiDaMoiDon (1..20) & YeuCauXacMinhOTP
    OUI->>PCS: savePurchaseConfig(suKienId, payload)
    PCS->>DB: RPC luu_cau_hinh_mua_ve() -> UPDATE CAU_HINH_SU_KIEN
    DB->>DB: Trigger trg_kiem_soat -> INSERT NHAT_KY_CAU_HINH_MUA_VE
    DB-->>OUI: Lưu thành công & Hiện lịch sử thay đổi
  end
  opt 2. Khán giả xem Ví Vé của tôi (/my-tickets)
    U->>WUI: Truy cập /my-tickets
    WUI->>TWS: loadMyTickets()
    TWS->>DB: RPC ve_cua_toi() [JOIN GIU_CHO=CONVERTED, CHI_TIET, GHE]
    DB-->>WUI: Danh sách vé (MaVe, DonGiaChot, SuatDien, KhuVuc)
  end
  opt 3. BTC xóa mềm sự kiện (DA_AN)
    O->>OUI: Bấm Xóa sự kiện (Bản nháp hoặc Đã kết thúc)
    OUI->>OS: deleteEvent(suKienId)
    OS->>DB: RPC xoa_su_kien() [Check quyền & 0 GIU_CHO ACTIVE]
    DB->>DB: UPDATE SU_KIEN SET TrangThaiCongBo = 'DA_AN'
    DB-->>OUI: Ẩn sự kiện khỏi Marketplace & Cổng BTC
  end
```
