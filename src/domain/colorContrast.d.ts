export function parseHex(hex: string): [number, number, number] | null;
export function relativeLuminance(rgb: [number, number, number]): number;
export function contrastRatio(hexA: string, hexB: string): number | null;
export function readableInk(background: string, dark?: string, light?: string): string;
export function accessibleBadgeColors(accent: string, minimum?: number, dark?: string, light?: string): {background: string; color: string};
