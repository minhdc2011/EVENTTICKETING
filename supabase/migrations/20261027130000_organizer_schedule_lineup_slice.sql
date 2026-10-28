-- ============================================================================
-- Migration: 20261027130000_organizer_schedule_lineup_slice.sql
-- Description: Additive organizer schedule and artist-lineup authoring vertical slice.
--   - Extends luu_su_kien_toan_dien(JSONB) aggregate RPC to transactionally and
--     idempotently handle schedule (LICH_TRINH) and artist lineup (SU_KIEN_NGHE_SI).
--   - Enforces strict tenant boundaries for scheduleId.
--   - Safe artist master policy: never deletes shared NGHE_SI master rows;
--     does not mutate master profile if shared with other events.
--   - Additive RLS policies granting authenticated organization members read access
--     to their own event schedule and artist lineup during drafting and preview.
--   - Preserves SECURITY DEFINER SET search_path = public and hardened RPC ACLs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ADDITIVE RLS POLICIES FOR ORGANIZER DRAFT & PREVIEW ACCESS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members read event schedule" ON public."LICH_TRINH";
CREATE POLICY "Members read event schedule"
ON public."LICH_TRINH" FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "LICH_TRINH"."SuKienID"
      AND public.la_thanh_vien_to_chuc(sk."ToChucID")
  )
);

DROP POLICY IF EXISTS "Members read event artists" ON public."SU_KIEN_NGHE_SI";
CREATE POLICY "Members read event artists"
ON public."SU_KIEN_NGHE_SI" FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "SU_KIEN_NGHE_SI"."SuKienID"
      AND public.la_thanh_vien_to_chuc(sk."ToChucID")
  )
);

DROP POLICY IF EXISTS "Members read artists" ON public."NGHE_SI";
CREATE POLICY "Members read artists"
ON public."NGHE_SI" FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."SU_KIEN_NGHE_SI" skns
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = skns."SuKienID"
    WHERE skns."NgheSiID" = "NGHE_SI"."NgheSiID"
      AND public.la_thanh_vien_to_chuc(sk."ToChucID")
  )
);

