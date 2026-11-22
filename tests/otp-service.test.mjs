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
  HIEU_LUC_XAC_MINH_GIAY,
  bangChungMockConHieuLuc,
  kiemTraBangChungThat,
  taoBangChungMock,
  guiMaOtpTheoCauHinh,
  xacMinhMaOtpTheoCauHinh,
  kiemTraDaXacMinhTheoCauHinh,
  kiemTraTruocKhiGui,
  kiemTraTruocKhiXacMinh,
  khoBangChungMock,
  khoGuiMock,
  layBienNhanGuiMock,
  xoaBangChungMock,
  layTheHeBangChungMock,
  KIEM_TRA_LAI_THAT_MS,
  LOAI_LOI_OTP,
  chuanHoaLoaiLoiOtp,
  hetHanTuAccessToken,
  dangKyThuHoiBangChungMock,
  taoDinhDanhMockNguoiMua,
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

const daGui = () => ({ trangThai: ghiNhanGui(taoTrangThaiOtp(EMAIL), T0), nowMs: giay(10) });

test('mock chấp nhận 123456, đánh dấu mô phỏng', async () => {
  assert.deepEqual(await guiOtpMock(), { nguon: 'MO_PHONG', moPhong: true });
  assert.deepEqual(await xacMinhOtpMock('123456', daGui()), { nguon: 'MO_PHONG', moPhong: true });
});

test('mock từ chối mã khác', async () => {
  const err = await xacMinhOtpMock('654321', daGui()).catch((e) => e);
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

test('mock từ chối mã sai là SAI_MA và báo số lần còn lại', async () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
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
  assert.deepEqual(await xacMinhOtpTheoCauHinh(cauHinh, EMAIL, '123456', daGui()), { nguon: 'MO_PHONG', moPhong: true });
  const err = await xacMinhOtpTheoCauHinh(cauHinh, EMAIL, TOKEN, daGui()).catch((e) => e);
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

// ---- Cổng giao diện: mock cần đã gửi + biên 300 giây ----

test('mock: chưa gửi hoặc thiếu trạng thái → CHUA_GUI, không tăng bộ đếm sai', async () => {
  for (const tuyChon of [undefined, { nowMs: giay(1) }, { trangThai: taoTrangThaiOtp(EMAIL), nowMs: giay(1) }]) {
    const err = await xacMinhOtpMock('123456', tuyChon).catch((e) => e);
    assert.ok(err instanceof OtpServiceError);
    assert.equal(err.loai, 'CHUA_GUI');
    assert.ok(!err.message.includes('123456'));
    if (tuyChon?.trangThai) assert.equal(capNhatSauLoi(tuyChon.trangThai, err, giay(1)).lichSuSai.length, 0);
  }
  assert.match(thongBaoLoiOtp('CHUA_GUI'), /chưa/);
});

test('mock: 299.999 giây còn hiệu lực, đúng 300 giây → HET_HAN không tăng bộ đếm sai', async () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  assert.deepEqual(await xacMinhOtpMock('123456', { trangThai: st, nowMs: T0 + 299_999 }), {
    nguon: 'MO_PHONG',
    moPhong: true,
  });
  const err = await xacMinhOtpMock('123456', { trangThai: st, nowMs: giay(300) }).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'HET_HAN');
  assert.equal(capNhatSauLoi(st, err, giay(300)).lichSuSai.length, 0);
  const sai = await xacMinhOtpMock('654321', { trangThai: st, nowMs: giay(300) }).catch((e) => e);
  assert.equal(sai.loai, 'HET_HAN');
});

test('bằng chứng mock: 24 giờ trừ 1ms còn hiệu lực, đúng 24 giờ hết, sai userId và tương lai bị từ chối', () => {
  assert.equal(HIEU_LUC_XAC_MINH_GIAY, 86400);
  const bc = taoBangChungMock('u1', T0);
  assert.deepEqual(bc, { userId: 'u1', xacMinhLuc: T0, nguon: 'MO_PHONG' });
  assert.equal(bangChungMockConHieuLuc(bc, 'u1', T0), true);
  assert.equal(bangChungMockConHieuLuc(bc, 'u1', T0 + 86_400_000 - 1), true);
  assert.equal(bangChungMockConHieuLuc(bc, 'u1', T0 + 86_400_000), false);
  assert.equal(bangChungMockConHieuLuc(bc, 'u2', T0 + 1), false);
  assert.equal(bangChungMockConHieuLuc(bc, 'u1', T0 - 1), false);
  assert.equal(bangChungMockConHieuLuc(null, 'u1', T0), false);
  assert.equal(bangChungMockConHieuLuc({ ...bc, nguon: 'THAT' }, 'u1', T0), false);
});

// ---- RPC da_xac_minh_otp ----

const rpcGia = (ketQua) => {
  const calls = [];
  return {
    calls,
    rpc: async (...args) => {
      calls.push(args);
      if (ketQua.throw) throw ketQua.throw;
      return ketQua.result;
    },
  };
};

test('kiemTraBangChungThat: true/false boolean thật', async () => {
  const a = rpcGia({ result: { data: true, error: null } });
  assert.deepEqual(await kiemTraBangChungThat(a), { daXacMinh: true });
  assert.deepEqual(a.calls, [['da_xac_minh_otp']]);
  assert.deepEqual(await kiemTraBangChungThat(rpcGia({ result: { data: false, error: null } })), { daXacMinh: false });
});

test('kiemTraBangChungThat: lỗi RPC, lỗi mạng hoặc dữ liệu không phải boolean đều ném, không bao giờ là true', async () => {
  const truongHop = [
    [{ result: { data: true, error: { message: 'boom', status: 401 } } }, 'KHONG_XAC_DINH'],
    [{ result: { data: null, error: { message: 'x', status: 429 } } }, 'RATE_LIMIT'],
    [{ throw: new TypeError('fetch failed') }, 'MANG'],
    [{ result: { data: null, error: null } }, 'KHONG_XAC_DINH'],
    [{ result: { data: 'true', error: null } }, 'KHONG_XAC_DINH'],
    [{ result: { data: 1, error: null } }, 'KHONG_XAC_DINH'],
    [{ result: undefined }, 'KHONG_XAC_DINH'],
  ];
  for (const [cfg, loai] of truongHop) {
    const err = await kiemTraBangChungThat(rpcGia(cfg)).catch((e) => e);
    assert.ok(err instanceof OtpServiceError, loai);
    assert.equal(err.loai, loai);
  }
  const cauHinh = await kiemTraBangChungThat(
    rpcGia({ throw: new Error('Thiếu VITE_SUPABASE_URL') }),
  ).catch((e) => e);
  assert.equal(cauHinh.loai, 'CAU_HINH');
});

// ---- Bộ đếm: chỉ SAI_MA tăng; gửi lỗi không ghi nhận ----

test('MANG/CAU_HINH/RATE_LIMIT/CHUA_GUI/HET_HAN không tăng lichSuSai; chỉ SAI_MA tăng', () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (const loai of ['MANG', 'CAU_HINH', 'RATE_LIMIT', 'CHUA_GUI', 'HET_HAN', 'KHONG_XAC_DINH']) {
    const err = new OtpServiceError(thongBaoLoiOtp(loai), loai);
    assert.equal(capNhatSauLoi(st, err, giay(5)).lichSuSai.length, 0, loai);
  }
  assert.equal(capNhatSauLoi(st, new OtpServiceError('x', 'SAI_MA'), giay(5)).lichSuSai.length, 1);
});

