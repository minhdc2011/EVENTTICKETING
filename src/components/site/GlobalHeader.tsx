import type {MouseEvent, ReactNode} from 'react';
import {canAccessPortal} from '../../domain/accountAccess';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import type {BuyerSession} from '../../services/buyerAuthService';
import './site.css';

export type GlobalHeaderProps = {
  session: BuyerSession | null;
  onSignOut: () => void | Promise<void>;
  categories?: {key: string; label: string}[];
  activeCategory?: string;
  onCategorySelect?: (key: string) => void;
};

function routeHref(target: string): string {
  return buildPublicPath(window.location.pathname, target);
}

function handleRouteClick(event: MouseEvent<HTMLAnchorElement>, target: string) {
  if (event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  navigatePublicRoute(target);
}

function RouteLink({target, className, children, ...rest}: {
  target: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  title?: string;
}) {
  return (
    <a
      className={className}
      href={routeHref(target)}
      onClick={(event) => handleRouteClick(event, target)}
      {...rest}
    >
      {children}
    </a>
  );
}

export function GlobalHeader({
  session,
  onSignOut,
  categories,
  activeCategory,
  onCategorySelect,
}: GlobalHeaderProps) {
  const emailName = session ? session.email.split('@')[0] || session.email : '';

  return (
    <header className="et-site et-header">
      <div className="et-header__inner">
        <RouteLink target="events" className="et-header__brand" aria-label="EventTicketing – Trang chủ">
          EventTicketing
        </RouteLink>

        <nav className="et-header__nav" aria-label="Thể loại sự kiện">
          {categories && categories.length > 0 && (
            <ul className="et-header__cats">
              {categories.map((category) => (
                <li key={category.key}>
                  {onCategorySelect ? (
                    <button
                      type="button"
                      className="et-header__cat"
                      aria-pressed={activeCategory === category.key}
                      onClick={() => onCategorySelect(category.key)}
                    >
                      {category.label}
                    </button>
                  ) : (
                    <span
                      className="et-header__cat"
                      aria-current={activeCategory === category.key ? 'true' : undefined}
                    >
                      {category.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="et-header__actions">
          <RouteLink target="organizer" className="et-header__link">
            Dành cho BTC
          </RouteLink>
          {session && canAccessPortal(session.accountKind, 'BUYER') ? (
            <>
              <RouteLink target="account" className="et-header__link et-header__badge" title={session.email}>
                <span className="et-header__badge-text">{emailName}</span>
              </RouteLink>
              <button type="button" className="et-header__link et-header__signout" onClick={() => void onSignOut()}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <RouteLink target="register" className="et-header__link">
                Đăng ký
              </RouteLink>
              <RouteLink target="login" className="et-header__link">
                Đăng nhập
              </RouteLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
