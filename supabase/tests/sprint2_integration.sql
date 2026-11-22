-- pgTAP end-to-end integration test: Sprint 2 OTP gate, per-account/event
-- ticket limit, frozen hold price (DonGiaChot), and price proposal approval.
-- Migrations under test:
--   20261113093000_sprint2_pricing_guard.sql  (luu_de_xuat_gia)
--   20261114090000_sprint2_price_approval.sql (duyet_de_xuat_gia)
--   20261115090000_sprint2_otp_limit_hold.sql (da_xac_minh_otp, tao_giu_cho_theo_suat)
--   20260927120000_secure_seat_holds.sql      (huy_giu_cho)
--
-- STATUS: authored only. This file has NOT been run (`npm run check` does NOT
-- execute SQL or pgTAP); it requires `npm run db:reset && npm run db:test`
-- against a migrated Postgres instance. No latency has been measured.
--
-- All fixtures are created inside BEGIN ... ROLLBACK (no dependency on seed.sql).
-- Fixture map (IDs 9961xx; UUIDs 66666666-...; slugs t3-int-*):
--   Users (auth.users + HO_SO_NGUOI_DUNG):
--     ...0001  t3-int-owner@example.com   ORGANIZER (CHU_SO_HUU of org a1)
--     ...0011  t3-int-buyer1@example.com  USER
--     ...0012  t3-int-buyer2@example.com  USER
--   Org:     66666666-0000-4666-8666-0000000000a1 (t3-int-org)
--   Event:   996101 (CONG_KHAI, DANG_MO_BAN, open sale window, OTP=TRUE, limit=4)
--   Show:    996101 (DANG_MO_BAN, open sale window)
--   Zone:    996101 (T3_INT_STAND, DUNG_STAND, GiaVeNiemYet=200000, TongSoGhe=50)
--   Rule:    996101 (GiaGoc=200000, GiaSan=140000, GiaTran=300000, active)

BEGIN;

SELECT plan(23);

-- ============================================================================
-- Fixtures (postgres; rolled back at end)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('66666666-6666-4666-8666-000000000001', 'authenticated', 'authenticated', 't3-int-owner@example.com'),
  ('66666666-6666-4666-8666-000000000011', 'authenticated', 'authenticated', 't3-int-buyer1@example.com'),
  ('66666666-6666-4666-8666-000000000012', 'authenticated', 'authenticated', 't3-int-buyer2@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('66666666-6666-4666-8666-000000000001', 'T3 Int Owner', 'ORGANIZER'),
  ('66666666-6666-4666-8666-000000000011', 'T3 Int Buyer 1', 'USER'),
  ('66666666-6666-4666-8666-000000000012', 'T3 Int Buyer 2', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('66666666-0000-4666-8666-0000000000a1', 'T3 Int Org', 't3-int-org')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('66666666-0000-4666-8666-0000000000a1', '66666666-6666-4666-8666-000000000001', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID",
  "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe",
  "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  996101, 'T3 Integration Event', 't3-int-event', '66666666-0000-4666-8666-0000000000a1',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
  'Ha Noi', 'San T3 Int',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien",
  "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe",
  "TrangThai"
) VALUES (
  996101, 996101, 't3-int-s1', 'T3 Int Show 1',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
  'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc",
  "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES (
  996101, 996101, 996101, 'T3_INT_STAND', 'T3 Int Standing',
  'DUNG_STAND', 200000.00, '#112233', 50
);

INSERT INTO public."QUY_TAC_GIA" (
  "QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran",
  "BuocNhayGia", "BienDoToiDaMoiChuKy", "TrangThaiKichHoat"
) VALUES (
  996101, 996101, 200000.00, 140000.00, 300000.00,
  10000.00, 0.2000, TRUE
);

-- Cong bo su kien (trigger can quyen bien tap va suat/khu hop le) roi ghi cau hinh.
-- trg_kiem_soat_cau_hinh_mua_ve audits non-default values (4/FALSE) and requires
-- an authenticated CHU_SO_HUU/QUAN_TRI JWT on INSERT.
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000001', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"66666666-6666-4666-8666-000000000001"}', true);

UPDATE public."SU_KIEN" SET "TrangThaiCongBo" = 'CONG_KHAI' WHERE "SuKienID" = 996101;

INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP")
VALUES (996101, 4, TRUE);

SELECT set_config('request.jwt.claim.role', '', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '', true);

CREATE TEMP TABLE t3_int_res (
  step TEXT PRIMARY KEY,
  res JSONB NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE t3_int_err (
  step TEXT PRIMARY KEY,
  sqlstate_code TEXT,
  msg TEXT,
  detail_json JSONB
) ON COMMIT DROP;

GRANT SELECT, INSERT ON t3_int_res, t3_int_err TO authenticated;

-- ============================================================================
-- (a) Function existence & current signatures (1..3)
-- ============================================================================
-- [1]
SELECT has_function(
  'public',
  'tao_giu_cho_theo_suat',
  ARRAY['bigint', 'uuid', 'jsonb'],
  'tao_giu_cho_theo_suat(bigint, uuid, jsonb) exists'
);

-- [2]
SELECT has_function(
  'public',
  'duyet_de_xuat_gia',
  ARRAY['bigint', 'text', 'numeric'],
  'duyet_de_xuat_gia(bigint, text, numeric) exists'
);

-- [3]
SELECT has_function(
  'public',
  'da_xac_minh_otp',
  ARRAY[]::text[],
  'da_xac_minh_otp() exists'
);

-- ============================================================================
-- (b) OTP check and hold enforcement via RPC (4..7)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000011', true),
       set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', '66666666-6666-4666-8666-000000000011',
           'role', 'authenticated'
         )::text,
         true
       );

