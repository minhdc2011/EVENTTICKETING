import {resolveAssetUrl} from '../domain/assetHelper';
import {applyCuratedEventMedia, resolveCuratedEventMedia} from '../domain/curatedMedia.js';
import type {TicketingCatalog, ZoneRecord, SeatRecord} from '../types/ticketing';
import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import {deduplicateSlug} from '../domain/publicRoute';
import {resolveTemplateKey} from '../domain/superConcert.js';
import {stripTimelineFromDescription} from '../domain/eventTimeline.js';
import {
  groupCatalogArtistsByEvent,
  normalizeCatalogArtists,
  type CatalogArtist,
} from '../domain/catalogFilters.js';
import {resolvePublicArtistsFallback} from '../domain/artistLineup.js';
import {resolveMockCatalogExtraArtists} from '../domain/mockCatalogArtists.js';

export type {CatalogArtist};

export type PublicShowRecord = {
  id: number; slug: string; name: string; startsAt: string; endsAt: string;
  saleStartsAt: string; saleEndsAt?: string; timezone: string; databaseSaleStatus: string;
};

export type PublicEventRecord = {
  id: number; code: string; slug: string; name: string; slogan?: string; description?: string;
  templateKey: 'DEFAULT' | 'SUPER_CONCERT_2026'; category: string; bannerUrl?: string; posterUrl?: string;
  trailerUrl?: string; seatingMapUrl?: string; ageRestriction?: string; refundPolicy?: string;
  termsAndConditions?: string; contactEmail?: string; contactHotline?: string; fanpageUrl?: string;
  permitNumber?: string; locationMode?: string; onlineLink?: string; onlineInstructions?: string;
  startsAt: string; endsAt: string; saleStartsAt: string; saleEndsAt?: string;
  venueName: string; address: string; capacity: number; databaseSaleStatus: string;
  publicationStatus: 'CONG_KHAI' | 'BAN_NHAP' | 'DA_AN';
  selectedShow: PublicShowRecord; shows: PublicShowRecord[];
};

export type PublicEventSummary = Pick<PublicEventRecord,
  'id' | 'slug' | 'name' | 'slogan' | 'description' | 'venueName' | 'startsAt' | 'publicationStatus' | 'category' | 'bannerUrl' | 'posterUrl'
> & {showCount: number; artists: CatalogArtist[]};

export type PublicTicketTier = {
  id: number; code: string; name: string; price: number; color: string; description?: string;
  capacity: number; available: number;
};

export class PublicEventNotFoundError extends Error {
  constructor() {
    super('Sự kiện không tồn tại hoặc chưa được công bố.');
    this.name = 'PublicEventNotFoundError';
  }
}

const MOCK_SHOW: PublicShowRecord = {
  id: 1, slug: 'dem-chinh', name: 'Đêm diễn chính',
  startsAt: '2026-11-01T19:30:00+07:00', endsAt: '2026-11-30T23:00:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-30T22:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_EVENT: PublicEventRecord = {
  id: 1, code: 'SUPER_CONCERT_2026', slug: 'super-concert-2026',
  name: 'SUPER CONCERT 2026 — ĐẠI NHẠC HỘI NGOẠI THƯƠNG',
  slogan: 'SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026',
  description: 'Đêm đại nhạc hội quy mô 40.000 khán giả tại SVĐ Quốc gia Mỹ Đình.',
  templateKey: 'SUPER_CONCERT_2026', category: 'AM_NHAC',
  ...resolveCuratedEventMedia('super-concert-2026'),
  startsAt: MOCK_SHOW.startsAt, endsAt: MOCK_SHOW.endsAt,
  saleStartsAt: MOCK_SHOW.saleStartsAt, saleEndsAt: MOCK_SHOW.saleEndsAt,
  venueName: 'SVĐ Quốc gia Mỹ Đình', address: 'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội',
  capacity: 40000, databaseSaleStatus: MOCK_SHOW.databaseSaleStatus,
  publicationStatus: 'CONG_KHAI', selectedShow: MOCK_SHOW, shows: [MOCK_SHOW],
  ageRestriction: '14+', refundPolicy: 'Vé không hoàn hủy dưới mọi hình thức trừ khi sự kiện bị hủy.',
  contactEmail: 'hotro@eventticketing.vn', contactHotline: '1900-6408',
};

const MOCK_GENERIC_SHOWS: PublicShowRecord[] = [
  {id: 21, slug: 'ngay-1', name: 'Ngày 1 · Kết nối', startsAt: '2026-11-01T09:00:00+07:00', endsAt: '2026-11-01T17:00:00+07:00', saleStartsAt: '2026-10-25T09:00:00+07:00', saleEndsAt: '2026-11-30T22:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN'},
  {id: 22, slug: 'ngay-2', name: 'Ngày 2 · Thực hành', startsAt: '2026-11-30T09:00:00+07:00', endsAt: '2026-11-30T23:59:00+07:00', saleStartsAt: '2026-10-25T09:00:00+07:00', saleEndsAt: '2026-11-30T22:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN'},
];

const MOCK_GENERIC_EVENT: PublicEventRecord = {
  id: 2, code: 'CREATIVE_TECH_SUMMIT', slug: 'creative-tech-summit-2026',
  name: 'Creative Tech Summit 2026', slogan: 'Ý TƯỞNG, CÔNG NGHỆ VÀ NHỮNG KẾT NỐI MỚI',
  description: 'Hai ngày hội thảo, triển lãm và workshop dành cho cộng đồng sáng tạo, sản phẩm số và công nghệ.',
  templateKey: 'DEFAULT', category: 'HOI_THAO',
  bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1800&q=86',
  posterUrl: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=900&q=86',
  seatingMapUrl: resolveAssetUrl('/maps/ticketmaster-theater-proscenium.svg'),
  startsAt: MOCK_GENERIC_SHOWS[0].startsAt, endsAt: MOCK_GENERIC_SHOWS[1].endsAt,
  saleStartsAt: MOCK_GENERIC_SHOWS[0].saleStartsAt, saleEndsAt: MOCK_GENERIC_SHOWS[1].saleEndsAt,
  venueName: 'Trung tâm Hội nghị Quốc gia', address: '57 Phạm Hùng, Nam Từ Liêm, Hà Nội',
  capacity: 1200, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_GENERIC_SHOWS[0], shows: MOCK_GENERIC_SHOWS,
  ageRestriction: 'All ages', refundPolicy: 'Vé có thể sang nhượng nhưng không hoàn tiền sau khi mua.',
  contactEmail: 'contact@creativetech.vn', contactHotline: '024-3788-0099',
};

