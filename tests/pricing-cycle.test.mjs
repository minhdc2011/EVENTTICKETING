import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {test, mock} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {computePriceProposal} from '../src/domain/pricingEngine.js';
import {
  CHU_KY_MS,
  LoiCauHinh,
  LoiKetNoiNghiemTrong,
  LoiThamSo,
  NGUONG_BIEN_DONG,
  NHIP_KIEM_TRA_MS,
  chayLich,
  chayMotChuKy,
  dauVaoEngine,
  docCauHinh,
  laLoiKetNoi,
  main,
  phanTichThamSo,
  taoIo,
} from '../scripts/run-pricing-cycle.mjs';

const THU_MUC = path.dirname(fileURLToPath(import.meta.url));
const DUONG_DAN_SCRIPT = path.resolve(THU_MUC, '../scripts/run-pricing-cycle.mjs');
const NGAY_QUY_TAC = '2026-11-01T00:00:00Z';
const KHOA_GIA = 'sk-test-SECRET';
const URL_GIA = 'http://127.0.0.1:1';

// ------------------------------------------------------------------ dữ liệu giả

const ok = (data) => ({data, error: null});
const loi = (message) => ({data: null, error: {message}});

/** Hàng lay_so_lieu_dinh_gia: r = 0,9 → engine đề xuất 120000 (giá hiện hành 100000). */
function hang(khuVucId = 1, over = {}) {
  return {
    khu_vuc_id: khuVucId,
    suat_dien_id: 10,
    su_kien_id: 7,
    quy_tac_gia_id: 100 + khuVucId,
    dang_mo_ban: true,
    co_quy_tac: true,
    kich_hoat: true,
    gia_goc: 100000,
    gia_san: 50000,
    gia_tran: 200000,
    buoc_nhay: 10000,
    bien_do: 0.2,
    nguong_thap: 0.3,
    nguong_cao: 0.6,
    trong_so_lap_day: 1,
    trong_so_toc_do: 1,
    trong_so_thoi_gian: 1,
    gia_hien_hanh: 100000,
    n_total: 100,
    n_sold: 90,
    n_hold: 0,
    t_rem_gio: 500,
    v_actual: 10,
    v_target: 10,
    co_pending: false,
    ...over,
  };
}

const HET_HAN = {suKienId: 7, deXuatHetHan: [], soLuong: 0};

const daLuu = (args) => ({
  ketQua: 'DA_LUU',
  deXuatId: 5,
  khuVucId: args.p_khu_vuc_id,
  suKienId: 7,
  giaDeXuat: args.p_gia_de_xuat,
  giaHienTai: 100000,
  loaiCanhBao: 'BINH_THUONG',
  moPhong: false,
  deXuatHetHan: [],
});

const biChan = {ketQua: 'BI_CHAN', maChan: 'VUOT_BIEN_DO', nhatKyId: 9, deXuatHetHan: []};

/**
 * Client giả: ghi lại mọi lời gọi, đo số lời gọi chạy đồng thời, không có mạng.
 * @param {{rpc?: Record<string, (args: any, lanThu: number) => any>}} [over]
 */
function taoClientGia(over = {}) {
  /** @type {any[]} */
  const calls = [];
  const soLanGoi = {};
  let dangChay = 0;
  const stat = {toiDaDongThoi: 0};
  const handlers = {
    het_han_de_xuat_gia: () => ok(HET_HAN),
    lay_so_lieu_dinh_gia: () => ok([hang(1)]),
    luu_de_xuat_gia: (args) => ok(daLuu(args)),
    ...over.rpc,
  };
  const quyTac = [101, 102, 103].map((id) => ({QuyTacGiaID: id, NgayCapNhat: NGAY_QUY_TAC}));

  async function tre(fn) {
    dangChay += 1;
    stat.toiDaDongThoi = Math.max(stat.toiDaDongThoi, dangChay);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      return fn();
    } finally {
      dangChay -= 1;
    }
  }

  return {
    calls,
    stat,
    rpc(name, args) {
      calls.push({k: 'rpc', name, args});
      soLanGoi[name] = (soLanGoi[name] ?? 0) + 1;
      const handler = handlers[name];
      return tre(() => (handler ? handler(args, soLanGoi[name]) : loi(`RPC lạ: ${name}`)));
    },
    from(table) {
      return {
        select() {
          return {
            eq(col, val) {
              calls.push({k: 'eq', table, col, val});
              return tre(() => ok(table === 'KHU_VUC' ? [{KhuVucID: 1}, {KhuVucID: 2}] : quyTac));
            },
            in(col, val) {
              calls.push({k: 'in', table, col, val});
              return tre(() => ok(quyTac));
            },
          };
        },
      };
    },
  };
}

const tenRpc = (client, name) => client.calls.filter((c) => c.k === 'rpc' && c.name === name);

