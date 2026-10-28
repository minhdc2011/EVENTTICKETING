import {useMemo} from 'react';
import type {PublicEventRecord} from '../../services/eventService';
import './EventFooter.css';

export type EventFooterProps = {
  event: PublicEventRecord;
  hasSchedule?: boolean;
  onOpenSchedule?: () => void;
  onOpenTeamInfo?: () => void;
};

export function EventFooter({
  event,
  hasSchedule = false,
  onOpenSchedule,
  onOpenTeamInfo,
}: EventFooterProps) {
  const isConcert = event.templateKey === 'SUPER_CONCERT_2026';

  const brandCopy = useMemo(() => {
    if (isConcert) {
      return '© 2026 SUPER CONCERT — ĐẠI NHẠC HỘI NGOẠI THƯƠNG. All rights reserved.';
    }
    const eventName = event.name?.trim();
    return `© 2026 ${eventName ? `${eventName} — ` : ''}EventTicketing. All rights reserved.`;
  }, [isConcert, event.name]);

  const hasVenue = Boolean(event.venueName?.trim() || event.address?.trim());
  const hasPolicies = Boolean(
    event.ageRestriction?.trim() ||
    event.refundPolicy?.trim() ||
    event.termsAndConditions?.trim()
  );
  const hasGuide = isConcert || hasVenue || hasPolicies;

  const handleScrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({top: 0, behavior: 'smooth'});
    }
  };

  return (
    <footer
      className="et-footer"
      role="contentinfo"
      aria-label="Thông tin cuối trang và liên kết nhanh"
    >
      <div className="et-footer-container">
        <div className="et-footer-brand">
          <span className="et-footer-copy">{brandCopy}</span>
        </div>

        <nav className="et-footer-nav" aria-label="Điều hướng cuối trang">
          <div className="et-footer-links">
            {onOpenTeamInfo && (
              <button
                id="btn-open-team-info"
                type="button"
                onClick={onOpenTeamInfo}
                className="et-footer-link cursor-pointer"
              >
                Thông tin đề tài & nhóm 4
              </button>
            )}

            {hasSchedule && onOpenSchedule && (
              <>
                <span className="et-footer-sep" aria-hidden="true">•</span>
                <button
                  id="btn-footer-open-schedule"
                  type="button"
                  onClick={onOpenSchedule}
                  className="et-footer-link cursor-pointer"
                >
                  {isConcert ? 'Lịch trình biểu diễn' : 'Lịch trình sự kiện'}
                </button>
              </>
            )}

            {hasGuide && (
              <>
                <span className="et-footer-sep" aria-hidden="true">•</span>
                <a
                  href="#concert-guide-section"
                  className="et-footer-link cursor-pointer"
                >
                  Lưu ý & Địa điểm
                </a>
              </>
            )}

            <span className="et-footer-sep" aria-hidden="true">•</span>
            <button
              type="button"
              onClick={handleScrollToTop}
              className="et-footer-link et-footer-back-to-top cursor-pointer"
              aria-label="Cuộn lên đầu trang"
            >
              <span>Lên đầu trang</span>
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            </button>
          </div>
        </nav>
      </div>
    </footer>
  );
}
