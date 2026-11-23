import type {CSSProperties} from 'react';
import type {SeatRecord} from '../../types/ticketing';
import {isSeatSelectable} from '../../domain/seatMap.js';
import {SeatButton} from './SeatButton';

export interface PlacedSeatPx {
  seat: SeatRecord;
  rowLabel: string;
  /** Toạ độ tâm ghế (px) so với khung sơ đồ. */
  left: number;
  top: number;
}

export interface ZoneSeatsOverlayProps {
  placed: PlacedSeatPx[];
  /** Hệ số thu nhỏ nút ghế khi khu quá chật (1 = kích thước gốc 44 px). */
  scale: number;
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
 * Nút ghế GỐC (SeatButton, cùng kiểu dáng và vùng chạm 44 px như lưới ghế) đặt ngay trong phân khu đã phóng to của
 * sơ đồ BTC. Mỗi hàng nằm gọn trong bề ngang thật của khu nên khu hình thang hay bình hành vẫn có ghế nằm trong khu.
 */
export function ZoneSeatsOverlay({
  placed,
  scale,
  selectedSeats,
  searchQuery,
  focusSeatCode,
  saleOpen,
  isPending,
  hasActiveHold,
  onInspectSeat,
  onToggleSeat,
}: ZoneSeatsOverlayProps) {
  const q = searchQuery.trim().toLowerCase();
  const isSelected = (seat: SeatRecord) =>
    selectedSeats.some((s) => s.MaGheDayDu === seat.MaGheDayDu || s.GheID === seat.GheID);

  return (
    <div
      className="et-map-seat-overlay"
      role="group"
      aria-label="Ghế của khu đang chọn"
      style={{'--seat-scale': String(scale)} as CSSProperties}
    >
      {placed.map(({seat, left, top}) => (
        <div key={seat.GheID} className="et-map-seat-slot" style={{left, top}}>
          <SeatButton
            seat={seat}
            isSelected={isSelected(seat)}
            isSelectable={isSeatSelectable({status: seat.TrangThai, saleOpen, isPending, hasActiveHold})}
            isSearchMatch={!q || seat.MaGheDayDu.toLowerCase().includes(q) || seat.SoHang.toLowerCase().includes(q)}
            isSearchHit={focusSeatCode != null && seat.MaGheDayDu === focusSeatCode}
            onInspect={onInspectSeat}
            onToggle={onToggleSeat}
          />
        </div>
      ))}
    </div>
  );
}
