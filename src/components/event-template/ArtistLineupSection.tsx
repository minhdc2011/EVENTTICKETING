import {useCallback, useEffect, useState} from 'react';
import {loadPublicArtists, type PublicArtistRecord} from '../../services/artistService';
import type {PublicEventRecord} from '../../services/eventService';
import './ArtistLineupSection.css';

export type ArtistLineupSectionProps = {
  event?: Partial<PublicEventRecord> | null;
  artists?: PublicArtistRecord[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function ArtistLineupSection({
  event,
  artists: propArtists,
  isLoading: propIsLoading,
  error: propError,
  onRetry: propOnRetry,
}: ArtistLineupSectionProps) {
  const [internalArtists, setInternalArtists] = useState<PublicArtistRecord[]>([]);
  const [internalStatus, setInternalStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const fetchArtists = useCallback(() => {
    if (propArtists !== undefined) return;
    setInternalStatus('loading');
    loadPublicArtists(event)
      .then((items) => {
        setInternalArtists(items);
        setInternalStatus('ready');
      })
      .catch((err) => {
        console.error('Không thể tải dàn nghệ sĩ khách mời:', err);
        setInternalStatus('error');
      });
  }, [event, propArtists]);

  useEffect(() => {
    if (propArtists === undefined) {
      fetchArtists();
    }
  }, [fetchArtists, propArtists]);

  // Derive active view state from props or internal loading lifecycle
  const isLoading = propIsLoading ?? (propArtists === undefined && (internalStatus === 'idle' || internalStatus === 'loading'));
  const hasError = propError !== undefined ? Boolean(propError) : internalStatus === 'error';
  const displayedArtists = propArtists ?? internalArtists;
  const handleRetry = propOnRetry ?? fetchArtists;

  // 1. Loading state: compact, honest, non-layout-shifting
  if (isLoading) {
    return (
      <section
        id="artist-lineup"
        aria-label="Đang tải dàn nghệ sĩ khách mời"
        className="scroll-focus-section section-dimmed py-8 border-b border-white/[0.085] et-artist-lineup-section"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 et-artist-state-shell">
          <div className="et-artist-loading-pill" role="status">
            <span className="et-artist-loading-dot" aria-hidden="true" />
            <span>Đang tải thông tin dàn nghệ sĩ khách mời…</span>
          </div>
        </div>
      </section>
    );
  }

  // 2. Error state: does not break the event page, offers optional retry
  if (hasError) {
    return (
      <section
        id="artist-lineup"
        aria-label="Thông báo tải dàn nghệ sĩ"
        className="scroll-focus-section section-dimmed py-8 border-b border-white/[0.085] et-artist-lineup-section"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 et-artist-state-shell">
          <div className="et-artist-error-box" role="alert">
            <span>{propError || 'Không thể tải thông tin dàn nghệ sĩ lúc này.'}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="et-artist-retry-btn"
            >
              Thử lại
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 3. Empty state: collapse the optional section completely (no empty shell)
  if (!displayedArtists || displayedArtists.length === 0) {
    return null;
  }

  // 4. Data-driven React lineup grid
  return (
    <section
      id="artist-lineup"
      aria-labelledby="artist-lineup-heading"
      className="scroll-focus-section section-dimmed py-12 border-b border-white/[0.085] et-artist-lineup-section"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="editorial-heading mb-8 flex items-end justify-between gap-4">
          <div>
            <span className="editorial-kicker">Live performance</span>
            <h2
              id="artist-lineup-heading"
              className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white mt-2"
            >
              DÀN NGHỆ SĨ KHÁCH MỜI
            </h2>
          </div>
          <span className="section-number hidden sm:block">01 / 03</span>
        </div>

        {/* Responsive Artist Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {displayedArtists.map((artist) => (
            <div
              key={artist.id}
              className="group relative rounded-2xl overflow-hidden liquid-glass hover:scale-[1.02] transition-all duration-300 et-artist-card focus-within:ring-2 focus-within:ring-amber-400"
            >
              <div className="aspect-square w-full overflow-hidden bg-slate-900 relative et-artist-image-container">
                {artist.imageUrl ? (
                  <img
                    src={artist.imageUrl}
                    alt={artist.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 et-artist-image"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400 font-display font-bold text-xl select-none">
                    {artist.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-transparent to-transparent pointer-events-none"
                  aria-hidden="true"
                />
              </div>
              <div className="p-3 text-center">
                <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition font-display et-artist-card-name">
                  {artist.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{artist.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export {ArtistLineupSection as ArtistLineup};
