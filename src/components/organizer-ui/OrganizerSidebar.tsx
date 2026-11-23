import type {OrganizerMembership} from '../../services/organizerService';
import {IconBuilding, IconCalendar, IconCheck, IconEdit} from './OrganizerIcons';

const roleLabels: Record<string, string> = {
  CHU_SO_HUU: 'Chủ sở hữu',
  QUAN_TRI: 'Quản trị viên',
  BIEN_TAP: 'Biên tập viên',
  VAN_HANH: 'Vận hành (Chỉ xem)',
  SOAT_VE: 'Soát vé (Chỉ xem)',
};

export type OrganizerEventFilter = 'ALL' | 'CONG_KHAI' | 'BAN_NHAP';

type OrganizerSidebarProps = {
  memberships: OrganizerMembership[];
  activeOrg: OrganizerMembership | null;
  onSelectOrg: (orgId: string) => void;
  userEmail: string;
  activeFilter?: OrganizerEventFilter;
  onSelectFilter?: (filter: OrganizerEventFilter) => void;
  counts?: {total: number; published: number; draft: number};
};

export function OrganizerSidebar({
  memberships,
  activeOrg,
  onSelectOrg,
  userEmail,
  activeFilter = 'ALL',
  onSelectFilter,
  counts = {total: 0, published: 0, draft: 0},
}: OrganizerSidebarProps) {
  const navItems: Array<{
    key: OrganizerEventFilter;
    label: string;
    count: number;
    icon: typeof IconCalendar;
  }> = [
    {key: 'ALL', label: 'Tất cả sự kiện', count: counts.total, icon: IconCalendar},
    {key: 'CONG_KHAI', label: 'Đã công bố', count: counts.published, icon: IconCheck},
    {key: 'BAN_NHAP', label: 'Bản nháp', count: counts.draft, icon: IconEdit},
  ];

  return (
    <aside className="org-sidebar" aria-label="Bảng điều khiển không gian làm việc">
      <div className="org-sidebar-mobile-top">
        <div className="org-sidebar-org-block">
          <div className="org-sidebar-section-title">TỔ CHỨC ĐANG QUẢN LÝ</div>

          <div style={{marginTop: '10px'}}>
            {memberships.length > 1 ? (
              <div className="org-sidebar-org-card">
                <label className="org-label">
                  <span>Chọn tổ chức</span>
                  <select
                    className="org-select"
                    value={activeOrg?.organizationId || ''}
                    onChange={(e) => onSelectOrg(e.target.value)}
                    style={{minHeight: '44px', fontSize: '13px'}}
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

        <nav className="org-sidebar-nav" aria-label="Lọc sự kiện theo trạng thái">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`org-sidebar-nav-item ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectFilter?.(item.key)}
              >
                <Icon size={15} />
                <span className="org-sidebar-nav-label">{item.label}</span>
                <span className="org-sidebar-nav-count">{item.count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="org-sidebar-mobile-bottom">
        <div className="org-sidebar-footer">
          <div className="org-sidebar-user-info">
            <span className="org-sidebar-user-label">Tài khoản đang dùng</span>
            <span className="org-sidebar-user-email" title={userEmail}>
              {userEmail}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
