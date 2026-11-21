/**
 * Lõi thuần của src/services/pricingService.ts (không import Supabase/runtimeConfig) để node --test import được.
 *   - kiemTraTrangThaiMoPhong: kiểm tra NỘI DUNG trạng thái mock đã lưu theo các trường T6 đọc.
 *   - taoKhoPhienMock: nạp/lưu trạng thái mock, có cờ ưu tiên bộ nhớ sau khi setItem lỗi.
 *   - docQuyTacOnDinh / chayDinhGiaNgayLogic: chạy định giá thật, bảo đảm NgayCapNhat gửi PriceGuard
 *     thuộc đúng phiên bản quy tắc đã dùng để tính (đọc trước + sau metrics).
 */

import {fillRate} from './pricingEngine.js';
import {hetHanLuc, toMs} from './mockPricing.js';

export const NHAN_MO_PHONG_CORE = 'MO_PHONG';
export const LY_DO_QUY_TAC_THAY_DOI = 'QUY_TAC_THAY_DOI_TRONG_LUC_TINH';

const laBanGhi = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const laSo = (v) => typeof v === 'number' && Number.isFinite(v);
const laChuoi = (v) => typeof v === 'string';

// ---------------------------------------------------------------- kiểm tra trạng thái mock

function kiemTraBang(v, ten, kiemTraDong) {
  if (!laBanGhi(v)) return ten;
  for (const [id, dong] of Object.entries(v)) {
    const loi = kiemTraDong(dong);
    if (loi !== null) return `${ten}["${id}"]${loi === '' ? '' : `.${loi}`}`;
  }
  return null;
}

function kiemTraMang(v, ten, kiemTraDong) {
  if (!Array.isArray(v)) return ten;
  for (let i = 0; i < v.length; i += 1) {
    const loi = kiemTraDong(v[i]);
    if (loi !== null) return `${ten}[${i}]${loi === '' ? '' : `.${loi}`}`;
  }
  return null;
}

/** Trả '' nếu dòng không phải bản ghi, tên trường sai đầu tiên, hoặc null nếu hợp lệ. */
function truongSo(dong, ...ten) {
  if (!laBanGhi(dong)) return '';
  for (const t of ten) if (!laSo(dong[t])) return t;
  return null;
}

function truongChuoi(dong, ...ten) {
  for (const t of ten) if (!laChuoi(dong[t])) return t;
  return null;
}

const MAX_EPOCH_MS = 8.64e15;

/**
 * Trường thời gian tùy chọn trong JSON đã lưu: undefined/null, số hữu hạn trong miền Date, hoặc chuỗi không rỗng
 * Date.parse được. JSON không chứa Date nên mọi kiểu khác (object, mảng, boolean, chuỗi rỗng/rác) là sai.
 * Trả tên trường sai đầu tiên hoặc null.
 */
function truongThoiGianTuyChon(dong, ...ten) {
  for (const t of ten) {
    const v = dong[t];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_EPOCH_MS) continue;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Date.parse(v))) continue;
    return t;
  }
  return null;
}

function truongThoiGianBatBuoc(dong, ...ten) {
  for (const t of ten) {
    const v = dong[t];
    if (typeof v !== 'string' || v.trim() === '' || !Number.isFinite(Date.parse(v))) return t;
  }
  return null;
}

/**
 * Trả null nếu trạng thái hợp lệ, ngược lại là đường dẫn trường sai (ví dụ 'khuVuc["1"]', 'ghe[3].GheID').
 */
