/**
 * Bộ dữ liệu DEMO định giá dùng chung (mock) cho workspace BTC, kho pricing và trang khán giả.
 *
 * Mô-đun thuần: không localStorage, mạng hay đồng hồ ngầm; mọi hàm sinh dữ liệu nhận `now`
 * (epoch ms, ISO hoặc Date). Một bộ định danh cố định duy nhất:
 *   sự kiện DEMO_SU_KIEN_ID → suất DEMO_SUAT_ID → khu DEMO_KHU_IDS → ghế khu*1000+n.
 * Giá khán giả = GiaVeNiemYet trong state pricing; chỉ duyetDeXuatGia (mockPricing.js) đổi giá này.
 * Mọi tên mang tiền tố [MÔ PHỎNG] và mọi bản ghi demo có cờ moPhong:true.
 */
import { TIEN_TO_MO_PHONG, createMockState, toMs } from './mockPricing.js';

export const DEMO_SU_KIEN_ID = 990001;
export const DEMO_SUAT_ID = 990101;
export const DEMO_KHU_IDS = Object.freeze([990201, 990202, 990203]);
export const DEMO_SLUG = 'demo-dinh-gia-mo-phong';
export const DEMO_SUAT_SLUG = 'suat-demo';
export const DEMO_TO_CHUC_ID = 'mock-org-1';
export const DEMO_NGUOI_DUNG = Object.freeze({ id: 'mock-user', loaiTaiKhoan: 'ORGANIZER' });
export const DEMO_TEN_SU_KIEN = `${TIEN_TO_MO_PHONG} Đêm nhạc demo định giá động`;

const MS_GIO = 3600000;
const SO_GHE_MOI_KHU = 20;

// Số ghế đã bán và số ghế bán trong 6h gần nhất cho từng khu (ghế còn lại là TRONG).
// Khu 1: bán nhanh, khu 2: lấp đầy khá + tốc độ vừa, khu 3: bán chậm. Engine quyết định hướng giá.
const KHU_DEMO = Object.freeze([
  { id: 990201, ma: 'DEMO_VIP', ten: `${TIEN_TO_MO_PHONG} Khu VIP`, mau: '#d8ff3e', gia: 1500000, daBan: 16, trong6h: 16 },
  { id: 990202, ma: 'DEMO_STANDARD', ten: `${TIEN_TO_MO_PHONG} Khu Tiêu chuẩn`, mau: '#6ea8ff', gia: 800000, daBan: 14, trong6h: 1 },
  { id: 990203, ma: 'DEMO_ECONOMY', ten: `${TIEN_TO_MO_PHONG} Khu Phổ thông`, mau: '#4ade80', gia: 520000, daBan: 4, trong6h: 0 },
]);

const iso = (ms) => new Date(ms).toISOString();

/** true nếu id (số hoặc chuỗi số) hoặc slug thuộc sự kiện demo. */
export function laSuKienDemo(idOrSlug) {
  if (idOrSlug === DEMO_SLUG) return true;
  if (typeof idOrSlug === 'number') return idOrSlug === DEMO_SU_KIEN_ID;
  if (typeof idOrSlug === 'string' && idOrSlug.trim() !== '') return Number(idOrSlug) === DEMO_SU_KIEN_ID;
  return false;
}

const laKhuDemo = (id) => DEMO_KHU_IDS.includes(Number(id));

/** Mốc thời gian của sự kiện demo, tương đối theo now: mở bán now-48h, đóng bán now+7 ngày, bắt đầu = đóng + 2h. */
function moc(now) {
  const nowMs = toMs(now);
  const dong = nowMs + 7 * 24 * MS_GIO;
  return { nowMs, mo: nowMs - 48 * MS_GIO, dong, batDau: dong + 2 * MS_GIO, ketThuc: dong + 5 * MS_GIO };
}

