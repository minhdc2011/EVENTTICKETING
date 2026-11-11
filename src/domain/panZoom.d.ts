export interface MapView {zoom: number; x: number; y: number}
export interface MapSizes {vw: number; vh: number; cw: number; ch: number}
export interface Point {x: number; y: number}
export const MIN_ZOOM: number;
export const MAX_ZOOM: number;
export const ZOOM_STEP: number;
export const DRAG_THRESHOLD_PX: number;
export const KEY_PAN_PX: number;
export const INITIAL_VIEW: Readonly<MapView>;
export function clampZoom(zoom: number): number;
export function clampView(view: MapView, sizes: MapSizes): MapView;
export function zoomAtPoint(view: MapView, nextZoom: number, point: Point, sizes: MapSizes): MapView;
export function zoomByFactor(view: MapView, factor: number, sizes: MapSizes): MapView;
export function panBy(view: MapView, dx: number, dy: number, sizes: MapSizes): MapView;
export function pinchView(
  startView: MapView,
  start: {distance: number; mid: Point},
  current: {distance: number; mid: Point},
  sizes: MapSizes,
): MapView;
export function centerOnContentPoint(view: MapView, point: Point, sizes: MapSizes): MapView;
export function exceedsDragThreshold(dx: number, dy: number, threshold?: number): boolean;
export type KeyAction =
  | {type: 'pan'; dx: number; dy: number}
  | {type: 'zoom'; factor: number}
  | {type: 'reset'}
  | null;
export function keyToAction(key: string): KeyAction;
export function wheelZoomFactor(deltaY: number): number;
