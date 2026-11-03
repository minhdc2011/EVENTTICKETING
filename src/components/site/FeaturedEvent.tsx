import type * as React from 'react';
import type {PublicEventSummary} from '../../services/eventService';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import {getCategoryTheme} from '../../domain/categoryThemes.js';
import {formatEventDateTime} from '../event-template/eventTemplateLogic.js';
import {CategoryIcon} from '../common/Icons';

export function FeaturedEvent({event}: {event: PublicEventSummary | null}) {
  if (!event) return null;
  const theme = getCategoryTheme(event.category);
  const image = event.bannerUrl || event.posterUrl;
  const target = `events/${event.slug}`;

  const onClick = (e: React.MouseEvent) => {
    if (!e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigatePublicRoute(target);
    }
  };

  return (
    <section
      className="et-featured"
      style={{'--et-cat-accent': theme.primary} as React.CSSProperties}
      aria-label="Sự kiện nổi bật"
    >
      <div className="et-featured__media">
        {image ? (
          <img src={image} alt="" />
        ) : (
          <div className="et-featured__fallback" style={{background: theme.gradient}} aria-hidden="true">
            <CategoryIcon category={event.category} size={56} />
          </div>
        )}
      </div>
      <div className="et-featured__body">
        <span className="et-event-row__badge">
          <CategoryIcon category={event.category} size={13} />
          <span>{theme.label}</span>
        </span>
        <h1 className="et-featured__title">{event.name}</h1>
        {event.slogan && <p className="et-featured__slogan">{event.slogan}</p>}
        <p className="et-featured__meta">
          <time dateTime={event.startsAt}>{formatEventDateTime(event.startsAt)}</time>
        </p>
        <p className="et-featured__meta">{event.venueName || 'Địa điểm thông báo sau'}</p>
        <a
          className="et-event-row__cta"
          href={buildPublicPath(window.location.pathname, target)}
          onClick={onClick}
          aria-label={`Tìm vé ${event.name}`}
        >
          Tìm vé
        </a>
      </div>
    </section>
  );
}
