import type {PublicEventRecord} from '../../services/eventService';
import {hasPolicyContent} from './eventTemplateLogic.js';

type EventPolicySectionProps = {
  event: PublicEventRecord;
};

export function EventPolicySection({event}: EventPolicySectionProps) {
  if (!hasPolicyContent(event)) return null;

  return (
    <section className="et-content-section" aria-labelledby="policy-heading">
      <div className="et-section-header">
        <span className="et-section-kicker">05 / QUY ĐỊNH & CHÍNH SÁCH</span>
        <h2 id="policy-heading" className="et-section-title">
          ĐIỀU KHOẢN THAM GIA
        </h2>
        <p className="et-section-desc">
          Các quy định của ban tổ chức nhằm bảo đảm quyền lợi và an toàn cho tất cả người tham gia.
        </p>
      </div>

      <div className="et-box">
        <div className="et-policy-list">
          {event.ageRestriction && (
            <div className="et-policy-item">
              <div className="et-policy-label">Quy định độ tuổi</div>
              <div className="et-policy-content">
                Độ tuổi tối thiểu tham gia sự kiện: <strong style={{color: '#fbbf24'}}>{event.ageRestriction}</strong>
              </div>
            </div>
          )}

          {event.refundPolicy && (
            <div className="et-policy-item">
              <div className="et-policy-label">Chính sách hoàn / hủy vé</div>
              <div className="et-policy-content">{event.refundPolicy}</div>
            </div>
          )}

          {event.termsAndConditions && (
            <div className="et-policy-item">
              <div className="et-policy-label">Quy định tham gia chi tiết</div>
              <div className="et-policy-content">{event.termsAndConditions}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
