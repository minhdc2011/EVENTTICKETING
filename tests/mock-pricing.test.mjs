import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NHAN_MO_PHONG,
  TIEN_TO_MO_PHONG,
  TRANG_THAI_SUAT_BI_LOAI,
  createMockState,
  dangMoBan,
  deXuatTuDong,
  duyetDeXuatGia,
  hetHanDeXuatGia,
  hetHanLuc,
  layDeXuatGia,
  laySoLieuDinhGia,
  luuDeXuatGia,
  luuQuyTacGia,
  moPhongNhuCau,
  toMs,
  tuChoiDeXuatGia,
} from '../src/domain/mockPricing.js';
import {
  CANH_BAO_KHOI_PHUC_SEQ,
  CANH_BAO_NANG_CAP_V1,
  kiemTraTrangThaiMoPhong,
  nangCapTrangThaiV1,
  taoKhoPhienMock,
} from '../src/domain/pricingServiceCore.js';

// Mọi thời điểm là hằng số cố định; không dùng đồng hồ thật.
const NOW = '2026-11-20T10:00:00.000Z';
const at = (minutes, base = NOW) => new Date(Date.parse(base) + minutes * 60000).toISOString();

const MO = at(-600); // mở bán 10 giờ trước NOW
const DONG = at(3000);
const BAT_DAU = at(3600);

const suat = (over = {}) => ({
  SuKienID: 1,
  TrangThai: 'DANG_MO_BAN',
  ThoiGianMoBanVe: MO,
  ThoiGianDongBanVe: DONG,
  ThoiGianBatDau: BAT_DAU,
  ...over,
});
const congKhai = { TrangThaiCongBo: 'CONG_KHAI', moPhong: true };

/** Hai sự kiện độc lập: sự kiện 1 (suất 11, khu 101) và sự kiện 2 (suất 21, khu 201). */
function build(mutate) {
  const seed = {
    suKien: { 1: { ...congKhai }, 2: { ...congKhai } },
    suatDien: { 11: suat(), 21: suat({ SuKienID: 2 }) },
    khuVuc: {
      101: { SuKienID: 1, SuatDienID: 11, GiaVeNiemYet: 1500000, TongSoGhe: 100 },
      201: { SuKienID: 2, SuatDienID: 21, GiaVeNiemYet: 1500000, TongSoGhe: 100 },
    },
  };
  if (mutate) mutate(seed);
  return createMockState(seed);
}

const RULE = {
  giaGoc: 1500000,
  giaSan: 1200000,
  giaTran: 2000000,
  buocNhayGia: 10000,
  bienDoToiDa: 0.2,
  nguongLapDayThap: 0.3,
  nguongLapDayCao: 0.6,
  trongSoLapDay: 1,
  trongSoTocDoBan: 1,
  trongSoThoiGian: 1,
  trangThaiKichHoat: true,
};

const saveRule = (state, kv = 101, over = {}, now = NOW) => luuQuyTacGia(state, kv, { ...RULE, ...over }, now);
const withRule = (state, kv = 101, over = {}, now = NOW) => saveRule(state, kv, over, now).state;

function withDeXuat(state, rows) {
  const next = structuredClone(state);
  for (const r of rows) {
    next.deXuatGia.push({
      QuyTacGiaID: next.quyTacGia[r.KhuVucID ?? 101]?.QuyTacGiaID ?? null,
      KhuVucID: 101,
      TrangThaiDuyet: 'PENDING',
      GhiChuDuyet: null,
      NguoiDuyetID: null,
      ThoiGianDuyet: null,
      ThoiGianDeXuat: at(-5),
      LyDoDeXuat: '[MÔ PHỎNG] seed',
      ...r,
    });
  }
  next.seq.deXuatGia = Math.max(next.seq.deXuatGia, ...next.deXuatGia.map((d) => d.DeXuatID));
  return next;
}

function proposalInput(state, over = {}, kv = 101) {
  const qt = state.quyTacGia[kv];
  return {
    khuVucId: kv,
    quyTacGiaId: qt?.QuyTacGiaID,
    quyTacNgayCapNhat: qt?.NgayCapNhat,
    giaDeXuat: 1600000,
    giaTinhToanTho: 1612345.67,
    lyDo: 'Tăng theo nhu cầu',
    ...over,
  };
}

const snapshot = (v) => structuredClone(v);

describe('dangMoBan', () => {
  const sk = { TrangThaiCongBo: 'CONG_KHAI' };

  it('SAP_MO_BAN trong cửa sổ bán vẫn là mở bán', () => {
    assert.equal(dangMoBan(sk, suat({ TrangThai: 'SAP_MO_BAN' }), NOW), true);
  });

  it('DANG_MO_BAN nhưng chưa tới giờ mở thì đóng; đúng giờ mở thì mở', () => {
    assert.equal(dangMoBan(sk, suat({ ThoiGianMoBanVe: at(1) }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ ThoiGianMoBanVe: NOW }), NOW), true);
    assert.equal(dangMoBan(sk, suat({ ThoiGianMoBanVe: NOW }), Date.parse(NOW) - 1), false, 'trước giờ mở 1 ms');
  });

  it('đúng giờ đóng là đã đóng, trước đó 1 ms còn mở', () => {
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: NOW }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: NOW }), Date.parse(NOW) - 1), true);
  });

  it('giờ đóng NULL là bán không kỳ hạn', () => {
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: null }), NOW), true);
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: undefined }), NOW), true);
  });

  it('các trạng thái suất bị loại đều đóng, kể cả khi trong cửa sổ bán', () => {
    assert.deepEqual([...TRANG_THAI_SUAT_BI_LOAI], ['BAN_NHAP', 'HUY', 'DONG_BAN', 'DA_DIEN_RA', 'HET_VE']);
    for (const trangThai of TRANG_THAI_SUAT_BI_LOAI) {
      assert.equal(dangMoBan(sk, suat({ TrangThai: trangThai }), NOW), false, trangThai);
    }
    assert.equal(dangMoBan(sk, suat({ TrangThai: null }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ TrangThai: undefined }), NOW), false);
  });

  it('sự kiện chưa công bố thì đóng; không đọc TrangThaiMoBan legacy', () => {
    assert.equal(dangMoBan({ TrangThaiCongBo: 'BAN_NHAP' }, suat(), NOW), false);
    assert.equal(dangMoBan({}, suat(), NOW), false);
    assert.equal(dangMoBan({ TrangThaiCongBo: 'BAN_NHAP', TrangThaiMoBan: 'DANG_MO_BAN' }, suat(), NOW), false);
    assert.equal(dangMoBan({ TrangThaiCongBo: 'CONG_KHAI', TrangThaiMoBan: 'DONG_BAN' }, suat(), NOW), true);
  });

  it('thời gian thiếu hoặc không hợp lệ thì đóng', () => {
    assert.equal(dangMoBan(sk, suat({ ThoiGianMoBanVe: null }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ ThoiGianMoBanVe: 'khong-phai-ngay' }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ ThoiGianMoBanVe: 'infinity' }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: 'khong-phai-ngay' }), NOW), false);
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: MO }), NOW), false, 'đóng = mở');
    assert.equal(dangMoBan(sk, suat({ ThoiGianDongBanVe: at(-700) }), NOW), false, 'đóng < mở');
    assert.equal(dangMoBan(null, suat(), NOW), false);
    assert.equal(dangMoBan(sk, undefined, NOW), false);
  });

  it('now là bắt buộc: không bao giờ dùng đồng hồ ngầm', () => {
    assert.throws(() => dangMoBan(sk, suat()), TypeError);
    assert.throws(() => dangMoBan(sk, suat(), 'khong-phai-ngay'), TypeError);
    assert.throws(() => toMs(null), TypeError);
    assert.equal(toMs(NOW), Date.parse(NOW));
    assert.equal(toMs(Date.parse(NOW)), Date.parse(NOW));
  });
});

describe('laySoLieuDinhGia', () => {
  it('dang_mo_ban dùng đúng hàm dangMoBan, kể cả SAP_MO_BAN và sau giờ đóng', () => {
    const sap = build((s) => (s.suatDien[11].TrangThai = 'SAP_MO_BAN'));
    assert.equal(laySoLieuDinhGia(sap, 1, NOW)[0].dang_mo_ban, true);
    assert.equal(laySoLieuDinhGia(sap, 1, DONG)[0].dang_mo_ban, false);
    const nhap = build((s) => (s.suKien[1].TrangThaiCongBo = 'BAN_NHAP'));
    assert.equal(laySoLieuDinhGia(nhap, 1, NOW)[0].dang_mo_ban, false);
  });

  it('n_sold, n_hold, so_ban_6h, v_actual và thời gian đúng công thức T2 §5', () => {
    const state = build((s) => {
      s.ghe = [
        { GheID: 1, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: at(-360) }, // đúng mốc 6h: tính
        { GheID: 2, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: at(-361) }, // ngoài cửa sổ
        { GheID: 3, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: NOW }, // đúng now: tính
        { GheID: 4, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: at(1) }, // tương lai: không tính
        { GheID: 5, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: null }, // NULL: không bịa
        { GheID: 6, KhuVucID: 101, TrangThai: 'TRONG', NgayCapNhatTrangThai: at(-10) },
        { GheID: 7, KhuVucID: 201, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: at(-10) }, // sự kiện khác
      ];
      s.giuCho = [
        { GiuChoID: 1, SuKienID: 1, SuatDienID: 11, TrangThai: 'ACTIVE', HetHanLuc: at(5), chiTiet: [{ KhuVucID: 101, GheID: null, SoLuong: 3 }] },
        { GiuChoID: 2, SuKienID: 1, SuatDienID: 11, TrangThai: 'ACTIVE', HetHanLuc: NOW, chiTiet: [{ KhuVucID: 101, GheID: 6, SoLuong: 1 }] },
        { GiuChoID: 3, SuKienID: 1, SuatDienID: 11, TrangThai: 'EXPIRED', HetHanLuc: at(5), chiTiet: [{ KhuVucID: 101, GheID: null, SoLuong: 2 }] },
        { GiuChoID: 4, SuKienID: 2, SuatDienID: 21, TrangThai: 'ACTIVE', HetHanLuc: at(5), chiTiet: [{ KhuVucID: 201, GheID: null, SoLuong: 9 }] },
      ];
    });
    const rows = laySoLieuDinhGia(state, 1, NOW);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.khu_vuc_id, 101);
    assert.equal(r.n_total, 100);
    assert.equal(r.n_sold, 5);
    assert.equal(r.n_hold, 3, 'chỉ ACTIVE và HetHanLuc > now');
    assert.equal(r.so_ban_6h, 2);
    assert.equal(r.v_actual, 2 / 6);
    assert.equal(r.t_rem_gio, 60);
    assert.equal(r.tong_gio_mo_ban, 10 + 50, 'đóng bán 3000 phút sau now, mở 600 phút trước');
    assert.equal(r.v_target, 100 / 60);
    assert.equal(r.co_pending, false);
    assert.equal(r.mo_phong, true);
    assert.equal(r.nhan, NHAN_MO_PHONG);
    assert.equal(r.thoi_diem_tinh, NOW);
  });

  it('dữ liệu thời gian không hợp lệ thì chỉ số thời gian là null, không bao giờ 0', () => {
    const state = build((s) => {
      s.suatDien[11].ThoiGianBatDau = null;
      s.suatDien[11].ThoiGianDongBanVe = null;
    });
    const r = laySoLieuDinhGia(state, 1, NOW)[0];
    assert.equal(r.t_rem_gio, null);
    assert.equal(r.tong_gio_mo_ban, null);
    assert.equal(r.v_target, null);
    const dongVoCuc = build((s) => (s.suatDien[11].ThoiGianDongBanVe = 'infinity'));
    const r2 = laySoLieuDinhGia(dongVoCuc, 1, NOW)[0];
    assert.equal(r2.tong_gio_mo_ban, null, 'Dong không hợp lệ thì không quay về BatDau');
    assert.equal(r2.dang_mo_ban, false);
  });

  it('t_rem_gio không âm khi suất đã bắt đầu', () => {
    const r = laySoLieuDinhGia(build(), 1, at(4000))[0];
    assert.equal(r.t_rem_gio, 0);
  });

  it('chỉ trả khu vực của đúng sự kiện; suất sai sự kiện bị loại; có cờ mô phỏng và co_pending', () => {
    const state = build((s) => {
      s.suKien[2].moPhong = false;
      s.khuVuc[301] = { SuKienID: 1, SuatDienID: 21, GiaVeNiemYet: 1, TongSoGhe: 1 }; // suất thuộc sự kiện 2: liên kết sai
    });
    const withPending = withDeXuat(withRule(state, 201), [{ DeXuatID: 1, KhuVucID: 201, GiaDeXuat: 1600000 }]);
    const r1 = laySoLieuDinhGia(withPending, 1, NOW);
    const r2 = laySoLieuDinhGia(withPending, 2, NOW);
    assert.deepEqual(r1.map((r) => r.khu_vuc_id), [101]);
    assert.deepEqual(r2.map((r) => r.khu_vuc_id), [201]);
    assert.equal(r1[0].co_pending, false);
    assert.equal(r2[0].co_pending, true);
    assert.equal(r2[0].de_xuat_pending_id, 1);
    assert.equal(r1[0].mo_phong, true);
    assert.equal(r2[0].mo_phong, false);
  });
});

