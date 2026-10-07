export const ACCOUNT_KINDS = {
  USER: 'USER',
  ORGANIZER: 'ORGANIZER',
  ADMIN: 'ADMIN',
};

export function isOrganizerAccount(accountKind) {
  const normalized = String(accountKind || '').toUpperCase();
  return normalized === 'ORGANIZER' || normalized === 'ADMIN';
}

export function isOrganizerEditorRole(role) {
  return Boolean(role && ['CHU_SO_HUU', 'QUAN_TRI', 'BIEN_TAP'].includes(role));
}

export function filterEventsByOrganization(events, organizationId) {
  if (!Array.isArray(events) || !organizationId) return [];
  return events.filter((event) => event && String(event.organizationId) === String(organizationId));
}

export function canManageOrganizationEvents(membership) {
  return isOrganizerEditorRole(membership?.role);
}

export function getActiveOrgStorageKey(userId) {
  if (!userId || typeof userId !== 'string') return null;
  return `eventticketing:organizer-active-org:${userId}`;
}

export function resolveActiveOrganizationId(memberships, candidateOrgId) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }
  if (candidateOrgId && typeof candidateOrgId === 'string') {
    const exists = memberships.some((m) => m && m.organizationId === candidateOrgId);
    if (exists) {
      return candidateOrgId;
    }
  }
  return memberships[0]?.organizationId || null;
}

export function loadSavedActiveOrganizationId(userId, storage) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const key = getActiveOrgStorageKey(userId);
  if (!key || !store || typeof store.getItem !== 'function') return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function saveActiveOrganizationId(userId, organizationId, storage) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const key = getActiveOrgStorageKey(userId);
  if (!key || !store) return;
  try {
    if (organizationId && typeof store.setItem === 'function') {
      store.setItem(key, String(organizationId));
    } else if (!organizationId && typeof store.removeItem === 'function') {
      store.removeItem(key);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}


export function validateOrganizationInput(name, slug) {
  const trimmedName = String(name || '').trim();
  const trimmedSlug = String(slug || '').trim().toLowerCase();
  if (trimmedName.length < 3) {
    throw new Error('Tên tổ chức phải có tối thiểu 3 ký tự.');
  }
  if (!trimmedSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
    throw new Error('Slug tổ chức chỉ được chứa chữ thường, số và dấu gạch nối (ví dụ: ftu-events-lab).');
  }
  return {trimmedName, trimmedSlug};
}

export function validateEventDraftInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Dữ liệu sự kiện không hợp lệ.');
  }
  const name = String(input.name || '').trim();
  if (name.length < 5) {
    throw new Error('Tên sự kiện phải có tối thiểu 5 ký tự.');
  }
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Slug sự kiện chỉ được chứa chữ thường, số và dấu gạch nối (ví dụ: rock-fest-2026).');
  }
  const validCategories = ['AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC'];
  const category = String(input.category || '').toUpperCase();
  if (!validCategories.includes(category)) {
    throw new Error('Thể loại sự kiện không hợp lệ.');
  }
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const saleStartsAt = new Date(input.saleStartsAt);
  const saleEndsAt = new Date(input.saleEndsAt);

  if ([startsAt, endsAt, saleStartsAt, saleEndsAt].some((d) => Number.isNaN(d.getTime()))) {
    throw new Error('Mốc thời gian không đúng định dạng.');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('Thời gian kết thúc sự kiện phải sau thời gian bắt đầu.');
  }
  if (saleStartsAt.getTime() >= startsAt.getTime()) {
    throw new Error('Thời gian mở bán vé phải trước thời gian bắt đầu sự kiện.');
  }
  if (saleEndsAt.getTime() <= saleStartsAt.getTime()) {
    throw new Error('Thời gian đóng bán vé phải sau thời gian mở bán.');
  }
  if (saleEndsAt.getTime() > startsAt.getTime()) {
    throw new Error('Thời gian đóng bán vé không được muộn hơn thời gian bắt đầu sự kiện.');
  }
  if (Number(input.price) < 0) {
    throw new Error('Giá vé không được nhỏ hơn 0.');
  }
  if (Number(input.capacity) < 1) {
    throw new Error('Sức chứa sự kiện phải có tối thiểu 1 vé.');
  }
}