/** Chạy lịch với đồng hồ và cho() giả; sold[i] là số ghế đã bán tại nhịp i (0 = chu kỳ đầu). */
async function chayLichGia({sold, total = 1000, buocMs = NHIP_KIEM_TRA_MS, nhanh = false}) {
  const state = {sold: sold[0]};
  const client = taoClientGia({
    rpc: {lay_so_lieu_dinh_gia: () => ok([hang(1, {n_total: total, n_sold: state.sold})])},
  });
  const ac = new AbortController();
  let giay = Date.parse('2026-11-20T00:00:00Z');
  const chos = [];
  const logs = [];
  const cho = async (ms) => {
    chos.push(ms);
    giay += buocMs;
    if (chos.length >= sold.length) ac.abort();
    else state.sold = sold[chos.length];
  };
  const kq = await chayLich({
    io: taoIo(client),
    suKienId: 7,
    nhanh,
    dongHo: {now: () => giay},
    cho,
    log: (m) => logs.push(m),
    signal: ac.signal,
  });
  return {kq, client, chos, logs};
}

// ------------------------------------------------------------------ (a) cấu hình

test('docCauHinh: đọc đúng hai biến', () => {
  assert.deepEqual(docCauHinh({SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}), {
    url: URL_GIA,
    key: KHOA_GIA,
  });
});

