/**
 * Pure pan/zoom maths for the seat map (FR-T1-04).
 *
 * Model: the map content is transformed with `translate(x, y) scale(zoom)` and
 * `transform-origin: 0 0`, inside a clipped frame. Sizes are untransformed pixels:
 *   vw/vh = frame (viewport) size, cw/ch = content size at zoom 1.
 * None of this touches seat state or selection: it only describes a camera.
 */

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;
export const DRAG_THRESHOLD_PX = 6;
export const KEY_PAN_PX = 60;

export const INITIAL_VIEW = Object.freeze({zoom: 1, x: 0, y: 0});

/** @param {number} zoom */
export function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function clampAxis(offset, viewportSize, contentSize, zoom) {
  const scaled = contentSize * zoom;
  // Content smaller than the frame: keep it centred, no panning.
  if (scaled <= viewportSize) return (viewportSize - scaled) / 2;
  // Content larger: never expose empty space beyond its edges.
  return Math.min(0, Math.max(viewportSize - scaled, offset));
}

/**
 * Keeps the content inside the frame.
 * @param {{zoom:number,x:number,y:number}} view
 * @param {{vw:number,vh:number,cw:number,ch:number}} sizes
 */
export function clampView(view, sizes) {
  const zoom = clampZoom(view.zoom);
  return {
    zoom,
    x: clampAxis(view.x, sizes.vw, sizes.cw, zoom),
    y: clampAxis(view.y, sizes.vh, sizes.ch, zoom),
  };
}

/**
 * Zooms to `nextZoom` keeping the content point under `point` (frame coordinates) fixed.
 * @param {{zoom:number,x:number,y:number}} view
 * @param {number} nextZoom
 * @param {{x:number,y:number}} point
 * @param {{vw:number,vh:number,cw:number,ch:number}} sizes
 */
export function zoomAtPoint(view, nextZoom, point, sizes) {
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / view.zoom;
  return clampView(
    {
      zoom,
      x: point.x - (point.x - view.x) * ratio,
      y: point.y - (point.y - view.y) * ratio,
    },
    sizes,
  );
}

/** Zoom by a multiplicative factor around the centre of the frame (buttons, keyboard). */
export function zoomByFactor(view, factor, sizes) {
  return zoomAtPoint(view, view.zoom * factor, {x: sizes.vw / 2, y: sizes.vh / 2}, sizes);
}

/** @param {{zoom:number,x:number,y:number}} view */
export function panBy(view, dx, dy, sizes) {
  return clampView({zoom: view.zoom, x: view.x + dx, y: view.y + dy}, sizes);
}

/**
 * Two-finger gesture: scale by the change in finger distance and follow the midpoint.
 * @param {{zoom:number,x:number,y:number}} startView view when the gesture began
 * @param {{distance:number, mid:{x:number,y:number}}} start
 * @param {{distance:number, mid:{x:number,y:number}}} current
 */
export function pinchView(startView, start, current, sizes) {
  if (!(start.distance > 0)) return clampView(startView, sizes);
  const zoom = clampZoom(startView.zoom * (current.distance / start.distance));
  // Content point that was under the starting midpoint must end up under the current midpoint.
  const contentX = (start.mid.x - startView.x) / startView.zoom;
  const contentY = (start.mid.y - startView.y) / startView.zoom;
  return clampView(
    {zoom, x: current.mid.x - contentX * zoom, y: current.mid.y - contentY * zoom},
    sizes,
  );
}

/** Pan so that a content point (untransformed coordinates) sits at the frame centre. */
export function centerOnContentPoint(view, point, sizes) {
  return clampView(
    {
      zoom: view.zoom,
      x: sizes.vw / 2 - point.x * view.zoom,
      y: sizes.vh / 2 - point.y * view.zoom,
    },
    sizes,
  );
}

/** Pointer movement only counts as a drag (not a click) beyond a small threshold. */
export function exceedsDragThreshold(dx, dy, threshold = DRAG_THRESHOLD_PX) {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * Maps a keyboard key to a camera action. Arrows pan (only meaningful when zoomed/overflowing),
 * `+`/`-` zoom, `0` resets.
 * @param {string} key
 * @returns {{type:'pan',dx:number,dy:number} | {type:'zoom',factor:number} | {type:'reset'} | null}
 */
export function keyToAction(key) {
  switch (key) {
    case 'ArrowLeft': return {type: 'pan', dx: KEY_PAN_PX, dy: 0};
    case 'ArrowRight': return {type: 'pan', dx: -KEY_PAN_PX, dy: 0};
    case 'ArrowUp': return {type: 'pan', dx: 0, dy: KEY_PAN_PX};
    case 'ArrowDown': return {type: 'pan', dx: 0, dy: -KEY_PAN_PX};
    case '+':
    case '=':
      return {type: 'zoom', factor: ZOOM_STEP};
    case '-':
    case '_':
      return {type: 'zoom', factor: 1 / ZOOM_STEP};
    case '0':
      return {type: 'reset'};
    default:
      return null;
  }
}

/** Wheel zoom factor; only used when Ctrl/Cmd is held so normal page scrolling is untouched. */
export function wheelZoomFactor(deltaY) {
  return Math.exp(-deltaY * 0.0015);
}
