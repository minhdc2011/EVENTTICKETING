export const SEATS_PER_ROW: number;
export function rowLabel(index: number): string;
export function generateSeatRows(
  zoneCode: string,
  capacity: number,
  existingCount?: number,
  perRow?: number,
): Array<{SoHang: string; SoGhe: string; MaGheDayDu: string; TrangThai: 'TRONG'}>;
