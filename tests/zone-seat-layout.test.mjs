import test from 'node:test';
import assert from 'node:assert/strict';
import {arcSectorBBox, horizontalSpanAt, layoutZoneSeats, parseArcSpec, parsePolygonPath, parsePolygonPoints, rectToPolygon} from '../src/domain/zoneSeatLayout.js';

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


test('khu hình bình hành nghiêng: ghế không tràn ra cạnh nghiêng (cả mép trên và mép dưới của chấm)', () => {
  // Orchestra Right của nhà hát: cạnh phải nghiêng mạnh.
  const poly = parsePolygonPath('M 680 220 L 790 220 L 820 440 L 700 440 Z');
  const bbox = {x: 680, y: 220, w: 140, h: 220};
  const rows = [hang('A', 10), hang('B', 10), hang('C', 10), hang('D', 10)];
  const placed = layoutZoneSeats({rows, bbox, polygon: poly});
  assert.equal(placed.length, 40);
  for (const p of placed) {
    for (const dy of [-p.r, 0, p.r]) {
      const span = horizontalSpanAt(poly, p.y + dy);
      assert.ok(span, 'điểm nằm trong chiều cao khu');
      assert.ok(p.x - p.r >= span.xmin - 0.01, `${p.seat.MaGheDayDu} không tràn cạnh trái ở dy=${dy}`);
      assert.ok(p.x + p.r <= span.xmax + 0.01, `${p.seat.MaGheDayDu} không tràn cạnh phải ở dy=${dy}`);
    }
  }
});

test('parsePolygonPoints đọc thuộc tính points của polygon', () => {
  assert.deepEqual(parsePolygonPoints('0,0 10,0 10,5'), [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 5}]);
  assert.equal(parsePolygonPoints('0,0 10,0'), null);
  assert.equal(parsePolygonPoints(undefined), null);
});

test('parseArcSpec đọc đặc tả cung và từ chối đặc tả sai', () => {
  assert.deepEqual(parseArcSpec('500 470 350 315 280 247 150 234'), {cx: 500, cy: 470, outerRx: 350, outerRy: 315, innerRx: 280, innerRy: 247, start: 150, end: 234});
  assert.equal(parseArcSpec('500 470 280 247 350 315 150 234'), null, 'vành ngoài phải lớn hơn vành trong');
  assert.equal(parseArcSpec('1 2 3'), null);
});

test('layoutZoneSeats theo cung: ghế nằm trong vành, hàng đầu ở ngoài, hàng cuối ở trong', () => {
  const arc = parseArcSpec('500 470 350 315 280 247 150 234');
  const placed = layoutZoneSeats({rows: [hang('E', 6), hang('F', 6)], bbox: arcSectorBBox(arc), arc});
  assert.equal(placed.length, 12);
  const dist = (p) => Math.hypot((p.x - 500) / 1, (p.y - 470) / 1);
  const outer = placed.filter((p) => p.rowLabel === 'E');
  const inner = placed.filter((p) => p.rowLabel === 'F');
  assert.ok(Math.min(...outer.map(dist)) > Math.max(...inner.map(dist)) - 1, 'hàng E nằm ngoài hàng F');
  for (const p of placed) {
    const nx = (p.x - 500) / 350;
    const ny = (p.y - 470) / 315;
    assert.ok(Math.hypot(nx, ny) <= 1.001, 'nằm trong vành ngoài');
    const mx = (p.x - 500) / 280;
    const my = (p.y - 470) / 247;
    assert.ok(Math.hypot(mx, my) >= 0.999, 'nằm ngoài vành trong');
  }
});

test('arcSectorBBox bao trọn hình quạt', () => {
  const arc = parseArcSpec('500 470 350 315 280 247 234 306');
  const box = arcSectorBBox(arc);
  assert.ok(box.w > 0 && box.h > 0);
  const p = layoutZoneSeats({rows: [hang('A', 5)], bbox: box, arc})[0];
  assert.ok(p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h);
});
