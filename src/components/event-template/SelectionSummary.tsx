import type {RefObject} from 'react';
import type {SeatRecord} from '../../types/ticketing';
import {formatMoneyVND, calculateSelectionTotal} from '../../domain/seatMap.js';

export interface SelectionSummaryProps {
  selectedSeats: SeatRecord[];
  saleOpen: boolean;
  isPending: boolean;
  hasActiveHold: boolean;
  isConnectionTrusted: boolean;
  holdButtonRef?: RefObject<HTMLButtonElement | null>;
  onRemoveSeat: (seat: SeatRecord) => void;
  onClearAll: () => void;
  onProceedHold: () => void;
}

export function SelectionSummary({
  selectedSeats,
  saleOpen,
  isPending,
  hasActiveHold,
  isConnectionTrusted,
  holdButtonRef,
  onRemoveSeat,
  onClearAll,
  onProceedHold,
}: SelectionSummaryProps) {
  const totalAmount = calculateSelectionTotal(selectedSeats);
  const totalFormatted = formatMoneyVND(totalAmount);
  const count = selectedSeats.length;

  const isHoldDisabled =
    !count || !saleOpen || isPending || !isConnectionTrusted;

  const getCtaText = () => {
    if (!saleOpen) return 'Đã đóng bán';
    if (isPending) return 'Đang kiểm tra ghế…';
    if (hasActiveHold) return 'Xem thời gian giữ ghế';
    if (count > 0) return `Giữ ${count} ghế tạm · 5 phút →`;
    return 'Chọn ghế để tiếp tục →';
  };

  return (
    <aside data-od-id="selection-panel">
      <section className="et-seatmap-summary" aria-labelledby="summary-title">
        {/* Head */}
        <div className="et-summary-head">
          <h2 id="summary-title" data-od-id="summary-title">
            Ghế đã chọn
          </h2>
          <span id="count" className="et-summary-counter">
            {count} / 4 vé
          </span>
        </div>

        {/* Body */}
        <div id="selection" className="et-summary-body" data-od-id="selected-tickets">
          {count === 0 ? (
            <div className="et-selection-empty">
              <div className="et-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 4h12v9H6zM4 9v10m16-10v10M4 15h16M7 19v2m10-2v2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>Chọn một chỗ thật ưng ý</h3>
              <p>Khám phá sơ đồ bên cạnh. Ghế bạn chọn sẽ xuất hiện ở đây.</p>
            </div>
          ) : (
            <>
              {selectedSeats.map((seat) => (
                <article
                  key={seat.GheID}
                  className="et-ticket-row"
                  data-od-id={`ticket-${seat.MaGheDayDu.toLowerCase()}`}
                >
                  <div>
                    <strong>{seat.MaGheDayDu}</strong>
                    <p>
                      Khu {seat.TenKhuVuc || 'Khán đài'} · Hàng {seat.SoHang} · Ghế {seat.SoGhe}
                    </p>
                  </div>
                  <div className="et-ticket-right">
                    <span>{formatMoneyVND(seat.GiaVeNiemYet)}</span>
                    <button
                      type="button"
                      className="et-remove-btn"
                      data-remove={seat.MaGheDayDu}
                      aria-label={`Bỏ ghế ${seat.MaGheDayDu}`}
                      disabled={isPending || hasActiveHold}
                      onClick={() => onRemoveSeat(seat)}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}

              <button
                type="button"
                className="et-clear-btn"
                id="clear"
                data-od-id="clear-selection"
                disabled={isPending || hasActiveHold}
                onClick={onClearAll}
              >
                Bỏ chọn tất cả
              </button>
            </>
          )}
        </div>

        {/* Payment / Hold CTA */}
        <div className="et-payment-section">
          <div className="et-total-row">
            <span>Tổng cộng</span>
            <strong id="total" data-od-id="total-amount">
              {totalFormatted}
            </strong>
          </div>
          <p className="et-fee-notice">
            Tổng tạm tính từ giá vé hiện tại; hệ thống xác nhận lại khi giữ ghế.
          </p>

          <button
            ref={holdButtonRef}
            type="button"
            id="hold"
            className="et-seatmap-cta"
            disabled={isHoldDisabled && !hasActiveHold}
            data-od-id="temporary-hold-cta"
            onClick={onProceedHold}
          >
            <span>{getCtaText()}</span>
          </button>

          <p className="et-hold-note" id="hold-note">
            {hasActiveHold
              ? 'Đang giữ ghế trong phiên tạm thời. Nhấn để xem thời gian còn lại hoặc hủy giữ.'
              : 'Ghế chỉ được giữ sau khi yêu cầu thành công. Thời gian giữ dự kiến: 5 phút.'}
          </p>

          {!isConnectionTrusted && (
            <p className="et-hold-note" style={{color: 'var(--seat-amber)'}}>
              Kết nối dữ liệu ghế chưa ổn định. Tạm thời không thể thực hiện giữ ghế.
            </p>
          )}
        </div>
      </section>

      {/* Trust Note */}
      <div className="et-trust-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p>
          <strong>Bạn vẫn nắm quyền lựa chọn.</strong>
          <br />
          Giữ ghế tạm không phải là mua vé và chưa phát sinh thanh toán.
        </p>
      </div>
    </aside>
  );
}