// Event sử dụng sơ đồ arena end-stage tham khảo.
const MOCK_ARENA_SHOW: PublicShowRecord = {
  id: 31, slug: 'dem-arena', name: 'Đêm diễn Arena Quốc tế',
  startsAt: '2026-11-21T18:30:00+07:00', endsAt: '2026-11-21T23:30:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-21T22:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_ARENA_EVENT: PublicEventRecord = {
  id: 3, code: 'AUTUMN_ARENA_FESTIVAL_2026', slug: 'autumn-arena-festival-2026',
  name: 'Autumn Arena International Music Festival 2026',
  slogan: 'ĐẠI NHẠC HỘI ARENA QUỐC TẾ THÁNG 11',
  description: 'Đêm nhạc hội quy mô lớn theo tiêu chuẩn Arena quốc tế với hệ thống âm thanh ánh sáng hiện đại và sơ đồ chỗ ngồi end-stage.',
  templateKey: 'DEFAULT', category: 'AM_NHAC',
  ...resolveCuratedEventMedia('autumn-arena-festival-2026'),
  seatingMapUrl: resolveAssetUrl('/maps/ticketmaster-arena-endstage.svg'),
  startsAt: MOCK_ARENA_SHOW.startsAt, endsAt: MOCK_ARENA_SHOW.endsAt,
  saleStartsAt: MOCK_ARENA_SHOW.saleStartsAt, saleEndsAt: MOCK_ARENA_SHOW.saleEndsAt,
  venueName: 'Cung Điền kinh Trong nhà Hà Nội', address: 'Đường Trần Hữu Dực, Cầu Diễn, Nam Từ Liêm, Hà Nội',
  capacity: 8000, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_ARENA_SHOW, shows: [MOCK_ARENA_SHOW],
  ageRestriction: '12+', refundPolicy: 'Vé không hoàn trả sau khi thanh toán thành công.',
  contactEmail: 'arena@eventticketing.vn', contactHotline: '1900-8899',
};

// 5 sự kiện từ Ticketgo.vn
const MOCK_MUSIQUE_SHOW: PublicShowRecord = {
  id: 41, slug: 'dem-chinh', name: 'Đêm nhạc Musique de Salon',
  startsAt: '2026-11-07T20:00:00+07:00', endsAt: '2026-11-07T23:00:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-07T21:30:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_TICKETGO_MUSIQUE: PublicEventRecord = {
  id: 4, code: 'MUSIQUE_DE_SALON_2026', slug: 'musique-de-salon-de-nho-mot-thoi',
  name: 'Liveshow Musique de Salon — Để Nhớ Một Thời',
  slogan: 'ĐÊM NHẠC TÌNH CA VƯỢT THỜI GIAN · NHẠC SĨ ĐỨC TRÍ',
  description: 'Đêm nhạc trữ tình đặc sắc được dàn dựng công phu bởi Nhạc sĩ Đức Trí cùng các giọng ca hàng đầu: Quang Dũng, Lê Hiếu, Hoàng Hải, Nguyên Hà.',
  templateKey: 'DEFAULT', category: 'AM_NHAC',
  ...resolveCuratedEventMedia('musique-de-salon-de-nho-mot-thoi'),
  startsAt: MOCK_MUSIQUE_SHOW.startsAt, endsAt: MOCK_MUSIQUE_SHOW.endsAt,
  saleStartsAt: MOCK_MUSIQUE_SHOW.saleStartsAt, saleEndsAt: MOCK_MUSIQUE_SHOW.saleEndsAt,
  venueName: 'Cung Văn hóa Hữu nghị Việt Xô', address: '91 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội',
  capacity: 1100, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_MUSIQUE_SHOW, shows: [MOCK_MUSIQUE_SHOW],
  ageRestriction: 'All ages', refundPolicy: 'Vé mua không áp dụng hoàn trả.',
  contactEmail: 'musique@ticketgo.vn', contactHotline: '024-3788-0055',
};

const MOCK_MOMANG_SHOW: PublicShowRecord = {
  id: 51, slug: 'dem-mo-mang', name: 'Đêm nhạc Mơ Màng Men Say 2',
  startsAt: '2026-11-14T19:30:00+07:00', endsAt: '2026-11-14T22:30:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-14T21:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_TICKETGO_MOMANG: PublicEventRecord = {
  id: 5, code: 'MO_MANG_MEN_SAY_2', slug: 'mo-mang-men-say-2',
  name: 'Liveshow Mơ Màng Men Say 2 — Phan Mạnh Quỳnh & Khách Mời',
  slogan: 'GIAI ĐIỆU HOÀNG HÔN THƠ MỘNG VÀ CẢM XÚC THĂNG HOA',
  description: 'Không gian âm nhạc ngoài trời ấn tượng tụ hội Phan Mạnh Quỳnh, ST Sơn Thạch, Bùi Công Nam với những bản hit được phối khí hoàn toàn mới.',
  templateKey: 'DEFAULT', category: 'AM_NHAC',
  ...resolveCuratedEventMedia('mo-mang-men-say-2'),
  startsAt: MOCK_MOMANG_SHOW.startsAt, endsAt: MOCK_MOMANG_SHOW.endsAt,
  saleStartsAt: MOCK_MOMANG_SHOW.saleStartsAt, saleEndsAt: MOCK_MOMANG_SHOW.saleEndsAt,
  venueName: 'Sân khấu Ngoài trời Bảo tàng Hà Nội', address: 'Đường Phạm Hùng, Mễ Trì, Nam Từ Liêm, Hà Nội',
  capacity: 2500, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_MOMANG_SHOW, shows: [MOCK_MOMANG_SHOW],
  ageRestriction: '10+', refundPolicy: 'Vé không áp dụng hoàn hủy sau khi xuất vé.',
  contactEmail: 'momang@ticketgo.vn', contactHotline: '024-3788-0056',
};

const MOCK_GOM_SHOW: PublicShowRecord = {
  id: 61, slug: 'vo-dien-chinh', name: 'Vở diễn GOm Show',
  startsAt: '2026-11-20T19:30:00+07:00', endsAt: '2026-11-20T21:30:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-20T20:30:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_TICKETGO_GOMSHOW: PublicEventRecord = {
  id: 6, code: 'GOM_SHOW_2026', slug: 'gom-show-dat-no-hoa',
  name: 'Vở Diễn Nghệ Thuật Sân Khấu "GOm Show — Đất Nở Hoa"',
  slogan: 'HÀNH TRÌNH TỎA SÁNG CỦA ĐẤT VÀ LỬA GỐM VIỆT',
  description: 'Dự án nghệ thuật âm nhạc và thị giác sáng tạo lấy cảm hứng từ hồn gốm truyền thống Việt Nam kết hợp múa đương đại và hiệu ứng thị giác ánh sáng.',
  templateKey: 'DEFAULT', category: 'SAN_KHAU',
  bannerUrl: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1800&q=86',
  posterUrl: 'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=900&q=86',
  startsAt: MOCK_GOM_SHOW.startsAt, endsAt: MOCK_GOM_SHOW.endsAt,
  saleStartsAt: MOCK_GOM_SHOW.saleStartsAt, saleEndsAt: MOCK_GOM_SHOW.saleEndsAt,
  venueName: 'Rạp Khăn Quàng Đỏ', address: '36 Lý Thái Tổ, Hoàn Kiếm, Hà Nội',
  capacity: 650, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_GOM_SHOW, shows: [MOCK_GOM_SHOW],
  ageRestriction: '6+', refundPolicy: 'Vé không áp dụng hoàn hủy sau khi đặt chỗ.',
  contactEmail: 'gomshow@ticketgo.vn', contactHotline: '024-3788-0057',
};

