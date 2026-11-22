/**
 * CLI chu kỳ định giá tự động (W2-T8) dùng chung engine và RPC thật với T7.
 *
 * Quy tắc vận hành:
 * - Lịch 60 phút (CHU_KY_MS = 3600000 ms): chạy một chu kỳ ngay khi khởi động,
 *   sau đó lặp nhịp kiểm tra mỗi 5 phút (NHIP_KIEM_TRA_MS = 300000 ms).
 * - Khi thời gian trôi qua từ lúc bắt đầu chu kỳ trước >= 60 phút: chạy chu kỳ đầy đủ (LICH_60_PHUT).
 * - Trong khoảng < 60 phút: nhịp 5 phút chỉ gọi lay_so_lieu_dinh_gia để kiểm tra tỷ lệ lấp đầy;
 *   nếu có khu vực đã có mốc bị lệch >= 5 điểm phần trăm (NGUONG_BIEN_DONG = 0.05) thì kích hoạt
 *   chu kỳ đầy đủ sớm (BIEN_DONG_LAP_DAY). Khu vực mới chưa có mốc không kích hoạt sớm.
 *   So sánh trực tiếp |r - mốc| >= 0.05 - EPS_SO_THUC; EPS_SO_THUC = 1e-9 chỉ bù sai số dấu phẩy
 *   động (vd 0.5 - 0.45 = 0.04999999999999999), không làm tròn nên chênh 0.0499996 không kích hoạt.
 * - Mốc lấp đầy (mocLapDay) CHỈ được cập nhật sau một chu kỳ đầy đủ thành công từ số liệu của
 *   chính chu kỳ đó; nhịp kiểm tra 5 phút không bao giờ làm thay đổi mốc.
 * - Cờ --nhanh: chạy đúng một chu kỳ đầy đủ, không chờ nhịp kiểm tra, in báo cáo và thoát.
 *   Không thay đổi TTL, thuật toán định giá hay bỏ qua PriceGuard.
 * - Mã thoát: 0 (thành công, kể cả khi có khu BI_CHAN/BO_QUA/LOI riêng lẻ),
 *   1 (lỗi nghiêm trọng ở mức chu kỳ/RPC/mạng), 2 (lỗi cấu hình hoặc tham số CLI).
 */

import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {computePriceProposal, fillRate, ruleFromQuyTacGia} from '../src/domain/pricingEngine.js';
import {chayDinhGiaNgayLogic} from '../src/domain/pricingServiceCore.js';

export const CHU_KY_MS = 3600000;
export const NHIP_KIEM_TRA_MS = 300000;
export const NGUONG_BIEN_DONG = 0.05;

const INT_MAX = 2147483647;
const EPS_SO_THUC = 1e-9;

const MA_CHAN_HOP_LE = [
  'QUY_TAC_KHONG_TON_TAI',
  'LIEN_KET_KHONG_HOP_LE',
  'QUY_TAC_DA_THAY_DOI',
  'QUY_TAC_TAT',
  'SUAT_DIEN_KHONG_MO_BAN',
  'GIA_KHONG_HOP_LE',
  'GIA_HIEN_HANH_KHONG_HOP_LE',
  'NGOAI_KHUNG_GIA',
  'VUOT_BIEN_DO',
  'DUOI_BUOC_NHAY',
  'DA_CO_PENDING',
  'THIEU_DU_LIEU',
];

export class LoiCauHinh extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'LoiCauHinh';
  }
}

export class LoiThamSo extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'LoiThamSo';
  }
}