for (const [ten, env, bien] of [
  ['thiếu URL', {SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, 'SUPABASE_URL'],
  ['URL rỗng', {SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, 'SUPABASE_URL'],
  ['URL toàn khoảng trắng', {SUPABASE_URL: '   ', SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, 'SUPABASE_URL'],
  ['thiếu khóa', {SUPABASE_URL: URL_GIA}, 'SUPABASE_SERVICE_ROLE_KEY'],
  ['khóa rỗng', {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: ''}, 'SUPABASE_SERVICE_ROLE_KEY'],
  ['khóa khoảng trắng', {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: ' \t'}, 'SUPABASE_SERVICE_ROLE_KEY'],
]) {
  test(`docCauHinh: ${ten} → LoiCauHinh nêu tên biến`, () => {
    assert.throws(
      () => docCauHinh(env),
      (e) => e instanceof LoiCauHinh && e.message.includes(bien) && !e.message.includes(KHOA_GIA),
    );
  });
}

test('docCauHinh: biến VITE_* không được dùng thay thế', () => {
  assert.throws(
    () => docCauHinh({VITE_SUPABASE_URL: URL_GIA, VITE_SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}),
    (e) => e instanceof LoiCauHinh && e.message.includes('SUPABASE_URL') && e.message.includes('SUPABASE_SERVICE_ROLE_KEY'),
  );
  assert.throws(
    () => docCauHinh({VITE_SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}),
    (e) => e instanceof LoiCauHinh && e.message.includes('SUPABASE_URL'),
  );
});

test('docCauHinh: thiếu cả hai thì nêu cả hai tên', () => {
  assert.throws(
    () => docCauHinh({}),
    (e) => e.message.includes('SUPABASE_URL') && e.message.includes('SUPABASE_SERVICE_ROLE_KEY'),
  );
});

// ------------------------------------------------------------------ (b) CLI

test('phanTichThamSo: chấp nhận các dạng hợp lệ', () => {
  assert.deepEqual(phanTichThamSo(['--su-kien', '7']), {suKienId: 7, nhanh: false});
  assert.deepEqual(phanTichThamSo(['--su-kien=7']), {suKienId: 7, nhanh: false});
  assert.deepEqual(phanTichThamSo(['--nhanh', '--su-kien', '12']), {suKienId: 12, nhanh: true});
  assert.deepEqual(phanTichThamSo(['--su-kien=2147483647', '--nhanh']), {suKienId: 2147483647, nhanh: true});
});

const CLI_SAI = [
  ['thiếu --su-kien', []],
  ['chỉ có --nhanh', ['--nhanh']],
  ['thiếu giá trị', ['--su-kien']],
  ['giá trị rỗng', ['--su-kien', '']],
  ['giá trị rỗng dạng =', ['--su-kien=']],
  ['0', ['--su-kien', '0']],
  ['-1', ['--su-kien', '-1']],
  ['1.5', ['--su-kien', '1.5']],
  ['abc', ['--su-kien', 'abc']],
  ['0x1', ['--su-kien', '0x1']],
  ['1e3', ['--su-kien', '1e3']],
  ['số 0 đứng đầu', ['--su-kien', '07']],
  ['2147483648', ['--su-kien', '2147483648']],
  ['tham số lạ', ['--su-kien', '7', '--khac']],
  ['tham số vị trí lạ', ['--su-kien', '7', 'extra']],
  ['lặp --su-kien', ['--su-kien', '7', '--su-kien', '8']],
  ['lặp --su-kien dạng =', ['--su-kien=7', '--su-kien=8']],
  ['lặp --nhanh', ['--su-kien', '7', '--nhanh', '--nhanh']],
];

for (const [ten, argv] of CLI_SAI) {
  test(`CLI sai (${ten}): phanTichThamSo ném LoiThamSo, main trả 2, không tạo client`, async () => {
    assert.throws(() => phanTichThamSo(argv), (e) => e instanceof LoiThamSo);

    const loiGhi = mock.method(console, 'error', () => {});
    try {
      let soLanTaoClient = 0;
      const ma = await main(argv, {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
        createClient: () => {
          soLanTaoClient += 1;
          return taoClientGia();
        },
        log: () => {},
      });
      assert.equal(ma, 2);
      assert.equal(soLanTaoClient, 0);
      const inRa = loiGhi.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
      assert.ok(!inRa.includes(KHOA_GIA));
    } finally {
      loiGhi.mock.restore();
    }
  });
}

test('main: thiếu biến môi trường → 2, không tạo client, thông báo nêu tên biến', async () => {
  const loiGhi = mock.method(console, 'error', () => {});
  try {
    let soLanTaoClient = 0;
    const ma = await main(['--su-kien', '7'], {SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
      createClient: () => {
        soLanTaoClient += 1;
        return taoClientGia();
      },
    });
    assert.equal(ma, 2);
    assert.equal(soLanTaoClient, 0);
    const inRa = loiGhi.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(inRa.includes('SUPABASE_URL'));
    assert.ok(!inRa.includes(KHOA_GIA));
  } finally {
    loiGhi.mock.restore();
  }
});

// ------------------------------------------------------------------ (c) thứ tự lời gọi

test('chu kỳ: het_han → đọc quy tắc → số liệu → đọc quy tắc → lưu, đúng tham số', async () => {
  const client = taoClientGia();
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});

  const thuTu = client.calls.map((c) => {
    if (c.k === 'rpc') return `rpc:${c.name}`;
    return `${c.k}:${c.table}`;
  });
  assert.deepEqual(thuTu, [
    'rpc:het_han_de_xuat_gia',
    'eq:KHU_VUC',
    'in:QUY_TAC_GIA',
    'rpc:lay_so_lieu_dinh_gia',
    'eq:KHU_VUC',
    'in:QUY_TAC_GIA',
    'rpc:luu_de_xuat_gia',
  ]);

  assert.deepEqual(client.calls[0].args, {p_su_kien_id: 7});
  assert.deepEqual(client.calls[1], {k: 'eq', table: 'KHU_VUC', col: 'SuKienID', val: 7});
  assert.deepEqual(client.calls[2], {k: 'in', table: 'QUY_TAC_GIA', col: 'KhuVucID', val: [1, 2]});
  assert.deepEqual(client.calls[3].args, {p_su_kien_id: 7});

  const engine = computePriceProposal(dauVaoEngine(hang(1)));
  assert.equal(engine.proposedPrice, 120000);
  const luu = client.calls[6].args;
  assert.equal(luu.p_khu_vuc_id, 1);
  assert.equal(luu.p_quy_tac_gia_id, 101);
  assert.equal(luu.p_quy_tac_ngay_cap_nhat, NGAY_QUY_TAC);
  assert.equal(luu.p_gia_de_xuat, 120000);
  assert.equal(luu.p_gia_tinh_toan_tho, engine.intermediate.rawPrice);
  assert.equal(typeof luu.p_ly_do, 'string');
  assert.ok(luu.p_ly_do.length > 0);

  assert.equal(kq.theoKhu.length, 1);
  assert.equal(kq.theoKhu[0].ketQua, 'DA_LUU');
});

// ------------------------------------------------------------------ (d) DA_LUU / BI_CHAN theo khu

test('kết quả DA_LUU và BI_CHAN được báo riêng từng khu', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () => ok([hang(1), hang(2)]),
      luu_de_xuat_gia: (args) => (args.p_khu_vuc_id === 2 ? ok(biChan) : ok(daLuu(args))),
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  const [k1, k2] = kq.theoKhu;
  assert.equal(k1.khuVucId, 1);
  assert.equal(k1.ketQua, 'DA_LUU');
  assert.equal(k1.giaDeXuat, 120000);
  assert.equal(k2.khuVucId, 2);
  assert.equal(k2.ketQua, 'BI_CHAN');
  assert.equal(k2.maChan, 'VUOT_BIEN_DO');
  assert.equal(k2.nhatKyId, 9);

  const logs = [];
  const ma = await main(['--su-kien', '7', '--nhanh'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
    createClient: () => client,
    log: (m) => logs.push(m),
  });
  assert.equal(ma, 0);
  assert.ok(logs.some((l) => l.includes('Khu 1') && l.includes('DA_LUU')));
  assert.ok(logs.some((l) => l.includes('Khu 2') && l.includes('BI_CHAN') && l.includes('VUOT_BIEN_DO')));
});

// ------------------------------------------------------------------ (e) bỏ qua và lỗi

