// Lõi OTP thuần: không import Supabase hay runtimeConfig, mọi hàm nhận thời gian (ms) làm đầu vào.
// Trạng thái phía client chỉ gồm email và các mốc thời gian, tuyệt đối không chứa mã OTP.

/** Thời gian hiệu lực của mã OTP (giây). Tại đúng mốc này mã được coi là hết hiệu lực. */
export const HIEU_LUC_GIAY = 300;

/** Thời gian chờ giữa hai lần gửi (giây). Tại đúng mốc này được phép gửi lại. */
export const CHO_GUI_LAI_GIAY = 60;

/**
 * Cửa sổ đếm số lần gửi lại (giây).
 * LƯU Ý: bộ đếm gửi lại 3 lần/giờ chỉ là thông tin hiển thị phía client trên thiết bị này.
 * Đây KHÔNG phải giới hạn theo tài khoản trên nhiều thiết bị; máy chủ không hủy mã
 * hay khóa tài khoản theo bộ đếm này.
 */
export const CUA_SO_GUI_LAI_GIAY = 3600;

/**
 * Số lần gửi lại tối đa hiển thị trong một cửa sổ một giờ.
 * Chỉ là thông tin phía client, không bảo đảm giới hạn theo tài khoản trên nhiều thiết bị,
 * không đồng nghĩa với việc máy chủ hủy mã hay khóa tài khoản.
 */
export const SO_LAN_GUI_LAI_TOI_DA = 3;

/**
 * Cửa sổ đếm số lần nhập sai (giây).
 * LƯU Ý: bộ đếm 5 lần sai/15 phút chỉ là thông tin hiển thị phía client trên thiết bị này,
 * không phải giới hạn theo tài khoản trên nhiều thiết bị; máy chủ không hủy mã hay khóa
 * tài khoản theo bộ đếm này.
 */
export const CUA_SO_SAI_GIAY = 900;

/**
 * Số lần nhập sai tối đa hiển thị trong cửa sổ 15 phút.
 * Chỉ là thông tin phía client, không bảo đảm giới hạn theo tài khoản trên nhiều thiết bị,
 * máy chủ không hủy mã hay khóa tài khoản theo bộ đếm này.
 */
export const SO_LAN_SAI_TOI_DA = 5;

/** Mã chỉ được chấp nhận ở nhánh mô phỏng (runtimeConfig.useMockData). */
export const MA_MO_PHONG = '123456';

/** Nhãn nguồn kết quả của nhánh mô phỏng. */
export const NHAN_MO_PHONG = 'MO_PHONG';

const NHAN_THAT = 'THAT';

/**
 * Danh sách đóng các loại lỗi OTP được phép xuất hiện trong state/thông báo.
 * Phải khớp đúng union LoaiLoiOtp trong otpServiceCore.d.ts.
 */
export const LOAI_LOI_OTP = Object.freeze([
  'SAI_MA',
  'HET_HAN',
  'CHUA_GUI',
  'CLIENT_CHO_GUI_LAI',
  'CLIENT_HET_LUOT_GUI_LAI',
  'CLIENT_TAM_KHOA_NHAP',
  'RATE_LIMIT',
  'MANG',
  'CAU_HINH',
  'PHIEN_THAY_DOI',
  'KHONG_XAC_DINH',
]);

/**
 * Chuẩn hóa loại lỗi theo whitelist; giá trị ngoài danh sách (kể cả chuỗi có thể là mã OTP) → 'KHONG_XAC_DINH'.
 * @param {unknown} x
 */
export function chuanHoaLoaiLoiOtp(x) {
  return typeof x === 'string' && LOAI_LOI_OTP.includes(x) ? x : 'KHONG_XAC_DINH';
}

/** Lỗi dịch vụ OTP; message là câu tiếng Việt, không bao giờ chứa mã OTP hay message thô. */
export class OtpServiceError extends Error {
  /**
   * @param {string} message
   * @param {string} loai
   * @param {{soLanSaiConLai?: number | null, soLanGuiLaiConLai?: number | null}} [chiTiet]
   */
  constructor(message, loai, chiTiet = {}) {
    super(message);
    this.name = 'OtpServiceError';
    this.loai = loai;
    this.soLanSaiConLai = chiTiet.soLanSaiConLai ?? null;
    this.soLanGuiLaiConLai = chiTiet.soLanGuiLaiConLai ?? null;
  }
}

const trongCuaSo = (mocs, nowMs, cuaSoGiay) =>
  mocs.filter((t) => nowMs - t < cuaSoGiay * 1000);

/** @param {string} email */
export function taoTrangThaiOtp(email) {
  return { email, guiLuc: null, lichSuGuiLai: [], lichSuSai: [] };
}

// OtpServiceError.message luôn là câu tiếng Việt cố định; lỗi khác → thông báo chung, không dùng message thô.
const thongBaoTuLoiKho = (err) =>
  err instanceof OtpServiceError ? err.message : thongBaoLoiOtp('KHONG_XAC_DINH');

/**
 * Kho trạng thái OTP (bộ đếm gửi lại/nhập sai, mốc gửi) theo phiên người mua, chỉ trong bộ nhớ; không bao giờ chứa mã nhập.
 * Cùng (userId, email chuẩn hóa) → giữ nguyên qua kiểm tra lại cổng/remount panel; đổi tài khoản/email, đăng xuất
 * (lay(null)), thu hồi hoặc xác minh thành công (xoa) → bắt đầu lại từ trạng thái trống.
 */
