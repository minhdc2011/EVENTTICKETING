import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {
  approveAdjustedPriceProposal,
  approvePriceProposal,
  classifyProposalError,
  computePercentChange,
  createPricingSession,
  formatFillRate,
  formatHoursRemaining,
  formatPriceVnd,
  formatSignedPercent,
  formatVelocityRatio,
  isProposalExpired,
  loadPriceProposals,
  normalizeProposals,
  rejectPriceProposal,
  reloadAfter,
  validateAdjustedPriceForm,
} from '../src/components/organizer-ui/priceProposalsController.js';
import {PricingServiceError, ghepDanhSachDeXuat} from '../src/domain/pricingServiceCore.js';
import {
  createMockState,
  deXuatTuDong,
  duyetDeXuatGia as duyetMock,
  layDeXuatGia,
  tuChoiDeXuatGia as tuChoiMock,
} from '../src/domain/mockPricing.js';
import {
  DEMO_KHU_IDS,
  DEMO_NGUOI_DUNG,
  DEMO_SU_KIEN_ID,
  DEMO_TO_CHUC_ID,
  khoiTaoDemoPricing,
} from '../src/domain/pricingMockDemo.js';

const NOW = '2026-11-21T10:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const EVENT = {id: DEMO_SU_KIEN_ID, organizationId: DEMO_TO_CHUC_ID};
const ORG = [{organizationId: DEMO_TO_CHUC_ID, role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'}];

function allText(value) {
  return JSON.stringify(value);
}

// ---------------------------------------------------------------- dựng dịch vụ trên mock T5
function loiMock(loi) {
  return new PricingServiceError(loi.ma, loi.ma === 'KHONG_CO_QUYEN' ? '42501' : null, {
    status: loi.status,
    ma: loi.ma,
    chiTiet: loi.chiTiet ?? null,
  });
}

function makeMockServices({nguoiDung = DEMO_NGUOI_DUNG, now = NOW, seed} = {}) {
  const box = {
    state: seed ?? khoiTaoDemoPricing(createMockState(), NOW),
    calls: {list: 0, approve: [], reject: []},
  };
  const services = {
    async layDanhSachDeXuat(suKienId) {
      box.calls.list += 1;
      const {result} = layDeXuatGia(box.state, suKienId, nguoiDung, now);
      if (result.ok === false) throw loiMock(result.loi);
      return {nguon: 'MO_PHONG', luuTru: null, suKienId, khuVuc: ghepDanhSachDeXuat(result.soLieu, result.deXuat, now)};
    },
    async duyetDeXuatGia(deXuatId, params = {}) {
      box.calls.approve.push({deXuatId, params});
      const {state, result} = duyetMock(
        box.state,
        {deXuatId, ghiChu: params.ghiChu ?? null, giaDieuChinh: params.giaDieuChinh, nguoiDung},
        now,
      );
      box.state = state;
      if (result.ok === false && result.loi) throw loiMock(result.loi);
      return result;
    },
    async tuChoiDeXuatGia(deXuatId, params = {}) {
      box.calls.reject.push({deXuatId, params});
      const {state, result} = tuChoiMock(box.state, {deXuatId, lyDo: params.lyDo ?? null, nguoiDung}, now);
      box.state = state;
      if (result.ok === false && result.loi) throw loiMock(result.loi);
      return result;
    },
  };
  return {box, services};
}

/** Thêm một đề xuất PENDING xác định cho khu demo đầu tiên (giá mặc định nằm trong khung [1.050.000, 2.250.000]). */
function withPending(state, {deXuatId = 5001, giaDeXuat = 1_600_000, thoiGianDeXuat = NOW, giaHienTai} = {}) {
  const khuId = DEMO_KHU_IDS[0];
  const next = structuredClone(state);
  next.deXuatGia.push({
    DeXuatID: deXuatId,
    KhuVucID: khuId,
    QuyTacGiaID: next.quyTacGia[khuId].QuyTacGiaID,
    TrangThaiDuyet: 'PENDING',
    GiaHienTai: giaHienTai ?? next.khuVuc[khuId].GiaVeNiemYet,
    GiaDeXuat: giaDeXuat,
    TyLeLapDay: 0.45,
    TocDoBanThucTe: 3,
    TocDoBanKyVong: 2,
    SoGioConLai: 48,
    LoaiCanhBao: 'BINH_THUONG',
    CoCanhBaoVuotKhung: false,
    LyDoDeXuat: 'Thử nghiệm',
    ThoiGianDeXuat: thoiGianDeXuat,
  });
  next.seq.deXuatGia = Math.max(next.seq.deXuatGia ?? 0, deXuatId);
  return next;
}

function seedWithPending(opts) {
  return withPending(khoiTaoDemoPricing(createMockState(), NOW), opts);
}

// ---------------------------------------------------------------- định dạng an toàn
test('định dạng số không bao giờ trả NaN hoặc Infinity', () => {
  const bad = [NaN, Infinity, -Infinity, null, undefined, 'abc', {}];
  for (const v of bad) {
    for (const fn of [formatPriceVnd, formatSignedPercent, formatFillRate, formatVelocityRatio, formatHoursRemaining]) {
      const out = fn(v);
      assert.equal(out, '—', `${fn.name}(${String(v)})`);
      assert.ok(!/NaN|Infinity/.test(out));
    }
  }
  assert.equal(formatPriceVnd(1250000), '1.250.000 đ');
  assert.equal(formatSignedPercent(12.5), '+12,5%');
  assert.equal(formatSignedPercent(-8), '-8%');
  assert.equal(formatFillRate(0.455), '45,5%');
  assert.equal(formatVelocityRatio(1.25), '1,25 lần');
  assert.equal(formatHoursRemaining(36), '36 giờ');
  assert.equal(formatHoursRemaining(-1), 'Đã kết thúc');
});

test('computePercentChange bảo vệ giá hiện tại <= 0 hoặc thiếu', () => {
  assert.equal(computePercentChange(1000, 1100), 10);
  assert.equal(computePercentChange(1000, 900), -10);
  assert.equal(computePercentChange(0, 900), null);
  assert.equal(computePercentChange(null, 900), null);
  assert.equal(computePercentChange(1000, NaN), null);
});

// ---------------------------------------------------------------- chuẩn hóa danh sách
function khuMau(over = {}, dxOver = {}) {
  return {
    khuVucId: 11,
    suatDienId: 21,
    maKhuVuc: 'VIP',
    tenKhuVuc: 'Khu VIP',
    giaHienHanh: 1_000_000,
    dangMoBan: true,
    quyTac: {quyTacGiaId: 1, kichHoat: true, giaSan: 700_000, giaTran: 1_500_000},
    r: 0.3,
    u: null,
    tRem: 20,
    deXuat: [
      {
        deXuatId: 1,
        trangThai: 'PENDING',
        giaHienTai: 1_000_000,
        giaDeXuat: 1_100_000,
        giaTinhToanTho: null,
        tyLeLapDay: null,
        tocDoThucTe: null,
        tocDoKyVong: null,
        soGioConLai: null,
        loaiCanhBao: 'CHAM_GIA_TRAN',
        coCanhBaoVuotKhung: true,
        lyDo: null,
        thoiGianDeXuat: '2026-11-21T09:00:00.000Z',
        hetHanLuc: '2026-11-21T11:00:00.000Z',
        conHieuLuc: true,
        ...dxOver,
      },
      {deXuatId: 2, trangThai: 'APPROVED', giaHienTai: 1, giaDeXuat: 2, hetHanLuc: null, conHieuLuc: false},
    ],
    ...over,
  };
}

test('normalizeProposals chỉ lấy PENDING và gắn thông tin khu, giá, khung, cảnh báo chữ', () => {
  const items = normalizeProposals({khuVuc: [khuMau()]}, NOW);
  assert.equal(items.length, 1);
  const [it] = items;
  assert.equal(it.nhanKhu, 'Khu VIP (VIP)');
  assert.equal(it.suatDienId, 21);
  assert.equal(it.giaDaThayDoi, false);
  assert.equal(it.canhBaoGiaDoi, null);
  assert.equal(it.phanTramDoi, 10);
  assert.equal(it.huongDoi, 'TANG');
  assert.equal(it.nhanHuongDoi, 'Tăng');
  assert.equal(it.r, 0.3);
  assert.equal(it.tRem, 20);
  assert.deepEqual(it.khung, {giaSan: 700_000, giaTran: 1_500_000});
  assert.equal(it.hienThi.khung, '700.000 đ – 1.500.000 đ');
  assert.deepEqual(
    it.canhBao.map((c) => c.nhan),
    ['Chạm giá trần', 'Vượt khung giá'],
  );
  assert.equal(it.daQuaHan, false);
});

test('giá niêm yết khác giá lúc đề xuất được gắn cờ và cảnh báo bằng chữ', () => {
  const [it] = normalizeProposals({khuVuc: [khuMau({giaHienHanh: 1_200_000})]}, NOW);
  assert.equal(it.giaDaThayDoi, true);
  assert.match(it.canhBaoGiaDoi, /khác giá lúc đề xuất/);
  const [thieu] = normalizeProposals({khuVuc: [khuMau({giaHienHanh: null})]}, NOW);
  assert.equal(thieu.giaDaThayDoi, false);
});

test('u: ưu tiên u của khu, tính từ tốc độ khi mẫu số > 0, ngược lại null và hiển thị an toàn', () => {
  const dxTocDo = {tocDoThucTe: 3, tocDoKyVong: 2};
  assert.equal(normalizeProposals({khuVuc: [khuMau({u: 0.5}, dxTocDo)]}, NOW)[0].u, 0.5);
  assert.equal(normalizeProposals({khuVuc: [khuMau({u: null}, dxTocDo)]}, NOW)[0].u, 1.5);
  for (const hong of [
    {tocDoThucTe: 3, tocDoKyVong: 0},
    {tocDoThucTe: 3, tocDoKyVong: -1},
    {tocDoThucTe: NaN, tocDoKyVong: 2},
    {tocDoThucTe: Infinity, tocDoKyVong: 2},
    {tocDoThucTe: 3, tocDoKyVong: null},
  ]) {
    const [it] = normalizeProposals({khuVuc: [khuMau({u: null}, hong)]}, NOW);
    assert.equal(it.u, null);
    assert.equal(it.hienThi.u, '—');
    assert.ok(!/NaN|Infinity/.test(allText(it.hienThi)));
  }
  const [inf] = normalizeProposals({khuVuc: [khuMau({u: Infinity, r: NaN, tRem: NaN})]}, NOW);
  assert.equal(inf.u, null);
  assert.equal(inf.r, null);
  assert.equal(inf.tRem, null);
  assert.ok(!/NaN|Infinity/.test(allText(inf.hienThi)));
});

test('r ưu tiên tyLeLapDay hợp lệ, T_rem ưu tiên soGioConLai', () => {
  const [a] = normalizeProposals({khuVuc: [khuMau({}, {tyLeLapDay: 0.8, soGioConLai: 5})]}, NOW);
  assert.equal(a.r, 0.8);
  assert.equal(a.tRem, 5);
  const [b] = normalizeProposals({khuVuc: [khuMau({}, {tyLeLapDay: NaN})]}, NOW);
  assert.equal(b.r, 0.3);
  assert.equal(b.tRem, 20);
});

test('isProposalExpired: đúng mốc còn hiệu lực, quá mốc là quá hạn, thiếu hạn dựa vào conHieuLuc', () => {
  const han = '2026-11-21T10:00:00.000Z';
  assert.equal(isProposalExpired({hetHanLuc: han, conHieuLuc: true}, NOW_MS), false);
  assert.equal(isProposalExpired({hetHanLuc: han, conHieuLuc: true}, NOW_MS + 1), true);
  assert.equal(isProposalExpired({hetHanLuc: null, conHieuLuc: false}, NOW_MS), true);
  assert.equal(isProposalExpired({hetHanLuc: null, conHieuLuc: true}, NOW_MS), false);
  const [it] = normalizeProposals({khuVuc: [khuMau()]}, '2026-11-21T11:00:01.000Z');
  assert.equal(it.daQuaHan, true);
  assert.match(it.canhBaoHetHan, /quá hạn/);
});

// ---------------------------------------------------------------- biểu mẫu điều chỉnh
const CTX = {giaSan: 700_000, giaTran: 1_500_000, giaHienHanh: 1_000_000, giaHienTai: 1_000_000};

test('validateAdjustedPriceForm: hợp lệ trả params đã chuẩn hóa', () => {
  const r = validateAdjustedPriceForm({giaDieuChinh: ' 1050000 ', ghiChu: '  Điều chỉnh theo thị trường '}, CTX);
  assert.equal(r.ok, true);
  assert.deepEqual(r.params, {giaDieuChinh: 1_050_000, ghiChu: 'Điều chỉnh theo thị trường'});
  assert.equal(r.firstInvalidField, null);
});

test('validateAdjustedPriceForm: từng loại lỗi', () => {
  for (const v of ['', 'abc', 'NaN', 'Infinity', null, undefined, '1e999']) {
    const r = validateAdjustedPriceForm({giaDieuChinh: v, ghiChu: 'x'}, CTX);
    assert.equal(r.ok, false, String(v));
    assert.equal(r.firstInvalidField, 'giaDieuChinh');
    assert.ok(!/NaN|Infinity/.test(r.errors.giaDieuChinh));
  }
  assert.equal(validateAdjustedPriceForm({giaDieuChinh: '0', ghiChu: 'x'}, CTX).ok, false);
  assert.equal(validateAdjustedPriceForm({giaDieuChinh: '-5', ghiChu: 'x'}, CTX).ok, false);

  const thap = validateAdjustedPriceForm({giaDieuChinh: '600000', ghiChu: 'x'}, CTX);
  assert.equal(thap.ok, false);
  assert.deepEqual(thap.errors.khung, {giaSan: 700_000, giaTran: 1_500_000});
  assert.match(thap.errors.giaDieuChinh, /700\.000 đ.*1\.500\.000 đ/);
  assert.equal(validateAdjustedPriceForm({giaDieuChinh: '1500001', ghiChu: 'x'}, CTX).ok, false);
  // biên khung hợp lệ
  assert.equal(validateAdjustedPriceForm({giaDieuChinh: '700000', ghiChu: 'x'}, CTX).ok, true);
  assert.equal(validateAdjustedPriceForm({giaDieuChinh: '1500000', ghiChu: 'x'}, CTX).ok, true);

  const trung = validateAdjustedPriceForm({giaDieuChinh: '1000000', ghiChu: 'x'}, CTX);
  assert.equal(trung.ok, false);
  assert.match(trung.errors.giaDieuChinh, /khác giá niêm yết/);

  const thieuLyDo = validateAdjustedPriceForm({giaDieuChinh: '1050000', ghiChu: '   '}, CTX);
  assert.equal(thieuLyDo.ok, false);
  assert.equal(thieuLyDo.firstInvalidField, 'ghiChu');
  assert.ok(thieuLyDo.errors.ghiChu);
  assert.equal(thieuLyDo.params, null);

  const ca2 = validateAdjustedPriceForm({}, CTX);
  assert.equal(ca2.firstInvalidField, 'giaDieuChinh');
  assert.ok(ca2.errors.ghiChu);
});

// ---------------------------------------------------------------- phân loại lỗi
test('classifyProposalError tách 403, ngoài khung, hết hạn, xung đột và lỗi 422 khác', () => {
  const f = classifyProposalError(new PricingServiceError('x', '42501', {status: 403, ma: 'KHONG_CO_QUYEN'}));
  assert.equal(f.status, 'forbidden_error');

  const ngoai = classifyProposalError(
    new PricingServiceError('NGOAI_KHUNG_GIA', '22023', {
      status: 422,
      ma: 'NGOAI_KHUNG_GIA',
      chiTiet: {giaSan: 700_000, giaTran: 1_500_000},
    }),
  );
  assert.equal(ngoai.status, 'out_of_bounds');
  assert.deepEqual(ngoai.khung, {giaSan: 700_000, giaTran: 1_500_000});
  assert.match(ngoai.message, /700\.000 đ/);

  const nho = classifyProposalError(new PricingServiceError('THIEU_LY_DO_DIEU_CHINH', '22023', {status: 422, ma: 'THIEU_LY_DO_DIEU_CHINH'}));
  assert.equal(nho.status, 'validation_error');
  assert.match(nho.message, /lý do/);

  const daXuLy = classifyProposalError(
    new PricingServiceError('DE_XUAT_DA_XU_LY', '40001', {status: 409, ma: 'DE_XUAT_DA_XU_LY', chiTiet: {trangThai: 'APPROVED'}}),
  );
  assert.equal(daXuLy.status, 'conflict');
  assert.equal(daXuLy.canReload, true);
  assert.match(daXuLy.message, /APPROVED/);

  const giaDoi = classifyProposalError(new PricingServiceError('GIA_DA_THAY_DOI', '40001', {status: 409, ma: 'GIA_DA_THAY_DOI'}));
  assert.equal(giaDoi.status, 'conflict');
  assert.match(giaDoi.message, /Giá niêm yết đã thay đổi/);

  assert.equal(classifyProposalError(new PricingServiceError('h', null, {ma: 'DE_XUAT_HET_HAN'})).status, 'expired');
  assert.equal(classifyProposalError(new Error('mạng lỗi')).status, 'error');
  assert.equal(classifyProposalError(new Error('mạng lỗi')).message, 'mạng lỗi');
});

// ---------------------------------------------------------------- tích hợp mock T5
test('mock T5: người dùng demo tải được danh sách; deXuatTuDong tạo đề xuất chuẩn hóa không có NaN', async () => {
  let state = khoiTaoDemoPricing(createMockState(), NOW);
  for (const khuId of DEMO_KHU_IDS) {
    state = deXuatTuDong(state, khuId, NOW).state;
  }
  const {services} = makeMockServices({seed: state});
  const out = await loadPriceProposals(createPricingSession(), services, {activeOrg: ORG, event: EVENT, now: NOW});
  assert.equal(out.status, 'ok');
  assert.equal(out.result.suKienId, DEMO_SU_KIEN_ID);
  assert.ok(out.proposals.every((p) => DEMO_KHU_IDS.includes(p.khuVucId)));
  assert.ok(!/NaN|Infinity/.test(allText(out.proposals.map((p) => p.hienThi))));
});

test('mock T5: người dùng lạ nhận lỗi 403 riêng, không phải lỗi chung', async () => {
  const {services} = makeMockServices({nguoiDung: {id: 'ke-la', loaiTaiKhoan: 'ORGANIZER'}});
  const out = await loadPriceProposals(createPricingSession(), services, {activeOrg: ORG, event: EVENT, now: NOW});
  assert.equal(out.status, 'forbidden_error');
  assert.match(out.message, /không có quyền/i);
});

test('thiếu quyền ở giao diện: không gọi dịch vụ ở bất kỳ thao tác nào', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending()});
  const noOrg = {activeOrg: [{organizationId: 'org-khac', role: 'CHU_SO_HUU', accountKind: 'ORGANIZER'}], event: EVENT};
  const session = createPricingSession();
  assert.equal((await loadPriceProposals(session, services, noOrg)).status, 'forbidden');
  assert.equal((await approvePriceProposal(session, services, {...noOrg, deXuatId: 5001})).status, 'forbidden');
  assert.equal(
    (await approveAdjustedPriceProposal(session, services, {
      ...noOrg,
      deXuatId: 5001,
      formValues: {giaDieuChinh: '1050000', ghiChu: 'x'},
      context: CTX,
    })).status,
    'forbidden',
  );
  assert.equal((await rejectPriceProposal(session, services, {...noOrg, deXuatId: 5001})).status, 'forbidden');
  const vaiTroThap = {activeOrg: [{organizationId: DEMO_TO_CHUC_ID, role: 'THANH_VIEN', accountKind: 'ORGANIZER'}], event: EVENT};
  assert.equal((await rejectPriceProposal(session, services, {...vaiTroThap, deXuatId: 5001})).status, 'forbidden');
  assert.equal(box.calls.list, 0);
  assert.equal(box.calls.approve.length, 0);
  assert.equal(box.calls.reject.length, 0);
});