const MOCK_TRAMHUONG_SHOW: PublicShowRecord = {
  id: 71, slug: 'buoi-trai-nghiem', name: 'Buổi trải nghiệm Trầm hương & Trà đạo',
  startsAt: '2026-11-11T09:00:00+07:00', endsAt: '2026-11-11T16:30:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-11T12:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_TICKETGO_TRAMHUONG: PublicEventRecord = {
  id: 7, code: 'WORKSHOP_TRAM_HUONG_2026', slug: 'workshop-tram-huong-tra-dao-viet',
  name: 'Workshop & Trải Nghiệm "Hương Sắc Việt — Trầm Hương & Trà Đạo"',
  slogan: 'THƯỞNG TRÀ · TĨNH TÂM · ĐẮM CHÌM NGHỆ THUẬT',
  description: 'Workshop chuyên sâu về văn hóa thưởng trà cổ truyền và nghệ thuật thưởng hương trầm tự nhiên cùng các nghệ nhân hàng đầu.',
  templateKey: 'DEFAULT', category: 'WORKSHOP',
  bannerUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1800&q=86',
  posterUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=86',
  startsAt: MOCK_TRAMHUONG_SHOW.startsAt, endsAt: MOCK_TRAMHUONG_SHOW.endsAt,
  saleStartsAt: MOCK_TRAMHUONG_SHOW.saleStartsAt, saleEndsAt: MOCK_TRAMHUONG_SHOW.saleEndsAt,
  venueName: 'Không gian Nghệ thuật Heritage Space', address: '173 Xuân Thủy, Cầu Giấy, Hà Nội',
  capacity: 80, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_TRAMHUONG_SHOW, shows: [MOCK_TRAMHUONG_SHOW],
  ageRestriction: '14+', refundPolicy: 'Hỗ trợ bảo lưu suất tham gia nếu báo trước 48 giờ.',
  contactEmail: 'workshop@ticketgo.vn', contactHotline: '024-3788-0058',
};

const MOCK_MARATHON_SHOW: PublicShowRecord = {
  id: 81, slug: 'giai-chay', name: 'Ngày chạy Marathon & Đêm nhạc hội',
  startsAt: '2026-11-28T05:00:00+07:00', endsAt: '2026-11-28T22:30:00+07:00',
  saleStartsAt: '2026-10-25T10:00:00+07:00', saleEndsAt: '2026-11-28T18:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'DANG_MO_BAN',
};

const MOCK_TICKETGO_MARATHON: PublicEventRecord = {
  id: 8, code: 'TICKETGO_AUTUMN_RUN_2026', slug: 'ticketgo-autumn-marathon-music-night',
  name: 'Giải Chạy & Đại Nhạc Hội Năng Lượng Ticketgo Autumn Run & Beat',
  slogan: 'BỨT PHÁ GIỚI HẠN · BÙNG CHÁY ĐAM MÊ MÙA THU',
  description: 'Giải chạy marathon mùa thu kết hợp đại tiệc âm nhạc EDM và Acoustic bùng nổ giữa không gian xanh của Công viên Yên Sở.',
  templateKey: 'DEFAULT', category: 'THE_THAO',
  bannerUrl: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1800&q=86',
  posterUrl: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=900&q=86',
  startsAt: MOCK_MARATHON_SHOW.startsAt, endsAt: MOCK_MARATHON_SHOW.endsAt,
  saleStartsAt: MOCK_MARATHON_SHOW.saleStartsAt, saleEndsAt: MOCK_MARATHON_SHOW.saleEndsAt,
  venueName: 'Công viên Yên Sở', address: 'Gamuda City, Hoàng Mai, Hà Nội',
  capacity: 3500, databaseSaleStatus: 'DANG_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_MARATHON_SHOW, shows: [MOCK_MARATHON_SHOW],
  ageRestriction: 'All ages', refundPolicy: 'Vé bib thi đấu không hoàn hủy, hỗ trợ đổi tên vận động viên.',
  contactEmail: 'run@ticketgo.vn', contactHotline: '024-3788-0059',
};

const MOCK_EVENTS = [
  MOCK_EVENT,
  MOCK_GENERIC_EVENT,
  MOCK_ARENA_EVENT,
  MOCK_TICKETGO_MUSIQUE,
  MOCK_TICKETGO_MOMANG,
  MOCK_TICKETGO_GOMSHOW,
  MOCK_TICKETGO_TRAMHUONG,
  MOCK_TICKETGO_MARATHON,
];

function mapShow(row: Record<string, unknown>): PublicShowRecord {
  return {
    id: Number(row.SuatDienID), slug: String(row.Slug), name: String(row.TenSuatDien),
    startsAt: String(row.ThoiGianBatDau), endsAt: String(row.ThoiGianKetThuc),
    saleStartsAt: String(row.ThoiGianMoBanVe),
    saleEndsAt: row.ThoiGianDongBanVe ? String(row.ThoiGianDongBanVe) : undefined,
    timezone: String(row.MuiGio || 'Asia/Ho_Chi_Minh'), databaseSaleStatus: String(row.TrangThai),
  };
}

function mapEvent(row: Record<string, unknown>, shows: PublicShowRecord[], requestedShowSlug?: string): PublicEventRecord {
  const selectedShow = shows.find((show) => show.slug === requestedShowSlug) ?? shows[0];
  if (!selectedShow) throw new PublicEventNotFoundError();
  return applyCuratedEventMedia({
    id: Number(row.SuKienID), code: String(row.Slug || runtimeConfig.eventId),
    slug: deduplicateSlug(String(row.Slug || runtimeConfig.eventId)).toLowerCase(), name: String(row.TenSuKien),
    slogan: row.Slogan ? String(row.Slogan) : undefined,
    description: stripTimelineFromDescription(row.MoTaChiTiet ? String(row.MoTaChiTiet) : '') || undefined,
    templateKey: resolveTemplateKey(row),
    category: String(row.TheLoai || 'KHAC'),
    bannerUrl: row.BannerURL ? String(row.BannerURL) : undefined,
    posterUrl: row.PosterURL ? String(row.PosterURL) : undefined,
    trailerUrl: row.TrailerURL ? String(row.TrailerURL) : undefined,
    seatingMapUrl: row.SoDoTongQuanURL ? resolveAssetUrl(String(row.SoDoTongQuanURL)) : undefined,
    ageRestriction: row.QuyDinhDoTuoi ? String(row.QuyDinhDoTuoi) : undefined,
    refundPolicy: row.ChinhSachHoanHuy ? String(row.ChinhSachHoanHuy) : undefined,
    termsAndConditions: row.QuyDinhThamGia ? String(row.QuyDinhThamGia) : undefined,
    contactEmail: row.EmailLienHe ? String(row.EmailLienHe) : undefined,
    contactHotline: row.HotlineLienHe ? String(row.HotlineLienHe) : undefined,
    fanpageUrl: row.FanpageURL ? String(row.FanpageURL) : undefined,
    permitNumber: row.SoGiayPhepBieuDien ? String(row.SoGiayPhepBieuDien) : undefined,
    locationMode: row.LoaiHinhSuKien ? String(row.LoaiHinhSuKien) : undefined,
    onlineLink: row.DuongDanTrucTuyen ? String(row.DuongDanTrucTuyen) : undefined,
    onlineInstructions: row.HuongDanThamGiaTrucTuyen ? String(row.HuongDanThamGiaTrucTuyen) : undefined,
    startsAt: selectedShow.startsAt, endsAt: selectedShow.endsAt,
    saleStartsAt: selectedShow.saleStartsAt, saleEndsAt: selectedShow.saleEndsAt,
    venueName: String(row.TenSanVanDong || 'Địa điểm tổ chức'), address: String(row.DiaDiem || ''), capacity: Number(row.SucChua || 100),
    databaseSaleStatus: selectedShow.databaseSaleStatus, publicationStatus: 'CONG_KHAI',
    selectedShow, shows,
  }) as PublicEventRecord;
}

