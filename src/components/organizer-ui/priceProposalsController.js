// Tầng điều phối thuần cho màn hình Đề xuất giá của Ban tổ chức (T8).
// Không import dịch vụ: `services` được tiêm (mặc định do component nối pricingService, T4).
// Kiểm tra thời hạn trên giao diện chỉ hỗ trợ người dùng; máy chủ luôn là nơi quyết định cuối cùng.

import {
  createDialogFocusScope,
  createPricingSession,
  getFocusableElements,
  hasPricingAccess,
  resolveDialogKeyDown,
  runGuarded,
} from './pricingPanelController.js';
import {parseStrictNumber, roundScale} from './pricingFormLogic.js';

export {
  createDialogFocusScope,
  createPricingSession,
  getFocusableElements,
  hasPricingAccess,
  resolveDialogKeyDown,
  runGuarded,
};

export const TRANG_THAI_CHO_DUYET = 'PENDING';
export const NHAN_KHONG_XAC_DINH = '—';

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Định dạng hiển thị: không bao giờ trả 'NaN' / 'Infinity'
// ---------------------------------------------------------------------------

function groupThousands(intText) {
  return intText.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Giá tiền dạng '1.250.000 đ'; null/không hữu hạn => '—'. */
export function formatPriceVnd(value) {
  if (!isFiniteNumber(value)) return NHAN_KHONG_XAC_DINH;
  const rounded = roundScale(value, 2);
  if (rounded === null) return NHAN_KHONG_XAC_DINH;
  const negative = rounded < 0;
  const [intPart, decPart] = Math.abs(rounded).toFixed(2).split('.');
  const dec = decPart === '00' ? '' : `,${decPart.replace(/0$/, '')}`;
  return `${negative ? '-' : ''}${groupThousands(intPart)}${dec} đ`;
}

/** Phần trăm có dấu: '+12,5%', '-8%', '0%'; không hợp lệ => '—'. */
export function formatSignedPercent(value) {
  if (!isFiniteNumber(value)) return NHAN_KHONG_XAC_DINH;
  const rounded = roundScale(value, 2);
  if (rounded === null) return NHAN_KHONG_XAC_DINH;
  const text = String(rounded).replace('.', ',');
  return `${rounded > 0 ? '+' : ''}${text}%`;
}

/** r (tỷ lệ lấp đầy 0..1) => '45%'; không hợp lệ => '—'. */
export function formatFillRate(r) {
  if (!isFiniteNumber(r) || r < 0) return NHAN_KHONG_XAC_DINH;
  const pct = roundScale(r * 100, 1);
  if (pct === null) return NHAN_KHONG_XAC_DINH;
  return `${String(pct).replace('.', ',')}%`;
}

/** u (tốc độ bán thực tế / kỳ vọng) => '1,25 lần'; không hợp lệ => '—'. */
export function formatVelocityRatio(u) {
  if (!isFiniteNumber(u) || u < 0) return NHAN_KHONG_XAC_DINH;
  const v = roundScale(u, 2);
  if (v === null) return NHAN_KHONG_XAC_DINH;
  return `${String(v).replace('.', ',')} lần`;
}

/** T_rem (giờ) => '36 giờ'; không hợp lệ => '—'; âm => 'Đã kết thúc'. */
export function formatHoursRemaining(hours) {
  if (!isFiniteNumber(hours)) return NHAN_KHONG_XAC_DINH;
  if (hours < 0) return 'Đã kết thúc';
  const v = roundScale(hours, 1);
  if (v === null) return NHAN_KHONG_XAC_DINH;
  return `${String(v).replace('.', ',')} giờ`;
}

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  return Number.NaN;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Mốc thời gian 'HH:mm dd/MM/yyyy' theo múi giờ máy; không hợp lệ => '—'. */
export function formatDeadline(value) {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return NHAN_KHONG_XAC_DINH;
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Khung giá hiện hành => '700.000 đ – 1.500.000 đ'; thiếu => '—'. */
export function formatPriceBand(khung) {
  if (!khung || !isFiniteNumber(khung.giaSan) || !isFiniteNumber(khung.giaTran)) return NHAN_KHONG_XAC_DINH;
  return `${formatPriceVnd(khung.giaSan)} – ${formatPriceVnd(khung.giaTran)}`;
}

// ---------------------------------------------------------------------------
// Chuẩn hóa dữ liệu đề xuất
// ---------------------------------------------------------------------------

export const NHAN_CANH_BAO = Object.freeze({
  BINH_THUONG: 'Bình thường',
  CHAM_GIA_TRAN: 'Chạm giá trần',
  CHAM_GIA_SAN: 'Chạm giá sàn',
});
export const NHAN_VUOT_KHUNG = 'Vượt khung giá';

/** Nhãn cảnh báo bằng chữ cho loaiCanhBao. */
export function labelWarning(loaiCanhBao) {
  if (typeof loaiCanhBao !== 'string' || loaiCanhBao.trim() === '') return 'Chưa có dữ liệu cảnh báo';
  return NHAN_CANH_BAO[loaiCanhBao] ?? 'Cảnh báo khác';
}

/** Danh sách cảnh báo: [{ma, nhan, muc:'info'|'warn'}]; luôn có ít nhất loại cảnh báo chính. */
export function buildWarnings(dx) {
  const list = [];
  const loai = dx && typeof dx.loaiCanhBao === 'string' && dx.loaiCanhBao.trim() !== '' ? dx.loaiCanhBao : null;
  list.push({
    ma: loai ?? 'KHONG_CO',
    nhan: labelWarning(loai),
    muc: loai === null || loai === 'BINH_THUONG' ? 'info' : 'warn',
  });
  if (dx && dx.coCanhBaoVuotKhung === true) {
    list.push({ma: 'VUOT_KHUNG', nhan: NHAN_VUOT_KHUNG, muc: 'warn'});
  }
  return list;
}

/** Phần trăm đổi từ giaHienTai sang giaDeXuat (làm tròn 2 số lẻ); không tính được => null. */
export function computePercentChange(giaHienTai, giaDeXuat) {
  if (!isFiniteNumber(giaHienTai) || giaHienTai <= 0 || !isFiniteNumber(giaDeXuat)) return null;
  return roundScale(((giaDeXuat - giaHienTai) / giaHienTai) * 100, 2);
}

export const NHAN_HUONG_DOI = Object.freeze({
  TANG: 'Tăng',
  GIAM: 'Giảm',
  KHONG_DOI: 'Không đổi',
  KHONG_XAC_DINH: 'Chưa xác định',
});

export function directionOf(giaHienTai, giaDeXuat) {
  if (!isFiniteNumber(giaHienTai) || !isFiniteNumber(giaDeXuat)) return 'KHONG_XAC_DINH';
  if (giaDeXuat > giaHienTai) return 'TANG';
  if (giaDeXuat < giaHienTai) return 'GIAM';
  return 'KHONG_DOI';
}

/** u: ưu tiên u của khu; nếu không có thì tocDoThucTe / tocDoKyVong khi mẫu số > 0. Không hợp lệ => null. */
export function resolveVelocityRatio(khu, dx) {
  if (khu && isFiniteNumber(khu.u) && khu.u >= 0) return khu.u;
  const actual = dx ? dx.tocDoThucTe : null;
  const target = dx ? dx.tocDoKyVong : null;
  if (isFiniteNumber(actual) && actual >= 0 && isFiniteNumber(target) && target > 0) {
    const ratio = actual / target;
    return Number.isFinite(ratio) ? ratio : null;
  }
  return null;
}

export function resolveFillRate(khu, dx) {
  if (dx && isFiniteNumber(dx.tyLeLapDay) && dx.tyLeLapDay >= 0) return dx.tyLeLapDay;
  if (khu && isFiniteNumber(khu.r) && khu.r >= 0) return khu.r;
  return null;
}

/**
 * Hỗ trợ giao diện: đề xuất đã quá hạn xử lý chưa. So hetHanLuc với `now` (đúng mốc vẫn còn hiệu lực, như máy chủ);
 * không đọc được hetHanLuc thì dựa vào conHieuLuc === false. KHÔNG thay thế kiểm tra của máy chủ.
 */
export function isProposalExpired(dx, now = Date.now()) {
  if (!dx) return false;
  const han = toMs(dx.hetHanLuc);
  const nowMs = toMs(now);
  if (Number.isFinite(han) && Number.isFinite(nowMs)) return han < nowMs;
  return dx.conHieuLuc === false;
}

function buildKhung(khu) {
  const qt = khu && khu.quyTac;
  if (!qt || !isFiniteNumber(qt.giaSan) || !isFiniteNumber(qt.giaTran)) return null;
  return {giaSan: qt.giaSan, giaTran: qt.giaTran};
}

function khuLabel(khu) {
  const ten = typeof khu.tenKhuVuc === 'string' && khu.tenKhuVuc.trim() !== '' ? khu.tenKhuVuc.trim() : null;
  const ma = typeof khu.maKhuVuc === 'string' && khu.maKhuVuc.trim() !== '' ? khu.maKhuVuc.trim() : null;
  if (ten && ma && ten !== ma) return `${ten} (${ma})`;
  return ten ?? ma ?? `Khu #${khu.khuVucId}`;
}

/** Chuẩn hóa một đề xuất (kèm thông tin khu) thành mục hiển thị. */
export function normalizeProposal(khu, dx, now = Date.now()) {
  const giaHienTai = isFiniteNumber(dx.giaHienTai) ? dx.giaHienTai : null;
  const giaHienHanh = isFiniteNumber(khu.giaHienHanh) ? khu.giaHienHanh : null;
  const giaDeXuat = isFiniteNumber(dx.giaDeXuat) ? dx.giaDeXuat : null;
  const phanTramDoi = computePercentChange(giaHienTai, giaDeXuat);
  const huongDoi = directionOf(giaHienTai, giaDeXuat);
  const r = resolveFillRate(khu, dx);
  const u = resolveVelocityRatio(khu, dx);
  const tRem = isFiniteNumber(dx.soGioConLai) ? dx.soGioConLai : isFiniteNumber(khu.tRem) ? khu.tRem : null;
  const khung = buildKhung(khu);
  const giaDaThayDoi = giaHienHanh !== null && giaHienTai !== null && giaHienHanh !== giaHienTai;
  const daQuaHan = isProposalExpired(dx, now);
  const canhBao = buildWarnings(dx);

  return {
    deXuatId: dx.deXuatId,
    khuVucId: khu.khuVucId,
    suatDienId: khu.suatDienId,
    maKhuVuc: khu.maKhuVuc ?? null,
    tenKhuVuc: khu.tenKhuVuc ?? null,
    nhanKhu: khuLabel(khu),
    giaHienTai,
    giaHienHanh,
    giaDaThayDoi,
    giaDeXuat,
    phanTramDoi,
    huongDoi,
    nhanHuongDoi: NHAN_HUONG_DOI[huongDoi],
    r,
    u,
    tRem,
    khung,
    hetHanLuc: dx.hetHanLuc ?? null,
    daQuaHan,
    conHieuLuc: dx.conHieuLuc === true,
    thoiGianDeXuat: dx.thoiGianDeXuat ?? null,
    lyDo: dx.lyDo ?? null,
    loaiCanhBao: dx.loaiCanhBao ?? null,
    coCanhBaoVuotKhung: dx.coCanhBaoVuotKhung === true,
    canhBao,
    canhBaoGiaDoi: giaDaThayDoi
      ? `Giá niêm yết hiện tại ${formatPriceVnd(giaHienHanh)} khác giá lúc đề xuất ${formatPriceVnd(giaHienTai)}. Duyệt có thể bị từ chối do xung đột.`
      : null,
    canhBaoHetHan: daQuaHan ? 'Đã quá hạn xử lý; máy chủ có thể từ chối khi duyệt.' : null,
    hienThi: {
      giaHienTai: formatPriceVnd(giaHienTai),
      giaHienHanh: formatPriceVnd(giaHienHanh),
      giaDeXuat: formatPriceVnd(giaDeXuat),
      phanTramDoi: formatSignedPercent(phanTramDoi),
      r: formatFillRate(r),
      u: formatVelocityRatio(u),
      tRem: formatHoursRemaining(tRem),
      khung: formatPriceBand(khung),
      hetHan: formatDeadline(dx.hetHanLuc),
    },
  };
}

/** Lấy mọi đề xuất PENDING từ kết quả layDanhSachDeXuat, giữ thứ tự khu rồi đề xuất. */
export function normalizeProposals(listResult, now = Date.now()) {
  const items = [];
  const khuVuc = listResult && Array.isArray(listResult.khuVuc) ? listResult.khuVuc : [];
  for (const khu of khuVuc) {
    if (!khu || !Array.isArray(khu.deXuat)) continue;
    for (const dx of khu.deXuat) {
      if (dx && dx.trangThai === TRANG_THAI_CHO_DUYET) items.push(normalizeProposal(khu, dx, now));
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Biểu mẫu duyệt với giá điều chỉnh
// ---------------------------------------------------------------------------

/**
 * Kiểm tra {giaDieuChinh, ghiChu} theo {giaSan, giaTran, giaHienHanh, giaHienTai}.
 * Trả {ok, errors, firstInvalidField, params:{giaDieuChinh, ghiChu}}; ngoài khung kèm errors.khung.
 */
export function validateAdjustedPriceForm(input, context = {}) {
  const source = input !== null && typeof input === 'object' ? input : {};
  const errors = {};
  let giaDieuChinh = null;

  const parsed = parseStrictNumber(source.giaDieuChinh);
  if (parsed === null) {
    errors.giaDieuChinh = 'Nhập giá điều chỉnh là một số hợp lệ.';
  } else if (parsed <= 0) {
    errors.giaDieuChinh = 'Giá điều chỉnh phải lớn hơn 0.';
  } else {
    giaDieuChinh = roundScale(parsed, 2);
    const {giaSan, giaTran} = context;
    const coKhung = isFiniteNumber(giaSan) && isFiniteNumber(giaTran);
    const giaSoSanh = isFiniteNumber(context.giaHienHanh) ? context.giaHienHanh : context.giaHienTai;
    if (giaDieuChinh === null || giaDieuChinh <= 0) {
      errors.giaDieuChinh = 'Giá điều chỉnh quá lớn hoặc không hợp lệ.';
      giaDieuChinh = null;
    } else if (coKhung && (giaDieuChinh < giaSan || giaDieuChinh > giaTran)) {
      errors.giaDieuChinh = `Giá điều chỉnh phải nằm trong khung từ ${formatPriceVnd(giaSan)} đến ${formatPriceVnd(giaTran)}.`;
      errors.khung = {giaSan, giaTran};
    } else if (isFiniteNumber(giaSoSanh) && giaDieuChinh === giaSoSanh) {
      errors.giaDieuChinh = `Giá điều chỉnh phải khác giá niêm yết hiện tại (${formatPriceVnd(giaSoSanh)}).`;
    }
  }

  const ghiChu = typeof source.ghiChu === 'string' ? source.ghiChu.trim() : '';
  if (ghiChu === '') errors.ghiChu = 'Nhập lý do điều chỉnh giá (bắt buộc khi điều chỉnh).';

  const ok = !errors.giaDieuChinh && !errors.ghiChu;
  const firstInvalidField = errors.giaDieuChinh ? 'giaDieuChinh' : errors.ghiChu ? 'ghiChu' : null;
  return {ok, errors, firstInvalidField, params: ok ? {giaDieuChinh, ghiChu} : null};
}

// ---------------------------------------------------------------------------
// Phân loại kết quả và lỗi
// ---------------------------------------------------------------------------

const THONG_BAO_422 = Object.freeze({
  THIEU_LY_DO_DIEU_CHINH: 'Cần nhập lý do khi duyệt với giá điều chỉnh.',
  GIA_KHONG_THAY_DOI: 'Giá duyệt trùng giá niêm yết hiện tại nên không có thay đổi.',
  GIA_DUYET_KHONG_HOP_LE: 'Giá duyệt không hợp lệ.',
  GIA_HIEN_HANH_KHONG_HOP_LE: 'Giá niêm yết hiện tại không hợp lệ để duyệt.',
  TY_LE_THAY_DOI_VUOT_GIOI_HAN: 'Tỷ lệ thay đổi giá vượt giới hạn cho phép.',
});

export const THONG_BAO_HET_HAN =
  'Đề xuất đã hết hạn xử lý (quá 120 phút) và không còn hiệu lực. Danh sách đã được tải lại.';
export const THONG_BAO_KHONG_CO_QUYEN = 'Bạn không có quyền duyệt hoặc từ chối đề xuất giá của sự kiện này.';

/** Phân loại lỗi ném ra từ dịch vụ (PricingServiceError hoặc lỗi khác). */
export function classifyProposalError(error) {
  const status = error && typeof error === 'object' && typeof error.status === 'number' ? error.status : null;
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : null;
  const ma = error && typeof error === 'object' && typeof error.ma === 'string' ? error.ma : null;
  const chiTiet = error && typeof error === 'object' && error.chiTiet && typeof error.chiTiet === 'object' ? error.chiTiet : null;
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (status === 403 || code === '42501' || ma === 'KHONG_CO_QUYEN') {
    return {status: 'forbidden_error', message: THONG_BAO_KHONG_CO_QUYEN, canReload: false};
  }
  if (ma === 'DE_XUAT_HET_HAN') {
    return {status: 'expired', message: THONG_BAO_HET_HAN, canReload: true};
  }
  if (status === 409 || code === 'PT409' || code === '40001') {
    if (ma === 'DE_XUAT_DA_XU_LY') {
      const trangThai = chiTiet && typeof chiTiet.trangThai === 'string' ? chiTiet.trangThai : null;
      return {
        status: 'conflict',
        ma,
        canReload: true,
        trangThai,
        message: `Đề xuất đã được xử lý trước đó${trangThai ? ` (trạng thái ${trangThai})` : ''}. Hãy tải lại danh sách để xem dữ liệu mới nhất.`,
      };
    }
    if (ma === 'GIA_DA_THAY_DOI') {
      return {
        status: 'conflict',
        ma,
        canReload: true,
        trangThai: null,
        message:
          'Giá niêm yết đã thay đổi sau khi đề xuất được tạo nên không thể duyệt. Hãy tải lại danh sách; hệ thống không tự duyệt lại bằng giá khác.',
      };
    }
    return {
      status: 'conflict',
      ma,
      canReload: true,
      trangThai: null,
      message: 'Dữ liệu đã thay đổi do xung đột. Hãy tải lại danh sách rồi thử lại.',
    };
  }
  if (ma === 'NGOAI_KHUNG_GIA') {
    const khung =
      chiTiet && isFiniteNumber(chiTiet.giaSan) && isFiniteNumber(chiTiet.giaTran)
        ? {giaSan: chiTiet.giaSan, giaTran: chiTiet.giaTran}
        : null;
    return {
      status: 'out_of_bounds',
      ma,
      khung,
      canReload: false,
      message: khung
        ? `Giá nằm ngoài khung cho phép, từ ${formatPriceVnd(khung.giaSan)} đến ${formatPriceVnd(khung.giaTran)}.`
        : 'Giá nằm ngoài khung giá cho phép của quy tắc.',
    };
  }
  if (status === 422 || code === '22023') {
    return {
      status: 'validation_error',
      ma,
      canReload: false,
      message: (ma && THONG_BAO_422[ma]) || 'Dữ liệu gửi lên không hợp lệ.',
    };
  }
  return {
    status: 'error',
    canReload: false,
    message: rawMessage !== '' ? rawMessage : 'Không thực hiện được thao tác. Vui lòng thử lại.',
  };
}

// ---------------------------------------------------------------------------
// Điều phối bất đồng bộ
// ---------------------------------------------------------------------------

/** Chạy lời gọi dịch vụ trong phiên, giữ nguyên đối tượng lỗi gốc (status/ma/chiTiet) để phân loại. */
async function callGuarded(session, fn, options) {
  const r = await runGuarded(
    session,
    async () => {
      try {
        return {value: await fn()};
      } catch (error) {
        return {thrown: error};
      }
    },
    options,
  );
  if (r.status !== 'ok') return r;
  if ('thrown' in r.value) return {status: 'thrown', error: r.value.thrown};
  return {status: 'ok', value: r.value.value};
}

/** Nạp danh sách đề xuất; yêu cầu mới hơn thay thế yêu cầu cũ (kênh 'proposals'), không dùng khóa gửi. */
export async function loadPriceProposals(session, services, {activeOrg, event, now} = {}) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  const r = await callGuarded(session, () => services.layDanhSachDeXuat(event.id), {
    exclusive: false,
    channel: 'proposals',
  });
  if (r.status === 'thrown') {
    const info = classifyProposalError(r.error);
    return {...info, status: info.status === 'forbidden_error' ? 'forbidden_error' : 'error'};
  }
  if (r.status !== 'ok') return r;
  const result = r.value;
  return {
    status: 'ok',
    result,
    proposals: normalizeProposals(result, now ?? Date.now()),
    meta: {nguon: result.nguon, luuTru: result.luuTru},
  };
}

/** Kết quả tải lại báo lỗi mà không ném: false, {ok:false} hoặc status error/forbidden. 'stale' bị bỏ qua. */
function isFailedReloadOutcome(res) {
  if (res === false) return true;
  if (!res || typeof res !== 'object') return false;
  if (res.ok === false) return true;
  return res.status === 'error' || res.status === 'forbidden' || res.status === 'forbidden_error';
}

export async function reloadAfter(onReload, refreshMetrics) {
  let failed = false;
  for (const fn of [onReload, refreshMetrics]) {
    if (typeof fn !== 'function') continue;
    try {
      const res = await fn();
      if (isFailedReloadOutcome(res)) failed = true;
    } catch {
      failed = true;
    }
  }
  return failed;
}

function formatApproved(result) {
  const huong = result.giaMoi > result.giaCu ? 'tăng' : 'giảm';
  const tay = result.loaiBienDong === 'DIEU_CHINH_THU_CONG' ? ' (giá điều chỉnh)' : '';
  return `Đã duyệt${tay}: giá ${huong} từ ${formatPriceVnd(result.giaCu)} lên ${formatPriceVnd(result.giaMoi)} (${formatSignedPercent(result.tyLeThayDoiPhanTram)}).`;
}

/**
 * Xử lý chung kết quả của duyệt/từ chối.
 * expired (HET_HAN từ máy chủ, kể cả khi ném lỗi) => tự tải lại danh sách. conflict => KHÔNG tải lại, KHÔNG thử lại.
 */
async function settle(r, {successKetQua, successStatus, describe, onReload, refreshMetrics}) {
  if (r.status === 'thrown') {
    const info = classifyProposalError(r.error);
    if (info.status === 'expired') {
      const reloadFailed = await reloadAfter(onReload, null);
      return {...info, reloaded: !reloadFailed, reloadFailed};
    }
    return info;
  }
  if (r.status !== 'ok') return r;
  const result = r.value;
  if (result && (result.ketQua === 'HET_HAN' || result.ma === 'DE_XUAT_HET_HAN')) {
    const reloadFailed = await reloadAfter(onReload, null);
    return {
      status: 'expired',
      message: THONG_BAO_HET_HAN,
      canReload: true,
      hetHanLuc: result.hetHanLuc ?? null,
      result,
      reloaded: !reloadFailed,
      reloadFailed,
    };
  }
  if (result && result.ok === true && result.ketQua === successKetQua) {
    const reloadFailed = await reloadAfter(onReload, refreshMetrics);
    return {status: successStatus, result, message: describe(result), reloaded: !reloadFailed, reloadFailed};
  }
  return {status: 'error', canReload: false, message: 'Phản hồi từ máy chủ không đúng như mong đợi.'};
}

function validId(deXuatId) {
  return Number.isInteger(deXuatId) && deXuatId > 0;
}

/** Duyệt đề xuất với giá đề xuất. Chống gửi lặp qua khóa phiên. */
export async function approvePriceProposal(
  session,
  services,
  {activeOrg, event, deXuatId, ghiChu, onReload, refreshMetrics},
) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  if (!validId(deXuatId)) return {status: 'no_selection'};
  const note = typeof ghiChu === 'string' ? ghiChu.trim() : '';
  const params = note === '' ? {} : {ghiChu: note};
  const r = await callGuarded(session, () => services.duyetDeXuatGia(deXuatId, params));
  return settle(r, {
    successKetQua: 'DA_DUYET',
    successStatus: 'approved',
    describe: formatApproved,
    onReload,
    refreshMetrics,
  });
}

/** Duyệt với giá điều chỉnh: biểu mẫu sai => {status:'invalid'} và KHÔNG gọi dịch vụ. */
export async function approveAdjustedPriceProposal(
  session,
  services,
  {activeOrg, event, deXuatId, formValues, context, onReload, refreshMetrics},
) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  if (!validId(deXuatId)) return {status: 'no_selection'};
  const check = validateAdjustedPriceForm(formValues, context);
  if (!check.ok) {
    return {status: 'invalid', errors: check.errors, firstInvalidField: check.firstInvalidField};
  }
  const r = await callGuarded(session, () => services.duyetDeXuatGia(deXuatId, check.params));
  return settle(r, {
    successKetQua: 'DA_DUYET',
    successStatus: 'approved',
    describe: formatApproved,
    onReload,
    refreshMetrics,
  });
}

/** Từ chối; lý do không bắt buộc (để trống => không gửi lyDo). */
export async function rejectPriceProposal(
  session,
  services,
  {activeOrg, event, deXuatId, lyDo, onReload, refreshMetrics},
) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  if (!validId(deXuatId)) return {status: 'no_selection'};
  const reason = typeof lyDo === 'string' ? lyDo.trim() : '';
  const params = reason === '' ? {} : {lyDo: reason};
  const r = await callGuarded(session, () => services.tuChoiDeXuatGia(deXuatId, params));
  return settle(r, {
    successKetQua: 'DA_TU_CHOI',
    successStatus: 'rejected',
    describe: () => 'Đã từ chối đề xuất giá. Giá niêm yết không thay đổi.',
    onReload,
    refreshMetrics,
  });
}
