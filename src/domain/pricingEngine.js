/**
 * Engine định giá động thuần (Sprint 2, FR-T4-04), mô hình 5 bước theo
 * .multiagent/briefs/sprint2-spec.md mục 2. Không I/O, không đọc môi trường,
 * không sửa đầu vào. Dùng chung cho RPC, chế độ mock và script chu kỳ giá.
 */

export const PRICING_DEFAULTS = Object.freeze({
  maxChange: 0.2,
  step: 10000,
  lowFill: 0.3,
  highFill: 0.6,
  wFill: 1,
  wVelocity: 1,
  wTime: 1,
});

// Các mốc không có cột trong QUY_TAC_GIA: dùng hằng số của spec.
const TIME_NEAR_HOURS = 72;
const TIME_FAR_HOURS = 168;
const TIME_NEAR_HIGH_FILL = 0.7;
const TIME_NEAR_LOW_FILL = 0.4;
const EPS = 1e-9;
const MAX_CHANGE_TOLERANCE = 1e-6;

/** Chuyển về số hữu hạn; trả NaN nếu không hợp lệ (null, chuỗi rác, boolean...). */
function toNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/** Thiếu (null/undefined/'') thì lấy mặc định; có nhưng rác thì NaN (để engine báo dữ liệu không hợp lệ). */
function pick(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  return toNum(value);
}

function pickOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = toNum(value);
  return Number.isFinite(n) ? n : NaN;
}

const norm = (x) => Math.round(x * 1e9) / 1e9;
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

/**
 * Ánh xạ một dòng QUY_TAC_GIA sang tham số engine. NUMERIC có thể về dạng chuỗi.
 * Cột thiếu lấy mặc định; GiaGoc/GiaSan/GiaTran thiếu thì null (engine báo không hợp lệ).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function ruleFromQuyTacGia(row) {
  const r = row && typeof row === 'object' ? row : {};
  return {
    basePrice: pickOrNull(r.GiaGoc),
    floor: pickOrNull(r.GiaSan),
    ceiling: pickOrNull(r.GiaTran),
    step: pick(r.BuocNhayGia, PRICING_DEFAULTS.step),
    maxChange: pick(r.BienDoToiDaMoiChuKy, PRICING_DEFAULTS.maxChange),
    lowFill: pick(r.NguongLapDayThap, PRICING_DEFAULTS.lowFill),
    highFill: pick(r.NguongLapDayCao, PRICING_DEFAULTS.highFill),
    wFill: pick(r.TrongSoLapDay, PRICING_DEFAULTS.wFill),
    wVelocity: pick(r.TrongSoTocDoBan, PRICING_DEFAULTS.wVelocity),
    wTime: pick(r.TrongSoThoiGian, PRICING_DEFAULTS.wTime),
    active: r.TrangThaiKichHoat !== false,
  };
}

/** r = clamp((sold + 0,5 × hold) / total, 0, 1). total ≤ 0 hoặc dữ liệu rác → null. */
export function fillRate(totalSeats, soldSeats, heldSeats = 0) {
  const total = toNum(totalSeats);
  const sold = toNum(soldSeats);
  const held = heldSeats === null || heldSeats === undefined ? 0 : toNum(heldSeats);
  if (!(total > 0) || !Number.isFinite(sold) || !Number.isFinite(held) || sold < 0 || held < 0) return null;
  return clamp((sold + 0.5 * held) / total, 0, 1);
}

/** Δr theo ngưỡng cấu hình: r<low → -0,15·(low-r)/low; low≤r≤high → 0; r>high → +0,30·(r-high)/(1-high). */
export function deltaFill(r, lowFill = PRICING_DEFAULTS.lowFill, highFill = PRICING_DEFAULTS.highFill) {
  if (r < lowFill) return (-0.15 * (lowFill - r)) / lowFill;
  if (r > highFill) return (0.3 * (r - highFill)) / (1 - highFill);
  return 0;
}

/** Δv = clamp(0,10 × (u − 1), −0,10, +0,20). */
export function deltaVelocity(u) {
  return clamp(0.1 * (u - 1), -0.1, 0.2);
}

