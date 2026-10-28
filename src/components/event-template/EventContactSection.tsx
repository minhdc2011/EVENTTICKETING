import type {PublicEventRecord} from '../../services/eventService';
import {hasContactContent} from './eventTemplateLogic.js';

type EventContactSectionProps = {
  event: PublicEventRecord;
};

export function EventContactSection({event}: EventContactSectionProps) {
  if (!hasContactContent(event)) return null;

  return (
    <section className="et-content-section" aria-labelledby="contact-heading">
      <div className="et-section-header">
        <span className="et-section-kicker">06 / LIÊN HỆ & BẢN QUYỀN</span>
        <h2 id="contact-heading" className="et-section-title">
          BAN TỔ CHỨC & HỖ TRỢ
        </h2>
        <p className="et-section-desc">
          Kênh hỗ trợ chính thức dành cho người mua vé và các thông tin pháp lý của sự kiện.
        </p>
      </div>

      <div className="et-box">
        <div className="et-contact-grid">
          {event.contactEmail && (
            <a
              href={`mailto:${event.contactEmail}`}
              className="et-contact-chip"
              aria-label={`Email hỗ trợ: ${event.contactEmail}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>Email:</span>
              <span className="et-contact-chip-accent">{event.contactEmail}</span>
            </a>
          )}

          {event.contactHotline && (
            <a
              href={`tel:${event.contactHotline}`}
              className="et-contact-chip"
              aria-label={`Hotline hỗ trợ: ${event.contactHotline}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Hotline:</span>
              <span className="et-contact-chip-accent">{event.contactHotline}</span>
            </a>
          )}

          {event.fanpageUrl && (
            <a
              href={event.fanpageUrl}
              target="_blank"
              rel="noreferrer"
              className="et-contact-chip"
              aria-label="Kênh truyền thông hoặc Fanpage của sự kiện"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>Kênh thông tin:</span>
              <span className="et-contact-chip-accent">Website / Fanpage ↗</span>
            </a>
          )}
        </div>

        {event.permitNumber && (
          <div className="et-permit-note">
            Giấy phép biểu diễn / Văn bản chấp thuận tổ chức số: <strong>{event.permitNumber}</strong>
          </div>
        )}
      </div>
    </section>
  );
}
