# Ghi chú bàn giao Sprint 2 – Đợt W1 (nền dữ liệu và phân quyền)

Phạm vi W1: chỉ **nền dữ liệu** (3 migration, 2 file pgTAP, đồng bộ kiểu dữ liệu). W1 **không** thêm RPC nghiệp vụ, engine, script hay giao diện, và **không** thêm giao diện. Có một test Node: `tests/sprint2-pricing-security.test.mjs` (T5), chỉ đọc nội dung migration bảo mật dưới dạng văn bản (dạng kiểm tra tĩnh, giòn); kiểm chứng thật là pgTAP.

Trạng thái xác minh của đợt này:
- `npm run check` chỉ chạy TypeScript, test Node và build. Nó **không** chạy SQL, không replay migration, không chạy pgTAP.
- Replay migration và pgTAP **chưa được agent xác minh**. **Đã xác minh sau khi merge (18/11/2026):** `npm run db:reset` áp dụng đủ 3 migration từ đầu không lỗi và `npm run db:test` đạt 8 file, 288 khẳng định (101 cũ + 187 mới).
- Đây là đợt đầu. Ghi chú này không dựa vào kết quả nào của nhánh `sprint2/integration`.
- Phiên viết ghi chú này không có công cụ chạy lệnh nên không chạy được `git diff` / `git log`. Mục 6 vì vậy đối chiếu bằng cách đọc trực tiếp các file; xem giới hạn ở đó.

## 1. Bảng tiêu chí chấp nhận (mã AC theo mục 6 của đặc tả)

Cách đọc: "Phạm vi nền dữ liệu" là phần W1 chỉ hỗ trợ ở mức cột/bảng/ràng buộc. Có cột hoặc bảng **không** có nghĩa là AC nghiệp vụ đã xong. Trạng thái `gate` không dùng cho dòng nào vì W1 không thêm test Node. Số dòng của pgTAP là dòng của khẳng định trong file; chuỗi trong dấu nháy là mô tả khẳng định chép nguyên văn.

`DF` = `supabase/tests/sprint2_data_foundation.sql`; `SEC` = `supabase/tests/sprint2_pricing_security.sql`; `M1` = `20261112090000_sprint2_pricing_tables.sql`; `M2` = `20261112100000_sprint2_ghe_state_time.sql`; `M3` = `20261112110000_sprint2_pricing_security.sql`.

