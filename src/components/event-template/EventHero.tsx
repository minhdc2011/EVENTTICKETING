import {useMemo} from 'react';
import type {PublicEventRecord} from '../../services/eventService';
import {EventCountdown} from './EventCountdown';
import {
  formatDateShort,
  formatEventDateTime,
  getCategoryLabel,
  getSaleStatusMeta,
  normalizeEventSlogan,
  resolveEventBackdrop,
  resolveHeroCta,
} from './eventTemplateLogic.js';

type EventHeroProps = {
  event: PublicEventRecord;
  saleStatus: string;
  onOpenSchedule?: () => void;
  hasSchedule?: boolean;
};

export function EventHero({
  event,
  saleStatus,
  onOpenSchedule,
  hasSchedule = false,
}: EventHeroProps) {
  const backdrop = useMemo(() => {
    return resolveEventBackdrop(event.bannerUrl, event.posterUrl);
  }, [event.bannerUrl, event.posterUrl]);

  const categoryLabel = useMemo(() => {
    return getCategoryLabel(event.category);
  }, [event.category]);

  const statusMeta = useMemo(() => {
    return getSaleStatusMeta(saleStatus);
  }, [saleStatus]);

  const isConcert = event.templateKey === 'SUPER_CONCERT_2026';
  const heroCta = useMemo(() => resolveHeroCta(saleStatus, isConcert), [saleStatus, isConcert]);
  const cleanSlogan = useMemo(() => normalizeEventSlogan(event.slogan, event.category), [event.slogan, event.category]);

  const venueDisplayText = useMemo(() => {
    if (event.locationMode === 'ONLINE') {
      return {title: 'Trực tuyến (Online)', sub: 'Tham gia qua phòng họp trực tuyến'};
    }
    if (event.locationMode === 'HYBRID') {
      return {title: `${event.venueName} (Kết hợp Online)`, sub: event.address};
    }
    if (event.locationMode === 'TBA') {
      return {title: 'Sẽ thông báo sau (TBA)', sub: 'Ban tổ chức đang hoàn thiện địa điểm'};
    }
    return {
      title: event.venueName || 'Địa điểm tổ chức',
      sub: event.address || 'Đang cập nhật địa chỉ',
    };
  }, [event.locationMode, event.venueName, event.address]);

  return (
    <section
      id={isConcert ? 'concert-hero' : 'event-hero'}
      className="et-hero"
      style={{
        backgroundImage: backdrop.backgroundUrl ? `url(${backdrop.backgroundUrl})` : undefined,
      }}
      aria-labelledby="event-hero-heading"
    >
      <div className="et-hero-overlay" aria-hidden="true" />

      <div className="et-hero-inner">
        {/* Left Column: Event Core Info */}
        <div className="et-hero-content">
          <div className="et-hero-badges">
            <span className="et-badge et-badge--category">{categoryLabel}</span>
            <span className="et-badge et-badge--shows">
              {event.shows.length} {event.shows.length > 1 ? 'SUẤT DIỄN' : 'SUẤT DIỄN DUY NHẤT'}
            </span>
            <span className={`et-badge et-badge--sale-${statusMeta.tone}`}>
              {statusMeta.isLive && <span className="et-live-dot" />}
              <span>{statusMeta.label}</span>
            </span>
          </div>

          <h1 id="event-hero-heading" className="et-hero-title">
            {event.name}
          </h1>

          {cleanSlogan && <p className="et-hero-slogan">{cleanSlogan}</p>}

          <p className="et-hero-desc">
            {event.description
              ? event.description.length > 240
                ? `${event.description.slice(0, 240)}…`
                : event.description
              : 'Trải nghiệm sự kiện chất lượng cao với hệ thống phân phối vé và dịch vụ trực tuyến.'}
          </p>

          <div className="et-hero-meta-grid">
            <div className="et-meta-card">
              <span className="et-meta-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <div className="et-meta-body">
                <span className="et-meta-label">Thời gian diễn ra</span>
                <span className="et-meta-value">{formatEventDateTime(event.selectedShow.startsAt)}</span>
                <span className="et-meta-sub">{event.selectedShow.name}</span>
              </div>
            </div>

            <div className="et-meta-card">
              <span className="et-meta-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <div className="et-meta-body">
                <span className="et-meta-label">Địa điểm / Hình thức</span>
                <span className="et-meta-value">{venueDisplayText.title}</span>
                <span className="et-meta-sub">{venueDisplayText.sub}</span>
              </div>
            </div>
          </div>

          <div className="et-hero-actions">
            <a
              href={heroCta.href}
              className="et-hero-primary-cta"
              aria-label={heroCta.ariaLabel}
            >
              <span>{heroCta.label}</span>
              <span aria-hidden="true">↓</span>
            </a>
            {(isConcert || hasSchedule) && onOpenSchedule && (
              <button
                type="button"
                onClick={onOpenSchedule}
                className="et-hero-secondary-cta cursor-pointer"
              >
                <span>Xem Timeline</span>
              </button>
            )}
            {event.trailerUrl && (
              <a
                href={event.trailerUrl}
                target="_blank"
                rel="noreferrer"
                className="et-hero-secondary-cta"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Xem Trailer giới thiệu</span>
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>

        {/* Right Column: Dynamic Countdown & Optional Poster */}
        <div className="et-hero-aside">
          <EventCountdown event={event} saleStatus={saleStatus} />

          {backdrop.posterUrl && backdrop.posterUrl !== backdrop.backgroundUrl && (
            <div className="et-poster-card" aria-label="Poster chính thức sự kiện">
              <img
                src={backdrop.posterUrl}
                alt={`Poster chính thức: ${event.name}`}
                className="et-poster-img"
                loading="lazy"
              />
              <div className="et-poster-info">
                <span className="et-poster-title">{event.name}</span>
                <span className="et-poster-date">
                  Khởi chiếu: {formatDateShort(event.selectedShow.startsAt)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
