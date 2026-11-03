import type {ZoneRecord, HoldItem} from '../types/ticketing';
export const STANDING_ZONE_TYPE: 'DUNG_STAND';
export function isStandingZone(zone: Pick<ZoneRecord, 'LoaiKhuVuc'> | null | undefined): boolean;
export function sumStanding(standing: Record<string, number> | null | undefined): number;
export function setStandingQuantity(
  standing: Record<string, number> | null | undefined,
  zoneCode: string,
  requested: number,
  options: {maxPerOrder: number; seatedCount?: number; available?: number},
): {standing: Record<string, number>; quantity: number; clamped: boolean};
export function buildStandingHoldItems(standing: Record<string, number>, zones: ZoneRecord[]): HoldItem[];
export function calculateStandingTotal(standing: Record<string, number>, zones: ZoneRecord[]): number;
export function findZoneForTier(tier: {code: string} | null | undefined, zones: ZoneRecord[]): ZoneRecord | null;
