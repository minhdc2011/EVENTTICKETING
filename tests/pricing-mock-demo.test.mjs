import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMockState,
  dangMoBan,
  deXuatTuDong,
  duyetDeXuatGia,
  layDeXuatGia,
  luuQuyTacGia,
  moPhongNhuCau,
} from '../src/domain/mockPricing.js';
import {
  DEMO_KHU_IDS,
  DEMO_NGUOI_DUNG,
  DEMO_SLUG,
  DEMO_SUAT_ID,
  DEMO_SU_KIEN_ID,
  docGiaDemo,
  ghepSuKienWorkspaceDemo,
  khoiTaoDemoPricing,
  laSuKienDemo,
  taoCatalogDemo,
  taoSeedDemo,
  taoSuKienWorkspaceDemo,
  taoTiersDemo,
} from '../src/domain/pricingMockDemo.js';

const NOW = '2026-11-21T10:00:00.000Z';
const MOC_THOI_GIAN = [NOW, '2027-06-01T03:30:00.000Z', '2030-02-15T00:00:00.000Z', Date.UTC(2035, 0, 1)];

function stateKhac() {
  return createMockState({
    suKien: {7: {TrangThaiCongBo: 'CONG_KHAI', moPhong: false, ToChucID: 'mock-org-1'}},
    suatDien: {
      8: {SuKienID: 7, TrangThai: 'MO_BAN', ThoiGianMoBanVe: '2026-11-01T00:00:00.000Z', ThoiGianDongBanVe: null, ThoiGianBatDau: '2026-12-01T00:00:00.000Z'},
    },
    khuVuc: {9: {SuKienID: 7, SuatDienID: 8, GiaVeNiemYet: 300000, TongSoGhe: 5}},
    ghe: [{GheID: 9001, KhuVucID: 9, TrangThai: 'TRONG', NgayCapNhatTrangThai: null}],
    quyTacGia: {
      9: {QuyTacGiaID: 40, KhuVucID: 9, GiaGoc: 300000, GiaSan: 200000, GiaTran: 400000, BuocNhayGia: 10000, BienDoToiDaMoiChuKy: 0.2, NguongLapDayThap: 0.3, NguongLapDayCao: 0.6, TrongSoLapDay: 1, TrongSoTocDoBan: 1, TrongSoThoiGian: 1, TrangThaiKichHoat: true, NgayTao: NOW, NgayCapNhat: NOW},
    },
    deXuatGia: [{DeXuatID: 55, QuyTacGiaID: 40, KhuVucID: 9, GiaDeXuat: 320000, TrangThaiDuyet: 'PENDING', ThoiGianDeXuat: NOW}],
    nhatKyDinhGia: [{NhatKyDinhGiaID: 70, SuKienID: 7, KhuVucID: 9, LoaiHanhDong: 'TAO_QUY_TAC', ThoiGian: NOW}],
    nhatKyGia: [{NhatKyGiaID: 12, KhuVucID: 9, GiaCu: 1, GiaMoi: 2}],
    thanhVienToChuc: [{ToChucID: 'mock-org-2', NguoiDungID: 'u2', VaiTro: 'CHU_SO_HUU'}],
  });
}

test('laSuKienDemo nhận id số, chuỗi số và slug', () => {
  assert.equal(laSuKienDemo(DEMO_SU_KIEN_ID), true);
  assert.equal(laSuKienDemo(String(DEMO_SU_KIEN_ID)), true);
  assert.equal(laSuKienDemo(DEMO_SLUG), true);
  assert.equal(laSuKienDemo(7), false);
  assert.equal(laSuKienDemo('super-concert-2026'), false);
  assert.equal(laSuKienDemo(undefined), false);
});