test('gửi lỗi (mạng, rate limit) ném lỗi và không làm đổi trạng thái đã ghi nhận', async () => {
  const st = taoTrangThaiOtp(EMAIL);
  const dong = JSON.stringify(st);
  for (const [loi, loai] of [
    [new TypeError('fetch failed'), 'MANG'],
    [loiAuth({ status: 429, code: 'over_email_send_rate_limit' }), 'RATE_LIMIT'],
  ]) {
    const err = await guiOtpLogic(authGia({ gui: { throw: loi } }), EMAIL, { trangThai: st, nowMs: T0 }).catch((e) => e);
    assert.equal(err.loai, loai);
    assert.ok(!err.message.includes(TOKEN));
  }
  assert.equal(JSON.stringify(st), dong);
  assert.equal(st.guiLuc, null);
});

// ---- Giới hạn phía client (CLIENT_*) tách khỏi cưỡng chế của Auth (RATE_LIMIT) ----

// Client giả: Auth + rpc + getSession; ghi lại thứ tự lời gọi.
// phien: danh sách phiên theo từng lần gọi getSession (lần k dùng phien[k], quá độ dài thì dùng phần tử cuối);
// mỗi phần tử {userId, token} hoặc null. rpcFn: thay rpc mặc định (ví dụ trả về từ deferred promise).
function clientGia({ gui, xacMinh, rpc = { result: { data: true, error: null } }, sessionUserId = 'u1', sessionThrow, phien, rpcFn } = {}) {
  const thuTu = [];
  const auth = authGia({ gui, xacMinh });
  let soLanGetSession = 0;
  const client = {
    thuTu,
    auth: {
      signInWithOtp: (p) => (thuTu.push('signInWithOtp'), auth.signInWithOtp(p)),
      verifyOtp: (p) => (thuTu.push('verifyOtp'), auth.verifyOtp(p)),
      getSession: async () => {
        thuTu.push('getSession');
        if (sessionThrow) throw sessionThrow;
        const p = phien
          ? phien[Math.min(soLanGetSession, phien.length - 1)]
          : sessionUserId
            ? { userId: sessionUserId, token: 'tok-' + sessionUserId }
            : null;
        soLanGetSession += 1;
        return { data: { session: p ? { user: { id: p.userId }, access_token: p.token } : null }, error: null };
      },
    },
    rpc: async (...args) => {
      thuTu.push('rpc:' + args[0]);
      if (rpcFn) return rpcFn(...args);
      if (rpc.throw) throw rpc.throw;
      return rpc.result;
    },
    calls: auth.calls,
  };
  return client;
}

function cauHinhThat(client) {
  const dem = { layClient: 0 };
  return {
    dem,
    cauHinh: {
      useMockData: false,
      layAuth: () => client.auth,
      layClient: () => ((dem.layClient += 1), client),
    },
  };
}

function cauHinhMock() {
  return {
    useMockData: true,
    layAuth: () => {
      throw new Error('mock không được gọi Auth');
    },
    layClient: () => {
      throw new Error('mock không được gọi client');
    },
  };
}

test('CLIENT: chờ gửi lại 59.999s bị chặn, đúng 60s được phép; mã lỗi khác RATE_LIMIT', () => {
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const err = (() => {
    try {
      kiemTraTruocKhiGui(st, T0 + 59_999);
    } catch (e) {
      return e;
    }
  })();
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'CLIENT_CHO_GUI_LAI');
  assert.notEqual(err.loai, 'RATE_LIMIT');
  assert.match(err.message, /thiết bị này/);
  assert.doesNotThrow(() => kiemTraTruocKhiGui(st, giay(60)));
  assert.doesNotThrow(() => kiemTraTruocKhiGui(taoTrangThaiOtp(EMAIL), T0));
  assert.equal(capNhatSauLoi(st, err, T0 + 59_999).lichSuSai.length, 0);
});

test('CLIENT: lần gửi lại thứ 4 trong một giờ bị chặn, sau khi mốc cũ ra khỏi cửa sổ thì được phép', () => {
  let st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  for (const s of [60, 120, 180]) st = ghiNhanGui(st, giay(s), { laGuiLai: true });
  let err;
  try {
    kiemTraTruocKhiGui(st, giay(240));
  } catch (e) {
    err = e;
  }
  assert.equal(err?.loai, 'CLIENT_HET_LUOT_GUI_LAI');
  assert.notEqual(err.loai, 'RATE_LIMIT');
  assert.equal(capNhatSauLoi(st, err, giay(240)).lichSuSai.length, 0);
  assert.doesNotThrow(() => kiemTraTruocKhiGui(st, giay(60 + 3600)));
});

test('CLIENT: bị chặn thì không gọi Auth, không gọi layAuth và không đổi trạng thái', async () => {
  xoaBangChungMock();
  const client = clientGia();
  const { cauHinh } = cauHinhThat(client);
  let dem = 0;
  cauHinh.layAuth = () => ((dem += 1), client.auth);
  const st = ghiNhanGui(taoTrangThaiOtp(EMAIL), T0);
  const dong = JSON.stringify(st);
  const err = await guiMaOtpTheoCauHinh(cauHinh, EMAIL, { trangThai: st, nowMs: T0 + 59_999 }).catch((e) => e);
  assert.equal(err.loai, 'CLIENT_CHO_GUI_LAI');
  assert.deepEqual(client.thuTu, []);
  assert.equal(dem, 0);
  assert.equal(JSON.stringify(st), dong);
  // nhánh mock cũng bị chặn như nhau
  const errMock = await guiMaOtpTheoCauHinh(cauHinhMock(), EMAIL, { trangThai: st, nowMs: T0 + 59_999, userId: 'u1' }).catch((e) => e);
  assert.equal(errMock.loai, 'CLIENT_CHO_GUI_LAI');
});

test('CLIENT: khóa nhập 5 sai/15 phút chặn trước verifyOtp, mở lại đúng 900s sau lần sai đầu', async () => {
  xoaBangChungMock();
  let st = (await guiMaOtpTheoCauHinh(cauHinhMock(), EMAIL, { userId: 'u1', nowMs: T0 })).trangThai;
  for (const s of [1, 2, 3, 4, 5]) st = ghiNhanSai(st, giay(s));
  const client = clientGia();
  const { cauHinh } = cauHinhThat(client);
  const err = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, TOKEN, 'u1', { trangThai: st, nowMs: giay(10) }).catch((e) => e);
  assert.equal(err.loai, 'CLIENT_TAM_KHOA_NHAP');
  assert.notEqual(err.loai, 'RATE_LIMIT');
  assert.deepEqual(client.thuTu, []);
  assert.equal(capNhatSauLoi(st, err, giay(10)).lichSuSai.length, 5);
  assert.equal(JSON.stringify(err).includes(TOKEN), false);
  assert.throws(() => kiemTraTruocKhiXacMinh(st, giay(900) + 999), { loai: 'CLIENT_TAM_KHOA_NHAP' });
  assert.doesNotThrow(() => kiemTraTruocKhiXacMinh(st, giay(901)));
  const errMock = await xacMinhMaOtpTheoCauHinh(cauHinhMock(), EMAIL, '123456', 'u1', {
    trangThai: st,
    nowMs: giay(10),
    kho: new Map(),
  }).catch((e) => e);
  assert.equal(errMock.loai, 'CLIENT_TAM_KHOA_NHAP');
});