| Mã AC | Phạm vi nền dữ liệu được hỗ trợ | Bằng chứng | Trạng thái |
|---|---|---|---|
| AC-T2-01.1 | Không có. Cần RPC/giao diện OTP | – | chưa kiểm chứng: thuộc đợt sau (OTP) |
| AC-T2-01.2 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-01.3 | Không có (spec §3: Supabase Auth không khóa 15 phút) | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-01.4 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-01.5 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-01.6 | Không có (W1 không lưu hay log OTP, nhưng chưa có luồng OTP để kiểm) | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-01.7 | Không có. Chưa có `da_xac_minh_otp()` và chưa sửa `tao_giu_cho_theo_suat` | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-01.8 | Chỉ cột lưu cờ bật/tắt theo sự kiện: `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP BOOLEAN NOT NULL DEFAULT FALSE`. **Hành vi BTC bật/tắt và cổng chặn chưa làm**, vì RPC và cổng OTP thuộc đợt sau | M1:41-42; DF:188 `YeuCauXacMinhOTP is boolean`; DF:189 `YeuCauXacMinhOTP is NOT NULL`; DF:190 `YeuCauXacMinhOTP has a default`; DF:228-231 `CAU_HINH_SU_KIEN inserted without YeuCauXacMinhOTP defaults to false` | cần db:test (chỉ mức cột tồn tại) |
| AC-T2-01.9 | Không có (giao diện) | – | chưa kiểm chứng: thuộc đợt giao diện |
| AC-T2-02.1 | Không có (giao diện) | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-02.2 | Chưa có kiểm tra trong `tao_giu_cho_theo_suat`. Mới có cột `GIU_CHO.NguoiDungID` để sau này gắn vé với tài khoản, nullable nên chưa có dữ liệu | M1:37-38; DF:183-185; DF:224-227 | chưa kiểm chứng: cột nền có, hành vi từ chối chưa có |
| AC-T2-02.3 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-02.4 | Không có (chưa có khóa advisory trong RPC) | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-02.5 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-02.6 | Không có. Dùng cột `SoVeToiDaMoiDon` sẵn có; chưa có RPC đổi giá trị và chưa có audit | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T2-02.7 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-01.1 | Chỉ ràng buộc CHECK mức bảng `chk_khung_gia_hop_le` (sàn > 0, sàn ≤ gốc ≤ trần). Chưa có RPC lưu, chưa có lỗi theo từng trường | M1:70; DF:282-299 `GiaSan = 0 is rejected`, `GiaSan above GiaGoc is rejected`, `GiaGoc above GiaTran is rejected`; DF:340-343 `floor = base = ceiling is accepted` | chưa kiểm chứng: AC nói về RPC lưu và lỗi theo trường, chưa có |
| AC-T4-02.1 | Không có (cần `pricingEngine.js` và test 4 ví dụ) | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-02.2 | Chưa có. Mới có bảng `DE_XUAT_GIA` với `TrangThaiDuyet` mặc định `PENDING`. **Chưa có ràng buộc DB nào giới hạn một `PENDING` mỗi khu**; việc này dành cho RPC/PriceGuard | M1:75-97; DF:254-260 `DE_XUAT_GIA defaults are PENDING / BINH_THUONG` | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-02.3 | Chỉ CHECK giá trị `LoaiCanhBao` (`BINH_THUONG`, `CHAM_GIA_TRAN`, `CHAM_GIA_SAN`). Chưa có logic cảnh báo | M1:95; DF:366-371 `unknown LoaiCanhBao is rejected`; DF:380-383 `DE_XUAT_GIA accepts CHAM_GIA_SAN / EXPIRED` | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-02.4 | Không có (Demand Simulator). Chỉ có cột `GHE.NgayCapNhatTrangThai` và trigger làm nguồn số liệu tốc độ bán | M2:10-32; DF:458-521 | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-03.1 | Chỉ có bảng `NHAT_KY_GIA` bất biến để RPC duyệt ghi vào sau này. Chưa có RPC duyệt, chưa có Realtime | M1:103-118; M3:88-105; SEC:12-24 | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-03.2 | Không có | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-03.3 | Không có (khóa lạc quan nằm trong RPC) | – | chưa kiểm chứng: thuộc đợt sau |
| AC-T4-03.4 | Chưa có kiểm tra vai trò ghi. W1 chỉ khóa ghi trực tiếp (không ai ghi được qua API) và cho thành viên tổ chức đọc; chưa có phân biệt `CHU_SO_HUU`/`QUAN_TRI` với `VAN_HANH`/`SOAT_VE` | M3:25-35, M3:39-85 | chưa kiểm chứng: thuộc đợt sau (co_quyen_dinh_gia và RPC) |
| AC-T4-04.1 | Chỉ cột lưu giá chốt: `CHI_TIET_GIU_CHO.DonGiaChot NUMERIC(12,2)`, nullable, không default. **Chưa có hành vi giữ giá**, vì `tao_giu_cho_theo_suat` chưa ghi cột này | M1:31-32; DF:178 `DonGiaChot is numeric(12,2)`; DF:179 `DonGiaChot is nullable`; DF:180 `DonGiaChot has no default`; DF:220-223 `CHI_TIET_GIU_CHO inserted without DonGiaChot keeps NULL` | cần db:test (chỉ mức cột tồn tại) |
| AC-T4-05.1 | Chỉ nền audit: bảng `NHAT_KY_GIA` và trigger chặn sửa/xóa. Chưa có PriceGuard trong RPC | M3:88-105; SEC:309 `service_role cannot UPDATE NHAT_KY_GIA`; SEC:324 `postgres cannot UPDATE NHAT_KY_GIA`; DF:834-882 | chưa kiểm chứng: PriceGuard thuộc đợt sau |