test('bỏ qua khu: quy tắc tắt, không có quy tắc, thiếu dữ liệu đều có lý do', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () =>
        ok([
          hang(1, {kich_hoat: false}),
          hang(2, {co_quy_tac: false, quy_tac_gia_id: null}),
          hang(3, {n_total: null}),
        ]),
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.equal(kq.theoKhu.length, 3);
  for (const k of kq.theoKhu) {
    assert.equal(k.ketQua, 'BO_QUA');
    assert.ok(Array.isArray(k.lyDoBoQua) && k.lyDoBoQua.length > 0);
  }
  assert.ok(kq.theoKhu[0].lyDoBoQua.includes('QUY_TAC_KHONG_KICH_HOAT'));
  assert.ok(kq.theoKhu[1].lyDoBoQua.includes('DU_LIEU_KHONG_HOP_LE'));
  assert.ok(kq.theoKhu[2].lyDoBoQua.includes('DU_LIEU_KHONG_HOP_LE'));
  assert.equal(tenRpc(client, 'luu_de_xuat_gia').length, 0);
});

test('một khu ném lỗi chỉ cho LOI ở khu đó, mã thoát vẫn 0', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () => ok([hang(1), hang(2)]),
      luu_de_xuat_gia: (args) => (args.p_khu_vuc_id === 1 ? loi('lỗi giả khu 1') : ok(daLuu(args))),
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.equal(kq.theoKhu[0].ketQua, 'LOI');
  assert.ok(kq.theoKhu[0].loi.includes('lỗi giả khu 1'));
  assert.equal(kq.theoKhu[1].ketQua, 'DA_LUU');

  const logs = [];
  const ma = await main(['--su-kien', '7', '--nhanh'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
    createClient: () => client,
    log: (m) => logs.push(m),
  });
  assert.equal(ma, 0);
  assert.ok(logs.some((l) => l.includes('Khu 1') && l.includes('LOI')));
});

test('lỗi Postgres P0001 status 400 ở một khu chỉ là LOI riêng khu đó, mã thoát 0', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () => ok([hang(1), hang(2)]),
      luu_de_xuat_gia: (args) =>
        args.p_khu_vuc_id === 1
          ? {data: null, error: {message: 'vi phạm quy tắc P0001', code: 'P0001'}, status: 400}
          : ok(daLuu(args)),
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.equal(kq.loiNghiemTrong, null);
  assert.equal(kq.theoKhu[0].ketQua, 'LOI');
  assert.ok(kq.theoKhu[0].loi.includes('vi phạm quy tắc P0001'));
  assert.equal(kq.theoKhu[1].ketQua, 'DA_LUU');

  const logs = [];
  const ma = await main(['--su-kien', '7', '--nhanh'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
    createClient: () => client,
    log: (m) => logs.push(m),
  });
  assert.equal(ma, 0);
  assert.ok(logs.some((l) => l.includes('Khu 1') && l.includes('LOI')));
  assert.ok(logs.some((l) => l.includes('Khu 2') && l.includes('DA_LUU')));
});

test('laLoiKetNoi phân loại đúng lỗi mạng/HTTP nghiêm trọng và lỗi nghiệp vụ Postgres', () => {
  assert.equal(laLoiKetNoi({data: null, error: {message: 'TypeError: fetch failed', code: ''}, status: 0}), true);
  assert.equal(laLoiKetNoi({data: null, error: {message: 'Unauthorized'}, status: 401}), true);
  assert.equal(laLoiKetNoi({data: null, error: {message: 'Forbidden'}, status: 403}), true);
  assert.equal(laLoiKetNoi({data: null, error: {message: 'Bad Gateway'}, status: 502}), true);
  assert.equal(laLoiKetNoi({data: null, error: {message: 'ECONNREFUSED'}}), true);
  assert.equal(laLoiKetNoi({data: null, error: {message: 'lỗi giả khu 1'}}), false);
  assert.equal(laLoiKetNoi({data: null, error: {message: 'check violation', code: 'P0001'}, status: 400}), false);
});

const LOI_KET_NOI_STATUS_0 = {
  data: null,
  error: {message: 'TypeError: fetch failed', code: ''},
  status: 0,
};

