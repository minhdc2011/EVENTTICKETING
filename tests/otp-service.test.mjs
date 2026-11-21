import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OtpServiceError,
  capNhatSauLoi,
  datLaiSauThanhCong,
  ghiNhanGui,
  ghiNhanSai,
  guiOtpLogic,
  guiOtpMock,
  guiOtpTheoCauHinh,
  xacMinhOtpTheoCauHinh,
  phanLoaiLoiAuth,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  tinhThoiGianOtp,
  xacMinhOtpLogic,
  xacMinhOtpMock,
} from '../src/domain/otpServiceCore.js';

const T0 = 1_000_000_000;
const giay = (n) => T0 + n * 1000;
const EMAIL = 'a@example.com';
const TOKEN = '987654';

// Auth giả ghi lại lời gọi; không có đồng hồ hay mạng thật.
function authGia({ gui = {}, xacMinh = {} } = {}) {
  const calls = { signInWithOtp: [], verifyOtp: [] };
  return {
    calls,
    signInWithOtp: async (p) => {
      calls.signInWithOtp.push(p);
      if (gui.throw) throw gui.throw;
      return gui.result ?? { data: {}, error: null };
    },
    verifyOtp: async (p) => {
      calls.verifyOtp.push(p);
      if (xacMinh.throw) throw xacMinh.throw;
      return xacMinh.result ?? { data: { user: { id: 'u1', email: EMAIL } }, error: null };
    },
  };
}

const loiAuth = (props) => Object.assign(new Error('raw ' + TOKEN), props);
const loiSaiMa = () => loiAuth({ status: 403, code: 'otp_expired' });

test('guiOtpLogic gọi signInWithOtp đúng payload và trả nguồn THAT', async () => {
  const auth = authGia();
  const r = await guiOtpLogic(auth, EMAIL);
  assert.deepEqual(auth.calls.signInWithOtp, [{ email: EMAIL, options: { shouldCreateUser: false } }]);
  assert.equal(r.nguon, 'THAT');
  assert.equal(r.moPhong, undefined);
});

test('xacMinhOtpLogic gọi verifyOtp đúng payload và trả user, không trả token', async () => {
  const auth = authGia();
  const r = await xacMinhOtpLogic(auth, EMAIL, TOKEN);
  assert.deepEqual(auth.calls.verifyOtp, [{ email: EMAIL, token: TOKEN, type: 'email' }]);
  assert.deepEqual(r, { nguon: 'THAT', userId: 'u1', email: EMAIL });
  assert.ok(!JSON.stringify(r).includes(TOKEN));
});

test('lỗi Auth (trả về hoặc ném) thành OtpServiceError, không chuyển sang mock', async () => {
  const a1 = authGia({ xacMinh: { result: { data: {}, error: loiSaiMa() } } });
  await assert.rejects(() => xacMinhOtpLogic(a1, EMAIL, '123456'), (e) => {
    assert.ok(e instanceof OtpServiceError);
    assert.equal(e.loai, 'SAI_MA');
    return true;
  });
  assert.equal(a1.calls.verifyOtp.length, 1);

  const a2 = authGia({ gui: { throw: new TypeError('fetch failed') } });
  await assert.rejects(() => guiOtpLogic(a2, EMAIL), (e) => e.loai === 'MANG');
});

test('biên hiệu lực 300 giây', () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const a = tinhThoiGianOtp(st, giay(299));
  assert.equal(a.conHieuLuc, true);
  assert.equal(a.giayConHieuLuc, 1);
  const b = tinhThoiGianOtp(st, giay(300));
  assert.equal(b.conHieuLuc, false);
  assert.equal(b.giayConHieuLuc, 0);
  assert.equal(tinhThoiGianOtp(st, giay(900)).giayConHieuLuc, 0);
});

test('biên chờ gửi lại 60 giây', () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const a = tinhThoiGianOtp(st, giay(59));
  assert.equal(a.coTheGuiLai, false);
  assert.equal(a.giayChoGuiLai, 1);
  assert.equal(a.mocGuiLaiTiepTheo, giay(60));
  const b = tinhThoiGianOtp(st, giay(60));
  assert.equal(b.coTheGuiLai, true);
  assert.equal(b.giayChoGuiLai, 0);
  assert.equal(b.mocGuiLaiTiepTheo, null);
});