export const VALID_CATEGORIES = ['AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC'];
export const VALID_LOCATION_MODES = ['OFFLINE', 'ONLINE', 'HYBRID', 'TBA'];

export function isValidUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidHttpsUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidEmail(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9+() -]{8,20}$/.test(value.trim());
}

export function validateFullEventAggregate(input, options = {}) {
  const isPublishing = Boolean(options.isPublishing);
  if (!input || typeof input !== 'object') {
    throw new Error('Dữ liệu sự kiện không hợp lệ.');
  }

  const name = String(input.name || '').trim();
  if (name.length < 5) {
    throw new Error('Tên sự kiện phải có tối thiểu 5 ký tự.');
  }

  const slug = String(input.slug || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Slug sự kiện chỉ được chứa chữ thường, số và dấu gạch nối (ví dụ: rock-fest-2026).');
  }

  const category = String(input.category || '').toUpperCase();
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error('Thể loại sự kiện không hợp lệ.');
  }

  const locationMode = String(input.locationMode || 'OFFLINE').toUpperCase();
  if (!VALID_LOCATION_MODES.includes(locationMode)) {
    throw new Error('Hình thức tổ chức không hợp lệ.');
  }

  if (isPublishing) {
    const description = String(input.description || '').trim();
    if (description.length < 20) {
      throw new Error('Mô tả chi tiết sự kiện phải có tối thiểu 20 ký tự khi công bố.');
    }

    if (locationMode === 'OFFLINE' || locationMode === 'HYBRID') {
      const venue = String(input.venueName || '').trim();
      const addr = String(input.address || '').trim();
      if (!venue || !addr) {
        throw new Error('Sự kiện trực tiếp bắt buộc phải có tên địa điểm và địa chỉ cụ thể.');
      }
    } else if (locationMode === 'ONLINE') {
      const link = String(input.onlineLink || '').trim();
      if (!link || !isValidUrl(link)) {
        throw new Error('Sự kiện trực tuyến bắt buộc phải có đường dẫn tham gia hợp lệ.');
      }
    }

    const banner = String(input.bannerUrl || '').trim();
    if (!banner || !isValidHttpsUrl(banner)) {
      throw new Error('Sự kiện cần có ảnh bìa ngang (Banner URL) định dạng HTTPS hợp lệ.');
    }

    const email = String(input.contactEmail || '').trim();
    if (!email || !isValidEmail(email)) {
      throw new Error('Email hỗ trợ không đúng định dạng.');
    }

    const hotline = String(input.contactHotline || '').trim();
    if (!hotline || !isValidPhone(hotline)) {
      throw new Error('Số điện thoại hotline hỗ trợ không đúng định dạng.');
    }

    const refund = String(input.refundPolicy || '').trim();
    if (!refund || refund.length < 10) {
      throw new Error('Vui lòng nêu rõ chính sách hoàn/hủy vé (tối thiểu 10 ký tự).');
    }
  }

  const shows = Array.isArray(input.shows) ? input.shows : [];
  if (isPublishing && shows.length === 0) {
    throw new Error('Sự kiện phải có tối thiểu 1 suất diễn để công bố.');
  }

  shows.forEach((show, showIdx) => {
    const showName = String(show.name || '').trim();
    if (showName.length < 2) {
      throw new Error(`Suất diễn #${showIdx + 1} phải có tên tối thiểu 2 ký tự.`);
    }

    const showSlug = String(show.slug || '').trim().toLowerCase();
    if (!showSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(showSlug)) {
      throw new Error(`Slug của suất diễn #${showIdx + 1} không hợp lệ.`);
    }

    const startsAt = new Date(show.startsAt);
    const endsAt = new Date(show.endsAt);
    const saleStartsAt = new Date(show.saleStartsAt);
    const saleEndsAt = show.saleEndsAt ? new Date(show.saleEndsAt) : null;
    const doorsOpenAt = show.doorsOpenAt ? new Date(show.doorsOpenAt) : null;

    if ([startsAt, endsAt, saleStartsAt].some((d) => Number.isNaN(d.getTime()))) {
      throw new Error(`Mốc thời gian của suất diễn "${showName}" không đúng định dạng.`);
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new Error(`Thời gian kết thúc của suất diễn "${showName}" phải sau thời gian bắt đầu.`);
    }
    if (doorsOpenAt && !Number.isNaN(doorsOpenAt.getTime()) && doorsOpenAt.getTime() > startsAt.getTime()) {
      throw new Error(`Thời gian mở cửa của suất diễn "${showName}" phải trước hoặc trùng giờ bắt đầu.`);
    }
    if (saleStartsAt.getTime() >= startsAt.getTime()) {
      throw new Error(`Thời gian mở bán vé của suất diễn "${showName}" phải trước thời gian biểu diễn.`);
    }
    if (saleEndsAt && !Number.isNaN(saleEndsAt.getTime())) {
      if (saleEndsAt.getTime() <= saleStartsAt.getTime()) {
        throw new Error(`Thời gian đóng bán vé của suất diễn "${showName}" phải sau thời gian mở bán.`);
      }
      if (saleEndsAt.getTime() > startsAt.getTime()) {
        throw new Error(`Thời gian đóng bán vé của suất diễn "${showName}" không được muộn hơn giờ biểu diễn.`);
      }
    }

    const tiers = Array.isArray(show.ticketTiers) ? show.ticketTiers : [];
    if (isPublishing && tiers.length === 0) {
      throw new Error(`Suất diễn "${showName}" phải có ít nhất 1 hạng vé.`);
    }

    tiers.forEach((tier, tierIdx) => {
      const tierName = String(tier.name || '').trim();
      if (tierName.length < 2) {
        throw new Error(`Hạng vé #${tierIdx + 1} thuộc suất "${showName}" phải có tên tối thiểu 2 ký tự.`);
      }
      const price = Number(tier.price);
      if (Number.isNaN(price) || price < 0) {
        throw new Error(`Giá vé của hạng "${tierName}" không được nhỏ hơn 0.`);
      }
      const cap = Number(tier.capacity);
      if (Number.isNaN(cap) || cap < 1) {
        throw new Error(`Sức chứa của hạng "${tierName}" phải có tối thiểu 1 vé.`);
      }
      const minPerOrder = Number(tier.minPerOrder || 1);
      const maxPerOrder = Number(tier.maxPerOrder || 4);
      if (minPerOrder < 1 || maxPerOrder < minPerOrder) {
        throw new Error(`Giới hạn số vé mỗi đơn của hạng "${tierName}" không hợp lệ.`);
      }
    });
  });
}

