import type {SeatRecord} from '../../types/ticketing';
import {
  mapSeatStatus,
  STATUS_NAMES,
  STATUS_GLYPHS,
  formatMoneyVND,
} from '../../domain/seatMap.js';

export interface SeatButtonProps {
  key?: string | number;
  seat: SeatRecord;
  isSelected: boolean;
  isSelectable: boolean;
  isSearchMatch?: boolean;
  onInspect: (seat: SeatRecord) => void;
  onToggle: (seat: SeatRecord) => void;
}

export function SeatButton({
  seat,
  isSelected,
  isSelectable,
  isSearchMatch = true,
  onInspect,
  onToggle,
}: SeatButtonProps) {
  const uiStatus = mapSeatStatus(seat.TrangThai, isSelected);
  const statusLabel = STATUS_NAMES[uiStatus] || 'Không khả dụng';
  const priceFormatted = formatMoneyVND(seat.GiaVeNiemYet);
  const glyph = STATUS_GLYPHS[uiStatus] || seat.SoGhe || '';

  return (
    <button
      type="button"
      className="et-seat"
      data-status={uiStatus}
      data-code={seat.MaGheDayDu}
      data-od-id={`seat-${seat.MaGheDayDu.toLowerCase()}`}
      aria-label={`${seat.MaGheDayDu}, ${statusLabel}, ${priceFormatted}`}
      aria-pressed={isSelected}
      aria-disabled={!isSelectable}
      aria-describedby="seat-info"
      style={{
        opacity: isSearchMatch ? 1 : 0.18,
      }}
      onPointerEnter={() => onInspect(seat)}
      onFocus={() => onInspect(seat)}
      onClick={() => {
        onInspect(seat);
        onToggle(seat);
      }}
    >
      <span className="et-seat-shape" aria-hidden="true">
        {glyph}
      </span>
    </button>
  );
}
