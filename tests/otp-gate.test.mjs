import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TRANG_THAI_CONG,
  apDungKetQua,
  apDungLoi,
  batDauKiemTra,
  dangXuat,
  doiPhien,
  hetHieuLuc,
  taoBoDieuPhoiCongOtp,
  taoTrangThaiCong,
  thuLai,
} from '../src/domain/otpGate.js';
import {
  CHO_GUI_LAI_GIAY,
  HIEU_LUC_GIAY,
  HIEU_LUC_XAC_MINH_GIAY,
  KIEM_TRA_LAI_THAT_MS,
  OtpServiceError,
  bangChungMockConHieuLuc,
  capNhatSauLoi,
  dangKyThuHoiBangChungMock,
  ghiNhanGui,
  guiMaOtpTheoCauHinh,
  khoBangChungMock,
  khoGuiMock,
  kiemTraBangChungThat,
  kiemTraDaXacMinhTheoCauHinh,
  layBienNhanGuiMock,
  layTheHeBangChungMock,
  taoBangChungMock,
  taoDinhDanhMockNguoiMua,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  xacMinhMaOtpTheoCauHinh,
  xoaBangChungMock,
} from '../src/domain/otpServiceCore.js';

const T0 = 1_700_000_000_000; // mốc giả; mọi bộ điều phối dùng mock phải tiêm now/setTimer/clearTimer
const SESSION_A = { userId: 'user-a', email: 'buyer-a@example.com', fullName: 'A', accountKind: 'USER' };
const SESSION_B = { userId: 'user-b', email: 'buyer-b@example.com', fullName: 'B', accountKind: 'USER' };

function taoDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('TRANG_THAI_CONG và taoTrangThaiCong khởi tạo đầy đủ 5 trạng thái và hợp đồng UI sạch', () => {
  assert.deepEqual(TRANG_THAI_CONG, {
    DANG_KIEM_TRA: 'DANG_KIEM_TRA',
    CAN_DANG_NHAP: 'CAN_DANG_NHAP',
    CAN_OTP: 'CAN_OTP',
    DUOC_VAO: 'DUOC_VAO',
    LOI: 'LOI',
  });
  const st = taoTrangThaiCong();
  assert.deepEqual(st, {
    status: 'CAN_DANG_NHAP',
    userId: null,
    suKienId: null,
    phienBan: 0,
    nguon: null,
    coTheThuLai: false,
    loi: null,
  });
  assert.deepEqual(Object.keys(st).sort(), [
    'coTheThuLai',
    'loi',
    'nguon',
    'phienBan',
    'status',
    'suKienId',
    'userId',
  ]);
});

test('các nhánh trạng thái thuần: CAN_DANG_NHAP, DANG_KIEM_TRA, DUOC_VAO, CAN_OTP, LOI và thử lại', () => {
  const st0 = taoTrangThaiCong();

  const canLogin = batDauKiemTra(st0, { userId: null, suKienId: 'ev-1' });
  assert.equal(canLogin.status, 'CAN_DANG_NHAP');
  assert.equal(canLogin.phienBan, 1);
  assert.equal(canLogin.suKienId, 'ev-1');

  const checking = batDauKiemTra(canLogin, { userId: 'user-a', suKienId: 'ev-1' });
  assert.equal(checking.status, 'DANG_KIEM_TRA');
  assert.equal(checking.phienBan, 2);
  assert.equal(checking.userId, 'user-a');

  const duocVao = apDungKetQua(checking, {
    phienBan: checking.phienBan,
    userId: 'user-a',
    suKienId: 'ev-1',
    daXacMinh: true,
    nguon: 'THAT',
  });
  assert.equal(duocVao.status, 'DUOC_VAO');
  assert.equal(duocVao.nguon, 'THAT');
  assert.equal(duocVao.loi, null);

  const canOtp = apDungKetQua(checking, {
    phienBan: checking.phienBan,
    userId: 'user-a',
    suKienId: 'ev-1',
    daXacMinh: false,
    nguon: 'THAT',
  });
  assert.equal(canOtp.status, 'CAN_OTP');
  assert.equal(canOtp.nguon, 'THAT');

  const loiMang = apDungLoi(checking, {
    phienBan: checking.phienBan,
    userId: 'user-a',
    suKienId: 'ev-1',
    loai: 'MANG',
  });
  assert.equal(loiMang.status, 'LOI');
  assert.equal(loiMang.coTheThuLai, true);
  assert.deepEqual(loiMang.loi, { loai: 'MANG', thongBao: thongBaoLoiOtp('MANG') });

  const loiCauHinh = apDungLoi(checking, {
    phienBan: checking.phienBan,
    userId: 'user-a',
    suKienId: 'ev-1',
    loai: 'CAU_HINH',
  });
  assert.equal(loiCauHinh.status, 'LOI');
  assert.equal(loiCauHinh.coTheThuLai, false);
  assert.deepEqual(loiCauHinh.loi, { loai: 'CAU_HINH', thongBao: thongBaoLoiOtp('CAU_HINH') });

  const sauThuLai = thuLai(loiMang);
  assert.equal(sauThuLai.status, 'DANG_KIEM_TRA');
  assert.equal(sauThuLai.phienBan, loiMang.phienBan + 1);
  assert.equal(sauThuLai.loi, null);
  assert.equal(sauThuLai.coTheThuLai, false);
});

test('apDungKetQua và apDungLoi bỏ qua kết quả lỗi thời; non-boolean không bao giờ thành DUOC_VAO', () => {
  const checking = batDauKiemTra(taoTrangThaiCong(), { userId: 'user-a', suKienId: 'ev-1' });

  // Sai phienBan, userId hoặc suKienId đều bị bỏ qua
  assert.equal(
    apDungKetQua(checking, { phienBan: checking.phienBan - 1, userId: 'user-a', suKienId: 'ev-1', daXacMinh: true, nguon: 'THAT' }),
    checking,
  );
  assert.equal(
    apDungKetQua(checking, { phienBan: checking.phienBan, userId: 'user-b', suKienId: 'ev-1', daXacMinh: true, nguon: 'THAT' }),
    checking,
  );
  assert.equal(
    apDungKetQua(checking, { phienBan: checking.phienBan, userId: 'user-a', suKienId: 'ev-2', daXacMinh: true, nguon: 'THAT' }),
    checking,
  );
  assert.equal(
    apDungLoi(checking, { phienBan: checking.phienBan - 1, userId: 'user-a', suKienId: 'ev-1', loai: 'MANG' }),
    checking,
  );

  // Non-boolean → LOI có thể thử lại, không bao giờ DUOC_VAO
  for (const invalid of ['true', 1, null, undefined, {}]) {
    const kq = apDungKetQua(checking, {
      phienBan: checking.phienBan,
      userId: 'user-a',
      suKienId: 'ev-1',
      daXacMinh: invalid,
      nguon: 'THAT',
    });
    assert.equal(kq.status, 'LOI');
    assert.equal(kq.coTheThuLai, true);
    assert.equal(kq.nguon, null);
    assert.notEqual(kq.status, 'DUOC_VAO');
  }
});

test('dangXuat, doiPhien và hetHieuLuc tước quyền vào đúng cách', () => {
  const checking = batDauKiemTra(taoTrangThaiCong(), { userId: 'user-a', suKienId: 'ev-1' });
  const duocVao = apDungKetQua(checking, {
    phienBan: checking.phienBan,
    userId: 'user-a',
    suKienId: 'ev-1',
    daXacMinh: true,
    nguon: 'THAT',
  });

  // Cùng userId → cũng tước quyền vào và chuyển sang DANG_KIEM_TRA với phienBan mới
  const cungA = doiPhien(duocVao, SESSION_A);
  assert.equal(cungA.status, 'DANG_KIEM_TRA');
  assert.equal(cungA.userId, 'user-a');
  assert.equal(cungA.nguon, null);
  assert.equal(cungA.phienBan, duocVao.phienBan + 1);

  // Đổi sang tài khoản B → mất quyền vào, kiểm tra lại
  const sangB = doiPhien(duocVao, SESSION_B);
  assert.equal(sangB.status, 'DANG_KIEM_TRA');
  assert.equal(sangB.userId, 'user-b');
  assert.equal(sangB.nguon, null);
  assert.equal(sangB.phienBan, duocVao.phienBan + 1);

  // Đăng xuất hoặc session=null → CAN_DANG_NHAP
  const sauLogout = dangXuat(duocVao);
  assert.equal(sauLogout.status, 'CAN_DANG_NHAP');
  assert.equal(sauLogout.userId, null);
  assert.equal(sauLogout.nguon, null);
  assert.equal(sauLogout.phienBan, duocVao.phienBan + 1);

  const matPhien = doiPhien(duocVao, null);
  assert.equal(matPhien.status, 'CAN_DANG_NHAP');
  assert.equal(matPhien.userId, null);

  // Hết hiệu lực → CAN_OTP, tước nguồn và tăng phienBan để kết quả cũ không ghi đè
  const hetHan = hetHieuLuc(duocVao);
  assert.equal(hetHan.status, 'CAN_OTP');
  assert.equal(hetHan.nguon, null);
  assert.equal(hetHan.phienBan, duocVao.phienBan + 1);
  assert.equal(
    apDungKetQua(hetHan, {
      phienBan: duocVao.phienBan,
      userId: 'user-a',
      suKienId: 'ev-1',
      daXacMinh: true,
      nguon: 'THAT',
    }),
    hetHan,
  );
});

