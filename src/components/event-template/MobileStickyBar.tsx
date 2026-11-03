import {useMemo} from 'react';
import type {PublicEventRecord, PublicTicketTier} from '../../services/eventService';
import {formatMoney} from './eventTemplateLogic.js';

type MobileStickyBarProps = {
  event: PublicEventRecord;
  tiers: PublicTicketTier[];
  saleStatus: string;
  onOpenSchedule?: () => void;
  hasSchedule?: boolean;
};

export function MobileStickyBar({
  event,
  tiers,
  saleStatus,
  onOpenSchedule,
  hasSchedule = false,
}: MobileStickyBarProps) {
  const minPrice = useMemo(() => {
    if (!tiers.length) return null;
    return Math.min(...tiers.map((t) => t.price));
  }, [tiers]);

  const isConcert = event.templateKey === 'SUPER_CONCERT_2026';
  const isSaleOpen = saleStatus === 'ON_SALE';
  const isCtaDisabled = !isConcert && !isSaleOpen;

  const handleCtaClick = () => {
    if (!isConcert && !isSaleOpen) return;
    const seatingEl = document.getElementById('seating-section');
    if (seatingEl) {
      seatingEl.scrollIntoView({behavior: 'smooth'});
    }
  };

  const ctaLabel = useMemo(() => {
    if (isConcert) {
      return isSaleOpen ? 'Chọn vé' : 'Xem sơ đồ';
    }
    if (saleStatus === 'UPCOMING') return 'Sắp mở bán';
    if (saleStatus === 'CLOSED') return 'Đã đóng bán';
    if (saleStatus === 'SOLD_OUT') return 'Hết vé';
    return 'Chọn chỗ & vé';
  }, [isConcert, isSaleOpen, saleStatus]);

  const ctaAriaLabel = useMemo(() => {
    if (isConcert) {
      if (saleStatus === 'ON_SALE') return 'Chọn vé và chuyển đến sơ đồ chỗ ngồi';
      if (saleStatus === 'UPCOMING') return 'Xem trước sơ đồ chỗ ngồi sự kiện';
      if (saleStatus === 'SOLD_OUT') return 'Xem sơ đồ chỗ ngồi sự kiện đã hết vé';
      if (saleStatus === 'CLOSED') return 'Xem thông tin và sơ đồ chỗ ngồi sự kiện đã đóng bán';
      return 'Xem sơ đồ chỗ ngồi';
    }
    if (saleStatus === 'UPCOMING') return 'Sự kiện sắp mở bán vé';
    if (saleStatus === 'CLOSED') return 'Thời gian bán vé đã kết thúc';
    if (saleStatus === 'SOLD_OUT') return 'Sự kiện đã bán hết vé';
    return 'Chuyển đến sơ đồ để chọn chỗ và vé';
  }, [isConcert, saleStatus]);

  const priceLabel = useMemo(() => {
    if (isConcert) {
      return saleStatus === 'CLOSED' ? 'Giá vé' : 'Bảng giá vé';
    }
    return saleStatus === 'CLOSED' ? 'Giá vé' : 'Giá từ';
  }, [isConcert, saleStatus]);

  return (
    <>
      <div className="et-mobile-sticky-spacer" aria-hidden="true" />
      <div className="et-mobile-sticky" role="region" aria-label="Thanh tác vụ đặt vé di động">
        <div className="et-mobile-price-group">
          <span className="et-mobile-price-label">
            {priceLabel}
          </span>
          <span className="et-mobile-price-val et-num">
            {minPrice !== null
              ? (isConcert ? `Từ ${formatMoney(minPrice)}` : formatMoney(minPrice))
              : 'Đang cập nhật'}
          </span>
        </div>

        <div className="et-mobile-actions-group">
          {(isConcert || hasSchedule) && onOpenSchedule && (
            <button
              type="button"
              onClick={onOpenSchedule}
              className="et-mobile-secondary-btn cursor-pointer"
              title="Xem lịch trình sự kiện"
              aria-label="Lịch trình sự kiện"
            >
              Lịch trình
            </button>
          )}

          <button
            type="button"
            disabled={isCtaDisabled}
            onClick={handleCtaClick}
            className="et-mobile-cta-btn"
            aria-label={ctaAriaLabel}
          >
            {isConcert && isSaleOpen && (
              <span
                className="et-live-dot"
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#34d399',
                  boxShadow: '0 0 8px #34d399',
                  marginRight: '6px',
                }}
              />
            )}
            <span>{ctaLabel}</span>
          </button>
        </div>
      </div>
    </>
  );
}
