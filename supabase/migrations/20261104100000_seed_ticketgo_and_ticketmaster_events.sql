-- Migration: Thêm 5 sự kiện từ Ticketgo và 2 sự kiện kèm sơ đồ Ticketmaster (Tháng 11/2026)
-- Ngày tạo: 04/11/2026

BEGIN;

-- 1. Cập nhật sơ đồ Ticketmaster cho Creative Tech Summit
UPDATE public."SU_KIEN"
SET "SoDoTongQuanURL" = '/maps/ticketmaster-theater-proscenium.svg'
WHERE "Slug" = 'creative-tech-summit-2026';

-- 2. Đảm bảo tổ chức mặc định tồn tại
INSERT INTO public."TO_CHUC" ("TenToChuc", "Slug")
VALUES ('Ban Tổ Chức Ticketgo & Đối Tác', 'ticketgo-partners')
ON CONFLICT ("Slug") DO NOTHING;

-- 3. Tạo sự kiện Autumn Arena International Music Festival 2026 (Sơ đồ Ticketmaster Arena)
INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "SoDoTongQuanURL", "BannerURL", "PosterURL"
)
SELECT 
    'Autumn Arena International Music Festival 2026',
    'autumn-arena-festival-2026',
    t."ToChucID",
    'ĐẠI NHẠC HỘI ARENA QUỐC TẾ THÁNG 11',
    'Đêm nhạc hội quy mô lớn theo tiêu chuẩn Arena quốc tế với hệ thống âm thanh ánh sáng hiện đại bậc nhất và sơ đồ chỗ ngồi chuẩn Ticketmaster End-Stage.',
    'AM_NHAC',
    'DEFAULT',
    '2026-11-21 18:30:00+07',
    '2026-11-21 23:30:00+07',
    '2026-10-25 10:00:00+07',
    '2026-11-21 22:00:00+07',
    'Đường Trần Hữu Dực, Cầu Diễn, Nam Từ Liêm, Hà Nội',
    'Cung Điền kinh Trong nhà Hà Nội',
    8000,
    'DANG_MO_BAN',
    'CONG_KHAI',
    '/maps/ticketmaster-arena-endstage.svg',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1800&q=86',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=900&q=86'
FROM public."TO_CHUC" t
WHERE t."Slug" = 'ticketgo-partners'
ON CONFLICT ("Slug") DO NOTHING;

-- 4. Thêm 5 sự kiện từ Ticketgo.vn
INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "BannerURL", "PosterURL"
)
SELECT 
    'Liveshow Musique de Salon — Để Nhớ Một Thời',
    'musique-de-salon-de-nho-mot-thoi',
    t."ToChucID",
    'ĐÊM NHẠC TÌNH CA VƯỢT THỜI GIAN · NHẠC SĨ ĐỨC TRÍ',
    'Đêm nhạc trữ tình đặc sắc được dàn dựng công phu bởi Nhạc sĩ Đức Trí cùng các giọng ca hàng đầu: Quang Dũng, Lê Hiếu, Hoàng Hải, Nguyên Hà.',
    'AM_NHAC',
    'DEFAULT',
    '2026-11-07 20:00:00+07',
    '2026-11-07 23:00:00+07',
    '2026-10-25 10:00:00+07',
    '2026-11-07 21:30:00+07',
    '91 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội',
    'Cung Văn hóa Hữu nghị Việt Xô',
    1100,
    'DANG_MO_BAN',
    'CONG_KHAI',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1800&q=86',
    'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=900&q=86'
FROM public."TO_CHUC" t
WHERE t."Slug" = 'ticketgo-partners'
ON CONFLICT ("Slug") DO NOTHING;

INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "BannerURL", "PosterURL"
)
SELECT 
    'Liveshow Mơ Màng Men Say 2 — Phan Mạnh Quỳnh & Khách Mời',
    'mo-mang-men-say-2',
    t."ToChucID",
    'GIAI ĐIỆU HOÀNG HÔN THƠ MỘNG VÀ CẢM XÚC THĂNG HOA',
    'Không gian âm nhạc ngoài trời ấn tượng tụ hội Phan Mạnh Quỳnh, ST Sơn Thạch, Bùi Công Nam với những bản hit được phối khí hoàn toàn mới.',
    'AM_NHAC',
    'DEFAULT',
    '2026-11-14 19:30:00+07',
    '2026-11-14 22:30:00+07',
    '2026-10-25 10:00:00+07',
    '2026-11-14 21:00:00+07',
    'Đường Phạm Hùng, Mễ Trì, Nam Từ Liêm, Hà Nội',
    'Sân khấu Ngoài trời Bảo tàng Hà Nội',
    2500,
    'DANG_MO_BAN',
    'CONG_KHAI',
    'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1800&q=86',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=86'
