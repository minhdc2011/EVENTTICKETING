/**
 * Mô hình mock định giá (Sprint 2, T6): mô hình thuần, trong bộ nhớ, của các hợp đồng RPC
 *   - T2 (20261113090000): điều kiện mở bán §4, số liệu §5, thu hẹp khung §7, luu_quy_tac_gia
 *   - T3 (20261113093000): PriceGuard, một PENDING, TTL 120 phút, luu_de_xuat_gia, het_han_de_xuat_gia
 *   - T4 (20261113100000): demand simulator (do hydrogen bổ sung bên dưới).
 *
 * Quy ước:
 *   - Mọi hàm nhận (state, input, now) và trả { state: trạngTháiMới, result }. Không sửa state đầu vào;
 *     khi không có thay đổi thì trả lại CHÍNH đối tượng state đã nhận.
 *   - Không localStorage, mạng hay đồng hồ ngầm: `now` là epoch ms, chuỗi ISO hoặc Date do người gọi truyền.
 *   - Tên cột giữ nguyên như DB để test đọc giống SQL. Thời điểm trong state là chuỗi ISO.
 *   - Mọi trạng thái và kết quả đều là MÔ PHỎNG (nhan = 'MO_PHONG'), không bao giờ đổi GiaVeNiemYet và
 *     không bao giờ sinh APPROVED.
 *
 * Hình dạng state:
 *   suKien   {[id]: {TrangThaiCongBo, moPhong: boolean}}
 *   suatDien {[id]: {SuKienID, TrangThai, ThoiGianMoBanVe, ThoiGianDongBanVe, ThoiGianBatDau}}
 *   khuVuc   {[id]: {SuKienID, SuatDienID, GiaVeNiemYet, TongSoGhe}}
 *   ghe      [{GheID, KhuVucID, TrangThai, NgayCapNhatTrangThai}]
 *   giuCho   [{GiuChoID, SuKienID, SuatDienID, TrangThai, HetHanLuc, chiTiet: [{KhuVucID, GheID|null, SoLuong}]}]
 *   quyTacGia {[khuVucId]: dòng QUY_TAC_GIA}, deXuatGia [dòng DE_XUAT_GIA], nhatKyDinhGia [dòng NHAT_KY_DINH_GIA]
 *   moPhongGhe [sổ ghi simulator], seq {quyTacGia, deXuatGia, nhatKyDinhGia}
 */
import { computePriceProposal, fillRate, ruleFromQuyTacGia } from './pricingEngine.js';

export const TTL_PHUT = 120;
export const NHAN_MO_PHONG = 'MO_PHONG';
export const TIEN_TO_MO_PHONG = '[MÔ PHỎNG]';
export const TRANG_THAI_SUAT_BI_LOAI = Object.freeze(['BAN_NHAP', 'HUY', 'DONG_BAN', 'DA_DIEN_RA', 'HET_VE']);

const MS_PHUT = 60000;
const MS_GIO = 3600000;
const MA_THU_HEP = 'CAU_HINH_THU_HEP_KHUNG';
const MA_HET_HAN_TTL = 'HET_HAN_TTL_120_PHUT';
const MAX_GIA = 1e10;

// ---------------------------------------------------------------- thời gian

/** Chuyển `now` (epoch ms, ISO, Date) sang epoch ms. Thiếu/sai thì ném lỗi, không bao giờ dùng đồng hồ. */
export function toMs(now) {
  let ms = NaN;
  if (typeof now === 'number') ms = now;
  else if (typeof now === 'string' && now.trim() !== '') ms = Date.parse(now);
  else if (now instanceof Date) ms = now.getTime();
  if (!Number.isFinite(ms)) throw new TypeError('mockPricing: tham số now bắt buộc (epoch ms, ISO hoặc Date hợp lệ)');
  return ms;
}

export function toIso(now) {
  return new Date(toMs(now)).toISOString();
}

/** Thời điểm lưu trong state → epoch ms; null/thiếu/không hợp lệ/vô cực → NaN (không bao giờ bịa). */
function tsMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') return Date.parse(value);
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  return NaN;
}

const isMissing = (v) => v === null || v === undefined;

// ---------------------------------------------------------------- state

const clone = (v) => structuredClone(v);

function maxId(rows, field) {
  return rows.reduce((m, r) => (Number.isFinite(r?.[field]) && r[field] > m ? r[field] : m), 0);
}

/** Tạo state mô phỏng: nhân bản sâu seed, bổ sung các bảng thiếu và bộ đếm ID. */
export function createMockState(seed = {}) {
  const s = clone(seed ?? {});
  const state = {
    nhan: NHAN_MO_PHONG,
    suKien: s.suKien ?? {},
    suatDien: s.suatDien ?? {},
    khuVuc: s.khuVuc ?? {},
    ghe: s.ghe ?? [],
    giuCho: s.giuCho ?? [],
    quyTacGia: s.quyTacGia ?? {},
    deXuatGia: s.deXuatGia ?? [],
    nhatKyDinhGia: s.nhatKyDinhGia ?? [],
    moPhongGhe: s.moPhongGhe ?? [],
    seq: s.seq ?? {},
  };
  state.seq.quyTacGia = Math.max(state.seq.quyTacGia ?? 0, maxId(Object.values(state.quyTacGia), 'QuyTacGiaID'));
  state.seq.deXuatGia = Math.max(state.seq.deXuatGia ?? 0, maxId(state.deXuatGia, 'DeXuatID'));
  state.seq.nhatKyDinhGia = Math.max(state.seq.nhatKyDinhGia ?? 0, maxId(state.nhatKyDinhGia, 'NhatKyDinhGiaID'));
  return state;
}

function nextId(state, key) {
  state.seq[key] = (state.seq[key] ?? 0) + 1;
  return state.seq[key];
}