for (const [ten, luuHandler] of [
  ['status 0 fetch failed', () => LOI_KET_NOI_STATUS_0],
  ['client.rpc reject', () => Promise.reject(new TypeError('fetch failed'))],
]) {
  test(`lỗi kết nối khi lưu (${ten}): --nhanh trả 1, chế độ thường trả 1 và không retry`, async () => {
    const loiGhi = mock.method(console, 'error', () => {});
    try {
      const logsNhanh = [];
      const clientNhanh = taoClientGia({rpc: {luu_de_xuat_gia: luuHandler}});
      const maNhanh = await main(
        ['--su-kien', '7', '--nhanh'],
        {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA},
        {
          createClient: () => clientNhanh,
          log: (m) => logsNhanh.push(m),
        },
      );
      assert.equal(maNhanh, 1);
      assert.equal(tenRpc(clientNhanh, 'luu_de_xuat_gia').length, 1);
      assert.ok(logsNhanh.some((l) => l.includes('Khu 1') && l.includes('LOI')));

      const logsThuong = [];
      const chos = [];
      const clientThuong = taoClientGia({rpc: {luu_de_xuat_gia: luuHandler}});
      const maThuong = await main(
        ['--su-kien', '7'],
        {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA},
        {
          createClient: () => clientThuong,
          cho: async (ms) => chos.push(ms),
          log: (m) => logsThuong.push(m),
        },
      );
      assert.equal(maThuong, 1);
      assert.equal(chos.length, 0);
      assert.equal(tenRpc(clientThuong, 'het_han_de_xuat_gia').length, 1);
      assert.equal(tenRpc(clientThuong, 'luu_de_xuat_gia').length, 1);
      assert.ok(logsThuong.some((l) => l.includes('Khu 1') && l.includes('LOI')));
    } finally {
      loiGhi.mock.restore();
    }
  });
}

test('hai khu mất kết nối khi lưu: luu_de_xuat_gia chỉ gọi 1 lần, bị chặn sau lỗi đầu tiên', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () => ok([hang(1), hang(2)]),
      luu_de_xuat_gia: () => LOI_KET_NOI_STATUS_0,
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.ok(kq.loiNghiemTrong instanceof LoiKetNoiNghiemTrong);
  assert.equal(tenRpc(client, 'luu_de_xuat_gia').length, 1);
  assert.equal(kq.theoKhu.length, 2);
  assert.equal(kq.theoKhu[0].ketQua, 'LOI');
  assert.equal(kq.theoKhu[1].ketQua, 'LOI');

  const loiGhi = mock.method(console, 'error', () => {});
  try {
    const clientMain = taoClientGia({
      rpc: {
        lay_so_lieu_dinh_gia: () => ok([hang(1), hang(2)]),
        luu_de_xuat_gia: () => LOI_KET_NOI_STATUS_0,
      },
    });
    const ma = await main(
      ['--su-kien', '7', '--nhanh'],
      {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA},
      {createClient: () => clientMain, log: () => {}},
    );
    assert.equal(ma, 1);
    assert.equal(tenRpc(clientMain, 'luu_de_xuat_gia').length, 1);
  } finally {
    loiGhi.mock.restore();
  }
});

test('lỗi kết nối khi lưu: khóa trong message lỗi bị thay bằng ***', async () => {
  const loiGhi = mock.method(console, 'error', () => {});
  const logs = [];
  try {
    const client = taoClientGia({
      rpc: {
        luu_de_xuat_gia: () => ({
          data: null,
          error: {message: `TypeError: fetch failed với khóa ${KHOA_GIA}`, code: ''},
          status: 0,
        }),
      },
    });
    const ma = await main(
      ['--su-kien', '7', '--nhanh'],
      {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA},
      {createClient: () => client, log: (m) => logs.push(m)},
    );
    assert.equal(ma, 1);
    const inRa = loiGhi.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    const logRa = logs.join('\n');
    assert.ok(!inRa.includes(KHOA_GIA));
    assert.ok(inRa.includes('***'));
    assert.ok(!logRa.includes(KHOA_GIA));
    assert.ok(logRa.includes('***'));
  } finally {
    loiGhi.mock.restore();
  }
});

for (const [ten, rpc] of [
  ['het_han trả lỗi', {het_han_de_xuat_gia: () => loi('het_han hỏng')}],
  ['het_han sai dạng', {het_han_de_xuat_gia: () => ok({suKienId: 7})}],
  ['lay_so_lieu trả lỗi', {lay_so_lieu_dinh_gia: () => loi('số liệu hỏng')}],
  ['lay_so_lieu sai dạng', {lay_so_lieu_dinh_gia: () => ok({khong: 'phai mang'})}],
]) {
  test(`lỗi nghiêm trọng (${ten}) → mã thoát 1`, async () => {
    const loiGhi = mock.method(console, 'error', () => {});
    try {
      const ma = await main(['--su-kien', '7', '--nhanh'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
        createClient: () => taoClientGia({rpc}),
        log: () => {},
      });
      assert.equal(ma, 1);
    } finally {
      loiGhi.mock.restore();
    }
  });
}

test('lỗi nghiêm trọng: khóa trong thông báo lỗi bị thay bằng ***', async () => {
  const loiGhi = mock.method(console, 'error', () => {});
  try {
    const ma = await main(['--su-kien', '7', '--nhanh'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
      createClient: () => taoClientGia({rpc: {het_han_de_xuat_gia: () => loi(`bị từ chối với ${KHOA_GIA}`)}}),
      log: () => {},
    });
    assert.equal(ma, 1);
    const inRa = loiGhi.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(!inRa.includes(KHOA_GIA));
    assert.ok(inRa.includes('***'));
  } finally {
    loiGhi.mock.restore();
  }
});

