// Tầng điều phối thuần cho màn hình định giá của Ban tổ chức (T6).
// Không import dịch vụ: `services` được tiêm (mặc định do component truyền pricingService).
// Phiên (session) giữ epoch + khóa gửi để bỏ qua phản hồi bất đồng bộ cũ.

import {PRICING_FIELDS, canManagePricing, validatePricingForm} from './pricingFormLogic.js';

export const KICH_BAN_MO_PHONG = ['ban_nhanh', 'ban_cham', 'ban_deu'];
export const NHAN_MO_PHONG_UI = '[MÔ PHỎNG]';

// ---------------------------------------------------------------------------
// Phiên: epoch + khóa thao tác gửi + kênh "mới nhất thắng"
// ---------------------------------------------------------------------------

export function createPricingSession() {
  let epoch = 0;
  let busy = false;
  const channelSeq = new Map();
  return {
    get epoch() {
      return epoch;
    },
    get busy() {
      return busy;
    },
    /** Đổi tổ chức/sự kiện/đóng panel: vô hiệu mọi phản hồi đang bay và nhả khóa. */
    reset() {
      epoch += 1;
      busy = false;
      channelSeq.clear();
    },
    isCurrent(token) {
      return token === epoch;
    },
    _setBusy(value) {
      busy = value;
    },
    _nextSeq(channel) {
      const next = (channelSeq.get(channel) ?? 0) + 1;
      channelSeq.set(channel, next);
      return next;
    },
    _isLatest(channel, seq) {
      return channelSeq.get(channel) === seq;
    },
  };
}

export function describeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : null;
  return {message, code};
}

/**
 * Chạy `task` trong phiên. Trả {status:'ok', value} | {status:'error', error}
 * | {status:'stale'} (phiên đã đổi hoặc có yêu cầu mới hơn cùng kênh) | {status:'busy'}.
 * exclusive=true: từ chối khi đang có thao tác gửi khác.
 */
export async function runGuarded(session, task, {exclusive = true, channel = 'default'} = {}) {
  if (exclusive && session.busy) return {status: 'busy'};
  const token = session.epoch;
  const seq = session._nextSeq(channel);
  if (exclusive) session._setBusy(true);
  const live = () => session.isCurrent(token) && session._isLatest(channel, seq);
  try {
    const value = await task();
    return live() ? {status: 'ok', value} : {status: 'stale'};
  } catch (error) {
    return live() ? {status: 'error', error: describeError(error)} : {status: 'stale'};
  } finally {
    if (exclusive && session.isCurrent(token)) session._setBusy(false);
  }
}

// ---------------------------------------------------------------------------
// Hộp thoại modal: bẫy focus + vô hiệu hóa nền (inert)
// ---------------------------------------------------------------------------

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

