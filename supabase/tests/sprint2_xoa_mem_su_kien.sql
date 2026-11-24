-- pgTAP: BTC xoa su kien (xoa mem, TrangThaiCongBo = DA_AN).
-- Migration duoc kiem: 20261124110000_sprint2_xoa_mem_su_kien.sql
-- Fixture: ID 998xxx/999xxx khac cac file khac: su kien 9961xx, UUID 66660000-..., ROLLBACK cuoi file.
BEGIN;

SELECT plan(13);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('66660000-8888-4888-8888-000000000001', 'authenticated', 'authenticated', 't6-owner@example.com'),
  ('66660000-8888-4888-8888-000000000002', 'authenticated', 'authenticated', 't6-editor@example.com'),
  ('66660000-8888-4888-8888-000000000003', 'authenticated', 'authenticated', 't6-other-owner@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan") VALUES
  ('66660000-8888-4888-8888-000000000001', 'T6 Owner', 'ORGANIZER'),
  ('66660000-8888-4888-8888-000000000002', 'T6 Editor', 'ORGANIZER'),
  ('66660000-8888-4888-8888-000000000003', 'T6 Other Owner', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug") VALUES
  ('66660000-0000-4888-8888-0000000000a1', 'T6 Org A', 't6-org-a'),
  ('66660000-0000-4888-8888-0000000000a2', 'T6 Org B', 't6-org-b')
ON CONFLICT ("ToChucID") DO NOTHING;
INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro") VALUES
  ('66660000-0000-4888-8888-0000000000a1', '66660000-8888-4888-8888-000000000001', 'CHU_SO_HUU'),
  ('66660000-0000-4888-8888-0000000000a1', '66660000-8888-4888-8888-000000000002', 'BIEN_TAP'),
  ('66660000-0000-4888-8888-0000000000a2', '66660000-8888-4888-8888-000000000003', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

-- 996101: ban nhap | 996102: cong khai, dang ban (chua ket thuc) | 996103: cong khai, se doi thanh da ket thuc | 996104: cong khai da ket thuc co giu cho
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong", "TrangThaiMoBan", "TrangThaiCongBo"
)
SELECT 996100 + g, 'T6 Event ' || g, 't6-event-' || g, '66660000-0000-4888-8888-0000000000a1',
       NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
       'Ha Noi', 'San T6', 'DANG_MO_BAN', 'BAN_NHAP'
FROM generate_series(1, 4) g;

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
)
SELECT 996100 + g, 996100 + g, 't6-show-' || g, 'T6 Show ' || g,
       NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
FROM generate_series(1, 4) g;

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
)
SELECT 996100 + g, 996100 + g, 996100 + g, 'T6_STAND', 'T6 Stand', 'DUNG_STAND', 100000.00, '#111111', 50
FROM generate_series(1, 4) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','66660000-8888-4888-8888-000000000001',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"66660000-8888-4888-8888-000000000001"}',true);
SELECT public.cong_bo_su_kien(996102);
SELECT public.cong_bo_su_kien(996103);
SELECT public.cong_bo_su_kien(996104);
RESET ROLE;

-- Doi 996103 va 996104 thanh da ket thuc (thoi gian o qua khu)
ALTER TABLE public."SU_KIEN" DISABLE TRIGGER USER;
ALTER TABLE public."SUAT_DIEN" DISABLE TRIGGER USER;
UPDATE public."SU_KIEN"
SET "ThoiGianBatDau" = NOW() - INTERVAL '3 days', "ThoiGianKetThuc" = NOW() - INTERVAL '2 days',
    "ThoiGianMoBanVe" = NOW() - INTERVAL '10 days', "ThoiGianDongBanVe" = NOW() - INTERVAL '3 days'
WHERE "SuKienID" IN (996103, 996104);
UPDATE public."SUAT_DIEN"
SET "ThoiGianBatDau" = NOW() - INTERVAL '3 days', "ThoiGianKetThuc" = NOW() - INTERVAL '2 days',
    "ThoiGianMoBanVe" = NOW() - INTERVAL '10 days', "ThoiGianDongBanVe" = NOW() - INTERVAL '3 days'
WHERE "SuKienID" IN (996103, 996104);
ALTER TABLE public."SU_KIEN" ENABLE TRIGGER USER;
ALTER TABLE public."SUAT_DIEN" ENABLE TRIGGER USER;

