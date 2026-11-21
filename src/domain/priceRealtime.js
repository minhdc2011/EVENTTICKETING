/**
 * @file priceRealtime.js
 * Luồng giá realtime theo khu vực (KHU_VUC.GiaVeNiemYet) cho khán giả.
 *
 * Nhánh thật: một channel Supabase postgres_changes UPDATE trên KHU_VUC, lọc phía server
 * bằng `KhuVucID=in.(...)` (chia nhóm <= 100), rồi xác minh lại phía client.
 * Không dựa vào payload.old (bảng không có REPLICA IDENTITY FULL); thay vào đó so với
 * bản đồ giá đã biết và bỏ qua khi giá không đổi (vẫn đánh dấu khu để resync không ghi đè).
 * Không có khu nào thì không tạo subscription toàn bảng, chỉ báo CONNECTED.
 */

import {
  MAX_ZONE_FILTER_SIZE,
  buildZoneInFilter,
  chunkArray,
  normalizeZoneId,
} from './seatRealtime.js';

export const PRICE_MOCK_EVENT = 'eventticketing:pricing-mock-changed';

/**
 * Trạng thái kết nối: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'LOCAL_ONLY'.
 * LOCAL_ONLY: mock chỉ đồng bộ trong tab hiện tại.
 */

/**
 * Giá hợp lệ: số hữu hạn > 0.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Chuyển giá về số hợp lệ (số hoặc chuỗi số, giống Number() ở đường fetch) hoặc null.
 * NUMERIC(15,2) có thể được gửi dưới dạng chuỗi.
 */
function toValidPrice(value) {
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    value = Number(value);
  }
  return isValidPrice(value) ? value : null;
}

/**
 * Khớp phạm vi nghiêm ngặt: phạm vi không ràng buộc (null/undefined) thì luôn khớp;
 * nếu phạm vi có giá trị thì dòng phải có id khác null và bằng giá trị đó (so bằng Number()).
 * null/thiếu ở phía dòng KHÔNG bao giờ nghĩa là "khớp".
 * @param {unknown} idDong
 * @param {unknown} idPhamVi
 * @returns {boolean}
 */
export function khopMaPhamViNghiemNgat(idDong, idPhamVi) {
  if (idPhamVi === null || idPhamVi === undefined) return true;
  if (idDong === null || idDong === undefined) return false;
  return Number(idDong) === Number(idPhamVi);
}

/** Khóa đánh dấu dòng đọc từ schema cũ không có cột SuatDienID (nhánh tương thích rõ ràng). */
export const LEGACY_NO_SUAT_KEY = '__legacyNoSuat';

/**
 * Dòng/payload còn thiếu định danh phạm vi đang yêu cầu (null hoặc không có)?
 * @param {any} row
 * @param {{suKienId?: number|null, suatDienId?: number|null, boQuaSuatDien?: boolean}} options
 */
export function thieuDinhDanhPhamVi(row, {suKienId = null, suatDienId = null, boQuaSuatDien = false} = {}) {
  if (!row || typeof row !== 'object') return true;
  const thieu = (v) => v === null || v === undefined;
  if (suKienId !== null && suKienId !== undefined && thieu(row.SuKienID)) return true;
  if (!boQuaSuatDien && suatDienId !== null && suatDienId !== undefined && thieu(row.SuatDienID)) {
    return true;
  }
  return false;
}

/**
 * Chuyển payload realtime thành sự kiện giá hoặc null.
 * @param {unknown} payload
 * @param {{allowedZoneIds: ReadonlySet<number>, suKienId?: number|null, suatDienId?: number|null, lastPrices?: ReadonlyMap<number, number>, boQuaSuatDien?: boolean}} options
 *   boQuaSuatDien: chỉ true ở nhánh schema cũ không có cột SuatDienID.
 */
