// Logic thuần cho biểu mẫu quy tắc giá: kiểm tra từng trường và quyền định giá.
// Phản chiếu public.luu_quy_tac_gia / public.co_quyen_dinh_gia (migration 20261113090000).

export const PRICING_FIELDS = [
  {key: 'giaGoc', sqlParam: 'p_gia_goc', label: 'Giá gốc', scale: 2, max: 1e10},
  {key: 'giaSan', sqlParam: 'p_gia_san', label: 'Giá sàn', scale: 2, max: 1e10},
  {key: 'giaTran', sqlParam: 'p_gia_tran', label: 'Giá trần', scale: 2, max: 1e10},
  {key: 'buocNhayGia', sqlParam: 'p_buoc_nhay_gia', label: 'Bước nhảy giá', scale: 2, max: 1e10},
  {key: 'bienDoToiDa', sqlParam: 'p_bien_do_toi_da', label: 'Biên độ tối đa', scale: 4, max: 10},
  {key: 'nguongLapDayThap', sqlParam: 'p_nguong_lap_day_thap', label: 'Ngưỡng lấp đầy thấp', scale: 4, max: 10},
  {key: 'nguongLapDayCao', sqlParam: 'p_nguong_lap_day_cao', label: 'Ngưỡng lấp đầy cao', scale: 4, max: 10},
  {key: 'trongSoLapDay', sqlParam: 'p_trong_so_lap_day', label: 'Trọng số lấp đầy', scale: 4, max: 10},
  {key: 'trongSoTocDoBan', sqlParam: 'p_trong_so_toc_do_ban', label: 'Trọng số tốc độ bán', scale: 4, max: 10},
  {key: 'trongSoThoiGian', sqlParam: 'p_trong_so_thoi_gian', label: 'Trọng số thời gian', scale: 4, max: 10},
];

const FIELD_ORDER = [...PRICING_FIELDS.map((f) => f.key), 'trangThaiKichHoat'];
const SQL_PARAMS = {
  ...Object.fromEntries(PRICING_FIELDS.map((f) => [f.key, f.sqlParam])),
  trangThaiKichHoat: 'p_trang_thai_kich_hoat',
};

const NUMERIC_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Chuyển đầu vào thành số hữu hạn; trả null nếu trống/sai kiểu/không hữu hạn. */
export function parseStrictNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '' || !NUMERIC_TEXT.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Làm tròn half away from zero theo scale cột; trả null khi quá lớn để biểu diễn an toàn. */
export function roundScale(value, scale) {
  const abs = Math.abs(value);
  if (abs >= 1e11) return null;
  const [mantissa, exp = '0'] = String(abs).split('e');
  const shifted = Math.round(Number(`${mantissa}e${Number(exp) + scale}`));
  const rounded = Number(`${shifted}e-${scale}`);
  return value < 0 ? -rounded + 0 : rounded;
}

/**
 * Kiểm tra toàn bộ dữ liệu biểu mẫu quy tắc giá.
 * Trả {ok, params, errors, firstInvalidField, firstInvalidSqlParam}.
 */
