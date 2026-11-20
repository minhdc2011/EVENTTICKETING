/**
 * Lõi thuần của src/services/pricingService.ts (không import Supabase/runtimeConfig) để node --test import được.
 *   - kiemTraTrangThaiMoPhong: kiểm tra NỘI DUNG trạng thái mock đã lưu theo các trường T6 đọc.
 *   - taoKhoPhienMock: nạp/lưu trạng thái mock, có cờ ưu tiên bộ nhớ sau khi setItem lỗi.
 *   - docQuyTacOnDinh / chayDinhGiaNgayLogic: chạy định giá thật, bảo đảm NgayCapNhat gửi PriceGuard
 *     thuộc đúng phiên bản quy tắc đã dùng để tính (đọc trước + sau metrics).
 */

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
    () =>
      kiemTraMang(
        v.moPhongGhe,
        'moPhongGhe',
        (d) => truongSo(d, 'GheID', 'SuKienID', 'SuatDienID') ?? truongThoiGianTuyChon(d, 'ThoiDiemGiaLap', 'NgayCapNhatTruoc', 'NgayTao'),
      ),
    () => {
      if (!laBanGhi(v.seq)) return 'seq';
      for (const k of ['quyTacGia', 'deXuatGia', 'nhatKyDinhGia']) if (!laSo(v.seq[k])) return `seq.${k}`;
      return null;
    },
  ];
  for (const k of kiem) {
    const loi = k();
    if (loi !== null) return loi;
  }
  return null;
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
      if (truong === null) return {state: parsed, storage, meta: sach, now};
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