test('cửa sổ gửi lại 3600 giây và hết 3 lượt', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  st = ghiNhanGui(st, giay(60), { laGuiLai: true });
  st = ghiNhanGui(st, giay(120), { laGuiLai: true });
  st = ghiNhanGui(st, giay(180), { laGuiLai: true });
  const het = tinhThoiGianOtp(st, giay(240));
  assert.equal(het.soLanGuiLaiConLai, 0);
  assert.equal(het.coTheGuiLai, false);
  assert.equal(het.mocGuiLaiTiepTheo, giay(60 + 3600));
  // Lượt gửi lại đầu (t=60) ra khỏi cửa sổ tại 3660 s; lượt 2 (t=120) tại 3720 s; lượt 3 (t=180) tại 3780 s.
  assert.equal(tinhThoiGianOtp(st, giay(3659)).soLanGuiLaiConLai, 0);
  const sau = tinhThoiGianOtp(st, giay(3660));
  assert.equal(sau.soLanGuiLaiConLai, 1);
  assert.equal(sau.coTheGuiLai, true);
  assert.equal(tinhThoiGianOtp(st, giay(3719)).soLanGuiLaiConLai, 1);
  assert.equal(tinhThoiGianOtp(st, giay(3720)).soLanGuiLaiConLai, 2);
  assert.equal(tinhThoiGianOtp(st, giay(3779)).soLanGuiLaiConLai, 2);
  assert.equal(tinhThoiGianOtp(st, giay(3780)).soLanGuiLaiConLai, 3);
});

test('hơn 3 lần gửi lại: mốc gửi lại tiếp theo dùng mốc thứ N-3', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (const s of [0, 60, 120, 180]) st = ghiNhanGui(st, giay(s), { laGuiLai: true });
  const het = tinhThoiGianOtp(st, giay(240));
  assert.equal(het.soLanGuiLaiConLai, 0);
  assert.equal(het.coTheGuiLai, false);
  assert.equal(het.mocGuiLaiTiepTheo, giay(3660));
  const truoc = tinhThoiGianOtp(st, giay(3659));
  assert.equal(truoc.soLanGuiLaiConLai, 0);
  assert.equal(truoc.coTheGuiLai, false);
  const dung = tinhThoiGianOtp(st, giay(3660));
  assert.equal(dung.soLanGuiLaiConLai, 1);
  assert.equal(dung.coTheGuiLai, true);
  assert.equal(tinhThoiGianOtp(st, het.mocGuiLaiTiepTheo).coTheGuiLai, true);
});

test('N=5 kết hợp chờ 60 giây: dùng mốc N-3 khi mocLuot lớn hơn mocCho', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (const s of [0, 1000, 2000, 3000, 3500]) st = ghiNhanGui(st, giay(s), { laGuiLai: true });
  const het = tinhThoiGianOtp(st, giay(3540));
  assert.equal(het.giayChoGuiLai, 20);
  assert.equal(het.soLanGuiLaiConLai, 0);
  assert.equal(het.coTheGuiLai, false);
  assert.equal(het.mocGuiLaiTiepTheo, giay(5600));
  const truoc = tinhThoiGianOtp(st, giay(5599));
  assert.equal(truoc.soLanGuiLaiConLai, 0);
  assert.equal(truoc.coTheGuiLai, false);
  const dung = tinhThoiGianOtp(st, giay(5600));
  assert.equal(dung.soLanGuiLaiConLai, 1);
  assert.equal(dung.coTheGuiLai, true);
  assert.equal(dung.mocGuiLaiTiepTheo, null);
});

test('khi thời gian chờ 60 giây lớn hơn mốc lượt, mocGuiLaiTiepTheo chọn mocCho', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (const s of [60, 120, 3610]) st = ghiNhanGui(st, giay(s), { laGuiLai: true });
  // mocLuot = 60 + 3600 = 3660; mocCho = 3610 + 60 = 3670.
  const het = tinhThoiGianOtp(st, giay(3620));
  assert.equal(het.soLanGuiLaiConLai, 0);
  assert.equal(het.giayChoGuiLai, 50);
  assert.equal(het.coTheGuiLai, false);
  assert.equal(het.mocGuiLaiTiepTheo, giay(3670));
  const taiMocLuot = tinhThoiGianOtp(st, giay(3660));
  assert.equal(taiMocLuot.soLanGuiLaiConLai, 1);
  assert.equal(taiMocLuot.giayChoGuiLai, 10);
  assert.equal(taiMocLuot.coTheGuiLai, false);
  assert.equal(taiMocLuot.mocGuiLaiTiepTheo, giay(3670));
  const truocMocCho = tinhThoiGianOtp(st, giay(3669));
  assert.equal(truocMocCho.coTheGuiLai, false);
  const dungMocCho = tinhThoiGianOtp(st, giay(3670));
  assert.equal(dungMocCho.soLanGuiLaiConLai, 1);
  assert.equal(dungMocCho.giayChoGuiLai, 0);
  assert.equal(dungMocCho.coTheGuiLai, true);
  assert.equal(dungMocCho.mocGuiLaiTiepTheo, null);
});