test('duyệt thành công trên mock: đổi giá, tải lại danh sách và số liệu', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending({giaDeXuat: 1_100_000})});
  const session = createPricingSession();
  let reloads = 0;
  let metrics = 0;
  const out = await approvePriceProposal(session, services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: async () => {
      reloads += 1;
    },
    refreshMetrics: () => {
      metrics += 1;
    },
  });
  assert.equal(out.status, 'approved');
  assert.equal(out.result.giaMoi, 1_100_000);
  assert.equal(out.result.loaiBienDong, 'DUYET_DE_XUAT_AI');
  assert.equal(box.state.khuVuc[DEMO_KHU_IDS[0]].GiaVeNiemYet, 1_100_000);
  assert.equal(reloads, 1);
  assert.equal(metrics, 1);
  assert.equal(out.reloaded, true);
  assert.match(out.message, /Đã duyệt/);
  assert.equal(session.busy, false);
  // Sau khi duyệt, danh sách không còn PENDING
  const after = await loadPriceProposals(session, services, {activeOrg: ORG, event: EVENT, now: NOW});
  assert.equal(after.proposals.length, 0);
});

test('duyệt với giá điều chỉnh: gửi giá + lý do, loại biến động thủ công', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending({giaDeXuat: 1_100_000})});
  const giaHienHanh = box.state.khuVuc[DEMO_KHU_IDS[0]].GiaVeNiemYet;
  const khung = box.state.quyTacGia[DEMO_KHU_IDS[0]];
  const gia = Math.min(khung.GiaTran, giaHienHanh + 50_000);
  const out = await approveAdjustedPriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    formValues: {giaDieuChinh: String(gia), ghiChu: ' Theo nhu cầu '},
    context: {giaSan: khung.GiaSan, giaTran: khung.GiaTran, giaHienHanh, giaHienTai: giaHienHanh},
  });
  assert.equal(out.status, 'approved');
  assert.equal(out.result.loaiBienDong, 'DIEU_CHINH_THU_CONG');
  assert.deepEqual(box.calls.approve[0].params, {giaDieuChinh: gia, ghiChu: 'Theo nhu cầu'});
});

