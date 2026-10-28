import {useState, type FormEvent} from 'react';
import {
  signInOrganizer,
  signUpOrganizer,
  type OrganizerSession,
} from '../../services/organizerService';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconShield,
  IconSpinner,
} from './OrganizerIcons';

type OrganizerAuthViewProps = {
  session: OrganizerSession | null;
  onChanged: () => Promise<void>;
  onLoginSuccess: () => void;
};

export function OrganizerAuthView({
  session,
  onChanged,
  onLoginSuccess,
}: OrganizerAuthViewProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setIsSuccess(false);
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get('email'));
      const password = String(form.get('password'));
      if (mode === 'login') {
        await signInOrganizer(email, password);
        await onChanged();
        onLoginSuccess();
      } else {
        const result = await signUpOrganizer(email, password);
        await onChanged();
        if (result.hasSession) {
          setIsSuccess(true);
          setMessage('Đăng ký và đăng nhập thành công!');
          onLoginSuccess();
        } else {
          setIsSuccess(true);
          setMessage(
            'Tài khoản đã được tạo thành công! Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập.',
          );
          setMode('login');
        }
      }
    } catch (error) {
      setIsSuccess(false);
      setMessage(error instanceof Error ? error.message : 'Không thể xác thực thông tin.');
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    return (
      <main className="org-auth-container" style={{maxWidth: '680px', gridTemplateColumns: '1fr'}}>
        <div className="org-auth-card organizer-auth-card" style={{textAlign: 'center', padding: '48px 36px'}}>
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 14px',
              borderRadius: 'var(--org-radius-sm)',
              background: 'var(--org-lime-glow)',
              color: 'var(--org-lime)',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              marginBottom: '16px',
            }}
          >
            PHIÊN LÀM VIỆC HỢP LỆ
          </div>
          <h1 style={{fontSize: '28px', fontWeight: 900, margin: '0 0 12px', color: '#fff'}}>
            Bạn đã đăng nhập vào hệ thống
          </h1>
          <p style={{color: 'var(--org-text-secondary)', fontSize: '14px', marginBottom: '28px'}}>
            Tài khoản: <strong style={{color: '#fff'}}>{session.email}</strong>
          </p>
          <button
            type="button"
            className="org-btn org-btn-primary"
            onClick={onLoginSuccess}
            style={{minWidth: '220px', margin: '0 auto'}}
          >
            <span>Mở Studio làm việc</span>
            <IconArrowRight size={16} />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="org-auth-container organizer-auth">
      <div className="org-auth-hero">
        <div className="org-auth-hero-eyebrow">
          <IconShield size={16} />
          <span>CỔNG BAN TỔ CHỨC SỰ KIỆN</span>
        </div>

        <h1 className="org-auth-hero-title">
          Biến ý tưởng
          <br />
          thành sân khấu.
        </h1>

        <p className="org-auth-hero-desc">
          Công cụ thiết lập lịch diễn đa suất, sơ đồ phân khu hạng vé và xuất bản sự kiện trực tiếp lên sàn bán vé trong cùng một luồng làm việc.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderLeft: '2px solid var(--org-lime)',
            paddingLeft: '16px',
            marginTop: '8px',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', fontWeight: 600}}>
            <IconCheck size={14} style={{color: 'var(--org-lime)'}} />
            <span>Quản lý đa suất diễn & phân khu đa tầng</span>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', fontWeight: 600}}>
            <IconShield size={14} style={{color: 'var(--org-lime)'}} />
            <span>An toàn thương mại: bảo vệ giá và giữ chỗ tự động</span>
          </div>
        </div>
      </div>

      <div className="org-auth-card">
        <div className="org-auth-tabs organizer-auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`org-auth-tab-btn ${mode === 'login' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('login');
              setMessage('');
              setIsSuccess(false);
            }}
          >
            Đăng nhập Studio
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`org-auth-tab-btn ${mode === 'signup' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('signup');
              setMessage('');
              setIsSuccess(false);
            }}
          >
            Đăng ký tài khoản
          </button>
        </div>

        <form className="org-auth-form" onSubmit={submit}>
          <label className="org-label">
            <span>
              Email đăng nhập <span className="org-label-required">*</span>
            </span>
            <input
              className="org-input"
              name="email"
              type="email"
              required
              placeholder="banto-chuc@example.com"
              autoComplete="email"
            />
          </label>

          <label className="org-label">
            <span>
              Mật khẩu <span className="org-label-required">*</span>
            </span>
            <input
              className="org-input"
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <span className="org-label-hint">Tối thiểu 6 ký tự để bảo mật tài khoản.</span>
          </label>

          {mode === 'signup' && (
            <div className="org-alert org-alert-warning" role="note">
              <IconAlertTriangle className="org-alert-icon" size={18} />
              <div className="org-alert-body">
                <strong>Lưu ý cấp quyền:</strong> Nhằm bảo đảm an toàn cho các sự kiện thương mại, tài khoản tạo mới mặc định có vai trò Khán giả. Quyền Ban tổ chức cần được Quản trị viên kích hoạt trước khi mở bán vé.
              </div>
            </div>
          )}

          {message && (
            <div
              className={`org-alert ${isSuccess ? 'org-alert-success' : 'org-alert-danger'} organizer-message`}
              role="alert"
            >
              {isSuccess ? (
                <IconCheck className="org-alert-icon" size={18} />
              ) : (
                <IconAlertTriangle className="org-alert-icon" size={18} />
              )}
              <div className="org-alert-body">{message}</div>
            </div>
          )}

          <button
            type="submit"
            className="org-btn org-btn-primary organizer-primary"
            disabled={busy}
            style={{width: '100%', marginTop: '6px'}}
          >
            {busy ? (
              <>
                <IconSpinner size={16} />
                <span>Đang xử lý…</span>
              </>
            ) : mode === 'login' ? (
              <span>Đăng nhập vào Studio</span>
            ) : (
              <span>Tạo tài khoản Ban tổ chức</span>
            )}
          </button>

          <div className="org-auth-footer-note">
            Quyền xem và cập nhật sự kiện được phân tách an toàn theo từng tổ chức bằng Postgres Row Level Security.
          </div>
        </form>
      </div>
    </main>
  );
}