describe('luuQuyTacGia', () => {
  it('lần đầu là TAO_QUY_TAC, lần sau CAP_NHAT_QUY_TAC với DuLieuTruoc là dòng cũ', () => {
    const s0 = build();
    const before = snapshot(s0);
    const a = saveRule(s0);
    assert.deepEqual(s0, before, 'không sửa state đầu vào');
    assert.equal(a.result.ok, true);
    assert.equal(a.result.taoMoi, true);
    assert.equal(a.result.nhan, NHAN_MO_PHONG);
    assert.deepEqual(a.result.canhBao, []);
    assert.deepEqual(a.result.deXuatHetHieuLuc, []);
    assert.equal(a.state.nhatKyDinhGia.length, 1);
    const tao = a.state.nhatKyDinhGia[0];
    assert.equal(tao.LoaiHanhDong, 'TAO_QUY_TAC');
    assert.equal(tao.NhatKyDinhGiaID, a.result.nhatKyId);
    assert.equal(tao.KhuVucID, 101);
    assert.equal(tao.SuKienID, 1);
    assert.equal(tao.SuatDienID, 11);
    assert.equal(tao.DuLieuTruoc, null);
    assert.equal(tao.DuLieuSau.GiaSan, 1200000);

    const b = saveRule(a.state, 101, { giaSan: 1300000 }, at(10));
    assert.equal(b.result.taoMoi, false);
    assert.equal(b.result.quyTacGiaId, a.result.quyTacGiaId);
    assert.equal(b.state.nhatKyDinhGia.length, 2);
    const capNhat = b.state.nhatKyDinhGia[1];
    assert.equal(capNhat.LoaiHanhDong, 'CAP_NHAT_QUY_TAC');
    assert.equal(capNhat.DuLieuTruoc.GiaSan, 1200000);
    assert.equal(capNhat.DuLieuSau.GiaSan, 1300000);
    assert.equal(b.state.quyTacGia[101].NgayTao, NOW);
    assert.equal(b.state.quyTacGia[101].NgayCapNhat, at(10));
    assert.notEqual(b.state, a.state);
  });

  it('giá trị được làm tròn theo scale cột trước khi lưu', () => {
    const { state } = saveRule(build(), 101, { giaSan: 1200000.004, bienDoToiDa: 0.20004 });
    assert.equal(state.quyTacGia[101].GiaSan, 1200000);
    assert.equal(state.quyTacGia[101].BienDoToiDaMoiChuKy, 0.2);
  });

  it('thu hẹp khung: PENDING ngoài khung chuyển EXPIRED dù chưa đủ TTL; trong khung và bằng sàn/trần được giữ', () => {
    let state = withRule(build(), 101, { giaSan: 1000000, giaTran: 2000000 });
    state = withDeXuat(state, [
      // gieo trực tiếp nhiều PENDING để kiểm thứ tự/biên; chỉ mục unique một PENDING nằm ở DB và ở luuDeXuatGia
      { DeXuatID: 1, GiaDeXuat: 1100000 }, // dưới sàn mới → hết hiệu lực
      { DeXuatID: 2, GiaDeXuat: 1200000 }, // bằng sàn mới → giữ
      { DeXuatID: 3, GiaDeXuat: 1800000 }, // bằng trần mới → giữ
      { DeXuatID: 4, GiaDeXuat: 1900000 }, // trên trần mới → hết hiệu lực
      { DeXuatID: 5, GiaDeXuat: 1500000, ThoiGianDeXuat: at(-500) }, // trong khung, quá TTL: saveRule không đụng
      { DeXuatID: 6, GiaDeXuat: 1100000, TrangThaiDuyet: 'APPROVED', GhiChuDuyet: 'ok', NguoiDuyetID: 'u-1', ThoiGianDuyet: at(-3) },
      { DeXuatID: 7, GiaDeXuat: 1100000, TrangThaiDuyet: 'REJECTED', GhiChuDuyet: 'sai', NguoiDuyetID: 'u-1', ThoiGianDuyet: at(-3) },
      { DeXuatID: 8, GiaDeXuat: 1100000, TrangThaiDuyet: 'EXPIRED', GhiChuDuyet: 'HET_HAN_TTL_120_PHUT' },
    ]);
    const truocKhac = snapshot(state.deXuatGia.filter((d) => [6, 7, 8].includes(d.DeXuatID)));
    const soNhatKyTruoc = state.nhatKyDinhGia.length;

    const { state: sau, result } = saveRule(state, 101, { giaSan: 1200000, giaTran: 1800000 }, at(1));
    assert.deepEqual(result.deXuatHetHieuLuc, [1, 4]);

    const byId = Object.fromEntries(sau.deXuatGia.map((d) => [d.DeXuatID, d]));
    for (const id of [1, 4]) {
      assert.equal(byId[id].TrangThaiDuyet, 'EXPIRED', `đề xuất ${id}`);
      assert.equal(byId[id].GhiChuDuyet, 'CAU_HINH_THU_HEP_KHUNG');
      assert.equal(byId[id].NguoiDuyetID, null);
      assert.equal(byId[id].ThoiGianDuyet, null);
    }
    for (const id of [2, 3, 5]) assert.equal(byId[id].TrangThaiDuyet, 'PENDING', `đề xuất ${id}`);
    assert.deepEqual(sau.deXuatGia.filter((d) => [6, 7, 8].includes(d.DeXuatID)), truocKhac, 'trạng thái khác giữ nguyên');

    const audit = sau.nhatKyDinhGia.slice(soNhatKyTruoc);
    assert.deepEqual(audit.map((a) => a.LoaiHanhDong), [
      'CAP_NHAT_QUY_TAC',
      'HET_HIEU_LUC_DO_DOI_KHUNG',
      'HET_HIEU_LUC_DO_DOI_KHUNG',
    ]);
    assert.deepEqual(audit.slice(1).map((a) => a.DeXuatID), [1, 4], 'tăng dần theo DeXuatID');
    const [, a1, a4] = audit;
    assert.equal(a1.KhuVucID, 101);
    assert.deepEqual(a1.DuLieuTruoc, {
      trangThaiDuyet: 'PENDING',
      giaDeXuat: 1100000,
      khungGia: { giaSan: 1000000, giaTran: 2000000 },
    });
    assert.deepEqual(a1.DuLieuSau, {
      trangThaiDuyet: 'EXPIRED',
      ghiChuDuyet: 'CAU_HINH_THU_HEP_KHUNG',
      giaDeXuat: 1100000,
      khungGia: { giaSan: 1200000, giaTran: 1800000 },
    });
    assert.ok(a1.LyDo.startsWith('CAU_HINH_THU_HEP_KHUNG'));
    assert.ok(a1.LyDo.includes('1200000.00') && a1.LyDo.includes('1800000.00'));
    assert.equal(a4.DuLieuTruoc.giaDeXuat, 1900000);
    assert.equal(a4.DuLieuSau.khungGia.giaTran, 1800000);
    assert.equal(sau.nhatKyDinhGia.filter((a) => a.LoaiHanhDong === 'APPROVED').length, 0);
  });

  it('giá niêm yết ngoài khung chỉ sinh cảnh báo, không bị đổi', () => {
    const { state, result } = saveRule(build(), 101, { giaGoc: 1700000, giaSan: 1600000, giaTran: 2000000 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.canhBao, [
      { ma: 'GIA_HIEN_HANH_NGOAI_KHUNG', giaHienHanh: 1500000, giaSan: 1600000, giaTran: 2000000 },
    ]);
    assert.equal(state.khuVuc[101].GiaVeNiemYet, 1500000);
    const trongKhung = saveRule(build());
    assert.deepEqual(trongKhung.result.canhBao, []);
    assert.equal(trongKhung.state.khuVuc[101].GiaVeNiemYet, 1500000);
  });

  it('thu hẹp không đổi giá niêm yết và chỉ đụng khu vực của mình', () => {
    let state = withRule(withRule(build(), 101), 201);
    state = withDeXuat(state, [
      { DeXuatID: 1, KhuVucID: 101, GiaDeXuat: 1250000 },
      { DeXuatID: 2, KhuVucID: 201, GiaDeXuat: 1250000 },
    ]);
    const { state: sau, result } = saveRule(state, 101, { giaGoc: 1500000, giaSan: 1400000 }, at(1));
    assert.deepEqual(result.deXuatHetHieuLuc, [1]);
    assert.equal(sau.deXuatGia.find((d) => d.DeXuatID === 2).TrangThaiDuyet, 'PENDING');
    assert.deepEqual(sau.khuVuc, state.khuVuc);
    assert.deepEqual(sau.quyTacGia[201], state.quyTacGia[201]);
  });

  const KHONG_HOP_LE = [
    ['giá gốc NULL', { giaGoc: null }, 'p_gia_goc'],
    ['giá sàn NaN', { giaSan: Number.NaN }, 'p_gia_san'],
    ['giá trần vô cực', { giaTran: Infinity }, 'p_gia_tran'],
    ['bước nhảy chuỗi rác', { buocNhayGia: 'abc' }, 'p_buoc_nhay_gia'],
    ['giá sàn = 0', { giaSan: 0 }, 'p_gia_san'],
    ['giá gốc < sàn', { giaGoc: 1100000 }, 'p_gia_goc'],
    ['giá trần < gốc', { giaTran: 1400000 }, 'p_gia_tran'],
    ['bước nhảy = 0', { buocNhayGia: 0 }, 'p_buoc_nhay_gia'],
    ['biên độ = 0', { bienDoToiDa: 0 }, 'p_bien_do_toi_da'],
    ['biên độ > 1', { bienDoToiDa: 1.5 }, 'p_bien_do_toi_da'],
    ['ngưỡng thấp < 0', { nguongLapDayThap: -0.1 }, 'p_nguong_lap_day_thap'],
    ['ngưỡng cao > 1', { nguongLapDayCao: 1.1 }, 'p_nguong_lap_day_cao'],
    ['ngưỡng thấp >= cao', { nguongLapDayThap: 0.6 }, 'p_nguong_lap_day_thap'],
    ['trọng số lấp đầy < 0', { trongSoLapDay: -1 }, 'p_trong_so_lap_day'],
    ['trọng số tốc độ < 0', { trongSoTocDoBan: -1 }, 'p_trong_so_toc_do_ban'],
    ['trọng số thời gian < 0', { trongSoThoiGian: -1 }, 'p_trong_so_thoi_gian'],
    ['cờ kích hoạt NULL', { trangThaiKichHoat: null }, 'p_trang_thai_kich_hoat'],
    ['vượt độ chính xác cột', { giaGoc: 1e10 }, 'p_gia_goc'],
    // thứ tự: kiểm từng trường (NULL/vô cực/độ chính xác) trước, rồi mới luật miền
    ['NULL ở tham số sau thắng luật miền ở tham số trước', { giaSan: 0, trongSoThoiGian: null }, 'p_trong_so_thoi_gian'],
    ['luật miền đi theo thứ tự tham số', { giaSan: -5, buocNhayGia: 0 }, 'p_gia_san'],
  ];
  for (const [ten, over, truong] of KHONG_HOP_LE) {
    it(`cấu hình không hợp lệ (${ten}) trả đúng state cũ, không audit`, () => {
      let state = withRule(build(), 101, { giaSan: 1000000 });
      state = withDeXuat(state, [{ DeXuatID: 1, GiaDeXuat: 1100000 }]); // sẽ ngoài khung nếu thu hẹp được áp dụng
      const { state: sau, result } = saveRule(state, 101, { giaSan: 1300000, ...over }, at(1));
      assert.equal(result.ok, false);
      assert.equal(result.loi, 'QUY_TAC_GIA_KHONG_HOP_LE');
      assert.equal(result.truong, truong);
      assert.equal(sau, state, 'trả lại chính đối tượng state');
      assert.equal(sau.deXuatGia[0].TrangThaiDuyet, 'PENDING');
      assert.equal(sau.nhatKyDinhGia.length, 1);
    });
  }

  it('khu vực không tồn tại hoặc liên kết sai thì không ghi gì', () => {
    const state = build((s) => {
      s.khuVuc[301] = { SuKienID: 1, SuatDienID: 21, GiaVeNiemYet: 1, TongSoGhe: 1 };
    });
    for (const id of [999, 301]) {
      const { state: sau, result } = saveRule(state, id);
      assert.equal(result.ok, false);
      assert.equal(result.loi, 'KHU_VUC_KHONG_TON_TAI');
      assert.equal(sau, state);
    }
  });

  it('now là bắt buộc', () => {
    assert.throws(() => luuQuyTacGia(build(), 101, RULE), TypeError);
  });
});

describe('PriceGuard/TTL', () => {
  const ready = () => withRule(build());

  it('lưu thành công: một PENDING, tiền tố mô phỏng, không đổi giá niêm yết, không APPROVED', () => {
    const s0 = ready();
    const before = snapshot(s0);
    const { state, result } = luuDeXuatGia(s0, proposalInput(s0), NOW);
    assert.deepEqual(s0, before, 'không sửa state đầu vào');
    assert.equal(result.ketQua, 'DA_LUU');
    assert.equal(result.deXuatId, 1);
    assert.equal(result.khuVucId, 101);
    assert.equal(result.suKienId, 1);
    assert.equal(result.giaDeXuat, 1600000);
    assert.equal(result.giaHienTai, 1500000);
    assert.equal(result.loaiCanhBao, 'BINH_THUONG');
    assert.equal(result.moPhong, true);
    assert.equal(result.nhan, NHAN_MO_PHONG);
    assert.deepEqual(result.deXuatHetHan, []);
    assert.equal(state.deXuatGia.length, 1);
    const dx = state.deXuatGia[0];
    assert.equal(dx.TrangThaiDuyet, 'PENDING');
    assert.equal(dx.LyDoDeXuat, `${TIEN_TO_MO_PHONG} Tăng theo nhu cầu`);
    assert.equal(dx.ThoiGianDeXuat, NOW);
    assert.equal(dx.GiaTinhToanTho, 1612345.67);
    assert.equal(dx.TyLeLapDay, 0);
    assert.equal(dx.TocDoBanThucTe, 0);
    assert.equal(dx.TocDoBanKyVong, roundTo2(100 / 60));
    assert.equal(dx.SoGioConLai, 60);
    assert.equal(state.khuVuc[101].GiaVeNiemYet, 1500000);
    assert.equal(state.nhatKyDinhGia.length, 1, 'chỉ có dòng TAO_QUY_TAC');
  });

  it('tiền tố mô phỏng do client gửi được gỡ rồi gắn một lần; lý do rỗng vẫn có tiền tố', () => {
    const s0 = ready();
    const a = luuDeXuatGia(s0, proposalInput(s0, { lyDo: '  [mô phỏng] [MÔ PHỎNG]  Giá hợp lý ' }), NOW);
    assert.equal(a.state.deXuatGia[0].LyDoDeXuat, '[MÔ PHỎNG] Giá hợp lý');
    const b = luuDeXuatGia(s0, proposalInput(s0, { lyDo: null }), NOW);
    assert.equal(b.state.deXuatGia[0].LyDoDeXuat, TIEN_TO_MO_PHONG);
    const tat = withRule(build((s) => (s.suKien[1].moPhong = false)));
    const c = luuDeXuatGia(tat, proposalInput(tat), NOW);
    assert.equal(c.result.moPhong, false, 'cờ mô phỏng của sự kiện được phản ánh');
    assert.ok(c.state.deXuatGia[0].LyDoDeXuat.startsWith(TIEN_TO_MO_PHONG), 'mock luôn gắn tiền tố');
  });

  it('bị chặn là kết quả bình thường BI_CHAN kèm một dòng CHAN_DE_XUAT, không tạo đề xuất, không đổi giá', () => {
    const s0 = ready();
    const before = snapshot(s0);
    const { state, result } = luuDeXuatGia(s0, proposalInput(s0, { giaDeXuat: 2500000 }), NOW);
    assert.deepEqual(s0, before);
    assert.equal(result.ketQua, 'BI_CHAN');
    assert.equal(result.maChan, 'NGOAI_KHUNG_GIA');
    assert.equal(result.nhan, NHAN_MO_PHONG);
    assert.equal(state.deXuatGia.length, 0);
    assert.equal(state.khuVuc[101].GiaVeNiemYet, 1500000);
    assert.equal(state.nhatKyDinhGia.length, 2);
    const chan = state.nhatKyDinhGia[1];
    assert.equal(chan.NhatKyDinhGiaID, result.nhatKyId);
    assert.equal(chan.LoaiHanhDong, 'CHAN_DE_XUAT');
    assert.equal(chan.MaChan, 'NGOAI_KHUNG_GIA');
    assert.ok(chan.MaChan.trim() !== '');
    assert.equal(chan.GiaThu, 2500000);
    assert.equal(chan.GiaHienHanh, 1500000);
    assert.equal(chan.KhuVucID, 101);
    assert.equal(chan.SuKienID, 1);
    assert.equal(chan.ThamSo.moPhong, true);
    assert.equal(chan.ThamSo.dangMoBan, true);
  });

  const CHAN = [
    ['QUY_TAC_KHONG_TON_TAI', () => build(), (s) => proposalInput(s, { quyTacGiaId: 1, quyTacNgayCapNhat: NOW })],
    ['LIEN_KET_KHONG_HOP_LE', ready, (s) => proposalInput(s, { quyTacGiaId: 999 })],
    ['QUY_TAC_DA_THAY_DOI', ready, (s) => proposalInput(s, { quyTacNgayCapNhat: at(-1) })],
    ['QUY_TAC_TAT', () => withRule(build(), 101, { trangThaiKichHoat: false }), (s) => proposalInput(s)],
    ['SUAT_DIEN_KHONG_MO_BAN', () => withRule(build((s) => (s.suatDien[11].TrangThai = 'DONG_BAN'))), (s) => proposalInput(s)],
    ['GIA_KHONG_HOP_LE', ready, (s) => proposalInput(s, { giaDeXuat: null })],
    ['GIA_KHONG_HOP_LE', ready, (s) => proposalInput(s, { giaTinhToanTho: Number.NaN })],
    ['GIA_HIEN_HANH_KHONG_HOP_LE', () => withRule(build((s) => (s.khuVuc[101].GiaVeNiemYet = 0))), (s) => proposalInput(s)],
    ['NGOAI_KHUNG_GIA', ready, (s) => proposalInput(s, { giaDeXuat: 1100000 })],
    ['VUOT_BIEN_DO', () => withRule(build(), 101, { giaTran: 2500000 }), (s) => proposalInput(s, { giaDeXuat: 1900000 })],
    ['DUOI_BUOC_NHAY', ready, (s) => proposalInput(s, { giaDeXuat: 1505000 })],
    ['THIEU_DU_LIEU', () => withRule(build((s) => { s.suatDien[11].ThoiGianBatDau = null; s.suatDien[11].ThoiGianDongBanVe = null; })), (s) => proposalInput(s)],
  ];
  for (const [ma, makeState, makeInput] of CHAN) {
    it(`mã chặn ${ma}`, () => {
      const s0 = makeState();
      const { state, result } = luuDeXuatGia(s0, makeInput(s0), NOW);
      assert.equal(result.ketQua, 'BI_CHAN');
      assert.equal(result.maChan, ma);
      assert.equal(state.deXuatGia.length, 0);
      assert.equal(state.nhatKyDinhGia.at(-1).LoaiHanhDong, 'CHAN_DE_XUAT');
      assert.equal(state.nhatKyDinhGia.at(-1).MaChan, ma);
      assert.equal(state.khuVuc[101].GiaVeNiemYet, s0.khuVuc[101].GiaVeNiemYet);
    });
  }

  it('mã chặn đầu tiên theo thứ tự T3 thắng', () => {
    // quy tắc tắt + suất đóng + giá ngoài khung: QUY_TAC_TAT đứng trước
    const s0 = withRule(build((s) => (s.suatDien[11].TrangThai = 'HUY')), 101, { trangThaiKichHoat: false });
    const r = luuDeXuatGia(s0, proposalInput(s0, { giaDeXuat: 9999999 }), NOW).result;
    assert.equal(r.maChan, 'QUY_TAC_TAT');
    // suất đóng + giá ngoài khung: SUAT_DIEN_KHONG_MO_BAN đứng trước NGOAI_KHUNG_GIA
    const s1 = withRule(build((s) => (s.suatDien[11].TrangThai = 'HUY')));
    assert.equal(luuDeXuatGia(s1, proposalInput(s1, { giaDeXuat: 9999999 }), NOW).result.maChan, 'SUAT_DIEN_KHONG_MO_BAN');
  });

  it('suất đã đóng (trạng thái, hoặc quá giờ đóng, hoặc chưa mở) không sinh đề xuất; SAP_MO_BAN trong cửa sổ thì lưu được', () => {
    const closed = [
      withRule(build((s) => (s.suatDien[11].TrangThai = 'DONG_BAN'))),
      withRule(build((s) => (s.suatDien[11].ThoiGianDongBanVe = NOW))),
      withRule(build((s) => (s.suatDien[11].ThoiGianMoBanVe = at(1)))),
      withRule(build((s) => (s.suKien[1].TrangThaiCongBo = 'BAN_NHAP'))),
    ];
    for (const s0 of closed) {
      const { state, result } = luuDeXuatGia(s0, proposalInput(s0), NOW);
      assert.equal(result.maChan, 'SUAT_DIEN_KHONG_MO_BAN');
      assert.equal(state.deXuatGia.length, 0);
    }
    const sap = withRule(build((s) => (s.suatDien[11].TrangThai = 'SAP_MO_BAN')));
    assert.equal(luuDeXuatGia(sap, proposalInput(sap), NOW).result.ketQua, 'DA_LUU');
  });

  it('mỗi khu vực tối đa một PENDING: đề xuất thứ hai bị chặn DA_CO_PENDING', () => {
    const s0 = ready();
    const a = luuDeXuatGia(s0, proposalInput(s0), NOW);
    const b = luuDeXuatGia(a.state, proposalInput(a.state, { giaDeXuat: 1550000 }), at(1));
    assert.equal(b.result.ketQua, 'BI_CHAN');
    assert.equal(b.result.maChan, 'DA_CO_PENDING');
    assert.equal(b.state.deXuatGia.filter((d) => d.TrangThaiDuyet === 'PENDING').length, 1);
    assert.equal(b.state.nhatKyDinhGia.at(-1).ThamSo.deXuatPendingId, 1);
  });

  it('TTL nghiêm ngặt: đúng 120 phút còn PENDING (chặn), 121 phút hết hạn rồi lưu được đề xuất mới', () => {
    const s0 = ready();
    const a = luuDeXuatGia(s0, proposalInput(s0), NOW).state;

    const at120 = luuDeXuatGia(a, proposalInput(a, { giaDeXuat: 1550000 }), at(120));
    assert.equal(at120.result.maChan, 'DA_CO_PENDING');
    assert.deepEqual(at120.result.deXuatHetHan, []);
    assert.equal(at120.state.deXuatGia[0].TrangThaiDuyet, 'PENDING');

    const at121 = luuDeXuatGia(a, proposalInput(a, { giaDeXuat: 1550000 }), at(121));
    assert.equal(at121.result.ketQua, 'DA_LUU');
    assert.deepEqual(at121.result.deXuatHetHan, [1]);
    assert.equal(at121.state.deXuatGia[0].TrangThaiDuyet, 'EXPIRED');
    assert.equal(at121.state.deXuatGia[0].GhiChuDuyet, 'HET_HAN_TTL_120_PHUT');
    assert.equal(at121.state.deXuatGia[1].TrangThaiDuyet, 'PENDING');
    assert.equal(at121.state.deXuatGia[1].DeXuatID, 2);
    assert.ok(
      !at121.state.nhatKyDinhGia.some((n) => n.LoaiHanhDong === 'HET_HIEU_LUC_DO_DOI_KHUNG'),
      'hết hạn TTL không ghi audit',
    );
    assert.equal(a.deXuatGia[0].TrangThaiDuyet, 'PENDING', 'state gốc không bị sửa');
  });

  it('hết hạn TTL chạy trước kiểm tra trùng ngay cả khi lần lưu này bị chặn vì lý do khác', () => {
    const s0 = ready();
    const a = luuDeXuatGia(s0, proposalInput(s0), NOW).state;
    const { state, result } = luuDeXuatGia(a, proposalInput(a, { giaDeXuat: 2500000 }), at(121));
    assert.equal(result.maChan, 'NGOAI_KHUNG_GIA');
    assert.deepEqual(result.deXuatHetHan, [1]);
    assert.equal(state.deXuatGia[0].TrangThaiDuyet, 'EXPIRED');
  });

  it('hetHanDeXuatGia: biên 120/121 phút, chỉ đụng sự kiện được gọi, không audit', () => {
    let state = withRule(withRule(build(), 101), 201);
    state = withDeXuat(state, [
      { DeXuatID: 1, KhuVucID: 101, GiaDeXuat: 1600000, ThoiGianDeXuat: NOW },
      { DeXuatID: 2, KhuVucID: 201, GiaDeXuat: 1600000, ThoiGianDeXuat: NOW },
    ]);
    const at120 = hetHanDeXuatGia(state, 1, at(120));
    assert.deepEqual(at120.result.deXuatHetHan, []);
    assert.equal(at120.result.soLuong, 0);
    assert.equal(at120.state, state, 'không đổi gì thì trả lại chính state');

    const at121 = hetHanDeXuatGia(state, 1, at(121));
    assert.deepEqual(at121.result.deXuatHetHan, [1]);
    assert.equal(at121.result.soLuong, 1);
    assert.equal(at121.result.nhan, NHAN_MO_PHONG);
    assert.equal(at121.state.deXuatGia[0].TrangThaiDuyet, 'EXPIRED');
    assert.equal(at121.state.deXuatGia[0].GhiChuDuyet, 'HET_HAN_TTL_120_PHUT');
    assert.equal(at121.state.deXuatGia[1].TrangThaiDuyet, 'PENDING', 'sự kiện 2 không bị đụng');
    assert.equal(at121.state.nhatKyDinhGia.length, state.nhatKyDinhGia.length);
    assert.equal(state.deXuatGia[0].TrangThaiDuyet, 'PENDING');
  });

  it('hai sự kiện tách biệt: đề xuất, audit và thu hẹp khung không lan sang nhau', () => {
    let state = withRule(withRule(build(), 101), 201);
    state = luuDeXuatGia(state, proposalInput(state, {}, 101), NOW).state;
    state = luuDeXuatGia(state, proposalInput(state, { giaDeXuat: 1400000 }, 201), NOW).state;
    assert.deepEqual(state.deXuatGia.map((d) => [d.KhuVucID, d.TrangThaiDuyet]), [[101, 'PENDING'], [201, 'PENDING']]);

    // khu 201 bị chặn không ảnh hưởng khu 101
    const blocked = luuDeXuatGia(state, proposalInput(state, { giaDeXuat: 2500000 }, 201), at(1));
    assert.equal(blocked.result.maChan, 'NGOAI_KHUNG_GIA');
    assert.equal(blocked.state.nhatKyDinhGia.at(-1).SuKienID, 2);
    assert.equal(blocked.state.nhatKyDinhGia.at(-1).KhuVucID, 201);

    // thu hẹp khu 101 hết hiệu lực đề xuất của 101, giữ nguyên đề xuất của 201
    const narrowed = saveRule(state, 101, { giaGoc: 1700000, giaSan: 1650000 }, at(2));
    assert.deepEqual(narrowed.result.deXuatHetHieuLuc, [1]);
    assert.equal(narrowed.state.deXuatGia[1].TrangThaiDuyet, 'PENDING');
    assert.deepEqual(narrowed.state.quyTacGia[201], state.quyTacGia[201]);

    // đóng suất của sự kiện 1 không làm sự kiện 2 bị chặn
    const closedOne = withRule(withRule(build((s) => (s.suatDien[11].TrangThai = 'HUY')), 101), 201);
    const r1 = luuDeXuatGia(closedOne, proposalInput(closedOne, {}, 101), NOW).result;
    const r2 = luuDeXuatGia(closedOne, proposalInput(closedOne, {}, 201), NOW).result;
    assert.equal(r1.maChan, 'SUAT_DIEN_KHONG_MO_BAN');
    assert.equal(r2.ketQua, 'DA_LUU');
  });

  it('khu vực không tồn tại: kết quả lỗi, state không đổi', () => {
    const s0 = ready();
    const { state, result } = luuDeXuatGia(s0, proposalInput(s0, { khuVucId: 999 }), NOW);
    assert.equal(result.ketQua, 'LOI');
    assert.equal(state, s0);
  });

  it('now là bắt buộc', () => {
    const s0 = ready();
    assert.throws(() => luuDeXuatGia(s0, proposalInput(s0)), TypeError);
    assert.throws(() => hetHanDeXuatGia(s0, 1), TypeError);
    assert.throws(() => laySoLieuDinhGia(s0, 1), TypeError);
  });
});

function roundTo2(x) {
  return Math.round(x * 100) / 100;
}

function taoGhe(khuVucId, startId, count, trangThai = 'TRONG', ngayCapNhat = null) {
  return Array.from({ length: count }, (_, i) => ({
    GheID: startId + i,
    KhuVucID: khuVucId,
    TrangThai: trangThai,
    NgayCapNhatTrangThai: ngayCapNhat,
  }));
}

describe('simulator', () => {
  it('các cổng kiểm tra theo thứ tự T4: KICH_BAN_KHONG_HOP_LE, SU_KIEN_KHONG_TON_TAI, MO_PHONG_CHUA_BAT, KHONG_CO_SUAT_HOP_LE', () => {
    const off = build((s) => {
      s.suKien[1].moPhong = false;
      s.ghe = taoGhe(101, 1, 10);
    });
    const rBadScenario = moPhongNhuCau(off, 1, 'khong_hop_le', NOW);
    assert.equal(rBadScenario.result.ketQua, 'LOI');
    assert.equal(rBadScenario.result.loi, 'KICH_BAN_KHONG_HOP_LE');
    assert.equal(rBadScenario.state, off);

    const rNoEvent = moPhongNhuCau(off, 999, 'ban_nhanh', NOW);
    assert.equal(rNoEvent.result.ketQua, 'LOI');
    assert.equal(rNoEvent.result.loi, 'SU_KIEN_KHONG_TON_TAI');
    assert.equal(rNoEvent.state, off);

    const rFlagOff = moPhongNhuCau(off, 1, 'ban_nhanh', NOW);
    assert.equal(rFlagOff.result.ketQua, 'LOI');
    assert.equal(rFlagOff.result.loi, 'MO_PHONG_CHUA_BAT');
    assert.equal(rFlagOff.state, off);

    const noOpen = build((s) => {
      s.suatDien[11].TrangThai = 'DONG_BAN';
      s.ghe = taoGhe(101, 1, 10);
    });
    const rNoOpen = moPhongNhuCau(noOpen, 1, 'ban_nhanh', NOW);
    assert.equal(rNoOpen.result.ketQua, 'KHONG_CO_SUAT_HOP_LE');
    assert.equal(rNoOpen.result.nhan, NHAN_MO_PHONG);
    assert.equal(rNoOpen.result.moPhong, true);
    assert.deepEqual(rNoOpen.result.suatBoQua, [{ suatDienId: 11, lyDo: 'KHONG_MO_BAN' }]);
    assert.equal(rNoOpen.state, noOpen);
  });

  it('suất đóng hoặc sự kiện chưa công bố không bị simulator đụng tới; SAP_MO_BAN trong cửa sổ được ghi', () => {
    const s0 = build((s) => {
      s.suatDien[12] = suat({ SuKienID: 1, TrangThai: 'DONG_BAN' });
      s.suatDien[11].TrangThai = 'SAP_MO_BAN';
      s.khuVuc[101].TongSoGhe = 10;
      s.khuVuc[102] = { SuKienID: 1, SuatDienID: 12, GiaVeNiemYet: 1500000, TongSoGhe: 10 };
      s.ghe = [...taoGhe(101, 1, 10), ...taoGhe(102, 101, 10)];
    });
    const { state, result } = moPhongNhuCau(s0, 1, 'ban_nhanh', NOW);
    assert.equal(result.ketQua, 'DA_MO_PHONG');
    assert.deepEqual(result.suatDaMoPhong, [11]);
    assert.deepEqual(result.suatBoQua, [{ suatDienId: 12, lyDo: 'KHONG_MO_BAN' }]);
    assert.equal(state.ghe.filter((g) => g.KhuVucID === 101 && g.TrangThai === 'DA_BAN').length, 7);
    assert.equal(state.ghe.filter((g) => g.KhuVucID === 102 && g.TrangThai === 'DA_BAN').length, 0);

    const unpublished = build((s) => {
      s.suKien[1].TrangThaiCongBo = 'BAN_NHAP';
      s.ghe = taoGhe(101, 1, 10);
    });
    const rUnpub = moPhongNhuCau(unpublished, 1, 'ban_nhanh', NOW);
    assert.equal(rUnpub.result.ketQua, 'KHONG_CO_SUAT_HOP_LE');
    assert.equal(rUnpub.state, unpublished);
  });

  it('ghế đang giữ, ghế bán thật và sự kiện khác được giữ nguyên; thứ tự GheID tăng dần; đặt lại đúng phạm vi', () => {
    const realSoldAt = at(-400);
    let s0 = build((s) => {
      s.khuVuc[101].TongSoGhe = 10;
      s.khuVuc[201].TongSoGhe = 10;
      s.ghe = [
        // Ghế 1 bán thật, ghế 2 đang giữ (ACTIVE chưa hết hạn), ghế 3..10 TRONG, ghế 11 thuộc sự kiện 2
        { GheID: 1, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: realSoldAt },
        ...taoGhe(101, 2, 9),
        ...taoGhe(201, 101, 5),
      ];
      s.giuCho = [
        {
          GiuChoID: 1,
          SuKienID: 1,
          SuatDienID: 11,
          TrangThai: 'ACTIVE',
          HetHanLuc: at(10),
          chiTiet: [{ KhuVucID: 101, GheID: 2, SoLuong: 1 }],
        },
        {
          // Giữ chỗ ACTIVE đã tới HetHanLuc vẫn chặn ghế 3 (như T4: mọi giữ chỗ ACTIVE đều chặn)
          GiuChoID: 2,
          SuKienID: 1,
          SuatDienID: 11,
          TrangThai: 'ACTIVE',
          HetHanLuc: NOW,
          chiTiet: [{ KhuVucID: 101, GheID: 3, SoLuong: 1 }],
        },
      ];
    });
    s0 = withRule(s0, 101);
    s0 = luuDeXuatGia(s0, proposalInput(s0), at(-2)).state;
    const before = snapshot(s0);

    const run1 = moPhongNhuCau(s0, 1, 'ban_nhanh', NOW);
    assert.deepEqual(s0, before, 'không sửa state đầu vào');
    assert.equal(run1.result.ketQua, 'DA_MO_PHONG');
    assert.equal(run1.result.nhan, NHAN_MO_PHONG);
    assert.equal(run1.result.moPhong, true);

    // Không đổi giá niêm yết, quy tắc, đề xuất hay nhật ký định giá
    assert.deepEqual(run1.state.khuVuc, s0.khuVuc);
    assert.deepEqual(run1.state.quyTacGia, s0.quyTacGia);
    assert.deepEqual(run1.state.deXuatGia, s0.deXuatGia);
    assert.deepEqual(run1.state.nhatKyDinhGia, s0.nhatKyDinhGia);

    // Ghế 1 (bán thật) giữ nguyên, ghế 2 và 3 (giữ ACTIVE) giữ TRONG, ghế 4..10 (7 ghế theo GheID tăng dần) -> DA_BAN
    const byId = Object.fromEntries(run1.state.ghe.map((g) => [g.GheID, g]));
    assert.equal(byId[1].TrangThai, 'DA_BAN');
    assert.equal(byId[1].NgayCapNhatTrangThai, realSoldAt);
    assert.equal(byId[2].TrangThai, 'TRONG');
    assert.equal(byId[3].TrangThai, 'TRONG');
    for (const id of [4, 5, 6, 7, 8, 9, 10]) assert.equal(byId[id].TrangThai, 'DA_BAN', `ghế ${id}`);
    assert.equal(run1.result.khuVuc[0].boQuaDangGiu, 2);
    assert.equal(run1.result.khuVuc[0].ghiMoi, 7);
    assert.equal(run1.state.moPhongGhe.length, 7);

    // Sự kiện 2 không bị đụng
    assert.deepEqual(
      run1.state.ghe.filter((g) => g.KhuVucID === 201),
      s0.ghe.filter((g) => g.KhuVucID === 201),
    );

    // Chạy lại với ban_cham: đặt lại 7 ghế cũ về TRONG rồi ghi 1 ghế (10% của 10)
    const run2 = moPhongNhuCau(run1.state, 1, 'ban_cham', NOW);
    assert.equal(run2.result.datLai.tong, 7);
    assert.equal(run2.result.khuVuc[0].datLai, 7);
    assert.equal(run2.result.khuVuc[0].ghiMoi, 1);
    assert.equal(run2.result.khuVuc[0].biKepVaoCuaSo6h, 0);
    const byId2 = Object.fromEntries(run2.state.ghe.map((g) => [g.GheID, g]));
    assert.equal(byId2[4].TrangThai, 'DA_BAN');
    for (const id of [2, 3, 5, 6, 7, 8, 9, 10]) assert.equal(byId2[id].TrangThai, 'TRONG');
    assert.equal(byId2[1].NgayCapNhatTrangThai, realSoldAt);
  });

  it('báo biKepVaoCuaSo6h khi ban_cham mở bán gần hơn 6 giờ và khongCoGhe khi khu không có ghế', () => {
    const recentOpen = build((s) => {
      s.suatDien[11].ThoiGianMoBanVe = at(-120); // mở bán chỉ 2h trước NOW -> kẹp vào cửa sổ 6h
      s.khuVuc[101].TongSoGhe = 20;
      s.ghe = taoGhe(101, 1, 20);
      s.khuVuc[102] = { SuKienID: 1, SuatDienID: 11, GiaVeNiemYet: 1000000, TongSoGhe: 50 }; // standing zone
    });
    const { result } = moPhongNhuCau(recentOpen, 1, 'ban_cham', NOW);
    assert.equal(result.khuVuc[0].ghiMoi, 2);
    assert.equal(result.khuVuc[0].biKepVaoCuaSo6h, 2);
    assert.equal(result.khuVuc[1].khongCoGhe, true);
    assert.equal(result.khuVuc[1].ghiMoi, 0);
  });
});

describe('kich ban qua engine', () => {
  function fixtureCoDinh() {
    let s0 = build((s) => {
      // MO = at(-600) -> mở bán 10 giờ trước NOW (>= 7 giờ), đóng = at(3000), bắt đầu = at(3600)
      s.khuVuc[101] = { SuKienID: 1, SuatDienID: 11, GiaVeNiemYet: 1500000, TongSoGhe: 100 };
      s.ghe = taoGhe(101, 1, 100);
    });
    s0 = withRule(s0, 101);
    return s0;
  }

  it('ban_nhanh tăng giá (> hiện hành), ban_cham giảm giá (< hiện hành), ban_deu cho kết quả cố định dự đoán được', () => {
    const base = fixtureCoDinh();

    const simNhanh = moPhongNhuCau(base, 1, 'ban_nhanh', NOW);
    assert.equal(simNhanh.result.khuVuc[0].ghiMoi, 70);
    const propNhanh = deXuatTuDong(simNhanh.state, 101, NOW);
    assert.equal(propNhanh.result.ketQua, 'DA_LUU');
    assert.ok(propNhanh.result.giaDeXuat > 1500000, `ban_nhanh giá ${propNhanh.result.giaDeXuat} phải > 1500000`);
    assert.equal(propNhanh.result.giaDeXuat, 1800000);

    const simCham = moPhongNhuCau(base, 1, 'ban_cham', NOW);
    assert.equal(simCham.result.khuVuc[0].ghiMoi, 10);
    assert.equal(simCham.result.khuVuc[0].biKepVaoCuaSo6h, 0);
    const propCham = deXuatTuDong(simCham.state, 101, NOW);
    assert.equal(propCham.result.ketQua, 'DA_LUU');
    assert.ok(propCham.result.giaDeXuat < 1500000, `ban_cham giá ${propCham.result.giaDeXuat} phải < 1500000`);
    assert.equal(propCham.result.giaDeXuat, 1200000);

    // ban_deu: 35 ghế rải đều trên (NOW-10h, NOW) => 21 ghế trong cửa sổ 6h, r=0.35 (Δr=0),
    // u = 3.5 / (100/60) = 2.1 (Δv=+0.11), t_rem=60<=72 & r<0.40 (Δt=-0.12) => raw=1485000 => 1490000.
    const simDeu = moPhongNhuCau(base, 1, 'ban_deu', NOW);
    assert.equal(simDeu.result.khuVuc[0].ghiMoi, 35);
    const propDeu = deXuatTuDong(simDeu.state, 101, NOW);
    assert.equal(propDeu.result.ketQua, 'DA_LUU');
    assert.equal(propDeu.result.giaDeXuat, 1490000);
  });

  it('deXuatTuDong không tạo đề xuất khi suất không mở bán hoặc quy tắc tắt', () => {
    const closed = withRule(build((s) => {
      s.suatDien[11].TrangThai = 'DONG_BAN';
      s.ghe = taoGhe(101, 1, 100);
    }));
    const rClosed = deXuatTuDong(closed, 101, NOW);
    assert.equal(rClosed.result.ketQua, 'BO_QUA');
    assert.deepEqual(rClosed.result.lyDoBoQua, ['SUAT_DIEN_KHONG_MO_BAN']);
    assert.equal(rClosed.state, closed);
    assert.equal(rClosed.state.deXuatGia.length, 0);

    const disabled = withRule(build((s) => {
      s.ghe = taoGhe(101, 1, 100);
    }), 101, { trangThaiKichHoat: false });
    const rDisabled = deXuatTuDong(disabled, 101, NOW);
    assert.equal(rDisabled.result.ketQua, 'BO_QUA');
    assert.deepEqual(rDisabled.result.lyDoBoQua, ['QUY_TAC_KHONG_KICH_HOAT']);
    assert.equal(rDisabled.state, disabled);
  });
});

describe('nhan mo phong', () => {
  it('mọi LyDoDeXuat từ deXuatTuDong bắt đầu bằng [MÔ PHỎNG], không nhân đôi tiền tố và không sinh APPROVED', () => {
    let s0 = withRule(build((s) => {
      s.ghe = taoGhe(101, 1, 100);
    }));
    s0 = moPhongNhuCau(s0, 1, 'ban_nhanh', NOW).state;

    const a = deXuatTuDong(s0, 101, NOW, '[MÔ PHỎNG] [mô phỏng] Nhu cầu cao');
    assert.equal(a.result.ketQua, 'DA_LUU');
    assert.equal(a.result.nhan, NHAN_MO_PHONG);
    const lyDoA = a.state.deXuatGia[0].LyDoDeXuat;
    assert.ok(lyDoA.startsWith(TIEN_TO_MO_PHONG));
    assert.equal(lyDoA, '[MÔ PHỎNG] Nhu cầu cao');
    assert.ok(!lyDoA.slice(TIEN_TO_MO_PHONG.length).includes('[MÔ PHỎNG]'));

    const b = deXuatTuDong(s0, 101, NOW);
    assert.ok(b.state.deXuatGia[0].LyDoDeXuat.startsWith(TIEN_TO_MO_PHONG));
    assert.ok(b.state.deXuatGia.every((dx) => dx.TrangThaiDuyet !== 'APPROVED'));
    assert.ok(a.state.deXuatGia.every((dx) => dx.TrangThaiDuyet !== 'APPROVED'));
  });
});

describe('hoi quy vong 2: Date, giu cho ACTIVE het han va 90 ghe', () => {
  it('tương đương ISO, epoch và Date cho dangMoBan, laySoLieuDinhGia, luuDeXuatGia và moPhongNhuCau', () => {
    const moMs = Date.parse(MO);
    const dongMs = Date.parse(DONG);
    const batDauMs = Date.parse(BAT_DAU);
    const nowMs = Date.parse(NOW);

    const sk = { TrangThaiCongBo: 'CONG_KHAI' };
    const suatDang = [
      ['ISO', suat({ ThoiGianMoBanVe: MO, ThoiGianDongBanVe: DONG })],
      ['epoch', suat({ ThoiGianMoBanVe: moMs, ThoiGianDongBanVe: dongMs })],
      ['Date', suat({ ThoiGianMoBanVe: new Date(moMs), ThoiGianDongBanVe: new Date(dongMs) })],
    ];
    for (const [nhan, sd] of suatDang) {
      for (const nowVal of [NOW, nowMs, new Date(nowMs)]) {
        assert.equal(dangMoBan(sk, sd, nowVal), true, `${nhan} trong cửa sổ`);
      }
      assert.equal(dangMoBan(sk, sd, moMs), true, `${nhan} đúng giờ mở`);
      assert.equal(dangMoBan(sk, sd, new Date(moMs)), true, `${nhan} đúng giờ mở (Date)`);
      assert.equal(dangMoBan(sk, sd, moMs - 1), false, `${nhan} trước giờ mở 1ms`);
      assert.equal(dangMoBan(sk, sd, new Date(moMs - 1)), false, `${nhan} trước giờ mở 1ms (Date)`);
      assert.equal(dangMoBan(sk, sd, dongMs), false, `${nhan} đúng giờ đóng`);
      assert.equal(dangMoBan(sk, sd, new Date(dongMs)), false, `${nhan} đúng giờ đóng (Date)`);
    }

    // Số liệu với HetHanLuc dạng Date và ISO cho cùng n_hold; HetHanLuc == now KHÔNG được tính.
    const makeHoldState = (asDate) =>
      build((s) => {
        const ts = (iso) => (asDate ? new Date(iso) : iso);
        s.suatDien[11] = suat({
          ThoiGianMoBanVe: ts(MO),
          ThoiGianDongBanVe: ts(DONG),
          ThoiGianBatDau: ts(BAT_DAU),
        });
        s.ghe = [
          { GheID: 1, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: ts(at(-120)) },
          ...taoGhe(101, 2, 19),
        ];
        s.giuCho = [
          {
            GiuChoID: 1,
            SuKienID: 1,
            SuatDienID: 11,
            TrangThai: 'ACTIVE',
            HetHanLuc: ts(at(10)),
            chiTiet: [{ KhuVucID: 101, GheID: 2, SoLuong: 3 }],
          },
          {
            GiuChoID: 2,
            SuKienID: 1,
            SuatDienID: 11,
            TrangThai: 'ACTIVE',
            HetHanLuc: ts(NOW),
            chiTiet: [{ KhuVucID: 101, GheID: 3, SoLuong: 4 }],
          },
        ];
      });

    const isoState = withRule(makeHoldState(false), 101, {}, NOW);
    const dateState = withRule(makeHoldState(true), 101, {}, new Date(nowMs));

    const metricsIso = laySoLieuDinhGia(isoState, 1, NOW)[0];
    const metricsDate = laySoLieuDinhGia(dateState, 1, new Date(nowMs))[0];
    assert.equal(metricsIso.n_hold, 3, 'ISO: HetHanLuc == now không tính vào n_hold');
    assert.equal(metricsDate.n_hold, 3, 'Date: HetHanLuc == now không tính vào n_hold');
    assert.equal(metricsDate.dang_mo_ban, metricsIso.dang_mo_ban);
    assert.equal(metricsDate.so_ban_6h, metricsIso.so_ban_6h);
    assert.equal(metricsDate.t_rem_gio, metricsIso.t_rem_gio);
    assert.equal(metricsDate.tong_gio_mo_ban, metricsIso.tong_gio_mo_ban);
    assert.equal(metricsDate.v_target, metricsIso.v_target);

    // Lưu đề xuất và simulator dùng seed có Date cho kết quả tương đương seed ISO.
    const propIso = luuDeXuatGia(isoState, proposalInput(isoState), NOW);
    const propDate = luuDeXuatGia(dateState, proposalInput(dateState), new Date(nowMs));
    assert.equal(propIso.result.ketQua, 'DA_LUU');
    assert.deepEqual(propDate.result, propIso.result);
    assert.deepEqual(propDate.state.deXuatGia, propIso.state.deXuatGia);

    // Dùng seat-clean seed (20 ghế, có 1 ghế đã bán + 1 ghế giữ hợp lệ) để so sánh simulator ISO vs Date.
    const simIso = moPhongNhuCau(isoState, 1, 'ban_deu', NOW);
    const simDate = moPhongNhuCau(dateState, 1, 'ban_deu', new Date(nowMs));
    assert.deepEqual(simDate.result, simIso.result);
    assert.deepEqual(simDate.state.moPhongGhe, simIso.state.moPhongGhe);
    assert.deepEqual(
      simDate.state.ghe.map((g) => ({
        GheID: g.GheID,
        TrangThai: g.TrangThai,
        NgayCapNhatTrangThai: g.NgayCapNhatTrangThai instanceof Date ? g.NgayCapNhatTrangThai.toISOString() : g.NgayCapNhatTrangThai,
      })),
      simIso.state.ghe.map((g) => ({
        GheID: g.GheID,
        TrangThai: g.TrangThai,
        NgayCapNhatTrangThai: g.NgayCapNhatTrangThai,
      })),
    );
    assert.equal(batDauMs > nowMs, true);
  });

  it('reset simulator bị chặn bởi giữ chỗ ACTIVE đã hết hạn và ghế TRONG có giữ chỗ ACTIVE hết hạn không nhận ghi mới', () => {
    const s0 = build((s) => {
      s.khuVuc[101].TongSoGhe = 10;
      s.ghe = [
        ...taoGhe(101, 1, 8),
        { GheID: 9, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: at(-400) },
        { GheID: 10, KhuVucID: 101, TrangThai: 'DA_BAN', NgayCapNhatTrangThai: at(-400) },
      ];
    });

    const run1 = moPhongNhuCau(s0, 1, 'ban_nhanh', NOW);
    assert.equal(run1.result.khuVuc[0].ghiMoi, 7);
    const lockedSeatBookkeeping = run1.state.moPhongGhe.find((m) => m.GheID === 1);
    assert.ok(lockedSeatBookkeeping);

    // Thêm giữ chỗ ACTIVE đã hết hạn (HetHanLuc < NOW) trên ghế đã ghi giả lập (ghế 1) và một ghế TRONG (ghế 8).
    const mutated = structuredClone(run1.state);
    mutated.giuCho.push(
      {
        GiuChoID: 10,
        SuKienID: 1,
        SuatDienID: 11,
        TrangThai: 'ACTIVE',
        HetHanLuc: at(-10),
        chiTiet: [{ KhuVucID: 101, GheID: 1, SoLuong: 1 }],
      },
      {
        GiuChoID: 11,
        SuKienID: 1,
        SuatDienID: 11,
        TrangThai: 'ACTIVE',
        HetHanLuc: at(-5),
        chiTiet: [{ KhuVucID: 101, GheID: 8, SoLuong: 1 }],
      },
    );

    const run2 = moPhongNhuCau(mutated, 1, 'ban_nhanh', NOW);
    assert.equal(run2.result.datLai.tong, 6);
    assert.equal(run2.result.datLai.boQuaDangKhoa, 1, 'ghế 1 có ACTIVE hết hạn phải được tính là locked');
    assert.equal(run2.result.khuVuc[0].datLai, 6);
    assert.equal(run2.result.khuVuc[0].boQuaDangGiu, 1, 'ghế 8 TRONG có ACTIVE hết hạn vẫn bị bỏ qua');
    assert.equal(run2.result.khuVuc[0].ghiMoi, 6, 'chỉ 6 ghế 2..7 được ghi mới');

    const byId = Object.fromEntries(run2.state.ghe.map((g) => [g.GheID, g]));
    assert.equal(byId[1].TrangThai, 'DA_BAN', 'ghế 1 không được khôi phục về TRONG');
    assert.equal(byId[1].NgayCapNhatTrangThai, lockedSeatBookkeeping.ThoiDiemGiaLap);
    assert.equal(byId[8].TrangThai, 'TRONG', 'ghế 8 TRONG có ACTIVE hết hạn không nhận ghi mới');
    for (const id of [2, 3, 4, 5, 6, 7]) assert.equal(byId[id].TrangThai, 'DA_BAN', `ghế ${id}`);

    const keptSeat1 = run2.state.moPhongGhe.find((m) => m.GheID === 1);
    assert.deepEqual(keptSeat1, lockedSeatBookkeeping, 'bookkeeping của ghế locked vẫn còn nguyên');
    assert.equal(run2.state.moPhongGhe.length, 7);
  });

  it('hồi quy 90 ghế: ban_nhanh ghi đúng 63 ghế, ban_cham ghi 9 ghế và ban_deu ghi 31 ghế', () => {
    const s90 = build((s) => {
      s.khuVuc[101].TongSoGhe = 90;
      s.ghe = taoGhe(101, 1, 90);
    });

    const nhanh = moPhongNhuCau(s90, 1, 'ban_nhanh', NOW);
    assert.equal(nhanh.result.khuVuc[0].ghiMoi, 63);
    assert.equal(nhanh.state.ghe.filter((g) => g.KhuVucID === 101 && g.TrangThai === 'DA_BAN').length, 63);

    const cham = moPhongNhuCau(s90, 1, 'ban_cham', NOW);
    assert.equal(cham.result.khuVuc[0].ghiMoi, 9);
    assert.equal(cham.state.ghe.filter((g) => g.KhuVucID === 101 && g.TrangThai === 'DA_BAN').length, 9);

    const deu = moPhongNhuCau(s90, 1, 'ban_deu', NOW);
    assert.equal(deu.result.khuVuc[0].ghiMoi, 31);
    assert.equal(deu.state.ghe.filter((g) => g.KhuVucID === 101 && g.TrangThai === 'DA_BAN').length, 31);
  });
});

// ---------------------------------------------------------------- duyệt / từ chối (T4 sprint 2)

const NGUOI = { id: 'u1', loaiTaiKhoan: 'ORGANIZER' };
const NGUOI_KHAC_TO_CHUC = { id: 'u2', loaiTaiKhoan: 'ORGANIZER' };

/** Sự kiện 1 thuộc tổ chức 7 (u1 CHU_SO_HUU), sự kiện 2 thuộc tổ chức 8 (u2); đề xuất 1 PENDING 1.5tr → 1.6tr. */
function duyetState({ dx = {}, mutate } = {}) {
  const base = build((s) => {
    s.suKien[1].ToChucID = 7;
    s.suKien[2].ToChucID = 8;
    if (mutate) mutate(s);
  });
  const withMembers = { ...base, thanhVienToChuc: [
    { ToChucID: 7, NguoiDungID: 'u1', VaiTro: 'CHU_SO_HUU' },
    { ToChucID: 8, NguoiDungID: 'u2', VaiTro: 'CHU_SO_HUU' },
    { ToChucID: 7, NguoiDungID: 'u3', VaiTro: 'NHAN_VIEN' },
  ] };
  return withDeXuat(withRule(withMembers), [
    { DeXuatID: 1, GiaHienTai: 1500000, GiaDeXuat: 1600000, ThoiGianDeXuat: at(-5), ...dx },
  ]);
}

const duyet = (state, over = {}, now = NOW) =>
  duyetDeXuatGia(state, { deXuatId: 1, ghiChu: 'ok', nguoiDung: NGUOI, ...over }, now);
const tuChoi = (state, over = {}, now = NOW) =>
  tuChoiDeXuatGia(state, { deXuatId: 1, lyDo: 'không phù hợp', nguoiDung: NGUOI, ...over }, now);

describe('duyetDeXuatGia (mock)', () => {
  it('duyệt đổi giá niêm yết, sinh đúng một nhật ký giá và không sửa state đầu vào', () => {
    const s0 = duyetState();
    const truoc = snapshot(s0);
    const { state, result } = duyet(s0);
    assert.deepEqual(s0, truoc);
    assert.equal(result.ok, true);
    assert.equal(result.ketQua, 'DA_DUYET');
    assert.equal(result.giaCu, 1500000);
    assert.equal(result.giaMoi, 1600000);
    assert.equal(result.tyLeThayDoiPhanTram, 6.67);
    assert.equal(result.loaiBienDong, 'DUYET_DE_XUAT_AI');
    assert.equal(result.nguoiDuyetId, 'u1');
    assert.equal(result.thoiGianDuyet, NOW);
    assert.equal(result.nhan, NHAN_MO_PHONG);
    assert.equal(state.khuVuc[101].GiaVeNiemYet, 1600000);
    assert.equal(state.deXuatGia[0].TrangThaiDuyet, 'APPROVED');
    assert.equal(state.deXuatGia[0].NguoiDuyetID, 'u1');
    assert.equal(state.nhatKyGia.length, 1);
    assert.equal(state.nhatKyGia[0].NhatKyGiaID, result.nhatKyGiaId);
    assert.equal(state.nhatKyGia[0].GiaCu, 1500000);
    assert.equal(state.nhatKyGia[0].GiaMoi, 1600000);
    assert.equal(state.nhatKyGia[0].DeXuatID, 1);
    assert.equal(state.seq.nhatKyGia, 1);
    assert.equal(state.khuVuc[201].GiaVeNiemYet, 1500000, 'khu vực khác không đổi');
  });

  it('điều chỉnh thủ công: DIEU_CHINH_THU_CONG, cần lý do, giá phải hữu hạn', () => {
    const s0 = duyetState();
    const { state, result } = duyet(s0, { giaDieuChinh: 1650000, ghiChu: 'tăng thêm' });
    assert.equal(result.loaiBienDong, 'DIEU_CHINH_THU_CONG');
    assert.equal(result.giaMoi, 1650000);
    assert.equal(state.khuVuc[101].GiaVeNiemYet, 1650000);
    assert.equal(state.nhatKyGia[0].LyDoThayDoi, 'tăng thêm');

    const thieu = duyet(s0, { giaDieuChinh: 1650000, ghiChu: '   ' });
    assert.equal(thieu.result.ok, false);
    assert.equal(thieu.result.loi.status, 422);
    assert.equal(thieu.result.loi.ma, 'THIEU_LY_DO_DIEU_CHINH');
    assert.equal(thieu.state, s0);

    for (const sai of [NaN, Infinity, 'abc', true]) {
      const r = duyet(s0, { giaDieuChinh: sai });
      assert.equal(r.result.loi.ma, 'GIA_DUYET_KHONG_HOP_LE', String(sai));
      assert.equal(r.state, s0);
    }
  });

  it('ngoài khung trả giaSan/giaTran; giá không đổi; state đầu vào giữ nguyên', () => {
    const s0 = duyetState();
    const truoc = snapshot(s0);
    const r = duyet(s0, { giaDieuChinh: 2100000 });
    assert.equal(r.result.loi.status, 422);
    assert.equal(r.result.loi.ma, 'NGOAI_KHUNG_GIA');
    assert.deepEqual(r.result.loi.chiTiet, { giaSan: 1200000, giaTran: 2000000 });
    assert.equal(r.state, s0);
    assert.equal(duyet(s0, { giaDieuChinh: 1100000 }).result.loi.ma, 'NGOAI_KHUNG_GIA');
    assert.equal(duyet(s0, { giaDieuChinh: 1500000 }).result.loi.ma, 'GIA_KHONG_THAY_DOI');
    assert.deepEqual(s0, truoc);
  });

  it('403 khi người ngoài tổ chức, vai trò/loại tài khoản sai, thiếu người dùng hoặc ID không tồn tại', () => {
    const s0 = duyetState();
    const ca = [
      duyet(s0, { nguoiDung: NGUOI_KHAC_TO_CHUC }),
      duyet(s0, { nguoiDung: { id: 'u3', loaiTaiKhoan: 'ORGANIZER' } }),
      duyet(s0, { nguoiDung: { id: 'u1', loaiTaiKhoan: 'CUSTOMER' } }),
      duyet(s0, { nguoiDung: undefined }),
      duyet(s0, { nguoiDung: { id: '', loaiTaiKhoan: 'ORGANIZER' } }),
      duyet(s0, { deXuatId: 999 }),
      tuChoi(s0, { nguoiDung: NGUOI_KHAC_TO_CHUC }),
      tuChoi(s0, { deXuatId: 999 }),
    ];
    for (const r of ca) {
      assert.equal(r.result.ok, false);
      assert.equal(r.result.loi.status, 403);
      assert.equal(r.result.loi.ma, 'KHONG_CO_QUYEN');
      assert.equal(r.state, s0);
    }
    // sự kiện thiếu ToChucID cũng không ai có quyền
    const khongToChuc = duyetState({ mutate: (s) => delete s.suKien[1].ToChucID });
    assert.equal(duyet(khongToChuc).result.loi.status, 403);
  });

  it('409: đã xử lý (kèm trạng thái), duyệt lần hai, giá đã đổi', () => {
    const s0 = duyetState();
    const da = duyet(s0);
    const hai = duyet(da.state);
    assert.equal(hai.result.loi.status, 409);
    assert.equal(hai.result.loi.ma, 'DE_XUAT_DA_XU_LY');
    assert.deepEqual(hai.result.loi.chiTiet, { trangThai: 'APPROVED' });
    assert.equal(hai.state, da.state);
    assert.equal(hai.state.nhatKyGia.length, 1, 'duyệt lần hai không sinh nhật ký');

    const daTuChoi = tuChoi(s0);
    assert.equal(duyet(daTuChoi.state).result.loi.ma, 'DE_XUAT_DA_XU_LY');
    assert.deepEqual(duyet(daTuChoi.state).result.loi.chiTiet, { trangThai: 'REJECTED' });
    assert.equal(tuChoi(daTuChoi.state).result.loi.status, 409);

    const doiGia = structuredClone(s0);
    doiGia.khuVuc[101].GiaVeNiemYet = 1550000;
    const r = duyet(doiGia);
    assert.equal(r.result.loi.status, 409);
    assert.equal(r.result.loi.ma, 'GIA_DA_THAY_DOI');
    assert.equal(r.state, doiGia);
    // Từ chối vẫn được khi giá đã đổi (SQL chỉ kiểm giá ở duyệt).
    assert.equal(tuChoi(doiGia).result.ketQua, 'DA_TU_CHOI');
  });

  it('TTL: đúng 120 phút vẫn duyệt được; quá 120 phút → HET_HAN, đề xuất EXPIRED, không đổi giá', () => {
    const s0 = duyetState({ dx: { ThoiGianDeXuat: at(-120) } });
    assert.equal(hetHanLuc(at(-120)), NOW);
    assert.equal(duyet(s0, {}, NOW).result.ketQua, 'DA_DUYET');
    assert.equal(tuChoi(s0, {}, NOW).result.ketQua, 'DA_TU_CHOI');

    const muon = at(0.001);
    for (const chay of [duyet, tuChoi]) {
      const truoc = snapshot(s0);
      const { state, result } = chay(s0, {}, muon);
      assert.deepEqual(s0, truoc);
      assert.equal(result.ok, false);
      assert.equal(result.ketQua, 'HET_HAN');
      assert.equal(result.ma, 'DE_XUAT_HET_HAN');
      assert.equal(result.thoiGianDeXuat, at(-120));
      assert.equal(result.hetHanLuc, NOW);
      assert.equal(state.deXuatGia[0].TrangThaiDuyet, 'EXPIRED');
      assert.equal(state.deXuatGia[0].GhiChuDuyet, 'HET_HAN_TTL_120_PHUT');
      assert.equal(state.khuVuc[101].GiaVeNiemYet, 1500000);
      assert.equal(state.nhatKyGia.length, 0);
    }
  });

  it('thứ tự kiểm tra: quyền trước giá, trạng thái trước TTL, TTL trước giá đã đổi', () => {
    const s0 = duyetState({ dx: { ThoiGianDeXuat: at(-500) } });
    s0.khuVuc[101].GiaVeNiemYet = 1550000;
    assert.equal(duyet(s0, { nguoiDung: NGUOI_KHAC_TO_CHUC, giaDieuChinh: NaN }).result.loi.status, 403);
    assert.equal(duyet(s0, { giaDieuChinh: NaN }).result.loi.ma, 'GIA_DUYET_KHONG_HOP_LE');
    assert.equal(duyet(s0).result.ketQua, 'HET_HAN');
    const daXuLy = duyetState({ dx: { ThoiGianDeXuat: at(-500), TrangThaiDuyet: 'EXPIRED' } });
    assert.equal(duyet(daXuLy).result.loi.ma, 'DE_XUAT_DA_XU_LY');
  });

  it('liên kết quy tắc sai → 403 như 42501', () => {
    const s0 = duyetState({ dx: { QuyTacGiaID: 999 } });
    assert.equal(duyet(s0).result.loi.status, 403);
    const khongQuyTac = structuredClone(duyetState());
    delete khongQuyTac.quyTacGia[101];
    assert.equal(tuChoi(khongQuyTac).result.loi.status, 403);
  });

  it('tỷ lệ thay đổi quá lớn và giá hiện hành không hợp lệ', () => {
    const lon = duyetState({ dx: { GiaHienTai: 1, GiaDeXuat: 1600000 }, mutate: (s) => (s.khuVuc[101].GiaVeNiemYet = 1) });
    assert.equal(duyet(lon).result.loi.ma, 'TY_LE_THAY_DOI_VUOT_GIOI_HAN');
    const khong = duyetState({ dx: { GiaHienTai: 0 }, mutate: (s) => (s.khuVuc[101].GiaVeNiemYet = 0) });
    assert.equal(duyet(khong).result.loi.ma, 'GIA_HIEN_HANH_KHONG_HOP_LE');
  });
});

describe('tuChoiDeXuatGia (mock)', () => {
  it('chỉ đổi trạng thái đề xuất: không đổi giá, không sinh nhật ký giá', () => {
    const s0 = duyetState();
    const truoc = snapshot(s0);
    const { state, result } = tuChoi(s0);
    assert.deepEqual(s0, truoc);
    assert.equal(result.ok, true);
    assert.equal(result.ketQua, 'DA_TU_CHOI');
    assert.equal(result.giaHienHanh, 1500000);
    assert.equal(result.lyDo, 'không phù hợp');
    assert.equal(result.nguoiDuyetId, 'u1');
    assert.equal(state.deXuatGia[0].TrangThaiDuyet, 'REJECTED');
    assert.equal(state.deXuatGia[0].GhiChuDuyet, 'không phù hợp');
    assert.equal(state.khuVuc[101].GiaVeNiemYet, 1500000);
    assert.equal(state.nhatKyGia.length, 0);
    assert.equal(state.seq.nhatKyGia, 0);
    assert.deepEqual(state.nhatKyDinhGia, s0.nhatKyDinhGia);
  });

  it('lý do trống được lưu là null', () => {
    const { result, state } = tuChoi(duyetState(), { lyDo: '  ' });
    assert.equal(result.lyDo, null);
    assert.equal(state.deXuatGia[0].GhiChuDuyet, null);
  });
});

describe('layDeXuatGia (mock)', () => {
  it('chỉ trả khu và đề xuất của sự kiện được phép; 403 với tổ chức khác hoặc sự kiện không tồn tại', () => {
    const s0 = withDeXuat(
      duyetState({ mutate: (s) => { s.khuVuc[101].TenKhuVuc = 'VIP'; } }),
      [],
    );
    const s1 = withDeXuat(withRule(s0, 201), [{ DeXuatID: 2, KhuVucID: 201, GiaHienTai: 1500000, GiaDeXuat: 1600000 }]);
    const r = layDeXuatGia(s1, 1, NGUOI, NOW);
    assert.equal(r.state, s1);
    assert.equal(r.result.ok, true);
    assert.deepEqual(r.result.soLieu.map((x) => x.khu_vuc_id), [101]);
    assert.equal(r.result.soLieu[0].ten_khu_vuc, 'VIP');
    assert.deepEqual(r.result.deXuat.map((d) => d.DeXuatID), [1]);

    for (const [id, nguoi] of [[2, NGUOI], [1, NGUOI_KHAC_TO_CHUC], [99, NGUOI], [1, undefined]]) {
      const lo = layDeXuatGia(s1, id, nguoi, NOW);
      assert.equal(lo.result.ok, false);
      assert.equal(lo.result.loi.status, 403);
    }
    // bản trả về là bản sao: sửa không ảnh hưởng state
    r.result.deXuat[0].GiaDeXuat = 1;
    assert.equal(s1.deXuatGia[0].GiaDeXuat, 1600000);
  });
});

describe('hành vi W2 giữ nguyên sau khi thêm duyệt/từ chối', () => {
  it('createMockState có bảng mới rỗng; simulator và luuDeXuatGia không đổi giá, không sinh nhật ký giá', () => {
    const s0 = build();
    assert.deepEqual(s0.nhatKyGia, []);
    assert.deepEqual(s0.thanhVienToChuc, []);
    assert.equal(s0.seq.nhatKyGia, 0);
    const s1 = withRule(s0);
    const luu = luuDeXuatGia(s1, proposalInput(s1), NOW);
    assert.equal(luu.result.ketQua, 'DA_LUU');
    assert.equal(luu.state.khuVuc[101].GiaVeNiemYet, 1500000);
    assert.equal(luu.state.nhatKyGia.length, 0);
    assert.equal(luu.state.deXuatGia[0].TrangThaiDuyet, 'PENDING');
    assert.ok(luu.state.deXuatGia[0].LyDoDeXuat.startsWith(TIEN_TO_MO_PHONG));
  });
});

// ---------------------------------------------------------------- lưu / đọc lại

const KHOA = 'test.mock.pricing.approval';

function khoGiaLap(initial = null, { setItemLoi = false } = {}) {
  const data = new Map();
  if (initial !== null) data.set(KHOA, initial);
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (setItemLoi) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
}

const taoKho = (macDinh = null) =>
  taoKhoPhienMock({ khoa: KHOA, taoState: (s) => createMockState(s), layKhoMacDinh: () => macDinh });

const seedKho = () => ({
  suKien: { 1: { ...congKhai, ToChucID: 7 } },
  suatDien: { 11: suat() },
  khuVuc: { 101: { SuKienID: 1, SuatDienID: 11, GiaVeNiemYet: 1500000, TongSoGhe: 100 } },
});

const nhatKyGiaMau = (over = {}) => ({
  NhatKyGiaID: 1,
  KhuVucID: 101,
  DeXuatID: 1,
  LoaiBienDong: 'DUYET_DE_XUAT_AI',
  GiaCu: 1500000,
  GiaMoi: 1600000,
  TyLeThayDoiPhanTram: 6.67,
  LyDoThayDoi: '[MÔ PHỎNG] seed',
  NguoiThucHienID: 'u1',
  ThoiGianApDung: NOW,
  nhan: NHAN_MO_PHONG,
  ...over,
});

describe('lưu/đọc lại trạng thái duyệt giá', () => {
  it('lưu sau khi duyệt rồi đọc lại giữ nguyên giá, nhật ký giá và không cảnh báo', () => {
    const storage = khoGiaLap();
    const kho = taoKho(storage);
    const p1 = kho.moPhien({ storage, seed: seedKho(), now: NOW });
    const s0 = withDeXuat(withRule({ ...p1.state, thanhVienToChuc: [{ ToChucID: 7, NguoiDungID: 'u1', VaiTro: 'QUAN_TRI' }] }), [
      { DeXuatID: 1, GiaHienTai: 1500000, GiaDeXuat: 1600000 },
    ]);
    const { state } = duyet(s0);
    kho.luuPhien(p1, state);

    const p2 = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p2.meta.canhBao, null);
    assert.equal(p2.meta.duLieuHong, false);
    assert.equal(kiemTraTrangThaiMoPhong(p2.state), null);
    assert.equal(p2.state.khuVuc[101].GiaVeNiemYet, 1600000);
    assert.equal(p2.state.nhatKyGia.length, 1);
    assert.equal(p2.state.seq.nhatKyGia, 1);
    assert.equal(duyet(p2.state).result.loi.ma, 'DE_XUAT_DA_XU_LY');
  });

  it('dữ liệu v1 đã lưu (không có bảng mới) được nâng cấp kèm cảnh báo và dùng được', () => {
    const v1 = createMockState(seedKho());
    delete v1.nhatKyGia;
    delete v1.thanhVienToChuc;
    delete v1.seq.nhatKyGia;
    assert.equal(kiemTraTrangThaiMoPhong(v1), null);
    const storage = khoGiaLap(JSON.stringify(v1));
    const p = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p.meta.duLieuHong, false);
    assert.equal(p.meta.luuTru, 'LOCAL_STORAGE');
    assert.equal(p.meta.canhBao, CANH_BAO_NANG_CAP_V1);
    assert.match(p.meta.canhBao, /nâng cấp dữ liệu mô phỏng v1/);
    assert.deepEqual(p.state.nhatKyGia, []);
    assert.deepEqual(p.state.thanhVienToChuc, []);
    assert.equal(p.state.seq.nhatKyGia, 0);
    assert.equal(p.state.khuVuc[101].GiaVeNiemYet, 1500000);
    assert.equal(kiemTraTrangThaiMoPhong(p.state), null);
  });

  it('v1 có nhatKyGia nhưng thiếu seq.nhatKyGia → seq = id lớn nhất', () => {
    const v1 = createMockState(seedKho());
    v1.nhatKyGia = [nhatKyGiaMau({ NhatKyGiaID: 4 })];
    delete v1.seq.nhatKyGia;
    const storage = khoGiaLap(JSON.stringify(v1));
    const p = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p.state.seq.nhatKyGia, 4);
    assert.equal(p.meta.canhBao, CANH_BAO_NANG_CAP_V1);
  });

  it('bảng mới sai dạng bị coi là hỏng, đặt lại kèm cảnh báo', () => {
    const mau = [
      ['nhatKyGia', 'x', 'nhatKyGia'],
      ['nhatKyGia', [nhatKyGiaMau({ NhatKyGiaID: 'a' })], 'nhatKyGia[0].NhatKyGiaID'],
      ['nhatKyGia', [nhatKyGiaMau({ ThoiGianApDung: {} })], 'nhatKyGia[0].ThoiGianApDung'],
      ['thanhVienToChuc', {}, 'thanhVienToChuc'],
      ['thanhVienToChuc', [{ ToChucID: 7, NguoiDungID: 5, VaiTro: 'CHU_SO_HUU' }], 'thanhVienToChuc[0].NguoiDungID'],
      ['thanhVienToChuc', [{ NguoiDungID: 'u1', VaiTro: 'CHU_SO_HUU' }], 'thanhVienToChuc[0].ToChucID'],
    ];
    for (const [truong, giaTri, duKien] of mau) {
      const hong = { ...createMockState(seedKho()), [truong]: giaTri };
      assert.equal(kiemTraTrangThaiMoPhong(hong), duKien, duKien);
      const storage = khoGiaLap(JSON.stringify(hong));
      const p = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
      assert.equal(p.meta.duLieuHong, true, duKien);
      assert.ok(p.meta.canhBao.includes(duKien), p.meta.canhBao);
      assert.deepEqual(p.state.nhatKyGia, []);
    }
    const seqSai = createMockState(seedKho());
    seqSai.seq.nhatKyGia = 'x';
    assert.equal(kiemTraTrangThaiMoPhong(seqSai), 'seq.nhatKyGia');
  });

  it('JSON hỏng được đặt lại có cảnh báo; không ném lỗi', () => {
    const storage = khoGiaLap('{not json');
    const p = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p.meta.duLieuHong, true);
    assert.match(p.meta.canhBao, /bị hỏng/);
    assert.equal(p.state.khuVuc[101].GiaVeNiemYet, 1500000);
  });

  it('chỉ lưu được trong bộ nhớ: cảnh báo rõ, phiên sau vẫn thấy kết quả duyệt', () => {
    const storage = khoGiaLap(null, { setItemLoi: true });
    const kho = taoKho(storage);
    const p1 = kho.moPhien({ storage, seed: seedKho(), now: NOW });
    const s0 = withDeXuat(withRule({ ...p1.state, thanhVienToChuc: [{ ToChucID: 7, NguoiDungID: 'u1', VaiTro: 'CHU_SO_HUU' }] }), [
      { DeXuatID: 1, GiaHienTai: 1500000, GiaDeXuat: 1600000 },
    ]);
    const { state } = duyet(s0);
    kho.luuPhien(p1, state);
    assert.equal(p1.meta.luuTru, 'BO_NHO');
    assert.match(p1.meta.canhBao, /chỉ giữ trong bộ nhớ/);
    assert.equal(storage.data.size, 0);

    const p2 = kho.moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p2.meta.luuTru, 'BO_NHO');
    assert.ok(p2.meta.canhBao);
    assert.equal(p2.state.khuVuc[101].GiaVeNiemYet, 1600000);
    assert.equal(p2.state.nhatKyGia.length, 1);
  });
});