test('RATE_LIMIT từ Auth (429) vẫn là RATE_LIMIT, khác CLIENT_*', async () => {
  const client = clientGia({ gui: { throw: loiAuth({ status: 429, code: 'over_email_send_rate_limit' }) } });
  const err = await guiMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, { nowMs: T0 }).catch((e) => e);
  assert.equal(err.loai, 'RATE_LIMIT');
  assert.deepEqual(client.thuTu, ['signInWithOtp']);
});

// ---- guiMaOtpTheoCauHinh: chỉ ghi nhận sau khi gửi thành công ----

test('gửi lỗi không ghi nhận lần gửi; gửi thành công ghi nhận, lần gửi lại được tính', async () => {
  xoaBangChungMock();
  const st0 = taoTrangThaiOtp(EMAIL);
  const hong = clientGia({ gui: { throw: new TypeError('fetch failed') } });
  const err = await guiMaOtpTheoCauHinh(cauHinhThat(hong).cauHinh, EMAIL, { trangThai: st0, nowMs: T0 }).catch((e) => e);
  assert.equal(err.loai, 'MANG');
  assert.equal(st0.guiLuc, null);
  assert.equal(st0.lichSuGuiLai.length, 0);

  const tot = clientGia();
  const k1 = await guiMaOtpTheoCauHinh(cauHinhThat(tot).cauHinh, EMAIL, { trangThai: st0, nowMs: T0 });
  assert.equal(k1.nguon, 'THAT');
  assert.equal(k1.trangThai.guiLuc, T0);
  assert.deepEqual(k1.trangThai.lichSuGuiLai, []);
  const k2 = await guiMaOtpTheoCauHinh(cauHinhThat(tot).cauHinh, EMAIL, { trangThai: k1.trangThai, nowMs: giay(60) });
  assert.deepEqual(k2.trangThai.lichSuGuiLai, [giay(60)]);
  assert.equal(k2.trangThai.guiLuc, giay(60));
  const km = await guiMaOtpTheoCauHinh(cauHinhMock(), EMAIL, { userId: 'u1', nowMs: T0 });
  assert.equal(km.nguon, 'MO_PHONG');
  assert.equal(km.trangThai.guiLuc, T0);
  assert.deepEqual(layBienNhanGuiMock(EMAIL), {
    email: EMAIL,
    userId: 'u1',
    theHe: layTheHeBangChungMock(),
    guiLuc: T0,
  });
  assert.ok(!JSON.stringify(k2).includes(TOKEN));
});

// ---- xacMinhMaOtpTheoCauHinh: nhánh thật ----

const daGuiThat = () => ({ trangThai: ghiNhanGui(taoTrangThaiOtp(EMAIL), T0), nowMs: giay(10) });

test('thật: verifyOtp ok + RPC true + đúng phiên → đã xác minh, reset bộ đếm; thứ tự verifyOtp → getSession → rpc → getSession', async () => {
  const client = clientGia();
  const trang = ghiNhanSai(daGuiThat().trangThai, giay(5));
  const kq = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, '123456', 'u1', { trangThai: trang, nowMs: giay(10) });
  assert.equal(kq.daXacMinh, true);
  assert.equal(kq.nguon, 'THAT');
  assert.equal(kq.userId, 'u1');
  assert.equal(kq.trangThai.lichSuSai.length, 0);
  assert.equal(kq.trangThai.guiLuc, null);
  assert.deepEqual(client.thuTu, ['verifyOtp', 'getSession', 'rpc:da_xac_minh_otp', 'getSession']);
  assert.deepEqual(client.calls.verifyOtp, [{ email: EMAIL, token: '123456', type: 'email' }]);
  assert.ok(!JSON.stringify(kq).includes('123456'));
});

test('thật: verifyOtp ok nhưng RPC false → chưa xác minh', async () => {
  const client = clientGia({ rpc: { result: { data: false, error: null } } });
  const kq = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', daGuiThat());
  assert.equal(kq.daXacMinh, false);
  assert.equal(kq.nguon, 'THAT');
});

test('thật: verifyOtp ok + RPC true nhưng phiên của tài khoản khác hoặc không có phiên → chưa xác minh', async () => {
  for (const sessionUserId of ['u2', null]) {
    const client = clientGia({ sessionUserId });
    const kq = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', daGuiThat());
    assert.equal(kq.daXacMinh, false, String(sessionUserId));
  }
});

test('thật: verifyOtp ok + RPC lỗi → ném, không bao giờ xác minh, không tăng bộ đếm sai', async () => {
  const st = daGuiThat().trangThai;
  for (const [rpc, loai] of [
    [{ throw: new TypeError('fetch failed') }, 'MANG'],
    [{ result: { data: null, error: { message: 'x', status: 429 } } }, 'RATE_LIMIT'],
    [{ result: { data: 'true', error: null } }, 'KHONG_XAC_DINH'],
  ]) {
    const client = clientGia({ rpc });
    const err = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', { trangThai: st, nowMs: giay(10) }).catch((e) => e);
    assert.ok(err instanceof OtpServiceError, loai);
    assert.equal(err.loai, loai);
    assert.equal(capNhatSauLoi(st, err, giay(10)).lichSuSai.length, 0);
  }
  const client = clientGia({ sessionThrow: new TypeError('fetch failed') });
  const err = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', daGuiThat()).catch((e) => e);
  assert.equal(err.loai, 'MANG');
});

test('thật: mã sai ở verifyOtp là SAI_MA và không gọi RPC; không đọc kho mô phỏng', async () => {
  const client = clientGia({ xacMinh: { throw: loiSaiMa() } });
  const kho = new Map([['u1', taoBangChungMock('u1', giay(1))]]);
  const err = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', { ...daGuiThat(), kho }).catch((e) => e);
  assert.equal(err.loai, 'SAI_MA');
  assert.deepEqual(client.thuTu, ['verifyOtp']);
  assert.ok(!err.message.includes(TOKEN));
});

test('thật: lỗi thiếu cấu hình client → CAU_HINH, không rơi sang mock', async () => {
  const cauHinh = {
    useMockData: false,
    layAuth: () => {
      throw new Error('Thiếu VITE_SUPABASE_URL');
    },
    layClient: () => {
      throw new Error('Thiếu VITE_SUPABASE_URL');
    },
  };
  const kho = new Map();
  const err = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', { ...daGuiThat(), kho }).catch((e) => e);
  assert.equal(err.loai, 'CAU_HINH');
  assert.equal(kho.size, 0);
});