Các khẳng định pgTAP nền khác (RLS, ACL, ràng buộc, FK, trigger ghế) hỗ trợ cả nhóm AC ở trên nhưng không làm cho AC nghiệp vụ nào đạt. Chúng cũng ở trạng thái "cần db:test" ở mức nền; xem mục 5.

## 2. Thay đổi CSDL

### 2.1 Ba migration, theo thứ tự áp dụng (theo tên file)

1. `supabase/migrations/20261112090000_sprint2_pricing_tables.sql` – 3 cột nền, 3 bảng giá, bật RLS.
2. `supabase/migrations/20261112100000_sprint2_ghe_state_time.sql` – cột `GHE.NgayCapNhatTrangThai`, hàm và trigger.
3. `supabase/migrations/20261112110000_sprint2_pricing_security.sql` – ACL, 3 policy SELECT, trigger bất biến cho `NHAT_KY_GIA`.

### 2.2 Ba bảng mới (M1)

`QUY_TAC_GIA` (M1:52-73), `DE_XUAT_GIA` (M1:75-97), `NHAT_KY_GIA` (M1:103-118). Cả ba có `ENABLE ROW LEVEL SECURITY` (M1:122-124, lặp lại ở M3:19-21).

### 2.3 Bốn cột bổ sung

| Cột | Kiểu | Ràng buộc | Vị trí |
|---|---|---|---|
| `CHI_TIET_GIU_CHO.DonGiaChot` | `NUMERIC(12,2)` | nullable, không default, không backfill | M1:31-32 |
| `GIU_CHO.NguoiDungID` | `UUID` | nullable, không default, **không FK**, không backfill | M1:37-38 |
| `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | M1:41-42 |
| `GHE.NgayCapNhatTrangThai` | `TIMESTAMPTZ` | nullable, không default, không backfill | M2:10-11 |

### 2.4 Khóa ngoại (kèm ON DELETE)

| Bảng.cột | Tham chiếu | ON DELETE | Dòng M1 |
|---|---|---|---|
| `QUY_TAC_GIA.KhuVucID` | `KHU_VUC(KhuVucID)` | CASCADE | 54 |
| `QUY_TAC_GIA.NguoiCapNhatID` | `HO_SO_NGUOI_DUNG(NguoiDungID)` | NO ACTION (ngầm định, như bản nháp) | 67 |
| `DE_XUAT_GIA.QuyTacGiaID` | `QUY_TAC_GIA(QuyTacGiaID)` | CASCADE | 77 |
| `DE_XUAT_GIA.KhuVucID` | `KHU_VUC(KhuVucID)` | CASCADE | 78 |
| `DE_XUAT_GIA.NguoiDuyetID` | `HO_SO_NGUOI_DUNG(NguoiDungID)` | NO ACTION (ngầm định, như bản nháp) | 90 |
| `NHAT_KY_GIA.KhuVucID` | `KHU_VUC(KhuVucID)` | **RESTRICT** | 105 |
| `NHAT_KY_GIA.DeXuatID` | `DE_XUAT_GIA(DeXuatID)` | **RESTRICT** | 107 |
| `NHAT_KY_GIA.NguoiThucHienID` | `HO_SO_NGUOI_DUNG(NguoiDungID)` | **RESTRICT** (tường minh, khác bản nháp) | 115 |

### 2.5 CHECK

| Bảng | Tên | Điều kiện | Dòng M1 |
|---|---|---|---|
| `QUY_TAC_GIA` | `chk_khung_gia_hop_le` | `"GiaSan" > 0 AND "GiaSan" <= "GiaGoc" AND "GiaGoc" <= "GiaTran"` | 70 |
| `QUY_TAC_GIA` | `chk_buoc_nhay_duong` | `"BuocNhayGia" > 0` | 71 |
| `QUY_TAC_GIA` | `chk_bien_do_hop_le` | `"BienDoToiDaMoiChuKy" > 0 AND "BienDoToiDaMoiChuKy" <= 1.0` | 72 |
| `DE_XUAT_GIA` | `chk_loai_canh_bao` | `LoaiCanhBao IN ('BINH_THUONG','CHAM_GIA_TRAN','CHAM_GIA_SAN')` | 95 |
| `DE_XUAT_GIA` | `chk_trang_thai_duyet` | `TrangThaiDuyet IN ('PENDING','APPROVED','REJECTED','EXPIRED')` | 96 |
| `NHAT_KY_GIA` | `chk_loai_bien_dong` | `LoaiBienDong IN ('KHOI_TAO','DUYET_DE_XUAT_AI','DIEU_CHINH_THU_CONG')` | 117 |

### 2.6 UNIQUE và khóa chính

- `QUY_TAC_GIA.KhuVucID` UNIQUE (1–1 với khu vực), tên ngầm định `QUY_TAC_GIA_KhuVucID_key` (M1:54; DF:346-351).
- `NHAT_KY_GIA.DeXuatID` UNIQUE, cho phép NULL nên nhiều dòng NULL vẫn hợp lệ, tên ngầm định `NHAT_KY_GIA_DeXuatID_key` (M1:107; DF:352-357, DF:267-270).
- Khóa chính `BIGINT GENERATED BY DEFAULT AS IDENTITY`: `QuyTacGiaID` (M1:53), `DeXuatID` (M1:76), `NhatKyGiaID` (M1:104).

### 2.7 Trigger và hàm trigger

| Trigger | Bảng / sự kiện | Hàm (chữ ký đầy đủ) | SECURITY | search_path | Dòng |
|---|---|---|---|---|---|
| `trg_ghi_thoi_diem_doi_trang_thai_ghe` | `GHE`, `BEFORE UPDATE OF "TrangThai"`, `FOR EACH ROW` | `public.ghi_thoi_diem_doi_trang_thai_ghe() RETURNS trigger` | không khai báo, tức là `SECURITY INVOKER` mặc định | `SET search_path = public` | M2:13-32 |
| `chan_sua_xoa_nhat_ky_gia` | `NHAT_KY_GIA`, `BEFORE UPDATE OR DELETE`, `FOR EACH ROW` | `public.chan_sua_xoa_nhat_ky_gia() RETURNS TRIGGER` | `SECURITY INVOKER` (khai báo tường minh) | `SET search_path = public` | M3:88-105 |

- `ghi_thoi_diem_doi_trang_thai_ghe`: đặt `NgayCapNhatTrangThai := now()` khi `OLD."TrangThai" IS DISTINCT FROM NEW."TrangThai"`. INSERT không kích hoạt (trigger chỉ có `UPDATE OF "TrangThai"`) nên ghế mới sinh vẫn có giá trị NULL.
- `chan_sua_xoa_nhat_ky_gia`: luôn `RAISE EXCEPTION 'NHAT_KY_GIA la nhat ky bat bien: khong cho phep %', TG_OP` với `ERRCODE = '42501'` và `HINT`. **Không có cơ chế bypass nào** trong file (không có cờ cấu hình, không kiểm tra vai trò), nên áp dụng cả với `service_role` và chủ bảng `postgres`.
- Cả hai trigger được tạo bằng `DROP TRIGGER IF EXISTS` rồi `CREATE TRIGGER` nên chạy lại được.
- Migration M2 không đổi quyền ghi `GHE` (đã khóa ở `20261111090000`). Khối `DO $$` cuối M2 (M2:34-45) `RAISE EXCEPTION` nếu `authenticated`/`anon` có `INSERT/UPDATE/DELETE` trên `GHE`. M2 cũng gọi `NOTIFY pgrst, 'reload schema'` (M2:47).

### 2.8 Chính sách RLS (cả ba là `FOR SELECT TO authenticated`, M3)

| Tên policy | Bảng | Dòng |
|---|---|---|
| `Thanh vien to chuc doc quy tac gia` | `QUY_TAC_GIA` | M3:39-53 |
| `Thanh vien to chuc doc de xuat gia` | `DE_XUAT_GIA` | M3:55-69 |
| `Thanh vien to chuc doc nhat ky gia` | `NHAT_KY_GIA` | M3:71-85 |

Điều kiện chung: `EXISTS` qua `KHU_VUC → SUAT_DIEN → SU_KIEN` và `public.la_thanh_vien_to_chuc(sk."ToChucID")`. Hàm này được gọi, không định nghĩa lại (định nghĩa hiện tại ở `20261006210000_user_organizer_boundary.sql`; theo chú thích M3:7-9 nó yêu cầu `LoaiTaiKhoan IN ('ORGANIZER','ADMIN')` và chấp nhận mọi `VaiTro`). Không có nhánh sự kiện công khai, không có chính sách ghi, không có chính sách `FOR ALL`. Vì `la_thanh_vien_to_chuc` chấp nhận mọi vai trò, `VAN_HANH` và `SOAT_VE` **đọc được** dữ liệu giá của tổ chức mình; việc chỉ cho `CHU_SO_HUU`/`QUAN_TRI` cấu hình và duyệt giá thuộc các RPC đợt sau.

### 2.9 ACL (M3)

- Mỗi bảng trong 3 bảng giá: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM PUBLIC, anon, authenticated` (M3:25, 29, 33); `REVOKE SELECT ... FROM PUBLIC, anon` (M3:26, 30, 34); `GRANT SELECT ... TO authenticated` (M3:27, 31, 35). Kết quả: `authenticated` chỉ có SELECT; `PUBLIC` và `anon` không có quyền gì. `service_role` không bị đụng tới (còn đủ quyền bảng, nhưng bị trigger chặn UPDATE/DELETE trên `NHAT_KY_GIA`).
- Hàm: `REVOKE ALL ON FUNCTION public.chan_sua_xoa_nhat_ky_gia() FROM PUBLIC, anon, authenticated` (M3:107); `REVOKE ALL ON FUNCTION public.ghi_thoi_diem_doi_trang_thai_ghe() FROM PUBLIC, anon, authenticated` (M2:26).
- Ghi chú: pgTAP chỉ kiểm ACL hàm của `chan_sua_xoa_nhat_ky_gia()` (SEC:297-303). ACL của `ghi_thoi_diem_doi_trang_thai_ghe()` chưa có khẳng định riêng.

