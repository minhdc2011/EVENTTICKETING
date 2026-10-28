import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from 'react';
import {isSuperConcertEvent, type PublicScheduleItem} from '../../domain/publicSchedule.js';
import type {PublicEventRecord} from '../../services/eventService';
import {formatDateShort, formatEventDateTime} from './eventTemplateLogic.js';
import './ScheduleDialog.css';

export type ScheduleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  items: PublicScheduleItem[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  event?: Partial<PublicEventRecord> | null;
  openerRef?: RefObject<HTMLElement | null>;
};

const ACCENT_COLORS = ['#94a3b8', '#f5c63d', '#8bd3ff', '#d8ff3e', '#ff7777', '#c084fc'];

export function ScheduleDialog({
  isOpen,
  onClose,
  items,
  isLoading = false,
  error = null,
  onRetry,
  event,
  openerRef,
}: ScheduleDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savedOpenerRef = useRef<HTMLElement | null>(null);

  const isConcert = isSuperConcertEvent(event);

  // Accessibility: store opener element, lock body scroll, manage focus, handle Escape & Tab containment
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

  // Handle backdrop click
  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  // Header kicker text
  const kickerText = useMemo(() => {
    if (event?.selectedShow?.startsAt) {
      return `Run of show · ${formatDateShort(event.selectedShow.startsAt)}`;
    }
    return 'Run of show · Lịch trình chi tiết';
  }, [event?.selectedShow?.startsAt]);

  // Header meta text
  const metaVenue = event?.venueName || (isConcert ? 'SVĐ QUỐC GIA MỸ ĐÌNH' : '');
  const metaTime = event?.selectedShow?.startsAt
    ? formatEventDateTime(event.selectedShow.startsAt)
    : '';

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      id="schedule-dialog-overlay"
      className="schedule-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
      aria-hidden={!isOpen}
    >
      <div
        ref={dialogRef}
        id="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-dialog-title"
        tabIndex={-1}
        className="schedule-dialog schedule-dialog-shell"
      >
        {/* Top-right close button */}
        <button
          ref={closeButtonRef}
          type="button"
          id="btn-close-schedule-dialog"
          className="schedule-close cursor-pointer"
          aria-label="Đóng lịch trình sự kiện"
          onClick={onClose}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Dialog Header */}
        <header className="schedule-header">
          <div>
            <div className="schedule-kicker">{kickerText}</div>
            <h3 id="schedule-dialog-title" className="schedule-title">
              {isConcert ? (
                <>
                  Concert <span>Timeline</span>
                </>
              ) : (
                <>
                  {event?.name ? (
                    <>
                      {event.name} <span>Timeline</span>
                    </>
                  ) : (
                    <>
                      Lịch trình <span>sự kiện</span>
                    </>
                  )}
                </>
              )}
            </h3>
          </div>
          {(metaVenue || metaTime) && (
            <div className="schedule-meta">
              {metaVenue && <strong>{metaVenue.toUpperCase()}</strong>}
              {metaTime && <span>{metaTime}</span>}
            </div>
          )}
        </header>

        {/* Loading state */}
        {isLoading && (
          <div className="schedule-state-box" role="status">
            <div className="schedule-loading-pill">
              <span className="schedule-loading-dot" aria-hidden="true" />
              <span>Đang tải lịch trình chi tiết…</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="schedule-state-box">
            <div className="schedule-error-box" role="alert">
              <span>{error}</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="schedule-retry-btn">
                  Thử lại
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
          <div className="schedule-state-box">
            <p className="schedule-empty-msg">
              Lịch trình chi tiết sự kiện đang được Ban tổ chức cập nhật.
            </p>
          </div>
        )}

        {/* Timeline list */}
        {!isLoading && !error && items.length > 0 && (
          <div className="schedule-list">
            {items.map((item, index) => {
              const accentColor = ACCENT_COLORS[index % ACCENT_COLORS.length];
              const itemStyle = {'--item-accent': accentColor} as CSSProperties;

              return (
                <article
                  key={item.id || `${item.startTime}-${index}`}
                  className="schedule-item"
                  style={itemStyle}
                >
                  <div className="schedule-time-col">
                    <time className="schedule-time" dateTime={item.startTime}>
                      {item.startTime}
                    </time>
                    {item.endTime && (
                      <span className="schedule-time-end">
                        – {item.endTime}
                      </span>
                    )}
                  </div>

                  <div className="schedule-rail" aria-hidden="true">
                    <i className="schedule-dot" />
                  </div>

                  <div className="schedule-content">
                    <h4>{item.title}</h4>
                    {item.description && <p>{item.description}</p>}
                    {item.location && (
                      <div className="schedule-location">
                        <svg
                          className="schedule-location-icon"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span>{item.location}</span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Dialog Footer */}
        <footer className="schedule-footer">
          <button
            type="button"
            id="btn-close-schedule-dialog-2"
            className="schedule-dismiss cursor-pointer"
            onClick={onClose}
          >
            Đóng timeline
          </button>
        </footer>
      </div>
    </div>
  );
}
