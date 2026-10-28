import {useEffect, useMemo, useState} from 'react';
import type {PublicEventRecord} from '../../services/eventService';
import {
  calculateCountdown,
  determineCountdownTarget,
  formatEventDateTime,
} from './eventTemplateLogic.js';

type EventCountdownProps = {
  event: PublicEventRecord;
  saleStatus: string;
};

export function EventCountdown({event, saleStatus}: EventCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const {targetIso, heading, description, isActive} = useMemo(() => {
    return determineCountdownTarget(event, saleStatus, now);
  }, [event, saleStatus, now]);

  const countdown = useMemo(() => {
    return calculateCountdown(targetIso, now);
  }, [targetIso, now]);

  return (
    <div
      className="et-countdown-card"
      role="region"
      aria-label="Đồng hồ đếm ngược sự kiện"
    >
      <div className="et-countdown-hairline" aria-hidden="true" />

      <div className="et-countdown-header">
        <div className="et-countdown-status-indicator">
          <span
            className="et-live-dot"
            style={{
              backgroundColor: isActive ? '#fbbf24' : '#94a3b8',
              boxShadow: isActive ? '0 0 10px #fbbf24' : 'none',
              animation: isActive ? undefined : 'none',
            }}
          />
          <span>{isActive ? 'Thời Gian Trực Tiếp' : 'Trạng Thái'}</span>
        </div>
        <h2 className="et-countdown-heading">{heading}</h2>
        <p className="et-countdown-desc">{description}</p>
      </div>

      {isActive && !countdown.isPast ? (
        <>
          <div className="et-countdown-grid" aria-hidden="true">
            <div className="et-countdown-unit">
              <span className="et-countdown-val et-num">{countdown.formatted.days}</span>
              <span className="et-countdown-lbl">NGÀY</span>
            </div>
            <div className="et-countdown-unit">
              <span className="et-countdown-val et-num">{countdown.formatted.hours}</span>
              <span className="et-countdown-lbl">GIỜ</span>
            </div>
            <div className="et-countdown-unit">
              <span className="et-countdown-val et-num">{countdown.formatted.minutes}</span>
              <span className="et-countdown-lbl">PHÚT</span>
            </div>
            <div className="et-countdown-unit">
              <span className="et-countdown-val et-num">{countdown.formatted.seconds}</span>
              <span className="et-countdown-lbl">GIÂY</span>
            </div>
          </div>
          <p className="sr-only">
            {heading}: {description}. Thời gian dự kiến: {formatEventDateTime(targetIso)}.
          </p>
        </>
      ) : (
        <div
          className="et-countdown-unit"
          style={{padding: '16px', textAlign: 'center', marginBottom: '16px'}}
        >
          <span style={{color: '#94a3b8', fontSize: '13px'}}>
            {saleStatus === 'CLOSED'
              ? 'Sự kiện đã hoàn tất diễn ra'
              : 'Theo dõi các thông báo mở bán tiếp theo'}
          </span>
        </div>
      )}
    </div>
  );
}