FROM public."TO_CHUC" t
WHERE t."Slug" = 'ticketgo-partners'
ON CONFLICT ("Slug") DO NOTHING;

INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "BannerURL", "PosterURL"
)
SELECT 
    'Vở Diễn Nghệ Thuật Sân Khấu "GOm Show — Đất Nở Hoa"',
    'gom-show-dat-no-hoa',
    t."ToChucID",
    'HÀNH TRÌNH TỎA SÁNG CỦA ĐẤT VÀ LỬA GỐM VIỆT',
    'Dự án nghệ thuật âm nhạc và thị giác sáng tạo lấy cảm hứng từ hồn gốm truyền thống Việt Nam kết hợp múa đương đại và hiệu ứng thị giác ánh sáng.',
    'SAN_KHAU',
    'DEFAULT',
    '2026-11-20 19:30:00+07',
    '2026-11-20 21:30:00+07',
    '2026-10-25 10:00:00+07',
    '2026-11-20 20:30:00+07',
    '36 Lý Thái Tổ, Hoàn Kiếm, Hà Nội',
    'Rạp Khăn Quàng Đỏ',
    650,
    'DANG_MO_BAN',
    'CONG_KHAI',
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1800&q=86',
    'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=900&q=86'
FROM public."TO_CHUC" t
WHERE t."Slug" = 'ticketgo-partners'
ON CONFLICT ("Slug") DO NOTHING;

INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "BannerURL", "PosterURL"
)
SELECT 
    'Workshop & Trải Nghiệm "Hương Sắc Việt — Trầm Hương & Trà Đạo"',
    'workshop-tram-huong-tra-dao-viet',
    t."ToChucID",
    'THƯỞNG TRÀ · TĨNH TÂM · ĐẮM CHÌM NGHỆ THUẬT',
    'Workshop chuyên sâu về văn hóa thưởng trà cổ truyền và nghệ thuật thưởng hương trầm tự nhiên cùng các nghệ nhân hàng đầu.',
    'WORKSHOP',
    'DEFAULT',
    '2026-11-11 09:00:00+07',
    '2026-11-11 16:30:00+07',
    '2026-10-25 10:00:00+07',
    '2026-11-11 12:00:00+07',
    '173 Xuân Thủy, Cầu Giấy, Hà Nội',
    'Không gian Nghệ thuật Heritage Space',
    80,
    'DANG_MO_BAN',
    'CONG_KHAI',
    'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1800&q=86',
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=86'
FROM public."TO_CHUC" t
WHERE t."Slug" = 'ticketgo-partners'
ON CONFLICT ("Slug") DO NOTHING;

INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo",
    "BannerURL", "PosterURL"
)
SELECT 
    'Giải Chạy & Đại Nhạc Hội Năng Lượng Ticketgo Autumn Run & Beat',
    'ticketgo-autumn-marathon-music-night',
    t."ToChucID",
    'BỨT PHÁ GIỚI HẠN · BÙNG CHÁY ĐAM MÊ MÙA THU',
    'Giải chạy marathon mùa thu kết hợp đại tiệc âm nhạc EDM và Acoustic bùng nổ giữa không gian xanh của Công viên Yên Sở.',
    'THE_THAO',
    'DEFAULT',
    '2026-11-28 05:00:00+07',
    '2026-11-28 22:30:00+07',
    '2026-10-25 10:00:00+07',
    '2026-11-28 18:00:00+07',
    'Gamuda City, Hoàng Mai, Hà Nội',
    'Công viên Yên Sở',
    3500,
    'DANG_MO_BAN',
    'CONG_KHAI',
    'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1800&q=86',
    'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=900&q=86'
FROM public."TO_CHUC" t
WHERE t."Slug" = 'ticketgo-partners'
ON CONFLICT ("Slug") DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

