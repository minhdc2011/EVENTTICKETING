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
export interface ArcSpec {
  cx: number;
  cy: number;
  outerRx: number;
  outerRy: number;
  innerRx: number;
  innerRy: number;
  start: number;
  end: number;
}
export interface PlacedSeat<TSeat = unknown> {
  seat: TSeat;
  rowLabel: string;
  x: number;
  y: number;
  r: number;
}
export function parsePolygonPath(d: string | null | undefined): Point[] | null;
export function parsePolygonPoints(points: string | null | undefined): Point[] | null;
export function rectToPolygon(rect: {x: number; y: number; width: number; height: number}): Point[];
export function horizontalSpanAt(polygon: Point[], y: number): {xmin: number; xmax: number} | null;
export function safeSpanForRow(polygon: Point[] | null, bbox: BBox, y: number, t: number): {xmin: number; xmax: number};
export function pointOnEllipse(cx: number, cy: number, rx: number, ry: number, angleDeg: number): Point;
export function arcSectorBBox(arc: ArcSpec): BBox;
export function parseArcSpec(raw: string | null | undefined): ArcSpec | null;
export function layoutZoneSeats<TSeat = unknown>(input: {
  rows: Array<{rowLabel: string; seats: TSeat[]}>;
  bbox: BBox;
  polygon?: Point[] | null;
  arc?: ArcSpec | null;
}): Array<PlacedSeat<TSeat>>;
