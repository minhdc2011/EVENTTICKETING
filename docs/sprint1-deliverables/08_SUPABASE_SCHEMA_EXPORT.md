# 08 — Bản xuất schema Supabase live (03/11/2026)

Nguồn: xuất từ Supabase dashboard project `qxkgkbayxxaakkwtepss`, ngày 03/11/2026, trước khi chạy migration `20261103090000_restrict_event_configuration_writes.sql` (policy `Members manage event configuration` bên dưới là bản cũ). ERD và Class Diagram trong `03_DATABASE_DESIGN.md` và `02_ANALYSIS_AND_SYSTEM_DESIGN.md` đã đối chiếu đủ mọi cột với file này.

## Table `SU_KIEN`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `SuKienID` | `int4` | Primary |
| `TenSuKien` | `varchar` |  |
| `Slogan` | `varchar` |  Nullable |
| `MoTaChiTiet` | `text` |  Nullable |
| `ThoiGianBatDau` | `timestamptz` |  |
| `ThoiGianKetThuc` | `timestamptz` |  |
| `ThoiGianMoBanVe` | `timestamptz` |  |
| `ThoiGianDongBanVe` | `timestamptz` |  Nullable |
| `DiaDiem` | `varchar` |  |
| `TenSanVanDong` | `varchar` |  |
| `SucChua` | `int4` |  |
| `BannerURL` | `varchar` |  Nullable |
| `PosterURL` | `varchar` |  Nullable |
| `TrailerURL` | `varchar` |  Nullable |
| `SoDoTongQuanURL` | `varchar` |  Nullable |
| `TrangThaiMoBan` | `varchar` |  |
| `QuyDinhDoTuoi` | `varchar` |  Nullable |
| `NgayTao` | `timestamptz` |  |
| `NgayCapNhat` | `timestamptz` |  |
| `TrangThaiCongBo` | `varchar` |  |
| `Slug` | `varchar` |  |
| `ToChucID` | `uuid` |  |
| `TemplateKey` | `varchar` |  |
| `TheLoai` | `varchar` |  |
| `LoaiHinhSuKien` | `varchar` |  |
| `DuongDanTrucTuyen` | `text` |  Nullable |
| `HuongDanThamGiaTrucTuyen` | `text` |  Nullable |
| `ChinhSachHoanHuy` | `text` |  Nullable |
| `QuyDinhThamGia` | `text` |  Nullable |
| `EmailLienHe` | `varchar` |  Nullable |
| `HotlineLienHe` | `varchar` |  Nullable |
| `FanpageURL` | `varchar` |  Nullable |
| `SoGiayPhepBieuDien` | `varchar` |  Nullable |

## Table `NGHE_SI`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `NgheSiID` | `int4` | Primary |
| `HoTen` | `varchar` |  |
| `NgheDanh` | `varchar` |  |
| `VaiTroChinh` | `varchar` |  Nullable |
| `TieuSu` | `text` |  Nullable |
| `HinhAnhURL` | `varchar` |  Nullable |
| `NgayTao` | `timestamptz` |  |

## Table `SU_KIEN_NGHE_SI`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ID` | `int4` | Primary |
| `SuKienID` | `int4` |  |
| `NgheSiID` | `int4` |  |
| `VaiTroTrongSuKien` | `varchar` |  |
| `ThuTuHienThi` | `int4` |  |

## Table `KHU_VUC`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `KhuVucID` | `int4` | Primary |
| `SuKienID` | `int4` |  |
| `MaKhuVuc` | `varchar` |  |
| `TenKhuVuc` | `varchar` |  |
| `LoaiKhuVuc` | `varchar` |  |
| `GiaVeNiemYet` | `numeric` |  |
| `MauSacHex` | `varchar` |  |
| `MoTaQuyenLoi` | `text` |  Nullable |
| `TongSoGhe` | `int4` |  |
| `SuatDienID` | `int8` |  |
| `SoVeToiThieuMoiDon` | `int4` |  |
| `SoVeToiDaMoiDon` | `int4` |  |

