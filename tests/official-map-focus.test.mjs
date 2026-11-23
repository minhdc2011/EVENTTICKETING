import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('sơ đồ BTC: khu đang mở sáng lên, khu xung quanh bị làm mờ', () => {
  const map = read('src/components/event-template/OfficialSeatingMap.tsx');
  assert.match(map, /activeZoneCode/, 'nhận mã khu đang mở');
  assert.match(map, /classList\.toggle\('is-dimmed'/, 'làm mờ khu còn lại');
  assert.match(map, /classList\.toggle\('is-focused'/, 'tô sáng khu đang chọn');
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\[data-zone-code\]\.is-dimmed\s*\{[^}]*opacity:\s*0\.2/);
  assert.match(css, /\[data-zone-code\]\.is-focused\s*\{[^}]*--zone-color/);
});

test('mở một khu thì vẫn hiện sơ đồ thu nhỏ để thấy các khu xung quanh', () => {
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /so-do-lam-mo-khu-xung-quanh/);
  assert.match(section, /activeZoneCode=\{activeDisplayZone\.MaKhuVuc\}/);
});

test('màu trạng thái ghế khớp Super Concert (xanh còn trống, vàng đang chọn, xám sọc đã bán)', () => {
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\.et-seat-rows \.et-seat \.et-seat-shape\s*\{[^}]*#22c55e/);
  assert.match(css, /data-status='selected'\] \.et-seat-shape\s*\{[^}]*#eab308/);
  assert.match(css, /data-status='sold'\] \.et-seat-shape\s*\{[^}]*#334155/);
});

test('khu ghế lấy tông màu từ màu khu trong dữ liệu', () => {
  const grid = read('src/components/event-template/ZoneSeatGrid.tsx');
  assert.match(grid, /'--zone-color': zone\.MauSacHex/);
});

test('Super Concert dùng cùng giao diện thẻ sáng với sự kiện chung', () => {
  const css = read('src/components/event-template/SuperConcertSeatmapSync.css');
  assert.match(css, /#seating-toolbar/);
  assert.match(css, /--sc-accent:\s*#0353c2/);
  const sections = read('src/components/ConcertSections.tsx');
  assert.match(sections, /SuperConcertSeatmapSync\.css/);
});

test('ba sự kiện có sơ đồ trực quan bán đến cuối tháng 12/2026', () => {
  const svc = read('src/services/eventService.ts');
  const ends = [...svc.matchAll(/saleEndsAt: '(2026-12-31T22:00:00\+07:00)'/g)];
  assert.ok(ends.length >= 4, 'Super Concert, hai ngày Creative Tech và Arena');
});
