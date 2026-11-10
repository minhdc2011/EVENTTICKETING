import {useCallback, useEffect, useRef, useState, type CSSProperties} from 'react';
import type {CatalogArtist} from '../../domain/catalogFilters.js';
import {IconArrowRight} from '../common/Icons';
import './ArtistFilter.css';

export type ArtistFilterProps = {
  artists: readonly CatalogArtist[];
  value: string;
  onChange: (artistKey: string) => void;
  disabled?: boolean;
};

const initialsFor = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();

const mediaFocusFor = (name: string) => {
  const key = name.trim().toLocaleLowerCase('vi');
  if (key.includes('sơn tùng') || key.includes('son tung')) return '50% 28%';
  if (key.includes('soobin')) return '50% 34%';
  if (key === 'suboi') return '50% 30%';
  if (key === 'mono') return '50% 42%';
  if (key.includes('dj mie')) return '50% 34%';
  return '50% 40%';
};

export function ArtistFilter({artists, value, onChange, disabled = false}: ArtistFilterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Picking an artist (or clearing) returns to the compact carousel.
  useEffect(() => setExpanded(false), [value]);

  const seen = new Set<string>();
  const options = artists.filter((artist) => {
    if (seen.has(artist.key)) return false;
    seen.add(artist.key);
    return true;
  });

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollBack(track.scrollLeft > 4);
    setCanScrollForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(track);
    return () => observer.disconnect();
  }, [options.length, updateScrollState]);

  const scrollByPage = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({left: direction * Math.max(track.clientWidth * 0.82, 280), behavior: 'smooth'});
  };

  if (options.length === 0) return null;

  return (
    <section className="et-artist-filter" aria-labelledby="artist-discovery-title">
      <div className="et-artist-filter__header">
        <div>
          <span className="et-artist-filter__rule" aria-hidden="true" />
          <h2 id="artist-discovery-title">Nghệ sĩ</h2>
          <p>Chọn nghệ sĩ để xem tất cả sự kiện họ góp mặt.</p>
        </div>
        <div className="et-artist-filter__actions">
          {expanded ? (
            <button
              type="button"
              className="et-artist-filter__collapse"
              onClick={() => setExpanded(false)}
            >
              Thu gọn
            </button>
          ) : (
            <>
              <button
                type="button"
                className="et-artist-filter__arrow et-artist-filter__arrow--back"
                aria-label="Xem nghệ sĩ phía trước"
                disabled={!canScrollBack}
                onClick={() => scrollByPage(-1)}
              >
                <IconArrowRight size={22} />
              </button>
              <button
                type="button"
                className="et-artist-filter__arrow"
                aria-label="Xem thêm nghệ sĩ"
                disabled={!canScrollForward}
                onClick={() => scrollByPage(1)}
              >
                <IconArrowRight size={22} />
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className={`et-artist-filter__track${expanded ? ' is-expanded' : ''}`}
        role="list"
        aria-label="Danh sách nghệ sĩ"
        onScroll={updateScrollState}
      >
        {options.map((artist) => {
          const isActive = artist.key === value;
          return (
            <button
              key={artist.key}
              type="button"
              className={`et-artist-card${isActive ? ' is-active' : ''}`}
              data-artist-id={String(artist.id)}
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => onChange(isActive ? '' : artist.key)}
            >
              <span
                className="et-artist-card__media"
                aria-hidden="true"
                style={{'--artist-focus': mediaFocusFor(artist.name)} as CSSProperties}
              >
                <span className="et-artist-card__initials">{initialsFor(artist.name)}</span>
                {artist.imageUrl && (
                  <img
                    src={artist.imageUrl}
                    alt=""
                    loading="lazy"
                    onError={(event) => { event.currentTarget.hidden = true; }}
                  />
                )}
              </span>
              <span className="et-artist-card__meta">
                <span className="et-artist-card__role">{artist.role || 'Nghệ sĩ biểu diễn'}</span>
                <strong>{artist.name}</strong>
                <span className="et-artist-card__count">{artist.eventCount ?? 0} sự kiện</span>
              </span>
            </button>
          );
        })}
        {!expanded && (
          <button
            type="button"
            className="et-artist-card et-artist-card--view-all"
            data-artist-id="all"
            disabled={disabled}
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            <span className="et-artist-card__media" aria-hidden="true">
              <span className="et-artist-card__view-all-icon"><IconArrowRight size={30} /></span>
            </span>
            <span className="et-artist-card__meta">
              <span className="et-artist-card__role">{options.length} nghệ sĩ</span>
              <strong>Xem tất cả nghệ sĩ</strong>
              <span className="et-artist-card__count">Mở toàn bộ danh sách</span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