export function evaluatePublishReadiness(aggregate) {
  const blockers = [];
  const warnings = [];

  if (!aggregate || typeof aggregate !== 'object') {
    return {
      isReady: false,
      blockers: [{field: 'general', message: 'Dữ liệu sự kiện chưa được khởi tạo.'}],
      warnings: [],
    };
  }

  const name = String(aggregate.name || '').trim();
  if (name.length < 5) {
    blockers.push({field: 'name', message: 'Tên sự kiện phải có tối thiểu 5 ký tự.'});
  }

  const slug = String(aggregate.slug || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    blockers.push({field: 'slug', message: 'Slug sự kiện không đúng định dạng chuẩn URL.'});
  }

  const category = String(aggregate.category || '').toUpperCase();
  if (!VALID_CATEGORIES.includes(category)) {
    blockers.push({field: 'category', message: 'Thể loại sự kiện chưa được chọn.'});
  }

  const desc = String(aggregate.description || '').trim();
  if (desc.length < 20) {
    blockers.push({field: 'description', message: 'Mô tả chi tiết sự kiện quá ngắn (tối thiểu 20 ký tự).'});
  }

  const mode = String(aggregate.locationMode || 'OFFLINE').toUpperCase();
  if (mode === 'OFFLINE' || mode === 'HYBRID') {
    if (!String(aggregate.venueName || '').trim() || !String(aggregate.address || '').trim()) {
      blockers.push({field: 'location', message: 'Thiếu tên địa điểm hoặc địa chỉ tổ chức trực tiếp.'});
    }
  } else if (mode === 'ONLINE') {
    if (!String(aggregate.onlineLink || '').trim() || !isValidUrl(aggregate.onlineLink)) {
      blockers.push({field: 'onlineLink', message: 'Thiếu đường dẫn tham gia trực tuyến hợp lệ.'});
    }
  }

  const banner = String(aggregate.bannerUrl || '').trim();
  if (!banner || !isValidHttpsUrl(banner)) {
    blockers.push({field: 'bannerUrl', message: 'Thiếu ảnh bìa ngang (Banner URL) định dạng HTTPS.'});
  }

  const email = String(aggregate.contactEmail || '').trim();
  if (!email || !isValidEmail(email)) {
    blockers.push({field: 'contactEmail', message: 'Thiếu email hỗ trợ người tham dự hợp lệ.'});
  }

  const hotline = String(aggregate.contactHotline || '').trim();
  if (!hotline || !isValidPhone(hotline)) {
    blockers.push({field: 'contactHotline', message: 'Thiếu số điện thoại hotline hỗ trợ hợp lệ.'});
  }

  const refund = String(aggregate.refundPolicy || '').trim();
  if (!refund || refund.length < 10) {
    blockers.push({field: 'refundPolicy', message: 'Chưa có chính sách hoàn/hủy vé rõ ràng.'});
  }

  const shows = Array.isArray(aggregate.shows) ? aggregate.shows : [];
  if (shows.length === 0) {
    blockers.push({field: 'shows', message: 'Sự kiện chưa có suất diễn nào.'});
  } else {
    shows.forEach((show, idx) => {
      const showName = String(show.name || `Suất #${idx + 1}`).trim();
      const s = new Date(show.startsAt);
      const e = new Date(show.endsAt);
      const ms = new Date(show.saleStartsAt);
      const me = show.saleEndsAt ? new Date(show.saleEndsAt) : null;

      if ([s, e, ms].some((d) => Number.isNaN(d.getTime()))) {
        blockers.push({field: `shows[${idx}].time`, message: `Mốc thời gian suất "${showName}" không hợp lệ.`});
      } else {
        if (e.getTime() <= s.getTime()) {
          blockers.push({field: `shows[${idx}].time`, message: `Giờ kết thúc suất "${showName}" phải sau giờ bắt đầu.`});
        }
        if (ms.getTime() >= s.getTime()) {
          blockers.push({field: `shows[${idx}].time`, message: `Giờ mở bán suất "${showName}" phải trước giờ diễn.`});
        }
        if (me && !Number.isNaN(me.getTime()) && (me.getTime() <= ms.getTime() || me.getTime() > s.getTime())) {
          blockers.push({field: `shows[${idx}].time`, message: `Giờ đóng bán suất "${showName}" không hợp lệ.`});
        }
      }

      const tiers = Array.isArray(show.ticketTiers) ? show.ticketTiers : [];
      if (tiers.length === 0) {
        blockers.push({field: `shows[${idx}].tiers`, message: `Suất "${showName}" chưa có hạng vé nào.`});
      } else {
        const sellable = tiers.filter((t) => Number(t.capacity) > 0 && Number(t.price) >= 0);
        if (sellable.length === 0) {
          blockers.push({field: `shows[${idx}].tiers`, message: `Suất "${showName}" không có hạng vé nào mở bán được.`});
        }
      }
    });
  }

  // Warnings
  if (!String(aggregate.posterUrl || '').trim()) {
    warnings.push({field: 'posterUrl', message: 'Chưa có ảnh poster đứng (khuyên dùng để hiển thị tối ưu trên mobile).'});
  }
  if (!String(aggregate.trailerUrl || '').trim()) {
    warnings.push({field: 'trailerUrl', message: 'Chưa có video trailer giới thiệu sự kiện.'});
  }
  if (!String(aggregate.seatingMapUrl || '').trim()) {
    warnings.push({field: 'seatingMapUrl', message: 'Chưa có ảnh sơ đồ khán đài minh họa cho khán giả.'});
  }
  if (shows.some((s) => Array.isArray(s.ticketTiers) && s.ticketTiers.length === 1)) {
    warnings.push({field: 'tiers', message: 'Một số suất diễn chỉ có 1 hạng vé duy nhất.'});
  }

  return {
    isReady: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function mapAuthError(error) {
  if (!error) return new Error('Đã xảy ra lỗi không xác định.');
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || error.status || '').toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
    return new Error('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
  }
  if (msg.includes('user already registered') || code === 'user_already_exists') {
    return new Error('Email này đã được đăng ký tài khoản. Vui lòng chuyển sang tab Đăng nhập.');
  }
  if (msg.includes('email not confirmed')) {
    return new Error('Tài khoản chưa được kích hoạt qua email. Vui lòng kiểm tra hộp thư (cả mục spam/rác) để xác thực trước khi đăng nhập.');
  }
  if (msg.includes('password should be at least') || msg.includes('weak_password')) {
    return new Error('Mật khẩu phải có tối thiểu 6 ký tự.');
  }
  if (msg.includes('signup requires a valid password')) {
    return new Error('Vui lòng nhập mật khẩu hợp lệ.');
  }
  if (msg.includes('rate limit') || code === '429' || msg.includes('over_email_send_rate_limit')) {
    return new Error('Bạn đã thao tác quá nhiều lần trong thời gian ngắn. Vui lòng đợi vài phút rồi thử lại.');
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid format')) {
    return new Error('Địa chỉ email không đúng định dạng.');
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return new Error('Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra mạng hoặc thử lại.');
  }
  if (code === '42501' || msg.includes('42501')) {
    return new Error('Bạn không có quyền thực hiện thao tác này.');
  }
  return error instanceof Error ? error : new Error(error.message || 'Lỗi xác thực người dùng.');
}

export function mapDatabaseError(error) {
  if (!error) return new Error('Đã xảy ra lỗi không xác định.');
  const code = String(error.code || '');
  const msg = String(error.message || '');
  if (code === '42501' || msg.includes('42501')) {
    if (
      msg.includes('Chi tai khoan Ban to chuc') ||
      msg.includes('Khong co quyen tu y thay doi loai tai khoan') ||
      msg.includes('Can dang nhap de tao to chuc') ||
      msg.includes('Khong co quyen tao su kien cho to chuc nay') ||
      msg.includes('Khong co quyen bien tap su kien cua to chuc') ||
      msg.includes('Khong co quyen cong bo su kien') ||
      msg.includes('Khong co quyen xem loai tai khoan') ||
      msg.includes('Khong co quyen kiem tra phan quyen')
    ) {
      return new Error(msg);
    }
    return new Error('Bạn không có quyền thực hiện thao tác này.');
  }
  if (code === '23514' || msg.includes('23514')) {
    return new Error('Sự kiện chưa có suất diễn và phân khu hợp lệ để công bố.');
  }
  if (code === '23505' || msg.includes('23505')) {
    return new Error('Tên hoặc slug đã được sử dụng. Vui lòng chọn slug khác.');
  }
  if (code === '22023' || msg.includes('22023')) {
    return new Error(msg || 'Dữ liệu nhập vào chưa hợp lệ.');
  }
  const lowMsg = msg.toLowerCase();
  if (
    lowMsg.includes('invalid login credentials') ||
    lowMsg.includes('user already registered') ||
    lowMsg.includes('email not confirmed')
  ) {
    return mapAuthError(error);
  }
  return error instanceof Error ? error : new Error(msg || 'Lỗi xử lý yêu cầu.');
}
