import {useState} from 'react';

const STORAGE_KEY = 'eventticketing:map-hint-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hướng dẫn thao tác sơ đồ cho người dùng mới (UT-04). Đóng một lần là nhớ; không có bộ nhớ thì hiện lại mỗi lần. */
export function MapFirstTimeHint() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const close = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Không có bộ nhớ trình duyệt: chỉ ẩn trong lần xem này.
    }
    setDismissed(true);
  };

  return (
    <div className="et-map-hint" role="note" data-testid="goi-y-so-do">
      <div className="et-map-hint__body">
        <strong>Cách xem sơ đồ</strong>
        <ul>
          <li>Bấm vào một khu để phóng to và chọn ghế.</li>
          <li>Kéo chuột (hoặc vuốt) để di chuyển; giữ Ctrl rồi cuộn để phóng to, hai ngón tay để thu phóng trên điện thoại.</li>
          <li>Bấm "← Xem toàn cảnh" hoặc phím Esc để quay lại.</li>
          <li>Chấm xanh là ghế trống, chấm vàng là ghế đang được giữ, chấm xám là ghế đã bán.</li>
        </ul>
      </div>
      <button type="button" className="et-map-hint__close" onClick={close} aria-label="Đã hiểu, đóng hướng dẫn">
        Đã hiểu
      </button>
    </div>
  );
}