// ---- Mock: kho bằng chứng, 24 giờ, đăng xuất ----

test('mock: xác minh ghi bằng chứng gắn userId + thời điểm, reset bộ đếm; chưa gửi/hết 300s/sai mã không ghi', async () => {
  xoaBangChungMock();
  const kho = new Map();
  const cauHinh = cauHinhMock();
  const gui1 = await guiMaOtpTheoCauHinh(cauHinh, EMAIL, { userId: 'u1', nowMs: T0 });
  const kq = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', {
    trangThai: gui1.trangThai,
    nowMs: giay(10),
    kho,
  });
  assert.deepEqual([kq.daXacMinh, kq.nguon, kq.userId], [true, 'MO_PHONG', 'u1']);
  assert.equal(kq.trangThai.guiLuc, null);
  assert.deepEqual(kho.get('u1'), { userId: 'u1', xacMinhLuc: giay(10), nguon: 'MO_PHONG' });
  assert.equal(layBienNhanGuiMock(EMAIL), undefined);

  const kho2 = new Map();
  const chuaGui = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', { nowMs: T0, kho: kho2 }).catch((e) => e);
  assert.equal(chuaGui.loai, 'CHUA_GUI');
  assert.equal(chuaGui.lichSuSai, undefined);

  const gui2 = await guiMaOtpTheoCauHinh(cauHinh, EMAIL, { userId: 'u1', nowMs: T0 });
  const sai = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '654321', 'u1', {
    trangThai: gui2.trangThai,
    nowMs: giay(10),
    kho: kho2,
  }).catch((e) => e);
  assert.equal(sai.loai, 'SAI_MA');
  const hetHan = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', {
    trangThai: gui2.trangThai,
    nowMs: giay(300),
    kho: kho2,
  }).catch((e) => e);
  assert.equal(hetHan.loai, 'HET_HAN');
  assert.equal(kho2.size, 0);
  // 299.999s vẫn hợp lệ (biên nhận chưa bị tiêu thụ khi SAI_MA / HET_HAN)
  const ok299 = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', {
    trangThai: gui2.trangThai,
    nowMs: T0 + 299_999,
    kho: kho2,
  });
  assert.equal(ok299.daXacMinh, true);
  assert.ok(!JSON.stringify(kho).includes('123456'));
});

test('mock: kiểm tra bằng chứng 24 giờ trừ 1ms còn, đúng 24 giờ hết, tài khoản khác không có', async () => {
  xoaBangChungMock();
  const kho = new Map([['u1', taoBangChungMock('u1', T0)]]);
  const cauHinh = { useMockData: true };
  const ms24h = HIEU_LUC_XAC_MINH_GIAY * 1000;
  assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u1', { nowMs: T0 + ms24h - 1, kho }), {
    daXacMinh: true,
    nguon: 'MO_PHONG',
    hetHanLuc: T0 + ms24h,
    kiemTraLaiLuc: T0 + ms24h,
  });
  assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u1', { nowMs: T0 + ms24h, kho }), {
    daXacMinh: false,
    nguon: 'MO_PHONG',
    hetHanLuc: null,
    kiemTraLaiLuc: null,
  });
  assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u2', { nowMs: T0 + 1, kho }), {
    daXacMinh: false,
    nguon: 'MO_PHONG',
    hetHanLuc: null,
    kiemTraLaiLuc: null,
  });
});

test('thật: kiểm tra chỉ dựa RPC + phiên; không đọc kho mô phỏng; lỗi ném; phiên khác tài khoản → false', async () => {
  xoaBangChungMock();
  const kho = new Map([['u1', taoBangChungMock('u1', T0)]]);
  khoBangChungMock.set('u1', taoBangChungMock('u1', T0));
  try {
    const cua = (client) => cauHinhThat(client).cauHinh;
    const sai = clientGia({ rpc: { result: { data: false, error: null } } });
    assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cua(sai), 'u1', { nowMs: T0 + 1, kho }), {
      daXacMinh: false,
      nguon: 'THAT',
      hetHanLuc: null,
      kiemTraLaiLuc: T0 + 1 + KIEM_TRA_LAI_THAT_MS,
    });
    const dung = clientGia();
    assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cua(dung), 'u1', { nowMs: T0 + 1, kho }), {
      daXacMinh: true,
      nguon: 'THAT',
      hetHanLuc: null,
      kiemTraLaiLuc: T0 + 1 + KIEM_TRA_LAI_THAT_MS,
    });
    // Phiên Supabase đã là u2 (có bằng chứng) nhưng cổng đang giữ u1 → không mở cho u1.
    const khac = clientGia({ sessionUserId: 'u2' });
    assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cua(khac), 'u1', { nowMs: T0 + 1, kho }), {
      daXacMinh: false,
      nguon: 'THAT',
      hetHanLuc: null,
      kiemTraLaiLuc: T0 + 1 + KIEM_TRA_LAI_THAT_MS,
    });
    const khongPhien = clientGia({ sessionUserId: null });
    assert.deepEqual(await kiemTraDaXacMinhTheoCauHinh(cua(khongPhien), 'u1', { nowMs: T0 }), {
      daXacMinh: false,
      nguon: 'THAT',
      hetHanLuc: null,
      kiemTraLaiLuc: T0 + KIEM_TRA_LAI_THAT_MS,
    });
    for (const rpc of [{ throw: new TypeError('fetch failed') }, { result: { data: null, error: null } }]) {
      const err = await kiemTraDaXacMinhTheoCauHinh(cua(clientGia({ rpc })), 'u1', { kho }).catch((e) => e);
      assert.ok(err instanceof OtpServiceError);
    }
    // Thiếu cấu hình: CAU_HINH, không rơi sang mock dù kho có bằng chứng.
    const err = await kiemTraDaXacMinhTheoCauHinh({ useMockData: false }, 'u1', { kho }).catch((e) => e);
    assert.equal(err.loai, 'CAU_HINH');
  } finally {
    xoaBangChungMock();
  }
});

// ---- Race phiên (thật) và race thu hồi (mock) ----

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
const tick = () => new Promise((r) => setImmediate(r));
const phienA = { userId: 'u1', token: 'tok-A1' };
const phienB = { userId: 'u2', token: 'tok-B1' };

test('thật: RPC đang chờ cho A, phiên chuyển sang B → không bao giờ true (PHIEN_THAY_DOI), không lộ token', async () => {
  const d = deferred();
  const client = clientGia({ phien: [phienA, phienB], rpcFn: () => d.promise });
  const cauHinh = cauHinhThat(client).cauHinh;
  // Kiểm tra cho B khi phiên trước đó là A và RPC trả true của A.
  const choA = kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u1', {}).catch((e) => e);
  await tick();
  assert.deepEqual(client.thuTu, ['getSession', 'rpc:da_xac_minh_otp']);
  d.resolve({ data: true, error: null });
  const err = await choA;
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'PHIEN_THAY_DOI');
  assert.ok(!err.message.includes('tok-'));
  // Yêu cầu cho B trong khi phiên trước RPC vẫn là A → false, không gọi RPC.
  const c2 = clientGia({ phien: [phienA] });
  const kq = await kiemTraDaXacMinhTheoCauHinh(cauHinhThat(c2).cauHinh, 'u2', {});
  assert.equal(kq.daXacMinh, false);
  assert.ok(!c2.thuTu.some((x) => x.startsWith('rpc')));
});

