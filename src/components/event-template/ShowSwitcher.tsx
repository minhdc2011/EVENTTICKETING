import type * as React from 'react';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import type {PublicEventRecord} from '../../services/eventService';
import {formatEventDateTime} from './eventTemplateLogic.js';

const onSpaNav = (target: string) => (e: React.MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

export type ShowSwitcherProps = {
  event: PublicEventRecord;
};

export function ShowSwitcher({event}: ShowSwitcherProps) {
  if (event.shows.length < 2) return null;
  return (
    <nav className="show-switcher" aria-label="Chọn suất diễn">
      <span className="show-switcher-label">Suất diễn</span>
      {event.shows.map((show) => (
        <a
          key={show.id}
          className={show.id === event.selectedShow.id ? 'is-active' : ''}
          href={buildPublicPath(window.location.pathname, `events/${event.slug}/shows/${show.slug}`)}
          onClick={onSpaNav(`events/${event.slug}/shows/${show.slug}`)}
        >
          <strong>{show.name}</strong>
          <time dateTime={show.startsAt}>{formatEventDateTime(show.startsAt)}</time>
        </a>
      ))}
    </nav>
  );
}