## 3. Giải thích

### 3.1 `DonGiaChot` và `NguoiDungID` còn nullable

Hàm `tao_giu_cho_theo_suat` hiện hành chưa ghi hai cột này, và W1 không sửa hàm đó. Nếu đặt `NOT NULL`, mọi lần giữ chỗ qua RPC cũ sẽ lỗi. Các dòng giữ chỗ đang tồn tại (và các dòng ẩn danh/cũ) cũng không có giá hay tài khoản thật để backfill, nên để NULL thay vì bịa giá trị (M1:29-30, M1:34-36). Khẳng định pgTAP đi kèm: DF:220-227 (`... inserted without DonGiaChot keeps NULL`, `... without NguoiDungID keeps NULL`). Khi đợt sau cập nhật RPC để ghi hai cột, mới cân nhắc ràng buộc chặt hơn; việc đó cần migration và đánh giá riêng.

### 3.2 Tác động của RESTRICT và bất biến audit tới việc xóa dữ liệu cha

- `NHAT_KY_GIA` dùng RESTRICT trên `KhuVucID`, `DeXuatID` và `NguoiThucHienID`, còn `QUY_TAC_GIA` và `DE_XUAT_GIA` CASCADE từ `KHU_VUC` (và `DE_XUAT_GIA` CASCADE từ `QUY_TAC_GIA`).
- Hệ quả: khi một khu vực đã có dòng nhật ký, việc xóa `KHU_VUC` bị chặn (lỗi 23503 từ `NHAT_KY_GIA_KhuVucID_fkey`). Tương tự, xóa `DE_XUAT_GIA` đã có nhật ký bị chặn bởi `NHAT_KY_GIA_DeXuatID_fkey`, và xóa hồ sơ người dùng (`HO_SO_NGUOI_DUNG`, nên cả việc xóa tài khoản `auth.users` kéo theo) đã từng thực hiện hành động ghi nhật ký bị chặn bởi `NHAT_KY_GIA_NguoiThucHienID_fkey`. Việc xóa sự kiện (nếu kéo theo xóa khu vực) cũng bị chặn theo.
- Chú thích M1:99-102 nêu rõ các RPC lưu sơ đồ của tổ chức trong `20261028100000_*` xóa rồi tạo lại khu vực; các RPC đó sẽ bị chặn với khu vực đã có nhật ký. W1 cố ý **không** sửa các RPC này. Đây là rủi ro cần xử lý ở đợt sau.
- Trigger `chan_sua_xoa_nhat_ky_gia` chặn mọi UPDATE/DELETE theo từng dòng, kể cả `service_role` và `postgres`, và file migration không nêu cơ chế bypass nào. Vì vậy dòng nhật ký không thể dọn bằng DELETE, và kết hợp với RESTRICT, dữ liệu cha liên quan cũng không thể xóa.
- Điều kiện cần biết: trigger này khai báo `BEFORE UPDATE OR DELETE FOR EACH ROW`, **không** phủ `TRUNCATE`. `TRUNCATE` bị thu hồi với `anon`/`authenticated` (M3:33) và được pgTAP kiểm (DF:683-686, DF:740-743), nhưng chưa có khẳng định cho `service_role`/chủ bảng. Người có quyền cao (chủ bảng, hoặc ai có thể `DROP TRIGGER`/`DISABLE TRIGGER`) vẫn thay đổi được; bất biến ở đây là bất biến ở mức dòng cho các vai trò thao tác thông thường, không phải bảo đảm tuyệt đối. Cần quyết định có thêm trigger `BEFORE TRUNCATE` hay không ở đợt sau.

