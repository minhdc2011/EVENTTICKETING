import {useEffect, useState, type FormEvent, type MouseEvent} from 'react';
import {buildPublicPath, navigatePublicRoute} from '../domain/publicRoute';
import {
  getBuyerSession,
  signInBuyer,
  signOutBuyer,
  signUpBuyer,
  subscribeBuyerAuth,
  type BuyerSession,
} from '../services/buyerAuthService';

const onSpaNav = (target: string) => (e: MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

export function BuyerAuth({page}: {page?: string}) {
  const [session, setSession] = useState<BuyerSession | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>(page === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{type: 'error' | 'success'; text: string} | null>(null);

  useEffect(() => {
    document.title =
      mode === 'register'
        ? 'Đăng ký tài khoản người mua vé | EventTicketing'
        : 'Đăng nhập tài khoản người mua vé | EventTicketing';
  }, [mode]);

  useEffect(() => {
    if (page === 'register') setMode('register');
    if (page === 'login') setMode('login');
  }, [page]);

  useEffect(() => {
    void getBuyerSession().then(setSession);
    const unsub = subscribeBuyerAuth(setSession);
    return unsub;
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    if (mode === 'register' && password !== confirmPassword) {
      setMessage({type: 'error', text: 'Mật khẩu xác nhận không khớp.'});
      return;
    }

    if (password.length < 6) {
      setMessage({type: 'error', text: 'Mật khẩu phải có tối thiểu 6 ký tự.'});
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const nextSession = await signInBuyer(email, password);
        setSession(nextSession);
        setMessage({type: 'success', text: 'Đăng nhập thành công!'});
        setTimeout(() => navigatePublicRoute('events'), 600);
      } else {
        const result = await signUpBuyer(email, password, fullName);
        if (result.session) {
          setSession(result.session);
          setMessage({type: 'success', text: 'Đăng ký tài khoản thành công! Đang chuyển hướng…'});
          setTimeout(() => navigatePublicRoute('events'), 800);
        } else if (result.requiresEmailConfirmation) {
          setMessage({
            type: 'success',
            text: 'Tài khoản đã được tạo! Vui lòng kiểm tra hộp thư email để kích hoạt tài khoản trước khi đăng nhập.',
          });
          setMode('login');
        } else {
          setMessage({type: 'success', text: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.'});
          setMode('login');
        }
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể xác thực. Vui lòng thử lại.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutBuyer();
      setSession(null);
      setMessage({type: 'success', text: 'Đã đăng xuất thành công.'});
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể đăng xuất.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketplace-shell">
      <header className="marketplace-nav">
        <a
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={onSpaNav('events')}
          className="marketplace-logo"
        >
          EV<span>ENT</span>
        </a>
        <nav>
          <a
            href={buildPublicPath(window.location.pathname, 'events')}
            onClick={onSpaNav('events')}
            className="marketplace-nav-link"
          >
            ← Khám phá sự kiện
          </a>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
            className="marketplace-organizer-link"
          >
            Dành cho BTC →
          </a>
        </nav>
      </header>

      <main className="buyer-auth-shell">
        <div className="buyer-auth-card">
          {session ? (
            <div>
              <p className="generic-kicker">TÀI KHOẢN KHÁN GIẢ</p>
              <h1>Tài khoản của bạn</h1>
              <p className="buyer-auth-sub">
                {session.accountKind === 'ORGANIZER'
                  ? 'Bạn đang đăng nhập với tài khoản Ban tổ chức (có thể mua vé sự kiện).'
                  : 'Bạn đang đăng nhập với tư cách người mua vé (Khán giả).'}
              </p>

              <div className="buyer-auth-profile-box">
                <div className="buyer-auth-profile-row">
                  <span>Email:</span>
                  <strong>{session.email}</strong>
                </div>
                {session.fullName && (
                  <div className="buyer-auth-profile-row">
                    <span>Họ và tên:</span>
                    <strong>{session.fullName}</strong>
                  </div>
                )}
                <div className="buyer-auth-profile-row">
                  <span>Loại tài khoản:</span>
                  <strong style={{color: '#86efac'}}>
                    {session.accountKind === 'ORGANIZER'
                      ? 'Ban tổ chức (được phép mua vé)'
                      : session.accountKind === 'ADMIN'
                      ? 'Quản trị viên'
                      : 'Khán giả / Người mua vé'}
                  </strong>
                </div>
                <div className="buyer-auth-profile-row">
                  <span>Trạng thái:</span>
                  <strong style={{color: '#22c55e'}}>● Đang hoạt động</strong>
                </div>
              </div>

              {message && (
                <div className={`buyer-auth-message buyer-auth-message--${message.type}`}>
                  {message.text}
                </div>
              )}

              <button
                type="button"
                className="buyer-auth-submit"
                onClick={() => navigatePublicRoute('events')}
              >
                Khám phá sự kiện ngay →
              </button>

              <div style={{marginTop: '12px'}}>
                <button
                  type="button"
                  className="marketplace-logout"
                  style={{width: '100%', minHeight: '40px'}}
                  onClick={handleSignOut}
                  disabled={busy}
                >
                  {busy ? 'Đang xử lý…' : 'Đăng xuất tài khoản'}
                </button>
              </div>

              <div className="buyer-auth-organizer-box">
                <span>Bạn là Ban tổ chức sự kiện?</span>
                <a
                  href={buildPublicPath(window.location.pathname, 'organizer')}
                  onClick={onSpaNav('organizer')}
                >
                  Mở Studio BTC →
                </a>
              </div>
            </div>
          ) : (
            <div>
              <div className="buyer-auth-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'is-active' : ''}
                  onClick={() => {
                    setMode('login');
                    setMessage(null);
                  }}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  className={mode === 'register' ? 'is-active' : ''}
                  onClick={() => {
                    setMode('register');
                    setMessage(null);
                  }}
                >
                  Đăng ký
                </button>
              </div>

              <p className="generic-kicker">EVENTTICKETING · KHÁN GIẢ</p>
              <h1>{mode === 'login' ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản'}</h1>
              <p className="buyer-auth-sub">
                {mode === 'login'
                  ? 'Đăng nhập để xem lịch sử vé và hoàn tất các bước đặt vé nhanh chóng.'
                  : 'Tạo tài khoản người mua vé để quản lý các vé sự kiện đã đặt.'}
              </p>

              <form onSubmit={handleSubmit} style={{marginTop: '20px'}}>
                {mode === 'register' && (
                  <label>
                    Họ và tên (không bắt buộc)
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      autoComplete="name"
                    />
                  </label>
                )}

                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ban@vidu.com"
                    required
                    autoComplete="email"
                  />
                </label>

                <label>
                  Mật khẩu
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </label>

                {mode === 'register' && (
                  <label>
                    Xác nhận mật khẩu
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </label>
                )}

                {message && (
                  <div className={`buyer-auth-message buyer-auth-message--${message.type}`} role="status">
                    {message.text}
                  </div>
                )}

                <button type="submit" className="buyer-auth-submit" disabled={busy}>
                  {busy
                    ? 'Đang xử lý…'
                    : mode === 'login'
                    ? 'Đăng nhập'
                    : 'Đăng ký tài khoản'}
                </button>

                <div className="buyer-auth-switch">
                  {mode === 'login' ? (
                    <>
                      Chưa có tài khoản?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setMessage(null);
                        }}
                      >
                        Đăng ký ngay
                      </button>
                    </>
                  ) : (
                    <>
                      Đã có tài khoản?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setMessage(null);
                        }}
                      >
                        Đăng nhập
                      </button>
                    </>
                  )}
                </div>

                <div className="buyer-auth-organizer-box">
                  <span>Bạn là Ban tổ chức sự kiện?</span>
                  <a
                    href={buildPublicPath(window.location.pathname, 'organizer/login')}
                    onClick={onSpaNav('organizer/login')}
                  >
                    Đăng nhập Studio BTC →
                  </a>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <footer className="marketplace-footer">
        <b>EVENTTICKETING</b>
        <span>Nền tảng khám phá và quản lý sự kiện.</span>
        <a
          href={buildPublicPath(window.location.pathname, 'organizer')}
          onClick={onSpaNav('organizer')}
        >
          Dành cho Ban tổ chức →
        </a>
      </footer>
    </div>
  );
}
