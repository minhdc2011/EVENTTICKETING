import {useEffect} from 'react';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import {GlobalHeader} from './GlobalHeader';
import {useBuyerSession} from './useBuyerSession';
import './auth.css';

/** 404 for routes that match no page (unknown path, account/<unknown>, organizer/<unknown>). */
export function NotFoundPage() {
  const {session, signOut} = useBuyerSession();

  useEffect(() => {
    document.title = 'Không tìm thấy trang | EventTicketing';
  }, []);

  return (
    <div className="et-site et-auth-page">
      <GlobalHeader session={session} onSignOut={signOut} />
      <main className="et-auth__main">
        <section className="et-auth__card et-notfound" aria-labelledby="notfound-title">
          <p className="et-auth__kicker">Lỗi 404</p>
          <h1 id="notfound-title" className="et-auth__title">
            Không tìm thấy trang
          </h1>
          <p className="et-auth__sub">Địa chỉ bạn mở không tồn tại hoặc đã được di chuyển. Hãy quay lại danh mục sự kiện.</p>
          <a
            className="et-auth__btn et-auth__btn--primary et-auth__btn--block"
            href={buildPublicPath(window.location.pathname, 'events')}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              navigatePublicRoute('events');
            }}
          >
            Về danh mục sự kiện
          </a>
        </section>
      </main>
    </div>
  );
}
