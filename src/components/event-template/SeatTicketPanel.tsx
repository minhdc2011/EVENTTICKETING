import type {SeatRecord, ZoneRecord} from '../../types/ticketing';
import {formatMoneyVND, mapSeatStatus, STATUS_NAMES} from '../../domain/seatMap.js';
import {isStandingZone} from '../../domain/standingSelection.js';

export interface SeatTicketPanelProps {
  seat: SeatRecord | null;
  zone: ZoneRecord | null;
  activeZone?: ZoneRecord | null;
  standingQuantity?: number;
  /** Mọi khu vé đứng của suất (khu đứng trên bản đồ đại diện cho cả nhóm hạng vé đứng). */
  standingZones?: ZoneRecord[];
  standingQuantities?: Record<string, number>;
  roomLeft?: number;
  onChangeStanding?: (zoneCode: string, quantity: number) => void;
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
  activeZone = null,
  standingQuantity = 0,
  standingZones,
  standingQuantities,
  roomLeft = 0,
  onChangeStanding,
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
    if (activeZone && isStandingZone(activeZone) && onChangeStanding && standingZones && standingZones.length > 0) {
      // Khu vé đứng trên bản đồ đại diện cho cả nhóm hạng vé đứng: hiện đủ các hạng, mỗi hạng một bộ chọn số lượng.
      const disabledAll = !saleOpen || isPending || hasActiveHold;
      return (
        <aside className="et-ticket-panel" aria-label="Thông tin vé" aria-live="polite" data-standing="true">
          <div className="et-ticket-panel__head">
            <h3 className="et-ticket-panel__title">Vé đứng tự do</h3>
          </div>
          <p className="et-ticket-panel__hint">
            Khu vé đứng không xếp ghế cố định. Chọn số lượng vé từng hạng (tối đa {maxPerOrder} vé/lượt).
          </p>
          <ul className="et-ticket-panel__standing-list">
            {standingZones.map((zoneItem) => {
              const label = zoneItem.TenKhuVuc || zoneItem.MaKhuVuc;
              const quantity = standingQuantities?.[zoneItem.MaKhuVuc] || 0;
              return (
                <li key={zoneItem.KhuVucID} className="et-ticket-panel__standing-item" data-standing-zone={zoneItem.MaKhuVuc}>
                  <div className="et-ticket-panel__standing-info">
                    <span className="et-ticket-panel__standing-name">{label}</span>
                    <span className="et-ticket-panel__standing-price et-num">{formatMoneyVND(zoneItem.GiaVeNiemYet)} / vé</span>
                  </div>
                  <div className="et-ticket-panel__standing" role="group" aria-label={`Số lượng vé ${label}`}>
                    <button
                      type="button"
                      className="et-standing-btn"
                      aria-label={`Giảm số lượng vé ${label}`}
                      disabled={disabledAll || quantity <= 0}
                      onClick={() => onChangeStanding(zoneItem.MaKhuVuc, quantity - 1)}
                    >
                      −
                    </button>
                    <output className="et-standing-qty et-num" aria-live="polite">{quantity}</output>
                    <button
                      type="button"
                      className="et-standing-btn"
                      aria-label={`Tăng số lượng vé ${label}`}
                      disabled={disabledAll || roomLeft <= 0}
                      onClick={() => onChangeStanding(zoneItem.MaKhuVuc, quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      );
    }
    if (activeZone && isStandingZone(activeZone) && onChangeStanding) {
      const zoneLabel = activeZone.TenKhuVuc || activeZone.MaKhuVuc;
      const disabled = !saleOpen || isPending || hasActiveHold;
      return (
        <aside className="et-ticket-panel" aria-label="Thông tin vé" aria-live="polite" data-standing="true">
          <div className="et-ticket-panel__head">
            <h3 className="et-ticket-panel__title">Vé đứng tự do</h3>
          </div>
          <p className="et-ticket-panel__zone">
            <span>{zoneLabel}</span>
          </p>
          <div className="et-ticket-panel__price">
            <span>Đơn giá</span>
            <strong className="et-num">{formatMoneyVND(activeZone.GiaVeNiemYet)}</strong>
          </div>
          <p className="et-ticket-panel__hint">
            Khu vé đứng không xếp ghế cố định. Chọn số lượng vé bên dưới (tối đa {maxPerOrder} vé/lượt).
          </p>
          <div className="et-ticket-panel__standing" role="group" aria-label={`Số lượng vé ${zoneLabel}`}>
            <button
              type="button"
              className="et-standing-btn"
              aria-label={`Giảm số lượng vé ${zoneLabel}`}
              disabled={disabled || standingQuantity <= 0}
              onClick={() => onChangeStanding(activeZone.MaKhuVuc, standingQuantity - 1)}
            >
              −
            </button>
            <output className="et-standing-qty et-num" aria-live="polite">{standingQuantity}</output>
            <button
              type="button"
              className="et-standing-btn"
              aria-label={`Tăng số lượng vé ${zoneLabel}`}
              disabled={disabled || roomLeft <= 0}
              onClick={() => onChangeStanding(activeZone.MaKhuVuc, standingQuantity + 1)}
            >
              +
            </button>
          </div>
        </aside>
      );
    }

    return (
      <aside className="et-ticket-panel" aria-label="Thông tin vé" data-empty="true">
        <h3 className="et-ticket-panel__title">Thông tin vé</h3>
        <p className="et-ticket-panel__hint">
          Bấm một khu để phóng to, rồi bấm một chấm ghế để xem khu, hàng, ghế và giá tại đây.
        </p>
        <ol className="et-ticket-panel__steps">
          <li>Chọn phân khu trên sơ đồ hoặc thanh lọc.</li>
          <li>Bấm chấm ghế còn trống để kiểm tra giá.</li>
          <li>Nhấn <strong>Thêm vào lựa chọn</strong> để giữ{'\u00A0'}vé.</li>
        </ol>
      </aside>
    );
  }

  const status = mapSeatStatus(seat.TrangThai, isSelected);
  const statusLabel = STATUS_NAMES[status as keyof typeof STATUS_NAMES] ?? 'Không khả dụng';
  const zoneName = zone?.TenKhuVuc || zone?.MaKhuVuc || seat.TenKhuVuc || '';
  const shortZone = (zone?.MaKhuVuc || '').replace(/^SEC_/, '').replace(/_/g, ' ') || zoneName;

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
        <h3 className="et-ticket-panel__title">Chọn vé</h3>
        <button type="button" className="et-ticket-panel__back" onClick={onClose} aria-label="Đóng thông tin ghế" title="Đóng">
          ×
        </button>
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
