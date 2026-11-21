import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createMockState, laySoLieuDinhGia, toIso} from '../src/domain/mockPricing.js';
import {
  LY_DO_QUY_TAC_THAY_DOI,
  PricingServiceError,
  chayDinhGiaNgayLogic,
  chuanHoaLoiRpc,
  docDanhSachDeXuatThat,
  docKetQuaDuyet,
  docKetQuaTuChoi,
  duyetDeXuatGiaThat,
  ghepDanhSachDeXuat,
  kiemTraTrangThaiMoPhong,
  taoKhoPhienMock,
  tuChoiDeXuatGiaThat,
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
  assert.doesNotMatch(src, /Không có API duyệt\/từ chối/);
  assert.match(src, /export async function layDanhSachDeXuat\b/);
  assert.match(src, /export async function duyetDeXuatGia\b/);
  assert.match(src, /export async function tuChoiDeXuatGia\b/);
});

// ------------------------------------------------------------------ nhánh thật T1: duyệt/từ chối & đọc đề xuất

const MOC = '2026-11-20T12:00:00.000Z';
const sauPhut = (phut, base = MOC) => new Date(Date.parse(base) + phut * 60000).toISOString();

/** Dòng lay_so_lieu_dinh_gia đủ mọi trường hiển thị (không quy tắc, không số liệu bán); overrides ghi đè từng trường. */
function soLieuDayDu(overrides = {}) {
  return {
    khu_vuc_id: 101,
    suat_dien_id: 11,
    su_kien_id: 1,
    ma_khu_vuc: 'VIP',
    ten_khu_vuc: 'Khu VIP',
    trang_thai_suat: 'MO_BAN',
    gia_hien_hanh: 1500000,
    dang_mo_ban: true,
    co_quy_tac: false,
    quy_tac_gia_id: null,
    kich_hoat: null,
    gia_goc: null,
    gia_san: null,
    gia_tran: null,
    buoc_nhay: null,
    bien_do: null,
    nguong_thap: null,
    nguong_cao: null,
    trong_so_lap_day: null,
    trong_so_toc_do: null,
    trong_so_thoi_gian: null,
    n_total: 100,
    n_sold: 0,
    n_hold: 0,
    v_actual: 0,
    v_target: 0,
    t_rem_gio: 24,
    thoi_diem_tinh: '2026-11-20T12:00:00.000Z',
    ...overrides,
  };
}

function taoClientGia({rpcHandler, fromHandler} = {}) {
  const goiRpc = [];
  const goiFrom = [];
  const chanGhi = (method) => () => {
    throw new Error(`Không được phép gọi .${method}()`);
  };
  return {
    goiRpc,
    goiFrom,
    rpc(fn, args) {
      goiRpc.push({fn, args});
      return rpcHandler ? rpcHandler(fn, args) : Promise.resolve({data: null, error: null});
    },
    from(table) {
      return {
        select(columns) {
          return {
            in(column, values) {
              goiFrom.push({table, columns, column, values});
              return fromHandler ? fromHandler(table, columns, column, values) : Promise.resolve({data: [], error: null});
            },
          };
        },
        insert: chanGhi('insert'),
        update: chanGhi('update'),
        upsert: chanGhi('upsert'),
        delete: chanGhi('delete'),
      };
    },
  };
}

test('duyetDeXuatGiaThat: gọi đúng RPC, không truyền p_gia_dieu_chinh khi thiếu/null và parse DA_DUYET', async () => {
  const client = taoClientGia({
    rpcHandler: async () => ({
      data: {
        ketQua: 'DA_DUYET',
        deXuatId: 10,
        khuVucId: 101,
        suKienId: 1,
        giaCu: 1500000,
        giaMoi: 1600000,
        tyLeThayDoiPhanTram: 6.67,
        loaiBienDong: 'DUYET_DE_XUAT_AI',
        nhatKyGiaId: 55,
        nguoiDuyetId: 'u-1',
        thoiGianDuyet: MOC,
      },
      error: null,
    }),
  });

  const kq1 = await duyetDeXuatGiaThat(client, 10, {ghiChu: 'duyệt AI'});
  assert.equal(client.goiRpc[0].fn, 'duyet_de_xuat_gia');
  assert.deepEqual(client.goiRpc[0].args, {p_de_xuat_id: 10, p_ghi_chu: 'duyệt AI'});
  assert.equal('p_gia_dieu_chinh' in client.goiRpc[0].args, false);
  assert.equal(kq1.ok, true);
  assert.equal(kq1.ketQua, 'DA_DUYET');
  assert.equal(kq1.nhatKyGiaId, 55);

  await duyetDeXuatGiaThat(client, 10, {ghiChu: 'chỉnh tay', giaDieuChinh: null});
  assert.equal('p_gia_dieu_chinh' in client.goiRpc[1].args, false);

  await duyetDeXuatGiaThat(client, 10, {ghiChu: 'chỉnh tay', giaDieuChinh: 1650000});
  assert.deepEqual(client.goiRpc[2].args, {
    p_de_xuat_id: 10,
    p_ghi_chu: 'chỉnh tay',
    p_gia_dieu_chinh: 1650000,
  });
});