function isTabbable(el) {
  if (!el || el.disabled === true) return false;
  if (el.hidden === true) return false;
  if (el.inert === true) return false;
  if (typeof el.hasAttribute === 'function') {
    if (el.hasAttribute('hidden') || el.hasAttribute('inert')) return false;
  }
  if (typeof el.tagName === 'string' && el.tagName.toLowerCase() === 'input' && typeof el.getAttribute === 'function') {
    if ((el.getAttribute('type') ?? '').toLowerCase() === 'hidden') return false;
  }
  if (typeof el.getAttribute === 'function') {
    const raw = el.getAttribute('tabindex');
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n < 0) return false;
    }
  }
  if (typeof el.closest === 'function' && el.closest('[hidden],[inert],fieldset[disabled]')) return false;
  const view = el.ownerDocument && el.ownerDocument.defaultView;
  if (view && typeof view.getComputedStyle === 'function') {
    const style = view.getComputedStyle(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

/** Phần tử có thể focus bằng Tab trong container: bỏ qua disabled/hidden/inert/tabindex âm. */
export function getFocusableElements(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isTabbable);
}

/**
 * Quyết định xử lý phím trong hộp thoại.
 * Trả {action:'close'} | {action:'wrap', target} | {action:'none'}.
 */
export function resolveDialogKeyDown({key, shiftKey = false, activeElement, dialogElement, focusables = []}) {
  if (key === 'Escape') return {action: 'close'};
  if (key !== 'Tab') return {action: 'none'};
  const list = Array.isArray(focusables) ? focusables : [];
  if (list.length === 0) return {action: 'wrap', target: dialogElement};
  const first = list[0];
  const last = list[list.length - 1];
  const onRoot = activeElement === dialogElement;
  const inList = list.includes(activeElement);
  const insideDialog =
    !onRoot && Boolean(activeElement) && Boolean(dialogElement) && typeof dialogElement.contains === 'function'
      ? dialogElement.contains(activeElement)
      : false;
  // Phần tử bên trong hộp thoại nhưng không nằm trong danh sách (vd. tabindex=-1): để trình duyệt xử lý,
  // trừ khi nó là điểm đầu/cuối của vòng.
  const outside = onRoot || (!inList && !insideDialog);
  if (shiftKey) {
    if (outside || activeElement === first) return {action: 'wrap', target: last};
    return {action: 'none'};
  }
  if (outside || activeElement === last) return {action: 'wrap', target: first};
  return {action: 'none'};
}

function snapshotAttrs(el) {
  return {
    el,
    inertProp: el.inert,
    hadInertAttr: el.hasAttribute('inert'),
    inertAttr: el.getAttribute('inert'),
    hadAriaHidden: el.hasAttribute('aria-hidden'),
    ariaHidden: el.getAttribute('aria-hidden'),
  };
}

function restoreAttrs(s) {
  const {el} = s;
  if (s.hadInertAttr) el.setAttribute('inert', s.inertAttr ?? '');
  else el.removeAttribute('inert');
  el.inert = Boolean(s.inertProp);
  if (s.hadAriaHidden) el.setAttribute('aria-hidden', s.ariaHidden ?? 'true');
  else el.removeAttribute('aria-hidden');
}

/** Nhánh DOM anh em nằm ngoài overlay (từ overlay lên tới body). */
function collectBackgroundBranches(overlay, ownerDocument) {
  const result = [];
  const body = ownerDocument && ownerDocument.body;
  let node = overlay;
  while (node && node !== body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children ?? [])) {
      if (sibling === node) continue;
      const tag = typeof sibling.tagName === 'string' ? sibling.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || tag === 'link') continue;
      result.push(sibling);
    }
    node = node.parentElement;
  }
  return result;
}

/**
 * Phạm vi focus cho modal: ghi nhớ opener, đặt inert + aria-hidden cho nền, focus vào điều khiển đầu tiên,
 * kéo focus về lại nếu thoát ra ngoài; cleanup() khôi phục trạng thái nền và focus về opener.
 */
