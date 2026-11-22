/**
 * @file pricePresentation.js
 * Hàm thuần áp giá realtime (KHU_VUC.GiaVeNiemYet) lên giao diện khán giả và định giá vé đang giữ.
 * Mọi hàm giữ nguyên tham chiếu đầu vào khi không có gì thay đổi (tránh render thừa) và
 * không bao giờ đụng vào TrangThai ghế hay các trường khác ngoài giá.
 * Chưa đo độ trễ cập nhật trên trình duyệt; module này không đưa ra cam kết về độ trễ.
 */

import {isValidPrice, khopMaPhamViNghiemNgat} from './priceRealtime.js';

export const HELD_PRICE_NOTE_SERVER = 'Đơn giá đã được máy chủ chốt cho các vé đang giữ.';
export const HELD_PRICE_NOTE_CLIENT =
  'Giá hiển thị theo thời điểm giữ chỗ tạm; đơn giá cuối cùng sẽ được máy chủ xác nhận khi thanh toán.';

function normId(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Bản đồ giá hợp lệ (khuVucId số -> giá > 0) hoặc null nếu rỗng. */
function cleanMap(priceMap) {
  if (!priceMap || typeof priceMap.forEach !== 'function') return null;
  const out = new Map();
  priceMap.forEach((price, id) => {
    const key = normId(id);
    if (key !== null && isValidPrice(price)) out.set(key, price);
  });
  return out.size > 0 ? out : null;
}

/** Sự kiện đúng loại, đúng phạm vi, giá hợp lệ -> Map một phần tử; ngược lại null. */
function eventToMap(event, scope) {
  if (!event || typeof event !== 'object' || event.type !== 'ZONE_PRICE_CHANGED') return null;
  const id = normId(event.khuVucId);
  if (id === null || !isValidPrice(event.gia)) return null;
  const suKienId = scope?.suKienId ?? null;
  const suatDienId = scope?.suatDienId ?? null;
  if (!khopMaPhamViNghiemNgat(event.suKienId, suKienId)) return null;
  if (!khopMaPhamViNghiemNgat(event.suatDienId, suatDienId)) return null;
  return new Map([[id, event.gia]]);
}

// ---- Tiers ----

export function applyPriceSnapshotToTiers(tiers, priceMap) {
  const map = cleanMap(priceMap);
  if (!map || !Array.isArray(tiers)) return tiers;
  let changed = false;
  const next = tiers.map((tier) => {
    const price = map.get(normId(tier?.id));
    if (price === undefined || tier.price === price) return tier;
    changed = true;
    return {...tier, price};
  });
  return changed ? next : tiers;
}

export function applyPriceUpdateToTiers(tiers, event, scope) {
  return applyPriceSnapshotToTiers(tiers, eventToMap(event, scope));
}

// ---- Catalog ----

export function applyPriceSnapshotToCatalog(catalog, priceMap) {
  const map = cleanMap(priceMap);
  if (!map || !catalog) return catalog;
  let zonesChanged = false;
  let seatsChanged = false;
  const zones = Array.isArray(catalog.zones)
    ? catalog.zones.map((zone) => {
        const price = map.get(normId(zone?.KhuVucID));
        if (price === undefined || zone.GiaVeNiemYet === price) return zone;
        zonesChanged = true;
        return {...zone, GiaVeNiemYet: price};
      })
    : catalog.zones;
  const seats = Array.isArray(catalog.seats)
    ? catalog.seats.map((seat) => {
        const price = map.get(normId(seat?.KhuVucID));
        if (price === undefined || seat.GiaVeNiemYet === price) return seat;
        seatsChanged = true;
        return {...seat, GiaVeNiemYet: price};
      })
    : catalog.seats;
  if (!zonesChanged && !seatsChanged) return catalog;
  return {
    ...catalog,
    zones: zonesChanged ? zones : catalog.zones,
    seats: seatsChanged ? seats : catalog.seats,
  };
}

export function applyPriceUpdateToCatalog(catalog, event, scope) {
  return applyPriceSnapshotToCatalog(catalog, eventToMap(event, scope));
}

// ---- Selection (ghế chọn chưa giữ) ----

export function applyPriceSnapshotToSelection(selectedSeats, priceMap, options = {}) {
  if (options?.hasActiveHold) return selectedSeats;
  const map = cleanMap(priceMap);
  if (!map || !Array.isArray(selectedSeats)) return selectedSeats;
  let changed = false;
  const next = selectedSeats.map((seat) => {
    const price = map.get(normId(seat?.KhuVucID));
    if (price === undefined || seat.GiaVeNiemYet === price) return seat;
    changed = true;
    return {...seat, GiaVeNiemYet: price};
  });
  return changed ? next : selectedSeats;
}

export function applyPriceUpdateToSelection(selectedSeats, event, scope, options = {}) {
  return applyPriceSnapshotToSelection(selectedSeats, eventToMap(event, scope), options);
}

// ---- Ghế đang xem (tooltip) ----

export function applyPriceSnapshotToInspectedSeat(inspectedSeat, priceMap) {
  const map = cleanMap(priceMap);
  if (!map || !inspectedSeat) return inspectedSeat;
  const price = map.get(normId(inspectedSeat.KhuVucID));
  if (price === undefined || inspectedSeat.GiaVeNiemYet === price) return inspectedSeat;
  return {...inspectedSeat, GiaVeNiemYet: price};
}

export function applyPriceUpdateToInspectedSeat(inspectedSeat, event, scope) {
  return applyPriceSnapshotToInspectedSeat(inspectedSeat, eventToMap(event, scope));
}

// ---- Giá vé đang giữ ----

function lockedPrice(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return isValidPrice(n) ? n : null;
}

/**
 * Chụp giá tại thời điểm giữ chỗ thành công (ghế ngồi + vé đứng).
 * Mỗi dòng ưu tiên DonGiaChot hợp lệ của máy chủ (khớp theo ticketCode = MaGheDayDu cho ghế,
 * theo zoneCode cho vé đứng; DonGiaChot cấp bản ghi chỉ dùng khi tổng chỉ có đúng một dòng);
 * nếu không có thì đóng băng giá đang hiển thị. Trường `price` của item KHÔNG được coi là giá chốt.
 */
export function buildHeldPriceSnapshot({
  selectedSeats: rawSeats = [],
  standing = {},
  zones: rawZones = [],
  holdRecord = null,
  latestPriceMap = null,
} = {}) {
  const items = Array.isArray(holdRecord?.items) ? holdRecord.items : [];
  // Giá hiển thị mới nhất (nếu có) được áp lên ghế và khu trước khi xét DonGiaChot.
  const selectedSeats = latestPriceMap ? applyPriceSnapshotToSelection(rawSeats, latestPriceMap) : rawSeats;
  const zones = latestPriceMap
    ? applyPriceSnapshotToCatalog({zones: Array.isArray(rawZones) ? rawZones : []}, latestPriceMap).zones
    : rawZones;
  const zoneList = Array.isArray(zones) ? zones : [];
  const zoneById = new Map(zoneList.map((z) => [normId(z.KhuVucID), z]));
  const standingEntries = Object.entries(standing || {}).filter(([code, qty]) => {
    return Number(qty) > 0 && zoneList.some((z) => z.MaKhuVuc === code);
  });
  const seatList = Array.isArray(selectedSeats) ? selectedSeats : [];
  const onlyOneLine = seatList.length + standingEntries.length === 1;
  const recordLevel = onlyOneLine ? lockedPrice(holdRecord?.DonGiaChot) : null;

  const seats = seatList.map((seat) => {
    const zone = zoneById.get(normId(seat.KhuVucID));
    const item = items.find((it) => it && it.ticketCode && it.ticketCode === seat.MaGheDayDu);
    const locked = lockedPrice(item?.DonGiaChot) ?? recordLevel;
    const display = isValidPrice(seat.GiaVeNiemYet) ? seat.GiaVeNiemYet : Number(zone?.GiaVeNiemYet) || 0;
    return {
      GheID: seat.GheID,
      MaGheDayDu: seat.MaGheDayDu,
      KhuVucID: seat.KhuVucID,
      zoneCode: zone?.MaKhuVuc ?? '',
      unitPrice: locked ?? display,
      serverLocked: locked !== null,
    };
  });

  const standingLines = standingEntries.map(([zoneCode, rawQty]) => {
    const quantity = Number(rawQty);
    const zone = zoneList.find((z) => z.MaKhuVuc === zoneCode);
    const item = items.find((it) => it && !it.ticketCode && it.zoneCode === zoneCode);
    const locked = lockedPrice(item?.DonGiaChot) ?? recordLevel;
    const unitPrice = locked ?? (Number(zone?.GiaVeNiemYet) || 0);
    return {zoneCode, quantity, unitPrice, subtotal: unitPrice * quantity, serverLocked: locked !== null};
  });

  const seatTotal = seats.reduce((sum, s) => sum + s.unitPrice, 0);
  const standingTotal = standingLines.reduce((sum, l) => sum + l.subtotal, 0);
  const lineCount = seats.length + standingLines.length;
  const hasServerLockedPrice =
    lineCount > 0 && seats.every((s) => s.serverLocked) && standingLines.every((l) => l.serverLocked);

  return {
    seats,
    standingLines,
    seatTotal,
    standingTotal,
    total: seatTotal + standingTotal,
    hasServerLockedPrice,
    note: hasServerLockedPrice ? HELD_PRICE_NOTE_SERVER : HELD_PRICE_NOTE_CLIENT,
  };
}

// ---- Trạng thái kết nối giá ----

/**
 * Mô tả trạng thái kết nối giá bằng chữ, độc lập với kết nối ghế.
 * CONNECTING lần đầu (chưa từng kết nối) không hiện; sau khi từng kết nối thì là "đang kết nối lại".
 * @returns {{visible: boolean, tone: 'ok'|'info'|'warning'|'error', text: string}}
 */
export function describePriceConnectionStatus(status, {hasConnectedBefore = false} = {}) {
  switch (status) {
    case 'DISCONNECTED':
      return {visible: true, tone: 'warning', text: 'Kết nối giá vé đang gián đoạn · Đang kết nối lại…'};
    case 'ERROR':
      return {visible: true, tone: 'error', text: 'Chưa thể đồng bộ giá trực tiếp · Đang thử kết nối lại…'};
    case 'CONNECTING':
      return hasConnectedBefore
        ? {visible: true, tone: 'warning', text: 'Kết nối giá vé đang gián đoạn · Đang kết nối lại…'}
        : {visible: false, tone: 'info', text: 'Đang kết nối giá trực tiếp…'};
    case 'LOCAL_ONLY':
      return {visible: true, tone: 'info', text: 'Giá chỉ đồng bộ trong tab này (chế độ mô phỏng).'};
    case 'CONNECTED':
      return {visible: false, tone: 'ok', text: 'Giá vé được cập nhật trực tiếp.'};
    default:
      return {visible: false, tone: 'info', text: ''};
  }
}