export function taoKhoTrangThaiOtpPhien() {
  /**
   * Mục phiên hiện tại. theHe = thế hệ kho lúc tạo mục; yeuCau = promise đang chờ (không bao giờ chứa mã nhập).
   * @type {{khoa: string, theHe: number, trangThai: any, busy: 'send' | 'verify' | null, error: string | null, notice: string | null, yeuCau: Promise<void> | null} | null}
   */
  let o = null;
  // Thế hệ phiên của kho: tăng khi xoa(), lay(null) hoặc đổi khóa (userId + email chuẩn hóa).
  let theHeKho = 0;
  /** @type {Set<() => void>} */
  const nguoiNghe = new Set();
  const khoaCua = (/** @type {any} */ s) => `${s.userId}\u0000${chuanHoaEmail(s.email)}`;
  const coPhien = (/** @type {any} */ p) => !!p && typeof p.userId === 'string' && !!p.userId;
  const thongBao = () => {
    for (const cb of [...nguoiNghe]) {
      try {
        cb();
      } catch {
        // Người nghe lỗi không được làm hỏng kho.
      }
    }
  };
  // Lấy (hoặc tạo) mục cho phiên; trả null nếu không có phiên. Đổi khóa → tăng thế hệ, bỏ mục cũ (yêu cầu đang chờ thành cũ).
  const layMuc = (/** @type {any} */ phien) => {
    if (!coPhien(phien)) {
      theHeKho += 1;
      const coMuc = o !== null;
      o = null;
      if (coMuc) thongBao();
      return null;
    }
    const khoa = khoaCua(phien);
    if (!o || o.khoa !== khoa) {
      const doiKhoa = o !== null;
      if (doiKhoa) theHeKho += 1;
      o = { khoa, theHe: theHeKho, trangThai: taoTrangThaiOtp(phien.email), busy: null, error: null, notice: null, yeuCau: null };
      // Đổi khóa có thể xảy ra khi đang render: hoãn thông báo để không cập nhật state trong lúc render.
      if (doiKhoa) queueMicrotask(thongBao);
    }
    return o;
  };
  const chiTiet = (/** @type {any} */ m) => ({ trangThai: m.trangThai, busy: m.busy, error: m.error, notice: m.notice, theHe: m.theHe });
  const chup = (/** @type {any} */ m) => ({ khoa: m.khoa, theHe: m.theHe, mock: theHeBangChungMock });
  const conHopLe = (/** @type {any} */ m, /** @type {any} */ c) => o === m && m.khoa === c.khoa && m.theHe === c.theHe && theHeBangChungMock === c.mock;
  // Kết quả cũ: bỏ hoàn toàn. Chỉ khi mục vẫn là mục đó (chỉ thu hồi mock) mới gỡ cờ busy, không áp dụng kết quả.
  const boKetQuaCu = (/** @type {any} */ m) => {
    if (o === m) {
      m.busy = null;
      m.yeuCau = null;
      thongBao();
    }
  };
  const layNow = (/** @type {any} */ tuyChon) => (typeof tuyChon?.layNow === 'function' ? tuyChon.layNow() : Date.now());
  // Handler onVerified đang gắn từ panel hiện hành (theo khóa phiên); không bao giờ chứa mã nhập.
  /** @type {{khoa: string, fn: (ketQua: any) => void | Promise<void>} | null} */
  let onVerifiedGan = null;

  return {
    /**
     * Gắn handler onVerified hiện hành cho phiên; trả hàm gỡ (chỉ gỡ nếu handler đó vẫn đang gắn).
     * Nhờ vậy xác minh bắt đầu ở panel cũ nhưng hoàn tất khi panel mới đã mount vẫn gọi đúng handler mới.
     */
    ganOnVerified(/** @type {{userId: string, email: string} | null | undefined} */ phien, /** @type {(ketQua: any) => void | Promise<void>} */ fn) {
      if (!coPhien(phien) || typeof fn !== 'function') return () => {};
      const muc = { khoa: khoaCua(phien), fn };
      onVerifiedGan = muc;
      return () => {
        if (onVerifiedGan === muc) onVerifiedGan = null;
      };
    },
    lay(/** @type {{userId: string, email: string} | null | undefined} */ phien) {
      const m = layMuc(phien);
      return m ? m.trangThai : null;
    },
    ghi(/** @type {{userId: string, email: string}} */ phien, /** @type {any} */ trangThai) {
      if (phien && typeof phien.userId === 'string' && o && o.khoa === khoaCua(phien)) o.trangThai = trangThai;
    },
    xoa() {
      theHeKho += 1;
      o = null;
      thongBao();
    },
    layChiTiet(/** @type {{userId: string, email: string} | null | undefined} */ phien) {
      const m = layMuc(phien);
      return m ? chiTiet(m) : null;
    },
    dangKy(/** @type {() => void} */ listener) {
      // Bọc để cùng một hàm đăng ký hai lần vẫn có hai mục độc lập.
      const muc = () => listener();
      nguoiNghe.add(muc);
      return () => {
        nguoiNghe.delete(muc);
      };
    },
    /**
     * Gửi mã; yêu cầu sống qua remount panel. Đang busy → trả promise đang chờ, không gửi thêm.
     * @param {{userId: string, email: string}} phien
     * @param {{guiMaOtp: (email: string, opts: any) => Promise<any>, layNow?: () => number, thongBaoThanhCong?: string, thongBaoLoi?: (err: unknown) => string}} tuyChon
     */
    thucHienGui(phien, tuyChon) {
      const m = layMuc(phien);
      if (!m) return Promise.resolve();
      if (m.busy !== null && m.yeuCau) return m.yeuCau;
      const c = chup(m);
      const st = m.trangThai;
      m.busy = 'send';
      m.error = null;
      m.notice = null;
      const chay = (async () => {
        let ketQua;
        let loi;
        let thatBai = false;
        try {
          ketQua = await tuyChon.guiMaOtp(phien.email, { trangThai: st, userId: phien.userId });
        } catch (err) {
          thatBai = true;
          loi = err;
        }
        if (!conHopLe(m, c)) return boKetQuaCu(m);
        if (thatBai) {
          m.trangThai = capNhatSauLoi(m.trangThai, loi, layNow(tuyChon));
          m.error = tuyChon.thongBaoLoi ? tuyChon.thongBaoLoi(loi) : thongBaoTuLoiKho(loi);
        } else {
          // guiLuc do guiMaOtp ghi tại thời điểm hoàn tất; cooldown 60 giây tính từ đó.
          m.trangThai = ketQua.trangThai;
          m.notice = tuyChon.thongBaoThanhCong ?? 'Đã gửi mã xác minh tới email của bạn.';
        }
        m.busy = null;
        m.yeuCau = null;
        thongBao();
      })();
      m.yeuCau = chay;
      thongBao();
      return chay;
    },
    /**
     * Xác minh mã; maNhap chỉ đi qua tham số này (không lưu trong kho). Đang busy → trả promise đang chờ.
     * onVerified chỉ được gọi khi kết quả còn hợp lệ.
     * @param {{userId: string, email: string}} phien
     * @param {string} maNhap
     * @param {{xacMinhMaOtp: (email: string, token: string, userId: string, opts: any) => Promise<any>, onVerified?: (ketQua: any) => void | Promise<void>, layNow?: () => number, thongBaoThanhCong?: string, thongBaoLoi?: (err: unknown) => string}} tuyChon
     */
    thucHienXacMinh(phien, maNhap, tuyChon) {
      const m = layMuc(phien);
      if (!m) return Promise.resolve();
      if (m.busy !== null && m.yeuCau) return m.yeuCau;
      const c = chup(m);
      const st = m.trangThai;
      m.busy = 'verify';
      m.error = null;
      m.notice = null;
      const chay = (async () => {
        let ketQua;
        let loi;
        let thatBai = false;
        try {
          ketQua = await tuyChon.xacMinhMaOtp(phien.email, maNhap, phien.userId, { trangThai: st });
        } catch (err) {
          thatBai = true;
          loi = err;
        }
        if (!conHopLe(m, c)) return boKetQuaCu(m);
        if (thatBai) {
          // SAI_MA tăng bộ đếm đúng một lần tại đây (capNhatSauLoi); các lỗi khác giữ nguyên.
          m.trangThai = capNhatSauLoi(m.trangThai, loi, layNow(tuyChon));
          m.error = tuyChon.thongBaoLoi ? tuyChon.thongBaoLoi(loi) : thongBaoTuLoiKho(loi);
          m.busy = null;
          m.yeuCau = null;
          thongBao();
          return;
        }
        m.trangThai = datLaiSauThanhCong(ketQua?.trangThai ?? m.trangThai);
        m.notice = tuyChon.thongBaoThanhCong ?? 'Xác minh thành công. Đang kiểm tra quyền vào chọn vé…';
        m.busy = null;
        m.yeuCau = null;
        thongBao();
        // Ưu tiên handler đang gắn (đúng phiên); không có thì dùng tuyChon.onVerified (panel không truyền nó,
        // nên khi unmount hoàn toàn kho chỉ cập nhật trạng thái và không gọi callback của gate đã hủy).
        const gan = onVerifiedGan && onVerifiedGan.khoa === m.khoa ? onVerifiedGan.fn : null;
        const handler = gan ?? tuyChon.onVerified;
        if (typeof handler === 'function') {
          try {
            await handler(ketQua);
          } catch {
            // Lỗi ở bước sau xác minh do cổng xử lý; kho không đưa chi tiết lỗi ra ngoài.
          }
        }
      })();
      m.yeuCau = chay;
      thongBao();
      return chay;
    },
  };
}