test('tuChoiDeXuatGiaThat: gọi đúng RPC tu_choi_de_xuat_gia và parse DA_TU_CHOI', async () => {
  const client = taoClientGia({
    rpcHandler: async () => ({
      data: {
        ketQua: 'DA_TU_CHOI',
        deXuatId: 11,
        khuVucId: 101,
        suKienId: 1,
        giaHienHanh: 1500000,
        nguoiDuyetId: 'u-1',
        thoiGianDuyet: MOC,
        lyDo: null,
      },
      error: null,
    }),
  });

  const kq = await tuChoiDeXuatGiaThat(client, 11, {lyDo: null});
  assert.equal(client.goiRpc[0].fn, 'tu_choi_de_xuat_gia');
  assert.deepEqual(client.goiRpc[0].args, {p_de_xuat_id: 11, p_ly_do: ''});
  assert.equal(kq.ok, true);
  assert.equal(kq.ketQua, 'DA_TU_CHOI');
  assert.equal(kq.lyDo, null);
});

test('HET_HAN trả bình thường từ RPC thành ok:false mà không ném lỗi', async () => {
  const hetHanPayload = {
    ketQua: 'HET_HAN',
    ma: 'DE_XUAT_HET_HAN',
    deXuatId: 12,
    khuVucId: 101,
    suKienId: 1,
    thoiGianDeXuat: sauPhut(-130),
    hetHanLuc: sauPhut(-10),
  };
  const client = taoClientGia({
    rpcHandler: async () => ({data: hetHanPayload, error: null}),
  });

  const rDuyet = await duyetDeXuatGiaThat(client, 12, {ghiChu: 'ok'});
  assert.deepEqual(rDuyet, {ok: false, ...hetHanPayload});

  const rTuChoi = await tuChoiDeXuatGiaThat(client, 12, {lyDo: 'no'});
  assert.deepEqual(rTuChoi, {ok: false, ...hetHanPayload});
});