export function mapRealtimePricePayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload.new && typeof payload.new === 'object' ? payload.new : null;
  if (!row) return null;

  const khuVucId = normalizeZoneId(row.KhuVucID);
  if (khuVucId === null) return null;
  const {allowedZoneIds, suKienId = null, suatDienId = null, lastPrices, boQuaSuatDien = false} = options;
  if (!allowedZoneIds || !allowedZoneIds.has(khuVucId)) return null;

  if (!khopMaPhamViNghiemNgat(row.SuKienID, suKienId)) return null;
  if (!boQuaSuatDien && !khopMaPhamViNghiemNgat(row.SuatDienID, suatDienId)) return null;

  const gia = toValidPrice(row.GiaVeNiemYet);
  if (gia === null) return null;
  if (lastPrices && lastPrices.get(khuVucId) === gia) return null;

  return {
    type: 'ZONE_PRICE_CHANGED',
    suKienId,
    suatDienId,
    khuVucId,
    gia,
    occurredAt:
      (typeof payload.commit_timestamp === 'string' && payload.commit_timestamp) ||
      new Date().toISOString(),
    nguon: 'REALTIME',
  };
}

/**
 * Đọc giá niêm yết các khu trong phạm vi.
 * @param {any} supabase
 * @param {{suKienId?: number|null, suatDienId?: number|null}} scope
 * @returns {Promise<Array<{KhuVucID: number, SuKienID: number|null, SuatDienID: number|null, GiaVeNiemYet: number|null}>>}
 */
export async function fetchScopeZonePrices(supabase, scope = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('Supabase client is not available or invalid');
  }
  const columns = 'KhuVucID,SuKienID,SuatDienID,GiaVeNiemYet';
  const hasSuat = scope.suatDienId !== null && scope.suatDienId !== undefined;
  let data = null;
  let error = null;
  let legacyNoSuat = false;

  if (hasSuat) {
    ({data, error} = await supabase
      .from('KHU_VUC')
      .select(columns)
      .eq('SuatDienID', scope.suatDienId)
      .order('KhuVucID'));
  }
  if (!hasSuat || (error && ['42703', 'PGRST204'].includes(String(error.code)))) {
    // Schema cũ không có cột SuatDienID: nhánh tương thích rõ ràng, đánh dấu từng dòng.
    legacyNoSuat = hasSuat;
    ({data, error} = await supabase
      .from('KHU_VUC')
      .select(legacyNoSuat ? 'KhuVucID,SuKienID,GiaVeNiemYet' : columns)
      .eq('SuKienID', scope.suKienId)
      .order('KhuVucID'));
  }
  if (error) throw error;

  const toNum = (v) => (v === null || v === undefined ? null : Number(v));
  return (data ?? []).map((row) => ({
    KhuVucID: Number(row.KhuVucID),
    SuKienID: toNum(row.SuKienID),
    SuatDienID: toNum(row.SuatDienID),
    GiaVeNiemYet: toNum(row.GiaVeNiemYet),
    ...(legacyNoSuat ? {[LEGACY_NO_SUAT_KEY]: true} : {}),
  }));
}

/**
 * Đăng ký nhận cập nhật giá bằng client Supabase.
 * @param {object} params
 * @param {any} params.supabase
 * @param {{suKienId?: number|null, suatDienId?: number|null}} params.scope
 * @param {(event: object) => void} params.listener
 * @param {(status: string) => void} [params.onConnectionStatus]
 * @param {(prices: ReadonlyMap<number, number>) => void} [params.onSnapshot]
 * @param {typeof fetchScopeZonePrices} [params.fetchZonePrices]
 * @returns {() => void}
 */
