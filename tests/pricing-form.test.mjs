import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManagePricing,
  validatePricingForm,
} from '../src/components/organizer-ui/pricingFormLogic.js';

const valid = () => ({
  giaGoc: 100000,
  giaSan: 80000,
  giaTran: 150000,
  buocNhayGia: 1000,
  bienDoToiDa: 0.3,
  nguongLapDayThap: 0.2,
  nguongLapDayCao: 0.8,
  trongSoLapDay: 0.5,
  trongSoTocDoBan: 0.3,
  trongSoThoiGian: 0.2,
  trangThaiKichHoat: true,
});

function invalidField(patch, field) {
  const r = validatePricingForm({...valid(), ...patch});
  assert.equal(r.ok, false, JSON.stringify(patch));
  assert.equal(typeof r.errors[field], 'string', `thiếu lỗi ${field}: ${JSON.stringify(patch)}`);
  return r;
}

test('dữ liệu hợp lệ trả params chuẩn hoá', () => {
  const r = validatePricingForm(valid());
  assert.equal(r.ok, true);
  assert.deepEqual(r.params, valid());
  assert.deepEqual(r.errors, {});
});

test('chuỗi số được cắt khoảng trắng và làm tròn half away from zero', () => {
  const r = validatePricingForm({
    ...valid(),
    giaGoc: ' 100000.005 ',
    giaSan: '80000.004',
    bienDoToiDa: '0.12345',
    trongSoLapDay: 1.00005,
  });
  assert.equal(r.ok, true);
  assert.equal(r.params.giaGoc, 100000.01);
  assert.equal(r.params.giaSan, 80000);
  assert.equal(r.params.bienDoToiDa, 0.1235);
  assert.equal(r.params.trongSoLapDay, 1.0001);
});

test('các biên hợp lệ được chấp nhận', () => {
  const r = validatePricingForm({
    ...valid(),
    giaGoc: 5,
    giaSan: 5,
    giaTran: 5,
    bienDoToiDa: 1,
    nguongLapDayThap: 0,
    nguongLapDayCao: 1,
    trongSoLapDay: 0,
    trongSoTocDoBan: 0,
    trongSoThoiGian: 0,
    trangThaiKichHoat: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.params.trangThaiKichHoat, false);
});

test('từ chối trống, khoảng trắng, null, undefined, không hữu hạn, sai kiểu', () => {
  const bad = ['', '   ', null, undefined, NaN, Infinity, -Infinity, 'abc', 'Infinity', true, [], {}, [1]];
  for (const field of Object.keys(valid()).filter((k) => k !== 'trangThaiKichHoat')) {
    for (const value of bad) {
      const r = invalidField({[field]: value}, field);
      assert.equal(r.firstInvalidField !== null, true);
    }
  }
  assert.equal(validatePricingForm({...valid(), giaGoc: ''}).params, null);
});

test('trangThaiKichHoat phải là boolean', () => {
  for (const value of [null, undefined, 'true', 1, 0]) {
    invalidField({trangThaiKichHoat: value}, 'trangThaiKichHoat');
  }
});

test('đầu vào không phải object báo lỗi mọi trường', () => {
  for (const input of [null, undefined, 5, []]) {
    const r = validatePricingForm(input);
    assert.equal(r.ok, false);
    assert.equal(Object.keys(r.errors).length, 11);
  }
});

test('vượt độ chính xác cột', () => {
  invalidField({giaGoc: 1e10, giaTran: 1e10}, 'giaGoc');
  invalidField({giaTran: 9999999999.999}, 'giaTran'); // làm tròn lên 1e10
  invalidField({giaTran: 1e30}, 'giaTran');
  invalidField({giaSan: -1e10}, 'giaSan');
  invalidField({bienDoToiDa: 10}, 'bienDoToiDa');
  invalidField({trongSoLapDay: 9.99995}, 'trongSoLapDay'); // làm tròn lên 10
  invalidField({trongSoTocDoBan: 10}, 'trongSoTocDoBan');
  invalidField({trongSoThoiGian: -10}, 'trongSoThoiGian');
  assert.equal(validatePricingForm({...valid(), giaTran: 9999999999.99}).ok, true);
  assert.equal(validatePricingForm({...valid(), trongSoLapDay: 9.9999}).ok, true);
});

test('ràng buộc giá', () => {
  invalidField({giaSan: 0, giaGoc: 0, giaTran: 0}, 'giaSan');
  invalidField({giaSan: -1}, 'giaSan');
  invalidField({giaSan: 0.004}, 'giaSan'); // làm tròn về 0
  invalidField({giaGoc: 79999.99}, 'giaGoc');
  invalidField({giaTran: 99999.99}, 'giaTran');
  invalidField({buocNhayGia: 0}, 'buocNhayGia');
  invalidField({buocNhayGia: -5}, 'buocNhayGia');
  invalidField({buocNhayGia: 0.004}, 'buocNhayGia');
});

test('ràng buộc biên độ, ngưỡng, trọng số', () => {
  invalidField({bienDoToiDa: 0}, 'bienDoToiDa');
  invalidField({bienDoToiDa: -0.1}, 'bienDoToiDa');
  invalidField({bienDoToiDa: 1.0001}, 'bienDoToiDa');
  invalidField({nguongLapDayThap: -0.0001}, 'nguongLapDayThap');
  invalidField({nguongLapDayThap: 1.5, nguongLapDayCao: 1}, 'nguongLapDayThap');
  invalidField({nguongLapDayCao: 1.0001}, 'nguongLapDayCao');
  invalidField({nguongLapDayCao: -0.5}, 'nguongLapDayCao');
  invalidField({nguongLapDayThap: 0.5, nguongLapDayCao: 0.5}, 'nguongLapDayThap');
  invalidField({nguongLapDayThap: 0.9, nguongLapDayCao: 0.1}, 'nguongLapDayThap');
  invalidField({trongSoLapDay: -0.0001}, 'trongSoLapDay');
  invalidField({trongSoTocDoBan: -1}, 'trongSoTocDoBan');
  invalidField({trongSoThoiGian: -1}, 'trongSoThoiGian');
});

test('lỗi theo tên trường, nhiều trường cùng lúc và ánh xạ tham số SQL', () => {
  const r = validatePricingForm({...valid(), giaSan: 0, buocNhayGia: '', trongSoLapDay: -1});
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['buocNhayGia', 'giaSan', 'trongSoLapDay']);
  assert.equal(r.firstInvalidField, 'giaSan');
  assert.equal(r.firstInvalidSqlParam, 'p_gia_san');
});

