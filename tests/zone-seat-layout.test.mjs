import test from 'node:test';
import assert from 'node:assert/strict';
import {horizontalSpanAt, layoutZoneSeats, parsePolygonPath, rectToPolygon} from '../src/domain/zoneSeatLayout.js';

const hang = (nhan, n) => ({rowLabel: nhan, seats: Array.from({length: n}, (_, i) => ({GheID: i + 1, MaGheDayDu: `${nhan}-${i + 1}`}))});

test('parsePolygonPath đọc path chỉ gồm M/L/Z và từ chối lệnh khác', () => {
  assert.deepEqual(parsePolygonPath('M 120 640 L 880 640 L 900 760 L 100 760 Z'), [
    {x: 120, y: 640}, {x: 880, y: 640}, {x: 900, y: 760}, {x: 100, y: 760},
  ]);
  assert.equal(parsePolygonPath('M 0 0 A 10 10 0 0 1 20 20 Z'), null);
  assert.equal(parsePolygonPath('M 0 0 l 5 5 Z'), null);
  assert.equal(parsePolygonPath(undefined), null);
  assert.equal(parsePolygonPath('M 0 0 L 5 5'), null);
});

test('horizontalSpanAt trả bề ngang đa giác tại độ cao y', () => {
  const trap = parsePolygonPath('M 120 640 L 880 640 L 900 760 L 100 760 Z');
  const top = horizontalSpanAt(trap, 640);
  const bottom = horizontalSpanAt(trap, 760);
  assert.equal(Math.round(top.xmin), 120);
  assert.equal(Math.round(bottom.xmax), 900);
  assert.equal(horizontalSpanAt(trap, 100), null);
});

test('layoutZoneSeats đặt mọi ghế nằm trong khu hình thang', () => {
  const trap = parsePolygonPath('M 120 640 L 880 640 L 900 760 L 100 760 Z');
  const bbox = {x: 100, y: 640, w: 800, h: 120};
  const placed = layoutZoneSeats({rows: [hang('A', 10), hang('B', 10), hang('C', 10)], bbox, polygon: trap});
  assert.equal(placed.length, 30);
  for (const p of placed) {
    const span = horizontalSpanAt(trap, p.y);
    assert.ok(p.x - p.r >= span.xmin - 0.001 && p.x + p.r <= span.xmax + 0.001, `${p.seat.MaGheDayDu} nằm trong khu`);
    assert.ok(p.y - p.r >= bbox.y && p.y + p.r <= bbox.y + bbox.h, 'trong chiều cao khu');
  }
});

test('layoutZoneSeats: ghế không chồng nhau trong cùng hàng, hàng sau nằm thấp hơn hàng trước', () => {
  const poly = rectToPolygon({x: 0, y: 0, width: 100, height: 60});
  const placed = layoutZoneSeats({rows: [hang('A', 8), hang('B', 8)], bbox: {x: 0, y: 0, w: 100, h: 60}, polygon: poly});
  const a = placed.filter((p) => p.rowLabel === 'A');
  const b = placed.filter((p) => p.rowLabel === 'B');
  for (let i = 1; i < a.length; i += 1) assert.ok(a[i].x - a[i - 1].x >= a[i].r * 2 - 0.001, 'không chồng ghế');
  assert.ok(b[0].y > a[0].y);
});

test('layoutZoneSeats không có polygon thì dùng hộp bao; đầu vào rỗng trả mảng rỗng', () => {
  const placed = layoutZoneSeats({rows: [hang('A', 4)], bbox: {x: 10, y: 10, w: 80, h: 40}, polygon: null});
  assert.equal(placed.length, 4);
  assert.ok(placed.every((p) => p.x > 10 && p.x < 90));
  assert.deepEqual(layoutZoneSeats({rows: [], bbox: {x: 0, y: 0, w: 10, h: 10}}), []);
  assert.deepEqual(layoutZoneSeats({rows: [hang('A', 3)], bbox: {x: 0, y: 0, w: 0, h: 10}}), []);
});

test('bán kính ghế giữ trong khoảng cho phép', () => {
  const placed = layoutZoneSeats({rows: [hang('A', 200)], bbox: {x: 0, y: 0, w: 100, h: 50}});
  assert.ok(placed.every((p) => p.r >= 2.5 && p.r <= 14));
  const few = layoutZoneSeats({rows: [hang('A', 1)], bbox: {x: 0, y: 0, w: 1000, h: 500}});
  assert.ok(few[0].r <= 14);
});

test('nút ghế GỐC nằm ngay trong khu của sơ đồ BTC (lớp phủ HTML), không còn lưới ghế riêng khi đã phóng vào khu', async () => {
  const {readFileSync} = await import('node:fs');
  const r = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const map = r('src/components/event-template/OfficialSeatingMap.tsx');
  assert.match(map, /<ZoneSeatsOverlay/);
  assert.match(map, /getScreenCTM/);
  assert.match(map, /ResizeObserver/);
  assert.doesNotMatch(map, /createPortal/, 'không còn vẽ dấu chấm trong SVG');
  const overlay = r('src/components/event-template/ZoneSeatsOverlay.tsx');
  assert.match(overlay, /<SeatButton/, 'dùng đúng nút ghế gốc (SeatButton)');
  assert.match(overlay, /isSeatSelectable/);
  const section = r('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /officialZoomActive/);
  assert.match(section, /\{!officialZoomActive && \(/);
  const css = r('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\.et-map-seat-slot\s*\{[^}]*translate\(-50%, -50%\) scale\(var\(--seat-scale/s);
  assert.match(css, /:is\(\.et-seat-rows, \.et-map-seat-overlay\) \.et-seat \.et-seat-shape/);
});
