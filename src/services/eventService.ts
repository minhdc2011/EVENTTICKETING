import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import {deduplicateSlug} from '../domain/publicRoute';

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
> & {showCount: number};

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
  startsAt: '2026-10-15T19:30:00+07:00', endsAt: '2026-10-15T23:00:00+07:00',
  saleStartsAt: '2026-10-01T10:00:00+07:00', saleEndsAt: '2026-10-15T18:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'SAP_MO_BAN',
};

const MOCK_EVENT: PublicEventRecord = {
  id: 1, code: 'SUPER_CONCERT_2026', slug: 'super-concert-2026',
  name: 'SUPER CONCERT 2026 — ĐẠI NHẠC HỘI NGOẠI THƯƠNG',
  slogan: 'SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026',
  description: 'Đêm đại nhạc hội quy mô 40.000 khán giả tại SVĐ Quốc gia Mỹ Đình.',
  templateKey: 'SUPER_CONCERT_2026', category: 'AM_NHAC',
  bannerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=86',
  startsAt: MOCK_SHOW.startsAt, endsAt: MOCK_SHOW.endsAt,
  saleStartsAt: MOCK_SHOW.saleStartsAt, saleEndsAt: MOCK_SHOW.saleEndsAt,
  venueName: 'SVĐ Quốc gia Mỹ Đình', address: 'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội',
  capacity: 40000, databaseSaleStatus: MOCK_SHOW.databaseSaleStatus,
  publicationStatus: 'CONG_KHAI', selectedShow: MOCK_SHOW, shows: [MOCK_SHOW],
  ageRestriction: '14+', refundPolicy: 'Vé không hoàn hủy dưới mọi hình thức trừ khi sự kiện bị hủy.',
  contactEmail: 'hotro@eventticketing.vn', contactHotline: '1900-6408',
};

const MOCK_GENERIC_SHOWS: PublicShowRecord[] = [
  {id: 21, slug: 'ngay-1', name: 'Ngày 1 · Kết nối', startsAt: '2026-11-21T09:00:00+07:00', endsAt: '2026-11-21T17:00:00+07:00', saleStartsAt: '2026-10-08T09:00:00+07:00', saleEndsAt: '2026-11-21T08:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'SAP_MO_BAN'},
  {id: 22, slug: 'ngay-2', name: 'Ngày 2 · Thực hành', startsAt: '2026-11-22T09:00:00+07:00', endsAt: '2026-11-22T17:00:00+07:00', saleStartsAt: '2026-10-08T09:00:00+07:00', saleEndsAt: '2026-11-22T08:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', databaseSaleStatus: 'SAP_MO_BAN'},
];

const MOCK_GENERIC_EVENT: PublicEventRecord = {
  id: 2, code: 'CREATIVE_TECH_SUMMIT', slug: 'creative-tech-summit-2026',
  name: 'Creative Tech Summit 2026', slogan: 'Ý TƯỞNG, CÔNG NGHỆ VÀ NHỮNG KẾT NỐI MỚI',
  description: 'Hai ngày hội thảo, triển lãm và workshop dành cho cộng đồng sáng tạo, sản phẩm số và công nghệ.',
  templateKey: 'DEFAULT', category: 'HOI_THAO',
  bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1800&q=86',
  posterUrl: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=900&q=86',
  startsAt: MOCK_GENERIC_SHOWS[0].startsAt, endsAt: MOCK_GENERIC_SHOWS[0].endsAt,
  saleStartsAt: MOCK_GENERIC_SHOWS[0].saleStartsAt, saleEndsAt: MOCK_GENERIC_SHOWS[0].saleEndsAt,
  venueName: 'Trung tâm Hội nghị Quốc gia', address: '57 Phạm Hùng, Nam Từ Liêm, Hà Nội',
  capacity: 1200, databaseSaleStatus: 'SAP_MO_BAN', publicationStatus: 'CONG_KHAI',
  selectedShow: MOCK_GENERIC_SHOWS[0], shows: MOCK_GENERIC_SHOWS,
  ageRestriction: 'All ages', refundPolicy: 'Vé có thể sang nhượng nhưng không hoàn tiền sau khi mua.',
  contactEmail: 'contact@creativetech.vn', contactHotline: '024-3788-0099',
};

const MOCK_EVENTS = [MOCK_EVENT, MOCK_GENERIC_EVENT];

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
  return {
    id: Number(row.SuKienID), code: String(row.Slug || runtimeConfig.eventId),
    slug: deduplicateSlug(String(row.Slug || runtimeConfig.eventId)).toLowerCase(), name: String(row.TenSuKien),
    slogan: row.Slogan ? String(row.Slogan) : undefined,
    description: row.MoTaChiTiet ? String(row.MoTaChiTiet) : undefined,
    templateKey: row.TemplateKey === 'SUPER_CONCERT_2026' || Number(row.SuKienID) === 1 ? 'SUPER_CONCERT_2026' : 'DEFAULT',
    category: String(row.TheLoai || 'KHAC'),
    bannerUrl: row.BannerURL ? String(row.BannerURL) : undefined,
    posterUrl: row.PosterURL ? String(row.PosterURL) : undefined,
    trailerUrl: row.TrailerURL ? String(row.TrailerURL) : undefined,
    seatingMapUrl: row.SoDoTongQuanURL ? String(row.SoDoTongQuanURL) : undefined,
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
  };
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
  return Number(row.SuKienID) === 1 ? 'super-concert-2026' : `su-kien-${row.SuKienID}`;
}

