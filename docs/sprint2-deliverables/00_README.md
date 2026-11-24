# EVENTTICKETING — BỘ TÀI LIỆU KỸ THUẬT & SƠ ĐỒ SPRINT 2

> **Đơn vị đào tạo:** Trường Đại học Ngoại thương — Khoa Công nghệ và Khoa học Dữ liệu  
> **Đối chiếu mã nguồn:** Nhánh `main` (PR #108, ngày 24/11/2026) — **36 Supabase migrations**, **21 bảng `public` thật**, **1.002 Node tests**, **20 tệp pgTAP (907 kiểm tra CSDL)**.

---

## 1. Danh mục tài liệu Sprint 2

| Tệp | Nội dung chính | Sơ đồ đi kèm |
|---|---|---|
| [01_SPRINT2_REQUIREMENTS_AND_TRACEABILITY.md](./01_SPRINT2_REQUIREMENTS_AND_TRACEABILITY.md) | Danh mục Use Case Sprint 2 (`UC-T2-01..03`, `UC-T4-01..05`, `UC-BTC-06..07`) và Ma trận truy vết 4 chiều (`UC → FR → ERD 21 bảng → B-C-E Class → Sequence/Activity → Kiểm thử`) | `uc_sprint2_overview` |
| [02_SPRINT2_ANALYSIS_AND_SYSTEM_DESIGN.md](./02_SPRINT2_ANALYSIS_AND_SYSTEM_DESIGN.md) | Phân tích & thiết kế hướng đối tượng B-C-E: Use Case, 2 Activity Diagrams, 2 Class Diagrams (toàn hệ thống + trọng tâm Sprint 2), 4 Sequence Diagrams chuẩn mã nguồn (kèm cả mã nguồn Mermaid và ảnh PNG 2x / SVG) | `uc_sprint2_overview`, `act_s2_01..02`, `cd_sprint2_bce_focus`, `class_diagram_bce_overview`, `sd_s2_01..04` |
| [03_SPRINT2_DATABASE_DESIGN_21_TABLES.md](./03_SPRINT2_DATABASE_DESIGN_21_TABLES.md) | Thiết kế CSDL đầy đủ **21 bảng `public` thật** (14 bảng Sprint 1/3 + 5 bảng Nghiệp vụ/Audit bất biến + 2 bảng Kỹ thuật Demo/Mô phỏng), từ điển dữ liệu, 3 loại quan hệ và các Trigger bảo vệ toàn vẹn | `erd_full_21_tables`, `erd_sprint2_subsystem` |

---

## 2. Danh mục 11 bộ ảnh sơ đồ (PNG 2x + SVG)

Toàn bộ ảnh trong thư mục [images/](./images/) được sinh đồng nhất theo chuẩn thị giác của Sprint 1 (`#2A3342` header bar, màu B-C-E 4 cột, viền cam `#F59E0B` cho thành phần Sprint 2, xuất 2x Hi-DPI qua Chrome Headless):

| Mã sơ đồ | Ảnh PNG 2x | Vector SVG | Mô tả |
|---|---|---|---|
| **ERD-FULL** | [erd_full_21_tables.png](./images/erd_full_21_tables.png) | [SVG](./images/erd_full_21_tables.svg) | ERD toàn hệ thống 21 bảng `public` thật (đã loại bỏ 2 bảng ảo `DON_HANG`, `VE`) |
| **ERD-S2** | [erd_sprint2_subsystem.png](./images/erd_sprint2_subsystem.png) | [SVG](./images/erd_sprint2_subsystem.svg) | ERD chi tiết 12 bảng liên quan trực tiếp Sprint 2 (Dynamic Pricing, OTP thanh toán, Audit, Demo) |
| **CD-ALL** | [class_diagram_bce_overview.png](./images/class_diagram_bce_overview.png) | [SVG](./images/class_diagram_bce_overview.svg) | Sơ đồ Lớp B-C-E toàn hệ thống (41 lớp: 9 Boundary, 11 Control, 21 Entity) |
| **CD-S2** | [cd_sprint2_bce_focus.png](./images/cd_sprint2_bce_focus.png) | [SVG](./images/cd_sprint2_bce_focus.svg) | Sơ đồ Lớp B-C-E trọng tâm Sprint 2 (25 lớp: 6 Boundary, 7 Control, 12 Entity) |
| **UC-S2** | [uc_sprint2_overview.png](./images/uc_sprint2_overview.png) | [SVG](./images/uc_sprint2_overview.svg) | Sơ đồ Use Case Sprint 2 (Khán giả & Ban tổ chức, `«include»`/`«extend»`) |
| **ACT-S2-01** | [act_s2_01_hold_otp_checkout.png](./images/act_s2_01_hold_otp_checkout.png) | [SVG](./images/act_s2_01_hold_otp_checkout.svg) | Activity Diagram: Giữ chỗ 5p → Gia hạn 1 lần → OTP mỗi lần thanh toán / Mã Demo → `CONVERTED` |
| **ACT-S2-02** | [act_s2_02_dynamic_pricing_guard.png](./images/act_s2_02_dynamic_pricing_guard.png) | [SVG](./images/act_s2_02_dynamic_pricing_guard.svg) | Activity Diagram: Dynamic Pricing 5 bước, Mô phỏng, PriceGuard, Duyệt `PT409` & Realtime |
| **SD-S2-01** | [sd_s2_01_hold_otp_checkout.png](./images/sd_s2_01_hold_otp_checkout.png) | [SVG](./images/sd_s2_01_hold_otp_checkout.svg) | Sequence Diagram: Giữ chỗ, hạn mức 4 vé, gia hạn +5p & OTP xác nhận thanh toán |
| **SD-S2-02** | [sd_s2_02_dynamic_pricing_propose.png](./images/sd_s2_02_dynamic_pricing_propose.png) | [SVG](./images/sd_s2_02_dynamic_pricing_propose.svg) | Sequence Diagram: Cấu hình Quy tắc giá, Mô phỏng nhu cầu & Tạo Đề xuất (PriceGuard) |
| **SD-S2-03** | [sd_s2_03_dynamic_pricing_approve_realtime.png](./images/sd_s2_03_dynamic_pricing_approve_realtime.png) | [SVG](./images/sd_s2_03_dynamic_pricing_approve_realtime.svg) | Sequence Diagram: BTC Phê duyệt/Từ chối (`PT409`), Audit bất biến & Realtime giá |
| **SD-S2-04** | [sd_s2_04_purchase_config_wallet_soft_delete.png](./images/sd_s2_04_purchase_config_wallet_soft_delete.png) | [SVG](./images/sd_s2_04_purchase_config_wallet_soft_delete.svg) | Sequence Diagram: Cấu hình Mua vé (Audit), Ví Vé của tôi & Xóa mềm sự kiện (`DA_AN`) |

---

## 3. Các điểm hiệu chỉnh quan trọng so với bản kế hoạch Sprint 2 ban đầu

1. **Số bảng CSDL thật là 21 bảng `public` (không phải 17):** Bổ sung 4 bảng thực tế đã triển khai (`NHAT_KY_DINH_GIA`, `NHAT_KY_CAU_HINH_MUA_VE`, `MO_PHONG_GHE`, `CAU_HINH_DEMO`) và **loại bỏ hoàn toàn 2 bảng ảo** `DON_HANG` & `VE` (vé đã mua lưu bằng `GIU_CHO.TrangThai = 'CONVERTED'` + `CHI_TIET_GIU_CHO.MaVe` / `DonGiaChot`).
2. **Luồng OTP đặt tại bước Xác nhận thanh toán (không chặn lúc Giữ chỗ):** Theo migration `20261124090000` và `20261124130000`, `tao_giu_cho_theo_suat` không kiểm tra OTP; `xac_nhan_thanh_toan` yêu cầu **OTP tươi xác minh sau `GIU_CHO.NgayTao`** và chưa dùng (`GIU_CHO.MocOtpDaDung`), đồng thời tự động gia hạn +5 phút 1 lần duy nhất (`gia_han_giu_cho`, `DaGiaHan = TRUE`), hoặc chấp nhận mã demo SHA-256 (`CAU_HINH_DEMO`) cho tài khoản `@demo.vn`.
3. **Tên lớp & RPC khớp 100% mã nguồn:** `PricingEngine` (`computePriceProposal`), `PricingService` (`luu_quy_tac_gia`, `mo_phong_nhu_cau`, `lay_so_lieu_dinh_gia`, `luu_de_xuat_gia`, `duyet_de_xuat_gia`, `tu_choi_de_xuat_gia`), `PriceRealtimeService`, `OtpService`, `PurchaseConfigService` (`luu_cau_hinh_mua_ve`), `TicketWalletService` (`ve_cua_toi`), `OrganizerService.deleteEvent` (`xoa_su_kien`).
