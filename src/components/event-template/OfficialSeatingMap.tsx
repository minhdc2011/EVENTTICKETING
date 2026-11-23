import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {createPortal} from 'react-dom';
import type {SeatRecord, ZoneRecord} from '../../types/ticketing';
import {formatMoneyVND, mapSeatStatus, STATUS_NAMES, type ZoneRowGroup} from '../../domain/seatMap.js';
import {
  layoutZoneSeats,
  parsePolygonPath,
  rectToPolygon,
  type BBox,
  type PlacedSeat,
  type Point,
} from '../../domain/zoneSeatLayout';

/*
 * Sơ đồ chỗ ngồi kiểu Ticketmaster cho sơ đồ do BTC cung cấp (SVG có data-zone-code):
 * - Ghế là các chấm vẽ ngay trên bản đồ, xếp theo hình thật của từng khu.
 * - Camera kéo thả, Ctrl + cuộn / chụm hai ngón / nút ＋ − để thu phóng, nút làm mới, bản đồ nhỏ góc dưới.
 * - Bấm một khu thì camera phóng vào khu đó; bấm một chấm thì khung thông tin bên cạnh hiện khu, hàng, ghế và giá.
 */

export interface OfficialSeatingMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

export interface OfficialSeatingMapProps {
  src: string;
  eventName: string;
  zones: ZoneRecord[];
  /** Ghế của từng khu có ghế ngồi (theo hàng). */
  groups: Array<{zone: ZoneRecord; rows: ZoneRowGroup[]}>;
  selectedSeats: SeatRecord[];
  inspectedSeat: SeatRecord | null;
  searchQuery: string;
  focusSeatCode: string | null;
  /** Mã phân khu đang mở: camera phóng vào khu này, các khu khác mờ đi. */
  activeZoneCode: string | null;
  /** Đã chọn đủ số vé tối đa: chấm còn trống chưa chọn được đánh dấu không chọn thêm được. */
  limitReached: boolean;
  onSelectZone: (zone: ZoneRecord) => void;
  onInspectSeat: (seat: SeatRecord) => void;
  /** Báo mức thu phóng hiện tại (1 = toàn cảnh) để hiện số % và bật/tắt chấm ghế. */
  onZoomChange?: (zoom: number) => void;
}

const INTERACTIVE_MAP_FILES = new Set([
  'ticketmaster-theater-proscenium.svg',
  'ticketmaster-arena-endstage.svg',
]);

const ZOOM_MS = 380;
const MAX_ZOOM = 16;
const ZONE_PADDING = 1.4;
const ZONE_MIN_FRACTION = 0.1;
/** Từ mức thu phóng này trở lên (hoặc khi có khu đang mở) mới hiện chấm ghế. */
const DOTS_ZOOM = 1.7;
const DRAG_THRESHOLD_PX = 5;

type ViewBox = {x: number; y: number; w: number; h: number};
type Shape = {bbox: BBox; polygon: Point[] | null};

function getInteractiveMapUrl(src: string): URL | null {
  try {
    const url = new URL(src, window.location.href);
    const filename = url.pathname.split('/').pop() || '';
    return url.origin === window.location.origin && INTERACTIVE_MAP_FILES.has(filename) ? url : null;
  } catch {
    return null;
  }
}

function parseViewBox(svg: SVGSVGElement): ViewBox | null {
  const raw = svg.getAttribute('viewBox');
  if (!raw) return null;
  const [x, y, w, h] = raw.split(/[\s,]+/).map(Number);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? {x, y, w, h} : null;
}

/** Hộp bao và đa giác (nếu đọc được) của một khu, theo toạ độ viewBox. */
function readZoneShape(svg: SVGSVGElement, el: SVGElement): Shape | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const p1 = new DOMPoint(rect.left, rect.top).matrixTransform(inv);
  const p2 = new DOMPoint(rect.right, rect.bottom).matrixTransform(inv);
  const bbox = {x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y)};
  let polygon: Point[] | null = null;
  if (!el.closest('[transform]')) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'path') polygon = parsePolygonPath(el.getAttribute('d'));
    else if (tag === 'rect') {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((k) => Number(el.getAttribute(k)));
      if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
        polygon = rectToPolygon({x, y, width, height});
      }
    }
  }
  return {bbox, polygon};
}