test('duyệt điều chỉnh với biểu mẫu sai không gọi dịch vụ và không khóa phiên', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending()});
  const session = createPricingSession();
  const out = await approveAdjustedPriceProposal(session, services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    formValues: {giaDieuChinh: '1', ghiChu: ''},
    context: CTX,
  });
  assert.equal(out.status, 'invalid');
  assert.ok(out.errors.giaDieuChinh && out.errors.ghiChu);
  assert.equal(box.calls.approve.length, 0);
  assert.equal(session.busy, false);
});

test('ngoài khung do máy chủ (mock): trả out_of_bounds kèm khung, không tải lại, không tự thử lại', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending()});
  const khung = box.state.quyTacGia[DEMO_KHU_IDS[0]];
  let reloads = 0;
  // Bỏ qua kiểm tra biểu mẫu bằng cách đưa ngữ cảnh khung rộng để mô phỏng giao diện lỗi thời.
  const out = await approveAdjustedPriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    formValues: {giaDieuChinh: String(khung.GiaTran + 1000), ghiChu: 'x'},
    context: {giaSan: 1, giaTran: 1e9, giaHienHanh: 1, giaHienTai: 1},
    onReload: () => {
      reloads += 1;
    },
  });
  assert.equal(out.status, 'out_of_bounds');
  assert.deepEqual(out.khung, {giaSan: khung.GiaSan, giaTran: khung.GiaTran});
  assert.equal(box.calls.approve.length, 1);
  assert.equal(reloads, 0);
});

