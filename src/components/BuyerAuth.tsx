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
import {
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconShieldCheck,
  IconTicket,
  IconUser,
} from './common/Icons';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  return (
    <div className="marketplace-shell">
      {/* Navigation Header */}
      <header className="marketplace-nav">
        <a
          href={buildPublicPath(window.location.pathname, 'events')}
          onClick={onSpaNav('events')}
          className="marketplace-logo"
        >
          EV<span>ENT</span><span className="marketplace-logo-sub">TICKETING</span>
        </a>
        <nav aria-label="Điều hướng">
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

      {/* Main Authentication & Account Experience */}
      <main className="buyer-auth-shell">
        <div className="buyer-auth-container">
          {session ? (
            /* Logged-In User Account Overview */
            <div className="buyer-auth-profile-card">
              <div className="buyer-auth-profile-header">
                <div className="buyer-auth-avatar">
                  <IconUser size={28} />
                </div>
                <div>
                  <span className="buyer-auth-kicker">TÀI KHOẢN KHÁN GIẢ ĐÃ XÁC THỰC</span>
                  <h2>{session.fullName || session.email.split('@')[0]}</h2>
                  <p className="buyer-auth-sub">
                    {session.accountKind === 'ORGANIZER'
                      ? 'Tài khoản của bạn có quyền Ban tổ chức và được phép mua vé sự kiện.'
                      : 'Chào mừng bạn trở lại! Quản lý phiên đăng nhập cá nhân và truy cập danh mục sự kiện công khai.'}
                  </p>
                </div>
              </div>

              {/* Account details box */}
              <div className="buyer-auth-profile-box">
                <div className="buyer-auth-profile-row">
                  <span>Địa chỉ Email</span>
                  <strong>{session.email}</strong>
                </div>
                {session.fullName && (
                  <div className="buyer-auth-profile-row">
                    <span>Họ và tên</span>
                    <strong>{session.fullName}</strong>
                  </div>
                )}
                <div className="buyer-auth-profile-row">
                  <span>Loại tài khoản</span>
                  <strong className="buyer-auth-role-tag">
                    {session.accountKind === 'ORGANIZER'
                      ? 'Ban tổ chức (Được phép mua vé)'
                      : session.accountKind === 'ADMIN'
                      ? 'Quản trị viên hệ thống'
                      : 'Khán giả / Người mua vé'}
                  </strong>
                </div>
                <div className="buyer-auth-profile-row">
                  <span>Trạng thái tài khoản</span>
                  <strong className="buyer-auth-status-tag">
                    <span className="buyer-auth-status-dot" /> Đang hoạt động
                  </strong>
                </div>
              </div>

              {/* Reassurance Feature Highlights */}
              <div className="buyer-auth-perks">
                <div className="buyer-auth-perk-item">
                  <IconCalendar size={18} className="buyer-auth-perk-icon" />
                  <div>
                    <strong>Theo dõi lịch diễn & suất diễn</strong>
                    <span>Cập nhật ngày giờ, địa điểm và trạng thái theo từng suất diễn thực tế.</span>
                  </div>
                </div>
                <div className="buyer-auth-perk-item">
                  <IconShieldCheck size={18} className="buyer-auth-perk-icon" />
                  <div>
                    <strong>Bảo vệ phiên & Phân quyền an toàn</strong>
                    <span>Quản lý phiên đăng nhập an toàn với Supabase Auth và phân định vai trò rõ ràng.</span>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`buyer-auth-message buyer-auth-message--${message.type}`} role="status">
                  {message.text}
                </div>
              )}

              {/* Action buttons */}
              <div className="buyer-auth-actions-group">
                <button
                  type="button"
                  className="buyer-auth-submit"
                  onClick={() => navigatePublicRoute('events')}
                >
                  Khám phá danh mục sự kiện →
                </button>

                <button
                  type="button"
                  className="marketplace-logout buyer-auth-logout-btn"
                  onClick={handleSignOut}
                  disabled={busy}
                >
                  {busy ? 'Đang xử lý…' : 'Đăng xuất tài khoản'}
                </button>
              </div>

              {/* Link to Organizer Studio */}
              <div className="buyer-auth-organizer-box">
                <div className="buyer-auth-organizer-text">
                  <IconBuilding size={16} />
                  <span>Bạn là đơn vị tổ chức biểu diễn, hội thảo hoặc sự kiện?</span>
                </div>
                <a
                  href={buildPublicPath(window.location.pathname, 'organizer')}
                  onClick={onSpaNav('organizer')}
                >
                  Mở Studio BTC →
                </a>
              </div>
            </div>
          ) : (
            /* Logged-Out Login / Register Forms with Reassurance Side Panel */
            <div className="buyer-auth-split-layout">
              {/* Left Side: Consumer Reassurance Panel */}
              <div className="buyer-auth-reassurance-panel">
                <span className="buyer-auth-kicker">EVENTTICKETING PASS</span>
                <h2>Quản lý tài khoản sự kiện tập trung và an toàn</h2>
                <p>
                  Tài khoản cá nhân giúp bạn đăng nhập an toàn, tra cứu lịch diễn, theo dõi tình trạng mở bán và chuyển đổi vai trò Ban tổ chức khi cần thiết.
                </p>

                <div className="buyer-auth-trust-list">
                  <div className="buyer-auth-trust-point">
                    <div className="buyer-auth-trust-badge">
                      <IconTicket size={16} />
                    </div>
                    <div>
                      <strong>Phân khu & Tồn kho thực tế</strong>
                      <span>Dữ liệu hạng vé, giá bán và số lượng vé được cập nhật trực tiếp từ hệ thống.</span>
                    </div>
                  </div>

                  <div className="buyer-auth-trust-point">
                    <div className="buyer-auth-trust-badge">
                      <IconCalendar size={16} />
                    </div>
                    <div>
                      <strong>Lịch diễn đa suất minh bạch</strong>
                      <span>Thông tin thời gian bắt đầu, kết thúc và địa điểm tổ chức chi tiết cho từng suất.</span>
                    </div>
                  </div>

                  <div className="buyer-auth-trust-point">
                    <div className="buyer-auth-trust-badge">
                      <IconShieldCheck size={16} />
                    </div>
                    <div>
                      <strong>Bảo mật tài khoản qua Supabase Auth</strong>
                      <span>Xác thực an toàn qua hệ thống Supabase Auth và phân định quyền hạn tài khoản rõ ràng.</span>
                    </div>
                  </div>
                </div>

                <div className="buyer-auth-reassurance-quote">
                  <IconCheck size={14} className="buyer-auth-quote-icon" />
                  <span>Dữ liệu sự kiện được đồng bộ trực tiếp từ không gian phát hành của Ban tổ chức.</span>
                </div>
              </div>

              {/* Right Side: Form Card */}
              <div className="buyer-auth-card">
                {/* Tabs */}
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
                    ? 'Đăng nhập tài khoản cá nhân để quản lý phiên và khám phá các sự kiện công khai.'
                    : 'Đăng ký tài khoản cá nhân để theo dõi thông tin sự kiện và phân quyền tài khoản an toàn.'}
                </p>

                <form onSubmit={handleSubmit} className="buyer-auth-form">
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
                    <div className="buyer-auth-password-wrap">
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
                        className="buyer-auth-password-toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                        title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                      </button>
                    </div>
                  </label>

                  {mode === 'register' && (
                    <label>
                      Xác nhận mật khẩu
                      <div className="buyer-auth-password-wrap">
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
                          className="buyer-auth-password-toggle"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                          {showConfirmPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      </div>
                    </label>
                  )}

                  {message && (
                    <div
                      className={`buyer-auth-message buyer-auth-message--${message.type}`}
                      role="status"
                    >
                      {message.text}
                    </div>
                  )}

                  <button type="submit" className="buyer-auth-submit" disabled={busy}>
                    {busy
                      ? 'Đang xử lý…'
                      : mode === 'login'
                      ? 'Đăng nhập ngay →'
                      : 'Đăng ký tài khoản →'}
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
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="marketplace-footer">
        <div className="marketplace-footer-bottom">
          <b>EVENTTICKETING</b>
          <span>Nền tảng khám phá và quản lý sự kiện tiêu chuẩn Việt Nam.</span>
          <a
            href={buildPublicPath(window.location.pathname, 'organizer')}
            onClick={onSpaNav('organizer')}
          >
            Dành cho Ban tổ chức →
          </a>
        </div>
      </footer>
    </div>
  );
}