/**
 * Ghi nhận một lần gửi. Chỉ lần gửi lại mới được tính vào bộ đếm gửi lại.
 * @param {{email: string, guiLuc: number | null, lichSuGuiLai: number[], lichSuSai: number[]}} st
 * @param {number} nowMs
 * @param {{laGuiLai?: boolean}} [tuyChon]
 */
export function ghiNhanGui(st, nowMs, tuyChon = {}) {
  const lichSuGuiLai = tuyChon.laGuiLai
    ? [...trongCuaSo(st.lichSuGuiLai, nowMs, CUA_SO_GUI_LAI_GIAY), nowMs]
    : [...st.lichSuGuiLai];
  return { ...st, guiLuc: nowMs, lichSuGuiLai, lichSuSai: [...st.lichSuSai] };
}

/** Ghi nhận một lần nhập sai (chỉ gọi khi loại lỗi là SAI_MA). */
export function ghiNhanSai(st, nowMs) {
  return {
    ...st,
    lichSuGuiLai: [...st.lichSuGuiLai],
    lichSuSai: [...trongCuaSo(st.lichSuSai, nowMs, CUA_SO_SAI_GIAY), nowMs],
  };
}

/** Sau khi xác minh thành công: xóa toàn bộ bộ đếm và mốc gửi. */
export function datLaiSauThanhCong(st) {
  return taoTrangThaiOtp(st.email);
}

/** Tính dữ liệu hiển thị từ trạng thái và thời điểm hiện tại. Mọi số đếm không âm. */
export function tinhThoiGianOtp(st, nowMs) {
  const daGui = st.guiLuc !== null && st.guiLuc !== undefined;
  const troiQua = daGui ? nowMs - st.guiLuc : 0;
  const conHieuLuc = daGui && troiQua < HIEU_LUC_GIAY * 1000;
  const giayConHieuLuc = daGui ? Math.max(0, Math.ceil((HIEU_LUC_GIAY * 1000 - troiQua) / 1000)) : 0;
  const giayChoGuiLai = daGui ? Math.max(0, Math.ceil((CHO_GUI_LAI_GIAY * 1000 - troiQua) / 1000)) : 0;

  const guiLaiTrongGio = trongCuaSo(st.lichSuGuiLai, nowMs, CUA_SO_GUI_LAI_GIAY).sort((a, b) => a - b);
  const soLanGuiLaiConLai = Math.max(0, SO_LAN_GUI_LAI_TOI_DA - guiLaiTrongGio.length);
  const hetLuotGuiLai = soLanGuiLaiConLai === 0;

  const mocCho = giayChoGuiLai > 0 ? st.guiLuc + CHO_GUI_LAI_GIAY * 1000 : null;
  // Lượt mới chỉ mở khi số mốc trong cửa sổ giảm xuống dưới 3, tức khi mốc thứ N-3 (đã sắp tăng dần) ra khỏi cửa sổ.
  const mocLuot = hetLuotGuiLai
    ? guiLaiTrongGio[guiLaiTrongGio.length - SO_LAN_GUI_LAI_TOI_DA] + CUA_SO_GUI_LAI_GIAY * 1000
    : null;
  const mocs = [mocCho, mocLuot].filter((m) => m !== null);
  const mocGuiLaiTiepTheo = mocs.length ? Math.max(...mocs) : null;

  const saiTrongCuaSo = trongCuaSo(st.lichSuSai, nowMs, CUA_SO_SAI_GIAY).sort((a, b) => a - b);
  const soLanSaiConLai = Math.max(0, SO_LAN_SAI_TOI_DA - saiTrongCuaSo.length);
  const biTamKhoaNhap = soLanSaiConLai === 0;
  const mocMoKhoaNhap = biTamKhoaNhap
    ? saiTrongCuaSo[saiTrongCuaSo.length - SO_LAN_SAI_TOI_DA] + CUA_SO_SAI_GIAY * 1000
    : null;

  return {
    conHieuLuc,
    giayConHieuLuc,
    coTheGuiLai: giayChoGuiLai === 0 && !hetLuotGuiLai,
    giayChoGuiLai,
    soLanGuiLaiConLai,
    mocGuiLaiTiepTheo,
    soLanSaiConLai,
    biTamKhoaNhap,
    mocMoKhoaNhap,
    gioiHanHienThi: { sai: SO_LAN_SAI_TOI_DA, phut: CUA_SO_SAI_GIAY / 60 },
    laThongTinPhiaClient: true,
  };
}