function legacyShow(row: Record<string, unknown>): PublicShowRecord {
  return {
    id: 1, slug: 'dem-chinh', name: 'Đêm diễn chính',
    startsAt: String(row.ThoiGianBatDau), endsAt: String(row.ThoiGianKetThuc),
    saleStartsAt: String(row.ThoiGianMoBanVe),
    saleEndsAt: row.ThoiGianDongBanVe ? String(row.ThoiGianDongBanVe) : undefined,
    timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: String(row.TrangThaiMoBan),
  };
}

function legacySlug(row: Record<string, unknown>) {
  // Older deployments have no Slug column: the configured concert id (VITE_EVENT_DATABASE_ID) keeps the concert slug.
  return Number(row.SuKienID) === runtimeConfig.eventDatabaseId ? 'super-concert-2026' : `su-kien-${row.SuKienID}`;
}

function toSummary(event: PublicEventRecord, artists: CatalogArtist[] = []): PublicEventSummary {
  return applyCuratedEventMedia({
    id: event.id,
    slug: event.slug,
    name: event.name,
    slogan: event.slogan,
    description: event.description,
    venueName: event.venueName,
    startsAt: event.startsAt,
    publicationStatus: event.publicationStatus,
    category: event.category,
    bannerUrl: event.bannerUrl,
    posterUrl: event.posterUrl,
    showCount: event.shows.length,
    artists,
  }) as PublicEventSummary;
}