## Table `GHE`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `GheID` | `int4` | Primary |
| `KhuVucID` | `int4` |  |
| `SoHang` | `varchar` |  |
| `SoGhe` | `varchar` |  |
| `MaGheDayDu` | `varchar` |  |
| `TrangThai` | `varchar` |  |
| `ToaDoX` | `int4` |  Nullable |
| `ToaDoY` | `int4` |  Nullable |

## Table `GIU_CHO`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `GiuChoID` | `uuid` | Primary |
| `SuKienID` | `int4` |  |
| `PhienNguoiDung` | `uuid` |  |
| `TrangThai` | `varchar` |  |
| `HetHanLuc` | `timestamptz` |  |
| `NgayTao` | `timestamptz` |  |
| `NgayCapNhat` | `timestamptz` |  |
| `SuatDienID` | `int8` |  |

## Table `CHI_TIET_GIU_CHO`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ID` | `int8` | Primary |
| `GiuChoID` | `uuid` |  |
| `KhuVucID` | `int4` |  |
| `GheID` | `int4` |  Nullable |
| `MaVe` | `varchar` |  |
| `SoLuong` | `int4` |  |

## Table `TO_CHUC`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ToChucID` | `uuid` | Primary |
| `TenToChuc` | `varchar` |  |
| `Slug` | `varchar` |  Unique |
| `TrangThai` | `varchar` |  |
| `NgayTao` | `timestamptz` |  |
| `NgayCapNhat` | `timestamptz` |  |

## Table `HO_SO_NGUOI_DUNG`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `NguoiDungID` | `uuid` | Primary |
| `HoTen` | `varchar` |  Nullable |
| `AnhDaiDienURL` | `text` |  Nullable |
| `NgayTao` | `timestamptz` |  |
| `NgayCapNhat` | `timestamptz` |  |
| `LoaiTaiKhoan` | `varchar` |  |

## Table `THANH_VIEN_TO_CHUC`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ID` | `uuid` | Primary |
| `ToChucID` | `uuid` |  |
| `NguoiDungID` | `uuid` |  |
| `VaiTro` | `varchar` |  |
| `NgayTao` | `timestamptz` |  |

## Table `DIA_DIEM`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `DiaDiemID` | `int8` | Primary |
| `ToChucID` | `uuid` |  Nullable |
| `TenDiaDiem` | `varchar` |  |
| `DiaChi` | `text` |  |
| `MuiGio` | `varchar` |  |
| `SucChua` | `int4` |  Nullable |
| `NgayTao` | `timestamptz` |  |

## Table `PHIEN_BAN_SO_DO`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `PhienBanSoDoID` | `uuid` | Primary |
| `DiaDiemID` | `int8` |  |
| `SoPhienBan` | `int4` |  |
| `TenPhienBan` | `varchar` |  |
| `DuLieuSoDo` | `jsonb` |  |
| `DaKhoa` | `bool` |  |
| `NgayTao` | `timestamptz` |  |

## Table `SUAT_DIEN`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `SuatDienID` | `int8` | Primary |
| `SuKienID` | `int4` |  |
| `Slug` | `varchar` |  |
| `TenSuatDien` | `varchar` |  |
| `DiaDiemID` | `int8` |  Nullable |
| `PhienBanSoDoID` | `uuid` |  Nullable |
| `MuiGio` | `varchar` |  |
| `ThoiGianBatDau` | `timestamptz` |  |
| `ThoiGianKetThuc` | `timestamptz` |  |
| `ThoiGianMoBanVe` | `timestamptz` |  |
| `ThoiGianDongBanVe` | `timestamptz` |  Nullable |
| `TrangThai` | `varchar` |  |
| `NgayTao` | `timestamptz` |  |
| `NgayCapNhat` | `timestamptz` |  |
| `ThoiGianMoCua` | `timestamptz` |  Nullable |

## Table `CAU_HINH_SU_KIEN`