test('chuanHoaLoiRpc: 42501→403, 40001→409 (cả 3 message), 22023 NGOAI_KHUNG_GIA→422 kèm khung giá, lỗi khác/mạng→status null', async () => {
  const e403 = chuanHoaLoiRpc({code: '42501', message: 'Khong co quyen duyet de xuat gia'});
  assert.ok(e403 instanceof PricingServiceError);
  assert.equal(e403.status, 403);
  assert.equal(e403.ma, 'KHONG_CO_QUYEN');
  assert.equal(e403.code, '42501');
  assert.equal(e403.chiTiet, null);

  const eDaXuLy = chuanHoaLoiRpc({code: '40001', message: 'DE_XUAT_DA_XU_LY', details: 'APPROVED'});
  assert.equal(eDaXuLy.status, 409);
  assert.equal(eDaXuLy.ma, 'DE_XUAT_DA_XU_LY');
  assert.deepEqual(eDaXuLy.chiTiet, {trangThai: 'APPROVED'});

  const eGiaDoi = chuanHoaLoiRpc({code: '40001', message: 'GIA_DA_THAY_DOI', details: 'Gia hien hanh 1550000 khac 1500000'});
  assert.equal(eGiaDoi.status, 409);
  assert.equal(eGiaDoi.ma, 'GIA_DA_THAY_DOI');
  assert.equal(eGiaDoi.chiTiet, null);

  const eXungDot = chuanHoaLoiRpc({code: '40001', message: 'DE_XUAT_XUNG_DOT'});
  assert.equal(eXungDot.status, 409);
  assert.equal(eXungDot.ma, 'DE_XUAT_XUNG_DOT');
  assert.equal(eXungDot.chiTiet, null);

  const eKhung = chuanHoaLoiRpc({
    code: '22023',
    message: 'NGOAI_KHUNG_GIA',
    details: '{"giaSan": 1200000, "giaTran": 2000000}',
  });
  assert.equal(eKhung.status, 422);
  assert.equal(eKhung.ma, 'NGOAI_KHUNG_GIA');
  assert.deepEqual(eKhung.chiTiet, {giaSan: 1200000, giaTran: 2000000});

  const eKhungRac = chuanHoaLoiRpc({code: '22023', message: 'NGOAI_KHUNG_GIA', details: '{bad json'});
  assert.equal(eKhungRac.status, 422);
  assert.equal(eKhungRac.ma, 'NGOAI_KHUNG_GIA');
  assert.equal(eKhungRac.chiTiet, null);

  const eKhac = chuanHoaLoiRpc({code: 'PGRST301', message: 'JWT expired'});
  assert.equal(eKhac.status, null);
  assert.equal(eKhac.code, 'PGRST301');
  assert.equal(eKhac.ma, null);

  // Lỗi mạng qua client giả không rơi về mock và giữ status null
  const netClient = taoClientGia({
    rpcHandler: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(
    () => duyetDeXuatGiaThat(netClient, 1, {ghiChu: 'x'}),
    (err) => err instanceof PricingServiceError && err.status === null && err.message === 'Failed to fetch',
  );
  await assert.rejects(
    () => docDanhSachDeXuatThat(netClient, 1),
    (err) => err instanceof PricingServiceError && err.status === null && err.message === 'Failed to fetch',
  );
});

test('phản hồi sai hợp đồng từ RPC hoặc bảng DE_XUAT_GIA → PHAN_HOI_KHONG_HOP_LE (status 502)', async () => {
  assert.equal(docKetQuaDuyet(null), null);
  assert.equal(docKetQuaDuyet({ketQua: 'DA_DUYET', deXuatId: 1}), null);
  assert.equal(
    docKetQuaDuyet({
      ketQua: 'DA_DUYET',
      deXuatId: 1,
      khuVucId: 1,
      suKienId: 1,
      giaCu: 100,
      giaMoi: 110,
      tyLeThayDoiPhanTram: 10,
      loaiBienDong: 'KHONG_HOP_LE',
      nhatKyGiaId: 1,
      nguoiDuyetId: 'u1',
      thoiGianDuyet: MOC,
    }),
    null,
  );
  assert.equal(docKetQuaTuChoi({ketQua: 'HET_HAN', ma: 'SAI'}), null);

  const badRpcClient = taoClientGia({rpcHandler: async () => ({data: {ketQua: 'LA'}, error: null})});
  await assert.rejects(
    () => duyetDeXuatGiaThat(badRpcClient, 1, {ghiChu: 'ok'}),
    (err) => err instanceof PricingServiceError && err.code === 'PHAN_HOI_KHONG_HOP_LE' && err.status === 502,
  );
  await assert.rejects(
    () => tuChoiDeXuatGiaThat(badRpcClient, 1, {lyDo: 'ok'}),
    (err) => err instanceof PricingServiceError && err.code === 'PHAN_HOI_KHONG_HOP_LE' && err.status === 502,
  );

  const badTableClient = taoClientGia({
    rpcHandler: async () => ({
      data: [soLieuDayDu()],
      error: null,
    }),
    fromHandler: async () => ({data: [{DeXuatID: 'bad'}], error: null}),
  });
  await assert.rejects(
    () => docDanhSachDeXuatThat(badTableClient, 1, MOC),
    (err) => err instanceof PricingServiceError && err.code === 'PHAN_HOI_KHONG_HOP_LE' && err.status === 502,
  );
});

test('docDanhSachDeXuatThat & ghepDanhSachDeXuat: chỉ đọc, lọc bỏ khu/đề xuất tổ chức khác, đủ r/u/tRem/giá/cảnh báo/hạn', async () => {
  const rowsSoLieu = [
    soLieuDayDu({
      co_quy_tac: true,
      quy_tac_gia_id: 7,
      kich_hoat: true,
      gia_goc: 1500000,
      gia_san: 1200000,
      gia_tran: 2000000,
      buoc_nhay: 10000,
      bien_do: 0.2,
      nguong_thap: 0.3,
      nguong_cao: 0.6,
      trong_so_lap_day: 1,
      trong_so_toc_do: 1,
      trong_so_thoi_gian: 1,
      n_total: 100,
      n_sold: 40,
      n_hold: 10,
      v_actual: 6,
      v_target: 3,
      t_rem_gio: 24,
      thoi_diem_tinh: MOC,
    }),
    soLieuDayDu({
      khu_vuc_id: 102,
      ma_khu_vuc: 'STD',
      ten_khu_vuc: 'Thường',
      gia_hien_hanh: 800000,
      dang_mo_ban: false,
      thoi_diem_tinh: MOC,
    }),
    // Phòng thủ: khu thuộc sự kiện/tổ chức khác nếu có trong kết quả giả phải bị lọc bỏ (sau khi qua kiểm tra hợp đồng)
    soLieuDayDu({
      khu_vuc_id: 999,
      suat_dien_id: 99,
      su_kien_id: 2,
      ma_khu_vuc: 'LEAK',
      ten_khu_vuc: 'Tổ chức khác',
      gia_hien_hanh: 500000,
    }),
  ];

  const rowsDeXuat = [
    {
      DeXuatID: 1,
      KhuVucID: 101,
      TrangThaiDuyet: 'PENDING',
      GiaHienTai: 1500000,
      GiaDeXuat: 1600000,
      GiaTinhToanTho: 1610000,
      TyLeLapDay: 0.45,
      TocDoBanThucTe: 6,
      TocDoBanKyVong: 3,
      SoGioConLai: 24,
      LoaiCanhBao: 'BINH_THUONG',
      CoCanhBaoVuotKhung: false,
      LyDoDeXuat: 'Nhu cầu tăng',
      ThoiGianDeXuat: sauPhut(-120), // đúng mốc 120 phút: vẫn conHieuLuc = true
    },
    {
      DeXuatID: 2,
      KhuVucID: 101,
      TrangThaiDuyet: 'PENDING',
      GiaHienTai: 1500000,
      GiaDeXuat: 2000000,
      GiaTinhToanTho: 2100000,
      TyLeLapDay: 0.8,
      TocDoBanThucTe: 10,
      TocDoBanKyVong: 3,
      SoGioConLai: 12,
      LoaiCanhBao: 'CHAM_GIA_TRAN',
      CoCanhBaoVuotKhung: true,
      LyDoDeXuat: 'Chạm trần',
      ThoiGianDeXuat: sauPhut(-121), // quá 120 phút: conHieuLuc = false
    },
    {
      DeXuatID: 3,
      KhuVucID: 999, // ngoài tập khu vực sự kiện 1 → bị loại
      TrangThaiDuyet: 'PENDING',
      GiaHienTai: 500000,
      GiaDeXuat: 600000,
      ThoiGianDeXuat: sauPhut(-5),
    },
  ];

  const client = taoClientGia({
    rpcHandler: async () => ({data: rowsSoLieu, error: null}),
    fromHandler: async () => ({data: rowsDeXuat, error: null}),
  });

  const kq = await docDanhSachDeXuatThat(client, 1);
  assert.equal(client.goiRpc[0].fn, 'lay_so_lieu_dinh_gia');
  assert.deepEqual(client.goiRpc[0].args, {p_su_kien_id: 1});
  assert.equal(client.goiFrom[0].table, 'DE_XUAT_GIA');
  assert.equal(client.goiFrom[0].column, 'KhuVucID');
  assert.deepEqual(client.goiFrom[0].values, [101, 102]);

  assert.equal(kq.suKienId, 1);
  assert.deepEqual(
    kq.khuVuc.map((k) => k.khuVucId),
    [101, 102],
  );

  const vip = kq.khuVuc[0];
  assert.equal(vip.tenKhuVuc, 'Khu VIP');
  assert.equal(vip.maKhuVuc, 'VIP');
  assert.equal(vip.giaHienHanh, 1500000);
  assert.equal(vip.dangMoBan, true);
  assert.equal(vip.quyTac?.quyTacGiaId, 7);
  assert.equal(vip.quyTac?.giaSan, 1200000);
  assert.equal(vip.quyTac?.giaTran, 2000000);
  assert.equal(vip.r, (40 + 0.5 * 10) / 100);
  assert.equal(vip.u, 2);
  assert.equal(vip.tRem, 24);
  assert.equal(vip.deXuat.length, 2);

  assert.equal(vip.deXuat[0].hetHanLuc, MOC);
  assert.equal(vip.deXuat[0].conHieuLuc, true, 'đúng mốc 120 phút vẫn còn hiệu lực');
  assert.equal(vip.deXuat[0].loaiCanhBao, 'BINH_THUONG');
  assert.equal(vip.deXuat[1].conHieuLuc, false, 'quá 120 phút hết hiệu lực');
  assert.equal(vip.deXuat[1].coCanhBaoVuotKhung, true);
  assert.equal(vip.deXuat[1].loaiCanhBao, 'CHAM_GIA_TRAN');

  const std = kq.khuVuc[1];
  assert.equal(std.quyTac, null);
  assert.equal(std.u, null, 'v_target = 0 thì u = null');
  assert.deepEqual(std.deXuat, []);

  // ghepDanhSachDeXuat: trạng thái đã xử lý dù chưa quá 120 phút vẫn conHieuLuc = false
  const ghep = ghepDanhSachDeXuat(
    [rowsSoLieu[0]],
    [{...rowsDeXuat[0], TrangThaiDuyet: 'APPROVED', ThoiGianDeXuat: sauPhut(-5)}],
    MOC,
  );
  assert.equal(ghep[0].deXuat[0].conHieuLuc, false);
});

test('docDanhSachDeXuatThat: rỗng thì không gọi DE_XUAT_GIA; 42501 từ RPC ném 403', async () => {
  const emptyClient = taoClientGia({rpcHandler: async () => ({data: [], error: null})});
  const empty = await docDanhSachDeXuatThat(emptyClient, 1, MOC);
  assert.deepEqual(empty, {suKienId: 1, khuVuc: []});
  assert.equal(emptyClient.goiFrom.length, 0);

  const deniedClient = taoClientGia({
    rpcHandler: async () => ({data: null, error: {code: '42501', message: 'Khong co quyen dinh gia'}}),
  });
  await assert.rejects(
    () => docDanhSachDeXuatThat(deniedClient, 1, MOC),
    (err) => err instanceof PricingServiceError && err.status === 403 && err.ma === 'KHONG_CO_QUYEN',
  );
});

// ------------------------------------------------------------------ hợp đồng số liệu và thời gian (review 1)

const laLoi502 = (err) =>
  err instanceof PricingServiceError &&
  err.status === 502 &&
  err.ma === 'PHAN_HOI_KHONG_HOP_LE' &&
  err.code === 'PHAN_HOI_KHONG_HOP_LE';

function clientSoLieu(rows, rowsDeXuat = []) {
  return taoClientGia({
    rpcHandler: async () => ({data: rows, error: null}),
    fromHandler: async () => ({data: rowsDeXuat, error: null}),
  });
}

const deXuatMau = (overrides = {}) => ({
  DeXuatID: 1,
  KhuVucID: 101,
  TrangThaiDuyet: 'PENDING',
  GiaHienTai: 1500000,
  GiaDeXuat: 1600000,
  ThoiGianDeXuat: sauPhut(-5),
  ...overrides,
});

test('hop dong so lieu va thoi gian (review 1): metrics sai kiểu/thiếu trường → 502 PHAN_HOI_KHONG_HOP_LE', async () => {
  const sai = [
    ['ten_khu_vuc', {bad: true}],
    ['ma_khu_vuc', 5],
    ['trang_thai_suat', false],
    ['gia_hien_hanh', 'broken'],
    ['gia_goc', Number.NaN],
    ['n_total', '100'],
    ['t_rem_gio', Infinity],
    ['dang_mo_ban', 'yes'],
    ['co_quy_tac', 1],
    ['kich_hoat', 'true'],
    ['thoi_diem_tinh', 'invalid'],
    ['thoi_diem_tinh', 123],
  ];
  for (const [truong, giaTri] of sai) {
    await assert.rejects(
      () => docDanhSachDeXuatThat(clientSoLieu([soLieuDayDu({[truong]: giaTri})]), 1, MOC),
      laLoi502,
      `${truong}=${String(giaTri)}`,
    );
  }

  // Thiếu hẳn trường (undefined) cũng bị từ chối, trừ khi là null hợp lệ
  const thieu = soLieuDayDu();
  delete thieu.t_rem_gio;
  await assert.rejects(() => docDanhSachDeXuatThat(clientSoLieu([thieu]), 1, MOC), laLoi502);

  const nullHopLe = await docDanhSachDeXuatThat(clientSoLieu([soLieuDayDu({t_rem_gio: null, thoi_diem_tinh: null})]), 1, MOC);
  assert.equal(nullHopLe.khuVuc[0].tRem, null);

  // Dòng của sự kiện khác vẫn phải qua kiểm tra hợp đồng trước khi bị loại
  await assert.rejects(
    () => docDanhSachDeXuatThat(clientSoLieu([soLieuDayDu(), soLieuDayDu({khu_vuc_id: 999, su_kien_id: 2, ten_khu_vuc: {}})]), 1, MOC),
    laLoi502,
  );
  const loc = await docDanhSachDeXuatThat(clientSoLieu([soLieuDayDu(), soLieuDayDu({khu_vuc_id: 999, su_kien_id: 2})]), 1, MOC);
  assert.deepEqual(
    loc.khuVuc.map((k) => k.khuVucId),
    [101],
  );
});

test('hop dong so lieu va thoi gian (review 1): ThoiGianDeXuat không phân tích được → 502', async () => {
  await assert.rejects(
    () => docDanhSachDeXuatThat(clientSoLieu([soLieuDayDu()], [deXuatMau({ThoiGianDeXuat: 'invalid'})]), 1, MOC),
    laLoi502,
  );
  const ok = await docDanhSachDeXuatThat(clientSoLieu([soLieuDayDu()], [deXuatMau()]), 1, MOC);
  assert.equal(ok.khuVuc[0].deXuat.length, 1);
});

test('hop dong so lieu va thoi gian (review 1): HET_HAN và DA_DUYET/DA_TU_CHOI với timestamp sai → 502', async () => {
  const hetHan = {
    ketQua: 'HET_HAN',
    ma: 'DE_XUAT_HET_HAN',
    deXuatId: 12,
    khuVucId: 101,
    suKienId: 1,
    thoiGianDeXuat: 'invalid',
    hetHanLuc: 'invalid',
  };
  const clientHetHan = taoClientGia({rpcHandler: async () => ({data: hetHan, error: null})});
  await assert.rejects(() => duyetDeXuatGiaThat(clientHetHan, 12, {ghiChu: 'x'}), laLoi502);
  await assert.rejects(() => tuChoiDeXuatGiaThat(clientHetHan, 12, {lyDo: 'x'}), laLoi502);

  const motTrong = taoClientGia({
    rpcHandler: async () => ({data: {...hetHan, thoiGianDeXuat: sauPhut(-130)}, error: null}),
  });
  await assert.rejects(() => duyetDeXuatGiaThat(motTrong, 12, {ghiChu: 'x'}), laLoi502);

  const daDuyet = {
    ketQua: 'DA_DUYET',
    deXuatId: 10,
    khuVucId: 101,
    suKienId: 1,
    giaCu: 1500000,
    giaMoi: 1600000,
    tyLeThayDoiPhanTram: 6.67,
    loaiBienDong: 'DUYET_DE_XUAT_AI',
    nhatKyGiaId: 55,
    nguoiDuyetId: 'u-1',
    thoiGianDuyet: 'invalid',
  };
  await assert.rejects(
    () => duyetDeXuatGiaThat(taoClientGia({rpcHandler: async () => ({data: daDuyet, error: null})}), 10, {ghiChu: 'x'}),
    laLoi502,
  );

  const daTuChoi = {
    ketQua: 'DA_TU_CHOI',
    deXuatId: 11,
    khuVucId: 101,
    suKienId: 1,
    giaHienHanh: 1500000,
    nguoiDuyetId: 'u-1',
    thoiGianDuyet: 'invalid',
    lyDo: null,
  };
  await assert.rejects(
    () => tuChoiDeXuatGiaThat(taoClientGia({rpcHandler: async () => ({data: daTuChoi, error: null})}), 11, {lyDo: 'x'}),
    laLoi502,
  );

  // Timestamp hợp lệ thì vẫn được chấp nhận
  assert.equal(docKetQuaDuyet({...daDuyet, thoiGianDuyet: MOC})?.ketQua, 'DA_DUYET');
  assert.equal(docKetQuaTuChoi({...daTuChoi, thoiGianDuyet: MOC})?.ketQua, 'DA_TU_CHOI');
});

test('hop dong so lieu va thoi gian (review 1): dòng laySoLieuDinhGia của mock vẫn qua kiểm tra hợp đồng', async () => {
  const state = createMockState(seed());
  const rows = laySoLieuDinhGia(state, 1, NOW).map((r) => ({
    ...r,
    ten_khu_vuc: state.khuVuc[r.khu_vuc_id].TenKhuVuc ?? null,
    ma_khu_vuc: state.khuVuc[r.khu_vuc_id].MaKhuVuc ?? null,
  }));
  assert.ok(rows.length > 0);
  const kq = await docDanhSachDeXuatThat(clientSoLieu(rows), 1);
  assert.deepEqual(
    kq.khuVuc.map((k) => k.khuVucId),
    rows.map((r) => r.khu_vuc_id),
  );
});
