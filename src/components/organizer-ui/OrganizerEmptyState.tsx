import {IconAlertTriangle, IconCalendar, IconPlus, IconSpinner} from './OrganizerIcons';

type OrganizerEmptyStateProps = {
  type: 'no-events' | 'no-match' | 'loading' | 'error';
  message?: string;
  canEdit?: boolean;
  onCreateEvent?: () => void;
  onRetry?: () => void;
  onResetFilter?: () => void;
  onInitDemo?: () => void;
  busyDemo?: boolean;
};

export function OrganizerEmptyState({
  type,
  message,
  canEdit,
  onCreateEvent,
  onRetry,
  onResetFilter,
  onInitDemo,
  busyDemo = false,
}: OrganizerEmptyStateProps) {
  if (type === 'loading') {
    return (
      <div className="org-empty-card organizer-empty" role="status" aria-live="polite">
        <div className="org-empty-icon">
          <IconSpinner size={24} style={{color: 'var(--org-lime)'}} />
        </div>
        <h3 className="org-empty-title">Đang tải dữ liệu không gian làm việc…</h3>
        <p className="org-empty-desc">
          Hệ thống đang đồng bộ danh sách tổ chức và sự kiện từ cơ sở dữ liệu.
        </p>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className="org-empty-card organizer-empty" role="alert">
        <div className="org-empty-icon" style={{borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--org-status-danger)'}}>
          <IconAlertTriangle size={24} />
        </div>
        <h3 className="org-empty-title">Không thể nạp dữ liệu workspace</h3>
        <p className="org-empty-desc">
          {message || 'Vui lòng kiểm tra quyền truy cập RLS của tài khoản hoặc thử tải lại trang.'}
        </p>
        {onRetry && (
          <button type="button" className="org-btn org-btn-secondary" onClick={onRetry}>
            Thử tải lại dữ liệu
          </button>
        )}
      </div>
    );
  }

  if (type === 'no-match') {
    return (
      <div className="org-empty-card organizer-empty">
        <div className="org-empty-icon">
          <IconCalendar size={24} />
        </div>
        <h3 className="org-empty-title">Không có sự kiện nào khớp bộ lọc</h3>
        <p className="org-empty-desc">
          Thử xóa từ khóa tìm kiếm hoặc chuyển về xem tất cả sự kiện trong tổ chức.
        </p>
        {onResetFilter && (
          <button type="button" className="org-btn org-btn-secondary" onClick={onResetFilter}>
            Xem tất cả sự kiện
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="org-empty-card organizer-empty">
      <div className="org-empty-icon">
        <IconCalendar size={24} />
      </div>
      <h3 className="org-empty-title">Bắt đầu tạo sự kiện đầu tiên</h3>
      <p className="org-empty-desc">
        Thiết lập suất diễn, phân khu hạng vé (đứng hoặc có sơ đồ ghế ngồi) và xem trước trang bán vé trước khi công bố.
      </p>
      <div className="org-empty-actions">
        {canEdit && onCreateEvent && (
          <button
            type="button"
            className="org-btn org-btn-primary"
            onClick={onCreateEvent}
          >
            <IconPlus size={16} />
            <span>Tạo sự kiện đầu tiên</span>
          </button>
        )}
        {onInitDemo && (
          <button
            type="button"
            className="org-btn org-btn-secondary"
            onClick={onInitDemo}
            disabled={busyDemo}
            title="Khởi tạo dữ liệu mẫu để thử nghiệm luồng cấu hình giá và danh sách sự kiện"
          >
            {busyDemo ? 'Đang nạp dữ liệu mẫu…' : 'Nạp dữ liệu mẫu (Demo)'}
          </button>
        )}
      </div>
    </div>
  );
}
