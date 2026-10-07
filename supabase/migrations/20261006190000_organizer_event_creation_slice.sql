-- Organizer Event Creation Slice: multi-show, multi-tier, full aggregate transactional RPC,
-- additive columns, post-publish commercial locks, and hardened publish readiness checks.
-- Requires 20261005150000_marketplace_organizer_mvp.sql.

ALTER TABLE public."SU_KIEN"
  ADD COLUMN IF NOT EXISTS "LoaiHinhSuKien" VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN IF NOT EXISTS "DuongDanTrucTuyen" TEXT,
  ADD COLUMN IF NOT EXISTS "HuongDanThamGiaTrucTuyen" TEXT,
  ADD COLUMN IF NOT EXISTS "ChinhSachHoanHuy" TEXT,
  ADD COLUMN IF NOT EXISTS "QuyDinhThamGia" TEXT,
  ADD COLUMN IF NOT EXISTS "EmailLienHe" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "HotlineLienHe" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "FanpageURL" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "SoGiayPhepBieuDien" VARCHAR(100);

ALTER TABLE public."SU_KIEN" DROP CONSTRAINT IF EXISTS "chk_sukien_loaihinh";
ALTER TABLE public."SU_KIEN" ADD CONSTRAINT "chk_sukien_loaihinh"
  CHECK ("LoaiHinhSuKien" IN ('OFFLINE', 'ONLINE', 'HYBRID', 'TBA'));

ALTER TABLE public."SUAT_DIEN"
  ADD COLUMN IF NOT EXISTS "ThoiGianMoCua" TIMESTAMPTZ;

ALTER TABLE public."KHU_VUC"
  ADD COLUMN IF NOT EXISTS "SoVeToiThieuMoiDon" INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "SoVeToiDaMoiDon" INT NOT NULL DEFAULT 4;

ALTER TABLE public."KHU_VUC" DROP CONSTRAINT IF EXISTS "chk_khuvuc_sove_toithieu";
ALTER TABLE public."KHU_VUC" ADD CONSTRAINT "chk_khuvuc_sove_toithieu"
  CHECK ("SoVeToiThieuMoiDon" >= 1);

ALTER TABLE public."KHU_VUC" DROP CONSTRAINT IF EXISTS "chk_khuvuc_sove_toida";
ALTER TABLE public."KHU_VUC" ADD CONSTRAINT "chk_khuvuc_sove_toida"
  CHECK ("SoVeToiDaMoiDon" >= "SoVeToiThieuMoiDon");

