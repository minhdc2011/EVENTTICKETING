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