/** Khu vực + suất + sự kiện đã xác minh liên kết (suất phải thuộc đúng sự kiện của khu vực). */
function lienKet(state, khuVucId) {
  const kvId = Number(khuVucId);
  const kv = Number.isInteger(kvId) ? state.khuVuc?.[kvId] : undefined;
  if (!kv) return null;
  const sd = state.suatDien?.[kv.SuatDienID];
  if (!sd || sd.SuKienID !== kv.SuKienID) return null;
  return { kvId, kv, sd, sk: state.suKien?.[kv.SuKienID] ?? null };
}

// ---------------------------------------------------------------- điều kiện mở bán (T2 §4)

/**
 * Điều kiện mở bán DUY NHẤT (T2 §4), thuần theo `now` truyền vào. Không đọc TrangThaiMoBan và không so
 * sánh cứng với 'DANG_MO_BAN': SAP_MO_BAN trong cửa sổ bán vẫn là mở bán. Thiếu/sai dữ liệu → false.
 * Số liệu, lưu đề xuất và phạm vi ghi của simulator đều phải gọi hàm này.
 */
export function dangMoBan(suKien, suatDien, now) {
  const nowMs = toMs(now);
  if (!suKien || !suatDien) return false;
  if (suKien.TrangThaiCongBo !== 'CONG_KHAI') return false;
  const tt = suatDien.TrangThai;
  if (typeof tt !== 'string' || tt === '' || TRANG_THAI_SUAT_BI_LOAI.includes(tt)) return false;
  const mo = tsMs(suatDien.ThoiGianMoBanVe);
  if (!Number.isFinite(mo) || !(nowMs >= mo)) return false;
  if (isMissing(suatDien.ThoiGianDongBanVe)) return true;
  const dong = tsMs(suatDien.ThoiGianDongBanVe);
  return Number.isFinite(dong) && dong > mo && nowMs < dong;
}

// ---------------------------------------------------------------- số liệu (T2 §5)

function soLieuKhuVuc(state, kvId, nowMs) {
  const lk = lienKet(state, kvId);
  if (!lk) return null;
  const { kv, sd, sk } = lk;
  const qt = state.quyTacGia?.[kvId] ?? null;

  let nSold = 0;
  let soBan6h = 0;
  for (const g of state.ghe ?? []) {
    if (g.KhuVucID !== kvId || g.TrangThai !== 'DA_BAN') continue;
    nSold += 1;
    const t = tsMs(g.NgayCapNhatTrangThai);
    if (Number.isFinite(t) && t >= nowMs - 6 * MS_GIO && t <= nowMs) soBan6h += 1;
  }

  let nHold = 0;
  for (const gc of state.giuCho ?? []) {
    if (gc.SuKienID !== kv.SuKienID || gc.SuatDienID !== kv.SuatDienID) continue;
    if (gc.TrangThai !== 'ACTIVE' || !(tsMs(gc.HetHanLuc) > nowMs)) continue;
    for (const ct of gc.chiTiet ?? []) if (ct.KhuVucID === kvId) nHold += Number(ct.SoLuong) || 0;
  }

  const bd = tsMs(sd.ThoiGianBatDau);
  const mo = tsMs(sd.ThoiGianMoBanVe);
  // COALESCE(Dong, BatDau): Dong có giá trị nhưng không hữu hạn thì KHÔNG quay về BatDau.
  const dongHoacBd = isMissing(sd.ThoiGianDongBanVe) ? bd : tsMs(sd.ThoiGianDongBanVe);
  const tongGio =
    Number.isFinite(mo) && Number.isFinite(dongHoacBd) && dongHoacBd > mo ? (dongHoacBd - mo) / MS_GIO : null;

  let pendingId = null;
  let pendingAt = -Infinity;
  for (const dx of state.deXuatGia ?? []) {
    if (dx.KhuVucID !== kvId || dx.TrangThaiDuyet !== 'PENDING') continue;
    const at = tsMs(dx.ThoiGianDeXuat);
    if (pendingId === null || at > pendingAt || (at === pendingAt && dx.DeXuatID > pendingId)) {
      pendingId = dx.DeXuatID;
      pendingAt = at;
    }
  }

  return {
    khu_vuc_id: kvId,
    suat_dien_id: kv.SuatDienID,
    su_kien_id: kv.SuKienID,
    trang_thai_suat: sd.TrangThai ?? null,
    thoi_gian_mo_ban: sd.ThoiGianMoBanVe ?? null,
    thoi_gian_dong_ban: sd.ThoiGianDongBanVe ?? null,
    thoi_gian_bat_dau: sd.ThoiGianBatDau ?? null,
    dang_mo_ban: dangMoBan(sk, sd, nowMs),
    gia_hien_hanh: kv.GiaVeNiemYet ?? null,
    quy_tac_gia_id: qt?.QuyTacGiaID ?? null,
    co_quy_tac: qt !== null,
    kich_hoat: qt?.TrangThaiKichHoat === true,
    gia_goc: qt?.GiaGoc ?? null,
    gia_san: qt?.GiaSan ?? null,
    gia_tran: qt?.GiaTran ?? null,
    buoc_nhay: qt?.BuocNhayGia ?? null,
    bien_do: qt?.BienDoToiDaMoiChuKy ?? null,
    nguong_thap: qt?.NguongLapDayThap ?? null,
    nguong_cao: qt?.NguongLapDayCao ?? null,
    trong_so_lap_day: qt?.TrongSoLapDay ?? null,
    trong_so_toc_do: qt?.TrongSoTocDoBan ?? null,
    trong_so_thoi_gian: qt?.TrongSoThoiGian ?? null,
    n_total: kv.TongSoGhe ?? null,
    n_sold: nSold,
    n_hold: nHold,
    so_ban_6h: soBan6h,
    v_actual: soBan6h / 6,
    t_rem_gio: Number.isFinite(bd) ? Math.max((bd - nowMs) / MS_GIO, 0) : null,
    tong_gio_mo_ban: tongGio,
    v_target: tongGio !== null && Number.isFinite(kv.TongSoGhe) ? kv.TongSoGhe / tongGio : null,
    de_xuat_pending_id: pendingId,
    co_pending: pendingId !== null,
    mo_phong: sk?.moPhong === true,
    nhan: NHAN_MO_PHONG,
    thoi_diem_tinh: new Date(nowMs).toISOString(),
  };
}

