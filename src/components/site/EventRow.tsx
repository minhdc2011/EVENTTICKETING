import type * as React from 'react';
import type {PublicEventSummary} from '../../services/eventService';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import {getCategoryTheme} from '../../domain/categoryThemes.js';
import {formatEventDateBlock, formatEventTime} from '../event-template/eventTemplateLogic.js';
import {CategoryIcon} from '../common/Icons';

export function EventRow({event}: {event: PublicEventSummary; key?: string}) {
  const theme = getCategoryTheme(event.category);
  const image = event.posterUrl || event.bannerUrl;
  const block = formatEventDateBlock(event.startsAt);
  const time = formatEventTime(event.startsAt);
  const target = `events/${event.slug}`;

  const onClick = (e: React.MouseEvent) => {
    if (!e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigatePublicRoute(target);
    }
  };

  return (
    <article className="et-event-row" style={{'--et-cat-accent': theme.primary} as React.CSSProperties}>
      <div className="et-event-row__media">
        {image ? (
          <img src={image} alt="" loading="lazy" />
        ) : (
          <div className="et-event-row__fallback" style={{background: theme.gradient}} aria-hidden="true">
            <CategoryIcon category={event.category} size={28} />
          </div>
        )}
      </div>
      <time className="et-event-row__date" dateTime={event.startsAt}>
        <span>{block.weekday}</span>
        <span>{block.month}</span>
        <strong>{block.day}</strong>
      </time>
      <div className="et-event-row__body">
        <span className="et-event-row__badge">
          <CategoryIcon category={event.category} size={12} />
          <span>{theme.label}</span>
        </span>
        <h3 className="et-event-row__title">{event.name}</h3>
        <p className="et-event-row__venue">{event.venueName || 'Địa điểm thông báo sau'}</p>
        <p className="et-event-row__time">
          {time}
          {event.showCount > 1 ? ` · ${event.showCount} suất diễn` : ''}
        </p>
      </div>
      <a
        className="et-event-row__cta"
        href={buildPublicPath(window.location.pathname, target)}
        onClick={onClick}
        aria-label={`Tìm vé ${event.name}`}
      >
        Tìm vé
      </a>
    </article>
  );
}