export function createDialogFocusScope({dialog, overlay, ownerDocument, backgroundElements, fallbackFocus} = {}) {
  const doc = ownerDocument ?? (dialog && dialog.ownerDocument);
  const root = overlay ?? dialog;
  const opener = doc ? doc.activeElement : null;
  // Bỏ qua nhánh đã inert sẵn (do chủ sở hữu như React quản lý) để cleanup không khôi phục lại trạng thái cũ của họ.
  const targets = (backgroundElements ?? collectBackgroundBranches(root, doc)).filter(
    (el) =>
      el &&
      el !== root &&
      !(typeof el.contains === 'function' && el.contains(root)) &&
      !(el.inert === true || el.hasAttribute('inert')),
  );
  const saved = targets.map(snapshotAttrs);
  for (const el of targets) {
    el.inert = true;
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
  }

  const focusInitial = () => {
    const [first] = getFocusableElements(dialog);
    const target = first ?? dialog;
    if (target && typeof target.focus === 'function') target.focus();
  };
  focusInitial();

  const onFocusIn = (event) => {
    const t = event && event.target;
    if (!t || (typeof root.contains === 'function' && root.contains(t))) return;
    focusInitial();
  };
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('focusin', onFocusIn);

  let active = true;
  return {
    opener,
    cleanup() {
      if (!active) return;
      active = false;
      if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('focusin', onFocusIn);
      for (const s of saved) restoreAttrs(s);
      if (opener && typeof opener.focus === 'function' && opener.isConnected !== false) {
        opener.focus();
        if (!doc || doc.activeElement === opener) return;
      }
      // Opener đã bị gỡ khỏi DOM (vd. card biến mất sau khi tải lại): chuyển focus sang đích dự phòng còn kết nối.
      let candidates = typeof fallbackFocus === 'function' ? fallbackFocus() : fallbackFocus;
      if (!Array.isArray(candidates)) candidates = [candidates];
      for (const el of candidates) {
        if (el && typeof el.focus === 'function' && el.isConnected !== false) {
          el.focus();
          if (!doc || doc.activeElement === el) return;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Quyền và cờ hiển thị
// ---------------------------------------------------------------------------

export function hasPricingAccess(activeOrg, event) {
  return Boolean(event) && canManagePricing(activeOrg, event.organizationId);
}

export function isSimulationEnabled(event, rows) {
  return Boolean(event && event.moPhong === true) || (Array.isArray(rows) && rows.some((r) => r.mo_phong === true));
}

export function isSimulatedView({meta, rows, event}) {
  return (
    (meta && meta.nguon === 'MO_PHONG') ||
    (Array.isArray(rows) && rows.some((r) => r.mo_phong === true)) ||
    Boolean(event && event.moPhong === true)
  );
}

export function storageWarning(meta) {
  return meta && meta.luuTru && meta.luuTru.canhBao ? meta.luuTru.canhBao : null;
}

// ---------------------------------------------------------------------------
// Suất/khu và giá trị khởi tạo biểu mẫu
// ---------------------------------------------------------------------------

/** Nhóm dòng số liệu theo suất: [{suatDienId, trangThai, khuVuc: row[]}] giữ thứ tự xuất hiện. */
export function groupBySuat(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!map.has(row.suat_dien_id)) {
      map.set(row.suat_dien_id, {
        suatDienId: row.suat_dien_id,
        trangThai: row.trang_thai_suat ?? null,
        thoiGianBatDau: row.thoi_gian_bat_dau ?? null,
        khuVuc: [],
      });
    }
    map.get(row.suat_dien_id).khuVuc.push(row);
  }
  return [...map.values()];
}

/** Chọn mặc định: giữ lựa chọn cũ nếu còn hợp lệ, nếu không lấy suất/khu đầu tiên. */
export function resolveSelection(rows, previous) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return {suatDienId: null, khuVucId: null};
  const suatId = list.some((r) => r.suat_dien_id === previous?.suatDienId)
    ? previous.suatDienId
    : list[0].suat_dien_id;
  const inSuat = list.filter((r) => r.suat_dien_id === suatId);
  const khuId = inSuat.some((r) => r.khu_vuc_id === previous?.khuVucId)
    ? previous.khuVucId
    : inSuat[0].khu_vuc_id;
  return {suatDienId: suatId, khuVucId: khuId};
}

export function findRow(rows, khuVucId) {
  return (Array.isArray(rows) ? rows : []).find((r) => r.khu_vuc_id === khuVucId) ?? null;
}

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Giá trị biểu mẫu (chuỗi cho input) từ dòng số liệu.
 * Có quy tắc: nạp cấu hình hiện có. Chưa có: gợi ý từ gia_hien_hanh, mặc định tắt.
 */
export function buildFormValues(row) {
  if (!row) return emptyFormValues();
  if (row.co_quy_tac === true) {
    return {
      giaGoc: text(row.gia_goc),
      giaSan: text(row.gia_san),
      giaTran: text(row.gia_tran),
      buocNhayGia: text(row.buoc_nhay),
      bienDoToiDa: text(row.bien_do),
      nguongLapDayThap: text(row.nguong_thap),
      nguongLapDayCao: text(row.nguong_cao),
      trongSoLapDay: text(row.trong_so_lap_day),
      trongSoTocDoBan: text(row.trong_so_toc_do),
      trongSoThoiGian: text(row.trong_so_thoi_gian),
      trangThaiKichHoat: row.kich_hoat === true,
    };
  }
  const base = row.gia_hien_hanh;
  const hasBase = typeof base === 'number' && Number.isFinite(base) && base > 0;
  return {
    giaGoc: hasBase ? text(base) : '',
    giaSan: hasBase ? text(Math.round(base * 0.8 * 100) / 100) : '',
    giaTran: hasBase ? text(Math.round(base * 1.2 * 100) / 100) : '',
    buocNhayGia: hasBase ? text(Math.max(1, Math.round(base * 0.05))) : '',
    bienDoToiDa: '0.1',
    nguongLapDayThap: '0.3',
    nguongLapDayCao: '0.8',
    trongSoLapDay: '0.5',
    trongSoTocDoBan: '0.3',
    trongSoThoiGian: '0.2',
    trangThaiKichHoat: false,
  };
}

export function emptyFormValues() {
  const values = {trangThaiKichHoat: false};
  for (const f of PRICING_FIELDS) values[f.key] = '';
  return values;
}

// ---------------------------------------------------------------------------
// Thao tác
// ---------------------------------------------------------------------------

/** Nạp số liệu; yêu cầu mới hơn thay thế yêu cầu cũ (kênh 'load'), không dùng khóa gửi. */
export async function loadMetrics(session, services, {activeOrg, event}) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  const r = await runGuarded(session, () => services.laySoLieuDinhGia(event.id), {exclusive: false, channel: 'load'});
  if (r.status !== 'ok') return r;
  return {status: 'ok', rows: r.value.hang, meta: {nguon: r.value.nguon, luuTru: r.value.luuTru}};
}

/** Tóm tắt kết quả lưu cấu hình thành thông báo hiển thị. */
export function describeSaveResult(result) {
  const canhBao = (result.canhBao ?? []).filter((c) => c.ma === 'GIA_HIEN_HANH_NGOAI_KHUNG');
  return {
    khongTuApDungGia: true,
    taoMoi: result.taoMoi === true,
    canhBaoNgoaiKhung: canhBao.map((c) => ({giaHienHanh: c.giaHienHanh, giaSan: c.giaSan, giaTran: c.giaTran})),
    deXuatHetHieuLuc: [...(result.deXuatHetHieuLuc ?? [])],
  };
}

/**
 * Kiểm tra biểu mẫu rồi lưu. Biểu mẫu sai => {status:'invalid'} và KHÔNG gọi dịch vụ.
 * Trả thêm: forbidden | busy | stale | error | rejected | saved.
 */
export async function saveConfig(session, services, {activeOrg, event, khuVucId, formValues}) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  if (!Number.isInteger(khuVucId)) return {status: 'no_selection'};
  const check = validatePricingForm(formValues);
  if (!check.ok) {
    return {status: 'invalid', errors: check.errors, firstInvalidField: check.firstInvalidField};
  }
  const r = await runGuarded(session, () => services.luuCauHinhGia(khuVucId, check.params));
  if (r.status !== 'ok') return r;
  const result = r.value;
  if (result.ok === false) return {status: 'rejected', loi: result.loi, truong: result.truong ?? null};
  return {status: 'saved', result, notice: describeSaveResult(result)};
}