export async function loadPublicEvents(): Promise<PublicEventSummary[]> {
  if (runtimeConfig.useMockData) {
    const baseEvents = MOCK_EVENTS.map((event) =>
      toSummary(
        event,
        normalizeCatalogArtists(
          [...resolvePublicArtistsFallback(event), ...resolveMockCatalogExtraArtists(event)],
          'mock',
        ),
      ),
    );
    try {
      const stored = JSON.parse(localStorage.getItem('eventticketing:mock-organizer-events') || '[]') as any[];
      const published = stored.filter((e) => e.status === 'CONG_KHAI').map((e) => ({
        id: Number(e.id),
        slug: deduplicateSlug(String(e.slug)),
        name: String(e.name),
        slogan: e.slogan ? String(e.slogan) : undefined,
        description: e.description ? String(e.description) : undefined,
        venueName: String(e.venueName || 'Địa điểm tổ chức'),
        startsAt: String(e.startsAt),
        publicationStatus: 'CONG_KHAI' as const,
        category: String(e.category || 'KHAC'),
        bannerUrl: e.bannerUrl ? String(e.bannerUrl) : undefined,
        posterUrl: e.posterUrl ? String(e.posterUrl) : undefined,
        showCount: Number(e.showCount || 1),
        artists: normalizeCatalogArtists(
          (Array.isArray(e.artists) ? e.artists : []).map((a: any) => ({
            NgheSiID: a.artistId ?? a.id,
            NgheDanh: a.name,
            HoTen: a.realName || a.name,
            VaiTroChinh: a.role,
            HinhAnhURL: a.imageUrl,
            ThuTuHienThi: a.order,
          })),
          'mock',
        ),
      }));
      return [...baseEvents, ...published];
    } catch {
      return baseEvents;
    }
  }
  if (!isSupabaseConfigured()) {
    const response = await fetch(`${runtimeConfig.apiBaseUrl}/api/v1/events`, {
      credentials: 'include', headers: {Accept: 'application/json'},
    });
    if (!response.ok) throw new Error(`Không thể tải danh mục sự kiện: HTTP ${response.status}`);
    const payload = (await response.json()) as {data?: any[]};
    const items = Array.isArray(payload?.data) ? payload.data : [];
    return items.map((e: any) => applyCuratedEventMedia({
      ...e,
      artists: Array.isArray(e.artists) ? normalizeCatalogArtists(e.artists, 'api') : [],
    }) as PublicEventSummary);
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient();
  const {data, error} = await supabase.from('SU_KIEN')
    .select('SuKienID, Slug, TenSuKien, Slogan, MoTaChiTiet, TenSanVanDong, ThoiGianBatDau, TrangThaiCongBo, TemplateKey, TheLoai, BannerURL, PosterURL, SUAT_DIEN(SuatDienID)')
    .eq('TrangThaiCongBo', 'CONG_KHAI').order('ThoiGianBatDau');
  if (error && ['42703', 'PGRST200', 'PGRST204'].includes(String(error.code))) {
    // One-release compatibility path while Product Foundation is waiting to be
    // migrated on staging/production.
    const {data: legacyRows, error: legacyError} = await supabase.from('SU_KIEN')
      .select('SuKienID, TenSuKien, Slogan, MoTaChiTiet, TenSanVanDong, ThoiGianBatDau, TrangThaiCongBo')
      .eq('TrangThaiCongBo', 'CONG_KHAI').order('ThoiGianBatDau');
    if (legacyError) throw legacyError;
    return (legacyRows ?? []).map((row: Record<string, any>) => applyCuratedEventMedia({
      id: Number(row.SuKienID), slug: legacySlug(row), name: String(row.TenSuKien),
      slogan: row.Slogan ?? undefined, description: row.MoTaChiTiet ?? undefined,
      venueName: String(row.TenSanVanDong), startsAt: String(row.ThoiGianBatDau),
      publicationStatus: 'CONG_KHAI' as const, category: 'KHAC', showCount: 1,
      artists: [],
    }) as PublicEventSummary);
  }
  if (error) throw error;

  let artistMap = new Map<number, CatalogArtist[]>();
  const ids = (data ?? [])
    .map((row: Record<string, any>) => Number(row.SuKienID))
    .filter((id: number) => Number.isFinite(id) && id > 0);

  if (ids.length > 0) {
    try {
      const {data: linkRows, error: linkError} = await supabase
        .from('SU_KIEN_NGHE_SI')
        .select('SuKienID, NgheSiID, VaiTroTrongSuKien, ThuTuHienThi, NGHE_SI(NgheSiID, HoTen, NgheDanh, VaiTroChinh, HinhAnhURL)')
        .in('SuKienID', ids)
        .order('ThuTuHienThi');
      if (linkError) {
        console.warn('Không thể tải nghệ sĩ sự kiện:', linkError);
      } else if (linkRows) {
        artistMap = groupCatalogArtistsByEvent(linkRows, 'db');
      }
    } catch (err) {
      console.warn('Lỗi khi tải quan hệ nghệ sĩ sự kiện:', err);
    }
  }

  const supabaseEvents = (data ?? []).map((row: Record<string, any>) => {
    const id = Number(row.SuKienID);
    return applyCuratedEventMedia({
      id,
      slug: deduplicateSlug(String(row.Slug)),
      name: String(row.TenSuKien),
      slogan: row.Slogan ?? undefined,
      description: row.MoTaChiTiet ?? undefined,
      venueName: String(row.TenSanVanDong),
      startsAt: String(row.ThoiGianBatDau),
      category: String(row.TheLoai || 'KHAC'),
      bannerUrl: row.BannerURL ?? undefined,
      posterUrl: row.PosterURL ?? undefined,
      publicationStatus: 'CONG_KHAI' as const,
      showCount: Array.isArray(row.SUAT_DIEN) ? row.SUAT_DIEN.length : (row.SUAT_DIEN ? 1 : 0),
      artists: artistMap.get(id) ?? [],
    }) as PublicEventSummary;
  });

  const existingSlugs = new Set(supabaseEvents.map((e) => e.slug));
  const fallbackEnrichedEvents = MOCK_EVENTS
    .filter((e) => !existingSlugs.has(e.slug) && e.publicationStatus === 'CONG_KHAI')
    .map((event) =>
      toSummary(event, normalizeCatalogArtists(resolvePublicArtistsFallback(event), 'mock')),
    );

  return [...supabaseEvents, ...fallbackEnrichedEvents];
}

export async function loadPublicEvent(
  eventSlug = runtimeConfig.eventId.toLowerCase().replaceAll('_', '-'), showSlug?: string,
): Promise<PublicEventRecord> {
  const normalizedSlug = deduplicateSlug(eventSlug);
  if (runtimeConfig.useMockData) {
    const fallbackSlug = runtimeConfig.eventId.toLowerCase().replaceAll('_', '-');
    let mockEvent = MOCK_EVENTS.find((item) => item.slug === normalizedSlug || (item.code.toLowerCase().replaceAll('_', '-') === normalizedSlug && normalizedSlug === fallbackSlug));
    if (!mockEvent) {
      try {
        const stored = JSON.parse(localStorage.getItem('eventticketing:mock-organizer-events') || '[]') as any[];
        const found = stored.find((e) => (e.slug === normalizedSlug || deduplicateSlug(e.slug) === normalizedSlug) && e.status === 'CONG_KHAI');
        if (found) {
          const show: PublicShowRecord = {
            id: Number(found.id) + 100,
            slug: 'suat-1',
            name: 'Suất diễn 1',
            startsAt: found.startsAt,
            endsAt: found.endsAt,
            saleStartsAt: found.saleStartsAt,
            saleEndsAt: found.saleEndsAt,
            timezone: 'Asia/Ho_Chi_Minh',
            databaseSaleStatus: 'SAP_MO_BAN',
          };
          mockEvent = {
            id: Number(found.id),
            code: String(found.slug).toUpperCase().replaceAll('-', '_'),
            slug: deduplicateSlug(String(found.slug)),
            name: String(found.name),
            description: found.description || undefined,
            templateKey: 'DEFAULT',
            category: String(found.category || 'KHAC'),
            startsAt: found.startsAt,
            endsAt: found.endsAt,
            saleStartsAt: found.saleStartsAt,
            saleEndsAt: found.saleEndsAt,
            venueName: String(found.venueName || 'Địa điểm tổ chức'),
            address: String(found.address || ''),
            capacity: Number(found.capacity || 100),
            databaseSaleStatus: 'SAP_MO_BAN',
            publicationStatus: 'CONG_KHAI',
            selectedShow: show,
            shows: [show],
          };
        }
      } catch {
        // ignore
      }
    }
    if (!mockEvent) throw new PublicEventNotFoundError();
    const selectedShow = mockEvent.shows.find((show) => show.slug === showSlug) ?? mockEvent.shows[0];
    if (showSlug && selectedShow.slug !== showSlug) throw new PublicEventNotFoundError();
    return {...mockEvent, selectedShow, startsAt: selectedShow.startsAt, endsAt: selectedShow.endsAt, saleStartsAt: selectedShow.saleStartsAt, saleEndsAt: selectedShow.saleEndsAt, databaseSaleStatus: selectedShow.databaseSaleStatus};
  }
  if (!isSupabaseConfigured()) {
    const showQuery = showSlug ? `?show=${encodeURIComponent(showSlug)}` : '';
    const response = await fetch(`${runtimeConfig.apiBaseUrl}/api/v1/events/${encodeURIComponent(normalizedSlug)}${showQuery}`, {
      credentials: 'include', headers: {Accept: 'application/json'},
    });
    if (response.status === 404) throw new PublicEventNotFoundError();
    if (!response.ok) throw new Error(`Không thể tải sự kiện: HTTP ${response.status}`);
    return (await response.json() as {data: PublicEventRecord}).data;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient();
  let eventRow = null;
  const {data: directRow, error: eventError} = await supabase.from('SU_KIEN').select('*')
    .eq('Slug', normalizedSlug).eq('TrangThaiCongBo', 'CONG_KHAI').maybeSingle();
  if (eventError && ['42703', 'PGRST204'].includes(String(eventError.code))) {
    const fallbackSlug = runtimeConfig.eventId.toLowerCase().replaceAll('_', '-');
    if (normalizedSlug !== 'super-concert-2026' && normalizedSlug !== fallbackSlug) throw new PublicEventNotFoundError();
    const {data: legacyRow, error: legacyError} = await supabase.from('SU_KIEN').select('*')
      .eq('SuKienID', runtimeConfig.eventDatabaseId).maybeSingle();
    if (legacyError) throw legacyError;
    if (!legacyRow || legacyRow.TrangThaiCongBo !== 'CONG_KHAI') throw new PublicEventNotFoundError();
    const show = legacyShow(legacyRow);
    if (showSlug && showSlug !== show.slug) throw new PublicEventNotFoundError();
    return mapEvent({...legacyRow, Slug: legacySlug(legacyRow)}, [show], showSlug);
  }
  if (eventError) throw eventError;
  eventRow = directRow;
  if (!eventRow) {
    const doubledSlug = `${normalizedSlug}${normalizedSlug}`;
    const {data: doubledRow} = await supabase.from('SU_KIEN').select('*')
      .eq('Slug', doubledSlug).eq('TrangThaiCongBo', 'CONG_KHAI').maybeSingle();
    if (doubledRow) {
      eventRow = doubledRow;
    }
  }
  if (!eventRow) {
    const baseline = MOCK_EVENTS.find((item) => item.slug === normalizedSlug || item.code.toLowerCase().replaceAll('_', '-') === normalizedSlug);
    if (baseline) {
      const selectedShow = baseline.shows.find((show) => show.slug === showSlug) ?? baseline.shows[0];
      if (showSlug && selectedShow.slug !== showSlug) throw new PublicEventNotFoundError();
      return {...baseline, selectedShow, startsAt: selectedShow.startsAt, endsAt: selectedShow.endsAt, saleStartsAt: selectedShow.saleStartsAt, saleEndsAt: selectedShow.saleEndsAt, databaseSaleStatus: selectedShow.databaseSaleStatus};
    }
    throw new PublicEventNotFoundError();
  }
  const {data: showRows, error: showError} = await supabase.from('SUAT_DIEN').select('*')
    .eq('SuKienID', eventRow.SuKienID).neq('TrangThai', 'BAN_NHAP').order('ThoiGianBatDau');
  if (showError && ['42P01', 'PGRST205'].includes(String(showError.code))) {
    const show = legacyShow(eventRow);
    if (showSlug && showSlug !== show.slug) throw new PublicEventNotFoundError();
    return mapEvent(eventRow, [show], showSlug);
  }
  if (showError) throw showError;
  const shows = (showRows ?? []).map((row: Record<string, unknown>) => mapShow(row));
  if (showSlug && !shows.some((show: PublicShowRecord) => show.slug === showSlug)) throw new PublicEventNotFoundError();
  return mapEvent(eventRow, shows, showSlug);
}

const SUPER_CONCERT_TIERS: PublicTicketTier[] = [
  {id: 1, code: 'VVIP_DIAMOND', name: 'VVIP Diamond Lounge', price: 4500000, color: '#d8ff3e', description: 'Vị trí chính diện, cao và bao quát sân khấu. Soundcheck độc quyền & Fast-track riêng biệt.', capacity: 12, available: 6},
  {id: 2, code: 'VIP_PLATINUM_1', name: 'VIP Platinum 1', price: 3500000, color: '#6ea8ff', description: 'Vị trí trung tâm tầng 1, tặng túi Tote & Lanyard kỉ niệm.', capacity: 12, available: 7},
  {id: 3, code: 'VIP_PLATINUM_2', name: 'VIP Platinum 2', price: 3000000, color: '#58c7ff', description: 'Vị trí trung tâm liền kề sân khấu.', capacity: 12, available: 8},
  {id: 4, code: 'GA_STAND_1', name: 'GA Fanzone Standing 1 (Khu A)', price: 2200000, color: '#4ade80', description: 'Khu vực vé đứng tự do sát sân khấu chính.', capacity: 200, available: 140},
  {id: 5, code: 'GA_STAND_2', name: 'GA Fanzone Standing 2 (Khu B)', price: 1800000, color: '#2dd4bf', description: 'Khu vực vé đứng tự do không gian mở.', capacity: 200, available: 160},
  {id: 6, code: 'ZONE_A_T1', name: 'Khán đài A Tầng 1 (Tribune A)', price: 1500000, color: '#ffb454', description: 'Ghế đệm ngồi trung tâm đối diện sân khấu.', capacity: 12, available: 5},
  {id: 7, code: 'ZONE_B_T2', name: 'Khán đài B Tầng 2 (Tribune B)', price: 1200000, color: '#b98cff', description: 'Tầm nhìn cao toàn diện bao quát sân vận động.', capacity: 12, available: 8},
  {id: 8, code: 'ZONE_CD_UP', name: 'Khán đài C-D Tầng cao (Upper Tier)', price: 800000, color: '#b9e986', description: 'Không gian sôi động phù hợp cho đông đảo khán giả trẻ.', capacity: 12, available: 9},
];
const EVENT_SPECIFIC_TIERS: Record<string, PublicTicketTier[]> = {
  'super-concert-2026': SUPER_CONCERT_TIERS,
  'creative-tech-summit-2026': [
    {id: 201, code: 'ORCHESTRA_VIP', name: 'Orchestra Center VIP', price: 1200000, color: '#f59e0b', description: 'Khu vực khán phòng trung tâm, bao gồm Networking Lounge và tài liệu hội thảo.', capacity: 200, available: 73},
    {id: 202, code: 'STANDARD_DELEGATE', name: 'Đại biểu Tiêu chuẩn', price: 650000, color: '#3b82f6', description: 'Vé tham dự hai ngày hội thảo và quyền truy cập khu triển lãm công nghệ.', capacity: 700, available: 512},
    {id: 203, code: 'STUDENT_EARLY', name: 'Sinh viên & Early Bird', price: 350000, color: '#10b981', description: 'Vé ưu đãi sinh viên và nhóm khởi nghiệp, số lượng giới hạn.', capacity: 300, available: 184},
  ],
  'autumn-arena-festival-2026': [
    {id: 301, code: 'FLOOR_VIP', name: 'Floor Reserved VIP', price: 2500000, color: '#3b82f6', description: 'Ghế ngồi VIP hàng đầu trực diện sân khấu Arena, bộ quà tặng merchandise chính thức.', capacity: 250, available: 110},
    {id: 302, code: 'GA_FLOOR_PIT', name: 'GA Floor Standing Pit', price: 1800000, color: '#10b981', description: 'Khu đứng tự do sôi động nhất sát sàn diễn và catwalk.', capacity: 1500, available: 620},
    {id: 303, code: 'LOWER_BOWL', name: 'Lower Bowl 100-Level', price: 1200000, color: '#f59e0b', description: 'Khán đài tầng 1 góc nhìn trực diện sân khấu, âm thanh vòm sống động.', capacity: 2200, available: 980},
    {id: 304, code: 'UPPER_BOWL', name: 'Upper Bowl 200-Level', price: 650000, color: '#8b5cf6', description: 'Khán đài tầng cao tầm nhìn toàn cảnh sân khấu Arena.', capacity: 3000, available: 1450},
  ],
  'musique-de-salon-de-nho-mot-thoi': [
    {id: 401, code: 'VIP_DIAMOND', name: 'Hạng Vé Kim Cương (VIP Diamond)', price: 3500000, color: '#d8ff3e', description: 'Hàng ghế đầu trung tâm, tặng CD có chữ ký Nhạc sĩ Đức Trí và tiệc nhẹ.', capacity: 100, available: 28},
    {id: 402, code: 'VIP_PLATINUM', name: 'Hạng Vé Bạch Kim (Platinum)', price: 2500000, color: '#6ea8ff', description: 'Khán phòng chính tầng 1, tầm nhìn hoàn hảo.', capacity: 250, available: 85},
    {id: 403, code: 'GOLD', name: 'Hạng Vé Vàng (Gold)', price: 1800000, color: '#f59e0b', description: 'Vị trí tầng 1 và ban công trung tâm.', capacity: 350, available: 140},
    {id: 404, code: 'STANDARD', name: 'Hạng Vé Tiêu Chuẩn', price: 1000000, color: '#2dd4bf', description: 'Khu vực tầng 2 khán phòng Cung Việt Xô.', capacity: 400, available: 195},
  ],
  'mo-mang-men-say-2': [
    {id: 501, code: 'FANZONE_A', name: 'Fanzone Đứng Sát Sân Khấu', price: 1800000, color: '#10b981', description: 'Khu vực đứng tự do hòa mình cùng Phan Mạnh Quỳnh & nghệ sĩ.', capacity: 800, available: 310},
    {id: 502, code: 'VIP_SEATED', name: 'Khán Đài VIP Ghế Ngồi', price: 1500000, color: '#3b82f6', description: 'Ghế ngồi có đánh số, góc nhìn đẹp và phục vụ đồ uống.', capacity: 600, available: 175},
    {id: 503, code: 'GA_SEATED', name: 'Khán Đài Tiêu Chuẩn', price: 800000, color: '#f59e0b', description: 'Ghế ngồi khán đài mở bao quát sân khấu Bảo tàng Hà Nội.', capacity: 1100, available: 490},
  ],
  'gom-show-dat-no-hoa': [
    {id: 601, code: 'CENTER_VIP', name: 'Ghế Trung Tâm VIP', price: 900000, color: '#f59e0b', description: 'Hàng ghế trung tâm thưởng thức trọn vẹn hiệu ứng ánh sáng gốm đương đại.', capacity: 120, available: 42},
    {id: 602, code: 'TIER_A', name: 'Khán Phòng Hạng A', price: 650000, color: '#3b82f6', description: 'Vị trí cánh trung tâm âm thanh rõ nét.', capacity: 250, available: 95},
    {id: 603, code: 'TIER_B', name: 'Khán Phòng Hạng B', price: 400000, color: '#10b981', description: 'Vé phổ thông cho học sinh, sinh viên và gia đình.', capacity: 280, available: 120},
  ],
  'workshop-tram-huong-tra-dao-viet': [
    {id: 701, code: 'MASTERCLASS', name: 'Vé Trọn Gói Masterclass & Trầm Hương Quý', price: 850000, color: '#d97706', description: 'Bao gồm bộ dụng cụ thưởng trà cá nhân, mẫu trầm hương cao cấp và giao lưu nghệ nhân.', capacity: 30, available: 9},
    {id: 702, code: 'STANDARD_EXPERIENCE', name: 'Vé Trải Nghiệm Thưởng Trà Tiêu Chuẩn', price: 450000, color: '#10b981', description: 'Tham gia không gian đàm đạo văn hóa và thưởng thức 3 danh trà cổ truyền.', capacity: 50, available: 21},
  ],
  'ticketgo-autumn-marathon-music-night': [
    {id: 801, code: 'BIB_21KM', name: 'Cự Ly 21KM (Bán Marathon)', price: 850000, color: '#ef4444', description: 'Bib thi đấu chip timing, áo Finisher, huy chương kỉ niệm và vé VIP đại nhạc hội.', capacity: 1000, available: 320},
    {id: 802, code: 'BIB_10KM', name: 'Cự Ly 10KM Thử Thách', price: 650000, color: '#f59e0b', description: 'Bib thi đấu, áo chạy chính thức, huy chương hoàn thành và vé tham gia đêm nhạc.', capacity: 1200, available: 480},
    {id: 803, code: 'BIB_5KM', name: 'Cự Ly 5KM Gia Đình & Đồng Đội', price: 450000, color: '#10b981', description: 'Bib chạy vui nhộn, áo chạy kỷ niệm và vé vào cửa khu vực festival ẩm thực - âm nhạc.', capacity: 1300, available: 650},
  ],
};

/** True when the repository ships a complete demo ticket catalog for this event. */
export function hasFallbackCatalog(eventSlug?: string): boolean {
  const cleanSlug = deduplicateSlug(eventSlug || '');
  return Boolean(
    EVENT_SPECIFIC_TIERS[cleanSlug]
    || EVENT_SPECIFIC_TIERS[eventSlug || '']
    || DEMO_MAP_SECTIONS[cleanSlug]
    || DEMO_MAP_SECTIONS[eventSlug || ''],
  );
}

type DemoMapSection = {
  id: number;
  code: string;
  name: string;
  price: number;
  color: string;
  standing?: boolean;
  capacity?: number;
};

const ARENA_LOWER_SECTIONS = ['101', '102', '103', '104', '106', '107', '108', '109', '110', '111', '112'];
const ARENA_UPPER_SECTIONS = ['201_203', '204_206', '207_208', '209_212', '213_214', '215_217', '218_220'];

const DEMO_MAP_SECTIONS: Record<string, DemoMapSection[]> = {
  'creative-tech-summit-2026': [
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((box, index) => ({
      id: 2101 + index,
      code: `BOX_${box}`,
      name: `Private Box ${box}`,
      price: 1200000,
      color: '#10b981',
      capacity: 24,
    })),
    {id: 2110, code: 'ORCHESTRA_LEFT', name: 'Orchestra Left', price: 650000, color: '#f59e0b'},
    {id: 2111, code: 'ORCHESTRA_CENTER', name: 'Orchestra Center VIP', price: 1200000, color: '#d97706'},
    {id: 2112, code: 'ORCHESTRA_RIGHT', name: 'Orchestra Right', price: 650000, color: '#f59e0b'},
    {id: 2120, code: 'MEZZANINE_LEFT', name: 'Mezzanine Left', price: 650000, color: '#3b82f6'},
    {id: 2121, code: 'MEZZANINE_CENTER', name: 'Front Mezzanine Center', price: 650000, color: '#2563eb'},
    {id: 2122, code: 'MEZZANINE_RIGHT', name: 'Mezzanine Right', price: 650000, color: '#3b82f6'},
    {id: 2130, code: 'UPPER_BALCONY', name: 'Upper Balcony', price: 350000, color: '#7c3aed'},
  ],
  'autumn-arena-festival-2026': [
    {id: 3101, code: 'GA_PIT_LEFT', name: 'GA Pit Left', price: 1800000, color: '#10b981', standing: true, capacity: 750},
    {id: 3102, code: 'GA_PIT_RIGHT', name: 'GA Pit Right', price: 1800000, color: '#10b981', standing: true, capacity: 750},
    {id: 3111, code: 'FLOOR_1', name: 'Floor 1 VIP', price: 2500000, color: '#3b82f6'},
    {id: 3112, code: 'FLOOR_2_VIP', name: 'Floor 2 VIP Trung tâm', price: 2500000, color: '#2563eb'},
    {id: 3113, code: 'FLOOR_3', name: 'Floor 3 VIP', price: 2500000, color: '#3b82f6'},
    ...ARENA_LOWER_SECTIONS.map((section, index) => ({
      id: 3200 + index,
      code: `SEC_${section}`,
      name: `Section ${section.replace('_', '–')}`,
      price: 1200000,
      color: '#f59e0b',
    })),
    ...ARENA_UPPER_SECTIONS.map((section, index) => ({
      id: 3300 + index,
      code: `SEC_${section}`,
      name: `Upper Section ${section.replace('_', '–')}`,
      price: 650000,
      color: '#8b5cf6',
    })),
  ],
};

export async function loadPublicTicketTiers(event: PublicEventRecord): Promise<PublicTicketTier[]> {
  const specificTiers = EVENT_SPECIFIC_TIERS[event.slug] || EVENT_SPECIFIC_TIERS[deduplicateSlug(event.slug)];
  if (specificTiers && event.templateKey !== 'SUPER_CONCERT_2026') return specificTiers;

  if (runtimeConfig.useMockData) {
    if (event.templateKey === 'SUPER_CONCERT_2026') return SUPER_CONCERT_TIERS;
    const matched = specificTiers;
    if (matched) return matched;
    try {
      const stored = JSON.parse(localStorage.getItem('eventticketing:mock-organizer-events') || '[]') as any[];
      const found = stored.find((e) => e.slug === event.slug || deduplicateSlug(e.slug) === event.slug);
      if (found) {
        return [{
          id: Number(found.id) + 200,
          code: 'GENERAL_ADMISSION',
          name: 'Vé tiêu chuẩn',
          price: Number(found.price || 0),
          color: '#84cc16',
          description: 'Quyền vào cửa theo suất diễn đã chọn.',
          capacity: Number(found.capacity || 100),
          available: Number(found.capacity || 100),
        }];
      }
    } catch {
      // ignore
    }
    return [
      {id: 201, code: 'EARLY_BIRD', name: 'Early Bird', price: 450000, color: '#84cc16', description: 'Vé tham dự trọn ngày, số lượng giới hạn.', capacity: 300, available: 184},
      {id: 202, code: 'STANDARD', name: 'Standard', price: 650000, color: '#38bdf8', description: 'Vé tham dự và quyền truy cập khu triển lãm.', capacity: 700, available: 512},
      {id: 203, code: 'PRO', name: 'Professional', price: 1200000, color: '#fbbf24', description: 'Bao gồm networking lounge và tài liệu workshop.', capacity: 200, available: 73},
    ];
  }
  if (!isSupabaseConfigured()) return event.templateKey === 'SUPER_CONCERT_2026' ? SUPER_CONCERT_TIERS : [];
  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient();
  const {data, error} = await supabase.from('KHU_VUC')
    .select('KhuVucID, MaKhuVuc, TenKhuVuc, GiaVeNiemYet, MauSacHex, MoTaQuyenLoi, TongSoGhe, GHE(TrangThai)')
    .eq('SuatDienID', event.selectedShow.id).order('GiaVeNiemYet');
  if (error) throw error;
  return (data ?? []).map((row: Record<string, any>) => {
    const seats = Array.isArray(row.GHE) ? row.GHE : (row.GHE ? [row.GHE] : []);
    const available = seats.length ? seats.filter((seat: Record<string, unknown>) => seat.TrangThai === 'TRONG').length : Number(row.TongSoGhe || 0);
    return {id: Number(row.KhuVucID), code: String(row.MaKhuVuc), name: String(row.TenKhuVuc), price: Number(row.GiaVeNiemYet), color: String(row.MauSacHex || '#84cc16'), description: row.MoTaQuyenLoi ?? undefined, capacity: Number(row.TongSoGhe || 0), available};
  });
}

export type PublicPurchaseConfig = {maxTicketsPerOrder: number | null; holdMinutes: number | null};

/** Per-event purchase configuration (CAU_HINH_SU_KIEN). Null values mean "not configured": callers use defaults. */
export async function loadEventPurchaseConfig(event: Pick<PublicEventRecord, 'id'>): Promise<PublicPurchaseConfig> {
  const empty: PublicPurchaseConfig = {maxTicketsPerOrder: null, holdMinutes: null};
  if (runtimeConfig.useMockData || !isSupabaseConfigured()) return empty;
  try {
    const {requireSupabaseClient} = await import('./supabaseClient');
    const supabase = requireSupabaseClient();
    const {data, error} = await supabase.from('CAU_HINH_SU_KIEN')
      .select('SoVeToiDaMoiDon, ThoiGianGiuChoPhut').eq('SuKienID', event.id).maybeSingle();
    if (error || !data) return empty;
    return {
      maxTicketsPerOrder: data.SoVeToiDaMoiDon == null ? null : Number(data.SoVeToiDaMoiDon),
      holdMinutes: data.ThoiGianGiuChoPhut == null ? null : Number(data.ThoiGianGiuChoPhut),
    };
  } catch (error) {
    console.warn('Không đọc được cấu hình mua vé, dùng giá trị mặc định:', error);
    return empty;
  }
}

export type {PublicArtist, PublicArtistRecord} from './artistService';
export {
  SUPER_CONCERT_ARTISTS,
  loadPublicArtists,
  loadEventArtists,
  normalizeArtistRow,
} from './artistService';


export function getFallbackCatalog(eventSlug?: string): TicketingCatalog {
  const cleanSlug = deduplicateSlug(eventSlug || '');
  const tiers = EVENT_SPECIFIC_TIERS[cleanSlug] || EVENT_SPECIFIC_TIERS[eventSlug || ''] || SUPER_CONCERT_TIERS;
  const standingCodePattern = /(^|_)(STAND|STANDING|PIT|BIB|FANZONE)(_|$)/;
  const mapSections = DEMO_MAP_SECTIONS[cleanSlug] || DEMO_MAP_SECTIONS[eventSlug || ''];

  const zones: ZoneRecord[] = mapSections
    ? mapSections.map((section) => ({
        KhuVucID: section.id,
        MaKhuVuc: section.code,
        TenKhuVuc: section.name,
        GiaVeNiemYet: section.price,
        MauSacHex: section.color,
        LoaiKhuVuc: section.standing ? 'DUNG_STAND' : 'GHE_NGOI',
        TongSoGhe: section.capacity || 40,
      }))
    : tiers.map((tier, idx) => ({
        KhuVucID: tier.id || (idx + 1) * 10,
        MaKhuVuc: tier.code,
        TenKhuVuc: tier.name,
        GiaVeNiemYet: tier.price,
        MauSacHex: tier.color || '#3b82f6',
        LoaiKhuVuc: standingCodePattern.test(tier.code) ? 'DUNG_STAND' : 'GHE_NGOI',
        TongSoGhe: tier.capacity || 200,
      }));

  const seats: SeatRecord[] = [];
  let seatIdCounter = 1000;
  const rowNames = ['A', 'B', 'C', 'D'];

  zones.forEach((zone) => {
    if (zone.LoaiKhuVuc === 'DUNG_STAND') return;
    rowNames.forEach((row, rowIdx) => {
      for (let num = 1; num <= 10; num++) {
        const numStr = num < 10 ? '0' + num : '' + num;
        const isSold = (seatIdCounter % 7 === 0);
        const isHeld = (seatIdCounter % 11 === 0);
        seats.push({
          GheID: seatIdCounter++,
          KhuVucID: zone.KhuVucID,
          TenKhuVuc: zone.TenKhuVuc,
          SoHang: row,
          SoGhe: numStr,
          MaGheDayDu: zone.MaKhuVuc + '-' + row + '-' + numStr,
          TrangThai: isSold ? 'DA_BAN' : isHeld ? 'DANG_GIU' : 'TRONG',
          GiaVeNiemYet: zone.GiaVeNiemYet,
        });
      }
    });
  });

  return {zones, seats};
}
