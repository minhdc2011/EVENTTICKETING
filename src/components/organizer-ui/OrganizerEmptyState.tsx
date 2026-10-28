import {IconAlertTriangle, IconCalendar, IconPlus, IconSpinner} from './OrganizerIcons';

type OrganizerEmptyStateProps = {
  type: 'no-events' | 'loading' | 'error';
  message?: string;
  canEdit?: boolean;
  onCreateEvent?: () => void;
  onRetry?: () => void;
};

export function OrganizerEmptyState({
  type,
  message,
  canEdit,
  onCreateEvent,
  onRetry,
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
        <div className="org-empty-icon" style={{borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171'}}>
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

  return (
    <div className="org-empty-card organizer-empty">
      <div className="org-empty-icon">
        <IconCalendar size={24} />
      </div>
      <h3 className="org-empty-title">Chưa có sự kiện nào trong tổ chức</h3>
      <p className="org-empty-desc">
        Bắt đầu bằng cách tạo bản nháp sự kiện đầu tiên. Bạn có thể cấu hình lịch trình biểu diễn, sơ đồ giá vé và kiểm tra trước khi công bố.
      </p>
      {canEdit && onCreateEvent && (
        <button
          type="button"
          className="org-btn org-btn-primary"
          onClick={onCreateEvent}
          style={{marginTop: '8px'}}
        >
          <IconPlus size={16} />
          <span>Tạo sự kiện đầu tiên</span>
        </button>
      )}
    </div>
  );
}