export function validatePricingForm(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const v = {};

  for (const f of PRICING_FIELDS) {
    const raw = source[f.key];
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      errors[f.key] = `${f.label} không được để trống.`;
      continue;
    }
    const n = parseStrictNumber(raw);
    if (n === null) {
      errors[f.key] = `${f.label} phải là số hữu hạn.`;
      continue;
    }
    const rounded = roundScale(n, f.scale);
    if (rounded === null || Math.abs(rounded) >= f.max) {
      errors[f.key] = `${f.label} vượt quá độ chính xác cho phép (tối đa ${f.scale} chữ số thập phân, |giá trị| < ${f.max}).`;
      continue;
    }
    v[f.key] = rounded;
  }

  const fail = (key, message) => {
    if (!errors[key]) errors[key] = message;
  };
  const has = (...keys) => keys.every((k) => v[k] !== undefined);

  if (has('giaSan') && v.giaSan <= 0) fail('giaSan', 'Giá sàn phải lớn hơn 0.');
  if (has('giaGoc', 'giaSan') && v.giaGoc < v.giaSan) fail('giaGoc', 'Giá gốc phải lớn hơn hoặc bằng giá sàn.');
  if (has('giaTran', 'giaGoc') && v.giaTran < v.giaGoc) fail('giaTran', 'Giá trần phải lớn hơn hoặc bằng giá gốc.');
  if (has('buocNhayGia') && v.buocNhayGia <= 0) fail('buocNhayGia', 'Bước nhảy giá phải lớn hơn 0.');
  if (has('bienDoToiDa') && (v.bienDoToiDa <= 0 || v.bienDoToiDa > 1)) {
    fail('bienDoToiDa', 'Biên độ tối đa phải thuộc khoảng (0, 1].');
  }
  if (has('nguongLapDayThap') && (v.nguongLapDayThap < 0 || v.nguongLapDayThap > 1)) {
    fail('nguongLapDayThap', 'Ngưỡng lấp đầy thấp phải thuộc đoạn [0, 1].');
  }
  if (has('nguongLapDayCao') && (v.nguongLapDayCao < 0 || v.nguongLapDayCao > 1)) {
    fail('nguongLapDayCao', 'Ngưỡng lấp đầy cao phải thuộc đoạn [0, 1].');
  }
  if (has('nguongLapDayThap', 'nguongLapDayCao') && v.nguongLapDayThap >= v.nguongLapDayCao) {
    fail('nguongLapDayThap', 'Ngưỡng lấp đầy thấp phải nhỏ hơn ngưỡng lấp đầy cao.');
  }
  for (const key of ['trongSoLapDay', 'trongSoTocDoBan', 'trongSoThoiGian']) {
    if (has(key) && v[key] < 0) {
      fail(key, `${PRICING_FIELDS.find((f) => f.key === key).label} phải lớn hơn hoặc bằng 0.`);
    }
  }

  if (typeof source.trangThaiKichHoat !== 'boolean') {
    errors.trangThaiKichHoat = 'Trạng thái kích hoạt phải là đúng hoặc sai.';
  }

  const firstInvalidField = FIELD_ORDER.find((k) => errors[k]) ?? null;
  if (firstInvalidField) {
    return {
      ok: false,
      params: null,
      errors,
      firstInvalidField,
      firstInvalidSqlParam: SQL_PARAMS[firstInvalidField],
    };
  }
  return {
    ok: true,
    params: {...v, trangThaiKichHoat: source.trangThaiKichHoat},
    errors: {},
    firstInvalidField: null,
    firstInvalidSqlParam: null,
  };
}

export const PRICING_ROLES = ['CHU_SO_HUU', 'QUAN_TRI'];
export const PRICING_ACCOUNT_KINDS = ['ORGANIZER', 'ADMIN'];

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

function membershipAllows(membership, targetId) {
  if (membership === null || typeof membership !== 'object') return false;
  const orgId = normalizeId(membership.organizationId ?? membership.ToChucID);
  if (orgId === null || orgId !== targetId) return false;
  const role = membership.role ?? membership.VaiTro;
  if (!PRICING_ROLES.includes(role)) return false;
  const kind = membership.accountKind ?? membership.LoaiTaiKhoan;
  if (kind !== undefined && kind !== null && !PRICING_ACCOUNT_KINDS.includes(kind)) return false;
  return true;
}

/**
 * Quyền định giá: chỉ CHU_SO_HUU/QUAN_TRI của đúng tổ chức sở hữu sự kiện.
 * `memberships` là một membership hoặc danh sách; BIEN_TAP không được thừa hưởng.
 */
export function canManagePricing(memberships, eventOrganizationId) {
  const targetId = normalizeId(eventOrganizationId);
  if (targetId === null) return false;
  const list = Array.isArray(memberships) ? memberships : [memberships];
  return list.some((m) => membershipAllows(m, targetId));
}