/** Tương đương lay_so_lieu_dinh_gia(p_su_kien_id): mỗi khu vực của sự kiện một dòng, sắp theo suất rồi khu vực. */
export function laySoLieuDinhGia(state, suKienId, now) {
  const nowMs = toMs(now);
  const rows = [];
  for (const id of Object.keys(state.khuVuc ?? {})) {
    const kv = state.khuVuc[id];
    if (kv.SuKienID !== suKienId) continue;
    const row = soLieuKhuVuc(state, Number(id), nowMs);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => a.suat_dien_id - b.suat_dien_id || a.khu_vuc_id - b.khu_vuc_id);
  return rows;
}

// ---------------------------------------------------------------- audit & TTL

function themNhatKy(state, row, nowMs) {
  const entry = {
    NhatKyDinhGiaID: nextId(state, 'nhatKyDinhGia'),
    LoaiHanhDong: null,
    KhuVucID: null,
    SuatDienID: null,
    SuKienID: null,
    QuyTacGiaID: null,
    DeXuatID: null,
    ThoiGian: new Date(nowMs).toISOString(),
    DuLieuTruoc: null,
    DuLieuSau: null,
    GiaHienHanh: null,
    GiaThu: null,
    ThamSo: {},
    MaChan: null,
    LyDo: null,
    nhan: NHAN_MO_PHONG,
    ...row,
  };
  state.nhatKyDinhGia.push(entry);
  return entry;
}

/** PENDING quá TTL (nghiêm ngặt: đúng 120 phút vẫn PENDING) → EXPIRED / HET_HAN_TTL_120_PHUT, không audit. */
function hetHanTtl(state, kvIds, nowMs) {
  const ids = [];
  for (const dx of state.deXuatGia) {
    if (dx.TrangThaiDuyet !== 'PENDING' || !kvIds.includes(dx.KhuVucID)) continue;
    const at = tsMs(dx.ThoiGianDeXuat);
    if (Number.isFinite(at) && at + TTL_PHUT * MS_PHUT < nowMs) {
      dx.TrangThaiDuyet = 'EXPIRED';
      dx.GhiChuDuyet = MA_HET_HAN_TTL;
      ids.push(dx.DeXuatID);
    }
  }
  return ids.sort((a, b) => a - b);
}

/** Tương đương het_han_de_xuat_gia(p_su_kien_id): chỉ đụng các khu vực của đúng sự kiện này. */
export function hetHanDeXuatGia(state, suKienId, now) {
  const nowMs = toMs(now);
  const kvIds = Object.keys(state.khuVuc ?? {})
    .filter((id) => state.khuVuc[id].SuKienID === suKienId)
    .map(Number);
  const moPhong = state.suKien?.[suKienId]?.moPhong === true;
  const make = (st, ids) => ({
    state: st,
    result: { suKienId, deXuatHetHan: ids, soLuong: ids.length, moPhong, nhan: NHAN_MO_PHONG },
  });
  const next = clone(state);
  const ids = hetHanTtl(next, kvIds, nowMs);
  return ids.length === 0 ? make(state, ids) : make(next, ids);
}

// ---------------------------------------------------------------- luu_quy_tac_gia (T2)

/** ROUND(x, s) của NUMERIC: làm tròn nửa ra xa số 0, theo biểu diễn thập phân của số nhập. */
function roundScale(x, s) {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (a >= 1e15) return sign * a;
  const str = String(a);
  if (str.includes('e')) return (sign * Math.round(a * 10 ** s)) / 10 ** s;
  return sign * Number(`${Math.round(Number(`${str}e${s}`))}e-${s}`);
}

// [tên tham số SQL, khóa đầu vào, scale, giới hạn tuyệt đối]; đúng thứ tự tham số của RPC.
const TRUONG_QUY_TAC = [
  ['p_gia_goc', 'giaGoc', 2, MAX_GIA],
  ['p_gia_san', 'giaSan', 2, MAX_GIA],
  ['p_gia_tran', 'giaTran', 2, MAX_GIA],
  ['p_buoc_nhay_gia', 'buocNhayGia', 2, MAX_GIA],
  ['p_bien_do_toi_da', 'bienDoToiDa', 4, 10],
  ['p_nguong_lap_day_thap', 'nguongLapDayThap', 4, 10],
  ['p_nguong_lap_day_cao', 'nguongLapDayCao', 4, 10],
  ['p_trong_so_lap_day', 'trongSoLapDay', 4, 10],
  ['p_trong_so_toc_do_ban', 'trongSoTocDoBan', 4, 10],
  ['p_trong_so_thoi_gian', 'trongSoThoiGian', 4, 10],
];

function soHuuHan(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/**
 * Kiểm tra theo thứ tự tham số như SQL: mỗi trường NULL → không hữu hạn → làm tròn → vượt độ chính xác;
 * sau đó cờ kích hoạt; rồi các luật miền trên giá trị đã làm tròn. Trả { v } hoặc { truong }.
 */
function kiemTraQuyTac(params) {
  const p = params ?? {};
  const v = {};
  for (const [ten, key, scale, max] of TRUONG_QUY_TAC) {
    const raw = soHuuHan(p[key]);
    if (!Number.isFinite(raw)) return { truong: ten };
    v[key] = roundScale(raw, scale);
    if (Math.abs(v[key]) >= max) return { truong: ten };
  }
  if (typeof p.trangThaiKichHoat !== 'boolean') return { truong: 'p_trang_thai_kich_hoat' };
  v.trangThaiKichHoat = p.trangThaiKichHoat;

  if (v.giaSan <= 0) return { truong: 'p_gia_san' };
  if (v.giaGoc < v.giaSan) return { truong: 'p_gia_goc' };
  if (v.giaTran < v.giaGoc) return { truong: 'p_gia_tran' };
  if (v.buocNhayGia <= 0) return { truong: 'p_buoc_nhay_gia' };
  if (v.bienDoToiDa <= 0 || v.bienDoToiDa > 1) return { truong: 'p_bien_do_toi_da' };
  if (v.nguongLapDayThap < 0 || v.nguongLapDayThap > 1) return { truong: 'p_nguong_lap_day_thap' };
  if (v.nguongLapDayCao < 0 || v.nguongLapDayCao > 1) return { truong: 'p_nguong_lap_day_cao' };
  if (v.nguongLapDayThap >= v.nguongLapDayCao) return { truong: 'p_nguong_lap_day_thap' };
  if (v.trongSoLapDay < 0) return { truong: 'p_trong_so_lap_day' };
  if (v.trongSoTocDoBan < 0) return { truong: 'p_trong_so_toc_do_ban' };
  if (v.trongSoThoiGian < 0) return { truong: 'p_trong_so_thoi_gian' };
  return { v };
}

const fixed2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));