/** Khung nhìn (cùng tỷ lệ toàn cảnh) bao quanh một hộp, chừa viền cho các khu xung quanh. */
function viewBoxForBox(full: ViewBox, box: BBox): ViewBox {
  const aspect = full.w / full.h;
  let w = Math.max(box.w * ZONE_PADDING, box.h * ZONE_PADDING * aspect, full.w * ZONE_MIN_FRACTION);
  w = Math.min(w, full.w);
  const h = w / aspect;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    x: Math.min(Math.max(cx - w / 2, full.x), full.x + full.w - w),
    y: Math.min(Math.max(cy - h / 2, full.y), full.y + full.h - h),
    w,
    h,
  };
}

function clampView(vb: ViewBox, full: ViewBox): ViewBox {
  const w = Math.min(Math.max(vb.w, full.w / MAX_ZOOM), full.w);
  const h = w * (full.h / full.w);
  const mx = full.w * 0.12;
  const my = full.h * 0.12;
  const x = w >= full.w ? full.x : Math.min(Math.max(vb.x, full.x - mx), full.x + full.w + mx - w);
  const y = h >= full.h ? full.y : Math.min(Math.max(vb.y, full.y - my), full.y + full.h + my - h);
  return {x, y, w, h};
}

type PlacedWithZone = PlacedSeat<SeatRecord> & {zoneCode: string};

interface SeatDotsProps {
  placed: PlacedWithZone[];
  activeZoneCode: string | null;
  selectedCodes: ReadonlySet<string>;
  inspectedCode: string | null;
  focusSeatCode: string | null;
  searchQuery: string;
  limitReached: boolean;
  onInspectSeat: (seat: SeatRecord) => void;
}

/** Các chấm ghế (SVG, cùng hệ toạ độ với bản đồ). Chỉ chấm của khu đang mở bấm được. */
const SeatDots = memo(function SeatDots({
  placed,
  activeZoneCode,
  selectedCodes,
  inspectedCode,
  focusSeatCode,
  searchQuery,
  limitReached,
  onInspectSeat,
}: SeatDotsProps) {
  const q = searchQuery.trim().toLowerCase();
  return (
    <g className="et-tm-dots" role="group" aria-label="Ghế trên sơ đồ">
      {placed.map(({seat, x, y, r, zoneCode}) => {
        const selected = selectedCodes.has(seat.MaGheDayDu);
        const status = mapSeatStatus(seat.TrangThai, selected);
        const active = activeZoneCode === zoneCode;
        const blockedByLimit = limitReached && status === 'available';
        const match = !q || seat.MaGheDayDu.toLowerCase().includes(q) || seat.SoHang.toLowerCase().includes(q);
        const label = `${seat.MaGheDayDu}, ${STATUS_NAMES[status as keyof typeof STATUS_NAMES] ?? ''}, ${formatMoneyVND(seat.GiaVeNiemYet)}${blockedByLimit ? ', đã chọn đủ số vé tối đa' : ''}`;
        const inspect = () => onInspectSeat(seat);
        return (
          <circle
            key={seat.GheID}
            className="et-tm-dot"
            cx={x}
            cy={y}
            r={r}
            data-status={status}
            data-zone={zoneCode}
            data-code={seat.MaGheDayDu}
            data-active={active ? 'true' : 'false'}
            data-inspected={inspectedCode === seat.MaGheDayDu ? 'true' : undefined}
            data-limit={blockedByLimit ? 'true' : undefined}
            data-search-hit={focusSeatCode === seat.MaGheDayDu ? 'true' : undefined}
            role="button"
            tabIndex={active ? 0 : -1}
            aria-label={label}
            aria-pressed={selected}
            style={match ? undefined : {opacity: 0.12}}
            onClick={inspect}
            onKeyDown={(event: ReactKeyboardEvent<SVGCircleElement>) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              inspect();
            }}
          />
        );
      })}
    </g>
  );
});