### 3.3 Khác biệt đã sửa so với bản nháp `dp_schema_draft.sql.txt`

Các chú thích "Changed vs. draft" nằm trong M1 (M1:113-114, M1:66, M1:89 và M1:29, M1:47); các điểm còn lại đọc từ so sánh trực tiếp hai file:

1. Tên đối tượng được gắn `public."..."`, theo các migration mới (M1:29, M1:47). Cột, kiểu, default, CHECK của 3 bảng chép nguyên (M1:47-49).
2. `NHAT_KY_GIA.NguoiThucHienID`: bản nháp để NO ACTION ngầm định, bản sửa dùng `ON DELETE RESTRICT` tường minh để liên kết audit không bị mất âm thầm (M1:113-115). `NguoiCapNhatID` và `NguoiDuyetID` giữ nguyên NO ACTION ngầm định như bản nháp (M1:66, M1:89).
3. Thêm 3 cột nền mà bản nháp chưa có hoặc chỉ có một phần: `GIU_CHO.NguoiDungID`, `CAU_HINH_SU_KIEN.YeuCauXacMinhOTP` (M1:34-42, theo spec §1); `DonGiaChot` có trong bản nháp (bước 1) và được giữ.
4. Trigger bất biến đổi tên và hành vi: hàm `trg_protect_price_audit_log()` đổi thành `public.chan_sua_xoa_nhat_ky_gia()`, trigger `trg_prevent_tamper_nhat_ky_gia` đổi thành `chan_sua_xoa_nhat_ky_gia`. Bản sửa có `SECURITY INVOKER`, `SET search_path = public`, `ERRCODE = '42501'` và `HINT`, thông báo không dấu, và `REVOKE ALL ... FROM PUBLIC, anon, authenticated` cho hàm (bản nháp không có các điểm này). Bản nháp không nói gì về service_role; bản sửa xác nhận không bypass.
5. Bản nháp không có RLS và ACL cho bảng mới; bản sửa bật RLS (M1:122-124), thu hồi ghi, và thêm 3 policy SELECT cho thành viên tổ chức (M3), đúng spec §1.5. Người ẩn danh và khán giả không đọc được.
6. Thêm `GHE.NgayCapNhatTrangThai` và trigger (M2), cộng thêm theo spec §1.3. Không có trong bản nháp.
7. RPC `duyet_de_xuat_gia` trong bản nháp **không** nằm trong W1 (thuộc đợt RPC sau); đặc tả cũng yêu cầu bổ sung tham số `p_gia_dieu_chinh` và bỏ chép nguyên bản nháp.
8. Idempotent: CHECK nằm trong `CREATE TABLE IF NOT EXISTS`, không dùng `ALTER TABLE ADD CONSTRAINT`, nên chạy lại không lỗi (M1:47-49).