-- [4]
SELECT is(
  public.da_xac_minh_otp(),
  FALSE,
  'da_xac_minh_otp() is FALSE when JWT has no amr claim'
);

-- [5]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(
       996101,
       '66666666-0000-0000-0000-000000000001'::uuid,
       '[{"ticketCode":"T3-INT-NOOTP","zoneCode":"T3_INT_STAND","quantity":1}]'::jsonb
     ) $$,
  '42501',
  'Can xac minh OTP de giu cho',
  'Hold without OTP amr rejects with 42501'
);

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '66666666-6666-4666-8666-000000000011',
    'role', 'authenticated',
    'amr', json_build_array(
      json_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::bigint)
    )
  )::text,
  true
);

-- [6]
SELECT is(
  public.da_xac_minh_otp(),
  TRUE,
  'da_xac_minh_otp() is TRUE when JWT amr has otp method within 24h'
);
RESET ROLE;

-- [7]
SELECT is(
  (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 996101),
  0,
  'Rejected OTP hold leaves 0 GIU_CHO rows for event 996101'
);

-- ============================================================================
-- (c) Hold 3 succeeds; request 2 more -> VUOT_GIOI_HAN_VE + DETAIL + unchanged counts (8..11)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000011', true),
       set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', '66666666-6666-4666-8666-000000000011',
           'role', 'authenticated',
           'amr', json_build_array(
             json_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::bigint)
           )
         )::text,
         true
       );

INSERT INTO t3_int_res
SELECT 'h1_hold3',
       public.tao_giu_cho_theo_suat(
         996101,
         '66666666-0000-0000-0000-000000000002'::uuid,
         '[{"ticketCode":"T3-INT-H1","zoneCode":"T3_INT_STAND","quantity":3}]'::jsonb
       );

-- [8]
SELECT is(
  (SELECT res->>'status' FROM t3_int_res WHERE step = 'h1_hold3'),
  'ACTIVE',
  'Buyer 1 hold H1 of 3 tickets succeeds with ACTIVE'
);

-- [9]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(
       996101,
       '66666666-0000-0000-0000-000000000003'::uuid,
       '[{"ticketCode":"T3-INT-H1-OVER","zoneCode":"T3_INT_STAND","quantity":2}]'::jsonb
     ) $$,
  '22023',
  'VUOT_GIOI_HAN_VE',
  'Buyer 1 requesting 2 more after holding 3 throws 22023 VUOT_GIOI_HAN_VE'
);

DO $$
DECLARE
  v_state TEXT;
  v_msg TEXT;
  v_detail TEXT;