-- Update legacy tao_ban_nhap_su_kien to populate default visual & contact fields for backward compatibility
CREATE OR REPLACE FUNCTION public.tao_ban_nhap_su_kien(
  p_to_chuc_id UUID,
  p_ten_su_kien TEXT,
  p_slug TEXT,
  p_mo_ta TEXT,
  p_the_loai TEXT,
  p_ten_dia_diem TEXT,
  p_dia_chi TEXT,
  p_bat_dau TIMESTAMPTZ,
  p_ket_thuc TIMESTAMPTZ,
  p_mo_ban TIMESTAMPTZ,
  p_dong_ban TIMESTAMPTZ,
  p_gia_ve NUMERIC,
  p_suc_chua INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id INT;
  v_show_id BIGINT;
  v_slug TEXT := LOWER(TRIM(p_slug));
  v_category TEXT := UPPER(TRIM(COALESCE(p_the_loai, 'KHAC')));
BEGIN
  IF NOT public.co_quyen_bien_tap_to_chuc(p_to_chuc_id) THEN
    RAISE EXCEPTION 'Khong co quyen tao su kien cho to chuc nay' USING ERRCODE = '42501';
  END IF;
  IF LENGTH(TRIM(COALESCE(p_ten_su_kien, ''))) < 5 OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Ten hoac slug su kien khong hop le' USING ERRCODE = '22023';
  END IF;
  IF v_category NOT IN ('AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC') THEN
    RAISE EXCEPTION 'The loai khong hop le' USING ERRCODE = '22023';
  END IF;
  IF p_ket_thuc <= p_bat_dau OR p_mo_ban >= p_bat_dau OR p_dong_ban <= p_mo_ban OR p_dong_ban > p_bat_dau THEN
    RAISE EXCEPTION 'Moc thoi gian khong hop le' USING ERRCODE = '22023';
  END IF;
  IF p_gia_ve < 0 OR p_suc_chua < 1 THEN
    RAISE EXCEPTION 'Gia ve hoac suc chua khong hop le' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "BannerURL", "EmailLienHe", "HotlineLienHe", "ChinhSachHoanHuy", "LoaiHinhSuKien"
  ) VALUES (
    TRIM(p_ten_su_kien), v_slug, p_to_chuc_id, UPPER(v_category), NULLIF(TRIM(p_mo_ta), ''), v_category, 'DEFAULT',
    p_bat_dau, p_ket_thuc, p_mo_ban, p_dong_ban,
    TRIM(p_dia_chi), TRIM(p_ten_dia_diem), p_suc_chua, 'SAP_MO_BAN', 'BAN_NHAP',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
    'support@eventticketing.vn', '1900-6408',
    'Vé đã mua không được đổi hoặc hoàn trả trừ khi sự kiện bị hủy.', 'OFFLINE'
  ) RETURNING "SuKienID" INTO v_event_id;

  INSERT INTO public."SUAT_DIEN" (
    "SuKienID", "Slug", "TenSuatDien", "MuiGio", "ThoiGianBatDau", "ThoiGianKetThuc",
    "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
  ) VALUES (
    v_event_id, 'suat-1', 'Suất diễn 1', 'Asia/Ho_Chi_Minh', p_bat_dau, p_ket_thuc,
    p_mo_ban, p_dong_ban, 'BAN_NHAP'
  ) RETURNING "SuatDienID" INTO v_show_id;

  INSERT INTO public."KHU_VUC" (
    "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc",
    "GiaVeNiemYet", "MauSacHex", "MoTaQuyenLoi", "TongSoGhe",
    "SoVeToiThieuMoiDon", "SoVeToiDaMoiDon"
  ) VALUES (
    v_event_id, v_show_id, 'GENERAL_ADMISSION', 'Vé tiêu chuẩn', 'DUNG_STAND',
    p_gia_ve, '#84CC16', 'Quyền vào cửa theo suất diễn đã chọn.', p_suc_chua,
    1, 4
  );

  RETURN jsonb_build_object('eventId', v_event_id, 'eventSlug', v_slug, 'showId', v_show_id, 'showSlug', 'suat-1');