Lệch nhỏ cần biết: chú thích đầu M1 gọi migration bảo mật là "T3" (M1:14-15) trong khi file M3 tự gọi mình là "Sprint 2 / T2". Đây chỉ là nhãn trong chú thích, không ảnh hưởng SQL.

## 4. Tài liệu cần cập nhật (chỉ liệt kê, chưa sửa)

1. ERD 17 bảng: thêm 3 bảng `QUY_TAC_GIA`, `DE_XUAT_GIA`, `NHAT_KY_GIA` cùng khóa ngoại/RESTRICT/CASCADE ở mục 2.4, và 4 cột mới ở mục 2.3.
2. Từ điển dữ liệu: các bảng và cột mới, kiểu, ràng buộc, giá trị mặc định, CHECK, UNIQUE.
3. Đặc tả Use Case: UC-T4-01…05 và các điều kiện tiên quyết liên quan tới `YeuCauXacMinhOTP`, `DonGiaChot` (khi RPC đợt sau hoàn tất).
4. Sơ đồ tuần tự: luồng cấu hình/duyệt giá và giữ chỗ với giá chốt, khi các RPC có mặt.
5. Ma trận truy vết: ánh xạ FR/UC/AC tới bảng, cột, migration và file pgTAP ở mục 1; các AC nghiệp vụ vẫn phải để trạng thái chưa kiểm chứng đến khi có RPC.
6. Test Log: thêm 2 file pgTAP mới (kế hoạch 154 và 33 khẳng định), ghi **chưa chạy** cho tới khi người kiểm chứng chạy `npm run db:test`.

