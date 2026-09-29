-- Sprint 1 hardening: unpublished events and their dependent catalog data must
-- never be visible through the browser anon key.

ALTER TABLE public."SU_KIEN"
  ADD COLUMN IF NOT EXISTS "TrangThaiCongBo" VARCHAR(20) NOT NULL DEFAULT 'BAN_NHAP';

ALTER TABLE public."SU_KIEN"
  DROP CONSTRAINT IF EXISTS "chk_sukien_trangthaicongbo";

ALTER TABLE public."SU_KIEN"
  ADD CONSTRAINT "chk_sukien_trangthaicongbo"
  CHECK ("TrangThaiCongBo" IN ('BAN_NHAP', 'CONG_KHAI', 'DA_AN'));

-- Preserve the existing public demo event during this additive migration.
UPDATE public."SU_KIEN"
SET "TrangThaiCongBo" = 'CONG_KHAI'
WHERE "SuKienID" = 1;

DROP POLICY IF EXISTS "Public Read Access SU_KIEN" ON public."SU_KIEN";
CREATE POLICY "Public Read Published SU_KIEN"
ON public."SU_KIEN" FOR SELECT
USING ("TrangThaiCongBo" = 'CONG_KHAI');

DROP POLICY IF EXISTS "Public Read Access SU_KIEN_NGHE_SI" ON public."SU_KIEN_NGHE_SI";
CREATE POLICY "Public Read Published SU_KIEN_NGHE_SI"
ON public."SU_KIEN_NGHE_SI" FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "SU_KIEN_NGHE_SI"."SuKienID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

DROP POLICY IF EXISTS "Public Read Access LICH_TRINH" ON public."LICH_TRINH";
CREATE POLICY "Public Read Published LICH_TRINH"
ON public."LICH_TRINH" FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "LICH_TRINH"."SuKienID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

DROP POLICY IF EXISTS "Public Read Access KHU_VUC" ON public."KHU_VUC";
CREATE POLICY "Public Read Published KHU_VUC"
ON public."KHU_VUC" FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "KHU_VUC"."SuKienID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

DROP POLICY IF EXISTS "Public Read Access GHE" ON public."GHE";
CREATE POLICY "Public Read Published GHE"
ON public."GHE" FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public."KHU_VUC" kv
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = kv."SuKienID"
    WHERE kv."KhuVucID" = "GHE"."KhuVucID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

-- Artists may be reused across events. Only expose an artist when at least one
-- published event references it.
DROP POLICY IF EXISTS "Public Read Access NGHE_SI" ON public."NGHE_SI";
CREATE POLICY "Public Read Published NGHE_SI"
ON public."NGHE_SI" FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public."SU_KIEN_NGHE_SI" skns
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = skns."SuKienID"
    WHERE skns."NgheSiID" = "NGHE_SI"."NgheSiID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