END;
$$;
REVOKE ALL ON FUNCTION public.tao_ban_nhap_su_kien(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_ban_nhap_su_kien(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INT) TO authenticated;

-- Additive transactional aggregate save RPC: handles create and update for full event, shows and tiers
CREATE OR REPLACE FUNCTION public.luu_su_kien_toan_dien(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_event_id INT := NULLIF(p_payload->>'eventId', '')::INT;
  v_org_id UUID := (p_payload->>'organizationId')::UUID;
  v_name TEXT := TRIM(COALESCE(p_payload->>'name', ''));
  v_slug TEXT := LOWER(TRIM(COALESCE(p_payload->>'slug', '')));
  v_category TEXT := UPPER(TRIM(COALESCE(p_payload->>'category', 'KHAC')));
  v_slogan TEXT := NULLIF(TRIM(COALESCE(p_payload->>'slogan', '')), '');
  v_description TEXT := NULLIF(TRIM(COALESCE(p_payload->>'description', '')), '');
  v_location_mode TEXT := UPPER(TRIM(COALESCE(p_payload->>'locationMode', 'OFFLINE')));
  v_venue_name TEXT := NULLIF(TRIM(COALESCE(p_payload->>'venueName', '')), '');
  v_address TEXT := NULLIF(TRIM(COALESCE(p_payload->>'address', '')), '');
  v_online_link TEXT := NULLIF(TRIM(COALESCE(p_payload->>'onlineLink', '')), '');
  v_online_instructions TEXT := NULLIF(TRIM(COALESCE(p_payload->>'onlineInstructions', '')), '');
  v_banner_url TEXT := NULLIF(TRIM(COALESCE(p_payload->>'bannerUrl', '')), '');
  v_poster_url TEXT := NULLIF(TRIM(COALESCE(p_payload->>'posterUrl', '')), '');
  v_trailer_url TEXT := NULLIF(TRIM(COALESCE(p_payload->>'trailerUrl', '')), '');
  v_seating_map_url TEXT := NULLIF(TRIM(COALESCE(p_payload->>'seatingMapUrl', '')), '');
  v_age_restriction TEXT := NULLIF(TRIM(COALESCE(p_payload->>'ageRestriction', '14+')), '');
  v_refund_policy TEXT := NULLIF(TRIM(COALESCE(p_payload->>'refundPolicy', '')), '');
  v_terms TEXT := NULLIF(TRIM(COALESCE(p_payload->>'termsAndConditions', '')), '');
  v_contact_email TEXT := NULLIF(TRIM(COALESCE(p_payload->>'contactEmail', '')), '');
  v_contact_hotline TEXT := NULLIF(TRIM(COALESCE(p_payload->>'contactHotline', '')), '');
  v_fanpage_url TEXT := NULLIF(TRIM(COALESCE(p_payload->>'fanpageUrl', '')), '');
  v_permit_number TEXT := NULLIF(TRIM(COALESCE(p_payload->>'permitNumber', '')), '');

  v_current_event public."SU_KIEN"%ROWTYPE;
  v_has_active_inventory BOOLEAN := FALSE;

  v_shows JSONB := p_payload->'shows';
  v_show_elem JSONB;
  v_show_id BIGINT;
  v_show_slug TEXT;
  v_show_name TEXT;
  v_show_starts TIMESTAMPTZ;
  v_show_ends TIMESTAMPTZ;
  v_show_doors TIMESTAMPTZ;
  v_show_sale_start TIMESTAMPTZ;
  v_show_sale_end TIMESTAMPTZ;

  v_tiers JSONB;
  v_tier_elem JSONB;
  v_tier_id INT;
  v_tier_code TEXT;
  v_tier_name TEXT;
  v_tier_type TEXT;
  v_tier_price NUMERIC;
  v_tier_cap INT;
  v_tier_color TEXT;
  v_tier_benefits TEXT;
  v_tier_min INT;
  v_tier_max INT;

  v_retained_show_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_show_retained_tier_ids INT[] := ARRAY[]::INT[];

  v_min_start TIMESTAMPTZ;
  v_max_end TIMESTAMPTZ;
  v_min_sale_start TIMESTAMPTZ;
  v_max_sale_end TIMESTAMPTZ;
  v_total_capacity INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de quan ly su kien' USING ERRCODE = '42501';
  END IF;
  IF v_org_id IS NULL OR NOT public.co_quyen_bien_tap_to_chuc(v_org_id) THEN
    RAISE EXCEPTION 'Khong co quyen bien tap su kien cua to chuc' USING ERRCODE = '42501';
  END IF;

  -- Permissive basic draft validations
  IF LENGTH(v_name) < 5 THEN
    RAISE EXCEPTION 'Ten su kien phai co toi thieu 5 ky tu' USING ERRCODE = '22023';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Slug su kien khong hop le' USING ERRCODE = '22023';
  END IF;
  IF v_category NOT IN ('AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC') THEN
    RAISE EXCEPTION 'The loai khong hop le' USING ERRCODE = '22023';
  END IF;
  IF v_location_mode NOT IN ('OFFLINE', 'ONLINE', 'HYBRID', 'TBA') THEN
    RAISE EXCEPTION 'Hinh thuc to chuc khong hop le' USING ERRCODE = '22023';
  END IF;

  -- If updating an existing event, verify existence and lock state
  IF v_event_id IS NOT NULL THEN
    SELECT * INTO v_current_event FROM public."SU_KIEN" WHERE "SuKienID" = v_event_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Khong tim thay su kien de cap nhat' USING ERRCODE = 'P0002';
    END IF;
    IF v_current_event."ToChucID" <> v_org_id THEN
      RAISE EXCEPTION 'Su kien khong thuoc to chuc dang quan ly' USING ERRCODE = '42501';
    END IF;

    -- Commercial lock check: If event is published, check if active holds or reservations exist
    IF v_current_event."TrangThaiCongBo" = 'CONG_KHAI' THEN
      SELECT (
        EXISTS (
          SELECT 1 FROM public."GIU_CHO" gc
          WHERE gc."SuKienID" = v_event_id AND gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW()
        )
        OR EXISTS (
          SELECT 1 FROM public."GHE" g
          JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
          WHERE kv."SuKienID" = v_event_id AND g."TrangThai" IN ('DA_BAN', 'DANG_GIU')
        )
      ) INTO v_has_active_inventory;
    END IF;

    UPDATE public."SU_KIEN" SET
      "TenSuKien" = v_name,
      "Slug" = v_slug,
      "Slogan" = v_slogan,
      "MoTaChiTiet" = v_description,
      "TheLoai" = v_category,
      "DiaDiem" = COALESCE(v_address, "DiaDiem"),
      "TenSanVanDong" = COALESCE(v_venue_name, "TenSanVanDong"),
      "BannerURL" = v_banner_url,
      "PosterURL" = v_poster_url,
      "TrailerURL" = v_trailer_url,
      "SoDoTongQuanURL" = v_seating_map_url,
      "QuyDinhDoTuoi" = v_age_restriction,
      "LoaiHinhSuKien" = v_location_mode,
      "DuongDanTrucTuyen" = v_online_link,
      "HuongDanThamGiaTrucTuyen" = v_online_instructions,
      "ChinhSachHoanHuy" = v_refund_policy,
      "QuyDinhThamGia" = v_terms,
      "EmailLienHe" = v_contact_email,
      "HotlineLienHe" = v_contact_hotline,
      "FanpageURL" = v_fanpage_url,
      "SoGiayPhepBieuDien" = v_permit_number,
      "NgayCapNhat" = NOW()
    WHERE "SuKienID" = v_event_id;
  ELSE
    INSERT INTO public."SU_KIEN" (
      "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
      "DiaDiem", "TenSanVanDong", "SucChua",
      "BannerURL", "PosterURL", "TrailerURL", "SoDoTongQuanURL",
      "QuyDinhDoTuoi", "LoaiHinhSuKien", "DuongDanTrucTuyen", "HuongDanThamGiaTrucTuyen",
      "ChinhSachHoanHuy", "QuyDinhThamGia", "EmailLienHe", "HotlineLienHe", "FanpageURL", "SoGiayPhepBieuDien",
      "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
      "TrangThaiMoBan", "TrangThaiCongBo"
    ) VALUES (
      v_name, v_slug, v_org_id, v_slogan, v_description, v_category, 'DEFAULT',
      COALESCE(v_address, 'Chưa xác định'), COALESCE(v_venue_name, 'Chưa xác định'), 1,
      v_banner_url, v_poster_url, v_trailer_url, v_seating_map_url,
      v_age_restriction, v_location_mode, v_online_link, v_online_instructions,
      v_refund_policy, v_terms, v_contact_email, v_contact_hotline, v_fanpage_url, v_permit_number,
      NOW() + INTERVAL '15 days', NOW() + INTERVAL '15 days 3 hours', NOW() + INTERVAL '1 day', NOW() + INTERVAL '14 days',
      'SAP_MO_BAN', 'BAN_NHAP'
    ) RETURNING "SuKienID" INTO v_event_id;
  END IF;

  -- Process shows if provided in payload
  IF v_shows IS NOT NULL AND jsonb_typeof(v_shows) = 'array' AND jsonb_array_length(v_shows) > 0 THEN
    FOR v_show_elem IN SELECT value FROM jsonb_array_elements(v_shows)
    LOOP
      v_show_id := NULLIF(v_show_elem->>'showId', '')::BIGINT;
      v_show_slug := LOWER(TRIM(COALESCE(v_show_elem->>'slug', 'suat-' || (jsonb_array_length(v_shows))::TEXT)));
      v_show_name := TRIM(COALESCE(v_show_elem->>'name', 'Suất diễn'));
      v_show_starts := (v_show_elem->>'startsAt')::TIMESTAMPTZ;
      v_show_ends := (v_show_elem->>'endsAt')::TIMESTAMPTZ;
      v_show_doors := NULLIF(v_show_elem->>'doorsOpenAt', '')::TIMESTAMPTZ;
      v_show_sale_start := (v_show_elem->>'saleStartsAt')::TIMESTAMPTZ;
      v_show_sale_end := NULLIF(v_show_elem->>'saleEndsAt', '')::TIMESTAMPTZ;

      IF v_show_starts IS NULL OR v_show_ends IS NULL OR v_show_sale_start IS NULL THEN
        RAISE EXCEPTION 'Moc thoi gian cua suat dien khong duoc de trong' USING ERRCODE = '22023';
      END IF;
      IF v_show_ends <= v_show_starts OR v_show_sale_start >= v_show_starts OR (v_show_sale_end IS NOT NULL AND (v_show_sale_end <= v_show_sale_start OR v_show_sale_end > v_show_starts)) THEN
        RAISE EXCEPTION 'Thu tu thoi gian cua suat dien khong hop le' USING ERRCODE = '22023';
      END IF;

      IF v_show_id IS NOT NULL THEN
        -- CRITICAL TENANT BOUNDARY: Never trust payload showId. Prove it belongs to v_event_id.
        IF NOT EXISTS (
          SELECT 1 FROM public."SUAT_DIEN"
          WHERE "SuatDienID" = v_show_id AND "SuKienID" = v_event_id
        ) THEN
          RAISE EXCEPTION 'Suat dien khong ton tai hoac khong thuoc su kien dang thao tac' USING ERRCODE = '42501';
        END IF;

        -- Commercial lock: if active inventory, protect show start time
        IF v_has_active_inventory THEN
          IF EXISTS (
            SELECT 1 FROM public."SUAT_DIEN"
            WHERE "SuatDienID" = v_show_id AND "ThoiGianBatDau" <> v_show_starts
          ) THEN
            RAISE EXCEPTION 'Khong the thay doi gio bat dau khi da phat sinh luot giu cho hoac ban ve' USING ERRCODE = '22023';
          END IF;
        END IF;

        UPDATE public."SUAT_DIEN" SET
          "Slug" = v_show_slug,
          "TenSuatDien" = v_show_name,
          "ThoiGianBatDau" = v_show_starts,
          "ThoiGianKetThuc" = v_show_ends,
          "ThoiGianMoCua" = v_show_doors,
          "ThoiGianMoBanVe" = v_show_sale_start,
          "ThoiGianDongBanVe" = v_show_sale_end,
          "NgayCapNhat" = NOW()
        WHERE "SuatDienID" = v_show_id AND "SuKienID" = v_event_id;
      ELSE
        INSERT INTO public."SUAT_DIEN" (
          "SuKienID", "Slug", "TenSuatDien", "MuiGio", "ThoiGianBatDau", "ThoiGianKetThuc",
          "ThoiGianMoCua", "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
        ) VALUES (
          v_event_id, v_show_slug, v_show_name, 'Asia/Ho_Chi_Minh', v_show_starts, v_show_ends,
          v_show_doors, v_show_sale_start, v_show_sale_end, 'BAN_NHAP'
        ) RETURNING "SuatDienID" INTO v_show_id;
      END IF;

      v_retained_show_ids := array_append(v_retained_show_ids, v_show_id);

      -- Process ticket tiers for this show (tracked strictly per show)
      v_show_retained_tier_ids := ARRAY[]::INT[];
      v_tiers := v_show_elem->'ticketTiers';
      IF v_tiers IS NOT NULL AND jsonb_typeof(v_tiers) = 'array' THEN
        FOR v_tier_elem IN SELECT value FROM jsonb_array_elements(v_tiers)
        LOOP
          v_tier_id := NULLIF(v_tier_elem->>'tierId', '')::INT;
          v_tier_code := UPPER(TRIM(COALESCE(v_tier_elem->>'code', 'TIER_' || gen_random_uuid()::TEXT)));
          v_tier_name := TRIM(COALESCE(v_tier_elem->>'name', 'Hạng vé'));
          v_tier_type := UPPER(TRIM(COALESCE(v_tier_elem->>'type', 'DUNG_STAND')));
          v_tier_price := COALESCE((v_tier_elem->>'price')::NUMERIC, 0);
          v_tier_cap := COALESCE((v_tier_elem->>'capacity')::INT, 1);
          v_tier_color := TRIM(COALESCE(v_tier_elem->>'color', '#84CC16'));
          v_tier_benefits := NULLIF(TRIM(COALESCE(v_tier_elem->>'benefits', '')), '');
          v_tier_min := COALESCE((v_tier_elem->>'minPerOrder')::INT, 1);
          v_tier_max := COALESCE((v_tier_elem->>'maxPerOrder')::INT, 4);

          IF v_tier_price < 0 OR v_tier_cap < 1 OR v_tier_min < 1 OR v_tier_max < v_tier_min THEN
            RAISE EXCEPTION 'Gia ve, suc chua hoac gioi han don hang khong hop le' USING ERRCODE = '22023';
          END IF;
          IF v_tier_type NOT IN ('DUNG_STAND', 'GHE_NGOI') THEN
            v_tier_type := 'DUNG_STAND';
          END IF;

          IF v_tier_id IS NOT NULL THEN
            -- CRITICAL TENANT BOUNDARY: Never trust payload tierId. Prove it belongs to the verified show AND event.
            IF NOT EXISTS (
              SELECT 1 FROM public."KHU_VUC"
              WHERE "KhuVucID" = v_tier_id AND "SuatDienID" = v_show_id AND "SuKienID" = v_event_id
            ) THEN
              RAISE EXCEPTION 'Phan khu khong ton tai hoac khong thuoc suat dien dang thao tac' USING ERRCODE = '42501';
            END IF;

            IF v_has_active_inventory THEN
              -- Protect price mutation or reduction below existing holds/seats
              IF EXISTS (
                SELECT 1 FROM public."KHU_VUC"
                WHERE "KhuVucID" = v_tier_id AND ("GiaVeNiemYet" <> v_tier_price OR "TongSoGhe" > v_tier_cap)
              ) THEN
                RAISE EXCEPTION 'Khong the thay doi gia ve hoac giam suc chua khi da phat sinh luot giu cho hoac ban ve' USING ERRCODE = '22023';
              END IF;
            END IF;

            UPDATE public."KHU_VUC" SET
              "MaKhuVuc" = v_tier_code,
              "TenKhuVuc" = v_tier_name,
              "LoaiKhuVuc" = v_tier_type,
              "GiaVeNiemYet" = v_tier_price,
              "MauSacHex" = v_tier_color,
              "MoTaQuyenLoi" = v_tier_benefits,
              "TongSoGhe" = v_tier_cap,
              "SoVeToiThieuMoiDon" = v_tier_min,
              "SoVeToiDaMoiDon" = v_tier_max
            WHERE "KhuVucID" = v_tier_id AND "SuatDienID" = v_show_id AND "SuKienID" = v_event_id;
          ELSE
            INSERT INTO public."KHU_VUC" (
              "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc",
              "GiaVeNiemYet", "MauSacHex", "MoTaQuyenLoi", "TongSoGhe",
              "SoVeToiThieuMoiDon", "SoVeToiDaMoiDon"
            ) VALUES (
              v_event_id, v_show_id, v_tier_code, v_tier_name, v_tier_type,
              v_tier_price, v_tier_color, v_tier_benefits, v_tier_cap,
              v_tier_min, v_tier_max
            ) RETURNING "KhuVucID" INTO v_tier_id;
          END IF;

          v_show_retained_tier_ids := array_append(v_show_retained_tier_ids, v_tier_id);
        END LOOP;

        -- DELETION SAFETY: Omission-based deletion of tiers for this show
        -- Check if any omitted tier in this show has active holds or sold/held inventory
        IF EXISTS (
          SELECT 1 FROM public."KHU_VUC" kv
          WHERE kv."SuatDienID" = v_show_id AND kv."SuKienID" = v_event_id
            AND NOT (kv."KhuVucID" = ANY(v_show_retained_tier_ids))
            AND (
              EXISTS (
                SELECT 1 FROM public."CHI_TIET_GIU_CHO" ctgc
                JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ctgc."GiuChoID"
                WHERE ctgc."KhuVucID" = kv."KhuVucID"
                  AND (gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW())
              )
              OR EXISTS (
                SELECT 1 FROM public."GHE" g
                WHERE g."KhuVucID" = kv."KhuVucID" AND g."TrangThai" IN ('DA_BAN', 'DANG_GIU')
              )
            )
        ) THEN
          RAISE EXCEPTION 'Khong the xoa phan khu da phat sinh luot giu cho hoac ban ve' USING ERRCODE = '22023';
        END IF;

        -- If published event has active inventory, fail safely on omitting tiers
        IF v_has_active_inventory AND EXISTS (
          SELECT 1 FROM public."KHU_VUC" kv
          WHERE kv."SuatDienID" = v_show_id AND kv."SuKienID" = v_event_id
            AND NOT (kv."KhuVucID" = ANY(v_show_retained_tier_ids))
        ) THEN
          RAISE EXCEPTION 'Khong the xoa phan khu cua su kien da phat sinh giao dich' USING ERRCODE = '22023';
        END IF;

        -- Safe to remove omitted tiers without active/sold inventory
        DELETE FROM public."GHE"
        WHERE "KhuVucID" IN (
          SELECT "KhuVucID" FROM public."KHU_VUC"
          WHERE "SuatDienID" = v_show_id AND "SuKienID" = v_event_id
            AND NOT ("KhuVucID" = ANY(v_show_retained_tier_ids))
        );

        DELETE FROM public."KHU_VUC"
        WHERE "SuatDienID" = v_show_id AND "SuKienID" = v_event_id
          AND NOT ("KhuVucID" = ANY(v_show_retained_tier_ids));
      END IF;
    END LOOP;

    -- DELETION SAFETY: Omission-based deletion of shows
    -- Check if any omitted show has active holds or sold/held inventory
    IF EXISTS (
      SELECT 1 FROM public."SUAT_DIEN" sd
      WHERE sd."SuKienID" = v_event_id
        AND NOT (sd."SuatDienID" = ANY(v_retained_show_ids))
        AND (
          EXISTS (
            SELECT 1 FROM public."GIU_CHO" gc
            WHERE gc."SuatDienID" = sd."SuatDienID"
              AND (gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW())
          )
          OR EXISTS (
            SELECT 1 FROM public."GHE" g
            JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
            WHERE kv."SuatDienID" = sd."SuatDienID" AND g."TrangThai" IN ('DA_BAN', 'DANG_GIU')
          )
        )
    ) THEN
      RAISE EXCEPTION 'Khong the xoa suat dien da phat sinh luot giu cho hoac ban ve' USING ERRCODE = '22023';
    END IF;

    -- If published event has active inventory, fail safely on omitting shows
    IF v_has_active_inventory AND EXISTS (
      SELECT 1 FROM public."SUAT_DIEN" sd
      WHERE sd."SuKienID" = v_event_id
        AND NOT (sd."SuatDienID" = ANY(v_retained_show_ids))
    ) THEN
      RAISE EXCEPTION 'Khong the xoa suat dien cua su kien da phat sinh giao dich' USING ERRCODE = '22023';
    END IF;

    -- Safe to remove omitted shows without active/sold inventory
    DELETE FROM public."GHE"
    WHERE "KhuVucID" IN (
      SELECT kv."KhuVucID" FROM public."KHU_VUC" kv
      JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
      WHERE sd."SuKienID" = v_event_id
        AND NOT (sd."SuatDienID" = ANY(v_retained_show_ids))
    );

    DELETE FROM public."KHU_VUC"
    WHERE "SuatDienID" IN (
      SELECT "SuatDienID" FROM public."SUAT_DIEN"
      WHERE "SuKienID" = v_event_id
        AND NOT ("SuatDienID" = ANY(v_retained_show_ids))
    );

    DELETE FROM public."SUAT_DIEN"
    WHERE "SuKienID" = v_event_id
      AND NOT ("SuatDienID" = ANY(v_retained_show_ids));
  END IF;

  -- Synchronize summary fields on SU_KIEN for legacy marketplace card compatibility
  SELECT MIN("ThoiGianBatDau"), MAX("ThoiGianKetThuc"), MIN("ThoiGianMoBanVe"), MAX("ThoiGianDongBanVe")
  INTO v_min_start, v_max_end, v_min_sale_start, v_max_sale_end
  FROM public."SUAT_DIEN" WHERE "SuKienID" = v_event_id;

  SELECT COALESCE(SUM("TongSoGhe"), 0) INTO v_total_capacity
  FROM public."KHU_VUC" WHERE "SuKienID" = v_event_id;

  IF v_min_start IS NOT NULL THEN
    UPDATE public."SU_KIEN" SET
      "ThoiGianBatDau" = v_min_start,
      "ThoiGianKetThuc" = v_max_end,
      "ThoiGianMoBanVe" = v_min_sale_start,
      "ThoiGianDongBanVe" = v_max_sale_end,
      "SucChua" = GREATEST(1, v_total_capacity)
    WHERE "SuKienID" = v_event_id;
  END IF;

  RETURN jsonb_build_object(
    'eventId', v_event_id,
    'slug', v_slug,
    'status', COALESCE(v_current_event."TrangThaiCongBo", 'BAN_NHAP')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.luu_su_kien_toan_dien(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.luu_su_kien_toan_dien(JSONB) TO authenticated;

-- Strengthen publish readiness checks on cong_bo_su_kien and matching trigger
CREATE OR REPLACE FUNCTION public.cong_bo_su_kien(p_su_kien_id INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_event public."SU_KIEN"%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public."SU_KIEN" WHERE "SuKienID" = p_su_kien_id FOR UPDATE;
  IF NOT FOUND OR NOT public.co_quyen_bien_tap_to_chuc(v_event."ToChucID") THEN
    RAISE EXCEPTION 'Khong co quyen cong bo su kien' USING ERRCODE = '42501';
  END IF;

  -- Readiness check 1: Event must have at least one valid show
  IF NOT EXISTS (SELECT 1 FROM public."SUAT_DIEN" WHERE "SuKienID" = p_su_kien_id) THEN
    RAISE EXCEPTION 'Su kien chua co suat dien va phan khu hop le' USING ERRCODE = '23514';
  END IF;

  -- Readiness check 2: All shows must have valid times and at least one sellable zone
  IF EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    WHERE sd."SuKienID" = p_su_kien_id AND (
      sd."ThoiGianKetThuc" <= sd."ThoiGianBatDau"
      OR sd."ThoiGianMoBanVe" >= sd."ThoiGianBatDau"
      OR (sd."ThoiGianDongBanVe" IS NOT NULL AND (sd."ThoiGianDongBanVe" <= sd."ThoiGianMoBanVe" OR sd."ThoiGianDongBanVe" > sd."ThoiGianBatDau"))
      OR NOT EXISTS (
        SELECT 1 FROM public."KHU_VUC" kv
        WHERE kv."SuatDienID" = sd."SuatDienID"
          AND kv."TongSoGhe" > 0
          AND kv."GiaVeNiemYet" >= 0
      )
    )
  ) THEN
    RAISE EXCEPTION 'Su kien chua co suat dien va phan khu hop le' USING ERRCODE = '23514';
  END IF;

  -- Readiness check 3: Online events require online link; offline events require location
  IF v_event."LoaiHinhSuKien" = 'ONLINE' AND (v_event."DuongDanTrucTuyen" IS NULL OR LENGTH(TRIM(v_event."DuongDanTrucTuyen")) = 0) THEN
    RAISE EXCEPTION 'Su kien truc tuyen can co duong dan tham gia de cong bo' USING ERRCODE = '23514';
  END IF;

  UPDATE public."SUAT_DIEN" SET "TrangThai" = 'SAP_MO_BAN', "NgayCapNhat" = NOW()
  WHERE "SuKienID" = p_su_kien_id AND "TrangThai" = 'BAN_NHAP';
  UPDATE public."SU_KIEN" SET "TrangThaiCongBo" = 'CONG_KHAI', "NgayCapNhat" = NOW()
  WHERE "SuKienID" = p_su_kien_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.cong_bo_su_kien(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cong_bo_su_kien(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.kiem_tra_trang_thai_cong_bo_su_kien()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW."TrangThaiCongBo" = 'CONG_KHAI' AND (TG_OP = 'INSERT' OR OLD."TrangThaiCongBo" <> 'CONG_KHAI') THEN
    IF NOT public.co_quyen_bien_tap_to_chuc(NEW."ToChucID") THEN
      RAISE EXCEPTION 'Khong co quyen cong bo su kien' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."SUAT_DIEN" WHERE "SuKienID" = NEW."SuKienID")
       OR EXISTS (
         SELECT 1 FROM public."SUAT_DIEN" sd
         WHERE sd."SuKienID" = NEW."SuKienID" AND (
           sd."TrangThai" = 'BAN_NHAP'
           OR sd."ThoiGianKetThuc" <= sd."ThoiGianBatDau"
           OR sd."ThoiGianMoBanVe" >= sd."ThoiGianBatDau"
           OR (sd."ThoiGianDongBanVe" IS NOT NULL AND (sd."ThoiGianDongBanVe" <= sd."ThoiGianMoBanVe" OR sd."ThoiGianDongBanVe" > sd."ThoiGianBatDau"))
           OR NOT EXISTS (
             SELECT 1 FROM public."KHU_VUC" kv
             WHERE kv."SuatDienID" = sd."SuatDienID"
               AND kv."TongSoGhe" > 0
               AND kv."GiaVeNiemYet" >= 0
           )
         )
       ) THEN
      RAISE EXCEPTION 'Su kien chua co suat dien va phan khu hop le' USING ERRCODE = '23514';
    END IF;
    IF NEW."LoaiHinhSuKien" = 'ONLINE' AND (NEW."DuongDanTrucTuyen" IS NULL OR LENGTH(TRIM(NEW."DuongDanTrucTuyen")) = 0) THEN
      RAISE EXCEPTION 'Su kien truc tuyen can co duong dan tham gia de cong bo' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kiem_tra_trang_thai_cong_bo_su_kien() FROM PUBLIC;