test('xung đột 409 GIA_DA_THAY_DOI: canReload, không tải lại tự động, không gọi duyệt lần hai', async () => {
  // Giá niêm yết hiện hành khác GiaHienTai lúc đề xuất.
  const {box, services} = makeMockServices({seed: seedWithPending({giaHienTai: 999_999})});
  let reloads = 0;
  const out = await approvePriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: () => {
      reloads += 1;
    },
  });
  assert.equal(out.status, 'conflict');
  assert.equal(out.ma, 'GIA_DA_THAY_DOI');
  assert.equal(out.canReload, true);
  assert.equal(box.calls.approve.length, 1);
  assert.equal(reloads, 0);
  // Danh sách vẫn thể hiện cờ giá đã thay đổi
  const list = await loadPriceProposals(createPricingSession(), services, {activeOrg: ORG, event: EVENT, now: NOW});
  assert.equal(list.proposals[0].giaDaThayDoi, true);
});

test('xung đột 409 DE_XUAT_DA_XU_LY khi duyệt đề xuất đã được từ chối', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending()});
  const session = createPricingSession();
  assert.equal((await rejectPriceProposal(session, services, {activeOrg: ORG, event: EVENT, deXuatId: 5001})).status, 'rejected');
  const out = await approvePriceProposal(session, services, {activeOrg: ORG, event: EVENT, deXuatId: 5001});
  assert.equal(out.status, 'conflict');
  assert.equal(out.ma, 'DE_XUAT_DA_XU_LY');
  assert.equal(out.trangThai, 'REJECTED');
  assert.equal(box.calls.approve.length, 1);
});

test('hết hạn (ketQua HET_HAN trả về, không ném): status expired và tự tải lại danh sách', async () => {
  const quaHan = '2026-11-21T07:00:00.000Z'; // TTL 120 phút đã qua so với NOW
  const {services} = makeMockServices({seed: seedWithPending({thoiGianDeXuat: quaHan})});
  let reloads = 0;
  const out = await approvePriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: () => {
      reloads += 1;
    },
  });
  assert.equal(out.status, 'expired');
  assert.equal(out.canReload, true);
  assert.match(out.message, /hết hạn/);
  assert.ok(out.hetHanLuc);
  assert.equal(reloads, 1);
  // Từ chối đề xuất hết hạn cũng cùng kết quả (đề xuất đã chuyển EXPIRED nên lần sau là xung đột, không phải expired)
  const {services: s2} = makeMockServices({seed: seedWithPending({thoiGianDeXuat: quaHan})});
  const rj = await rejectPriceProposal(createPricingSession(), s2, {activeOrg: ORG, event: EVENT, deXuatId: 5001, onReload: () => {}});
  assert.equal(rj.status, 'expired');
});

