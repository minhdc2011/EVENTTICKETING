import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {SeatRecord, ZoneRecord} from '../../types/ticketing';
import type {ZoneRowGroup} from '../../domain/seatMap.js';
import {layoutZoneSeats, parsePolygonPath, rectToPolygon, type BBox, type Point} from '../../domain/zoneSeatLayout';
import {ZoneSeatsLayer, type ZoneSeatsLayerProps} from './ZoneSeatsLayer';

export interface OfficialSeatingMapProps {
  src: string;
  eventName: string;
  zones: ZoneRecord[];
  onSelectZone: (zone: ZoneRecord) => void;
  /** Mã phân khu đang mở: khu này sáng lên bằng màu của nó, các khu xung quanh bị làm mờ. */
  activeZoneCode?: string | null;
  /** Camera: phóng vào khu đang mở (animation viewBox), giống sơ đồ Super Concert. Bỏ chọn khu thì thu nhỏ lại toàn cảnh. */
  zoomToActive?: boolean;
  /** Nút "Thu nhỏ toàn cảnh" hiện trên sơ đồ khi đã phóng vào một khu. */
  onResetView?: () => void;
  /** Ghế của khu đang mở: được vẽ ngay trong khu sau khi camera phóng xong, bấm để chọn. */
  seatLayer?: Omit<ZoneSeatsLayerProps, 'placed'> & {rows: ZoneRowGroup[]};
}

/** Hộp bao và đa giác (nếu đọc được) của một khu, theo toạ độ viewBox hiện tại. */
function readZoneShape(svg: SVGSVGElement, el: SVGElement): {bbox: BBox; polygon: Point[] | null} | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const p1 = new DOMPoint(rect.left, rect.top).matrixTransform(inv);
  const p2 = new DOMPoint(rect.right, rect.bottom).matrixTransform(inv);
  const bbox = {x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y)};
  let polygon: Point[] | null = null;
  const transformed = Boolean(el.closest('[transform]'));
  if (!transformed) {
    if (el.tagName.toLowerCase() === 'path') polygon = parsePolygonPath(el.getAttribute('d'));
    else if (el.tagName.toLowerCase() === 'rect') {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((k) => Number(el.getAttribute(k)));
      if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) polygon = rectToPolygon({x, y, width, height});
    }
  }
  return {bbox, polygon};
}

const ZOOM_MS = 380;
const MIN_VIEW_FRACTION = 0.34;
const ZOOM_PADDING = 1.55;
const MIN_VIEW_FRACTION_TIGHT = 0.2;
const ZOOM_PADDING_TIGHT = 1.12;

type ViewBox = {x: number; y: number; w: number; h: number};

function parseViewBox(svg: SVGSVGElement): ViewBox | null {
  const raw = svg.getAttribute('viewBox');
  if (!raw) return null;
  const [x, y, w, h] = raw.split(/[\s,]+/).map(Number);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? {x, y, w, h} : null;
}

/** Khung nhìn (cùng tỷ lệ với toàn cảnh) bao quanh một phân khu, quy về toạ độ viewBox hiện tại. */
function viewBoxAround(svg: SVGSVGElement, el: SVGElement, full: ViewBox, tight = false): ViewBox | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const p1 = new DOMPoint(rect.left, rect.top).matrixTransform(inv);
  const p2 = new DOMPoint(rect.right, rect.bottom).matrixTransform(inv);
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const padding = tight ? ZOOM_PADDING_TIGHT : ZOOM_PADDING;
  const bw = Math.abs(p2.x - p1.x) * padding;
  const bh = Math.abs(p2.y - p1.y) * padding;
  const aspect = full.w / full.h;
  let w = Math.max(bw, bh * aspect, full.w * (tight ? MIN_VIEW_FRACTION_TIGHT : MIN_VIEW_FRACTION));
  w = Math.min(w, full.w);
  const h = w / aspect;
  const x = Math.min(Math.max(cx - w / 2, full.x), full.x + full.w - w);
  const y = Math.min(Math.max(cy - h / 2, full.y), full.y + full.h - h);
  return {x, y, w, h};
}

const INTERACTIVE_MAP_FILES = new Set([
  'ticketmaster-theater-proscenium.svg',
  'ticketmaster-arena-endstage.svg',
]);

function getInteractiveMapUrl(src: string): URL | null {
  try {
    const url = new URL(src, window.location.href);
    const filename = url.pathname.split('/').pop() || '';
    return url.origin === window.location.origin && INTERACTIVE_MAP_FILES.has(filename)
      ? url
      : null;
  } catch {
    return null;
  }
}

