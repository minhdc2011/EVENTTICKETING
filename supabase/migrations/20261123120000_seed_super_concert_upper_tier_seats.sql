-- Fill Upper Tier (ZONE_CD_UP) seats for Super Concert 2026 so the Upper Tier section on the
-- shared Ticketmaster-style stadium map is populated with selectable seats (72 seats across rows J-M).
-- Idempotent and safe to replay.

INSERT INTO public."GHE" ("KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai", "ToaDoX", "ToaDoY")
SELECT
  z."KhuVucID",
  r."SoHang",
  LPAD(n::TEXT, 2, '0') AS "SoGhe",
  'CD-' || r."SoHang" || '-' || LPAD(n::TEXT, 2, '0') AS "MaGheDayDu",
  CASE
    WHEN (r."HangThuTu" = 0 AND n IN (1, 2, 17))
      OR (r."HangThuTu" = 1 AND n IN (5, 14))
      OR (r."HangThuTu" = 2 AND n IN (9, 10))
      THEN 'DA_BAN'
    WHEN (r."HangThuTu" = 0 AND n = 10)
      THEN 'DANG_GIU'
    ELSE 'TRONG'
  END AS "TrangThai",
  100 + n * 40 AS "ToaDoX",
  700 + r."HangThuTu" * 30 AS "ToaDoY"
FROM public."KHU_VUC" z
CROSS JOIN (
  VALUES
    (0, 'J'),
    (1, 'K'),
    (2, 'L'),
    (3, 'M')
) AS r("HangThuTu", "SoHang")
CROSS JOIN generate_series(1, 18) AS n
WHERE z."SuKienID" = 1
  AND z."MaKhuVuc" = 'ZONE_CD_UP'
ON CONFLICT ("MaGheDayDu") DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public."GHE"', 'GheID'),
  GREATEST(COALESCE((SELECT MAX("GheID") FROM public."GHE"), 1), 1)
);
