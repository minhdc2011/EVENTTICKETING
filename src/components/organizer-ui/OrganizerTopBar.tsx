import type React from 'react';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import {IconArrowLeft} from './OrganizerIcons';

type OrganizerTopBarProps = {
  userEmail?: string;
  onSignOut?: () => Promise<void> | void;
};

export function OrganizerTopBar({userEmail, onSignOut}: OrganizerTopBarProps) {
  function handleGoToMarketplace(e: React.MouseEvent) {
    if (!e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigatePublicRoute('events');
    }
  }

  return (
    <header className="org-topbar organizer-topbar" role="banner">
      <div className="org-topbar-brand">
        <a
          className="org-topbar-logo marketplace-logo"
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={handleGoToMarketplace}
          aria-label="Về trang chủ EventTicketing"
        >
          EV<span>ENT</span>
        </a>
        <div className="org-topbar-badge" title="Môi trường quản lý Ban tổ chức">
          <span className="org-topbar-live-dot" />
          <span>STUDIO BAN TỔ CHỨC</span>
        </div>
      </div>

      <nav className="org-topbar-actions" aria-label="Điều hướng nhanh">
        <a
          className="org-topbar-back-link"
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={handleGoToMarketplace}
        >
          <IconArrowLeft size={16} />
          <span>Về trang bán vé</span>
        </a>

        {userEmail && onSignOut && (
          <button
            type="button"
            className="org-btn org-btn-secondary"
            onClick={onSignOut}
            style={{minHeight: '36px', padding: '0 12px', fontSize: '12px'}}
            title={`Đang đăng nhập: ${userEmail}`}
          >
            Đăng xuất
          </button>
        )}
      </nav>
    </header>
  );
}
