/**
 * Bố trí ghế bên trong một phân khu của sơ đồ BTC (SVG).
 *
 * Thuần toán học, không đụng DOM, để kiểm thử được: nhận danh sách hàng ghế và hình dạng khu rồi trả về toạ độ từng ghế theo
 * hệ toạ độ viewBox của sơ đồ. Hai kiểu hình dạng:
 * - Đa giác (hoặc hộp bao): mỗi hàng nằm gọn trong bề ngang đa giác. Bề ngang được lấy giao của ba độ cao (trên, giữa, dưới của
 *   hàng) nên khu hình thang hay bình hành có cạnh nghiêng vẫn không bị ghế tràn ra ngoài.
 * - Cung elip (vành sân vận động): mỗi hàng chạy dọc một vành, ghế trải theo góc.
 */

const ROW_MARGIN_RATIO = 0.12;
const SIDE_MARGIN_RATIO = 0.05;
const MIN_SEAT_RADIUS = 2.5;
const MAX_SEAT_RADIUS = 14;

/**
 * Đọc đa giác từ thuộc tính d của path chỉ gồm lệnh M/L/Z tuyệt đối.
 * Trả null nếu có lệnh khác (cung, đường cong, toạ độ tương đối).
 * @param {string | null | undefined} d
 * @returns {Array<{x: number, y: number}> | null}
 */
export function parsePolygonPath(d) {
  if (typeof d !== 'string') return null;
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!tokens) return null;
  const points = [];
  let command = null;
  let buffer = [];
  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      if (!/^[MLZ]$/.test(token)) return null;
      command = token;
      buffer = [];
      continue;
    }
    if (command !== 'M' && command !== 'L') return null;
    buffer.push(Number(token));
    if (buffer.length === 2) {
      points.push({x: buffer[0], y: buffer[1]});
      buffer = [];
      command = 'L';
    }
  }
  return points.length >= 3 ? points : null;
}

/**
 * Đọc đa giác từ thuộc tính points của phần tử polygon.
 * @param {string | null | undefined} points
 */
export function parsePolygonPoints(points) {
  if (typeof points !== 'string') return null;
  const nums = points.trim().split(/[\s,]+/).map(Number);
  if (nums.length < 6 || nums.length % 2 !== 0 || nums.some((n) => !Number.isFinite(n))) return null;
  const out = [];
  for (let i = 0; i < nums.length; i += 2) out.push({x: nums[i], y: nums[i + 1]});
  return out;
}

/** Hình chữ nhật thành đa giác 4 đỉnh. */
export function rectToPolygon({x, y, width, height}) {
  return [
    {x, y},
    {x: x + width, y},
    {x: x + width, y: y + height},
    {x, y: y + height},
  ];
}

/**
 * Đoạn ngang [xmin, xmax] mà đa giác phủ tại độ cao y; null nếu y nằm ngoài đa giác.
 * @param {Array<{x: number, y: number}>} polygon
 * @param {number} y
 */
export function horizontalSpanAt(polygon, y) {
  const xs = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y > hi) continue;
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  if (xs.length < 2) return null;
  return {xmin: Math.min(...xs), xmax: Math.max(...xs)};
}

/**
 * Bề ngang an toàn cho một hàng ghế có tâm ở độ cao y và bán kính ghế tối đa t: giao của ba độ cao y - t, y và y + t,
 * để cạnh nghiêng của khu không cắt vào ghế ở mép trên hoặc mép dưới của hàng.
 */
export function safeSpanForRow(polygon, bbox, y, t) {
  const fallback = {xmin: bbox.x, xmax: bbox.x + bbox.w};
  if (!polygon) return fallback;
  const spans = [y - t, y, y + t].map((yy) => horizontalSpanAt(polygon, yy)).filter(Boolean);
  if (spans.length === 0) return fallback;
  const xmin = Math.max(...spans.map((s) => s.xmin));
  const xmax = Math.min(...spans.map((s) => s.xmax));
  return xmax > xmin ? {xmin, xmax} : fallback;
}

/** Điểm trên elip tại góc (độ). */
export function pointOnEllipse(cx, cy, rx, ry, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad)};
}