const MA_RATE_LIMIT = ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'];

/**
 * Phân loại lỗi Auth. Chỉ 'SAI_MA' được phép làm tăng bộ đếm nhập sai.
 * Supabase trả cùng mã otp_expired cho cả mã sai lẫn mã hết hạn, nên khi đồng hồ client
 * (thoiGian) cho biết OTP còn hạn hoặc không có thông tin, coi là SAI_MA.
 * @param {unknown} err
 * @param {{conHieuLuc: boolean} | null} [thoiGian]
 */
export function phanLoaiLoiAuth(err, thoiGian = null) {
  const e = /** @type {any} */ (err) ?? {};
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : null;

  if (/VITE_SUPABASE/i.test(message)) return 'CAU_HINH';
  if (status === 429 || MA_RATE_LIMIT.includes(code)) return 'RATE_LIMIT';
  if (
    e instanceof TypeError ||
    e.name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /fetch failed|failed to fetch|networkerror|network request failed/i.test(message)
  ) {
    return 'MANG';
  }
  if (code === 'otp_expired' || /expired or is invalid|token has expired/i.test(message)) {
    return thoiGian && thoiGian.conHieuLuc === false ? 'HET_HAN' : 'SAI_MA';
  }
  if (code === 'validation_failed') return 'SAI_MA';
  return 'KHONG_XAC_DINH';
}

/**
 * Câu thông báo tiếng Việt. Không nhúng mã OTP hay message thô của lỗi.
 * Số lần còn lại (nếu có thoiGian) luôn không âm và chỉ là thông tin phía client.
 * @param {unknown} loai Được chuẩn hóa theo whitelist; giá trị lạ dùng thông báo chung.
 * @param {ReturnType<typeof tinhThoiGianOtp> | null} [thoiGian]
 */
export function thongBaoLoiOtp(loai, thoiGian = null) {
  switch (chuanHoaLoaiLoiOtp(loai)) {
    case 'SAI_MA': {
      if (!thoiGian) return 'Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email.';
      const n = Math.max(0, thoiGian.soLanSaiConLai);
      return n > 0
        ? `Mã OTP không đúng. Bạn còn ${n} lần nhập trong ${thoiGian.gioiHanHienThi.phut} phút (theo bộ đếm trên thiết bị này).`
        : `Mã OTP không đúng. Bạn đã nhập sai ${thoiGian.gioiHanHienThi.sai} lần trong ${thoiGian.gioiHanHienThi.phut} phút (theo bộ đếm trên thiết bị này), còn 0 lần nhập. Vui lòng chờ rồi thử lại hoặc gửi lại mã.`;
    }
    case 'HET_HAN':
      return 'Mã OTP đã hết hiệu lực (sau 5 phút). Vui lòng gửi lại mã mới.';
    case 'RATE_LIMIT': {
      if (!thoiGian) return 'Bạn thao tác quá nhanh. Vui lòng chờ một lúc rồi thử lại.';
      const n = Math.max(0, thoiGian.soLanGuiLaiConLai);
      return `Bạn thao tác quá nhanh. Vui lòng chờ một lúc rồi thử lại (còn ${n} lần gửi lại theo bộ đếm trên thiết bị này).`;
    }
    case 'CHUA_GUI':
      return 'Bạn chưa yêu cầu gửi mã OTP. Vui lòng gửi mã trước khi nhập.';
    // Giới hạn phía client (thiết bị này), KHÁC với RATE_LIMIT do máy chủ Auth cưỡng chế.
    case 'CLIENT_CHO_GUI_LAI': {
      const s = thoiGian ? Math.max(0, thoiGian.giayChoGuiLai) : CHO_GUI_LAI_GIAY;
      return `Giới hạn trên thiết bị này: vui lòng chờ ${s} giây nữa rồi mới gửi lại mã. Chưa có yêu cầu nào được gửi tới máy chủ.`;
    }
    case 'CLIENT_HET_LUOT_GUI_LAI':
      return `Giới hạn trên thiết bị này: đã gửi lại mã ${SO_LAN_GUI_LAI_TOI_DA} lần trong 1 giờ. Chưa có yêu cầu nào được gửi tới máy chủ; vui lòng thử lại sau.`;
    case 'CLIENT_TAM_KHOA_NHAP':
      return `Giới hạn trên thiết bị này: đã nhập sai ${SO_LAN_SAI_TOI_DA} lần trong ${CUA_SO_SAI_GIAY / 60} phút. Chưa có yêu cầu nào được gửi tới máy chủ; vui lòng chờ rồi thử lại hoặc gửi lại mã.`;
    case 'MANG':
      return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại; lần này không tính là nhập sai.';
    case 'CAU_HINH':
      return 'Hệ thống xác thực chưa được cấu hình. Vui lòng liên hệ quản trị viên.';
    case 'PHIEN_THAY_DOI':
      return 'Phiên đăng nhập đã thay đổi trong lúc kiểm tra. Vui lòng thử lại; lần này không tính là nhập sai.';
    default:
      return 'Không thể xử lý yêu cầu OTP. Vui lòng thử lại sau.';
  }
}

// Tạo lỗi từ lỗi Auth; không dùng err.message và không giữ tham chiếu tới lỗi gốc.
function taoLoi(err, tuyChon, laXacMinh) {
  if (err instanceof OtpServiceError) return err;
  const trangThai = tuyChon?.trangThai ?? null;
  const nowMs = tuyChon?.nowMs;
  let thoiGian = trangThai && typeof nowMs === 'number' ? tinhThoiGianOtp(trangThai, nowMs) : null;
  const loai = phanLoaiLoiAuth(err, thoiGian);
  if (loai === 'SAI_MA' && laXacMinh && trangThai && typeof nowMs === 'number') {
    // Hiển thị số lần còn lại sau khi tính lần sai này; việc ghi nhận do bên gọi thực hiện.
    thoiGian = tinhThoiGianOtp(ghiNhanSai(trangThai, nowMs), nowMs);
  }
  return new OtpServiceError(thongBaoLoiOtp(loai, thoiGian), loai, {
    soLanSaiConLai: thoiGian ? thoiGian.soLanSaiConLai : null,
    soLanGuiLaiConLai: thoiGian ? thoiGian.soLanGuiLaiConLai : null,
  });
}

/**
 * Cập nhật trạng thái sau lỗi: chỉ SAI_MA mới tăng bộ đếm nhập sai.
 * @param {{email: string, guiLuc: number | null, lichSuGuiLai: number[], lichSuSai: number[]}} st
 * @param {unknown} err
 * @param {number} nowMs
 */
