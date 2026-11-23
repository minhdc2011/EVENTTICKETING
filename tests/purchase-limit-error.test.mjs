import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HTTP_STATUS,
  MA_VUOT_GIOI_HAN,
  PG_CODE,
  PurchaseLimitError,
  chuanHoaLoiGiuCho,
  docChiTietGioiHan,
  laLoiChuaDangNhap,
  laLoiVuotGioiHan,
  taoLoiVuotGioiHan,
  THONG_BAO_CAN_DANG_NHAP,
} from '../src/domain/purchaseLimitError.js';

const hopLe = {gioiHan: 4, dangGiu: 3, conLai: 1};
const loiRpc = (details) => ({code: '22023', message: 'VUOT_GIOI_HAN_VE', details, hint: 'Con lai 1 ve'});

test('hằng số đúng hợp đồng W4', () => {
  assert.equal(MA_VUOT_GIOI_HAN, 'VUOT_GIOI_HAN_VE');
  assert.equal(PG_CODE, '22023');
  assert.equal(HTTP_STATUS, 422);
});

test('details chuỗi JSON hợp lệ và object đều cho lỗi 422 đủ số', () => {
  for (const details of [JSON.stringify(hopLe), hopLe]) {
    const err = chuanHoaLoiGiuCho(loiRpc(details));
    assert.ok(err instanceof PurchaseLimitError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'PurchaseLimitError');
    assert.equal(err.ma, 'VUOT_GIOI_HAN_VE');
    assert.equal(err.status, 422);
    assert.equal(err.gioiHan, 4);
    assert.equal(err.dangGiu, 3);
    assert.equal(err.conLai, 1);
    assert.equal(err.chiTietHopLe, true);
    assert.match(err.message, /4/);
    assert.match(err.message, /3/);
    assert.match(err.message, /1/);
  }
});

test('conLai = 0 khi đang giữ bằng hoặc vượt giới hạn', () => {
  assert.deepEqual(docChiTietGioiHan({gioiHan: 4, dangGiu: 4, conLai: 0}), {gioiHan: 4, dangGiu: 4, conLai: 0});
  assert.deepEqual(docChiTietGioiHan({gioiHan: 2, dangGiu: 5, conLai: 0}), {gioiHan: 2, dangGiu: 5, conLai: 0});
});

test('details thiếu/hỏng không ném, không bịa số, thông báo dự phòng không có chữ số', () => {
  const xau = [
    null,
    undefined,
    '',
    '{bad',
    '[]',
    '5',
    '{}',
    {gioiHan: 4, dangGiu: 3},
    {gioiHan: 4, dangGiu: -1, conLai: 5},
    {gioiHan: 4, dangGiu: 1.5, conLai: 2.5},
    {gioiHan: 4, dangGiu: 3, conLai: 2},
    {gioiHan: '4', dangGiu: '3', conLai: '1'},
    [4, 3, 1],
  ];
  for (const details of xau) {
    assert.equal(docChiTietGioiHan(details), null);
    let err;
    assert.doesNotThrow(() => {
      err = chuanHoaLoiGiuCho(loiRpc(details));
    });
    assert.ok(err instanceof PurchaseLimitError);
    assert.equal(err.status, 422);
    assert.equal(err.gioiHan, null);
    assert.equal(err.dangGiu, null);
    assert.equal(err.conLai, null);
    assert.equal(err.chiTietHopLe, false);
    assert.doesNotMatch(err.message, /\d/);
  }
});

test('không suy số từ hint', () => {
  const err = chuanHoaLoiGiuCho({code: '22023', message: 'VUOT_GIOI_HAN_VE', details: null, hint: 'Con lai 2 ve'});
  assert.equal(err.conLai, null);
});

test('các lỗi khác trả đúng tham chiếu lỗi gốc', () => {
  const cacLoi = [
    {code: '22023', message: 'Moi luot chi duoc giu tu 1 den 4 ve', details: JSON.stringify(hopLe)},
    {code: '22023', message: 'Yeu cau giu cho khong hop le', details: null},
    {code: '22023', message: 'So luong ve khong hop le', details: null},
    {code: '42501', message: 'Can xac minh OTP de giu cho', details: null},
    {code: '42501', message: 'VUOT_GIOI_HAN_VE', details: JSON.stringify(hopLe)},
    {code: 'P0001', message: 'VUOT_GIOI_HAN_VE', details: JSON.stringify(hopLe)},
    {message: 'VUOT_GIOI_HAN_VE', details: JSON.stringify(hopLe)},
    new Error('boom'),
  ];
  for (const loi of cacLoi) {
    assert.equal(laLoiVuotGioiHan(loi), false);
    assert.equal(chuanHoaLoiGiuCho(loi), loi);
  }
  for (const v of [null, undefined, 'x', 42]) {
    assert.equal(chuanHoaLoiGiuCho(v), v);
    assert.equal(laLoiVuotGioiHan(v), false);
  }
});

test('nhận diện chịu được khoảng trắng và code dạng số', () => {
  assert.equal(laLoiVuotGioiHan({code: 22023, message: '  VUOT_GIOI_HAN_VE\n'}), true);
});

test('lỗi đã chuẩn hóa đi qua lại vẫn cùng tham chiếu', () => {
  const err = taoLoiVuotGioiHan(hopLe);
  assert.equal(laLoiVuotGioiHan(err), true);
  assert.equal(chuanHoaLoiGiuCho(err), err);
});

test('giữ cause là lỗi gốc', () => {
  const goc = loiRpc(JSON.stringify(hopLe));
  assert.equal(chuanHoaLoiGiuCho(goc).cause, goc);
  assert.equal(taoLoiVuotGioiHan(hopLe).cause, undefined);
});

test('taoLoiVuotGioiHan nhận null và JSON hỏng', () => {
  const err = taoLoiVuotGioiHan(null);
  assert.equal(err.chiTietHopLe, false);
  assert.equal(err.conLai, null);
  assert.equal(taoLoiVuotGioiHan('{bad').chiTietHopLe, false);
  assert.equal(taoLoiVuotGioiHan(JSON.stringify(hopLe)).chiTietHopLe, true);
});

test('laLoiChuaDangNhap: nhận 28000, 401 và permission denied; không nhầm với OTP hay lỗi khác', () => {
  assert.equal(laLoiChuaDangNhap({code: '28000', message: 'Can dang nhap de giu cho'}), true);
  assert.equal(laLoiChuaDangNhap({status: 401, message: 'JWT'}), true);
  assert.equal(laLoiChuaDangNhap({code: '42501', message: 'permission denied for function tao_giu_cho_theo_suat'}), true);
  // thiếu OTP cũng là 42501 nhưng không phải chưa đăng nhập
  assert.equal(laLoiChuaDangNhap({code: '42501', message: 'Can xac minh OTP de giu cho'}), false);
  assert.equal(laLoiChuaDangNhap({code: '22023', message: 'VUOT_GIOI_HAN_VE'}), false);
  assert.equal(laLoiChuaDangNhap({status: 409, message: 'conflict'}), false);
  assert.equal(laLoiChuaDangNhap(null), false);
  assert.equal(laLoiChuaDangNhap('permission denied'), false);
  assert.match(THONG_BAO_CAN_DANG_NHAP, /đăng nhập/);
});