export function subscribeToPriceUpdatesWithClient({
  supabase,
  scope = {},
  listener,
  onConnectionStatus = () => undefined,
  onSnapshot = () => undefined,
  fetchZonePrices = fetchScopeZonePrices,
}) {
  let stopped = false;
  let generation = 0; // tăng khi hủy để bỏ phản hồi fetch cũ
  let channel = null;
  // Đọc lại ở SUBSCRIBED đầu tiên để bù cập nhật rơi vào khoảng giữa lần đọc đầu và lúc subscribe xong.
  let needsResync = true;
  let linkUp = false;
  let resyncSeq = 0;
  let boQuaSuatDien = false;
  const suKienId = scope.suKienId ?? null;
  const suatDienId = scope.suatDienId ?? null;
  const allowedZoneIds = new Set();
  const lastPrices = new Map();
  const updatedDuringResync = new Set();

  const isCurrent = (gen) => !stopped && gen === generation;
  const report = (gen, status) => {
    if (isCurrent(gen)) onConnectionStatus(status);
  };

  const loadRows = async () => {
    const rows = await fetchZonePrices(supabase, {suKienId, suatDienId});
    const list = Array.isArray(rows) ? rows : [];
    // Nhánh schema cũ (không có cột SuatDienID): chỉ bỏ qua kiểm tra SuatDienID khi có dấu hiệu rõ ràng.
    boQuaSuatDien = list.some((row) => row && row[LEGACY_NO_SUAT_KEY] === true);
    // Chuẩn hóa giá như payload realtime (chuỗi NUMERIC -> số, không hợp lệ -> null).
    return list
      .filter(
        (row) =>
          row &&
          normalizeZoneId(row.KhuVucID) !== null &&
          khopMaPhamViNghiemNgat(row.SuKienID, suKienId) &&
          (row[LEGACY_NO_SUAT_KEY] === true || khopMaPhamViNghiemNgat(row.SuatDienID, suatDienId)),
      )
      .map((row) => ({...row, GiaVeNiemYet: toValidPrice(row.GiaVeNiemYet)}));
  };

  const removeCurrentChannel = () => {
    if (channel) {
      if (typeof supabase?.removeChannel === 'function') {
        void supabase.removeChannel(channel);
      }
      channel = null;
    }
  };

  const resync = async (gen) => {
    // Khu đã nhận cập nhật realtime từ lúc resync bắt đầu: bản đọc có thể đã cũ.
    updatedDuringResync.clear();
    const seq = (resyncSeq += 1);
    try {
      const rows = await loadRows();
      if (!isCurrent(gen) || seq !== resyncSeq) return;
      const stale = () => !isCurrent(gen) || seq !== resyncSeq;
      for (const row of rows) {
        if (stale()) return;
        const id = normalizeZoneId(row.KhuVucID);
        if (id === null || !allowedZoneIds.has(id)) continue;
        if (updatedDuringResync.has(id)) continue;
        const gia = row.GiaVeNiemYet;
        if (!isValidPrice(gia) || lastPrices.get(id) === gia) continue;
        lastPrices.set(id, gia);
        listener({
          type: 'ZONE_PRICE_CHANGED',
          suKienId,
          suatDienId,
          khuVucId: id,
          gia,
          occurredAt: new Date().toISOString(),
          nguon: 'RESYNC',
        });
        if (stale()) return; // listener có thể đã gọi unsubscribe
      }
      // Đọc lại thành công sau lỗi: trả trạng thái về CONNECTED nếu kênh vẫn đang mở.
      if (linkUp) report(gen, 'CONNECTED');
    } catch {
      // Để lần SUBSCRIBED kế tiếp thử đọc lại, tránh mất cập nhật bỏ lỡ.
      if (!isCurrent(gen) || seq !== resyncSeq) return;
      needsResync = true;
      report(gen, 'ERROR');
    }
  };

  const start = async (gen) => {
    onConnectionStatus('CONNECTING');
    try {
      const rows = await loadRows();
      if (!isCurrent(gen)) return;

      for (const row of rows) {
        const id = normalizeZoneId(row.KhuVucID);
        allowedZoneIds.add(id);
        if (isValidPrice(row.GiaVeNiemYet)) lastPrices.set(id, row.GiaVeNiemYet);
      }
      onSnapshot(new Map(lastPrices));
      if (!isCurrent(gen)) return; // onSnapshot có thể đã gọi unsubscribe

      // Không có khu: không tạo subscription toàn bảng, báo sẵn sàng.
      if (allowedZoneIds.size === 0) {
        onConnectionStatus('CONNECTED');
        return;
      }

      const uuid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      let ch = supabase.channel(`price-${suatDienId ?? suKienId}-${uuid}`);

      const handlePayload = (payload) => {
        if (!isCurrent(gen)) return;
        const row = payload && typeof payload === 'object' ? payload.new : null;
        const event = mapRealtimePricePayload(payload, {
          allowedZoneIds,
          suKienId,
          suatDienId,
          boQuaSuatDien,
        });
        if (!event) {
          // Payload của khu đang theo dõi nhưng thiếu định danh phạm vi: không phát, đọc xác minh lại.
          const zid = row && typeof row === 'object' ? normalizeZoneId(row.KhuVucID) : null;
          if (
            zid !== null &&
            allowedZoneIds.has(zid) &&
            thieuDinhDanhPhamVi(row, {suKienId, suatDienId, boQuaSuatDien})
          ) {
            void resync(gen);
          }
          return;
        }
        if (!isCurrent(gen)) return;
        // Đánh dấu khu đã nhận realtime hợp lệ TRƯỚC khi bỏ qua bản trùng giá, để resync đang
        // chạy không ghi đè giá mới này bằng bản đọc cũ hơn.
        updatedDuringResync.add(event.khuVucId);
        if (lastPrices.get(event.khuVucId) === event.gia) return;
        lastPrices.set(event.khuVucId, event.gia);
        listener(event);
      };

      for (const chunk of chunkArray([...allowedZoneIds], MAX_ZONE_FILTER_SIZE)) {
        ch = ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'KHU_VUC',
            filter: buildZoneInFilter(chunk),
          },
          handlePayload,
        );
      }

      channel = ch;
      ch = ch.subscribe((status) => {
        if (!isCurrent(gen)) return;
        if (status === 'SUBSCRIBED') {
          linkUp = true;
          onConnectionStatus('CONNECTED');
          if (!isCurrent(gen)) return; // callback trạng thái có thể đã gọi unsubscribe
          if (needsResync) {
            needsResync = false;
            void resync(gen);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          linkUp = false;
          needsResync = true;
          onConnectionStatus('ERROR');
        } else if (status === 'CLOSED') {
          linkUp = false;
          needsResync = true;
          onConnectionStatus('DISCONNECTED');
        }
      });

      // Hủy xảy ra trong lúc đang subscribe: gỡ channel ngay.
      if (!isCurrent(gen)) removeCurrentChannel();
    } catch {
      report(gen, 'ERROR');
    }
  };

  void start(generation);

  return () => {
    stopped = true;
    generation += 1;
    removeCurrentChannel();
  };
}

