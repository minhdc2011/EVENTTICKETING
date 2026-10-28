import type {KeyboardEvent} from 'react';
import type {ZoneRecord, SeatRecord} from '../../types/ticketing';
import {computeZoneLayouts, formatMoneyVND} from '../../domain/seatMap.js';

export interface StadiumOverviewProps {
  zones: ZoneRecord[];
  seats: SeatRecord[];
  activeFilter: string;
  zoom: number;
  onSelectZone: (zoneId: number) => void;
}

export function StadiumOverview({
  zones,
  seats,
  activeFilter,
  zoom,
  onSelectZone,
}: StadiumOverviewProps) {
  const layouts = computeZoneLayouts(zones, 380, 65);

  const getAvailableCount = (zoneId: number) => {
    return seats.filter((s) => s.KhuVucID === zoneId && s.TrangThai === 'TRONG').length;
  };

  const handleZoneKeyDown = (e: KeyboardEvent<SVGGElement>, zoneId: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectZone(zoneId);
    }
  };

  return (
    <svg
      className="et-stadium-svg"
      viewBox="0 0 760 440"
      role="group"
      aria-label="Sơ đồ tổng quan sân vận động"
      style={{
        transform: `scale(${zoom})`,
        width: `${Math.round(zoom * 100)}%`,
        maxWidth: `${Math.round(760 * zoom)}px`,
      }}
    >
      <defs>
        <pattern id="et-stadium-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.8" fill="var(--seat-border)" opacity="0.4" />
        </pattern>
      </defs>

      {/* Stadium outer boundary */}
      <rect
        x="45"
        y="18"
        width="670"
        height="405"
        rx="145"
        fill="url(#et-stadium-grid)"
        stroke="var(--seat-border)"
        strokeWidth="1.2"
        strokeDasharray="4 5"
      />

      {/* Stage Box at top center */}
      <rect
        x="245"
        y="30"
        width="270"
        height="64"
        rx="10"
        fill="var(--seat-bg)"
        stroke="var(--seat-border)"
        strokeWidth="1.5"
      />
      <rect
        x="255"
        y="38"
        width="250"
        height="48"
        rx="6"
        fill="none"
        stroke="var(--seat-border)"
        strokeDasharray="3 4"
      />
      <text
        x="380"
        y="58"
        fill="var(--seat-fg)"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        letterSpacing="4"
      >
        SÂN KHẤU
      </text>
      <text
        x="380"
        y="75"
        fill="var(--seat-muted)"
        textAnchor="middle"
        fontSize="9"
        letterSpacing="1"
      >
        Hướng nhìn về trung tâm
      </text>

      {/* Dynamic Zone Sectors derived from zone catalog */}
      {layouts.map(({zone, svgPath, center}) => {
        const zoneId = zone.KhuVucID;
        const available = getAvailableCount(zoneId);
        const isDimmed = activeFilter !== 'all' && activeFilter !== String(zoneId);
        const zoneName = zone.TenKhuVuc || zone.MaKhuVuc;
        const priceLabel = formatMoneyVND(zone.GiaVeNiemYet);

        return (
          <g
            key={zoneId}
            className={`et-zone-item ${isDimmed ? 'dimmed' : ''}`}
            role="button"
            tabIndex={isDimmed ? -1 : 0}
            data-zone={String(zoneId)}
            data-od-id={`zone-${zone.MaKhuVuc ? zone.MaKhuVuc.toLowerCase() : zoneId}`}
            aria-label={`Khu ${zoneName}, ${available} ghế trống, ${priceLabel} một vé`}
            onClick={() => onSelectZone(zoneId)}
            onKeyDown={(e) => handleZoneKeyDown(e, zoneId)}
          >
            <path
              className="et-zone-shape"
              d={svgPath}
              style={{
                stroke: zone.MauSacHex || undefined,
              }}
            />
            <text
              x={center[0]}
              y={center[1] - 3}
              textAnchor="middle"
              fill="var(--seat-fg)"
              fontSize="12"
              fontWeight="700"
              pointerEvents="none"
            >
              {zoneName}
            </text>
            <text
              x={center[0]}
              y={center[1] + 14}
              textAnchor="middle"
              fill="var(--seat-muted)"
              fontSize="10"
              pointerEvents="none"
            >
              {priceLabel}
            </text>
          </g>
        );
      })}

      {/* Lower Entrance Indicator */}
      <path
        d="M 230 405 Q 380 435 530 405"
        fill="none"
        stroke="var(--seat-border)"
        strokeWidth="1.2"
      />
      <text
        x="380"
        y="420"
        fill="var(--seat-muted)"
        textAnchor="middle"
        fontSize="9"
        letterSpacing="2"
      >
        LỐI VÀO KHÁN ĐÀI · SƠ ĐỒ MINH HỌA
      </text>
    </svg>
  );
}