export class LoiKetNoiNghiemTrong extends Error {
  /**
   * @param {string} message
   * @param {{cause?: unknown}} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'LoiKetNoiNghiemTrong';
  }
}

const MAU_LOI_MANG = /fetch failed|network|ECONN(REFUSED|RESET)|ENOTFOUND|ETIMEDOUT|AbortError/i;

/**
 * Phân loại phản hồi RPC có phải lỗi kết nối nghiêm trọng hay không.
 * Lỗi Postgres có mã (P0001, 23xxx...) hoặc chỉ có message không kèm status là lỗi riêng từng khu.
 * @param {any} res
 * @returns {boolean}
 */
export function laLoiKetNoi(res) {
  if (!res || typeof res !== 'object') return false;
  const status = res.status;
  if (status === 0) return true;
  if (typeof status === 'number' && (status === 401 || status === 403 || status >= 500)) {
    return true;
  }
  const message = res.error?.message;
  return typeof message === 'string' && MAU_LOI_MANG.test(message);
}

const laBanGhi =(v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const laSo = (v) => typeof v === 'number' && Number.isFinite(v);
const laSoHoacNull = (v) => v === null || laSo(v);
const laMangSo = (v) => Array.isArray(v) && v.every(laSo);
const laMaChan = (v) => typeof v === 'string' && MA_CHAN_HOP_LE.includes(v);
const laLoaiCanhBao = (v) =>
  v === 'BINH_THUONG' || v === 'CHAM_GIA_TRAN' || v === 'CHAM_GIA_SAN';

function thongBaoLoi(e) {
  return e instanceof Error ? e.message : String(e);
}

function anKhoa(vanBan, ...keys) {
  let ketQua = String(vanBan);
  for (const key of keys) {
    if (typeof key === 'string' && key.length > 0) {
      ketQua = ketQua.split(key).join('***');
    }
  }
  return ketQua;
}

/**
 * Đọc cấu hình kết nối Supabase từ biến môi trường truyền vào.
 * Chỉ chấp nhận SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY, không có giá trị mặc định.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{url: string, key: string}}
 */
export function docCauHinh(env = process.env) {
  const nguon = env && typeof env === 'object' ? env : {};
  const rawUrl = typeof nguon.SUPABASE_URL === 'string' ? nguon.SUPABASE_URL.trim() : '';
  const rawKey =
    typeof nguon.SUPABASE_SERVICE_ROLE_KEY === 'string'
      ? nguon.SUPABASE_SERVICE_ROLE_KEY.trim()
      : '';

  const thieu = [];
  if (rawUrl === '') thieu.push('SUPABASE_URL');
  if (rawKey === '') thieu.push('SUPABASE_SERVICE_ROLE_KEY');

  if (thieu.length > 0) {
    throw new LoiCauHinh(`Thiếu biến môi trường bắt buộc: ${thieu.join(', ')}`);
  }

  return {url: rawUrl, key: rawKey};
}

/**
 * Phân tích tham số CLI: --su-kien <id> (hoặc --su-kien=<id>) và --nhanh.
 * @param {readonly string[]} [argv]
 * @returns {{suKienId: number, nhanh: boolean}}
 */
export function phanTichThamSo(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv)) {
    throw new LoiThamSo('Danh sách tham số không hợp lệ.');
  }

  let suKienRaw = null;
  let daThaySuKien = false;
  let nhanh = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (typeof arg !== 'string') {
      throw new LoiThamSo('Tham số không hợp lệ.');
    }

    if (arg === '--nhanh') {
      if (nhanh) {
        throw new LoiThamSo('Tham số --nhanh bị lặp lại.');
      }
      nhanh = true;
      continue;
    }

    if (arg === '--su-kien') {
      if (daThaySuKien) {
        throw new LoiThamSo('Tham số --su-kien bị lặp lại.');
      }
      daThaySuKien = true;
      if (i + 1 >= argv.length) {
        throw new LoiThamSo('Thiếu giá trị cho --su-kien.');
      }
      suKienRaw = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--su-kien=')) {
      if (daThaySuKien) {
        throw new LoiThamSo('Tham số --su-kien bị lặp lại.');
      }
      daThaySuKien = true;
      suKienRaw = arg.slice('--su-kien='.length);
      continue;
    }

    throw new LoiThamSo(`Tham số không được hỗ trợ: ${arg}`);
  }

  if (!daThaySuKien || suKienRaw === null) {
    throw new LoiThamSo('Thiếu tham số bắt buộc --su-kien <id>.');
  }

  if (!/^[1-9]\d*$/.test(suKienRaw)) {
    throw new LoiThamSo(`Giá trị --su-kien không hợp lệ: ${suKienRaw}`);
  }

  const suKienId = Number(suKienRaw);
  if (!Number.isSafeInteger(suKienId) || suKienId < 1 || suKienId > INT_MAX) {
    throw new LoiThamSo(`Giá trị --su-kien vượt giới hạn INT: ${suKienRaw}`);
  }

  return {suKienId, nhanh};
}

/**
 * Ánh xạ một dòng từ RPC lay_so_lieu_dinh_gia sang đầu vào cho pricingEngine.
 * @param {Record<string, any>} row
 */
