-- Sprint 2 - Ghi thoi diem ghe thay doi trang thai (phuc vu so lieu toc do ban).
--
-- "NgayCapNhatTrangThai" la NULL cho ghe chua tung doi trang thai: khong backfill
-- thoi diem ban gia cho ghe cu, va INSERT (vd. dong_bo_ghe_su_kien) khong duoc tinh
-- la mot lan chuyen trang thai. Cot chi duoc gan boi trigger khi "TrangThai" doi gia tri.
--
-- Migration nay KHONG thay doi quyen ghi tren GHE (da khoa o 20261111090000) va
-- khong them RPC nghiep vu.

ALTER TABLE public."GHE"
  ADD COLUMN IF NOT EXISTS "NgayCapNhatTrangThai" TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.ghi_thoi_diem_doi_trang_thai_ghe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD."TrangThai" IS DISTINCT FROM NEW."TrangThai" THEN
    NEW."NgayCapNhatTrangThai" := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ghi_thoi_diem_doi_trang_thai_ghe() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ghi_thoi_diem_doi_trang_thai_ghe ON public."GHE";
CREATE TRIGGER trg_ghi_thoi_diem_doi_trang_thai_ghe
  BEFORE UPDATE OF "TrangThai" ON public."GHE"
  FOR EACH ROW
  EXECUTE FUNCTION public.ghi_thoi_diem_doi_trang_thai_ghe();

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public."GHE"', 'INSERT')
     OR has_table_privilege('authenticated', 'public."GHE"', 'UPDATE')
     OR has_table_privilege('authenticated', 'public."GHE"', 'DELETE')
     OR has_table_privilege('anon', 'public."GHE"', 'INSERT')
     OR has_table_privilege('anon', 'public."GHE"', 'UPDATE')
     OR has_table_privilege('anon', 'public."GHE"', 'DELETE') THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated/anon can write GHE directly';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