/**
 * Phần state pricing của demo: suKien, suatDien, khuVuc, ghe, quyTacGia, thanhVienToChuc.
 * quyTacGia dùng QuyTacGiaID tạm 1..3; khoiTaoDemoPricing cấp lại ID không trùng.
 */
export function taoSeedDemo(now) {
  const { nowMs, mo, dong, batDau } = moc(now);
  const khuVuc = {};
  const quyTacGia = {};
  const ghe = [];
  KHU_DEMO.forEach((k, idx) => {
    khuVuc[k.id] = {
      SuKienID: DEMO_SU_KIEN_ID,
      SuatDienID: DEMO_SUAT_ID,
      GiaVeNiemYet: k.gia,
      TongSoGhe: SO_GHE_MOI_KHU,
      TenKhuVuc: k.ten,
      MaKhuVuc: k.ma,
      MauSacHex: k.mau,
      moPhong: true,
    };
    quyTacGia[k.id] = {
      QuyTacGiaID: idx + 1,
      KhuVucID: k.id,
      GiaGoc: k.gia,
      GiaSan: Math.round(k.gia * 0.7),
      GiaTran: Math.round(k.gia * 1.5),
      BuocNhayGia: 10000,
      BienDoToiDaMoiChuKy: 0.2,
      NguongLapDayThap: 0.3,
      NguongLapDayCao: 0.6,
      TrongSoLapDay: 1,
      TrongSoTocDoBan: 1,
      TrongSoThoiGian: 1,
      TrangThaiKichHoat: true,
      NgayTao: iso(nowMs),
      NgayCapNhat: iso(nowMs),
      moPhong: true,
    };
    for (let n = 1; n <= SO_GHE_MOI_KHU; n += 1) {
      let trangThai = 'TRONG';
      let capNhat = null;
      if (n <= k.daBan) {
        trangThai = 'DA_BAN';
        // trong6h ghế đầu bán trong 6h gần nhất; phần còn lại bán sớm hơn nhưng sau lúc mở bán.
        capNhat = iso(n <= k.trong6h ? nowMs - 1 * MS_GIO : nowMs - 24 * MS_GIO);
      }
      ghe.push({ GheID: k.id * 1000 + n, KhuVucID: k.id, TrangThai: trangThai, NgayCapNhatTrangThai: capNhat });
    }
  });
  return {
    suKien: {
      [DEMO_SU_KIEN_ID]: {
        TrangThaiCongBo: 'CONG_KHAI',
        moPhong: true,
        ToChucID: DEMO_TO_CHUC_ID,
        TenSuKien: DEMO_TEN_SU_KIEN,
        Slug: DEMO_SLUG,
      },
    },
    suatDien: {
      [DEMO_SUAT_ID]: {
        SuKienID: DEMO_SU_KIEN_ID,
        TrangThai: 'DANG_MO_BAN',
        ThoiGianMoBanVe: iso(mo),
        ThoiGianDongBanVe: iso(dong),
        ThoiGianBatDau: iso(batDau),
        moPhong: true,
      },
    },
    khuVuc,
    ghe,
    quyTacGia,
    thanhVienToChuc: [{ ToChucID: DEMO_TO_CHUC_ID, NguoiDungID: DEMO_NGUOI_DUNG.id, VaiTro: 'CHU_SO_HUU' }],
  };
}

/**
 * Gỡ mọi dòng thuộc định danh demo khỏi state rồi chèn seed mới. Không mutate đầu vào; dữ liệu khác giữ nguyên.
 * Lặp lại cho kết quả tương đương (không nhân đôi). seq luôn ≥ max id (qua createMockState).
 */
