# Ghi chú bàn giao Sprint 2 – Đợt W2 (lõi định giá: engine, RPC, PriceGuard, Demand Simulator, dịch vụ, script)

Phạm vi W2: engine thuần, 3 migration (RPC cấu hình/số liệu, PriceGuard + TTL, Demand Simulator), 2 file pgTAP, mock + dịch vụ client, script chu kỳ định giá. W2 **không** làm giao diện, **không** làm duyệt/từ chối (W3), OTP, giới hạn vé, `pg_cron`.

Trạng thái xác minh của đợt này (đọc kỹ trước khi dùng bảng ở mục 1):
- Phiên viết ghi chú này **không có công cụ chạy lệnh** (không `git log`, không `npm`). Mọi dòng được dẫn là dòng đọc trực tiếp từ file trong cây làm việc, không dựa vào lời tổng kết của worker hay chú thích mã.
- `npm run check` (TypeScript, test Node, build) do agentkit chạy khi đề xuất bản cuối. Ghi chú này **không** ghi số lượng test đạt và không tự chạy lại. Trạng thái `gate` nghĩa là: test Node nằm trong `npm run check`; kết quả lần chạy cuối là do agentkit báo.
- `npm run check` **không** chạy SQL, không replay migration, không chạy pgTAP. Mọi thứ ở cột "cần db:test" và "chưa kiểm chứng" **chưa được chạy**. Không có số khẳng định pgTAP "đạt" nào trong ghi chú này.
- Số `plan(N)` của pgTAP chỉ là kế hoạch khai báo (`sprint2_pricing_rpc.sql:37` `plan(261)`, `sprint2_demand_simulator.sql:9` `plan(53)`), chưa đếm bằng máy.

## 0. Ánh xạ task của board A với commit

Task id của board khác gợi ý trong brief. Ánh xạ theo nội dung file (đã đối chiếu với tiêu đề commit đọc được trong ảnh chụp trạng thái git):

| Task | Nội dung | File chính | Commit |
|---|---|---|---|
| T1 | Engine thuần | `src/domain/pricingEngine.js`, `pricingEngine.d.ts`, `tests/pricing-engine.test.mjs` | không lấy được (xem dưới) |
| T2 | Migration RPC cấu hình/số liệu + bảng audit | `supabase/migrations/20261113090000_sprint2_pricing_rpc.sql` | không lấy được |
| T3 | PriceGuard, TTL, unique PENDING | `supabase/migrations/20261113093000_sprint2_pricing_guard.sql` | không lấy được |
| T4 | Demand Simulator | `supabase/migrations/20261113100000_sprint2_demand_simulator.sql` | không lấy được |
| T5 | pgTAP | `supabase/tests/sprint2_pricing_rpc.sql`, `supabase/tests/sprint2_demand_simulator.sql` | không lấy được |
| T6 | Mock định giá | `src/domain/mockPricing.js`, `.d.ts`, `tests/mock-pricing.test.mjs` | `3f6fc94` (commit "(board A)"; commit không-board trước đó không nằm trong ảnh chụp) |
| T7 | Dịch vụ client + kiểu RPC | `src/services/pricingService.ts`, `src/domain/pricingServiceCore.js`, `tests/pricing-service.test.mjs` | `db51c3f`, `a6968de` (board A) |
| T8 | Script chu kỳ | `scripts/run-pricing-cycle.mjs`, `tests/pricing-cycle.test.mjs` | `fb794c7`, `0ed9f06` (board A) |
| T9 | Ghi chú này | `.multiagent/notes/sprint2-W2-ghi-chu.md` | chưa commit |

Giới hạn: phiên này không chạy được `git log main..HEAD` và không được mở `.git`, nên chỉ có SHA của T6, T7, T8 (lấy từ ảnh chụp trạng thái: T6 `3f6fc94`; T7 `db51c3f` và bản board `a6968de`; T8 `fb794c7` và bản board `0ed9f06`). SHA của T1–T5 **chưa được xác nhận**; người duyệt nên điền từ `git log --oneline main..HEAD`. Ánh xạ T1–T5 dựa trên tên file, không dựa trên commit.

Các file khác liên quan: `src/types/database.types.ts` có khai báo hàm `co_quyen_dinh_gia` (dòng 949), `mo_phong_nhu_cau` (dòng 1038), `suat_dien_dang_mo_ban` (dòng 1042); không có mục bảng cho `NHAT_KY_DINH_GIA` hay `MO_PHONG_GHE` (grep theo tên, xem rủi ro R-11).

## 1. Bảng tiêu chí chấp nhận (mã AC theo mục 6 của đặc tả)

Ký hiệu file:
- `R` = `supabase/migrations/20261113090000_sprint2_pricing_rpc.sql`
- `G` = `supabase/migrations/20261113093000_sprint2_pricing_guard.sql`
- `S` = `supabase/migrations/20261113100000_sprint2_demand_simulator.sql`
- `PR` = `supabase/tests/sprint2_pricing_rpc.sql` (`plan(261)`)
- `PS` = `supabase/tests/sprint2_demand_simulator.sql` (`plan(53)`)
- `ENG` = `tests/pricing-engine.test.mjs`, `MOCK` = `tests/mock-pricing.test.mjs`, `SVC` = `tests/pricing-service.test.mjs`, `CYC` = `tests/pricing-cycle.test.mjs`
- Chuỗi trong dấu nháy là mô tả khẳng định/tên test chép nguyên văn. Số dòng pgTAP là dòng khẳng định trong file.

Cách đọc: mỗi AC tách ba lớp bằng chứng.
1. **Engine/mock (JS):** `gate`.
2. **SQL:** `cần db:test` (pgTAP viết sẵn, chưa chạy).
3. **Demo/hành vi tích hợp:** `chưa kiểm chứng`.

| Mã AC | Bằng chứng | Trạng thái |
|---|---|---|
| **AC-T4-01.1** (lưu khi sàn ≤ gốc ≤ trần, lỗi theo từng trường) | Engine/mock: `MOCK` dòng 245 `lần đầu là TAO_QUY_TAC, lần sau CAP_NHAT_QUY_TAC với DuLieuTruoc là dòng cũ`; dòng 278 `giá trị được làm tròn theo scale cột trước khi lưu`; dòng 389 `cấu hình không hợp lệ (${ten}) trả đúng state cũ, không audit`. SQL: `R:629-658` (NULL → NaN/±Infinity trên giá trị thô → ROUND → tràn cột, mỗi trường một lỗi `22023`, đúng thứ tự tham số), `R:676-719` (sàn > 0, gốc ≥ sàn, trần ≥ gốc, bước > 0, biên độ ∈ (0,1], ngưỡng thấp < cao, trọng số ≥ 0). pgTAP: `PR:282-326` (`NULL p_gia_goc`, `NaN p_gia_san`, `p_gia_san must be > 0`, `p_gia_goc < p_gia_san`, `p_gia_tran < p_gia_goc`, `S must be > 0`, `bien do = 0`, `bien do > 1`, `low threshold >= high threshold`, `negative weight`, `price beyond NUMERIC(12,2) precision`, `NULL activation flag`), `PR:328-331` (`invalid inputs created no rule`, `invalid inputs wrote no audit row`), `PR:267-269` (`QUAN_TRI can save a pricing rule`), `PR:231-242` (`BIEN_TAP`/`VAN_HANH`/`SOAT_VE` nhận `42501`). Nền W1: CHECK `chk_khung_gia_hop_le` (xem ghi chú W1). | Mock: `gate`. SQL: `cần db:test`. Giao diện báo lỗi theo trường: ngoài phạm vi W2 (không có UI) |
| **AC-T4-02.1** (khớp 4 ví dụ chuẩn) | `ENG:20` `ví dụ 1: 1.790.000 BINH_THUONG`; `ENG:41` `ví dụ 2: 1.250.000 CHAM_GIA_TRAN`; `ENG:62` `ví dụ 3: 480.000 CHAM_GIA_SAN`; `ENG:83` `ví dụ 4: không tạo đề xuất (chênh 0 < S)`. Biên: `ENG:130` (r=0, r=1, clamp), `ENG:227` (`totalSeats=0`), `ENG:246` (`targetVelocity=0`), `ENG:593` (sàn=trần). Mã nguồn: `src/domain/pricingEngine.js` (`computePriceProposal` dòng 174). | `gate` |
| **AC-T4-02.2** (deadband, một PENDING mỗi khu) | Engine/mock: `ENG:638` `proposed == Pcur, chênh đúng S (đề xuất), chênh S-1 (không đề xuất) và hasPendingProposal`; `MOCK:540` `mỗi khu vực tối đa một PENDING: đề xuất thứ hai bị chặn DA_CO_PENDING`. SQL: `G:95-97` (chỉ mục duy nhất từng phần `uq_de_xuat_gia_pending_khu_vuc`), `G:346-348` (`DUOI_BUOC_NHAY`), `G:352-364` (`DA_CO_PENDING`), `G:428-438` (vi phạm đúng chỉ mục này → `DA_CO_PENDING`, các lỗi unique khác `RAISE`). pgTAP: `PR:1622` `B9: below deadband step -> BI_CHAN DUOI_BUOC_NHAY`; `PR:1624` `B9: existing PENDING -> BI_CHAN DA_CO_PENDING`; `PR:1688-1700` (`B10: DE_XUAT_GIA has partial unique index uq_de_xuat_gia_pending_khu_vuc`, `B10: uq_de_xuat_gia_pending_khu_vuc is UNIQUE and partial on TrangThaiDuyet = PENDING`); `PR:1842` `B11: exact 120m PENDING does NOT expire and still triggers DA_CO_PENDING`. | Engine/mock: `gate`. SQL: `cần db:test`. Hai phiên ghi đồng thời: chưa có pgTAP (xem R-09), `chưa kiểm chứng` |
| **AC-T4-02.3** (chạm trần/sàn có cảnh báo) | Engine: `ENG:41`, `ENG:62`, `ENG:593` (`sàn=trần: xét trần trước khi rounded ≥ trần, và CHAM_GIA_SAN khi rounded < sàn`). SQL: `G:401-405` (`CHAM_GIA_TRAN`/`CHAM_GIA_SAN`/`BINH_THUONG`, `CoCanhBaoVuotKhung` ở `G:424`). pgTAP: `PR:1645-1646` `B9: exact floor boundary (160000) saves with CHAM_GIA_SAN`; `PR:1650-1651` `B9: exact ceiling boundary (250000) saves with CHAM_GIA_TRAN`. | Engine: `gate`. SQL: `cần db:test` |
| **AC-T4-02.4** (Demand Simulator đổi kịch bản thì đề xuất đổi hướng, demo) | Logic mô phỏng ở mock/engine: `MOCK:817` `ban_nhanh tăng giá (> hiện hành), ban_cham giảm giá (< hiện hành), ban_deu cho kết quả cố định dự đoán được` (cùng giá trị 1.800.000 / 1.200.000 / 1.490.000 ở `MOCK:825`, `:833`, `:841`). SQL: `S:124-505` (`mo_phong_nhu_cau`); kịch bản và mốc thời gian ở `S:66-75`, `S:418-432`; hai bước ghi ghế ở `S:445-457`. pgTAP: `PS:554-558` `lay_so_lieu_dinh_gia.so_ban_6h satisfies ban_nhanh > ban_deu >= ban_cham`; `PR:1984` `B12: ban_nhanh sells 14/20 seats in zone 997801 within 6h`; `PR:2008` `B12: ban_cham sells 2/20 seats outside 6h window`; `PR:2032` `B12: ban_deu sells 7/20 seats over 20h window (so_ban_6h=2)`; `PR:1992/2016/2040` (mốc thời gian mô phỏng không bị ghi đè bằng `now()`); `PR:2065` `B12: proposal created on simulated event has moPhong=true and LyDoDeXuat LIKE [MÔ PHỎNG]%`. | Mock/engine: `gate`. SQL: `cần db:test`. **Demo** (`node scripts/run-pricing-cycle.mjs --su-kien 1 --nhanh` sau khi chạy `mo_phong_nhu_cau` trên CSDL cục bộ): `chưa kiểm chứng`, cần Supabase cục bộ, chưa chạy. Giao diện chọn kịch bản: ngoài phạm vi W2 |
| **AC-T4-05.1** (đề xuất vượt khung từ bất kỳ nguồn nào bị chặn, giá giữ nguyên, có audit) | SQL (một cổng duy nhất, không nhận danh tính/khung/giá hiện hành từ client): `G:296-364` (thứ tự mã chặn), `G:470-503` (mọi nhánh chặn ghi một dòng `CHAN_DE_XUAT` rồi trả về bình thường), `G:301-304` (`LIEN_KET_KHONG_HOP_LE`), `G:336-339` (`NGOAI_KHUNG_GIA`), `G:343-345` (`VUOT_BIEN_DO`). pgTAP: `PR:1616` `B9: below floor -> BI_CHAN NGOAI_KHUNG_GIA`; `PR:1618` `B9: above ceiling -> BI_CHAN NGOAI_KHUNG_GIA`; `PR:1620` `B9: exceeds max swing -> BI_CHAN VUOT_BIEN_DO`; `PR:1664` `B9: all 9 blocked PriceGuard calls wrote matching CHAN_DE_XUAT audit rows with nhatKyId`; `PR:1676-1680` (`PriceGuard never mutates KHU_VUC.GiaVeNiemYet`, không có dòng `NHAT_KY_GIA`); `PR:1509-1510` `B9: 42501 permission rejections write no CHAN_DE_XUAT audit rows`. Mock: `MOCK:463` `bị chặn là kết quả bình thường BI_CHAN kèm một dòng CHAN_DE_XUAT, không tạo đề xuất, không đổi giá`; `MOCK:514` `mã chặn đầu tiên theo thứ tự T3 thắng`. Mọi nguồn gọi RPC này: `SVC:284` `BI_CHAN từ PriceGuard được chuyển tiếp nguyên vẹn cho từng khu`, `CYC:330` `kết quả DA_LUU và BI_CHAN được báo riêng từng khu`. | Mock/dịch vụ/script: `gate`. SQL: `cần db:test`. **Điểm lệch:** lỗi quyền `42501` không có dòng audit trong CSDL (chỉ `RAISE LOG`), xem mục 3.6 và R-05 |