test('bộ điều phối: tài khoản A trả về muộn sau khi đã đổi sang tài khoản B không mở cổng', async () => {
  const defA = taoDeferred();
  const defB = taoDeferred();
  const emitted = [];

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => (userId === 'user-a' ? defA.promise : defB.promise),
    emit: (st) => emitted.push(st),
  });

  const pA = ctrl.kiemTraLai(SESSION_A, 'ev-1');
  const pB = ctrl.kiemTraLai(SESSION_B, 'ev-1');

  // Tài khoản A phân giải DUOC_VAO sau khi đã chuyển sang B
  defA.resolve({ daXacMinh: true, nguon: 'THAT' });
  await pA;

  assert.equal(emitted.at(-1).status, 'DANG_KIEM_TRA');
  assert.equal(emitted.at(-1).userId, 'user-b');

  defB.resolve({ daXacMinh: false, nguon: 'THAT' });
  await pB;

  assert.equal(emitted.at(-1).status, 'CAN_OTP');
  assert.equal(emitted.at(-1).userId, 'user-b');
});

test('bộ điều phối: kết quả của sự kiện cũ trả về sau khi đổi sự kiện bị bỏ qua', async () => {
  const def1 = taoDeferred();
  const def2 = taoDeferred();
  const emitted = [];
  let call = 0;

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: () => {
      call += 1;
      return call === 1 ? def1.promise : def2.promise;
    },
    emit: (st) => emitted.push(st),
  });

  const p1 = ctrl.kiemTraLai(SESSION_A, 'ev-1');
  const p2 = ctrl.kiemTraLai(SESSION_A, 'ev-2');

  def1.resolve({ daXacMinh: true, nguon: 'THAT' });
  await p1;

  assert.equal(emitted.at(-1).status, 'DANG_KIEM_TRA');
  assert.equal(emitted.at(-1).suKienId, 'ev-2');

  def2.resolve({ daXacMinh: false, nguon: 'THAT' });
  await p2;

  assert.equal(emitted.at(-1).status, 'CAN_OTP');
  assert.equal(emitted.at(-1).suKienId, 'ev-2');
});

test('bộ điều phối: kết quả trả về sau khi đăng xuất hoặc hủy không mở cổng và không emit', async () => {
  const def = taoDeferred();
  const emitted = [];

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: () => def.promise,
    emit: (st) => emitted.push(st),
  });

  const p = ctrl.kiemTraLai(SESSION_A, 'ev-1');
  ctrl.dangXuat();
  def.resolve({ daXacMinh: true, nguon: 'THAT' });
  await p;

  assert.equal(emitted.at(-1).status, 'CAN_DANG_NHAP');
  assert.equal(emitted.at(-1).userId, null);

  // Kiểm tra huy(): sau khi hủy, kết quả hay lỗi đến muộn đều không emit thêm
  const def2 = taoDeferred();
  const emitted2 = [];
  const ctrl2 = taoBoDieuPhoiCongOtp({
    kiemTra: () => def2.promise,
    emit: (st) => emitted2.push(st),
  });
  const p2 = ctrl2.kiemTraLai(SESSION_A, 'ev-1');
  const countBefore = emitted2.length;
  ctrl2.huy();
  def2.resolve({ daXacMinh: true, nguon: 'THAT' });
  await p2;
  assert.equal(emitted2.length, countBefore);
});

test('bộ điều phối: lỗi kiểm tra không bao giờ thành DUOC_VAO, không lộ raw message hay mã 123456, và thử lại được', async () => {
  const emitted = [];
  let attempt = 0;

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      attempt += 1;
      if (attempt === 1) {
        throw Object.assign(new Error('raw leak 123456 buyer-a@example.com'), { loai: 'MANG' });
      }
      if (attempt === 2) {
        return { daXacMinh: 'not-a-boolean', nguon: 'THAT' };
      }
      return { daXacMinh: true, nguon: 'THAT' };
    },
    emit: (st) => emitted.push(st),
  });

  const st1 = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(st1.status, 'LOI');
  assert.equal(st1.coTheThuLai, true);
  assert.deepEqual(st1.loi, { loai: 'MANG', thongBao: thongBaoLoiOtp('MANG') });

  const st2 = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(st2.status, 'LOI');
  assert.equal(st2.coTheThuLai, true);

  const st3 = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(st3.status, 'DUOC_VAO');

  const serialized = JSON.stringify(emitted);
  assert.ok(!serialized.includes('123456'));
  assert.ok(!serialized.includes('raw leak'));
  assert.ok(!serialized.includes(SESSION_A.email));
});

test('bộ điều phối: không gọi kiemTra khi chưa có phiên và không emit khi isActive=false', async () => {
  let called = 0;
  let active = true;
  const emitted = [];

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      called += 1;
      return { daXacMinh: true, nguon: 'THAT' };
    },
    emit: (st) => emitted.push(st),
    isActive: () => active,
  });

  const s0 = await ctrl.kiemTraLai(null, 'ev-1');
  assert.equal(s0.status, 'CAN_DANG_NHAP');
  assert.equal(called, 0);

  active = false;
  await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(called, 0);
  assert.equal(emitted.length, 1);
});

test('bằng chứng MO_PHONG không được nhánh thật sử dụng để mở cổng', async () => {
  // Tạo bằng chứng mô phỏng hợp lệ cho user-a
  const bangChungMock = taoBangChungMock('user-a', T0);
  assert.equal(bangChungMock.nguon, 'MO_PHONG');
  assert.equal(bangChungMockConHieuLuc(bangChungMock, 'user-a', T0 + 1000), true);

  // Nhánh thật chỉ hỏi RPC da_xac_minh_otp(), không đọc bằng chứng mock
  const rpcRealFalse = { rpc: async () => ({ data: false, error: null }) };
  const emitted = [];
  const ctrlReal = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      const { daXacMinh } = await kiemTraBangChungThat(rpcRealFalse);
      return { daXacMinh, nguon: 'THAT' };
    },
    emit: (st) => emitted.push(st),
  });

  const res = await ctrlReal.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(res.status, 'CAN_OTP');
  assert.equal(res.nguon, 'THAT');
  assert.notEqual(res.status, 'DUOC_VAO');
});

test('biên 24 giờ qua kiemTra giả kết hợp bangChungMockConHieuLuc: 24h-1ms DUOC_VAO, đúng 24h CAN_OTP', async () => {
  const bc = taoBangChungMock(SESSION_A.userId, T0);
  let nowMs = T0 + HIEU_LUC_XAC_MINH_GIAY * 1000 - 1;
  const emitted = [];

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async ({ userId }) => ({
      daXacMinh: bangChungMockConHieuLuc(bc, userId, nowMs),
      nguon: 'MO_PHONG',
    }),
    emit: (st) => emitted.push(st),
  });

  const truoc24h = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(truoc24h.status, 'DUOC_VAO');
  assert.equal(truoc24h.nguon, 'MO_PHONG');

  nowMs = T0 + HIEU_LUC_XAC_MINH_GIAY * 1000;
  const dung24h = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(dung24h.status, 'CAN_OTP');
  assert.equal(dung24h.nguon, 'MO_PHONG');
});