export function khoiTaoDemoPricing(state, now) {
  const seed = taoSeedDemo(now);
  const s = structuredClone(state ?? {});
  const bo = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !laSuKienDemo(Number(k))));
  const boKhu = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !laKhuDemo(k)));
  const giuNgoaiDemo = (rows, truong) => (rows ?? []).filter((r) => !laKhuDemo(r?.[truong]));
  const quyTacConLai = boKhu(s.quyTacGia);
  const maxQuyTac = Math.max(0, ...Object.values(quyTacConLai).map((r) => Number(r?.QuyTacGiaID) || 0));
  const base = createMockState({
    ...s,
    // Hạ bộ đếm về max ID còn lại để khởi tạo lặp cho kết quả y hệt (ID demo cũ đã bị gỡ cùng dòng).
    seq: { ...(s.seq ?? {}), quyTacGia: maxQuyTac },
    suKien: { ...bo(s.suKien), ...seed.suKien },
    suatDien: { ...Object.fromEntries(Object.entries(s.suatDien ?? {}).filter(([k]) => Number(k) !== DEMO_SUAT_ID)), ...seed.suatDien },
    khuVuc: { ...boKhu(s.khuVuc), ...seed.khuVuc },
    ghe: [...giuNgoaiDemo(s.ghe, 'KhuVucID'), ...seed.ghe],
    giuCho: (s.giuCho ?? []).filter((g) => g?.SuKienID !== DEMO_SU_KIEN_ID),
    quyTacGia: quyTacConLai,
    deXuatGia: giuNgoaiDemo(s.deXuatGia, 'KhuVucID'),
    nhatKyDinhGia: (s.nhatKyDinhGia ?? []).filter((r) => r?.SuKienID !== DEMO_SU_KIEN_ID && !laKhuDemo(r?.KhuVucID)),
    moPhongGhe: (s.moPhongGhe ?? []).filter((r) => r?.SuKienID !== DEMO_SU_KIEN_ID),
    nhatKyGia: giuNgoaiDemo(s.nhatKyGia, 'KhuVucID'),
    thanhVienToChuc: [
      ...(s.thanhVienToChuc ?? []).filter(
        (m) => !(m?.ToChucID === DEMO_TO_CHUC_ID && m.NguoiDungID === DEMO_NGUOI_DUNG.id),
      ),
      ...seed.thanhVienToChuc,
    ],
  });
  // Cấp lại QuyTacGiaID sau seq hiện có để không trùng quy tắc của sự kiện khác.
  for (const k of DEMO_KHU_IDS) {
    base.seq.quyTacGia += 1;
    base.quyTacGia[k] = { ...seed.quyTacGia[k], QuyTacGiaID: base.seq.quyTacGia };
  }
  return base;
}

/** Bản ghi cho 'eventticketing:mock-organizer-events', id/show/tier khớp pricing. Giá lấy từ seed (giá niêm yết gốc). */
export function taoSuKienWorkspaceDemo(now) {
  const { mo, dong, batDau, ketThuc } = moc(now);
  const seed = taoSeedDemo(now);
  const tiers = KHU_DEMO.map((k) => ({
    tierId: k.id,
    code: k.ma,
    name: k.ten,
    type: 'GHE_NGOI',
    price: seed.khuVuc[k.id].GiaVeNiemYet,
    capacity: SO_GHE_MOI_KHU,
    color: k.mau,
    benefits: `${TIEN_TO_MO_PHONG} Dữ liệu mô phỏng định giá, không phải vé thật.`,
    minPerOrder: 1,
    maxPerOrder: 4,
  }));
  return {
    id: DEMO_SU_KIEN_ID,
    organizationId: DEMO_TO_CHUC_ID,
    name: DEMO_TEN_SU_KIEN,
    slug: DEMO_SLUG,
    status: 'CONG_KHAI',
    category: 'AM_NHAC',
    description: `${TIEN_TO_MO_PHONG} Sự kiện mẫu để thử định giá động giữa Ban tổ chức và khán giả.`,
    locationMode: 'OFFLINE',
    venueName: `${TIEN_TO_MO_PHONG} Nhà hát demo`,
    address: `${TIEN_TO_MO_PHONG} Địa điểm mô phỏng`,
    startsAt: iso(batDau),
    endsAt: iso(ketThuc),
    saleStartsAt: iso(mo),
    saleEndsAt: iso(dong),
    capacity: SO_GHE_MOI_KHU * KHU_DEMO.length,
    price: Math.min(...tiers.map((t) => t.price)),
    showCount: 1,
    moPhong: true,
    createdAt: iso(mo),
    updatedAt: iso(mo),
    shows: [
      {
        showId: DEMO_SUAT_ID,
        slug: DEMO_SUAT_SLUG,
        name: `${TIEN_TO_MO_PHONG} Suất demo`,
        startsAt: iso(batDau),
        endsAt: iso(ketThuc),
        saleStartsAt: iso(mo),
        saleEndsAt: iso(dong),
        ticketTiers: tiers,
      },
    ],
  };
}