export function capNhatSauLoi(st, err, nowMs) {
  return err instanceof OtpServiceError && err.loai === 'SAI_MA' ? ghiNhanSai(st, nowMs) : st;
}

/**
 * Gửi OTP qua Auth thật. Không bao giờ chuyển sang mock khi lỗi.
 * @param {{signInWithOtp: Function}} auth
 * @param {string} email
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function guiOtpLogic(auth, email, tuyChon) {
  let ketQua;
  try {
    ketQua = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  } catch (err) {
    throw taoLoi(err, tuyChon, false);
  }
  if (ketQua && ketQua.error) throw taoLoi(ketQua.error, tuyChon, false);
  return { nguon: NHAN_THAT };
}

/**
 * Xác minh OTP qua Auth thật. Mã chỉ đi qua tham số này, không lưu, không log, không vào lỗi.
 * @param {{verifyOtp: Function}} auth
 * @param {string} email
 * @param {string} token
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function xacMinhOtpLogic(auth, email, token, tuyChon) {
  let ketQua;
  try {
    ketQua = await auth.verifyOtp({ email, token, type: 'email' });
  } catch (err) {
    throw taoLoi(err, tuyChon, true);
  }
  if (ketQua && ketQua.error) throw taoLoi(ketQua.error, tuyChon, true);
  const user = ketQua?.data?.user;
  return { nguon: NHAN_THAT, userId: user?.id, email: user?.email };
}

/**
 * Giới hạn phía CLIENT (thiết bị này) trước khi gửi lại. Ném CLIENT_* trước mọi cuộc gọi Auth/mock.
 * Không phải cưỡng chế của Auth (RATE_LIMIT chỉ dành cho 429 / over_*_rate_limit).
 * @param {{email: string, guiLuc: number | null, lichSuGuiLai: number[], lichSuSai: number[]}} st
 * @param {number} nowMs
 */
export function kiemTraTruocKhiGui(st, nowMs) {
  const tg = tinhThoiGianOtp(st, nowMs);
  if (tg.coTheGuiLai) return;
  const loai = tg.giayChoGuiLai > 0 ? 'CLIENT_CHO_GUI_LAI' : 'CLIENT_HET_LUOT_GUI_LAI';
  throw new OtpServiceError(thongBaoLoiOtp(loai, tg), loai, {
    soLanSaiConLai: tg.soLanSaiConLai,
    soLanGuiLaiConLai: tg.soLanGuiLaiConLai,
  });
}

/**
 * Khóa nhập tạm thời phía CLIENT sau 5 lần sai/15 phút. Ném CLIENT_TAM_KHOA_NHAP trước mọi cuộc gọi Auth/mock.
 * @param {{email: string, guiLuc: number | null, lichSuGuiLai: number[], lichSuSai: number[]}} st
 * @param {number} nowMs
 */
export function kiemTraTruocKhiXacMinh(st, nowMs) {
  const tg = tinhThoiGianOtp(st, nowMs);
  if (!tg.biTamKhoaNhap) return;
  throw new OtpServiceError(thongBaoLoiOtp('CLIENT_TAM_KHOA_NHAP', tg), 'CLIENT_TAM_KHOA_NHAP', {
    soLanSaiConLai: 0,
    soLanGuiLaiConLai: tg.soLanGuiLaiConLai,
  });
}

// Lấy Auth chỉ khi không dùng mock; lỗi (thiếu cấu hình...) thành OtpServiceError, không rơi sang mock.
function layAuthHoacLoi(layAuth, tuyChon, laXacMinh) {
  try {
    return layAuth();
  } catch (err) {
    throw taoLoi(err, tuyChon, laXacMinh);
  }
}

/**
 * Chọn nhánh gửi OTP. Mock chỉ khi cấu hình.useMockData === true; khi đó layAuth không được gọi.
 * @param {{useMockData: boolean, layAuth: () => {signInWithOtp: Function}}} cauHinh
 * @param {string} email
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function guiOtpTheoCauHinh(cauHinh, email, tuyChon) {
  const emailSach = email.trim().toLowerCase();
  if (cauHinh.useMockData === true) return guiOtpMock();
  const auth = layAuthHoacLoi(cauHinh.layAuth, tuyChon, false);
  return guiOtpLogic(auth, emailSach, tuyChon);
}

/**
 * Chọn nhánh xác minh OTP. Mã 123456 chỉ có đặc quyền khi cấu hình.useMockData === true.
 * @param {{useMockData: boolean, layAuth: () => {verifyOtp: Function}}} cauHinh
 * @param {string} email
 * @param {string} token
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function xacMinhOtpTheoCauHinh(cauHinh, email, token, tuyChon) {
  const emailSach = email.trim().toLowerCase();
  if (cauHinh.useMockData === true) {
    // Trạng thái gửi của email khác không được dùng để xác minh email này.
    const stEmail = tuyChon?.trangThai?.email;
    if (typeof stEmail === 'string' && chuanHoaEmail(stEmail) !== emailSach) {
      throw new OtpServiceError(thongBaoLoiOtp('CHUA_GUI'), 'CHUA_GUI');
    }
    return xacMinhOtpMock(token, tuyChon);
  }
  const auth = layAuthHoacLoi(cauHinh.layAuth, tuyChon, true);
  return xacMinhOtpLogic(auth, emailSach, token, tuyChon);
}

/** Gửi OTP mô phỏng: không gọi mạng. Chỉ dùng khi runtimeConfig.useMockData. */
export async function guiOtpMock() {
  return { nguon: NHAN_MO_PHONG, moPhong: true };
}

/**
 * Xác minh mô phỏng: chỉ '123456' hợp lệ, và chỉ khi đã gửi và mã còn hiệu lực 300 giây.
 * Chưa gửi → CHUA_GUI; hết hiệu lực → HET_HAN; cả hai không tăng bộ đếm nhập sai.
 * Chỉ dùng khi runtimeConfig.useMockData.
 * @param {string} token
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function xacMinhOtpMock(token, tuyChon) {
  const trangThai = tuyChon?.trangThai ?? null;
  const nowMs = typeof tuyChon?.nowMs === 'number' ? tuyChon.nowMs : Date.now();
  if (!trangThai || trangThai.guiLuc === null || trangThai.guiLuc === undefined) {
    throw new OtpServiceError(thongBaoLoiOtp('CHUA_GUI'), 'CHUA_GUI');
  }
  if (!tinhThoiGianOtp(trangThai, nowMs).conHieuLuc) {
    throw new OtpServiceError(thongBaoLoiOtp('HET_HAN'), 'HET_HAN');
  }
  if (token === MA_MO_PHONG) return { nguon: NHAN_MO_PHONG, moPhong: true };
  throw taoLoi({ code: 'validation_failed' }, { trangThai, nowMs }, true);
}

/** Thời gian hiệu lực bằng chứng xác minh OTP (giây); máy chủ cưỡng chế cho nhánh thật. */
export const HIEU_LUC_XAC_MINH_GIAY = 86400;