export function dauVaoEngine(row) {
  const quyTac =
    row.co_quy_tac === true
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
          TrangThaiKichHoat: row.kich_hoat === true,
        }
      : null;

  return {
    rule: ruleFromQuyTacGia(quyTac),
    currentPrice: row.gia_hien_hanh,
    totalSeats: row.n_total,
    soldSeats: row.n_sold,
    heldSeats: row.n_hold,
    hoursRemaining: row.t_rem_gio,
    actualVelocity: row.v_actual,
    targetVelocity: row.v_target,
    hasPendingProposal: row.co_pending === true,
  };
}

function docHetHan(v) {
  if (!laBanGhi(v)) return null;
  if (!laSo(v.suKienId) || !laMangSo(v.deXuatHetHan) || !laSo(v.soLuong)) return null;
  return {suKienId: v.suKienId, deXuatHetHan: v.deXuatHetHan, soLuong: v.soLuong};
}

function docLuuDeXuatGia(v) {
  if (!laBanGhi(v) || !laMangSo(v.deXuatHetHan)) return null;
  if (v.ketQua === 'DA_LUU') {
    if (
      !laSo(v.deXuatId) ||
      !laSo(v.khuVucId) ||
      !laSo(v.suKienId) ||
      !laSo(v.giaDeXuat) ||
      !laSo(v.giaHienTai) ||
      !laLoaiCanhBao(v.loaiCanhBao) ||
      typeof v.moPhong !== 'boolean'
    ) {
      return null;
    }
    return {
      ketQua: 'DA_LUU',
      deXuatId: v.deXuatId,
      khuVucId: v.khuVucId,
      suKienId: v.suKienId,
      giaDeXuat: v.giaDeXuat,
      giaHienTai: v.giaHienTai,
      loaiCanhBao: v.loaiCanhBao,
      moPhong: v.moPhong,
      deXuatHetHan: v.deXuatHetHan,
    };
  }
  if (v.ketQua === 'BI_CHAN') {
    if (!laMaChan(v.maChan) || !laSoHoacNull(v.nhatKyId)) return null;
    return {
      ketQua: 'BI_CHAN',
      maChan: v.maChan,
      nhatKyId: v.nhatKyId,
      deXuatHetHan: v.deXuatHetHan,
    };
  }
  return null;
}

function thuHepHang(raw) {
  if (
    !laBanGhi(raw) ||
    !laSo(raw.khu_vuc_id) ||
    !laSo(raw.suat_dien_id) ||
    !laSo(raw.su_kien_id)
  ) {
    throw new Error('Phản hồi RPC lay_so_lieu_dinh_gia không đúng hợp đồng.');
  }
  return {
    ...raw,
    khu_vuc_id: raw.khu_vuc_id,
    suat_dien_id: raw.suat_dien_id,
    su_kien_id: raw.su_kien_id,
    dang_mo_ban: raw.dang_mo_ban === true,
  };
}

function lyDoMacDinh(engine) {
  return `Đề xuất tự động (r=${((engine.intermediate.fillRate ?? 0) * 100).toFixed(1)}%)`;
}

/**
 * Tạo đối tượng IO kết nối Supabase RPC cho chayDinhGiaNgayLogic.
 * @param {any} client
 */