test('thật: đăng xuất rồi đăng nhập lại cùng tài khoản (token mới) giữa lúc RPC → không true', async () => {
  const d = deferred();
  const client = clientGia({ phien: [phienA, { userId: 'u1', token: 'tok-A2' }], rpcFn: () => d.promise });
  const p = kiemTraDaXacMinhTheoCauHinh(cauHinhThat(client).cauHinh, 'u1', {}).catch((e) => e);
  await tick();
  d.resolve({ data: true, error: null });
  const err = await p;
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'PHIEN_THAY_DOI');
  // Phiên mất giữa chừng (đăng xuất) cũng không true.
  const c2 = clientGia({ phien: [phienA, null] });
  const err2 = await kiemTraDaXacMinhTheoCauHinh(cauHinhThat(c2).cauHinh, 'u1', {}).catch((e) => e);
  assert.equal(err2.loai, 'PHIEN_THAY_DOI');
});

test('thật: xác minh thành công với phiên ổn định (sau verifyOtp) → true', async () => {
  const client = clientGia({ phien: [phienA] });
  const kq = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', daGuiThat());
  assert.equal(kq.daXacMinh, true);
  assert.equal(kq.nguon, 'THAT');
  assert.ok(!JSON.stringify(kq).includes('tok-'));
  const kq2 = await kiemTraDaXacMinhTheoCauHinh(cauHinhThat(clientGia({ phien: [phienA] })).cauHinh, 'u1', {
    nowMs: T0,
  });
  assert.deepEqual(kq2, { daXacMinh: true, nguon: 'THAT', hetHanLuc: null, kiemTraLaiLuc: T0 + KIEM_TRA_LAI_THAT_MS });
});

test('thật: phiên đổi sau verifyOtp (refresh token) → PHIEN_THAY_DOI, không true, không tăng số lần sai', async () => {
  const st = daGuiThat().trangThai;
  const client = clientGia({ phien: [phienA, { userId: 'u1', token: 'tok-A2' }] });
  const err = await xacMinhMaOtpTheoCauHinh(cauHinhThat(client).cauHinh, EMAIL, TOKEN, 'u1', { trangThai: st, nowMs: giay(10) }).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'PHIEN_THAY_DOI');
  assert.equal(capNhatSauLoi(st, err, giay(10)).lichSuSai.length, 0);
  assert.ok(thongBaoLoiOtp('PHIEN_THAY_DOI').length > 0);
});

test('mock: xoaBangChungMock giữa lúc xác minh đang chờ → không ghi lại bằng chứng, PHIEN_THAY_DOI', async () => {
  xoaBangChungMock();
  const kho = new Map();
  const cauHinh = cauHinhMock();
  const gui1 = await guiMaOtpTheoCauHinh(cauHinh, EMAIL, { userId: 'u1', nowMs: T0 });
  const truoc = layTheHeBangChungMock();
  const p = xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', {
    trangThai: gui1.trangThai,
    nowMs: giay(10),
    kho,
  }).catch((e) => e);
  xoaBangChungMock(undefined, kho);
  const err = await p;
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'PHIEN_THAY_DOI');
  assert.equal(kho.size, 0);
  assert.equal((await kiemTraDaXacMinhTheoCauHinh({ useMockData: true }, 'u1', { nowMs: giay(10), kho })).daXacMinh, false);
  assert.ok(layTheHeBangChungMock() > truoc);
  // Xóa theo userId cũng tăng thế hệ.
  const g = layTheHeBangChungMock();
  xoaBangChungMock('u1', kho);
  assert.equal(layTheHeBangChungMock(), g + 1);
  // Không có xóa giữa chừng thì vẫn ghi bình thường.
  const gui2 = await guiMaOtpTheoCauHinh(cauHinh, EMAIL, { userId: 'u1', nowMs: T0 });
  const ok = await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', {
    trangThai: gui2.trangThai,
    nowMs: giay(10),
    kho,
  });
  assert.equal(ok.daXacMinh, true);
  assert.equal(kho.get('u1').nguon, 'MO_PHONG');
});

test('mock: đăng xuất xóa bằng chứng; đăng nhập lại cùng tài khoản phải xác minh OTP lại', async () => {
  xoaBangChungMock();
  const cauHinh = cauHinhMock();
  const gui1 = await guiMaOtpTheoCauHinh(cauHinh, EMAIL, { userId: 'u1', nowMs: T0 });
  const gui2 = await guiMaOtpTheoCauHinh(cauHinh, 'b@example.com', { userId: 'u2', nowMs: T0 });
  await xacMinhMaOtpTheoCauHinh(cauHinh, EMAIL, '123456', 'u1', { trangThai: gui1.trangThai, nowMs: giay(10) });
  await xacMinhMaOtpTheoCauHinh(cauHinh, 'b@example.com', '123456', 'u2', { trangThai: gui2.trangThai, nowMs: giay(10) });
  assert.ok(khoBangChungMock.has('u1'));
  assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u1', { nowMs: giay(20) })).daXacMinh, true);
  xoaBangChungMock('u1');
  assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u1', { nowMs: giay(20) })).daXacMinh, false);
  assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u2', { nowMs: giay(20) })).daXacMinh, true);
  xoaBangChungMock();
  assert.equal(khoBangChungMock.size, 0);
  assert.equal(khoGuiMock.size, 0);
  assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'u2', { nowMs: giay(20) })).daXacMinh, false);
});

// ---- Regression R1, R1b, R2, R3, R4: ràng buộc biên nhận gửi mock theo email, tài khoản và thế hệ ----

test('R1 (core): gửi cho A/user-a, đổi tài khoản (xoaBangChungMock), xác minh B/user-b bằng trạng thái A → CHUA_GUI', async () => {
  xoaBangChungMock();
  const kho = new Map();
  const cauHinh = cauHinhMock();
  const guiA = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });
  xoaBangChungMock();
  const err = await xacMinhMaOtpTheoCauHinh(cauHinh, 'b@example.com', '123456', 'user-b', {
    trangThai: guiA.trangThai,
    nowMs: giay(10),
    kho,
  }).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'CHUA_GUI');
  assert.ok(!err.message.includes('123456'));
  assert.equal(capNhatSauLoi(guiA.trangThai, err, giay(10)).lichSuSai.length, 0);
  assert.equal(kho.has('user-b'), false);
  assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'user-b', { nowMs: giay(10), kho })).daXacMinh, false);
});