/**
 * Tương đương luu_quy_tac_gia. params: giaGoc, giaSan, giaTran, buocNhayGia, bienDoToiDa, nguongLapDayThap,
 * nguongLapDayCao, trongSoLapDay, trongSoTocDoBan, trongSoThoiGian, trangThaiKichHoat.
 * Không hợp lệ → { ok:false, loi:'QUY_TAC_GIA_KHONG_HOP_LE', truong } và CHÍNH state cũ (không audit).
 * Hợp lệ → upsert, audit TAO/CAP_NHAT_QUY_TAC, rồi thu hẹp khung: PENDING ngoài [san, tran] → EXPIRED
 * (bỏ qua TTL), mỗi đề xuất một audit HET_HIEU_LUC_DO_DOI_KHUNG theo DeXuatID tăng dần.
 */
export function luuQuyTacGia(state, khuVucId, params, now) {
  const nowMs = toMs(now);
  const lk = lienKet(state, khuVucId);
  if (!lk) {
    return { state, result: { ok: false, loi: 'KHU_VUC_KHONG_TON_TAI', nhan: NHAN_MO_PHONG } };
  }
  const kiem = kiemTraQuyTac(params);
  if (!kiem.v) {
    return {
      state,
      result: { ok: false, loi: 'QUY_TAC_GIA_KHONG_HOP_LE', truong: kiem.truong, nhan: NHAN_MO_PHONG },
    };
  }
  const v = kiem.v;
  const next = clone(state);
  const { kvId, kv, sk } = lienKet(next, khuVucId);
  const iso = new Date(nowMs).toISOString();

  const cu = next.quyTacGia[kvId] ?? null;
  const taoMoi = cu === null;
  const moi = {
    QuyTacGiaID: cu?.QuyTacGiaID ?? nextId(next, 'quyTacGia'),
    KhuVucID: kvId,
    GiaGoc: v.giaGoc,
    GiaSan: v.giaSan,
    GiaTran: v.giaTran,
    BuocNhayGia: v.buocNhayGia,
    BienDoToiDaMoiChuKy: v.bienDoToiDa,
    NguongLapDayThap: v.nguongLapDayThap,
    NguongLapDayCao: v.nguongLapDayCao,
    TrongSoLapDay: v.trongSoLapDay,
    TrongSoTocDoBan: v.trongSoTocDoBan,
    TrongSoThoiGian: v.trongSoThoiGian,
    TrangThaiKichHoat: v.trangThaiKichHoat,
    NgayTao: cu?.NgayTao ?? iso,
    NgayCapNhat: iso,
  };
  next.quyTacGia[kvId] = moi;

  // PENDING ngoài khung MỚI (giá bằng sàn/trần được giữ), bỏ qua TTL, theo DeXuatID tăng dần.
  const ngoaiKhung = next.deXuatGia
    .filter((dx) => dx.KhuVucID === kvId && dx.TrangThaiDuyet === 'PENDING' && (dx.GiaDeXuat < v.giaSan || dx.GiaDeXuat > v.giaTran))
    .sort((a, b) => a.DeXuatID - b.DeXuatID);
  for (const dx of ngoaiKhung) {
    dx.TrangThaiDuyet = 'EXPIRED';
    dx.GhiChuDuyet = MA_THU_HEP;
    dx.NguoiDuyetID = null;
    dx.ThoiGianDuyet = null;
  }

  const giaHienHanh = kv.GiaVeNiemYet ?? null;
  const canhBao =
    giaHienHanh !== null && (giaHienHanh < v.giaSan || giaHienHanh > v.giaTran)
      ? [{ ma: 'GIA_HIEN_HANH_NGOAI_KHUNG', giaHienHanh, giaSan: v.giaSan, giaTran: v.giaTran }]
      : [];

  const thamSo = { ...v };
  const nhatKy = themNhatKy(
    next,
    {
      LoaiHanhDong: taoMoi ? 'TAO_QUY_TAC' : 'CAP_NHAT_QUY_TAC',
      KhuVucID: kvId,
      SuatDienID: kv.SuatDienID,
      SuKienID: kv.SuKienID,
      QuyTacGiaID: moi.QuyTacGiaID,
      DuLieuTruoc: cu ? clone(cu) : null,
      DuLieuSau: clone(moi),
      GiaHienHanh: giaHienHanh,
      ThamSo: thamSo,
    },
    nowMs,
  );

  for (const dx of ngoaiKhung) {
    themNhatKy(
      next,
      {
        LoaiHanhDong: 'HET_HIEU_LUC_DO_DOI_KHUNG',
        KhuVucID: kvId,
        SuatDienID: kv.SuatDienID,
        SuKienID: kv.SuKienID,
        QuyTacGiaID: dx.QuyTacGiaID ?? null,
        DeXuatID: dx.DeXuatID,
        DuLieuTruoc: {
          trangThaiDuyet: 'PENDING',
          giaDeXuat: dx.GiaDeXuat,
          khungGia: { giaSan: cu?.GiaSan ?? null, giaTran: cu?.GiaTran ?? null },
        },
        DuLieuSau: {
          trangThaiDuyet: dx.TrangThaiDuyet,
          ghiChuDuyet: dx.GhiChuDuyet,
          giaDeXuat: dx.GiaDeXuat,
          khungGia: { giaSan: v.giaSan, giaTran: v.giaTran },
        },
        GiaHienHanh: giaHienHanh,
        GiaThu: dx.GiaDeXuat,
        ThamSo: thamSo,
        LyDo: `${MA_THU_HEP}: GiaDeXuat nam ngoai khung gia moi [${fixed2(v.giaSan)}, ${fixed2(v.giaTran)}]`,
      },
      nowMs,
    );
  }

  return {
    state: next,
    result: {
      ok: true,
      quyTacGiaId: moi.QuyTacGiaID,
      khuVucId: kvId,
      suatDienId: kv.SuatDienID,
      suKienId: kv.SuKienID,
      taoMoi,
      canhBao,
      deXuatHetHieuLuc: ngoaiKhung.map((dx) => dx.DeXuatID),
      nhatKyId: nhatKy.NhatKyDinhGiaID,
      moPhong: sk?.moPhong === true,
      nhan: NHAN_MO_PHONG,
    },
  };
}