test('lần gửi đầu không tính vào số lần gửi lại', () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  assert.equal(tinhThoiGianOtp(st, giay(10)).soLanGuiLaiConLai, 3);
});

test('mốc gửi lại cũ ra khỏi cửa sổ đúng tại 3600 giây', () => {
  const st = ghiNhanGui(ghiNhanGui(taoTrangThaiOtp(EMAIL), T0), giay(60), { laGuiLai: true });
  assert.equal(tinhThoiGianOtp(st, giay(60 + 3599)).soLanGuiLaiConLai, 2);
  assert.equal(tinhThoiGianOtp(st, giay(60 + 3600)).soLanGuiLaiConLai, 3);
});

test('5 lần sai trong 15 phút, biên 899/900 giây, hiển thị mốc 5 lần/15 phút', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (let i = 0; i < 5; i += 1) st = ghiNhanSai(st, giay(i));
  const khoa = tinhThoiGianOtp(st, giay(10));
  assert.equal(khoa.soLanSaiConLai, 0);
  assert.equal(khoa.biTamKhoaNhap, true);
  assert.equal(khoa.mocMoKhoaNhap, giay(900));
  assert.deepEqual(khoa.gioiHanHienThi, { sai: 5, phut: 15 });
  assert.equal(khoa.laThongTinPhiaClient, true);
  assert.equal(tinhThoiGianOtp(st, giay(899)).biTamKhoaNhap, true);
  const mo = tinhThoiGianOtp(st, giay(900));
  assert.equal(mo.biTamKhoaNhap, false);
  assert.equal(mo.soLanSaiConLai, 1);
  assert.equal(mo.mocMoKhoaNhap, null);
});

test('số lần sai còn lại không âm khi ghi quá 5 lần', () => {
  let st = taoTrangThaiOtp(EMAIL);
  for (let i = 0; i < 8; i += 1) st = ghiNhanSai(st, giay(i));
  const t = tinhThoiGianOtp(st, giay(10));
  assert.equal(t.soLanSaiConLai, 0);
  assert.ok(t.soLanGuiLaiConLai >= 0);
  assert.ok(thongBaoLoiOtp('SAI_MA', t).includes('0 lần'));
});

test('trạng thái bất biến, không chứa OTP, và reset sau thành công', () => {
  const st0 = taoTrangThaiOtp(EMAIL);
  const st1 = ghiNhanSai(ghiNhanGui(st0, T0), giay(1));
  assert.deepEqual(st0, { email: EMAIL, guiLuc: null, lichSuGuiLai: [], lichSuSai: [] });
  assert.equal(st1.lichSuSai.length, 1);
  assert.deepEqual(Object.keys(st1).sort(), ['email', 'guiLuc', 'lichSuGuiLai', 'lichSuSai']);
  const sau = datLaiSauThanhCong(st1);
  assert.deepEqual(sau, st0);
  assert.equal(tinhThoiGianOtp(sau, giay(2)).soLanSaiConLai, 5);
});

test('luồng sai 5 lần rồi thành công thì bộ đếm được reset', async () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const auth = authGia({ xacMinh: { result: { data: {}, error: loiSaiMa() } } });
  for (let i = 1; i <= 5; i += 1) {
    const now = giay(i);
    const err = await xacMinhOtpLogic(auth, EMAIL, '000000', { trangThai: st, nowMs: now }).catch((e) => e);
    assert.equal(err.loai, 'SAI_MA');
    assert.equal(err.soLanSaiConLai, 5 - i);
    st = capNhatSauLoi(st, err, now);
  }
  assert.equal(tinhThoiGianOtp(st, giay(6)).soLanSaiConLai, 0);
  const ok = await xacMinhOtpLogic(authGia(), EMAIL, TOKEN);
  st = datLaiSauThanhCong(st);
  assert.equal(ok.nguon, 'THAT');
  assert.equal(tinhThoiGianOtp(st, giay(7)).soLanSaiConLai, 5);
});

