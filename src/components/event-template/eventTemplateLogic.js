// @ts-check

export const SALE_STATUS = Object.freeze({
  UPCOMING: 'UPCOMING',
  ON_SALE: 'ON_SALE',
  SOLD_OUT: 'SOLD_OUT',
  CLOSED: 'CLOSED',
});

const CATEGORY_MAP = Object.freeze({
  AM_NHAC: 'Âm nhạc',
  HOI_THAO: 'Hội thảo',
  THE_THAO: 'Thể thao',
  SAN_KHAU: 'Sân khấu',
  WORKSHOP: 'Workshop',
  THAM_QUAN: 'Tham quan',
  TRIEN_LAM: 'Triển lãm',
  CONG_NGHE: 'Công nghệ',
  KHAC: 'Sự kiện khác',
});

const moneyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const dateShortFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/**
 * Formats a monetary amount into VND currency string.
 * @param {number | null | undefined} amount
 * @returns {string}
 */
export function formatMoney(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return 'Đang cập nhật';
  }
  if (amount === 0) {
    return '0 ₫ (Miễn phí)';
  }
  return moneyFormatter.format(amount);
}

/**
 * Formats an ISO date-time string into a localized Vietnamese string.
 * @param {string | null | undefined} isoString
 * @returns {string}
 */
export function formatEventDateTime(isoString) {
  if (!isoString) return 'Đang cập nhật';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return 'Đang cập nhật';
  return dateTimeFormatter.format(parsed);
}

/**
 * Formats an ISO date into short DD/MM/YYYY.
 * @param {string | null | undefined} isoString
 * @returns {string}
 */
export function formatDateShort(isoString) {
  if (!isoString) return 'Đang cập nhật';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return 'Đang cập nhật';
  return dateShortFormatter.format(parsed);
}

/**
 * Maps event category key into human-friendly Vietnamese label.
 * @param {string | null | undefined} categoryKey
 * @returns {string}
 */
export function getCategoryLabel(categoryKey) {
  if (!categoryKey) return 'Sự kiện';
  const normalized = String(categoryKey).trim().toUpperCase();
  if (normalized in CATEGORY_MAP) {
    return CATEGORY_MAP[normalized];
  }
  return normalized.replaceAll('_', ' ');
}

/**
 * Derives presentation meta for a given sale status.
 * @param {string | null | undefined} saleStatus
 * @returns {{label: string, tone: 'amber' | 'emerald' | 'rose' | 'slate', isLive: boolean}}
 */
export function getSaleStatusMeta(saleStatus) {
  switch (saleStatus) {
    case SALE_STATUS.ON_SALE:
      return {label: 'Đang mở bán', tone: 'emerald', isLive: true};
    case SALE_STATUS.UPCOMING:
      return {label: 'Sắp mở bán', tone: 'amber', isLive: false};
    case SALE_STATUS.SOLD_OUT:
      return {label: 'Hết vé', tone: 'rose', isLive: false};
    case SALE_STATUS.CLOSED:
      return {label: 'Đã đóng bán', tone: 'slate', isLive: false};
    default:
      return {label: 'Đang cập nhật', tone: 'slate', isLive: false};
  }
}

/**
 * Resolves background imagery with graceful fallbacks.
 * @param {string | null | undefined} bannerUrl
 * @param {string | null | undefined} posterUrl
 * @returns {{backgroundUrl: string | null, hasImage: boolean, posterUrl: string | null}}
 */
export function resolveEventBackdrop(bannerUrl, posterUrl) {
  const cleanBanner = bannerUrl && String(bannerUrl).trim() !== '' ? String(bannerUrl).trim() : null;
  const cleanPoster = posterUrl && String(posterUrl).trim() !== '' ? String(posterUrl).trim() : null;
  const backgroundUrl = cleanBanner || cleanPoster;
  return {
    backgroundUrl,
    hasImage: Boolean(backgroundUrl),
    posterUrl: cleanPoster || cleanBanner,
  };
}

/**
 * Parses tier description into structured benefit bullet points.
 * @param {string | null | undefined} description
 * @returns {string[]}
 */
