import type {OrganizerMembership} from '../../services/organizerService';
import {IconBuilding, IconLogout, IconShield} from './OrganizerIcons';

const roleLabels: Record<string, string> = {
  CHU_SO_HUU: 'Chủ sở hữu',
  QUAN_TRI: 'Quản trị viên',
  BIEN_TAP: 'Biên tập viên',
  VAN_HANH: 'Vận hành (Chỉ xem)',
  SOAT_VE: 'Soát vé (Chỉ xem)',
};

type OrganizerSidebarProps = {
  memberships: OrganizerMembership[];
  activeOrg: OrganizerMembership | null;
  onSelectOrg: (orgId: string) => void;
  userEmail: string;
  onLogout: () => Promise<void> | void;
};

export function OrganizerSidebar({
  memberships,
  activeOrg,
  onSelectOrg,
  userEmail,
  onLogout,
}: OrganizerSidebarProps) {
  return (
    <aside className="org-sidebar" aria-label="Bảng điều khiển không gian làm việc">
      <div className="org-sidebar-mobile-top">
        <div className="org-sidebar-org-block">
          <div className="org-sidebar-section-title">KHÔNG GIAN LÀM VIỆC</div>

          <div style={{marginTop: '10px'}}>
            {memberships.length > 1 ? (
              <div className="org-sidebar-org-card">
                <label className="org-label">
                  <span>Chọn tổ chức</span>
                  <select
                    className="org-select"
                    value={activeOrg?.organizationId || ''}
                    onChange={(e) => onSelectOrg(e.target.value)}
                    style={{minHeight: '40px', fontSize: '13px'}}
                  >
                    {memberships.map((m) => (
                      <option key={m.organizationId} value={m.organizationId}>
                        {m.organizationName}
                      </option>
                    ))}
                  </select>
                </label>
                {activeOrg && (
                  <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                    <span className="org-chip org-chip-role">
                      {roleLabels[activeOrg.role] || activeOrg.role}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="org-sidebar-org-card">
                <div className="org-sidebar-org-header">
                  <div className="org-sidebar-org-avatar">
                    <IconBuilding size={18} />
                  </div>
                  <div style={{minWidth: 0, flex: 1}}>
                    <div className="org-sidebar-org-name">
                      {activeOrg?.organizationName || 'Chưa có tổ chức'}
                    </div>
                    {activeOrg && (
                      <div style={{marginTop: '4px'}}>
                        <span className="org-chip org-chip-role">
                          {roleLabels[activeOrg.role] || activeOrg.role}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="org-sidebar-nav" aria-label="Menu chức năng">
          <a className="org-sidebar-nav-item is-active" href="#overview">
            <span style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--org-lime)'}} />
            <span>Tổng quan</span>
          </a>
          <a className="org-sidebar-nav-item" href="#events">
            <span style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--org-text-muted)'}} />
            <span>Danh sách Sự kiện</span>
          </a>
        </nav>
      </div>

      <div className="org-sidebar-mobile-bottom">
        <div className="org-sidebar-security-note">
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px'}}>
            <IconShield size={14} style={{color: 'var(--org-lime)'}} />
            <span>Bảo mật dữ liệu (RLS)</span>
          </div>
          Phân quyền quản lý được cô lập nghiêm ngặt theo tổ chức bằng Postgres Row Level Security.
        </div>

        <div className="org-sidebar-footer">
          <div className="org-sidebar-user-info">
            <span style={{fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--org-text-muted)'}}>
              Tài khoản hiện tại
            </span>
            <span className="org-sidebar-user-email" title={userEmail}>
              {userEmail}
            </span>
          </div>

          <button
            type="button"
            className="org-sidebar-logout-btn"
            onClick={onLogout}
          >
            <IconLogout size={16} />
            <span>Đăng xuất Studio</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
