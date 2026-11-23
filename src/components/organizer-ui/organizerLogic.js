import {CATEGORY_ORGANIZER_LABELS} from '../../domain/categories.js';
export function getDefaultDraftDates() {
  const now = new Date();
  const addDays = (d, days, hours = 19, minutes = 0) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    next.setHours(hours, minutes, 0, 0);
    return next;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const format = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    startsAt: format(addDays(now, 15, 19, 0)),
    endsAt: format(addDays(now, 15, 22, 30)),
    saleStartsAt: format(addDays(now, 1, 9, 0)),
    saleEndsAt: format(addDays(now, 14, 23, 59)),
  };
}

export function toSlug(value) {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const ROLE_LABELS = {
  CHU_SO_HUU: 'Chủ sở hữu',
  QUAN_TRI: 'Quản trị viên',
  BIEN_TAP: 'Biên tập viên',
  VAN_HANH: 'Vận hành (Chỉ xem)',
  SOAT_VE: 'Soát vé (Chỉ xem)',
};

export const CATEGORY_LABELS = CATEGORY_ORGANIZER_LABELS;

export const LOCATION_MODE_LABELS = {
  OFFLINE: 'Trực tiếp tại địa điểm (Offline)',
  ONLINE: 'Trực tuyến (Online)',
  HYBRID: 'Kết hợp trực tiếp & trực tuyến (Hybrid)',
  TBA: 'Địa điểm sẽ thông báo sau (TBA)',
};

export const WIZARD_STEP_TITLES = [
  'Thông tin',
  'Địa điểm',
  'Hạng vé',
  'Hình ảnh',
  'Quy định',
  'Xuất bản',
];

/**
 * Maps a readiness blocker field key to its originating step (1..5).
 * @param {string | undefined} field
 * @returns {number}
 */
export function getStepForBlockerField(field) {
  const key = String(field || '');
  if (key === 'name' || key === 'slug' || key === 'category' || key === 'description') return 1;
  if (
    key === 'location' ||
    key === 'onlineLink' ||
    key === 'shows' ||
    key.endsWith('.time') ||
    key.startsWith('schedule[')
  ) {
    return 2;
  }
  if (key.endsWith('.tiers') || key === 'tiers') return 3;
  if (
    key === 'bannerUrl' ||
    key === 'posterUrl' ||
    key === 'seatingMapUrl' ||
    key === 'trailerUrl' ||
    key.startsWith('artists[')
  ) {
    return 4;
  }
  if (key === 'contactEmail' || key === 'contactHotline' || key === 'refundPolicy') return 5;
  return 1;
}

/**
 * Evaluates actual per-step completion based on readiness blockers rather than active tab index.
 * @param {{ blockers?: Array<{ field?: string }>, isReady?: boolean } | null | undefined} readiness
 * @returns {boolean[]}
 */
export function evaluateWizardStepsCompletion(readiness) {
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const brokenSteps = new Set(blockers.map((b) => getStepForBlockerField(b?.field)));
  return [
    !brokenSteps.has(1),
    !brokenSteps.has(2),
    !brokenSteps.has(3),
    !brokenSteps.has(4),
    !brokenSteps.has(5),
    Boolean(readiness?.isReady),
  ];
}