test('phân loại lỗi: 429, mạng, cấu hình, otp_expired theo đồng hồ', () => {
  const conHan = { conHieuLuc: true };
  const hetHan = { conHieuLuc: false };
  assert.equal(phanLoaiLoiAuth({ status: 429 }), 'RATE_LIMIT');
  assert.equal(phanLoaiLoiAuth({ code: 'over_email_send_rate_limit' }), 'RATE_LIMIT');
  assert.equal(phanLoaiLoiAuth({ code: 'over_request_rate_limit' }), 'RATE_LIMIT');
  assert.equal(phanLoaiLoiAuth(new TypeError('fetch failed')), 'MANG');
  assert.equal(phanLoaiLoiAuth({ name: 'AuthRetryableFetchError', status: 0 }), 'MANG');
  assert.equal(phanLoaiLoiAuth(new Error('Thiếu VITE_SUPABASE_URL')), 'CAU_HINH');
  assert.equal(phanLoaiLoiAuth({ code: 'otp_expired' }, conHan), 'SAI_MA');
  assert.equal(phanLoaiLoiAuth({ code: 'otp_expired' }, hetHan), 'HET_HAN');
  assert.equal(phanLoaiLoiAuth({ code: 'x' }), 'KHONG_XAC_DINH');
});

test('429, lỗi mạng, otp_expired quá 300 giây không tăng bộ đếm sai', async () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const truongHop = [
    [loiAuth({ status: 429, code: 'over_request_rate_limit' }), giay(10), 'RATE_LIMIT'],
    [new TypeError('fetch failed'), giay(10), 'MANG'],
    [loiAuth({ status: 403, code: 'otp_expired' }), giay(300), 'HET_HAN'],
  ];
  for (const [loi, now, loai] of truongHop) {
    const auth = authGia({ xacMinh: { throw: loi } });
    const err = await xacMinhOtpLogic(auth, EMAIL, '000000', { trangThai: st, nowMs: now }).catch((e) => e);
    assert.equal(err.loai, loai);
    const moi = capNhatSauLoi(st, err, now);
    assert.equal(moi.lichSuSai.length, 0);
    assert.equal(tinhThoiGianOtp(moi, now).soLanSaiConLai, 5);
  }
});

test('thông báo tiếng Việt, không chứa token hay message thô', async () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const loi = loiAuth({ status: 403, code: 'otp_expired' });
  const err = await xacMinhOtpLogic(authGia({ xacMinh: { throw: loi } }), EMAIL, TOKEN, {
    trangThai: st,
    nowMs: giay(5),
  }).catch((e) => e);
  assert.match(err.message, /Mã OTP không đúng/);
  assert.match(err.message, /còn 4 lần/);
  assert.ok(!err.message.includes(TOKEN));
  assert.ok(!err.message.includes('raw'));
  assert.ok(!JSON.stringify(err).includes(TOKEN));
  for (const loai of ['SAI_MA', 'HET_HAN', 'RATE_LIMIT', 'MANG', 'CAU_HINH', 'KHONG_XAC_DINH']) {
    const msg = thongBaoLoiOtp(loai, tinhThoiGianOtp(st, giay(5)));
    assert.ok(msg.length > 10);
    assert.ok(!/\d{6}/.test(msg));
  }
  assert.match(thongBaoLoiOtp('MANG'), /không tính là nhập sai/);
});

test('thông báo rate limit nêu số lần gửi lại không âm', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (let i = 1; i <= 5; i += 1) st = ghiNhanGui(st, giay(i * 60), { laGuiLai: true });
  assert.match(thongBaoLoiOtp('RATE_LIMIT', tinhThoiGianOtp(st, giay(400))), /còn 0 lần gửi lại/);
});

test('mock chấp nhận 123456, đánh dấu mô phỏng', async () => {
  assert.deepEqual(await guiOtpMock(), { nguon: 'MO_PHONG', moPhong: true });
  assert.deepEqual(await xacMinhOtpMock('123456'), { nguon: 'MO_PHONG', moPhong: true });
});

test('mock từ chối mã khác', async () => {
  const err = await xacMinhOtpMock('654321').catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'SAI_MA');
  assert.ok(!err.message.includes('654321'));
});