// ---- Nhánh mock (hydrogen) ----

const DEFAULT_MOCK_STORAGE_KEY = 'eventticketing.pricing.mock.v1';

function docGiaTrongPhamVi(state, suKienId, suatDienId) {
  const prices = new Map();
  const khuVuc = state?.khuVuc;
  if (!khuVuc || typeof khuVuc !== 'object') return prices;

  for (const [rawId, kv] of Object.entries(khuVuc)) {
    if (!kv || typeof kv !== 'object') continue;
    const khuVucId = normalizeZoneId(kv.KhuVucID ?? rawId);
    if (khuVucId === null) continue;
    if (!khopMaPhamViNghiemNgat(kv.SuKienID, suKienId)) continue;
    if (!khopMaPhamViNghiemNgat(kv.SuatDienID, suatDienId)) continue;
    if (!isValidPrice(kv.GiaVeNiemYet)) continue;
    prices.set(khuVucId, kv.GiaVeNiemYet);
  }
  return prices;
}

/**
 * Kiểm tra localStorage ghi được thật: setItem rồi removeItem trên khóa thăm dò.
 * @param {{setItem?: Function, removeItem?: Function}|null|undefined} storage
 * @param {string} key
 * @returns {boolean}
 */
export function kiemTraGhiLocalStorage(storage, key) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const probeKey = `${key}.__probe`;
  try {
    storage.setItem(probeKey, '1');
    if (typeof storage.removeItem === 'function') storage.removeItem(probeKey);
    else storage.setItem(probeKey, '');
    return true;
  } catch {
    return false;
  }
}

/**
 * Phát thông báo thay đổi giá mô phỏng trong cùng tab qua CustomEvent.
 * @param {EventTarget|null|undefined} target
 * @param {unknown} [detail]
 */
export function phatThongBaoGiaMock(target, detail) {
  if (!target || typeof target.dispatchEvent !== 'function') return;
  const event =
    typeof CustomEvent === 'function'
      ? new CustomEvent(PRICE_MOCK_EVENT, {detail})
      : Object.assign(new Event(PRICE_MOCK_EVENT), {detail});
  target.dispatchEvent(event);
}

/**
 * Đăng ký nhận cập nhật giá mô phỏng (cùng tab qua CustomEvent và giữa các tab qua 'storage').
 * Luôn đọc lại state từ readState rồi diff theo GiaVeNiemYet trong phạm vi.
 *
 * @param {object} params
 * @param {{suKienId?: number|null, suatDienId?: number|null}} [params.scope]
 * @param {() => Promise<{state: any, meta?: {luuTru?: string|null}|null, luuTru?: {luuTru?: string|null}|null}>} params.readState
 * @param {EventTarget|null} [params.eventTarget]
 * @param {string} [params.storageKey]
 * @param {(event: object) => void} params.listener
 * @param {(status: string) => void} [params.onConnectionStatus]
 * @param {(prices: ReadonlyMap<number, number>) => void} [params.onSnapshot]
 * @param {() => boolean} [params.canWriteStorage] false hoặc bỏ trống (chưa xác minh ghi) => LOCAL_ONLY dù đọc được
 * @returns {() => void}
 */