test('main chế độ thường cũng thoát 1 khi gặp lỗi nghiêm trọng, không retry', async () => {
  const loiGhi = mock.method(console, 'error', () => {});
  try {
    const client = taoClientGia({rpc: {het_han_de_xuat_gia: () => loi('hỏng')}});
    const chos = [];
    const ma = await main(['--su-kien', '7'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
      createClient: () => client,
      cho: async (ms) => chos.push(ms),
      log: () => {},
    });
    assert.equal(ma, 1);
    assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
    assert.equal(chos.length, 0);
  } finally {
    loiGhi.mock.restore();
  }
});

test('main tạo client với auth không lưu phiên', async () => {
  const lanGoi = [];
  const ma = await main(['--su-kien', '7', '--nhanh'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
    createClient: (...args) => {
      lanGoi.push(args);
      return taoClientGia();
    },
    log: () => {},
  });
  assert.equal(ma, 0);
  assert.equal(lanGoi.length, 1);
  assert.deepEqual(lanGoi[0], [URL_GIA, KHOA_GIA, {auth: {persistSession: false, autoRefreshToken: false}}]);
});

// ------------------------------------------------------------------ mốc lấp đầy

test('mocLapDay chỉ gồm khu mở bán, bật quy tắc, có tỷ lệ lấp đầy', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () =>
        ok([
          hang(1, {n_total: 100, n_sold: 40, n_hold: 20}),
          hang(2, {dang_mo_ban: false}),
          hang(3, {kich_hoat: false}),
          hang(4, {n_total: null}),
        ]),
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.deepEqual([...kq.mocLapDay.entries()], [[1, 0.5]]);
});

// ------------------------------------------------------------------ (f) lịch 60 phút

test('hằng số lịch', () => {
  assert.equal(CHU_KY_MS, 3600000);
  assert.equal(NHIP_KIEM_TRA_MS, 300000);
  assert.equal(NGUONG_BIEN_DONG, 0.05);
});

test('lịch: ở 59 phút không chạy chu kỳ mới', async () => {
  const {client, kq} = await chayLichGia({sold: [500, 500], buocMs: 59 * 60000});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
  assert.equal(kq.soChuKy, 1);
  assert.equal(kq.lyDoKetThuc, 'TIN_HIEU_DUNG');
});

test('lịch: ở đúng 60 phút có chạy chu kỳ mới', async () => {
  const {client, kq, logs} = await chayLichGia({sold: [500, 500], buocMs: CHU_KY_MS});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(kq.soChuKy, 2);
  assert.ok(logs.some((l) => l.includes('LICH_60_PHUT')));
});

test('lịch: nhịp 5 phút, 11 nhịp đầu chỉ đọc số liệu, nhịp 12 chạy chu kỳ', async () => {
  const sold = Array.from({length: 13}, () => 500);
  const {client, chos, kq} = await chayLichGia({sold});
  assert.ok(chos.length >= 12);
  assert.ok(chos.every((ms) => ms === NHIP_KIEM_TRA_MS));
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(kq.soChuKy, 2);

  // Chu kỳ đầu: 6 lời gọi (không lưu đề xuất vì r = 0,5). Các nhịp 1..11 chỉ gọi lay_so_lieu_dinh_gia.
  const sauChuKyDau = client.calls.slice(6);
  const truocChuKy2 = sauChuKyDau.findIndex((c) => c.k === 'rpc' && c.name === 'het_han_de_xuat_gia');
  assert.equal(truocChuKy2, 11);
  assert.ok(sauChuKyDau.slice(0, 11).every((c) => c.k === 'rpc' && c.name === 'lay_so_lieu_dinh_gia'));
});

test('lịch: không chạy chồng chu kỳ và không gọi đồng thời', async () => {
  const {client} = await chayLichGia({sold: Array.from({length: 14}, () => 500)});
  assert.equal(client.stat.toiDaDongThoi, 1);
});

test('lịch: signal đã hủy thì dừng ngay, không gọi mạng', async () => {
  const client = taoClientGia();
  const ac = new AbortController();
  ac.abort();
  const kq = await chayLich({io: taoIo(client), suKienId: 7, signal: ac.signal, log: () => {}});
  assert.deepEqual(kq, {soChuKy: 0, lyDoKetThuc: 'TIN_HIEU_DUNG'});
  assert.equal(client.calls.length, 0);
});

// ------------------------------------------------------------------ (g) ngưỡng 5 điểm

test('ngưỡng: chênh 4,9 điểm không kích hoạt', async () => {
  const {client, kq, logs} = await chayLichGia({sold: [500, 549]});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
  assert.equal(kq.soChuKy, 1);
  assert.ok(logs.some((l) => l.includes('mốc giữ nguyên')));
});

test('ngưỡng: đúng 5 điểm (0,50 → 0,55) kích hoạt chu kỳ', async () => {
  const {client, kq, logs} = await chayLichGia({sold: [500, 550]});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(kq.soChuKy, 2);
  assert.ok(logs.some((l) => l.includes('BIEN_DONG_LAP_DAY')));
});