test('mô phỏng: đăng xuất xóa bằng chứng, đăng nhập lại cùng tài khoản → CAN_OTP', async () => {
  xoaBangChungMock();
  try {
    const cauHinh = {
      useMockData: true,
      layAuth: () => {
        throw new Error('mock không được gọi Auth');
      },
    };
    const gui = await guiMaOtpTheoCauHinh(cauHinh, SESSION_A.email, {
      userId: SESSION_A.userId,
      nowMs: T0,
    });
    await xacMinhMaOtpTheoCauHinh(cauHinh, SESSION_A.email, '123456', SESSION_A.userId, {
      trangThai: gui.trangThai,
      nowMs: T0 + 1000,
    });

    const emitted = [];
    const dh = taoDongHoGia(T0 + 2000);
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: T0 + 2000 }),
      emit: (st) => emitted.push(st),
      now: dh.now,
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
    });

    const daVao = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
    assert.equal(daVao.status, 'DUOC_VAO');
    assert.equal(daVao.nguon, 'MO_PHONG');

    // Mô phỏng đường đăng xuất ở buyerAuthService: xóa kho mock + đặt cổng về CAN_DANG_NHAP
    xoaBangChungMock();
    const sauDangXuat = ctrl.dangXuat();
    assert.equal(sauDangXuat.status, 'CAN_DANG_NHAP');

    // Đăng nhập lại cùng tài khoản trong vòng 24h vẫn phải nhập OTP
    const dangNhapLai = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
    assert.equal(dangNhapLai.status, 'CAN_OTP');
    assert.equal(dangNhapLai.nguon, 'MO_PHONG');
    assert.notEqual(dangNhapLai.status, 'DUOC_VAO');
  } finally {
    xoaBangChungMock();
  }
});

const tick = () => new Promise((r) => setImmediate(r));

function taoClientGiaChoCong({ getSession, rpc }) {
  return {
    auth: { getSession },
    rpc,
  };
}

test('nối bộ điều phối với kiemTraDaXacMinhTheoCauHinh: kiểm tra cho A đang chờ, doiPhien sang B → kết quả của A bị bỏ, cổng của B không mở', async () => {
  const defRpcA = taoDeferred();
  const defRpcB = taoDeferred();
  let phienHienTai = { user: { id: SESSION_A.userId }, access_token: 'tok-a1' };
  let rpcCount = 0;

  const client = taoClientGiaChoCong({
    getSession: async () => ({ data: { session: phienHienTai }, error: null }),
    rpc: () => {
      rpcCount += 1;
      return rpcCount === 1 ? defRpcA.promise : defRpcB.promise;
    },
  });
  const cauHinh = { useMockData: false, layClient: () => client };
  const emitted = [];

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId),
    emit: (st) => emitted.push(st),
  });

  const pA = ctrl.kiemTraLai(SESSION_A, 'ev-1');
  await tick(); // A đã qua getSession trước và đang chờ RPC
  const trangThaiA = emitted.at(-1);
  assert.equal(trangThaiA.status, 'DANG_KIEM_TRA');
  assert.equal(trangThaiA.userId, SESSION_A.userId);

  // Đổi phiên thuần sang B: hủy quyền A, tăng phienBan, bỏ qua kết quả của A
  const trangThaiSauDoiPhien = doiPhien(trangThaiA, SESSION_B);
  assert.equal(trangThaiSauDoiPhien.status, 'DANG_KIEM_TRA');
  assert.equal(trangThaiSauDoiPhien.userId, SESSION_B.userId);
  assert.equal(trangThaiSauDoiPhien.phienBan, trangThaiA.phienBan + 1);
  assert.equal(
    apDungKetQua(trangThaiSauDoiPhien, {
      phienBan: trangThaiA.phienBan,
      userId: SESSION_A.userId,
      suKienId: 'ev-1',
      daXacMinh: true,
      nguon: 'THAT',
    }),
    trangThaiSauDoiPhien,
  );

  // Trên bộ điều phối: chuyển phiên sang B và kiểm tra cho B trong khi RPC của A vẫn đang treo
  phienHienTai = { user: { id: SESSION_B.userId }, access_token: 'tok-b1' };
  const pB = ctrl.kiemTraLai(SESSION_B, 'ev-1');
  await tick();

  // RPC của A trả về true muộn → bị bỏ cả ở lõi (PHIEN_THAY_DOI) lẫn ở generation của bộ điều phối
  defRpcA.resolve({ data: true, error: null });
  await pA;
  assert.equal(emitted.at(-1).status, 'DANG_KIEM_TRA');
  assert.equal(emitted.at(-1).userId, SESSION_B.userId);

  // RPC của B trả false → cổng của B là CAN_OTP, không bao giờ DUOC_VAO
  defRpcB.resolve({ data: false, error: null });
  const stB = await pB;
  assert.equal(stB.status, 'CAN_OTP');
  assert.equal(stB.userId, SESSION_B.userId);
  assert.ok(!emitted.some((st) => st.status === 'DUOC_VAO'));
});

test('nối bộ điều phối với kiemTraDaXacMinhTheoCauHinh: đăng xuất rồi đăng nhập lại cùng userId giữa lúc kiểm tra → không mở bằng kết quả cũ', async () => {
  const defRpc1 = taoDeferred();
  const defRpc2 = taoDeferred();
  let phienHienTai = { user: { id: SESSION_A.userId }, access_token: 'tok-a1' };
  let rpcCount = 0;

  const client = taoClientGiaChoCong({
    getSession: async () => ({ data: { session: phienHienTai }, error: null }),
    rpc: () => {
      rpcCount += 1;
      return rpcCount === 1 ? defRpc1.promise : defRpc2.promise;
    },
  });
  const cauHinh = { useMockData: false, layClient: () => client };

  // Trường hợp 1: phiên đổi token giữa lúc RPC chạy (đăng xuất + đăng nhập lại cùng userId) → PHIEN_THAY_DOI, không DUOC_VAO
  const emitted1 = [];
  const ctrl1 = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId),
    emit: (st) => emitted1.push(st),
  });
  const p1 = ctrl1.kiemTraLai(SESSION_A, 'ev-1');
  await tick();
  phienHienTai = { user: { id: SESSION_A.userId }, access_token: 'tok-a2' };
  defRpc1.resolve({ data: true, error: null });
  const kq1 = await p1;
  assert.equal(kq1.status, 'LOI');
  assert.equal(kq1.coTheThuLai, true);
  assert.equal(kq1.nguon, null);
  assert.equal(kq1.loi?.loai, 'PHIEN_THAY_DOI');
  assert.ok(!emitted1.some((st) => st.status === 'DUOC_VAO'));
  assert.ok(!JSON.stringify(emitted1).includes('tok-'));

  // Trường hợp 2: gọi ctrl.dangXuat() rồi đăng nhập lại cùng userId (ctrl.kiemTraLai) khi RPC cũ vẫn treo
  const emitted2 = [];
  let rpc2Count = 0;
  const defOld = taoDeferred();
  const defNew = taoDeferred();
  const client2 = taoClientGiaChoCong({
    getSession: async () => ({ data: { session: phienHienTai }, error: null }),
    rpc: () => {
      rpc2Count += 1;
      return rpc2Count === 1 ? defOld.promise : defNew.promise;
    },
  });
  const ctrl2 = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh({ useMockData: false, layClient: () => client2 }, userId),
    emit: (st) => emitted2.push(st),
  });

  const pOld = ctrl2.kiemTraLai(SESSION_A, 'ev-1');
  await tick();
  const sauLogout = ctrl2.dangXuat();
  assert.equal(sauLogout.status, 'CAN_DANG_NHAP');
  phienHienTai = { user: { id: SESSION_A.userId }, access_token: 'tok-a3' };
  const pNew = ctrl2.kiemTraLai(SESSION_A, 'ev-1');
  await tick();

  defOld.resolve({ data: true, error: null });
  await pOld;
  assert.equal(emitted2.at(-1).status, 'DANG_KIEM_TRA');

  defNew.resolve({ data: false, error: null });
  const kqNew = await pNew;
  assert.equal(kqNew.status, 'CAN_OTP');
  assert.ok(!emitted2.some((st) => st.status === 'DUOC_VAO'));
});