test('nhánh thật không có đặc quyền cho 123456 và không ghi nhận mô phỏng', async () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const auth = authGia({ xacMinh: { result: { data: {}, error: loiSaiMa() } } });
  const err = await xacMinhOtpLogic(auth, EMAIL, '123456', {
    trangThai: st,
    nowMs: giay(10),
  }).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'SAI_MA');
  assert.equal(err.soLanSaiConLai, 4);
  assert.ok(!err.message.includes('123456'));
  assert.deepEqual(auth.calls.verifyOtp, [{ email: EMAIL, token: '123456', type: 'email' }]);
  st = capNhatSauLoi(st, err, giay(10));
  assert.equal(tinhThoiGianOtp(st, giay(10)).soLanSaiConLai, 4);
});

test('mock từ chối mã sai vẫn là SAI_MA và báo số lần còn lại kể cả khi chưa ghi nhận gửi', async () => {
  const st = taoTrangThaiOtp(EMAIL);
  const err = await xacMinhOtpMock('654321', { trangThai: st, nowMs: giay(10) }).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'SAI_MA');
  assert.equal(err.soLanSaiConLai, 4);
  assert.match(err.message, /còn 4 lần/);
});

test('lỗi thiếu cấu hình ném từ Auth giả thành CAU_HINH, không chuyển sang mock và không tăng bộ đếm sai', async () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const loiCauHinh = new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.');
  const authGui = authGia({ gui: { throw: loiCauHinh } });
  const errGui = await guiOtpLogic(authGui, EMAIL, { trangThai: st, nowMs: giay(5) }).catch((e) => e);
  assert.ok(errGui instanceof OtpServiceError);
  assert.equal(errGui.loai, 'CAU_HINH');
  assert.match(errGui.message, /chưa được cấu hình/);
  assert.equal(authGui.calls.signInWithOtp.length, 1);

  const authVerify = authGia({ xacMinh: { throw: loiCauHinh } });
  const errVerify = await xacMinhOtpLogic(authVerify, EMAIL, '123456', {
    trangThai: st,
    nowMs: giay(10),
  }).catch((e) => e);
  assert.ok(errVerify instanceof OtpServiceError);
  assert.equal(errVerify.loai, 'CAU_HINH');
  assert.equal(capNhatSauLoi(st, errVerify, giay(10)).lichSuSai.length, 0);
});

// Bộ chọn nhánh mock/thật: layAuth được đếm số lần gọi.
function cauHinhGia(useMockData, auth, loiLayAuth) {
  const dem = { layAuth: 0 };
  return {
    dem,
    cauHinh: {
      useMockData,
      layAuth: () => {
        dem.layAuth += 1;
        if (loiLayAuth) throw loiLayAuth;
        return auth;
      },
    },
  };
}

test('useMockData=true: không gọi Auth hay layAuth; 123456 là mô phỏng, mã khác SAI_MA', async () => {
  const auth = authGia();
  const { cauHinh, dem } = cauHinhGia(true, auth);
  assert.deepEqual(await guiOtpTheoCauHinh(cauHinh, EMAIL), { nguon: 'MO_PHONG', moPhong: true });
  assert.deepEqual(await xacMinhOtpTheoCauHinh(cauHinh, EMAIL, '123456'), { nguon: 'MO_PHONG', moPhong: true });
  const err = await xacMinhOtpTheoCauHinh(cauHinh, EMAIL, TOKEN).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'SAI_MA');
  assert.equal(dem.layAuth, 0);
  assert.equal(auth.calls.signInWithOtp.length + auth.calls.verifyOtp.length, 0);
});

test('useMockData=false: 123456 đi tới verifyOtp đúng payload; lỗi Auth bị từ chối, không thành công giả', async () => {
  const auth = authGia({ xacMinh: { result: { data: {}, error: loiSaiMa() } } });
  const { cauHinh, dem } = cauHinhGia(false, auth);
  const err = await xacMinhOtpTheoCauHinh(cauHinh, '  A@Example.COM ', '123456').catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'SAI_MA');
  assert.deepEqual(auth.calls.verifyOtp, [{ email: EMAIL, token: '123456', type: 'email' }]);
  assert.equal(dem.layAuth, 1);

  const gui = await guiOtpTheoCauHinh(cauHinh, '  A@Example.COM ');
  assert.deepEqual(auth.calls.signInWithOtp, [{ email: EMAIL, options: { shouldCreateUser: false } }]);
  assert.equal(gui.nguon, 'THAT');
});

