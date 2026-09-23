-- =============================================================================
-- TRƯỜNG ĐẠI HỌC NGOẠI THƯƠNG - KHOA CÔNG NGHỆ VÀ KHOA HỌC DỮ LIỆU
-- HỌC PHẦN: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG (COSH301 - NHÓM 4)
-- ĐỀ TÀI: EVENTTICKETING - NỀN TẢNG QUẢN LÝ BÁN VÉ SỰ KIỆN & TỐI ƯU DOANH THU
-- SPRINT 1: CỔNG THÔNG TIN SỰ KIỆN & SƠ ĐỒ CHỖ NGỒI (THEME 1)
-- NỀN TẢNG CLOUD: SUPABASE (POSTGRESQL 15+)
-- DỮ LIỆU MẪU ĐỒNG BỘ 100% VỚI WEB LIVE: https://minhdc2011.github.io/EVENTTICKETING/
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHẦN 1: DỌN DẸP BẢNG CŨ NẾU ĐÃ TỒN TẠI (THEO THỨ TỰ RÀNG BUỘC)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS "GHE" CASCADE;
DROP TABLE IF EXISTS "KHU_VUC" CASCADE;
DROP TABLE IF EXISTS "LICH_TRINH" CASCADE;
DROP TABLE IF EXISTS "SU_KIEN_NGHE_SI" CASCADE;
DROP TABLE IF EXISTS "NGHE_SI" CASCADE;
DROP TABLE IF EXISTS "SU_KIEN" CASCADE;

-- -----------------------------------------------------------------------------
-- PHẦN 2: ĐẶC TẢ DDL - TẠO CÁC BẢNG CSDL CHUẨN POSTGRESQL TRÊN SUPABASE
-- -----------------------------------------------------------------------------

-- 1. BẢNG SU_KIEN: Thông tin đại nhạc hội, banner, countdown mở bán
CREATE TABLE "SU_KIEN" (
    "SuKienID" SERIAL PRIMARY KEY,
    "TenSuKien" VARCHAR(255) NOT NULL,
    "Slogan" VARCHAR(255),
    "MoTaChiTiet" TEXT,
    "ThoiGianBatDau" TIMESTAMPTZ NOT NULL,
    "ThoiGianKetThuc" TIMESTAMPTZ NOT NULL,
    "ThoiGianMoBanVe" TIMESTAMPTZ NOT NULL,
    "ThoiGianDongBanVe" TIMESTAMPTZ,
    "DiaDiem" VARCHAR(255) NOT NULL,
    "TenSanVanDong" VARCHAR(255) NOT NULL,
    "SucChua" INT NOT NULL DEFAULT 40000,
    "BannerURL" VARCHAR(500),
    "PosterURL" VARCHAR(500),
    "TrailerURL" VARCHAR(500),
    "SoDoTongQuanURL" VARCHAR(500),
    "TrangThaiMoBan" VARCHAR(50) NOT NULL DEFAULT 'SAP_MO_BAN',
    "QuyDinhDoTuoi" VARCHAR(100) DEFAULT '14+',
    "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "NgayCapNhat" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_thoigian_sukien" CHECK ("ThoiGianKetThuc" > "ThoiGianBatDau")
);