test('hết hạn do dịch vụ ném lỗi DE_XUAT_HET_HAN cũng được xử lý như expired', async () => {
  const services = {
    duyetDeXuatGia: async () => {
      throw new PricingServiceError('het han', null, {ma: 'DE_XUAT_HET_HAN'});
    },
  };
  let reloads = 0;
  const out = await approvePriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 1,
    onReload: () => {
      reloads += 1;
    },
  });
  assert.equal(out.status, 'expired');
  assert.equal(reloads, 1);
});

test('lỗi 403 từ máy chủ khi duyệt: forbidden_error riêng, không tải lại', async () => {
  const {services} = makeMockServices({seed: seedWithPending(), nguoiDung: {id: 'ke-la', loaiTaiKhoan: 'ORGANIZER'}});
  let reloads = 0;
  const out = await approvePriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: () => {
      reloads += 1;
    },
  });
  assert.equal(out.status, 'forbidden_error');
  assert.equal(reloads, 0);
});

test('từ chối: lý do không bắt buộc; để trống không gửi lyDo, có lý do thì gửi bản đã cắt khoảng trắng', async () => {
  const a = makeMockServices({seed: seedWithPending()});
  const outA = await rejectPriceProposal(createPricingSession(), a.services, {activeOrg: ORG, event: EVENT, deXuatId: 5001, lyDo: '   '});
  assert.equal(outA.status, 'rejected');
  assert.deepEqual(a.box.calls.reject[0].params, {});
  assert.equal(a.box.state.deXuatGia.find((d) => d.DeXuatID === 5001).TrangThaiDuyet, 'REJECTED');

  const b = makeMockServices({seed: seedWithPending()});
  const outB = await rejectPriceProposal(createPricingSession(), b.services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    lyDo: '  Giá quá cao  ',
  });
  assert.equal(outB.status, 'rejected');
  assert.deepEqual(b.box.calls.reject[0].params, {lyDo: 'Giá quá cao'});
  // Từ chối không đổi giá niêm yết
  assert.equal(b.box.state.khuVuc[DEMO_KHU_IDS[0]].GiaVeNiemYet, a.box.state.khuVuc[DEMO_KHU_IDS[0]].GiaVeNiemYet);
});

// ---------------------------------------------------------------- chống gửi lặp & phiên
test('chống gửi lặp: lần gọi thứ hai khi đang xử lý trả busy và dịch vụ chỉ được gọi một lần', async () => {
  let release;
  let calls = 0;
  const services = {
    duyetDeXuatGia: () => {
      calls += 1;
      return new Promise((resolve) => {
        release = () =>
          resolve({ok: true, ketQua: 'DA_DUYET', giaCu: 1000, giaMoi: 1100, tyLeThayDoiPhanTram: 10, loaiBienDong: 'DUYET_DE_XUAT_AI'});
      });
    },
    tuChoiDeXuatGia: async () => ({ok: true, ketQua: 'DA_TU_CHOI'}),
  };
  const session = createPricingSession();
  const ctx = {activeOrg: ORG, event: EVENT, deXuatId: 1};
  const first = approvePriceProposal(session, services, ctx);
  await Promise.resolve();
  const second = await approvePriceProposal(session, services, ctx);
  const third = await rejectPriceProposal(session, services, ctx);
  assert.equal(second.status, 'busy');
  assert.equal(third.status, 'busy');
  release();
  assert.equal((await first).status, 'approved');
  assert.equal(calls, 1);
  assert.equal(session.busy, false);
});

test('phản hồi cũ sau khi đổi phiên bị bỏ qua (stale) và không gọi tải lại', async () => {
  let release;
  const services = {
    duyetDeXuatGia: () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ok: true, ketQua: 'DA_DUYET', giaCu: 1000, giaMoi: 1100, tyLeThayDoiPhanTram: 10, loaiBienDong: 'DUYET_DE_XUAT_AI'});
      }),
  };
  const session = createPricingSession();
  let reloads = 0;
  const pending = approvePriceProposal(session, services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 1,
    onReload: () => {
      reloads += 1;
    },
  });
  await Promise.resolve();
  session.reset();
  release();
  assert.equal((await pending).status, 'stale');
  assert.equal(reloads, 0);
});

test('tải danh sách: yêu cầu mới hơn thay thế yêu cầu cũ (kênh proposals)', async () => {
  const resolvers = [];
  const services = {
    layDanhSachDeXuat: () => new Promise((resolve) => resolvers.push(resolve)),
  };
  const session = createPricingSession();
  const a = loadPriceProposals(session, services, {activeOrg: ORG, event: EVENT});
  const b = loadPriceProposals(session, services, {activeOrg: ORG, event: EVENT});
  resolvers[0]({suKienId: 1, khuVuc: []});
  resolvers[1]({suKienId: 1, khuVuc: []});
  assert.equal((await a).status, 'stale');
  assert.equal((await b).status, 'ok');
});

test('lỗi tải lại sau thành công được báo bằng reloadFailed, không làm mất kết quả duyệt', async () => {
  const {services} = makeMockServices({seed: seedWithPending()});
  const out = await approvePriceProposal(createPricingSession(), services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: async () => {
      throw new Error('mạng');
    },
  });
  assert.equal(out.status, 'approved');
  assert.equal(out.reloadFailed, true);
  assert.equal(out.reloaded, false);
});

test('reloadAfter: kết quả tải lại thất bại không ném vẫn được tính là lỗi; stale/ok thì không', async () => {
  const failing = [false, {ok: false}, {status: 'error'}, {status: 'forbidden'}, {status: 'forbidden_error'}];
  for (const res of failing) {
    assert.equal(await reloadAfter(async () => res, null), true, allText(res));
    assert.equal(await reloadAfter(null, () => res), true, allText(res));
  }
  for (const res of [undefined, true, {status: 'ok'}, {status: 'stale'}, {ok: true}]) {
    assert.equal(await reloadAfter(async () => res, async () => res), false, allText(res));
  }
  assert.equal(await reloadAfter(() => { throw new Error('x'); }, null), true);
  // Cả hai callback đều được chạy dù callback đầu thất bại.
  let metrics = 0;
  assert.equal(await reloadAfter(async () => false, () => { metrics += 1; }), true);
  assert.equal(metrics, 1);
});

