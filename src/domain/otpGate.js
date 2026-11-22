import { chuanHoaLoaiLoiOtp, thongBaoLoiOtp } from './otpServiceCore.js';

/**
 * Phiên người mua tối thiểu cho cổng OTP (khớp với `BuyerSession` trong `src/services/buyerAuthService.ts`).
 * @typedef {{ userId: string, email: string, fullName?: string, accountKind?: string }} BuyerSession
 */

/**
 * Trạng thái cổng xác minh OTP cho giao diện.
 * Không chứa mã OTP, access token hay địa chỉ email.
 */
export const TRANG_THAI_CONG = Object.freeze({
  DANG_KIEM_TRA: 'DANG_KIEM_TRA',
  CAN_DANG_NHAP: 'CAN_DANG_NHAP',
  CAN_OTP: 'CAN_OTP',
  DUOC_VAO: 'DUOC_VAO',
  LOI: 'LOI',
});

function chuanHoaChuoi(giaTri) {
  return typeof giaTri === 'string' && giaTri.length > 0 ? giaTri : null;
}

function chuanHoaNguon(nguon) {
  return nguon === 'THAT' || nguon === 'MO_PHONG' ? nguon : null;
}

function taoBanSaoTrangThai(st) {
  return {
    status: st.status,
    userId: st.userId,
    suKienId: st.suKienId,
    phienBan: st.phienBan,
    nguon: st.nguon,
    coTheThuLai: st.coTheThuLai,
    loi: st.loi ? { loai: st.loi.loai, thongBao: st.loi.thongBao } : null,
  };
}

function khopMucTieu(st, thamSo) {
  return (
    thamSo?.phienBan === st.phienBan &&
    chuanHoaChuoi(thamSo?.userId) === st.userId &&
    chuanHoaChuoi(thamSo?.suKienId) === st.suKienId
  );
}

/** Khởi tạo trạng thái cổng OTP mặc định (chưa đăng nhập, phiên bản 0). */
export function taoTrangThaiCong() {
  return {
    status: TRANG_THAI_CONG.CAN_DANG_NHAP,
    userId: null,
    suKienId: null,
    phienBan: 0,
    nguon: null,
    coTheThuLai: false,
    loi: null,
  };
}

/**
 * Bắt đầu một lượt kiểm tra mới cho tài khoản và sự kiện.
 * Không có `userId` → `CAN_DANG_NHAP`, ngược lại → `DANG_KIEM_TRA`. Luôn tăng `phienBan`.
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 * @param {{ userId: string | null | undefined, suKienId?: string | null | undefined }} thamSo
 */
export function batDauKiemTra(st, thamSo) {
  const userId = chuanHoaChuoi(thamSo?.userId);
  const suKienId = chuanHoaChuoi(thamSo?.suKienId);
  return {
    status: userId ? TRANG_THAI_CONG.DANG_KIEM_TRA : TRANG_THAI_CONG.CAN_DANG_NHAP,
    userId,
    suKienId,
    phienBan: st.phienBan + 1,
    nguon: null,
    coTheThuLai: false,
    loi: null,
  };
}

/**
 * Áp dụng kết quả kiểm tra bằng chứng OTP.
 * Bị bỏ qua nếu `phienBan`, `userId` hoặc `suKienId` không khớp trạng thái hiện tại.
 * Giá trị `daXacMinh` không phải boolean → chuyển `LOI` (có thể thử lại), không bao giờ `DUOC_VAO`.
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 * @param {{ phienBan: number, userId: string | null, suKienId: string | null, daXacMinh: unknown, nguon?: 'THAT' | 'MO_PHONG' | null }} ketQua
 */
