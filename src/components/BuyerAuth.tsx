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
import {IconBuilding, IconEye, IconEyeOff, IconUser} from './common/Icons';
import {GlobalHeader} from './site/GlobalHeader';
import './site/auth.css';

const onSpaNav = (target: string) => (e: MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigatePublicRoute(target);
  }
};

const ACCOUNT_KIND_LABELS: Record<string, string> = {
  ORGANIZER: 'Ban tổ chức (được phép mua vé)',
  ADMIN: 'Quản trị viên hệ thống',
};

export function BuyerAuth({page}: {page?: string}) {
  const [session, setSession] = useState<BuyerSession | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>(page === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{type: 'error' | 'success'; text: string} | null>(null);

  useEffect(() => {
    document.title = session
      ? 'Tài khoản của tôi | EventTicketing'
      : mode === 'register'
      ? 'Đăng ký tài khoản người mua vé | EventTicketing'
      : 'Đăng nhập tài khoản người mua vé | EventTicketing';
  }, [mode, session]);

  useEffect(() => {
    if (page === 'register') setMode('register');
    if (page === 'login') setMode('login');
  }, [page]);

  useEffect(() => {
    void getBuyerSession().then(setSession);
    const unsub = subscribeBuyerAuth(setSession);
    return unsub;
  }, []);

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setMessage(null);
  }

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
        setMessage({type: 'success', text: 'Đăng nhập thành công! Đang chuyển về trang sự kiện…'});
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

  const messageBox = message && (
    <div
      className={`et-auth__message et-auth__message--${message.type}`}
      role={message.type === 'error' ? 'alert' : 'status'}
    >
      {message.text}
    </div>
  );

  return (
    <div className="et-site et-auth-page">
      <GlobalHeader session={session} onSignOut={handleSignOut} />

      <main className="et-auth__main">
        {session ? (
          <section className="et-auth__card" aria-labelledby="account-title">
            <div className="et-auth__profile-head">
              <div className="et-auth__avatar" aria-hidden="true">
                <IconUser size={28} />
              </div>
              <div>
                <p className="et-auth__kicker">Tài khoản của tôi</p>
                <h1 id="account-title" className="et-auth__title">
                  {session.fullName || session.email.split('@')[0]}
                </h1>
              </div>
            </div>

            <dl className="et-auth__profile-list">
              <div>
                <dt>Email</dt>
                <dd>{session.email}</dd>
              </div>
              {session.fullName && (
                <div>
                  <dt>Họ và tên</dt>
                  <dd>{session.fullName}</dd>
                </div>
              )}
              <div>
                <dt>Loại tài khoản</dt>
                <dd>
                  <span className="et-auth__tag">
                    {ACCOUNT_KIND_LABELS[session.accountKind ?? ''] ?? 'Khán giả / Người mua vé'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>
                  <span className="et-auth__tag et-auth__tag--ok">Đang hoạt động</span>
                </dd>
              </div>
            </dl>

            {messageBox}

            <div className="et-auth__actions">
              <button type="button" className="et-auth__btn et-auth__btn--primary" onClick={() => navigatePublicRoute('events')}>
                Khám phá sự kiện
              </button>
              <button
                type="button"
                className="et-auth__btn et-auth__btn--secondary"
                onClick={handleSignOut}
                disabled={busy}
              >
                {busy ? 'Đang xử lý…' : 'Đăng xuất'}
              </button>
            </div>

            <div className="et-auth__aside-link">
              <span>
                <IconBuilding size={16} /> Bạn là đơn vị tổ chức sự kiện?
              </span>
              <a href={buildPublicPath(window.location.pathname, 'organizer')} onClick={onSpaNav('organizer')}>
                Mở Studio BTC →
              </a>
            </div>
          </section>
        ) : (
          <section className="et-auth__card" aria-labelledby="auth-title">
            <div className="et-auth__tabs" role="tablist" aria-label="Chọn chế độ đăng nhập hoặc đăng ký">
              <button
                type="button"
                role="tab"
                id="auth-tab-login"
                aria-selected={mode === 'login'}
                aria-controls="auth-panel"
                className={mode === 'login' ? 'is-active' : ''}
                onClick={() => switchMode('login')}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                role="tab"
                id="auth-tab-register"
                aria-selected={mode === 'register'}
                aria-controls="auth-panel"
                className={mode === 'register' ? 'is-active' : ''}
                onClick={() => switchMode('register')}
              >
                Đăng ký
              </button>
            </div>

            <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`}>
              <h1 id="auth-title" className="et-auth__title">
                {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </h1>
              <p className="et-auth__sub">
                {mode === 'login'
                  ? 'Đăng nhập để quản lý phiên và khám phá các sự kiện công khai.'
                  : 'Tạo tài khoản khán giả để theo dõi thông tin sự kiện.'}
              </p>

              <form onSubmit={handleSubmit} className="et-auth__form" noValidate={false}>
                {mode === 'register' && (
                  <label className="et-auth__field">
                    <span>Họ và tên (không bắt buộc)</span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      autoComplete="name"
                    />
                  </label>
                )}

                <label className="et-auth__field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ban@vidu.com"
                    required
                    autoComplete="email"
                  />
                </label>

                <label className="et-auth__field">
                  <span>Mật khẩu</span>
                  <div className="et-auth__password">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      required
                      minLength={6}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      className="et-auth__toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  </div>
                </label>

                {mode === 'register' && (
                  <label className="et-auth__field">
                    <span>Xác nhận mật khẩu</span>
                    <div className="et-auth__password">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu"
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="et-auth__toggle"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        title={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                        aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                        aria-pressed={showConfirmPassword}
                      >
                        {showConfirmPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                      </button>
                    </div>
                  </label>
                )}

                {messageBox}

                <button type="submit" className="et-auth__btn et-auth__btn--primary et-auth__btn--block" disabled={busy}>
                  {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}
                </button>
              </form>

              <p className="et-auth__switch">
                {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
                <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
                  {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
                </button>
              </p>
            </div>

            <div className="et-auth__aside-link">
              <span>Bạn là Ban tổ chức sự kiện?</span>
              <a href={buildPublicPath(window.location.pathname, 'organizer/login')} onClick={onSpaNav('organizer/login')}>
                Đăng nhập Studio BTC →
              </a>
            </div>
          </section>
        )}
      </main>

      <div className="et-auth__footer" role="contentinfo">
        <b>EVENTTICKETING</b>
        <span>Nền tảng khám phá và quản lý sự kiện tiêu chuẩn Việt Nam.</span>
        <a href={buildPublicPath(window.location.pathname, 'organizer')} onClick={onSpaNav('organizer')}>
          Dành cho Ban tổ chức →
        </a>
      </div>
    </div>
  );
}
