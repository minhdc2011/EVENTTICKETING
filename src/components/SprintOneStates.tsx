import type {PublicEventRecord} from '../services/eventService';
import type {SaleStatus} from '../domain/eventStatus';

const STATUS_CONTENT: Record<SaleStatus, {label: string; description: string; tone: string}> = {
  UPCOMING: {
    label: 'Sắp mở bán',
    description: 'Sơ đồ đang ở chế độ xem trước. Bạn có thể khám phá các phân khu nhưng chưa thể chọn vé.',
    tone: 'upcoming',
  },
  ON_SALE: {
    label: 'Đang mở bán',
    description: 'Hệ thống đang nhận lượt chọn và giữ chỗ theo thời gian thực.',
    tone: 'on-sale',
  },
  SOLD_OUT: {
    label: 'Hết vé',
    description: 'Hiện không còn vị trí mở bán. Sơ đồ được giữ ở chế độ chỉ xem.',
    tone: 'sold-out',
  },
  CLOSED: {
    label: 'Đã đóng bán',
    description: 'Thời gian bán vé đã kết thúc. Sơ đồ được giữ ở chế độ chỉ xem.',
    tone: 'closed',
  },
};

export function SaleStatusBanner({event, status}: {event: PublicEventRecord; status: SaleStatus}) {
  const content = STATUS_CONTENT[status];
  const saleDate = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(event.saleStartsAt));

  return (
    <section className={`sale-status-banner sale-status-banner--${content.tone}`} aria-live="polite">
      <div className="sale-status-banner__inner">
        <span className="sale-status-banner__dot" aria-hidden="true" />
        <div>
          <strong>{content.label}</strong>
          <span>{content.description}</span>
        </div>
        {status === 'UPCOMING' && <time dateTime={event.saleStartsAt}>Mở bán {saleDate}</time>}
      </div>
    </section>
  );
}

export function AppLoadingState() {
  return (
    <main className="app-state-shell" aria-busy="true" aria-live="polite">
      <div className="app-state-card">
        <span className="app-state-spinner" aria-hidden="true" />
        <p className="app-state-kicker">EventTicketing</p>
        <h1>Đang tải thông tin sự kiện</h1>
        <p>Hệ thống đang đồng bộ lịch mở bán và dữ liệu công khai.</p>
      </div>
    </main>
  );
}

export function AppErrorState({onRetry}: {onRetry: () => void}) {
  return (
    <main className="app-state-shell" role="alert">
      <div className="app-state-card app-state-card--error">
        <p className="app-state-kicker">Không thể kết nối</p>
        <h1>Thông tin sự kiện chưa tải được</h1>
        <p>Không có dữ liệu cũ hoặc dữ liệu mẫu nào được hiển thị thay thế để tránh gây nhầm lẫn.</p>
        <button type="button" onClick={onRetry}>Tải lại sự kiện</button>
      </div>
    </main>
  );
}

export function EventNotFoundState() {
  return (
    <main className="app-state-shell" role="main">
      <div className="app-state-card app-state-card--not-found">
        <p className="app-state-kicker">404 · Event not found</p>
        <h1>Không tìm thấy sự kiện</h1>
        <p>Sự kiện không tồn tại, chưa được công bố hoặc đã được gỡ khỏi hệ thống.</p>
        <a href="./">Quay về trang chính</a>
      </div>
    </main>
  );
}
