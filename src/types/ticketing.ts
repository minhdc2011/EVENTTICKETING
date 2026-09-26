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
