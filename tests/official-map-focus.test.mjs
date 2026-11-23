import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('sơ đồ BTC: khu đang mở sáng lên, khu xung quanh bị làm mờ', () => {
  const map = read('src/components/event-template/OfficialSeatingMap.tsx');
  assert.match(map, /activeZoneCode/, 'nhận mã khu đang mở');
  assert.match(map, /classList\.toggle\('is-dimmed'/, 'làm mờ khu còn lại');
  assert.match(map, /classList\.toggle\('is-focused'/, 'tô sáng khu đang chọn');
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\[data-zone-code\]\.is-dimmed\s*\{[^}]*opacity:\s*0\.2/);
  assert.match(css, /\[data-zone-code\]\.is-focused\s*\{[^}]*--zone-color/);
});

test('mở một khu thì vẫn hiện sơ đồ thu nhỏ để thấy các khu xung quanh', () => {
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /so-do-lam-mo-khu-xung-quanh/);
  assert.match(section, /activeZoneCode=\{activeDisplayZone\.MaKhuVuc\}/);
});

test('màu trạng thái ghế khớp Super Concert (xanh còn trống, vàng đang chọn, xám sọc đã bán)', () => {
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /.et-seat-rows \.et-seat \.et-seat-shape\s*\{[^}]*#22c55e/);
  assert.match(css, /data-status='selected'\] \.et-seat-shape\s*\{[^}]*#eab308/);
  assert.match(css, /data-status='sold'\] \.et-seat-shape\s*\{[^}]*#334155/);
});

test('khu ghế lấy tông màu từ màu khu trong dữ liệu', () => {
  const grid = read('src/components/event-template/ZoneSeatGrid.tsx');
  assert.match(grid, /'--zone-color': zone\.MauSacHex/);
});

test('Super Concert dùng cùng giao diện thẻ sáng với sự kiện chung', () => {
  const css = read('src/components/event-template/SuperConcertSeatmapSync.css');
  assert.match(css, /#seating-toolbar/);
  assert.match(css, /--sc-accent:\s*#0353c2/);
  const sections = read('src/components/ConcertSections.tsx');
  assert.match(sections, /SuperConcertSeatmapSync\.css/);
});

test('ba sự kiện có sơ đồ trực quan bán đến cuối tháng 12/2026', () => {
  const svc = read('src/services/eventService.ts');
  const ends = [...svc.matchAll(/saleEndsAt: '(2026-12-31T22:00:00\+07:00)'/g)];
  assert.ok(ends.length >= 4, 'Super Concert, hai ngày Creative Tech và Arena');
});

test('mở một khu: sơ đồ thu nhỏ tô viền khu đó, lưới ghế gốc nằm bên dưới (không phóng to, không vẽ ghế trong SVG)', () => {
  const map = read('src/components/event-template/OfficialSeatingMap.tsx');
  assert.doesNotMatch(map, /setAttribute\('viewBox'|createPortal|requestAnimationFrame/);
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\[data-zone-code\]\.is-focused\s*\{[^}]*stroke:\s*var\(--zone-color/s);
  assert.match(css, /\.et-official-map--compact\s*\{[^}]*max-width:\s*520px/s);
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /officialFocusActive/);
  assert.match(section, /<OfficialSeatingMap\s+compact/);
  assert.doesNotMatch(section, /officialZoomActive|seatLayer/);
});

test('chưa đăng nhập: không còn thanh nhắc ở đầu trang, chỉ hộp thoại khi bấm Giữ chỗ', () => {
  const gate = read('src/components/event-template/PurchaseAccessGate.tsx');
  assert.doesNotMatch(gate, /yeu-cau-dang-nhap-giu-cho/);
  assert.doesNotMatch(gate, /et-otp-login-banner/);
  const host = read('src/components/site/LoginRequiredHost.tsx');
  assert.match(host, /role="dialog"/);
});

test('đồng hồ 5 phút chỉ chạy khi đã giữ chỗ thật (React và Super Concert)', () => {
  const summary = read('src/components/event-template/SelectionSummary.tsx');
  assert.match(summary, /hasActiveHold && typeof holdRemainingSeconds === 'number'/);
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /holdRemainingSeconds=\{activeHold \? remainingSeconds : undefined\}/);
  const runtime = read('src/legacy/concertRuntime.js');
  assert.doesNotMatch(runtime, /Start 5-min Hold Countdown if not already running/);
  assert.match(runtime, /holdTimerContainer\.classList\.toggle\('hidden', !holdTimerInterval\)/);
});

test('đủ số vé tối đa: ghế còn trống chưa chọn hiện dấu cấm tròn gạch đỏ (React và Super Concert)', () => {
  const button = read('src/components/event-template/SeatButton.tsx');
  assert.match(button, /blockedByLimit = limitReached && !isSelected && uiStatus === 'available'/);
  assert.match(button, /data-limit=\{blockedByLimit \? 'true' : undefined\}/);
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /limitReached=\{selectedSeats\.length \+ standingCount >= limits\.maxPerOrder\}/);
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\.et-seat\[data-limit='true'\]::after\s*\{[^}]*border:\s*2\.5px solid #dc2626[^}]*border-radius:\s*50%/s);
  const runtime = read('src/legacy/concertRuntime.js');
  assert.match(runtime, /getTotalSelectedCount\(\) >= currentLimits\.maxPerOrder\) \{\s*group\.classList\.add\('limit'\)/);
  assert.match(read('src/components/event-template/SuperConcertSeatmapSync.css'), /\.seat-limit-mark circle/);
});

test('sự kiện mới tạo mặc định bật OTP (qua RPC lưu cấu hình, không làm hỏng việc tạo bản nháp)', () => {
  const svc = read('src/services/organizerService.ts');
  assert.match(svc, /batOtpMacDinhChoSuKienMoi\(\(created as/);
  assert.match(svc, /luuCauHinhMuaVe\(id, \{soVeToiDaMoiDon: 4, yeuCauXacMinhOtp: true\}\)/);
  assert.match(svc, /catch \(error\) \{\s*console\.warn\('Không bật được OTP mặc định/);
});