const KET_QUA_KHU = ['DA_LUU', 'BO_QUA', 'BI_CHAN', 'LOI'];

/** Đếm kết quả từng khu theo loại. */
export function summarizeRun(result) {
  const counts = {DA_LUU: 0, BO_QUA: 0, BI_CHAN: 0, LOI: 0};
  for (const k of result.theoKhu ?? []) {
    if (KET_QUA_KHU.includes(k.ketQua)) counts[k.ketQua] += 1;
  }
  return {counts, soDeXuatHetHan: result.hetHan?.soLuong ?? 0, tong: (result.theoKhu ?? []).length};
}

/** Chạy ngay: chayDinhGiaNgay(event.id). Khóa khi đang gửi. */
export async function runPricingNow(session, services, {activeOrg, event}) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  const r = await runGuarded(session, () => services.chayDinhGiaNgay(event.id));
  if (r.status !== 'ok') return r;
  return {status: 'done', result: r.value, summary: summarizeRun(r.value)};
}

/** Simulator: chỉ khi có cờ mô phỏng và kịch bản hợp lệ. */
export async function runSimulation(session, services, {activeOrg, event, rows, kichBan}) {
  if (!hasPricingAccess(activeOrg, event)) return {status: 'forbidden'};
  if (!isSimulationEnabled(event, rows)) return {status: 'not_available'};
  if (!KICH_BAN_MO_PHONG.includes(kichBan)) return {status: 'invalid_scenario'};
  const r = await runGuarded(session, () => services.moPhongNhuCau(event.id, kichBan));
  if (r.status !== 'ok') return r;
  return {status: 'done', result: r.value};
}
