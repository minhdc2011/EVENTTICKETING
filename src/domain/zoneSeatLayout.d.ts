export interface Point {
  x: number;
  y: number;
}
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PlacedSeat<TSeat = unknown> {
  seat: TSeat;
  rowLabel: string;
  x: number;
  y: number;
  r: number;
}
export function parsePolygonPath(d: string | null | undefined): Point[] | null;
export function rectToPolygon(rect: {x: number; y: number; width: number; height: number}): Point[];
export function horizontalSpanAt(polygon: Point[], y: number): {xmin: number; xmax: number} | null;
export function layoutZoneSeats<TSeat = unknown>(input: {
  rows: Array<{rowLabel: string; seats: TSeat[]}>;
  bbox: BBox;
  polygon?: Point[] | null;
}): Array<PlacedSeat<TSeat>>;
