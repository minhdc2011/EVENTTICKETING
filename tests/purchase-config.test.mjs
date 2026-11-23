import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {build} from 'esbuild';

import {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  PurchaseConfigError,
  canManagePurchaseConfig,
  chuanHoaDongCauHinh,
  docCauHinhTheoCauHinh,
  luuCauHinhTheoCauHinh,
  phanLoaiLoiRpc,
  taoThamSoRpc,
  validatePurchaseConfigInput,
} from '../src/domain/purchaseConfig.js';
import {
  DEMO_NGUOI_DUNG,
  KHOA_LUU_TRU_MO_PHONG,
  NHAN_MO_PHONG,
  createMockPurchaseConfigState,
  docCauHinhMoPhong,
  khoiTaoDemoCauHinhMuaVe,
  luuCauHinhMoPhong,
  taoKhoMoPhong,
} from '../src/domain/mockPurchaseConfig.js';

// ===== Lõi thuần (sonnet) =====

function fakeClient({selectResult, rpcResult} = {}) {
  const calls = {from: [], select: [], eq: [], rpc: []};
  const builder = {
    select(cols) { calls.select.push(cols); return builder; },
    eq(col, val) { calls.eq.push([col, val]); return builder; },
    maybeSingle: async () => selectResult ?? {data: null, error: null},
  };
  return {
    calls,
    from(table) { calls.from.push(table); return builder; },
    rpc: async (name, args) => { calls.rpc.push([name, args]); return rpcResult ?? {data: {suKienId: args.p_su_kien_id, soVeToiDaMoiDon: args.p_so_ve_toi_da, yeuCauXacMinhOtp: args.p_yeu_cau_otp, daThayDoi: true}, error: null}; },
  };
}

test('validation: chấp nhận biên 1 và 20, boolean thật', () => {
  for (const n of [1, 20, 4, '5', ' 7 ']) {
    const r = validatePurchaseConfigInput({soVeToiDaMoiDon: n, yeuCauXacMinhOtp: true});
    assert.equal(r.ok, true, String(n));
    assert.equal(r.value.soVeToiDaMoiDon, Number(n));
    assert.equal(r.firstInvalidField, null);
  }
  assert.equal(validatePurchaseConfigInput({soVeToiDaMoiDon: 3, yeuCauXacMinhOtp: false}).value.yeuCauXacMinhOtp, false);
});

test('validation: từ chối số vé không hợp lệ theo trường', () => {
  for (const n of [0, 21, 2.5, NaN, Infinity, '', ' ', null, undefined, '1e1', '2.5', 'abc', -1, true]) {
    const r = validatePurchaseConfigInput({soVeToiDaMoiDon: n, yeuCauXacMinhOtp: true});
    assert.equal(r.ok, false, String(n));
    assert.ok(r.errors.soVeToiDaMoiDon, String(n));
    assert.equal(r.errors.yeuCauXacMinhOtp, undefined);
    assert.equal(r.firstInvalidField, 'soVeToiDaMoiDon');
    assert.equal(r.value, null);
  }
});

test('validation: từ chối kiểu boolean không hợp lệ', () => {
  for (const b of ['true', 1, 0, null, undefined, 'false']) {
    const r = validatePurchaseConfigInput({soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: b});
    assert.equal(r.ok, false, String(b));
    assert.ok(r.errors.yeuCauXacMinhOtp);
    assert.equal(r.errors.soVeToiDaMoiDon, undefined);
    assert.equal(r.firstInvalidField, 'yeuCauXacMinhOtp');
  }
  const both = validatePurchaseConfigInput({soVeToiDaMoiDon: 0, yeuCauXacMinhOtp: 'x'});
  assert.ok(both.errors.soVeToiDaMoiDon && both.errors.yeuCauXacMinhOtp);
  assert.equal(validatePurchaseConfigInput(null).ok, false);
});

test('quyền: chỉ CHU_SO_HUU/QUAN_TRI của đúng tổ chức', () => {
  assert.equal(canManagePurchaseConfig({ToChucID: 7, VaiTro: 'CHU_SO_HUU'}, 7), true);
  assert.equal(canManagePurchaseConfig({organizationId: '7', role: 'QUAN_TRI', accountKind: 'ORGANIZER'}, ' 7 '), true);
  assert.equal(canManagePurchaseConfig([{ToChucID: 1, VaiTro: 'BIEN_TAP'}, {ToChucID: 7, VaiTro: 'QUAN_TRI', LoaiTaiKhoan: 'ADMIN'}], 7), true);
  assert.equal(canManagePurchaseConfig({ToChucID: 7, VaiTro: 'BIEN_TAP'}, 7), false);
  assert.equal(canManagePurchaseConfig({ToChucID: 7, VaiTro: 'KHAC_LA'}, 7), false);
  assert.equal(canManagePurchaseConfig({ToChucID: 8, VaiTro: 'CHU_SO_HUU'}, 7), false);
  assert.equal(canManagePurchaseConfig({ToChucID: 7, VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'CUSTOMER'}, 7), false);
  assert.equal(canManagePurchaseConfig({ToChucID: 7, VaiTro: 'CHU_SO_HUU'}, ''), false);
  assert.equal(canManagePurchaseConfig({ToChucID: 7, VaiTro: 'CHU_SO_HUU'}, null), false);
  assert.equal(canManagePurchaseConfig({ToChucID: '', VaiTro: 'CHU_SO_HUU'}, ''), false);
  assert.equal(canManagePurchaseConfig(null, 7), false);
  assert.equal(canManagePurchaseConfig([], 7), false);
});

test('đọc: không có dòng thì dùng 4/false và CHUA_CAU_HINH', async () => {
  const client = fakeClient({selectResult: {data: null, error: null}});
  const r = await docCauHinhTheoCauHinh({useMockData: false, layClient: () => client}, 9);
  assert.equal(r.soVeToiDaMoiDon, DEFAULT_SO_VE_TOI_DA);
  assert.equal(r.yeuCauXacMinhOtp, DEFAULT_YEU_CAU_OTP);
  assert.equal(r.trangThai, 'CHUA_CAU_HINH');
  assert.equal(r.nguon, 'SUPABASE');
  assert.equal(r.moPhong, false);
  assert.deepEqual(client.calls.from, ['CAU_HINH_SU_KIEN']);
  assert.deepEqual(client.calls.select, ['SoVeToiDaMoiDon, YeuCauXacMinhOTP, ThoiGianGiuChoPhut']);
  assert.deepEqual(client.calls.eq, [['SuKienID', 9]]);
});

