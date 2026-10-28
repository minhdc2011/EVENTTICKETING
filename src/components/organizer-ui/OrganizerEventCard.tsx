import type React from 'react';
import {buildPublicPath, deduplicateSlug, navigatePublicRoute} from '../../domain/publicRoute';
import type {OrganizerEvent} from '../../services/organizerService';
import {
  IconCalendar,
  IconEdit,
  IconExternalLink,
  IconPublish,
  IconSpinner,
  IconTicket,
} from './OrganizerIcons';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type OrganizerEventCardProps = {
  key?: React.Key;
  event: OrganizerEvent;
  canEdit: boolean;
  isPublishing: boolean;
  onEdit: (id: number) => void;
  onPublish: (id: number) => void;
};

export function OrganizerEventCard({
  event,
  canEdit,
  isPublishing,
  onEdit,
  onPublish,
}: OrganizerEventCardProps) {
  const isPublished = event.status === 'CONG_KHAI';
  const eventDateFormatted = (() => {
    try {
      return dateFormatter.format(new Date(event.startsAt));
    } catch {
      return event.startsAt;
    }
  })();

  const previewPath = `events/${deduplicateSlug(event.slug)}${!isPublished ? '?preview=1' : ''}`;

  function handleNavigatePreview(e: React.MouseEvent) {
    if (!e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigatePublicRoute(previewPath);
    }
  }

  return (
    <article className="org-event-card">
      <div className="org-event-info">
        <div className="org-event-badge-row">
          <span
            className={`org-chip ${
              isPublished ? 'org-chip-published' : 'org-chip-draft'
            } organizer-status organizer-status--${event.status.toLowerCase()}`}
          >
            {isPublished ? 'Đã công bố' : 'Bản nháp'}
          </span>
          <span style={{fontSize: '12px', color: 'var(--org-text-muted)'}}>
            #{event.id}
          </span>
        </div>

        <h3 className="org-event-name">{event.name}</h3>

        <div className="org-event-meta-row">
          <span className="org-event-meta-item">
            <IconCalendar size={15} style={{color: 'var(--org-text-muted)'}} />
            <span>{eventDateFormatted}</span>
          </span>

          <span className="org-event-meta-item">
            <IconTicket size={15} style={{color: 'var(--org-text-muted)'}} />
            <span>{event.showCount} suất diễn</span>
          </span>
        </div>
      </div>

      <div className="org-event-actions">
        {canEdit && (
          <button
            type="button"
            className="org-btn org-btn-secondary"
            onClick={() => onEdit(event.id)}
            title="Chỉnh sửa thông tin sự kiện"
          >
            <IconEdit size={14} />
            <span>Chỉnh sửa</span>
          </button>
        )}

        <a
          className="org-event-btn-preview"
          href={buildPublicPath(window.location.pathname, previewPath)}
          onClick={handleNavigatePreview}
          title={isPublished ? 'Xem trang sự kiện trên marketplace' : 'Xem trang nháp trước khi mở bán'}
        >
          <span>{isPublished ? 'Trang công khai' : 'Xem trước'}</span>
          <IconExternalLink size={13} />
        </a>

        {!isPublished && (
          <button
            type="button"
            className="org-btn org-btn-primary"
            onClick={() => onPublish(event.id)}
            disabled={isPublishing || !canEdit}
            title={
              !canEdit
                ? 'Chỉ chủ sở hữu, quản trị viên hoặc biên tập viên mới có thể công bố'
                : 'Công bố sự kiện lên Marketplace'
            }
          >
            {isPublishing ? (
              <>
                <IconSpinner size={15} />
                <span>Đang công bố…</span>
              </>
            ) : (
              <>
                <IconPublish size={15} />
                <span>Công bố</span>
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}
