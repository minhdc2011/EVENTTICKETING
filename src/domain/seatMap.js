// @ts-check

/**
 * @file seatMap.js
 * Pure domain logic for EventTicketing React seat map:
 * - Seat status mapping & taxonomy
 * - Selectability & 4-seat cap evaluation
 * - Selection immutability & total calculations
 * - Realtime update reconciliation & lost seat detection
 * - Hold countdown derivation
 * - Deterministic geometric zone layout derivation for stadium overview
 */

/**
 * Database seat status to UI status map.
 */
export const DATABASE_STATUS_MAP = Object.freeze({
  TRONG: 'available',
  DA_BAN: 'sold',
  DANG_GIU: 'held',
  KHONG_MO_BAN: 'blocked',
});

/**
 * UI status Vietnamese display labels.
 */
export const STATUS_NAMES = Object.freeze({
  available: 'Còn trống',
  sold: 'Đã bán',
  held: 'Đang giữ',
  selected: 'Đã chọn',
  blocked: 'Không mở bán',
});

/**
 * Visual symbols/glyphs for seat states.
 */
export const STATUS_GLYPHS = Object.freeze({
  available: '',
  sold: '×',
  held: '◷',
  selected: '✓',
  blocked: '−',
});

/**
 * Maximum seats allowed per reservation.
 */
export const MAX_SELECTION_CAP = 4;

/**
 * Maps a database seat status and local selection state to a UI status.
 * @param {string | undefined} dbStatus
 * @param {boolean} [isSelected=false]
 * @returns {'available' | 'sold' | 'held' | 'selected' | 'blocked'}
 */
export function mapSeatStatus(dbStatus, isSelected = false) {
  if (isSelected) return 'selected';
  if (!dbStatus) return 'blocked';
  return DATABASE_STATUS_MAP[dbStatus] || 'blocked';
}

/**
 * Evaluates whether a seat can be selected based on sale state, pending lock, active hold, and seat status.
 * @param {{
 *   status: string | undefined,
 *   saleOpen: boolean,
 *   isPending?: boolean,
 *   hasActiveHold?: boolean,
 * }} options
 * @returns {boolean}
 */
export function isSeatSelectable({status, saleOpen, isPending = false, hasActiveHold = false}) {
  if (!saleOpen || isPending || hasActiveHold) return false;
  return status === 'TRONG' || status === 'available';
}

/**
 * Evaluates whether an interaction to toggle a seat is permitted and why.
 * @param {{
 *   seat: { GheID?: number | string, MaGheDayDu: string, TrangThai: string, GiaVeNiemYet?: number },
 *   selectedSeats: Array<{ GheID?: number | string, MaGheDayDu: string }>,
 *   maxCap?: number,
 *   saleOpen: boolean,
 *   isPending?: boolean,
 *   hasActiveHold?: boolean,
 * }} options
 * @returns {{
 *   allowed: boolean,
 *   action?: 'ADD' | 'REMOVE',
 *   reason?: 'CLOSED' | 'HOLD_ACTIVE' | 'UNAVAILABLE' | 'MAX_CAP_REACHED',
 *   message?: string
 * }}
 */