BEGIN
  PERFORM public.tao_giu_cho_theo_suat(
    996101,
    '66666666-0000-0000-0000-000000000004'::uuid,
    '[{"ticketCode":"T3-INT-H1-DETAIL","zoneCode":"T3_INT_STAND","quantity":2}]'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_msg = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  INSERT INTO t3_int_err (step, sqlstate_code, msg, detail_json)
  VALUES ('limit_over', v_state, v_msg, v_detail::jsonb);
END;
$$;
RESET ROLE;

-- [10]
SELECT is(
  (SELECT ROW(
     sqlstate_code,
     msg,
     (detail_json->>'gioiHan')::int,
     (detail_json->>'dangGiu')::int,
     (detail_json->>'conLai')::int
   )
   FROM t3_int_err WHERE step = 'limit_over'),
  ROW('22023'::text, 'VUOT_GIOI_HAN_VE'::text, 4, 3, 1),
  'VUOT_GIOI_HAN_VE DETAIL reports gioiHan=4, dangGiu=3, conLai=1'
);

-- [11]
SELECT is(
  (SELECT ROW(
     (SELECT count(*)::int FROM public."GIU_CHO"
      WHERE "SuKienID" = 996101 AND "NguoiDungID" = '66666666-6666-4666-8666-000000000011'),
     (SELECT count(*)::int FROM public."CHI_TIET_GIU_CHO" ct
      JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE gc."SuKienID" = 996101 AND gc."NguoiDungID" = '66666666-6666-4666-8666-000000000011'),
     (SELECT COALESCE(SUM(ct."SoLuong"), 0)::int FROM public."CHI_TIET_GIU_CHO" ct
      JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE gc."SuKienID" = 996101 AND gc."NguoiDungID" = '66666666-6666-4666-8666-000000000011')
   )),
  ROW(1, 1, 3),
  'Over-limit rejections leave GIU_CHO (1), CHI_TIET_GIU_CHO (1), and held qty (3) unchanged'
);

-- ============================================================================
-- (d) Release via huy_giu_cho and expiry via HetHanLuc; new hold of 2 succeeds (12..15)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000011', true),
       set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', '66666666-6666-4666-8666-000000000011',
           'role', 'authenticated',
           'amr', json_build_array(
             json_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::bigint)
           )
         )::text,
         true
       );

-- [12]
SELECT is(
  public.huy_giu_cho(
    (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'h1_hold3'),
    '66666666-0000-0000-0000-000000000002'::uuid
  ),
  TRUE,
  'huy_giu_cho releases H1 and returns TRUE'
);

INSERT INTO t3_int_res
SELECT 'h2_after_release',
       public.tao_giu_cho_theo_suat(
         996101,
         '66666666-0000-0000-0000-000000000005'::uuid,
         '[{"ticketCode":"T3-INT-H2","zoneCode":"T3_INT_STAND","quantity":2}]'::jsonb
       );

-- [13]
SELECT is(
  (SELECT res->>'status' FROM t3_int_res WHERE step = 'h2_after_release'),
  'ACTIVE',
  'Buyer 1 new hold H2 of 2 tickets succeeds after huy_giu_cho released H1'
);

-- Also verify expiry path with buyer_2: hold 3, backdate HetHanLuc as postgres, then hold 2
SELECT set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000012', true),
       set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', '66666666-6666-4666-8666-000000000012',
           'role', 'authenticated',
           'amr', json_build_array(
             json_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::bigint)
           )
         )::text,
         true
       );

INSERT INTO t3_int_res
SELECT 'b2_exp_hold',
       public.tao_giu_cho_theo_suat(
         996101,
         '66666666-0000-0000-0000-000000000006'::uuid,
         '[{"ticketCode":"T3-INT-B2-EXP","zoneCode":"T3_INT_STAND","quantity":3}]'::jsonb
       );
RESET ROLE;

UPDATE public."GIU_CHO"
   SET "HetHanLuc" = NOW() - INTERVAL '1 second'
 WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'b2_exp_hold');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000012', true),
       set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', '66666666-6666-4666-8666-000000000012',
           'role', 'authenticated',
           'amr', json_build_array(
             json_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::bigint)
           )
         )::text,
         true
       );

INSERT INTO t3_int_res
SELECT 'b2_after_expire',
       public.tao_giu_cho_theo_suat(
         996101,
         '66666666-0000-0000-0000-000000000007'::uuid,
         '[{"ticketCode":"T3-INT-B2-NEW","zoneCode":"T3_INT_STAND","quantity":2}]'::jsonb
       );
RESET ROLE;

-- [14]
SELECT is(
  (SELECT res->>'status' FROM t3_int_res WHERE step = 'b2_after_expire'),
  'ACTIVE',
  'Buyer 2 new hold of 2 succeeds after prior 3-ticket hold expired'
);

-- [15]
SELECT is(
  (SELECT "TrangThai"::text FROM public."GIU_CHO"
   WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'b2_exp_hold')),
  'EXPIRED'::text,
  'Expired buyer_2 hold transitioned to EXPIRED'
);

-- ============================================================================
-- (e) Frozen DonGiaChot, PENDING via luu_de_xuat_gia, approval via duyet_de_xuat_gia (16..23)
-- ============================================================================
-- [16] Pre-approval holds H1 and H2 recorded DonGiaChot equal to listed price 200000
SELECT is(
  (SELECT ROW(
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct
      WHERE ct."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'h1_hold3')),
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct
      WHERE ct."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'h2_after_release'))
   )),
  ROW(200000.00::numeric, 200000.00::numeric),
  'Pre-approval holds H1 and H2 recorded DonGiaChot = 200000 (initial GiaVeNiemYet)'
);

-- Create PENDING proposal via the real luu_de_xuat_gia RPC as the org owner
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000001', true),
       set_config(
         'request.jwt.claims',
         '{"sub":"66666666-6666-4666-8666-000000000001","role":"authenticated"}'::text,
         true
       );

