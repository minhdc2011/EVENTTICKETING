-- Server-side seat generation + narrower write access on public."GHE" (NFR-09, BR-02.7).
--
-- Before: the browser created missing GHE rows after saving (ensureSeatsForSeatedTiers) and the
-- policy "Editors manage show seats" was FOR ALL, so any organizer editor could write
-- "TrangThai" (including DA_BAN / DANG_GIU) straight into the table and bypass the hold RPCs.
--
-- After:
--   1. public.dong_bo_ghe_su_kien(event) creates the missing seats of every GHE_NGOI zone in one
--      set-based statement per zone, and trims surplus seats ONLY when they are free (TRONG) and
--      not referenced by any hold detail. Sold / held seats are never touched.
--   2. public.luu_su_kien_toan_dien(JSONB) keeps its signature but now runs the original body
--      (renamed to luu_su_kien_toan_dien_core) and then the seat sync inside ONE statement, i.e.
--      one transaction: if seat generation fails (e.g. > 50,000 seats), the whole save rolls back.
--   3. Editors lose direct INSERT/UPDATE/DELETE on GHE. They can still read their organization's
--      seats; seat state changes only through the hold / sale RPCs.
--
-- The migration is idempotent and safe to replay.

-- ---------------------------------------------------------------------------
-- 1. Row label helper: 0 -> A, 25 -> Z, 26 -> AA ... (same as src/domain/seatGeneration.js)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nhan_hang_ghe(p_index INT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n INT := GREATEST(0, COALESCE(p_index, 0));
  v_label TEXT := '';
BEGIN
  LOOP
    v_label := chr(65 + (v_n % 26)) || v_label;
    v_n := (v_n / 26) - 1;
    EXIT WHEN v_n < 0;
  END LOOP;
  RETURN v_label;
END;
$$;

REVOKE ALL ON FUNCTION public.nhan_hang_ghe(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nhan_hang_ghe(INT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Seat synchronisation for one event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dong_bo_ghe_su_kien(p_su_kien_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_seats_per_row CONSTANT INT := 10;
  c_max_seats CONSTANT INT := 50000; -- BR-02.7

  v_org_id UUID;
  v_total_seated BIGINT;
  v_zone RECORD;
  v_existing INT;
  v_missing INT;
  v_surplus INT;
  v_changed BIGINT;
  v_inserted BIGINT := 0;
  v_removed BIGINT := 0;
  v_zones INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de quan ly su kien' USING ERRCODE = '42501';
  END IF;

  -- Serialise concurrent syncs of the same event.
  SELECT "ToChucID" INTO v_org_id
  FROM public."SU_KIEN"
  WHERE "SuKienID" = p_su_kien_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Khong tim thay su kien de dong bo ghe' USING ERRCODE = 'P0002';
  END IF;
  IF v_org_id IS NULL OR NOT public.co_quyen_bien_tap_to_chuc(v_org_id) THEN
    RAISE EXCEPTION 'Khong co quyen bien tap su kien cua to chuc' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM("TongSoGhe"), 0) INTO v_total_seated
  FROM public."KHU_VUC"
  WHERE "SuKienID" = p_su_kien_id AND "LoaiKhuVuc" = 'GHE_NGOI';

  IF v_total_seated > c_max_seats THEN
    RAISE EXCEPTION 'Tong so ghe ngoi toi da % moi su kien (hien la %)', c_max_seats, v_total_seated
      USING ERRCODE = '22023';
  END IF;

  FOR v_zone IN
    SELECT "KhuVucID", "MaKhuVuc", "TongSoGhe"
    FROM public."KHU_VUC"
    WHERE "SuKienID" = p_su_kien_id AND "LoaiKhuVuc" = 'GHE_NGOI'
    ORDER BY "KhuVucID"
    FOR UPDATE
  LOOP
    v_zones := v_zones + 1;

    SELECT COUNT(*)::INT INTO v_existing
    FROM public."GHE" WHERE "KhuVucID" = v_zone."KhuVucID";

    v_missing := GREATEST(0, COALESCE(v_zone."TongSoGhe", 0) - v_existing);
    v_surplus := GREATEST(0, v_existing - GREATEST(0, COALESCE(v_zone."TongSoGhe", 0)));

    IF v_missing > 0 THEN
      -- Fill the first free seat codes (gaps first). Only the missing amount is added, and a
      -- replay finds nothing missing, so the function is idempotent.
      WITH cand AS (
        SELECT
          n,
          public.nhan_hang_ghe(n / c_seats_per_row) AS hang,
          lpad(((n % c_seats_per_row) + 1)::TEXT, 2, '0') AS so
        FROM generate_series(0, COALESCE(v_zone."TongSoGhe", 0) + v_existing - 1) AS n
      )
      INSERT INTO public."GHE" ("KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
      SELECT v_zone."KhuVucID", c.hang, c.so, v_zone."MaKhuVuc" || '-' || c.hang || '-' || c.so, 'TRONG'
      FROM cand c
      WHERE NOT EXISTS (
        SELECT 1 FROM public."GHE" g
        WHERE g."KhuVucID" = v_zone."KhuVucID"
          AND g."MaGheDayDu" = v_zone."MaKhuVuc" || '-' || c.hang || '-' || c.so
      )
      ORDER BY c.n
      LIMIT v_missing
      ON CONFLICT ("KhuVucID", "MaGheDayDu") DO NOTHING;

      GET DIAGNOSTICS v_changed = ROW_COUNT;
      v_inserted := v_inserted + v_changed;
    ELSIF v_surplus > 0 THEN
      -- Capacity was reduced: remove only surplus seats that are free and not part of any hold.
      -- SKIP LOCKED leaves seats that a concurrent hold is touching right now.
      DELETE FROM public."GHE"
      WHERE "GheID" IN (
        SELECT g."GheID"
        FROM public."GHE" g
        WHERE g."KhuVucID" = v_zone."KhuVucID"
          AND g."TrangThai" = 'TRONG'
          AND NOT EXISTS (
            SELECT 1 FROM public."CHI_TIET_GIU_CHO" d WHERE d."GheID" = g."GheID"
          )
        ORDER BY length(g."SoHang") DESC, g."SoHang" DESC, g."SoGhe" DESC, g."GheID" DESC
        LIMIT v_surplus
        FOR UPDATE SKIP LOCKED
      );

      GET DIAGNOSTICS v_changed = ROW_COUNT;
      v_removed := v_removed + v_changed;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'eventId', p_su_kien_id,
    'seatedZones', v_zones,
    'inserted', v_inserted,
    'removed', v_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dong_bo_ghe_su_kien(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dong_bo_ghe_su_kien(INT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Save RPC: original body + seat sync in the same transaction
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.luu_su_kien_toan_dien_core(jsonb)') IS NULL THEN
    ALTER FUNCTION public.luu_su_kien_toan_dien(JSONB) RENAME TO luu_su_kien_toan_dien_core;
  END IF;
END;
$$;

-- The core is an internal building block: only the wrapper (SECURITY DEFINER) calls it.
REVOKE ALL ON FUNCTION public.luu_su_kien_toan_dien_core(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.luu_su_kien_toan_dien(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_seats JSONB;
BEGIN
  v_result := public.luu_su_kien_toan_dien_core(p_payload);
  -- Any error here (e.g. more than 50,000 seats) aborts the whole call, including the save above.
  v_seats := public.dong_bo_ghe_su_kien((v_result->>'eventId')::INT);
  RETURN v_result || jsonb_build_object('seats', v_seats);
END;
$$;

REVOKE ALL ON FUNCTION public.luu_su_kien_toan_dien(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_su_kien_toan_dien(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Narrow direct access to GHE (NFR-09)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Editors manage show seats" ON public."GHE";

-- Defence in depth: even without a policy, remove the table privileges used for direct writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."GHE" FROM PUBLIC, anon, authenticated;

-- Members still read their organization's seats; the public keeps reading seats of published shows.
-- ("Members read show seats" and the public read policies are defined in earlier migrations.)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'GHE'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['authenticated', 'anon', 'public']::name[]
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: a write policy on GHE is still open to authenticated/anon';
  END IF;
  IF has_table_privilege('authenticated', 'public."GHE"', 'UPDATE') THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated can still UPDATE GHE';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