export function parseTierBenefits(description) {
  if (!description || typeof description !== 'string') return [];
  const trimmed = description.trim();
  if (!trimmed) return [];

  // Check if newline-separated or bullet-separated
  if (trimmed.includes('\n')) {
    return trimmed
      .split('\n')
      .map((line) => line.replace(/^[-•*–—]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }

  if (trimmed.includes(';') || trimmed.includes('•')) {
    const separator = trimmed.includes(';') ? ';' : '•';
    return trimmed
      .split(separator)
      .map((item) => item.replace(/^[-•*–—]\s*/, '').trim())
      .filter((item) => item.length > 0);
  }

  return [trimmed];
}

/**
 * Calculates remaining time components to target ISO date.
 * @param {string | null | undefined} targetIso
 * @param {Date | number} [now]
 * @returns {{
 *   days: number,
 *   hours: number,
 *   minutes: number,
 *   seconds: number,
 *   totalMs: number,
 *   isPast: boolean,
 *   formatted: {days: string, hours: string, minutes: string, seconds: string}
 * }}
 */
export function calculateCountdown(targetIso, now = new Date()) {
  const zeroResult = {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalMs: 0,
    isPast: true,
    formatted: {days: '00', hours: '00', minutes: '00', seconds: '00'},
  };

  if (!targetIso) return zeroResult;
  const targetTime = new Date(targetIso).getTime();
  if (Number.isNaN(targetTime)) return zeroResult;

  const currentTime = typeof now === 'number' ? now : new Date(now).getTime();
  const diffMs = targetTime - currentTime;

  if (diffMs <= 0) return zeroResult;

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalMs: diffMs,
    isPast: false,
    formatted: {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
    },
  };
}

/**
 * Determines countdown target date and descriptive copy based on sale status.
 * @param {{
 *   saleStartsAt?: string,
 *   saleEndsAt?: string,
 *   startsAt?: string,
 * }} event
 * @param {string} saleStatus
 * @param {Date | number} [now]
 * @returns {{
 *   targetIso: string | null,
 *   heading: string,
 *   description: string,
 *   isActive: boolean
 * }}
 */
export function determineCountdownTarget(event, saleStatus, now = new Date()) {
  const currentTime = typeof now === 'number' ? now : new Date(now).getTime();

  if (saleStatus === SALE_STATUS.UPCOMING && event.saleStartsAt) {
    const saleStartMs = new Date(event.saleStartsAt).getTime();
    if (!Number.isNaN(saleStartMs) && saleStartMs > currentTime) {
      return {
        targetIso: event.saleStartsAt,
        heading: 'ĐẾM NGƯỢC GIỜ MỞ BÁN VÉ',
        description: 'Hệ thống sẽ chính thức mở bán vé trực tuyến',
        isActive: true,
      };
    }
  }

  if (saleStatus === SALE_STATUS.ON_SALE) {
    // If sale closing is specified and in the future, could target sale closing or event startsAt
    const startMs = event.startsAt ? new Date(event.startsAt).getTime() : 0;
    if (startMs > currentTime) {
      return {
        targetIso: event.startsAt || null,
        heading: 'SỰ KIỆN KHAI MẠC SAU',
        description: 'Đếm ngược thời gian diễn ra suất diễn chính thức',
        isActive: true,
      };
    }
  }

  if (saleStatus === SALE_STATUS.SOLD_OUT && event.startsAt) {
    const startMs = new Date(event.startsAt).getTime();
    if (startMs > currentTime) {
      return {
        targetIso: event.startsAt,
        heading: 'SỰ KIỆN KHAI MẠC SAU',
        description: 'Tất cả các hạng vé đã bán hết. Đếm ngược khai màn',
        isActive: true,
      };
    }
  }

  return {
    targetIso: null,
    heading: saleStatus === SALE_STATUS.CLOSED ? 'SỰ KIỆN ĐÃ KẾT THÚC' : 'THÔNG TIN BÁN VÉ',
    description:
      saleStatus === SALE_STATUS.CLOSED
        ? 'Thời gian bán vé và diễn ra sự kiện đã khép lại.'
        : 'Theo dõi thông tin chi tiết từ Ban tổ chức sự kiện.',
    isActive: false,
  };
}

/**
 * Checks whether the event provides at least one communication channel for booking assistance (hotline, email, or online URL).
 * @param {{contactHotline?: string, contactEmail?: string, onlineLink?: string} | null | undefined} event
 * @returns {boolean}
 */
export function hasAssistAction(event) {
  if (!event || typeof event !== 'object') return false;
  const hotline = Boolean(event.contactHotline && String(event.contactHotline).trim() !== '');
  const email = Boolean(event.contactEmail && String(event.contactEmail).trim() !== '');
  const online = Boolean(event.onlineLink && String(event.onlineLink).trim() !== '');
  return hotline || email || online;
}

/**
 * Resolves the state and action behavior of the primary booking CTA.
 * @param {{
 *   saleStatus: string,
 *   selectedTier: {available: number, price: number, name: string} | null,
 *   hasTiers: boolean,
 *   hasAssistAction?: boolean
 * }} params
 * @returns {{
 *   disabled: boolean,
 *   label: string,
 *   action: 'none' | 'upcoming' | 'closed' | 'sold_out' | 'select_tier' | 'tier_sold_out' | 'checkout_assist' | 'no_assist_channel',
 *   helperText: string
 * }}
 */
export function resolveCtaState({
  saleStatus,
  selectedTier,
  hasTiers,
  hasAssistAction = true,
}) {
  if (!hasTiers) {
    return {
      disabled: true,
      label: 'Đang cập nhật vé',
      action: 'none',
      helperText: 'Ban tổ chức đang cập nhật các hạng vé cho suất diễn này.',
    };
  }

  if (saleStatus === SALE_STATUS.UPCOMING) {
    return {
      disabled: true,
      label: 'Sắp mở bán',
      action: 'upcoming',
      helperText: 'Cổng bán vé trực tuyến chưa đến giờ mở bán chính thức.',
    };
  }

  if (saleStatus === SALE_STATUS.CLOSED) {
    return {
      disabled: true,
      label: 'Đã đóng bán',
      action: 'closed',
      helperText: 'Thời gian bán vé cho sự kiện này đã chính thức kết thúc.',
    };
  }

  if (saleStatus === SALE_STATUS.SOLD_OUT) {
    return {
      disabled: true,
      label: 'Hết vé',
      action: 'sold_out',
      helperText: 'Tất cả các hạng vé đã được phân phối hết.',
    };
  }

  if (saleStatus === SALE_STATUS.ON_SALE) {
    if (!selectedTier) {
      return {
        disabled: false,
        label: 'Chọn hạng vé',
        action: 'select_tier',
        helperText: 'Bấm chọn một hạng vé bên dưới để xem thông tin và liên hệ đặt vé.',
      };
    }

    if (selectedTier.available <= 0) {
      return {
        disabled: true,
        label: 'Hạng vé đã hết',
        action: 'tier_sold_out',
        helperText: 'Hạng vé đang chọn đã hết chỗ. Vui lòng chọn hạng vé khác.',
      };
    }

    if (!hasAssistAction) {
      return {
        disabled: true,
        label: 'Chưa có kênh liên hệ',
        action: 'no_assist_channel',
        helperText: 'Ban tổ chức chưa công bố kênh liên hệ hỗ trợ đặt vé cho sự kiện này.',
      };
    }

    return {
      disabled: false,
      label: 'Liên hệ đặt vé',
      action: 'checkout_assist',
      helperText: 'Cổng thanh toán tự động chưa kích hoạt. Bấm để nhận thông tin và hỗ trợ đặt vé từ Ban tổ chức.',
    };
  }

  return {
    disabled: true,
    label: 'Chưa khả dụng',
    action: 'none',
    helperText: 'Trạng thái sự kiện chưa sẵn sàng để đặt vé.',
  };
}

/**
 * Checks whether the event has any media items (trailer or seating map).
 * @param {{trailerUrl?: string, seatingMapUrl?: string}} event
 * @returns {boolean}
 */
export function hasMediaContent(event) {
  return Boolean(
    (event.trailerUrl && event.trailerUrl.trim() !== '') ||
    (event.seatingMapUrl && event.seatingMapUrl.trim() !== '')
  );
}

/**
 * Checks whether the event has venue or attendance instructions.
 * @param {{
 *   venueName?: string,
 *   address?: string,
 *   locationMode?: string,
 *   onlineLink?: string,
 *   onlineInstructions?: string
 * }} event
 * @returns {boolean}
 */
export function hasVenueContent(event) {
  return Boolean(
    (event.venueName && event.venueName.trim() !== '') ||
    (event.address && event.address.trim() !== '') ||
    (event.locationMode && event.locationMode.trim() !== '') ||
    (event.onlineLink && event.onlineLink.trim() !== '') ||
    (event.onlineInstructions && event.onlineInstructions.trim() !== '')
  );
}

/**
 * Checks whether the event has policy / restriction information.
 * @param {{ageRestriction?: string, refundPolicy?: string, termsAndConditions?: string}} event
 * @returns {boolean}
 */
export function hasPolicyContent(event) {
  return Boolean(
    (event.ageRestriction && event.ageRestriction.trim() !== '') ||
    (event.refundPolicy && event.refundPolicy.trim() !== '') ||
    (event.termsAndConditions && event.termsAndConditions.trim() !== '')
  );
}

/**
 * Checks whether the event has organizer contact or legal permit details.
 * @param {{contactEmail?: string, contactHotline?: string, fanpageUrl?: string, permitNumber?: string}} event
 * @returns {boolean}
 */
export function hasContactContent(event) {
  return Boolean(
    (event.contactEmail && event.contactEmail.trim() !== '') ||
    (event.contactHotline && event.contactHotline.trim() !== '') ||
    (event.fanpageUrl && event.fanpageUrl.trim() !== '') ||
    (event.permitNumber && event.permitNumber.trim() !== '')
  );
}

const MACHINE_ENUM_PATTERN = /^[A-Z0-9]+(_[A-Z0-9]+)+$/;
const ENUM_FALLBACKS = new Set([
  'DEFAULT',
  'NONE',
  'UNDEFINED',
  'NULL',
  'UNKNOWN',
  'CHUA_XAC_DINH',
]);

/**
 * Checks whether a candidate slogan string represents an invalid machine-like token,
 * enum code, or raw category identifier rather than an intentional public slogan.
 * @param {string | null | undefined} slogan
 * @param {string | null | undefined} [category]
 * @returns {boolean}
 */
export function isMachineSloganToken(slogan, category) {
  if (!slogan || typeof slogan !== 'string') return false;
  const trimmed = slogan.trim();
  if (!trimmed) return false;

  const upper = trimmed.toUpperCase();

  // 1. Matches a known category identifier key (e.g. 'AM_NHAC', 'WORKSHOP')
  if (upper in CATEGORY_MAP) {
    return true;
  }

  // 2. Matches the exact category passed on the event record
  if (category && upper === String(category).trim().toUpperCase()) {
    return true;
  }

  // 3. Matches generic machine enum fallback tokens
  if (ENUM_FALLBACKS.has(upper)) {
    return true;
  }

  // 4. Matches SCREAMING_SNAKE_CASE tokens (e.g. 'AM_NHAC', 'EVENT_CATEGORY', 'SYS_SLOGAN_CODE')
  if (MACHINE_ENUM_PATTERN.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Normalizes an event slogan for presentation.
 * Returns null if the slogan is missing or is an invalid machine token/category code.
 * @param {string | null | undefined} slogan
 * @param {string | null | undefined} [category]
 * @returns {string | null}
 */
export function normalizeEventSlogan(slogan, category) {
  if (!slogan || typeof slogan !== 'string') return null;
  const trimmed = slogan.trim();
  if (!trimmed) return null;
  if (isMachineSloganToken(trimmed, category)) {
    return null;
  }
  return trimmed;
}

/**
 * Resolves honest Hero CTA presentation based on event sale status and template specialization.
 * - ON_SALE: action-oriented ticket/seating copy.
 * - UPCOMING: view tiers/map without implying an immediate purchase.
 * - SOLD_OUT: view tiers/map; never imply availability.
 * - CLOSED: view event/seating information; never imply purchasing.
 *
 * @param {string | null | undefined} saleStatus
 * @param {boolean} [isConcert=false]
 * @returns {{
 *   label: string,
 *   href: string,
 *   ariaLabel: string
 * }}
 */
export function resolveHeroCta(saleStatus, isConcert = false) {
  const href = isConcert ? '#seating-section' : '#tickets';

  if (isConcert) {
    switch (saleStatus) {
      case SALE_STATUS.ON_SALE:
        return {
          label: 'Chọn vé ngay & Sơ đồ',
          href,
          ariaLabel: 'Chọn vé ngay và chuyển đến sơ đồ chỗ ngồi',
        };
      case SALE_STATUS.UPCOMING:
        return {
          label: 'Xem sơ đồ & Hạng vé',
          href,
          ariaLabel: 'Xem trước sơ đồ chỗ ngồi và danh sách hạng vé sắp mở bán',
        };
      case SALE_STATUS.SOLD_OUT:
        return {
          label: 'Xem sơ đồ & Hạng vé',
          href,
          ariaLabel: 'Xem sơ đồ chỗ ngồi và các hạng vé đã bán hết',
        };
      case SALE_STATUS.CLOSED:
        return {
          label: 'Xem thông tin & Sơ đồ',
          href,
          ariaLabel: 'Xem thông tin sự kiện và sơ đồ chỗ ngồi đã đóng bán',
        };
      default:
        return {
          label: 'Xem thông tin & Sơ đồ',
          href,
          ariaLabel: 'Xem thông tin sự kiện và sơ đồ chỗ ngồi',
        };
    }
  }

  // Generic / Default template events
  switch (saleStatus) {
    case SALE_STATUS.ON_SALE:
      return {
        label: 'Xem hạng vé & Chọn chỗ',
        href,
        ariaLabel: 'Xem danh sách hạng vé và chọn chỗ đặt vé',
      };
    case SALE_STATUS.UPCOMING:
      return {
        label: 'Xem thông tin hạng vé',
        href,
        ariaLabel: 'Xem trước danh sách các hạng vé sắp mở bán',
      };
    case SALE_STATUS.SOLD_OUT:
      return {
        label: 'Xem thông tin hạng vé',
        href,
        ariaLabel: 'Xem thông tin các hạng vé đã hết',
      };
    case SALE_STATUS.CLOSED:
      return {
        label: 'Xem thông tin sự kiện',
        href,
        ariaLabel: 'Xem thông tin sự kiện đã đóng bán',
      };
    default:
      return {
        label: 'Xem thông tin sự kiện',
        href,
        ariaLabel: 'Xem thông tin sự kiện',
      };
  }
}