INSERT INTO t3_int_res
SELECT 'luu_dx',
       public.luu_de_xuat_gia(
         996101,
         996101::bigint,
         (SELECT "NgayCapNhat" FROM public."QUY_TAC_GIA" WHERE "QuyTacGiaID" = 996101),
         220000,
         220000,
         'T3 integration test tang gia'
       );
RESET ROLE;

-- [17]
SELECT is(
  (SELECT res->>'ketQua' FROM t3_int_res WHERE step = 'luu_dx'),
  'DA_LUU',
  'luu_de_xuat_gia as org owner creates a PENDING proposal (DA_LUU)'
);

-- [18]
SELECT is(
  (SELECT ROW(
     kv."GiaVeNiemYet"::numeric,
     dx."TrangThaiDuyet"::text,
     (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 996101)
   )
   FROM public."KHU_VUC" kv
   JOIN public."DE_XUAT_GIA" dx ON dx."KhuVucID" = kv."KhuVucID"
   WHERE kv."KhuVucID" = 996101
     AND dx."DeXuatID" = (SELECT (res->>'deXuatId')::bigint FROM t3_int_res WHERE step = 'luu_dx')),
  ROW(200000.00::numeric, 'PENDING'::text, 0),
  'Before approval: GiaVeNiemYet stays 200000, proposal is PENDING, 0 NHAT_KY_GIA rows'
);

-- Approve proposal as org owner via duyet_de_xuat_gia
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000001', true),
       set_config(
         'request.jwt.claims',
         '{"sub":"66666666-6666-4666-8666-000000000001","role":"authenticated"}'::text,
         true
       );

INSERT INTO t3_int_res
SELECT 'duyet_dx',
       public.duyet_de_xuat_gia(
         (SELECT (res->>'deXuatId')::bigint FROM t3_int_res WHERE step = 'luu_dx'),
         NULL
       );
RESET ROLE;

-- [19]
SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaCu')::numeric, (res->>'giaMoi')::numeric)
   FROM t3_int_res WHERE step = 'duyet_dx'),
  ROW('DA_DUYET'::text, 200000::numeric, 220000::numeric),
  'duyet_de_xuat_gia returns DA_DUYET with giaCu=200000 and giaMoi=220000'
);

-- [20]
SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 996101),
  220000.00::numeric,
  'After approval: KHU_VUC.GiaVeNiemYet updated to 220000.00'
);

-- [21] Price approval audit log is public."NHAT_KY_GIA" (20261114090000); NHAT_KY_DINH_GIA is for rule/block logs.
SELECT is(
  (SELECT ROW(
     count(*)::int,
     MIN(nk."GiaCu")::numeric,
     MIN(nk."GiaMoi")::numeric,
     MIN(nk."NhatKyGiaID")::text
   )
   FROM public."NHAT_KY_GIA" nk
   WHERE nk."KhuVucID" = 996101),
  ROW(
    1,
    200000.00::numeric,
    220000.00::numeric,
    (SELECT res->>'nhatKyGiaId' FROM t3_int_res WHERE step = 'duyet_dx')
  ),
  'After approval: 1 new NHAT_KY_GIA row matching nhatKyGiaId (200000 -> 220000)'
);

-- [22] Pre-approval CHI_TIET_GIU_CHO.DonGiaChot remains frozen at 200000.00
SELECT is(
  (SELECT ROW(
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct
      WHERE ct."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'h1_hold3')),
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct
      WHERE ct."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'h2_after_release'))
   )),
  ROW(200000.00::numeric, 200000.00::numeric),
  'Pre-approval holds H1 and H2 keep DonGiaChot frozen at 200000.00 after approval'
);

-- Create a post-approval hold H3 as buyer_1 (currently holds 2 from H2, limit 4 -> +1 = 3)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-000000000011', true),
       set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', '66666666-6666-4666-8666-000000000011',
           'role', 'authenticated',
           'amr', json_build_array(
             json_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::bigint)
           )
         )::text,
         true
       );

INSERT INTO t3_int_res
SELECT 'h3_after_approve',
       public.tao_giu_cho_theo_suat(
         996101,
         '66666666-0000-0000-0000-000000000008'::uuid,
         '[{"ticketCode":"T3-INT-H3","zoneCode":"T3_INT_STAND","quantity":1}]'::jsonb
       );
RESET ROLE;

-- [23]
SELECT is(
  (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct
   WHERE ct."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_int_res WHERE step = 'h3_after_approve')),
  220000.00::numeric,
  'Post-approval hold H3 freezes DonGiaChot at the new price 220000.00'
);

SELECT * FROM finish();
ROLLBACK;
