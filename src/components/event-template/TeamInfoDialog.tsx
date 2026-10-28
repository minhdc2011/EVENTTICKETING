import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react';
import './TeamInfoDialog.css';

export type TeamInfoDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  openerRef?: RefObject<HTMLElement | null>;
};

export function TeamInfoDialog({
  isOpen,
  onClose,
  openerRef,
}: TeamInfoDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savedOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Capture opener element for focus restoration
    savedOpenerRef.current =
      (document.activeElement as HTMLElement | null) || openerRef?.current || null;

    // 2. Lock body scroll
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 3. Move initial focus into dialog
    const focusTimer = window.setTimeout(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 50);

    // 4. Keyboard handling: Escape to dismiss, Tab / Shift+Tab focus containment
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

      // 5. Restore focus to opener element upon closing
      if (savedOpenerRef.current && typeof savedOpenerRef.current.focus === 'function') {
        savedOpenerRef.current.focus();
      }
    };
  }, [isOpen, onClose, openerRef]);

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm team-dialog-overlay"
      onClick={handleOverlayClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        id="team-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-info-dialog-title"
        tabIndex={-1}
        className="relative w-full max-w-xl rounded-2xl liquid-glass p-6 shadow-2xl team-dialog-content outline-none"
      >
        <button
          ref={closeButtonRef}
          id="btn-close-team-modal"
          type="button"
          aria-label="Đóng thông tin đồ án"
          onClick={onClose}
          className="absolute top-4 right-4 min-h-[44px] min-w-[44px] p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center cursor-pointer transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-4 pr-10">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-red-950/80 border border-red-700/60 flex items-center justify-center font-bold text-red-400">
            FTU
          </div>
          <div>
            <h3 id="team-info-dialog-title" className="font-bold text-base text-white">
              THÔNG TIN ĐỒ ÁN & THÀNH VIÊN NHÓM 4
            </h3>
            <p className="text-xs text-slate-400">
              Báo cáo Đặc tả Yêu cầu Hệ thống (SRS) — Tháng 9/2026
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-300 mb-6 inset-dark-cell p-3.5 rounded-xl">
          <div><strong className="text-slate-200">Trường:</strong> Đại học Ngoại Thương (Foreign Trade University)</div>
          <div><strong className="text-slate-200">Khoa:</strong> Công nghệ và Khoa học Dữ liệu</div>
          <div><strong className="text-slate-200">Đề tài:</strong> EventTicketing — Nền tảng Quản lý Bán vé Sự kiện & Tối ưu Doanh thu Tự động</div>
          <div><strong className="text-slate-200">Lớp tín chỉ:</strong> COSH301(2627 - HK1)GĐ1+2.1</div>
          <div><strong className="text-slate-200">Giảng viên hướng dẫn:</strong> TS. Phạm Thị Kim Dung</div>
        </div>

        <div className="mb-5">
          <h4 className="font-semibold text-xs text-slate-200 uppercase tracking-wider mb-2">
            Danh sách thành viên nhóm 4:
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="p-2.5 rounded-lg inset-dark-cell flex justify-between items-center">
              <span>1. Nguyễn Sỹ Bách</span>
              <span className="font-mono text-slate-400">MSV: 2412960004</span>
            </div>
            <div className="p-2.5 rounded-lg inset-dark-cell flex justify-between items-center">
              <span>2. Trần Khánh Bình</span>
              <span className="font-mono text-slate-400">MSV: 2412960005</span>
            </div>
            <div className="p-2.5 rounded-lg inset-dark-cell flex justify-between items-center">
              <span>3. Nguyễn Khánh Huyền</span>
              <span className="font-mono text-slate-400">MSV: 2412960012</span>
            </div>
            <div className="p-2.5 rounded-lg inset-dark-cell flex justify-between items-center">
              <span className="text-amber-400 font-medium">4. Đặng Công Minh (Lead)</span>
              <span className="font-mono text-amber-400">MSV: 2412960016</span>
            </div>
            <div className="p-2.5 rounded-lg inset-dark-cell flex justify-between items-center">
              <span>5. Đỗ Nhật Quang</span>
              <span className="font-mono text-slate-400">MSV: 2412960021</span>
            </div>
          </div>
        </div>

        <button
          id="btn-close-team-modal-2"
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded-xl ghost-tab text-white font-medium text-xs transition cursor-pointer flex items-center justify-center"
        >
          Đóng cửa sổ
        </button>
      </div>
    </div>
  );
}
