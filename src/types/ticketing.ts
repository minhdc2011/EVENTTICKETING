export type DatabaseSeatStatus = 'TRONG' | 'DA_BAN' | 'DANG_GIU' | 'KHONG_MO_BAN';

export interface ZoneRecord {
  KhuVucID: number;
  MaKhuVuc: string;
  TenKhuVuc: string;
  GiaVeNiemYet: number;
  MauSacHex?: string;
  LoaiKhuVuc?: 'GHE_NGOI' | 'DUNG_STAND';
  TongSoGhe?: number;
}

export interface SeatRecord {
  GheID: number | string;
  KhuVucID: number;
  TenKhuVuc?: string;
  SoHang: string;
  SoGhe: string;
  MaGheDayDu: string;
  TrangThai: DatabaseSeatStatus;
  GiaVeNiemYet?: number;
}

export interface TicketingCatalog {
  zones: ZoneRecord[];
  seats: SeatRecord[];
}

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export interface HoldItem {
  ticketCode: string;
  zoneCode: string;
  quantity?: number;
  /** Đơn giá chốt do máy chủ trả về (nếu có). Chỉ đọc; RPC giữ chỗ hiện chưa bảo đảm trả trường này. */
  DonGiaChot?: number | null;
  /** Đơn giá hiển thị kèm mục (nếu có); không phải bằng chứng giá chốt. */
  price?: number | null;
}

export interface CreateHoldRequest {
  eventId: string;
  items: HoldItem[];
}

export interface HoldRecord {
  holdId: string;
  eventId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONVERTED';
  expiresAt: string;
  items: HoldItem[];
  /** Đơn giá chốt ở cấp bản ghi (nếu máy chủ trả về; chỉ dùng khi bản ghi chỉ có một dòng vé). */
  DonGiaChot?: number | null;
}

export interface SeatStatusEvent {
  type: 'SEAT_STATUS_CHANGED';
  eventId: string;
  seatId?: number | string;
  seatCode: string;
  zoneCode: string;
  status: DatabaseSeatStatus;
  occurredAt: string;
}
