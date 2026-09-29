import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';

export type PublicEventRecord = {
  id: number;
  code: string;
  name: string;
  slogan?: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  saleStartsAt: string;
  saleEndsAt?: string;
  venueName: string;
  address: string;
  capacity: number;
  databaseSaleStatus: string;
  publicationStatus: 'CONG_KHAI' | 'BAN_NHAP' | 'DA_AN';
};

export class PublicEventNotFoundError extends Error {
  constructor() {
    super('Sự kiện không tồn tại hoặc chưa được công bố.');
    this.name = 'PublicEventNotFoundError';
  }
}

const MOCK_EVENT: PublicEventRecord = {
  id: 1,
  code: 'SUPER_CONCERT_2026',
  name: 'SUPER CONCERT 2026 — ĐẠI NHẠC HỘI NGOẠI THƯƠNG',
  slogan: 'SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026',
  description: 'Đêm đại nhạc hội quy mô 40.000 khán giả tại SVĐ Quốc gia Mỹ Đình.',
  startsAt: '2026-10-15T19:30:00+07:00',
  endsAt: '2026-10-15T23:00:00+07:00',
  saleStartsAt: '2026-10-01T10:00:00+07:00',
  saleEndsAt: '2026-10-15T18:00:00+07:00',
  venueName: 'SVĐ Quốc gia Mỹ Đình',
  address: 'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội',
  capacity: 40000,
  databaseSaleStatus: 'SAP_MO_BAN',
  publicationStatus: 'CONG_KHAI',
};

export async function loadPublicEvent(): Promise<PublicEventRecord> {
  if (runtimeConfig.useMockData) return MOCK_EVENT;

  if (!isSupabaseConfigured()) {
    const response = await fetch(
      `${runtimeConfig.apiBaseUrl}/api/v1/events/${encodeURIComponent(runtimeConfig.eventId)}`,
      {credentials: 'include', headers: {Accept: 'application/json'}},
    );
    if (response.status === 404) throw new PublicEventNotFoundError();
    if (!response.ok) throw new Error(`Không thể tải sự kiện: HTTP ${response.status}`);
    const result = await response.json() as {data: PublicEventRecord};
    return result.data;
  }

  const {requireSupabaseClient} = await import('./supabaseClient');
  const supabase = requireSupabaseClient();
  const {data, error} = await supabase
    .from('SU_KIEN')
    .select('*')
    .eq('SuKienID', runtimeConfig.eventDatabaseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PublicEventNotFoundError();

  const row = data as typeof data & {TrangThaiCongBo?: string};
  const publicationStatus = row.TrangThaiCongBo ??
    (row.TrangThaiMoBan === 'BAN_NHAP' ? 'BAN_NHAP' : 'CONG_KHAI');
  if (publicationStatus !== 'CONG_KHAI') throw new PublicEventNotFoundError();

  return {
    id: row.SuKienID,
    code: runtimeConfig.eventId,
    name: row.TenSuKien,
    slogan: row.Slogan ?? undefined,
    description: row.MoTaChiTiet ?? undefined,
    startsAt: row.ThoiGianBatDau,
    endsAt: row.ThoiGianKetThuc,
    saleStartsAt: row.ThoiGianMoBanVe,
    saleEndsAt: row.ThoiGianDongBanVe ?? undefined,
    venueName: row.TenSanVanDong,
    address: row.DiaDiem,
    capacity: row.SucChua,
    databaseSaleStatus: row.TrangThaiMoBan,
    publicationStatus: 'CONG_KHAI',
  };
}