test('ngưỡng: giảm đúng 5 điểm cũng kích hoạt', async () => {
  const {client} = await chayLichGia({sold: [500, 450]});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 2);
});

test('ngưỡng: nhịp kiểm tra không đổi mốc, chỉ chu kỳ đầy đủ mới đổi', async () => {
  // Nhịp 1: 0,54 (lệch 4 so với mốc 0,50, không kích hoạt). Nếu mốc bị đổi sang 0,54 thì
  // nhịp 2 (0,58) chỉ lệch 4 và không kích hoạt; giữ mốc 0,50 thì lệch 8 và kích hoạt.
  // Nhịp 3: 0,58 so với mốc mới 0,58 không kích hoạt nữa.
  const {client, logs} = await chayLichGia({sold: [500, 540, 580, 580, 580]});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(logs.filter((l) => l.includes('BIEN_DONG_LAP_DAY')).length, 1);
  const logCuoi = logs.filter((l) => l.includes('Mốc lấp đầy mới'));
  assert.equal(logCuoi.length, 2);
  assert.ok(logCuoi[0].includes('1:50.00%'));
  assert.ok(logCuoi[1].includes('1:58.00%'));
});

test('ngưỡng: nhịp kiểm tra không gọi het_han và không lưu đề xuất', async () => {
  const {client} = await chayLichGia({sold: [500, 540, 540]});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
  assert.equal(tenRpc(client, 'luu_de_xuat_gia').length, 0);
});

test('ngưỡng: chênh 0,0499996 (5000000 → 5499996 / 10000000) không kích hoạt', async () => {
  const {client, kq, logs} = await chayLichGia({total: 10000000, sold: [5000000, 5499996]});
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
  assert.equal(kq.soChuKy, 1);
  assert.ok(logs.some((l) => l.includes('mốc giữ nguyên')));
});