test('định danh khớp giữa workspace, pricing, bảng giá và catalog', () => {
  const state = khoiTaoDemoPricing(createMockState(), NOW);
  const ws = taoSuKienWorkspaceDemo(NOW);
  assert.equal(ws.id, DEMO_SU_KIEN_ID);
  assert.equal(ws.slug, DEMO_SLUG);
  assert.equal(ws.organizationId, 'mock-org-1');
  assert.equal(ws.moPhong, true);
  assert.equal(ws.shows[0].showId, DEMO_SUAT_ID);
  assert.ok(state.suKien[DEMO_SU_KIEN_ID]);
  assert.equal(state.suatDien[DEMO_SUAT_ID].SuKienID, DEMO_SU_KIEN_ID);
  assert.equal(state.suKien[DEMO_SU_KIEN_ID].moPhong, true);

  const tierIds = ws.shows[0].ticketTiers.map((t) => t.tierId);
  assert.deepEqual(tierIds, [...DEMO_KHU_IDS]);
  assert.deepEqual(Object.keys(state.khuVuc).map(Number), [...DEMO_KHU_IDS]);

  const catalog = taoCatalogDemo(state);
  const tiers = taoTiersDemo(state);
  assert.deepEqual(tiers.map((t) => t.id), [...DEMO_KHU_IDS]);
  assert.deepEqual(catalog.zones.map((z) => z.KhuVucID), [...DEMO_KHU_IDS]);
  for (const khu of DEMO_KHU_IDS) {
    const kv = state.khuVuc[khu];
    assert.equal(kv.SuatDienID, DEMO_SUAT_ID);
    assert.equal(kv.SuKienID, DEMO_SU_KIEN_ID);
    const tierWs = ws.shows[0].ticketTiers.find((t) => t.tierId === khu);
    assert.equal(tierWs.price, kv.GiaVeNiemYet);
    assert.equal(tiers.find((t) => t.id === khu).price, kv.GiaVeNiemYet);
    assert.equal(catalog.zones.find((z) => z.KhuVucID === khu).GiaVeNiemYet, kv.GiaVeNiemYet);
    const gheKhu = state.ghe.filter((g) => g.KhuVucID === khu);
    const seatsKhu = catalog.seats.filter((s) => s.KhuVucID === khu);
    assert.equal(gheKhu.length, kv.TongSoGhe);
    assert.deepEqual(seatsKhu.map((s) => s.GheID), gheKhu.map((g) => g.GheID));
    for (const g of gheKhu) assert.ok(Math.floor(g.GheID / 1000) === khu);
    assert.ok(seatsKhu.every((s) => s.GiaVeNiemYet === kv.GiaVeNiemYet));
    assert.ok(state.quyTacGia[khu].KhuVucID === khu);
  }
});

test('mọi tên và bản ghi demo có nhãn mô phỏng', () => {
  const seed = taoSeedDemo(NOW);
  const ws = taoSuKienWorkspaceDemo(NOW);
  assert.ok(ws.name.startsWith('[MÔ PHỎNG]'));
  assert.ok(seed.suKien[DEMO_SU_KIEN_ID].TenSuKien.startsWith('[MÔ PHỎNG]'));
  for (const kv of Object.values(seed.khuVuc)) {
    assert.ok(kv.TenKhuVuc.startsWith('[MÔ PHỎNG]'));
    assert.equal(kv.moPhong, true);
  }
  for (const t of ws.shows[0].ticketTiers) assert.ok(t.name.startsWith('[MÔ PHỎNG]'));
});

test('khởi tạo lặp cho kết quả tương đương và không nhân đôi dòng', () => {
  const mot = khoiTaoDemoPricing(stateKhac(), NOW);
  const hai = khoiTaoDemoPricing(mot, NOW);
  assert.deepEqual(hai, mot);
  assert.equal(hai.ghe.filter((g) => DEMO_KHU_IDS.includes(g.KhuVucID)).length, 60);
  assert.equal(hai.thanhVienToChuc.filter((m) => m.NguoiDungID === 'mock-user').length, 1);
  assert.equal(Object.keys(hai.quyTacGia).length, 4);
  const ids = Object.values(hai.quyTacGia).map((r) => r.QuyTacGiaID);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(hai.seq.quyTacGia >= Math.max(...ids));
});