// ---------------------------------------------------------------- luu_de_xuat_gia (T3)

const THONG_DIEP_CHAN = {
  QUY_TAC_KHONG_TON_TAI: 'Khu vuc chua co quy tac gia',
  LIEN_KET_KHONG_HOP_LE: 'Quy tac gia khong thuoc khu vuc',
  QUY_TAC_DA_THAY_DOI: 'Quy tac gia da thay doi sau khi tinh de xuat',
  QUY_TAC_TAT: 'Quy tac gia dang tat',
  SUAT_DIEN_KHONG_MO_BAN: 'Suat dien khong dang mo ban',
  GIA_KHONG_HOP_LE: 'Gia de xuat hoac gia tinh toan tho la NULL, khong huu han hoac vuot do chinh xac',
  GIA_HIEN_HANH_KHONG_HOP_LE: 'Gia hien hanh khong hop le de tinh bien do',
  NGOAI_KHUNG_GIA: 'Gia de xuat nam ngoai khung [san, tran]',
  VUOT_BIEN_DO: 'Gia de xuat vuot bien do toi da moi chu ky',
  DUOI_BUOC_NHAY: 'Chenh lech gia nho hon buoc nhay gia',
  DA_CO_PENDING: 'Khu vuc da co de xuat PENDING',
  THIEU_DU_LIEU: 'Thieu so lieu thi truong (tong ghe, toc do ky vong hoac gio con lai)',
};

const CLIENT_PREFIX = /^\s*(\[MÔ PHỎNG\]\s*)+/i;
const EPS_TIEN = 1e-6;

const giaHopLe = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(roundScale(v, 2)) < MAX_GIA;