### 1.1 AC ngoài phạm vi W2

Các AC dưới đây **không** thuộc W2; không gán trạng thái đạt/chưa đạt nào ngoài "ngoài phạm vi W2":

| Mã AC | Trạng thái |
|---|---|
| AC-T2-01.1 đến AC-T2-01.9 (OTP) | ngoài phạm vi W2 |
| AC-T2-02.1 đến AC-T2-02.7 (giới hạn 4 vé) | ngoài phạm vi W2 |
| AC-T4-03.1 đến AC-T4-03.4 (duyệt/từ chối, hai BTC duyệt cùng lúc, 403) | ngoài phạm vi W2 (không có `duyet_de_xuat_gia`/`tu_choi_de_xuat_gia` trong 3 migration; thuộc W3) |
| AC-T4-04.1 (giá chốt khi giữ chỗ) | ngoài phạm vi W2 (không migration nào sửa `tao_giu_cho_theo_suat`) |
| Mọi giao diện BTC/khán giả, màn hình chạy ngay, Realtime giá | ngoài phạm vi W2 |
| `pg_cron` | ngoài phạm vi W2 (chu kỳ chạy bằng script Node) |

## 2. Thay đổi CSDL

### 2.1 Ba migration mới, theo thứ tự áp dụng (theo tên file)

1. `supabase/migrations/20261113090000_sprint2_pricing_rpc.sql` (T2): bảng `NHAT_KY_DINH_GIA`, hàm quyền, hàm mở bán theo suất, `lay_so_lieu_dinh_gia`, `luu_quy_tac_gia`.
2. `supabase/migrations/20261113093000_sprint2_pricing_guard.sql` (T3): chỉ mục duy nhất từng phần cho PENDING, `luu_de_xuat_gia`, `het_han_de_xuat_gia`.
3. `supabase/migrations/20261113100000_sprint2_demand_simulator.sql` (T4): bảng `MO_PHONG_GHE`, `mo_phong_nhu_cau`.

Cả ba mốc lớn hơn `20261112110000` (migration W1 cuối). Cả ba là file mới, chỉ `CREATE ... IF NOT EXISTS`/`CREATE OR REPLACE`/`DROP ... IF EXISTS` trên đối tượng của chính nó; không sửa migration cũ (chưa xác nhận bằng `git diff --name-status`, xem R-10).

### 2.2 Bảng, ràng buộc, chỉ mục, chính sách, trigger

