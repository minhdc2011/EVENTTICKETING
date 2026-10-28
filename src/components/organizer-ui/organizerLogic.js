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

export const CATEGORY_LABELS = {
  AM_NHAC: 'Âm nhạc / Ca nhạc',
  SAN_KHAU: 'Sân khấu / Kịch nói',
  THE_THAO: 'Thể thao / Giải đấu',
  HOI_THAO: 'Hội thảo / Tọa đàm',
  WORKSHOP: 'Workshop / Đào tạo',
  TRIEN_LAM: 'Triển lãm / Hội chợ',
  GIAI_TRI: 'Giải trí / Lễ hội',
  CONG_DONG: 'Cộng đồng / Thiện nguyện',
  THAM_QUAN: 'Tham quan / Trải nghiệm',
  KHAC: 'Khác',
};

export const LOCATION_MODE_LABELS = {
  OFFLINE: 'Trực tiếp tại địa điểm (Offline)',
  ONLINE: 'Trực tuyến (Online)',
  HYBRID: 'Kết hợp trực tiếp & trực tuyến (Hybrid)',
  TBA: 'Địa điểm sẽ thông báo sau (TBA)',
};

export const WIZARD_STEP_TITLES = [
  'Thông tin cơ bản',
  'Địa điểm & Suất diễn',
  'Phân khu & Hạng vé',
  'Hình ảnh & Truyền thông',
  'Quy định & Liên hệ',
  'Kiểm tra & Xuất bản',
];
