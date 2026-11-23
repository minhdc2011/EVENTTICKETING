import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THONG_BAO_DANG_XUAT_TRA_CHO,
  THONG_BAO_DOI_TAI_KHOAN_TRA_CHO,
  taoBoTheoDoiPhienGiuCho,
} from '../src/domain/holdSessionGuard.js';

test('lần phát đầu tiên và đăng nhập từ khách ẩn danh không làm gì', () => {
  const theoDoi = taoBoTheoDoiPhienGiuCho();
  assert.equal(theoDoi({userId: 'a'}, true), null, 'lần đầu: chỉ ghi nhớ tài khoản');
  const khac = taoBoTheoDoiPhienGiuCho();
  assert.equal(khac(null, false), null);
  assert.equal(khac({userId: 'a'}, true), null, 'ẩn danh -> đăng nhập: không trả chỗ');
});

test('đăng xuất khi đang giữ chỗ: yêu cầu trả chỗ', () => {
  const theoDoi = taoBoTheoDoiPhienGiuCho();
  theoDoi({userId: 'a'}, false);
  const r = theoDoi(null, true);
  assert.deepEqual(r, {lyDo: 'DANG_XUAT', thongBao: THONG_BAO_DANG_XUAT_TRA_CHO});
});

test('đổi sang tài khoản khác khi đang giữ chỗ: yêu cầu trả chỗ', () => {
  const theoDoi = taoBoTheoDoiPhienGiuCho();
  theoDoi({userId: 'a'}, true);
  assert.deepEqual(theoDoi({userId: 'b'}, true), {lyDo: 'DOI_TAI_KHOAN', thongBao: THONG_BAO_DOI_TAI_KHOAN_TRA_CHO});
});

test('làm mới token cùng tài khoản hoặc đăng xuất khi không giữ chỗ: không làm gì', () => {
  const theoDoi = taoBoTheoDoiPhienGiuCho();
  theoDoi({userId: 'a'}, true);
  assert.equal(theoDoi({userId: 'a'}, true), null, 'cùng tài khoản');
  assert.equal(theoDoi(null, false), null, 'đăng xuất nhưng không giữ chỗ');
});

test('sau khi đăng xuất rồi đăng nhập lại, lần đăng xuất tiếp theo vẫn được xử lý', () => {
  const theoDoi = taoBoTheoDoiPhienGiuCho();
  theoDoi({userId: 'a'}, true);
  assert.ok(theoDoi(null, true));
  assert.equal(theoDoi({userId: 'a'}, false), null, 'đăng nhập lại');
  assert.ok(theoDoi(null, true), 'đăng xuất lần nữa khi lại giữ chỗ');
});
