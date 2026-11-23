import {useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent} from 'react';
import {DEMO_BUYER} from '../../config/demoAccounts';
import {runtimeConfig} from '../../config/runtime';
import {EVENT_CAN_DANG_NHAP, phatDaDangNhap} from '../../domain/loginRequired.js';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import type {PublicEventRecord} from '../../services/eventService';
import {signInBuyer} from '../../services/buyerAuthService';
import {BUYER_RETURN_TO_KEY, buildEventReturnTarget} from '../event-template/PurchaseAccessGate';
import './LoginRequiredHost.css';

/**
 * Hộp thoại toàn trang "Cần đăng nhập để giữ ghế". Hiện khi một thao tác giữ ghế (React hoặc Super Concert) báo cần đăng nhập
 * (sự kiện EVENT_CAN_DANG_NHAP). Nền phía sau được làm mờ. Đăng nhập nhanh (chế độ demo) đăng nhập tại chỗ rồi phát
 * EVENT_DA_DANG_NHAP để nơi đang chờ tự tiếp tục thao tác; đăng nhập thường chuyển sang trang đăng nhập và quay lại đúng sự kiện.
 */
export function LoginRequiredHost({event}: {event: PublicEventRecord}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onRequest = () => {
      lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setError('');
      setOpen(true);
    };
    window.addEventListener(EVENT_CAN_DANG_NHAP, onRequest);
    return () => window.removeEventListener(EVENT_CAN_DANG_NHAP, onRequest);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      lastFocusRef.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
    const items: HTMLElement[] = nodes ? Array.from(nodes) : [];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const quickLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signInBuyer(DEMO_BUYER.email, DEMO_BUYER.password);
      setOpen(false);
      phatDaDangNhap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập nhanh bằng tài khoản demo.');
    } finally {
      setBusy(false);
    }
  };

  const goAuth = (page: 'login' | 'register') => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    try {
      window.sessionStorage.setItem(BUYER_RETURN_TO_KEY, buildEventReturnTarget(event));
    } catch {
      // sessionStorage bị chặn: sau đăng nhập quay về danh sách sự kiện.
    }
    setOpen(false);
    navigatePublicRoute(page);
  };
  const authHref = (page: 'login' | 'register') => buildPublicPath(window.location.pathname, page);

  if (!open) return null;
  return (
    <div
      className="et-login-modal"
      role="presentation"
      data-testid="hop-thoai-can-dang-nhap"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={cardRef}
        className="et-login-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="et-login-modal-title"
        aria-describedby="et-login-modal-desc"
      >
        <h2 id="et-login-modal-title" className="et-login-modal__title">
          Cần đăng nhập để giữ ghế
        </h2>
        <p id="et-login-modal-desc" className="et-login-modal__text">
          Bạn cần đăng nhập tài khoản người mua để giữ ghế hoặc vé. Lựa chọn hiện tại được giữ lại, đăng nhập xong bạn tiếp tục
          từ chỗ đang dừng.
        </p>
        {error ? (
          <p className="et-login-modal__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="et-login-modal__actions">
          {runtimeConfig.demoQuickLogin ? (
            <button type="button" className="et-login-modal__btn et-login-modal__btn--primary" onClick={() => void quickLogin()} disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập nhanh: Người dùng demo'}
            </button>
          ) : null}
          <div className="et-login-modal__row">
            <a
              className={`et-login-modal__btn${runtimeConfig.demoQuickLogin ? '' : ' et-login-modal__btn--primary'}`}
              href={authHref('login')}
              onClick={goAuth('login')}
            >
              Đăng nhập
            </a>
            <a className="et-login-modal__btn" href={authHref('register')} onClick={goAuth('register')}>
              Đăng ký
            </a>
            <button type="button" className="et-login-modal__btn et-login-modal__btn--quiet" onClick={close} disabled={busy}>
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