export function evaluateSeatSelection({
  seat,
  selectedSeats,
  maxCap = MAX_SELECTION_CAP,
  saleOpen,
  isPending = false,
  hasActiveHold = false,
}) {
  if (!saleOpen) {
    return {
      allowed: false,
      reason: 'CLOSED',
      message: 'Sự kiện đã đóng bán. Sơ đồ chỉ để xem, không thể chọn hoặc giữ ghế.',
    };
  }

  if (hasActiveHold || isPending) {
    return {
      allowed: false,
      reason: 'HOLD_ACTIVE',
      message: 'Hãy hủy giữ ghế trước khi thay đổi lựa chọn.',
    };
  }

  const isAlreadySelected = selectedSeats.some(
    (s) => s.MaGheDayDu === seat.MaGheDayDu || (seat.GheID != null && s.GheID === seat.GheID)
  );

  if (isAlreadySelected) {
    return {allowed: true, action: 'REMOVE'};
  }

  if (seat.TrangThai !== 'TRONG') {
    const uiStatus = mapSeatStatus(seat.TrangThai, false);
    const label = STATUS_NAMES[uiStatus] || 'Không khả dụng';
    return {
      allowed: false,
      reason: 'UNAVAILABLE',
      message: `${seat.MaGheDayDu}: ${label}. Vui lòng chọn ghế khác.`,
    };
  }

  if (selectedSeats.length >= maxCap) {
    return {
      allowed: false,
      reason: 'MAX_CAP_REACHED',
      message: `Bạn có thể chọn tối đa ${maxCap} vé. Bỏ một ghế để chọn ghế khác.`,
    };
  }

  return {allowed: true, action: 'ADD'};
}

/**
 * Toggles a seat in the selection array safely and immutably respecting max cap.
 * @template {{ MaGheDayDu: string, GheID?: number | string }} T
 * @param {T[]} selectedSeats
 * @param {T} seat
 * @param {number} [maxCap=MAX_SELECTION_CAP]
 * @returns {T[]}
 */
export function toggleSeatSelection(selectedSeats, seat, maxCap = MAX_SELECTION_CAP) {
  const index = selectedSeats.findIndex(
    (s) => s.MaGheDayDu === seat.MaGheDayDu || (seat.GheID != null && s.GheID === seat.GheID)
  );

  if (index >= 0) {
    return selectedSeats.filter((_, i) => i !== index);
  }

  if (selectedSeats.length >= maxCap) {
    return selectedSeats;
  }

  return [...selectedSeats, seat];
}

/**
 * Calculates total monetary price for selected seats.
 * @param {Array<{ GiaVeNiemYet?: number | null }>} selectedSeats
 * @returns {number}
 */
export function calculateSelectionTotal(selectedSeats) {
  if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) return 0;
  return selectedSeats.reduce((sum, s) => sum + (Number(s.GiaVeNiemYet) || 0), 0);
}

/**
 * Formats a number to Vietnamese Dong string with ' ₫' suffix.
 * @param {number | null | undefined} amount
 * @returns {string}
 */