test('R1b (core): không thu hồi, dùng trạng thái A cho email B/user-b hoặc biên nhận A cho user-b → CHUA_GUI', async () => {
  xoaBangChungMock();
  const kho = new Map();
  const cauHinh = cauHinhMock();
  const guiA = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });

  // Nhánh 1: trạng thái của A nhưng email B và user-b
  const errEmailKhac = await xacMinhMaOtpTheoCauHinh(cauHinh, 'b@example.com', '123456', 'user-b', {
    trangThai: guiA.trangThai,
    nowMs: giay(10),
    kho,
  }).catch((e) => e);
  assert.equal(errEmailKhac.loai, 'CHUA_GUI');
  assert.ok(!errEmailKhac.message.includes('123456'));
  assert.equal(capNhatSauLoi(guiA.trangThai, errEmailKhac, giay(10)).lichSuSai.length, 0);
  assert.equal(kho.has('user-b'), false);

  // xacMinhOtpTheoCauHinh ở nhánh mock cũng từ chối khi trangThai.email khác email xác minh
  const errOtpKhac = await xacMinhOtpTheoCauHinh(cauHinh, 'b@example.com', '123456', {
    trangThai: guiA.trangThai,
    nowMs: giay(10),
  }).catch((e) => e);
  assert.equal(errOtpKhac.loai, 'CHUA_GUI');

  // Nhánh 2: đúng email + trạng thái + biên nhận của A nhưng expectedUserId là user-b
  const errUserKhac = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-b', {
    trangThai: guiA.trangThai,
    nowMs: giay(10),
    kho,
  }).catch((e) => e);
  assert.equal(errUserKhac.loai, 'CHUA_GUI');
  assert.ok(!errUserKhac.message.includes('123456'));
  assert.equal(capNhatSauLoi(guiA.trangThai, errUserKhac, giay(10)).lichSuSai.length, 0);
  assert.equal(kho.size, 0);
  assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'user-b', { nowMs: giay(10), kho })).daXacMinh, false);
});

test('R2 (core): gửi cho A, đăng xuất (xoaBangChungMock), đăng nhập lại không gửi mới và dùng trạng thái cũ → CHUA_GUI; gửi mới rồi thành công', async () => {
  xoaBangChungMock();
  const kho = new Map();
  const cauHinh = cauHinhMock();
  const gui1 = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });
  xoaBangChungMock();

  const err = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
    trangThai: gui1.trangThai,
    nowMs: giay(10),
    kho,
  }).catch((e) => e);
  assert.equal(err.loai, 'CHUA_GUI');
  assert.ok(!err.message.includes('123456'));
  assert.equal(capNhatSauLoi(gui1.trangThai, err, giay(10)).lichSuSai.length, 0);
  assert.equal(kho.size, 0);

  // Gửi mới sau 60s → ghi biên nhận mới theo thế hệ mới và xác minh thành công
  const gui2 = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', {
    trangThai: gui1.trangThai,
    userId: 'user-a',
    nowMs: giay(60),
  });
  const ok = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
    trangThai: gui2.trangThai,
    nowMs: giay(65),
    kho,
  });
  assert.equal(ok.daXacMinh, true);
  assert.equal(kho.has('user-a'), true);
});

test('R3 (core): biên nhận gửi mock chỉ dùng một lần; xác minh lại bằng trạng thái cũ → CHUA_GUI', async () => {
  xoaBangChungMock();
  const kho = new Map();
  const cauHinh = cauHinhMock();
  const gui1 = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 });
  const ok = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
    trangThai: gui1.trangThai,
    nowMs: giay(10),
    kho,
  });
  assert.equal(ok.daXacMinh, true);
  assert.equal(layBienNhanGuiMock('a@example.com'), undefined);

  const err2 = await xacMinhMaOtpTheoCauHinh(cauHinh, 'a@example.com', '123456', 'user-a', {
    trangThai: gui1.trangThai,
    nowMs: giay(20),
    kho,
  }).catch((e) => e);
  assert.equal(err2.loai, 'CHUA_GUI');
  assert.ok(!err2.message.includes('123456'));
  assert.equal(capNhatSauLoi(gui1.trangThai, err2, giay(20)).lichSuSai.length, 0);
});

test('R4 (core): thế hệ phiên đổi khi đang gửi mock → PHIEN_THAY_DOI, không ghi biên nhận; thiếu userId → KHONG_XAC_DINH', async () => {
  xoaBangChungMock();
  const cauHinh = cauHinhMock();
  const p = guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { userId: 'user-a', nowMs: T0 }).catch((e) => e);
  xoaBangChungMock();
  const err = await p;
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'PHIEN_THAY_DOI');
  assert.ok(!err.message.includes('123456'));
  assert.equal(layBienNhanGuiMock('a@example.com'), undefined);
  assert.equal(khoGuiMock.size, 0);

  const errNoUser = await guiMaOtpTheoCauHinh(cauHinh, 'a@example.com', { nowMs: T0 }).catch((e) => e);
  assert.equal(errNoUser.loai, 'KHONG_XAC_DINH');
  assert.equal(khoGuiMock.size, 0);
});

test('kiểm tra lại sau xác minh mock và thật: hetHanLuc ở mock, null ở thật', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const mockCfg = cauHinhMock();
    const ms24h = HIEU_LUC_XAC_MINH_GIAY * 1000;
    const gui = await guiMaOtpTheoCauHinh(mockCfg, EMAIL, { userId: 'u1', nowMs: T0 });
    await xacMinhMaOtpTheoCauHinh(mockCfg, EMAIL, '123456', 'u1', {
      trangThai: gui.trangThai,
      nowMs: giay(10),
      kho,
    });

    const truoc24h = await kiemTraDaXacMinhTheoCauHinh(mockCfg, 'u1', {
      nowMs: giay(10) + ms24h - 1,
      kho,
    });
    assert.deepEqual(truoc24h, {
      daXacMinh: true,
      nguon: 'MO_PHONG',
      hetHanLuc: giay(10) + ms24h,
      kiemTraLaiLuc: giay(10) + ms24h,
    });

    const dung24h = await kiemTraDaXacMinhTheoCauHinh(mockCfg, 'u1', {
      nowMs: giay(10) + ms24h,
      kho,
    });
    assert.deepEqual(dung24h, {
      daXacMinh: false,
      nguon: 'MO_PHONG',
      hetHanLuc: null,
      kiemTraLaiLuc: null,
    });

    // Nhánh thật không bao giờ trả bằng chứng mock (kể cả khi kho có bằng chứng); token không phải JWT → hetHanLuc null.
    const realClient = clientGia({ rpc: { result: { data: true, error: null } } });
    const kqThat = await kiemTraDaXacMinhTheoCauHinh(cauHinhThat(realClient).cauHinh, 'u1', {
      nowMs: giay(20),
      kho,
    });
    assert.deepEqual(kqThat, {
      daXacMinh: true,
      nguon: 'THAT',
      hetHanLuc: null,
      kiemTraLaiLuc: giay(20) + KIEM_TRA_LAI_THAT_MS,
    });
    assert.notEqual(kqThat.nguon, 'MO_PHONG');
  } finally {
    xoaBangChungMock();
  }
});

