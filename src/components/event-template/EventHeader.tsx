import type * as React from 'react';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import type {PublicEventRecord} from '../../services/eventService';

const onSpaNav = (target: string) => (e: React.MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

type EventHeaderProps = {
  event: PublicEventRecord;
  saleOpen: boolean;
  onOpenSchedule?: () => void;
  hasSchedule?: boolean;
};

export function EventHeader({
  event,
  saleOpen,
  onOpenSchedule,
  hasSchedule = false,
}: EventHeaderProps) {
  const isPreview = event.publicationStatus !== 'CONG_KHAI';
  const isConcert = event.templateKey === 'SUPER_CONCERT_2026';

  return (
    <>
      {isPreview && (
        <aside className="et-preview-banner" role="status" aria-label="Thông báo chế độ xem trước">
          <div className="et-preview-banner-text">
            <span className="et-preview-badge">CHẾ ĐỘ XEM TRƯỚC</span>
            <span>Bản nháp sự kiện chưa công bố. Chỉ Ban tổ chức mới có thể xem trang này.</span>
          </div>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
            className="et-preview-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Quay lại Studio BTC</span>
          </a>
        </aside>
      )}

      <header className="et-header">
        <div className="et-header-left">
          <a
            href={buildPublicPath(window.location.pathname, 'events')}
            onClick={onSpaNav('events')}
            className="et-brand"
            aria-label="EventTicketing — Về trang khám phá sự kiện"
          >
            <span className="et-brand-badge">ET</span>
            EV<span>ENT</span>
          </a>

          <a
            href={buildPublicPath(window.location.pathname, 'events')}
            onClick={onSpaNav('events')}
            className="et-nav-back-link"
            aria-label="Khám phá sự kiện"
            title="Quay lại khám phá sự kiện"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="et-nav-back-text">Khám phá</span>
          </a>
        </div>

        <nav className="et-nav-links" aria-label="Điều hướng trang sự kiện">
          {isConcert ? (
            <>
              <a href="#artist-lineup" className="et-nav-link">Nghệ sĩ</a>
              <a href="#pricing-section" className="et-nav-link">Hạng vé</a>
              <a href="#seating-section" className="et-nav-link">Sơ đồ ghế</a>
              <a href="#concert-guide-section" className="et-nav-link">Lưu ý & Địa điểm</a>
              <button
                id="btn-view-schedule"
                type="button"
                onClick={onOpenSchedule}
                className="et-nav-timeline-btn cursor-pointer"
                title="Xem lịch trình sự kiện"
                aria-label="Lịch trình sự kiện"
              >
                <span className="et-timeline-btn-full">Timeline</span>
                <span className="et-timeline-btn-compact">Lịch</span>
              </button>
              <a
                href="#seating-section"
                className="et-nav-cta"
                aria-label="Chuyển đến phần sơ đồ vé"
              >
                <span
                  className="et-live-dot"
                  style={{
                    backgroundColor: saleOpen ? '#34d399' : '#fbbf24',
                    boxShadow: saleOpen ? '0 0 10px #34d399' : '0 0 10px #fbbf24',
                  }}
                />
                <span className="et-cta-label-full">{saleOpen ? 'Chọn vé ngay' : 'Xem sơ đồ vé'}</span>
                <span className="et-cta-label-compact">{saleOpen ? 'Chọn vé' : 'Sơ đồ'}</span>
              </a>
            </>
          ) : (
            <>
              <a
                href={buildPublicPath(window.location.pathname, 'events')}
                onClick={onSpaNav('events')}
                className="et-nav-link"
              >
                Tất cả sự kiện
              </a>
              {hasSchedule && onOpenSchedule && (
                <button
                  type="button"
                  onClick={onOpenSchedule}
                  className="et-nav-link cursor-pointer bg-transparent border-0"
                  title="Xem lịch trình sự kiện"
                >
                  Lịch trình
                </button>
              )}
              <a
                href={buildPublicPath(window.location.pathname, 'organizer')}
                onClick={onSpaNav('organizer')}
                className="et-nav-link"
              >
                Dành cho BTC
              </a>
              <a
                href="#tickets"
                className="et-nav-cta"
                aria-label="Chuyển đến phần danh sách vé"
              >
                <span
                  className="et-live-dot"
                  style={{
                    backgroundColor: saleOpen ? '#34d399' : '#fbbf24',
                    boxShadow: saleOpen ? '0 0 10px #34d399' : '0 0 10px #fbbf24',
                  }}
                />
                <span className="et-cta-label-full">{saleOpen ? 'Xem và chọn vé' : 'Xem hạng vé'}</span>
                <span className="et-cta-label-compact">{saleOpen ? 'Chọn vé' : 'Hạng vé'}</span>
              </a>
            </>
          )}
        </nav>
      </header>
    </>
  );
}
