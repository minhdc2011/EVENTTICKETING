import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_CAN_DANG_NHAP,
  EVENT_DA_DANG_NHAP,
  LoginRequiredError,
  docYDinhGiuCho,
  laLoiCanDangNhap,
  phatDaDangNhap,
  phatYeuCauDangNhap,
  taoYDinhGiuCho,
} from '../src/domain/loginRequired.js';

test('laLoiCanDangNhap nhận lỗi dịch vụ và lỗi máy chủ chưa đăng nhập, không nhầm lỗi khác', () => {
  assert.equal(laLoiCanDangNhap(new LoginRequiredError()), true);
  assert.equal(laLoiCanDangNhap({status: 401, message: 'x'}), true);
  assert.equal(laLoiCanDangNhap({code: '42501', message: 'permission denied for function tao_giu_cho_theo_suat'}), true);
  assert.equal(laLoiCanDangNhap({code: '28000', message: 'Can dang nhap de giu cho'}), true);
  assert.equal(laLoiCanDangNhap({code: '42501', message: 'Can xac minh OTP de giu cho'}), false);
  assert.equal(laLoiCanDangNhap({code: '22023', message: 'VUOT_GIOI_HAN_VE'}), false);
  assert.equal(laLoiCanDangNhap(null), false);
});

test('phát sự kiện yêu cầu đăng nhập và đã đăng nhập tới đúng đích, an toàn khi không có window', () => {
  const got = [];
  const target = {dispatchEvent: (e) => { got.push(e.type); return true; }};
  assert.equal(phatYeuCauDangNhap(target), true);
  assert.equal(phatDaDangNhap(target), true);
  assert.deepEqual(got, [EVENT_CAN_DANG_NHAP, EVENT_DA_DANG_NHAP]);
  assert.equal(phatYeuCauDangNhap({}), false);
});

test('ý định giữ chỗ: khứ hồi hợp lệ, đúng phạm vi, hết hạn sau 30 phút', () => {
  const now = 1_000_000;
  const raw = taoYDinhGiuCho({scopeKey: '1_10', seatCodes: ['A-1', 'A-2'], standing: {STAND: 2, BAD: 0}, now});
  assert.deepEqual(docYDinhGiuCho(raw, '1_10', now + 1000), {seatCodes: ['A-1', 'A-2'], standing: {STAND: 2}});
  assert.equal(docYDinhGiuCho(raw, '1_11', now + 1000), null, 'sai suất diễn');
  assert.equal(docYDinhGiuCho(raw, '1_10', now + 30 * 60 * 1000 + 1), null, 'quá 30 phút');
  assert.equal(docYDinhGiuCho(raw, '1_10', now - 1), null, 'thời gian âm');
});

test('ý định giữ chỗ: dữ liệu hỏng hoặc rỗng bị bỏ qua', () => {
  assert.equal(docYDinhGiuCho('không phải json', '1_10'), null);
  assert.equal(docYDinhGiuCho(null, '1_10'), null);
  assert.equal(docYDinhGiuCho(taoYDinhGiuCho({scopeKey: '1_10', seatCodes: [], standing: {}}), '1_10'), null);
  assert.equal(docYDinhGiuCho(JSON.stringify({scopeKey: '1_10', seatCodes: [1, 2], standing: {}, at: Date.now()}), '1_10'), null);
  assert.equal(docYDinhGiuCho(JSON.stringify({scopeKey: '1_10', seatCodes: Array.from({length: 99}, (_, i) => `S${i}`), standing: {}, at: Date.now()}), '1_10'), null);
});
