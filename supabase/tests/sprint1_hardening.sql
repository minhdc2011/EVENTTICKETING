-- Transactional acceptance tests for Sprint 1 database hardening.
-- Run in Supabase SQL Editor on a staging project after all migrations.
-- Every mutation is rolled back at the end.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition BOOLEAN,
  p_message TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, FALSE) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_message;
  END IF;
END;
$$;

-- Isolate tests from active demo holds without persisting the change.
UPDATE public."GIU_CHO"
SET "TrangThai" = 'RELEASED', "NgayCapNhat" = NOW()
WHERE "SuKienID" = 1 AND "TrangThai" = 'ACTIVE';

UPDATE public."GHE" AS g
SET "TrangThai" = 'TRONG'
FROM public."KHU_VUC" AS kv
WHERE g."KhuVucID" = kv."KhuVucID"
  AND kv."SuKienID" = 1
  AND g."MaGheDayDu" = 'VVIP-A-03';

UPDATE public."SU_KIEN"
SET
  "TrangThaiCongBo" = 'CONG_KHAI',
  "TrangThaiMoBan" = 'DANG_MO_BAN',
  "ThoiGianMoBanVe" = NOW() - INTERVAL '1 minute',
  "ThoiGianDongBanVe" = NOW() + INTERVAL '1 hour'
WHERE "SuKienID" = 1;

-- An anon browser session can hold one available seat while the sale is open.
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.tao_giu_cho(
    1,
    '10000000-0000-0000-0000-000000000001'::UUID,
    '[{"ticketCode":"VVIP-A-03","zoneCode":"VVIP_DIAMOND"}]'::JSONB
  );
  IF v_result->>'status' <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: open sale did not create an active hold';
  END IF;
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT "TrangThai" = 'DANG_GIU' FROM public."GHE" WHERE "MaGheDayDu" = 'VVIP-A-03'),
  'seat must be DANG_GIU after a successful hold'
);

-- A second browser session cannot obtain the same seat.
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.tao_giu_cho(
      1,
      '20000000-0000-0000-0000-000000000002'::UUID,
      '[{"ticketCode":"VVIP-A-03","zoneCode":"VVIP_DIAMOND"}]'::JSONB
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_rejected := TRUE;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: competing hold was not rejected';
  END IF;
END;
$$;
RESET ROLE;

-- Server cleanup expires the hold and reopens its seat.
UPDATE public."GIU_CHO"
SET "HetHanLuc" = NOW() - INTERVAL '1 second'
WHERE "SuKienID" = 1 AND "TrangThai" = 'ACTIVE';

SELECT public.expire_seat_holds(1);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public."GIU_CHO"
    WHERE "SuKienID" = 1 AND "TrangThai" = 'ACTIVE' AND "HetHanLuc" <= NOW()
  ),
  'expired holds must not remain ACTIVE'
);

SELECT pg_temp.assert_true(
  (SELECT "TrangThai" = 'TRONG' FROM public."GHE" WHERE "MaGheDayDu" = 'VVIP-A-03'),
  'expired seated hold must reopen its seat'
);

-- Standing capacity is enforced transactionally. Capacity is reduced only
-- inside this rolled-back test so no staging data is permanently changed.
UPDATE public."KHU_VUC"
SET "TongSoGhe" = 4
WHERE "SuKienID" = 1 AND "MaKhuVuc" = 'GA_STAND_1';

SET LOCAL ROLE anon;
SELECT public.tao_giu_cho(
  1,
  '30000000-0000-0000-0000-000000000003'::UUID,
  '[{"ticketCode":"GA-TEST-01","zoneCode":"GA_STAND_1","quantity":4}]'::JSONB
);

DO $$
DECLARE
  v_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.tao_giu_cho(
      1,
      '40000000-0000-0000-0000-000000000004'::UUID,
      '[{"ticketCode":"GA-TEST-02","zoneCode":"GA_STAND_1","quantity":1}]'::JSONB
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_rejected := TRUE;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: standing capacity overflow was accepted';
  END IF;
END;
$$;
RESET ROLE;

-- Future, closed, sold-out and unpublished events must be rejected by the RPC,
-- even when a caller bypasses the frontend.
UPDATE public."SU_KIEN"
SET "ThoiGianMoBanVe" = NOW() + INTERVAL '1 hour',
    "ThoiGianDongBanVe" = NOW() + INTERVAL '2 hours',
    "TrangThaiMoBan" = 'SAP_MO_BAN'
WHERE "SuKienID" = 1;

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.tao_giu_cho(1, gen_random_uuid(), '[{"ticketCode":"GA-FUTURE","zoneCode":"GA_STAND_1"}]');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: future sale accepted a hold';
  END IF;
END;
$$;
RESET ROLE;

UPDATE public."SU_KIEN"
SET "ThoiGianMoBanVe" = NOW() - INTERVAL '2 hours',
    "ThoiGianDongBanVe" = NOW() - INTERVAL '1 hour',
    "TrangThaiMoBan" = 'DONG_BAN'
WHERE "SuKienID" = 1;

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.tao_giu_cho(1, gen_random_uuid(), '[{"ticketCode":"GA-CLOSED","zoneCode":"GA_STAND_1"}]');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: closed sale accepted a hold';
  END IF;
END;
$$;
RESET ROLE;

UPDATE public."SU_KIEN"
SET "ThoiGianMoBanVe" = NOW() - INTERVAL '1 hour',
    "ThoiGianDongBanVe" = NOW() + INTERVAL '1 hour',
    "TrangThaiMoBan" = 'HET_VE'
WHERE "SuKienID" = 1;

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.tao_giu_cho(1, gen_random_uuid(), '[{"ticketCode":"GA-SOLD","zoneCode":"GA_STAND_1"}]');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: sold-out event accepted a hold';
  END IF;
END;
$$;
RESET ROLE;

UPDATE public."SU_KIEN"
SET "TrangThaiCongBo" = 'BAN_NHAP',
    "TrangThaiMoBan" = 'DANG_MO_BAN'
WHERE "SuKienID" = 1;

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_visible_count INT;
  v_rejected BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_visible_count
  FROM public."SU_KIEN"
  WHERE "SuKienID" = 1;

  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon can read an unpublished event';
  END IF;

  BEGIN
    PERFORM public.tao_giu_cho(1, gen_random_uuid(), '[{"ticketCode":"GA-DRAFT","zoneCode":"GA_STAND_1"}]');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: unpublished event accepted a hold';
  END IF;
END;
$$;
RESET ROLE;

-- The scheduler must be registered by the migration.
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'eventticketing-expire-seat-holds'
  ),
  'expiry cron job is not registered'
);

ROLLBACK;

SELECT 'SPRINT 1 DATABASE ACCEPTANCE TESTS PASSED' AS result;