Phần diff của W1 **không** thay đổi `docs/` và không có file `.docx` nào.

## 5. Mục cần db:test

- `npm run check` chỉ chạy TypeScript, test Node và build. Nó không replay migration và không chạy pgTAP. Việc replay 3 migration mới và chạy 2 file pgTAP **chưa được xác minh** trong đợt này. Không có kết quả nào được ghi nhận ở đây.
- Hai file pgTAP mới (tự tạo toàn bộ fixture trong giao dịch, kết thúc bằng `finish()` rồi `ROLLBACK`):
  - `supabase/tests/sprint2_data_foundation.sql`: `plan(154)` (DF:35). Số thứ tự trong chú thích chạy từ 1 đến 154 và khớp; chưa đếm bằng máy. Header file ghi rõ chưa chạy qua cổng (DF:7-10).
  - `supabase/tests/sprint2_pricing_security.sql`: `plan(33)` (SEC:9). Số thứ tự chú thích 1–33. Header ghi `authored` (SEC:4).
  - Tổng kế hoạch của hai file: 187 khẳng định. Số này là tổng các `plan(N)`, không phải kết quả chạy.
- Bước nghiệm thu dành cho người kiểm chứng sau khi merge (board không tự chạy):
  1. `npm run db:reset`
  2. `npm run db:test`
  3. Kỳ vọng: chạy **sáu file cũ** (theo spec §0 hiện có 101 khẳng định) và **hai file mới** ở trên. Mỗi file phải khớp `plan(N)` và không có khẳng định nào lỗi. Nếu lỗi, ghi lại tên khẳng định.