Quan he Mot - Mot (1 - 1) voi SU_KIEN: Moi su kien co dung 1 ban ghi cau hinh nghiep vu.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `SuKienID` | `int4` | Primary |
| `ThoiGianGiuChoPhut` | `int4` |  |
| `SoVeToiDaMoiDon` | `int4` |  |
| `ChoPhepChonCho` | `bool` |  |
| `YeuCauCCCD` | `bool` |  |
| `ChoPhepChuyenNhuong` | `bool` |  |
| `TuyChonMoRong` | `jsonb` |  |
| `NgayCapNhat` | `timestamptz` |  |

## RLS Policies

### `SU_KIEN`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public Read Published SU_KIEN` | SELECT | public | PERMISSIVE | `(("TrangThaiCongBo")::text = 'CONG_KHAI'::text)` | — |
| `Members read their events` | SELECT | authenticated | PERMISSIVE | `la_thanh_vien_to_chuc("ToChucID")` | — |
| `Editors manage their events` | ALL | authenticated | PERMISSIVE | `co_quyen_bien_tap_to_chuc("ToChucID")` | `co_quyen_bien_tap_to_chuc("ToChucID")` |

### `SU_KIEN_NGHE_SI`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public Read Published SU_KIEN_NGHE_SI` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "SU_KIEN_NGHE_SI"."SuKienID") AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text))))` | — |
| `Members read event artists` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "SU_KIEN_NGHE_SI"."SuKienID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | — |

### `NGHE_SI`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public Read Published NGHE_SI` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM ("SU_KIEN_NGHE_SI" skns      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = skns."SuKienID")))   WHERE ((skns."NgheSiID" = "NGHE_SI"."NgheSiID") AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text))))` | — |
| `Members read artists` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM ("SU_KIEN_NGHE_SI" skns      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = skns."SuKienID")))   WHERE ((skns."NgheSiID" = "NGHE_SI"."NgheSiID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | — |

### `HO_SO_NGUOI_DUNG`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `User reads own profile` | SELECT | authenticated | PERMISSIVE | `("NguoiDungID" = auth.uid())` | — |
| `User updates own profile` | UPDATE | authenticated | PERMISSIVE | `("NguoiDungID" = auth.uid())` | `("NguoiDungID" = auth.uid())` |

### `THANH_VIEN_TO_CHUC`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Members read own memberships` | SELECT | authenticated | PERMISSIVE | `(("NguoiDungID" = auth.uid()) OR la_thanh_vien_to_chuc("ToChucID"))` | — |

### `TO_CHUC`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Members read organizations` | SELECT | authenticated | PERMISSIVE | `la_thanh_vien_to_chuc("ToChucID")` | — |

### `DIA_DIEM`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public reads venues of published events` | SELECT | anon, authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM ("SUAT_DIEN" sd      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((sd."DiaDiemID" = "DIA_DIEM"."DiaDiemID") AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text) AND ((sd."TrangThai")::text <> 'BAN_NHAP'::text))))` | — |
| `Members read their venues` | SELECT | authenticated | PERMISSIVE | `(("ToChucID" IS NOT NULL) AND la_thanh_vien_to_chuc("ToChucID"))` | — |
| `Editors manage their venues` | ALL | authenticated | PERMISSIVE | `(("ToChucID" IS NOT NULL) AND co_quyen_bien_tap_to_chuc("ToChucID"))` | `(("ToChucID" IS NOT NULL) AND co_quyen_bien_tap_to_chuc("ToChucID"))` |

### `PHIEN_BAN_SO_DO`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public reads locked maps of published events` | SELECT | anon, authenticated | PERMISSIVE | `("DaKhoa" AND (EXISTS ( SELECT 1    FROM ("SUAT_DIEN" sd      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((sd."PhienBanSoDoID" = "PHIEN_BAN_SO_DO"."PhienBanSoDoID") AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text) AND ((sd."TrangThai")::text <> 'BAN_NHAP'::text)))))` | — |
| `Members read their map versions` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "DIA_DIEM" dd   WHERE ((dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID") AND (dd."ToChucID" IS NOT NULL) AND la_thanh_vien_to_chuc(dd."ToChucID"))))` | — |
| `Editors manage their map versions` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "DIA_DIEM" dd   WHERE ((dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID") AND (dd."ToChucID" IS NOT NULL) AND co_quyen_bien_tap_to_chuc(dd."ToChucID"))))` | `(EXISTS ( SELECT 1    FROM "DIA_DIEM" dd   WHERE ((dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID") AND (dd."ToChucID" IS NOT NULL) AND co_quyen_bien_tap_to_chuc(dd."ToChucID"))))` |

### `SUAT_DIEN`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public reads shows of published events` | SELECT | anon, authenticated | PERMISSIVE | `((("TrangThai")::text <> 'BAN_NHAP'::text) AND (EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "SUAT_DIEN"."SuKienID") AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text)))))` | — |
| `Members read their shows` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "SUAT_DIEN"."SuKienID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | — |
| `Editors manage their shows` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "SUAT_DIEN"."SuKienID") AND co_quyen_bien_tap_to_chuc(sk."ToChucID"))))` | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "SUAT_DIEN"."SuKienID") AND co_quyen_bien_tap_to_chuc(sk."ToChucID"))))` |

