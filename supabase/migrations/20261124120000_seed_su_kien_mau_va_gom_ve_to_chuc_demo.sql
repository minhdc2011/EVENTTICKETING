-- Dua TAT CA su kien mau vao CSDL thật va gom ve to chuc "Ban to chuc EventTicketing" (tai khoan BTC demo).
--
-- Truoc day Creative Tech Summit va Autumn Arena chi co trong ma nguon (khong co dong trong CSDL), nen giu cho tren
-- trang cong khai that bai ("Khong the giu ghe luc nay"). Migration nay:
--   1) Them 2 su kien + suat dien + khu vuc + ghe (khop ma khu/ghe ma giao dien da dung: <MaKhuVuc>-<Hang>-<So>).
--   2) Chuyen cac su kien UAT/thu nghiem (SuKienID 4,5,6,7,9) ve to chuc cua BTC demo.
-- Idempotent: chay lai khong tao trung (kiem theo Slug / MaGheDayDu).

DO $$
DECLARE
  v_org CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  v_sk INT;
  v_sd BIGINT;
  v_show RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."TO_CHUC" WHERE "ToChucID" = v_org) THEN
    RAISE EXCEPTION 'Thieu to chuc BTC demo %', v_org;
  END IF;

  -- ===== 1) Creative Tech Summit 2026 (so do nha hat, 2 suat) =====
  IF NOT EXISTS (SELECT 1 FROM public."SU_KIEN" WHERE "Slug" = 'creative-tech-summit-2026') THEN
    INSERT INTO public."SU_KIEN" (
      "TenSuKien", "Slogan", "MoTaChiTiet", "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
      "DiaDiem", "TenSanVanDong", "SucChua", "BannerURL", "PosterURL", "SoDoTongQuanURL", "TrangThaiMoBan",
      "QuyDinhDoTuoi", "TrangThaiCongBo", "Slug", "ToChucID", "TemplateKey", "TheLoai", "LoaiHinhSuKien",
      "ChinhSachHoanHuy", "EmailLienHe", "HotlineLienHe"
    ) VALUES (
      'Creative Tech Summit 2026', 'Ý TƯỞNG, CÔNG NGHỆ VÀ NHỮNG KẾT NỐI MỚI',
      'Hai ngày hội thảo, triển lãm và workshop dành cho cộng đồng sáng tạo, sản phẩm số và công nghệ.',
      '2026-12-30T09:00:00+07', '2026-12-31T23:59:00+07', '2026-10-25T09:00:00+07', '2026-12-31T08:00:00+07',
      '57 Phạm Hùng, Nam Từ Liêm, Hà Nội', 'Trung tâm Hội nghị Quốc gia', 1200,
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1800&q=86',
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=900&q=86',
      '/maps/ticketmaster-theater-proscenium.svg', 'DANG_MO_BAN',
      'All ages', 'BAN_NHAP', 'creative-tech-summit-2026', v_org, 'DEFAULT', 'HOI_THAO', 'OFFLINE',
      'Vé có thể sang nhượng nhưng không hoàn tiền sau khi mua.', 'contact@creativetech.vn', '024-3788-0099'
    ) RETURNING "SuKienID" INTO v_sk;

    FOR v_show IN
      SELECT * FROM (VALUES
        ('ngay-1', 'Ngày 1 · Kết nối',   '2026-12-30T09:00:00+07'::timestamptz, '2026-12-30T17:00:00+07'::timestamptz, '2026-12-30T08:00:00+07'::timestamptz),
        ('ngay-2', 'Ngày 2 · Thực hành', '2026-12-31T09:00:00+07'::timestamptz, '2026-12-31T23:59:00+07'::timestamptz, '2026-12-31T08:00:00+07'::timestamptz)
      ) AS s(slug, ten, bat_dau, ket_thuc, dong_ban)
    LOOP
      INSERT INTO public."SUAT_DIEN" ("SuKienID", "Slug", "TenSuatDien", "MuiGio", "ThoiGianBatDau", "ThoiGianKetThuc",
                                      "ThoiGianMoBanVe", "ThoiGianDongBanVe", "ThoiGianMoCua", "TrangThai")
      VALUES (v_sk, v_show.slug, v_show.ten, 'Asia/Ho_Chi_Minh', v_show.bat_dau, v_show.ket_thuc,
              '2026-10-25T09:00:00+07', v_show.dong_ban, v_show.bat_dau - INTERVAL '1 hour', 'DANG_MO_BAN')
      RETURNING "SuatDienID" INTO v_sd;

      INSERT INTO public."KHU_VUC" ("SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet",
                                    "MauSacHex", "TongSoGhe", "SoVeToiThieuMoiDon", "SoVeToiDaMoiDon")
      SELECT v_sk, v_sd, z.ma, z.ten, 'GHE_NGOI', z.gia, z.mau, 40, 1, 4
      FROM (VALUES
        ('BOX_A', 'Private Box A', 1200000, '#10b981'), ('BOX_B', 'Private Box B', 1200000, '#10b981'),
        ('BOX_C', 'Private Box C', 1200000, '#10b981'), ('BOX_D', 'Private Box D', 1200000, '#10b981'),
        ('BOX_E', 'Private Box E', 1200000, '#10b981'), ('BOX_F', 'Private Box F', 1200000, '#10b981'),
        ('ORCHESTRA_LEFT', 'Orchestra Left', 650000, '#f59e0b'),
        ('ORCHESTRA_CENTER', 'Orchestra Center VIP', 1200000, '#d97706'),
        ('ORCHESTRA_RIGHT', 'Orchestra Right', 650000, '#f59e0b'),
        ('MEZZANINE_LEFT', 'Mezzanine Left', 650000, '#3b82f6'),
        ('MEZZANINE_CENTER', 'Front Mezzanine Center', 650000, '#2563eb'),
        ('MEZZANINE_RIGHT', 'Mezzanine Right', 650000, '#3b82f6'),
        ('UPPER_BALCONY', 'Upper Balcony', 350000, '#7c3aed')
      ) AS z(ma, ten, gia, mau);
    END LOOP;
  END IF;

  -- ===== 2) Autumn Arena Festival 2026 (so do arena end-stage, 1 suat) =====
  IF NOT EXISTS (SELECT 1 FROM public."SU_KIEN" WHERE "Slug" = 'autumn-arena-festival-2026') THEN
    INSERT INTO public."SU_KIEN" (
      "TenSuKien", "Slogan", "MoTaChiTiet", "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
      "DiaDiem", "TenSanVanDong", "SucChua", "SoDoTongQuanURL", "TrangThaiMoBan",
      "QuyDinhDoTuoi", "TrangThaiCongBo", "Slug", "ToChucID", "TemplateKey", "TheLoai", "LoaiHinhSuKien",
      "ChinhSachHoanHuy", "EmailLienHe", "HotlineLienHe"
    ) VALUES (
      'Autumn Arena International Music Festival 2026', 'ĐẠI NHẠC HỘI ARENA QUỐC TẾ THÁNG 11',
      'Đêm nhạc hội quy mô lớn theo tiêu chuẩn Arena quốc tế với hệ thống âm thanh ánh sáng hiện đại và sơ đồ chỗ ngồi end-stage.',
      '2026-12-31T18:30:00+07', '2026-12-31T23:30:00+07', '2026-10-25T10:00:00+07', '2026-12-31T22:00:00+07',
      'Đường Trần Hữu Dực, Cầu Diễn, Nam Từ Liêm, Hà Nội', 'Cung Điền kinh Trong nhà Hà Nội', 8000,
      '/maps/ticketmaster-arena-endstage.svg', 'DANG_MO_BAN',
      '12+', 'BAN_NHAP', 'autumn-arena-festival-2026', v_org, 'DEFAULT', 'AM_NHAC', 'OFFLINE',
      'Vé không hoàn trả sau khi thanh toán thành công.', 'arena@eventticketing.vn', '1900-8899'
    ) RETURNING "SuKienID" INTO v_sk;

    INSERT INTO public."SUAT_DIEN" ("SuKienID", "Slug", "TenSuatDien", "MuiGio", "ThoiGianBatDau", "ThoiGianKetThuc",
                                    "ThoiGianMoBanVe", "ThoiGianDongBanVe", "ThoiGianMoCua", "TrangThai")
    VALUES (v_sk, 'dem-arena', 'Đêm diễn Arena Quốc tế', 'Asia/Ho_Chi_Minh', '2026-12-31T18:30:00+07', '2026-12-31T23:30:00+07',
            '2026-10-25T10:00:00+07', '2026-12-31T22:00:00+07', '2026-12-31T17:30:00+07', 'DANG_MO_BAN')
    RETURNING "SuatDienID" INTO v_sd;

    -- Khu dung (GA Pit): khong co ghe, ban theo so luong.
    INSERT INTO public."KHU_VUC" ("SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet",
                                  "MauSacHex", "TongSoGhe", "SoVeToiThieuMoiDon", "SoVeToiDaMoiDon")
    VALUES
      (v_sk, v_sd, 'GA_PIT_LEFT',  'GA Pit Left',  'DUNG_STAND', 1800000, '#10b981', 750, 1, 4),
      (v_sk, v_sd, 'GA_PIT_RIGHT', 'GA Pit Right', 'DUNG_STAND', 1800000, '#10b981', 750, 1, 4);

    -- Khu ngoi
    INSERT INTO public."KHU_VUC" ("SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet",
                                  "MauSacHex", "TongSoGhe", "SoVeToiThieuMoiDon", "SoVeToiDaMoiDon")
    SELECT v_sk, v_sd, z.ma, z.ten, 'GHE_NGOI', z.gia, z.mau, 40, 1, 4
    FROM (
      SELECT 'FLOOR_1' ma, 'Floor 1 VIP' ten, 2500000 gia, '#3b82f6' mau
      UNION ALL SELECT 'FLOOR_2_VIP', 'Floor 2 VIP Trung tâm', 2500000, '#2563eb'
      UNION ALL SELECT 'FLOOR_3', 'Floor 3 VIP', 2500000, '#3b82f6'
      UNION ALL SELECT 'SEC_' || s, 'Section ' || replace(s, '_', '–'), 1200000, '#f59e0b'
        FROM unnest(ARRAY['101','102','103','104','106','107','108','109','110','111','112']) AS s
      UNION ALL SELECT 'SEC_' || s, 'Upper Section ' || replace(s, '_', '–'), 650000, '#8b5cf6'
        FROM unnest(ARRAY['201_203','204_206','207_208','209_212','213_214','215_217','218_220']) AS s
    ) z;
  END IF;