/** Δt: T≤72 và r≥0,70 → +0,08; T≤72 và r<0,40 → −0,12; 72<T≤168 và r<0,30 → −0,05; còn lại 0. */
export function deltaTime(hoursRemaining, r) {
  if (hoursRemaining <= TIME_NEAR_HOURS) {
    if (r >= TIME_NEAR_HIGH_FILL) return 0.08;
    if (r < TIME_NEAR_LOW_FILL) return -0.12;
    return 0;
  }
  if (hoursRemaining <= TIME_FAR_HOURS && r < 0.3) return -0.05;
  return 0;
}

const EMPTY_INTERMEDIATE = Object.freeze({
  fillRate: null,
  u: null,
  deltaFill: null,
  deltaVelocity: null,
  deltaTime: null,
  deltaTotal: null,
  rawPrice: null,
  boundedPrice: null,
  roundedPrice: null,
});

function skipped(reasons, warnings = [], intermediate = EMPTY_INTERMEDIATE) {
  return {
    shouldPropose: false,
    skipReasons: reasons,
    warnings,
    intermediate: { ...intermediate },
    proposedPrice: null,
    alertType: 'BINH_THUONG',
    outOfRangeClamped: false,
    changeRatio: null,
    exceedsMaxChange: false,
  };
}

/** Tràn số: giữ các trung gian hữu hạn đã tính, trường không hữu hạn → null; không đề xuất. */
function overflow(warnings, partial) {
  const safe = { ...EMPTY_INTERMEDIATE };
  for (const key of Object.keys(safe)) {
    const v = partial[key];
    safe[key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return skipped(['TRAN_SO_KHI_TINH'], warnings, safe);
}

/**
 * Tính đề xuất giá cho một khu vực. Thứ tự cố định, không đảo để né PriceGuard:
 * r → Δr/Δv/Δt → raw → giới hạn biên độ → làm tròn theo S → chặn sàn/trần → deadband.
 *
 * Quy tắc cảnh báo (kể cả sàn = trần): xét trần trước. roundedPrice ≥ ceiling →
 * CHAM_GIA_TRAN; ngược lại roundedPrice ≤ floor → CHAM_GIA_SAN; còn lại BINH_THUONG.
 * Khi sàn = trần, proposedPrice luôn bằng giá đó, và cảnh báo là CHAM_GIA_TRAN
 * nếu rounded ≥ trần, CHAM_GIA_SAN nếu rounded < sàn.
 *
 * exceedsMaxChange = true khi làm tròn hoặc chặn sàn/trần đẩy giá cuối vượt biên độ.
 * Engine chỉ ghi nhận, PriceGuard phía máy chủ vẫn là nơi quyết định.
 *
 * Các giá trị trung gian (r, Δ, raw, bounded, rounded) là số thực thật, không làm tròn
 * trung gian; chỉ changeRatio (để hiển thị) được làm tròn 1e-9. Làm tròn duy nhất ảnh
 * hưởng quyết định là làm tròn theo S.
 *
 * proposedPrice là null khi không tính được; khi chỉ bị deadband/PENDING chặn thì vẫn
 * có giá tính được nhưng shouldPropose = false.
 *
 * Lý do bỏ qua: DU_LIEU_KHONG_HOP_LE (quy tắc/giá/ghế sai, gồm maxChange > 1 và
 * giá gốc ngoài [sàn, trần]), DU_LIEU_TOC_DO_KHONG_HOP_LE (velocityRatio, targetVelocity
 * hoặc actualVelocity có nhưng không phải số hữu hạn ≥ 0; kiểm tra ở mọi nhánh, kể cả
 * khi targetVelocity = 0/thiếu hoặc đã có velocityRatio), TRAN_SO_KHI_TINH (có giá trị
 * tính ra không hữu hạn), THIEU_DU_LIEU_TOC_DO (không có velocityRatio hợp lệ và thiếu
 * targetVelocity, hoặc targetVelocity > 0 mà thiếu actualVelocity; thiếu = null/undefined/'';
 * trả proposedPrice = null, intermediate chỉ có fillRate), KHONG_CO_GHE,
 * QUY_TAC_KHONG_KICH_HOAT, CHENH_LECH_DUOI_BUOC_NHAY, DA_CO_DE_XUAT_PENDING.
 * targetVelocity = 0 là số hợp lệ, khác dữ liệu thiếu: chỉ cảnh báo, u = null, Δv = 0, vẫn tính giá.
 * Kết quả không chứa NaN/Infinity.
 * Cảnh báo: KHONG_CO_TOC_DO_KY_VONG, KHONG_CO_SO_LIEU_TOC_DO, SAN_BANG_TRAN,
 * GIA_HIEN_HANH_NGOAI_KHUNG, VUOT_BIEN_DO_SAU_LAM_TRON_HOAC_CHAN.
 *
 * @param {object} input
 */
export function computePriceProposal(input) {
  if (!input || typeof input !== 'object' || !input.rule || typeof input.rule !== 'object') {
    return skipped(['DU_LIEU_KHONG_HOP_LE']);
  }
  const rule = input.rule;
  if (rule.active === false) return skipped(['QUY_TAC_KHONG_KICH_HOAT']);

  const p0 = toNum(rule.basePrice);
  const floor = toNum(rule.floor);
  const ceiling = toNum(rule.ceiling);
  const step = pick(rule.step, PRICING_DEFAULTS.step);
  const maxChange = pick(rule.maxChange, PRICING_DEFAULTS.maxChange);
  const lowFill = pick(rule.lowFill, PRICING_DEFAULTS.lowFill);
  const highFill = pick(rule.highFill, PRICING_DEFAULTS.highFill);
  const wFill = pick(rule.wFill, PRICING_DEFAULTS.wFill);
  const wVelocity = pick(rule.wVelocity, PRICING_DEFAULTS.wVelocity);
  const wTime = pick(rule.wTime, PRICING_DEFAULTS.wTime);
  const pCur = toNum(input.currentPrice);
  const hours = toNum(input.hoursRemaining);

  // Ràng buộc QUY_TAC_GIA: GiaSan > 0, GiaSan ≤ GiaGoc ≤ GiaTran, BuocNhayGia > 0, 0 < BienDo ≤ 1.
  const invalid =
    !(p0 > 0) || !(floor > 0) || !(ceiling > 0) || floor > ceiling ||
    p0 < floor || p0 > ceiling ||
    !(pCur > 0) || !(step > 0) || !(maxChange > 0) || maxChange > 1 ||
    !(lowFill >= 0) || !(highFill <= 1) || !(lowFill < highFill) ||
    !(wFill >= 0) || !(wVelocity >= 0) || !(wTime >= 0) ||
    !(hours >= 0) ||
    ![step, maxChange, lowFill, highFill, wFill, wVelocity, wTime].every(Number.isFinite);
  if (invalid) return skipped(['DU_LIEU_KHONG_HOP_LE']);

  const total = toNum(input.totalSeats);
  if (Number.isFinite(total) && total <= 0) return skipped(['KHONG_CO_GHE']);
  const r = fillRate(input.totalSeats, input.soldSeats, input.heldSeats);
  if (r === null) return skipped(['DU_LIEU_KHONG_HOP_LE']);

  const warnings = [];

  // Tốc độ bán: có nhưng sai (ở bất kỳ nhánh nào) → bỏ qua; thiếu dữ liệu để tính u → bỏ qua;
  // targetVelocity = 0 là số hợp lệ → cảnh báo, Δv = 0.
  const vrGiven = pickOrNull(input.velocityRatio);
  const target = pickOrNull(input.targetVelocity);
  const actual = pickOrNull(input.actualVelocity);
  for (const x of [vrGiven, target, actual]) {
    if (x !== null && !(x >= 0)) return skipped(['DU_LIEU_TOC_DO_KHONG_HOP_LE']);
  }
  let u = null;
  if (vrGiven !== null) {
    u = vrGiven;
  } else if (target === null) {
    // Không có u và không có tốc độ kỳ vọng → thiếu dữ liệu, bỏ qua (không giả định Δv = 0).
    return skipped(['THIEU_DU_LIEU_TOC_DO'], ['KHONG_CO_TOC_DO_KY_VONG'], { ...EMPTY_INTERMEDIATE, fillRate: r });
  } else if (target === 0) {
    // targetVelocity = 0 là số hợp lệ (khác thiếu dữ liệu): Δv = 0, vẫn tính giá.
    warnings.push('KHONG_CO_TOC_DO_KY_VONG');
  } else if (actual === null) {
    return skipped(['THIEU_DU_LIEU_TOC_DO'], ['KHONG_CO_SO_LIEU_TOC_DO'], { ...EMPTY_INTERMEDIATE, fillRate: r });
  } else {
    u = actual / target;
    if (!Number.isFinite(u)) {
      return overflow(warnings, { fillRate: r });
    }
  }

  const im = { ...EMPTY_INTERMEDIATE, fillRate: r, u };
  const dr = deltaFill(r, lowFill, highFill);
  // u === null ở đây chỉ còn xảy ra khi targetVelocity === 0 (hợp lệ): Δv = 0. Thiếu dữ liệu đã bị bỏ qua ở trên.
  const dv = u === null ? 0 : deltaVelocity(u);
  const dt = deltaTime(hours, r);
  Object.assign(im, { deltaFill: dr, deltaVelocity: dv, deltaTime: dt });
  const termFill = wFill * dr;
  const termVelocity = wVelocity * dv;
  const termTime = wTime * dt;
  if (![termFill, termVelocity, termTime].every(Number.isFinite)) return overflow(warnings, im);
  const deltaTotal = termFill + termVelocity + termTime;
  im.deltaTotal = deltaTotal;
  if (!Number.isFinite(deltaTotal)) return overflow(warnings, im);

  const rawPrice = p0 * (1 + deltaTotal);
  im.rawPrice = rawPrice;
  if (!Number.isFinite(rawPrice)) return overflow(warnings, im);
  const boundedPrice = clamp(rawPrice, pCur * (1 - maxChange), pCur * (1 + maxChange));
  im.boundedPrice = boundedPrice;
  if (!Number.isFinite(boundedPrice)) return overflow(warnings, im);
  const roundedPrice = Math.round(boundedPrice / step) * step;
  im.roundedPrice = roundedPrice;
  if (!Number.isFinite(roundedPrice)) return overflow(warnings, im);
  const proposedPrice = clamp(roundedPrice, floor, ceiling);

  let alertType = 'BINH_THUONG';
  if (roundedPrice >= ceiling) alertType = 'CHAM_GIA_TRAN';
  else if (roundedPrice <= floor) alertType = 'CHAM_GIA_SAN';

  const diff = proposedPrice - pCur;
  const changeRatio = norm(diff / pCur);
  if (![proposedPrice, diff, changeRatio].every(Number.isFinite)) return overflow(warnings, im);
  const exceedsMaxChange = Math.abs(diff) > pCur * maxChange + MAX_CHANGE_TOLERANCE;
  if (floor === ceiling) warnings.push('SAN_BANG_TRAN');
  if (pCur < floor || pCur > ceiling) warnings.push('GIA_HIEN_HANH_NGOAI_KHUNG');
  if (exceedsMaxChange) warnings.push('VUOT_BIEN_DO_SAU_LAM_TRON_HOAC_CHAN');

  const skipReasons = [];
  if (Math.abs(diff) + EPS < step) skipReasons.push('CHENH_LECH_DUOI_BUOC_NHAY');
  if (input.hasPendingProposal) skipReasons.push('DA_CO_DE_XUAT_PENDING');

  return {
    shouldPropose: skipReasons.length === 0,
    skipReasons,
    warnings,
    intermediate: { ...im },
    proposedPrice,
    alertType,
    outOfRangeClamped: proposedPrice !== roundedPrice,
    changeRatio,
    exceedsMaxChange,
  };
}