test('đọc: dòng có thật giữ OTP và thời gian giữ chỗ', async () => {
  const client = fakeClient({selectResult: {data: {SoVeToiDaMoiDon: 6, YeuCauXacMinhOTP: true, ThoiGianGiuChoPhut: 12}, error: null}});
  const r = await docCauHinhTheoCauHinh({useMockData: false, layClient: () => client}, 3);
  assert.equal(r.soVeToiDaMoiDon, 6);
  assert.equal(r.yeuCauXacMinhOtp, true);
  assert.equal(r.thoiGianGiuChoPhut, 12);
  assert.equal(r.trangThai, 'DA_CAU_HINH');
  const r2 = chuanHoaDongCauHinh({SoVeToiDaMoiDon: 2, YeuCauXacMinhOTP: false, ThoiGianGiuChoPhut: null}, 3, 'SUPABASE');
  assert.equal(r2.yeuCauXacMinhOtp, false);
  assert.equal(r2.thoiGianGiuChoPhut, null);
});

test('đọc: dòng có thật nhưng số vé sai -> LOI_DOC, không dùng mặc định', async () => {
  const laLoiDoc = (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC';
  for (const so of ['', null, undefined, NaN, 2.5, 0, 21, '4']) {
    assert.throws(() => chuanHoaDongCauHinh({SoVeToiDaMoiDon: so, YeuCauXacMinhOTP: false}, 3, 'SUPABASE'), laLoiDoc, String(so));
  }
  assert.throws(() => chuanHoaDongCauHinh({YeuCauXacMinhOTP: false}, 3, 'SUPABASE'), laLoiDoc);
  for (const otp of [null, undefined, 'true']) {
    assert.throws(() => chuanHoaDongCauHinh({SoVeToiDaMoiDon: 4, YeuCauXacMinhOTP: otp}, 3, 'SUPABASE'), laLoiDoc, String(otp));
  }
  assert.throws(() => chuanHoaDongCauHinh({SoVeToiDaMoiDon: 4}, 3, 'SUPABASE'), laLoiDoc);

  const cases = [
    {SoVeToiDaMoiDon: null, YeuCauXacMinhOTP: true},
    {SoVeToiDaMoiDon: 5},
  ];
  for (const data of cases) {
    const client = fakeClient({selectResult: {data, error: null}});
    await assert.rejects(docCauHinhTheoCauHinh({useMockData: false, layClient: () => client}, 3), laLoiDoc);
  }
});

test('đọc: lỗi đọc ném LOI_DOC, không trả mặc định', async () => {
  const lỗi = {code: 'XX000', message: 'boom'};
  const client = fakeClient({selectResult: {data: null, error: lỗi}});
  await assert.rejects(
    docCauHinhTheoCauHinh({useMockData: false, layClient: () => client}, 1),
    (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC' && e.cause === lỗi,
  );
  await assert.rejects(
    docCauHinhTheoCauHinh({useMockData: false, layClient: () => { throw new Error('thieu cau hinh'); }}, 1),
    (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC',
  );
  await assert.rejects(
    docCauHinhTheoCauHinh({useMockData: false, layClient: async () => { throw new Error('x'); }}, 1),
    (e) => e.ma === 'LOI_DOC',
  );
});

test('đọc mock: ủy cho kho mock, không gọi layClient', async () => {
  const ghi = [];
  const kho = {doc: (id) => { ghi.push(id); return chuanHoaDongCauHinh(null, id, 'MO_PHONG'); }, luu: () => { throw new Error('khong goi'); }};
  const r = await docCauHinhTheoCauHinh({useMockData: true, layClient: () => { throw new Error('khong duoc goi'); }, khoMoPhong: kho}, 5);
  assert.deepEqual(ghi, [5]);
  assert.equal(r.moPhong, true);
  assert.equal(r.nguon, 'MO_PHONG');
});

test('lưu: gọi đúng RPC, không đụng from()', async () => {
  const client = fakeClient();
  const r = await luuCauHinhTheoCauHinh({useMockData: false, layClient: () => client}, 11, {soVeToiDaMoiDon: '8', yeuCauXacMinhOtp: true});
  assert.deepEqual(client.calls.rpc, [['luu_cau_hinh_mua_ve', {p_su_kien_id: 11, p_so_ve_toi_da: 8, p_yeu_cau_otp: true}]]);
  assert.deepEqual(client.calls.from, []);
  assert.equal(r.daThayDoi, true);
  assert.equal(r.soVeToiDaMoiDon, 8);
  assert.deepEqual(taoThamSoRpc(2, {soVeToiDaMoiDon: 1, yeuCauXacMinhOtp: false}), {p_su_kien_id: 2, p_so_ve_toi_da: 1, p_yeu_cau_otp: false});
});

test('lưu: input sai thì không gọi rpc/from/layClient', async () => {
  let layClientGoi = 0;
  const client = fakeClient();
  const deps = {useMockData: false, layClient: () => { layClientGoi += 1; return client; }};
  await assert.rejects(
    luuCauHinhTheoCauHinh(deps, 1, {soVeToiDaMoiDon: 21, yeuCauXacMinhOtp: 'true'}),
    (e) => e.ma === 'KHONG_HOP_LE' && Boolean(e.loiTheoTruong.soVeToiDaMoiDon) && Boolean(e.loiTheoTruong.yeuCauXacMinhOtp),
  );
  assert.equal(client.calls.rpc.length, 0);
  assert.equal(client.calls.from.length, 0);
  assert.equal(layClientGoi, 0);
});

test('lưu: mock gọi kho.luu với giá trị đã chuẩn hóa, không gọi layClient', async () => {
  const ghi = [];
  const kho = {doc: () => chuanHoaDongCauHinh(null, 4, 'MO_PHONG'), luu: (id, value, nguoi) => { ghi.push([id, value, nguoi]); return {daThayDoi: true}; }};
  const nguoi = {id: 'u1'};
  await luuCauHinhTheoCauHinh({useMockData: true, layClient: () => { throw new Error('khong'); }, khoMoPhong: kho, nguoiDung: nguoi}, 4, {soVeToiDaMoiDon: '3', yeuCauXacMinhOtp: false});
  assert.deepEqual(ghi, [[4, {soVeToiDaMoiDon: 3, yeuCauXacMinhOtp: false}, nguoi]]);
});

test('lưu: rpc ném lỗi mạng thì thành LOI_LUU', async () => {
  const client = {from() { throw new Error('khong'); }, rpc: async () => { throw new Error('net'); }};
  await assert.rejects(
    luuCauHinhTheoCauHinh({useMockData: false, layClient: () => client}, 1, {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false}),
    (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_LUU',
  );
});

test('lưu: ánh xạ lỗi RPC', async () => {
  const mk = (error) => fakeClient({rpcResult: {data: null, error}});
  const chay = (error) => luuCauHinhTheoCauHinh({useMockData: false, layClient: () => mk(error)}, 1, {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false});

  await assert.rejects(chay({code: '42501', message: 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN'}), (e) => e.ma === 'KHONG_CO_QUYEN');
  await assert.rejects(chay({code: '42501', message: 'CAU_HINH_MUA_VE_CAN_DANG_NHAP'}), (e) => e.ma === 'CAN_DANG_NHAP');
  await assert.rejects(
    chay({code: '22023', message: 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_so_ve_toi_da'}),
    (e) => e.ma === 'KHONG_HOP_LE' && Boolean(e.loiTheoTruong.soVeToiDaMoiDon) && !e.loiTheoTruong.yeuCauXacMinhOtp,
  );
  await assert.rejects(
    chay({code: '22023', message: 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_yeu_cau_otp'}),
    (e) => Boolean(e.loiTheoTruong.yeuCauXacMinhOtp),
  );
  await assert.rejects(chay({code: 'P0002', message: 'SU_KIEN_KHONG_TON_TAI'}), (e) => e.ma === 'SU_KIEN_KHONG_TON_TAI');
  await assert.rejects(chay({code: '08006', message: 'net'}), (e) => e.ma === 'LOI_LUU');
  assert.equal(phanLoaiLoiRpc({code: '22023', message: 'CAU_HINH_MUA_VE_KHONG_HOP_LE'}).loiTheoTruong, undefined);
});

// ===== Mock, dây nối service và tích hợp (hydrogen thêm bên dưới) =====

test('mock: khoiTaoDemoCauHinhMuaVe xác định, có nhãn MO_PHONG và khớp ID sự kiện mock', () => {
  const a = khoiTaoDemoCauHinhMuaVe();
  const b = khoiTaoDemoCauHinhMuaVe();
  assert.deepEqual(a, b);
  assert.equal(a.nhan, NHAN_MO_PHONG);
  assert.equal(a.cauHinh[1].nhan, NHAN_MO_PHONG);
  assert.equal(a.cauHinh[2].nhan, NHAN_MO_PHONG);
  assert.ok(a.suKien[1] && a.suKien[2] && a.suKien[3] && a.suKien[990001]);

  // Đột biến bản sao không ảnh hưởng lần khởi tạo tiếp theo.
  a.cauHinh[1].SoVeToiDaMoiDon = 19;
  assert.equal(khoiTaoDemoCauHinhMuaVe().cauHinh[1].SoVeToiDaMoiDon, DEFAULT_SO_VE_TOI_DA);
});

test('mock: createMockPurchaseConfigState và luuCauHinhMoPhong thuần, không sửa đầu vào', () => {
  const seed = {
    suKien: {10: {ToChucID: 'org-1'}, 20: {ToChucID: 'org-1'}},
    thanhVien: [{ToChucID: 'org-1', NguoiDungID: 'u-owner', VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'}],
    cauHinh: {10: {SoVeToiDaMoiDon: 3, YeuCauXacMinhOTP: false, ThoiGianGiuChoPhut: 5}},
  };
  const snapshot = structuredClone(seed);
  const state = createMockPurchaseConfigState(seed);
  assert.deepEqual(seed, snapshot);
  assert.equal(state.nhan, NHAN_MO_PHONG);
  assert.equal(state.cauHinh[10].nhan, NHAN_MO_PHONG);

  const stateSnap = structuredClone(state);
  const {state: nextState, result} = luuCauHinhMoPhong(
    state,
    10,
    {soVeToiDaMoiDon: 7, yeuCauXacMinhOtp: true},
    {id: 'u-owner', loaiTaiKhoan: 'ORGANIZER'},
  );
  assert.deepEqual(state, stateSnap);
  assert.equal(result.daThayDoi, true);
  assert.equal(result.nhan, NHAN_MO_PHONG);
  assert.equal(result.moPhong, true);
  assert.equal(result.nguon, NHAN_MO_PHONG);
  assert.equal(docCauHinhMoPhong(nextState, 10).soVeToiDaMoiDon, 7);
  assert.equal(docCauHinhMoPhong(nextState, 10).yeuCauXacMinhOtp, true);
  assert.equal(docCauHinhMoPhong(nextState, 10).thoiGianGiuChoPhut, 5);
  assert.equal(docCauHinhMoPhong(nextState, 20).trangThai, 'CHUA_CAU_HINH');
});

test('mock: kho dùng chung lưu sự kiện A, đọc lại đúng, không đổi sự kiện B và không gọi layClient', async () => {
  const kho = taoKhoMoPhong(null);
  let layClientGoi = 0;
  const deps = {
    useMockData: true,
    layClient: () => {
      layClientGoi += 1;
      throw new Error('khong duoc goi');
    },
    khoMoPhong: kho,
    nguoiDung: DEMO_NGUOI_DUNG,
  };

  const truocB = await docCauHinhTheoCauHinh(deps, 2);
  const savedA = await luuCauHinhTheoCauHinh(deps, 3, {soVeToiDaMoiDon: 8, yeuCauXacMinhOtp: true});
  assert.equal(savedA.daThayDoi, true);
  assert.equal(savedA.nhan, NHAN_MO_PHONG);

  const docA = await docCauHinhTheoCauHinh(deps, 3);
  assert.equal(docA.soVeToiDaMoiDon, 8);
  assert.equal(docA.yeuCauXacMinhOtp, true);
  assert.equal(docA.trangThai, 'DA_CAU_HINH');
  assert.equal(docA.nguon, NHAN_MO_PHONG);
  assert.equal(docA.moPhong, true);

  const sauB = await docCauHinhTheoCauHinh(deps, 2);
  assert.deepEqual(sauB, truocB);

  const savedLai = await luuCauHinhTheoCauHinh(deps, 3, {soVeToiDaMoiDon: 8, yeuCauXacMinhOtp: true});
  assert.equal(savedLai.daThayDoi, false);
  assert.equal(layClientGoi, 0);
});

test('mock: người không đủ quyền hoặc sự kiện không tồn tại bị từ chối, không đổi dữ liệu', async () => {
  const kho = taoKhoMoPhong(null);
  const layClient = () => {
    throw new Error('khong duoc goi');
  };
  const truoc = kho.doc(1);

  for (const nguoiDung of [
    null,
    undefined,
    {id: 'mock-editor', loaiTaiKhoan: 'ORGANIZER'},
    {id: 'mock-other-owner', loaiTaiKhoan: 'ORGANIZER'},
    {id: 'mock-user', loaiTaiKhoan: 'USER'},
    {id: 'mock-user', loaiTaiKhoan: 'CUSTOMER'},
  ]) {
    await assert.rejects(
      luuCauHinhTheoCauHinh(
        {useMockData: true, layClient, khoMoPhong: kho, nguoiDung},
        1,
        {soVeToiDaMoiDon: 10, yeuCauXacMinhOtp: true},
      ),
      (e) => e instanceof PurchaseConfigError && e.ma === 'KHONG_CO_QUYEN',
    );
  }
  assert.deepEqual(kho.doc(1), truoc);

  await assert.rejects(
    luuCauHinhTheoCauHinh(
      {useMockData: true, layClient, khoMoPhong: kho, nguoiDung: DEMO_NGUOI_DUNG},
      999999,
      {soVeToiDaMoiDon: 5, yeuCauXacMinhOtp: false},
    ),
    (e) => e instanceof PurchaseConfigError && e.ma === 'SU_KIEN_KHONG_TON_TAI',
  );
});

const laLoiDoc = (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC';

test('mock: JSON hỏng ném LOI_DOC khi đọc và lưu; datLai khôi phục seed demo', () => {
  const badStorage = {
    getItem() {
      return '{invalid-json';
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  const kho = taoKhoMoPhong(badStorage);
  assert.throws(() => kho.doc(1), laLoiDoc);
  assert.throws(() => kho.luu(1, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}, DEMO_NGUOI_DUNG), laLoiDoc);

  kho.datLai();
  const doc1 = kho.doc(1);
  assert.equal(doc1.soVeToiDaMoiDon, DEFAULT_SO_VE_TOI_DA);
  assert.equal(doc1.trangThai, 'DA_CAU_HINH');
  const saved = kho.luu(3, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}, DEMO_NGUOI_DUNG);
  assert.equal(saved.soVeToiDaMoiDon, 6);
  assert.equal(kho.doc(3).soVeToiDaMoiDon, 6);
  assert.equal(kho.doc(3).yeuCauXacMinhOtp, true);
});

test('mock: getItem ném lỗi -> doc/luu ném LOI_DOC kèm cause', () => {
  const nguyen = new Error('SecurityError');
  const kho = taoKhoMoPhong({
    getItem() {
      throw nguyen;
    },
    setItem() {},
  });
  for (const thaoTac of [
    () => kho.doc(1),
    () => kho.luu(1, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}, DEMO_NGUOI_DUNG),
  ]) {
    assert.throws(thaoTac, (e) => laLoiDoc(e) && e.cause === nguyen);
  }
  kho.datLai();
  assert.equal(kho.doc(1).trangThai, 'DA_CAU_HINH');
});

/** Thay thế tạm thời globalThis.localStorage; getter ném SecurityError nếu `chan`, undefined nếu không. */
function thayTheLocalStorage(che) {
  const goc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const loi = new Error('blocked');
  loi.name = 'SecurityError';
  if (che === 'chan') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw loi;
      },
    });
  } else {
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: undefined, writable: true});
  }
  return {
    loi,
    khoiPhuc() {
      if (goc) Object.defineProperty(globalThis, 'localStorage', goc);
      else delete globalThis.localStorage;
    },
  };
}

/** Chạy fn đồng bộ với globalThis.localStorage thay thế và luôn khôi phục trong finally. */
function voiLocalStorage(che, fn) {
  const {loi, khoiPhuc} = thayTheLocalStorage(che);
  try {
    return fn(loi);
  } finally {
    khoiPhuc();
  }
}

/** Chạy fn bất đồng bộ với globalThis.localStorage thay thế và luôn khôi phục sau khi await xong. */
async function voiLocalStorageAsync(che, fn) {
  const {loi, khoiPhuc} = thayTheLocalStorage(che);
  try {
    return await fn(loi);
  } finally {
    khoiPhuc();
  }
}

test('mock: getter localStorage ném SecurityError -> LOI_DOC kèm cause, không seed demo', () => {
  voiLocalStorage('chan', (loi) => {
    const kho = taoKhoMoPhong();
    for (const thaoTac of [
      () => kho.doc(1),
      () => kho.luu(1, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}, DEMO_NGUOI_DUNG),
      () => kho.layTrangThai(),
    ]) {
      assert.throws(thaoTac, (e) => laLoiDoc(e) && e.cause === loi);
    }
    // Vẫn lỗi ở lần gọi sau: không có demo bị seed ngầm.
    assert.throws(() => kho.doc(1), laLoiDoc);
  });
});

test('mock: datLai() rõ ràng khi getter localStorage ném lỗi -> không ném, dùng seed demo trong bộ nhớ', () => {
  voiLocalStorage('chan', () => {
    const kho = taoKhoMoPhong();
    assert.doesNotThrow(() => kho.datLai());
    const doc1 = kho.doc(1);
    assert.equal(doc1.trangThai, 'DA_CAU_HINH');
    assert.equal(doc1.soVeToiDaMoiDon, 4);
    assert.equal(doc1.yeuCauXacMinhOtp, true);
    assert.doesNotThrow(() => kho.luu(1, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}, DEMO_NGUOI_DUNG));
    assert.equal(kho.doc(1).soVeToiDaMoiDon, 6);
  });
});

test('mock: localStorage thật sự không tồn tại hoặc storage:null -> dùng seed demo', () => {
  voiLocalStorage('xoa', () => {
    const doc2 = taoKhoMoPhong().doc(2);
    assert.equal(doc2.trangThai, 'DA_CAU_HINH');
    assert.equal(doc2.soVeToiDaMoiDon, 2);
    assert.equal(doc2.yeuCauXacMinhOtp, true);
  });
  const doc2 = taoKhoMoPhong(null).doc(2);
  assert.equal(doc2.trangThai, 'DA_CAU_HINH');
  assert.equal(doc2.soVeToiDaMoiDon, 2);
  assert.equal(doc2.yeuCauXacMinhOtp, true);
});

test('mock: JSON hợp lệ nhưng sai dạng ném LOI_DOC', () => {
  const hopLe = {suKien: {}, thanhVien: [], cauHinh: {}};
  for (const sai of [[], null, 'x', 5, {...hopLe, thanhVien: undefined}, {...hopLe, cauHinh: []}, {suKien: {}, thanhVien: []}]) {
    const kho = taoKhoMoPhong({getItem: () => JSON.stringify(sai), setItem() {}});
    assert.throws(() => kho.doc(1), laLoiDoc, JSON.stringify(sai));
    assert.throws(() => kho.luu(1, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}, DEMO_NGUOI_DUNG), laLoiDoc);
  }
});

test('mock: kho trống (getItem null) khởi tạo seed demo xác định có nhãn MO_PHONG', () => {
  const kho = taoKhoMoPhong({getItem: () => null, setItem() {}});
  const doc1 = kho.doc(1);
  assert.equal(doc1.trangThai, 'DA_CAU_HINH');
  assert.equal(doc1.soVeToiDaMoiDon, DEFAULT_SO_VE_TOI_DA);
  assert.equal(doc1.yeuCauXacMinhOtp, true); // demo: OTP bật cho mọi sự kiện hiện có
  assert.equal(doc1.nguon, NHAN_MO_PHONG);
  assert.equal(kho.layTrangThai().nhan, NHAN_MO_PHONG);
  assert.deepEqual(kho.layTrangThai(), khoiTaoDemoCauHinhMuaVe());
});

test('mock: dòng cauHinh sai dạng ([], null, chuỗi) ném LOI_DOC theo sự kiện, sự kiện khác vẫn đọc được, lưu sửa được', () => {
  for (const hong of [[], null, 'x']) {
    const seed = {
      suKien: {3: {ToChucID: 'mock-org-1'}, 4: {ToChucID: 'mock-org-1'}},
      thanhVien: [{ToChucID: 'mock-org-1', NguoiDungID: DEMO_NGUOI_DUNG.id, VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'}],
      cauHinh: {3: hong},
    };
    const state = createMockPurchaseConfigState(seed);
    assert.equal(state.cauHinh[3].hong, true);
    assert.equal(state.cauHinh[3].nhan, NHAN_MO_PHONG);

    const backing = new Map([[KHOA_LUU_TRU_MO_PHONG, JSON.stringify(seed)]]);
    const fakeStorage = {
      getItem: (k) => (backing.has(k) ? backing.get(k) : null),
      setItem: (k, v) => { backing.set(k, v); },
      removeItem: (k) => { backing.delete(k); },
    };
    const kho = [taoKhoMoPhong(null, {seed}), taoKhoMoPhong(fakeStorage)];
    assert.throws(() => docCauHinhMoPhong(state, 3), laLoiDoc);
    for (const k of kho) {
      assert.throws(() => k.doc(3), laLoiDoc, JSON.stringify(hong));
      const doc4 = k.doc(4);
      assert.equal(doc4.trangThai, 'CHUA_CAU_HINH');
      assert.equal(doc4.soVeToiDaMoiDon, DEFAULT_SO_VE_TOI_DA);
      assert.equal(doc4.yeuCauXacMinhOtp, DEFAULT_YEU_CAU_OTP);

      const saved = k.luu(3, {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false}, DEMO_NGUOI_DUNG);
      assert.equal(saved.daThayDoi, true);
      const docSau = k.doc(3);
      assert.equal(docSau.trangThai, 'DA_CAU_HINH');
      assert.equal(docSau.soVeToiDaMoiDon, 4);
      assert.equal(docSau.yeuCauXacMinhOtp, false);
    }
  }
});

test('mock: dòng cấu hình hỏng ném LOI_DOC, không ảnh hưởng sự kiện khác và lưu hợp lệ sửa lại được', async () => {
  const seed = {
    suKien: {3: {ToChucID: 'mock-org-1'}, 4: {ToChucID: 'mock-org-1'}},
    thanhVien: [{ToChucID: 'mock-org-1', NguoiDungID: DEMO_NGUOI_DUNG.id, VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'}],
    cauHinh: {3: {SoVeToiDaMoiDon: 'abc', YeuCauXacMinhOTP: false}},
  };
  const state = createMockPurchaseConfigState(seed);
  assert.equal(state.cauHinh[3].SoVeToiDaMoiDon, null);
  assert.throws(
    () => docCauHinhMoPhong(state, 3),
    (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC',
  );
  const ev4 = docCauHinhMoPhong(state, 4);
  assert.equal(ev4.soVeToiDaMoiDon, DEFAULT_SO_VE_TOI_DA);
  assert.equal(ev4.yeuCauXacMinhOtp, DEFAULT_YEU_CAU_OTP);
  assert.equal(ev4.trangThai, 'CHUA_CAU_HINH');

  const kho = taoKhoMoPhong(null, {seed});
  assert.throws(() => kho.doc(3), (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC');
  await assert.rejects(
    docCauHinhTheoCauHinh(
      {useMockData: true, layClient: () => { throw new Error('khong duoc goi'); }, khoMoPhong: kho},
      3,
    ),
    (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC',
  );

  // Lưu giá trị mặc định 4/false lên dòng đang hỏng vẫn phải tính là đã thay đổi để sửa bản ghi.
  const repaired = kho.luu(3, {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false}, DEMO_NGUOI_DUNG);
  assert.equal(repaired.daThayDoi, true);
  const docSau = kho.doc(3);
  assert.equal(docSau.trangThai, 'DA_CAU_HINH');
  assert.equal(docSau.soVeToiDaMoiDon, 4);
  assert.equal(docSau.yeuCauXacMinhOtp, false);

  // Round-trip qua fake localStorage chứa dòng hỏng cũng ném LOI_DOC, và lưu lại sẽ sửa được.
  const backing = new Map();
  backing.set(
    KHOA_LUU_TRU_MO_PHONG,
    JSON.stringify({
      nhan: NHAN_MO_PHONG,
      suKien: {3: {ToChucID: 'mock-org-1'}},
      thanhVien: [{ToChucID: 'mock-org-1', NguoiDungID: DEMO_NGUOI_DUNG.id, VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'}],
      cauHinh: {3: {SoVeToiDaMoiDon: 25, YeuCauXacMinhOTP: 'true', ThoiGianGiuChoPhut: 5}},
    }),
  );
  const fakeStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { backing.set(k, v); },
    removeItem: (k) => { backing.delete(k); },
  };
  const khoLs = taoKhoMoPhong(fakeStorage);
  assert.throws(() => khoLs.doc(3), (e) => e instanceof PurchaseConfigError && e.ma === 'LOI_DOC');
  const savedLs = khoLs.luu(3, {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false}, DEMO_NGUOI_DUNG);
  assert.equal(savedLs.daThayDoi, true);
  const khoLsReload = taoKhoMoPhong(fakeStorage);
  const docLs = khoLsReload.doc(3);
  assert.equal(docLs.trangThai, 'DA_CAU_HINH');
  assert.equal(docLs.soVeToiDaMoiDon, 4);
  assert.equal(docLs.yeuCauXacMinhOtp, false);
  assert.equal(docLs.thoiGianGiuChoPhut, 5);
});

async function loadServiceHarness({useMockData, entry = 'both'}) {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const contents =
    entry === 'purchaseConfig'
      ? `export * from './src/services/purchaseConfigService.ts';`
      : `
        export * from './src/services/purchaseConfigService.ts';
        export { loadEventPurchaseConfig } from './src/services/eventService.ts';
      `;
  const built = await build({
    stdin: {
      contents,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    define: {
      'import.meta.env.BASE_URL': '"/"',
    },
    plugins: [
      {
        name: 'purchase-config-service-harness',
        setup(b) {
          b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'pc-stub'}));
          b.onResolve({filter: /(services\/|\.\.?\/)supabaseClient$/}, (args) => {
            const resolved = path.resolve(args.resolveDir, args.path).replaceAll('\\', '/');
            if (resolved.endsWith('/src/services/supabaseClient')) {
              return {path: 'supabaseClient', namespace: 'pc-stub'};
            }
            return undefined;
          });
          b.onLoad({filter: /^runtime$/, namespace: 'pc-stub'}, () => ({
            contents: `
              export const runtimeConfig = {
                apiBaseUrl: '',
                websocketUrl: '',
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
                eventId: 'SUPER_CONCERT_2026',
                eventDatabaseId: 1,
                useMockData: ${useMockData ? 'true' : 'false'},
              };
              export const isSupabaseConfigured = () => globalThis.__PC_HARNESS__.isSupabaseConfigured();
              export const isApiConfigured = () => false;
              export const isWebSocketConfigured = () => false;
              export const getActiveEventContext = () => ({eventId: 'SUPER_CONCERT_2026', eventDatabaseId: 1, showId: 1, showSlug: 'dem-chinh'});
              export const setActiveEventContext = () => {};
            `,
            loader: 'js',
          }));
          b.onLoad({filter: /^supabaseClient$/, namespace: 'pc-stub'}, () => ({
            contents: `
              globalThis.__PC_HARNESS__.supabaseClientImports += 1;
              export function requireSupabaseClient() {
                return globalThis.__PC_HARNESS__.requireSupabaseClient();
              }
              export function getSupabaseClient() {
                return globalThis.__PC_HARNESS__.requireSupabaseClient();
              }
            `,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

test('service tích hợp (mock): BTC lưu sự kiện A, khán giả loadEventPurchaseConfig đọc lại đúng, không chạm Supabase', async () => {
  const prevHarness = globalThis.__PC_HARNESS__;
  let requireCalls = 0;
  globalThis.__PC_HARNESS__ = {
    supabaseClientImports: 0,
    isSupabaseConfigured: () => true,
    requireSupabaseClient: () => {
      requireCalls += 1;
      throw new Error('Không được gọi supabaseClient ở nhánh mock');
    },
  };
  try {
    // Kiểm tra purchaseConfigService.ts ở nhánh mock không bao giờ tải module supabaseClient.
    const pcOnly = await loadServiceHarness({useMockData: true, entry: 'purchaseConfig'});
    pcOnly.datLaiKhoMoPhongCauHinhMuaVe();
    await pcOnly.docCauHinhMuaVe(1);
    await pcOnly.luuCauHinhMuaVe(1, {soVeToiDaMoiDon: 5, yeuCauXacMinhOtp: false});
    assert.equal(globalThis.__PC_HARNESS__.supabaseClientImports, 0);

    const svc = await loadServiceHarness({useMockData: true});
    svc.datLaiKhoMoPhongCauHinhMuaVe();

    // Caller truyền useMockData: false cũng không thể ghi đè nhánh mock.
    const saved = await svc.luuCauHinhMuaVe(
      3,
      {soVeToiDaMoiDon: 9, yeuCauXacMinhOtp: true},
      {useMockData: false},
    );
    assert.equal(saved.nguon, 'MO_PHONG');
    assert.equal(saved.moPhong, true);

    const btcRead = await svc.docCauHinhMuaVe(3);
    assert.equal(btcRead.soVeToiDaMoiDon, 9);
    assert.equal(btcRead.yeuCauXacMinhOtp, true);
    assert.equal(btcRead.trangThai, 'DA_CAU_HINH');

    const audienceA = await svc.loadEventPurchaseConfig({id: 3});
    assert.equal(audienceA.maxTicketsPerOrder, 9);
    assert.equal(audienceA.requireOtp, true);
    assert.equal(audienceA.trangThai, 'DA_CAU_HINH');
    assert.equal(audienceA.loiDoc, false);

    // Sự kiện B (1 và 2) không bị ảnh hưởng.
    const audienceB1 = await svc.loadEventPurchaseConfig({id: 1});
    assert.equal(audienceB1.maxTicketsPerOrder, 4);
    assert.equal(audienceB1.holdMinutes, 5);
    assert.equal(audienceB1.requireOtp, true);

    const audienceB2 = await svc.loadEventPurchaseConfig({id: 2});
    assert.equal(audienceB2.maxTicketsPerOrder, 2);
    assert.equal(audienceB2.requireOtp, true);

    // Người không đủ quyền bị từ chối ở service mock.
    await assert.rejects(
      svc.luuCauHinhMuaVe(
        3,
        {soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: false},
        {nguoiDung: {id: 'mock-editor', loaiTaiKhoan: 'ORGANIZER'}},
      ),
      (e) => e instanceof svc.PurchaseConfigError && e.ma === 'KHONG_CO_QUYEN',
    );

    // Dữ liệu mock hỏng: docCauHinhMuaVe ném LOI_DOC, loadEventPurchaseConfig đóng an toàn OTP.
    svc.datLaiKhoMoPhongCauHinhMuaVe({
      suKien: {3: {ToChucID: 'mock-org-1'}, 4: {ToChucID: 'mock-org-1'}},
      thanhVien: [{ToChucID: 'mock-org-1', NguoiDungID: 'mock-user', VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'}],
      cauHinh: {3: {SoVeToiDaMoiDon: null, YeuCauXacMinhOTP: false}},
    });
    await assert.rejects(
      svc.docCauHinhMuaVe(3),
      (e) => e instanceof svc.PurchaseConfigError && e.ma === 'LOI_DOC',
    );
    const corruptedAudience = await svc.loadEventPurchaseConfig({id: 3});
    assert.deepEqual(corruptedAudience, {
      maxTicketsPerOrder: null,
      holdMinutes: null,
      requireOtp: true,
      trangThai: 'LOI_DOC',
      loiDoc: true,
    });
    const cleanAudience = await svc.loadEventPurchaseConfig({id: 4});
    assert.deepEqual(cleanAudience, {
      maxTicketsPerOrder: 4,
      holdMinutes: null,
      requireOtp: false,
      trangThai: 'CHUA_CAU_HINH',
      loiDoc: false,
    });
    svc.datLaiKhoMoPhongCauHinhMuaVe();

    assert.equal(requireCalls, 0);
  } finally {
    globalThis.__PC_HARNESS__ = prevHarness;
  }
});

test('service tích hợp (mock): lỗi storage, JSON/state hỏng và dòng hỏng trả LOI_DOC cho BTC & đóng OTP cho khán giả', async () => {
  const prevHarness = globalThis.__PC_HARNESS__;
  const prevWarn = console.warn;
  console.warn = () => {};
  let requireCalls = 0;
  globalThis.__PC_HARNESS__ = {
    supabaseClientImports: 0,
    isSupabaseConfigured: () => true,
    requireSupabaseClient: () => {
      requireCalls += 1;
      throw new Error('Không được gọi supabaseClient ở nhánh mock');
    },
  };

  let svc;
  try {
    svc = await loadServiceHarness({useMockData: true});

    const assertLoiDocCaHaiLuong = async (id) => {
      await assert.rejects(
        svc.docCauHinhMuaVe(id),
        (e) => e instanceof svc.PurchaseConfigError && e.ma === 'LOI_DOC',
      );
      const audience = await svc.loadEventPurchaseConfig({id});
      assert.deepEqual(audience, {
        maxTicketsPerOrder: null,
        holdMinutes: null,
        requireOtp: true,
        trangThai: 'LOI_DOC',
        loiDoc: true,
      });
    };

    const assertLuuKhoHong = async (id) => {
      await assert.rejects(
        svc.luuCauHinhMuaVe(id, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}),
        (e) => e instanceof svc.PurchaseConfigError && e.ma === 'LOI_DOC',
      );
    };

    // a) getItem ném lỗi
    svc.datLaiKhoMoPhongCauHinhMuaVe(undefined, {
      storage: {
        getItem() {
          throw new Error('SecurityError');
        },
        setItem() {},
      },
    });
    await assertLoiDocCaHaiLuong(1);
    await assertLuuKhoHong(1);

    // b) storage trả '{invalid-json'
    svc.datLaiKhoMoPhongCauHinhMuaVe(undefined, {
      storage: {
        getItem() {
          return '{invalid-json';
        },
        setItem() {},
      },
    });
    await assertLoiDocCaHaiLuong(1);
    await assertLuuKhoHong(1);

    // c) storage trả JSON sai dạng ('[]', thiếu cauHinh)
    for (const rawSai of ['[]', JSON.stringify({suKien: {}, thanhVien: []})]) {
      svc.datLaiKhoMoPhongCauHinhMuaVe(undefined, {
        storage: {
          getItem() {
            return rawSai;
          },
          setItem() {},
        },
      });
      await assertLoiDocCaHaiLuong(1);
      await assertLuuKhoHong(1);
    }

    // d) hỏng theo từng sự kiện (cauHinh[3] = []): id 3 LOI_DOC, id 4 vẫn CHUA_CAU_HINH 4/false
    svc.datLaiKhoMoPhongCauHinhMuaVe(
      {
        suKien: {3: {ToChucID: 'mock-org-1'}, 4: {ToChucID: 'mock-org-1'}},
        thanhVien: [
          {ToChucID: 'mock-org-1', NguoiDungID: 'mock-user', VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'},
        ],
        cauHinh: {3: []},
      },
      {storage: null},
    );
    await assertLoiDocCaHaiLuong(3);
    const btc4 = await svc.docCauHinhMuaVe(4);
    assert.equal(btc4.soVeToiDaMoiDon, 4);
    assert.equal(btc4.yeuCauXacMinhOtp, false);
    assert.equal(btc4.thoiGianGiuChoPhut, null);
    assert.equal(btc4.trangThai, 'CHUA_CAU_HINH');
    const audience4 = await svc.loadEventPurchaseConfig({id: 4});
    assert.deepEqual(audience4, {
      maxTicketsPerOrder: 4,
      holdMinutes: null,
      requireOtp: false,
      trangThai: 'CHUA_CAU_HINH',
      loiDoc: false,
    });

    // e) storage trống (getItem null) -> seed demo hợp lệ duy nhất
    svc.datLaiKhoMoPhongCauHinhMuaVe(undefined, {
      storage: {
        getItem() {
          return null;
        },
        setItem() {},
      },
    });
    const btc1 = await svc.docCauHinhMuaVe(1);
    assert.equal(btc1.soVeToiDaMoiDon, 4);
    assert.equal(btc1.yeuCauXacMinhOtp, true);
    assert.equal(btc1.thoiGianGiuChoPhut, 5);
    assert.equal(btc1.trangThai, 'DA_CAU_HINH');
    assert.equal(btc1.nguon, 'MO_PHONG');
    const audience1 = await svc.loadEventPurchaseConfig({id: 1});
    assert.deepEqual(audience1, {
      maxTicketsPerOrder: 4,
      holdMinutes: 5,
      requireOtp: true,
      trangThai: 'DA_CAU_HINH',
      loiDoc: false,
    });

    // f) getter globalThis.localStorage ném SecurityError -> LOI_DOC & đóng an toàn OTP;
    //    datLaiKhoMoPhongCauHinhMuaVe() không tham số vẫn không ném lỗi;
    //    localStorage thật sự undefined -> dùng seed demo.
    await voiLocalStorageAsync('chan', async (loi) => {
      svc.datLaiKhoMoPhongCauHinhMuaVe(undefined, {storage: undefined});
      await assert.rejects(
        svc.docCauHinhMuaVe(1),
        (e) => e instanceof svc.PurchaseConfigError && e.ma === 'LOI_DOC' && e.cause === loi,
      );
      const lockedAudience = await svc.loadEventPurchaseConfig({id: 1});
      assert.deepEqual(lockedAudience, {
        maxTicketsPerOrder: null,
        holdMinutes: null,
        requireOtp: true,
        trangThai: 'LOI_DOC',
        loiDoc: true,
      });
      await assert.rejects(
        svc.luuCauHinhMuaVe(1, {soVeToiDaMoiDon: 6, yeuCauXacMinhOtp: true}),
        (e) => e instanceof svc.PurchaseConfigError && e.ma === 'LOI_DOC' && e.cause === loi,
      );
      assert.equal(requireCalls, 0);

      // Reset không tham số khi getter đang ném lỗi: không ném, giữ seed demo trong bộ nhớ.
      assert.doesNotThrow(() => svc.datLaiKhoMoPhongCauHinhMuaVe());
      const resetDoc = await svc.docCauHinhMuaVe(1);
      assert.equal(resetDoc.soVeToiDaMoiDon, 4);
      assert.equal(resetDoc.yeuCauXacMinhOtp, true);
      assert.equal(resetDoc.trangThai, 'DA_CAU_HINH');
    });

    await voiLocalStorageAsync('xoa', async () => {
      svc.datLaiKhoMoPhongCauHinhMuaVe(undefined, {storage: undefined});
      const demo2 = await svc.loadEventPurchaseConfig({id: 2});
      assert.deepEqual(demo2, {
        maxTicketsPerOrder: 2,
        holdMinutes: 5,
        requireOtp: true,
        trangThai: 'DA_CAU_HINH',
        loiDoc: false,
      });
    });

    assert.equal(requireCalls, 0);
  } finally {
    if (svc) svc.datLaiKhoMoPhongCauHinhMuaVe();
    console.warn = prevWarn;
    globalThis.__PC_HARNESS__ = prevHarness;
  }
});

test('service tích hợp (thật): đọc có YeuCauXacMinhOTP, mặc định khi chưa có dòng, và đóng an toàn khi lỗi đọc', async () => {
  const prevHarness = globalThis.__PC_HARNESS__;
  const prevWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  let mode = 'configured';
  globalThis.__PC_HARNESS__ = {
    supabaseClientImports: 0,
    isSupabaseConfigured: () => mode !== 'missing_config',
    requireSupabaseClient: () => {
      if (mode === 'missing_config') throw new Error('Thiếu cấu hình Supabase');
      if (mode === 'db_error') {
        return fakeClient({selectResult: {data: null, error: {code: 'XX000', message: 'read failed'}}});
      }
      if (mode === 'empty_row') {
        return fakeClient({selectResult: {data: null, error: null}});
      }
      return fakeClient({
        selectResult: {
          data: {SoVeToiDaMoiDon: 6, YeuCauXacMinhOTP: true, ThoiGianGiuChoPhut: 10},
          error: null,
        },
      });
    },
  };

  try {
    const svc = await loadServiceHarness({useMockData: false});

    mode = 'configured';
    const configured = await svc.loadEventPurchaseConfig({id: 5});
    assert.deepEqual(configured, {
      maxTicketsPerOrder: 6,
      holdMinutes: 10,
      requireOtp: true,
      trangThai: 'DA_CAU_HINH',
      loiDoc: false,
    });

    const rpcClient = fakeClient();
    const savedReal = await svc.luuCauHinhMuaVe(
      5,
      {soVeToiDaMoiDon: 12, yeuCauXacMinhOtp: true},
      {client: rpcClient},
    );
    assert.deepEqual(rpcClient.calls.rpc, [
      ['luu_cau_hinh_mua_ve', {p_su_kien_id: 5, p_so_ve_toi_da: 12, p_yeu_cau_otp: true}],
    ]);
    assert.deepEqual(rpcClient.calls.from, []);
    assert.equal(savedReal.nguon, 'SUPABASE');
    assert.equal(savedReal.moPhong, false);

    mode = 'empty_row';
    const empty = await svc.loadEventPurchaseConfig({id: 99});
    assert.deepEqual(empty, {
      maxTicketsPerOrder: 4,
      holdMinutes: null,
      requireOtp: false,
      trangThai: 'CHUA_CAU_HINH',
      loiDoc: false,
    });

    mode = 'db_error';
    await assert.rejects(svc.docCauHinhMuaVe(5), (e) => e.ma === 'LOI_DOC');
    const failedDb = await svc.loadEventPurchaseConfig({id: 5});
    assert.deepEqual(failedDb, {
      maxTicketsPerOrder: null,
      holdMinutes: null,
      requireOtp: true,
      trangThai: 'LOI_DOC',
      loiDoc: true,
    });

    mode = 'missing_config';
    await assert.rejects(svc.docCauHinhMuaVe(5), (e) => e.ma === 'LOI_DOC');
    const failedCfg = await svc.loadEventPurchaseConfig({id: 5});
    assert.deepEqual(failedCfg, {
      maxTicketsPerOrder: null,
      holdMinutes: null,
      requireOtp: true,
      trangThai: 'LOI_DOC',
      loiDoc: true,
    });
    assert.equal(warnings.length, 2);
  } finally {
    console.warn = prevWarn;
    globalThis.__PC_HARNESS__ = prevHarness;
  }
});
