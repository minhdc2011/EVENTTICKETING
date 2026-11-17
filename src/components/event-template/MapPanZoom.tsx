import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type FocusEvent as ReactFocusEvent,
} from 'react';
import {
  INITIAL_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  centerOnContentPoint,
  clampView,
  exceedsDragThreshold,
  keyToAction,
  panBy,
  pinchView,
  wheelZoomFactor,
  zoomAtPoint,
  zoomByFactor,
  type MapSizes,
  type MapView,
} from '../../domain/panZoom.js';

export {MAX_ZOOM, MIN_ZOOM};

const EMPTY_SIZES: MapSizes = {vw: 0, vh: 0, cw: 0, ch: 0};

/**
 * Camera state for the seat map. Lives in the parent so the toolbar buttons (+/−/reset)
 * and the gesture surface share one view. It never touches seat state or selection.
 */
export function usePanZoom() {
  const [view, setView] = useState<MapView>(INITIAL_VIEW);
  const viewRef = useRef<MapView>(INITIAL_VIEW);
  const sizesRef = useRef<MapSizes>(EMPTY_SIZES);
  const frameRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((next: MapView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const apply = useCallback(
    (fn: (current: MapView, sizes: MapSizes) => MapView) => {
      commit(fn(viewRef.current, sizesRef.current));
    },
    [commit],
  );

  const setSizes = useCallback(
    (sizes: MapSizes) => {
      const prev = sizesRef.current;
      if (
        prev.vw === sizes.vw && prev.vh === sizes.vh && prev.cw === sizes.cw && prev.ch === sizes.ch
      ) {
        return;
      }
      sizesRef.current = sizes;
      commit(clampView(viewRef.current, sizes));
    },
    [commit],
  );

  const zoomIn = useCallback(() => apply((v, s) => zoomByFactor(v, ZOOM_STEP, s)), [apply]);
  const zoomOut = useCallback(() => apply((v, s) => zoomByFactor(v, 1 / ZOOM_STEP, s)), [apply]);
  const reset = useCallback(() => apply((_v, s) => clampView(INITIAL_VIEW, s)), [apply]);

  /** Pans so an element (e.g. a searched or keyboard-focused seat) is visible inside the frame. */
  const reveal = useCallback(
    (el: Element | null) => {
      const frame = frameRef.current;
      if (!frame || !el) return;
      const fr = frame.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const inside =
        er.left >= fr.left && er.right <= fr.right && er.top >= fr.top && er.bottom <= fr.bottom;
      if (inside) return;
      const current = viewRef.current;
      const point = {
        x: (er.left + er.width / 2 - fr.left - current.x) / current.zoom,
        y: (er.top + er.height / 2 - fr.top - current.y) / current.zoom,
      };
      commit(centerOnContentPoint(current, point, sizesRef.current));
    },
    [commit],
  );

  return {view, viewRef, sizesRef, frameRef, apply, setSizes, zoomIn, zoomOut, reset, reveal};
}

export type PanZoomController = ReturnType<typeof usePanZoom>;

interface PointerInfo {x: number; y: number}

function pointerList(map: Map<number, PointerInfo>): PointerInfo[] {
  const list: PointerInfo[] = [];
  map.forEach((value) => list.push(value));
  return list;
}

interface MapPanZoomProps {
  controller: PanZoomController;
  label: string;
  children: ReactNode;
}

export function MapPanZoom({controller, label, children}: MapPanZoomProps) {
  const {view, viewRef, sizesRef, frameRef, apply, setSizes, reveal} = controller;
  const contentRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, PointerInfo>());
  const dragRef = useRef<{startX: number; startY: number; lastX: number; lastY: number; active: boolean} | null>(null);
  const pinchRef = useRef<{
    startView: MapView;
    distance: number;
    mid: {x: number; y: number};
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  // Measure the frame and the (untransformed) content.
  useEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return undefined;
    const measure = () =>
      setSizes({
        vw: frame.clientWidth,
        vh: frame.clientHeight,
        cw: content.offsetWidth,
        ch: content.offsetHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [frameRef, setSizes]);

  // Ctrl/Cmd + wheel zooms around the pointer. A plain wheel keeps scrolling the page.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const point = {x: event.clientX - rect.left, y: event.clientY - rect.top};
      apply((v, s) => zoomAtPoint(v, v.zoom * wheelZoomFactor(event.deltaY), point, s));
    };
    frame.addEventListener('wheel', onWheel, {passive: false});
    return () => frame.removeEventListener('wheel', onWheel);
  }, [apply, frameRef]);

  const localPoint = (event: {clientX: number; clientY: number}) => {
    const rect = frameRef.current?.getBoundingClientRect();
    return {x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0)};
  };

  const startPinchIfTwo = () => {
    if (pointers.current.size !== 2) return;
    const [a, b] = pointerList(pointers.current);
    pinchRef.current = {
      startView: viewRef.current,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
    };
    dragRef.current = null;
    suppressClickRef.current = true;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) {
      dragRef.current = {startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, active: false};
      suppressClickRef.current = false;
    } else {
      startPinchIfTwo();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);

    if (pinchRef.current && pointers.current.size >= 2) {
      const [a, b] = pointerList(pointers.current);
      const start = pinchRef.current;
      apply((_v, s) =>
        pinchView(
          start.startView,
          {distance: start.distance, mid: start.mid},
          {distance: Math.hypot(a.x - b.x, a.y - b.y), mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}},
          s,
        ),
      );
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.active) {
      // Taps and tiny movements stay clicks: seats must not be mis-selected by a drag.
      if (!exceedsDragThreshold(point.x - drag.startX, point.y - drag.startY)) return;
      drag.active = true;
      suppressClickRef.current = true;
      setDragging(true);
      try {
        frameRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    const dx = point.x - drag.lastX;
    const dy = point.y - drag.lastY;
    drag.lastX = point.x;
    drag.lastY = point.y;
    apply((v, s) => panBy(v, dx, dy, s));
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) {
      dragRef.current = null;
      setDragging(false);
      // Swallow the click that follows a drag/pinch, then allow normal clicks again.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const isPannable = () => {
    const s = sizesRef.current;
    const v = viewRef.current;
    return s.cw * v.zoom > s.vw + 1 || s.ch * v.zoom > s.vh + 1;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const action = keyToAction(event.key);
    if (!action) return;
    if (action.type === 'pan') {
      if (!isPannable()) return; // let the page scroll normally
      event.preventDefault();
      apply((v, s) => panBy(v, action.dx, action.dy, s));
    } else if (action.type === 'zoom') {
      event.preventDefault();
      apply((v, s) => zoomByFactor(v, action.factor, s));
    } else {
      event.preventDefault();
      controller.reset();
    }
  };

  // Keyboard focus moving to an off-screen seat/zone must bring it into view.
  const onFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (event.target === frameRef.current) return;
    reveal(event.target);
  };

  const zoomed = view.zoom > 1.001;

  return (
    <div
      ref={frameRef}
      className="et-pz"
      role="group"
      aria-label={label}
      aria-roledescription="khung sơ đồ có thể thu phóng"
      tabIndex={0}
      data-zoomed={zoomed ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClickCapture={onClickCapture}
      onKeyDown={onKeyDown}
      onFocusCapture={onFocusCapture}
    >
      <div
        ref={contentRef}
        className="et-pz__content"
        style={{transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}
      >
        {children}
      </div>
    </div>
  );
}