export function kiemTraTrangThaiMoPhong(v) {
  if (!laBanGhi(v)) return 'trangThai';
  if (v.nhan !== NHAN_MO_PHONG_CORE) return 'nhan';
  const kiem = [
    () =>
      kiemTraBang(v.suKien, 'suKien', (d) => {
        if (!laBanGhi(d)) return '';
        if (d.TrangThaiCongBo !== undefined && d.TrangThaiCongBo !== null && !laChuoi(d.TrangThaiCongBo)) return 'TrangThaiCongBo';
        if (d.moPhong !== undefined && typeof d.moPhong !== 'boolean') return 'moPhong';
        return null;
      }),
    () =>
      kiemTraBang(
        v.suatDien,
        'suatDien',
        (d) =>
          truongSo(d, 'SuKienID') ??
          (d.TrangThai !== undefined && d.TrangThai !== null && !laChuoi(d.TrangThai) ? 'TrangThai' : null) ??
          truongThoiGianTuyChon(d, 'ThoiGianMoBanVe', 'ThoiGianDongBanVe', 'ThoiGianBatDau'),
      ),
    () => kiemTraBang(v.khuVuc, 'khuVuc', (d) => truongSo(d, 'SuKienID', 'SuatDienID')),
    () =>
      kiemTraBang(
        v.quyTacGia,
        'quyTacGia',
        (d) => truongSo(d, 'QuyTacGiaID', 'KhuVucID') ?? truongThoiGianTuyChon(d, 'NgayTao', 'NgayCapNhat'),
      ),
    () =>
      kiemTraMang(
        v.ghe,
        'ghe',
        (d) => truongSo(d, 'GheID', 'KhuVucID') ?? truongChuoi(d, 'TrangThai') ?? truongThoiGianTuyChon(d, 'NgayCapNhatTrangThai'),
      ),
    () =>
      kiemTraMang(v.giuCho, 'giuCho', (d) => {
        const loi = truongSo(d, 'SuKienID', 'SuatDienID') ?? truongChuoi(d, 'TrangThai') ?? truongThoiGianTuyChon(d, 'HetHanLuc');
        if (loi !== null) return loi;
        if (d.chiTiet === undefined) return null;
        if (!Array.isArray(d.chiTiet)) return 'chiTiet';
        for (let i = 0; i < d.chiTiet.length; i += 1) {
          const ct = d.chiTiet[i];
          if (!laBanGhi(ct) || !laSo(ct.KhuVucID)) return `chiTiet[${i}]`;
        }
        return null;
      }),
    () =>
      kiemTraMang(
        v.deXuatGia,
        'deXuatGia',
        (d) => truongSo(d, 'DeXuatID', 'KhuVucID') ?? truongChuoi(d, 'TrangThaiDuyet') ?? truongThoiGianTuyChon(d, 'ThoiGianDeXuat'),
      ),
    () => kiemTraMang(v.nhatKyDinhGia, 'nhatKyDinhGia', (d) => truongSo(d, 'NhatKyDinhGiaID')),
    // Dữ liệu v1 không có hai bảng sau: THIẾU thì hợp lệ (được nâng cấp khi nạp), CÓ thì phải đúng dạng.
    () =>
      v.nhatKyGia === undefined
        ? null
        : kiemTraMang(v.nhatKyGia, 'nhatKyGia', (d) => {
            const loi = truongSo(d, 'NhatKyGiaID', 'KhuVucID', 'GiaCu', 'GiaMoi', 'TyLeThayDoiPhanTram');
            if (loi !== null) return loi;
            if (d.DeXuatID !== null && !laSo(d.DeXuatID)) return 'DeXuatID';
            if (d.LoaiBienDong !== 'DUYET_DE_XUAT_AI' && d.LoaiBienDong !== 'DIEU_CHINH_THU_CONG') {
              return 'LoaiBienDong';
            }
            return (
              truongChuoi(d, 'LyDoThayDoi', 'NguoiThucHienID') ??
              truongThoiGianBatBuoc(d, 'ThoiGianApDung') ??
              (d.nhan === NHAN_MO_PHONG_CORE ? null : 'nhan')
            );
          }),
    () =>
      v.thanhVienToChuc === undefined
        ? null
        : kiemTraMang(v.thanhVienToChuc, 'thanhVienToChuc', (d) => {
            if (!laBanGhi(d)) return '';
            if (!laSo(d.ToChucID) && !laChuoi(d.ToChucID)) return 'ToChucID';
            return truongChuoi(d, 'NguoiDungID', 'VaiTro');
          }),
    () =>
      kiemTraMang(
        v.moPhongGhe,
        'moPhongGhe',
        (d) => truongSo(d, 'GheID', 'SuKienID', 'SuatDienID') ?? truongThoiGianTuyChon(d, 'ThoiDiemGiaLap', 'NgayCapNhatTruoc', 'NgayTao'),
      ),
    () => {
      if (!laBanGhi(v.seq)) return 'seq';
      for (const k of ['quyTacGia', 'deXuatGia', 'nhatKyDinhGia']) if (!laSo(v.seq[k])) return `seq.${k}`;
      if (v.seq.nhatKyGia !== undefined && !laSo(v.seq.nhatKyGia)) return 'seq.nhatKyGia';
      return null;
    },
  ];
  for (const k of kiem) {
    const loi = k();
    if (loi !== null) return loi;
  }
  return null;
}

// ---------------------------------------------------------------- nâng cấp dữ liệu mock v1

export const CANH_BAO_NANG_CAP_V1 =
  'Đã nâng cấp dữ liệu mô phỏng v1 (thêm nhật ký giá và thành viên tổ chức); dữ liệu cũ được giữ nguyên.';

export const CANH_BAO_KHOI_PHUC_SEQ =
  'Đã khôi phục bộ đếm ID (seq) mô phỏng khớp với dữ liệu hiện có để tránh trùng lặp.';

function maxId(rows, field) {
  return rows.reduce((m, r) => (laSo(r?.[field]) && r[field] > m ? r[field] : m), 0);
}

/**
 * Nâng cấp trạng thái v1 (đã qua kiemTraTrangThaiMoPhong) và bảo đảm 4 bộ đếm seq không nhỏ hơn
 * ID lớn nhất đang có. Không sửa đầu vào. Trả {state, daNangCap, canhBao?}.
 */
