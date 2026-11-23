import {runtimeConfig} from '../../config/runtime';

type DemoQuickLoginProps = {
  busy: boolean;
  onBuyer: () => void;
  onOrganizer: () => void;
};

/** Hai nút đăng nhập nhanh bằng tài khoản demo. Không hiện nếu VITE_DEMO_QUICK_LOGIN không bật. */
export function DemoQuickLogin({busy, onBuyer, onOrganizer}: DemoQuickLoginProps) {
  if (!runtimeConfig.demoQuickLogin) return null;
  return (
    <section className="demo-quick-login" aria-label="Đăng nhập nhanh bằng tài khoản demo">
      <p className="demo-quick-login__label">
        <strong>Chế độ demo:</strong> đăng nhập một chạm bằng tài khoản thử nghiệm.
      </p>
      <div className="demo-quick-login__actions">
        <button type="button" className="demo-quick-login__btn" onClick={onBuyer} disabled={busy}>
          Đăng nhập nhanh: Người dùng
        </button>
        <button type="button" className="demo-quick-login__btn demo-quick-login__btn--org" onClick={onOrganizer} disabled={busy}>
          Đăng nhập nhanh: Ban tổ chức
        </button>
      </div>
    </section>
  );
}
