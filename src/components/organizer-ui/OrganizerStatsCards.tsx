import {IconCalendar, IconCheck, IconEdit} from './OrganizerIcons';

type OrganizerStatsCardsProps = {
  totalCount: number;
  publishedCount: number;
  draftCount: number;
};

export function OrganizerStatsCards({
  totalCount,
  publishedCount,
  draftCount,
}: OrganizerStatsCardsProps) {
  return (
    <section className="org-stats-grid" aria-label="Thống kê tổng quan sự kiện">
      <div className="org-stat-card">
        <div className="org-stat-header">
          <span className="org-stat-title">Tổng số sự kiện</span>
          <IconCalendar size={18} style={{color: 'var(--org-text-muted)'}} />
        </div>
        <div className="org-stat-value">{totalCount}</div>
        <div className="org-stat-hint">Toàn bộ sự kiện thuộc tổ chức đang chọn</div>
      </div>

      <div className="org-stat-card">
        <div className="org-stat-header">
          <span className="org-stat-title">Đã công bố (Live)</span>
          <IconCheck size={18} style={{color: 'var(--org-status-success)'}} />
        </div>
        <div className="org-stat-value" style={{color: '#86efac'}}>{publishedCount}</div>
        <div className="org-stat-hint">Đang mở bán công khai trên Marketplace</div>
      </div>

      <div className="org-stat-card">
        <div className="org-stat-header">
          <span className="org-stat-title">Bản nháp (Draft)</span>
          <IconEdit size={18} style={{color: 'var(--org-status-warning)'}} />
        </div>
        <div className="org-stat-value" style={{color: '#fde047'}}>{draftCount}</div>
        <div className="org-stat-hint">Đang thiết lập, chưa hiển thị cho khán giả</div>
      </div>
    </section>
  );
}