test('useMockData=false: layAuth ném lỗi thiếu cấu hình thành CAU_HINH, không mô phỏng, không tăng bộ đếm sai', async () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const loi = new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.');
  const { cauHinh } = cauHinhGia(false, null, loi);
  const tuyChon = { trangThai: st, nowMs: giay(10) };
  const errVerify = await xacMinhOtpTheoCauHinh(cauHinh, EMAIL, '123456', tuyChon).catch((e) => e);
  assert.ok(errVerify instanceof OtpServiceError);
  assert.equal(errVerify.loai, 'CAU_HINH');
  assert.equal(capNhatSauLoi(st, errVerify, giay(10)).lichSuSai.length, 0);
  const errGui = await guiOtpTheoCauHinh(cauHinh, EMAIL, tuyChon).catch((e) => e);
  assert.ok(errGui instanceof OtpServiceError);
  assert.equal(errGui.loai, 'CAU_HINH');
  assert.notEqual(errGui.nguon, 'MO_PHONG');
});

test('useMockData=false: lỗi mạng TypeError từ signInWithOtp là MANG, không fallback', async () => {
  const auth = authGia({ gui: { throw: new TypeError('fetch failed') } });
  const { cauHinh } = cauHinhGia(false, auth);
  const err = await guiOtpTheoCauHinh(cauHinh, EMAIL).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'MANG');
  assert.equal(auth.calls.signInWithOtp.length, 1);
});

test('luồng ghép qua core với Auth giả: gửi → sai → gửi lại → đúng', async () => {
  let verifyCount = 0;
  const calls = { signInWithOtp: [], verifyOtp: [] };
  const auth = {
    signInWithOtp: async (payload) => {
      calls.signInWithOtp.push(payload);
      return { data: {}, error: null };
    },
    verifyOtp: async (payload) => {
      calls.verifyOtp.push(payload);
      verifyCount += 1;
      if (verifyCount === 1) {
        return { data: {}, error: loiSaiMa() };
      }
      return { data: { user: { id: 'u-flow', email: EMAIL } }, error: null };
    },
  };

  let st = taoTrangThaiOtp(EMAIL);
  const gui1 = await guiOtpLogic(auth, EMAIL, { trangThai: st, nowMs: T0 });
  assert.deepEqual(gui1, { nguon: 'THAT' });
  st = ghiNhanGui(st, T0);
  assert.equal(tinhThoiGianOtp(st, T0).conHieuLuc, true);
  assert.equal(tinhThoiGianOtp(st, T0).soLanGuiLaiConLai, 3);

  const errSai = await xacMinhOtpLogic(auth, EMAIL, '000000', {
    trangThai: st,
    nowMs: giay(10),
  }).catch((e) => e);
  assert.ok(errSai instanceof OtpServiceError);
  assert.equal(errSai.loai, 'SAI_MA');
  assert.equal(errSai.soLanSaiConLai, 4);
  st = capNhatSauLoi(st, errSai, giay(10));
  assert.equal(tinhThoiGianOtp(st, giay(10)).soLanSaiConLai, 4);

  assert.equal(tinhThoiGianOtp(st, giay(60)).coTheGuiLai, true);
  const gui2 = await guiOtpLogic(auth, EMAIL, { trangThai: st, nowMs: giay(60) });
  assert.deepEqual(gui2, { nguon: 'THAT' });
  st = ghiNhanGui(st, giay(60), { laGuiLai: true });
  const sauGuiLai = tinhThoiGianOtp(st, giay(60));
  assert.equal(sauGuiLai.soLanGuiLaiConLai, 2);
  assert.equal(sauGuiLai.soLanSaiConLai, 4);
  assert.equal(sauGuiLai.giayConHieuLuc, 300);

  const ok = await xacMinhOtpLogic(auth, EMAIL, TOKEN, {
    trangThai: st,
    nowMs: giay(75),
  });
  assert.deepEqual(ok, { nguon: 'THAT', userId: 'u-flow', email: EMAIL });
  st = datLaiSauThanhCong(st);
  const sauReset = tinhThoiGianOtp(st, giay(75));
  assert.equal(sauReset.soLanSaiConLai, 5);
  assert.equal(sauReset.soLanGuiLaiConLai, 3);
  assert.equal(sauReset.conHieuLuc, false);
  assert.equal(calls.signInWithOtp.length, 2);
  assert.equal(calls.verifyOtp.length, 2);
});
