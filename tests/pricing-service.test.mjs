import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createMockState, laySoLieuDinhGia, toIso} from '../src/domain/mockPricing.js';
import {
  LY_DO_QUY_TAC_THAY_DOI,
  chayDinhGiaNgayLogic,
  kiemTraTrangThaiMoPhong,
  taoKhoPhienMock,
} from '../src/domain/pricingServiceCore.js';

const KHOA = 'test.pricing.mock';
const NOW = '2026-11-20T10:00:00.000Z';

function seed() {
  return {
    suKien: {1: {TrangThaiCongBo: 'CONG_KHAI', moPhong: true}},
    suatDien: {
      1: {
        SuKienID: 1,
        TrangThai: 'MO_BAN',
        ThoiGianMoBanVe: '2026-11-01T00:00:00.000Z',
        ThoiGianDongBanVe: null,
        ThoiGianBatDau: '2026-12-01T00:00:00.000Z',
      },
    },
    khuVuc: {1: {SuKienID: 1, SuatDienID: 1, GiaVeNiemYet: 100, TongSoGhe: 10}},
    ghe: [{GheID: 1, KhuVucID: 1, TrangThai: 'TRONG', NgayCapNhatTrangThai: null}],
  };
}

function taoKho(storageMacDinh) {
  return taoKhoPhienMock({
    khoa: KHOA,
    taoState: (s) => createMockState(s),
    layKhoMacDinh: () => storageMacDinh ?? null,
  });
}