export function nangCapTrangThaiV1(v) {
  const thieuTruongV2 =
    v.nhatKyGia === undefined || v.thanhVienToChuc === undefined || v.seq.nhatKyGia === undefined;
  const nhatKyGia = v.nhatKyGia ?? [];
  const thanhVienToChuc = v.thanhVienToChuc ?? [];
  const seqMoi = {
    ...v.seq,
    quyTacGia: Math.max(v.seq.quyTacGia ?? 0, maxId(Object.values(v.quyTacGia ?? {}), 'QuyTacGiaID')),
    deXuatGia: Math.max(v.seq.deXuatGia ?? 0, maxId(v.deXuatGia ?? [], 'DeXuatID')),
    nhatKyDinhGia: Math.max(v.seq.nhatKyDinhGia ?? 0, maxId(v.nhatKyDinhGia ?? [], 'NhatKyDinhGiaID')),
    nhatKyGia: Math.max(v.seq.nhatKyGia ?? 0, maxId(nhatKyGia, 'NhatKyGiaID')),
  };
  const daNangSeq =
    seqMoi.quyTacGia !== v.seq.quyTacGia ||
    seqMoi.deXuatGia !== v.seq.deXuatGia ||
    seqMoi.nhatKyDinhGia !== v.seq.nhatKyDinhGia ||
    (v.seq.nhatKyGia !== undefined && seqMoi.nhatKyGia !== v.seq.nhatKyGia);

  if (!thieuTruongV2 && !daNangSeq) {
    return {state: v, daNangCap: false};
  }
  const next = {
    ...v,
    nhatKyGia,
    thanhVienToChuc,
    seq: seqMoi,
  };
  if (thieuTruongV2) {
    return {state: next, daNangCap: true};
  }
  return {state: next, daNangCap: true, canhBao: CANH_BAO_KHOI_PHUC_SEQ};
}

// ---------------------------------------------------------------- kho phiên mock

/**
 * @param {{
 *   khoa: string,
 *   taoState: (seed: unknown) => any,
 *   layKhoMacDinh: () => ({getItem(k: string): string|null, setItem(k: string, v: string): void} | null),
 * }} cfg
 */
export function taoKhoPhienMock(cfg) {
  let boNhoTam = null;
  // Sau khi setItem lỗi: mọi lần mở phiên sau đó dùng bộ nhớ, không đọc localStorage cũ, không tạo seed mới.
  let uuTienBoNho = false;

  const metaBoNho = (canhBao) => ({luuTru: 'BO_NHO', duLieuHong: false, canhBao});

  function moPhien(opts) {
    const now = opts.now;
    if (uuTienBoNho && boNhoTam !== null) {
      return {
        state: boNhoTam,
        storage: null,
        meta: metaBoNho('Lần ghi localStorage trước đó đã lỗi; trạng thái mô phỏng chỉ giữ trong bộ nhớ tạm.'),
        now,
      };
    }
    const storage = opts.storage === undefined ? cfg.layKhoMacDinh() : opts.storage;

    const boNho = (canhBao) => {
      boNhoTam ??= cfg.taoState(opts.seed);
      return {state: boNhoTam, storage: null, meta: metaBoNho(canhBao), now};
    };

    if (!storage) return boNho('localStorage không khả dụng; trạng thái mô phỏng chỉ giữ trong bộ nhớ tạm.');

    let raw;
    try {
      raw = storage.getItem(cfg.khoa);
    } catch (e) {
      return boNho(`Không đọc được localStorage (${thongBao(e)}); dùng bộ nhớ tạm.`);
    }

    const sach = {luuTru: 'LOCAL_STORAGE', duLieuHong: false, canhBao: null};
    if (raw === null) return {state: cfg.taoState(opts.seed), storage, meta: sach, now};

    let loiHong;
    try {
      const parsed = JSON.parse(raw);
      const truong = kiemTraTrangThaiMoPhong(parsed);
      if (truong === null) {
        const {state, daNangCap, canhBao} = (cfg.chuanHoa ?? nangCapTrangThaiV1)(parsed);
        const meta = daNangCap ? {...sach, canhBao: canhBao ?? CANH_BAO_NANG_CAP_V1} : sach;
        return {state, storage, meta, now};
      }
      loiHong = `trường sai: ${truong}`;
    } catch (e) {
      loiHong = `không phải JSON hợp lệ (${thongBao(e)})`;
    }
    return {
      state: cfg.taoState(opts.seed),
      storage,
      meta: {
        luuTru: 'LOCAL_STORAGE',
        duLieuHong: true,
        canhBao: `Dữ liệu mô phỏng đã lưu bị hỏng (${loiHong}); đã đặt lại về trạng thái ban đầu.`,
      },
      now,
    };
  }

  function luuPhien(phien, state) {
    phien.state = state;
    if (!phien.storage) {
      boNhoTam = state;
      return;
    }
    try {
      phien.storage.setItem(cfg.khoa, JSON.stringify(state));
    } catch (e) {
      boNhoTam = state;
      uuTienBoNho = true;
      phien.meta = {
        ...phien.meta,
        luuTru: 'BO_NHO',
        canhBao: `Không ghi được localStorage (${thongBao(e)}); trạng thái chỉ giữ trong bộ nhớ tạm.`,
      };
    }
  }

  function datLai() {
    boNhoTam = null;
    uuTienBoNho = false;
  }

  return {moPhien, luuPhien, datLai};
}