test('duyệt thành công nhưng tải lại trả lỗi (không ném, qua mock T5): reloadFailed=true, reloaded=false', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending()});
  const session = createPricingSession();
  const reloadSession = createPricingSession();
  // Mô phỏng reloadProposals của UI: tải lại thất bại do máy chủ từ chối, trả outcome thay vì ném.
  const failingServices = {
    ...services,
    layDanhSachDeXuat: async () => {
      throw new PricingServiceError('x', '42501', {status: 403, ma: 'KHONG_CO_QUYEN'});
    },
  };
  const out = await approvePriceProposal(session, services, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: () => loadPriceProposals(reloadSession, failingServices, {activeOrg: ORG, event: EVENT, now: NOW}),
  });
  assert.equal(out.status, 'approved');
  assert.equal(out.reloadFailed, true);
  assert.equal(out.reloaded, false);
  assert.equal(box.calls.approve.length, 1);

  // Tải lại thành công thì không báo lỗi.
  const {services: s2} = makeMockServices({seed: seedWithPending()});
  const ok = await rejectPriceProposal(createPricingSession(), s2, {
    activeOrg: ORG,
    event: EVENT,
    deXuatId: 5001,
    onReload: () => loadPriceProposals(createPricingSession(), s2, {activeOrg: ORG, event: EVENT, now: NOW}),
  });
  assert.equal(ok.status, 'rejected');
  assert.equal(ok.reloadFailed, false);
  assert.equal(ok.reloaded, true);
});

test('deXuatId không hợp lệ trả no_selection và không gọi dịch vụ', async () => {
  let calls = 0;
  const services = {
    duyetDeXuatGia: async () => {
      calls += 1;
    },
    tuChoiDeXuatGia: async () => {
      calls += 1;
    },
  };
  for (const id of [null, undefined, 0, -1, 1.5, '5']) {
    assert.equal((await approvePriceProposal(createPricingSession(), services, {activeOrg: ORG, event: EVENT, deXuatId: id})).status, 'no_selection');
    assert.equal((await rejectPriceProposal(createPricingSession(), services, {activeOrg: ORG, event: EVENT, deXuatId: id})).status, 'no_selection');
  }
  assert.equal(calls, 0);
});

// ---------------------------------------------------------------- kiểm thử render React (hành vi component)
let cachedProposalsComponentPromise = null;
async function loadProposalsComponent() {
  if (!cachedProposalsComponentPromise) {
    cachedProposalsComponentPromise = (async () => {
      const built = await build({
        entryPoints: ['src/components/organizer-ui/OrganizerPriceProposals.tsx'],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        plugins: [
          {
            name: 'test-stubs',
            setup(b) {
              b.onResolve({filter: /^react(\/jsx-runtime)?$/}, (args) => ({
                path: import.meta.resolve(args.path),
                external: true,
              }));
              b.onResolve({filter: /\.css$/}, () => ({path: 'css', namespace: 'stub'}));
              b.onResolve({filter: /services\/pricingService$/}, () => ({path: 'pricingService', namespace: 'stub'}));
              b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
                contents:
                  'export const DEMO_NGUOI_DUNG = {}; export function layDanhSachDeXuat() {} export function duyetDeXuatGia() {} export function tuChoiDeXuatGia() {}',
                loader: 'js',
              }));
            },
          },
        ],
      });
      const modUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`;
      return (await import(modUrl)).OrganizerPriceProposals;
    })();
  }
  return cachedProposalsComponentPromise;
}

function createReactTestDom() {
  const docListeners = new Map();
  class DomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = init.bubbles ?? true;
      this.cancelable = init.cancelable ?? true;
      this.key = init.key;
      this.shiftKey = Boolean(init.shiftKey);
      this.defaultPrevented = false;
      this._stopped = false;
      this.target = null;
      this.currentTarget = null;
      this._path = [];
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {
      this._stopped = true;
    }
    stopImmediatePropagation() {
      this._stopped = true;
    }
    composedPath() {
      return this._path;
    }
  }

  class DomNode {
    constructor(nodeType, doc) {
      this.nodeType = nodeType;
      this.ownerDocument = doc;
      this.parentNode = null;
      this.childNodes = [];
      this._listeners = new Map();
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.childNodes[0] ?? null;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] ?? null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement || cur === doc) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    appendChild(child) {
      return this.insertBefore(child, null);
    }
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (ref == null) {
        this.childNodes.push(child);
      } else {
        const idx = this.childNodes.indexOf(ref);
        if (idx >= 0) this.childNodes.splice(idx, 0, child);
        else this.childNodes.push(child);
      }
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    replaceChild(newChild, oldChild) {
      this.insertBefore(newChild, oldChild);
      this.removeChild(oldChild);
      return oldChild;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      const path = [];
      for (let cur = this; cur; cur = cur.parentNode) path.push(cur);
      path.push(doc);
      event._path = path;
      for (const node of path) {
        if (event._stopped) break;
        event.currentTarget = node;
        const set = node === doc ? docListeners.get(event.type) : node._listeners.get(event.type);
        if (set) {
          for (const fn of [...set]) fn.call(node, event);
        }
        if (!event.bubbles) break;
      }
      return !event.defaultPrevented;
    }
    contains(other) {
      for (let cur = other; cur; cur = cur.parentNode) {
        if (cur === this) return true;
      }
      return false;
    }
  }

  class DomText extends DomNode {
    constructor(text, doc) {
      super(3, doc);
      this.nodeName = '#text';
      this._text = String(text);
    }
    get nodeValue() {
      return this._text;
    }
    set nodeValue(v) {
      this._text = String(v);
    }
    get textContent() {
      return this._text;
    }
    set textContent(v) {
      this._text = String(v);
    }
  }

  class DomComment extends DomNode {
    constructor(text, doc) {
      super(8, doc);
      this.nodeName = '#comment';
      this.data = String(text);
    }
  }

  class DomElement extends DomNode {
    constructor(tag, doc, ns = 'http://www.w3.org/1999/xhtml') {
      super(1, doc);
      this.tagName = String(tag).toUpperCase();
      this.nodeName = this.tagName;
      this.namespaceURI = ns;
      this._attrs = new Map();
      this.style = {};
      this.dataset = {};
      this.disabled = false;
      this.hidden = false;
      this.inert = false;
      this._value = '';
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get id() {
      return this._attrs.get('id') ?? '';
    }
    set id(v) {
      this.setAttribute('id', v);
    }
    get className() {
      return this._attrs.get('class') ?? '';
    }
    set className(v) {
      if (v === '' || v == null) this.removeAttribute('class');
      else this.setAttribute('class', v);
    }
    get type() {
      return this._attrs.get('type') ?? (this.tagName === 'BUTTON' ? 'submit' : 'text');
    }
    set type(v) {
      this.setAttribute('type', v);
    }
    get tabIndex() {
      const raw = this._attrs.get('tabindex');
      return raw != null ? Number.parseInt(raw, 10) : -1;
    }
    set tabIndex(v) {
      this.setAttribute('tabindex', String(v));
    }
    get value() {
      return this._value;
    }
    set value(v) {
      this._value = String(v ?? '');
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent ?? '').join('');
    }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(new DomText(String(v), this.ownerDocument));
    }
    setAttribute(name, value) {
      const k = String(name).toLowerCase();
      this._attrs.set(k, String(value));
      if (k === 'disabled') this.disabled = true;
      if (k === 'hidden') this.hidden = true;
      if (k === 'inert') this.inert = true;
    }
    getAttribute(name) {
      const k = String(name).toLowerCase();
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    hasAttribute(name) {
      return this._attrs.has(String(name).toLowerCase());
    }
    removeAttribute(name) {
      const k = String(name).toLowerCase();
      this._attrs.delete(k);
      if (k === 'disabled') this.disabled = false;
      if (k === 'hidden') this.hidden = false;
      if (k === 'inert') this.inert = false;
    }
    descendants() {
      const out = [];
      for (const c of this.children) out.push(c, ...c.descendants());
      return out;
    }
    matchesSimple(part) {
      const p = part.trim();
      if (!p) return false;
      if (p === 'a[href]' || p === 'area[href]') {
        return this.tagName === p.split('[')[0].toUpperCase() && this.hasAttribute('href');
      }
      if (p === '[tabindex]') return this.hasAttribute('tabindex');
      if (p === '[contenteditable="true"]') return this.getAttribute('contenteditable') === 'true';
      if (p === '[role="dialog"]') return this.getAttribute('role') === 'dialog';
      if (p === '[hidden]') return this.hidden || this.hasAttribute('hidden');
      if (p === '[inert]') return this.inert || this.hasAttribute('inert');
      if (p === 'fieldset[disabled]') return this.tagName === 'FIELDSET' && this.disabled;
      if (p.startsWith('.')) return this.className.split(/\s+/).includes(p.slice(1));
      if (p.startsWith('#')) return this.id === p.slice(1);
      return this.tagName.toLowerCase() === p.toLowerCase();
    }
    closest(selector) {
      const parts = String(selector).split(',');
      for (let cur = this; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (parts.some((p) => cur.matchesSimple(p))) return cur;
      }
      return null;
    }
    querySelectorAll(selector) {
      const parts = String(selector).split(',');
      return this.descendants().filter((el) => parts.some((p) => el.matchesSimple(p)));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    focus() {
      if (!this.isConnected || this.disabled || this.closest('[hidden],[inert],fieldset[disabled]')) return;
      doc.activeElement = this;
      this.dispatchEvent(new DomEvent('focusin', {bubbles: true}));
    }
  }

  class DomIFrameElement extends DomElement {}

  const doc = {
    nodeType: 9,
    activeElement: null,
    documentElement: null,
    body: null,
    defaultView: null,
    createElement: (tag) => new DomElement(tag, doc),
    createElementNS: (ns, tag) => new DomElement(tag, doc, ns),
    createTextNode: (t) => new DomText(t, doc),
    createComment: (t) => new DomComment(t, doc),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    querySelectorAll: (sel) => doc.body.querySelectorAll(sel),
    querySelector: (sel) => doc.body.querySelector(sel),
    getElementById: (id) => doc.body.querySelector(`#${id}`),
  };
  const html = new DomElement('html', doc);
  const body = new DomElement('body', doc);
  html.appendChild(body);
  doc.documentElement = html;
  doc.body = body;
  doc.activeElement = body;
  const win = {
    document: doc,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    getComputedStyle: () => ({display: 'block', visibility: 'visible'}),
    HTMLElement: DomElement,
    HTMLIFrameElement: DomIFrameElement,
    SVGElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    Event: DomEvent,
  };
  doc.defaultView = win;

  function click(el) {
    if (!el || el.disabled) return;
    const ev = new DomEvent('click', {bubbles: true, cancelable: true});
    el.dispatchEvent(ev);
    if (!ev.defaultPrevented && el.tagName === 'BUTTON' && el.type === 'submit') {
      const form = el.closest('form');
      if (form) form.dispatchEvent(new DomEvent('submit', {bubbles: true, cancelable: true}));
    }
  }

  return {doc, win, body, click, DomEvent};
}

