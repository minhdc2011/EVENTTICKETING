import {useState} from 'react';
import type React from 'react';
import {buildPublicPath, deduplicateSlug, navigatePublicRoute} from '../../domain/publicRoute';
import type {OrganizerEvent} from '../../services/organizerService';
import {
  IconCalendar,
  IconEdit,
  IconExternalLink,
  IconPublish,
  IconShield,
  IconSliders,
  IconSpinner,
  IconTicket,
  IconTrash,
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
  canManagePricing?: boolean;
  onOpenPricing?: (event: OrganizerEvent) => void;
  canManagePurchaseConfig?: boolean;
  onOpenPurchaseConfig?: (event: OrganizerEvent) => void;
  /** Chủ sở hữu hoặc quản trị của tổ chức: được xóa (bản nháp hoặc sự kiện đã kết thúc). */
  canDelete?: boolean;
  isDeleting?: boolean;
  onDelete?: (id: number) => void;
};

export function OrganizerEventCard({
  event,
  canEdit,
  isPublishing,
  onEdit,
  onPublish,
  canManagePricing = false,
  onOpenPricing,
  canManagePurchaseConfig = false,
  onOpenPurchaseConfig,
  canDelete = false,
  isDeleting = false,
  onDelete,
}: OrganizerEventCardProps) {
  const isPublished = event.status === 'CONG_KHAI';
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const endMs = Date.parse(event.endsAt ?? event.startsAt);
  const isEnded = Number.isFinite(endMs) && endMs < Date.now();
  const deletable = !isPublished || isEnded;
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

        {canManagePricing && onOpenPricing && (
          <button
            type="button"
            className="org-btn org-btn-secondary"
            onClick={() => onOpenPricing(event)}
            title="Cấu hình định giá động và chạy tính giá"
          >
            <IconSliders size={14} />
            <span>Cấu hình giá</span>
          </button>
        )}

        {canManagePurchaseConfig && onOpenPurchaseConfig && (
          <button
            type="button"
            className="org-btn org-btn-secondary"
            onClick={() => onOpenPurchaseConfig(event)}
            title="Cấu hình xác minh OTP và số vé tối đa mỗi đơn"
          >
            <IconShield size={14} />
            <span>Cấu hình mua vé</span>
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

        {canDelete && onDelete && (
          <button
            type="button"
            className="org-btn org-btn-danger org-event-btn-delete"
            onClick={() => setConfirmingDelete(true)}
            disabled={!deletable || isDeleting}
            title={
              deletable
                ? 'Xóa sự kiện (ẩn khỏi danh sách và trang công khai)'
                : 'Chỉ xóa được bản nháp hoặc sự kiện đã kết thúc'
            }
          >
            <IconTrash size={14} />
            <span>Xóa</span>
          </button>
        )}

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

      {confirmingDelete && onDelete && (
        <div className="org-event-delete-confirm" role="alertdialog" aria-label={`Xác nhận xóa sự kiện ${event.name}`}>
          <p>
            Xóa sự kiện <strong>{event.name}</strong>? Sự kiện sẽ bị ẩn khỏi danh sách của bạn và khỏi trang công khai.
            Dữ liệu giữ lại để đối chiếu nhưng không khôi phục được từ giao diện.
          </p>
          <div className="org-event-delete-confirm__actions">
            <button
              type="button"
              className="org-btn org-btn-danger"
              disabled={isDeleting}
              onClick={() => {
                onDelete(event.id);
                setConfirmingDelete(false);
              }}
            >
              {isDeleting ? 'Đang xóa…' : 'Xác nhận xóa'}
            </button>
            <button type="button" className="org-btn org-btn-secondary" onClick={() => setConfirmingDelete(false)}>
              Hủy
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