-- Giu cho con hieu luc tren 996104
INSERT INTO public."GIU_CHO" ("GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "NguoiDungID", "TrangThai", "HetHanLuc")
VALUES ('66660000-0000-4000-8000-000000000001', 996104, 996104, '66660000-0000-4000-8000-0000000000aa',
        '66660000-8888-4888-8888-000000000001', 'ACTIVE', NOW() + INTERVAL '3 minutes');

-- [1] anon khong goi duoc
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true), set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT throws_ok($$ SELECT public.xoa_su_kien(996101) $$, '42501', NULL, 'anon khong goi duoc xoa_su_kien');
RESET ROLE;

-- [2] bien tap vien khong co quyen xoa
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','66660000-8888-4888-8888-000000000002',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"66660000-8888-4888-8888-000000000002"}',true);
SELECT throws_ok($$ SELECT public.xoa_su_kien(996101) $$, '42501', 'Khong co quyen xoa su kien', 'Bien tap vien khong xoa duoc su kien');
RESET ROLE;

-- [3] chu so huu to chuc khac khong xoa duoc
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','66660000-8888-4888-8888-000000000003',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"66660000-8888-4888-8888-000000000003"}',true);
SELECT throws_ok($$ SELECT public.xoa_su_kien(996101) $$, '42501', 'Khong co quyen xoa su kien', 'Chu so huu to chuc khac khong xoa duoc');
RESET ROLE;

-- Chu so huu to chuc A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','66660000-8888-4888-8888-000000000001',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"66660000-8888-4888-8888-000000000001"}',true);
-- [4] su kien khong ton tai: khong tiet lo
SELECT throws_ok($$ SELECT public.xoa_su_kien(999999999) $$, '42501', 'Khong co quyen xoa su kien', 'Su kien khong ton tai tra cung loi quyen');
-- [5] su kien dang ban (chua ket thuc) khong xoa duoc
SELECT throws_ok($$ SELECT public.xoa_su_kien(996102) $$, 'P0001', 'SU_KIEN_CHUA_KET_THUC', 'Su kien dang ban, chua ket thuc: khong xoa duoc');
-- [6] su kien ket thuc nhung con giu cho hieu luc
SELECT throws_ok($$ SELECT public.xoa_su_kien(996104) $$, 'P0001', 'SU_KIEN_DANG_CO_GIU_CHO', 'Su kien da ket thuc nhung con giu cho hieu luc: chua xoa duoc');
-- [7] ban nhap xoa duoc
SELECT is((SELECT public.xoa_su_kien(996101)->>'trangThai'), 'DA_AN', 'Chu so huu xoa duoc ban nhap');
-- [8] su kien da ket thuc xoa duoc
SELECT is((SELECT public.xoa_su_kien(996103)->>'trangThai'), 'DA_AN', 'Chu so huu xoa duoc su kien da ket thuc');
-- [9] goi lai: idempotent
SELECT is((SELECT public.xoa_su_kien(996103)->>'daXoaTruoc'), 'true', 'Goi lai tren su kien da an thanh cong (idempotent)');
RESET ROLE;

-- [10] trang thai trong CSDL
SELECT is((SELECT "TrangThaiCongBo"::text FROM public."SU_KIEN" WHERE "SuKienID" = 996103), 'DA_AN', 'SU_KIEN.TrangThaiCongBo = DA_AN');

-- [11] khach (anon) khong con thay su kien da an; su kien cong khai khac van thay
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true), set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT is((SELECT count(*)::int FROM public."SU_KIEN" WHERE "SuKienID" = 996103), 0, 'Khach khong thay su kien da xoa');
-- [12]
SELECT is((SELECT count(*)::int FROM public."SU_KIEN" WHERE "SuKienID" = 996102), 1, 'Khach van thay su kien cong khai chua xoa');
RESET ROLE;

-- [13] chi tiet du lieu duoc giu (khong xoa cung): khu vuc va suat dien con nguyen
SELECT is((SELECT ROW(
    (SELECT count(*)::int FROM public."KHU_VUC" WHERE "SuKienID" = 996103),
    (SELECT count(*)::int FROM public."SUAT_DIEN" WHERE "SuKienID" = 996103))), ROW(1, 1),
  'Xoa mem giu nguyen suat dien va khu vuc (khong xoa cung)');

SELECT * FROM finish();
ROLLBACK;
