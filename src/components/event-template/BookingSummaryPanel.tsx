import {useEffect, useMemo, useRef} from 'react';
import type {PublicEventRecord, PublicTicketTier} from '../../services/eventService';
import {
  formatDateShort,
  formatEventDateTime,
  formatMoney,
  hasAssistAction,
  resolveCtaState,
} from './eventTemplateLogic.js';

type BookingSummaryPanelProps = {
  event: PublicEventRecord;
  tiers: PublicTicketTier[];
  selectedTier: PublicTicketTier | null;
  saleStatus: string;
  onOpenAssistModal: () => void;
};

export function BookingSummaryPanel({
  event,
  tiers,
  selectedTier,
  saleStatus,
  onOpenAssistModal,
}: BookingSummaryPanelProps) {
  const assistActionAvailable = useMemo(() => {
    return hasAssistAction(event);
  }, [event]);

  const ctaState = useMemo(() => {
    return resolveCtaState({
      saleStatus,
      selectedTier,
      hasTiers: tiers.length > 0,
      hasAssistAction: assistActionAvailable,
    });
  }, [saleStatus, selectedTier, tiers.length, assistActionAvailable]);

  const handleCtaClick = () => {
    if (ctaState.disabled) return;
    if (ctaState.action === 'select_tier') {
      const ticketsEl = document.getElementById('tickets');
      if (ticketsEl) {
        ticketsEl.scrollIntoView({behavior: 'smooth'});
      }
      return;
    }
    if (ctaState.action === 'checkout_assist' && assistActionAvailable) {
      onOpenAssistModal();
    }
  };

  return (
    <aside className="et-booking-panel" aria-label="Tóm tắt thông tin đặt vé">
      <div className="et-booking-panel-header">
        <h2 className="et-booking-panel-title">TỔNG QUAN ĐẶT VÉ</h2>
        <div className="et-booking-panel-show">{event.selectedShow.name}</div>
        <div style={{color: '#94a3b8', fontSize: '12px', marginTop: '4px'}}>
          {formatDateShort(event.selectedShow.startsAt)} · {event.venueName}
        </div>
      </div>

      <div className="et-booking-selected-tier-box">
        <span className="et-booking-selected-label">Hạng vé đang chọn</span>
        {selectedTier ? (
          <>
            <div className="et-booking-selected-name">{selectedTier.name}</div>
            <div className="et-booking-price-row">
              <span className="et-booking-price-label">Giá vé:</span>
              <span className="et-booking-price-value et-num">
                {formatMoney(selectedTier.price)}
              </span>
            </div>
            <div className="et-booking-price-row" style={{borderTop: 0, paddingTop: 0}}>
              <span className="et-booking-price-label">Tồn kho khả dụng:</span>
              <span style={{color: selectedTier.available > 0 ? '#6ee7b7' : '#fca5a5', fontSize: '13px', fontWeight: 700}}>
                {selectedTier.available > 0 ? `Còn ${selectedTier.available} vé` : 'Đã hết vé'}
              </span>
            </div>
          </>
        ) : (
          <p style={{margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: 1.5}}>
            Chưa chọn hạng vé nào. Vui lòng bấm chọn một hạng vé từ bảng giá bên trái.
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          disabled={ctaState.disabled}
          onClick={handleCtaClick}
          className="et-booking-primary-btn"
          aria-describedby="booking-helper-text"
        >
          <span>{ctaState.label}</span>
          {!ctaState.disabled && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>

        <p id="booking-helper-text" className="et-booking-helper-text" style={{marginTop: '10px'}}>
          {ctaState.helperText}
        </p>
      </div>

      {(event.contactHotline || event.contactEmail) && (
        <div className="et-booking-hotline-note">
          <span>Hỗ trợ:</span>
          {event.contactHotline && (
            <a href={`tel:${event.contactHotline}`}>{event.contactHotline}</a>
          )}
          {event.contactHotline && event.contactEmail && <span>·</span>}
          {event.contactEmail && (
            <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a>
          )}
        </div>
      )}
    </aside>
  );
}

type BookingAssistModalProps = {
  isOpen: boolean;
  onClose: () => void;
  event: PublicEventRecord;
  selectedTier: PublicTicketTier | null;
};

export function BookingAssistModal({
  isOpen,
  onClose,
  event,
  selectedTier,
}: BookingAssistModalProps) {
  const assistAvailable = hasAssistAction(event);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management, trigger focus restore, and body scroll lock
  useEffect(() => {
    if (isOpen && assistAvailable) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const timer = window.setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 30);

      return () => {
        window.clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen, assistAvailable]);

  // Keyboard navigation: Escape key to close, Tab focus trapping
  useEffect(() => {
    if (!isOpen || !assistAvailable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, assistAvailable, onClose]);

  // Prevent rendering empty modal if no assistance channels exist
  if (!isOpen || !assistAvailable) return null;

  const mailSubject = encodeURIComponent(`[Yêu cầu hỗ trợ đặt vé] ${event.name} — ${selectedTier?.name || ''}`);
  const mailBody = encodeURIComponent(
    `Xin chào Ban tổ chức ${event.name},\n\nTôi muốn được hỗ trợ thông tin đặt vé cho suất diễn: ${event.selectedShow.name}.\nHạng vé quan tâm: ${selectedTier?.name || 'Tiêu chuẩn'} (${formatMoney(selectedTier?.price || 0)}).\n\nHọ và tên:\nSố điện thoại:\nSố lượng vé mong muốn:\n\nXin cảm ơn!`
  );

  return (
    <div
      className="et-modal-backdrop"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assist-modal-title"
        aria-describedby="assist-modal-desc"
        tabIndex={-1}
        className="et-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className="et-modal-close"
          onClick={onClose}
          aria-label="Đóng hộp thoại hỗ trợ đặt vé"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 id="assist-modal-title" className="et-modal-title">
          LIÊN HỆ & HỖ TRỢ ĐẶT VÉ
        </h3>

        <div className="et-modal-summary-box">
          <div className="et-modal-row">
            <span>Sự kiện:</span>
            <strong>{event.name}</strong>
          </div>
          <div className="et-modal-row">
            <span>Suất diễn:</span>
            <strong>{event.selectedShow.name}</strong>
          </div>
          <div className="et-modal-row">
            <span>Thời gian:</span>
            <strong>{formatEventDateTime(event.selectedShow.startsAt)}</strong>
          </div>
          {selectedTier && (
            <>
              <div className="et-modal-row">
                <span>Hạng vé đã chọn:</span>
                <strong style={{color: '#fbbf24'}}>{selectedTier.name}</strong>
              </div>
              <div className="et-modal-row">
                <span>Đơn giá:</span>
                <strong className="et-num" style={{color: '#fbbf24'}}>
                  {formatMoney(selectedTier.price)}
                </strong>
              </div>
            </>
          )}
        </div>

        <p id="assist-modal-desc" style={{margin: 0, color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6}}>
          Cổng thanh toán trực tuyến tự động chưa được kích hoạt cho sự kiện này.
          Quý khách vui lòng liên hệ trực tiếp với Ban tổ chức theo các kênh chính thức bên dưới để được hỗ trợ mua vé và hướng dẫn hoàn tất thủ tục:
        </p>

        <div className="et-modal-actions">
          {event.contactHotline && (
            <a
              href={`tel:${event.contactHotline}`}
              className="et-modal-action-btn et-modal-action-btn--primary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Gọi hotline BTC: {event.contactHotline}</span>
            </a>
          )}

          {event.contactEmail && (
            <a
              href={`mailto:${event.contactEmail}?subject=${mailSubject}&body=${mailBody}`}
              className="et-modal-action-btn et-modal-action-btn--secondary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>Gửi email liên hệ Ban tổ chức</span>
            </a>
          )}

          {event.locationMode === 'ONLINE' && event.onlineLink && (
            <a
              href={event.onlineLink}
              target="_blank"
              rel="noreferrer"
              className="et-modal-action-btn et-modal-action-btn--secondary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>Truy cập đường dẫn trực tuyến</span>
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="et-modal-action-btn et-modal-action-btn--secondary"
            style={{marginTop: '4px'}}
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
}