/** Cùng một thời điểm (so theo epoch ms); thiếu/sai thì coi là khác. */
function cungThoiDiem(a, b) {
  const x = tsMs(a);
  const y = tsMs(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

/**
 * Tương đương luu_de_xuat_gia. input: { khuVucId, quyTacGiaId, quyTacNgayCapNhat, giaDeXuat, giaTinhToanTho, lyDo }.
 * Hết hạn TTL chạy TRƯỚC kiểm tra trùng PENDING; mã chặn đầu tiên theo thứ tự T3 thắng. Bị chặn là kết quả
 * bình thường { ketQua:'BI_CHAN', maChan } kèm một dòng audit CHAN_DE_XUAT, không tạo đề xuất, không đổi giá.
 * Mọi LyDoDeXuat đều bắt đầu bằng [MÔ PHỎNG] (tiền tố do client gửi bị gỡ trước, không nhân đôi).
 */
export function luuDeXuatGia(state, input, now) {
  const nowMs = toMs(now);
  const inp = input ?? {};
  if (!lienKet(state, inp.khuVucId)) {
    return { state, result: { ketQua: 'LOI', loi: 'KHU_VUC_KHONG_TON_TAI', moPhong: false, nhan: NHAN_MO_PHONG } };
  }
  const next = clone(state);
  const { kvId, kv, sd, sk } = lienKet(next, inp.khuVucId);
  const moPhong = sk?.moPhong === true;
  const iso = new Date(nowMs).toISOString();

  const deXuatHetHan = hetHanTtl(next, [kvId], nowMs);

  const qt = next.quyTacGia[kvId] ?? null;
  const giaHien = kv.GiaVeNiemYet ?? null;
  const giaOk = giaHopLe(inp.giaDeXuat) && giaHopLe(inp.giaTinhToanTho);
  const p = giaOk ? roundScale(inp.giaDeXuat, 2) : null;
  const tho = giaOk ? roundScale(inp.giaTinhToanTho, 2) : null;
  const giaThu = giaHopLe(inp.giaDeXuat) ? roundScale(inp.giaDeXuat, 2) : null;

  let moBan = null;
  let pendingId = null;
  let metrics = null;
  let ma = null;

  if (!qt) ma = 'QUY_TAC_KHONG_TON_TAI';
  else if (inp.quyTacGiaId !== qt.QuyTacGiaID) ma = 'LIEN_KET_KHONG_HOP_LE';
  else if (!cungThoiDiem(inp.quyTacNgayCapNhat, qt.NgayCapNhat)) ma = 'QUY_TAC_DA_THAY_DOI';
  else if (qt.TrangThaiKichHoat !== true) ma = 'QUY_TAC_TAT';
  else {
    moBan = dangMoBan(sk, sd, nowMs);
    if (!moBan) ma = 'SUAT_DIEN_KHONG_MO_BAN';
    else if (!giaOk) ma = 'GIA_KHONG_HOP_LE';
    else if (!(giaHien > 0) || giaHien >= MAX_GIA) ma = 'GIA_HIEN_HANH_KHONG_HOP_LE';
    else if (p < qt.GiaSan || p > qt.GiaTran) ma = 'NGOAI_KHUNG_GIA';
    else {
      const chenh = Math.round(Math.abs(p - giaHien) * 100) / 100;
      if (chenh > giaHien * qt.BienDoToiDaMoiChuKy + EPS_TIEN) ma = 'VUOT_BIEN_DO';
      else if (chenh < qt.BuocNhayGia - EPS_TIEN) ma = 'DUOI_BUOC_NHAY';
    }
    if (ma === null) {
      const pend = next.deXuatGia
        .filter((dx) => dx.KhuVucID === kvId && dx.TrangThaiDuyet === 'PENDING')
        .sort((a, b) => a.DeXuatID - b.DeXuatID)[0];
      if (pend) {
        pendingId = pend.DeXuatID;
        ma = 'DA_CO_PENDING';
      }
    }
    if (ma === null) {
      metrics = soLieuKhuVuc(next, kvId, nowMs);
      if (
        !metrics ||
        !(metrics.n_total > 0) ||
        metrics.v_actual === null ||
        metrics.v_target === null ||
        metrics.t_rem_gio === null
      ) {
        ma = 'THIEU_DU_LIEU';
      }
    }
  }

  if (ma !== null) {
    const nhatKy = themNhatKy(
      next,
      {
        LoaiHanhDong: 'CHAN_DE_XUAT',
        KhuVucID: kvId,
        SuatDienID: kv.SuatDienID,
        SuKienID: kv.SuKienID,
        QuyTacGiaID: qt?.QuyTacGiaID ?? null,
        GiaHienHanh: giaHien,
        GiaThu: giaThu,
        MaChan: ma,
        LyDo: THONG_DIEP_CHAN[ma],
        ThamSo: {
          giaSan: qt?.GiaSan ?? null,
          giaTran: qt?.GiaTran ?? null,
          bienDo: qt?.BienDoToiDaMoiChuKy ?? null,
          buocNhay: qt?.BuocNhayGia ?? null,
          kichHoat: qt?.TrangThaiKichHoat ?? null,
          dangMoBan: moBan,
          moPhong,
          deXuatPendingId: pendingId,
          quyTacNgayCapNhat: qt?.NgayCapNhat ?? null,
          quyTacNgayCapNhatDauVao: inp.quyTacNgayCapNhat ?? null,
          quyTacGiaIdDauVao: inp.quyTacGiaId ?? null,
          giaDeXuatDauVao: isMissing(inp.giaDeXuat) ? null : String(inp.giaDeXuat),
          giaTinhToanThoDauVao: isMissing(inp.giaTinhToanTho) ? null : String(inp.giaTinhToanTho),
          lyDoDeXuatDauVao: typeof inp.lyDo === 'string' ? inp.lyDo.slice(0, 500) : null,
        },
      },
      nowMs,
    );
    return {
      state: next,
      result: {
        ketQua: 'BI_CHAN',
        maChan: ma,
        nhatKyId: nhatKy.NhatKyDinhGiaID,
        deXuatHetHan,
        moPhong,
        nhan: NHAN_MO_PHONG,
      },
    };
  }

  const loaiCanhBao = p === qt.GiaTran ? 'CHAM_GIA_TRAN' : p === qt.GiaSan ? 'CHAM_GIA_SAN' : 'BINH_THUONG';
  // Gỡ tiền tố client gửi, rồi luôn gắn tiền tố mô phỏng của server.
  const lyDoGoc = (typeof inp.lyDo === 'string' ? inp.lyDo : '').replace(CLIENT_PREFIX, '').trim();
  const lyDo = `${TIEN_TO_MO_PHONG} ${lyDoGoc}`.trim();
  const tyLe = fillRate(metrics.n_total, metrics.n_sold, metrics.n_hold);
  const row = {
    DeXuatID: nextId(next, 'deXuatGia'),
    QuyTacGiaID: qt.QuyTacGiaID,
    KhuVucID: kvId,
    TyLeLapDay: tyLe === null ? null : roundScale(tyLe, 4),
    TocDoBanThucTe: roundScale(metrics.v_actual, 2),
    TocDoBanKyVong: roundScale(metrics.v_target, 2),
    SoGioConLai: roundScale(metrics.t_rem_gio, 2),
    GiaHienTai: giaHien,
    GiaTinhToanTho: tho,
    GiaDeXuat: p,
    CoCanhBaoVuotKhung: loaiCanhBao !== 'BINH_THUONG',
    LoaiCanhBao: loaiCanhBao,
    TrangThaiDuyet: 'PENDING',
    GhiChuDuyet: null,
    NguoiDuyetID: null,
    ThoiGianDuyet: null,
    LyDoDeXuat: lyDo,
    ThoiGianDeXuat: iso,
    nhan: NHAN_MO_PHONG,
  };
  next.deXuatGia.push(row);
  return {
    state: next,
    result: {
      ketQua: 'DA_LUU',
      deXuatId: row.DeXuatID,
      khuVucId: kvId,
      suKienId: kv.SuKienID,
      giaDeXuat: p,
      giaHienTai: giaHien,
      loaiCanhBao,
      moPhong,
      nhan: NHAN_MO_PHONG,
      deXuatHetHan,
    },
  };
}

// ---------------------------------------------------------------- đề xuất tự động & simulator (T4)

const TY_LE_MO_PHONG = Object.freeze({
  // Phần trăm nguyên (khớp NUMERIC của SQL T4): tránh sai số dấu phẩy động trước khi FLOOR.
  ban_nhanh: 70,
  ban_cham: 10,
  ban_deu: 35,
});

/**
 * Đọc số liệu từ laySoLieuDinhGia, đưa qua computePriceProposal (pricingEngine.js) và nếu shouldPropose = true
 * thì gọi luuDeXuatGia. Khi dang_mo_ban = false hoặc engine bỏ qua thì không tạo đề xuất (giữ nguyên state).
 */
export function deXuatTuDong(state, khuVucId, now, lyDo) {
  const nowMs = toMs(now);
  const lk = lienKet(state, khuVucId);
  if (!lk) {
    return {
      state,
      result: { ketQua: 'LOI', loi: 'KHU_VUC_KHONG_TON_TAI', moPhong: false, nhan: NHAN_MO_PHONG },
    };
  }
  const { kvId, kv, sk } = lk;
  const rows = laySoLieuDinhGia(state, kv.SuKienID, nowMs);
  const row = rows.find((r) => r.khu_vuc_id === kvId);
  const moPhong = row?.mo_phong ?? (sk?.moPhong === true);

  if (!row || !row.dang_mo_ban) {
    return {
      state,
      result: {
        ketQua: 'BO_QUA',
        lyDoBoQua: ['SUAT_DIEN_KHONG_MO_BAN'],
        engine: null,
        moPhong,
        nhan: NHAN_MO_PHONG,
      },
    };
  }

  const ruleRow = row.co_quy_tac
    ? {
        GiaGoc: row.gia_goc,
        GiaSan: row.gia_san,
        GiaTran: row.gia_tran,
        BuocNhayGia: row.buoc_nhay,
        BienDoToiDaMoiChuKy: row.bien_do,
        NguongLapDayThap: row.nguong_thap,
        NguongLapDayCao: row.nguong_cao,
        TrongSoLapDay: row.trong_so_lap_day,
        TrongSoTocDoBan: row.trong_so_toc_do,
        TrongSoThoiGian: row.trong_so_thoi_gian,
        TrangThaiKichHoat: row.kich_hoat,
      }
    : null;

  const engine = computePriceProposal({
    rule: ruleFromQuyTacGia(ruleRow),
    currentPrice: row.gia_hien_hanh,
    totalSeats: row.n_total,
    soldSeats: row.n_sold,
    heldSeats: row.n_hold,
    hoursRemaining: row.t_rem_gio,
    actualVelocity: row.v_actual,
    targetVelocity: row.v_target,
    hasPendingProposal: row.co_pending,
  });

  if (!engine.shouldPropose) {
    return {
      state,
      result: {
        ketQua: 'BO_QUA',
        lyDoBoQua: engine.skipReasons,
        engine,
        moPhong,
        nhan: NHAN_MO_PHONG,
      },
    };
  }

  const qt = state.quyTacGia?.[kvId] ?? null;
  const lyDoMacDinh = `Đề xuất tự động (r=${((engine.intermediate.fillRate ?? 0) * 100).toFixed(1)}%)`;
  const saved = luuDeXuatGia(
    state,
    {
      khuVucId: kvId,
      quyTacGiaId: row.quy_tac_gia_id,
      quyTacNgayCapNhat: qt?.NgayCapNhat ?? null,
      giaDeXuat: engine.proposedPrice,
      giaTinhToanTho: engine.intermediate.rawPrice,
      lyDo: lyDo ?? lyDoMacDinh,
    },
    nowMs,
  );
  return {
    state: saved.state,
    result: { ...saved.result, engine },
  };
}

/**
 * Tương đương mo_phong_nhu_cau(p_su_kien_id, p_kich_ban) trong T4:
 *   - Cổng kiểm tra theo thứ tự: kịch bản -> sự kiện -> moPhong=true -> suất mở qua dangMoBan().
 *   - Chỉ ghi trên các suất đang mở bán của sự kiện, chỉ ghế TRONG không bị giữ (mọi giuCho TrangThai='ACTIVE' đều chặn, bất kể HetHanLuc, như T4),
 *     theo thứ tự GheID tăng dần. Không bao giờ sửa giá niêm yết, quy tắc, đề xuất hay nhật ký định giá.
 */
export function moPhongNhuCau(state, suKienId, kichBan, now) {
  const nowMs = toMs(now);
  if (typeof kichBan !== 'string' || !Object.hasOwn(TY_LE_MO_PHONG, kichBan)) {
    return {
      state,
      result: { ketQua: 'LOI', loi: 'KICH_BAN_KHONG_HOP_LE', nhan: NHAN_MO_PHONG, moPhong: false },
    };
  }
  const sk = state.suKien?.[suKienId] ?? null;
  if (!sk) {
    return {
      state,
      result: { ketQua: 'LOI', loi: 'SU_KIEN_KHONG_TON_TAI', nhan: NHAN_MO_PHONG, moPhong: false },
    };
  }
  if (sk.moPhong !== true) {
    return {
      state,
      result: { ketQua: 'LOI', loi: 'MO_PHONG_CHUA_BAT', nhan: NHAN_MO_PHONG, moPhong: false },
    };
  }

  const shows = Object.entries(state.suatDien ?? {})
    .map(([id, sd]) => [Number(id), sd])
    .filter(([, sd]) => sd && sd.SuKienID === suKienId)
    .sort((a, b) => a[0] - b[0]);

  const suatDaMoPhong = [];
  const suatBoQua = [];
  for (const [sdId, sd] of shows) {
    if (dangMoBan(sk, sd, nowMs)) suatDaMoPhong.push(sdId);
    else suatBoQua.push({ suatDienId: sdId, lyDo: 'KHONG_MO_BAN' });
  }

  if (suatDaMoPhong.length === 0) {
    return {
      state,
      result: {
        ketQua: 'KHONG_CO_SUAT_HOP_LE',
        nhan: NHAN_MO_PHONG,
        moPhong: true,
        kichBan,
        suKienId,
        suatBoQua,
      },
    };
  }

  const next = clone(state);
  const openSet = new Set(suatDaMoPhong);
  const heldSeatIds = new Set();
  for (const gc of next.giuCho ?? []) {
    if (gc.TrangThai !== 'ACTIVE') continue;
    for (const ct of gc.chiTiet ?? []) {
      if (ct.GheID !== null && ct.GheID !== undefined) heldSeatIds.add(ct.GheID);
    }
  }

  // Đặt lại chỉ các dòng moPhongGhe của sự kiện này thuộc suất đang mở bán.
  const gheById = new Map();
  for (const g of next.ghe ?? []) gheById.set(g.GheID, g);

  let restored = 0;
  let diverged = 0;
  let locked = 0;
  let notReset = 0;
  const zoneRestored = new Map();
  const keptBookkeeping = [];

  for (const m of next.moPhongGhe ?? []) {
    if (m.SuKienID !== suKienId) {
      keptBookkeeping.push(m);
      continue;
    }
    if (!openSet.has(m.SuatDienID)) {
      notReset += 1;
      keptBookkeeping.push(m);
      continue;
    }
    const g = gheById.get(m.GheID);
    const kv = g ? next.khuVuc?.[g.KhuVucID] : null;
    const matches =
      g &&
      kv &&
      kv.SuKienID === suKienId &&
      g.TrangThai === 'DA_BAN' &&
      ((isMissing(g.NgayCapNhatTrangThai) && isMissing(m.ThoiDiemGiaLap)) ||
        cungThoiDiem(g.NgayCapNhatTrangThai, m.ThoiDiemGiaLap));

    if (!matches) {
      diverged += 1;
      continue;
    }
    if (heldSeatIds.has(g.GheID)) {
      locked += 1;
      keptBookkeeping.push(m);
      continue;
    }
    g.TrangThai = m.TrangThaiTruoc;
    g.NgayCapNhatTrangThai = m.NgayCapNhatTruoc ?? null;
    restored += 1;
    zoneRestored.set(g.KhuVucID, (zoneRestored.get(g.KhuVucID) ?? 0) + 1);
  }
  next.moPhongGhe = keptBookkeeping;

  // Áp dụng kịch bản cho từng khu vực của suất mở (KhuVucID tăng dần).
  const fillPct = TY_LE_MO_PHONG[kichBan];
  const anchorIso = new Date(nowMs).toISOString();
  const zones = Object.entries(next.khuVuc ?? {})
    .map(([id, kv]) => [Number(id), kv])
    .filter(([, kv]) => kv && kv.SuKienID === suKienId && openSet.has(kv.SuatDienID))
    .sort((a, b) => a[0] - b[0]);

  const zonesOut = [];
  const mpByGhe = new Map(next.moPhongGhe.map((m) => [m.GheID, m]));

  for (const [kvId, kv] of zones) {
    const sd = next.suatDien[kv.SuatDienID];
    const zoneSeats = (next.ghe ?? []).filter((g) => g.KhuVucID === kvId);
    const hasSeats = zoneSeats.length > 0;
    let ghiMoi = 0;
    let holdCount = 0;
    let inWindow = 0;

    if (hasSeats) {
      for (const g of zoneSeats) {
        if (g.TrangThai === 'TRONG' && heldSeatIds.has(g.GheID)) holdCount += 1;
      }
      const target = Math.max(Math.floor(((Number(kv.TongSoGhe) || 0) * fillPct) / 100), 0);
      const eligible = zoneSeats
        .filter((g) => g.TrangThai === 'TRONG' && !heldSeatIds.has(g.GheID))
        .sort((a, b) => a.GheID - b.GheID);
      const picked = eligible.slice(0, target);
      const n = picked.length;
      ghiMoi = n;

      if (n > 0) {
        const moRaw = tsMs(sd.ThoiGianMoBanVe);
        const openMs = Number.isFinite(moRaw) ? moRaw : nowMs - 24 * MS_GIO;
        for (let k = 0; k < n; k += 1) {
          const g = picked[k];
          const ord = k + 1;
          let rawMs;
          if (kichBan === 'ban_nhanh') {
            rawMs = nowMs - 5 * MS_GIO * (k / n);
          } else if (kichBan === 'ban_cham') {
            rawMs = nowMs - (6 * MS_GIO + MS_PHUT + k * MS_PHUT);
          } else {
            rawMs = nowMs - (nowMs - openMs) * (1 - ord / (n + 1));
          }
          const simMs = Math.round(Math.min(nowMs, Math.max(openMs, rawMs)));
          const simIso = new Date(simMs).toISOString();
          if (kichBan === 'ban_cham' && simMs >= nowMs - 6 * MS_GIO) {
            inWindow += 1;
          }
          const mpEntry = {
            GheID: g.GheID,
            SuKienID: suKienId,
            SuatDienID: kv.SuatDienID,
            KhuVucID: kvId,
            KichBan: kichBan,
            TrangThaiTruoc: g.TrangThai,
            NgayCapNhatTruoc: g.NgayCapNhatTrangThai ?? null,
            ThoiDiemGiaLap: simIso,
            NgayTao: anchorIso,
          };
          const existingMp = mpByGhe.get(g.GheID);
          if (existingMp) {
            Object.assign(existingMp, mpEntry);
          } else {
            next.moPhongGhe.push(mpEntry);
            mpByGhe.set(g.GheID, mpEntry);
          }
          g.TrangThai = 'DA_BAN';
          g.NgayCapNhatTrangThai = simIso;
        }
      }
    }

    zonesOut.push({
      khuVucId: kvId,
      suatDienId: kv.SuatDienID,
      ghiMoi,
      datLai: zoneRestored.get(kvId) ?? 0,
      boQuaDangGiu: holdCount,
      khongCoGhe: !hasSeats,
      biKepVaoCuaSo6h: kichBan === 'ban_cham' ? inWindow : 0,
    });
  }

  return {
    state: next,
    result: {
      ketQua: 'DA_MO_PHONG',
      nhan: NHAN_MO_PHONG,
      moPhong: true,
      kichBan,
      suKienId,
      thoiDiemNeo: anchorIso,
      suatDaMoPhong,
      suatBoQua,
      khuVuc: zonesOut,
      datLai: {
        tong: restored,
        boQuaDaThayDoi: diverged,
        boQuaDangKhoa: locked,
        chuaDatLai: notReset,
      },
    },
  };
}
