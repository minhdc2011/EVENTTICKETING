export type DatabaseSeatStatus = 'TRONG' | 'DA_BAN' | 'DANG_GIU' | 'KHONG_MO_BAN';

export interface ZoneRecord {
  KhuVucID: number;
  MaKhuVuc: string;
  TenKhuVuc: string;
  GiaVeNiemYet: number;
  MauSacHex?: string;
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
