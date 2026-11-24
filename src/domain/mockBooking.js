import {taoLoiVuotGioiHan} from './purchaseLimitError.js';

export const TRAN_VE_MOI_LUOT = 4;
export const THOI_GIAN_GIU_MS = 300_000;
export const GIOI_HAN_MAC_DINH = 4;

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

function taoLoiHetHan() {
  const err = new Error('GIU_CHO_HET_HAN');
  err.code = 'P0001';
  err.ma = 'GIU_CHO_HET_HAN';
  return err;
}

function taoLoi22023(message) {
  const err = new Error(message);
  err.code = '22023';
  return err;
}

export function tinhSoLuongYeuCau(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let total = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') return Number.NaN;
    if (item.quantity === undefined || item.quantity === null) {
      total += 1;
    } else if (typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity >= 1) {
      total += item.quantity;
    } else {
      return Number.NaN;
    }
  }
  return total;
}

/**
 * Sao chép items, luôn bỏ DonGiaChot/price do caller gửi. Khi có bangGiaChot (zoneCode → giá),
 * DonGiaChot lấy từ bảng; thiếu khu hoặc giá không hợp lệ thì ném lỗi 22023 (không dùng giá caller).
 */
export function ganDonGiaChot(items, bangGiaChot) {
  return items.map((item) => {
    // eslint-disable-next-line no-unused-vars
    const {DonGiaChot, price, ...rest} = item;
    if (bangGiaChot === undefined || bangGiaChot === null) return rest;
    const gia = bangGiaChot.get(rest.zoneCode);
    if (typeof gia !== 'number' || !Number.isFinite(gia) || gia <= 0) {
      throw taoLoi22023(`Khong co gia chot cho khu ${String(rest.zoneCode)}`);
    }
    return {...rest, DonGiaChot: gia};
  });
}

export function demVeDangGiu(holds, taiKhoanId, suKienId, nowMs = Date.now()) {
  if (!Array.isArray(holds)) return 0;
  const targetAccount = normalizeId(taiKhoanId);
  const targetEvent = normalizeId(suKienId);
  if (targetAccount === null || targetEvent === null) return 0;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 0;

  let total = 0;
  for (const hold of holds) {
    if (!hold || typeof hold !== 'object') continue;
    if (hold.status !== 'ACTIVE' && hold.status !== 'CONVERTED') continue;
    if (normalizeId(hold.taiKhoanId) !== targetAccount) continue;
    if (normalizeId(hold.suKienId) !== targetEvent) continue;

    // Vé đã xác nhận thanh toán luôn được tính; giữ chỗ chỉ tính khi còn hạn (giống máy chủ).
    if (hold.status === 'ACTIVE') {
      const expMs = typeof hold.expiresAtMs === 'number' ? hold.expiresAtMs : Date.parse(hold.expiresAt);
      if (!Number.isFinite(expMs) || expMs <= nowMs) continue;
    }

    const qty =
      typeof hold.soLuong === 'number' && Number.isInteger(hold.soLuong) && hold.soLuong > 0
        ? hold.soLuong
        : tinhSoLuongYeuCau(hold.items);
    if (Number.isInteger(qty) && qty > 0) total += qty;
  }
  return total;
}

