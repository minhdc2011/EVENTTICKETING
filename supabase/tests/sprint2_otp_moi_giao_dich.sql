-- pgTAP: moi lan thanh toan can mot OTP moi (migration 20261124130000_sprint2_otp_moi_lan_thanh_toan.sql).
-- Quy tac: OTP phai duoc xac minh sau khi giu cho tao ra va chua dung cho giao dich khac cua cung nguoi dung.
-- Fixture rieng: su kien 997101, UUID 77770000-..., ROLLBACK cuoi file.
BEGIN;

SELECT plan(10);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('77770000-8888-4888-8888-000000000001', 'authenticated', 'authenticated', 't7-org@example.com'),
  ('77770000-8888-4888-8888-000000000011', 'authenticated', 'authenticated', 't7-buyer@example.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan") VALUES
  ('77770000-8888-4888-8888-000000000001', 'T7 Org', 'ORGANIZER'),
  ('77770000-8888-4888-8888-000000000011', 'T7 Buyer', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";
INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug") VALUES ('77770000-0000-4888-8888-0000000000a1', 'T7 Org', 't7-org')
ON CONFLICT ("ToChucID") DO NOTHING;
INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES ('77770000-0000-4888-8888-0000000000a1', '77770000-8888-4888-8888-000000000001', 'CHU_SO_HUU') ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong", "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (997101, 'T7 OTP Event', 't7-otp-event', '77770000-0000-4888-8888-0000000000a1',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
  'Ha Noi', 'San T7', 'DANG_MO_BAN', 'BAN_NHAP');

SET LOCAL "request.jwt.claim.sub" = '77770000-8888-4888-8888-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"77770000-8888-4888-8888-000000000001","role":"authenticated"}';
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP") VALUES (997101, 4, TRUE);

INSERT INTO public."SUAT_DIEN" ("SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai")
VALUES (997101, 997101, 't7-s1', 'T7 Show', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN');
INSERT INTO public."KHU_VUC" ("KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe")
VALUES (997101, 997101, 997101, 'T7_SEAT', 'T7 Seated', 'GHE_NGOI', 500000.00, '#111111', 20);
INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 9971000 + g, 997101, 'A', lpad(g::text, 2, '0'), 'T7S-A-' || lpad(g::text, 2, '0'), 'TRONG' FROM generate_series(1, 6) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','77770000-8888-4888-8888-000000000001',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"77770000-8888-4888-8888-000000000001"}',true);
SELECT public.cong_bo_su_kien(997101);
RESET ROLE;

CREATE TEMP TABLE t7_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t7_res TO authenticated;

-- Dat JWT nguoi mua kem cac moc OTP (giay epoch = floor(now) - offset)
CREATE FUNCTION pg_temp.jwt_nguoi_mua(p_offsets INT[]) RETURNS VOID LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','77770000-8888-4888-8888-000000000011',true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub','77770000-8888-4888-8888-000000000011',
    'amr', (SELECT COALESCE(json_agg(json_build_object('method','otp','timestamp', floor(extract(epoch FROM now()))::bigint - o)), '[]'::json)
            FROM unnest(p_offsets) AS o))::text, true);
END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt_nguoi_mua(INT[]) TO authenticated;

-- Hai giu cho A, B cua cung nguoi mua
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[]::INT[]);
INSERT INTO t7_res SELECT 'a', public.tao_giu_cho_theo_suat(997101, '77770000-0000-4000-8000-000000000001'::uuid, '[{"ticketCode":"T7S-A-01","zoneCode":"T7_SEAT"}]'::jsonb);
INSERT INTO t7_res SELECT 'b', public.tao_giu_cho_theo_suat(997101, '77770000-0000-4000-8000-000000000001'::uuid, '[{"ticketCode":"T7S-A-02","zoneCode":"T7_SEAT"}]'::jsonb);
RESET ROLE;

-- [1] OTP cu (xac minh TRUOC khi giu cho duoc tao) khong dung duoc
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[600]);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '77770000-0000-4000-8000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t7_res WHERE step='a')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan', 'OTP xac minh truoc khi giu cho: khong thanh toan duoc');
RESET ROLE;

-- [2] khong co OTP: bi tu choi
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[]::INT[]);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '77770000-0000-4000-8000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t7_res WHERE step='a')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan', 'Khong co OTP: khong thanh toan duoc');
RESET ROLE;

-- [3] OTP moi (sau khi giu cho): thanh toan A thanh cong
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[0]);
INSERT INTO t7_res SELECT 'pay_a', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='a'), '77770000-0000-4000-8000-000000000001'::uuid);
RESET ROLE;
SELECT is((SELECT res->>'status' FROM t7_res WHERE step='pay_a'), 'CONVERTED', 'OTP moi sau khi giu cho: thanh toan thanh cong');

-- [4] moc OTP duoc ghi vao giu cho da thanh toan
SELECT is((SELECT "MocOtpDaDung" FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='a')),
  floor(extract(epoch FROM now()))::numeric, 'Giu cho da thanh toan ghi lai moc OTP da dung');

-- [5] DUNG LAI cung OTP cho giu cho B: bi tu choi (moi OTP chi mot giao dich)
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[0]);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '77770000-0000-4000-8000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t7_res WHERE step='b')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan', 'Dung lai OTP da dung cho giao dich khac: bi tu choi');
RESET ROLE;

-- [6] giu cho B van ACTIVE (thanh toan that bai khong lam doi trang thai)
SELECT is((SELECT "TrangThai"::text FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='b')),
  'ACTIVE', 'Thanh toan B that bai: giu cho B van ACTIVE');

-- Gia lap thoi gian troi: giu cho B tao cach day 1 gio (de co the co OTP khac nhau, cu hon, cung hop le trong mot giao dich kiem thu)
UPDATE public."GIU_CHO" SET "NgayTao" = NOW() - INTERVAL '1 hour'
WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='b');

-- [7] amr co moc da dung (offset 0) va moc cu hon (offset 30): lay moc moi nhat = moc da dung -> bi tu choi
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[0, 30]);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '77770000-0000-4000-8000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t7_res WHERE step='b')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan', 'Moc moi nhat da dung roi (du con moc cu hon): bi tu choi');
RESET ROLE;

-- [8] OTP thuc su moi hon moc da dung cho A: ha moc cua A xuong cu hon 60 giay roi B dung moc moi nhat
UPDATE public."GIU_CHO" SET "MocOtpDaDung" = "MocOtpDaDung" - 60
WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[0, 60]);
INSERT INTO t7_res SELECT 'pay_b', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='b'), '77770000-0000-4000-8000-000000000001'::uuid);
RESET ROLE;
SELECT is((SELECT res->>'status' FROM t7_res WHERE step='pay_b'), 'CONVERTED', 'OTP khac (chua dung): thanh toan giu cho thu hai thanh cong');

-- [9] goi lai tren giu cho da thanh toan: idempotent, khong doi OTP
SET LOCAL ROLE authenticated;
SELECT pg_temp.jwt_nguoi_mua(ARRAY[]::INT[]);
SELECT is((SELECT public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t7_res WHERE step='a'), '77770000-0000-4000-8000-000000000001'::uuid)->>'daXacNhanTruoc'),
  'true', 'Goi lai tren giu cho da thanh toan: idempotent, khong doi OTP');
RESET ROLE;

-- [10] anon khong goi duoc moc_otp_moi_nhat
SELECT is(has_function_privilege('anon', 'public.moc_otp_moi_nhat()', 'EXECUTE'), FALSE, 'anon khong goi duoc moc_otp_moi_nhat');

SELECT * FROM finish();
ROLLBACK;
