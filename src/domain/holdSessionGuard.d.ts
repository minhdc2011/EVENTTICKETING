export const THONG_BAO_DANG_XUAT_TRA_CHO: string;
export const THONG_BAO_DOI_TAI_KHOAN_TRA_CHO: string;
export function taoBoTheoDoiPhienGiuCho(): (
  session: {userId?: string} | null | undefined,
  dangGiuCho: boolean,
) => null | {lyDo: 'DANG_XUAT' | 'DOI_TAI_KHOAN'; thongBao: string};