export function taoKhoGiuChoMoPhong(options = {}) {
  const getNow = typeof options?.now === 'function' ? options.now : () => Date.now();
  const ttlMs =
    typeof options?.thoiGianGiuMs === 'number' &&
    Number.isFinite(options.thoiGianGiuMs) &&
    options.thoiGianGiuMs > 0
      ? options.thoiGianGiuMs
      : THOI_GIAN_GIU_MS;
  const nextId =
    typeof options?.taoId === 'function' ? options.taoId : () => `mock-${globalThis.crypto.randomUUID()}`;

  const holds = [];

  return {
    giuCho({taiKhoanId, suKienId, suatDienId, eventId, items, gioiHan, bangGiaChot} = {}) {
      const soLuongMoi = tinhSoLuongYeuCau(items);
      if (Number.isNaN(soLuongMoi)) {
        throw taoLoi22023('So luong ve khong hop le');
      }
      if (!Array.isArray(items) || items.length === 0 || soLuongMoi < 1 || soLuongMoi > TRAN_VE_MOI_LUOT) {
        throw taoLoi22023('Moi luot chi duoc giu tu 1 den 4 ve');
      }

      const gioiHanApDung =
        typeof gioiHan === 'number' && Number.isInteger(gioiHan) && gioiHan >= 1 ? gioiHan : GIOI_HAN_MAC_DINH;

      const nowMs = getNow();
      const accountKey = normalizeId(taiKhoanId) ?? 'mock-user';
      const eventKey = normalizeId(suKienId) ?? normalizeId(eventId) ?? '';

      const dangGiu = demVeDangGiu(holds, accountKey, eventKey, nowMs);
      if (dangGiu + soLuongMoi > gioiHanApDung) {
        throw taoLoiVuotGioiHan({
          gioiHan: gioiHanApDung,
          dangGiu,
          conLai: Math.max(gioiHanApDung - dangGiu, 0),
        });
      }

      // Xác thực/gán giá trước khi ghi để giữ chỗ lỗi không chiếm hạn mức.
      const itemsDaGan = ganDonGiaChot(items, bangGiaChot);

      const holdId = String(nextId());
      const expiresAtMs = nowMs + ttlMs;
      const expiresAt = new Date(expiresAtMs).toISOString();
      const resolvedEventId = String(eventId ?? suKienId ?? '');
      const frozenItems = Object.freeze(itemsDaGan.map((item) => Object.freeze({...item})));

      holds.push(
        Object.freeze({
          holdId,
          eventId: resolvedEventId,
          taiKhoanId: accountKey,
          suKienId: eventKey,
          suatDienId: suatDienId ?? null,
          status: 'ACTIVE',
          expiresAt,
          expiresAtMs,
          createdAtMs: nowMs,
          soLuong: soLuongMoi,
          gioiHan: gioiHanApDung,
          items: frozenItems,
        }),
      );

      return {
        holdId,
        eventId: resolvedEventId,
        status: 'ACTIVE',
        expiresAt,
        items: itemsDaGan.map((item) => ({...item})),
      };
    },

    huy(holdId) {
      if (typeof holdId !== 'string' || !holdId) return;
      const idx = holds.findIndex((h) => h.holdId === holdId);
      if (idx === -1) return;
      if (holds[idx].status === 'RELEASED') return;
      holds[idx] = Object.freeze({...holds[idx], status: 'RELEASED'});
    },

    /** Gia hạn một lần (thêm ttl) khi bắt đầu bước OTP; trả hạn hiện tại nếu đã gia hạn. */
    giaHan(holdId) {
      const idx = holds.findIndex((h) => h.holdId === holdId);
      const nowMs = getNow();
      if (idx === -1) throw taoLoiHetHan();
      const hold = holds[idx];
      if (hold.status !== 'ACTIVE' || hold.expiresAtMs <= nowMs) throw taoLoiHetHan();
      if (hold.daGiaHan) {
        return {holdId, expiresAt: hold.expiresAt, daGiaHan: true, giaHanMoi: false};
      }
      const expiresAtMs = Math.max(hold.expiresAtMs, nowMs + ttlMs);
      const expiresAt = new Date(expiresAtMs).toISOString();
      holds[idx] = Object.freeze({...hold, expiresAt, expiresAtMs, daGiaHan: true});
      return {holdId, expiresAt, daGiaHan: true, giaHanMoi: true};
    },

    /** Xác nhận thanh toán (mô phỏng): giữ chỗ còn hạn chuyển sang CONVERTED. */
    xacNhan(holdId) {
      const idx = holds.findIndex((h) => h.holdId === holdId);
      if (idx === -1) throw taoLoiHetHan();
      const hold = holds[idx];
      if (hold.status === 'CONVERTED') return {holdId, status: 'CONVERTED', daXacNhanTruoc: true};
      if (hold.status !== 'ACTIVE' || hold.expiresAtMs <= getNow()) throw taoLoiHetHan();
      holds[idx] = Object.freeze({...hold, status: 'CONVERTED', muaLucMs: getNow()});
      return {holdId, status: 'CONVERTED', soVe: hold.soLuong};
    },

    /** Tài khoản sở hữu giữ chỗ (để dịch vụ kiểm đúng chủ). */
    layGiuCho(holdId) {
      return holds.find((h) => h.holdId === holdId) ?? null;
    },

    dangGiu(taiKhoanId, suKienId) {
      return demVeDangGiu(holds, taiKhoanId, suKienId, getNow());
    },

    layDanhSach() {
      return holds.slice();
    },
  };
}