function khoGiaLap(initial = null, {setItemLoi = false} = {}) {
  const data = new Map();
  if (initial !== null) data.set(KHOA, initial);
  const goi = {getItem: 0, setItem: 0};
  return {
    goi,
    data,
    getItem(k) {
      goi.getItem += 1;
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      goi.setItem += 1;
      if (setItemLoi) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
}

test('trạng thái hợp lệ được chấp nhận', () => {
  assert.equal(kiemTraTrangThaiMoPhong(createMockState(seed())), null);
});

test('khuVuc {"1": null} bị coi là hỏng, đặt lại và có cảnh báo, không ném lỗi', () => {
  const hong = {...createMockState(seed()), khuVuc: {1: null}};
  assert.equal(kiemTraTrangThaiMoPhong(hong), 'khuVuc["1"]');

  const storage = khoGiaLap(JSON.stringify(hong));
  const phien = taoKho().moPhien({storage, seed: seed(), now: NOW});
  assert.equal(phien.meta.duLieuHong, true);
  assert.match(phien.meta.canhBao, /khuVuc\["1"\]/);
  assert.equal(phien.meta.luuTru, 'LOCAL_STORAGE');
  assert.equal(phien.state.khuVuc[1].SuKienID, 1); // đặt lại từ seed
});

test('phần tử mảng sai bị phát hiện kèm đường dẫn trường', () => {
  const base = createMockState(seed());
  const mau = [
    ['ghe', [null], 'ghe[0]'],
    ['ghe', [{GheID: 'x', KhuVucID: 1, TrangThai: 'TRONG'}], 'ghe[0].GheID'],
    ['giuCho', [{SuKienID: 1, SuatDienID: 1, TrangThai: 'ACTIVE', chiTiet: [5]}], 'giuCho[0].chiTiet[0]'],
    ['deXuatGia', [{DeXuatID: 1, KhuVucID: 1}], 'deXuatGia[0].TrangThaiDuyet'],
    ['nhatKyDinhGia', ['x'], 'nhatKyDinhGia[0]'],
    ['moPhongGhe', [{GheID: 1, SuKienID: 1}], 'moPhongGhe[0].SuatDienID'],
    ['suatDien', {1: {SuKienID: 1, TrangThai: 3}}, 'suatDien["1"].TrangThai'],
    ['quyTacGia', {2: {QuyTacGiaID: 2}}, 'quyTacGia["2"].KhuVucID'],
  ];
  for (const [truong, giaTri, duKien] of mau) {
    const hong = {...base, [truong]: giaTri};
    assert.equal(kiemTraTrangThaiMoPhong(hong), duKien, truong);
    const phien = taoKho().moPhien({storage: khoGiaLap(JSON.stringify(hong)), seed: seed(), now: NOW});
    assert.equal(phien.meta.duLieuHong, true, truong);
    assert.ok(phien.meta.canhBao.includes(duKien), truong);
  }
});

const GIA_TRI_THOI_GIAN_SAI = [{bad: true}, 'abc', '', [], true];

function kiemTraTruongThoiGian(duongDan, doi) {
  for (const sai of GIA_TRI_THOI_GIAN_SAI) {
    const hong = createMockState(seed());
    doi(hong, sai);
    const loi = kiemTraTrangThaiMoPhong(hong);
    assert.notEqual(loi, null, `${duongDan}=${JSON.stringify(sai)}`);
    assert.ok(loi.includes(duongDan.split('.').pop()), loi);
    const phien = taoKho().moPhien({storage: khoGiaLap(JSON.stringify(hong)), seed: seed(), now: NOW});
    assert.equal(phien.meta.duLieuHong, true);
    assert.ok(phien.meta.canhBao.includes(duongDan.split('.').pop()), phien.meta.canhBao);
    assert.equal(kiemTraTrangThaiMoPhong(phien.state), null);
    const rows = laySoLieuDinhGia(phien.state, 1, NOW);
    for (const r of rows) {
      for (const k of ['thoi_gian_mo_ban', 'thoi_gian_dong_ban', 'thoi_gian_bat_dau']) {
        if (r[k] !== null && r[k] !== undefined) toIso(r[k]);
      }
    }
  }
}

for (const truong of ['ThoiGianMoBanVe', 'ThoiGianDongBanVe', 'ThoiGianBatDau']) {
  test(`suatDien.${truong} sai kiểu/giá trị bị coi là hỏng và đặt lại`, () => {
    kiemTraTruongThoiGian(`suatDien["1"].${truong}`, (s, sai) => {
      s.suatDien[1][truong] = sai;
    });
  });
}

test('trường thời gian null/thiếu/ISO/epoch ms vẫn hợp lệ', () => {
  for (const giaTri of [null, undefined, '2026-11-01T00:00:00.000Z', 1790000000000]) {
    const s = createMockState(seed());
    s.suatDien[1].ThoiGianMoBanVe = giaTri;
    s.suatDien[1].ThoiGianDongBanVe = giaTri;
    s.suatDien[1].ThoiGianBatDau = giaTri;
    const phien = taoKho().moPhien({storage: khoGiaLap(JSON.stringify(s)), seed: seed(), now: NOW});
    assert.equal(phien.meta.duLieuHong, false);
    assert.equal(phien.meta.canhBao, null);
  }
});

test('trường thời gian phụ sai bị phát hiện', () => {
  kiemTraTruongThoiGian('ghe[0].NgayCapNhatTrangThai', (s, sai) => {
    s.ghe[0].NgayCapNhatTrangThai = sai;
  });
  kiemTraTruongThoiGian('giuCho[0].HetHanLuc', (s, sai) => {
    s.giuCho = [{SuKienID: 1, SuatDienID: 1, TrangThai: 'ACTIVE', HetHanLuc: sai}];
  });
  kiemTraTruongThoiGian('deXuatGia[0].ThoiGianDeXuat', (s, sai) => {
    s.deXuatGia = [{DeXuatID: 1, KhuVucID: 1, TrangThaiDuyet: 'PENDING', ThoiGianDeXuat: sai}];
  });
  kiemTraTruongThoiGian('quyTacGia["1"].NgayCapNhat', (s, sai) => {
    s.quyTacGia = {1: {QuyTacGiaID: 1, KhuVucID: 1, NgayCapNhat: sai}};
  });
  kiemTraTruongThoiGian('moPhongGhe[0].ThoiDiemGiaLap', (s, sai) => {
    s.moPhongGhe = [{GheID: 1, SuKienID: 1, SuatDienID: 1, ThoiDiemGiaLap: sai}];
  });
});

test('JSON hỏng cũng được đặt lại với duLieuHong', () => {
  const phien = taoKho().moPhien({storage: khoGiaLap('{khong phai json'), seed: seed(), now: NOW});
  assert.equal(phien.meta.duLieuHong, true);
});

test('setItem lỗi: lần gọi sau đọc bộ nhớ, không đọc localStorage cũ hay tạo seed mới', () => {
  const cu = createMockState(seed());
  const storage = khoGiaLap(JSON.stringify(cu), {setItemLoi: true});
  const kho = taoKho();

  const p1 = kho.moPhien({storage, seed: seed(), now: NOW});
  assert.equal(p1.meta.luuTru, 'LOCAL_STORAGE');
  const moi = {...p1.state, khuVuc: {1: {...p1.state.khuVuc[1], GiaVeNiemYet: 999}}};
  kho.luuPhien(p1, moi);
  assert.equal(p1.meta.luuTru, 'BO_NHO');
  assert.ok(p1.meta.canhBao);

  const getItemTruoc = storage.goi.getItem;
  const p2 = kho.moPhien({storage, seed: seed(), now: NOW});
  assert.equal(p2.meta.luuTru, 'BO_NHO');
  assert.ok(p2.meta.canhBao);
  assert.equal(p2.state.khuVuc[1].GiaVeNiemYet, 999);
  assert.equal(storage.goi.getItem, getItemTruoc, 'không đọc localStorage cũ');

  kho.datLai();
  const p3 = kho.moPhien({storage, seed: seed(), now: NOW});
  assert.equal(p3.meta.luuTru, 'LOCAL_STORAGE');
  assert.equal(p3.state.khuVuc[1].GiaVeNiemYet, 100);
});

test('không có localStorage: dùng bộ nhớ tạm với cảnh báo và giữ trạng thái', () => {
  const kho = taoKho();
  const p1 = kho.moPhien({storage: null, seed: seed(), now: NOW});
  assert.equal(p1.meta.luuTru, 'BO_NHO');
  kho.luuPhien(p1, {...p1.state, khuVuc: {1: {...p1.state.khuVuc[1], GiaVeNiemYet: 5}}});
  const p2 = kho.moPhien({storage: null, seed: seed(), now: NOW});
  assert.equal(p2.state.khuVuc[1].GiaVeNiemYet, 5);
});

// ------------------------------------------------------------------ chạy ngay: phiên bản quy tắc

function dongSoLieu(extra = {}) {
  return {khu_vuc_id: 1, suat_dien_id: 1, quy_tac_gia_id: 7, dang_mo_ban: true, ...extra};
}

function taoIo({truoc, sau, sauRetry = sau, truocRetry = truoc, rows = [dongSoLieu()]}) {
  const nhatKy = [];
  const doc = [truoc, sau, truocRetry, sauRetry];
  let lanDoc = 0;
  const io = {
    nhatKy,
    luuGoi: [],
    hetHan: async () => {
      nhatKy.push('het_han');
      return {deXuatHetHan: [], soLuong: 0};
    },
    docQuyTac: async () => {
      nhatKy.push('doc_quy_tac');
      return doc[lanDoc++] ?? doc[doc.length - 1];
    },
    soLieu: async () => {
      nhatKy.push('metrics');
      return rows;
    },
    tinh: () => ({shouldPropose: true, skipReasons: [], proposedPrice: 110, intermediate: {rawPrice: 110}}),
    luuDeXuat: async (row, engine, ngay) => {
      nhatKy.push('luu');
      io.luuGoi.push(ngay);
      return {ketQua: 'DA_LUU', deXuatId: 1, giaDeXuat: 110, giaHienTai: 100, loaiCanhBao: 'BINH_THUONG', deXuatHetHan: []};
    },
  };
  return io;
}

const qt = (ngay) => [{QuyTacGiaID: 7, NgayCapNhat: ngay}];

test('quy tắc ổn định quanh metrics: gửi đúng NgayCapNhat, đúng thứ tự', async () => {
  const io = taoIo({truoc: qt('t1'), sau: qt('t1')});
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.equal(r.theoKhu[0].ketQua, 'DA_LUU');
  assert.deepEqual(io.luuGoi, ['t1']);
  assert.deepEqual(io.nhatKy, ['het_han', 'doc_quy_tac', 'metrics', 'doc_quy_tac', 'luu']);
});

test('NgayCapNhat đổi giữa hai lần đọc (cả sau thử lại): BO_QUA, luu_de_xuat_gia không được gọi', async () => {
  const io = taoIo({truoc: qt('t1'), sau: qt('t2'), truocRetry: qt('t2'), sauRetry: qt('t3')});
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.equal(r.theoKhu[0].ketQua, 'BO_QUA');
  assert.deepEqual(r.theoKhu[0].lyDoBoQua, [LY_DO_QUY_TAC_THAY_DOI]);
  assert.equal(io.luuGoi.length, 0);
});

test('thay đổi chỉ một lần: thử lại cả lượt, rồi gửi timestamp ổn định của lượt sau', async () => {
  const io = taoIo({truoc: qt('t1'), sau: qt('t2'), truocRetry: qt('t2'), sauRetry: qt('t2')});
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.equal(r.theoKhu[0].ketQua, 'DA_LUU');
  assert.deepEqual(io.luuGoi, ['t2']);
});

test('ID quy tắc thiếu ở một lần đọc: BO_QUA, không gọi luu', async () => {
  const io = taoIo({truoc: [], sau: qt('t1')});
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.equal(r.theoKhu[0].ketQua, 'BO_QUA');
  assert.deepEqual(r.theoKhu[0].lyDoBoQua, [LY_DO_QUY_TAC_THAY_DOI]);
  assert.equal(io.luuGoi.length, 0);
});

test('khu không mở bán (dang_mo_ban=false) bị bỏ qua, không gọi luu', async () => {
  const io = taoIo({truoc: qt('t1'), sau: qt('t1'), rows: [dongSoLieu({dang_mo_ban: false})]});
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.deepEqual(r.theoKhu[0].lyDoBoQua, ['SUAT_DIEN_KHONG_MO_BAN']);
  assert.equal(io.luuGoi.length, 0);
});

test('dang_mo_ban null được coi là false: BO_QUA, không tính engine, không gọi luu', async () => {
  const io = taoIo({truoc: qt('t1'), sau: qt('t1'), rows: [dongSoLieu({dang_mo_ban: null})]});
  let daTinh = false;
  io.tinh = () => {
    daTinh = true;
    throw new Error('không được gọi');
  };
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.equal(r.theoKhu[0].ketQua, 'BO_QUA');
  assert.deepEqual(r.theoKhu[0].lyDoBoQua, ['SUAT_DIEN_KHONG_MO_BAN']);
  assert.equal(daTinh, false);
  assert.equal(io.luuGoi.length, 0);
});

test('BI_CHAN từ PriceGuard được chuyển tiếp nguyên vẹn cho từng khu', async () => {
  const io = taoIo({truoc: qt('t1'), sau: qt('t1')});
  io.luuDeXuat = async () => ({ketQua: 'BI_CHAN', maChan: 'DA_CO_PENDING', nhatKyId: 9, deXuatHetHan: [4]});
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.deepEqual(r.theoKhu, [
    {khuVucId: 1, suatDienId: 1, ketQua: 'BI_CHAN', maChan: 'DA_CO_PENDING', nhatKyId: 9, deXuatHetHan: [4]},
  ]);
});

test('lỗi luu_de_xuat_gia của một khu thành LOI riêng, khu khác vẫn được xử lý', async () => {
  const io = taoIo({
    truoc: [...qt('t1'), {QuyTacGiaID: 8, NgayCapNhat: 't1'}],
    sau: [...qt('t1'), {QuyTacGiaID: 8, NgayCapNhat: 't1'}],
    rows: [dongSoLieu(), dongSoLieu({khu_vuc_id: 2, quy_tac_gia_id: 8})],
  });
  const goc = io.luuDeXuat;
  io.luuDeXuat = async (row, engine, ngay) => {
    if (row.khu_vuc_id === 1) throw new Error('mạng lỗi');
    return goc(row, engine, ngay);
  };
  const r = await chayDinhGiaNgayLogic(io, 1);
  assert.equal(r.theoKhu[0].ketQua, 'LOI');
  assert.match(r.theoKhu[0].loi, /mạng lỗi/);
  assert.equal(r.theoKhu[1].ketQua, 'DA_LUU');
});

test('lỗi het_han / lay_so_lieu được ném ra, không có kết quả giả; het_han chạy trước metrics', async () => {
  const io1 = taoIo({truoc: qt('t1'), sau: qt('t1')});
  io1.hetHan = async () => {
    throw new Error('42501');
  };
  await assert.rejects(chayDinhGiaNgayLogic(io1, 1), /42501/);
  assert.equal(io1.nhatKy.length, 0, 'không đọc metrics sau khi het_han lỗi');

  const io2 = taoIo({truoc: qt('t1'), sau: qt('t1')});
  io2.soLieu = async () => {
    throw new Error('network');
  };
  await assert.rejects(chayDinhGiaNgayLogic(io2, 1), /network/);
  assert.equal(io2.luuGoi.length, 0);
});

test('storage=null và localStorage ném SecurityError: bộ nhớ tạm với canhBao', () => {
  const p1 = taoKho().moPhien({storage: null, seed: seed(), now: NOW});
  assert.equal(p1.meta.luuTru, 'BO_NHO');
  assert.equal(p1.meta.duLieuHong, false);
  assert.ok(p1.meta.canhBao);

  const chan = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {},
  };
  const p2 = taoKho().moPhien({storage: chan, seed: seed(), now: NOW});
  assert.equal(p2.meta.luuTru, 'BO_NHO');
  assert.match(p2.meta.canhBao, /SecurityError/);
});

test('layKhoMacDinh trả null (không có localStorage): bộ nhớ tạm', () => {
  const p = taoKho(null).moPhien({seed: seed(), now: NOW});
  assert.equal(p.meta.luuTru, 'BO_NHO');
  assert.ok(p.meta.canhBao);
});

// ------------------------------------------------------------------ kiểm tra nguồn .ts

test('nguồn pricingService.ts: không có tùy chọn useMock, mock chỉ theo runtimeConfig.useMockData', async () => {
  const src = await readFile(new URL('../src/services/pricingService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\buseMock\b/);
  assert.match(src, /function dungMock\([^)]*\): boolean \{\s*return runtimeConfig\.useMockData;\s*\}/);
  assert.doesNotMatch(src, /\.update\(|\.upsert\(|\.insert\(|\.delete\(/);
  assert.match(src, /chayDinhGiaNgayLogic/);
});

test('nguồn pricingService.ts: không đọc TrangThaiMoBan, không service-role, không any, lỗi thật không rơi về mock', async () => {
  const src = await readFile(new URL('../src/services/pricingService.ts', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /TrangThaiMoBan/);
  assert.doesNotMatch(code, /service_role|SERVICE_ROLE|serviceRole/);
  assert.doesNotMatch(code, /:\s*any\b|\bas any\b|<any>/);
  // Mỗi nhánh thật gọi layClient sau khối `if (dungMock(...))`; không có try/catch bọc để chuyển sang mock.
  assert.doesNotMatch(code, /catch\s*\([^)]*\)\s*\{[^}]*(moPhien|Mock)\(/);
  // Các lỗi RPC đều ném PricingServiceError.
  assert.ok((code.match(/throw new PricingServiceError\(error\.message, error\.code\)/g) ?? []).length >= 5);
});