export function apDungKetQua(st, ketQua) {
  if (!st.userId || st.status === TRANG_THAI_CONG.CAN_DANG_NHAP || st.status === TRANG_THAI_CONG.LOI) {
    return st;
  }
  if (!khopMucTieu(st, ketQua)) return st;

  if (typeof ketQua.daXacMinh !== 'boolean') {
    return apDungLoi(st, {
      phienBan: ketQua.phienBan,
      userId: ketQua.userId,
      suKienId: ketQua.suKienId,
      loai: 'KHONG_XAC_DINH',
    });
  }

  return {
    status: ketQua.daXacMinh ? TRANG_THAI_CONG.DUOC_VAO : TRANG_THAI_CONG.CAN_OTP,
    userId: st.userId,
    suKienId: st.suKienId,
    phienBan: st.phienBan,
    nguon: chuanHoaNguon(ketQua.nguon),
    coTheThuLai: false,
    loi: null,
  };
}

/**
 * Áp dụng lỗi kiểm tra. Bị bỏ qua nếu kết quả đã lỗi thời (không khớp `phienBan`/`userId`/`suKienId`).
 * Chỉ dùng `thongBaoLoiOtp(loai)`, không bao giờ đưa message thô vào trạng thái.
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 * @param {{ phienBan: number, userId: string | null, suKienId: string | null, loai?: unknown }} thamSo
 */
export function apDungLoi(st, thamSo) {
  if (!st.userId || st.status === TRANG_THAI_CONG.CAN_DANG_NHAP) return st;
  if (!khopMucTieu(st, thamSo)) return st;

  const loai = chuanHoaLoaiLoiOtp(thamSo?.loai);
  return {
    status: TRANG_THAI_CONG.LOI,
    userId: st.userId,
    suKienId: st.suKienId,
    phienBan: st.phienBan,
    nguon: null,
    coTheThuLai: loai !== 'CAU_HINH',
    loi: {
      loai,
      thongBao: thongBaoLoiOtp(loai),
    },
  };
}

/**
 * Đăng xuất: tước quyền vào ngay lập tức, đặt về `CAN_DANG_NHAP` và tăng `phienBan`.
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 */
export function dangXuat(st) {
  return {
    status: TRANG_THAI_CONG.CAN_DANG_NHAP,
    userId: null,
    suKienId: st.suKienId ?? null,
    phienBan: st.phienBan + 1,
    nguon: null,
    coTheThuLai: false,
    loi: null,
  };
}

/**
 * Đối chiếu phiên người mua (`BuyerSession | null`).
 * Có phiên → hủy quyền vào hiện tại (kể cả cùng `userId`) và chuyển sang `DANG_KIEM_TRA`;
 * mất phiên → `CAN_DANG_NHAP`. Không bao giờ lưu email vào trạng thái cổng.
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 * @param {BuyerSession | null | undefined} session
 */
export function doiPhien(st, session) {
  const nextUserId = chuanHoaChuoi(session?.userId);
  if (!nextUserId) {
    return st.userId !== null || st.status !== TRANG_THAI_CONG.CAN_DANG_NHAP ? dangXuat(st) : st;
  }
  return batDauKiemTra(st, { userId: nextUserId, suKienId: st.suKienId });
}

/**
 * Đánh dấu bằng chứng OTP đã hết hiệu lực: tước quyền vào, chuyển về `CAN_OTP` và tăng `phienBan`.
 * Nếu chưa đăng nhập thì giữ `CAN_DANG_NHAP`.
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 */
export function hetHieuLuc(st) {
  if (!st.userId) {
    return st.status === TRANG_THAI_CONG.CAN_DANG_NHAP ? st : dangXuat(st);
  }
  return {
    status: TRANG_THAI_CONG.CAN_OTP,
    userId: st.userId,
    suKienId: st.suKienId,
    phienBan: st.phienBan + 1,
    nguon: null,
    coTheThuLai: false,
    loi: null,
  };
}

/**
 * Thử kiểm tra lại trên tài khoản và sự kiện hiện tại (`DANG_KIEM_TRA`, tăng `phienBan`).
 * @param {ReturnType<typeof taoTrangThaiCong>} st
 */
export function thuLai(st) {
  return batDauKiemTra(st, { userId: st.userId, suKienId: st.suKienId });
}

