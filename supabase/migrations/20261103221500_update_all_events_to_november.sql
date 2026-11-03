-- Migration: Cập nhật tất cả các sự kiện và suất diễn bắt đầu từ 01/11/2026 đến hết 30/11/2026
-- Ngày tạo: 03/11/2026

BEGIN;

-- 1. Cập nhật tất cả các suất diễn (SUAT_DIEN)
UPDATE public."SUAT_DIEN"
SET 
    "ThoiGianBatDau" = '2026-11-01 19:30:00+07',
    "ThoiGianKetThuc" = '2026-11-30 23:59:59+07',
    "ThoiGianMoBanVe" = '2026-10-25 00:00:00+07',
    "ThoiGianDongBanVe" = '2026-11-30 22:00:00+07',
    "TrangThai" = 'DANG_MO_BAN'
WHERE "SuatDienID" IS NOT NULL;

-- 2. Cập nhật tất cả các sự kiện (SU_KIEN)
UPDATE public."SU_KIEN"
SET 
    "ThoiGianBatDau" = '2026-11-01 19:30:00+07',
    "ThoiGianKetThuc" = '2026-11-30 23:59:59+07',
    "ThoiGianMoBanVe" = '2026-10-25 00:00:00+07',
    "ThoiGianDongBanVe" = '2026-11-30 22:00:00+07',
    "TrangThaiMoBan" = 'DANG_MO_BAN'
WHERE "SuKienID" IS NOT NULL;

COMMIT;

-- Thông báo PostgREST nạp lại schema cache
NOTIFY pgrst, 'reload schema';

