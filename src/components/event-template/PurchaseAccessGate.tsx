import {useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode} from 'react';
import {runtimeConfig} from '../../config/runtime';
import {canAccessPortal} from '../../domain/accountAccess';
import {buildPublicPath, navigatePublicRoute} from '../../domain/publicRoute';
import type {PublicEventRecord} from '../../services/eventService';
import {subscribeBuyerAuth, type BuyerSession} from '../../services/buyerAuthService';
import {docCauHinhMuaVe} from '../../services/purchaseConfigService';
import {
  TRANG_THAI_CONG,
  dangKyThuHoiBangChungMock,
  khoTrangThaiOtpPhien,
  taoCongOtpNguoiMua,
  type BoDieuPhoiCongOtp,
  type KetQuaXacMinhMaOtp,
  type KhoTrangThaiOtpPhien,
  type TrangThaiCongOtp,
} from '../../services/otpService';
import {OtpVerificationPanel} from './OtpVerificationPanel';
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

function luuDichQuayLai(target: string) {
  try {
    window.sessionStorage.setItem(BUYER_RETURN_TO_KEY, target);
  } catch {
    // sessionStorage bị chặn: sau đăng nhập quay về danh sách sự kiện.
  }
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
  // Chỉ dùng khi sự kiện KHÔNG bật OTP trên CSDL thật: giữ chỗ vẫn cần tài khoản người mua đã đăng nhập.
  const [daDangNhap, setDaDangNhap] = useState<boolean | null>(null);
  const [gateEntry, setGateEntry] = useState<{contextKey: string; state: TrangThaiCongOtp} | null>(null);
  const congRef = useRef<BoDieuPhoiCongOtp | null>(null);
  // Kho OTP cấp phiên người mua (module): giữ cooldown, bộ đếm và request đang chờ qua unmount/remount cả cổng (không giữ mã nhập).
  useEffect(() => dangKyThuHoiBangChungMock(() => khoOtp.xoa()), [khoOtp]);

  // 1) Đọc cấu hình mua vé (fail-closed: lỗi đọc không bao giờ mở cổng).
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

  // 2) Chỉ khi sự kiện bật OTP: theo dõi phiên người mua và điều phối cổng T2.
  useEffect(() => {
    setGateEntry(null);
    setSession(null);
    if (!requireOtp) return;
    let active = true;
    let lastUserId: string | null = null;
    const effectContextKey = gateContextKey;
    const cong = taoCongOtpNguoiMua({
      emit: (st) => {
        if (active) setGateEntry({contextKey: effectContextKey, state: st});
      },
      isActive: () => active,
    });
    congRef.current = cong;
    const unsubscribe = subscribeBuyerAuth((s) => {
      if (!active) return;
      const buyer = s && canAccessPortal(s.accountKind, 'BUYER') ? s : null;
      setSession(buyer);
      // Gọi lay(buyer) ngay khi phiên đổi để tăng thế hệ khi đăng xuất hoặc đổi tài khoản/email, loại bỏ request đang chờ.
      khoOtp.lay(buyer);
      // Làm mới token cùng tài khoản không được dỡ phần chọn vé đang mở; bằng chứng vẫn được hẹn kiểm tra lại.
      if (buyer && lastUserId === buyer.userId && cong.layTrangThai().status === TRANG_THAI_CONG.DUOC_VAO) return;
      lastUserId = buyer?.userId ?? null;
      void cong.kiemTraLai(buyer, eventKey);
    });
    return () => {
      active = false;
      unsubscribe();
      cong.huy();
      if (congRef.current === cong) congRef.current = null;
    };
  }, [requireOtp, eventKey, showId, gateContextKey, khoOtp]);

  // 3) Sự kiện không bật OTP (CSDL thật): không chặn cổng, nhưng báo người chưa đăng nhập vì máy chủ chỉ cho tài khoản đăng nhập giữ chỗ.
  const canBaoDangNhap = !runtimeConfig.useMockData && configReady && !requireOtp;
  useEffect(() => {
    setDaDangNhap(null);
    if (!canBaoDangNhap) return;
    let active = true;
    const unsubscribe = subscribeBuyerAuth((s) => {
      if (active) setDaDangNhap(Boolean(s && canAccessPortal(s.accountKind, 'BUYER')));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [canBaoDangNhap, eventKey]);

  const gateCurrent =
    gateEntry && gateEntry.contextKey === gateContextKey && gateEntry.state.suKienId === eventKey
      ? gateEntry.state
      : null;
  const allowed =
    configReady && (!requireOtp || gateCurrent?.status === TRANG_THAI_CONG.DUOC_VAO);

  const onAccessChangeRef = useRef(onAccessChange);
  onAccessChangeRef.current = onAccessChange;
  useEffect(() => {
    onAccessChangeRef.current?.(allowed, gateContextKey);
  }, [allowed, gateContextKey]);
  useEffect(() => () => onAccessChangeRef.current?.(false), []);

  const handleVerified = useCallback(async (ketQua: KetQuaXacMinhMaOtp) => {
    khoOtp.xoa();
    await congRef.current?.apDungXacMinh(ketQua);
  }, [khoOtp]);

  const goAuth = (page: 'login' | 'register') => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    luuDichQuayLai(buildEventReturnTarget(event));
    navigatePublicRoute(page);
  };
  const authHref = (page: 'login' | 'register') => buildPublicPath(window.location.pathname, page);

  if (allowed) {
    const hienThongBaoDangNhap = canBaoDangNhap && daDangNhap === false;
    return (
      <>
        {hienThongBaoDangNhap ? (
          <div className="et-otp-login-banner" role="status" aria-live="polite" data-testid="yeu-cau-dang-nhap-giu-cho">
            <p className="et-otp-login-banner__text">
              <strong>Cần đăng nhập để giữ ghế:</strong> bạn vẫn xem được sơ đồ, nhưng chỉ tài khoản người mua đã đăng nhập mới
              giữ được ghế hoặc vé. Sau khi đăng nhập bạn sẽ quay lại đúng sự kiện này.
            </p>
            <div className="et-otp-actions">
              <a className="et-otp-btn et-otp-btn--primary" href={authHref('login')} onClick={goAuth('login')}>
                Đăng nhập
              </a>
              <a className="et-otp-btn" href={authHref('register')} onClick={goAuth('register')}>
                Đăng ký
              </a>
            </div>
          </div>
        ) : null}
        {children}
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

  const status = gateCurrent?.status ?? TRANG_THAI_CONG.DANG_KIEM_TRA;

  if (status === TRANG_THAI_CONG.CAN_DANG_NHAP) {
    return (
      <GateFrame title="Đăng nhập để chọn vé">
        {runtimeConfig.useMockData ? (
          <p className="et-otp-badge">Chế độ mô phỏng: không gửi email thật.</p>
        ) : null}
        <p className="et-otp-text">
          Sự kiện này yêu cầu xác minh OTP qua email trước khi chọn ghế hoặc vé đứng. Hãy đăng nhập bằng tài khoản
          người mua vé; sau khi đăng nhập bạn sẽ quay lại đúng sự kiện và suất diễn này.
        </p>
        <div className="et-otp-actions">
          <a className="et-otp-btn et-otp-btn--primary" href={authHref('login')} onClick={goAuth('login')}>
            Đăng nhập
          </a>
          <a className="et-otp-btn" href={authHref('register')} onClick={goAuth('register')}>
            Đăng ký
          </a>
        </div>
      </GateFrame>
    );
  }

  if (status === TRANG_THAI_CONG.CAN_OTP && session) {
    return (
      <GateFrame title="Xác minh OTP để chọn vé">
        <OtpVerificationPanel
          session={session}
          eventId={event.id}
          isMock={runtimeConfig.useMockData}
          onVerified={handleVerified}
          khoOtp={khoOtp}
        />
      </GateFrame>
    );
  }

  if (status === TRANG_THAI_CONG.LOI) {
    return (
      <GateFrame title="Chưa thể xác nhận quyền chọn vé">
        <p className="et-otp-message et-otp-message--error" role="alert" aria-live="assertive">
          <strong>Lỗi:</strong> {gateCurrent?.loi?.thongBao ?? 'Không thể xác nhận trạng thái xác minh OTP.'}
        </p>
        {gateCurrent?.coTheThuLai ? (
          <div className="et-otp-actions">
            <button
              type="button"
              className="et-otp-btn et-otp-btn--primary"
              onClick={() => void congRef.current?.thuLai()}
            >
              Thử lại
            </button>
          </div>
        ) : null}
      </GateFrame>
    );
  }

  return (
    <GateFrame title="Đang kiểm tra xác minh OTP">
      <p className="et-otp-message" role="status" aria-live="polite">
        <strong>Đang kiểm tra:</strong> Đang xác nhận phiên đăng nhập và trạng thái xác minh OTP…
      </p>
    </GateFrame>
  );
}