/** Thay dòng demo (theo id) trong danh sách workspace, giữ nguyên các dòng khác. Dòng demo đứng đầu. */
export function ghepSuKienWorkspaceDemo(rows, now) {
  const khac = (Array.isArray(rows) ? rows : []).filter((r) => !laSuKienDemo(r?.id));
  return [taoSuKienWorkspaceDemo(now), ...khac];
}

/** Map khuId → GiaVeNiemYet hiện tại trong state (khu demo có mặt trong state). */
export function docGiaDemo(state) {
  const gia = new Map();
  for (const k of DEMO_KHU_IDS) {
    const kv = state?.khuVuc?.[k];
    if (kv && Number.isFinite(kv.GiaVeNiemYet)) gia.set(k, kv.GiaVeNiemYet);
  }
  return gia;
}

const khuDemoTheoId = new Map(KHU_DEMO.map((k) => [k.id, k]));

/** Catalog ghế cho sơ đồ khán giả; ID khớp state.ghe/khuVuc, giá lấy từ state. */
export function taoCatalogDemo(state) {
  const gia = docGiaDemo(state);
  const zones = [];
  for (const [khuId, giaKhu] of gia) {
    const kv = state.khuVuc[khuId];
    zones.push({
      KhuVucID: khuId,
      MaKhuVuc: kv.MaKhuVuc,
      TenKhuVuc: kv.TenKhuVuc,
      GiaVeNiemYet: giaKhu,
      MauSacHex: kv.MauSacHex ?? khuDemoTheoId.get(khuId)?.mau,
      LoaiKhuVuc: 'GHE_NGOI',
      TongSoGhe: kv.TongSoGhe,
    });
  }
  const seats = [];
  for (const g of state?.ghe ?? []) {
    if (!gia.has(g.KhuVucID)) continue;
    const kv = state.khuVuc[g.KhuVucID];
    const n = g.GheID - g.KhuVucID * 1000;
    seats.push({
      GheID: g.GheID,
      KhuVucID: g.KhuVucID,
      TenKhuVuc: kv.TenKhuVuc,
      SoHang: 'A',
      SoGhe: String(n),
      MaGheDayDu: `${kv.MaKhuVuc}-A${n}`,
      TrangThai: g.TrangThai,
      GiaVeNiemYet: gia.get(g.KhuVucID),
    });
  }
  return { zones, seats };
}

/** PublicTicketTier[] cho bảng giá khán giả: id = khuId, price từ state, available = ghế TRONG. */
export function taoTiersDemo(state) {
  const gia = docGiaDemo(state);
  return [...gia].map(([khuId, giaKhu]) => {
    const kv = state.khuVuc[khuId];
    return {
      id: khuId,
      code: kv.MaKhuVuc,
      name: kv.TenKhuVuc,
      price: giaKhu,
      color: kv.MauSacHex ?? khuDemoTheoId.get(khuId)?.mau ?? '#84CC16',
      description: `${TIEN_TO_MO_PHONG} Giá mô phỏng, đổi khi Ban tổ chức duyệt đề xuất.`,
      capacity: kv.TongSoGhe,
      available: (state.ghe ?? []).filter((g) => g.KhuVucID === khuId && g.TrangThai === 'TRONG').length,
    };
  });
}