export async function loadPublicEvents(): Promise<PublicEventSummary[]> {
  if (runtimeConfig.useMockData) {
    const baseEvents = MOCK_EVENTS.map(({id, slug, name, slogan, description, venueName, startsAt, publicationStatus, category, bannerUrl, posterUrl, shows}) => ({
      id, slug, name, slogan, description, venueName, startsAt, publicationStatus, category, bannerUrl, posterUrl, showCount: shows.length,
    }));
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
    return (await response.json() as {data: PublicEventSummary[]}).data;
  }
  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient() as any;
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
    return (legacyRows ?? []).map((row: Record<string, any>) => ({
      id: Number(row.SuKienID), slug: legacySlug(row), name: String(row.TenSuKien),
      slogan: row.Slogan ?? undefined, description: row.MoTaChiTiet ?? undefined,
      venueName: String(row.TenSanVanDong), startsAt: String(row.ThoiGianBatDau),
      publicationStatus: 'CONG_KHAI' as const, category: 'KHAC', showCount: 1,
    }));
  }
  if (error) throw error;
  return (data ?? []).map((row: Record<string, any>) => ({
    id: Number(row.SuKienID), slug: deduplicateSlug(String(row.Slug)), name: String(row.TenSuKien),
    slogan: row.Slogan ?? undefined, description: row.MoTaChiTiet ?? undefined,
    venueName: String(row.TenSanVanDong), startsAt: String(row.ThoiGianBatDau),
    category: String(row.TheLoai || 'KHAC'), bannerUrl: row.BannerURL ?? undefined, posterUrl: row.PosterURL ?? undefined,
    publicationStatus: 'CONG_KHAI' as const,
    showCount: Array.isArray(row.SUAT_DIEN) ? row.SUAT_DIEN.length : (row.SUAT_DIEN ? 1 : 0),
  }));
}

export async function loadPublicEvent(
  eventSlug = runtimeConfig.eventId.toLowerCase().replaceAll('_', '-'), showSlug?: string,
): Promise<PublicEventRecord> {
  const normalizedSlug = deduplicateSlug(eventSlug);
  if (runtimeConfig.useMockData) {
    const fallbackSlug = runtimeConfig.eventId.toLowerCase().replaceAll('_', '-');
    let mockEvent = MOCK_EVENTS.find((item) => item.slug === normalizedSlug || (item.id === 1 && normalizedSlug === fallbackSlug));
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
  const supabase = requireSupabaseClient() as any;
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
  if (!eventRow) throw new PublicEventNotFoundError();
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

export async function loadPublicTicketTiers(event: PublicEventRecord): Promise<PublicTicketTier[]> {
  if (runtimeConfig.useMockData) {
    if (event.templateKey === 'SUPER_CONCERT_2026') return [];
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
  if (!isSupabaseConfigured()) return [];
  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient() as any;
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