async function withMountedProposals(initialProps, fn) {
  const OrganizerPriceProposals = await loadProposalsComponent();
  const dom = createReactTestDom();
  const prev = {
    actEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLIFrameElement: globalThis.HTMLIFrameElement,
    SVGElement: globalThis.SVGElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = dom.win;
  globalThis.document = dom.doc;
  globalThis.HTMLElement = dom.win.HTMLElement;
  globalThis.HTMLIFrameElement = dom.win.HTMLIFrameElement;
  globalThis.SVGElement = dom.win.SVGElement;
  globalThis.Element = dom.win.Element;
  globalThis.Node = dom.win.Node;

  const container = dom.doc.createElement('div');
  dom.body.appendChild(container);
  const root = createRoot(container);

  const renderProps = async (props) => {
    await act(async () => {
      root.render(React.createElement(OrganizerPriceProposals, props));
    });
  };
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  try {
    await renderProps(initialProps);
    await flush();
    await fn({container, dom, renderProps, flush});
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prev.actEnv;
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.HTMLElement = prev.HTMLElement;
    globalThis.HTMLIFrameElement = prev.HTMLIFrameElement;
    globalThis.SVGElement = prev.SVGElement;
    globalThis.Element = prev.Element;
    globalThis.Node = prev.Node;
  }
}

test('React render: không truyền prop rows chỉ tải danh sách một lần và không lặp gọi API', async () => {
  const {box, services} = makeMockServices({seed: seedWithPending()});
  await withMountedProposals({event: EVENT, activeOrg: ORG, services}, async ({container, flush}) => {
    await flush();
    await flush();
    assert.equal(box.calls.list, 1);
    assert.equal(container.querySelectorAll('.org-proposal-card').length, 1);
  });
});

test('React render: thu hồi quyền trên cùng organizationId/event.id đóng dialog, xóa danh sách, chặn render và vô hiệu request đang bay', async () => {
  let resolveList;
  let resolveApprove;
  let listCalls = 0;
  let listPhase = 0;
  const {services: mockBase} = makeMockServices({seed: seedWithPending()});
  const services = {
    layDanhSachDeXuat(suKienId) {
      listCalls += 1;
      listPhase += 1;
      if (listPhase === 1) return mockBase.layDanhSachDeXuat(suKienId);
      return new Promise((resolve) => {
        resolveList = () => resolve(mockBase.layDanhSachDeXuat(suKienId));
      });
    },
    duyetDeXuatGia() {
      return new Promise((resolve) => {
        resolveApprove = () =>
          resolve({
            ok: true,
            ketQua: 'DA_DUYET',
            giaCu: 1_500_000,
            giaMoi: 1_600_000,
            tyLeThayDoiPhanTram: 6.67,
            loaiBienDong: 'DUYET_DE_XUAT_AI',
          });
      });
    },
    tuChoiDeXuatGia: mockBase.tuChoiDeXuatGia,
  };

  await withMountedProposals({event: EVENT, activeOrg: ORG, services}, async ({container, dom, renderProps, flush}) => {
    assert.equal(listCalls, 1);
    const cards = container.querySelectorAll('.org-proposal-card');
    assert.equal(cards.length, 1);

    // Mở hộp thoại duyệt và kích hoạt request đang bay.
    const approveBtn = cards[0].querySelectorAll('button').find((b) => b.textContent.includes('Duyệt'));
    approveBtn.focus();
    await act(async () => {
      dom.click(approveBtn);
    });
    assert.ok(container.querySelector('[role="dialog"]'));

    const submitBtn = container.querySelector('[role="dialog"]').querySelectorAll('button').find((b) => b.type === 'submit');
    await act(async () => {
      dom.click(submitBtn);
    });
    assert.ok(resolveApprove);

    // Thu hồi quyền trên CÙNG organizationId và event.id (vai trò xuống BIEN_TAP).
    const downgradedOrg = [{organizationId: DEMO_TO_CHUC_ID, role: 'BIEN_TAP', accountKind: 'ORGANIZER'}];
    await renderProps({event: EVENT, activeOrg: downgradedOrg, services});

    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(container.querySelectorAll('.org-proposal-card').length, 0);
    assert.equal(container.querySelector('.org-proposals-reload-btn'), null);
    assert.match(container.textContent, /không có quyền/i);
    // Không có nút tải lại nên focus chuyển về tiêu đề khu vực.
    assert.equal(dom.doc.activeElement, container.querySelector('#pricing-proposals-title'));

    // Phản hồi duyệt đang bay hoàn tất sau khi thu hồi quyền bị bỏ qua hoàn toàn (không tải lại, không hiện banner).
    resolveApprove();
    await flush();
    assert.equal(listCalls, 1);
    assert.equal(container.querySelectorAll('.org-proposal-card').length, 0);
    assert.equal(container.querySelector('.org-alert-success'), null);
    assert.equal(resolveList, undefined);
  });
});

test('React render: request tải danh sách đang bay bị vô hiệu khi thu hồi quyền cùng org/event', async () => {
  let resolveList;
  const {services: mockBase} = makeMockServices({seed: seedWithPending()});
  const services = {
    ...mockBase,
    layDanhSachDeXuat(suKienId) {
      return new Promise((resolve) => {
        resolveList = () => resolve(mockBase.layDanhSachDeXuat(suKienId));
      });
    },
  };

  await withMountedProposals({event: EVENT, activeOrg: ORG, services}, async ({container, renderProps, flush}) => {
    assert.ok(resolveList);
    const downgradedOrg = [{organizationId: DEMO_TO_CHUC_ID, role: 'BIEN_TAP', accountKind: 'ORGANIZER'}];
    await renderProps({event: EVENT, activeOrg: downgradedOrg, services});
    resolveList();
    await flush();
    assert.equal(container.querySelectorAll('.org-proposal-card').length, 0);
    assert.match(container.textContent, /không có quyền/i);
  });
});

test('React render: duyệt xóa card chứa nút mở dialog, đóng dialog chuyển focus về nút tải lại', async () => {
  const {services} = makeMockServices({seed: seedWithPending()});
  await withMountedProposals({event: EVENT, activeOrg: ORG, services}, async ({container, dom, flush}) => {
    const card = container.querySelector('.org-proposal-card');
    assert.ok(card);
    const approveBtn = card.querySelectorAll('button').find((b) => b.textContent.includes('Duyệt'));
    approveBtn.focus();
    assert.equal(dom.doc.activeElement, approveBtn);

    await act(async () => {
      dom.click(approveBtn);
    });
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.ok(dialog.contains(dom.doc.activeElement));

    const submitBtn = dialog.querySelectorAll('button').find((b) => b.type === 'submit');
    await act(async () => {
      dom.click(submitBtn);
    });
    await flush();

    // Card opener đã bị gỡ khỏi DOM, dialog đã đóng, focus chuyển về nút tải lại.
    assert.equal(approveBtn.isConnected, false);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(container.querySelectorAll('.org-proposal-card').length, 0);
    const reloadBtn = container.querySelector('.org-proposals-reload-btn');
    assert.ok(reloadBtn);
    assert.equal(dom.doc.activeElement, reloadBtn);
  });
});

test('React render: lỗi tải lại sau khi duyệt thành công hiện banner cảnh báo và nút tải lại thủ công', async () => {
  const {services: mockBase} = makeMockServices({seed: seedWithPending()});
  let listAttempt = 0;
  let shouldFailReload = true;
  const services = {
    ...mockBase,
    async layDanhSachDeXuat(suKienId) {
      listAttempt += 1;
      if (listAttempt === 2 && shouldFailReload) {
        throw new Error('Mất kết nối máy chủ');
      }
      return mockBase.layDanhSachDeXuat(suKienId);
    },
  };

  await withMountedProposals({event: EVENT, activeOrg: ORG, services}, async ({container, dom, flush}) => {
    const card = container.querySelector('.org-proposal-card');
    const approveBtn = card.querySelectorAll('button').find((b) => b.textContent.includes('Duyệt'));
    await act(async () => {
      dom.click(approveBtn);
    });
    const submitBtn = container.querySelector('[role="dialog"]').querySelectorAll('button').find((b) => b.type === 'submit');
    await act(async () => {
      dom.click(submitBtn);
    });
    await flush();

    assert.equal(container.querySelector('[role="dialog"]'), null);
    const warnBanner = container.querySelector('.org-alert-warning');
    assert.ok(warnBanner, 'phải hiện banner cảnh báo khi tải lại thất bại');
    assert.match(warnBanner.textContent, /không tải lại được danh sách mới/i);
    const retryBtn = container.querySelector('.org-proposals-feedback-actions').querySelector('button');
    assert.ok(retryBtn);

    // Bấm thử lại từ banner khi dịch vụ phục hồi.
    shouldFailReload = false;
    await act(async () => {
      dom.click(retryBtn);
    });
    await flush();
    assert.equal(listAttempt, 3);
    assert.equal(container.querySelector('.org-alert-warning'), null);
  });
});