export function formatMoneyVND(amount) {
  const num = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat('vi-VN').format(num)} ₫`;
}

/**
 * Groups seats by zone ID and rows.
 * @param {Array<any>} seats
 * @param {Array<any>} zones
 * @returns {Array<{
 *   zone: any,
 *   availableCount: number,
 *   rows: Array<{ rowLabel: string, seats: Array<any> }>
 * }>}
 */
export function groupSeatsByZoneAndRow(seats, zones) {
  if (!Array.isArray(zones)) return [];
  const seatsList = Array.isArray(seats) ? seats : [];

  return zones.map((zone) => {
    const zoneSeats = seatsList.filter((s) => s.KhuVucID === zone.KhuVucID);
    const availableCount = zoneSeats.filter((s) => s.TrangThai === 'TRONG').length;

    // Group by row
    const rowMap = new Map();
    for (const seat of zoneSeats) {
      const row = seat.SoHang || '1';
      if (!rowMap.has(row)) {
        rowMap.set(row, []);
      }
      rowMap.get(row).push(seat);
    }

    // Sort rows alphabetically/numerically
    const sortedRowLabels = Array.from(rowMap.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, {numeric: true})
    );

    const rows = sortedRowLabels.map((rowLabel) => {
      const rowSeats = rowMap.get(rowLabel) || [];
      // Sort seats in row by SoGhe
      rowSeats.sort((a, b) =>
        String(a.SoGhe || a.MaGheDayDu).localeCompare(String(b.SoGhe || b.MaGheDayDu), undefined, {numeric: true})
      );
      return {rowLabel, seats: rowSeats};
    });

    return {
      zone,
      availableCount,
      rows,
    };
  });
}

/**
 * Filters seats by text query matching code, row, or zone name.
 * @param {Array<any>} seats
 * @param {string} query
 * @returns {Array<any>}
 */
export function filterSeatsByQuery(seats, query) {
  if (!Array.isArray(seats)) return [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return seats;

  return seats.filter((s) => {
    const code = (s.MaGheDayDu || '').toLowerCase();
    const row = (s.SoHang || '').toLowerCase();
    const zone = (s.TenKhuVuc || '').toLowerCase();
    return code.includes(q) || row.includes(q) || zone.includes(q);
  });
}

/**
 * Resolves the zone ID of the first seat matching the given query string.
 * @param {Array<any>} seats
 * @param {string} query
 * @returns {number | null}
 */
export function findZoneForSeatQuery(seats, query) {
  if (!Array.isArray(seats)) return null;
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;

  const found = seats.find((s) => (s.MaGheDayDu || '').toLowerCase().includes(q));
  return found ? found.KhuVucID : null;
}

/**
 * Applies a show-scoped realtime update to the ticketing catalog.
 * @param {{ zones: any[], seats: any[] }} catalog
 * @param {{ seatId?: number | string, seatCode: string, status: string }} updateEvent
 * @returns {{ zones: any[], seats: any[] }}
 */
export function reconcileSeatUpdate(catalog, updateEvent) {
  if (!catalog || !Array.isArray(catalog.seats)) return catalog;
  if (!updateEvent || !updateEvent.seatCode) return catalog;

  const updatedSeats = catalog.seats.map((seat) => {
    const isMatch =
      seat.MaGheDayDu === updateEvent.seatCode ||
      (updateEvent.seatId != null && seat.GheID === updateEvent.seatId);

    if (isMatch) {
      return {
        ...seat,
        TrangThai: updateEvent.status,
      };
    }
    return seat;
  });

  return {
    ...catalog,
    seats: updatedSeats,
  };
}

/**
 * Checks if a realtime seat update affects any currently selected seats.
 * If the seat became unavailable, removes it from selection and generates announcement.
 * Preserves DANG_GIU updates for seats belonging to the user's own active hold.
 * @template {{ MaGheDayDu: string, GheID?: number | string }} T
 * @param {T[]} selectedSeats
 * @param {{ seatId?: number | string, seatCode: string, status: string }} updateEvent
 * @param {Iterable<string> | null} [ownHeldSeatCodes=null]
 * @returns {{
 *   updatedSelection: T[],
 *   lostSeat: T | null,
 *   message: string | null
 * }}
 */
export function reconcileSelectionAfterUpdate(selectedSeats, updateEvent, ownHeldSeatCodes = null) {
  if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
    return {updatedSelection: selectedSeats, lostSeat: null, message: null};
  }

  const lostIndex = selectedSeats.findIndex(
    (s) =>
      s.MaGheDayDu === updateEvent.seatCode ||
      (updateEvent.seatId != null && s.GheID === updateEvent.seatId)
  );

  if (lostIndex < 0) {
    return {updatedSelection: selectedSeats, lostSeat: null, message: null};
  }

  // If this update is DANG_GIU and matches one of the user's OWN held seats, preserve it
  if (updateEvent.status === 'DANG_GIU' && ownHeldSeatCodes) {
    const ownCodes =
      ownHeldSeatCodes instanceof Set
        ? ownHeldSeatCodes
        : new Set(Array.from(ownHeldSeatCodes));

    if (ownCodes.has(updateEvent.seatCode)) {
      return {updatedSelection: selectedSeats, lostSeat: null, message: null};
    }
  }

  // If status is not 'TRONG', seat is no longer available to user
  if (updateEvent.status !== 'TRONG') {
    const lostSeat = selectedSeats[lostIndex];
    const updatedSelection = selectedSeats.filter((_, i) => i !== lostIndex);
    const message = `Ghế ${updateEvent.seatCode} vừa được bán hoặc giữ và đã được bỏ khỏi lựa chọn. Vui lòng chọn ghế khác.`;
    return {
      updatedSelection,
      lostSeat,
      message,
    };
  }

  return {updatedSelection: selectedSeats, lostSeat: null, message: null};
}

/**
 * Reconciles current selection against a newly refreshed catalog (e.g. after a 409 conflict).
 * Removes seats that are no longer 'TRONG' in the refreshed catalog.
 * @template {{ MaGheDayDu: string, GheID?: number | string }} T
 * @param {T[]} selectedSeats
 * @param {{ seats?: Array<{ MaGheDayDu: string, GheID?: number | string, TrangThai: string }> } | null | undefined} catalog
 * @returns {{
 *   validSelection: T[],
 *   removedSeats: T[],
 *   message: string | null
 * }}
 */
export function reconcileSelectionWithCatalog(selectedSeats, catalog) {
  if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
    return {validSelection: [], removedSeats: [], message: null};
  }
  const catalogSeats = Array.isArray(catalog?.seats) ? catalog.seats : [];
  const freshMap = new Map();
  for (const s of catalogSeats) {
    if (s.MaGheDayDu) freshMap.set(s.MaGheDayDu, s);
    if (s.GheID != null) freshMap.set(String(s.GheID), s);
  }

  const validSelection = [];
  const removedSeats = [];

  for (const seat of selectedSeats) {
    const fresh =
      freshMap.get(seat.MaGheDayDu) ||
      (seat.GheID != null ? freshMap.get(String(seat.GheID)) : null);

    if (fresh && fresh.TrangThai === 'TRONG') {
      validSelection.push(fresh);
    } else {
      removedSeats.push(seat);
    }
  }

  const message =
    removedSeats.length > 0
      ? `Một số ghế (${removedSeats.map((s) => s.MaGheDayDu).join(', ')}) không còn khả dụng và đã được bỏ khỏi lựa chọn.`
      : null;

  return {validSelection, removedSeats, message};
}

/**
 * Resolves hold request items from selected seats and loaded catalog zones.
 * Maps each selected seat to { ticketCode: seat.MaGheDayDu, zoneCode: zone.MaKhuVuc }.
 * If any seat has an unresolvable or missing zoneCode, returns a failure without fallback.
 * @template {{ KhuVucID: number, MaGheDayDu: string }} T
 * @param {T[]} selectedSeats
 * @param {Array<{ KhuVucID: number, MaKhuVuc?: string }>} zones
 * @returns {{
 *   success: true,
 *   items: Array<{ ticketCode: string, zoneCode: string }>
 * } | {
 *   success: false,
 *   unresolvedSeat: T,
 *   error: string
 * }}
 */
export function buildHoldItems(selectedSeats, zones) {
  if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
    return {success: true, items: []};
  }

  const zoneMap = new Map();
  if (Array.isArray(zones)) {
    for (const z of zones) {
      if (z && z.KhuVucID != null && typeof z.MaKhuVuc === 'string' && z.MaKhuVuc.trim()) {
        zoneMap.set(z.KhuVucID, z.MaKhuVuc.trim());
      }
    }
  }

  const items = [];
  for (const seat of selectedSeats) {
    const zoneCode = zoneMap.get(seat.KhuVucID);
    if (!zoneCode) {
      return {
        success: false,
        unresolvedSeat: seat,
        error: `Không thể xác định mã phân khu hợp lệ (MaKhuVuc) cho ghế ${seat.MaGheDayDu}. Vui lòng tải lại sơ đồ trước khi giữ ghế.`,
      };
    }
    items.push({
      ticketCode: seat.MaGheDayDu,
      zoneCode,
    });
  }

  return {success: true, items};
}

/**
 * Calculates remaining seconds from server expiresAt ISO string.
 * @param {string | null | undefined} expiresAt
 * @param {number} [nowMs=Date.now()]
 * @returns {number}
 */
export function calculateRemainingSeconds(expiresAt, nowMs = Date.now()) {
  if (!expiresAt) return 0;
  const targetMs = new Date(expiresAt).getTime();
  if (Number.isNaN(targetMs)) return 0;
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

/**
 * Formats seconds into mm:ss string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Helper to build an SVG arc sector path around a center point (cx, cy).
 * @param {number} cx
 * @param {number} cy
 * @param {number} rInner
 * @param {number} rOuter
 * @param {number} startAngleDeg
 * @param {number} endAngleDeg
 * @returns {string}
 */
function describeArcSector(cx, cy, rInner, rOuter, startAngleDeg, endAngleDeg) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const a1 = toRad(startAngleDeg);
  const a2 = toRad(endAngleDeg);
  const x1 = cx + rOuter * Math.sin(a1);
  const y1 = cy + rOuter * Math.cos(a1);
  const x2 = cx + rOuter * Math.sin(a2);
  const y2 = cy + rOuter * Math.cos(a2);
  const x3 = cx + rInner * Math.sin(a2);
  const y3 = cy + rInner * Math.cos(a2);
  const x4 = cx + rInner * Math.sin(a1);
  const y4 = cy + rInner * Math.cos(a1);
  const largeArc = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
}

/**
 * Computes deterministic, non-overlapping SVG geometries for any number of zones
 * arranged facing the stage in an accessible tiered stadium overview.
 * @param {Array<any>} zones
 * @param {number} [cx=380]
 * @param {number} [cy=60]
 * @returns {Array<{
 *   zone: any,
 *   svgPath: string,
 *   center: [number, number],
 *   tier: number,
 * }>}
 */
export function computeZoneLayouts(zones, cx = 380, cy = 60) {
  if (!Array.isArray(zones) || zones.length === 0) return [];

  const n = zones.length;

  // Partition zones into 1, 2, or 3 concentric tiers
  /** @type {Array<Array<any>>} */
  let tiers = [];

  if (n <= 4) {
    tiers = [zones];
  } else if (n <= 7) {
    const tier1Count = Math.floor(n / 2);
    tiers = [zones.slice(0, tier1Count), zones.slice(tier1Count)];
  } else {
    // 8 or more zones (e.g. Super Concert)
    tiers = [zones.slice(0, 2), zones.slice(2, 5), zones.slice(5)];
  }

  // Radii configurations for tiers
  const tierRadii = [
    {rInner: 140, rOuter: 220},
    {rInner: 232, rOuter: 305},
    {rInner: 317, rOuter: 385},
  ];

  const results = [];

  tiers.forEach((tierZones, tierIdx) => {
    const radii = tierRadii[tierIdx] || {rInner: 140 + tierIdx * 90, rOuter: 220 + tierIdx * 90};
    const count = tierZones.length;

    // Angular span from -60 to +60 degrees
    const totalSpan = 116; // from -58 to +58
    const gap = count > 1 ? 4 : 0;
    const availableSpan = totalSpan - (count - 1) * gap;
    const sectorSpan = availableSpan / count;

    let start = -58;
    for (let i = 0; i < count; i++) {
      const zone = tierZones[i];
      const end = start + sectorSpan;

      const path = describeArcSector(cx, cy, radii.rInner, radii.rOuter, start, end);

      const midAngleRad = (((start + end) / 2) * Math.PI) / 180;
      const midRadius = (radii.rInner + radii.rOuter) / 2;
      const labelX = Math.round(cx + midRadius * Math.sin(midAngleRad));
      const labelY = Math.round(cy + midRadius * Math.cos(midAngleRad));

      results.push({
        zone,
        svgPath: path,
        center: /** @type {[number, number]} */ ([labelX, labelY]),
        tier: tierIdx + 1,
      });

      start = end + gap;
    }
  });

  return results;
}