test('mock: đang xác minh thì đăng xuất (xoaBangChungMock) → kiểm tra sau đó cho trạng thái CAN_OTP', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = {
      useMockData: true,
      layAuth: () => {
        throw new Error('mock không được gọi Auth');
      },
    };
    const gui = await guiMaOtpTheoCauHinh(cauHinh, SESSION_A.email, {
      userId: SESSION_A.userId,
      nowMs: T0,
    });
    const theHeTruoc = layTheHeBangChungMock();

    // Đang xác minh mô phỏng thì đăng xuất (xoaBangChungMock) trước khi await hoàn tất
    const pXacMinh = xacMinhMaOtpTheoCauHinh(cauHinh, SESSION_A.email, '123456', SESSION_A.userId, {
      trangThai: gui.trangThai,
      nowMs: T0 + 1000,
      kho,
    }).catch((e) => e);
    xoaBangChungMock(undefined, kho);
    const err = await pXacMinh;
    assert.ok(err instanceof OtpServiceError);
    assert.equal(err.loai, 'PHIEN_THAY_DOI');
    assert.ok(layTheHeBangChungMock() > theHeTruoc);
    assert.equal(kho.size, 0);

    const emitted = [];
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: T0 + 2000, kho }),
      emit: (st) => emitted.push(st),
    });
    const kq = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
    assert.equal(kq.status, 'CAN_OTP');
    assert.equal(kq.nguon, 'MO_PHONG');
    assert.ok(!emitted.some((st) => st.status === 'DUOC_VAO'));
  } finally {
    xoaBangChungMock();
  }
});

test('PHIEN_THAY_DOI → trạng thái LOI có thể thử lại, thuLai đưa về DANG_KIEM_TRA và thử lại thành công', async () => {
  const checking = batDauKiemTra(taoTrangThaiCong(), { userId: SESSION_A.userId, suKienId: 'ev-1' });
  const loiPhien = apDungLoi(checking, {
    phienBan: checking.phienBan,
    userId: SESSION_A.userId,
    suKienId: 'ev-1',
    loai: 'PHIEN_THAY_DOI',
  });
  assert.equal(loiPhien.status, 'LOI');
  assert.equal(loiPhien.coTheThuLai, true);
  assert.equal(loiPhien.nguon, null);
  assert.deepEqual(loiPhien.loi, {
    loai: 'PHIEN_THAY_DOI',
    thongBao: thongBaoLoiOtp('PHIEN_THAY_DOI'),
  });

  const dangKiemLai = thuLai(loiPhien);
  assert.equal(dangKiemLai.status, 'DANG_KIEM_TRA');
  assert.equal(dangKiemLai.phienBan, loiPhien.phienBan + 1);
  assert.equal(dangKiemLai.loi, null);
  assert.equal(dangKiemLai.coTheThuLai, false);

  // Nối bộ điều phối với kiemTraDaXacMinhTheoCauHinh: lần 1 phiên đổi → LOI (PHIEN_THAY_DOI); lần 2 ổn định → DUOC_VAO
  let call = 0;
  const sessions = [
    { user: { id: SESSION_A.userId }, access_token: 'tok-a1' },
    { user: { id: SESSION_A.userId }, access_token: 'tok-a2' },
    { user: { id: SESSION_A.userId }, access_token: 'tok-a2' },
    { user: { id: SESSION_A.userId }, access_token: 'tok-a2' },
  ];
  const client = taoClientGiaChoCong({
    getSession: async () => {
      const s = sessions[Math.min(call, sessions.length - 1)];
      call += 1;
      return { data: { session: s }, error: null };
    },
    rpc: async () => ({ data: true, error: null }),
  });
  const cauHinh = { useMockData: false, layClient: () => client };
  const emitted = [];
  const dh = taoDongHoGia();
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: dh.now() }),
    emit: (st) => emitted.push(st),
    now: dh.now,
    setTimer: dh.setTimer,
    clearTimer: dh.clearTimer,
  });

  const st1 = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(st1.status, 'LOI');
  assert.equal(st1.coTheThuLai, true);
  assert.equal(st1.loi?.loai, 'PHIEN_THAY_DOI');

  const st2 = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(st2.status, 'DUOC_VAO');
  assert.equal(st2.nguon, 'THAT');
  assert.ok(!JSON.stringify(emitted).includes('tok-'));
  ctrl.huy();
});

test('biên 60/300 giây và 24 giờ qua lõi thật + bộ điều phối', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = {
      useMockData: true,
      layAuth: () => {
        throw new Error('mock không được gọi Auth');
      },
    };

    // Gửi lần đầu ở T0
    const gui1 = await guiMaOtpTheoCauHinh(cauHinh, SESSION_A.email, {
      userId: SESSION_A.userId,
      nowMs: T0,
    });
    // Chưa đủ 60s → CLIENT_CHO_GUI_LAI; đúng 60s → gửi lại thành công
    const som = await guiMaOtpTheoCauHinh(cauHinh, SESSION_A.email, {
      trangThai: gui1.trangThai,
      userId: SESSION_A.userId,
      nowMs: T0 + CHO_GUI_LAI_GIAY * 1000 - 1,
    }).catch((e) => e);
    assert.equal(som.loai, 'CLIENT_CHO_GUI_LAI');

    const gui2 = await guiMaOtpTheoCauHinh(cauHinh, SESSION_A.email, {
      trangThai: gui1.trangThai,
      userId: SESSION_A.userId,
      nowMs: T0 + CHO_GUI_LAI_GIAY * 1000,
    });
    const guiLuc = gui2.trangThai.guiLuc;

    // Đúng 300s sau lần gửi → HET_HAN, cổng vẫn CAN_OTP
    const het300 = await xacMinhMaOtpTheoCauHinh(cauHinh, SESSION_A.email, '123456', SESSION_A.userId, {
      trangThai: gui2.trangThai,
      nowMs: guiLuc + HIEU_LUC_GIAY * 1000,
      kho,
    }).catch((e) => e);
    assert.equal(het300.loai, 'HET_HAN');

    // Trước 300s 1ms → xác minh thành công, tạo bằng chứng 24 giờ
    const xacMinhLuc = guiLuc + HIEU_LUC_GIAY * 1000 - 1;
    const ok = await xacMinhMaOtpTheoCauHinh(cauHinh, SESSION_A.email, '123456', SESSION_A.userId, {
      trangThai: gui2.trangThai,
      nowMs: xacMinhLuc,
      kho,
    });
    assert.equal(ok.daXacMinh, true);

    let nowMs = xacMinhLuc + HIEU_LUC_XAC_MINH_GIAY * 1000 - 1;
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs, kho }),
      emit: () => {},
      now: () => nowMs,
      setTimer: () => 0,
      clearTimer: () => {},
    });

    assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');
    nowMs = xacMinhLuc + HIEU_LUC_XAC_MINH_GIAY * 1000;
    assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'CAN_OTP');
  } finally {
    xoaBangChungMock();
  }
});

// ---- Regression R1, R1b, R2, R3, R4 qua cổng và lõi mock ----

const cauHinhMockCong = () => ({
  useMockData: true,
  layAuth: () => {
    throw new Error('mock không được gọi Auth');
  },
});

test('R1 (cổng): gửi cho A/user-a, đổi tài khoản (xoaBangChungMock), xác minh B/user-b bằng trạng thái A → CHUA_GUI và cổng dừng ở CAN_OTP', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = cauHinhMockCong();
    const guiA = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });
    xoaBangChungMock(undefined, kho);

    const err = await xacMinhMaOtpTheoCauHinh(cauHinh, 'b@example.com', '123456', 'user-b', {
      trangThai: guiA.trangThai,
      nowMs: T0 + 1000,
      kho,
    }).catch((e) => e);
    assert.ok(err instanceof OtpServiceError);
    assert.equal(err.loai, 'CHUA_GUI');
    assert.ok(!err.message.includes('123456'));
    assert.equal(capNhatSauLoi(guiA.trangThai, err, T0 + 1000).lichSuSai.length, 0);
    assert.equal(kho.has('user-b'), false);
    assert.equal(khoBangChungMock.has('user-b'), false);
    assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'user-b', { nowMs: T0 + 1000, kho })).daXacMinh, false);

    const emitted = [];
    const dh = taoDongHoGia(T0 + 1000);
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: T0 + 1000, kho }),
      emit: (st) => emitted.push(st),
      now: dh.now,
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
    });
    const kq = await ctrl.kiemTraLai({ userId: 'user-b', email: 'b@example.com' }, 'ev-1');
    assert.equal(kq.status, 'CAN_OTP');
    assert.ok(!emitted.some((st) => st.status === 'DUOC_VAO'));
  } finally {
    xoaBangChungMock();
  }
});

