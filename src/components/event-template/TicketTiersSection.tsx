import type {CSSProperties} from 'react';
import type {PublicTicketTier} from '../../services/eventService';
import {formatMoney, parseTierBenefits} from './eventTemplateLogic.js';

type TicketTiersSectionProps = {
  tiers: PublicTicketTier[];
  tierState: 'loading' | 'ready' | 'error';
  selectedTierId: number | null;
  onSelectTier: (tierId: number) => void;
  onRetry?: () => void;
  saleStatus: string;
};

export function TicketTiersSection({
  tiers,
  tierState,
  selectedTierId,
  onSelectTier,
  onRetry,
  saleStatus,
}: TicketTiersSectionProps) {
  const isSaleOpen = saleStatus === 'ON_SALE';

  return (
    <section id="tickets" className="et-content-section" aria-labelledby="tickets-heading">
      <div className="et-section-header">
        <span className="et-section-kicker">02 / HẠNG VÉ & GIÁ VÉ</span>
        <h2 id="tickets-heading" className="et-section-title">
          BẢNG GIÁ VÉ & QUYỀN LỢI
        </h2>
        <p className="et-section-desc">
          Lựa chọn phân khu phù hợp với trải nghiệm của bạn. Giá niêm yết đã bao gồm quyền vào cửa theo suất diễn đã chọn.
        </p>
      </div>

      {tierState === 'loading' && (
        <div className="et-box" style={{textAlign: 'center', padding: '40px 20px'}}>
          <p style={{color: '#94a3b8', fontSize: '14px', margin: 0}}>
            Đang đồng bộ danh sách hạng vé và tồn kho thời gian thực…
          </p>
        </div>
      )}

      {tierState === 'error' && (
        <div className="et-box" style={{textAlign: 'center', padding: '40px 20px'}}>
          <p style={{color: '#f87171', fontSize: '14px', marginBottom: '16px'}}>
            Không thể tải thông tin hạng vé lúc này.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="et-hero-secondary-cta"
              style={{cursor: 'pointer'}}
            >
              Thử tải lại
            </button>
          )}
        </div>
      )}

      {tierState === 'ready' && tiers.length === 0 && (
        <div className="et-box" style={{textAlign: 'center', padding: '40px 20px'}}>
          <p style={{color: '#94a3b8', fontSize: '14px', margin: 0}}>
            Hiện chưa có hạng vé nào được công bố cho suất diễn này. Vui lòng quay lại sau.
          </p>
        </div>
      )}

      {tierState === 'ready' && tiers.length > 0 && (
        <div className="et-tiers-grid" role="list" aria-label="Danh sách các hạng vé">
          {tiers.map((tier) => {
            const isSelected = selectedTierId === tier.id;
            const isSoldOut = tier.available <= 0;
            const benefits = parseTierBenefits(tier.description);
            const accentColor = tier.color || '#f59e0b';

            return (
              <div
                key={tier.id}
                role="listitem"
                className={`et-tier-card ${isSelected ? 'is-selected' : ''}`}
                style={{'--tier-accent': accentColor} as CSSProperties}
              >
                <div className="et-tier-accent-bar" aria-hidden="true" />

                <div>
                  <div className="et-tier-header">
                    <h3 className="et-tier-name">{tier.name}</h3>
                    <span
                      className={`et-tier-avail-badge ${
                        isSoldOut ? 'et-tier-avail-badge--soldout' : 'et-tier-avail-badge--ok'
                      }`}
                    >
                      {isSoldOut ? 'Hết vé' : `Còn ${tier.available}/${tier.capacity}`}
                    </span>
                  </div>

                  <div className="et-tier-price-row">
                    <span className="et-tier-price et-num">{formatMoney(tier.price)}</span>
                    <span className="et-tier-price-sub">/ vé</span>
                  </div>

                  {benefits.length > 0 && (
                    <ul className="et-tier-benefits" aria-label={`Quyền lợi của hạng vé ${tier.name}`}>
                      {benefits.map((benefit, index) => (
                        <li key={index} className="et-tier-benefit-item">
                          <span className="et-tier-benefit-icon" aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!isSaleOpen || isSoldOut}
                  onClick={() => {
                    if (isSaleOpen && !isSoldOut) {
                      onSelectTier(tier.id);
                    }
                  }}
                  className="et-tier-select-btn"
                  aria-pressed={isSelected}
                  aria-label={
                    isSoldOut
                      ? `Hạng vé ${tier.name} đã hết vé`
                      : isSelected
                      ? `Hạng vé ${tier.name} đang được chọn, giá ${formatMoney(tier.price)}`
                      : `Chọn hạng vé ${tier.name}, giá ${formatMoney(tier.price)}`
                  }
                >
                  {saleStatus === 'UPCOMING' ? (
                    'Sắp mở bán'
                  ) : saleStatus === 'CLOSED' ? (
                    'Đã đóng bán'
                  ) : isSoldOut ? (
                    'Đã hết vé'
                  ) : isSelected ? (
                    <>
                      <span>Đã chọn hạng vé</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </>
                  ) : (
                    'Chọn hạng vé này'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