test('xacMinhMaOtpTheoCauHinh: MANG, CAU_HINH và RATE_LIMIT không tăng lichSuSai; gửi lỗi không ghi guiLuc', async () => {
  xoaBangChungMock();
  try {
    let st = (await guiMaOtpTheoCauHinh(cauHinhThat(clientGia()).cauHinh, EMAIL, { nowMs: T0 })).trangThai;
    assert.equal(st.guiLuc, T0);

    // Gửi lỗi (MANG, CAU_HINH, RATE_LIMIT) không ghi guiLuc
    const stChuaGui = taoTrangThaiOtp(EMAIL);
    for (const errCfg of [
      cauHinhThat(clientGia({ gui: { throw: new TypeError('fetch failed') } })).cauHinh,
      {
        useMockData: false,
        layAuth: () => {
          throw new Error('Thiếu VITE_SUPABASE_URL');
        },
      },
      cauHinhThat(clientGia({ gui: { result: { data: {}, error: loiAuth({ status: 429, code: 'over_email_send_rate_limit' }) } } })).cauHinh,
    ]) {
      await assert.rejects(() => guiMaOtpTheoCauHinh(errCfg, EMAIL, { trangThai: stChuaGui, nowMs: T0 }));
      assert.equal(stChuaGui.guiLuc, null);
    }

    // Xác minh lỗi MANG, CAU_HINH, RATE_LIMIT không tăng lichSuSai
    for (const [cfg, loai] of [
      [cauHinhThat(clientGia({ xacMinh: { throw: new TypeError('fetch failed') } })).cauHinh, 'MANG'],
      [
        {
          useMockData: false,
          layAuth: () => {
            throw new Error('Thiếu VITE_SUPABASE_URL');
          },
        },
        'CAU_HINH',
      ],
      [
        cauHinhThat(clientGia({ xacMinh: { throw: loiAuth({ status: 429, code: 'over_request_rate_limit' }) } })).cauHinh,
        'RATE_LIMIT',
      ],
    ]) {
      const err = await xacMinhMaOtpTheoCauHinh(cfg, EMAIL, TOKEN, 'u1', {
        trangThai: st,
        nowMs: giay(10),
      }).catch((e) => e);
      assert.equal(err.loai, loai);
      st = capNhatSauLoi(st, err, giay(10));
      assert.equal(st.lichSuSai.length, 0, loai);
    }
  } finally {
    xoaBangChungMock();
  }
});

test('biên 60s/300s qua guiMaOtpTheoCauHinh và xacMinhMaOtpTheoCauHinh; mock 123456 chưa gửi → CHUA_GUI, đúng 300s → HET_HAN', async () => {
  xoaBangChungMock();
  try {
    const kho = new Map();
    const mockCfg = cauHinhMock();

    // Chưa gửi: 123456 → CHUA_GUI
    const errChuaGui = await xacMinhMaOtpTheoCauHinh(mockCfg, EMAIL, '123456', 'u1', {
      nowMs: T0,
      kho,
    }).catch((e) => e);
    assert.equal(errChuaGui.loai, 'CHUA_GUI');

    const gui1 = await guiMaOtpTheoCauHinh(mockCfg, EMAIL, { userId: 'u1', nowMs: T0 });
    // Chưa đủ 60s → CLIENT_CHO_GUI_LAI; đúng 60s → được phép
    const errSom = await guiMaOtpTheoCauHinh(mockCfg, EMAIL, {
      trangThai: gui1.trangThai,
      userId: 'u1',
      nowMs: T0 + 59_999,
    }).catch((e) => e);
    assert.equal(errSom.loai, 'CLIENT_CHO_GUI_LAI');

    const gui2 = await guiMaOtpTheoCauHinh(mockCfg, EMAIL, {
      trangThai: gui1.trangThai,
      userId: 'u1',
      nowMs: giay(60),
    });
    assert.equal(gui2.trangThai.guiLuc, giay(60));

    // Đúng 300s → HET_HAN, 299.999s → thành công
    const err300 = await xacMinhMaOtpTheoCauHinh(mockCfg, EMAIL, '123456', 'u1', {
      trangThai: gui2.trangThai,
      nowMs: giay(60 + 300),
      kho,
    }).catch((e) => e);
    assert.equal(err300.loai, 'HET_HAN');

    const ok299 = await xacMinhMaOtpTheoCauHinh(mockCfg, EMAIL, '123456', 'u1', {
      trangThai: gui2.trangThai,
      nowMs: giay(60) + 299_999,
      kho,
    });
    assert.equal(ok299.daXacMinh, true);
    assert.equal(ok299.nguon, 'MO_PHONG');
  } finally {
    xoaBangChungMock();
  }
});

// ---- T2: định danh mock không va chạm, whitelist loại lỗi, mốc hết hạn thật, callback thu hồi ----

test('định danh mock: a.b@ và ab@ khác nhau; chuẩn hóa trim/hoa-thường; không dạng legacy buyer-<slug>', async () => {
  const idDot = taoDinhDanhMockNguoiMua('a.b@example.com');
  const idNoDot = taoDinhDanhMockNguoiMua('ab@example.com');
  assert.notEqual(idDot, idNoDot);
  assert.equal(taoDinhDanhMockNguoiMua('  A.B@Example.com '), idDot);
  assert.ok(idDot.startsWith('buyer-v2:'));
  // Định danh legacy (đọc từ phiên cũ) không bao giờ trùng định danh mới, nên luôn bị suy lại từ email.
  assert.notEqual(idDot, 'buyer-abexample com');
  assert.notEqual(idNoDot, 'buyer-abexamplecom');

  // Bằng chứng của người này không mở cho người kia.
  xoaBangChungMock();
  try {
    const kho = new Map([[idDot, taoBangChungMock(idDot, T0)]]);
    const cauHinh = { useMockData: true };
    assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, idDot, { nowMs: T0 + 1, kho })).daXacMinh, true);
    assert.equal((await kiemTraDaXacMinhTheoCauHinh(cauHinh, idNoDot, { nowMs: T0 + 1, kho })).daXacMinh, false);
    // Định danh legacy không có bằng chứng.
    assert.equal(
      (await kiemTraDaXacMinhTheoCauHinh(cauHinh, 'buyer-abexamplecom', { nowMs: T0 + 1, kho })).daXacMinh,
      false,
    );
  } finally {
    xoaBangChungMock();
  }
});

test('whitelist loại lỗi: giá trị lạ (kể cả 123456) → KHONG_XAC_DINH; các loại hợp lệ giữ nguyên', () => {
  assert.ok(Object.isFrozen(LOAI_LOI_OTP));
  for (const loai of LOAI_LOI_OTP) assert.equal(chuanHoaLoaiLoiOtp(loai), loai);
  for (const x of ['123456', TOKEN, 'sai_ma', '', null, undefined, 123456, {}, ['SAI_MA']]) {
    assert.equal(chuanHoaLoaiLoiOtp(x), 'KHONG_XAC_DINH', String(x));
  }
  // Không có loại nào trong danh sách trông giống mã OTP.
  assert.ok(LOAI_LOI_OTP.every((l) => /^[A-Z_]+$/.test(l)));
  assert.equal(new Set(LOAI_LOI_OTP).size, LOAI_LOI_OTP.length);
  // thongBaoLoiOtp chuẩn hóa đầu vào: không nhúng giá trị lạ và trùng thông báo chung.
  const chung = thongBaoLoiOtp('KHONG_XAC_DINH');
  assert.equal(thongBaoLoiOtp('123456'), chung);
  assert.equal(thongBaoLoiOtp(TOKEN), chung);
  assert.ok(!thongBaoLoiOtp('123456').includes('123456'));
  assert.notEqual(thongBaoLoiOtp('SAI_MA'), chung);
});

