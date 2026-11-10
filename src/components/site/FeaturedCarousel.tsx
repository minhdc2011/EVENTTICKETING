import {useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent} from 'react';
import type {PublicEventSummary} from '../../services/eventService';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import {getCategoryTheme} from '../../domain/categoryThemes.js';
import {formatEventDateTime} from '../event-template/eventTemplateLogic.js';
import {CategoryIcon} from '../common/Icons';
import './FeaturedCarousel.css';

const SLIDE_MS = 5000;
const RESUME_AFTER_MANUAL_MS = 3000;
const MAX_SLIDES = 6;

export function FeaturedCarousel({events}: {events: PublicEventSummary[]}) {
  // Prefer events that actually have a banner; fall back to the first events otherwise.
  const withImage = events.filter((e) => e.bannerUrl || e.posterUrl);
  const slides = (withImage.length > 0 ? withImage : events).slice(0, MAX_SLIDES);
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const resumeTimer = useRef<number | undefined>(undefined);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  // User-driven navigation: pause the auto-advance briefly, then let it continue.
  const manualGo = (next: number) => {
    goTo(next);
    setManualPause(true);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setManualPause(false), RESUME_AFTER_MANUAL_MS);
  };

  if (count === 0) return null;

  const paused = hovering || manualPause || reduceMotion || count < 2;
  const event = slides[index] ?? slides[0];
  const theme = getCategoryTheme(event.category);
  const image = event.bannerUrl || event.posterUrl;
  const target = `events/${event.slug}`;

  const onOpen = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigatePublicRoute(target);
    }
  };

  return (
    <section
      className="et-carousel"
      style={{'--et-cat-accent': theme.primary} as CSSProperties}
      aria-roledescription="carousel"
      aria-label="Sự kiện nổi bật"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <div className="et-carousel__stage">
        <a
          key={event.id}
          className="et-carousel__slide"
          href={buildPublicPath(window.location.pathname, target)}
          onClick={onOpen}
          aria-label={`Xem sự kiện ${event.name}`}
          aria-live={paused ? 'polite' : 'off'}
        >
          {image ? (
            <img src={image} alt="" className="et-carousel__img" />
          ) : (
            <div className="et-carousel__fallback" style={{background: theme.gradient}} aria-hidden="true">
              <CategoryIcon category={event.category} size={64} />
            </div>
          )}
          <div className="et-carousel__caption">
            <span className="et-carousel__badge">
              <CategoryIcon category={event.category} size={13} />
              <span>{theme.label}</span>
            </span>
            <strong className="et-carousel__title">{event.name}</strong>
            <span className="et-carousel__meta">
              <time dateTime={event.startsAt}>{formatEventDateTime(event.startsAt)}</time>
              {event.venueName ? ` · ${event.venueName}` : ''}
            </span>
          </div>
        </a>

        {count > 1 && (
          <>
            <button
              type="button"
              className="et-carousel__arrow et-carousel__arrow--prev"
              onClick={() => manualGo(index - 1)}
              aria-label="Sự kiện trước"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="et-carousel__arrow et-carousel__arrow--next"
              onClick={() => manualGo(index + 1)}
              aria-label="Sự kiện tiếp theo"
            >
              <span aria-hidden="true">›</span>
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="et-carousel__bars" role="tablist" aria-label="Chọn sự kiện nổi bật">
          {slides.map((slide, i) => {
            const state = i < index ? 'done' : i === index ? 'active' : 'idle';
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Sự kiện ${i + 1}: ${slide.name}`}
                className={`et-carousel__bar is-${state}`}
                onClick={() => manualGo(i)}
              >
                <span
                  className="et-carousel__fill"
                  data-paused={paused ? 'true' : 'false'}
                  style={{animationDuration: `${SLIDE_MS}ms`}}
                  onAnimationEnd={i === index && !paused ? () => goTo(index + 1) : undefined}
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