- Những điểm đáng chú ý khi người kiểm chứng đọc kết quả: khẳng định thông báo lỗi trigger dùng chuỗi chính xác `NHAT_KY_GIA la nhat ky bat bien: khong cho phep UPDATE/DELETE`; khẳng định tên ràng buộc FK/UNIQUE dựa trên tên ngầm định do PostgreSQL sinh (`NHAT_KY_GIA_DeXuatID_fkey`, `QUY_TAC_GIA_KhuVucID_key`, ...); test ACL `PUBLIC` dùng `aclexplode` trên `relacl`/`proacl`.

## 6. Đối chiếu migration

- Dưới `supabase/migrations/` có đúng ba file W1 mới: `20261112090000_sprint2_pricing_tables.sql`, `20261112100000_sprint2_ghe_state_time.sql`, `20261112110000_sprint2_pricing_security.sql`. Cả ba có mốc thời gian lớn hơn `20261111090000` (migration mới nhất trước W1, `20261111090000_server_side_seat_generation.sql` vẫn còn nguyên trong thư mục).
- **Thứ tự áp dụng theo tên file**: `tables` (090000) → `ghe_state_time` (100000) → `pricing_security` (110000). Thứ tự này đúng với phụ thuộc: M3 cần 3 bảng của M1 đã tồn tại; M2 độc lập. Không suy ra thứ tự migration từ thứ tự thực hiện task: task T3 (`ghe_state_time`) được commit sau migration `tables` nhưng mốc thời gian của nó nằm giữa hai file kia, và Supabase áp dụng theo tên file.
- Giới hạn của phiên này: không chạy được `git diff --name-status main...HEAD` nên chưa tự xác nhận bằng diff rằng dưới `supabase/migrations/` chỉ có trạng thái `A` (không `M`/`D`). Việc đã làm là đọc ba file mới, liệt kê thư mục (không thấy file cũ đổi tên) và kiểm tra các migration W1 không sửa gì cũ (mỗi file chỉ `ADD COLUMN IF NOT EXISTS`/`CREATE ... IF NOT EXISTS`/`CREATE OR REPLACE`/`DROP ... IF EXISTS` trên đối tượng của chính nó). Người duyệt nên chạy `git diff --name-status main...HEAD -- supabase/migrations docs` để chốt: kỳ vọng chỉ có ba dòng `A` và không có dòng nào dưới `docs/`.
- Các file khác trong nhánh W1 (từ nhật ký commit): T4 đồng bộ kiểu dữ liệu `src/types/database.types.ts` (nội dung có tham chiếu 4 cột mới, 21 chỗ khớp), T5 hai file pgTAP trong `supabase/tests/`.

## 7. Phần còn lại thuộc đợt sau

- RPC nghiệp vụ: `luu_quy_tac_gia`, `lay_so_lieu_dinh_gia`, `luu_de_xuat_gia` (PriceGuard), `duyet_de_xuat_gia`, `tu_choi_de_xuat_gia`, `het_han_de_xuat_gia`; hàm quyền chung `co_quyen_dinh_gia(p_su_kien_id)` (chưa tồn tại).
- OTP: hàm `da_xac_minh_otp()`, cổng chặn 403 trong giữ ghế, giao diện OTP.
- Giới hạn 4 vé: kiểm tra và khóa advisory trong `tao_giu_cho_theo_suat`, lỗi `VUOT_GIOI_HAN_VE`, audit khi BTC đổi `SoVeToiDaMoiDon`.
- Ghi `DonGiaChot` và `NguoiDungID` trong `tao_giu_cho_theo_suat` (chốt giá khi giữ chỗ); xử lý các RPC lưu sơ đồ bị RESTRICT chặn (mục 3.2).
- Ràng buộc "một `PENDING` mỗi khu" (hiện chưa có ở DB), quyết định về `TRUNCATE` của `NHAT_KY_GIA`.
- `src/domain/pricingEngine.js` và test 4 ví dụ, `scripts/run-pricing-cycle.mjs`, Demand Simulator, Realtime giá cho khán giả và toàn bộ giao diện (kể cả chế độ mock).
- Cổng `npm run check`: do agentkit chạy, đạt. Cổng này không kiểm SQL nên không chứng minh gì về migration hay pgTAP.
