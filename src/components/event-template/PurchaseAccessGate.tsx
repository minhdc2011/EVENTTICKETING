import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {runtimeConfig} from '../../config/runtime';
import {canAccessPortal} from '../../domain/accountAccess';
import {EVENT_CAN_OTP, phatDaXacMinhOtp,
  phatMaDemo, phatYeuCauDangNhap} from '../../domain/loginRequired.js';
import type {PublicEventRecord} from '../../services/eventService';
import {subscribeBuyerAuth, type BuyerSession} from '../../services/buyerAuthService';
import {docCauHinhMuaVe} from '../../services/purchaseConfigService';
import {
  dangKyThuHoiBangChungMock,
  khoTrangThaiOtpPhien,
  type KetQuaXacMinhMaOtp,
  type KhoTrangThaiOtpPhien,
} from '../../services/otpService';
import {CheckoutOtpDialog} from './CheckoutOtpDialog';
import {buildPurchaseGateContextKey} from './eventTemplateLogic.js';
import './OtpVerificationPanel.css';

/*
 * Ghi chú bàn giao T3 (AC7)
 * - Việc kiểm tra thao tác bàn phím (Tab/Enter), trạng thái focus, thông báo lỗi và chụp ảnh màn hình
 *   ở chiều rộng 360px cho CẢ HAI nhánh chọn vé là bước NGƯỜI DÙNG trực tiếp thực hiện sau merge:
 *     1) SeatMapSection / SeatingSection tại src/components/GenericEventPage.tsx;
 *     2) HTML legacy Super Concert tại src/components/ConcertSections.tsx.
 * - Bước nghiệm thu này HIỆN CHƯA được thực hiện.
 * - Các test mã nguồn (gồm tests/otp-access-gate-ui.test.mjs) và `npm run check` KHÔNG thay thế
 *   bước nghiệm thu thủ công này.
 */

/*
 * Luồng mua vé (Sprint 2, cập nhật 23/11/2026):
 *   1) Ai cũng xem và chọn ghế/vé tự do (cổng này KHÔNG chặn phần chọn vé).
 *   2) Bấm "Thanh toán": chưa đăng nhập -> hộp thoại đăng nhập (LoginRequiredHost), đăng nhập xong tự tiếp tục.
 *   3) Đã đăng nhập và sự kiện bật OTP: mã OTP gửi về email của tài khoản, hộp thoại nhập mã hiện ở đây (CheckoutOtpDialog).
 *   4) Xác minh xong tự tiếp tục: máy chủ kiểm tra lại OTP (da_xac_minh_otp) rồi giữ chỗ, giao diện báo đã xác nhận.
 * Máy chủ vẫn là nơi cưỡng chế: tao_giu_cho_theo_suat từ chối khi thiếu đăng nhập hoặc thiếu OTP.
 */

/** Khóa sessionStorage lưu đích quay lại (đường dẫn công khai, vd. `events/<slug>/shows/<show>`) sau khi đăng nhập. */
export const BUYER_RETURN_TO_KEY = 'eventticketing:buyer-return-to';

export type PurchaseAccessGateProps = {
  event: PublicEventRecord;
  children: ReactNode;
  onAccessChange?: (allowed: boolean, contextKey?: string) => void;
  /** Chỉ để inject trong test; mặc định là kho OTP cấp phiên người mua (sống qua unmount/remount cổng). */
  khoOtp?: KhoTrangThaiOtpPhien;
};

type ConfigState =
  | {eventId: string; kind: 'loading'}
  | {eventId: string; kind: 'error'}
  | {eventId: string; kind: 'ready'; requireOtp: boolean};

export function buildEventReturnTarget(event: Pick<PublicEventRecord, 'slug' | 'selectedShow'>): string {
  const showSlug = event.selectedShow?.slug;
  return `events/${event.slug}${showSlug ? `/shows/${showSlug}` : ''}#seating-section`;
}