test('ma trận quyền định giá', () => {
  const m = (role, extra = {}) => ({organizationId: 'org-1', role, ...extra});
  assert.equal(canManagePricing(m('CHU_SO_HUU'), 'org-1'), true);
  assert.equal(canManagePricing(m('QUAN_TRI'), 'org-1'), true);
  for (const role of ['BIEN_TAP', 'VAN_HANH', 'SOAT_VE', 'ADMIN', '', null, undefined]) {
    assert.equal(canManagePricing(m(role), 'org-1'), false, String(role));
  }
  // sai tổ chức
  assert.equal(canManagePricing(m('CHU_SO_HUU'), 'org-2'), false);
  assert.equal(canManagePricing(m('QUAN_TRI'), 'org-2'), false);
  // thiếu/null
  assert.equal(canManagePricing(null, 'org-1'), false);
  assert.equal(canManagePricing(undefined, 'org-1'), false);
  assert.equal(canManagePricing([], 'org-1'), false);
  assert.equal(canManagePricing(m('CHU_SO_HUU'), null), false);
  assert.equal(canManagePricing(m('CHU_SO_HUU'), ''), false);
  assert.equal(canManagePricing({role: 'CHU_SO_HUU'}, 'org-1'), false);
  assert.equal(canManagePricing({organizationId: '', role: 'CHU_SO_HUU'}, ''), false);
  // loại tài khoản
  assert.equal(canManagePricing(m('CHU_SO_HUU', {accountKind: 'ORGANIZER'}), 'org-1'), true);
  assert.equal(canManagePricing(m('QUAN_TRI', {accountKind: 'ADMIN'}), 'org-1'), true);
  assert.equal(canManagePricing(m('CHU_SO_HUU', {accountKind: 'CUSTOMER'}), 'org-1'), false);
  // tên trường kiểu DB
  assert.equal(canManagePricing({ToChucID: 7, VaiTro: 'QUAN_TRI', LoaiTaiKhoan: 'ADMIN'}, 7), true);
  assert.equal(canManagePricing({ToChucID: 7, VaiTro: 'BIEN_TAP'}, 7), false);
});

test('danh sách membership: BIEN_TAP cùng tổ chức không thừa hưởng quyền', () => {
  const list = [
    {organizationId: 'org-1', role: 'BIEN_TAP'},
    {organizationId: 'org-2', role: 'CHU_SO_HUU'},
  ];
  assert.equal(canManagePricing(list, 'org-1'), false);
  assert.equal(canManagePricing(list, 'org-2'), true);
  assert.equal(canManagePricing(list, 'org-3'), false);
  assert.equal(canManagePricing([null, {organizationId: 'org-1', role: 'QUAN_TRI'}], 'org-1'), true);
});
