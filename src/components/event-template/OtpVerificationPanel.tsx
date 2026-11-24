import {useCallback, useEffect, useId, useRef, useState, type FormEvent} from 'react';
import type {BuyerSession} from '../../services/buyerAuthService';
import {
  CHO_GUI_LAI_GIAY,
  HIEU_LUC_GIAY,
  MA_MO_PHONG,
  NHAN_MO_PHONG,
  OtpServiceError,
  SO_LAN_GUI_LAI_TOI_DA,
  SO_LAN_SAI_TOI_DA,
  capNhatSauLoi,
  datLaiSauThanhCong,
  guiMaOtp,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  tinhThoiGianOtp,
  xacMinhMaOtp,
  type KetQuaXacMinhMaOtp,
  type KhoTrangThaiOtpPhien,
  type TrangThaiOtp,
} from '../../services/otpService';
import './OtpVerificationPanel.css';

export type OtpVerificationPanelProps = {
  session: BuyerSession;
  eventId: number | string;
  isMock: boolean;
  onVerified: (ketQua: KetQuaXacMinhMaOtp) => void | Promise<void>;
  /** Kho trạng thái và yêu cầu OTP theo phiên (giữ qua remount panel, không bao giờ gồm mã nhập). */
  khoOtp?: KhoTrangThaiOtpPhien;
  /** Lấy trạng thái đã lưu của phiên người mua (cooldown, lượt nhập sai) khi không truyền khoOtp. */
  layTrangThai?: () => TrangThaiOtp | null;
  /** Báo trạng thái mới để cha lưu qua lần mount lại khi không truyền khoOtp. */
  onTrangThaiChange?: (trangThai: TrangThaiOtp) => void;
};

const MA_TOI_DA = 10;
const MA_TOI_THIEU = 6;