export function taoIo(client) {
  return {
    async hetHan(suKienId) {
      const {data, error} = await client.rpc('het_han_de_xuat_gia', {p_su_kien_id: suKienId});
      if (error) throw new Error(error.message || 'Lỗi RPC het_han_de_xuat_gia');
      const parsed = docHetHan(data);
      if (!parsed) throw new Error('Phản hồi RPC het_han_de_xuat_gia không đúng hợp đồng.');
      return parsed;
    },

    async docQuyTac(suKienId) {
      const khu = await client.from('KHU_VUC').select('KhuVucID').eq('SuKienID', suKienId);
      if (khu.error) throw new Error(khu.error.message || 'Lỗi đọc bảng KHU_VUC');
      if (!Array.isArray(khu.data)) throw new Error('Phản hồi bảng KHU_VUC không hợp lệ.');
      const khuIds = khu.data.map((k) => k.KhuVucID);
      if (khuIds.length === 0) return [];

      const qt = await client
        .from('QUY_TAC_GIA')
        .select('QuyTacGiaID,NgayCapNhat')
        .in('KhuVucID', khuIds);
      if (qt.error) throw new Error(qt.error.message || 'Lỗi đọc bảng QUY_TAC_GIA');
      if (!Array.isArray(qt.data)) throw new Error('Phản hồi bảng QUY_TAC_GIA không hợp lệ.');
      return qt.data;
    },

    async soLieu(suKienId) {
      const {data, error} = await client.rpc('lay_so_lieu_dinh_gia', {p_su_kien_id: suKienId});
      if (error) throw new Error(error.message || 'Lỗi RPC lay_so_lieu_dinh_gia');
      if (!Array.isArray(data)) {
        throw new Error('Phản hồi RPC lay_so_lieu_dinh_gia không đúng hợp đồng.');
      }
      return data.map(thuHepHang);
    },

    tinh(row) {
      return computePriceProposal(dauVaoEngine(row));
    },

    async luuDeXuat(row, engine, ngayCapNhat) {
      if (
        row.quy_tac_gia_id === null ||
        row.quy_tac_gia_id === undefined ||
        engine.proposedPrice === null ||
        engine.intermediate.rawPrice === null
      ) {
        throw new Error('Thiếu dữ liệu để lưu đề xuất giá.');
      }
      let res;
      try {
        res = await client.rpc('luu_de_xuat_gia', {
          p_khu_vuc_id: row.khu_vuc_id,
          p_quy_tac_gia_id: row.quy_tac_gia_id,
          p_quy_tac_ngay_cap_nhat: ngayCapNhat,
          p_gia_de_xuat: engine.proposedPrice,
          p_gia_tinh_toan_tho: engine.intermediate.rawPrice,
          p_ly_do: lyDoMacDinh(engine),
        });
      } catch (err) {
        throw new LoiKetNoiNghiemTrong(
          `Lỗi kết nối RPC luu_de_xuat_gia: ${thongBaoLoi(err)}`,
          {cause: err},
        );
      }
      const {data, error} = res ?? {};
      if (laLoiKetNoi(res)) {
        throw new LoiKetNoiNghiemTrong(
          `Lỗi kết nối RPC luu_de_xuat_gia: ${error?.message || `status ${res?.status}`}`,
          error ? {cause: error} : undefined,
        );
      }
      if (error) throw new Error(error.message || 'Lỗi RPC luu_de_xuat_gia');
      const parsed = docLuuDeXuatGia(data);
      if (!parsed) throw new Error('Phản hồi RPC luu_de_xuat_gia không đúng hợp đồng.');
      return parsed;
    },
  };
}

function taoMocLapDay(rows) {
  /** @type {Map<number, number>} */
  const moc = new Map();
  for (const row of rows) {
    if (row.dang_mo_ban === true && row.kich_hoat === true) {
      const r = fillRate(row.n_total, row.n_sold, row.n_hold);
      if (r !== null) {
        moc.set(row.khu_vuc_id, r);
      }
    }
  }
  return moc;
}

/**
 * Chạy một chu kỳ định giá đầy đủ và tính mốc lấp đầy mới từ lượt đọc số liệu cuối cùng.
 * @param {{io: ReturnType<typeof taoIo>, suKienId: number}} params
 */
export async function chayMotChuKy({io, suKienId}) {
  /** @type {any[]} */
  let hangCuoi = [];
  /** @type {LoiKetNoiNghiemTrong | null} */
  let loiNghiemTrong = null;
  const ioBoc = {
    ...io,
    async soLieu(id) {
      hangCuoi = await io.soLieu(id);
      return hangCuoi;
    },
    async luuDeXuat(...args) {
      if (loiNghiemTrong) throw loiNghiemTrong;
      try {
        return await io.luuDeXuat(...args);
      } catch (err) {
        if (err instanceof LoiKetNoiNghiemTrong) loiNghiemTrong = err;
        throw err;
      }
    },
  };

  const {hetHan, theoKhu} = await chayDinhGiaNgayLogic(ioBoc, suKienId);
  const mocLapDay = taoMocLapDay(hangCuoi);
  return {hetHan, theoKhu, mocLapDay, loiNghiemTrong};
}

