/**
 * Quy tắc "đổi tài khoản khi đang giữ chỗ" (thuần, không đụng DOM).
 *
 * Lượt giữ chỗ thuộc về một tài khoản. Khi tài khoản đó đăng xuất hoặc phiên chuyển sang tài khoản khác thì người dùng
 * không còn thấy hay hủy được lượt giữ, nên giao diện trả chỗ lại ngay và về trạng thái "chưa giữ". Đăng nhập lần đầu
 * (từ khách ẩn danh) hoặc phát lại cùng tài khoản (làm mới token) thì không làm gì.
 */
export const THONG_BAO_DANG_XUAT_TRA_CHO = 'Bạn đã đăng xuất nên chỗ đang giữ đã được trả lại. Đăng nhập lại để chọn và thanh toán.';
export const THONG_BAO_DOI_TAI_KHOAN_TRA_CHO = 'Tài khoản đã thay đổi nên chỗ đang giữ của tài khoản trước đã được trả lại.';

/**
 * Bộ theo dõi: gọi lanTruyen(session) cho mỗi lần phiên người mua đổi; trả về hành động cần làm.
 * @returns {(session: {userId?: string} | null | undefined, dangGiuCho: boolean) => null | {lyDo: 'DANG_XUAT' | 'DOI_TAI_KHOAN', thongBao: string}}
 */
export function taoBoTheoDoiPhienGiuCho() {
  let truoc; // undefined = chưa nhận lần phát đầu tiên
  return (session, dangGiuCho) => {
    const hienTai = session?.userId ?? null;
    const daCo = truoc;
    truoc = hienTai;
    if (daCo === undefined || daCo === null || daCo === hienTai) return null;
    if (!dangGiuCho) return null;
    return hienTai === null
      ? {lyDo: 'DANG_XUAT', thongBao: THONG_BAO_DANG_XUAT_TRA_CHO}
      : {lyDo: 'DOI_TAI_KHOAN', thongBao: THONG_BAO_DOI_TAI_KHOAN_TRA_CHO};
  };
}
