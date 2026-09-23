-- =============================================================================
-- TRƯỜNG ĐẠI HỌC NGOẠI THƯƠNG - KHOA CÔNG NGHỆ VÀ KHOA HỌC DỮ LIỆU
-- HỌC PHẦN: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG (COSH301 - NHÓM 4)
-- ĐỀ TÀI: EVENTTICKETING - NỀN TẢNG QUẢN LÝ BÁN VÉ SỰ KIỆN & TỐI ƯU DOANH THU
-- SPRINT 1: WEB GIỚI THIỆU CONCERT & LỊCH TRÌNH (THEME 1)
-- DỮ LIỆU MẪU ĐỒNG BỘ 100% VỚI WEB LIVE: https://minhdc2011.github.io/EVENTTICKETING/
-- HỆ QUẢN TRỊ CSDL: MySQL 8.0+ / MariaDB (InnoDB, UTF-8 MB4)
-- =============================================================================

-- Thiết lập môi trường và bảng mã UTF-8
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- PHẦN 1: XÓA CÁC BẢNG CŨ NẾU ĐÃ TỒN TẠI (THEO THỨ TỰ PHỤ THUỘC)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `GHE`;
DROP TABLE IF EXISTS `KHU_VUC`;
DROP TABLE IF EXISTS `LICH_TRINH`;
DROP TABLE IF EXISTS `SU_KIEN_NGHE_SI`;
DROP TABLE IF EXISTS `NGHE_SI`;
DROP TABLE IF EXISTS `SU_KIEN`;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- PHẦN 2: ĐẶC TẢ DDL - TẠO CÁC BẢNG CSDL CHUẨN HÓA CHO SPRINT 1
-- -----------------------------------------------------------------------------

