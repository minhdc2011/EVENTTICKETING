import type {PublicEventRecord} from '../../services/eventService';
import {hasMediaContent} from './eventTemplateLogic.js';

type EventMediaSectionProps = {
  event: PublicEventRecord;
};

export function EventMediaSection({event}: EventMediaSectionProps) {
  if (!hasMediaContent(event)) return null;

  return (
    <section className="et-content-section" aria-labelledby="media-heading">
      <div className="et-section-header">
        <span className="et-section-kicker">04 / SƠ ĐỒ & TRAILER</span>
        <h2 id="media-heading" className="et-section-title">
          HÌNH ẢNH & SƠ ĐỒ PHÂN KHU
        </h2>
        <p className="et-section-desc">
          Xem sơ đồ bố trí khán đài hoặc video giới thiệu chính thức từ ban tổ chức.
        </p>
      </div>

      <div className="et-box">
        <div className="et-media-grid">
          {event.seatingMapUrl && (
            <div className="et-media-card">
              <span className="et-media-card-title">Sơ đồ phân khu khán đài</span>
              <img
                src={event.seatingMapUrl}
                alt={`Sơ đồ phân khu khán đài của ${event.name}`}
                className="et-seating-img"
                loading="lazy"
              />
            </div>
          )}

          {event.trailerUrl && (
            <div className="et-media-card">
              <span className="et-media-card-title">Video Trailer chính thức</span>
              <p style={{margin: '0 0 12px 0', color: '#cbd5e1', fontSize: '14px', lineHeight: 1.6}}>
                Xem những khoảnh khắc và giới thiệu chi tiết về sự kiện trên kênh truyền thông chính thức:
              </p>
              <a
                href={event.trailerUrl}
                target="_blank"
                rel="noreferrer"
                className="et-trailer-link-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Xem video trailer trên YouTube</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