describe('kiem tra nhatKyGia va seq (review 1)', () => {
  it('phát hiện đủ mọi trường nhatKyGia sai/thiếu theo MockNhatKyGiaRow và phục hồi kèm cảnh báo', () => {
    const thieuLyDo = nhatKyGiaMau();
    delete thieuLyDo.LyDoThayDoi;
    const thieuThoiGian = nhatKyGiaMau();
    delete thieuThoiGian.ThoiGianApDung;

    const cacMauSai = [
      [thieuLyDo, 'nhatKyGia[0].LyDoThayDoi'],
      [nhatKyGiaMau({ GiaCu: 'broken' }), 'nhatKyGia[0].GiaCu'],
      [nhatKyGiaMau({ GiaMoi: null }), 'nhatKyGia[0].GiaMoi'],
      [nhatKyGiaMau({ TyLeThayDoiPhanTram: '6.67' }), 'nhatKyGia[0].TyLeThayDoiPhanTram'],
      [nhatKyGiaMau({ DeXuatID: '1' }), 'nhatKyGia[0].DeXuatID'],
      [nhatKyGiaMau({ LoaiBienDong: 'TU_DONG' }), 'nhatKyGia[0].LoaiBienDong'],
      [nhatKyGiaMau({ NguoiThucHienID: 99 }), 'nhatKyGia[0].NguoiThucHienID'],
      [thieuThoiGian, 'nhatKyGia[0].ThoiGianApDung'],
      [nhatKyGiaMau({ ThoiGianApDung: null }), 'nhatKyGia[0].ThoiGianApDung'],
      [nhatKyGiaMau({ ThoiGianApDung: 'invalid' }), 'nhatKyGia[0].ThoiGianApDung'],
      [nhatKyGiaMau({ nhan: 'KHAC' }), 'nhatKyGia[0].nhan'],
    ];

    for (const [dongSai, duongDan] of cacMauSai) {
      const hong = { ...createMockState(seedKho()), nhatKyGia: [dongSai] };
      assert.equal(kiemTraTrangThaiMoPhong(hong), duongDan, duongDan);
      const storage = khoGiaLap(JSON.stringify(hong));
      const p = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
      assert.equal(p.meta.duLieuHong, true, duongDan);
      assert.ok(p.meta.canhBao.includes('nhatKyGia[0]'), p.meta.canhBao);
      assert.ok(p.meta.canhBao.includes(duongDan.split('.').pop()), p.meta.canhBao);
      assert.deepEqual(p.state.nhatKyGia, []);
    }

    // DeXuatID = null và DIEU_CHINH_THU_CONG là hợp lệ
    const hopLeNull = {
      ...createMockState(seedKho()),
      nhatKyGia: [nhatKyGiaMau({ DeXuatID: null, LoaiBienDong: 'DIEU_CHINH_THU_CONG' })],
      seq: { quyTacGia: 0, deXuatGia: 0, nhatKyDinhGia: 0, nhatKyGia: 1 },
    };
    assert.equal(kiemTraTrangThaiMoPhong(hopLeNull), null);
  });

  it('v2 đầy đủ có nhật ký ID=1 nhưng seq.nhatKyGia=0 → nâng seq lên >=1 kèm cảnh báo, không sửa input', () => {
    const v2SeqThap = {
      ...createMockState(seedKho()),
      nhatKyGia: [nhatKyGiaMau({ NhatKyGiaID: 1 })],
      seq: { quyTacGia: 0, deXuatGia: 0, nhatKyDinhGia: 0, nhatKyGia: 0 },
    };
    const banChup = snapshot(v2SeqThap);
    const kq = nangCapTrangThaiV1(v2SeqThap);
    assert.deepEqual(v2SeqThap, banChup);
    assert.equal(kq.daNangCap, true);
    assert.equal(kq.canhBao, CANH_BAO_KHOI_PHUC_SEQ);
    assert.ok(kq.state.seq.nhatKyGia >= 1);

    const storage = khoGiaLap(JSON.stringify(v2SeqThap));
    const p = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p.meta.duLieuHong, false);
    assert.ok(p.state.seq.nhatKyGia >= 1);
    assert.equal(p.meta.canhBao, CANH_BAO_KHOI_PHUC_SEQ);
  });

  it('nangCapTrangThaiV1 kẹp cả 4 bộ đếm seq và giữ nguyên nếu đã hợp lệ', () => {
    const s0 = withRule(createMockState(seedKho()));
    const quyTacId = s0.quyTacGia[101].QuyTacGiaID;
    const sauDuyet = duyet(
      withDeXuat(
        { ...s0, thanhVienToChuc: [{ ToChucID: 7, NguoiDungID: 'u1', VaiTro: 'QUAN_TRI' }] },
        [{ DeXuatID: 5, GiaHienTai: 1500000, GiaDeXuat: 1600000 }],
      ),
      { deXuatId: 5 },
    ).state;
    const thap = {
      ...sauDuyet,
      seq: { quyTacGia: 0, deXuatGia: 1, nhatKyDinhGia: 0, nhatKyGia: 0 },
    };
    const kq = nangCapTrangThaiV1(thap);
    assert.equal(kq.daNangCap, true);
    assert.equal(kq.canhBao, CANH_BAO_KHOI_PHUC_SEQ);
    assert.equal(kq.state.seq.quyTacGia, quyTacId);
    assert.equal(kq.state.seq.deXuatGia, 5);
    assert.equal(kq.state.seq.nhatKyDinhGia, sauDuyet.nhatKyDinhGia[sauDuyet.nhatKyDinhGia.length - 1].NhatKyDinhGiaID);
    assert.equal(kq.state.seq.nhatKyGia, 1);

    // Dữ liệu v2 đã đúng seq → không cảnh báo
    const dung = nangCapTrangThaiV1(kq.state);
    assert.equal(dung.daNangCap, false);
    assert.equal(dung.canhBao, undefined);
    const pDung = taoKho().moPhien({ storage: khoGiaLap(JSON.stringify(kq.state)), seed: seedKho(), now: NOW });
    assert.equal(pDung.meta.duLieuHong, false);
    assert.equal(pDung.meta.canhBao, null);
  });

  it('END-TO-END: nạp state v2 có nhatKyGia ID=1 nhưng seq=0 rồi duyệt PENDING → NhatKyGiaID=2, không trùng ID', () => {
    const base = withRule(createMockState(seedKho()));
    const daCoLog = withDeXuat(
      {
        ...base,
        thanhVienToChuc: [{ ToChucID: 7, NguoiDungID: 'u1', VaiTro: 'QUAN_TRI' }],
        nhatKyGia: [nhatKyGiaMau({ NhatKyGiaID: 1, DeXuatID: 9 })],
      },
      [{ DeXuatID: 10, GiaHienTai: 1500000, GiaDeXuat: 1650000 }],
    );
    daCoLog.seq.nhatKyGia = 0;

    const storage = khoGiaLap(JSON.stringify(daCoLog));
    const kho = taoKho(storage);
    const p1 = kho.moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p1.meta.duLieuHong, false);
    assert.equal(p1.state.seq.nhatKyGia, 1);
    assert.ok(p1.meta.canhBao);

    const { state, result } = duyetDeXuatGia(
      p1.state,
      { deXuatId: 10, ghiChu: 'duyệt tiếp', nguoiDung: NGUOI },
      NOW,
    );
    assert.equal(result.ok, true);
    assert.equal(result.nhatKyGiaId, 2);
    kho.luuPhien(p1, state);

    const ids = state.nhatKyGia.map((r) => r.NhatKyGiaID);
    assert.deepEqual(ids, [1, 2]);
    assert.equal(new Set(ids).size, ids.length);

    const p2 = taoKho(storage).moPhien({ storage, seed: seedKho(), now: NOW });
    assert.equal(p2.meta.canhBao, null);
    assert.equal(p2.state.seq.nhatKyGia, 2);
    assert.deepEqual(p2.state.nhatKyGia.map((r) => r.NhatKyGiaID), [1, 2]);
  });

  it('v1 không có bảng mới vẫn nâng cấp kèm CANH_BAO_NANG_CAP_V1', () => {
    const v1 = createMockState(seedKho());
    delete v1.nhatKyGia;
    delete v1.thanhVienToChuc;
    delete v1.seq.nhatKyGia;
    const p = taoKho().moPhien({ storage: khoGiaLap(JSON.stringify(v1)), seed: seedKho(), now: NOW });
    assert.equal(p.meta.duLieuHong, false);
    assert.equal(p.meta.canhBao, CANH_BAO_NANG_CAP_V1);
    assert.deepEqual(p.state.nhatKyGia, []);
    assert.deepEqual(p.state.thanhVienToChuc, []);
    assert.equal(p.state.seq.nhatKyGia, 0);
  });
});