function GateFrame({title, children}: {title: string; children: ReactNode}) {
  return (
    <section id="seating-section" className="et-otp-gate-root" aria-labelledby="et-otp-gate-title">
      <div className="et-otp-card">
        <p className="et-otp-kicker">Chọn ghế / vé</p>
        <h2 id="et-otp-gate-title" className="et-otp-title">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export function PurchaseAccessGate({
  event,
  children,
  onAccessChange,
  khoOtp = khoTrangThaiOtpPhien,
}: PurchaseAccessGateProps) {
  const eventKey = String(event.id);
  const showId = event.selectedShow?.id;
  const gateContextKey = buildPurchaseGateContextKey(event.id, showId);
  const [config, setConfig] = useState<ConfigState>({eventId: eventKey, kind: 'loading'});
  const [reloadKey, setReloadKey] = useState(0);
  const [session, setSession] = useState<BuyerSession | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  // Kho OTP cấp phiên người mua (module): giữ cooldown, bộ đếm và request đang chờ qua unmount/remount (không giữ mã nhập).
  useEffect(() => dangKyThuHoiBangChungMock(() => khoOtp.xoa()), [khoOtp]);

  // 1) Đọc cấu hình mua vé (fail-closed: lỗi đọc không mở phần chọn vé).
  useEffect(() => {
    let obsolete = false;
    setConfig({eventId: eventKey, kind: 'loading'});
    docCauHinhMuaVe(event.id)
      .then((cfg) => {
        if (obsolete) return;
        if (typeof cfg?.yeuCauXacMinhOtp !== 'boolean') {
          setConfig({eventId: eventKey, kind: 'error'});
          return;
        }
        setConfig({eventId: eventKey, kind: 'ready', requireOtp: cfg.yeuCauXacMinhOtp});
      })
      .catch(() => {
        if (!obsolete) setConfig({eventId: eventKey, kind: 'error'});
      });
    return () => {
      obsolete = true;
    };
  }, [event.id, eventKey, reloadKey]);

  const configReady = config.eventId === eventKey && config.kind === 'ready';
  const requireOtp = configReady && config.kind === 'ready' ? config.requireOtp : false;

  // 2) Sự kiện bật OTP: theo dõi phiên người mua để biết gửi mã tới email nào.
  useEffect(() => {
    setSession(null);
    setOtpOpen(false);
    if (!requireOtp) return;
    let active = true;
    const unsubscribe = subscribeBuyerAuth((s) => {
      if (!active) return;
      const buyer = s && canAccessPortal(s.accountKind, 'BUYER') ? s : null;
      setSession(buyer);
      // Đổi tài khoản/email: loại bỏ trạng thái OTP và request đang chờ của tài khoản trước.
      khoOtp.lay(buyer);
      if (!buyer) setOtpOpen(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [requireOtp, eventKey, showId, gateContextKey, khoOtp]);

  // 3) Bước Thanh toán báo cần OTP -> hiện hộp thoại nhập mã (cần phiên đã đăng nhập).
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!requireOtp) return undefined;
    const onNeedOtp = () => {
      if (sessionRef.current) setOtpOpen(true);
      else phatYeuCauDangNhap();
    };
    window.addEventListener(EVENT_CAN_OTP, onNeedOtp);
    return () => window.removeEventListener(EVENT_CAN_OTP, onNeedOtp);
  }, [requireOtp, eventKey]);

  // Phần chọn vé luôn mở khi đã biết cấu hình; OTP được kiểm tra ở bước Thanh toán, không chặn việc xem/chọn.
  const allowed = configReady;

  const onAccessChangeRef = useRef(onAccessChange);
  onAccessChangeRef.current = onAccessChange;
  useEffect(() => {
    onAccessChangeRef.current?.(allowed, gateContextKey);
  }, [allowed, gateContextKey]);
  useEffect(() => () => onAccessChangeRef.current?.(false), []);

  const handleVerified = useCallback(
    async (_ketQua: KetQuaXacMinhMaOtp) => {
      khoOtp.xoa();
      setOtpOpen(false);
      phatDaXacMinhOtp();
    },
    [khoOtp],
  );

  if (allowed) {
    return (
      <>
        {children}
        {otpOpen && session ? (
          <CheckoutOtpDialog
            session={session}
            eventId={event.id}
            isMock={runtimeConfig.useMockData}
            khoOtp={khoOtp}
            onVerified={handleVerified}
            onClose={() => setOtpOpen(false)}
            onDemoCode={(ma) => {
              setOtpOpen(false);
              phatMaDemo(ma);
            }}
          />
        ) : null}
      </>
    );
  }

  if (config.eventId !== eventKey || config.kind === 'loading') {
    return (
      <GateFrame title="Đang kiểm tra yêu cầu mua vé">
        <p className="et-otp-message" role="status" aria-live="polite">
          <strong>Đang tải:</strong> Đang đọc cấu hình mua vé của sự kiện…
        </p>
      </GateFrame>
    );
  }

  if (config.kind === 'error') {
    return (
      <GateFrame title="Chưa thể mở phần chọn vé">
        <p className="et-otp-message et-otp-message--error" role="alert" aria-live="assertive">
          <strong>Lỗi:</strong> Không đọc được cấu hình mua vé nên phần chọn vé tạm thời chưa mở. Vui lòng thử lại.
        </p>
        <div className="et-otp-actions">
          <button type="button" className="et-otp-btn et-otp-btn--primary" onClick={() => setReloadKey((k) => k + 1)}>
            Thử lại
          </button>
        </div>
      </GateFrame>
    );
  }

  return null;
}
