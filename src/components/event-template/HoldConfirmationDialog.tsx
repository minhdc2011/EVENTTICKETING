import {useEffect, useRef, type MouseEvent, type RefObject} from 'react';
import type {SeatRecord} from '../../types/ticketing';
import {formatCountdown, formatMoneyVND, calculateSelectionTotal} from '../../domain/seatMap.js';

export interface HoldConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRelease: () => void;
  isReleasing?: boolean;
  holdId?: string;
  selectedSeats: SeatRecord[];
  remainingSeconds: number;
  openerRef?: RefObject<HTMLElement | null>;
}

export function HoldConfirmationDialog({
  isOpen,
  onClose,
  onRelease,
  isReleasing = false,
  holdId,
  selectedSeats,
  remainingSeconds,
  openerRef,
}: HoldConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const releaseButtonRef = useRef<HTMLButtonElement>(null);
  const savedOpenerRef = useRef<HTMLElement | null>(null);

  const seatCodes = selectedSeats.map((s) => s.MaGheDayDu).join(', ');
  const totalFormatted = formatMoneyVND(calculateSelectionTotal(selectedSeats));
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
        data-od-id="hold-dialog"
        className="et-hold-dialog"
      >
        <div className="et-dialog-top">
          <h2 id="dialog-title">Đã giữ ghế tạm</h2>
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

        <p id="hold-result" style={{margin: '8px 0', fontSize: '13px', color: 'var(--seat-muted)'}}>
          Đã giữ {selectedSeats.length} ghế: <strong style={{color: 'var(--seat-fg)'}}>{seatCodes}</strong>. Tổng {totalFormatted}.
        </p>

        <div
          id="countdown"
          className="et-countdown-display"
          aria-label="Thời gian giữ còn lại"
        >
          {countdownText}
        </div>

        <p style={{margin: '12px 0 16px', fontSize: '12px', color: 'var(--seat-muted)', lineHeight: 1.5}}>
          Ghế sẽ được trả lại khi hết thời gian. Chưa có giao dịch thanh toán nào được thực hiện.
        </p>

        <button
          ref={releaseButtonRef}
          type="button"
          id="release"
          className="et-release-btn"
          data-od-id="release-hold"
          disabled={isReleasing}
          onClick={onRelease}
        >
          {isReleasing ? 'Đang hủy giữ ghế…' : 'Hủy giữ ghế'}
        </button>

        {holdId && (
          <p className="et-dialog-foot font-mono">
            Mã phiên: {holdId}
          </p>
        )}
      </div>
    </div>
  );
}
