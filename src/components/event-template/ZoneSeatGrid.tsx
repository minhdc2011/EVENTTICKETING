import {useEffect, useRef} from 'react';
import type {ZoneRecord, SeatRecord} from '../../types/ticketing';
import type {ZoneRowGroup} from '../../domain/seatMap.js';
import {
  mapSeatStatus,
  isSeatSelectable,
  STATUS_NAMES,
  formatMoneyVND,
} from '../../domain/seatMap.js';
import {SeatButton} from './SeatButton';

export interface ZoneSeatGridProps {
  zone: ZoneRecord;
  rows: ZoneRowGroup[];
  selectedSeats: SeatRecord[];
  searchQuery: string;
  saleOpen: boolean;
  isPending: boolean;
  hasActiveHold: boolean;
  zoom: number;
  inspectedSeat: SeatRecord | null;
  onInspectSeat: (seat: SeatRecord) => void;
  onToggleSeat: (seat: SeatRecord) => void;
  onBackToOverview: () => void;
}

export function ZoneSeatGrid({
  zone,
  rows,
  selectedSeats,
  searchQuery,
  saleOpen,
  isPending,
  hasActiveHold,
  zoom,
  inspectedSeat,
  onInspectSeat,
  onToggleSeat,
  onBackToOverview,
}: ZoneSeatGridProps) {
  const backButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the back button when entering zone drill-down
  useEffect(() => {
    backButtonRef.current?.focus();
  }, [zone.KhuVucID]);

  const zoneName = zone.TenKhuVuc || zone.MaKhuVuc;
  const q = searchQuery.trim().toLowerCase();

  const isSeatSelected = (seat: SeatRecord) =>
    selectedSeats.some((s) => s.MaGheDayDu === seat.MaGheDayDu || s.GheID === seat.GheID);

  const inspectedUiStatus = inspectedSeat
    ? mapSeatStatus(inspectedSeat.TrangThai, isSeatSelected(inspectedSeat))
    : null;

  return (
    <div className="et-detail-layout">
      {/* 1. Back to Overview */}
      <button
        ref={backButtonRef}
        type="button"
        className="et-back-btn"
        id="back-overview"
        data-od-id="back-overview"
        onClick={onBackToOverview}
      >
        <span aria-hidden="true">←</span>
        <span>Tổng quan sân vận động</span>
      </button>

      {/* 2. Stage Orientation Line */}
      <div className="et-stage-line" aria-hidden="true">
        HƯỚNG SÂN KHẤU
      </div>

      {/* 3. Seat Rows */}
      <div
        className="et-seat-rows"
        role="group"
        aria-label={`Ghế khu ${zoneName}`}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      >
        {rows.map(({rowLabel, seats}) => (
          <div key={rowLabel} className="et-seat-row">
            <span className="et-row-label" aria-hidden="true">
              {rowLabel}
            </span>
            <div className="et-seats-group">
              {seats.map((seat) => {
                const isSelected = isSeatSelected(seat);
                const isSelectable = isSeatSelectable({
                  status: seat.TrangThai,
                  saleOpen,
                  isPending,
                  hasActiveHold,
                });
                const isSearchMatch =
                  !q ||
                  seat.MaGheDayDu.toLowerCase().includes(q) ||
                  seat.SoHang.toLowerCase().includes(q);

                return (
                  <SeatButton
                    key={seat.GheID}
                    seat={seat}
                    isSelected={isSelected}
                    isSelectable={isSelectable}
                    isSearchMatch={isSearchMatch}
                    onInspect={onInspectSeat}
                    onToggle={onToggleSeat}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 4. Fixed Seat Detail Disclosure (below grid, does not obscure seats) */}
      <div
        className="et-seat-info-box"
        id="seat-info"
        data-od-id="seat-details"
        role="region"
        aria-label={
          inspectedSeat
            ? `Chi tiết ghế ${inspectedSeat.MaGheDayDu}, ${
                STATUS_NAMES[inspectedUiStatus!]
              }, ${formatMoneyVND(inspectedSeat.GiaVeNiemYet)}`
            : 'Khu vực thông tin chi tiết ghế'
        }
      >
        {inspectedSeat ? (
          <>
            <div>
              <strong>{inspectedSeat.MaGheDayDu}</strong>
              <small>
                Khu {zoneName} · Hàng {inspectedSeat.SoHang} · Ghế {inspectedSeat.SoGhe} ·{' '}
                {STATUS_NAMES[inspectedUiStatus!]}
              </small>
            </div>
            <strong>{formatMoneyVND(inspectedSeat.GiaVeNiemYet)}</strong>
          </>
        ) : (
          <>
            <div>
              Chi tiết ghế
              <small>Rê chuột, dùng phím Tab hoặc chạm vào một ghế để xem</small>
            </div>
            <span>—</span>
          </>
        )}
      </div>
    </div>
  );
}
