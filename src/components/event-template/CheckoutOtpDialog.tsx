import {useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent} from 'react';
import type {BuyerSession} from '../../services/buyerAuthService';
import type {KetQuaXacMinhMaOtp, KhoTrangThaiOtpPhien} from '../../services/otpService';
import {OtpVerificationPanel} from './OtpVerificationPanel';
import '../site/LoginRequiredHost.css';
import './OtpVerificationPanel.css';

/** Che bớt địa chỉ email khi hiển thị (giữ ký tự đầu của phần tên và toàn bộ tên miền). */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const name = email.slice(0, at);
  return `${name[0]}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 6)))}${email.slice(at)}`;
}

export type CheckoutOtpDialogProps = {
  session: BuyerSession;
  eventId: number | string;
  isMock: boolean;
  khoOtp: KhoTrangThaiOtpPhien;
  onVerified: (ketQua: KetQuaXacMinhMaOtp) => void | Promise<void>;
  onClose: () => void;
  /** Tài khoản demo nhập mã demo thay OTP. */
  onDemoCode?: (ma: string) => void;
};

/**
 * Hộp thoại toàn trang "Xác minh OTP để thanh toán": hiện khi người đã đăng nhập bấm Thanh toán ở sự kiện bật OTP.
 * Nền phía sau được làm mờ; mã 6 số gửi về email của tài khoản đang đăng nhập. Xác minh xong thì bên gọi tự tiếp tục thanh toán.
 */
export function CheckoutOtpDialog({session, eventId, isMock, khoOtp, onVerified, onClose, onDemoCode}: CheckoutOtpDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardRef.current?.querySelector<HTMLElement>('button, input, a')?.focus();
    const lastFocus = lastFocusRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      lastFocus?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]');
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
    },
    [onClose],
  );

  return (
    <div
      className="et-login-modal"
      role="presentation"
      data-testid="hop-thoai-otp-thanh-toan"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={cardRef}
        className="et-login-modal__card et-checkout-otp__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="et-checkout-otp-title"
        aria-describedby="et-checkout-otp-desc"
      >
        <h2 id="et-checkout-otp-title" className="et-login-modal__title">
          Xác minh OTP để thanh toán
        </h2>
        <p id="et-checkout-otp-desc" className="et-login-modal__text">
          Mã xác minh 6 số sẽ được gửi tới email <strong>{maskEmail(session.email)}</strong>. Ghế của bạn đang được giữ (đã gia hạn thêm để
          bạn kịp nhập mã); nhập đúng mã để hoàn tất thanh toán.
        </p>
        <OtpVerificationPanel
          session={session}
          eventId={eventId}
          isMock={isMock}
          onVerified={onVerified}
          khoOtp={khoOtp}
          onDemoCode={onDemoCode}
        />
        <div className="et-login-modal__row">
          <button type="button" className="et-login-modal__btn et-login-modal__btn--quiet" onClick={onClose}>
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
