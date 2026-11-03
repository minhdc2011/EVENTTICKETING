-- Restrict writes on CAU_HINH_SU_KIEN to organization editors.
-- Before: "Members manage event configuration" allowed every member
-- (including read-only roles VAN_HANH, SOAT_VE) to INSERT/UPDATE/DELETE.
-- After: same rule as SU_KIEN, SUAT_DIEN, KHU_VUC, GHE (co_quyen_bien_tap_to_chuc).

DROP POLICY IF EXISTS "Members manage event configuration" ON public."CAU_HINH_SU_KIEN";
DROP POLICY IF EXISTS "Editors manage event configuration" ON public."CAU_HINH_SU_KIEN";

CREATE POLICY "Editors manage event configuration"
ON public."CAU_HINH_SU_KIEN" FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID"
      AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID"
      AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
  )
);
