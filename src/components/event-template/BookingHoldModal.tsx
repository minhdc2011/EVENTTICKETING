import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react';
import {
  formatHoldDuration,
  type BookingHoldItem,
} from '../../domain/runtimeOverlays.js';
import './BookingHoldModal.css';

export type BookingHoldModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSimulateSprintPreview?: () => void;
  holdId?: string;
  items?: BookingHoldItem[];
  totalQuantity?: number;
  totalAmount?: number;
  totalAmountFormatted?: string;
  remainingSeconds?: number;
  openerRef?: RefObject<HTMLElement | null>;
};

/**
 * Reusable React modal confirming a successful Supabase seat hold.
 * Fully controlled, accessible (WCAG AA), focus-trapped, and free of innerHTML injection.
 */
export function BookingHoldModal({
  isOpen,
  onClose,
  onSimulateSprintPreview,
  holdId,
  items = [],
  totalQuantity = 0,
  totalAmount = 0,
  totalAmountFormatted = '0 VNĐ',
  remainingSeconds,
  openerRef,
}: BookingHoldModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const savedOpenerRef = useRef<HTMLElement | null>(null);

  const holdDuration = formatHoldDuration(remainingSeconds);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Capture opener element for focus restoration, avoiding document.body
    const activeEl = document.activeElement as HTMLElement | null;
    const isUsableActiveElement =
      activeEl && activeEl !== document.body && activeEl !== document.documentElement;
    const triggerEl = document.getElementById('btn-proceed-booking');
    savedOpenerRef.current =
      (isUsableActiveElement ? activeEl : null) || openerRef?.current || triggerEl || null;

    // 2. Lock body scroll
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 3. Move initial focus into dialog
    const focusTimer = window.setTimeout(() => {
      if (continueButtonRef.current) {
        continueButtonRef.current.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 50);

    // 4. Keyboard handling: Escape to dismiss, Tab focus trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;

        const focusableSelector =
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll(focusableSelector)
        ).filter(
          (el): el is HTMLElement =>
            el instanceof HTMLElement &&
            (el.offsetParent !== null || el.getClientRects().length > 0)
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      // 5. Restore focus to opener element upon closing (never focus document.body)
      if (
        savedOpenerRef.current &&
        typeof savedOpenerRef.current.focus === 'function' &&
        savedOpenerRef.current !== document.body &&
        savedOpenerRef.current !== document.documentElement
      ) {
        savedOpenerRef.current.focus();
      }
    };
  }, [isOpen, onClose, openerRef]);

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const handleSimulateSprint = () => {
    onClose();
    if (onSimulateSprintPreview) {
      onSimulateSprintPreview();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      id="booking-modal"
      data-hold-id={holdId || undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm booking-dialog-overlay"
      onClick={handleOverlayClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        aria-describedby="booking-modal-description"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl liquid-glass p-6 shadow-2xl text-center booking-dialog-content outline-none"
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Đóng cửa sổ giữ chỗ"
          onClick={onClose}
          className="absolute top-4 right-4 min-h-[44px] min-w-[44px] p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center cursor-pointer transition"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 id="booking-modal-title" className="text-xl font-bold text-white mb-1 font-display">
          GIỮ CHỖ THÀNH CÔNG!
        </h3>
        <p id="booking-modal-description" className="text-xs text-slate-400 mb-3">
          Ghế của bạn đã được khóa độc quyền trong{' '}
          <strong id="booking-modal-hold-duration">{holdDuration.label}</strong> theo chuẩn cơ chế Distributed Lock (FR-T3-01).
        </p>

        {holdId && (
          <div className="text-[11px] text-slate-400 font-mono mb-3 truncate">
            Mã phiên giữ chỗ: <span className="text-amber-400 font-bold">{holdId}</span>
          </div>
        )}

        <div className="text-[11px] text-amber-300/90 mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-left leading-relaxed">
          <strong className="text-amber-200 block mb-0.5">Xác nhận tạm giữ chỗ</strong>
          Đây là bước giữ chỗ tạm thời trong thời gian giới hạn, chưa phải là giao dịch thanh toán hoàn tất.
        </div>

        <div
          id="booking-modal-summary"
          className="text-left inset-dark-cell p-4 rounded-xl text-xs space-y-2 mb-5"
        >
          {items.map((item, index) => (
            <div
              key={`${item.ticketCode}-${index}`}
              className="flex justify-between py-1 border-b border-slate-900"
            >
              <span className="font-mono text-amber-400">
                {item.ticketCode} ({item.zoneName})
              </span>
              <span className="text-white">{item.priceFormatted}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-white pt-2 text-sm border-t border-white/[0.08]">
            <span>Tổng cộng ({totalQuantity} vé):</span>
            <span className="text-amber-400 font-display">{totalAmountFormatted}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            ref={continueButtonRef}
            id="btn-close-booking-modal"
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl ghost-tab text-slate-200 text-xs font-semibold cursor-pointer hover:text-white transition"
          >
            Tiếp tục xem sơ đồ
          </button>
          <button
            id="btn-simulate-sprint"
            type="button"
            onClick={handleSimulateSprint}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-lg shadow-amber-500/20 cursor-pointer transition"
          >
            Mô phỏng Sprint 3
          </button>
        </div>
      </div>
    </div>
  );
}