/** Hộp bao của một hình quạt elip (lấy mẫu dọc hai cung và hai cạnh bán kính). */
export function arcSectorBBox(arc) {
  const {cx, cy, outerRx, outerRy, innerRx, innerRy, start, end} = arc;
  const pts = [];
  const steps = 32;
  for (let i = 0; i <= steps; i += 1) {
    const a = start + ((end - start) * i) / steps;
    pts.push(pointOnEllipse(cx, cy, outerRx, outerRy, a), pointOnEllipse(cx, cy, innerRx, innerRy, a));
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y};
}

/**
 * Đọc đặc tả cung từ chuỗi "cx cy outerRx outerRy innerRx innerRy start end" (độ).
 * @param {string | null | undefined} raw
 */
export function parseArcSpec(raw) {
  if (typeof raw !== 'string') return null;
  const n = raw.trim().split(/[\s,]+/).map(Number);
  if (n.length !== 8 || n.some((v) => !Number.isFinite(v))) return null;
  const [cx, cy, outerRx, outerRy, innerRx, innerRy, start, end] = n;
  if (!(outerRx > innerRx) || !(outerRy > innerRy) || start === end) return null;
  return {cx, cy, outerRx, outerRy, innerRx, innerRy, start, end};
}

/**
 * Ghế theo vành elip: hàng đầu ở vành ngoài, hàng cuối ở vành trong; ghế trải đều theo góc.
 */
function layoutArcSeats(rows, arc) {
  const placed = [];
  const rowCount = rows.length;
  rows.forEach((row, rowIndex) => {
    const seats = Array.isArray(row?.seats) ? row.seats : [];
    if (seats.length === 0) return;
    const f = (rowIndex + 0.5) / rowCount;
    const rx = arc.outerRx - (arc.outerRx - arc.innerRx) * f;
    const ry = arc.outerRy - (arc.outerRy - arc.innerRy) * f;
    const thickness = ((arc.outerRx - arc.innerRx) + (arc.outerRy - arc.innerRy)) / 2 / rowCount;
    const step = (rx + ry) / 2 * (Math.abs(arc.end - arc.start) * Math.PI / 180) / seats.length;
    const radius = Math.min(MAX_SEAT_RADIUS, Math.max(MIN_SEAT_RADIUS, Math.min(thickness, step) * 0.36));
    seats.forEach((seat, seatIndex) => {
      const angle = arc.start + ((arc.end - arc.start) * (seatIndex + 0.5)) / seats.length;
      const p = pointOnEllipse(arc.cx, arc.cy, rx, ry, angle);
      placed.push({seat, rowLabel: row.rowLabel, x: p.x, y: p.y, r: radius});
    });
  });
  return placed;
}

/**
 * @param {{
 *   rows: Array<{rowLabel: string, seats: Array<object>}>,
 *   bbox: {x: number, y: number, w: number, h: number},
 *   polygon?: Array<{x: number, y: number}> | null,
 *   arc?: {cx: number, cy: number, outerRx: number, outerRy: number, innerRx: number, innerRy: number, start: number, end: number} | null,
 * }} input
 * @returns {Array<{seat: object, rowLabel: string, x: number, y: number, r: number}>}
 */
export function layoutZoneSeats({rows, bbox, polygon = null, arc = null}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (arc) return layoutArcSeats(rows, arc);
  if (!bbox || !(bbox.w > 0) || !(bbox.h > 0)) return [];
  const rowCount = rows.length;
  const top = bbox.y + bbox.h * ROW_MARGIN_RATIO;
  const innerHeight = bbox.h * (1 - ROW_MARGIN_RATIO * 2);
  const rowHeight = innerHeight / rowCount;
  const t = Math.min(MAX_SEAT_RADIUS, rowHeight * 0.4);
  const placed = [];

  rows.forEach((row, rowIndex) => {
    const seats = Array.isArray(row?.seats) ? row.seats : [];
    if (seats.length === 0) return;
    const y = top + (rowIndex + 0.5) * rowHeight;
    const span = safeSpanForRow(polygon, bbox, y, t);
    const margin = Math.max((span.xmax - span.xmin) * SIDE_MARGIN_RATIO, t * 0.6, 2);
    const xmin = span.xmin + margin;
    const xmax = span.xmax - margin;
    const step = (xmax - xmin) / seats.length;
    const radius = Math.min(t, Math.max(MIN_SEAT_RADIUS, step * 0.38));
    seats.forEach((seat, seatIndex) => {
      placed.push({seat, rowLabel: row.rowLabel, x: xmin + (seatIndex + 0.5) * step, y, r: radius});
    });
  });
  return placed;
}