-- 2. BẢNG NGHE_SI: Danh sách nghệ sĩ biểu diễn (Lineup)
CREATE TABLE "NGHE_SI" (
    "NgheSiID" SERIAL PRIMARY KEY,
    "HoTen" VARCHAR(150) NOT NULL,
    "NgheDanh" VARCHAR(150) NOT NULL,
    "VaiTroChinh" VARCHAR(100),
    "TieuSu" TEXT,
    "HinhAnhURL" VARCHAR(500),
    "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BẢNG SU_KIEN_NGHE_SI: Bảng liên kết N-N Sự kiện & Nghệ sĩ
CREATE TABLE "SU_KIEN_NGHE_SI" (
    "ID" SERIAL PRIMARY KEY,
    "SuKienID" INT NOT NULL REFERENCES "SU_KIEN"("SuKienID") ON DELETE CASCADE,
    "NgheSiID" INT NOT NULL REFERENCES "NGHE_SI"("NgheSiID") ON DELETE CASCADE,
    "VaiTroTrongSuKien" VARCHAR(100) NOT NULL DEFAULT 'Main Act',
    "ThuTuHienThi" INT NOT NULL DEFAULT 1,
    CONSTRAINT "uk_sukien_nghesi" UNIQUE ("SuKienID", "NgheSiID")
);

-- 4. BẢNG LICH_TRINH: Timeline chi tiết hoạt động trong ngày diễn
CREATE TABLE "LICH_TRINH" (
    "LichTrinhID" SERIAL PRIMARY KEY,
    "SuKienID" INT NOT NULL REFERENCES "SU_KIEN"("SuKienID") ON DELETE CASCADE,
    "GioBatDau" TIME NOT NULL,
    "GioKetThuc" TIME NOT NULL,
    "TenHoatDong" VARCHAR(255) NOT NULL,
    "MoTaHoatDong" TEXT,
    "DiaDiemHoatDong" VARCHAR(150),
    "ThuTu" INT NOT NULL DEFAULT 1,
    CONSTRAINT "chk_thoigian_lichtrinh" CHECK ("GioKetThuc" > "GioBatDau")
);

-- 5. BẢNG KHU_VUC: Phân hạng vé, giá niêm yết, mã màu sơ đồ SVG
CREATE TABLE "KHU_VUC" (
    "KhuVucID" SERIAL PRIMARY KEY,
    "SuKienID" INT NOT NULL REFERENCES "SU_KIEN"("SuKienID") ON DELETE CASCADE,
    "MaKhuVuc" VARCHAR(50) NOT NULL,
    "TenKhuVuc" VARCHAR(150) NOT NULL,
    "LoaiKhuVuc" VARCHAR(50) NOT NULL DEFAULT 'GHE_NGOI',
    "GiaVeNiemYet" NUMERIC(15, 2) NOT NULL,
    "MauSacHex" VARCHAR(20) NOT NULL,
    "MoTaQuyenLoi" TEXT,
    "TongSoGhe" INT NOT NULL DEFAULT 0,
    CONSTRAINT "uk_sukien_makhu" UNIQUE ("SuKienID", "MaKhuVuc"),
    CONSTRAINT "chk_giave_duong" CHECK ("GiaVeNiemYet" >= 0)
);

-- 6. BẢNG GHE: Chi tiết từng ghế và trạng thái phục vụ hiển thị
CREATE TABLE "GHE" (
    "GheID" SERIAL PRIMARY KEY,
    "KhuVucID" INT NOT NULL REFERENCES "KHU_VUC"("KhuVucID") ON DELETE CASCADE,
    "SoHang" VARCHAR(20) NOT NULL,
    "SoGhe" VARCHAR(20) NOT NULL,
    "MaGheDayDu" VARCHAR(50) NOT NULL,
    "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'TRONG',
    "ToaDoX" INT,
    "ToaDoY" INT,
    CONSTRAINT "uk_khuvuc_maghe" UNIQUE ("KhuVucID", "MaGheDayDu")
);

-- -----------------------------------------------------------------------------
-- PHẦN 3: BẢO MẬT ROW LEVEL SECURITY (RLS) TRÊN SUPABASE
-- Cấp quyền SELECT công khai qua anon key để Frontend đọc dữ liệu an toàn 100%
-- -----------------------------------------------------------------------------
ALTER TABLE "SU_KIEN" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NGHE_SI" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SU_KIEN_NGHE_SI" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LICH_TRINH" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KHU_VUC" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GHE" ENABLE ROW LEVEL SECURITY;

-- Tạo chính sách cho phép công chúng (anon) đọc dữ liệu
CREATE POLICY "Public Read Access SU_KIEN" ON "SU_KIEN" FOR SELECT USING (true);
CREATE POLICY "Public Read Access NGHE_SI" ON "NGHE_SI" FOR SELECT USING (true);
CREATE POLICY "Public Read Access SU_KIEN_NGHE_SI" ON "SU_KIEN_NGHE_SI" FOR SELECT USING (true);
CREATE POLICY "Public Read Access LICH_TRINH" ON "LICH_TRINH" FOR SELECT USING (true);
CREATE POLICY "Public Read Access KHU_VUC" ON "KHU_VUC" FOR SELECT USING (true);
CREATE POLICY "Public Read Access GHE" ON "GHE" FOR SELECT USING (true);

-- Bật tính năng Realtime của Supabase cho bảng GHE (để nhận WebSocket đổi màu ghế)
ALTER PUBLICATION supabase_realtime ADD TABLE "GHE";
ALTER PUBLICATION supabase_realtime ADD TABLE "KHU_VUC";

-- =============================================================================
-- PHẦN 4: DML - NẠP DỮ LIỆU MẪU ĐỒNG BỘ 100% VỚI WEBSITE LIVE
-- https://minhdc2011.github.io/EVENTTICKETING/
-- =============================================================================

-- 1. Chèn Sự kiện (SUPER CONCERT 2026 — ĐẠI NHẠC HỘI NGOẠI THƯƠNG)
INSERT INTO "SU_KIEN" (
    "SuKienID", "TenSuKien", "Slogan", "MoTaChiTiet", 
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe", 
    "DiaDiem", "TenSanVanDong", "SucChua", 
    "BannerURL", "PosterURL", "TrailerURL", "SoDoTongQuanURL", 
    "TrangThaiMoBan", "QuyDinhDoTuoi"
) VALUES (
    1, 
    'SUPER CONCERT 2026 — ĐẠI NHẠC HỘI NGOẠI THƯƠNG', 
    'SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026', 
    'Đêm đại nhạc hội quy mô 40.000 khán giả hội tụ dàn nghệ sĩ hàng đầu Việt Nam, hệ thống âm thanh ánh sáng D&B Audiotechnik chuẩn quốc tế và trải nghiệm chọn vé thời gian thực.', 
    '2026-10-15 19:30:00+07', 
    '2026-10-15 23:00:00+07', 
    '2026-10-15 19:30:00+07', 
    '2026-10-15 18:00:00+07', 
    'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội', 
    'SVĐ Quốc gia Mỹ Đình', 
    40000, 
    'https://minhdc2011.github.io/EVENTTICKETING/assets/banner_hero.webp', 
    'https://minhdc2011.github.io/EVENTTICKETING/assets/poster_official.webp', 
    'https://www.youtube.com/watch?v=super_concert_ftu_2026', 
    'https://minhdc2011.github.io/EVENTTICKETING/assets/stadium_seatmap_my_dinh.svg', 
    'SAP_MO_BAN', 
    'Khán giả từ 14 tuổi trở lên (dưới 18 tuổi phải có người giám hộ đi cùng)'
);

-- 2. Chèn Dàn nghệ sĩ (Lineup)
INSERT INTO "NGHE_SI" ("NgheSiID", "HoTen", "NgheDanh", "VaiTroChinh", "TieuSu", "HinhAnhURL") VALUES
(1, 'Nguyễn Thanh Tùng', 'Sơn Tùng M-TP', 'Pop / R&B', 'Nghệ sĩ biểu diễn hàng đầu Việt Nam, biểu tượng Pop/R&B đương đại với hàng loạt bản hit quốc tế xô đổ mọi kỷ lục lượt nghe.', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=600&q=80'),
(2, 'Nguyễn Hoàng Sơn', 'Soobin Hoàng Sơn', 'R&B / Ballad', 'Hoàng tử R&B/Ballad của làng nhạc Việt, giọng ca thực lực với khả năng trình diễn sân khấu và sáng tác thượng thừa.', 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80'),
(3, 'Hàng Lâm Trang Anh', 'Suboi', 'Hip-hop / Rap', 'Nữ hoàng Hip-hop/Rap Việt Nam, biểu tượng nữ quyền âm nhạc với phong cách rap gai góc, flow lôi cuốn và tư duy quốc tế.', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80'),
(4, 'Nguyễn Việt Hoàng', 'MONO', 'Dance-pop', 'Ngôi sao Gen Z bùng nổ của dòng nhạc Dance-pop, phong cách biểu diễn trẻ trung, vũ đạo điêu luyện và năng lượng sân khấu bùng cháy.', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80'),
(5, 'Ban nhạc Chillies', 'Chillies', 'Indie Pop / Rock', 'Ban nhạc Indie Pop/Rock được yêu thích nhất với những giai điệu mộc mạc, sâu lắng chạm đến trái tim của hàng triệu khán giả trẻ.', 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80'),
(6, 'Trương Tiểu My', 'DJ Mie', 'EDM / Remix', 'Búp bê DJ quyến rũ hàng đầu Việt Nam, chuyên gia khuấy động các lễ hội âm nhạc với các bản phối EDM/Remix cực kỳ bùng nổ.', 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?auto=format&fit=crop&w=600&q=80');

-- 3. Chèn Liên kết Nghệ sĩ & Sự kiện
INSERT INTO "SU_KIEN_NGHE_SI" ("SuKienID", "NgheSiID", "VaiTroTrongSuKien", "ThuTuHienThi") VALUES
(1, 1, 'Headliner Stage', 1),
(1, 2, 'Headliner Stage', 2),
(1, 3, 'Opening Stage', 3),
(1, 4, 'Opening Stage', 4),
(1, 5, 'Opening Stage', 5),
(1, 6, 'Warm-up DJ Set', 6);

-- 4. Chèn Lịch trình chi tiết ngày diễn
INSERT INTO "LICH_TRINH" ("SuKienID", "GioBatDau", "GioKetThuc", "TenHoatDong", "MoTaHoatDong", "DiaDiemHoatDong", "ThuTu") VALUES
(1, '16:30:00', '17:45:00', 'Mở cổng check-in an ninh', 'Quét mã QR soát vé cổng vào, phát vòng tay cho khán đài VIP/Fanzone', 'Cổng kiểm soát an ninh SVĐ Mỹ Đình', 1),
(1, '17:45:00', '18:30:00', 'Soundcheck VIP Exclusive', 'Giao lưu sớm cùng nghệ sĩ dành riêng cho chủ nhân vé VIP Kim Cương', 'Sân khấu chính', 2),
(1, '18:30:00', '19:30:00', 'Warm-up DJ Set', 'Set nhạc EDM hâm nóng bầu không khí cùng DJ Mie', 'Sân khấu trung tâm', 3),
(1, '19:30:00', '21:15:00', 'KHAI MẠC ĐẠI NHẠC HỘI NGOẠI THƯƠNG', 'Biểu diễn các tiết mục mở màn, Chillies, MONO, Suboi', 'Sân khấu chính', 4),
(1, '21:15:00', '22:30:00', 'HEADLINER STAGE: Sơn Tùng M-TP & Soobin', 'Chuỗi hit đỉnh cao kết hợp hiệu ứng pháo hoa và máy bay không người lái', 'Sân khấu chính & Sàn Catwalk', 5),
(1, '22:30:00', '23:00:00', 'Bế mạc & Hướng dẫn ra về an toàn', 'Kết thúc chương trình, hướng dẫn khán giả di chuyển ra về trật tự và an toàn', 'Toàn bộ sân vận động', 6);

-- 5. Chèn Phân hạng vé & Khu vực khán đài
INSERT INTO "KHU_VUC" ("KhuVucID", "SuKienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "MoTaQuyenLoi", "TongSoGhe") VALUES
(1, 1, 'VVIP_DIAMOND', 'VVIP Diamond Lounge', 'GHE_NGOI', 4500000.00, '#D500F9', 'Vị trí Fanzone sát sân khấu trung tâm. Tham gia buổi Soundcheck độc quyền, Lối check-in Fast-track riêng biệt, Bộ Gift set Concert & Thẻ đeo kỷ niệm.', 500),
(2, 1, 'VIP_PLATINUM_1', 'VIP Platinum 1', 'GHE_NGOI', 3500000.00, '#2979FF', 'Ghế ngồi trung tâm tầng 1 mặt sân. Lối check-in VIP riêng, Túi Tote & Lanyard phiên bản giới hạn, Vòng tay phát sáng chính thức.', 1500),
(3, 1, 'VIP_PLATINUM_2', 'VIP Platinum 2', 'GHE_NGOI', 3000000.00, '#00B0FF', 'Ghế ngồi tầng 1 cánh trái và cánh phải, bao quát toàn bộ sàn Catwalk. Tặng kèm Lightstick chính hãng và Lanyard kỉ niệm.', 2000),
(4, 1, 'GA_STAND_1', 'GA Fanzone Standing 1 (Khu A)', 'DUNG_STAND', 2200000.00, '#00E676', 'Khu vực đứng sát sàn diễn chính cực sung, tương tác cự ly gần nhất với nghệ sĩ. Tặng vòng tay phát sáng chính thức.', 5000),
(5, 1, 'GA_STAND_2', 'GA Fanzone Standing 2 (Khu B)', 'DUNG_STAND', 1800000.00, '#76FF03', 'Khu vực đứng hai cánh sân khấu, không gian tự do bung xõa cùng âm nhạc. Tặng vòng tay phát sáng đổi màu theo nhịp nhạc.', 5000),
(6, 1, 'ZONE_A_T1', 'Khán đài A Tầng 1 (Tribune A)', 'GHE_NGOI', 1500000.00, '#FF9100', 'Ghế ngồi khán đài chính diện A có mái che, tầm mắt quan sát toàn cảnh hiệu ứng ánh sáng và visual LED sân khấu.', 8000),
(7, 1, 'ZONE_B_T2', 'Khán đài B Tầng 2 (Tribune B)', 'GHE_NGOI', 1200000.00, '#FFC400', 'Ghế ngồi khán đài B thoáng mát, âm thanh trung thực, bao quát toàn cảnh 40.000 khán giả rực rỡ trong biển sáng.', 10000),
(8, 1, 'ZONE_CD_UP', 'Khán đài C-D Tầng cao (Upper Tier)', 'GHE_NGOI', 800000.00, '#90A4AE', 'Khu vực ghế ngồi tiết kiệm dành cho sinh viên, hỗ trợ 4 màn hình LED kích thước 800 inch truyền hình trực tiếp cực nét.', 8000);

-- 6. Chèn 48 Ghế mẫu đại diện
INSERT INTO "GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai", "ToaDoX", "ToaDoY") VALUES
(1,  1, 'A', '01', 'VVIP-A-01', 'DA_BAN',   450, 600),
(2,  1, 'A', '02', 'VVIP-A-02', 'DA_BAN',   470, 600),
(3,  1, 'A', '03', 'VVIP-A-03', 'TRONG',    490, 600),
(4,  1, 'A', '04', 'VVIP-A-04', 'TRONG',    510, 600),
(5,  1, 'A', '05', 'VVIP-A-05', 'DANG_GIU', 530, 600),
(6,  1, 'A', '06', 'VVIP-A-06', 'TRONG',    550, 600),
(7,  1, 'B', '01', 'VVIP-B-01', 'DA_BAN',   450, 630),
(8,  1, 'B', '02', 'VVIP-B-02', 'DA_BAN',   470, 630),
(9,  1, 'B', '03', 'VVIP-B-03', 'DA_BAN',   490, 630),
(10, 1, 'B', '04', 'VVIP-B-04', 'TRONG',    510, 630),
(11, 1, 'B', '05', 'VVIP-B-05', 'TRONG',    530, 630),
(12, 1, 'B', '06', 'VVIP-B-06', 'TRONG',    550, 630),
(13, 2, 'C', '01', 'VIP1-C-01', 'DA_BAN',   400, 680),
(14, 2, 'C', '02', 'VIP1-C-02', 'DA_BAN',   420, 680),
(15, 2, 'C', '03', 'VIP1-C-03', 'TRONG',    440, 680),
(16, 2, 'C', '04', 'VIP1-C-04', 'TRONG',    460, 680),
(17, 2, 'C', '05', 'VIP1-C-05', 'TRONG',    480, 680),
(18, 2, 'C', '06', 'VIP1-C-06', 'TRONG',    500, 680),
(19, 2, 'D', '01', 'VIP1-D-01', 'DA_BAN',   400, 710),
(20, 2, 'D', '02', 'VIP1-D-02', 'DA_BAN',   420, 710),
(21, 2, 'D', '03', 'VIP1-D-03', 'TRONG',    440, 710),
(22, 2, 'D', '04', 'VIP1-D-04', 'TRONG',    460, 710),
(23, 2, 'D', '05', 'VIP1-D-05', 'DANG_GIU', 480, 710),
(24, 2, 'D', '06', 'VIP1-D-06', 'TRONG',    500, 710),
(25, 6, 'E', '01', 'KDA-E-01', 'DA_BAN',   250, 400),
(26, 6, 'E', '02', 'KDA-E-02', 'DA_BAN',   270, 400),
(27, 6, 'E', '03', 'KDA-E-03', 'TRONG',    290, 400),
(28, 6, 'E', '04', 'KDA-E-04', 'TRONG',    310, 400),
(29, 6, 'E', '05', 'KDA-E-05', 'TRONG',    330, 400),
(30, 6, 'E', '06', 'KDA-E-06', 'TRONG',    350, 400),
(31, 6, 'F', '01', 'KDA-F-01', 'DA_BAN',   250, 430),
(32, 6, 'F', '02', 'KDA-F-02', 'TRONG',    270, 430),
(33, 6, 'F', '03', 'KDA-F-03', 'TRONG',    290, 430),
(34, 6, 'F', '04', 'KDA-F-04', 'TRONG',    310, 430),
(35, 6, 'F', '05', 'KDA-F-05', 'TRONG',    330, 430),
(36, 6, 'F', '06', 'KDA-F-06', 'TRONG',    350, 430),
(37, 7, 'G', '01', 'KDB-G-01', 'DA_BAN',   650, 400),
(38, 7, 'G', '02', 'KDB-G-02', 'DA_BAN',   670, 400),
(39, 7, 'G', '03', 'KDB-G-03', 'TRONG',    690, 400),
(40, 7, 'G', '04', 'KDB-G-04', 'TRONG',    710, 400),
(41, 7, 'G', '05', 'KDB-G-05', 'TRONG',    730, 400),
(42, 7, 'G', '06', 'KDB-G-06', 'TRONG',    750, 400),
(43, 7, 'H', '01', 'KDB-H-01', 'TRONG',    650, 430),
(44, 7, 'H', '02', 'KDB-H-02', 'TRONG',    670, 430),
(45, 7, 'H', '03', 'KDB-H-03', 'TRONG',    690, 430),
(46, 7, 'H', '04', 'KDB-H-04', 'TRONG',    710, 430),
(47, 7, 'H', '05', 'KDB-H-05', 'TRONG',    730, 430),
(48, 7, 'H', '06', 'KDB-H-06', 'TRONG',    750, 430);

-- Thiết lập lại sequence cho các bảng để tránh lỗi ID khi insert thêm
SELECT setval(pg_get_serial_sequence('"SU_KIEN"', 'SuKienID'), (SELECT MAX("SuKienID") FROM "SU_KIEN"));
SELECT setval(pg_get_serial_sequence('"NGHE_SI"', 'NgheSiID'), (SELECT MAX("NgheSiID") FROM "NGHE_SI"));
SELECT setval(pg_get_serial_sequence('"SU_KIEN_NGHE_SI"', 'ID'), (SELECT MAX("ID") FROM "SU_KIEN_NGHE_SI"));
SELECT setval(pg_get_serial_sequence('"LICH_TRINH"', 'LichTrinhID'), (SELECT MAX("LichTrinhID") FROM "LICH_TRINH"));
SELECT setval(pg_get_serial_sequence('"KHU_VUC"', 'KhuVucID'), (SELECT MAX("KhuVucID") FROM "KHU_VUC"));
SELECT setval(pg_get_serial_sequence('"GHE"', 'GheID'), (SELECT MAX("GheID") FROM "GHE"));