function thongBao(e) {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------- phiên bản quy tắc quanh lần đọc metrics

/**
 * So hai lần đọc QUY_TAC_GIA ([{QuyTacGiaID, NgayCapNhat}]). Trả Map id → NgayCapNhat chỉ cho các id
 * có mặt ở CẢ HAI lần đọc với cùng NgayCapNhat; id thiếu hoặc khác thì không có trong Map.
 */
export function quyTacOnDinh(truoc, sau) {
  const mapTruoc = new Map(truoc.map((r) => [r.QuyTacGiaID, r.NgayCapNhat]));
  const ketQua = new Map();
  for (const r of sau) {
    const t = mapTruoc.get(r.QuyTacGiaID);
    if (t !== undefined && t === r.NgayCapNhat) ketQua.set(r.QuyTacGiaID, r.NgayCapNhat);
  }
  return ketQua;
}

const thongBaoLoi = thongBao;

/**
 * Chạy định giá một sự kiện (nhánh thật). `io`:
 *   hetHan(suKienId) → {deXuatHetHan, soLuong}
 *   docQuyTac(suKienId) → [{QuyTacGiaID, NgayCapNhat}] (QUY_TAC_GIA của các khu vực thuộc sự kiện)
 *   soLieu(suKienId) → rows đã thu hẹp (khu_vuc_id, suat_dien_id, quy_tac_gia_id, dang_mo_ban, ...)
 *   tinh(row) → kết quả engine (có thể ném)
 *   luuDeXuat(row, engine, ngayCapNhat) → {ketQua:'DA_LUU'|'BI_CHAN', ...}
 *
 * Thứ tự: het_han → đọc quy tắc (trước) → metrics → đọc quy tắc (sau) → dang_mo_ban → engine → luu_de_xuat_gia.
 * Khu có quy tắc đổi giữa hai lần đọc (hoặc thiếu ở một lần) → BO_QUA / QUY_TAC_THAY_DOI_TRONG_LUC_TINH;
 * thử lại cả lượt đọc một lần trước khi BO_QUA. Chỉ gửi NgayCapNhat đã xác nhận ổn định quanh metrics.
 */
export async function chayDinhGiaNgayLogic(io, suKienId) {
  const hetHan = await io.hetHan(suKienId);

  let rows = [];
  let onDinh = new Map();
  for (let lan = 0; lan < 2; lan += 1) {
    const truoc = await io.docQuyTac(suKienId);
    rows = await io.soLieu(suKienId);
    const sau = await io.docQuyTac(suKienId);
    onDinh = quyTacOnDinh(truoc, sau);
    const khongOnDinh = rows.some(
      (r) => r.dang_mo_ban && r.quy_tac_gia_id !== null && !onDinh.has(r.quy_tac_gia_id),
    );
    if (!khongOnDinh) break;
  }

  const theoKhu = [];
  for (const row of rows) {
    const base = {khuVucId: row.khu_vuc_id, suatDienId: row.suat_dien_id};
    try {
      if (!row.dang_mo_ban) {
        theoKhu.push({...base, ketQua: 'BO_QUA', lyDoBoQua: ['SUAT_DIEN_KHONG_MO_BAN']});
        continue;
      }
      const engine = io.tinh(row);
      if (!engine.shouldPropose) {
        theoKhu.push({...base, ketQua: 'BO_QUA', lyDoBoQua: engine.skipReasons});
        continue;
      }
      const quyTacId = row.quy_tac_gia_id;
      if (quyTacId === null) {
        theoKhu.push({...base, ketQua: 'LOI', loi: 'Không tìm thấy quy tắc giá của khu vực.'});
        continue;
      }
      const ngay = onDinh.get(quyTacId);
      if (ngay === undefined) {
        theoKhu.push({...base, ketQua: 'BO_QUA', lyDoBoQua: [LY_DO_QUY_TAC_THAY_DOI]});
        continue;
      }
      if (engine.proposedPrice === null || engine.intermediate.rawPrice === null) {
        theoKhu.push({...base, ketQua: 'LOI', loi: 'Engine không trả về giá đề xuất.'});
        continue;
      }
      const saved = await io.luuDeXuat(row, engine, ngay);
      if (saved.ketQua === 'DA_LUU') {
        theoKhu.push({
          ...base,
          ketQua: 'DA_LUU',
          deXuatId: saved.deXuatId,
          giaDeXuat: saved.giaDeXuat,
          giaHienTai: saved.giaHienTai,
          loaiCanhBao: saved.loaiCanhBao,
          deXuatHetHan: saved.deXuatHetHan,
        });
      } else {
        theoKhu.push({
          ...base,
          ketQua: 'BI_CHAN',
          maChan: saved.maChan,
          nhatKyId: saved.nhatKyId,
          deXuatHetHan: saved.deXuatHetHan,
        });
      }
    } catch (e) {
      theoKhu.push({...base, ketQua: 'LOI', loi: thongBaoLoi(e)});
    }
  }

  return {hetHan: {deXuatHetHan: hetHan.deXuatHetHan, soLuong: hetHan.soLuong}, theoKhu};
}

// ---------------------------------------------------------------- chuẩn hóa lỗi, đọc kết quả T1 và danh sách đề xuất

const laChuoiKhongRong = (v) => typeof v === 'string' && v.trim() !== '';
const laSoHoacNull = (v) => v === null || laSo(v);
const laSoHoacNullTuyChon = (v) => v === undefined || v === null || laSo(v);
const laThoiGianHopLe = (v) => laChuoiKhongRong(v) && Number.isFinite(Date.parse(v));

export class PricingServiceError extends Error {
  constructor(message, code = null, opts = {}) {
    super(message);
    this.name = 'PricingServiceError';
    this.code = code ?? null;
    this.status = opts?.status ?? null;
    this.ma = opts?.ma ?? null;
    this.chiTiet = opts?.chiTiet ?? null;
  }
}

export function phanHoiKhongHopLe(rpc) {
  return new PricingServiceError(`Phản hồi RPC ${rpc} không đúng hợp đồng.`, 'PHAN_HOI_KHONG_HOP_LE', {
    status: 502,
    ma: 'PHAN_HOI_KHONG_HOP_LE',
  });
}

function parseKhungGiaChiTiet(details) {
  let parsed = details;
  if (typeof details === 'string') {
    if (details.trim() === '') return null;
    try {
      parsed = JSON.parse(details);
    } catch {
      return null;
    }
  }
  if (!laBanGhi(parsed) || !laSo(parsed.giaSan) || !laSo(parsed.giaTran)) return null;
  return {giaSan: parsed.giaSan, giaTran: parsed.giaTran};
}

/**
 * Chuẩn hóa lỗi RPC T1 / mạng thành PricingServiceError:
 *   42501 → status 403, ma 'KHONG_CO_QUYEN'
 *   40001 → status 409, ma = message (DE_XUAT_DA_XU_LY kèm chiTiet.trangThai)
 *   22023 → status 422, ma = message (NGOAI_KHUNG_GIA kèm chiTiet {giaSan, giaTran})
 *   Khác / lỗi mạng → giữ code, status null
 */
export function chuanHoaLoiRpc(error) {
  if (error instanceof PricingServiceError) return error;
  const coTruong = laBanGhi(error) || error instanceof Error;
  const code = coTruong && typeof error.code === 'string' && error.code !== '' ? error.code : null;
  const rawMsg = coTruong && typeof error.message === 'string' ? error.message.trim() : '';
  const message = rawMsg !== '' ? rawMsg : thongBao(error);
  const details = laBanGhi(error) ? error.details : undefined;

  if (code === '42501') {
    return new PricingServiceError(message || 'Không có quyền thực hiện thao tác định giá.', code, {
      status: 403,
      ma: 'KHONG_CO_QUYEN',
      chiTiet: null,
    });
  }
  if (code === '40001') {
    const ma = rawMsg !== '' ? rawMsg : 'XUNG_DOT';
    const chiTiet =
      ma === 'DE_XUAT_DA_XU_LY' && typeof details === 'string' && details.trim() !== ''
        ? {trangThai: details.trim()}
        : null;
    return new PricingServiceError(message, code, {status: 409, ma, chiTiet});
  }
  if (code === '22023') {
    const ma = rawMsg !== '' ? rawMsg : 'DU_LIEU_KHONG_HOP_LE';
    const chiTiet = ma === 'NGOAI_KHUNG_GIA' ? parseKhungGiaChiTiet(details) : null;
    return new PricingServiceError(message, code, {status: 422, ma, chiTiet});
  }
  return new PricingServiceError(message, code, {status: null, ma: null, chiTiet: null});
}

function docKetQuaHetHan(v) {
  if (!laBanGhi(v) || v.ketQua !== 'HET_HAN' || v.ma !== 'DE_XUAT_HET_HAN') return null;
  if (!laSo(v.deXuatId) || !laSo(v.khuVucId) || !laSo(v.suKienId)) return null;
  if (!laThoiGianHopLe(v.thoiGianDeXuat) || !laThoiGianHopLe(v.hetHanLuc)) return null;
  return {
    ok: false,
    ketQua: 'HET_HAN',
    ma: 'DE_XUAT_HET_HAN',
    deXuatId: v.deXuatId,
    khuVucId: v.khuVucId,
    suKienId: v.suKienId,
    thoiGianDeXuat: v.thoiGianDeXuat,
    hetHanLuc: v.hetHanLuc,
  };
}

export function docKetQuaDuyet(v) {
  if (!laBanGhi(v)) return null;
  if (v.ketQua === 'HET_HAN') return docKetQuaHetHan(v);
  if (v.ketQua !== 'DA_DUYET') return null;
  if (
    !laSo(v.deXuatId) ||
    !laSo(v.khuVucId) ||
    !laSo(v.suKienId) ||
    !laSo(v.giaCu) ||
    !laSo(v.giaMoi) ||
    !laSo(v.tyLeThayDoiPhanTram) ||
    (v.loaiBienDong !== 'DUYET_DE_XUAT_AI' && v.loaiBienDong !== 'DIEU_CHINH_THU_CONG') ||
    !laSo(v.nhatKyGiaId) ||
    !laChuoiKhongRong(v.nguoiDuyetId) ||
    !laThoiGianHopLe(v.thoiGianDuyet)
  ) {
    return null;
  }
  return {
    ok: true,
    ketQua: 'DA_DUYET',
    deXuatId: v.deXuatId,
    khuVucId: v.khuVucId,
    suKienId: v.suKienId,
    giaCu: v.giaCu,
    giaMoi: v.giaMoi,
    tyLeThayDoiPhanTram: v.tyLeThayDoiPhanTram,
    loaiBienDong: v.loaiBienDong,
    nhatKyGiaId: v.nhatKyGiaId,
    nguoiDuyetId: v.nguoiDuyetId,
    thoiGianDuyet: v.thoiGianDuyet,
  };
}

export function docKetQuaTuChoi(v) {
  if (!laBanGhi(v)) return null;
  if (v.ketQua === 'HET_HAN') return docKetQuaHetHan(v);
  if (v.ketQua !== 'DA_TU_CHOI') return null;
  if (
    !laSo(v.deXuatId) ||
    !laSo(v.khuVucId) ||
    !laSo(v.suKienId) ||
    !laSoHoacNull(v.giaHienHanh) ||
    !laChuoiKhongRong(v.nguoiDuyetId) ||
    !laThoiGianHopLe(v.thoiGianDuyet) ||
    (v.lyDo !== null && !laChuoi(v.lyDo))
  ) {
    return null;
  }
  return {
    ok: true,
    ketQua: 'DA_TU_CHOI',
    deXuatId: v.deXuatId,
    khuVucId: v.khuVucId,
    suKienId: v.suKienId,
    giaHienHanh: v.giaHienHanh,
    nguoiDuyetId: v.nguoiDuyetId,
    thoiGianDuyet: v.thoiGianDuyet,
    lyDo: v.lyDo,
  };
}

/**
 * Ghép số liệu theo khu và danh sách DE_XUAT_GIA thành cấu trúc hiển thị thống nhất giữa nhánh thật và mock.
 * Đề xuất có KhuVucID không thuộc rowsSoLieu bị loại bỏ. Đúng mốc hetHanLuc vẫn conHieuLuc = true.
 */
export function ghepDanhSachDeXuat(rowsSoLieu, rowsDeXuat, now = Date.now()) {
  const nowMs = toMs(now);
  const khuMap = new Map();
  const khuVuc = [];

  for (const row of rowsSoLieu ?? []) {
    const r = fillRate(row.n_total, row.n_sold, row.n_hold);
    const u =
      laSo(row.v_actual) && row.v_actual >= 0 && laSo(row.v_target) && row.v_target > 0
        ? row.v_actual / row.v_target
        : null;
    const tRem = laSo(row.t_rem_gio) ? row.t_rem_gio : null;
    const quyTac =
      row.co_quy_tac === true && laSo(row.quy_tac_gia_id)
        ? {
            quyTacGiaId: row.quy_tac_gia_id,
            kichHoat: row.kich_hoat === true,
            giaGoc: row.gia_goc ?? null,
            giaSan: row.gia_san ?? null,
            giaTran: row.gia_tran ?? null,
            buocNhayGia: row.buoc_nhay ?? null,
            bienDoToiDa: row.bien_do ?? null,
            nguongLapDayThap: row.nguong_thap ?? null,
            nguongLapDayCao: row.nguong_cao ?? null,
            trongSoLapDay: row.trong_so_lap_day ?? null,
            trongSoTocDoBan: row.trong_so_toc_do ?? null,
            trongSoThoiGian: row.trong_so_thoi_gian ?? null,
          }
        : null;

    const item = {
      khuVucId: row.khu_vuc_id,
      suatDienId: row.suat_dien_id,
      maKhuVuc: row.ma_khu_vuc ?? null,
      tenKhuVuc: row.ten_khu_vuc ?? null,
      giaHienHanh: row.gia_hien_hanh ?? null,
      dangMoBan: row.dang_mo_ban === true,
      quyTac,
      r,
      u,
      tRem,
      deXuat: [],
    };
    khuMap.set(row.khu_vuc_id, item);
    khuVuc.push(item);
  }

  for (const dx of rowsDeXuat ?? []) {
    const khu = khuMap.get(dx?.KhuVucID);
    if (!khu) continue;
    const han = hetHanLuc(dx.ThoiGianDeXuat);
    const conHieuLuc = dx.TrangThaiDuyet === 'PENDING' && han !== null && Date.parse(han) >= nowMs;
    khu.deXuat.push({
      deXuatId: dx.DeXuatID,
      trangThai: dx.TrangThaiDuyet,
      giaHienTai: dx.GiaHienTai ?? null,
      giaDeXuat: dx.GiaDeXuat,
      giaTinhToanTho: dx.GiaTinhToanTho ?? null,
      tyLeLapDay: dx.TyLeLapDay ?? null,
      tocDoThucTe: dx.TocDoBanThucTe ?? null,
      tocDoKyVong: dx.TocDoBanKyVong ?? null,
      soGioConLai: dx.SoGioConLai ?? null,
      loaiCanhBao: dx.LoaiCanhBao ?? null,
      coCanhBaoVuotKhung: dx.CoCanhBaoVuotKhung === true,
      lyDo: dx.LyDoDeXuat ?? null,
      thoiGianDeXuat: dx.ThoiGianDeXuat,
      hetHanLuc: han,
      conHieuLuc,
    });
  }

  for (const k of khuVuc) {
    k.deXuat.sort((a, b) => a.deXuatId - b.deXuatId);
  }
  return khuVuc;
}

const COT_DE_XUAT_GIA =
  'DeXuatID,KhuVucID,QuyTacGiaID,TrangThaiDuyet,GiaHienTai,GiaDeXuat,GiaTinhToanTho,TyLeLapDay,TocDoBanThucTe,TocDoBanKyVong,SoGioConLai,LoaiCanhBao,CoCanhBaoVuotKhung,LyDoDeXuat,ThoiGianDeXuat,GhiChuDuyet,NguoiDuyetID,ThoiGianDuyet';

function laDeXuatRowHopLe(dx) {
  return (
    laBanGhi(dx) &&
    laSo(dx.DeXuatID) &&
    laSo(dx.KhuVucID) &&
    laChuoiKhongRong(dx.TrangThaiDuyet) &&
    laSo(dx.GiaDeXuat) &&
    laThoiGianHopLe(dx.ThoiGianDeXuat) &&
    laSoHoacNullTuyChon(dx.GiaHienTai) &&
    laSoHoacNullTuyChon(dx.GiaTinhToanTho) &&
    laSoHoacNullTuyChon(dx.TyLeLapDay) &&
    laSoHoacNullTuyChon(dx.TocDoBanThucTe) &&
    laSoHoacNullTuyChon(dx.TocDoBanKyVong) &&
    laSoHoacNullTuyChon(dx.SoGioConLai) &&
    (dx.CoCanhBaoVuotKhung === undefined || dx.CoCanhBaoVuotKhung === null || typeof dx.CoCanhBaoVuotKhung === 'boolean') &&
    (dx.LoaiCanhBao === undefined || dx.LoaiCanhBao === null || laChuoi(dx.LoaiCanhBao)) &&
    (dx.LyDoDeXuat === undefined || dx.LyDoDeXuat === null || laChuoi(dx.LyDoDeXuat))
  );
}

const COT_SO_LIEU_CHUOI_NULL = ['ma_khu_vuc', 'ten_khu_vuc', 'trang_thai_suat'];
const COT_SO_LIEU_SO_NULL = [
  'gia_hien_hanh',
  'quy_tac_gia_id',
  'gia_goc',
  'gia_san',
  'gia_tran',
  'buoc_nhay',
  'bien_do',
  'nguong_thap',
  'nguong_cao',
  'trong_so_lap_day',
  'trong_so_toc_do',
  'trong_so_thoi_gian',
  'n_total',
  'n_sold',
  'n_hold',
  'v_actual',
  'v_target',
  't_rem_gio',
];
const COT_SO_LIEU_BOOL_NULL = ['dang_mo_ban', 'co_quy_tac', 'kich_hoat'];

/** Mọi trường dùng để hiển thị phải CÓ MẶT (không undefined) và đúng kiểu; null chỉ hợp lệ ở các cột cho phép null. */
function laSoLieuRowHopLe(raw) {
  if (!laBanGhi(raw) || !laSo(raw.khu_vuc_id) || !laSo(raw.suat_dien_id) || !laSo(raw.su_kien_id)) return false;
  for (const k of COT_SO_LIEU_CHUOI_NULL) {
    if (raw[k] !== null && !laChuoi(raw[k])) return false;
  }
  for (const k of COT_SO_LIEU_SO_NULL) {
    if (!laSoHoacNull(raw[k])) return false;
  }
  for (const k of COT_SO_LIEU_BOOL_NULL) {
    if (raw[k] !== null && typeof raw[k] !== 'boolean') return false;
  }
  return raw.thoi_diem_tinh === null || laThoiGianHopLe(raw.thoi_diem_tinh);
}

/** Đọc chỉ-đọc nhánh thật: lay_so_lieu_dinh_gia rồi SELECT DE_XUAT_GIA theo các KhuVucID hợp lệ của sự kiện. */
export async function docDanhSachDeXuatThat(client, suKienId, now) {
  let resSoLieu;
  try {
    resSoLieu = await client.rpc('lay_so_lieu_dinh_gia', {p_su_kien_id: suKienId});
  } catch (e) {
    throw chuanHoaLoiRpc(e);
  }
  if (resSoLieu?.error) throw chuanHoaLoiRpc(resSoLieu.error);
  const rawSoLieu = resSoLieu?.data;
  if (!Array.isArray(rawSoLieu)) throw phanHoiKhongHopLe('lay_so_lieu_dinh_gia');

  const soLieu = [];
  for (const raw of rawSoLieu) {
    if (!laSoLieuRowHopLe(raw)) throw phanHoiKhongHopLe('lay_so_lieu_dinh_gia');
    if (raw.su_kien_id === suKienId) soLieu.push(raw);
  }

  const khuIds = soLieu.map((r) => r.khu_vuc_id);
  if (khuIds.length === 0) return {suKienId, khuVuc: []};

  let resDeXuat;
  try {
    resDeXuat = await client.from('DE_XUAT_GIA').select(COT_DE_XUAT_GIA).in('KhuVucID', khuIds);
  } catch (e) {
    throw chuanHoaLoiRpc(e);
  }
  if (resDeXuat?.error) throw chuanHoaLoiRpc(resDeXuat.error);
  const rawDeXuat = resDeXuat?.data;
  if (!Array.isArray(rawDeXuat)) throw phanHoiKhongHopLe('DE_XUAT_GIA');
  for (const dx of rawDeXuat) {
    if (!laDeXuatRowHopLe(dx)) throw phanHoiKhongHopLe('DE_XUAT_GIA');
  }

  const mocThoiGian =
    now !== undefined && now !== null
      ? now
      : laChuoiKhongRong(soLieu[0]?.thoi_diem_tinh) && Number.isFinite(Date.parse(soLieu[0].thoi_diem_tinh))
        ? soLieu[0].thoi_diem_tinh
        : Date.now();

  return {suKienId, khuVuc: ghepDanhSachDeXuat(soLieu, rawDeXuat, mocThoiGian)};
}

export async function duyetDeXuatGiaThat(client, deXuatId, params = {}) {
  const args = {
    p_de_xuat_id: deXuatId,
    p_ghi_chu: params?.ghiChu ?? '',
  };
  if (params?.giaDieuChinh !== undefined && params?.giaDieuChinh !== null) {
    if (typeof params.giaDieuChinh === 'number' && !Number.isFinite(params.giaDieuChinh)) {
      throw new PricingServiceError('GIA_DUYET_KHONG_HOP_LE', '22023', {
        status: 422,
        ma: 'GIA_DUYET_KHONG_HOP_LE',
      });
    }
    args.p_gia_dieu_chinh = params.giaDieuChinh;
  }
  let res;
  try {
    res = await client.rpc('duyet_de_xuat_gia', args);
  } catch (e) {
    throw chuanHoaLoiRpc(e);
  }
  if (res?.error) throw chuanHoaLoiRpc(res.error);
  const parsed = docKetQuaDuyet(res?.data);
  if (!parsed) throw phanHoiKhongHopLe('duyet_de_xuat_gia');
  return parsed;
}

export async function tuChoiDeXuatGiaThat(client, deXuatId, params = {}) {
  let res;
  try {
    res = await client.rpc('tu_choi_de_xuat_gia', {
      p_de_xuat_id: deXuatId,
      p_ly_do: params?.lyDo ?? '',
    });
  } catch (e) {
    throw chuanHoaLoiRpc(e);
  }
  if (res?.error) throw chuanHoaLoiRpc(res.error);
  const parsed = docKetQuaTuChoi(res?.data);
  if (!parsed) throw phanHoiKhongHopLe('tu_choi_de_xuat_gia');
  return parsed;
}