test('khôi phục đưa demo về giá mẫu nhưng bảo toàn dữ liệu khác', () => {
  const dau = stateKhac();
  const truoc = structuredClone(dau);
  let state = khoiTaoDemoPricing(dau, NOW);
  assert.deepEqual(dau, truoc, 'không mutate đầu vào');

  const khu = DEMO_KHU_IDS[0];
  const saved = deXuatTuDong(state, khu, NOW);
  assert.equal(saved.result.ketQua, 'DA_LUU');
  state = saved.state;
  const duyet = duyetDeXuatGia(state, {deXuatId: saved.result.deXuatId, ghiChu: 'ok', nguoiDung: DEMO_NGUOI_DUNG}, NOW);
  assert.equal(duyet.result.ok, true);
  state = duyet.state;
  assert.notEqual(state.khuVuc[khu].GiaVeNiemYet, taoSeedDemo(NOW).khuVuc[khu].GiaVeNiemYet);

  const khoiPhuc = khoiTaoDemoPricing(state, NOW);
  assert.equal(khoiPhuc.khuVuc[khu].GiaVeNiemYet, taoSeedDemo(NOW).khuVuc[khu].GiaVeNiemYet);
  assert.equal(khoiPhuc.deXuatGia.filter((d) => DEMO_KHU_IDS.includes(d.KhuVucID)).length, 0);
  assert.equal(khoiPhuc.nhatKyGia.filter((d) => DEMO_KHU_IDS.includes(d.KhuVucID)).length, 0);
  assert.equal(khoiPhuc.nhatKyDinhGia.filter((d) => d.SuKienID === DEMO_SU_KIEN_ID).length, 0);

  // Sự kiện/khu/đề xuất/nhật ký/thành viên khác còn nguyên.
  assert.deepEqual(khoiPhuc.suKien[7], truoc.suKien[7]);
  assert.deepEqual(khoiPhuc.suatDien[8], truoc.suatDien[8]);
  assert.deepEqual(khoiPhuc.khuVuc[9], truoc.khuVuc[9]);
  assert.deepEqual(khoiPhuc.quyTacGia[9], truoc.quyTacGia[9]);
  assert.deepEqual(khoiPhuc.ghe.filter((g) => g.KhuVucID === 9), truoc.ghe);
  assert.deepEqual(khoiPhuc.deXuatGia, truoc.deXuatGia);
  assert.deepEqual(khoiPhuc.nhatKyDinhGia, truoc.nhatKyDinhGia);
  assert.deepEqual(khoiPhuc.nhatKyGia, truoc.nhatKyGia);
  assert.ok(khoiPhuc.thanhVienToChuc.some((m) => m.ToChucID === 'mock-org-2'));
  assert.ok(khoiPhuc.seq.deXuatGia >= 55);
  assert.ok(khoiPhuc.seq.nhatKyDinhGia >= 70);
  assert.ok(khoiPhuc.seq.nhatKyGia >= 12);
});

test('ghepSuKienWorkspaceDemo thay đúng dòng demo và giữ các sự kiện khác', () => {
  const khac = [{id: 1700000000001, name: 'Sự kiện thật của BTC', slug: 'x'}, {id: 5, name: 'Khác'}];
  const cu = [{id: DEMO_SU_KIEN_ID, name: 'cũ'}, ...khac];
  const moi = ghepSuKienWorkspaceDemo(cu, NOW);
  assert.equal(moi.length, 3);
  assert.equal(moi[0].id, DEMO_SU_KIEN_ID);
  assert.notEqual(moi[0].name, 'cũ');
  assert.deepEqual(moi.slice(1), khac);
  assert.deepEqual(ghepSuKienWorkspaceDemo(moi, NOW), moi);
  assert.equal(ghepSuKienWorkspaceDemo([], NOW).length, 1);
  assert.equal(ghepSuKienWorkspaceDemo(null, NOW).length, 1);
  assert.deepEqual(cu.slice(1), khac, 'không mutate đầu vào');
});

test('suất luôn đang mở bán theo thời điểm khởi tạo, kể cả năm 2030', () => {
  for (const now of MOC_THOI_GIAN) {
    const state = khoiTaoDemoPricing(createMockState(), now);
    assert.equal(dangMoBan(state.suKien[DEMO_SU_KIEN_ID], state.suatDien[DEMO_SUAT_ID], now), true, String(now));
  }
});

test('Chạy ngay: engine + PriceGuard thật lưu đề xuất ở mọi mốc thời gian', () => {
  for (const now of MOC_THOI_GIAN) {
    const state = khoiTaoDemoPricing(createMockState(), now);
    for (const khu of DEMO_KHU_IDS) {
      const r = deXuatTuDong(state, khu, now);
      assert.equal(r.result.ketQua, 'DA_LUU', `${String(now)} khu ${khu}: ${JSON.stringify(r.result.lyDoBoQua ?? r.result.maChan)}`);
      assert.equal(r.result.moPhong, true);
      assert.equal(r.result.engine.shouldPropose, true);
    }
  }
});