-- ----------------------------------------------------------------------------
-- 2. EXTENDED TRANSACTIONAL AGGREGATE SAVE RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.luu_su_kien_toan_dien(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Shows and tiers variables
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

  -- Schedule variables
  v_schedule JSONB := p_payload->'schedule';
  v_schedule_elem JSONB;
  v_schedule_id INT;
  v_sched_title TEXT;
  v_sched_start TIME;
  v_sched_end TIME;
  v_sched_desc TEXT;
  v_sched_loc TEXT;
  v_sched_order INT;
  v_retained_schedule_ids INT[] := ARRAY[]::INT[];

  -- Artists variables
  v_artists JSONB := p_payload->'artists';
  v_artist_elem JSONB;
  v_artist_id INT;
  v_stage_name TEXT;
  v_real_name TEXT;
  v_artist_role TEXT;
  v_artist_bio TEXT;
  v_artist_img TEXT;
  v_artist_order INT;
  v_retained_artist_ids INT[] := ARRAY[]::INT[];
  v_existing_artist public."NGHE_SI"%ROWTYPE;
  v_is_shared BOOLEAN := FALSE;
  v_master_changed BOOLEAN := FALSE;

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

  -- --------------------------------------------------------------------------
  -- 2A. PROCESS SHOWS & TICKET TIERS
  -- --------------------------------------------------------------------------
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
        -- CRITICAL TENANT BOUNDARY: Verify show belongs to v_event_id
        IF NOT EXISTS (
          SELECT 1 FROM public."SUAT_DIEN"
          WHERE "SuatDienID" = v_show_id AND "SuKienID" = v_event_id
        ) THEN
          RAISE EXCEPTION 'Suat dien khong ton tai hoac khong thuoc su kien dang thao tac' USING ERRCODE = '42501';
        END IF;

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

      -- Process tiers for this show
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
            IF NOT EXISTS (
              SELECT 1 FROM public."KHU_VUC"
              WHERE "KhuVucID" = v_tier_id AND "SuatDienID" = v_show_id AND "SuKienID" = v_event_id
            ) THEN
              RAISE EXCEPTION 'Phan khu khong ton tai hoac khong thuoc suat dien dang thao tac' USING ERRCODE = '42501';
            END IF;

            IF v_has_active_inventory THEN
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

        -- Deletion safety: omitted tiers
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

        IF v_has_active_inventory AND EXISTS (
          SELECT 1 FROM public."KHU_VUC" kv
          WHERE kv."SuatDienID" = v_show_id AND kv."SuKienID" = v_event_id
            AND NOT (kv."KhuVucID" = ANY(v_show_retained_tier_ids))
        ) THEN
          RAISE EXCEPTION 'Khong the xoa phan khu cua su kien da phat sinh giao dich' USING ERRCODE = '22023';
        END IF;

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

    -- Deletion safety: omitted shows
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

    IF v_has_active_inventory AND EXISTS (
      SELECT 1 FROM public."SUAT_DIEN" sd
      WHERE sd."SuKienID" = v_event_id
        AND NOT (sd."SuatDienID" = ANY(v_retained_show_ids))
    ) THEN
      RAISE EXCEPTION 'Khong the xoa suat dien cua su kien da phat sinh giao dich' USING ERRCODE = '22023';
    END IF;

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

  -- --------------------------------------------------------------------------
  -- 2B. PROCESS SCHEDULE ITEMS (LICH_TRINH)
  -- --------------------------------------------------------------------------
  IF v_schedule IS NOT NULL AND jsonb_typeof(v_schedule) = 'array' THEN
    FOR v_schedule_elem IN SELECT value FROM jsonb_array_elements(v_schedule)
    LOOP
      v_schedule_id := NULLIF(v_schedule_elem->>'scheduleId', '')::INT;
      IF v_schedule_id IS NULL THEN
        v_schedule_id := NULLIF(v_schedule_elem->>'id', '')::INT;
      END IF;
      v_sched_title := TRIM(COALESCE(v_schedule_elem->>'title', v_schedule_elem->>'tenHoatDong', ''));
      v_sched_start := NULLIF(TRIM(COALESCE(v_schedule_elem->>'startTime', v_schedule_elem->>'gioBatDau', '')), '')::TIME;
      v_sched_end := NULLIF(TRIM(COALESCE(v_schedule_elem->>'endTime', v_schedule_elem->>'gioKetThuc', '')), '')::TIME;
      v_sched_desc := NULLIF(TRIM(COALESCE(v_schedule_elem->>'description', v_schedule_elem->>'moTaHoatDong', '')), '');
      v_sched_loc := NULLIF(TRIM(COALESCE(v_schedule_elem->>'location', v_schedule_elem->>'diaDiemHoatDong', '')), '');
      v_sched_order := COALESCE((v_schedule_elem->>'order')::INT, (v_schedule_elem->>'thuTu')::INT, array_length(v_retained_schedule_ids, 1) + 1, 1);

      IF LENGTH(v_sched_title) < 1 THEN
        RAISE EXCEPTION 'Ten hoat dong lich trinh khong duoc de trong' USING ERRCODE = '22023';
      END IF;
      IF v_sched_start IS NULL OR v_sched_end IS NULL THEN
        RAISE EXCEPTION 'Moc thoi gian cua muc lich trinh khong duoc de trong' USING ERRCODE = '22023';
      END IF;
      IF v_sched_end <= v_sched_start THEN
        RAISE EXCEPTION 'Gio ket thuc hoat dong phai sau gio bat dau' USING ERRCODE = '22023';
      END IF;

      IF v_schedule_id IS NOT NULL THEN
        -- CRITICAL TENANT BOUNDARY: Verify schedule item belongs to this event
        IF NOT EXISTS (
          SELECT 1 FROM public."LICH_TRINH"
          WHERE "LichTrinhID" = v_schedule_id AND "SuKienID" = v_event_id
        ) THEN
          RAISE EXCEPTION 'Muc lich trinh khong ton tai hoac khong thuoc su kien dang thao tac' USING ERRCODE = '42501';
        END IF;

        UPDATE public."LICH_TRINH" SET
          "GioBatDau" = v_sched_start,
          "GioKetThuc" = v_sched_end,
          "TenHoatDong" = v_sched_title,
          "MoTaHoatDong" = v_sched_desc,
          "DiaDiemHoatDong" = v_sched_loc,
          "ThuTu" = v_sched_order
        WHERE "LichTrinhID" = v_schedule_id AND "SuKienID" = v_event_id;
      ELSE
        INSERT INTO public."LICH_TRINH" (
          "SuKienID", "GioBatDau", "GioKetThuc", "TenHoatDong", "MoTaHoatDong", "DiaDiemHoatDong", "ThuTu"
        ) VALUES (
          v_event_id, v_sched_start, v_sched_end, v_sched_title, v_sched_desc, v_sched_loc, v_sched_order
        ) RETURNING "LichTrinhID" INTO v_schedule_id;
      END IF;

      v_retained_schedule_ids := array_append(v_retained_schedule_ids, v_schedule_id);
    END LOOP;

    -- Idempotent replacement: delete event-owned schedule rows that were omitted
    DELETE FROM public."LICH_TRINH"
    WHERE "SuKienID" = v_event_id
      AND NOT ("LichTrinhID" = ANY(v_retained_schedule_ids));
  END IF;

  -- --------------------------------------------------------------------------
  -- 2C. PROCESS ARTISTS & LINEUP LINKS (SU_KIEN_NGHE_SI & NGHE_SI)
  -- --------------------------------------------------------------------------
  IF v_artists IS NOT NULL AND jsonb_typeof(v_artists) = 'array' THEN
    FOR v_artist_elem IN SELECT value FROM jsonb_array_elements(v_artists)
    LOOP
      v_artist_id := NULLIF(v_artist_elem->>'artistId', '')::INT;
      IF v_artist_id IS NULL THEN
        v_artist_id := NULLIF(v_artist_elem->>'id', '')::INT;
      END IF;
      v_stage_name := TRIM(COALESCE(v_artist_elem->>'name', v_artist_elem->>'stageName', v_artist_elem->>'ngheDanh', ''));
      v_real_name := TRIM(COALESCE(v_artist_elem->>'realName', v_artist_elem->>'hoTen', ''));
      v_artist_role := TRIM(COALESCE(v_artist_elem->>'role', v_artist_elem->>'vaiTroTrongSuKien', v_artist_elem->>'primaryRole', 'Nghệ sĩ biểu diễn'));
      v_artist_bio := NULLIF(TRIM(COALESCE(v_artist_elem->>'bio', v_artist_elem->>'tieuSu', '')), '');
      v_artist_img := NULLIF(TRIM(COALESCE(v_artist_elem->>'imageUrl', v_artist_elem->>'hinhAnhURL', '')), '');
      v_artist_order := COALESCE((v_artist_elem->>'order')::INT, (v_artist_elem->>'thuTuHienThi')::INT, array_length(v_retained_artist_ids, 1) + 1, 1);

      IF LENGTH(v_stage_name) < 1 THEN
        RAISE EXCEPTION 'Ten hoac nghe danh nghe si khong duoc de trong' USING ERRCODE = '22023';
      END IF;
      IF v_real_name = '' THEN
        v_real_name := v_stage_name;
      END IF;

      -- Safe Master Artist Resolution Policy:
      -- 1) Resolve existing master record in NGHE_SI:
      IF v_artist_id IS NOT NULL THEN
        SELECT * INTO v_existing_artist FROM public."NGHE_SI" WHERE "NgheSiID" = v_artist_id;
        IF NOT FOUND THEN
          v_artist_id := NULL;
        END IF;
      END IF;

      IF v_artist_id IS NULL THEN
        SELECT * INTO v_existing_artist
        FROM public."NGHE_SI"
        WHERE LOWER(TRIM("NgheDanh")) = LOWER(TRIM(v_stage_name))
        LIMIT 1;

        IF FOUND THEN
          v_artist_id := v_existing_artist."NgheSiID";
        END IF;
      END IF;

      IF v_artist_id IS NULL THEN
        -- Brand new artist master record
        INSERT INTO public."NGHE_SI" (
          "HoTen", "NgheDanh", "VaiTroChinh", "TieuSu", "HinhAnhURL"
        ) VALUES (
          v_real_name, v_stage_name, v_artist_role, v_artist_bio, v_artist_img
        ) RETURNING "NgheSiID" INTO v_artist_id;
      ELSE
        -- Master record exists. Check if linked to any other event.
        v_is_shared := EXISTS (
          SELECT 1 FROM public."SU_KIEN_NGHE_SI"
          WHERE "NgheSiID" = v_artist_id AND "SuKienID" <> v_event_id
        );

        IF NOT v_is_shared THEN
          -- Unshared artist master: safe to update in-place.
          -- Support intentionally clearing bio or image when key is present with empty/null value.
          -- If key is omitted from JSON, preserve existing value.
          UPDATE public."NGHE_SI" SET
            "HoTen" = CASE WHEN (v_artist_elem ? 'realName' OR v_artist_elem ? 'hoTen') THEN v_real_name ELSE "HoTen" END,
            "NgheDanh" = v_stage_name,
            "VaiTroChinh" = CASE WHEN (v_artist_elem ? 'role' OR v_artist_elem ? 'vaiTroTrongSuKien' OR v_artist_elem ? 'primaryRole') THEN COALESCE(v_artist_role, "VaiTroChinh") ELSE "VaiTroChinh" END,
            "TieuSu" = CASE WHEN (v_artist_elem ? 'bio' OR v_artist_elem ? 'tieuSu') THEN v_artist_bio ELSE "TieuSu" END,
            "HinhAnhURL" = CASE WHEN (v_artist_elem ? 'imageUrl' OR v_artist_elem ? 'hinhAnhURL') THEN v_artist_img ELSE "HinhAnhURL" END
          WHERE "NgheSiID" = v_artist_id;
        ELSE
          -- Shared artist with another event:
          -- Check if current organizer submits changed master profile fields.
          v_master_changed := FALSE;
          IF LOWER(TRIM(v_stage_name)) <> LOWER(TRIM(COALESCE(v_existing_artist."NgheDanh", ''))) THEN
            v_master_changed := TRUE;
          END IF;
          IF (v_artist_elem ? 'realName' OR v_artist_elem ? 'hoTen') AND TRIM(COALESCE(v_real_name, '')) <> TRIM(COALESCE(v_existing_artist."HoTen", '')) THEN
            v_master_changed := TRUE;
          END IF;
          IF (v_artist_elem ? 'role' OR v_artist_elem ? 'vaiTroTrongSuKien' OR v_artist_elem ? 'primaryRole') AND TRIM(COALESCE(v_artist_role, '')) <> TRIM(COALESCE(v_existing_artist."VaiTroChinh", '')) THEN
            v_master_changed := TRUE;
          END IF;
          IF (v_artist_elem ? 'bio' OR v_artist_elem ? 'tieuSu') AND COALESCE(v_artist_bio, '') <> COALESCE(v_existing_artist."TieuSu", '') THEN
            v_master_changed := TRUE;
          END IF;
          IF (v_artist_elem ? 'imageUrl' OR v_artist_elem ? 'hinhAnhURL') AND COALESCE(v_artist_img, '') <> COALESCE(v_existing_artist."HinhAnhURL", '') THEN
            v_master_changed := TRUE;
          END IF;

          IF v_master_changed THEN
            -- Product decision: Auto-fork a new NGHE_SI row and relink only the current event!
            -- The shared master row in NGHE_SI is NEVER mutated or deleted.
            INSERT INTO public."NGHE_SI" (
              "HoTen", "NgheDanh", "VaiTroChinh", "TieuSu", "HinhAnhURL"
            ) VALUES (
              COALESCE(NULLIF(v_real_name, ''), v_existing_artist."HoTen", v_stage_name),
              v_stage_name,
              COALESCE(v_artist_role, v_existing_artist."VaiTroChinh", 'Nghệ sĩ biểu diễn'),
              CASE WHEN (v_artist_elem ? 'bio' OR v_artist_elem ? 'tieuSu') THEN v_artist_bio ELSE v_existing_artist."TieuSu" END,
              CASE WHEN (v_artist_elem ? 'imageUrl' OR v_artist_elem ? 'hinhAnhURL') THEN v_artist_img ELSE v_existing_artist."HinhAnhURL" END
            ) RETURNING "NgheSiID" INTO v_artist_id;
          END IF;
          -- If v_master_changed is FALSE, reuse shared master v_artist_id without mutating NGHE_SI.
        END IF;
      END IF;

      -- Link event to artist in SU_KIEN_NGHE_SI
      INSERT INTO public."SU_KIEN_NGHE_SI" (
        "SuKienID", "NgheSiID", "VaiTroTrongSuKien", "ThuTuHienThi"
      ) VALUES (
        v_event_id, v_artist_id, v_artist_role, v_artist_order
      )
      ON CONFLICT ("SuKienID", "NgheSiID") DO UPDATE SET
        "VaiTroTrongSuKien" = EXCLUDED."VaiTroTrongSuKien",
        "ThuTuHienThi" = EXCLUDED."ThuTuHienThi";

      v_retained_artist_ids := array_append(v_retained_artist_ids, v_artist_id);
    END LOOP;

    -- Replace only event links; NEVER delete shared master rows from NGHE_SI!
    DELETE FROM public."SU_KIEN_NGHE_SI"
    WHERE "SuKienID" = v_event_id
      AND NOT ("NgheSiID" = ANY(v_retained_artist_ids));
  END IF;

  -- --------------------------------------------------------------------------
  -- 2D. SYNCHRONIZE SUMMARY FIELDS ON SU_KIEN
  -- --------------------------------------------------------------------------
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

-- Explicit hardened ACL grants
REVOKE ALL ON FUNCTION public.luu_su_kien_toan_dien(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_su_kien_toan_dien(JSONB) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
