/**
 * Bố trí ghế bên trong một phân khu của sơ đồ BTC (SVG).
 *
 * Thuần toán học, không đụng DOM, để kiểm thử được: nhận danh sách hàng ghế và hình dạng khu
 * (hộp bao + đa giác nếu đọc được) rồi trả về toạ độ từng ghế theo hệ toạ độ viewBox của sơ đồ.
 * Mỗi hàng được đặt vừa trong bề ngang đa giác tại độ cao của hàng đó, nên khu hình thang hay
 * hình bình hành vẫn có ghế nằm gọn trong khu.
 */

const ROW_MARGIN_RATIO = 0.12;
const SIDE_MARGIN_RATIO = 0.1;
const MIN_SEAT_RADIUS = 2.5;
const MAX_SEAT_RADIUS = 14;

/**
 * Đọc đa giác từ thuộc tính d của path chỉ gồm lệnh M/L/Z tuyệt đối (như các khu trong sơ đồ BTC).
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
 * @param {{
 *   rows: Array<{rowLabel: string, seats: Array<object>}>,
 *   bbox: {x: number, y: number, w: number, h: number},
 *   polygon?: Array<{x: number, y: number}> | null,
 * }} input
 * @returns {Array<{seat: object, rowLabel: string, x: number, y: number, r: number}>}
 */
export function layoutZoneSeats({rows, bbox, polygon = null}) {
  if (!Array.isArray(rows) || rows.length === 0 || !bbox || !(bbox.w > 0) || !(bbox.h > 0)) return [];
  const rowCount = rows.length;
  const top = bbox.y + bbox.h * ROW_MARGIN_RATIO;
  const innerHeight = bbox.h * (1 - ROW_MARGIN_RATIO * 2);
  const rowHeight = innerHeight / rowCount;
  const placed = [];

  rows.forEach((row, rowIndex) => {
    const seats = Array.isArray(row?.seats) ? row.seats : [];
    if (seats.length === 0) return;
    const y = top + (rowIndex + 0.5) * rowHeight;
    const span = (polygon && horizontalSpanAt(polygon, y)) || {xmin: bbox.x, xmax: bbox.x + bbox.w};
    const margin = Math.max((span.xmax - span.xmin) * SIDE_MARGIN_RATIO, 2);
    const xmin = span.xmin + margin;
    const xmax = span.xmax - margin;
    const step = (xmax - xmin) / seats.length;
    const radius = Math.min(
      MAX_SEAT_RADIUS,
      Math.max(MIN_SEAT_RADIUS, Math.min(step * 0.38, rowHeight * 0.4)),
    );
    seats.forEach((seat, seatIndex) => {
      placed.push({seat, rowLabel: row.rowLabel, x: xmin + (seatIndex + 0.5) * step, y, r: radius});
    });
  });
  return placed;
}
