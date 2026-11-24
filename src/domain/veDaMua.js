// Chuẩn hóa dữ liệu vé đã mua (từ ve_cua_toi hoặc kho mô phỏng) để giao diện luôn nhận một hình dạng cố định.
const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/** Chuẩn hóa một phần tử JSON do máy chủ trả về; trường lạ bị bỏ, trường thiếu có giá trị an toàn. */
export function chuanHoaVe(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw;
  const maKhuVuc = str(r.maKhuVuc);
  if (!maKhuVuc) return null;
  const soHang = str(r.soHang);
  const soGhe = str(r.soGhe);
  const soLuong = Number(r.soLuong);
  const donGia = r.donGia === null || r.donGia === undefined ? null : Number(r.donGia);
  return {
    veId: String(r.veId ?? `${r.holdId}-${r.maVe}`),
    holdId: String(r.holdId ?? ''),
    maVe: String(r.maVe ?? ''),
    soLuong: Number.isFinite(soLuong) && soLuong > 0 ? soLuong : 1,
    muaLuc: str(r.muaLuc),
    donGia: donGia !== null && Number.isFinite(donGia) ? donGia : null,
    suKienSlug: str(r.suKienSlug),
    tenSuKien: str(r.tenSuKien) ?? 'Sự kiện',
    posterUrl: str(r.posterUrl),
    diaDiem: str(r.diaDiem),
    tenSanVanDong: str(r.tenSanVanDong),
    suatSlug: str(r.suatSlug),
    tenSuat: str(r.tenSuat),
    batDauLuc: str(r.batDauLuc),
    maKhuVuc,
    tenKhuVuc: str(r.tenKhuVuc) ?? maKhuVuc,
    laKhuDung: soHang === null && soGhe === null,
    soHang,
    soGhe,
  };
}