export function subscribeToMockPriceUpdates({
  scope = {},
  readState,
  eventTarget = typeof window !== 'undefined' ? window : null,
  storageKey = DEFAULT_MOCK_STORAGE_KEY,
  listener,
  onConnectionStatus = () => undefined,
  onSnapshot = () => undefined,
  canWriteStorage = () => false,
}) {
  let stopped = false;
  let initialized = false;
  let inFlight = false;
  let queued = false;
  let lastStatus = null;
  let lastPrices = new Map();
  const suKienId = scope?.suKienId ?? null;
  const suatDienId = scope?.suatDienId ?? null;
  const hasEventTarget = Boolean(eventTarget && typeof eventTarget.addEventListener === 'function');

  const baoTrangThai = (status) => {
    if (stopped || status === lastStatus) return;
    lastStatus = status;
    onConnectionStatus(status);
  };

  const dongBo = async () => {
    if (stopped) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      do {
        queued = false;
        let ketQua;
        try {
          ketQua = await readState();
        } catch {
          if (!stopped) baoTrangThai('ERROR');
          continue;
        }
        if (stopped) return;

        const meta = ketQua?.meta ?? ketQua?.luuTru ?? null;
        const luuTru = typeof meta === 'string' ? meta : meta?.luuTru;
        // Không có eventTarget (ví dụ ngoài trình duyệt / SSR): không thể nghe sự kiện đồng bộ, chỉ LOCAL_ONLY.
        // Tab chỉ đọc có thể đọc được nhưng không ghi được (quota, private mode): không báo CONNECTED giả.
        let ghiDuoc = false;
        if (hasEventTarget && luuTru === 'LOCAL_STORAGE' && typeof canWriteStorage === 'function') {
          try {
            ghiDuoc = canWriteStorage() === true;
          } catch {
            ghiDuoc = false;
          }
        }
        const nextStatus = ghiDuoc ? 'CONNECTED' : 'LOCAL_ONLY';
        const nextPrices = docGiaTrongPhamVi(ketQua?.state, suKienId, suatDienId);

        if (!initialized) {
          lastPrices = nextPrices;
          initialized = true;
          onSnapshot(new Map(lastPrices));
          if (stopped) return;
          baoTrangThai(nextStatus);
          if (stopped) return;
        } else {
          baoTrangThai(nextStatus);
          if (stopped) return;
          const occurredAt = new Date().toISOString();
          for (const [khuVucId, gia] of nextPrices) {
            if (stopped) return;
            if (lastPrices.get(khuVucId) === gia) continue;
            lastPrices.set(khuVucId, gia);
            listener({
              type: 'ZONE_PRICE_CHANGED',
              suKienId,
              suatDienId,
              khuVucId,
              gia,
              occurredAt,
              nguon: 'MOCK',
            });
            if (stopped) return;
          }
          for (const id of lastPrices.keys()) {
            if (stopped) return;
            if (!nextPrices.has(id)) lastPrices.delete(id);
          }
        }
      } while (queued && !stopped);
    } finally {
      inFlight = false;
    }
  };

  const onMockEvent = () => {
    if (stopped) return;
    void dongBo();
  };

  const onStorageEvent = (event) => {
    if (stopped) return;
    const key = event?.key;
    if (key !== storageKey && key !== null) return;
    void dongBo();
  };

  if (hasEventTarget) {
    eventTarget.addEventListener(PRICE_MOCK_EVENT, onMockEvent);
    eventTarget.addEventListener('storage', onStorageEvent);
  }

  baoTrangThai('CONNECTING');
  void dongBo();

  return () => {
    stopped = true;
    queued = false;
    if (eventTarget && typeof eventTarget.removeEventListener === 'function') {
      eventTarget.removeEventListener(PRICE_MOCK_EVENT, onMockEvent);
      eventTarget.removeEventListener('storage', onStorageEvent);
    }
  };
}
