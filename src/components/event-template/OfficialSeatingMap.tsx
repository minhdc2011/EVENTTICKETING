import {useEffect, useMemo, useRef, useState} from 'react';
import type {ZoneRecord} from '../../types/ticketing';

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
}

const ZOOM_MS = 380;
const MIN_VIEW_FRACTION = 0.34;
const ZOOM_PADDING = 1.55;

type ViewBox = {x: number; y: number; w: number; h: number};

function parseViewBox(svg: SVGSVGElement): ViewBox | null {
  const raw = svg.getAttribute('viewBox');
  if (!raw) return null;
  const [x, y, w, h] = raw.split(/[\s,]+/).map(Number);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? {x, y, w, h} : null;
}

/** Khung nhìn (cùng tỷ lệ với toàn cảnh) bao quanh một phân khu, quy về toạ độ viewBox hiện tại. */
function viewBoxAround(svg: SVGSVGElement, el: SVGElement, full: ViewBox): ViewBox | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const p1 = new DOMPoint(rect.left, rect.top).matrixTransform(inv);
  const p2 = new DOMPoint(rect.right, rect.bottom).matrixTransform(inv);
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const bw = Math.abs(p2.x - p1.x) * ZOOM_PADDING;
  const bh = Math.abs(p2.y - p1.y) * ZOOM_PADDING;
  const aspect = full.w / full.h;
  let w = Math.max(bw, bh * aspect, full.w * MIN_VIEW_FRACTION);
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

export function OfficialSeatingMap({src, eventName, zones, onSelectZone, activeZoneCode = null, zoomToActive = false, onResetView}: OfficialSeatingMapProps) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const interactiveRootRef = useRef<HTMLDivElement>(null);
  const fullViewRef = useRef<ViewBox | null>(null);
  const currentViewRef = useRef<ViewBox | null>(null);
  const rafRef = useRef<number | null>(null);
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
      const around = el ? viewBoxAround(svg, el, full) : null;
      if (around) target = around;
    }

    const from = currentViewRef.current;
    const apply = (vb: ViewBox) => {
      currentViewRef.current = vb;
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (reduce) {
      apply(target);
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
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [activeZoneCode, svgMarkup, zoomToActive]);

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
      <figcaption>
        {svgMarkup && zoomToActive
          ? 'Đã phóng vào khu đang chọn; các khu xung quanh được làm mờ. Bấm khu bên cạnh để chuyển, hoặc "Thu nhỏ toàn cảnh".'
          : svgMarkup
          ? 'Bấm trực tiếp vào một phân khu để mở ghế hoặc chọn số lượng vé của khu đó.'
          : loadFailed
          ? 'Chưa thể bật vùng chọn trực tiếp. Chuyển về sơ đồ trực quan để chọn ghế.'
          : 'Đang chuẩn bị các vùng chọn trên sơ đồ…'}
      </figcaption>
    </figure>
  );
}
