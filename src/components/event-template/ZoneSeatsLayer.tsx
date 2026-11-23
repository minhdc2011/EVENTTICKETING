import type {KeyboardEvent} from 'react';
import type {SeatRecord} from '../../types/ticketing';
import {formatMoneyVND, isSeatSelectable, mapSeatStatus, STATUS_GLYPHS, STATUS_NAMES} from '../../domain/seatMap.js';
import type {PlacedSeat} from '../../domain/zoneSeatLayout';

export interface ZoneSeatsLayerProps {
  placed: Array<PlacedSeat<SeatRecord>>;
  selectedSeats: SeatRecord[];
  searchQuery: string;
  focusSeatCode: string | null;
  saleOpen: boolean;
  isPending: boolean;
  hasActiveHold: boolean;
  onInspectSeat: (seat: SeatRecord) => void;
  onToggleSeat: (seat: SeatRecord) => void;
}

/**
 * Ghế vẽ trực tiếp bên trong phân khu của sơ đồ BTC (cùng một hệ toạ độ SVG), giống cách Super Concert
 * hiện ghế ngay trên khu đã phóng to. Trạng thái luôn có ký hiệu và nhãn chữ, không chỉ dựa vào màu.
 */
export function ZoneSeatsLayer({
  placed,
  selectedSeats,
  searchQuery,
  focusSeatCode,
  saleOpen,
  isPending,
  hasActiveHold,
  onInspectSeat,
  onToggleSeat,
}: ZoneSeatsLayerProps) {
  const q = searchQuery.trim().toLowerCase();
  const isSelected = (seat: SeatRecord) =>
    selectedSeats.some((s) => s.MaGheDayDu === seat.MaGheDayDu || s.GheID === seat.GheID);

  return (
    <g className="et-map-seats" role="group" aria-label="Ghế của khu đang chọn">
      {placed.map(({seat, x, y, r}) => {
        const selected = isSelected(seat);
        const status = mapSeatStatus(seat.TrangThai, selected);
        const selectable = isSeatSelectable({status: seat.TrangThai, saleOpen, isPending, hasActiveHold});
        const match = !q || seat.MaGheDayDu.toLowerCase().includes(q) || seat.SoHang.toLowerCase().includes(q);
        const glyph = STATUS_GLYPHS[status as keyof typeof STATUS_GLYPHS] || '';
        const label = `${seat.MaGheDayDu}, ${STATUS_NAMES[status as keyof typeof STATUS_NAMES] || 'Không khả dụng'}, ${formatMoneyVND(seat.GiaVeNiemYet)}`;
        const activate = () => {
          onInspectSeat(seat);
          onToggleSeat(seat);
        };
        return (
          <g
            key={seat.GheID}
            className="et-map-seat"
            transform={`translate(${x} ${y})`}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            aria-disabled={!selectable}
            data-status={status}
            data-code={seat.MaGheDayDu}
            data-search-hit={focusSeatCode != null && seat.MaGheDayDu === focusSeatCode ? 'true' : undefined}
            style={{opacity: match ? 1 : 0.2}}
            onPointerEnter={() => onInspectSeat(seat)}
            onFocus={() => onInspectSeat(seat)}
            onClick={activate}
            onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              activate();
            }}
          >
            {/* Vùng chạm rộng hơn hình ghế để dễ bấm trên màn hình nhỏ */}
            <circle className="et-map-seat__hit" r={Math.max(r * 1.25, 6)} fill="transparent" />
            <circle className="et-map-seat__dot" r={r} />
            {glyph ? (
              <text className="et-map-seat__glyph" fontSize={Math.max(r * 1.05, 5)} textAnchor="middle" dominantBaseline="central">
                {glyph}
              </text>
            ) : r >= 6 ? (
              <text className="et-map-seat__glyph" fontSize={Math.max(r * 0.8, 5)} textAnchor="middle" dominantBaseline="central">
                {seat.SoGhe}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