test('R1b (cổng): không thu hồi, trạng thái A cho B/user-b và biên nhận A với expectedUserId user-b đều bị từ chối, cổng CAN_OTP', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = cauHinhMockCong();
    const guiA = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });

    const err1 = await xacMinhMaOtpTheoCauHinh(cauHinh, 'b@example.com', '123456', 'user-b', {
      trangThai: guiA.trangThai,
      nowMs: T0 + 1000,
      kho,
    }).catch((e) => e);
    assert.equal(err1.loai, 'CHUA_GUI');
    assert.ok(!err1.message.includes('123456'));
    assert.equal(capNhatSauLoi(guiA.trangThai, err1, T0 + 1000).lichSuSai.length, 0);

    const err2 = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-b', {
      trangThai: guiA.trangThai,
      nowMs: T0 + 1000,
      kho,
    }).catch((e) => e);
    assert.equal(err2.loai, 'CHUA_GUI');
    assert.ok(!err2.message.includes('123456'));
    assert.equal(capNhatSauLoi(guiA.trangThai, err2, T0 + 1000).lichSuSai.length, 0);
    assert.equal(kho.has('user-b'), false);

    const emitted = [];
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: T0 + 1000, kho }),
      emit: (st) => emitted.push(st),
    });
    const kq = await ctrl.kiemTraLai({ userId: 'user-b', email: 'b@example.com' }, 'ev-1');
    assert.equal(kq.status, 'CAN_OTP');
    assert.ok(!emitted.some((st) => st.status === 'DUOC_VAO'));
  } finally {
    xoaBangChungMock();
  }
});

test('R2 (cổng): gửi cho A, đăng xuất, đăng nhập lại không gửi mới + dùng trạng thái cũ → CHUA_GUI, cổng CAN_OTP; gửi mới rồi thành công', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = cauHinhMockCong();
    const gui1 = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });

    const emitted = [];
    const dh = taoDongHoGia(T0 + 61_000);
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: T0 + 61_000, kho }),
      emit: (st) => emitted.push(st),
      now: dh.now,
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
    });

    // Đăng xuất
    xoaBangChungMock(undefined, kho);
    ctrl.dangXuat();

    // Đăng nhập lại cùng A nhưng chưa gửi mã mới, cố dùng trangThai cũ → CHUA_GUI, cổng vẫn CAN_OTP
    const errCu = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
      trangThai: gui1.trangThai,
      nowMs: T0 + 1000,
      kho,
    }).catch((e) => e);
    assert.equal(errCu.loai, 'CHUA_GUI');
    assert.ok(!errCu.message.includes('123456'));
    assert.equal(capNhatSauLoi(gui1.trangThai, errCu, T0 + 1000).lichSuSai.length, 0);
    assert.equal(kho.size, 0);
    assert.equal((await ctrl.kiemTraLai({ userId: 'user-a', email: 'a@example.com' }, 'ev-1')).status, 'CAN_OTP');

    // Gửi mới sau 60s rồi xác minh → thành công và mở cổng DUOC_VAO
    const gui2 = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', {
      trangThai: gui1.trangThai,
      userId: 'user-a',
      nowMs: T0 + CHO_GUI_LAI_GIAY * 1000,
    });
    const ok = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
      trangThai: gui2.trangThai,
      nowMs: T0 + CHO_GUI_LAI_GIAY * 1000 + 500,
      kho,
    });
    assert.equal(ok.daXacMinh, true);
    assert.equal((await ctrl.kiemTraLai({ userId: 'user-a', email: 'a@example.com' }, 'ev-1')).status, 'DUOC_VAO');
  } finally {
    xoaBangChungMock();
  }
});

test('R3 (cổng): biên nhận chỉ dùng một lần; dùng lại trạng thái cũ lần 2 → CHUA_GUI', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = cauHinhMockCong();
    const gui1 = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });
    const ok = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
      trangThai: gui1.trangThai,
      nowMs: T0 + 1000,
      kho,
    });
    assert.equal(ok.daXacMinh, true);
    assert.equal(layBienNhanGuiMock('a@example.com'), undefined);

    const err2 = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
      trangThai: gui1.trangThai,
      nowMs: T0 + 2000,
      kho,
    }).catch((e) => e);
    assert.equal(err2.loai, 'CHUA_GUI');
    assert.ok(!err2.message.includes('123456'));
    assert.equal(capNhatSauLoi(gui1.trangThai, err2, T0 + 2000).lichSuSai.length, 0);
  } finally {
    xoaBangChungMock();
  }
});

test('R4 (cổng): thế hệ đổi khi đang gửi mock → PHIEN_THAY_DOI, không có biên nhận và cổng giữ CAN_OTP', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const cauHinh = cauHinhMockCong();
    const pGui = guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 }).catch((e) => e);
    xoaBangChungMock(undefined, kho);
    const err = await pGui;
    assert.ok(err instanceof OtpServiceError);
    assert.equal(err.loai, 'PHIEN_THAY_DOI');
    assert.ok(!err.message.includes('123456'));
    assert.equal(layBienNhanGuiMock('a@example.com'), undefined);
    assert.equal(khoGuiMock.size, 0);

    // Kể cả có trạng thái giả lập ghiNhanGui, không có biên nhận thì xác minh bị CHUA_GUI và cổng vẫn CAN_OTP
    const trangThaiGia = ghiNhanGui(taoTrangThaiOtp('a@example.com'), T0);
    const errVerify = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
      trangThai: trangThaiGia,
      nowMs: T0 + 1000,
      kho,
    }).catch((e) => e);
    assert.equal(errVerify.loai, 'CHUA_GUI');
    assert.equal(capNhatSauLoi(trangThaiGia, errVerify, T0 + 1000).lichSuSai.length, 0);

    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: T0 + 1000, kho }),
      emit: () => {},
    });
    assert.equal((await ctrl.kiemTraLai({ userId: 'user-a', email: 'a@example.com' }, 'ev-1')).status, 'CAN_OTP');
  } finally {
    xoaBangChungMock();
  }
});

// ---- Bộ điều phối: doiPhien, hetHieuLuc, thuLai, apDungXacMinh, hẹn giờ hết hạn ----

function taoDongHoGia(batDau = T0) {
  let hienTai = batDau;
  const timers = new Map();
  let id = 0;
  return {
    now: () => hienTai,
    setTimer: (fn, ms) => {
      id += 1;
      timers.set(id, { fn, luc: hienTai + ms });
      return id;
    },
    clearTimer: (h) => {
      timers.delete(h);
    },
    soTimer: () => timers.size,
    tien(ms) {
      hienTai += ms;
      for (const [h, t] of [...timers]) {
        if (t.luc <= hienTai && timers.has(h)) {
          timers.delete(h);
          t.fn();
        }
      }
    },
  };
}

test('apDungXacMinh: kết quả của tài khoản cũ sau khi đổi sang B không mở cổng', async () => {
  const emitted = [];
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => ({ daXacMinh: true, nguon: 'THAT' }),
    emit: (st) => emitted.push(st),
  });
  await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  const defB = taoDeferred();
  const ctrl2 = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => (userId === 'user-b' ? defB.promise : Promise.resolve({ daXacMinh: true, nguon: 'THAT' })),
    emit: (st) => emitted.push(st),
  });
  await ctrl2.kiemTraLai(SESSION_A, 'ev-1');
  const pB = ctrl2.doiPhien(SESSION_B);
  const kq = await ctrl2.apDungXacMinh({ daXacMinh: true, nguon: 'THAT', userId: 'user-a' });
  assert.equal(kq.status, 'DANG_KIEM_TRA');
  assert.equal(kq.userId, 'user-b');
  defB.resolve({ daXacMinh: false, nguon: 'THAT' });
  assert.equal((await pB).status, 'CAN_OTP');
  assert.equal(ctrl2.layTrangThai().status, 'CAN_OTP');
});

test('apDungXacMinh: không tin kết quả xác minh, luôn kiểm tra lại; kiemTra false → CAN_OTP, lỗi → LOI', async () => {
  let lan = 0;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      lan += 1;
      if (lan === 1) return { daXacMinh: false, nguon: 'THAT' };
      if (lan === 2) return { daXacMinh: false, nguon: 'THAT' };
      throw Object.assign(new Error('x 123456'), { loai: 'MANG' });
    },
    emit: () => {},
  });
  await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  const kq = await ctrl.apDungXacMinh({ daXacMinh: true, nguon: 'THAT', userId: 'user-a' });
  assert.equal(lan, 2);
  assert.equal(kq.status, 'CAN_OTP');

  const loi = await ctrl.apDungXacMinh({ daXacMinh: true, nguon: 'THAT', userId: 'user-a' });
  assert.equal(loi.status, 'LOI');
  assert.equal(loi.coTheThuLai, true);
  assert.notEqual(loi.status, 'DUOC_VAO');
  assert.ok(!JSON.stringify(loi).includes('123456'));

  // Chưa có phiên hoặc thiếu userId → bỏ qua, không gọi kiemTra
  const truoc = lan;
  await ctrl.apDungXacMinh(null);
  await ctrl.apDungXacMinh({ daXacMinh: true });
  assert.equal(lan, truoc);
});

