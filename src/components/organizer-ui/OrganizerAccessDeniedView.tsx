import {useState} from 'react';
import {navigatePublicRoute} from '../../domain/publicRoute';
import type {OrganizerSession} from '../../services/organizerService';
import {IconArrowLeft, IconLogout, IconShield, IconSpinner} from './OrganizerIcons';

// Simple Lock icon fallback if IconLock is not defined, or let's use IconShield
type OrganizerAccessDeniedViewProps = {
  session: OrganizerSession;
  onSignOut: () => Promise<void>;
};

export function OrganizerAccessDeniedView({
  session,
  onSignOut,
}: OrganizerAccessDeniedViewProps) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="org-denied-wrapper">
      <div className="org-denied-card organizer-auth-card">
        <div className="org-denied-badge">
          <IconShield size={16} />
          <span>TRUY CẬP BỊ TỪ CHỐI · TÀI KHOẢN KHÁN GIẢ (USER)</span>
        </div>

        <h1 className="org-denied-title">
          Không có quyền truy cập Studio Ban tổ chức
        </h1>

        <p className="org-denied-body">
          Tài khoản <strong style={{color: 'var(--org-text-primary)'}}>{session.email}</strong> hiện là{' '}
          <strong>Khán giả / Người mua vé (USER)</strong>. Studio Ban tổ chức chỉ dành riêng cho tài khoản đã được cấp quyền Ban tổ chức (ORGANIZER).
        </p>

        <div className="org-denied-policy-box">
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px'}}>
            <IconShield size={16} style={{color: 'var(--org-lime)'}} />
            <span>Chính sách an toàn thương mại</span>
          </div>
          <p style={{margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6}}>
            Nhằm ngăn ngừa tình trạng tạo sự kiện mạo danh hoặc lừa đảo bán vé trên nền tảng, tài khoản khán giả thông thường không thể tự cấp quyền Ban tổ chức. Mọi quyền tổ chức sự kiện cần được Quản trị viên hệ thống xác minh pháp nhân và kích hoạt chính thức.
          </p>
        </div>

        <div className="org-denied-actions">
          <button
            type="button"
            className="org-btn org-btn-primary"
            onClick={() => navigatePublicRoute('events')}
            style={{flex: 1, minWidth: '180px'}}
          >
            <IconArrowLeft size={16} />
            <span>Về trang bán vé</span>
          </button>

          <button
            type="button"
            className="org-btn org-btn-danger"
            onClick={handleLogout}
            disabled={busy}
            style={{flex: 1, minWidth: '180px'}}
          >
            {busy ? (
              <>
                <IconSpinner size={16} />
                <span>Đang xử lý…</span>
              </>
            ) : (
              <>
                <IconLogout size={16} />
                <span>Đăng xuất tài khoản này</span>
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