function dinhDangGiay(giay: number): string {
  const s = Math.max(0, Math.floor(giay));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function thongBaoTuLoi(err: unknown): string {
  // OtpServiceError.message luôn là câu tiếng Việt cố định, không chứa mã OTP.
  return err instanceof OtpServiceError ? err.message : thongBaoLoiOtp('KHONG_XAC_DINH');
}

export function OtpVerificationPanel({
  session,
  eventId,
  isMock,
  onVerified,
  khoOtp,
  layTrangThai,
  onTrangThaiChange,
}: OtpVerificationPanelProps) {
  const baseId = useId();
  const inputId = `${baseId}-code`;
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;

  const layTrangThaiRef = useRef(layTrangThai);
  layTrangThaiRef.current = layTrangThai;
  const onTrangThaiChangeRef = useRef(onTrangThaiChange);
  onTrangThaiChangeRef.current = onTrangThaiChange;
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const initRef = useRef<{
    trangThai: TrangThaiOtp;
    busy: 'send' | 'verify' | null;
    error: string | null;
    notice: string | null;
  } | null>(null);
  if (!initRef.current) {
    const ct = khoOtp ? khoOtp.layChiTiet(session) : null;
    const st = ct?.trangThai ?? layTrangThaiRef.current?.() ?? taoTrangThaiOtp(session.email);
    initRef.current = {
      trangThai: st,
      busy: ct?.busy ?? null,
      error: ct?.error ?? null,
      notice: ct?.notice ?? null,
    };
  }

  const [trangThai, setTrangThai] = useState<TrangThaiOtp>(() => initRef.current!.trangThai);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Math.max(Date.now(), initRef.current!.trangThai.guiLuc ?? 0));
  const [busy, setBusy] = useState<'send' | 'verify' | null>(() => initRef.current!.busy);
  const [error, setError] = useState<string | null>(() => initRef.current!.error);
  const [notice, setNotice] = useState<string | null>(() => initRef.current!.notice);

  const trangThaiRef = useRef(trangThai);
  trangThaiRef.current = trangThai;
  // Tăng mỗi khi đổi tài khoản/sự kiện/unmount để bỏ cập nhật UI cũ (với khoOtp, kết quả được giữ ở kho).
  const epochRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const syncFromStore = useCallback(() => {
    if (!khoOtp) return;
    const s = sessionRef.current;
    const ct = khoOtp.layChiTiet(s);
    const st = ct?.trangThai ?? taoTrangThaiOtp(s.email);
    trangThaiRef.current = st;
    setTrangThai(st);
    setBusy(ct?.busy ?? null);
    setError(ct?.error ?? null);
    setNotice(ct?.notice ?? null);
    setNow(Math.max(Date.now(), st.guiLuc ?? 0));
  }, [khoOtp]);

  useEffect(() => {
    epochRef.current += 1;
    setCode('');
    if (khoOtp) {
      const unsubscribe = khoOtp.dangKy(syncFromStore);
      syncFromStore();
      return () => {
        epochRef.current += 1;
        setCode('');
        unsubscribe();
      };
    }
    // Cùng phiên người mua → khôi phục cooldown/lượt nhập sai từ cha; đổi phiên → cha trả trạng thái trống.
    const st = layTrangThaiRef.current?.() ?? taoTrangThaiOtp(session.email);
    trangThaiRef.current = st;
    setTrangThai(st);
    setError(null);
    setNotice(null);
    setBusy(null);
    setNow(Math.max(Date.now(), st.guiLuc ?? 0));
    return () => {
      epochRef.current += 1;
      setCode('');
    };
  }, [khoOtp, syncFromStore, session.userId, session.email, eventId]);

  // Gắn onVerified hiện hành vào kho theo vòng đời mount: xác minh bắt đầu ở gate cũ nhưng hoàn tất sau khi gate mới
  // mount sẽ gọi đúng handler mới; khi unmount hoàn toàn handler được gỡ nên kho chỉ cập nhật trạng thái.
  useEffect(() => {
    if (!khoOtp) return;
    return khoOtp.ganOnVerified?.(session, (ketQua) => onVerifiedRef.current(ketQua));
  }, [khoOtp, session.userId, session.email]);

  const daGui = trangThai.guiLuc !== null;
  const thoiGian = tinhThoiGianOtp(trangThai, now);

  useEffect(() => {
    if (!daGui && !thoiGian.biTamKhoaNhap) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [daGui, thoiGian.biTamKhoaNhap]);

  const gui = useCallback(async () => {
    if (busy) return;
    if (khoOtp) {
      const epoch = epochRef.current;
      await khoOtp.thucHienGui(session, {
        guiMaOtp,
        thongBaoThanhCong: isMock
          ? 'Đã tạo yêu cầu gửi mã (mô phỏng, không có email thật được gửi).'
          : 'Đã gửi mã xác minh tới email của bạn.',
        thongBaoLoi: thongBaoTuLoi,
      });
      if (epoch === epochRef.current && !khoOtp.layChiTiet(session)?.error) {
        inputRef.current?.focus();
      }
      return;
    }
    const epoch = epochRef.current;
    setBusy('send');
    setError(null);
    setNotice(null);
    const st = trangThaiRef.current;
    try {
      const ketQua = await guiMaOtp(session.email, {trangThai: st, userId: session.userId});
      if (epoch !== epochRef.current) return;
      trangThaiRef.current = ketQua.trangThai;
      setTrangThai(ketQua.trangThai);
      onTrangThaiChangeRef.current?.(ketQua.trangThai);
      // Mốc gửi được ghi lúc yêu cầu hoàn tất; đồng hồ hiển thị không được đứng trước mốc đó.
      setNow(Math.max(Date.now(), ketQua.trangThai.guiLuc ?? 0));
      setNotice(
        isMock
          ? 'Đã tạo yêu cầu gửi mã (mô phỏng, không có email thật được gửi).'
          : 'Đã gửi mã xác minh tới email của bạn.',
      );
      inputRef.current?.focus();
    } catch (err) {
      if (epoch !== epochRef.current) return;
      const next = capNhatSauLoi(st, err, Date.now());
      trangThaiRef.current = next;
      setTrangThai(next);
      onTrangThaiChangeRef.current?.(next);
      setNow(Date.now());
      setError(thongBaoTuLoi(err));
    } finally {
      if (epoch === epochRef.current) setBusy(null);
    }
  }, [busy, isMock, khoOtp, session]);

  const xacMinh = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (busy) return;
      if (khoOtp) {
        const epoch = epochRef.current;
        const maNhap = code;
        setCode('');
        await khoOtp.thucHienXacMinh(session, maNhap, {
          xacMinhMaOtp,
          thongBaoLoi: thongBaoTuLoi,
        });
        if (epoch === epochRef.current && khoOtp.layChiTiet(session)?.error) {
          inputRef.current?.focus();
        }
        return;
      }
      const epoch = epochRef.current;
      const st = trangThaiRef.current;
      const maNhap = code;
      setBusy('verify');
      setError(null);
      setNotice(null);
      try {
        const ketQua = await xacMinhMaOtp(session.email, maNhap, session.userId, {trangThai: st});
        if (epoch !== epochRef.current) return;
        setCode('');
        const sach = datLaiSauThanhCong(ketQua.trangThai ?? st);
        trangThaiRef.current = sach;
        setTrangThai(sach);
        onTrangThaiChangeRef.current?.(sach);
        setNotice('Xác minh thành công. Đang kiểm tra quyền vào chọn vé…');
        await onVerifiedRef.current(ketQua);
      } catch (err) {
        if (epoch !== epochRef.current) return;
        setCode('');
        const next = capNhatSauLoi(st, err, Date.now());
        trangThaiRef.current = next;
        setTrangThai(next);
        onTrangThaiChangeRef.current?.(next);
        setNow(Date.now());
        setError(thongBaoTuLoi(err));
        inputRef.current?.focus();
      } finally {
        if (epoch === epochRef.current) setBusy(null);
      }
    },
    [busy, code, khoOtp, session],
  );

  const khongGuiDuoc = busy !== null || (daGui && !thoiGian.coTheGuiLai);
  const khongXacMinhDuoc =
    busy !== null || !daGui || thoiGian.biTamKhoaNhap || code.length < MA_TOI_THIEU || !thoiGian.conHieuLuc;

  return (
    <div className="et-otp-card">
      <p className="et-otp-kicker">Xác minh khi thanh toán</p>
      <h3 className="et-otp-title">Nhập mã OTP gửi qua email</h3>
      {isMock ? (
        <p className="et-otp-badge" data-nguon={NHAN_MO_PHONG}>
          Chế độ mô phỏng: không gửi email thật, kết quả không phải xác minh thật.
        </p>
      ) : null}
      {isMock ? (
        <p className="et-otp-note" data-testid="goi-y-ma-mo-phong">
          Mã OTP mô phỏng để thử: <strong>{MA_MO_PHONG}</strong> (bấm Gửi mã trước; chỉ có ở chế độ mô phỏng).
        </p>
      ) : null}
      <p className="et-otp-text">
        Mã sẽ được gửi tới email của tài khoản đang đăng nhập: <strong>{session.email}</strong>.
      </p>

      <form className="et-otp-form" onSubmit={xacMinh} noValidate>
        <div className="et-otp-field">
          <label className="et-otp-label" htmlFor={inputId}>
            Mã OTP
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="et-otp-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={MA_TOI_DA}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, MA_TOI_DA))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            disabled={busy === 'verify'}
          />
          <p id={hintId} className="et-otp-note">
            Chỉ nhập chữ số ({MA_TOI_THIEU}–{MA_TOI_DA} số). Mã được che khi nhập.
          </p>
        </div>

        <div className="et-otp-actions">
          <button type="submit" className="et-otp-btn et-otp-btn--primary" disabled={khongXacMinhDuoc}>
            {busy === 'verify' ? 'Đang xác minh…' : 'Xác minh'}
          </button>
          <button type="button" className="et-otp-btn" onClick={() => void gui()} disabled={khongGuiDuoc}>
            {busy === 'send'
              ? 'Đang gửi…'
              : !daGui
                ? 'Gửi mã'
                : thoiGian.giayChoGuiLai > 0
                  ? `Gửi lại sau ${thoiGian.giayChoGuiLai} giây`
                  : 'Gửi lại mã'}
          </button>
        </div>

        <div role="alert" aria-live="assertive" aria-atomic="true">
          {error ? (
            <p id={errorId} className="et-otp-message et-otp-message--error">
              <strong>Lỗi:</strong> {error}
            </p>
          ) : null}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          {notice ? (
            <p className="et-otp-message et-otp-message--ok">
              <strong>Thông báo:</strong> {notice}
            </p>
          ) : null}
        </div>

        <ul className="et-otp-meta" aria-label="Thời gian và số lần còn lại">
          <li>
            Hiệu lực còn lại:{' '}
            {daGui ? (thoiGian.conHieuLuc ? dinhDangGiay(thoiGian.giayConHieuLuc) : 'đã hết hiệu lực') : 'chưa gửi mã'}
            {daGui ? ` (mã có hiệu lực ${HIEU_LUC_GIAY / 60} phút)` : ''}
          </li>
          <li>
            Chờ gửi lại:{' '}
            {daGui && thoiGian.giayChoGuiLai > 0
              ? `${thoiGian.giayChoGuiLai} giây (tối thiểu ${CHO_GUI_LAI_GIAY} giây giữa hai lần gửi)`
              : 'có thể gửi'}
          </li>
          <li>
            Lượt gửi lại còn lại: {thoiGian.soLanGuiLaiConLai}/{SO_LAN_GUI_LAI_TOI_DA}
          </li>
          <li>
            Lượt nhập còn lại: {thoiGian.soLanSaiConLai}/{SO_LAN_SAI_TOI_DA}
          </li>
        </ul>
        <p className="et-otp-note">
          Các số lần còn lại chỉ là bộ đếm hiển thị trên thiết bị này ({thoiGian.gioiHanHienThi.phut} phút cho lượt
          nhập), không phải bộ đếm của máy chủ.
          {thoiGian.biTamKhoaNhap ? ' Ô xác minh tạm dừng trên thiết bị này; vui lòng chờ rồi thử lại.' : ''}
        </p>
      </form>
    </div>
  );
}
