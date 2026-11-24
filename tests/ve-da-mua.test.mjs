import assert from 'node:assert/strict';
import test from 'node:test';
import {chuanHoaVe} from '../src/domain/veDaMua.js';

const veGhe = {
  veId: 11, holdId: 'h-1', maVe: 'ZONE_B_T2-G-02', soLuong: 1, muaLuc: '2026-11-24T10:00:00Z', donGia: '1500000.00',
  suKienSlug: 'creative-tech-summit-2026', tenSuKien: 'Creative Tech Summit', diaDiem: 'Hà Nội', tenSanVanDong: 'Nhà hát',
  tenSuat: 'Ngày 1', batDauLuc: '2026-12-01T12:00:00Z', maKhuVuc: 'ZONE_B_T2', tenKhuVuc: 'Khán đài B tầng 2', soHang: 'G', soGhe: '02',
};

test('vé ghế ngồi: giữ hàng, ghế, tên khu; đơn giá chuỗi số thành số', () => {
  const ve = chuanHoaVe(veGhe);
  assert.equal(ve.laKhuDung, false);
  assert.equal(ve.soHang, 'G');
  assert.equal(ve.soGhe, '02');
  assert.equal(ve.donGia, 1500000);
  assert.equal(ve.tenKhuVuc, 'Khán đài B tầng 2');
  assert.equal(ve.veId, '11');
});

test('vé khu đứng: không hàng/ghế, giữ số lượng', () => {
  const ve = chuanHoaVe({...veGhe, maKhuVuc: 'GA_PIT_LEFT', soHang: null, soGhe: null, soLuong: 3});
  assert.equal(ve.laKhuDung, true);
  assert.equal(ve.soLuong, 3);
  assert.equal(ve.soHang, null);
});

test('thiếu trường: có giá trị an toàn, không ném lỗi', () => {
  const ve = chuanHoaVe({maKhuVuc: 'X', holdId: 'h', maVe: 'm'});
  assert.equal(ve.tenSuKien, 'Sự kiện');
  assert.equal(ve.tenKhuVuc, 'X');
  assert.equal(ve.soLuong, 1);
  assert.equal(ve.donGia, null);
});

test('dữ liệu hỏng bị bỏ (null)', () => {
  assert.equal(chuanHoaVe(null), null);
  assert.equal(chuanHoaVe('abc'), null);
  assert.equal(chuanHoaVe({tenSuKien: 'không có khu'}), null);
});

test('số lượng không hợp lệ về 1; đơn giá không phải số về null', () => {
  const ve = chuanHoaVe({...veGhe, soLuong: -2, donGia: 'abc'});
  assert.equal(ve.soLuong, 1);
  assert.equal(ve.donGia, null);
});
