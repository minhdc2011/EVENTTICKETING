-- Product Foundation acceptance tests. Run after all migrations in Supabase SQL
-- Editor on staging. All fixture changes are rolled back.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_message TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT COALESCE(p_condition, FALSE) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public."SU_KIEN" WHERE "SuKienID" = 1 AND "Slug" = 'super-concert-2026'),
  'legacy event was not backfilled with a stable slug'
);
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public."SUAT_DIEN" WHERE "SuKienID" = 1 AND "Slug" = 'dem-chinh'),
  'legacy event was not backfilled with its default show'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public."KHU_VUC" WHERE "SuatDienID" IS NULL),
  'legacy zones were not assigned to a show'
);

INSERT INTO public."SU_KIEN" (
  "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  'Product Foundation Draft', 'product-foundation-draft',
  '00000000-0000-0000-0000-000000000001', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() + INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Hà Nội', 'Demo Venue',
  'SAP_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
)
SELECT "SuKienID", 'suat-1', 'Suất 1', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
       NOW() + INTERVAL '1 day', NOW() + INTERVAL '9 days', 'SAP_MO_BAN'
FROM public."SU_KIEN" WHERE "Slug" = 'product-foundation-draft';

INSERT INTO public."SUAT_DIEN" (
  "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
)
SELECT "SuKienID", 'suat-2', 'Suất 2', NOW() + INTERVAL '11 days', NOW() + INTERVAL '11 days 3 hours',
       NOW() + INTERVAL '1 day', NOW() + INTERVAL '10 days', 'SAP_MO_BAN'
FROM public."SU_KIEN" WHERE "Slug" = 'product-foundation-draft';

INSERT INTO public."KHU_VUC" (
  "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
)
SELECT sk."SuKienID", sd."SuatDienID", 'ZONE_DRAFT', 'Khu Bản Nháp', 'DUNG_STAND', 100000, '#00ff00', 500
FROM public."SU_KIEN" sk
JOIN public."SUAT_DIEN" sd ON sd."SuKienID" = sk."SuKienID"
WHERE sk."Slug" = 'product-foundation-draft'
LIMIT 1;

INSERT INTO public."GHE" (
  "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai"
)
SELECT kv."KhuVucID", 'A', '01', 'DRAFT-A-01', 'TRONG'
FROM public."KHU_VUC" kv
JOIN public."SU_KIEN" sk ON sk."SuKienID" = kv."SuKienID"
WHERE sk."Slug" = 'product-foundation-draft';

SELECT pg_temp.assert_true(
  (SELECT COUNT(*) = 2 FROM public."SUAT_DIEN" sd JOIN public."SU_KIEN" sk USING ("SuKienID")
   WHERE sk."Slug" = 'product-foundation-draft'),
  'Event 1:N Show relationship is not operational'
);

-- Capture known fixture IDs before switching role so assertions query tables directly without joins
SELECT set_config('app.test_draft_event_id', "SuKienID"::text, true)
FROM public."SU_KIEN" WHERE "Slug" = 'product-foundation-draft';

SELECT set_config('app.test_draft_show_id', "SuatDienID"::text, true)
FROM public."SUAT_DIEN"
WHERE "Slug" = 'suat-1' AND "SuKienID" = current_setting('app.test_draft_event_id')::int;

SELECT set_config('app.test_draft_zone_id', "KhuVucID"::text, true)
FROM public."KHU_VUC"
WHERE "MaKhuVuc" = 'ZONE_DRAFT' AND "SuKienID" = current_setting('app.test_draft_event_id')::int;

SELECT set_config('app.test_draft_seat_id', "GheID"::text, true)
FROM public."GHE"
WHERE "MaGheDayDu" = 'DRAFT-A-01' AND "KhuVucID" = current_setting('app.test_draft_zone_id')::int;

-- Under anon role, all draft elements must remain strictly hidden when queried directly by ID
SET LOCAL ROLE anon;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public."SU_KIEN"
    WHERE "SuKienID" = current_setting('app.test_draft_event_id')::int
  ),
  'anonymous user can directly read draft event by ID'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public."SUAT_DIEN"
    WHERE "SuatDienID" = current_setting('app.test_draft_show_id')::bigint
  ),
  'anonymous user can directly read draft show by ID'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public."KHU_VUC"
    WHERE "KhuVucID" = current_setting('app.test_draft_zone_id')::int
  ),
  'anonymous user can directly read draft zone by ID'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public."GHE"
    WHERE "GheID" = current_setting('app.test_draft_seat_id')::int
  ),
  'anonymous user can directly read draft seat by ID'
);

-- Under anon role, published Event 1 and its published show must remain accessible
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public."SU_KIEN" WHERE "SuKienID" = 1 AND "TrangThaiCongBo" = 'CONG_KHAI'),
  'anonymous user cannot read published event 1'
);
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public."SUAT_DIEN" WHERE "SuKienID" = 1 AND "Slug" = 'dem-chinh' AND "TrangThai" <> 'BAN_NHAP'),
  'anonymous user cannot read published show for event 1'
);

RESET ROLE;

ROLLBACK;
SELECT 'PRODUCT FOUNDATION ACCEPTANCE TESTS PASSED' AS result;