function coBienDongLapDay(rows, mocLapDay) {
  for (const row of rows) {
    if (row.dang_mo_ban !== true || row.kich_hoat !== true) continue;
    const mocCu = mocLapDay.get(row.khu_vuc_id);
    if (mocCu === undefined) continue;
    const r = fillRate(row.n_total, row.n_sold, row.n_hold);
    if (r === null) continue;
    if (Math.abs(r - mocCu) >= NGUONG_BIEN_DONG - EPS_SO_THUC) {
      return true;
    }
  }
  return false;
}

function dinhDangMoc(mocLapDay) {
  if (mocLapDay.size === 0) return 'trống';
  return Array.from(mocLapDay.entries())
    .map(([id, r]) => `${id}:${(r * 100).toFixed(2)}%`)
    .join(', ');
}

function dinhDangThoiDiem(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms);
}

function ghiBaoCaoChuKy(log, {thoiDiem, lyDo, suKienId, hetHan, theoKhu, mocLapDay}) {
  const dsHetHan = hetHan.deXuatHetHan.length > 0 ? hetHan.deXuatHetHan.join(',') : 'không';
  log(
    `[${dinhDangThoiDiem(thoiDiem)}] Chu kỳ định giá suKien=${suKienId} | lyDo=${lyDo} | hetHan=${hetHan.soLuong} (${dsHetHan})`,
  );
  for (const k of theoKhu) {
    if (k.ketQua === 'DA_LUU') {
      log(
        `  Khu ${k.khuVucId} (suat=${k.suatDienId}): DA_LUU deXuatId=${k.deXuatId} giaDeXuat=${k.giaDeXuat} giaHienTai=${k.giaHienTai} canhBao=${k.loaiCanhBao}`,
      );
    } else if (k.ketQua === 'BI_CHAN') {
      log(
        `  Khu ${k.khuVucId} (suat=${k.suatDienId}): BI_CHAN maChan=${k.maChan} nhatKyId=${k.nhatKyId ?? 'null'}`,
      );
    } else if (k.ketQua === 'BO_QUA') {
      log(
        `  Khu ${k.khuVucId} (suat=${k.suatDienId}): BO_QUA lyDo=${k.lyDoBoQua.join(',')}`,
      );
    } else {
      log(`  Khu ${k.khuVucId} (suat=${k.suatDienId}): LOI ${k.loi}`);
    }
  }
  log(`  Mốc lấp đầy mới: ${dinhDangMoc(mocLapDay)}`);
}

/**
 * Bộ chờ mặc định hỗ trợ hủy bằng AbortSignal.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function choMacDinh(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

/**
 * Điều phối lịch chạy định giá (chế độ nhanh một chu kỳ hoặc vòng lặp 60 phút / nhịp 5 phút).
 * @param {{
 *   io: ReturnType<typeof taoIo>,
 *   suKienId: number,
 *   nhanh?: boolean,
 *   dongHo?: {now: () => number},
 *   cho?: (ms: number, signal?: AbortSignal) => Promise<void>,
 *   log?: (msg: string) => void,
 *   signal?: AbortSignal,
 * }} params
 * @returns {Promise<{soChuKy: number, lyDoKetThuc: string}>}
 */
