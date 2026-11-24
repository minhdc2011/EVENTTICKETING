import {useEffect, useRef, type MouseEvent, type RefObject} from 'react';
import type {SeatRecord} from '../../types/ticketing';
import {formatCountdown, formatMoneyVND, calculateSelectionTotal} from '../../domain/seatMap.js';
import {HELD_PRICE_NOTE_CLIENT, type HeldPriceSnapshot} from '../../domain/pricePresentation.js';
import type {StandingLine} from './SelectionSummary';

export interface HoldConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRelease: () => void;
  isReleasing?: boolean;
  holdId?: string;
  selectedSeats: SeatRecord[];
  standingLines?: StandingLine[];
  heldPriceSnapshot?: HeldPriceSnapshot | null;
  remainingSeconds: number;
  openerRef?: RefObject<HTMLElement | null>;
  /** held: đã giữ chỗ, chờ xác nhận thanh toán; paid: đã xác nhận thanh toán (mô phỏng). */
  phase?: 'held' | 'paid';
  onConfirmPayment?: () => void;
  isConfirming?: boolean;
}

export function HoldConfirmationDialog({
  isOpen,
  onClose,
  onRelease,
  isReleasing = false,
  holdId,
  selectedSeats,
  standingLines = [],
  heldPriceSnapshot = null,
  remainingSeconds,
  openerRef,
  phase = 'held',
  onConfirmPayment,
  isConfirming = false,
}: HoldConfirmationDialogProps) {
  const paid = phase === 'paid';
  const verb = paid ? 'Đã thanh toán' : 'Đã giữ';
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const releaseButtonRef = useRef<HTMLButtonElement>(null);
  const savedOpenerRef = useRef<HTMLElement | null>(null);

  const standingNameByCode = new Map(standingLines.map((line) => [line.zoneCode, line.name]));
  const seatLines = heldPriceSnapshot
    ? heldPriceSnapshot.seats
    : selectedSeats.map((seat) => ({
        GheID: seat.GheID,
        MaGheDayDu: seat.MaGheDayDu,
        KhuVucID: seat.KhuVucID,
        zoneCode: '',
        unitPrice: Number(seat.GiaVeNiemYet) || 0,
        serverLocked: false,
      }));
  const resolvedStandingLines = heldPriceSnapshot
    ? heldPriceSnapshot.standingLines.map((line) => ({
        ...line,
        name: standingNameByCode.get(line.zoneCode) || line.zoneCode,
      }))
    : standingLines
        .filter((line) => line.quantity > 0)
        .map((line) => ({
          zoneCode: line.zoneCode,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.price,
          subtotal: line.price * line.quantity,
          serverLocked: false,
        }));

  const seatCodes = seatLines.map((s) => s.MaGheDayDu).join(', ');
  const standingCount = resolvedStandingLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = heldPriceSnapshot
    ? heldPriceSnapshot.total
    : calculateSelectionTotal(selectedSeats) +
      resolvedStandingLines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalFormatted = formatMoneyVND(totalAmount);
  const priceNote = heldPriceSnapshot ? heldPriceSnapshot.note : HELD_PRICE_NOTE_CLIENT;
  const countdownText = formatCountdown(remainingSeconds);

  useEffect(() => {
    if (!isOpen) return;

    // Save opener for focus restoration
    const activeEl = document.activeElement as HTMLElement | null;
    savedOpenerRef.current =
      openerRef?.current ||
      (activeEl && activeEl !== document.body ? activeEl : null);

    // Initial focus on close button
    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to opener
      if (savedOpenerRef.current && typeof savedOpenerRef.current.focus === 'function') {
        savedOpenerRef.current.focus();
      }
    };
  }, [isOpen, onClose, openerRef]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="et-dialog-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="hold-result"
        data-od-id="hold-dialog"
        className="et-hold-dialog"
      >
        <div className="et-dialog-top">
          <h2 id="dialog-title">{paid ? 'Thanh toán thành công (mô phỏng)' : 'Đã giữ chỗ thành công'}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="et-dialog-close"
            id="close-dialog"
            aria-label="Đóng thông báo"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p id="hold-result" style={{margin: '8px 0', fontSize: '13px', color: 'var(--seat-muted)', overflowWrap: 'anywhere'}}>
          {seatLines.length > 0 && standingCount > 0 ? (
            <>
              {verb} {seatLines.length} ghế (<strong style={{color: 'var(--seat-fg)'}}>{seatCodes}</strong>) và{' '}
              {standingCount} vé đứng. Tổng <strong className="et-num" style={{color: 'var(--seat-fg)'}}>{totalFormatted}</strong>.
            </>
          ) : seatLines.length > 0 ? (
            <>
              {verb} {seatLines.length} ghế: <strong style={{color: 'var(--seat-fg)'}}>{seatCodes}</strong>. Tổng{' '}
              <strong className="et-num" style={{color: 'var(--seat-fg)'}}>{totalFormatted}</strong>.
            </>
          ) : (
            <>
              {verb} {standingCount} vé đứng. Tổng{' '}
              <strong className="et-num" style={{color: 'var(--seat-fg)'}}>{totalFormatted}</strong>.
            </>
          )}
        </p>

        {(seatLines.length > 0 || resolvedStandingLines.length > 0) && (
          <ul className="et-dialog-price-list" aria-label="Chi tiết giá vé đang giữ">
            {seatLines.map((seat) => (
              <li key={String(seat.GheID ?? seat.MaGheDayDu)} className="et-dialog-price-row">
                <span>
                  Ghế <strong>{seat.MaGheDayDu}</strong>
                  {seat.serverLocked && <span className="et-price-lock-tag">Đã chốt</span>}
                </span>
                <span className="et-num">{formatMoneyVND(seat.unitPrice)}</span>
              </li>
            ))}
            {resolvedStandingLines.map((line) => (
              <li key={line.zoneCode} className="et-dialog-price-row">
                <span>
                  {line.name} × {line.quantity}
                  {line.serverLocked && <span className="et-price-lock-tag">Đã chốt</span>}
                </span>
                <span className="et-num">{formatMoneyVND(line.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="et-dialog-price-note" data-od-id="hold-dialog-price-note">
          {priceNote}
        </p>

        {paid ? null : (
          <>
            <p className="et-countdown-caption" id="countdown-caption">
              Hoàn tất thanh toán trong
            </p>
            <div
              id="countdown"
              className="et-countdown-display et-num"
              aria-label="Thời gian giữ còn lại"
            >
              {countdownText}
            </div>
          </>
        )}

        <p style={{margin: '12px 0 16px', fontSize: '12px', color: 'var(--seat-muted)', lineHeight: 1.5}}>
          {paid
            ? 'Thanh toán mô phỏng: hệ thống chưa kết nối cổng thanh toán nên chưa phát hành vé. Ghế của bạn đã được ghi nhận là đã bán.'
            : 'Chỗ đang được giữ cho bạn. Bấm Xác nhận thanh toán để hoàn tất; sự kiện bật OTP sẽ gửi mã về email của tài khoản đang đăng nhập. Hết giờ mà chưa xác nhận thì chỗ được trả lại. Thanh toán là mô phỏng, chưa phát hành vé.'}
        </p>

        {paid ? (
          <button type="button" id="close-paid" className="et-confirm-btn" onClick={onClose}>
            Đóng
          </button>
        ) : (
          <>
            <button
              type="button"
              id="confirm-payment"
              className="et-confirm-btn"
              data-od-id="confirm-payment"
              disabled={isConfirming || isReleasing}
              onClick={onConfirmPayment}
            >
              {isConfirming ? 'Đang xác nhận…' : 'Xác nhận thanh toán'}
            </button>
            <button
              ref={releaseButtonRef}
              type="button"
              id="release"
              className="et-release-btn"
              style={{marginTop: '10px'}}
              data-od-id="release-hold"
              disabled={isReleasing || isConfirming}
              onClick={onRelease}
            >
              {isReleasing ? 'Đang hủy…' : 'Hủy giữ chỗ và trả ghế'}
            </button>
          </>
        )}

        {holdId && (
          <p className="et-dialog-foot font-mono">
            Mã phiên: {holdId}
          </p>
        )}
      </div>
    </div>
  );
}