### `KHU_VUC`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public reads zones of published shows` | SELECT | anon, authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM ("SUAT_DIEN" sd      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((sd."SuatDienID" = "KHU_VUC"."SuatDienID") AND ((sd."TrangThai")::text <> 'BAN_NHAP'::text) AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text))))` | — |
| `Members read show zones` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM ("SUAT_DIEN" sd      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((sd."SuatDienID" = "KHU_VUC"."SuatDienID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | — |
| `Editors manage show zones` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM ("SUAT_DIEN" sd      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((sd."SuatDienID" = "KHU_VUC"."SuatDienID") AND co_quyen_bien_tap_to_chuc(sk."ToChucID"))))` | `(EXISTS ( SELECT 1    FROM ("SUAT_DIEN" sd      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((sd."SuatDienID" = "KHU_VUC"."SuatDienID") AND co_quyen_bien_tap_to_chuc(sk."ToChucID"))))` |

### `GHE`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public reads seats of published shows` | SELECT | anon, authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (("KHU_VUC" kv      JOIN "SUAT_DIEN" sd ON ((sd."SuatDienID" = kv."SuatDienID")))      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((kv."KhuVucID" = "GHE"."KhuVucID") AND ((sd."TrangThai")::text <> 'BAN_NHAP'::text) AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text))))` | — |
| `Members read show seats` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (("KHU_VUC" kv      JOIN "SUAT_DIEN" sd ON ((sd."SuatDienID" = kv."SuatDienID")))      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((kv."KhuVucID" = "GHE"."KhuVucID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | — |
| `Editors manage show seats` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (("KHU_VUC" kv      JOIN "SUAT_DIEN" sd ON ((sd."SuatDienID" = kv."SuatDienID")))      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((kv."KhuVucID" = "GHE"."KhuVucID") AND co_quyen_bien_tap_to_chuc(sk."ToChucID"))))` | `(EXISTS ( SELECT 1    FROM (("KHU_VUC" kv      JOIN "SUAT_DIEN" sd ON ((sd."SuatDienID" = kv."SuatDienID")))      JOIN "SU_KIEN" sk ON ((sk."SuKienID" = sd."SuKienID")))   WHERE ((kv."KhuVucID" = "GHE"."KhuVucID") AND co_quyen_bien_tap_to_chuc(sk."ToChucID"))))` |

### `CAU_HINH_SU_KIEN`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Public Read Published CAU_HINH_SU_KIEN` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID") AND ((sk."TrangThaiCongBo")::text = 'CONG_KHAI'::text))))` | — |
| `Members read event configuration` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | — |
| `Members manage event configuration` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` | `(EXISTS ( SELECT 1    FROM "SU_KIEN" sk   WHERE ((sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID") AND la_thanh_vien_to_chuc(sk."ToChucID"))))` |