test('doiPhien: cùng userId cũng tước quyền và kiểm tra lại; tài khoản mới kiểm tra lại; doiPhien(null) giữa lúc kiểm tra → CAN_DANG_NHAP và bỏ kết quả muộn', async () => {
  const def1 = taoDeferred();
  const def2 = taoDeferred();
  const emitted = [];
  let lan = 0;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: ({ userId }) => {
      lan += 1;
      if (lan === 1) return def1.promise;
      if (lan === 2) return def2.promise;
      return Promise.resolve({ daXacMinh: userId === 'user-a', nguon: 'THAT' });
    },
    emit: (st) => emitted.push(st),
  });
  await ctrl.kiemTraLai(null, 'ev-9');
  const p1 = ctrl.doiPhien(SESSION_A);
  assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
  assert.equal(ctrl.layTrangThai().suKienId, 'ev-9');
  assert.equal(lan, 1);

  // Cùng userId → tăng generation và kiểm tra lại; kết quả lần 1 bị bỏ qua
  const p2 = ctrl.doiPhien(SESSION_A);
  assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
  assert.equal(lan, 2);
  def1.resolve({ daXacMinh: true, nguon: 'THAT' });
  await p1;
  assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');

  const sau = await ctrl.doiPhien(null);
  assert.equal(sau.status, 'CAN_DANG_NHAP');
  def2.resolve({ daXacMinh: true, nguon: 'THAT' });
  await p2;
  assert.equal(ctrl.layTrangThai().status, 'CAN_DANG_NHAP');
  assert.equal(emitted.at(-1).status, 'CAN_DANG_NHAP');
  assert.ok(!emitted.some((st) => st.status === 'DUOC_VAO'));

  assert.equal((await ctrl.doiPhien(SESSION_B)).status, 'CAN_OTP');
});

test('hetHieuLuc và thuLai của bộ điều phối; layTrangThai trả về bản sao', async () => {
  let lan = 0;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      lan += 1;
      if (lan === 1) throw Object.assign(new Error('m'), { loai: 'MANG' });
      return { daXacMinh: true, nguon: 'THAT' };
    },
    emit: () => {},
  });
  assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'LOI');
  const st = await ctrl.thuLai();
  assert.equal(st.status, 'DUOC_VAO');
  assert.equal(st.suKienId, 'ev-1');

  const ban = ctrl.layTrangThai();
  ban.status = 'LOI';
  assert.equal(ctrl.layTrangThai().status, 'DUOC_VAO');

  assert.equal(ctrl.hetHieuLuc().status, 'CAN_OTP');
  assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
});

test('hetHieuLuc trong lúc đang kiểm tra: kết quả muộn không mở lại cổng', async () => {
  const def = taoDeferred();
  const ctrl = taoBoDieuPhoiCongOtp({ kiemTra: () => def.promise, emit: () => {} });
  const p = ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(ctrl.hetHieuLuc().status, 'CAN_OTP');
  def.resolve({ daXacMinh: true, nguon: 'THAT' });
  await p;
  assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
});

test('hẹn giờ hết hạn: hetHanLuc-1 vẫn DUOC_VAO, đúng hetHanLuc → tước quyền rồi kiểm tra lại → CAN_OTP', async () => {
  const dh = taoDongHoGia();
  const hetHanLuc = T0 + 10_000;
  const emitted = [];
  let lan = 0;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      lan += 1;
      return lan === 1
        ? { daXacMinh: true, nguon: 'MO_PHONG', hetHanLuc, kiemTraLaiLuc: hetHanLuc }
        : { daXacMinh: false, nguon: 'MO_PHONG', hetHanLuc: null, kiemTraLaiLuc: null };
    },
    emit: (st) => emitted.push(st),
    setTimer: dh.setTimer,
    clearTimer: dh.clearTimer,
    now: dh.now,
  });
  assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');
  assert.equal(dh.soTimer(), 1);
  dh.tien(9_999);
  assert.equal(ctrl.layTrangThai().status, 'DUOC_VAO');
  const countBeforeExpiry = emitted.length;
  dh.tien(1);
  // Tức thì sau khi hết hạn: không còn DUOC_VAO (đã phát CAN_OTP rồi DANG_KIEM_TRA).
  assert.notEqual(ctrl.layTrangThai().status, 'DUOC_VAO');
  assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
  await tick();
  assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
  assert.equal(emitted.at(-1).status, 'CAN_OTP');
  assert.equal(dh.soTimer(), 0);
  assert.ok(!emitted.slice(countBeforeExpiry).some((st) => st.status === 'DUOC_VAO'));
});

test('hẹn giờ hết hạn: hetHanLuc <= now đi thẳng CAN_OTP, không phát DUOC_VAO; hetHanLuc không hợp lệ bị bỏ qua', async () => {
  const dh = taoDongHoGia();
  const emitted = [];
  let hetHanLuc = T0;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => ({ daXacMinh: true, nguon: 'MO_PHONG', hetHanLuc }),
    emit: (st) => emitted.push(st),
    setTimer: dh.setTimer,
    clearTimer: dh.clearTimer,
    now: dh.now,
  });
  assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'CAN_OTP');
  assert.ok(!emitted.some((st) => st.status === 'DUOC_VAO'));
  assert.equal(dh.soTimer(), 0);

  hetHanLuc = '123';
  assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');
  assert.equal(dh.soTimer(), 0);
});

test('hẹn giờ hết hạn bị xóa khi đổi phiên, đăng xuất, huy hoặc kiểm tra mới', async () => {
  const chay = async (hanhDong) => {
    const dh = taoDongHoGia();
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: async () => ({ daXacMinh: true, nguon: 'MO_PHONG', hetHanLuc: T0 + 5_000 }),
      emit: () => {},
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      now: dh.now,
    });
    await ctrl.kiemTraLai(SESSION_A, 'ev-1');
    assert.equal(dh.soTimer(), 1);
    await hanhDong(ctrl);
    return { dh, ctrl };
  };

  const doi = await chay((c) => c.doiPhien(SESSION_B).then(() => {}));
  assert.equal(doi.dh.soTimer(), 1); // B cũng có hạn mới, timer của A đã bị thay
  doi.dh.tien(5_000);
  await tick();
  assert.equal(doi.ctrl.layTrangThai().status, 'CAN_OTP');
  assert.equal(doi.ctrl.layTrangThai().userId, 'user-b');

  const matPhien = await chay((c) => c.doiPhien(null));
  assert.equal(matPhien.dh.soTimer(), 0);
  matPhien.dh.tien(10_000);
  assert.equal(matPhien.ctrl.layTrangThai().status, 'CAN_DANG_NHAP');

  const out = await chay((c) => c.dangXuat());
  assert.equal(out.dh.soTimer(), 0);

  const huy = await chay((c) => c.huy());
  assert.equal(huy.dh.soTimer(), 0);
  huy.dh.tien(10_000);
  assert.equal(huy.ctrl.layTrangThai().status, 'DUOC_VAO');

  const het = await chay((c) => c.hetHieuLuc());
  assert.equal(het.dh.soTimer(), 0);
});

test('trạng thái bộ điều phối không chứa mã OTP, email hay token', async () => {
  const emitted = [];
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => ({ daXacMinh: true, nguon: 'THAT', hetHanLuc: null }),
    emit: (st) => emitted.push(st),
  });
  await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  await ctrl.apDungXacMinh({ daXacMinh: true, nguon: 'THAT', userId: 'user-a', ma: '123456' });
  const s = JSON.stringify([emitted, ctrl.layTrangThai()]);
  assert.ok(!s.includes('123456'));
  assert.ok(!s.includes('@'));
});

