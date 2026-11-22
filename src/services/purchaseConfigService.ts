/**
 * Dịch vụ cấu hình mua vé theo sự kiện (CAU_HINH_SU_KIEN) dùng chung cho BTC (đọc/lưu) và khán giả (đọc).
 *
 * - Nhánh thật: đọc trực tiếp CAU_HINH_SU_KIEN (không có bản ghi -> 4 / false), lưu chỉ gọi RPC
 *   luu_cau_hinh_mua_ve (trigger DB tự ghi audit, tuyệt đối không ghi trực tiếp bảng hay audit từ client).
 * - Nhánh mock: chỉ kích hoạt khi runtimeConfig.useMockData === true; dùng một kho mock singleton
 *   chia sẻ theo ID sự kiện giữa luồng BTC và luồng khán giả, không import supabaseClient.
 */
import type {SupabaseClient} from '@supabase/supabase-js';
import {runtimeConfig} from '../config/runtime';
import type {Database} from '../types/database.types';
import {readMockAccountKind} from '../domain/accountAccess';
import {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  LOAI_TAI_KHOAN_CAU_HINH,
  MAX_SO_VE_TOI_DA,
  MIN_SO_VE_TOI_DA,
  PurchaseConfigError,
  RPC_LUU_CAU_HINH,
  VAI_TRO_CAU_HINH,
  canManagePurchaseConfig,
  chuanHoaDongCauHinh,
  docCauHinhTheoCauHinh,
  luuCauHinhTheoCauHinh,
  phanLoaiLoiRpc,
  taoThamSoRpc,
  validatePurchaseConfigInput,
} from '../domain/purchaseConfig.js';
import type {
  KhoCauHinhMoPhong,
  PurchaseConfigDeps,
  PurchaseConfigErrorCode,
  PurchaseConfigFieldErrors,
  PurchaseConfigInput,
  PurchaseConfigNguon,
  PurchaseConfigRead,
  PurchaseConfigRpcArgs,
  PurchaseConfigSaveResult,
  PurchaseConfigValidation,
} from '../domain/purchaseConfig';
import {
  DEMO_NGUOI_DUNG,
  DEMO_TO_CHUC_ID,
  KHOA_LUU_TRU_MO_PHONG,
  NHAN_MO_PHONG,
  khoiTaoDemoCauHinhMuaVe,
  taoKhoMoPhong,
} from '../domain/mockPurchaseConfig.js';
import type {
  MockCauHinhSuKienRecord,
  MockPurchaseConfigSeed,
  MockPurchaseConfigState,
  MockPurchaseConfigStorage,
  MockPurchaseConfigStore,
} from '../domain/mockPurchaseConfig';

export {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  DEMO_NGUOI_DUNG,
  DEMO_TO_CHUC_ID,
  KHOA_LUU_TRU_MO_PHONG,
  LOAI_TAI_KHOAN_CAU_HINH,
  MAX_SO_VE_TOI_DA,
  MIN_SO_VE_TOI_DA,
  NHAN_MO_PHONG,
  PurchaseConfigError,
  RPC_LUU_CAU_HINH,
  VAI_TRO_CAU_HINH,
  canManagePurchaseConfig,
  chuanHoaDongCauHinh,
  khoiTaoDemoCauHinhMuaVe,
  phanLoaiLoiRpc,
  taoThamSoRpc,
  validatePurchaseConfigInput,
};

export type {
  KhoCauHinhMoPhong,
  MockCauHinhSuKienRecord,
  MockPurchaseConfigSeed,
  MockPurchaseConfigState,
  MockPurchaseConfigStorage,
  MockPurchaseConfigStore,
  PurchaseConfigDeps,
  PurchaseConfigErrorCode,
  PurchaseConfigFieldErrors,
  PurchaseConfigInput,
  PurchaseConfigNguon,
  PurchaseConfigRead,
  PurchaseConfigRpcArgs,
  PurchaseConfigSaveResult,
  PurchaseConfigValidation,
};

export interface PurchaseConfigServiceOptions {
  /** Chỉ dùng ở nhánh thật; mặc định gọi import động requireSupabaseClient(). */
  client?: SupabaseClient<Database> | unknown;
  /** Chỉ dùng ở nhánh mock để xác định người dùng kiểm quyền. */
  nguoiDung?: unknown;
}

const MOCK_SESSION_KEY = 'eventticketing:mock-organizer-session';

let khoMockSingleton: MockPurchaseConfigStore = taoKhoMoPhong();

/**
 * Đặt lại kho mock singleton (chủ yếu dùng trong kiểm thử). Khi truyền options.storage (kể cả null)
 * kho được tạo lại với storage đó; gọi không tham số khôi phục kho mặc định.
 */
export function datLaiKhoMoPhongCauHinhMuaVe(
  seed?: MockPurchaseConfigSeed,
  options?: {storage?: MockPurchaseConfigStorage | null},
): void {
  if (options && 'storage' in options) {
    khoMockSingleton = taoKhoMoPhong(options.storage, {seed});
    return;
  }
  khoMockSingleton = taoKhoMoPhong();
  khoMockSingleton.datLai(seed);
}

async function laySupabaseClient(opts: PurchaseConfigServiceOptions) {
  if (opts.client !== undefined) return opts.client;
  const {requireSupabaseClient} = await import('./supabaseClient');
  return requireSupabaseClient();
}

function docNguoiDungMockMacDinh(): unknown {
  try {
    const storage = typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    if (storage) {
      const email = storage.getItem(MOCK_SESSION_KEY);
      if (email) {
        const profile = readMockAccountKind(storage, email);
        return {
          id: DEMO_NGUOI_DUNG.id,
          loaiTaiKhoan: profile?.data?.LoaiTaiKhoan ?? null,
        };
      }
    }
  } catch {
    // Truy cập localStorage bị chặn: dùng người dùng demo mô phỏng.
  }
  return DEMO_NGUOI_DUNG;
}

function layNguoiDungMock(opts: PurchaseConfigServiceOptions): unknown {
  if ('nguoiDung' in opts && opts.nguoiDung !== undefined) {
    return opts.nguoiDung;
  }
  return docNguoiDungMockMacDinh();
}

export async function docCauHinhMuaVe(
  suKienId: number | string,
  opts: PurchaseConfigServiceOptions = {},
): Promise<PurchaseConfigRead> {
  // Chỉ runtimeConfig.useMockData quyết định nhánh mock; không tùy chọn nào của caller ghi đè được.
  return docCauHinhTheoCauHinh(
    {
      useMockData: runtimeConfig.useMockData,
      layClient: () => laySupabaseClient(opts),
      khoMoPhong: khoMockSingleton,
    },
    suKienId,
  );
}

export async function luuCauHinhMuaVe(
  suKienId: number | string,
  input: unknown,
  opts: PurchaseConfigServiceOptions = {},
): Promise<PurchaseConfigSaveResult> {
  // Chỉ runtimeConfig.useMockData quyết định nhánh mock; không tùy chọn nào của caller ghi đè được.
  return luuCauHinhTheoCauHinh(
    {
      useMockData: runtimeConfig.useMockData,
      layClient: () => laySupabaseClient(opts),
      khoMoPhong: khoMockSingleton,
      nguoiDung: layNguoiDungMock(opts),
    },
    suKienId,
    input,
  );
}