END $$;

-- ===== Ghe cho moi khu ngoi chua co ghe cua 2 su kien tren: hang A-D x 01-10, ma "<MaKhuVuc>-<Hang>-<So>" =====
INSERT INTO public."GHE" ("KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai", "ToaDoX", "ToaDoY")
SELECT z."KhuVucID", r.hang, LPAD(n::TEXT, 2, '0'), z."MaKhuVuc" || '-' || r.hang || '-' || LPAD(n::TEXT, 2, '0'),
       'TRONG', 100 + n * 40, 100 + r.thu_tu * 30
FROM public."KHU_VUC" z
JOIN public."SU_KIEN" e ON e."SuKienID" = z."SuKienID"
CROSS JOIN (VALUES (0, 'A'), (1, 'B'), (2, 'C'), (3, 'D')) AS r(thu_tu, hang)
CROSS JOIN generate_series(1, 10) AS n
WHERE e."Slug" IN ('creative-tech-summit-2026', 'autumn-arena-festival-2026')
  AND z."LoaiKhuVuc" = 'GHE_NGOI'
ON CONFLICT ("KhuVucID", "MaGheDayDu") DO NOTHING;

-- ===== Cong bo 2 su kien vua them =====
-- Trigger kiem tra quyen cong bo dua tren phien dang nhap (auth.uid) nen khong chay duoc trong migration; du lieu mau
-- da day du (suat dien, khu vuc, ghe) nen tam tat trigger nguoi dung tren SU_KIEN dung cho cau lenh nay.
ALTER TABLE public."SU_KIEN" DISABLE TRIGGER USER;
UPDATE public."SU_KIEN" SET "TrangThaiCongBo" = 'CONG_KHAI', "NgayCapNhat" = NOW()
WHERE "Slug" IN ('creative-tech-summit-2026', 'autumn-arena-festival-2026') AND "TrangThaiCongBo" = 'BAN_NHAP';
ALTER TABLE public."SU_KIEN" ENABLE TRIGGER USER;

-- ===== Gom ve to chuc BTC demo =====
UPDATE public."SU_KIEN"
SET "ToChucID" = '00000000-0000-0000-0000-000000000001', "NgayCapNhat" = NOW()
WHERE "SuKienID" IN (4, 5, 6, 7, 9)
  AND "ToChucID" <> '00000000-0000-0000-0000-000000000001';

SELECT setval(pg_get_serial_sequence('public."GHE"', 'GheID'), GREATEST(COALESCE((SELECT MAX("GheID") FROM public."GHE"), 1), 1));

NOTIFY pgrst, 'reload schema';