export const OfficialSeatingMap = forwardRef<OfficialSeatingMapHandle, OfficialSeatingMapProps>(function OfficialSeatingMap(
  {
    src,
    eventName,
    zones,
    groups,
    selectedSeats,
    inspectedSeat,
    searchQuery,
    focusSeatCode,
    activeZoneCode,
    limitReached,
    onSelectZone,
    onInspectSeat,
    onZoomChange,
  },
  ref,
) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const miniRectRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<ViewBox | null>(null);
  const viewRef = useRef<ViewBox | null>(null);
  const rafRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [layerNode, setLayerNode] = useState<SVGGElement | null>(null);
  const [shapes, setShapes] = useState<Map<string, Shape>>(new Map());
  const [dotsOn, setDotsOn] = useState(false);
  const interactiveUrl = useMemo(() => getInteractiveMapUrl(src), [src]);

  const onSelectZoneRef = useRef(onSelectZone);
  onSelectZoneRef.current = onSelectZone;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const activeRef = useRef(activeZoneCode);
  activeRef.current = activeZoneCode;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;

  // ---- Tải SVG ----
  useEffect(() => {
    const controller = new AbortController();
    setSvgMarkup(null);
    setLoadFailed(false);
    fullRef.current = null;
    viewRef.current = null;
    if (!interactiveUrl) return () => controller.abort();
    void fetch(interactiveUrl, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((markup) => {
        if (!/^\s*<svg[\s>]/i.test(markup)) throw new Error('Tệp không phải SVG');
        setSvgMarkup(markup);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Không thể bật tương tác cho sơ đồ BTC:', error);
        setLoadFailed(true);
      });
    return () => controller.abort();
  }, [interactiveUrl]);

  const getSvg = useCallback(() => rootRef.current?.querySelector('svg') as SVGSVGElement | null | undefined, []);

  // ---- Camera ----
  const applyView = useCallback(
    (vb: ViewBox) => {
      const svg = getSvg();
      const full = fullRef.current;
      if (!svg || !full) return;
      viewRef.current = vb;
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      const rect = miniRectRef.current;
      if (rect) {
        rect.style.left = `${((vb.x - full.x) / full.w) * 100}%`;
        rect.style.top = `${((vb.y - full.y) / full.h) * 100}%`;
        rect.style.width = `${(vb.w / full.w) * 100}%`;
        rect.style.height = `${(vb.h / full.h) * 100}%`;
      }
      const zoom = full.w / vb.w;
      setDotsOn(zoom >= DOTS_ZOOM || Boolean(activeRef.current));
      onZoomChangeRef.current?.(zoom);
    },
    [getSvg],
  );

  const animateTo = useCallback(
    (target: ViewBox) => {
      const full = fullRef.current;
      const from = viewRef.current;
      if (!full || !from) return;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        applyView(clampView(target, full));
        return;
      }
      const startedAt = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / ZOOM_MS);
        const e = 1 - Math.pow(1 - t, 3);
        applyView(
          clampView(
            {
              x: from.x + (target.x - from.x) * e,
              y: from.y + (target.y - from.y) * e,
              w: from.w + (target.w - from.w) * e,
              h: from.h + (target.h - from.h) * e,
            },
            full,
          ),
        );
        rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [applyView],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: {x: number; y: number}, animated = true) => {
      const full = fullRef.current;
      const vb = viewRef.current;
      if (!full || !vb) return;
      const w = Math.min(Math.max(vb.w / factor, full.w / MAX_ZOOM), full.w);
      const h = w * (full.h / full.w);
      const ax = anchor ? anchor.x : vb.x + vb.w / 2;
      const ay = anchor ? anchor.y : vb.y + vb.h / 2;
      const target = {x: ax - ((ax - vb.x) / vb.w) * w, y: ay - ((ay - vb.y) / vb.h) * h, w, h};
      if (animated) animateTo(target);
      else applyView(clampView(target, full));
    },
    [animateTo, applyView],
  );

  const resetView = useCallback(() => {
    const full = fullRef.current;
    if (full) animateTo(full);
  }, [animateTo]);

  useImperativeHandle(ref, () => ({zoomIn: () => zoomBy(1.6), zoomOut: () => zoomBy(1 / 1.6), reset: resetView}), [zoomBy, resetView]);

  // Khi SVG vào DOM: ghi nhớ toàn cảnh, gắn lớp ghế, đo hình các khu.
  useEffect(() => {
    const svg = getSvg();
    if (!svg || !svgMarkup) {
      setLayerNode(null);
      return undefined;
    }
    const full = parseViewBox(svg);
    if (!full) return undefined;
    fullRef.current = full;
    viewRef.current = full;
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', 'et-tm-seat-layer');
    svg.appendChild(layer);
    setLayerNode(layer);
    const measure = window.requestAnimationFrame(() => {
      const next = new Map<string, Shape>();
      svg.querySelectorAll<SVGElement>('[data-zone-code]').forEach((el) => {
        const code = el.dataset.zoneCode;
        const shape = code ? readZoneShape(svg, el) : null;
        if (code && shape) next.set(code, shape);
      });
      setShapes(next);
    });
    return () => {
      window.cancelAnimationFrame(measure);
      layer.remove();
      setLayerNode(null);
    };
  }, [svgMarkup, getSvg]);

  // Bấm khu / bàn phím trên khu.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !svgMarkup) return undefined;
    const hitAreas = Array.from(root.querySelectorAll('[data-zone-code]')) as SVGElement[];
    const pick = (el: SVGElement) => {
      const zone = zones.find((item) => item.MaKhuVuc === el.dataset.zoneCode);
      if (zone) onSelectZoneRef.current(zone);
    };
    const onClick = (event: Event) => pick(event.currentTarget as SVGElement);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      pick(event.currentTarget as SVGElement);
    };
    hitAreas.forEach((el) => {
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKey);
    });
    return () => {
      hitAreas.forEach((el) => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKey);
      });
    };
  }, [svgMarkup, zones]);

  // Khu đang mở: tô viền màu khu, các khu khác mờ; camera phóng vào khu (hoặc về toàn cảnh).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !svgMarkup) return;
    root.querySelectorAll<SVGElement>('[data-zone-code]').forEach((el) => {
      const code = el.dataset.zoneCode;
      const isActive = Boolean(activeZoneCode) && code === activeZoneCode;
      el.classList.toggle('is-focused', isActive);
      el.classList.toggle('is-dimmed', Boolean(activeZoneCode) && !isActive);
      if (isActive) {
        const zone = zones.find((item) => item.MaKhuVuc === code);
        el.style.setProperty('--zone-color', zone?.MauSacHex || '#8b5cf6');
      } else {
        el.style.removeProperty('--zone-color');
      }
    });
    const full = fullRef.current;
    if (!full) return;
    setDotsOn(Boolean(activeZoneCode) || full.w / (viewRef.current?.w ?? full.w) >= DOTS_ZOOM);
    if (!activeZoneCode) {
      animateTo(full);
      return;
    }
    const svg = getSvg();
    const el = root.querySelector(`[data-zone-code="${CSS.escape(activeZoneCode)}"]`) as SVGElement | null;
    const shape = shapesRef.current.get(activeZoneCode) ?? (svg && el ? readZoneShape(svg, el) : null);
    if (shape) animateTo(viewBoxForBox(full, shape.bbox));
  }, [activeZoneCode, svgMarkup, zones, shapes, animateTo, getSvg]);

  // Kéo thả, chụm ngón, Ctrl + cuộn, nhấp đúp, bàn phím.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !svgMarkup) return undefined;
    const pointers = new Map<number, {x: number; y: number}>();
    let dragStart: {x: number; y: number; view: ViewBox} | null = null;
    let pinchStart: {dist: number; view: ViewBox} | null = null;
    let moved = false;

    const unitsPerPx = () => {
      const ctm = getSvg()?.getScreenCTM();
      return ctm && ctm.a ? 1 / ctm.a : 1;
    };
    const toUser = (clientX: number, clientY: number) => {
      const ctm = getSvg()?.getScreenCTM();
      if (!ctm) return null;
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return {x: p.x, y: p.y};
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as Element).closest?.('.et-tm-controls, .et-tm-mini')) return;
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pointers.size === 1 && viewRef.current) {
        dragStart = {x: e.clientX, y: e.clientY, view: viewRef.current};
        moved = false;
      } else if (pointers.size === 2 && viewRef.current) {
        const [a, b] = [...pointers.values()];
        pinchStart = {dist: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current};
        dragStart = null;
        moved = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      const full = fullRef.current;
      if (!full) return;
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        const factor = dist / pinchStart.dist;
        const base = pinchStart.view;
        const w = Math.min(Math.max(base.w / factor, full.w / MAX_ZOOM), full.w);
        const h = w * (full.h / full.w);
        const center = toUser((a.x + b.x) / 2, (a.y + b.y) / 2) ?? {x: base.x + base.w / 2, y: base.y + base.h / 2};
        applyView(
          clampView(
            {x: center.x - ((center.x - base.x) / base.w) * w, y: center.y - ((center.y - base.y) / base.h) * h, w, h},
            full,
          ),
        );
        return;
      }
      if (dragStart && pointers.size === 1) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        if (!moved) {
          moved = true;
          stage.setPointerCapture?.(e.pointerId);
          stage.classList.add('is-dragging');
          if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        }
        const k = unitsPerPx();
        applyView(clampView({...dragStart.view, x: dragStart.view.x - dx * k, y: dragStart.view.y - dy * k}, full));
      }
    };
    const onUp = (e: PointerEvent) => {
      // Chỉ xử lý con trỏ đã bắt đầu trên bản đồ (bấm vào nút điều khiển hay bản đồ nhỏ không được tính là kéo).
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) {
        if (moved) {
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 60);
        }
        moved = false;
        dragStart = null;
        stage.classList.remove('is-dragging');
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      zoomBy(Math.exp(-e.deltaY * 0.0018), toUser(e.clientX, e.clientY) ?? undefined, false);
    };
    const onDblClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.et-tm-dot, .et-tm-controls, .et-tm-mini')) return;
      zoomBy(1.8, toUser(e.clientX, e.clientY) ?? undefined);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== stage) return;
      const vb = viewRef.current;
      const full = fullRef.current;
      if (!vb || !full) return;
      const stepX = vb.w * 0.15;
      const stepY = vb.h * 0.15;
      if (e.key === '+' || e.key === '=') zoomBy(1.4);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
      else if (e.key === '0') animateTo(full);
      else if (e.key === 'ArrowLeft') applyView(clampView({...vb, x: vb.x - stepX}, full));
      else if (e.key === 'ArrowRight') applyView(clampView({...vb, x: vb.x + stepX}, full));
      else if (e.key === 'ArrowUp') applyView(clampView({...vb, y: vb.y - stepY}, full));
      else if (e.key === 'ArrowDown') applyView(clampView({...vb, y: vb.y + stepY}, full));
      else return;
      e.preventDefault();
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('click', onClickCapture, true);
    stage.addEventListener('wheel', onWheel, {passive: false});
    stage.addEventListener('dblclick', onDblClick);
    stage.addEventListener('keydown', onKey);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('click', onClickCapture, true);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('dblclick', onDblClick);
      stage.removeEventListener('keydown', onKey);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [svgMarkup, applyView, animateTo, zoomBy, getSvg]);

  // Nhãn chữ của bản vẽ nằm trong khu đang mở sẽ đè lên chấm ghế: làm mờ khi chấm đã hiện (tên khu vẫn ở khung thông tin).
  useEffect(() => {
    const svg = getSvg();
    if (!svg || !svgMarkup || !dotsOn || !activeZoneCode) return undefined;
    const shape = shapes.get(activeZoneCode);
    if (!shape) return undefined;
    const covered: SVGElement[] = [];
    svg.querySelectorAll<SVGTextElement>('text').forEach((text) => {
      if (text.closest('.et-tm-seat-layer') || text.closest('[transform]')) return;
      const b = text.getBBox();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (cx >= shape.bbox.x && cx <= shape.bbox.x + shape.bbox.w && cy >= shape.bbox.y && cy <= shape.bbox.y + shape.bbox.h) {
        text.classList.add('is-covered');
        covered.push(text);
      }
    });
    return () => covered.forEach((text) => text.classList.remove('is-covered'));
  }, [dotsOn, activeZoneCode, shapes, svgMarkup, getSvg]);

  // ---- Chấm ghế ----
  const placed = useMemo<PlacedWithZone[]>(() => {
    const out: PlacedWithZone[] = [];
    for (const {zone, rows} of groups) {
      const shape = shapes.get(zone.MaKhuVuc);
      if (!shape) continue;
      for (const p of layoutZoneSeats<SeatRecord>({rows, bbox: shape.bbox, polygon: shape.polygon})) {
        out.push({...p, zoneCode: zone.MaKhuVuc});
      }
    }
    return out;
  }, [groups, shapes]);
  const selectedCodes = useMemo(() => new Set(selectedSeats.map((s) => s.MaGheDayDu)), [selectedSeats]);

  // Bản đồ nhỏ: bấm để đưa camera tới điểm đó.
  const onMiniClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const full = fullRef.current;
    const vb = viewRef.current;
    if (!full || !vb) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = full.x + ((event.clientX - rect.left) / rect.width) * full.w;
    const cy = full.y + ((event.clientY - rect.top) / rect.height) * full.h;
    animateTo(clampView({...vb, x: cx - vb.w / 2, y: cy - vb.h / 2}, full));
  };

  return (
    <figure className="et-tm-map" data-dots={dotsOn ? 'on' : 'off'} data-focus-zone={activeZoneCode || undefined}>
      {svgMarkup ? (
        <div
          ref={stageRef}
          className="et-tm-stage"
          tabIndex={0}
          role="application"
          aria-label={`Sơ đồ chỗ ngồi của ${eventName}. Kéo để di chuyển, Ctrl và cuộn hoặc nút cộng trừ để thu phóng, phím mũi tên để dịch chuyển.`}
        >
          <div ref={rootRef} className="et-tm-svg" dangerouslySetInnerHTML={{__html: svgMarkup}} />
          {layerNode
            ? createPortal(
                <SeatDots
                  placed={placed}
                  activeZoneCode={activeZoneCode}
                  selectedCodes={selectedCodes}
                  inspectedCode={inspectedSeat?.MaGheDayDu ?? null}
                  focusSeatCode={focusSeatCode}
                  searchQuery={searchQuery}
                  limitReached={limitReached}
                  onInspectSeat={onInspectSeat}
                />,
                layerNode,
              )
            : null}
          <div className="et-tm-controls" role="group" aria-label="Điều khiển bản đồ">
            <button type="button" onClick={resetView} aria-label="Làm mới: về toàn cảnh" title="Về toàn cảnh">
              ↻
            </button>
            <button type="button" onClick={() => zoomBy(1.6)} aria-label="Phóng to" title="Phóng to">
              +
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Thu nhỏ" title="Thu nhỏ">
              −
            </button>
          </div>
          <div className="et-tm-mini" onClick={onMiniClick} aria-hidden="true" title="Bản đồ nhỏ: bấm để di chuyển">
            <div className="et-tm-mini__svg" dangerouslySetInnerHTML={{__html: svgMarkup}} />
            <div ref={miniRectRef} className="et-tm-mini__view" />
          </div>
        </div>
      ) : loadFailed ? (
        <p className="et-tm-fallback">Chưa thể tải sơ đồ tương tác. Dùng ô tìm kiếm hoặc danh sách khu phía trên để chọn ghế.</p>
      ) : (
        <p className="et-tm-fallback" role="status">
          Đang chuẩn bị sơ đồ…
        </p>
      )}
    </figure>
  );
});
