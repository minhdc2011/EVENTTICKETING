-- =============================================================================
-- HỌC PHẦN: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG (COSH301)
-- ĐỀ TÀI: EVENTTICKETING - NỀN TẢNG QUẢN LÝ BÁN VÉ SỰ KIỆN & TỐI ƯU DOANH THU
-- SPRINT 1: WEB GIỚI THIỆU CONCERT & LỊCH TRÌNH (THEME 1)
-- HỆ QUẢN TRỊ CSDL: MySQL 8.0+ / MariaDB (InnoDB, UTF-8 MB4)
-- TÁC VỤ: THIẾT KẾ DDL, DML DỮ LIỆU MẪU ĐẠI DIỆN VÀ TRUY VẤN KIỂM THỬ SPRINT 1
-- =============================================================================

CREATE DATABASE IF NOT EXISTS EventTicketingDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE EventTicketingDB;
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

-- 1. BẢNG SU_KIEN: Lưu thông tin tổng quan, banner, media, thời gian mở bán & countdown
CREATE TABLE `SU_KIEN` (
    `SuKienID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính, mã định danh sự kiện',
    `TenSuKien` VARCHAR(255) NOT NULL COMMENT 'Tên chính thức của đại nhạc hội / concert',
    `Slogan` VARCHAR(255) NULL COMMENT 'Thông điệp / slogan truyền thông của chương trình',
    `MoTaChiTiet` TEXT NULL COMMENT 'Mô tả chi tiết nội dung chương trình, lưu ý khán giả',
    `ThoiGianBatDau` DATETIME NOT NULL COMMENT 'Thời điểm bắt đầu biểu diễn chính thức',
    `ThoiGianKetThuc` DATETIME NOT NULL COMMENT 'Thời điểm dự kiến bế mạc sự kiện',
    `ThoiGianMoBanVe` DATETIME NOT NULL COMMENT 'Thời điểm chính thức mở cổng bán vé (dùng cho Countdown Timer)',
    `ThoiGianDongBanVe` DATETIME NULL COMMENT 'Thời điểm đóng cổng bán vé trực tuyến',
    `DiaDiem` VARCHAR(255) NOT NULL COMMENT 'Địa chỉ cụ thể nơi tổ chức sự kiện',
    `TenSanVanDong` VARCHAR(255) NOT NULL COMMENT 'Tên địa điểm / sân vận động (VD: SVĐ Mỹ Đình)',
    `SucChua` INT NOT NULL DEFAULT 0 COMMENT 'Sức chứa tối đa của địa điểm tổ chức',
    `BannerURL` VARCHAR(500) NULL COMMENT 'Đường dẫn ảnh banner ngang trang chủ (Hero Banner)',
    `PosterURL` VARCHAR(500) NULL COMMENT 'Đường dẫn ảnh poster đứng chính thức của sự kiện',
    `TrailerURL` VARCHAR(500) NULL COMMENT 'Đường dẫn video teaser / trailer YouTube giới thiệu concert',
    `SoDoTongQuanURL` VARCHAR(500) NULL COMMENT 'Đường dẫn file ảnh/vector SVG sơ đồ tổng thể khán đài',
    `TrangThaiMoBan` VARCHAR(50) NOT NULL DEFAULT 'SAP_MO_BAN' COMMENT 'Trạng thái: SAP_MO_BAN, DANG_MO_BAN, HET_VE, DA_DIEN_RA',
    `QuyDinhDoTuoi` VARCHAR(100) NULL DEFAULT '14+' COMMENT 'Quy định độ tuổi khán giả tham gia',
    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo bản ghi',
    `NgayCapNhat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật bản ghi',
    CONSTRAINT `chk_thoigian_sukien` CHECK (`ThoiGianKetThuc` > `ThoiGianBatDau`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ thông tin Đại nhạc hội (Theme 1)';

-- 2. BẢNG NGHE_SI: Lưu trữ thông tin dàn nghệ sĩ, ca sĩ, ban nhạc biểu diễn (Lineup)
CREATE TABLE `NGHE_SI` (
    `NgheSiID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính, mã định danh nghệ sĩ',
    `HoTen` VARCHAR(150) NOT NULL COMMENT 'Họ và tên thật của nghệ sĩ',
    `NgheDanh` VARCHAR(150) NOT NULL COMMENT 'Nghệ danh biểu diễn công chúng',
    `VaiTroChinh` VARCHAR(100) NULL COMMENT 'Vai trò: Ca sĩ, Rapper, Nhạc sĩ, Producer, Ban nhạc',
    `TieuSu` TEXT NULL COMMENT 'Tiểu sử tóm tắt, phong cách âm nhạc và giải thưởng',
    `HinhAnhURL` VARCHAR(500) NULL COMMENT 'Ảnh đại diện chất lượng cao của nghệ sĩ',
    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo bản ghi'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ dàn nghệ sĩ biểu diễn (Lineup)';

-- 3. BẢNG SU_KIEN_NGHE_SI: Bảng nối thể hiện mối quan hệ nhiều-nhiều (N-N) giữa Sự kiện & Nghệ sĩ
CREATE TABLE `SU_KIEN_NGHE_SI` (
    `ID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính bảng nối',
    `SuKienID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng SU_KIEN',
    `NgheSiID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng NGHE_SI',
    `VaiTroTrongSuKien` VARCHAR(100) NOT NULL DEFAULT 'Main Act' COMMENT 'Vai trò: Headliner, Main Act, Special Guest',
    `ThuTuHienThi` INT NOT NULL DEFAULT 1 COMMENT 'Thứ tự ưu tiên hiển thị trên Web showcase (1 là cao nhất)',
    CONSTRAINT `fk_skns_sukien` FOREIGN KEY (`SuKienID`) REFERENCES `SU_KIEN` (`SuKienID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_skns_nghesi` FOREIGN KEY (`NgheSiID`) REFERENCES `NGHE_SI` (`NgheSiID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_sukien_nghesi` UNIQUE KEY (`SuKienID`, `NgheSiID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng liên kết Sự kiện và Dàn nghệ sĩ tham gia';

-- 4. BẢNG LICH_TRINH: Lưu timeline chi tiết các hoạt động diễn ra trong ngày biểu diễn
CREATE TABLE `LICH_TRINH` (
    `LichTrinhID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính mốc lịch trình',
    `SuKienID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng SU_KIEN',
    `GioBatDau` TIME NOT NULL COMMENT 'Thời gian bắt đầu hoạt động (HH:MM:SS)',
    `GioKetThuc` TIME NOT NULL COMMENT 'Thời gian kết thúc hoạt động (HH:MM:SS)',
    `TenHoatDong` VARCHAR(255) NOT NULL COMMENT 'Tiêu đề hoạt động (Check-in, Soundcheck, Set 1...)',
    `MoTaHoatDong` TEXT NULL COMMENT 'Mô tả chi tiết nội dung hoạt động',
    `DiaDiemHoatDong` VARCHAR(150) NULL COMMENT 'Khu vực diễn ra: Sảnh chính, Sân khấu trung tâm, Cổng VIP',
    `ThuTu` INT NOT NULL DEFAULT 1 COMMENT 'Thứ tự trình chiếu trên trang Timeline',
    CONSTRAINT `fk_lichtrinh_sukien` FOREIGN KEY (`SuKienID`) REFERENCES `SU_KIEN` (`SuKienID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `chk_thoigian_lichtrinh` CHECK (`GioKetThuc` > `GioBatDau`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu lịch trình / Timeline chi tiết sự kiện';

-- 5. BẢNG KHU_VUC: Lưu trữ các phân hạng vé, giá vé niêm yết, mã màu hiển thị sơ đồ SVG
CREATE TABLE `KHU_VUC` (
    `KhuVucID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính phân khu khán đài',
    `SuKienID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng SU_KIEN',
    `MaKhuVuc` VARCHAR(50) NOT NULL COMMENT 'Mã viết tắt: VVIP_DIAMOND, VIP_PLATINUM_1, ZONE_A...',
    `TenKhuVuc` VARCHAR(150) NOT NULL COMMENT 'Tên hiển thị: VVIP Diamond, VIP Platinum, Khán đài A...',
    `LoaiKhuVuc` VARCHAR(50) NOT NULL DEFAULT 'GHE_NGOI' COMMENT 'Loại khu: GHE_NGOI (Seated) hoặc DUNG_STAND (Standing)',
    `GiaVeNiemYet` DECIMAL(15, 2) NOT NULL COMMENT 'Giá vé chính thức niêm yết (VNĐ)',
    `MauSacHex` VARCHAR(20) NOT NULL COMMENT 'Mã màu HEX đại diện trên sơ đồ mặt bằng SVG (VD: #D500F9)',
    `MoTaQuyenLoi` TEXT NULL COMMENT 'Chi tiết đặc quyền: Soundcheck, Giftset, Fast-track check-in...',
    `TongSoGhe` INT NOT NULL DEFAULT 0 COMMENT 'Tổng số lượng chỗ ngồi / dung lượng của khu vực',
    CONSTRAINT `fk_khuvuc_sukien` FOREIGN KEY (`SuKienID`) REFERENCES `SU_KIEN` (`SuKienID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_sukien_makhu` UNIQUE KEY (`SuKienID`, `MaKhuVuc`),
    CONSTRAINT `chk_giave_duong` CHECK (`GiaVeNiemYet` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ phân hạng vé & thông tin sơ đồ khu vực';

-- 6. BẢNG GHE: Lưu trữ từng vị trí ghế chi tiết và trạng thái phục vụ hiển thị sơ đồ
CREATE TABLE `GHE` (
    `GheID` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính mã định danh ghế',
    `KhuVucID` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới bảng KHU_VUC',
    `SoHang` VARCHAR(20) NOT NULL COMMENT 'Ký hiệu hàng ghế (A, B, C...)',
    `SoGhe` VARCHAR(20) NOT NULL COMMENT 'Số thứ tự ghế trong hàng (01, 02, 03...)',
    `MaGheDayDu` VARCHAR(50) NOT NULL COMMENT 'Mã định danh đầy đủ hiển thị: VVIP-A-01, VIP1-B-05...',
    `TrangThai` VARCHAR(30) NOT NULL DEFAULT 'TRONG' COMMENT 'Trạng thái: TRONG (Available), DA_BAN (Sold), DANG_GIU (Holding)',
    `ToaDoX` INT NULL COMMENT 'Tọa độ X pixel tương đối trên bản vẽ SVG',
    `ToaDoY` INT NULL COMMENT 'Tọa độ Y pixel tương đối trên bản vẽ SVG',
    CONSTRAINT `fk_ghe_khuvuc` FOREIGN KEY (`KhuVucID`) REFERENCES `KHU_VUC` (`KhuVucID`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_khuvuc_maghe` UNIQUE KEY (`KhuVucID`, `MaGheDayDu`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu từng vị trí ghế và trạng thái phục vụ FR-T1-02';

-- -----------------------------------------------------------------------------
-- PHẦN 3: TẠO CHỈ MỤC (INDEXES) TỐI ƯU HIỆU NĂNG CHO SPRINT 1
-- -----------------------------------------------------------------------------
CREATE INDEX `idx_sukien_trangthai_moban` ON `SU_KIEN` (`TrangThaiMoBan`, `ThoiGianMoBanVe`);
CREATE INDEX `idx_lichtrinh_sukien_gio` ON `LICH_TRINH` (`SuKienID`, `GioBatDau`);
CREATE INDEX `idx_khuvuc_sukien_gia` ON `KHU_VUC` (`SuKienID`, `GiaVeNiemYet`);
CREATE INDEX `idx_ghe_khuvuc_trangthai` ON `GHE` (`KhuVucID`, `TrangThai`);

-- =============================================================================
-- PHẦN 4: DML - CHÈN BỘ DỮ LIỆU MẪU ĐẠI DIỆN THỰC TẾ (SAMPLE DATA)
-- KỊCH BẢN: ĐẠI NHẠC HỘI "ANH TRAI VƯỢT NGÀN CHÔNG GAI 2026" TẠI SVĐ MỸ ĐÌNH
-- =============================================================================

-- 1. Chèn dữ liệu Sự kiện (SU_KIEN)
INSERT INTO `SU_KIEN` (
    `SuKienID`, `TenSuKien`, `Slogan`, `MoTaChiTiet`, 
    `ThoiGianBatDau`, `ThoiGianKetThuc`, `ThoiGianMoBanVe`, `ThoiGianDongBanVe`, 
    `DiaDiem`, `TenSanVanDong`, `SucChua`, 
    `BannerURL`, `PosterURL`, `TrailerURL`, `SoDoTongQuanURL`, 
    `TrangThaiMoBan`, `QuyDinhDoTuoi`
) VALUES (
    1, 
    'ANH TRAI VƯỢT NGÀN CHÔNG GAI 2026 - CONCERT HÀ NỘI ĐÊM 3', 
    'Rực Lửa Đam Mê - Hòa Vang Ngàn Chông Gai Giữa Trái Tim Thủ Đô', 
    'Đại nhạc hội quy tụ dàn 33 Anh Tài đỉnh cao cùng các tiết mục âm nhạc kết hợp nghệ thuật dàn dựng sân khấu hiện đại bậc nhất châu Á. Chương trình ứng dụng hệ thống âm thanh vòm L-Acoustics K1/K2 và màn hình LED 360 độ siêu khủng trên diện tích mặt cỏ SVĐ Quốc gia Mỹ Đình.', 
    '2026-11-15 19:30:00', 
    '2026-11-15 23:30:00', 
    '2026-10-01 12:00:00', 
    '2026-11-14 18:00:00', 
    'Đường Lê Đức Thọ, Phường Mỹ Đình 1, Quận Nam Từ Liêm, TP. Hà Nội', 
    'Sân vận động Quốc gia Mỹ Đình', 
    40000, 
    'https://cdn.eventticketing.vn/events/atvncg2026/banner_hero_desktop_4k.webp', 
    'https://cdn.eventticketing.vn/events/atvncg2026/official_poster_vertical.webp', 
    'https://www.youtube.com/watch?v=atvncg2026_trailer_official', 
    'https://cdn.eventticketing.vn/events/atvncg2026/stadium_seatmap_my_dinh.svg', 
    'SAP_MO_BAN', 
    'Khán giả từ 14 tuổi trở lên (dưới 18 tuổi phải có người giám hộ đi cùng)'
);

-- 2. Chèn dữ liệu Nghệ sĩ biểu diễn (NGHE_SI)
INSERT INTO `NGHE_SI` (`NgheSiID`, `HoTen`, `NgheDanh`, `VaiTroChinh`, `TieuSu`, `HinhAnhURL`) VALUES
(1, 'Bùi Minh Trí', 'SOOBIN Hoàng Sơn', 'Ca sĩ / Nhạc sĩ', 'Anh Tài toàn năng của ATVNCG, biểu tượng âm nhạc R&B/Pop đương đại với hàng loạt hit trăm triệu view và phong thái trình diễn chuẩn quốc tế.', 'https://cdn.eventticketing.vn/artists/soobin_avatar.webp'),
(2, 'Lê Nguyễn Trung Đan', 'Binz', 'Rapper / Producer', 'Nhà thơ của Rap Việt, thành viên cốt cán SpaceSpeakers với flow đặc trưng và phong cách biểu diễn lãng tử, lôi cuốn.', 'https://cdn.eventticketing.vn/artists/binz_avatar.webp'),
(3, 'Vũ Đức Thiện', 'Rhymastic', 'Rapper / Producer', 'Phù thủy âm nhạc toàn năng, bậc thầy hòa âm phối khí và sáng tác đứng sau những màn trình diễn bùng nổ nhất mùa thi đấu.', 'https://cdn.eventticketing.vn/artists/rhymastic_avatar.webp'),
(4, 'Nguyễn Bằng Kiều', 'Bằng Kiều', 'Ca sĩ', 'Giọng ca nam cao (Tenor) huyền thoại của nền tân nhạc Việt Nam với chất giọng truyền cảm và khả năng xử lý nốt cao mượt mà thượng thừa.', 'https://cdn.eventticketing.vn/artists/bang_kieu_avatar.webp'),
(5, 'Nguyễn Tuấn Hưng', 'Tuấn Hưng', 'Ca sĩ', 'Giọng ca nội lực, nam tính và phong trần với hàng chục bản ballad quốc dân gắn liền với tuổi trẻ của nhiều thế hệ yêu nhạc.', 'https://cdn.eventticketing.vn/artists/tuan_hung_avatar.webp'),
(6, 'Nguyễn Tự Long', 'NSND Tự Long', 'Nghệ sĩ biểu diễn', 'Bậc thầy nghệ thuật truyền thống, người thổi hồn làn điệu Chèo và làn gió văn hóa dân tộc thăng hoa trong các tiết mục đương đại.', 'https://cdn.eventticketing.vn/artists/tu_long_avatar.webp');

-- 3. Chèn liên kết Nghệ sĩ & Sự kiện (SU_KIEN_NGHE_SI)
INSERT INTO `SU_KIEN_NGHE_SI` (`SuKienID`, `NgheSiID`, `VaiTroTrongSuKien`, `ThuTuHienThi`) VALUES
(1, 1, 'Headliner', 1),
(1, 2, 'Headliner', 2),
(1, 3, 'Headliner & Music Director', 3),
(1, 4, 'Special Legend Guest', 4),
(1, 5, 'Special Legend Guest', 5),
(1, 6, 'Cultural Performance Director', 6);

-- 4. Chèn Lịch trình chi tiết ngày diễn (LICH_TRINH)
INSERT INTO `LICH_TRINH` (`SuKienID`, `GioBatDau`, `GioKetThuc`, `TenHoatDong`, `MoTaHoatDong`, `DiaDiemHoatDong`, `ThuTu`) VALUES
(1, '13:00:00', '15:30:00', 'Mở sảnh đón tiếp & Trải nghiệm Fanzone', 'Khai mạc sảnh ngoài, check-in nhận ấn phẩm độc quyền, vòng tay phát sáng và giao lưu tại gian hàng nhà tài trợ.', 'Khuôn viên Quảng trường SVĐ Mỹ Đình', 1),
(1, '15:30:00', '16:30:00', 'Đặc quyền Soundcheck Party', 'Buổi thử giọng và tổng duyệt trước giờ G dành riêng độc quyền cho chủ nhân hạng vé VVIP Diamond & VIP Platinum 1.', 'Sân khấu chính mặt sân SVĐ', 2),
(1, '16:30:00', '18:30:00', 'Mở cổng kiểm soát vé toàn bộ các phân khu', 'Bắt đầu quét mã vé qua 40 cổng kiểm soát tự động. Khán giả nhanh chóng di chuyển ổn định chỗ ngồi theo phân khu.', 'Cổng Gate A, B, C, D', 3),
(1, '18:30:00', '19:15:00', 'Warm-up Show & DJ Set khởi động', 'Set nhạc DJ sôi động khuấy động bầu không khí trước giờ diễn chính thức cùng MC tương tác tặng quà.', 'Sân khấu trung tâm', 4),
(1, '19:30:00', '20:30:00', 'Phần 1: Khúc Ca Khải Hoàn & Đón Chào Anh Tài', 'Màn bắn pháo hiệu mở màn, giới thiệu 33 Anh Tài và trình diễn các ca khúc chủ đề mang âm hưởng hào hùng.', 'Sân khấu chính & Sàn Catwalk', 5),
(1, '20:30:00', '21:45:00', 'Phần 2: Đột Phá Giới Hạn & Battle Bùng Nổ', 'Những màn kết hợp đỉnh cao, đấu đối kháng vũ đạo, Rap Cypher và các ca khúc Remix sôi động nhất.', 'Sân khấu trung tâm', 6),
(1, '21:45:00', '23:00:00', 'Phần 3: Đại Hợp Xướng 40.000 Khán Giả', 'Toàn bộ nghệ sĩ và 40.000 khán giả cùng hòa giọng các bản tình ca huyền thoại dưới biển sáng Lightstick ngập tràn.', 'Toàn bộ sân vận động', 7),
(1, '23:00:00', '23:30:00', 'Chào kết, Bắn pháo hoa nghệ thuật & Bế mạc', 'Nghệ sĩ tri ân khán giả, màn trình diễn pháo hoa tầm cao nghệ thuật rực rỡ và hướng dẫn khán giả ra về an toàn.', 'Sân khấu chính & Bầu trời SVĐ', 8);

-- 5. Chèn dữ liệu Phân hạng vé & Khu vực khán đài (KHU_VUC)
INSERT INTO `KHU_VUC` (`KhuVucID`, `SuKienID`, `MaKhuVuc`, `TenKhuVuc`, `LoaiKhuVuc`, `GiaVeNiemYet`, `MauSacHex`, `MoTaQuyenLoi`, `TongSoGhe`) VALUES
(1, 1, 'VVIP_DIAMOND', 'VVIP Diamond Lounge', 'GHE_NGOI', 4500000.00, '#D500F9', 'Vị trí trực diện sân khấu, ghế bọc da cao cấp. Đặc quyền tham gia Soundcheck, Lối đi VIP riêng không xếp hàng, Box quà tặng kỉ niệm độc quyền & Tiệc ngọt phục vụ tại chỗ.', 500),
(2, 1, 'VIP_PLATINUM_1', 'VIP Platinum 1', 'GHE_NGOI', 3500000.00, '#2979FF', 'Ghế ngồi trung tâm tầng 1 mặt sân, góc nhìn trực diện nghệ sĩ. Tặng kèm túi Tote, Lanyard phiên bản giới hạn và Lightstick chính hãng.', 1500),
(3, 1, 'VIP_PLATINUM_2', 'VIP Platinum 2', 'GHE_NGOI', 3000000.00, '#00B0FF', 'Ghế ngồi trung tâm tầng 1 cánh trái và cánh phải, bao quát toàn bộ sàn Catwalk. Tặng kèm Lightstick chính hãng và Lanyard kỉ niệm.', 2000),
(4, 1, 'GA_STAND_1', 'GA Fanzone Standing 1 (Khu A)', 'DUNG_STAND', 2200000.00, '#00E676', 'Khu vực đứng sát sàn diễn chính cực sung, tương tác cự ly gần nhất với nghệ sĩ. Tặng vòng tay phát sáng và Lightstick chính thức.', 5000),
(5, 1, 'GA_STAND_2', 'GA Fanzone Standing 2 (Khu B)', 'DUNG_STAND', 1800000.00, '#76FF03', 'Khu vực đứng hai cánh sân khấu, không gian tự do bung xõa cùng âm nhạc. Tặng vòng tay phát sáng đổi màu theo nhịp nhạc.', 5000),
(6, 1, 'ZONE_A_T1', 'Khán đài A Tầng 1 (Tribune A)', 'GHE_NGOI', 1500000.00, '#FF9100', 'Ghế ngồi khán đài chính diện A có mái che, tầm mắt quan sát toàn cảnh hiệu ứng ánh sáng và visual LED sân khấu.', 8000),
(7, 1, 'ZONE_B_T2', 'Khán đài B Tầng 2 (Tribune B)', 'GHE_NGOI', 1200000.00, '#FFC400', 'Ghế ngồi khán đài B thoáng mát, âm thanh trung thực, bao quát toàn cảnh 40.000 khán giả rực rỡ trong biển sáng.', 10000),
(8, 1, 'ZONE_CD_UP', 'Khán đài C-D Tầng cao (Upper Tier)', 'GHE_NGOI', 800000.00, '#90A4AE', 'Khu vực ghế ngồi tiết kiệm dành cho học sinh, sinh viên, hỗ trợ 4 màn hình LED kích thước 800 inch truyền hình trực tiếp cực nét.', 8000);

-- 6. Chèn dữ liệu Ghế mẫu đại diện (GHE) - 48 Ghế phân bố các phân khu và trạng thái
-- Khu VVIP Diamond (KhuVucID = 1): 12 ghế mẫu
INSERT INTO `GHE` (`KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
(1, 'A', '01', 'VVIP-A-01', 'DA_BAN', 450, 600),
(1, 'A', '02', 'VVIP-A-02', 'DA_BAN', 470, 600),
(1, 'A', '03', 'VVIP-A-03', 'TRONG',  490, 600),
(1, 'A', '04', 'VVIP-A-04', 'TRONG',  510, 600),
(1, 'A', '05', 'VVIP-A-05', 'DANG_GIU', 530, 600),
(1, 'A', '06', 'VVIP-A-06', 'TRONG',  550, 600),
(1, 'B', '01', 'VVIP-B-01', 'DA_BAN', 450, 630),
(1, 'B', '02', 'VVIP-B-02', 'DA_BAN', 470, 630),
(1, 'B', '03', 'VVIP-B-03', 'DA_BAN', 490, 630),
(1, 'B', '04', 'VVIP-B-04', 'TRONG',  510, 630),
(1, 'B', '05', 'VVIP-B-05', 'TRONG',  530, 630),
(1, 'B', '06', 'VVIP-B-06', 'TRONG',  550, 630);

-- Khu VIP Platinum 1 (KhuVucID = 2): 12 ghế mẫu
INSERT INTO `GHE` (`KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
(2, 'C', '01', 'VIP1-C-01', 'DA_BAN', 400, 680),
(2, 'C', '02', 'VIP1-C-02', 'DA_BAN', 420, 680),
(2, 'C', '03', 'VIP1-C-03', 'TRONG',  440, 680),
(2, 'C', '04', 'VIP1-C-04', 'TRONG',  460, 680),
(2, 'C', '05', 'VIP1-C-05', 'TRONG',  480, 680),
(2, 'C', '06', 'VIP1-C-06', 'TRONG',  500, 680),
(2, 'D', '01', 'VIP1-D-01', 'DA_BAN', 400, 710),
(2, 'D', '02', 'VIP1-D-02', 'DA_BAN', 420, 710),
(2, 'D', '03', 'VIP1-D-03', 'TRONG',  440, 710),
(2, 'D', '04', 'VIP1-D-04', 'TRONG',  460, 710),
(2, 'D', '05', 'VIP1-D-05', 'DANG_GIU', 480, 710),
(2, 'D', '06', 'VIP1-D-06', 'TRONG',  500, 710);

-- Khu Khán đài A Tầng 1 (KhuVucID = 6): 12 ghế mẫu
INSERT INTO `GHE` (`KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
(6, 'E', '01', 'KDA-E-01', 'DA_BAN', 250, 400),
(6, 'E', '02', 'KDA-E-02', 'DA_BAN', 270, 400),
(6, 'E', '03', 'KDA-E-03', 'TRONG',  290, 400),
(6, 'E', '04', 'KDA-E-04', 'TRONG',  310, 400),
(6, 'E', '05', 'KDA-E-05', 'TRONG',  330, 400),
(6, 'E', '06', 'KDA-E-06', 'TRONG',  350, 400),
(6, 'F', '01', 'KDA-F-01', 'DA_BAN', 250, 430),
(6, 'F', '02', 'KDA-F-02', 'TRONG',  270, 430),
(6, 'F', '03', 'KDA-F-03', 'TRONG',  290, 430),
(6, 'F', '04', 'KDA-F-04', 'TRONG',  310, 430),
(6, 'F', '05', 'KDA-F-05', 'TRONG',  330, 430),
(6, 'F', '06', 'KDA-F-06', 'TRONG',  350, 430);

-- Khu Khán đài B Tầng 2 (KhuVucID = 7): 12 ghế mẫu
INSERT INTO `GHE` (`KhuVucID`, `SoHang`, `SoGhe`, `MaGheDayDu`, `TrangThai`, `ToaDoX`, `ToaDoY`) VALUES
(7, 'G', '01', 'KDB-G-01', 'DA_BAN', 650, 400),
(7, 'G', '02', 'KDB-G-02', 'DA_BAN', 670, 400),
(7, 'G', '03', 'KDB-G-03', 'TRONG',  690, 400),
(7, 'G', '04', 'KDB-G-04', 'TRONG',  710, 400),
(7, 'G', '05', 'KDB-G-05', 'TRONG',  730, 400),
(7, 'G', '06', 'KDB-G-06', 'TRONG',  750, 400),
(7, 'H', '01', 'KDB-H-01', 'TRONG',  650, 430),
(7, 'H', '02', 'KDB-H-02', 'TRONG',  670, 430),
(7, 'H', '03', 'KDB-H-03', 'TRONG',  690, 430),
(7, 'H', '04', 'KDB-H-04', 'TRONG',  710, 430),
(7, 'H', '05', 'KDB-H-05', 'TRONG',  730, 430),
(7, 'H', '06', 'KDB-H-06', 'TRONG',  750, 430);

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
ORDER BY kv.GiaVeNiemYet DESC;
