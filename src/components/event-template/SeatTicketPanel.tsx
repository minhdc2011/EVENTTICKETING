import type {SeatRecord, ZoneRecord} from '../../types/ticketing';
import {formatMoneyVND, mapSeatStatus, STATUS_NAMES} from '../../domain/seatMap.js';

export interface SeatTicketPanelProps {
  seat: SeatRecord | null;
  zone: ZoneRecord | null;
  isSelected: boolean;
  /** Đã chọn đủ số vé tối đa của một lượt đặt. */
  limitReached: boolean;
  maxPerOrder: number;
  saleOpen: boolean;
  isPending: boolean;
  hasActiveHold: boolean;
  onToggle: (seat: SeatRecord) => void;
  onClose: () => void;
}

/**
 * Khung thông tin vé cạnh bản đồ (kiểu Ticketmaster "Ticket Selection"): khu, hàng, ghế, giá và nút Thêm / Bỏ chọn.
 * Bấm một chấm trên bản đồ chỉ mở khung này; ghế chỉ vào lựa chọn khi bấm Thêm.
 */
export function SeatTicketPanel({
  seat,
  zone,
  isSelected,
  limitReached,
  maxPerOrder,
  saleOpen,
  isPending,
  hasActiveHold,
  onToggle,
  onClose,
}: SeatTicketPanelProps) {
  if (!seat) {
    return (
      <aside className="et-ticket-panel" aria-label="Thông tin vé" data-empty="true">
        <h3 className="et-ticket-panel__title">Thông tin vé</h3>
        <p className="et-ticket-panel__hint">
          Bấm một khu để phóng to, rồi bấm một chấm ghế để xem khu, hàng, ghế và giá tại đây.
        </p>
      </aside>
    );
  }

  const status = mapSeatStatus(seat.TrangThai, isSelected);
  const statusLabel = STATUS_NAMES[status as keyof typeof STATUS_NAMES] ?? 'Không khả dụng';
  const zoneName = zone?.TenKhuVuc || zone?.MaKhuVuc || seat.TenKhuVuc || '';
  const shortZone = (zone?.MaKhuVuc || '').replace(/^SEC_/, '').replace(/_/g, '–') || zoneName;

  let action: {label: string; disabled: boolean; reason?: string; tone?: 'remove'};
  if (isSelected) action = {label: 'Bỏ chọn ghế này', disabled: isPending || hasActiveHold, tone: 'remove'};
  else if (status === 'sold') action = {label: 'Ghế đã bán', disabled: true, reason: 'Ghế này đã có người mua.'};
  else if (status === 'held') action = {label: 'Ghế đang được giữ', disabled: true, reason: 'Ghế đang được người khác giữ tạm thời.'};
  else if (status !== 'available') action = {label: 'Không mở bán', disabled: true, reason: 'Ghế này không mở bán.'};
  else if (!saleOpen) action = {label: 'Chưa mở bán', disabled: true, reason: 'Sự kiện hiện không trong thời gian bán vé.'};
  else if (limitReached) {
    action = {label: 'Đã chọn đủ vé', disabled: true, reason: `Bạn đã chọn đủ ${maxPerOrder} vé. Bỏ chọn một ghế để chọn ghế khác.`};
  } else action = {label: 'Thêm vào lựa chọn', disabled: isPending || hasActiveHold};

  return (
    <aside className="et-ticket-panel" aria-label="Thông tin vé" aria-live="polite" data-status={status}>
      <div className="et-ticket-panel__head">
        <button type="button" className="et-ticket-panel__back" onClick={onClose} aria-label="Đóng thông tin ghế">
          ←
        </button>
        <h3 className="et-ticket-panel__title">Chọn vé</h3>
      </div>

      <dl className="et-ticket-panel__grid">
        <div>
          <dt>Khu</dt>
          <dd className={shortZone.length > 6 ? 'is-long' : undefined} title={zoneName}>{shortZone}</dd>
        </div>
        <div>
          <dt>Hàng</dt>
          <dd>{seat.SoHang}</dd>
        </div>
        <div>
          <dt>Ghế</dt>
          <dd>{seat.SoGhe}</dd>
        </div>
      </dl>

      <p className="et-ticket-panel__zone">
        <span>{zoneName}</span>
      </p>

      <div className="et-ticket-panel__price">
        <span>{statusLabel}</span>
        <strong className="et-num">{formatMoneyVND(seat.GiaVeNiemYet)}</strong>
      </div>

      <p className="et-ticket-panel__code">{seat.MaGheDayDu}</p>
      {action.reason ? (
        <p className="et-ticket-panel__reason" role="status">
          {action.reason}
        </p>
      ) : null}

      <button
        type="button"
        className={`et-ticket-panel__action${action.tone === 'remove' ? ' is-remove' : ''}`}
        disabled={action.disabled}
        onClick={() => onToggle(seat)}
      >
        {action.label}
      </button>
    </aside>
  );
}
