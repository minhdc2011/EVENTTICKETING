import type {ZoneRecord} from '../../types/ticketing';
import {formatMoneyVND} from '../../domain/seatMap.js';

export interface StandingTicketPickerProps {
  zones: ZoneRecord[];
  quantities: Record<string, number>;
  /** Tickets still allowed in this order (shared with selected seats). */
  roomLeft: number;
  disabled: boolean;
  onChange: (zoneCode: string, quantity: number) => void;
}

/** Quantity selector for standing (DUNG_STAND) zones: no seat rows, the hold carries {zoneCode, quantity}. */
export function StandingTicketPicker({zones, quantities, roomLeft, disabled, onChange}: StandingTicketPickerProps) {
  if (zones.length === 0) return null;
  return (
    <section className="et-standing" aria-label="Vé đứng" data-od-id="standing-picker">
      <h3 className="et-standing-title">Vé đứng (không chọn ghế)</h3>
      <ul className="et-standing-list">
        {zones.map((zone) => {
          const quantity = quantities[zone.MaKhuVuc] || 0;
          const label = zone.TenKhuVuc || zone.MaKhuVuc;
          return (
            <li
              key={zone.KhuVucID}
              className="et-standing-row"
              data-standing-zone={zone.MaKhuVuc}
            >
              <div className="et-standing-info">
                <span className="et-standing-name">{label}</span>
                <span className="et-standing-price">{formatMoneyVND(zone.GiaVeNiemYet)} / vé</span>
              </div>
              <div className="et-standing-stepper" role="group" aria-label={`Số lượng vé ${label}`}>
                <button
                  type="button"
                  className="et-standing-btn"
                  aria-label={`Giảm số lượng vé ${label}`}
                  disabled={disabled || quantity <= 0}
                  onClick={() => onChange(zone.MaKhuVuc, quantity - 1)}
                >
                  −
                </button>
                <output className="et-standing-qty" aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  className="et-standing-btn"
                  aria-label={`Tăng số lượng vé ${label}`}
                  disabled={disabled || roomLeft <= 0}
                  onClick={() => onChange(zone.MaKhuVuc, quantity + 1)}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