/** Chu kỳ kiểm tra lại RPC da_xac_minh_otp() của nhánh thật (ms). Chỉ để hẹn lịch, không cấp quyền. */
export const KIEM_TRA_LAI_THAT_MS = 300000;

/**
 * Gợi ý thời điểm hết hạn bằng chứng thật từ access_token: mốc 'otp' mới nhất trong amr × 1000 + 24 giờ.
 * Chỉ là gợi ý để hẹn lịch kiểm tra lại; RPC mới là nguồn quyết định. Không ném lỗi; không đọc được → null.
 * Chỉ lấy các con số trong amr, không trả token hay claim.
 * @param {unknown} token
 * @returns {number | null}
 */
export function hetHanTuAccessToken(token) {
  try {
    if (typeof token !== 'string') return null;
    const phan = token.split('.');
    if (phan.length < 2 || !phan[1]) return null;
    let b64 = phan[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const amr = payload && payload.amr;
    if (!Array.isArray(amr)) return null;
    let moc = null;
    for (const m of amr) {
      if (!m || typeof m !== 'object' || m.method !== 'otp') continue;
      const ts = m.timestamp;
      if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
      if (moc === null || ts > moc) moc = ts;
    }
    return moc === null ? null : moc * 1000 + HIEU_LUC_XAC_MINH_GIAY * 1000;
  } catch {
    return null;
  }
}

/**
 * Bằng chứng xác minh mô phỏng, gắn với tài khoản và thời điểm. Không phải bằng chứng thật.
 * @param {string} userId
 * @param {number} nowMs
 */
export function taoBangChungMock(userId, nowMs) {
  return { userId, xacMinhLuc: nowMs, nguon: NHAN_MO_PHONG };
}

/**
 * Bằng chứng mock còn hiệu lực: đúng tài khoản và 0 <= tuổi < 24 giờ (đúng 24 giờ là hết hạn).
 * @param {{userId: string, xacMinhLuc: number, nguon: string} | null | undefined} bangChung
 * @param {string} userId
 * @param {number} nowMs
 */
export function bangChungMockConHieuLuc(bangChung, userId, nowMs) {
  if (!bangChung || bangChung.nguon !== NHAN_MO_PHONG) return false;
  if (typeof userId !== 'string' || bangChung.userId !== userId) return false;
  const tuoi = nowMs - bangChung.xacMinhLuc;
  return tuoi >= 0 && tuoi < HIEU_LUC_XAC_MINH_GIAY * 1000;
}

/**
 * Kiểm tra bằng chứng thật qua RPC da_xac_minh_otp(). Chỉ trả kết quả khi không lỗi và data là boolean;
 * mọi trường hợp khác ném OtpServiceError, không bao giờ trả true khi lỗi.
 * @param {{rpc: Function}} rpcClient
 * @returns {Promise<{daXacMinh: boolean}>}
 */
export async function kiemTraBangChungThat(rpcClient) {
  let ketQua;
  try {
    ketQua = await rpcClient.rpc('da_xac_minh_otp');
  } catch (err) {
    throw taoLoi(err, undefined, false);
  }
  if (ketQua && ketQua.error) throw taoLoi(ketQua.error, undefined, false);
  if (typeof ketQua?.data !== 'boolean') {
    throw new OtpServiceError(thongBaoLoiOtp('KHONG_XAC_DINH'), 'KHONG_XAC_DINH');
  }
  return { daXacMinh: ketQua.data };
}

// ---- Điều phối thuần cho dịch vụ (otpService.ts chỉ là lớp mỏng gọi các hàm này) ----

/**
 * Kho bằng chứng mô phỏng trong bộ nhớ module (userId → bằng chứng); không vào storage.
 * Nhánh thật không bao giờ đọc kho này. Xóa khi đăng xuất mô phỏng.
 * @type {Map<string, {userId: string, xacMinhLuc: number, nguon: string}>}
 */
export const khoBangChungMock = new Map();

/** Chuẩn hóa email để so khớp: trim + chữ thường. */
export function chuanHoaEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Định danh tài khoản mock, đơn ánh theo email đã chuẩn hóa (a.b@x.com và ab@x.com khác nhau).
 * @param {string} email
 */
export function taoDinhDanhMockNguoiMua(email) {
  return `buyer-v2:${encodeURIComponent(chuanHoaEmail(email))}`;
}

/**
 * Biên nhận gửi mô phỏng trong bộ nhớ module (email chuẩn hóa → biên nhận). Chỉ guiMaOtpTheoCauHinh ghi,
 * sau khi gửi mock thành công. Không chứa mã OTP, không vào storage, không log. Nhánh thật không đọc.
 * @type {Map<string, {email: string, userId: string, theHe: number, guiLuc: number}>}
 */
export const khoGuiMock = new Map();

/** Đọc biên nhận gửi mô phỏng theo email (chỉ đọc, trả bản sao). */
export function layBienNhanGuiMock(email, khoGui = khoGuiMock) {
  const b = khoGui.get(chuanHoaEmail(email));
  return b ? { ...b } : undefined;
}

// Bộ đếm thu hồi bằng chứng mô phỏng (cấp module). Tăng ở mọi lần xóa để vô hiệu hóa cả xác minh đang chờ.
let theHeBangChungMock = 0;

/** Thế hệ thu hồi hiện tại của bằng chứng mô phỏng. */
export function layTheHeBangChungMock() {
  return theHeBangChungMock;
}

/**
 * Xóa bằng chứng mô phỏng và LUÔN tăng thế hệ thu hồi (kể cả khi xóa theo userId), để xác minh mô phỏng
 * đang chờ không ghi lại bằng chứng sau đăng xuất / đổi tài khoản.
 * @param {string} [userId] Không truyền = xóa toàn bộ.
 * Đồng thời xóa biên nhận gửi mô phỏng: toàn bộ khi không truyền userId, nếu không thì của userId đó.
 * @param {Map<string, any>} [kho] Kho tùy chọn (dùng cho test); mặc định là khoBangChungMock.
 * @param {Map<string, any>} [khoGui] Kho biên nhận gửi tùy chọn; mặc định là khoGuiMock.
 */
export function xoaBangChungMock(userId, kho = khoBangChungMock, khoGui = khoGuiMock) {
  theHeBangChungMock += 1;
  if (userId === undefined) {
    kho.clear();
    khoGui.clear();
  } else {
    kho.delete(userId);
    for (const [key, b] of [...khoGui]) if (b.userId === userId) khoGui.delete(key);
  }
  for (const cb of [...cacCallbackThuHoiMock]) {
    try {
      cb();
    } catch {
      // Callback lỗi không được làm hỏng việc thu hồi.
    }
  }
}

/** @type {Set<() => void>} */
const cacCallbackThuHoiMock = new Set();

/**
 * Đăng ký callback được gọi mỗi khi xoaBangChungMock chạy (sau khi tăng thế hệ). Trả hàm hủy đăng ký.
 * @param {() => void} cb
 * @returns {() => void}
 */
export function dangKyThuHoiBangChungMock(cb) {
  // Bọc để cùng một hàm đăng ký hai lần vẫn có hai mục độc lập.
  const muc = () => cb();
  cacCallbackThuHoiMock.add(muc);
  return () => {
    cacCallbackThuHoiMock.delete(muc);
  };
}

/**
 * Kho trạng thái/yêu cầu OTP cấp module theo phiên người mua: sống qua unmount/remount toàn bộ cổng khi điều hướng SPA.
 * Tự xóa khi thu hồi bằng chứng mô phỏng; buyerAuthService đồng bộ khi phiên đổi/đăng xuất. Không chứa mã nhập.
 */
export const khoTrangThaiOtpPhien = taoKhoTrangThaiOtpPhien();
dangKyThuHoiBangChungMock(() => khoTrangThaiOtpPhien.xoa());

// Biên nhận phải khớp email, tài khoản, thế hệ hiện tại và mốc gửi của trạng thái; sai → CHUA_GUI (không phải SAI_MA).
function kiemTraBienNhanGuiMock(khoGui, email, expectedUserId, trangThai) {
  const emailSach = chuanHoaEmail(email);
  const b = khoGui.get(emailSach);
  const hopLe =
    !!b &&
    typeof expectedUserId === 'string' &&
    b.userId === expectedUserId &&
    b.theHe === theHeBangChungMock &&
    !!trangThai &&
    typeof trangThai.guiLuc === 'number' &&
    b.guiLuc === trangThai.guiLuc &&
    chuanHoaEmail(trangThai.email) === emailSach;
  if (!hopLe) throw new OtpServiceError(thongBaoLoiOtp('CHUA_GUI'), 'CHUA_GUI');
}

// Lấy client (có auth và rpc) chỉ cho nhánh thật; lỗi thành OtpServiceError, không rơi sang mock.
function layClientHoacLoi(cauHinh) {
  try {
    if (typeof cauHinh.layClient !== 'function') throw new Error('Thiếu VITE_SUPABASE client');
    return cauHinh.layClient();
  } catch (err) {
    throw taoLoi(err, undefined, false);
  }
}

// Ảnh chụp phiên Supabase hiện tại: {userId, accessToken} hoặc null nếu không có phiên; lỗi thành OtpServiceError.
// accessToken chỉ dùng để so sánh, không bao giờ được ghi log, trả ra ngoài hay đưa vào thông báo lỗi.
async function chupPhienHienTai(client) {
  let ketQua;
  try {
    ketQua = await client.auth.getSession();
  } catch (err) {
    throw taoLoi(err, undefined, false);
  }
  if (ketQua && ketQua.error) throw taoLoi(ketQua.error, undefined, false);
  const session = ketQua?.data?.session;
  const userId = session?.user?.id;
  const accessToken = session?.access_token;
  if (typeof userId !== 'string' || typeof accessToken !== 'string' || !accessToken) return null;
  return { userId, accessToken, hetHanGoiY: hetHanTuAccessToken(accessToken) };
}

// Bằng chứng thật: chụp phiên TRƯỚC khi gọi RPC, gọi RPC, chụp phiên SAU. Chỉ true khi data === true,
// userId trước = sau = expectedUserId và access_token trước = sau. Phiên đổi giữa chừng (đổi tài khoản,
// đăng xuất, đăng xuất rồi đăng nhập lại, refresh token) → PHIEN_THAY_DOI (thử lại được), không bao giờ true.
// Trả {daXacMinh, hetHanGoiY}; hetHanGoiY chỉ là số gợi ý (hoặc null), không bao giờ là token hay claim.
async function daXacMinhThatChiTiet(client, expectedUserId) {
  const truoc = await chupPhienHienTai(client);
  if (!truoc || typeof expectedUserId !== 'string' || truoc.userId !== expectedUserId) {
    return { daXacMinh: false, hetHanGoiY: null };
  }
  const { daXacMinh } = await kiemTraBangChungThat(client);
  const sau = await chupPhienHienTai(client);
  if (!sau || sau.userId !== truoc.userId || sau.accessToken !== truoc.accessToken) {
    throw new OtpServiceError(thongBaoLoiOtp('PHIEN_THAY_DOI'), 'PHIEN_THAY_DOI');
  }
  return { daXacMinh: daXacMinh === true, hetHanGoiY: sau.hetHanGoiY };
}

async function daXacMinhThatChoUser(client, expectedUserId) {
  return (await daXacMinhThatChiTiet(client, expectedUserId)).daXacMinh;
}

/**
 * Gửi mã. Kiểm tra giới hạn client trước; chỉ ghi nhận lần gửi (ghiNhanGui) sau khi gửi thành công.
 * @param {{useMockData: boolean, layAuth: Function, layClient?: Function}} cauHinh
 * @param {string} email
 * Mô phỏng: lần gửi gắn với email chuẩn hóa, userId và thế hệ phiên (biên nhận trong bộ nhớ, không có mã).
 * nowMs cố định cả mốc bắt đầu lẫn hoàn tất (dùng cho test); layNow/hoanTatMs đo mốc hoàn tất sau await.
 * @param {{trangThai?: any, nowMs?: number, layNow?: () => number, hoanTatMs?: number, userId?: string, khoGui?: Map<string, any>}} [tuyChon]
 */
export async function guiMaOtpTheoCauHinh(cauHinh, email, tuyChon) {
  const batDauMs =
    typeof tuyChon?.nowMs === 'number'
      ? tuyChon.nowMs
      : typeof tuyChon?.layNow === 'function'
        ? tuyChon.layNow()
        : Date.now();
  const truoc = tuyChon?.trangThai ?? taoTrangThaiOtp(email);
  kiemTraTruocKhiGui(truoc, batDauMs);
  const laMock = cauHinh.useMockData === true;
  const userId = tuyChon?.userId;
  if (laMock && (typeof userId !== 'string' || !userId)) {
    throw new OtpServiceError(thongBaoLoiOtp('KHONG_XAC_DINH'), 'KHONG_XAC_DINH');
  }
  const theHe = theHeBangChungMock; // chụp trước await
  const ketQua = await guiOtpTheoCauHinh(cauHinh, email, { trangThai: tuyChon?.trangThai, nowMs: batDauMs });
  if (laMock && theHe !== theHeBangChungMock) {
    throw new OtpServiceError(thongBaoLoiOtp('PHIEN_THAY_DOI'), 'PHIEN_THAY_DOI');
  }
  // Mốc gửi thành công được đo khi yêu cầu hoàn tất (không phải lúc bắt đầu) để chờ gửi lại đủ từ lúc đó.
  const hoanTatMs =
    typeof tuyChon?.hoanTatMs === 'number'
      ? tuyChon.hoanTatMs
      : typeof tuyChon?.layNow === 'function'
        ? Math.max(batDauMs, tuyChon.layNow())
        : typeof tuyChon?.nowMs === 'number'
          ? tuyChon.nowMs
          : Math.max(batDauMs, Date.now());
  const trangThai = ghiNhanGui(truoc, hoanTatMs, { laGuiLai: truoc.guiLuc !== null });
  if (laMock) {
    const khoGui = tuyChon?.khoGui ?? khoGuiMock;
    const emailSach = chuanHoaEmail(email);
    khoGui.set(emailSach, { email: emailSach, userId, theHe, guiLuc: hoanTatMs });
  }
  return { ...ketQua, trangThai };
}

/**
 * Xác minh mã cho tài khoản expectedUserId. Kiểm tra khóa nhập client trước.
 * Mô phỏng: ghi bằng chứng vào kho bộ nhớ. Thật: sau verifyOtp gọi lại da_xac_minh_otp() và
 * đối chiếu getSession().user.id; không bao giờ suy ra đã xác minh từ verifyOtp.
 * @param {{useMockData: boolean, layAuth: Function, layClient?: Function}} cauHinh
 * @param {string} email
 * @param {string} token
 * @param {string} expectedUserId
 * Mô phỏng: trước khi ghi bằng chứng phải có biên nhận gửi khớp email, expectedUserId, thế hệ và mốc gửi
 * (kiểm tra trước và sau await); sai → CHUA_GUI, không tăng số lần sai; thành công thì dùng hết biên nhận.
 * @param {{trangThai?: any, nowMs?: number, kho?: Map<string, any>, khoGui?: Map<string, any>}} [tuyChon]
 */
export async function xacMinhMaOtpTheoCauHinh(cauHinh, email, token, expectedUserId, tuyChon) {
  const nowMs = typeof tuyChon?.nowMs === 'number' ? tuyChon.nowMs : Date.now();
  const kho = tuyChon?.kho ?? khoBangChungMock;
  const khoGui = tuyChon?.khoGui ?? khoGuiMock;
  const laMock = cauHinh.useMockData === true;
  const theHe = theHeBangChungMock; // chụp trước mọi await
  const truoc = tuyChon?.trangThai ?? taoTrangThaiOtp(email);
  kiemTraTruocKhiXacMinh(truoc, nowMs);
  if (laMock) kiemTraBienNhanGuiMock(khoGui, email, expectedUserId, truoc);
  const ketQua = await xacMinhOtpTheoCauHinh(cauHinh, email, token, { trangThai: tuyChon?.trangThai, nowMs });
  const trangThai = datLaiSauThanhCong(truoc);
  if (ketQua.nguon === NHAN_MO_PHONG) {
    if (theHe !== theHeBangChungMock) {
      throw new OtpServiceError(thongBaoLoiOtp('PHIEN_THAY_DOI'), 'PHIEN_THAY_DOI');
    }
    kiemTraBienNhanGuiMock(khoGui, email, expectedUserId, truoc);
    khoGui.delete(chuanHoaEmail(email));
    kho.set(expectedUserId, taoBangChungMock(expectedUserId, nowMs));
    return { daXacMinh: true, nguon: NHAN_MO_PHONG, userId: expectedUserId, trangThai };
  }
  const client = layClientHoacLoi(cauHinh);
  const daXacMinh = await daXacMinhThatChoUser(client, expectedUserId);
  return { daXacMinh, nguon: NHAN_THAT, userId: expectedUserId, trangThai };
}

/**
 * Kiểm tra đã xác minh OTP cho userId. Mô phỏng: đọc kho (24 giờ, trả kèm hetHanLuc khi còn hiệu lực).
 * Thật: chỉ RPC + đối chiếu phiên, không cache; lỗi được ném. Nhánh thật không đọc kho mô phỏng.
 * Cả hai nhánh trả kiemTraLaiLuc (mốc nên kiểm tra lại) và hetHanLuc (gợi ý hết hạn, null nếu không biết).
 * Các mốc chỉ để hẹn lịch; quyền vào luôn do kết quả RPC/kho quyết định. Không trả token hay claim.
 * @param {{useMockData: boolean, layClient?: Function}} cauHinh
 * @param {string} userId
 * @param {{nowMs?: number, kho?: Map<string, any>}} [tuyChon]
 */
export async function kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, tuyChon) {
  const nowMs = typeof tuyChon?.nowMs === 'number' ? tuyChon.nowMs : Date.now();
  if (cauHinh.useMockData === true) {
    const kho = tuyChon?.kho ?? khoBangChungMock;
    const bangChung = kho.get(userId);
    const daXacMinh = bangChungMockConHieuLuc(bangChung, userId, nowMs);
    const hetHanLuc = daXacMinh ? bangChung.xacMinhLuc + HIEU_LUC_XAC_MINH_GIAY * 1000 : null;
    return { daXacMinh, nguon: NHAN_MO_PHONG, hetHanLuc, kiemTraLaiLuc: hetHanLuc };
  }
  const client = layClientHoacLoi(cauHinh);
  const { daXacMinh, hetHanGoiY } = await daXacMinhThatChiTiet(client, userId);
  return {
    daXacMinh,
    nguon: NHAN_THAT,
    hetHanLuc: daXacMinh ? hetHanGoiY : null,
    kiemTraLaiLuc: nowMs + KIEM_TRA_LAI_THAT_MS,
  };
}