export function OfficialSeatingMap({src, eventName, zones, onSelectZone, activeZoneCode = null, zoomToActive = false, onResetView, seatLayer}: OfficialSeatingMapProps) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const interactiveRootRef = useRef<HTMLDivElement>(null);
  const fullViewRef = useRef<ViewBox | null>(null);
  const currentViewRef = useRef<ViewBox | null>(null);
  const rafRef = useRef<number | null>(null);
  const [seatLayerNode, setSeatLayerNode] = useState<SVGGElement | null>(null);
  const [zoomSettled, setZoomSettled] = useState(false);
  const [zoneShape, setZoneShape] = useState<{bbox: BBox; polygon: Point[] | null} | null>(null);
  const wantsSeats = Boolean(seatLayer);
  const interactiveUrl = useMemo(() => getInteractiveMapUrl(src), [src]);

  useEffect(() => {
    const controller = new AbortController();
    setSvgMarkup(null);
    setLoadFailed(false);

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

  useEffect(() => {
    const root = interactiveRootRef.current;
    if (!root || !svgMarkup) return undefined;

    const hitAreas = Array.from(root.querySelectorAll('[data-zone-code]')) as SVGElement[];
    const selectHitArea = (hitArea: SVGElement) => {
      const zoneCode = hitArea.dataset.zoneCode;
      if (!zoneCode) return;
      const zone = zones.find((item) => item.MaKhuVuc === zoneCode);
      if (zone) onSelectZone(zone);
    };

    const handleClick = (event: Event) => selectHitArea(event.currentTarget as SVGElement);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectHitArea(event.currentTarget as SVGElement);
    };

    hitAreas.forEach((hitArea) => {
      hitArea.addEventListener('click', handleClick);
      hitArea.addEventListener('keydown', handleKeyDown);
    });
    return () => {
      hitAreas.forEach((hitArea) => {
        hitArea.removeEventListener('click', handleClick);
        hitArea.removeEventListener('keydown', handleKeyDown);
      });
    };
  }, [onSelectZone, svgMarkup, zones]);

  // Làm mờ khu xung quanh và tô sáng khu đang chọn (cùng ý nghĩa với sơ đồ Super Concert).
  useEffect(() => {
    const root = interactiveRootRef.current;
    if (!root || !svgMarkup) return;
    const hitAreas = Array.from(root.querySelectorAll('[data-zone-code]')) as SVGElement[];
    hitAreas.forEach((hitArea) => {
      const code = hitArea.dataset.zoneCode;
      const isActive = Boolean(activeZoneCode) && code === activeZoneCode;
      hitArea.classList.toggle('is-focused', isActive);
      hitArea.classList.toggle('is-dimmed', Boolean(activeZoneCode) && !isActive);
      if (activeZoneCode) hitArea.setAttribute('aria-current', isActive ? 'true' : 'false');
      else hitArea.removeAttribute('aria-current');
      if (isActive) {
        const zone = zones.find((item) => item.MaKhuVuc === code);
        hitArea.style.setProperty('--zone-color', zone?.MauSacHex || '#eab308');
      } else {
        hitArea.style.removeProperty('--zone-color');
      }
    });
  }, [activeZoneCode, svgMarkup, zones]);

  // Camera zoom: phóng vào khu đang mở bằng cách đổi viewBox có animation; không có khu thì về toàn cảnh.
  useEffect(() => {
    const root = interactiveRootRef.current;
    const svg = root?.querySelector('svg') as SVGSVGElement | null | undefined;
    if (!root || !svg || !svgMarkup || !zoomToActive) return undefined;
    if (!fullViewRef.current) fullViewRef.current = parseViewBox(svg);
    const full = fullViewRef.current;
    if (!full) return undefined;
    if (!currentViewRef.current) currentViewRef.current = full;

    let target: ViewBox = full;
    if (activeZoneCode) {
      const el = root.querySelector(`[data-zone-code="${CSS.escape(activeZoneCode)}"]`) as SVGElement | null;
      const around = el ? viewBoxAround(svg, el, full, wantsSeats) : null;
      if (around) target = around;
    }

    const from = currentViewRef.current;
    const apply = (vb: ViewBox) => {
      currentViewRef.current = vb;
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setZoomSettled(false);
    if (reduce) {
      apply(target);
      setZoomSettled(true);
      return undefined;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / ZOOM_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      apply({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        w: from.w + (target.w - from.w) * eased,
        h: from.h + (target.h - from.h) * eased,
      });
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      if (t >= 1) setZoomSettled(true);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [activeZoneCode, svgMarkup, zoomToActive, wantsSeats]);

  // Lớp ghế: một <g> đặt trong chính SVG để ghế dùng chung hệ toạ độ với khu.
  useEffect(() => {
    const svg = interactiveRootRef.current?.querySelector('svg') as SVGSVGElement | null | undefined;
    if (!svg || !svgMarkup || !zoomToActive || !wantsSeats) {
      setSeatLayerNode(null);
      return undefined;
    }
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    node.setAttribute('class', 'et-map-seat-layer');
    svg.appendChild(node);
    setSeatLayerNode(node);
    return () => {
      node.remove();
      setSeatLayerNode(null);
    };
  }, [svgMarkup, zoomToActive, wantsSeats]);

  // Đọc hình dạng khu sau khi camera dừng, rồi bố trí ghế trong khu.
  useEffect(() => {
    setZoneShape(null);
    if (!zoomSettled || !activeZoneCode || !wantsSeats) return;
    const root = interactiveRootRef.current;
    const svg = root?.querySelector('svg') as SVGSVGElement | null | undefined;
    const el = root?.querySelector(`[data-zone-code="${CSS.escape(activeZoneCode)}"]`) as SVGElement | null | undefined;
    if (svg && el) setZoneShape(readZoneShape(svg, el));
  }, [zoomSettled, activeZoneCode, wantsSeats, svgMarkup]);

  const placedSeats = useMemo(
    () =>
      seatLayer && zoneShape
        ? layoutZoneSeats<SeatRecord>({rows: seatLayer.rows, bbox: zoneShape.bbox, polygon: zoneShape.polygon})
        : [],
    [seatLayer?.rows, zoneShape],
  );
  const placedSeatCount = placedSeats.length;

  // Nhãn chữ của bản vẽ nằm trong khu đang mở sẽ che ghế: làm mờ chúng khi ghế đã hiện (tên khu vẫn ở tiêu đề phía trên).
  useEffect(() => {
    const root = interactiveRootRef.current;
    const svg = root?.querySelector('svg') as SVGSVGElement | null | undefined;
    if (!svg) return undefined;
    const covered: SVGElement[] = [];
    if (zoneShape && placedSeatCount > 0 && activeZoneCode) {
      const el = svg.querySelector(`[data-zone-code="${CSS.escape(activeZoneCode)}"]`) as SVGElement | null;
      const zr = el?.getBoundingClientRect();
      if (zr) {
        svg.querySelectorAll<SVGElement>('text').forEach((text) => {
          if (text.closest('.et-map-seat-layer')) return;
          const r = text.getBoundingClientRect();
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          if (cx >= zr.left && cx <= zr.right && cy >= zr.top && cy <= zr.bottom) {
            text.classList.add('is-covered-by-seats');
            covered.push(text);
          }
        });
      }
    }
    return () => covered.forEach((text) => text.classList.remove('is-covered-by-seats'));
  }, [zoneShape, placedSeatCount, activeZoneCode, svgMarkup]);


  return (
    <figure
      className={`et-official-map${zoomToActive ? ' et-official-map--zoom' : ''}`}
      data-focus-zone={activeZoneCode || undefined}
      data-zoomed={zoomToActive && activeZoneCode ? 'true' : undefined}
    >
      {zoomToActive && activeZoneCode && onResetView ? (
        <button type="button" className="et-official-map__reset" onClick={onResetView}>
          <span aria-hidden="true">⤺</span> Thu nhỏ toàn cảnh
        </button>
      ) : null}
      {svgMarkup ? (
        <div
          ref={interactiveRootRef}
          className="et-official-map-interactive"
          role="group"
          aria-label={`Sơ đồ phân khu tương tác của ${eventName}`}
          dangerouslySetInnerHTML={{__html: svgMarkup}}
        />
      ) : (
        <img src={src} alt={`Sơ đồ mặt bằng tổ chức của ${eventName}`} loading="eager" />
      )}
      {seatLayerNode && placedSeats.length > 0 && seatLayer
        ? createPortal(
            <ZoneSeatsLayer
              placed={placedSeats}
              selectedSeats={seatLayer.selectedSeats}
              searchQuery={seatLayer.searchQuery}
              focusSeatCode={seatLayer.focusSeatCode}
              saleOpen={seatLayer.saleOpen}
              isPending={seatLayer.isPending}
              hasActiveHold={seatLayer.hasActiveHold}
              onInspectSeat={seatLayer.onInspectSeat}
              onToggleSeat={seatLayer.onToggleSeat}
            />,
            seatLayerNode,
          )
        : null}
      <figcaption>
        {svgMarkup && zoomToActive
          ? 'Bấm trực tiếp vào ghế trong khu để chọn. Các khu xung quanh được làm mờ; bấm khu bên cạnh để chuyển, hoặc "Thu nhỏ toàn cảnh".'
          : svgMarkup
          ? 'Bấm trực tiếp vào một phân khu để mở ghế hoặc chọn số lượng vé của khu đó.'
          : loadFailed
          ? 'Chưa thể bật vùng chọn trực tiếp. Chuyển về sơ đồ trực quan để chọn ghế.'
          : 'Đang chuẩn bị các vùng chọn trên sơ đồ…'}
      </figcaption>
    </figure>
  );
}
