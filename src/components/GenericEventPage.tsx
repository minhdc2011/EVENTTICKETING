import {useEffect,useMemo,useState, type CSSProperties} from 'react';
import type * as React from 'react';
import {buildPublicPath, navigatePublicRoute} from '../domain/publicRoute';
import {loadPublicTicketTiers,type PublicEventRecord,type PublicTicketTier} from '../services/eventService';
import {ShowSwitcher} from './EventCatalog';

const money=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});
const date=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});

const onSpaNav = (target: string) => (e: React.MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

export function GenericEventPage({event}: {event: PublicEventRecord}) {
  const [tiers, setTiers] = useState<PublicTicketTier[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    document.title = `${event.name} | EventTicketing`;
    setState('loading');
    loadPublicTicketTiers(event)
      .then((rows) => {
        setTiers(rows);
        setState('ready');
      })
      .catch((error) => {
        console.error(error);
        setState('error');
      });
  }, [event]);

  const minPrice = useMemo(() => (tiers.length ? Math.min(...tiers.map((t) => t.price)) : 0), [tiers]);
  const isPreview = event.publicationStatus !== 'CONG_KHAI';

  return (
    <div className="generic-event-shell">
      {isPreview && (
        <aside className="preview-banner" role="status">
          <div className="preview-banner-text">
            <span className="preview-banner-badge">CHẾ ĐỘ XEM TRƯỚC</span>
            <span>Bản nháp sự kiện chưa công bố. Chỉ Ban tổ chức mới có thể xem trang này.</span>
          </div>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
            className="preview-banner-btn"
          >
            ← Quay lại Studio BTC
          </a>
        </aside>
      )}

      <header className="generic-event-nav">
        <a
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={onSpaNav('events')}
          className="marketplace-logo"
        >
          EV<span>ENT</span>
        </a>
        <nav>
          <a href={buildPublicPath(window.location.pathname, 'events')} onClick={onSpaNav('events')}>
            Tất cả sự kiện
          </a>
          <a href={buildPublicPath(window.location.pathname, 'organizer')} onClick={onSpaNav('organizer')}>
            Dành cho BTC
          </a>
        </nav>
      </header>

      <section
        className="generic-event-hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(5,8,9,.98),rgba(5,8,9,.65),rgba(5,8,9,.25)),url(${
            event.bannerUrl || event.posterUrl || ''
          })`,
        }}
      >
        <div>
          <p>
            {event.category.replaceAll('_', ' ')} · {event.shows.length} SUẤT DIỄN
          </p>
          <h1>{event.name}</h1>
          <span>{event.slogan}</span>
          <a href="#tickets">Xem hạng vé ↓</a>
        </div>
      </section>

      <ShowSwitcher event={event} />

      <main className="generic-event-main">
        <article>
          <p className="generic-kicker">GIỚI THIỆU</p>
          <h2>
            Một sự kiện.
            <br />
            Nhiều trải nghiệm.
          </h2>
          <p style={{whiteSpace: 'pre-line'}}>
            {event.description || 'Thông tin chi tiết đang được Ban tổ chức cập nhật.'}
          </p>

          <div className="generic-event-meta">
            <div>
              <span>Thời gian</span>
              <strong>{date.format(new Date(event.selectedShow.startsAt))}</strong>
            </div>
            <div>
              <span>Hình thức & Địa điểm</span>
              {event.locationMode === 'ONLINE' ? (
                <>
                  <strong>Trực tuyến (Online)</strong>
                  {event.onlineLink && (
                    <small>
                      <a href={event.onlineLink} target="_blank" rel="noreferrer" style={{color: '#84cc16'}}>
                        Đường dẫn tham gia trực tuyến ↗
                      </a>
                    </small>
                  )}
                </>
              ) : event.locationMode === 'HYBRID' ? (
                <>
                  <strong>{event.venueName} (Kết hợp Online)</strong>
                  <small>{event.address}</small>
                </>
              ) : event.locationMode === 'TBA' ? (
                <strong>Sẽ thông báo sau (TBA)</strong>
              ) : (
                <>
                  <strong>{event.venueName}</strong>
                  <small>{event.address}</small>
                </>
              )}
            </div>
          </div>

          {event.onlineInstructions && (
            <div className="generic-section-box">
              <p className="generic-kicker">HƯỚNG DẪN TRỰC TUYẾN</p>
              <p style={{whiteSpace: 'pre-line'}}>{event.onlineInstructions}</p>
            </div>
          )}

          {event.seatingMapUrl && (
            <div className="generic-section-box">
              <p className="generic-kicker">SƠ ĐỒ KHÁN ĐÀI / PHÂN KHU</p>
              <img
                src={event.seatingMapUrl}
                alt={`Sơ đồ phân khu ${event.name}`}
                className="generic-seating-img"
                style={{maxWidth: '100%', maxHeight: '420px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)'}}
              />
            </div>
          )}

          {event.trailerUrl && (
            <div className="generic-section-box">
              <p className="generic-kicker">VIDEO TRAILER</p>
              <a
                href={event.trailerUrl}
                target="_blank"
                rel="noreferrer"
                className="organizer-primary"
                style={{display: 'inline-block', textDecoration: 'none', padding: '10px 18px', width: 'auto'}}
              >
                ▶ Xem trailer giới thiệu trên YouTube ↗
              </a>
            </div>
          )}

          {(event.ageRestriction || event.refundPolicy || event.termsAndConditions) && (
            <div className="generic-section-box">
              <p className="generic-kicker">QUY ĐỊNH & CHÍNH SÁCH</p>
              {event.ageRestriction && (
                <div style={{marginBottom: '10px'}}>
                  <span style={{color: '#94a3b8', fontSize: '13px'}}>Quy định độ tuổi: </span>
                  <strong style={{color: '#fff'}}>{event.ageRestriction}</strong>
                </div>
              )}
              {event.refundPolicy && (
                <div style={{marginBottom: '10px'}}>
                  <span style={{color: '#94a3b8', fontSize: '13px'}}>Chính sách hoàn / hủy vé:</span>
                  <p style={{margin: '4px 0', color: '#cbd5e1', fontSize: '14px', whiteSpace: 'pre-line'}}>
                    {event.refundPolicy}
                  </p>
                </div>
              )}
              {event.termsAndConditions && (
                <div>
                  <span style={{color: '#94a3b8', fontSize: '13px'}}>Quy định tham gia:</span>
                  <p style={{margin: '4px 0', color: '#cbd5e1', fontSize: '14px', whiteSpace: 'pre-line'}}>
                    {event.termsAndConditions}
                  </p>
                </div>
              )}
            </div>
          )}

          {(event.contactEmail || event.contactHotline || event.fanpageUrl || event.permitNumber) && (
            <div className="generic-section-box">
              <p className="generic-kicker">HỖ TRỢ & LIÊN HỆ BAN TỔ CHỨC</p>
              <div className="generic-contact-grid" style={{display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '14px'}}>
                {event.contactEmail && (
                  <div>
                    <span style={{color: '#94a3b8'}}>Email: </span>
                    <a href={`mailto:${event.contactEmail}`} style={{color: '#84cc16'}}>
                      {event.contactEmail}
                    </a>
                  </div>
                )}
                {event.contactHotline && (
                  <div>
                    <span style={{color: '#94a3b8'}}>Hotline: </span>
                    <a href={`tel:${event.contactHotline}`} style={{color: '#84cc16'}}>
                      {event.contactHotline}
                    </a>
                  </div>
                )}
                {event.fanpageUrl && (
                  <div>
                    <span style={{color: '#94a3b8'}}>Kênh thông tin: </span>
                    <a href={event.fanpageUrl} target="_blank" rel="noreferrer" style={{color: '#84cc16'}}>
                      Website / Fanpage ↗
                    </a>
                  </div>
                )}
              </div>
              {event.permitNumber && (
                <div style={{marginTop: '12px', fontSize: '12px', color: '#64748b'}}>
                  Giấy phép biểu diễn / Văn bản chấp thuận: {event.permitNumber}
                </div>
              )}
            </div>
          )}
        </article>

        <aside id="tickets" className="generic-ticket-panel">
          <div>
            <p>HẠNG VÉ · {event.selectedShow.name}</p>
            <h2>Chọn hạng vé</h2>
          </div>
          {state === 'loading' && <p className="generic-ticket-state">Đang tải tồn kho…</p>}
          {state === 'error' && <p className="generic-ticket-state">Không thể tải hạng vé.</p>}
          {state === 'ready' &&
            tiers.map((tier) => (
              <div className="generic-ticket-tier" key={tier.id} style={{'--tier': tier.color} as CSSProperties}>
                <span></span>
                <div>
                  <h3>{tier.name}</h3>
                  <p>{tier.description}</p>
                  <small>
                    Còn {tier.available}/{tier.capacity} vé
                  </small>
                </div>
                <strong>{money.format(tier.price)}</strong>
              </div>
            ))}
          <button disabled>Chọn vé trên sơ đồ · Sắp triển khai</button>
          <small>Thanh toán chưa được bật trong Product Foundation MVP.</small>
        </aside>
      </main>

      <div className="generic-sticky">
        <span>
          Giá từ <strong>{minPrice ? money.format(minPrice) : 'Đang cập nhật'}</strong>
        </span>
        <a href="#tickets">Chọn vé</a>
      </div>
    </div>
  );
}