/**
 * Bộ điều phối bất đồng bộ cho cổng OTP, áp dụng cơ chế generation để loại bỏ kết quả cũ
 * khi người dùng đổi tài khoản, đổi sự kiện, đăng xuất hoặc hủy component.
 * @param {{
 *   kiemTra: (args: { userId: string }) => Promise<{ daXacMinh: boolean, nguon: 'THAT' | 'MO_PHONG', hetHanLuc?: number | null, kiemTraLaiLuc?: number | null }>,
 *   emit: (trangThai: ReturnType<typeof taoTrangThaiCong>) => void,
 *   isActive?: () => boolean,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 *   now?: () => number,
 *   dangKyThuHoi?: (cb: () => void) => () => void,
 * }} tuyChon
 */
export function taoBoDieuPhoiCongOtp({
  kiemTra,
  emit,
  isActive = () => true,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (handle) => globalThis.clearTimeout(handle),
  now = () => Date.now(),
  dangKyThuHoi,
}) {
  let state = taoTrangThaiCong();
  let generation = 0;
  let daHuy = false;
  let timerHandle = null;
  // setTimeout giới hạn ~24,8 ngày; đặt trần để không tràn, callback sẽ đặt lại nếu chưa tới hạn.
  const TRAN_TIMER_MS = 2_000_000_000;

  function xoaTimer() {
    if (timerHandle !== null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
  }

  function datTimer(mocHen, hetHanLuc, current) {
    xoaTimer();
    timerHandle = setTimer(() => {
      timerHandle = null;
      if (daHuy || current !== generation || !isActive()) return;
      if (now() < mocHen) {
        datTimer(mocHen, hetHanLuc, current);
        return;
      }
      if (hetHanLuc !== null && now() >= hetHanLuc) {
        generation += 1;
        const gen = generation;
        phat(hetHieuLuc(state));
        if (daHuy || gen !== generation || !isActive()) return;
      }
      void kiemTraLai(state.userId ? { userId: state.userId } : null, state.suKienId);
    }, Math.min(Math.max(mocHen - now(), 0), TRAN_TIMER_MS));
  }

  function phat(nextState) {
    state = taoBanSaoTrangThai(nextState);
    if (!daHuy && isActive()) {
      emit(taoBanSaoTrangThai(state));
    }
    return state;
  }

  /**
   * Kiểm tra lại quyền qua cổng OTP cho phiên và sự kiện hiện tại.
   * @param {BuyerSession | null | undefined} session
   * @param {string | null | undefined} suKienId
   */
  async function kiemTraLai(session, suKienId) {
    if (daHuy || !isActive()) return state;
    const current = ++generation;
    xoaTimer();
    const dangKiem = phat(
      batDauKiemTra(state, {
        userId: session?.userId ?? null,
        suKienId: suKienId ?? null,
      }),
    );

    if (!dangKiem.userId) {
      return state;
    }

    try {
      const ketQua = await kiemTra({ userId: dangKiem.userId });
      if (daHuy || current !== generation || !isActive()) return state;

      if (!ketQua || typeof ketQua.daXacMinh !== 'boolean') {
        return phat(
          apDungLoi(state, {
            phienBan: dangKiem.phienBan,
            userId: dangKiem.userId,
            suKienId: dangKiem.suKienId,
            loai: 'KHONG_XAC_DINH',
          }),
        );
      }

      let tiepTheo = apDungKetQua(state, {
        phienBan: dangKiem.phienBan,
        userId: dangKiem.userId,
        suKienId: dangKiem.suKienId,
        daXacMinh: ketQua.daXacMinh,
        nguon: ketQua.nguon ?? null,
      });
      const hetHanLuc =
        typeof ketQua.hetHanLuc === 'number' && Number.isFinite(ketQua.hetHanLuc) ? ketQua.hetHanLuc : null;
      const kiemTraLaiLuc =
        typeof ketQua.kiemTraLaiLuc === 'number' && Number.isFinite(ketQua.kiemTraLaiLuc)
          ? ketQua.kiemTraLaiLuc
          : null;
      const hetHanNgay =
        tiepTheo.status === TRANG_THAI_CONG.DUOC_VAO && hetHanLuc !== null && hetHanLuc <= now();
      if (hetHanNgay) tiepTheo = hetHieuLuc(tiepTheo);
      const daPhat = phat(tiepTheo);
      const cacMoc = [hetHanLuc, kiemTraLaiLuc].filter((m) => m !== null);
      const mocHen = cacMoc.length > 0 ? Math.min(...cacMoc) : null;
      if (daPhat.status === TRANG_THAI_CONG.DUOC_VAO && mocHen !== null) {
        datTimer(mocHen, hetHanLuc, current);
      }
      return daPhat;
    } catch (err) {
      if (daHuy || current !== generation || !isActive()) return state;
      const loai = chuanHoaLoaiLoiOtp(err?.loai);
      return phat(
        apDungLoi(state, {
          phienBan: dangKiem.phienBan,
          userId: dangKiem.userId,
          suKienId: dangKiem.suKienId,
          loai,
        }),
      );
    }
  }

  function xuLyDangXuat() {
    generation += 1;
    xoaTimer();
    if (daHuy || !isActive()) return state;
    return phat(dangXuat(state));
  }

  function xuLyHetHieuLuc() {
    generation += 1;
    xoaTimer();
    if (daHuy || !isActive()) return state;
    return phat(hetHieuLuc(state));
  }

  /**
   * Phản ứng với đổi phiên người mua: mất phiên → CAN_DANG_NHAP; có phiên (kể cả cùng tài khoản)
   * → tước quyền vào hiện tại và kiểm tra lại.
   * @param {BuyerSession | null | undefined} session
   */
  function xuLyDoiPhien(session) {
    if (daHuy || !isActive()) return Promise.resolve(state);
    const userId = chuanHoaChuoi(session?.userId);
    if (!userId) return Promise.resolve(xuLyDangXuat());
    return kiemTraLai(session, state.suKienId);
  }

  /**
   * Thu hồi quyền vào hiện tại: tăng generation, tước quyền và kiểm tra lại với phiên hiện tại.
   */
  function thuHoi() {
    generation += 1;
    xoaTimer();
    if (daHuy || !isActive()) return Promise.resolve(state);
    if (!state.userId) {
      return Promise.resolve(state.status === TRANG_THAI_CONG.CAN_DANG_NHAP ? state : phat(dangXuat(state)));
    }
    return kiemTraLai({ userId: state.userId }, state.suKienId);
  }

  function xuLyThuLai() {
    return kiemTraLai(state.userId ? { userId: state.userId } : null, state.suKienId);
  }

  /**
   * Nhận kết quả xacMinhMaOtp. Không tin kết quả này để mở cổng: luôn kiểm tra lại bằng `kiemTra`.
   * @param {{ daXacMinh?: unknown, nguon?: string, userId?: string | null } | null | undefined} ketQuaXacMinh
   */
  function xuLyApDungXacMinh(ketQuaXacMinh) {
    if (daHuy || !isActive()) return Promise.resolve(state);
    const userId = chuanHoaChuoi(ketQuaXacMinh?.userId);
    if (!userId || userId !== state.userId) return Promise.resolve(state);
    return kiemTraLai({ userId }, state.suKienId);
  }

  let huyDangKyThuHoi = null;
  if (typeof dangKyThuHoi === 'function') {
    const huyCb = dangKyThuHoi(() => {
      void thuHoi();
    });
    if (typeof huyCb === 'function') huyDangKyThuHoi = huyCb;
  }

  function huy() {
    daHuy = true;
    generation += 1;
    xoaTimer();
    if (huyDangKyThuHoi) {
      const fn = huyDangKyThuHoi;
      huyDangKyThuHoi = null;
      fn();
    }
  }

  return {
    kiemTraLai,
    dangXuat: xuLyDangXuat,
    doiPhien: xuLyDoiPhien,
    hetHieuLuc: xuLyHetHieuLuc,
    thuHoi,
    thuLai: xuLyThuLai,
    apDungXacMinh: xuLyApDungXacMinh,
    layTrangThai: () => taoBanSaoTrangThai(state),
    huy,
  };
}
