import type {PublicEventRecord} from '../../services/eventService';
import {hasVenueContent} from './eventTemplateLogic.js';

type EventVenueSectionProps = {
  event: PublicEventRecord;
};

export function EventVenueSection({event}: EventVenueSectionProps) {
  if (!hasVenueContent(event)) return null;

  const isOnline = event.locationMode === 'ONLINE';
  const isHybrid = event.locationMode === 'HYBRID';
  const isTba = event.locationMode === 'TBA';

  return (
    <section className="et-content-section" aria-labelledby="venue-heading">
      <div className="et-section-header">
        <span className="et-section-kicker">03 / HÌNH THỨC & ĐỊA ĐIỂM</span>
        <h2 id="venue-heading" className="et-section-title">
          ĐỊA ĐIỂM & HƯỚNG DẪN THAM GIA
        </h2>
        <p className="et-section-desc">
          Thông tin chi tiết về địa điểm tổ chức hoặc hướng dẫn kết nối trực tuyến.
        </p>
      </div>

      <div className="et-box">
        <div className="et-venue-details">
          {isOnline && (
            <div className="et-online-box">
              <strong style={{color: '#6ee7b7', fontSize: '15px'}}>
                Sự kiện diễn ra trực tuyến (Online)
              </strong>
              {event.onlineLink && (
                <a
                  href={event.onlineLink}
                  target="_blank"
                  rel="noreferrer"
                  className="et-online-link-btn"
                >
                  Tham gia phòng trực tuyến ↗
                </a>
              )}
              {event.onlineInstructions && (
                <p style={{margin: '8px 0 0 0', color: '#cbd5e1', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-line'}}>
                  {event.onlineInstructions}
                </p>
              )}
            </div>
          )}

          {isHybrid && (
            <div>
              <div style={{marginBottom: '14px'}}>
                <span className="et-meta-label">Địa điểm tổ chức trực tiếp</span>
                <div style={{color: '#ffffff', fontSize: '16px', fontWeight: 700, marginTop: '2px'}}>
                  {event.venueName}
                </div>
                {event.address && (
                  <div style={{color: '#94a3b8', fontSize: '13px', marginTop: '2px'}}>
                    {event.address}
                  </div>
                )}
              </div>

              {(event.onlineLink || event.onlineInstructions) && (
                <div className="et-online-box" style={{marginTop: '12px'}}>
                  <strong style={{color: '#6ee7b7', fontSize: '14px'}}>
                    Đồng thời phát sóng trực tuyến
                  </strong>
                  {event.onlineLink && (
                    <a
                      href={event.onlineLink}
                      target="_blank"
                      rel="noreferrer"
                      className="et-online-link-btn"
                    >
                      Kênh tham gia trực tuyến ↗
                    </a>
                  )}
                  {event.onlineInstructions && (
                    <p style={{margin: '8px 0 0 0', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-line'}}>
                      {event.onlineInstructions}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {isTba && (
            <div style={{padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px'}}>
              <strong style={{color: '#fbbf24', fontSize: '15px'}}>Địa điểm sẽ thông báo sau (TBA)</strong>
              <p style={{margin: '6px 0 0 0', color: '#cbd5e1', fontSize: '13px'}}>
                Ban tổ chức đang hoàn thiện địa điểm và sẽ gửi thông báo chi tiết trước ngày diễn ra.
              </p>
            </div>
          )}

          {!isOnline && !isHybrid && !isTba && (
            <div>
              <span className="et-meta-label">Địa điểm diễn ra sự kiện</span>
              <div style={{color: '#ffffff', fontSize: '18px', fontWeight: 800, marginTop: '4px'}}>
                {event.venueName || 'Địa điểm tổ chức'}
              </div>
              {event.address && (
                <div style={{color: '#cbd5e1', fontSize: '14px', marginTop: '4px'}}>
                  {event.address}
                </div>
              )}
              {event.capacity > 0 && (
                <div style={{color: '#94a3b8', fontSize: '13px', marginTop: '8px'}}>
                  Quy mô sức chứa dự kiến: <strong style={{color: '#ffffff'}}>{event.capacity.toLocaleString('vi-VN')}</strong> chỗ
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