export async function chayLich({
  io,
  suKienId,
  nhanh = false,
  dongHo = {now: () => Date.now()},
  cho = choMacDinh,
  log = console.log,
  signal,
}) {
  if (signal?.aborted) {
    return {soChuKy: 0, lyDoKetThuc: 'TIN_HIEU_DUNG'};
  }

  let soChuKy = 0;
  let dangChay = false;

  const thucThiChuKy = async (lyDo, thoiDiem) => {
    if (dangChay) {
      log(`[${dinhDangThoiDiem(thoiDiem)}] Bỏ qua nhịp vì chu kỳ trước đang chạy.`);
      return null;
    }
    dangChay = true;
    try {
      const kq = await chayMotChuKy({io, suKienId});
      soChuKy += 1;
      ghiBaoCaoChuKy(log, {
        thoiDiem,
        lyDo,
        suKienId,
        hetHan: kq.hetHan,
        theoKhu: kq.theoKhu,
        mocLapDay: kq.mocLapDay,
      });
      if (kq.loiNghiemTrong) {
        throw kq.loiNghiemTrong;
      }
      return kq.mocLapDay;
    } finally {
      dangChay = false;
    }
  };

  let thoiDiemChuKyTruoc = dongHo.now();
  let mocLapDay = (await thucThiChuKy('KHOI_DONG', thoiDiemChuKyTruoc)) ?? new Map();

  if (nhanh) {
    return {soChuKy, lyDoKetThuc: 'NHANH_XONG'};
  }

  while (!signal?.aborted) {
    try {
      await cho(NHIP_KIEM_TRA_MS, signal);
    } catch (err) {
      if (signal?.aborted) break;
      throw err;
    }
    if (signal?.aborted) break;

    const hienTai = dongHo.now();
    if (dangChay) {
      log(`[${dinhDangThoiDiem(hienTai)}] Bỏ qua nhịp kiểm tra vì chu kỳ trước đang chạy.`);
      continue;
    }

    if (hienTai - thoiDiemChuKyTruoc >= CHU_KY_MS) {
      thoiDiemChuKyTruoc = hienTai;
      mocLapDay = (await thucThiChuKy('LICH_60_PHUT', hienTai)) ?? mocLapDay;
      continue;
    }

    const hangKiemTra = await io.soLieu(suKienId);
    if (coBienDongLapDay(hangKiemTra, mocLapDay)) {
      thoiDiemChuKyTruoc = hienTai;
      mocLapDay = (await thucThiChuKy('BIEN_DONG_LAP_DAY', hienTai)) ?? mocLapDay;
    } else {
      log(
        `[${dinhDangThoiDiem(hienTai)}] Nhịp kiểm tra suKien=${suKienId} | BO_QUA (chưa đủ 60 phút và biến động < 5 điểm) | mốc giữ nguyên: ${dinhDangMoc(mocLapDay)}`,
      );
    }
  }

  return {soChuKy, lyDoKetThuc: 'TIN_HIEU_DUNG'};
}

/**
 * Điểm vào chính của CLI, trả về mã thoát (0, 1 hoặc 2).
 * Lỗi kết nối nghiêm trọng khi lưu đề xuất (LoiKetNoiNghiemTrong) cho mã thoát 1 sau khi đã
 * ghi báo cáo từng khu; không retry.
 * @param {readonly string[]} [argv]
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   createClient?: typeof createSupabaseClient,
 *   dongHo?: {now: () => number},
 *   cho?: (ms: number, signal?: AbortSignal) => Promise<void>,
 *   log?: (msg: string) => void,
 *   signal?: AbortSignal,
 * }} [deps]
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const rawKey =
    env && typeof env === 'object' && typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string'
      ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
      : '';
  const logRaw = deps.log ?? console.log;
  const log = (msg) => logRaw(anKhoa(msg, rawKey));
  const errLog = (msg) => console.error(anKhoa(msg, rawKey));

  /** @type {{url: string, key: string} | null} */
  let cauHinh = null;
  try {
    cauHinh = docCauHinh(env);
    const thamSo = phanTichThamSo(argv);

    const taoClient = deps.createClient ?? createSupabaseClient;
    const client = taoClient(cauHinh.url, cauHinh.key, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    const io = taoIo(client);

    let controller = null;
    let signal = deps.signal;
    const huyTinHieu = () => {
      controller?.abort();
    };
    if (!signal) {
      controller = new AbortController();
      signal = controller.signal;
      process.once('SIGINT', huyTinHieu);
      process.once('SIGTERM', huyTinHieu);
    }

    try {
      await chayLich({
        io,
        suKienId: thamSo.suKienId,
        nhanh: thamSo.nhanh,
        dongHo: deps.dongHo ?? {now: () => Date.now()},
        cho: deps.cho ?? choMacDinh,
        log,
        signal,
      });
      return 0;
    } finally {
      if (controller) {
        process.off('SIGINT', huyTinHieu);
        process.off('SIGTERM', huyTinHieu);
      }
    }
  } catch (err) {
    const thongBao = anKhoa(thongBaoLoi(err), cauHinh?.key, rawKey);
    errLog(thongBao);
    if (err instanceof LoiCauHinh || err instanceof LoiThamSo) {      return 2;
    }
    return 1;
  }
}

const laChayTrucTiep =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (laChayTrucTiep) {
  main(process.argv.slice(2), process.env)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      const rawKey =
        typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string'
          ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
          : '';
      console.error(anKhoa(thongBaoLoi(err), rawKey));
      process.exitCode = 1;
    });
}