test('kiểm tra tĩnh: otpGate.js không import supabase, runtimeConfig hay file .ts; otpService không lưu bằng chứng vào storage; buyerAuthService xóa mock khi đăng xuất', async () => {
  const gateSrc = await readFile(new URL('../src/domain/otpGate.js', import.meta.url), 'utf8');
  const serviceSrc = await readFile(new URL('../src/services/otpService.ts', import.meta.url), 'utf8');
  const buyerAuthSrc = await readFile(new URL('../src/services/buyerAuthService.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(gateSrc, /^\s*import\b.*supabase/m);
  assert.doesNotMatch(gateSrc, /^\s*import\b.*runtimeConfig/m);
  assert.doesNotMatch(gateSrc, /^\s*import\b.*\.ts['"]/m);

  assert.doesNotMatch(serviceSrc, /localStorage|sessionStorage/);
  assert.match(buyerAuthSrc, /xoaBangChungMock\s*\(/);
});

// ---- T2 regression tests: hết hạn thật khi đang DUOC_VAO, đăng nhập lại cùng tài khoản, thu hồi mock, va chạm email, whitelist loại lỗi, timer cũ ----

test('T2 regression: bằng chứng thật hết hạn khi cổng đang DUOC_VAO (hetHanLuc & kiemTraLaiLuc) → tước quyền và kiểm tra lại (false → CAN_OTP, lỗi → LOI, không phát DUOC_VAO)', async () => {
  // Nhánh 1: hetHanLuc đến trước (min = hetHanLuc), RPC lần sau trả false → CAN_OTP.
  {
    const dh = taoDongHoGia(T0);
    const hetHanLuc = T0 + 10_000;
    const kiemTraLaiLuc = T0 + KIEM_TRA_LAI_THAT_MS;
    const emitted = [];
    const defRpc2 = taoDeferred();
    let lan = 0;

    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: () => {
        lan += 1;
        if (lan === 1) return Promise.resolve({ daXacMinh: true, nguon: 'THAT', hetHanLuc, kiemTraLaiLuc });
        return defRpc2.promise;
      },
      emit: (st) => emitted.push(st),
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      now: dh.now,
    });

    assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');
    assert.equal(dh.soTimer(), 1);
    const indexSauVao = emitted.length;

    // Tới hạn tại hetHanLuc: phát CAN_OTP trước rồi gọi kiemTraLai (đang chờ RPC → DANG_KIEM_TRA, không phải DUOC_VAO).
    dh.tien(10_000);
    assert.equal(lan, 2);
    assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
    assert.equal(emitted[indexSauVao].status, 'CAN_OTP');
    assert.equal(emitted[indexSauVao + 1].status, 'DANG_KIEM_TRA');
    assert.ok(!emitted.slice(indexSauVao).some((st) => st.status === 'DUOC_VAO'));

    defRpc2.resolve({ daXacMinh: false, nguon: 'THAT', hetHanLuc: null, kiemTraLaiLuc: dh.now() + KIEM_TRA_LAI_THAT_MS });
    await tick();
    assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
    assert.equal(dh.soTimer(), 0);
    assert.ok(!emitted.slice(indexSauVao).some((st) => st.status === 'DUOC_VAO'));
  }

  // Nhánh 2: tới hạn hết hạn thật mà kiemTra lần sau lỗi → LOI có thể thử lại, không phát DUOC_VAO.
  {
    const dh = taoDongHoGia(T0);
    const hetHanLuc = T0 + 10_000;
    const emitted = [];
    let lan = 0;
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: async () => {
        lan += 1;
        if (lan === 1) return { daXacMinh: true, nguon: 'THAT', hetHanLuc, kiemTraLaiLuc: T0 + KIEM_TRA_LAI_THAT_MS };
        throw Object.assign(new Error('network error'), { loai: 'MANG' });
      },
      emit: (st) => emitted.push(st),
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      now: dh.now,
    });

    await ctrl.kiemTraLai(SESSION_A, 'ev-1');
    const idx = emitted.length;
    dh.tien(10_000);
    await tick();
    assert.equal(ctrl.layTrangThai().status, 'LOI');
    assert.equal(ctrl.layTrangThai().coTheThuLai, true);
    assert.equal(ctrl.layTrangThai().loi?.loai, 'MANG');
    assert.ok(!emitted.slice(idx).some((st) => st.status === 'DUOC_VAO'));
  }

  // Nhánh 3: kiemTraLaiLuc < hetHanLuc (hoặc hetHanLuc = null) → hẹn tại min = kiemTraLaiLuc;
  // trong lúc chờ RPC trạng thái là DANG_KIEM_TRA (không phải DUOC_VAO), false → CAN_OTP.
  {
    const dh = taoDongHoGia(T0);
    const emitted = [];
    const defRpc2 = taoDeferred();
    let lan = 0;
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: () => {
        lan += 1;
        if (lan === 1) {
          return Promise.resolve({
            daXacMinh: true,
            nguon: 'THAT',
            hetHanLuc: null,
            kiemTraLaiLuc: T0 + KIEM_TRA_LAI_THAT_MS,
          });
        }
        return defRpc2.promise;
      },
      emit: (st) => emitted.push(st),
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      now: dh.now,
    });

    assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');
    dh.tien(KIEM_TRA_LAI_THAT_MS - 1);
    assert.equal(ctrl.layTrangThai().status, 'DUOC_VAO');
    const idx = emitted.length;
    dh.tien(1);
    assert.equal(lan, 2);
    assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
    assert.ok(!emitted.slice(idx).some((st) => st.status === 'DUOC_VAO'));

    defRpc2.resolve({ daXacMinh: false, nguon: 'THAT', hetHanLuc: null, kiemTraLaiLuc: dh.now() + KIEM_TRA_LAI_THAT_MS });
    await tick();
    assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
    assert.ok(!emitted.slice(idx).some((st) => st.status === 'DUOC_VAO'));
  }
});

test('T2 regression: đăng nhập lại cùng tài khoản tước DUOC_VAO và phải kiểm tra lại', async () => {
  let daXacMinhServer = true;
  const emitted = [];
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => ({ daXacMinh: daXacMinhServer, nguon: 'THAT' }),
    emit: (st) => emitted.push(st),
  });

  assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');

  // Đăng nhập lại cùng SESSION_A trong khi bằng chứng phía server đã mất: DUOC_VAO phải bị tước ngay và kiểm tra lại.
  daXacMinhServer = false;
  const p = ctrl.doiPhien(SESSION_A);
  assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
  assert.equal(ctrl.layTrangThai().nguon, null);
  const kq = await p;
  assert.equal(kq.status, 'CAN_OTP');
});

test('T2 regression: thu hồi mock khi userId giữ nguyên qua thuHoi() và dangKyThuHoiBangChungMock; huy() hủy đăng ký', async () => {
  xoaBangChungMock();
  try {
    const cauHinh = cauHinhMockCong();
    const email = 'a@example.com';
    const userId = taoDinhDanhMockNguoiMua(email);
    const dh = taoDongHoGia(T0 + 2000);

    const gui = await guiMaOtpTheoCauHinh(cauHinh, email, { userId, nowMs: T0 });
    await xacMinhMaOtpTheoCauHinh(cauHinh, email, '123456', userId, {
      trangThai: gui.trangThai,
      nowMs: T0 + 1000,
    });

    const emitted = [];
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId: uid }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, uid, { nowMs: dh.now() }),
      emit: (st) => emitted.push(st),
      now: dh.now,
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      dangKyThuHoi: dangKyThuHoiBangChungMock,
    });

    assert.equal((await ctrl.kiemTraLai({ userId, email }, 'ev-1')).status, 'DUOC_VAO');
    assert.equal(dh.soTimer(), 1);

    // Thu hồi bằng chứng mock khi userId vẫn giữ nguyên → callback gọi ctrl.thuHoi() → tước DUOC_VAO → CAN_OTP.
    xoaBangChungMock(userId);
    assert.equal(ctrl.layTrangThai().status, 'DANG_KIEM_TRA');
    assert.equal(dh.soTimer(), 0);
    await tick();
    assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');

    // Gọi thuHoi() trực tiếp trong khi một lượt kiểm tra đang treo → bỏ kết quả cũ, kiểm tra lại.
    const def1 = taoDeferred();
    const def2 = taoDeferred();
    let lan = 0;
    const ctrlRace = taoBoDieuPhoiCongOtp({
      kiemTra: () => {
        lan += 1;
        return lan === 1 ? def1.promise : def2.promise;
      },
      emit: () => {},
    });
    const p1 = ctrlRace.kiemTraLai({ userId, email }, 'ev-1');
    const p2 = ctrlRace.thuHoi();
    def1.resolve({ daXacMinh: true, nguon: 'MO_PHONG' });
    await p1;
    assert.equal(ctrlRace.layTrangThai().status, 'DANG_KIEM_TRA');
    def2.resolve({ daXacMinh: false, nguon: 'MO_PHONG' });
    assert.equal((await p2).status, 'CAN_OTP');

    // huy() phải hủy đăng ký thu hồi: xoaBangChungMock sau huy() không còn gọi kiểm tra.
    let demSauHuy = 0;
    const ctrlHuy = taoBoDieuPhoiCongOtp({
      kiemTra: async () => {
        demSauHuy += 1;
        return { daXacMinh: true, nguon: 'MO_PHONG' };
      },
      emit: () => {},
      dangKyThuHoi: dangKyThuHoiBangChungMock,
    });
    await ctrlHuy.kiemTraLai({ userId, email }, 'ev-1');
    assert.equal(demSauHuy, 1);
    ctrlHuy.huy();
    ctrl.huy();
    xoaBangChungMock();
    await tick();
    assert.equal(demSauHuy, 1);
  } finally {
    xoaBangChungMock();
  }
});

