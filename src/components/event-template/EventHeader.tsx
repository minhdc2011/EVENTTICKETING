import type * as React from 'react';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import type {PublicEventRecord} from '../../services/eventService';
import {GlobalHeader} from '../site/GlobalHeader';
import {useBuyerSession} from '../site/useBuyerSession';

const onSpaNav = (target: string) => (e: React.MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

type EventHeaderProps = {
  event: PublicEventRecord;
};

export function EventHeader({event}: EventHeaderProps) {
  const isPreview = event.publicationStatus !== 'CONG_KHAI';
  const {session, signOut} = useBuyerSession();

  return (
    <>
      {isPreview && (
        <aside className="et-preview-banner" role="status" aria-label="Thông báo chế độ xem trước">
          <div className="et-preview-banner-text">
            <span className="et-preview-badge">CHẾ ĐỘ XEM TRƯỚC</span>
            <span>Bản nháp sự kiện chưa công bố. Chỉ Ban tổ chức mới có thể xem trang này.</span>
          </div>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
            className="et-preview-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Quay lại Studio BTC</span>
          </a>
        </aside>
      )}

      <GlobalHeader session={session} onSignOut={signOut} />
    </>
  );
}