test('ngưỡng: đúng 0,05 tăng và giảm (kể cả 0,50 → 0,45 do sai số dấu phẩy động) đều kích hoạt', async () => {
  const tang = await chayLichGia({total: 10000000, sold: [5000000, 5500000]});
  assert.equal(tenRpc(tang.client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(tang.kq.soChuKy, 2);
  assert.ok(tang.logs.some((l) => l.includes('BIEN_DONG_LAP_DAY')));

  assert.equal(Math.abs(450 / 1000 - 500 / 1000) < 0.05, true);
  const giam = await chayLichGia({total: 1000, sold: [500, 450]});
  assert.equal(tenRpc(giam.client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(giam.kq.soChuKy, 2);
  assert.ok(giam.logs.some((l) => l.includes('BIEN_DONG_LAP_DAY')));

  const giamLon = await chayLichGia({total: 10000000, sold: [5000000, 4500000]});
  assert.equal(tenRpc(giamLon.client, 'het_han_de_xuat_gia').length, 2);
  assert.equal(giamLon.kq.soChuKy, 2);
  assert.ok(giamLon.logs.some((l) => l.includes('BIEN_DONG_LAP_DAY')));
});

// ------------------------------------------------------------------ (h) --nhanh

test('--nhanh: đúng một chu kỳ, không gọi cho(), kết thúc NHANH_XONG', async () => {
  const client = taoClientGia();
  let soLanCho = 0;
  const kq = await chayLich({
    io: taoIo(client),
    suKienId: 7,
    nhanh: true,
    dongHo: {now: () => 0},
    cho: async () => {
      soLanCho += 1;
    },
    log: () => {},
  });
  assert.deepEqual(kq, {soChuKy: 1, lyDoKetThuc: 'NHANH_XONG'});
  assert.equal(soLanCho, 0);
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
  assert.equal(tenRpc(client, 'luu_de_xuat_gia').length, 1);
});

test('--nhanh qua main: thoát 0 không cần signal và không chờ', async () => {
  const client = taoClientGia();
  const daGoiCho = [];
  const ma = await main(['--nhanh', '--su-kien=7'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA}, {
    createClient: () => client,
    cho: async (ms) => daGoiCho.push(ms),
    log: () => {},
  });
  assert.equal(ma, 0);
  assert.equal(daGoiCho.length, 0);
  assert.equal(tenRpc(client, 'het_han_de_xuat_gia').length, 1);
});

// ------------------------------------------------------------------ (i) dang_mo_ban theo suất

test('SAP_MO_BAN có dang_mo_ban = true vẫn được tính và lưu', async () => {
  const client = taoClientGia({
    rpc: {lay_so_lieu_dinh_gia: () => ok([hang(1, {trang_thai_suat: 'SAP_MO_BAN', dang_mo_ban: true})])},
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.equal(kq.theoKhu[0].ketQua, 'DA_LUU');
  assert.equal(tenRpc(client, 'luu_de_xuat_gia').length, 1);
});

test('DANG_MO_BAN có dang_mo_ban = false bị BO_QUA SUAT_DIEN_KHONG_MO_BAN', async () => {
  const client = taoClientGia({
    rpc: {lay_so_lieu_dinh_gia: () => ok([hang(1, {trang_thai_suat: 'DANG_MO_BAN', dang_mo_ban: false})])},
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.equal(kq.theoKhu[0].ketQua, 'BO_QUA');
  assert.deepEqual(kq.theoKhu[0].lyDoBoQua, ['SUAT_DIEN_KHONG_MO_BAN']);
  assert.equal(tenRpc(client, 'luu_de_xuat_gia').length, 0);
  assert.equal(kq.mocLapDay.size, 0);
});

test('một sự kiện có hai suất, một mở một đóng: chỉ khu của suất mở được lưu', async () => {
  const client = taoClientGia({
    rpc: {
      lay_so_lieu_dinh_gia: () =>
        ok([
          hang(1, {suat_dien_id: 10, trang_thai_suat: 'SAP_MO_BAN', dang_mo_ban: true}),
          hang(2, {suat_dien_id: 11, trang_thai_suat: 'DANG_MO_BAN', dang_mo_ban: false}),
        ]),
    },
  });
  const kq = await chayMotChuKy({io: taoIo(client), suKienId: 7});
  assert.equal(kq.theoKhu[0].ketQua, 'DA_LUU');
  assert.equal(kq.theoKhu[0].suatDienId, 10);
  assert.equal(kq.theoKhu[1].ketQua, 'BO_QUA');
  assert.equal(kq.theoKhu[1].suatDienId, 11);
  assert.deepEqual(kq.theoKhu[1].lyDoBoQua, ['SUAT_DIEN_KHONG_MO_BAN']);
  const luu = tenRpc(client, 'luu_de_xuat_gia');
  assert.equal(luu.length, 1);
  assert.equal(luu[0].args.p_khu_vuc_id, 1);
  assert.deepEqual([...kq.mocLapDay.keys()], [1]);
});

// ------------------------------------------------------------------ (k) import không tự chạy

test('import module không tự chạy CLI và không truy cập mạng', async () => {
  const fetchGoc = globalThis.fetch;
  let soLanFetch = 0;
  globalThis.fetch = async () => {
    soLanFetch += 1;
    throw new Error('không được gọi mạng');
  };
  const soSigint = process.listenerCount('SIGINT');
  const exitCodeGoc = process.exitCode;
  try {
    const mod = await import(`${pathToFileURL(DUONG_DAN_SCRIPT).href}?kiem-tra-import`);
    assert.equal(typeof mod.main, 'function');
    assert.equal(typeof mod.chayLich, 'function');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(soLanFetch, 0);
    assert.equal(process.listenerCount('SIGINT'), soSigint);
    assert.equal(process.exitCode, exitCodeGoc);
  } finally {
    globalThis.fetch = fetchGoc;
  }
});

function chayTienTrinh(args, envThem = {}) {
  const env = {};
  for (const ten of ['PATH', 'Path', 'SystemRoot']) {
    if (process.env[ten] !== undefined) env[ten] = process.env[ten];
  }
  Object.assign(env, envThem);
  return spawnSync(process.execPath, [DUONG_DAN_SCRIPT, ...args], {
    env,
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
}

test('chạy trực tiếp thiếu biến: thoát 2 và nêu tên biến', () => {
  const kq = chayTienTrinh(['--su-kien', '7']);
  assert.equal(kq.status, 2);
  assert.ok(`${kq.stdout}${kq.stderr}`.includes('SUPABASE_URL'));
  assert.ok(`${kq.stdout}${kq.stderr}`.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('chạy trực tiếp có khóa giả nhưng CLI sai: thoát 2, đầu ra không chứa khóa', () => {
  const kq = chayTienTrinh(['--su-kien', 'abc'], {SUPABASE_URL: URL_GIA, SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA});
  assert.equal(kq.status, 2);
  assert.ok(!`${kq.stdout}${kq.stderr}`.includes(KHOA_GIA));
});

test('chạy trực tiếp có khóa giả nhưng thiếu URL: thoát 2, đầu ra không chứa khóa', () => {
  const kq = chayTienTrinh(['--su-kien', '7'], {SUPABASE_SERVICE_ROLE_KEY: KHOA_GIA});
  assert.equal(kq.status, 2);
  assert.ok(`${kq.stdout}${kq.stderr}`.includes('SUPABASE_URL'));
  assert.ok(!`${kq.stdout}${kq.stderr}`.includes(KHOA_GIA));
});

test('LoiCauHinh và LoiThamSo là lớp lỗi riêng', () => {
  assert.ok(new LoiCauHinh('x') instanceof Error);
  assert.ok(new LoiThamSo('x') instanceof Error);
  assert.notEqual(LoiCauHinh, LoiThamSo);
});