| Đối tượng | Chi tiết | Dòng |
|---|---|---|
| Bảng `public."NHAT_KY_DINH_GIA"` | PK `NhatKyDinhGiaID BIGINT GENERATED BY DEFAULT AS IDENTITY`; 20 cột (đếm lại từng dòng khai báo `R:177-196`, gồm khóa chính; tổng 20, không phải 21) gồm `LoaiHanhDong`, ID đã xác minh (`KhuVucID`, `SuatDienID`, `SuKienID`, `QuyTacGiaID`, `DeXuatID`), ID đầu vào thô (`KhuVucIDDauVao`, `DeXuatIDDauVao`), `NguoiThucHienID UUID`, `VaiTroXacThuc`, `VaiTroToChuc`, `ThoiGian`, `DuLieuTruoc/Sau JSONB`, `GiaHienHanh`, `GiaThu`, `ThamSo JSONB`, `MaChan`, `LyDo`. **Không có khóa ngoại, không có UNIQUE** | R:176-228 |
| CHECK `chk_nhatky_dinhgia_loai_hanh_dong` | `LoaiHanhDong IN ('TAO_QUY_TAC','CAP_NHAT_QUY_TAC','HET_HIEU_LUC_DO_DOI_KHUNG','CHAN_DE_XUAT')` | R:197-204 |
| CHECK `chk_nhatky_dinhgia_chan_de_xuat` | `CHAN_DE_XUAT` bắt buộc `MaChan` không rỗng | R:205-208 |
| CHECK `chk_nhatky_dinhgia_het_hieu_luc` | `HET_HIEU_LUC_DO_DOI_KHUNG` bắt buộc `DeXuatID`, `KhuVucID`, `DuLieuTruoc`, `DuLieuSau`, `LyDo` không rỗng | R:209-219 |
| CHECK `chk_nhatky_dinhgia_quy_tac` | `TAO_QUY_TAC`/`CAP_NHAT_QUY_TAC` bắt buộc `KhuVucID`, `SuKienID`, `DuLieuSau` | R:220-227 |
| Chỉ mục | `idx_nhatky_dinhgia_sukien` (`SuKienID`), `idx_nhatky_dinhgia_khuvuc` (`KhuVucID`), `idx_nhatky_dinhgia_dexuat` (`DeXuatID`), đều không UNIQUE | R:230-237 |
| RLS + ACL `NHAT_KY_DINH_GIA` | `ENABLE ROW LEVEL SECURITY`; `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM PUBLIC, anon, authenticated`; `REVOKE SELECT ... FROM PUBLIC, anon`; `GRANT SELECT ... TO authenticated` | R:239-243 |
| Policy `Thanh vien to chuc doc nhat ky dinh gia` | `FOR SELECT TO authenticated`; `"SuKienID" IS NOT NULL` và tồn tại `SU_KIEN` khớp `SuKienID` với `la_thanh_vien_to_chuc(sk."ToChucID")` | R:247-260 |
| Hàm trigger `public.chan_sua_xoa_nhat_ky_dinh_gia() RETURNS TRIGGER` | `LANGUAGE plpgsql SECURITY INVOKER SET search_path = public`; luôn `RAISE EXCEPTION 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep %', TG_OP USING ERRCODE = '42501'`; `REVOKE ALL ... FROM PUBLIC, anon, authenticated` | R:262-275 |
| Trigger `trg_chan_sua_xoa_nhat_ky_dinh_gia` | `BEFORE UPDATE OR DELETE ... FOR EACH ROW` | R:277-281 |
| Trigger `trg_chan_truncate_nhat_ky_dinh_gia` | `BEFORE TRUNCATE ... FOR EACH STATEMENT` (cùng hàm) | R:283-287 |
| Chỉ mục `uq_de_xuat_gia_pending_khu_vuc` | `CREATE UNIQUE INDEX IF NOT EXISTS ... ON public."DE_XUAT_GIA" ("KhuVucID") WHERE "TrangThaiDuyet" = 'PENDING'`. Khi áp dụng migration, trước đó khối `DO` dừng migration (`23505`) nếu đã có khu nào có hơn một PENDING, không tự sửa dữ liệu (`G:86-91`). Khi chạy RPC, vi phạm chỉ mục này → `DA_CO_PENDING`, lỗi unique khác bị ném lại (xem 2.4) | G:72-97 |
| Bảng `public."MO_PHONG_GHE"` | PK `GheID BIGINT`, `SuKienID`, `SuatDienID`, `KhuVucID`, `KichBan`, `TrangThaiTruoc`, `NgayCapNhatTruoc`, `ThoiDiemGiaLap`, `NgayTao`; **không có khóa ngoại** (để việc đồng bộ ghế không bị chặn). CHECK `chk_mo_phong_ghe_kich_ban` (`ban_nhanh`/`ban_cham`/`ban_deu`), `chk_mo_phong_ghe_truoc` (`TrangThaiTruoc = 'TRONG'`) | S:95-112 |
| Chỉ mục `idx_mo_phong_ghe_sukien` | `("SuKienID", "SuatDienID")` | S:114-115 |
| RLS + ACL `MO_PHONG_GHE` | `ENABLE ROW LEVEL SECURITY`; `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; không có policy nên client không đọc/ghi được; chỉ hàm `SECURITY DEFINER` đụng tới | S:117-119 |

Không thêm cột mới vào bảng cũ, không đổi `chk_trang_thai_duyet`, `chk_loai_canh_bao`, `chk_loai_bien_dong`, không đổi khóa ngoại của `NHAT_KY_GIA` (xem 3.1, 3.3).

### 2.3 Chữ ký đầy đủ của mọi hàm

Tất cả `SECURITY DEFINER SET search_path = public`; `REVOKE ALL ... FROM PUBLIC, anon`; `GRANT EXECUTE ... TO authenticated, service_role` (trừ hàm trigger ở 2.2). Danh tính chỉ lấy từ `auth.uid()`/`auth.role()`, không có tham số danh tính.

1. `public.co_quyen_dinh_gia(p_su_kien_id INT) RETURNS BOOLEAN` — `LANGUAGE sql STABLE`. `R:292-318`. TRUE khi `auth.role() = 'service_role'`, hoặc người gọi có `auth.uid()` là thành viên tổ chức sở hữu sự kiện với `HO_SO_NGUOI_DUNG.LoaiTaiKhoan IN ('ORGANIZER','ADMIN')` và `VaiTro IN ('CHU_SO_HUU','QUAN_TRI')`. Không có JWT thì FALSE.
2. `public.suat_dien_dang_mo_ban(p_su_kien_id INT, p_suat_dien_id BIGINT) RETURNS BOOLEAN` — `LANGUAGE plpgsql STABLE`. `R:323-365`. Gọi `co_quyen_dinh_gia` trước, không có quyền thì `42501` (`R:336`). `service_role`: tham số NULL (`R:341-343`) hoặc không có dòng (`R:360`) thì FALSE. `authenticated` có quyền với sự kiện: `p_suat_dien_id` NULL hoặc suất không tồn tại/không thuộc sự kiện thì FALSE. `authenticated` với `p_su_kien_id` NULL hoặc sự kiện không tồn tại thì `42501`. Không có `P0002`.
3. `public.lay_so_lieu_dinh_gia(p_su_kien_id INT) RETURNS TABLE (khu_vuc_id INT, suat_dien_id BIGINT, su_kien_id INT, ma_khu_vuc VARCHAR(50), ten_khu_vuc VARCHAR(150), trang_thai_suat VARCHAR(30), thoi_gian_mo_ban TIMESTAMPTZ, thoi_gian_dong_ban TIMESTAMPTZ, thoi_gian_bat_dau TIMESTAMPTZ, dang_mo_ban BOOLEAN, gia_hien_hanh NUMERIC(15,2), quy_tac_gia_id BIGINT, co_quy_tac BOOLEAN, kich_hoat BOOLEAN, gia_goc NUMERIC(12,2), gia_san NUMERIC(12,2), gia_tran NUMERIC(12,2), buoc_nhay NUMERIC(12,2), bien_do NUMERIC(5,4), nguong_thap NUMERIC(5,4), nguong_cao NUMERIC(5,4), trong_so_lap_day NUMERIC(5,4), trong_so_toc_do NUMERIC(5,4), trong_so_thoi_gian NUMERIC(5,4), n_total INT, n_sold INT, n_hold INT, so_ban_6h INT, v_actual NUMERIC, t_rem_gio NUMERIC, tong_gio_mo_ban NUMERIC, v_target NUMERIC, de_xuat_pending_id BIGINT, co_pending BOOLEAN, mo_phong BOOLEAN, thoi_diem_tinh TIMESTAMPTZ)` — `LANGUAGE plpgsql STABLE`. `R:370-528`. Gộp số liệu từng khu bằng các truy vấn `LATERAL` riêng cho `GHE` và `CHI_TIET_GIU_CHO` (không JOIN chéo hai bảng); không có quyền thì `42501` (`R:417`), gồm `authenticated` với `p_su_kien_id` NULL hoặc sự kiện không tồn tại; `p_su_kien_id` NULL hoặc sự kiện không tồn tại với `service_role` trả tập rỗng (không `P0002`).
4. `public.luu_quy_tac_gia(p_khu_vuc_id INT, p_gia_goc NUMERIC, p_gia_san NUMERIC, p_gia_tran NUMERIC, p_buoc_nhay_gia NUMERIC, p_bien_do_toi_da NUMERIC, p_nguong_lap_day_thap NUMERIC, p_nguong_lap_day_cao NUMERIC, p_trong_so_lap_day NUMERIC, p_trong_so_toc_do_ban NUMERIC, p_trong_so_thoi_gian NUMERIC, p_trang_thai_kich_hoat BOOLEAN) RETURNS JSONB` — `LANGUAGE plpgsql VOLATILE`. `R:544-897`. Kết quả: `{quyTacGiaId, khuVucId, suatDienId, suKienId, taoMoi, canhBao:[{ma:'GIA_HIEN_HANH_NGOAI_KHUNG', giaHienHanh, giaSan, giaTran}], deXuatHetHieuLuc:[DeXuatID tăng dần], nhatKyId}` (`R:877-886`).
5. `public.luu_de_xuat_gia(p_khu_vuc_id INT, p_quy_tac_gia_id BIGINT, p_quy_tac_ngay_cap_nhat TIMESTAMPTZ, p_gia_de_xuat NUMERIC, p_gia_tinh_toan_tho NUMERIC, p_ly_do TEXT) RETURNS JSONB` — `LANGUAGE plpgsql VOLATILE`. `G:102-512`. Đã lưu: `{ketQua:'DA_LUU', deXuatId, khuVucId, suKienId, giaDeXuat, giaHienTai, loaiCanhBao, moPhong, deXuatHetHan:[ids]}` (`G:451-461`). Bị chặn: `{ketQua:'BI_CHAN', maChan, nhatKyId, deXuatHetHan:[ids]}` (`G:498-503`).
6. `public.het_han_de_xuat_gia(p_su_kien_id INT) RETURNS JSONB` — `LANGUAGE plpgsql VOLATILE`. `G:523-605`. Kết quả `{suKienId, deXuatHetHan:[ids], soLuong}` (`G:596-600`); sự kiện không tồn tại với `service_role` trả danh sách rỗng, `soLuong = 0`; NULL luôn `42501`.
7. `public.mo_phong_nhu_cau(p_su_kien_id INT, p_kich_ban TEXT) RETURNS JSONB` — `LANGUAGE plpgsql VOLATILE`. `S:124-505`. Thành công: `{ketQua:'DA_MO_PHONG', nhan:'MO_PHONG', moPhong:true, kichBan, suKienId, thoiDiemNeo, suatDaMoPhong, suatBoQua, khuVuc:[{khuVucId, suatDienId, ghiMoi, datLai, boQuaDangGiu, khongCoGhe, biKepVaoCuaSo6h}], datLai:{tong, boQuaDaThayDoi, boQuaDangKhoa, chuaDatLai}}` (`S:484-500`). Không có suất mở bán: `{ketQua:'KHONG_CO_SUAT_HOP_LE', nhan, moPhong, kichBan, suKienId, suatBoQua}` và không ghi gì (`S:264-273`).

### 2.4 Hợp đồng mã lỗi và kết quả bị chặn

Lỗi (ném bằng `RAISE EXCEPTION`, giao dịch bị hủy):

| Mã | Khi nào | Nguồn |
|---|---|---|
| `42501` | Người gọi không qua `co_quyen_dinh_gia` (vai trò `BIEN_TAP`, `VAN_HANH`, `SOAT_VE`, khán giả, tổ chức khác, `anon`). Với người gọi không phải `service_role`, khu vực/sự kiện không tồn tại hoặc đã đổi liên kết cũng trả `42501` (chống dò sự tồn tại). Cũng do trigger bất biến ném khi UPDATE/DELETE/TRUNCATE `NHAT_KY_DINH_GIA` | R:336-339, 417-420, 612-624, 733-740; G:176-194, 210-219, 540-545; S:184-197; R:269-271 |
| `P0002` | **Chỉ ba RPC ghi**, và chỉ với `service_role` (người gọi khác nhận `42501`). `luu_quy_tac_gia`: khu vực không tồn tại (`R:615`, tra không khóa `R:604-614`) hoặc không còn tồn tại/đã đổi liên kết dưới khóa (`R:736`). `luu_de_xuat_gia`: khu vực không tồn tại (`G:179`) hoặc không còn tồn tại/đã đổi liên kết dưới khóa (`G:213`). `mo_phong_nhu_cau`: **sự kiện** không tồn tại (`S:187`, tra không khóa; `S:222`, kiểm lại khi khóa `SU_KIEN`) | R:615, 736; G:179, 213; S:187, 222 |
| `22023` | `luu_quy_tac_gia`: `QUY_TAC_GIA_KHONG_HOP_LE: <tên tham số>` kèm `DETAIL` nêu tham số. `mo_phong_nhu_cau`: `KICH_BAN_KHONG_HOP_LE` | R:646-719; S:173-177 |
| `55000` | `mo_phong_nhu_cau`: `MO_PHONG_CHUA_BAT` khi `TuyChonMoRong->>'moPhong'` khác đúng `'true'` (kiểm lại dưới khóa) | S:207-211, 241-245 |
| `23505` | Hai trường hợp tách biệt. (a) Áp dụng migration T3: khối `DO` dừng với `23505` nếu dữ liệu cũ đã có nhiều PENDING cùng một khu (`G:86-91`). (b) Gọi RPC `luu_de_xuat_gia`: `G:428-437` bắt `unique_violation` và đọc `CONSTRAINT_NAME`; chỉ `uq_de_xuat_gia_pending_khu_vuc` được ánh xạ sang kết quả chặn nghiệp vụ `DA_CO_PENDING` (nhánh từ `G:440`); mọi lỗi unique khác, ví dụ khóa chính `DeXuatID`, bị `RAISE` lại (`G:436`), client nhận `23505`, toàn bộ giao dịch rollback và không có dòng audit nào được ghi (chú thích `G:429-431`) | G:86-91; G:428-437 |

**Ba hàm không có `P0002`** (không ném lỗi "không tồn tại"):
- `het_han_de_xuat_gia` (`G:540-600`): chỉ kiểm quyền qua `co_quyen_dinh_gia` (`G:540`). Với `service_role`, `co_quyen_dinh_gia` luôn TRUE (`R:300`), nên sự kiện không tồn tại làm vòng `FOR` (`G:548-561`) không có dòng nào và hàm trả `{suKienId, deXuatHetHan: [], soLuong: 0}` (`G:596-600`), không ném lỗi. Với `authenticated`, sự kiện không tồn tại cho `42501`; `p_su_kien_id` NULL luôn cho `42501` (`G:540`), kể cả `service_role`.
- `lay_so_lieu_dinh_gia` (`R:417-424`): `42501` khi không có quyền (`R:417`), gồm `authenticated` với `p_su_kien_id` NULL hoặc sự kiện không tồn tại (`co_quyen_dinh_gia` trả FALSE, `R:300-303`). Khi `p_su_kien_id` NULL hoặc sự kiện không tồn tại mà người gọi là `service_role`, hàm trả tập rỗng (`R:422-424`; truy vấn không ra dòng), không có `P0002`.
- `suat_dien_dang_mo_ban` (`R:336-360`): `42501` khi `co_quyen_dinh_gia` trả FALSE (`R:336`). `service_role`: FALSE khi `p_su_kien_id` hoặc `p_suat_dien_id` NULL (`R:341-343`) và khi không có dòng (`R:360`). `authenticated` có quyền với sự kiện: `p_suat_dien_id` NULL, hoặc suất không tồn tại/không thuộc sự kiện đó, trả FALSE. `authenticated` với `p_su_kien_id` NULL hoặc sự kiện không tồn tại: `42501` (`R:300-303`, `R:336`), không phải FALSE.

Không có `40001`/409 và không có mã duyệt/từ chối trong W2 (thuộc W3).

Kết quả chặn nghiệp vụ của `luu_de_xuat_gia` là **trả về bình thường** (không `RAISE` sau khi ghi audit), để dòng audit không bị rollback (`G:465-468`). Client phải rẽ nhánh theo `ketQua`. Mã chặn, theo thứ tự "mã đầu tiên thắng", đều tính dưới khóa:

`QUY_TAC_KHONG_TON_TAI` (`G:296`) → `LIEN_KET_KHONG_HOP_LE` (`G:301`) → `QUY_TAC_DA_THAY_DOI` (`G:306`) → `QUY_TAC_TAT` (`G:311`) → `SUAT_DIEN_KHONG_MO_BAN` (`G:316-323`) → `GIA_KHONG_HOP_LE` (`G:325`) → `GIA_HIEN_HANH_KHONG_HOP_LE` (`G:330`) → `NGOAI_KHUNG_GIA` (`G:336`) → `VUOT_BIEN_DO` (`G:343`) / `DUOI_BUOC_NHAY` (`G:346`) → `DA_CO_PENDING` (`G:352-364`, cũng khi chỉ mục duy nhất từ chối chèn đồng thời, `G:428-449`) → `THIEU_DU_LIEU` (`G:367-393`). Các kiểm tra thuần theo giá chạy trước kiểm tra dữ liệu thị trường (`G:39`).

## 3. Giải thích

### 3.1 Giữ nguyên enum audit W1; dùng `NHAT_KY_DINH_GIA` cho cấu hình và chặn

- `NHAT_KY_GIA` (W1) bị giới hạn bởi `chk_loai_bien_dong` chỉ có `KHOI_TAO`, `DUYET_DE_XUAT_AI`, `DIEU_CHINH_THU_CONG` (`20261112090000_sprint2_pricing_tables.sql:117`), `GiaCu`, `GiaMoi`, `LyDoThayDoi` đều `NOT NULL` (dòng 109-112), `DeXuatID UNIQUE` (dòng 107, một dòng mỗi đề xuất) và khóa ngoại `RESTRICT` (dòng 105, 107, 115). Đó là hợp đồng của W1: một dòng ghi nhận một lần **áp dụng giá**.
- Cấu hình quy tắc, thu hẹp khung và chặn đề xuất không phải là áp dụng giá, có thể lặp nhiều lần mỗi đề xuất/khu, có thể thiếu giá, và đầu vào có thể không hợp lệ. Vì vậy W2 không mở rộng enum W1, không ghi dòng "giả" vào `NHAT_KY_GIA` (`R:124-126`, `G:50-51`) mà thêm bảng riêng `NHAT_KY_DINH_GIA` với bốn loại hành động (`R:197-204`).
- Hệ quả: hợp đồng W1 giữ nguyên, `NHAT_KY_GIA` vẫn dành cho W3 ghi lúc duyệt.

### 3.2 ACL/RLS và bất biến của bảng mới

- `NHAT_KY_DINH_GIA`: RLS bật, client không có INSERT/UPDATE/DELETE/TRUNCATE (`R:241`), `anon` không có SELECT (`R:242`), `authenticated` chỉ SELECT qua policy (`R:243`, `R:248-260`). Policy dùng `la_thanh_vien_to_chuc` nên mọi vai trò thành viên đọc được, kể cả `VAN_HANH` (pgTAP `PR:571` `VAN_HANH member reads the audit rows of its event`); khán giả và tổ chức khác thì không (`PR:577`, `PR:580`). Ghi chỉ qua các hàm `SECURITY DEFINER`.
- Bất biến: trigger chặn UPDATE/DELETE theo dòng và TRUNCATE theo câu lệnh (`R:277-287`), áp dụng cả với `service_role` và superuser (không có cơ chế bypass). pgTAP: `PR:117-122` (có hai trigger, hàm trả `trigger`), `PR:533-539` (`DELETE`/`TRUNCATE` bị `42501`), `PR:542-543` (`service_role` còn quyền bảng UPDATE/DELETE, bị chặn bởi trigger chứ không bởi ACL), `PR:552-554`. Đây là bất biến mức dòng cho vai trò thông thường; người có quyền `DROP/DISABLE TRIGGER` vẫn qua được. Khác W1: W2 đã thêm trigger `BEFORE TRUNCATE` cho `NHAT_KY_DINH_GIA`; `NHAT_KY_GIA` không bị W2 đụng tới.
- `MO_PHONG_GHE`: chỉ sổ sách nội bộ của simulator, client không có quyền gì (`S:117-119`, khẳng định lúc migrate `S:528-531`).
- Cuối mỗi migration có khối `DO $$` tự kiểm ACL/RLS/SECURITY DEFINER (`R:902-1017`, `G:610-669`, `S:510-533`); chúng chạy khi áp dụng migration, chưa được chạy trong phiên này.

### 3.3 Hợp đồng ID lịch sử không có khóa ngoại

- Ba cột ID lịch sử (`KhuVucID`, `SuKienID`, `DeXuatID`) cùng `SuatDienID`, `QuyTacGiaID`, `NguoiThucHienID` được lưu **không có khóa ngoại và không UNIQUE** (`R:127-135`, bảng ở `R:176-195`; tự kiểm lúc migrate `R:961-968`). Chọn thế để audit tồn tại độc lập với dữ liệu mà người tổ chức có thể xóa.
- Liên kết do **máy chủ xác minh khi ghi**: trước khi ghi, RPC tra `KHU_VUC` join `SUAT_DIEN` bảo đảm `sd.SuKienID = kv.SuKienID`, rồi tra lại dưới khóa (`R:604-610`, `R:722-731`; `G:168-174`, `G:199-208`). ID xác minh chỉ lấy từ quan hệ thật; ID đầu vào bị từ chối hoặc không xác minh được đi vào `KhuVucIDDauVao`/`DeXuatIDDauVao` (`R:136-150`).
- **Audit không cản các nhánh organizer xóa khu đủ điều kiện** tại `supabase/migrations/20261028100000_schema_timeline_cleanup_and_explicit_relationships.sql`:
  - `:517-519` `DELETE FROM public."KHU_VUC" WHERE "SuatDienID" = v_show_id AND "SuKienID" = v_event_id AND NOT ("KhuVucID" = ANY(v_show_retained_tier_ids))` (xóa khu bị bỏ khỏi suất được giữ);
  - `:560-565` `DELETE FROM public."KHU_VUC" WHERE "SuatDienID" IN (SELECT "SuatDienID" FROM public."SUAT_DIEN" WHERE "SuKienID" = v_event_id AND NOT ("SuatDienID" = ANY(v_retained_show_ids)))` (xóa khu của suất bị bỏ).
  
  Vì `NHAT_KY_DINH_GIA` không trỏ khóa ngoại tới `KHU_VUC`, hai câu lệnh này không bị chặn bởi bảng audit W2. `QUY_TAC_GIA` và `DE_XUAT_GIA` của khu bị xóa đi theo `ON DELETE CASCADE` (W1).
- **Bằng chứng T2/T5:** hợp đồng ở `R:129-135`. pgTAP: `PR:709-716` (khu bị bỏ bị xóa, quy tắc và đề xuất bị cascade), `PR:719-738` (`A9(i): no audit row was added or removed`, `all audit history IDs are unchanged`, `audit DeXuatID/KhuVucID references are unchanged`, `full audit rows ... match snapshot`), `PR:772-801` (cùng kiểm cho `A9(ii)`: bỏ cả suất), `PR:818-826` (`the event with a priced zone can be deleted (audit has no FK)`, `the audit row of the deleted event still exists`). Mọi khẳng định này **chưa chạy** (`cần db:test`).
- **Policy đọc qua `SuKienID` đã lưu:** `R:248-260` chỉ phụ thuộc `SuKienID` → `SU_KIEN` → `la_thanh_vien_to_chuc`, nên khi khu hoặc đề xuất bị xóa, thành viên vẫn đọc được audit (`PR:743-746` và `PR:806-809` `org member still reads all audit rows through SuKienID`; tổ chức khác không đọc được, `PR:747-750`). Nếu `SU_KIEN` bị xóa thì dòng audit **vẫn còn** nhưng `authenticated` **không đọc được** (`PR:830-832` `authenticated cannot read the audit row of a deleted event`); chỉ `service_role`/chủ bảng thấy. Dòng có `SuKienID` NULL (không xác minh được) cũng chỉ `service_role` thấy (`R:141-142`).
- **Giới hạn không được nói quá:** `NHAT_KY_GIA` của W1 vẫn `ON DELETE RESTRICT` trên `KhuVucID`, `DeXuatID`, `NguoiThucHienID` (`20261112090000_sprint2_pricing_tables.sql:99-107,115`, ghi chú cố ý ở dòng 99-102 nói rõ chúng chặn RPC lưu sơ đồ). W2 **không** sửa việc đó. Do đó **không** được tuyên bố "mọi khu đều xóa được": khu đã có dòng `NHAT_KY_GIA` (sau khi W3 duyệt giá) vẫn không xóa được. Fixture pgTAP chỉ chứng minh trường hợp khu **chưa có** `NHAT_KY_GIA` (`PR:673-675` `fixture: the zones have no NHAT_KY_GIA rows`). Xem R-07.

### 3.4 Rollback khi báo lỗi

- `luu_quy_tac_gia`: mọi kiểm tra đầu vào (`R:626-719`) và kiểm tra quyền (`R:603-624`) xảy ra **trước** mọi ghi; ghi quy tắc (`R:764-790`), chuyển PENDING sang EXPIRED (`R:793-801`) và các dòng audit (`R:833-875`) nằm trong cùng một lần gọi hàm, tức cùng giao dịch. Lỗi `22023`/`42501`/`P0002` không để lại gì: pgTAP `PR:328-331` (`invalid inputs created no rule`, `invalid inputs wrote no audit row`), `PR:426` (`rejected configuration wrote no audit row (only the initial TAO_QUY_TAC exists)`). Rollback toàn phần khi lỗi xảy ra **giữa chừng sau khi đã ghi** là tính chất của giao dịch PostgreSQL; **không có** khẳng định pgTAP cố ý gây lỗi giữa chừng.
- `luu_de_xuat_gia`: chặn nghiệp vụ là kết quả trả về bình thường sau khi ghi audit (`G:465-503`), nên dòng `CHAN_DE_XUAT` được commit cùng giao dịch gọi. Ngược lại lỗi quyền `42501` bị rollback, nên **không có dòng audit trong CSDL**, chỉ `RAISE LOG` (`G:53-54`, `G:181-184`, `G:188-193`; pgTAP `PR:1509-1510`).
- `luu_de_xuat_gia`, lỗi `23505`: `G:428-437` bắt `unique_violation`; chỉ `uq_de_xuat_gia_pending_khu_vuc` thành chặn nghiệp vụ `DA_CO_PENDING` (nhánh từ `G:440`, trả về bình thường và có audit). Lỗi unique khác (ví dụ khóa chính `DeXuatID`) được `RAISE` lại (`G:436`): client nhận `23505`, toàn bộ giao dịch rollback, không có dòng audit (chú thích `G:429-431`). Riêng `23505` khi áp dụng migration T3 (`G:86-91`) là trường hợp khác, xem 2.4.
- `mo_phong_nhu_cau`: mọi cổng từ chối trước khi ghi (`S:20-32` hợp đồng; mã `S:173-273`); pgTAP `PR:1963` `B12: simulator rejections leave all seats TRONG`.

### 3.5 Thứ tự khóa chung

Hợp đồng ở `R:63-71`: tra cứu không khóa và gọi `co_quyen_dinh_gia` trước; rồi khóa theo thứ tự `KHU_VUC` (`FOR UPDATE`, nhiều khu thì tăng dần `KhuVucID`) → `QUY_TAC_GIA FOR UPDATE` → `DE_XUAT_GIA FOR UPDATE ORDER BY "DeXuatID"`; xác minh lại dưới khóa. Cài đặt:
- `luu_quy_tac_gia`: `R:731`, `R:747`, `R:757-758`.
- `luu_de_xuat_gia`: `G:208`, `G:227`, `G:237-238`.
- `het_han_de_xuat_gia`: `G:559-560` (khu tăng dần), `G:566-570` (quy tắc tăng dần theo khu), `G:579-580`.
- `mo_phong_nhu_cau` (cùng thứ tự với `dong_bo_ghe_su_kien`): sự kiện `FOR NO KEY UPDATE` (`S:214-217`), mọi khu tăng dần `FOR UPDATE` (`S:228-232`), ghế `ORDER BY "GheID" ... FOR UPDATE SKIP LOCKED` (`S:303-304`, `S:403-405`).

Khóa theo `KHU_VUC` bảo vệ cả lần tạo quy tắc đầu tiên (`R:763`, `R:68`). **Không có pgTAP nào kiểm tra đồng thời nhiều phiên** (mỗi file chạy trong một giao dịch), nên thứ tự khóa/không bế tắc là `chưa kiểm chứng` ngoài việc đọc mã.

### 3.6 Điều kiện mở bán theo suất

`public.suat_dien_dang_mo_ban(p_su_kien_id, p_suat_dien_id)` (`R:323-365`, vị từ ở `R:345-353`, nhắc lại hợp đồng `R:73-86`): sự kiện `TrangThaiCongBo = 'CONG_KHAI'`, suất có trạng thái không thuộc `BAN_NHAP, HUY, DONG_BAN, DA_DIEN_RA, HET_VE`, `now() >= ThoiGianMoBanVe`, và `ThoiGianDongBanVe` NULL (bán không kỳ hạn) hoặc hữu hạn, sau giờ mở, và `now() <` giờ đóng. Không dùng `SU_KIEN.TrangThaiMoBan`; `SAP_MO_BAN` trong cửa sổ bán vẫn là mở bán. Căn cứ hiện có: RPC giữ chỗ kiểm mở bán theo suất, không theo `DANG_MO_BAN` của sự kiện (`supabase/migrations/20261005090000_product_foundation.sql:413-419`: `TrangThaiCongBo = 'CONG_KHAI'` và `SUAT_DIEN.TrangThai` ở `:413`, `ThoiGianMoBanVe`/`ThoiGianDongBanVe` ở `:416`, `HET_VE` ở `:419`); luồng công bố đặt suất thành `SAP_MO_BAN` và sự kiện thành `CONG_KHAI` (`20261006190000_organizer_event_creation_slice.sql:563-566`). Helper bám đúng các điều kiện đó (`R:345-350`). Dữ liệu thiếu hoặc ±infinity trả FALSE. Mọi nơi dùng chung hàm này: `lay_so_lieu_dinh_gia.dang_mo_ban` (`R:437`), `luu_de_xuat_gia` (`G:318`), `mo_phong_nhu_cau` (`S:254`); mock/script dùng cùng quy tắc (`MOCK:105`, `MOCK:134`; `CYC:791`, `CYC:800`). pgTAP: `PR:941-974` (`SAP_MO_BAN inside sale window counts as open`), `PR:1272-1315` (`SAP_MO_BAN zone inside sale window saves proposal (DA_LUU)`, `SUAT_DIEN_KHONG_MO_BAN` cho `DA_DIEN_RA`, trước giờ mở, `BAN_NHAP` bỏ qua `TrangThaiMoBan` cũ).

### 3.7 Unique PENDING và TTL

- Chỉ mục duy nhất từng phần `uq_de_xuat_gia_pending_khu_vuc` (`G:95-97`) là chốt cuối; kiểm tra `DA_CO_PENDING` ở `G:352-364` chạy trước và chỉ mục xử lý trường hợp đồng thời (`G:428-449`). Quá hạn TTL được hết hạn **trước** kiểm tra trùng (`G:230-249`).
- TTL nghiêm ngặt: đúng 120 phút vẫn PENDING, quá 120 phút (`ThoiGianDeXuat + INTERVAL '120 minutes' < now()`) mới EXPIRED (`G:236`, `G:557`, `G:578`). pgTAP: `PR:1836-1864` (`B11: luu_de_xuat_gia expires 121m PENDING before duplicate check and saves new proposal`, `B11: exact 120m PENDING does NOT expire and still triggers DA_CO_PENDING`, `B11: het_han_de_xuat_gia expires 120m1s (997703) and 121m (997705) only`). Mock: `MOCK:550` `TTL nghiêm ngặt: đúng 120 phút còn PENDING (chặn), 121 phút hết hạn rồi lưu được đề xuất mới`.
- TTL **không có dòng audit** (tập `LoaiHanhDong` bị T2 khóa nên không có loại TTL): dấu vết duy nhất là `TrangThaiDuyet = 'EXPIRED'`, `GhiChuDuyet = 'HET_HAN_TTL_120_PHUT'` (`G:55-58`, `G:246`, `G:589`; `PR:1861-1864` `B11: TTL expiry writes no HET_HIEU_LUC_DO_DOI_KHUNG audit rows`). Xem R-06.

### 3.8 Timestamp của simulator

Trigger W1 `trg_ghi_thoi_diem_doi_trang_thai_ghe` đặt `NgayCapNhatTrangThai = now()` mỗi khi `TrangThai` đổi và vẫn còn hiệu lực. Mỗi ghế được ghi bằng **hai câu lệnh trong một giao dịch**: (1) đổi `TrangThai` (trigger đặt `now()`), (2) câu lệnh thứ hai chỉ đặt cột thời gian trạng thái bằng thời điểm giả lập, không có `TrangThai` trong `SET` nên trigger không chạy (`S:38-43`; mã `S:445-457`; đặt lại `S:309-321`). Thời điểm giả lập luôn trong `[ThoiGianMoBanVe (hoặc neo − 24h), neo]` với neo = `now()` (`S:66-69`, `S:418-432`). Kịch bản: `ban_nhanh` 70% trong 5 giờ gần nhất, `ban_cham` 10% ngoài cửa sổ 6 giờ, `ban_deu` 35% rải đều (`S:66-72`, `S:166-171`). Mỗi lần chạy trước tiên đặt lại chỉ các ghế mô phỏng của chính sự kiện và còn khớp thời điểm đã ghi (`S:50-62`, `S:278-341`); ghế thật đã bán, ghế đang giữ chỗ ACTIVE không bị đụng (`S:45-48`, `S:296-302`, `S:396-402`). Tiền đề demo: suất mở bán ít nhất 7 giờ, nếu không `ban_cham` bị kẹp vào cửa sổ 6 giờ (`S:70-75`, `biKepVaoCuaSo6h`).

### 3.9 Giá sau làm tròn bị PriceGuard từ chối

Engine tính `P_propose` rồi làm tròn theo `S` và kẹp sàn/trần; hai bước sau có thể đẩy giá cuối vượt biên độ `Δ_max` so với giá hiện hành. Engine **không** loại bỏ đề xuất đó mà bật `exceedsMaxChange` kèm cảnh báo `VUOT_BIEN_DO_SAU_LAM_TRON_HOAC_CHAN` (`src/domain/pricingEngine.js:270-273,288`; `ENG:704` `AC6: làm tròn hoặc sàn/trần đẩy giá vượt biên độ giữ nguyên thứ tự bước và bật exceedsMaxChange`, với ca S=70000: bounded 800000 → rounded 770000 → `proposedPrice` vẫn 770000, `ENG:715-719`). Dịch vụ và script chuyển giá đó lên `luu_de_xuat_gia` mà không tự lọc (không có tham chiếu `exceedsMaxChange` trong `pricingServiceCore.js` hay `run-pricing-cycle.mjs`; script gửi `engine.proposedPrice` ở `scripts/run-pricing-cycle.mjs:370`). Máy chủ làm tròn đầu vào về 2 chữ số (`G:281-283`, `v_p := ROUND(p_gia_de_xuat, 2)`) rồi kiểm lại: `v_chenh > v_gia_hien * v_bien_do` → `VUOT_BIEN_DO` (`G:343-345`); chênh nhỏ hơn bước → `DUOI_BUOC_NHAY` (`G:346-348`). Kết quả: có thể xảy ra đề xuất hợp lệ theo engine nhưng bị chặn và ghi `CHAN_DE_XUAT` ở máy chủ; đây là hành vi thiết kế, không phải lỗi. pgTAP kiểm `VUOT_BIEN_DO` bằng ca vượt biên độ thông thường (`PR:1556`, `PR:1620`), **chưa có** ca pgTAP riêng cho giá bị đẩy vượt biên độ **do làm tròn**. Lưu ý lệch nhỏ: engine so sánh có dung sai (`MAX_CHANGE_TOLERANCE`, `pricingEngine.js:270`), SQL so sánh chính xác bằng `NUMERIC` (R-08).

## 4. Hợp đồng kết thúc PENDING ngoài khung (thu hẹp khung)

`luu_quy_tac_gia` khi khung `[GiaSan, GiaTran]` thu hẹp (`R:156-166`):
- Chọn đúng các đề xuất **PENDING** của khu có `GiaDeXuat < GiaSan mới` hoặc `> GiaTran mới` (giá bằng sàn/trần mới vẫn PENDING), khóa `FOR UPDATE ORDER BY "DeXuatID"` (`R:751-761`).
- Chuyển sang **`EXPIRED`** với `GhiChuDuyet = 'CAU_HINH_THU_HEP_KHUNG'`, `NguoiDuyetID = NULL`, `ThoiGianDuyet = NULL` (`R:794-800`); **bỏ qua TTL 120 phút** nên có thể xảy ra trước phút 120; chỉ đụng PENDING, các trạng thái khác giữ nguyên.
- Ghi một dòng audit `HET_HIEU_LUC_DO_DOI_KHUNG` cho mỗi đề xuất, theo `DeXuatID` tăng dần, trong **cùng giao dịch** (`R:846-875`), có `DuLieuTruoc`/`DuLieuSau` mang trạng thái, giá đề xuất và khung cũ/mới (`R:858-868`), và `LyDo` bắt đầu bằng `CAU_HINH_THU_HEP_KHUNG` (`R:870-871`). CHECK `chk_nhatky_dinhgia_het_hieu_luc` ép đủ trường (`R:209-219`).
- Giá hiện hành ngoài khung mới: chỉ trả cảnh báo `GIA_HIEN_HANH_NGOAI_KHUNG`, **không đổi** `GiaVeNiemYet` (`R:803-811`; pgTAP `PR:521-525`, `PR:473-474`).
- **Khác với hết hạn TTL của T3:** `het_han_de_xuat_gia` và bước hết hạn trong `luu_de_xuat_gia` đặt `GhiChuDuyet = 'HET_HAN_TTL_120_PHUT'` và không ghi audit (`G:244-248`, `G:587-592`). Thu hẹp khung dùng mã ghi chú khác và có audit; không lẫn hai loại.
- **Không phải từ chối W3:** không dùng `REJECTED`, không điền người duyệt/thời gian duyệt, **không sửa `chk_trang_thai_duyet`** (vẫn `PENDING/APPROVED/REJECTED/EXPIRED` từ W1). Ánh xạ spec §5 "hủy đề xuất PENDING ngoài khung" ↔ `EXPIRED` + `CAU_HINH_THU_HEP_KHUNG`.
- **Bằng chứng triển khai và đồng nhất mock/pgTAP:**
  - SQL (T2): `R:794-800`, `R:846-875`.
  - pgTAP (T5): `PR:454-456` `out-of-frame PENDING are EXPIRED with CAU_HINH_THU_HEP_KHUNG and NULL approver/time`; `PR:460` `the expired proposal was younger than 120 minutes (narrowing ignores the TTL)`; `PR:435-443` (đúng các đề xuất ngoài khung được báo, đề xuất trong khung không); `PR:484-495`, `PR:498-509` (`DeXuatID ... has exactly 1 HET_HIEU_LUC_DO_DOI_KHUNG audit row with full old/new frame and status`); `PR:512` (đề xuất không bị hết hạn không có dòng audit này).
  - Mock (T6): `src/domain/mockPricing.js:393-402` (cùng điều kiện, `EXPIRED`, `CAU_HINH_THU_HEP_KHUNG`, hai cột NULL), `:427-454` (audit cùng cấu trúc `DuLieuTruoc/DuLieuSau`, `LyDo` cùng mẫu); `MOCK:284` `thu hẹp khung: PENDING ngoài khung chuyển EXPIRED dù chưa đủ TTL; trong khung và bằng sàn/trần được giữ` với `MOCK:300-337` kiểm đúng các giá trị trên (`gate`).
  - Mức đồng nhất: mock và pgTAP cùng chốt một bộ giá trị; việc hai bên khớp nhau chỉ được xác nhận ở phía mock (gate), phía SQL còn `cần db:test`.

## 5. Phạm vi không triển khai trong W2

Giao diện BTC và khán giả (kể cả nút "Chạy ngay", màn hình duyệt, Realtime giá); `duyet_de_xuat_gia`/`tu_choi_de_xuat_gia` và mọi hành vi áp dụng giá (W3; mã `40001`/409 cũng chưa có); OTP (`da_xac_minh_otp()`, cổng 403); giới hạn 4 vé và `VUOT_GIOI_HAN_VE`; `DonGiaChot` trong `tao_giu_cho_theo_suat`; `pg_cron`. Các AC tương ứng ở mục 1.1 không được coi là đạt.

## 6. Tài liệu cần cập nhật (chỉ liệt kê, không tạo/sửa file trong `docs/`)

1. **ERD:** thêm `NHAT_KY_DINH_GIA` (không khóa ngoại, 4 loại hành động) và `MO_PHONG_GHE` (không khóa ngoại); chỉ mục `uq_de_xuat_gia_pending_khu_vuc`; đồng thời bảo đảm ERD đã có ba bảng W1 (`QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA`). Mốc "17 bảng" của spec §7.3 không phải giới hạn cấm thêm bảng (xem mục 7).
2. **Từ điển dữ liệu:** hai bảng mới, ràng buộc CHECK, chỉ mục, chính sách đọc `NHAT_KY_DINH_GIA`, ý nghĩa `MaChan`, `KhuVucIDDauVao`, `DeXuatIDDauVao`, `GhiChuDuyet` (`CAU_HINH_THU_HEP_KHUNG`, `HET_HAN_TTL_120_PHUT`).
3. **Đặc tả Use Case:** UC-T4-01 (thu hẹp khung → `EXPIRED`, cảnh báo giá hiện hành ngoài khung), UC-T4-02 (điều kiện mở bán theo suất thay cho "sự kiện `DANG_MO_BAN`", bỏ qua khu thiếu dữ liệu), UC-T4-05 (PriceGuard: mã chặn, audit `CHAN_DE_XUAT`, lỗi quyền chỉ ghi log).
4. **Sơ đồ tuần tự:** `luu_quy_tac_gia` (khóa khu → quy tắc → đề xuất, audit cùng giao dịch); chu kỳ định giá (`het_han_de_xuat_gia` → `lay_so_lieu_dinh_gia` → engine → `luu_de_xuat_gia` → `DA_LUU`/`BI_CHAN`); `mo_phong_nhu_cau` (hai bước ghi ghế).
5. **Ma trận truy vết:** AC-T4-01.1, 02.1–02.4, 05.1 ↔ migration, hàm, file test ở mục 1, kèm trạng thái `gate`/`cần db:test`/`chưa kiểm chứng`; AC-T4-03.x, 04.1 và OTP/giới hạn vé giữ trạng thái ngoài phạm vi W2.
6. **Test Log:** thêm các test Node mới (pricing-engine, mock-pricing, pricing-service, pricing-cycle; không tính `tests/sprint2-demand-simulator.test.mjs` là bằng chứng, file này phải bị loại bỏ theo R-02) với kết quả do agentkit báo; thêm hai file pgTAP `sprint2_pricing_rpc.sql` (`plan(261)`) và `sprint2_demand_simulator.sql` (`plan(53)`), ghi **chưa chạy** cho tới khi người nghiệm thu chạy `npm run db:test`.

## 7. Rủi ro và điểm mâu thuẫn

### 7.1 Ba khác biệt so với đặc tả (kèm lý do)

**(1) Điều kiện "sự kiện `DANG_MO_BAN`" (spec §5, dòng 89 của `sprint2-spec.md`: "chỉ khi sự kiện `DANG_MO_BAN` và định giá bật") được thay bằng điều kiện mở bán theo suất.**
- Mã: `suat_dien_dang_mo_ban` `R:323-365` (hợp đồng `R:73-86`), dùng ở `G:318`, `S:254`, `R:437`.
- Lý do: lịch bán và kiểm tra giữ chỗ hiện có nằm ở `SUAT_DIEN` (`ThoiGianMoBanVe`, `ThoiGianDongBanVe`, `TrangThai`); luồng công bố đặt `SAP_MO_BAN` (suất trong cửa sổ bán vẫn bán được). Dẫn chứng: RPC giữ chỗ kiểm `TrangThaiCongBo = 'CONG_KHAI'`, `SUAT_DIEN.TrangThai`, `ThoiGianMoBanVe`/`ThoiGianDongBanVe` (`:416`) và `HET_VE` tại `supabase/migrations/20261005090000_product_foundation.sql:413-419`, tức mở bán được kiểm theo suất, không theo `DANG_MO_BAN` của sự kiện; luồng công bố đặt `SUAT_DIEN` thành `SAP_MO_BAN` và `SU_KIEN` thành `CONG_KHAI` tại `supabase/migrations/20261006190000_organizer_event_creation_slice.sql:563-566`; helper `R:345-350` bám đúng hai điều kiện này. Dùng `SU_KIEN.TrangThaiMoBan = 'DANG_MO_BAN'` sẽ loại nhầm suất `SAP_MO_BAN` đang trong cửa sổ bán và không phản ánh lịch từng suất. pgTAP `PR:1315` xác nhận `BAN_NHAP event blocks proposal with SUAT_DIEN_KHONG_MO_BAN (ignores legacy TrangThaiMoBan)`, `PR:974` xác nhận `SAP_MO_BAN` mở. Trạng thái: SQL `cần db:test`; mock `gate` (`MOCK:102-159`).

**(2) Ghi lần bị PriceGuard chặn vào `NHAT_KY_DINH_GIA`, thay cách diễn đạt "`LoaiCanhBao` kèm audit" (spec §1.4, dòng 28).**
- Mã: `G:470-496` (ghi `CHAN_DE_XUAT` + `MaChan`), kết quả `BI_CHAN` `G:498-503`.
- Lý do: tập `LoaiCanhBao` của `DE_XUAT_GIA` chỉ có `BINH_THUONG`, `CHAM_GIA_TRAN`, `CHAM_GIA_SAN` (`20261112090000_sprint2_pricing_tables.sql:95`) nên không có loại "bị chặn". `NHAT_KY_GIA` giới hạn loại biến động (`:117`), một dòng mỗi đề xuất (`DeXuatID UNIQUE`, `:107`) và yêu cầu dữ liệu giá áp dụng (`GiaCu`, `GiaMoi`, `LyDoThayDoi` NOT NULL, `:109-112`), nên không phù hợp với nhiều lần chặn mỗi khu/đề xuất hoặc đầu vào không hợp lệ (NULL, NaN, tràn cột). Đề xuất bị chặn cũng không có dòng `DE_XUAT_GIA` để gắn `LoaiCanhBao`.

**(3) Bổ sung bảng audit làm ERD cần cập nhật so với mốc "17 bảng" (spec §7.3, dòng 106).**
- Mã: bảng `NHAT_KY_DINH_GIA` `R:176-228`; bảng sổ sách `MO_PHONG_GHE` `S:98-112`.
- Lý do: cần biểu diễn audit cấu hình/chặn mà giữ nguyên hợp đồng W1 của `NHAT_KY_GIA` (mục 3.1). Mốc "17 bảng" là hiện trạng khi viết spec chứ không phải giới hạn cấm thêm bảng; ERD cần cập nhật (mục 6).

### 7.2 Hai điểm bổ sung

**(4) ID lịch sử không có khóa ngoại và giới hạn đọc sau khi xóa sự kiện.** Spec §1.1 chỉ nói "bất biến" cho nhật ký, không quy định cách tham chiếu. Lựa chọn W2 (không FK; liên kết do máy chủ xác minh khi ghi) và hệ quả đọc được sau khi xóa khu/đề xuất nhưng `authenticated` mất quyền đọc khi sự kiện bị xóa được giải thích ở mục 3.3 (`R:127-154`, `PR:818-832`). Đây là đánh đổi có chủ đích; `NHAT_KY_GIA` của W1 vẫn `RESTRICT` (R-07).

**(5) Ánh xạ "hủy PENDING ngoài khung" (spec §5, dòng 88) sang `EXPIRED`.** Spec nói "hủy"; W2 dùng `EXPIRED` + `GhiChuDuyet = 'CAU_HINH_THU_HEP_KHUNG'` + `NguoiDuyetID`/`ThoiGianDuyet` NULL vì `chk_trang_thai_duyet` chỉ có `PENDING/APPROVED/REJECTED/EXPIRED` (W1, không sửa) và `REJECTED` dành cho từ chối của người duyệt (W3). Chi tiết mục 4.

### 7.3 Bảng rủi ro và việc dở dang T1–T8

Không phát hiện việc triển khai migration, pgTAP, engine, mock, dịch vụ và script bị bỏ dở. Tuy nhiên còn **2 sai lệch quy tắc test** cần xử lý: R-02 (T4/T5, vi phạm bắt buộc spec §8) và R-03 (T7/T8, vi phạm trực tiếp spec §0:16 do test `assert.match` trên mã nguồn; cần xử lý, chưa xử lý). R-15 là tồn đọng của W1 (cùng kiểu test đọc `.sql`), không phải việc dở của T1–T8. Riêng biệt, SQL/pgTAP/demo vẫn **chưa kiểm chứng**, và còn một số lệch so với spec. Mọi dòng "cần db:test"/"chưa kiểm chứng" dưới đây là chưa chạy.

| Mã | Task | Rủi ro / việc còn lại | Bằng chứng | Trạng thái | Bước nghiệm thu còn lại |
|---|---|---|---|---|---|
| R-01 | T2, T3, T4, T5 | Ba migration chưa được replay; hai file pgTAP chưa chạy; `npm run check` không chạy SQL | `R:168-171`, `G:64-65`, `S:88-92`; `plan(261)` `PR:37`, `plan(53)` `PS:9` | chưa kiểm chứng (cần db:test) | Người nghiệm thu sau merge: `npm run db:reset`, `npm run db:test`; ghi tên khẳng định lỗi nếu có. Kỳ vọng kế hoạch (không phải kết quả): hai file mới khớp `plan(N)` của chúng |
| R-02 | T4/T5 | `tests/sprint2-demand-simulator.test.mjs` đọc văn bản file `.sql` (migration và pgTAP) bằng biểu thức chính quy (dòng 5-6, hàm `stripSqlComments`/`extractFunctionBody` dòng 8-22), vi phạm rõ ràng spec §8 (dòng 115: "Không thêm test Node đọc file .sql rồi assert.match"; Astra phải từ chối loại test này) và trái §0 (dòng 16). Đây là vi phạm quy tắc test bắt buộc ở T4/T5, không phải lựa chọn giữ hay bỏ. Không được tính là bằng chứng. Chưa biết commit nào thêm file này | `tests/sprint2-demand-simulator.test.mjs:5-22` | cần xử lý (qua gate nhưng vi phạm spec) | Phải gỡ bỏ/thay bằng pgTAP `supabase/tests/sprint2_demand_simulator.sql` trước khi nghiệm thu; người nghiệm thu xác nhận file đã bị loại |
| R-03 | T7 (SVC), T8 (CYC) | Đã đọc thân test: `SVC:351-357` dùng `readFile` trên `src/services/pricingService.ts` (`:352`) rồi `assert.doesNotMatch`/`assert.match` (`:353-356`); `SVC:359-369` dùng `readFile` (`:360`), bỏ chú thích (`:361`), `doesNotMatch` (`:362-366`) và đếm khớp regex `throw PricingServiceError` (`:368`); `CYC:835-840` dùng `readFileSync` trên script (`:836`) rồi `!nguon.includes(...)` qua danh sách chuỗi cấm (`:837-838`). Kết luận: đây là test đọc văn bản mã nguồn rồi so khớp, **vi phạm trực tiếp spec §0:16** (cấm test `assert.match` trên mã nguồn): `tests/pricing-service.test.mjs:354-356` dùng `assert.match` trên `src`, và `tests/pricing-cycle.test.mjs:836` `readFileSync` script rồi so văn bản (`:837-838`). Chúng đọc `.ts`/`.mjs` chứ không đọc `.sql`, nên không phạm riêng câu chữ spec §8 dòng 115 về file `.sql`. Phân loại: vi phạm quy tắc test (T7 cho SVC, T8 cho CYC). Bảng mục 1 không dẫn ba test này làm bằng chứng (chỉ dẫn `SVC:284`, `CYC:330`) | `tests/pricing-service.test.mjs:351-369` (trực tiếp `:354-356`); `tests/pricing-cycle.test.mjs:835-840` (trực tiếp `:836`) | chưa xử lý; qua gate nhưng vi phạm spec, không tính là bằng chứng nghiệm thu | Cần làm trong một task sửa sau: thay bằng test hành vi (đã có mock client và bản ghi lời gọi RPC, ví dụ `tenRpc` ở `CYC:827`) hoặc xóa các test tĩnh này. Không chỉ loại khỏi bằng chứng. Người nghiệm thu xác nhận đã xử lý |
| R-04 | T2/T3 | Cờ mô phỏng không nhất quán chữ hoa/thường: `lay_so_lieu_dinh_gia.mo_phong` và `luu_de_xuat_gia` dùng `LOWER(...) = 'true'` (`R:481`, `G:252`) trong khi `mo_phong_nhu_cau` đòi đúng `'true'` (`S:201`, ghi chú cố ý `S:25-27`). Giá trị `"TRUE"` cho nhãn mô phỏng ở đề xuất nhưng simulator từ chối | `R:481`, `G:252`, `S:201` | chưa kiểm chứng; lệch thiết kế đã ghi | Quyết định thống nhất khi W3/lead rà soát; thử với `TuyChonMoRong` viết hoa trên CSDL cục bộ |
| R-05 | T3 | Lỗi quyền `42501` của PriceGuard không có dòng audit trong CSDL, chỉ `RAISE LOG`; spec §2 (dòng 59) liệt "vai trò hợp lệ" trong các điều kiện PriceGuard và yêu cầu ghi audit khi vi phạm. AC-T4-05.1 vì vậy chỉ đủ cho các vi phạm về giá/khung/đề xuất | `G:53-54`, `G:181-193`; `PR:1509-1510` | lệch spec đã ghi; SQL cần db:test | Lead quyết định chấp nhận hay yêu cầu cơ chế audit không bị rollback (ví dụ ghi qua kênh khác) |
| R-06 | T3 | Hết hạn TTL (120 phút) không có dòng audit, trong khi BR-T4-02.7 yêu cầu audit hành động nhạy cảm; dấu vết chỉ là `EXPIRED` + `HET_HAN_TTL_120_PHUT` | `G:55-58`, `G:246`, `G:589`; `PR:1861-1864` | lệch spec đã ghi | Quyết định có thêm loại hành động (cần migration mới) ở đợt sau không |
| R-07 | T2, W1 | `NHAT_KY_GIA` (W1) vẫn `RESTRICT` trên `KhuVucID`/`DeXuatID`/`NguoiThucHienID`: khu đã có dòng áp dụng giá (sau khi W3 duyệt) không xóa được bằng các nhánh `20261028100000:517,560`. W2 không tạo dòng `NHAT_KY_GIA` nên chưa gây chặn; pgTAP chỉ chứng minh khu chưa có `NHAT_KY_GIA` | `20261112090000_sprint2_pricing_tables.sql:99-107,115`; `PR:673-675` | rủi ro mở, chuyển W3 | W3 phải xử lý RPC lưu sơ đồ hoặc chấp nhận thông báo lỗi; không tuyên bố mọi khu đều xóa được |
| R-08 | T1/T3 | Engine so sánh biên độ có dung sai (`MAX_CHANGE_TOLERANCE`), SQL so sánh chính xác `NUMERIC`; giá sát biên có thể bị chặn ở máy chủ dù engine chỉ cảnh báo. Chưa có pgTAP cho ca "giá bị đẩy vượt biên độ do làm tròn" | `pricingEngine.js:270`; `G:343`; `ENG:704`; `PR:1556,1620` | chưa kiểm chứng ở SQL | Thêm ca pgTAP ở đợt sau (nếu lead muốn); demo `--nhanh` quan sát `BI_CHAN` |
| R-09 | T2, T3, T4 | Thứ tự khóa và hai phiên đồng thời (một PENDING mỗi khu, tạo quy tắc đầu tiên, simulator) không có pgTAP đa phiên; chỉ có thiết kế và đọc mã | `R:63-71`, `G:196-249`, `S:34-37` | chưa kiểm chứng | Người nghiệm thu có thể thử hai phiên `psql` nếu cần; không bắt buộc trong W2 |
| R-10 | T2–T4 | Chưa xác nhận bằng `git diff --name-status main...HEAD` rằng `supabase/migrations` chỉ có dòng `A` và không có thay đổi trong `docs/` | – (phiên không chạy được git) | chưa kiểm chứng | Người duyệt chạy `git diff --name-status main...HEAD -- supabase/migrations docs`; kỳ vọng đúng ba dòng `A` migration và không dòng nào dưới `docs/` |
| R-11 | T7 | `src/types/database.types.ts` có kiểu hàm RPC nhưng không có mục bảng cho `NHAT_KY_DINH_GIA`/`MO_PHONG_GHE` (tra theo tên); W3 cần kiểu bảng audit để đọc ở giao diện | `database.types.ts:949,1038,1042` (chỉ hàm) | việc nhỏ chuyển W3, không chặn W2 | W3 đồng bộ kiểu khi làm màn hình xem audit |
| R-12 | T4 | `MO_PHONG_GHE` không có khóa ngoại nên dòng của ghế đã bị xóa chỉ được dọn khi simulator chạy lại cho suất đang mở (`S:326-338`), không có dọn nền | `S:95-96`, `S:326-338` | rủi ro nhỏ, chấp nhận theo thiết kế | Không cần nghiệm thu W2; xem lại nếu bảng phình |
| R-13 | T4, T8 | Demo AC-T4-02.4 (đổi kịch bản → đề xuất đổi hướng) phụ thuộc môi trường: suất mở bán ≥ 7 giờ, sự kiện có `moPhong = true`, người dùng/khóa hợp lệ | `S:70-75`; `CYC` (không thay thế demo thật) | chưa kiểm chứng | Chạy theo mục 8. **Trở ngại đổi hướng:** khu còn PENDING làm engine bỏ qua đề xuất mới (`src/domain/pricingEngine.js:277` thêm `DA_CO_DE_XUAT_PENDING`, nên `shouldPropose = false` ở `:280`); cờ `hasPendingProposal` lấy từ `co_pending` (`src/domain/mockPricing.js:727`; `R:404-405`). Chỉ đổi simulator rồi chạy `--nhanh` chưa đủ: mỗi kịch bản cần fixture tương đương không còn PENDING hiệu lực, hoặc quy trình hợp lệ kết thúc PENDING trước lần chạy kế tiếp (EXPIRED do TTL 120 phút qua `het_han_de_xuat_gia`, hoặc do thu hẹp khung). Không sửa DB tay, không dùng duyệt/từ chối W3. Phân biệt `BO_QUA` (quyết định của engine/script, không gọi lưu, không có dòng audit; `scripts/run-pricing-cycle.mjs:479-481`, `mockPricing.js:693`, `:734`) với `BI_CHAN` (kết quả RPC khi PriceGuard chặn: `maChan`, `nhatKyId`, dòng `CHAN_DE_XUAT`; `G:27`, `G:499`; script `:278`, `:475`) |
| R-14 | T1–T8 | Ánh xạ task ↔ commit chỉ lấy được cho T6–T8 | mục 0 | chưa xác nhận cho T1–T5 | Người duyệt điền SHA từ `git log --oneline main..HEAD` |
| R-15 | W1 (không thuộc T1–T8) | `tests/sprint2-pricing-security.test.mjs` cũng đọc file `.sql` bằng `readFile` rồi `assert.match` (dòng 2, 5, 13, 17-57), nhưng trỏ tới migration W1 `20261112110000_sprint2_pricing_security.sql`, không phải file W2. Spec §8 dòng 115 đã ghi nhận đây là vi phạm của đợt W1. Chưa kiểm được commit thêm file (không có git); nội dung trỏ về migration W1 nên xếp là việc tồn đọng W1, không phải do W2 thêm | `tests/sprint2-pricing-security.test.mjs:2,5,13`; spec §8 dòng 115 | tồn đọng W1, ngoài phạm vi sửa của W2; không dẫn làm bằng chứng | Lead quyết định gỡ/thay bằng pgTAP `supabase/tests/sprint2_pricing_security.sql` (đã có) ở đợt sau |

## 8. Kiểm chứng CSDL và demo dành cho người nghiệm thu sau merge

Board **không** tự chạy các lệnh dưới đây (ngoài cổng `npm run check` do agentkit quản lý). `npm run check` không phải bằng chứng pgTAP đã chạy; ghi chú này không có số lượng khẳng định đạt nào.

1. `npm run db:reset` (áp dụng toàn bộ migration từ đầu, gồm ba file W2; các khối `DO $$` tự kiểm ở cuối mỗi file chạy lúc này).
2. `npm run db:test`. Kỳ vọng: các file cũ cộng `sprint2_pricing_rpc.sql` và `sprint2_demand_simulator.sql` đều khớp `plan(N)` của chúng và không có khẳng định lỗi; nếu lỗi, ghi lại tên khẳng định. Lưu ý khi đọc kết quả: chuỗi lỗi chính xác `NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep DELETE/TRUNCATE` (`PR:534`, `PR:538`) và các khẳng định thời gian phụ thuộc `now()` của fixture (B5, B11, B12).
3. Demo: đặt hai biến môi trường `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` từ `npm run db:status` (không ghi vào file hay log), bật `TuyChonMoRong.moPhong = true` cho sự kiện, chạy `mo_phong_nhu_cau` với từng kịch bản, rồi `node scripts/run-pricing-cycle.mjs --su-kien 1 --nhanh`. Quan sát: đề xuất `ban_nhanh` tăng, `ban_cham` giảm, `LyDoDeXuat` bắt đầu bằng `[MÔ PHỎNG]`, khu bị chặn báo `BI_CHAN` kèm `maChan` và `nhatKyId`.
   - **Điều kiện trước mỗi kịch bản:** khu còn PENDING hiệu lực làm engine bỏ qua (`DA_CO_DE_XUAT_PENDING`, `pricingEngine.js:277`; `hasPendingProposal` ← `co_pending`, `mockPricing.js:727`, `R:404-405`), kết quả là `BO_QUA` chứ không phải đổi hướng. Mỗi kịch bản cần fixture tương đương không còn PENDING hiệu lực, hoặc một quy trình hợp lệ kết thúc PENDING trước lần chạy kế tiếp (EXPIRED do TTL 120 phút qua `het_han_de_xuat_gia`, hoặc do thu hẹp khung). Không sửa DB tay, không dùng duyệt/từ chối W3.
   - **Đọc kết quả:** `BO_QUA` là quyết định của engine/script (không gọi `luu_de_xuat_gia`, không có dòng audit); `BI_CHAN` là kết quả RPC khi PriceGuard chặn (có `maChan`, `nhatKyId`, dòng `CHAN_DE_XUAT` trong `NHAT_KY_DINH_GIA`). Không đếm `BO_QUA` là đổi hướng thành công.
   - Trạng thái: `chưa kiểm chứng`, dành cho người nghiệm thu sau merge.
4. Điền kết quả thật vào Test Log (mục 6). Ghi chú này **không** chứa kết quả chạy nào.

Cổng `npm run check`: do agentkit chạy khi đề xuất bản cuối; không kiểm SQL nên không chứng minh gì về migration hay pgTAP.