const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const taoJwt = (payload) => `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.chu-ky-gia`;
const MS_24H = HIEU_LUC_XAC_MINH_GIAY * 1000;

test('hetHanTuAccessToken: lấy mốc otp lớn nhất trong amr × 1000 + 24 giờ; hỏng thì null, không ném lỗi', () => {
  const ts = 1_800_000_000;
  const jwt = taoJwt({
    amr: [
      { method: 'password', timestamp: ts + 5000 },
      { method: 'otp', timestamp: ts - 100 },
      { method: 'otp', timestamp: ts },
      { method: 'otp', timestamp: ts - 5 },
    ],
  });
  assert.equal(hetHanTuAccessToken(jwt), ts * 1000 + MS_24H);
  // Không có mốc otp hoặc amr sai kiểu → null.
  assert.equal(hetHanTuAccessToken(taoJwt({ amr: [{ method: 'password', timestamp: ts }] })), null);
  assert.equal(hetHanTuAccessToken(taoJwt({ amr: 'otp' })), null);
  assert.equal(hetHanTuAccessToken(taoJwt({ amr: [{ method: 'otp', timestamp: '1800000000' }] })), null);
  assert.equal(hetHanTuAccessToken(taoJwt({ amr: [{ method: 'otp', timestamp: NaN }] })), null);
  assert.equal(hetHanTuAccessToken(taoJwt({})), null);
  for (const hong of ['', 'abc', 'a.b.c', 'a..c', 'a.!!!.c', `x.${Buffer.from('không phải json').toString('base64url')}.y`, null, undefined, 42, {}]) {
    assert.equal(hetHanTuAccessToken(hong), null, String(hong));
  }
});

test('thật: hetHanLuc từ amr chỉ khi RPC true; kiemTraLaiLuc = now + 5 phút; kết quả không chứa token; biên 24 giờ', async () => {
  const ts = 1_800_000_000;
  const jwt = taoJwt({ amr: [{ method: 'otp', timestamp: ts }] });
  const phien = { userId: 'u1', token: jwt };
  const now = ts * 1000 + 1000;

  const dung = await kiemTraDaXacMinhTheoCauHinh(cauHinhThat(clientGia({ phien: [phien] })).cauHinh, 'u1', { nowMs: now });
  assert.deepEqual(dung, {
    daXacMinh: true,
    nguon: 'THAT',
    hetHanLuc: ts * 1000 + MS_24H,
    kiemTraLaiLuc: now + KIEM_TRA_LAI_THAT_MS,
  });
  assert.ok(!JSON.stringify(dung).includes(jwt));
  assert.ok(!JSON.stringify(dung).includes('chu-ky-gia'));

  // RPC false → không có hetHanLuc dù token có amr otp.
  const sai = await kiemTraDaXacMinhTheoCauHinh(
    cauHinhThat(clientGia({ phien: [phien], rpc: { result: { data: false, error: null } } })).cauHinh,
    'u1',
    { nowMs: now },
  );
  assert.equal(sai.daXacMinh, false);
  assert.equal(sai.hetHanLuc, null);
  assert.equal(sai.kiemTraLaiLuc, now + KIEM_TRA_LAI_THAT_MS);

  // Token hỏng → hetHanLuc null nhưng vẫn có mốc kiểm tra lại (nhánh thật luôn có lịch).
  const hong = await kiemTraDaXacMinhTheoCauHinh(
    cauHinhThat(clientGia({ phien: [{ userId: 'u1', token: 'khong-phai-jwt' }] })).cauHinh,
    'u1',
    { nowMs: now },
  );
  assert.equal(hong.daXacMinh, true);
  assert.equal(hong.hetHanLuc, null);
  assert.equal(hong.kiemTraLaiLuc, now + KIEM_TRA_LAI_THAT_MS);

  // Mốc hết hạn chỉ là gợi ý: quá 24 giờ mà RPC vẫn true thì kết quả vẫn do RPC quyết định (không suy ra từ mốc).
  const quaHan = await kiemTraDaXacMinhTheoCauHinh(cauHinhThat(clientGia({ phien: [phien] })).cauHinh, 'u1', {
    nowMs: ts * 1000 + MS_24H + 1,
  });
  assert.equal(quaHan.daXacMinh, true);
  assert.equal(quaHan.hetHanLuc, ts * 1000 + MS_24H);

  // Lỗi RPC vẫn ném, không bao giờ là true.
  const err = await kiemTraDaXacMinhTheoCauHinh(
    cauHinhThat(clientGia({ phien: [phien], rpc: { throw: new TypeError('fetch failed') } })).cauHinh,
    'u1',
    { nowMs: now },
  ).catch((e) => e);
  assert.ok(err instanceof OtpServiceError);
  assert.equal(err.loai, 'MANG');
});

test('dangKyThuHoiBangChungMock: gọi sau khi tăng thế hệ ở mỗi xoaBangChungMock; hủy đăng ký; callback lỗi bị nuốt', () => {
  const thuTu = [];
  const the = [];
  const huy1 = dangKyThuHoiBangChungMock(() => {
    thuTu.push('cb1');
    the.push(layTheHeBangChungMock());
  });
  const huy2 = dangKyThuHoiBangChungMock(() => {
    thuTu.push('cb2-loi');
    throw new Error('lỗi callback');
  });
  const huy3 = dangKyThuHoiBangChungMock(() => thuTu.push('cb3'));
  try {
    const g0 = layTheHeBangChungMock();
    assert.doesNotThrow(() => xoaBangChungMock());
    assert.deepEqual(thuTu, ['cb1', 'cb2-loi', 'cb3']);
    assert.deepEqual(the, [g0 + 1]);
    // Xóa theo userId cũng gọi callback (kể cả kho tùy chọn).
    xoaBangChungMock('u1', new Map(), new Map());
    assert.equal(thuTu.filter((x) => x === 'cb1').length, 2);
    // Hủy đăng ký: không còn được gọi.
    huy1();
    huy1();
    xoaBangChungMock();
    assert.equal(thuTu.filter((x) => x === 'cb1').length, 2);
    assert.equal(thuTu.filter((x) => x === 'cb3').length, 3);
  } finally {
    huy1();
    huy2();
    huy3();
    xoaBangChungMock();
  }
});

test('dangKyThuHoiBangChungMock: cùng một hàm đăng ký hai lần là hai mục độc lập', () => {
  let dem = 0;
  const cb = () => {
    dem += 1;
  };
  const huyA = dangKyThuHoiBangChungMock(cb);
  const huyB = dangKyThuHoiBangChungMock(cb);
  try {
    xoaBangChungMock();
    assert.equal(dem, 2);
    huyA();
    xoaBangChungMock();
    assert.equal(dem, 3);
  } finally {
    huyA();
    huyB();
  }
});
