/** Một dòng vé đã mua (ghế ngồi: một vé; khu đứng: một dòng có số lượng). */
export type MyTicket = {
  veId: string;
  holdId: string;
  maVe: string;
  soLuong: number;
  muaLuc: string | null;
  donGia: number | null;
  suKienSlug: string | null;
  tenSuKien: string;
  posterUrl: string | null;
  diaDiem: string | null;
  tenSanVanDong: string | null;
  suatSlug: string | null;
  tenSuat: string | null;
  batDauLuc: string | null;
  maKhuVuc: string;
  tenKhuVuc: string;
  laKhuDung: boolean;
  soHang: string | null;
  soGhe: string | null;
};

/** Chuẩn hóa một phần tử JSON do máy chủ trả về; trường lạ bị bỏ, trường thiếu có giá trị an toàn. Trả null nếu thiếu khu vực. */
export function chuanHoaVe(raw: unknown): MyTicket | null;