test('T2 regression: timer vượt TRAN_TIMER_MS (2e9 ms) đặt lại hẹn giờ cho tới đúng mốc hết hạn', async () => {
  const dh = taoDongHoGia(T0);
  const delays = [];
  const hetHanLuc = T0 + 3_000_000_000;
  let lan = 0;
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      lan += 1;
      return lan === 1
        ? { daXacMinh: true, nguon: 'THAT', hetHanLuc, kiemTraLaiLuc: hetHanLuc }
        : { daXacMinh: false, nguon: 'THAT', hetHanLuc: null, kiemTraLaiLuc: null };
    },
    emit: () => {},
    now: dh.now,
    setTimer: (fn, ms) => {
      delays.push(ms);
      return dh.setTimer(fn, ms);
    },
    clearTimer: dh.clearTimer,
  });

  assert.equal((await ctrl.kiemTraLai(SESSION_A, 'ev-1')).status, 'DUOC_VAO');
  assert.deepEqual(delays, [2_000_000_000]);

  // Chưa tới hetHanLuc: timer chỉ đặt lại phần còn lại (1e9 ms), không gọi kiemTra lần 2.
  dh.tien(2_000_000_000);
  assert.equal(lan, 1);
  assert.equal(ctrl.layTrangThai().status, 'DUOC_VAO');
  assert.deepEqual(delays, [2_000_000_000, 1_000_000_000]);

  dh.tien(1_000_000_000);
  await tick();
  assert.equal(lan, 2);
  assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
  assert.equal(dh.soTimer(), 0);
});

test('T2 regression: đổi giữa hai email va chạm (a.b@ và ab@) với kho thật của core không giữ quyền vào', async () => {
  xoaBangChungMock();
  try {
    const cauHinh = cauHinhMockCong();
    const email1 = 'a.b@example.com';
    const email2 = 'ab@example.com';
    const userId1 = taoDinhDanhMockNguoiMua(email1);
    const userId2 = taoDinhDanhMockNguoiMua(email2);
    assert.notEqual(userId1, userId2);

    const gui = await guiMaOtpTheoCauHinh(cauHinh, email1, { userId: userId1, nowMs: T0 });
    await xacMinhMaOtpTheoCauHinh(cauHinh, email1, '123456', userId1, {
      trangThai: gui.trangThai,
      nowMs: T0 + 1000,
    });

    const dh = taoDongHoGia(T0 + 2000);
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, userId, { nowMs: dh.now() }),
      emit: () => {},
      now: dh.now,
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      dangKyThuHoi: dangKyThuHoiBangChungMock,
    });

    assert.equal((await ctrl.kiemTraLai({ userId: userId1, email: email1 }, 'ev-1')).status, 'DUOC_VAO');

    // Đổi sang email2 (ab@example.com): phải mất DUOC_VAO và về CAN_OTP.
    const kq2 = await ctrl.doiPhien({ userId: userId2, email: email2 });
    assert.equal(kq2.status, 'CAN_OTP');
    assert.equal(kq2.userId, userId2);
    ctrl.huy();
  } finally {
    xoaBangChungMock();
  }
});

test('T2 regression: whitelist loại lỗi ở apDungLoi và catch (loai=123456 không bao giờ lọt vào state)', async () => {
  const checking = batDauKiemTra(taoTrangThaiCong(), { userId: SESSION_A.userId, suKienId: 'ev-1' });
  const stPure = apDungLoi(checking, {
    phienBan: checking.phienBan,
    userId: SESSION_A.userId,
    suKienId: 'ev-1',
    loai: '123456',
  });
  assert.equal(stPure.status, 'LOI');
  assert.equal(stPure.loi?.loai, 'KHONG_XAC_DINH');
  assert.equal(stPure.coTheThuLai, true);
  assert.ok(!JSON.stringify(stPure).includes('123456'));

  const emitted = [];
  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      throw Object.assign(new Error('leak 123456'), { loai: '123456' });
    },
    emit: (st) => emitted.push(st),
  });
  const stCtrl = await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(stCtrl.status, 'LOI');
  assert.equal(stCtrl.loi?.loai, 'KHONG_XAC_DINH');
  assert.ok(!JSON.stringify([stCtrl, emitted]).includes('123456'));
});

test('T2 regression: timer của generation cũ bị bỏ qua dù callback vẫn nổ', async () => {
  let nowMs = T0;
  const captured = [];
  const emitted = [];
  let lan = 0;

  const ctrl = taoBoDieuPhoiCongOtp({
    kiemTra: async () => {
      lan += 1;
      return { daXacMinh: true, nguon: 'THAT', hetHanLuc: T0 + 5_000, kiemTraLaiLuc: T0 + 5_000 };
    },
    emit: (st) => emitted.push(st),
    now: () => nowMs,
    // Cố ý không hủy timer cũ để kiểm chứng bảo vệ theo generation.
    setTimer: (fn) => {
      captured.push(fn);
      return captured.length;
    },
    clearTimer: () => {},
  });

  await ctrl.kiemTraLai(SESSION_A, 'ev-1');
  assert.equal(captured.length, 1);
  assert.equal(lan, 1);

  // Đổi phiên hoặc đăng xuất làm tăng generation.
  ctrl.dangXuat();
  const countAfterLogout = emitted.length;
  nowMs = T0 + 5_000;
  captured[0]();
  await tick();

  assert.equal(lan, 1);
  assert.equal(emitted.length, countAfterLogout);
  assert.equal(ctrl.layTrangThai().status, 'CAN_DANG_NHAP');
});

test('T2 regression: biên 24 giờ ±1ms với timer của bộ điều phối và kho bằng chứng thật của core', async () => {
  xoaBangChungMock();
  try {
    const cauHinh = cauHinhMockCong();
    const email = 'a@example.com';
    const userId = taoDinhDanhMockNguoiMua(email);
    const gui = await guiMaOtpTheoCauHinh(cauHinh, email, { userId, nowMs: T0 });
    const xacMinhLuc = T0 + 1000;
    await xacMinhMaOtpTheoCauHinh(cauHinh, email, '123456', userId, {
      trangThai: gui.trangThai,
      nowMs: xacMinhLuc,
    });

    const ms24h = HIEU_LUC_XAC_MINH_GIAY * 1000;
    const dh = taoDongHoGia(xacMinhLuc);
    const emitted = [];
    const ctrl = taoBoDieuPhoiCongOtp({
      kiemTra: ({ userId: uid }) => kiemTraDaXacMinhTheoCauHinh(cauHinh, uid, { nowMs: dh.now() }),
      emit: (st) => emitted.push(st),
      now: dh.now,
      setTimer: dh.setTimer,
      clearTimer: dh.clearTimer,
      dangKyThuHoi: dangKyThuHoiBangChungMock,
    });

    assert.equal((await ctrl.kiemTraLai({ userId, email }, 'ev-1')).status, 'DUOC_VAO');
    assert.equal(dh.soTimer(), 1);

    // 24 giờ - 1ms: vẫn DUOC_VAO.
    dh.tien(ms24h - 1);
    assert.equal(ctrl.layTrangThai().status, 'DUOC_VAO');
    assert.equal(dh.soTimer(), 1);

    // Đúng 24 giờ: timer nổ, tước quyền, kiểm tra lại → CAN_OTP, không còn timer, không phát DUOC_VAO.
    const idx = emitted.length;
    dh.tien(1);
    assert.notEqual(ctrl.layTrangThai().status, 'DUOC_VAO');
    await tick();
    assert.equal(ctrl.layTrangThai().status, 'CAN_OTP');
    assert.equal(dh.soTimer(), 0);
    assert.ok(!emitted.slice(idx).some((st) => st.status === 'DUOC_VAO'));
    ctrl.huy();
  } finally {
    xoaBangChungMock();
  }
});