test('layDeXuatGia với DEMO_NGUOI_DUNG ok; người khác bị 403', () => {
  const state = khoiTaoDemoPricing(createMockState(), NOW);
  const ok = layDeXuatGia(state, DEMO_SU_KIEN_ID, DEMO_NGUOI_DUNG, NOW);
  assert.equal(ok.result.ok, true);
  assert.equal(ok.result.soLieu.length, 3);
  assert.ok(ok.result.soLieu.every((r) => r.dang_mo_ban && r.mo_phong && r.ten_khu_vuc.startsWith('[MÔ PHỎNG]')));
  const tuChoi = layDeXuatGia(state, DEMO_SU_KIEN_ID, {id: 'ai-do', loaiTaiKhoan: 'ORGANIZER'}, NOW);
  assert.equal(tuChoi.result.ok, false);
  assert.equal(tuChoi.result.loi.status, 403);
});

test('giá được duyệt là giá đọc ra ở bảng giá và catalog', () => {
  let state = khoiTaoDemoPricing(createMockState(), NOW);
  const khu = DEMO_KHU_IDS[1];
  const giaMau = docGiaDemo(state).get(khu);
  const saved = deXuatTuDong(state, khu, NOW);
  assert.equal(saved.result.ketQua, 'DA_LUU');
  state = saved.state;
  // Đề xuất PENDING chưa duyệt: giá khán giả không đổi.
  assert.equal(docGiaDemo(state).get(khu), giaMau);
  assert.equal(taoTiersDemo(state).find((t) => t.id === khu).price, giaMau);

  const duyet = duyetDeXuatGia(state, {deXuatId: saved.result.deXuatId, ghiChu: 'duyệt demo', nguoiDung: DEMO_NGUOI_DUNG}, NOW);
  assert.equal(duyet.result.ok, true);
  const giaMoi = duyet.result.giaMoi;
  assert.notEqual(giaMoi, giaMau);
  state = duyet.state;
  assert.equal(docGiaDemo(state).get(khu), giaMoi);
  assert.equal(taoTiersDemo(state).find((t) => t.id === khu).price, giaMoi);
  const cat = taoCatalogDemo(state);
  assert.equal(cat.zones.find((z) => z.KhuVucID === khu).GiaVeNiemYet, giaMoi);
  assert.ok(cat.seats.filter((s) => s.KhuVucID === khu).every((s) => s.GiaVeNiemYet === giaMoi));
  // Khu khác không đổi.
  assert.equal(docGiaDemo(state).get(DEMO_KHU_IDS[0]), docGiaDemo(khoiTaoDemoPricing(createMockState(), NOW)).get(DEMO_KHU_IDS[0]));
});

test('cấu hình quy tắc, simulator và đề xuất chưa duyệt không đổi giá khán giả', () => {
  const state = khoiTaoDemoPricing(createMockState(), NOW);
  const truoc = [...docGiaDemo(state)];
  const khu = DEMO_KHU_IDS[0];
  const qt = state.quyTacGia[khu];
  const luu = luuQuyTacGia(
    state,
    khu,
    {
      giaGoc: qt.GiaGoc, giaSan: qt.GiaSan, giaTran: qt.GiaTran + 10000, buocNhayGia: 10000, bienDoToiDa: 0.1,
      nguongLapDayThap: 0.3, nguongLapDayCao: 0.6, trongSoLapDay: 1, trongSoTocDoBan: 1, trongSoThoiGian: 1, trangThaiKichHoat: true,
    },
    NOW,
  );
  assert.equal(luu.result.ok, true);
  assert.deepEqual([...docGiaDemo(luu.state)], truoc);

  const sim = moPhongNhuCau(luu.state, DEMO_SU_KIEN_ID, 'ban_nhanh', NOW);
  assert.equal(sim.result.ketQua, 'DA_MO_PHONG');
  assert.deepEqual([...docGiaDemo(sim.state)], truoc);
  assert.deepEqual(taoTiersDemo(sim.state).map((t) => t.price), truoc.map(([, g]) => g));

  const dx = deXuatTuDong(sim.state, DEMO_KHU_IDS[2], NOW);
  assert.ok(['DA_LUU', 'BO_QUA', 'BI_CHAN'].includes(dx.result.ketQua));
  assert.deepEqual([...docGiaDemo(dx.state)], truoc);
});
