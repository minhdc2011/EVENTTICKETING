import {useEffect, useMemo, useRef, useState} from 'react';
import type {ZoneRecord} from '../../types/ticketing';

export interface OfficialSeatingMapProps {
  src: string;
  eventName: string;
  zones: ZoneRecord[];
  onSelectZone: (zone: ZoneRecord) => void;
  /** Mã phân khu đang mở: khu này sáng lên bằng màu của nó, các khu xung quanh bị làm mờ. */
  activeZoneCode?: string | null;
  /** Bản thu nhỏ đặt phía trên lưới ghế để vẫn thấy vị trí khu trên toàn sơ đồ. */
  compact?: boolean;
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

export function OfficialSeatingMap({src, eventName, zones, onSelectZone, activeZoneCode = null, compact = false}: OfficialSeatingMapProps) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const interactiveRootRef = useRef<HTMLDivElement>(null);
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

  return (
    <figure
      className={`et-official-map${compact ? ' et-official-map--compact' : ''}`}
      data-focus-zone={activeZoneCode || undefined}
    >
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
        {svgMarkup && compact
          ? 'Khu đang chọn được tô sáng, các khu xung quanh được làm mờ. Bấm khu khác để chuyển nhanh.'
          : svgMarkup
          ? 'Bấm trực tiếp vào một phân khu để mở ghế hoặc chọn số lượng vé của khu đó.'
          : loadFailed
          ? 'Chưa thể bật vùng chọn trực tiếp. Chuyển về sơ đồ trực quan để chọn ghế.'
          : 'Đang chuẩn bị các vùng chọn trên sơ đồ…'}
      </figcaption>
    </figure>
  );
}