-- 1. BẢNG SU_KIEN: Lưu thông tin đại nhạc hội, banner, media, thời gian mở bán & countdown
CREATE TABLE `SU_KIEN` (
    `SuKienID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính, mã định danh sự kiện',
    `TenSuKien` VARCHAR(255) NOT NULL COMMENT 'Tên chính thức của đại nhạc hội (khớp web)',
    `Slogan` VARCHAR(255) NULL COMMENT 'Thông điệp truyền thông chính thức',
    `MoTaChiTiet` TEXT NULL COMMENT 'Mô tả chi tiết nội dung chương trình',
    `ThoiGianBatDau` DATETIME NOT NULL COMMENT 'Thời điểm bắt đầu biểu diễn chính thức',
    `ThoiGianKetThuc` DATETIME NOT NULL COMMENT 'Thời điểm dự kiến bế mạc sự kiện',
    `ThoiGianMoBanVe` DATETIME NOT NULL COMMENT 'Thời điểm mở bán / Countdown Target trên web',
    `ThoiGianDongBanVe` DATETIME NULL COMMENT 'Thời điểm đóng cổng bán vé trực tuyến',
    `DiaDiem` VARCHAR(255) NOT NULL COMMENT 'Địa chỉ cụ thể nơi tổ chức sự kiện',
    `TenSanVanDong` VARCHAR(255) NOT NULL COMMENT 'Tên địa điểm / sân vận động (SVĐ Quốc gia Mỹ Đình)',
    `SucChua` INT NOT NULL DEFAULT 40000 COMMENT 'Sức chứa tối đa của sân vận động',
    `BannerURL` VARCHAR(500) NULL COMMENT 'Đường dẫn ảnh banner ngang trang chủ',
    `PosterURL` VARCHAR(500) NULL COMMENT 'Đường dẫn ảnh poster đứng chính thức',
    `TrailerURL` VARCHAR(500) NULL COMMENT 'Đường dẫn video teaser / trailer YouTube',
    `SoDoTongQuanURL` VARCHAR(500) NULL COMMENT 'Đường dẫn file vector SVG sơ đồ toàn bộ khán đài',
    `TrangThaiMoBan` VARCHAR(50) NOT NULL DEFAULT 'SAP_MO_BAN' COMMENT 'Trạng thái: SAP_MO_BAN, DANG_MO_BAN, HET_VE, DA_DIEN_RA',
    `QuyDinhDoTuoi` VARCHAR(100) NULL DEFAULT '14+' COMMENT 'Quy định độ tuổi khán giả tham gia',
    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo bản ghi',
    `NgayCapNhat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật bản ghi',
    CONSTRAINT `chk_thoigian_sukien` CHECK (`ThoiGianKetThuc` > `ThoiGianBatDau`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ thông tin Đại nhạc hội (Theme 1)';

-- 2. BẢNG NGHE_SI: Lưu trữ thông tin dàn nghệ sĩ biểu diễn (khớp 100% Artist Lineup trên Web)
CREATE TABLE `NGHE_SI` (
    `NgheSiID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính, mã định danh nghệ sĩ',
    `HoTen` VARCHAR(150) NOT NULL COMMENT 'Họ và tên thật của nghệ sĩ',
    `NgheDanh` VARCHAR(150) NOT NULL COMMENT 'Nghệ danh biểu diễn công chúng',
    `VaiTroChinh` VARCHAR(100) NULL COMMENT 'Dòng nhạc / Vai trò chính (Pop/R&B, Hip-hop/Rap, Dance-pop...)',
    `TieuSu` TEXT NULL COMMENT 'Tiểu sử tóm tắt và phong cách biểu diễn',
    `HinhAnhURL` VARCHAR(500) NULL COMMENT 'Đường dẫn ảnh đại diện chất lượng cao (Unsplash)',
    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo bản ghi'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ dàn nghệ sĩ biểu diễn (Lineup)';

-- 3. BẢNG SU_KIEN_NGHE_SI: Bảng liên kết N-N Sự kiện & Nghệ sĩ biểu diễn
CREATE TABLE `SU_KIEN_NGHE_SI` (
    `ID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính bảng nối',
    `SuKienID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng SU_KIEN',
    `NgheSiID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng NGHE_SI',
    `VaiTroTrongSuKien` VARCHAR(100) NOT NULL DEFAULT 'Main Act' COMMENT 'Vai trò: Headliner Stage, Opening Stage, Warm-up DJ Set',
    `ThuTuHienThi` INT NOT NULL DEFAULT 1 COMMENT 'Thứ tự ưu tiên hiển thị trên Web showcase (1 là cao nhất)',
    CONSTRAINT `fk_skns_sukien` FOREIGN KEY (`SuKienID`) REFERENCES `SU_KIEN` (`SuKienID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_skns_nghesi` FOREIGN KEY (`NgheSiID`) REFERENCES `NGHE_SI` (`NgheSiID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_sukien_nghesi` UNIQUE (`SuKienID`, `NgheSiID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng liên kết Sự kiện và Dàn nghệ sĩ tham gia';

-- 4. BẢNG LICH_TRINH: Lưu timeline chi tiết các hoạt động (khớp 100% Modal Lịch trình trên Web)
CREATE TABLE `LICH_TRINH` (
    `LichTrinhID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính mốc lịch trình',
    `SuKienID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng SU_KIEN',
    `GioBatDau` TIME NOT NULL COMMENT 'Thời gian bắt đầu hoạt động (HH:MM:SS)',
    `GioKetThuc` TIME NOT NULL COMMENT 'Thời gian kết thúc hoạt động (HH:MM:SS)',
    `TenHoatDong` VARCHAR(255) NOT NULL COMMENT 'Tiêu đề hoạt động trên Web',
    `MoTaHoatDong` TEXT NULL COMMENT 'Mô tả chi tiết nội dung hoạt động',
    `DiaDiemHoatDong` VARCHAR(150) NULL COMMENT 'Khu vực diễn ra trong sân vận động',
    `ThuTu` INT NOT NULL DEFAULT 1 COMMENT 'Thứ tự trình chiếu trên trang Timeline',
    CONSTRAINT `fk_lichtrinh_sukien` FOREIGN KEY (`SuKienID`) REFERENCES `SU_KIEN` (`SuKienID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `chk_thoigian_lichtrinh` CHECK (`GioKetThuc` > `GioBatDau`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu lịch trình / Timeline chi tiết sự kiện';

-- 5. BẢNG KHU_VUC: Lưu trữ các phân hạng vé (khớp 100% data_zones.json trên Web)
CREATE TABLE `KHU_VUC` (
    `KhuVucID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính phân khu khán đài (1 - 8)',
    `SuKienID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng SU_KIEN',
    `MaKhuVuc` VARCHAR(50) NOT NULL COMMENT 'Mã khu: VVIP_DIAMOND, VIP_PLATINUM_1, ZONE_A_T1...',
    `TenKhuVuc` VARCHAR(150) NOT NULL COMMENT 'Tên hiển thị: VVIP Diamond Lounge, VIP Platinum 1...',
    `LoaiKhuVuc` VARCHAR(50) NOT NULL DEFAULT 'GHE_NGOI' COMMENT 'Loại khu: GHE_NGOI (Seated) hoặc DUNG_STAND (Standing)',
    `GiaVeNiemYet` DECIMAL(15, 2) NOT NULL COMMENT 'Giá vé chính thức niêm yết (VNĐ)',
    `MauSacHex` VARCHAR(20) NOT NULL COMMENT 'Mã màu HEX trên sơ đồ SVG (#D500F9, #2979FF, #00E676...)',
    `MoTaQuyenLoi` TEXT NULL COMMENT 'Chi tiết quyền lợi: Soundcheck, Lối đi VIP, Giftset...',
    `TongSoGhe` INT NOT NULL DEFAULT 0 COMMENT 'Tổng số lượng chỗ ngồi / dung lượng khu vực',
    CONSTRAINT `fk_khuvuc_sukien` FOREIGN KEY (`SuKienID`) REFERENCES `SU_KIEN` (`SuKienID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_sukien_makhu` UNIQUE (`SuKienID`, `MaKhuVuc`),
    CONSTRAINT `chk_giave_duong` CHECK (`GiaVeNiemYet` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ phân hạng vé & thông tin sơ đồ khu vực';

-- 6. BẢNG GHE: Lưu trữ từng vị trí ghế chi tiết (khớp 100% 48 ghế trong data_seats.json)
CREATE TABLE `GHE` (
    `GheID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính mã ghế (1 - 48)',
    `KhuVucID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng KHU_VUC (1, 2, 6, 7)',
    `SoHang` VARCHAR(20) NOT NULL COMMENT 'Ký hiệu hàng ghế (A, B, C, D, E, F, G, H)',
    `SoGhe` VARCHAR(20) NOT NULL COMMENT 'Số thứ tự ghế trong hàng (01 - 06)',
    `MaGheDayDu` VARCHAR(50) NOT NULL COMMENT 'Mã định danh đầy đủ: VVIP-A-01, VIP1-C-01, KDA-E-01, KDB-G-01...',
    `TrangThai` VARCHAR(30) NOT NULL DEFAULT 'TRONG' COMMENT 'Trạng thái: TRONG (Available), DA_BAN (Sold), DANG_GIU (Holding)',
    `ToaDoX` INT NULL COMMENT 'Tọa độ X pixel tương đối trên bản vẽ SVG',
    `ToaDoY` INT NULL COMMENT 'Tọa độ Y pixel tương đối trên bản vẽ SVG',
    CONSTRAINT `fk_ghe_khuvuc` FOREIGN KEY (`KhuVucID`) REFERENCES `KHU_VUC` (`KhuVucID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_khuvuc_maghe` UNIQUE (`KhuVucID`, `MaGheDayDu`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu từng vị trí ghế và trạng thái phục vụ FR-T1-02';

-- -----------------------------------------------------------------------------
-- PHẦN 3: TẠO CHỈ MỤC (INDEXES) TỐI ƯU HIỆU NĂNG CHO SPRINT 1
-- -----------------------------------------------------------------------------
CREATE INDEX `idx_sukien_trangthai_moban` ON `SU_KIEN` (`TrangThaiMoBan`, `ThoiGianMoBanVe`);
CREATE INDEX `idx_lichtrinh_sukien_gio` ON `LICH_TRINH` (`SuKienID`, `GioBatDau`);
CREATE INDEX `idx_khuvuc_sukien_gia` ON `KHU_VUC` (`SuKienID`, `GiaVeNiemYet`);
CREATE INDEX `idx_ghe_khuvuc_trangthai` ON `GHE` (`KhuVucID`, `TrangThai`);

-- =============================================================================
-- PHẦN 4: DML - CHÈN BỘ DỮ LIỆU MẪU ĐỒNG BỘ 100% VỚI WEBSITE LIVE
-- https://minhdc2011.github.io/EVENTTICKETING/
-- =============================================================================

-- 1. Chèn dữ liệu Sự kiện (SU_KIEN) - SUPER CONCERT 2026 ĐẠI NHẠC HỘI NGOẠI THƯƠNG
INSERT INTO `SU_KIEN` (
    `SuKienID`, `TenSuKien`, `Slogan`, `MoTaChiTiet`, 
    `ThoiGianBatDau`, `ThoiGianKetThuc`, `ThoiGianMoBanVe`, `ThoiGianDongBanVe`, 
    `DiaDiem`, `TenSanVanDong`, `SucChua`, 
    `BannerURL`, `PosterURL`, `TrailerURL`, `SoDoTongQuanURL`, 
    `TrangThaiMoBan`, `QuyDinhDoTuoi`
) VALUES (
    1, 
    'SUPER CONCERT 2026 — ĐẠI NHẠC HỘI NGOẠI THƯƠNG', 
    'SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026', 
    'Đêm đại nhạc hội quy mô 40.000 khán giả hội tụ dàn nghệ sĩ hàng đầu Việt Nam, hệ thống âm thanh ánh sáng D&B Audiotechnik chuẩn quốc tế và trải nghiệm chọn vé thời gian thực.', 
    '2026-10-15 19:30:00', 
    '2026-10-15 23:00:00', 
    '2026-10-15 19:30:00', 
    '2026-10-15 18:00:00', 
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

-- 2. Chèn dữ liệu Nghệ sĩ biểu diễn (NGHE_SI) - Khớp 6 nghệ sĩ trên Web kèm ảnh Unsplash
INSERT INTO `NGHE_SI` (`NgheSiID`, `HoTen`, `NgheDanh`, `VaiTroChinh`, `TieuSu`, `HinhAnhURL`) VALUES
(1, 'Nguyễn Thanh Tùng', 'Sơn Tùng M-TP', 'Pop / R&B', 'Nghệ sĩ biểu diễn hàng đầu Việt Nam, biểu tượng Pop/R&B đương đại với hàng loạt bản hit quốc tế xô đổ mọi kỷ lục lượt nghe.', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=600&q=80'),
(2, 'Nguyễn Hoàng Sơn', 'Soobin Hoàng Sơn', 'R&B / Ballad', 'Hoàng tử R&B/Ballad của làng nhạc Việt, giọng ca thực lực với khả năng trình diễn sân khấu và sáng tác thượng thừa.', 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80'),
(3, 'Hàng Lâm Trang Anh', 'Suboi', 'Hip-hop / Rap', 'Nữ hoàng Hip-hop/Rap Việt Nam, biểu tượng nữ quyền âm nhạc với phong cách rap gai góc, flow lôi cuốn và tư duy quốc tế.', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80'),
(4, 'Nguyễn Việt Hoàng', 'MONO', 'Dance-pop', 'Ngôi sao Gen Z bùng nổ của dòng nhạc Dance-pop, phong cách biểu diễn trẻ trung, vũ đạo điêu luyện và năng lượng sân khấu bùng cháy.', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80'),
(5, 'Ban nhạc Chillies', 'Chillies', 'Indie Pop / Rock', 'Ban nhạc Indie Pop/Rock được yêu thích nhất với những giai điệu mộc mạc, sâu lắng chạm đến trái tim của hàng triệu khán giả trẻ.', 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80'),
(6, 'Trương Tiểu My', 'DJ Mie', 'EDM / Remix', 'Búp bê DJ quyến rũ hàng đầu Việt Nam, chuyên gia khuấy động các lễ hội âm nhạc với các bản phối EDM/Remix cực kỳ bùng nổ.', 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?auto=format&fit=crop&w=600&q=80');

-- 3. Chèn liên kết Nghệ sĩ & Sự kiện (SU_KIEN_NGHE_SI)
INSERT INTO `SU_KIEN_NGHE_SI` (`SuKienID`, `NgheSiID`, `VaiTroTrongSuKien`, `ThuTuHienThi`) VALUES
(1, 1, 'Headliner Stage', 1),
(1, 2, 'Headliner Stage', 2),
(1, 3, 'Opening Stage', 3),
(1, 4, 'Opening Stage', 4),
(1, 5, 'Opening Stage', 5),
(1, 6, 'Warm-up DJ Set', 6);

-- 4. Chèn Lịch trình chi tiết (LICH_TRINH) - Khớp 100% Modal Lịch trình trên Web
INSERT INTO `LICH_TRINH` (`SuKienID`, `GioBatDau`, `GioKetThuc`, `TenHoatDong`, `MoTaHoatDong`, `DiaDiemHoatDong`, `ThuTu`) VALUES
(1, '16:30:00', '17:45:00', 'Mở cổng check-in an ninh', 'Quét mã QR soát vé cổng vào, phát vòng tay cho khán đài VIP/Fanzone', 'Cổng kiểm soát an ninh SVĐ Mỹ Đình', 1),
(1, '17:45:00', '18:30:00', 'Soundcheck VIP Exclusive', 'Giao lưu sớm cùng nghệ sĩ dành riêng cho chủ nhân vé VIP Kim Cương', 'Sân khấu chính', 2),
(1, '18:30:00', '19:30:00', 'Warm-up DJ Set', 'Set nhạc EDM hâm nóng bầu không khí cùng DJ Mie', 'Sân khấu trung tâm', 3),
(1, '19:30:00', '21:15:00', 'KHAI MẠC ĐẠI NHẠC HỘI NGOẠI THƯƠNG', 'Biểu diễn các tiết mục mở màn, Chillies, MONO, Suboi', 'Sân khấu chính', 4),
(1, '21:15:00', '22:30:00', 'HEADLINER STAGE: Sơn Tùng M-TP & Soobin', 'Chuỗi hit đỉnh cao kết hợp hiệu ứng pháo hoa và máy bay không người lái', 'Sân khấu chính & Sàn Catwalk', 5),
(1, '22:30:00', '23:00:00', 'Bế mạc & Hướng dẫn ra về an toàn', 'Kết thúc chương trình, hướng dẫn khán giả di chuyển ra về trật tự và an toàn', 'Toàn bộ sân vận động', 6);

-- 5. Chèn dữ liệu Phân hạng vé (KHU_VUC) - Khớp 100% data_zones.json trên Web
INSERT INTO `KHU_VUC` (`KhuVucID`, `SuKienID`, `MaKhuVuc`, `TenKhuVuc`, `LoaiKhuVuc`, `GiaVeNiemYet`, `MauSacHex`, `MoTaQuyenLoi`, `TongSoGhe`) VALUES
(1, 1, 'VVIP_DIAMOND', 'VVIP Diamond Lounge', 'GHE_NGOI', 4500000.00, '#D500F9', 'Vị trí Fanzone sát sân khấu trung tâm. Tham gia buổi Soundcheck độc quyền, Lối check-in Fast-track riêng biệt, Bộ Gift set Concert & Thẻ đeo kỷ niệm.', 500),
(2, 1, 'VIP_PLATINUM_1', 'VIP Platinum 1', 'GHE_NGOI', 3500000.00, '#2979FF', 'Ghế ngồi trung tâm tầng 1 mặt sân. Lối check-in VIP riêng, Túi Tote & Lanyard phiên bản giới hạn, Vòng tay phát sáng chính thức.', 1500),
(3, 1, 'VIP_PLATINUM_2', 'VIP Platinum 2', 'GHE_NGOI', 3000000.00, '#00B0FF', 'Ghế ngồi tầng 1 cánh trái và cánh phải, bao quát toàn bộ sàn Catwalk. Tặng kèm Lightstick chính hãng và Lanyard kỉ niệm.', 2000),
(4, 1, 'GA_STAND_1', 'GA Fanzone Standing 1 (Khu A)', 'DUNG_STAND', 2200000.00, '#00E676', 'Khu vực đứng sát sàn diễn chính cực sung, tương tác cự ly gần nhất với nghệ sĩ. Tặng vòng tay phát sáng chính thức.', 5000),
(5, 1, 'GA_STAND_2', 'GA Fanzone Standing 2 (Khu B)', 'DUNG_STAND', 1800000.00, '#76FF03', 'Khu vực đứng hai cánh sân khấu, không gian tự do bung xõa cùng âm nhạc. Tặng vòng tay phát sáng đổi màu theo nhịp nhạc.', 5000),
(6, 1, 'ZONE_A_T1', 'Khán đài A Tầng 1 (Tribune A)', 'GHE_NGOI', 1500000.00, '#FF9100', 'Ghế ngồi khán đài chính diện A có mái che, tầm mắt quan sát toàn cảnh hiệu ứng ánh sáng và visual LED sân khấu.', 8000),
(7, 1, 'ZONE_B_T2', 'Khán đài B Tầng 2 (Tribune B)', 'GHE_NGOI', 1200000.00, '#FFC400', 'Ghế ngồi khán đài B thoáng mát, âm thanh trung thực, bao quát toàn cảnh 40.000 khán giả rực rỡ trong biển sáng.', 10000),
(8, 1, 'ZONE_CD_UP', 'Khán đài C-D Tầng cao (Upper Tier)', 'GHE_NGOI', 800000.00, '#90A4AE', 'Khu vực ghế ngồi tiết kiệm dành cho sinh viên, hỗ trợ 4 màn hình LED kích thước 800 inch truyền hình trực tiếp cực nét.', 8000);

-- 6. Chèn dữ liệu 48 Ghế mẫu (GHE) - Khớp 100% data_seats.json trên Web
-- 6.1. Khu VVIP Diamond Lounge (KhuVucID = 1, Mã prefix: VVIP) - 12 ghế
INSERT INTO `GHE` (`GheID`, `KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
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
(12, 1, 'B', '06', 'VVIP-B-06', 'TRONG',    550, 630);

-- 6.2. Khu VIP Platinum 1 (KhuVucID = 2, Mã prefix: VIP1) - 12 ghế
INSERT INTO `GHE` (`GheID`, `KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
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
(24, 2, 'D', '06', 'VIP1-D-06', 'TRONG',    500, 710);

-- 6.3. Khu Khán đài A Tầng 1 (KhuVucID = 6, Mã prefix: KDA) - 12 ghế
INSERT INTO `GHE` (`GheID`, `KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
(25, 6, 'E', '01', 'KDA-E-01', 'DA_BAN', 250, 400),
(26, 6, 'E', '02', 'KDA-E-02', 'DA_BAN', 270, 400),
(27, 6, 'E', '03', 'KDA-E-03', 'TRONG',  290, 400),
(28, 6, 'E', '04', 'KDA-E-04', 'TRONG',  310, 400),
(29, 6, 'E', '05', 'KDA-E-05', 'TRONG',  330, 400),
(30, 6, 'E', '06', 'KDA-E-06', 'TRONG',  350, 400),
(31, 6, 'F', '01', 'KDA-F-01', 'DA_BAN', 250, 430),
(32, 6, 'F', '02', 'KDA-F-02', 'TRONG',  270, 430),
(33, 6, 'F', '03', 'KDA-F-03', 'TRONG',  290, 430),
(34, 6, 'F', '04', 'KDA-F-04', 'TRONG',  310, 430),
(35, 6, 'F', '05', 'KDA-F-05', 'TRONG',  330, 430),
(36, 6, 'F', '06', 'KDA-F-06', 'TRONG',  350, 430);

-- 6.4. Khu Khán đài B Tầng 2 (KhuVucID = 7, Mã prefix: KDB) - 12 ghế
INSERT INTO `GHE` (`GheID`, `KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
(37, 7, 'G', '01', 'KDB-G-01', 'DA_BAN', 650, 400),
(38, 7, 'G', '02', 'KDB-G-02', 'DA_BAN', 670, 400),
(39, 7, 'G', '03', 'KDB-G-03', 'TRONG',  690, 400),
(40, 7, 'G', '04', 'KDB-G-04', 'TRONG',  710, 400),
(41, 7, 'G', '05', 'KDB-G-05', 'TRONG',  730, 400),
(42, 7, 'G', '06', 'KDB-G-06', 'TRONG',  750, 400),
(43, 7, 'H', '01', 'KDB-H-01', 'TRONG',  650, 430),
(44, 7, 'H', '02', 'KDB-H-02', 'TRONG',  670, 430),
(45, 7, 'H', '03', 'KDB-H-03', 'TRONG',  690, 430),
(46, 7, 'H', '04', 'KDB-H-04', 'TRONG',  710, 430),
(47, 7, 'H', '05', 'KDB-H-05', 'TRONG',  730, 430),
(48, 7, 'H', '06', 'KDB-H-06', 'TRONG',  750, 430);

-- =============================================================================
-- PHẦN 5: CÁC CÂU LỆNH TRUY VẤN KIỂM THỬ NGHIỆP VỤ SPRINT 1 (TEST QUERIES)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TRUY VẤN 1: Lấy thông tin Header, Banner và Thời điểm mở bán phục vụ
-- chức năng Hiển thị Thông tin & Đồng hồ đếm ngược (Countdown Timer - FR-T1-01)
-- -----------------------------------------------------------------------------
SELECT 
    sk.SuKienID,
    sk.TenSuKien,
    sk.Slogan,
    sk.TenSanVanDong,
    sk.DiaDiem,
    sk.ThoiGianBatDau,
    sk.ThoiGianMoBanVe,
    sk.TrangThaiMoBan,
    sk.BannerURL,
    sk.PosterURL,
    sk.TrailerURL,
    -- Tính toán số giây còn lại đến giờ mở bán cho Frontend chạy Countdown
    TIMESTAMPDIFF(SECOND, NOW(), sk.ThoiGianMoBanVe) AS GiayConLaiDenMoBan
FROM `SU_KIEN` sk
WHERE sk.SuKienID = 1;

-- -----------------------------------------------------------------------------
-- TRUY VẤN 2: Lấy danh sách Dàn nghệ sĩ (Lineup) và Lịch trình sự kiện (Timeline)
-- -----------------------------------------------------------------------------
-- 2.1. Danh sách dàn nghệ sĩ tham gia biểu diễn theo thứ tự ưu tiên
SELECT 
    ns.NgheDanh,
    ns.HoTen,
    ns.VaiTroChinh,
    skns.VaiTroTrongSuKien,
    skns.ThuTuHienThi,
    ns.HinhAnhURL,
    ns.TieuSu
FROM `SU_KIEN_NGHE_SI` skns
JOIN `NGHE_SI` ns ON skns.NgheSiID = ns.NgheSiID
WHERE skns.SuKienID = 1
ORDER BY skns.ThuTuHienThi ASC;

-- 2.2. Danh sách timeline hoạt động trong ngày diễn ra sự kiện
SELECT 
    lt.ThuTu,
    TIME_FORMAT(lt.GioBatDau, '%H:%i') AS GioBatDau,
    TIME_FORMAT(lt.GioKetThuc, '%H:%i') AS GioKetThuc,
    lt.TenHoatDong,
    lt.DiaDiemHoatDong,
    lt.MoTaHoatDong
FROM `LICH_TRINH` lt
WHERE lt.SuKienID = 1
ORDER BY lt.ThuTu ASC;

-- -----------------------------------------------------------------------------
-- TRUY VẤN 3: Thống kê số lượng ghế Còn trống / Đã bán / Đang giữ theo từng
-- Phân khu khán đài phục vụ Sơ đồ màu sắc trực quan (FR-T1-02 & US-T1-01)
-- (Kết quả câu truy vấn này trả về chính xác cấu trúc của file data_zones.json trên Web)
-- -----------------------------------------------------------------------------
SELECT 
    kv.KhuVucID,
    kv.MaKhuVuc,
    kv.TenKhuVuc,
    kv.LoaiKhuVuc,
    kv.GiaVeNiemYet,
    kv.MauSacHex,
    COUNT(g.GheID) AS SoGheMauDemo,
    SUM(CASE WHEN g.TrangThai = 'TRONG' THEN 1 ELSE 0 END) AS SoGheTrong,
    SUM(CASE WHEN g.TrangThai = 'DA_BAN' THEN 1 ELSE 0 END) AS SoGheDaBan,
    SUM(CASE WHEN g.TrangThai = 'DANG_GIU' THEN 1 ELSE 0 END) AS SoGheDangGiu,
    ROUND((SUM(CASE WHEN g.TrangThai = 'DA_BAN' THEN 1 ELSE 0 END) / COUNT(g.GheID)) * 100, 2) AS TyLeLapDayPhanTram
FROM `KHU_VUC` kv
LEFT JOIN `GHE` g ON kv.KhuVucID = g.KhuVucID
WHERE kv.SuKienID = 1
GROUP BY kv.KhuVucID, kv.MaKhuVuc, kv.TenKhuVuc, kv.LoaiKhuVuc, kv.GiaVeNiemYet, kv.MauSacHex
ORDER BY kv.KhuVucID ASC;
