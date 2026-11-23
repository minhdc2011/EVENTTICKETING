import {useEffect, useState} from 'react';
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

type BtcAccount = {email: string};

/** Tài khoản Ban tổ chức đang đăng nhập (cổng riêng với người mua) để header hiện đúng trạng thái. */
function useBtcAccount(): BtcAccount | null {
  const [account, setAccount] = useState<BtcAccount | null>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import('../../services/organizerService').then(({subscribeOrganizerAuth}) => {
      if (cancelled) return;
      stop = subscribeOrganizerAuth((next) => setAccount(next ? {email: next.email} : null));
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return account;
}

async function signOutBtc() {
  const {signOutOrganizer} = await import('../../services/organizerService');
  await signOutOrganizer();
  navigatePublicRoute('events');
}

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
  const isBuyer = Boolean(session && canAccessPortal(session.accountKind, 'BUYER'));
  const btcAccount = useBtcAccount();
  const btcName = btcAccount ? btcAccount.email.split('@')[0] || btcAccount.email : '';

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
          {isBuyer ? (
            <>
              <RouteLink target="account" className="et-header__link et-header__badge" title={session.email}>
                <span className="et-header__badge-text">{emailName}</span>
              </RouteLink>
              <button type="button" className="et-header__link et-header__signout" onClick={() => void onSignOut()}>
                Đăng xuất
              </button>
            </>
          ) : btcAccount ? (
            <>
              <RouteLink target="organizer" className="et-header__link et-header__badge" title={`${btcAccount.email} (Ban tổ chức)`}>
                <span className="et-header__badge-text">{btcName} · BTC</span>
              </RouteLink>
              <button
                type="button"
                className="et-header__link et-header__signout"
                onClick={() => void signOutBtc()}
              >
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
