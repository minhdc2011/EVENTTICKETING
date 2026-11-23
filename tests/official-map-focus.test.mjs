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

test('sơ đồ BTC kiểu Ticketmaster: bản đồ + khung thông tin vé trong một thẻ, truyền khu đang mở', () => {
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /so-do-kieu-ticketmaster/);
  assert.match(section, /activeZoneCode=\{activeDisplayZone\?\.MaKhuVuc \?\? null\}/);
  assert.match(section, /<SeatTicketPanel/);
  assert.match(section, /const officialMapReady = Boolean\(event\?\.seatingMapUrl\)/);
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

test('bản đồ kiểu Ticketmaster: ghế là chấm trên bản đồ, kéo/zoom, nút điều khiển, bản đồ nhỏ', () => {
  const map = read('src/components/event-template/OfficialSeatingMap.tsx');
  assert.match(map, /createPortal/, 'chấm ghế vẽ trong chính SVG');
  assert.match(map, /layoutZoneSeats/, 'xếp chấm theo hình thật của từng khu');
  assert.match(map, /setAttribute\('viewBox'/, 'camera đổi viewBox');
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'dblclick']) assert.match(map, new RegExp(ev), `xử lý ${ev}`);
  assert.match(map, /!e\.ctrlKey && !e\.metaKey/, 'Ctrl + cuộn để thu phóng');
  assert.match(map, /et-tm-controls/);
  assert.match(map, /et-tm-mini/, 'bản đồ nhỏ góc dưới');
  assert.match(map, /prefers-reduced-motion/);
  assert.match(map, /Làm mới: về toàn cảnh/);
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\.et-tm-dot\[data-status='selected'\]\s*\{[^}]*#0b0f19/);
  assert.match(css, /\.et-tm-dot\[data-limit='true'\][^}]*#dc2626/);
  assert.match(css, /\.et-tm-map\[data-dots='on'\] \.et-tm-dot\[data-active='true'\]\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.et-tm-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 300px/);
});

test('khung thông tin vé: khu, hàng, ghế, giá và nút Thêm/Bỏ chọn, nêu lý do khi không chọn được', () => {
  const panel = read('src/components/event-template/SeatTicketPanel.tsx');
  for (const text of ['Khu', 'Hàng', 'Ghế', 'Thêm vào lựa chọn', 'Bỏ chọn ghế này', 'Ghế đã bán', 'Ghế đang được giữ', 'Đã chọn đủ vé']) {
    assert.ok(panel.includes(text), `có chữ "${text}"`);
  }
  assert.match(panel, /formatMoneyVND\(seat\.GiaVeNiemYet\)/);
  assert.match(panel, /onToggle\(seat\)/);
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

test('sự kiện không có sơ đồ chỗ ngồi chỉ hiện phần chọn vé (không bản đồ, thanh công cụ, chú giải)', () => {
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /const standingOnly =[\s\S]*every\(\(zone\) => isStandingZone\(zone\)\)[\s\S]*!event\?\.seatingMapUrl/);
  assert.match(section, /\{!standingOnly && \(/);
  assert.match(section, /\(viewMode === 'interactive' \|\| standingOnly \|\| officialMapReady\)/);
  assert.match(section, /ticketOnly=\{standingOnly\}/);
  assert.match(read('src/components/event-template/SelectionSummary.tsx'), /ticketOnly \? 'Vé đã chọn' : 'Ghế đã chọn'/);
});

test('đăng xuất hoặc đổi tài khoản khi đang giữ chỗ: trả chỗ lại và về trạng thái chưa giữ (React và Super Concert)', () => {
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /taoBoTheoDoiPhienGiuCho\(\)/);
  assert.match(section, /void releaseSeatHold\(hold\.holdId\)/);
  assert.match(section, /setIsHoldDialogOpen\(false\)/);
  const runtime = read('src/legacy/concertRuntime.js');
  assert.match(runtime, /subscribeBuyerAuth\(session =>/);
  assert.match(runtime, /traChoKhiDoiTaiKhoan\(hanhDong\.thongBao\)/);
});

test('thanh lọc khu vực và hàng ghế có scroll ngang, không tràn viền khung sơ đồ', () => {
  const seatCss = read('src/components/event-template/SeatMapSection.css');
  assert.match(seatCss, /\.et-segmented\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0[^}]*overflow-x:\s*auto/s);
  assert.match(seatCss, /\.et-segmented button\s*\{[^}]*white-space:\s*nowrap[^}]*flex:\s*0 0 auto/s);
  assert.match(seatCss, /\.et-seat-rows\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);

  const syncCss = read('src/components/event-template/SuperConcertSeatmapSync.css');
  assert.match(syncCss, /#seating-toolbar > div:first-child\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
  assert.match(syncCss, /\.zone-tab\s*\{[^}]*white-space:\s*nowrap[^}]*flex:\s*0 0 auto/s);

  const toolbar = read('src/components/event-template/MapToolbar.tsx');
  assert.match(toolbar, /container\.scrollBy/);
  assert.match(toolbar, /container\.addEventListener\('wheel'/);
});

test('bấm chọn phân khu trên sơ đồ không gọi scrollIntoView hay focus làm giật trang', () => {
  const section = read('src/components/event-template/SeatMapSection.tsx');
  const handlerMatch = section.match(/const handleOfficialZoneSelect = useCallback\([\s\S]*?\}, \[\]\);/);
  assert.ok(handlerMatch, 'tìm thấy handleOfficialZoneSelect');
  assert.doesNotMatch(handlerMatch[0], /scrollIntoView/);
  assert.match(section, /zones=\{activeStandingZone && !officialMapReady \? \[activeStandingZone\] : standingZones\}/);

  const grid = read('src/components/event-template/ZoneSeatGrid.tsx');
  assert.match(grid, /backButtonRef\.current\?\.focus\(\{preventScroll:\s*true\}\)/);

  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /\.et-seatmap-card\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.et-map-viewport\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.et-pz\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.et-tm-stage\s*\{[^}]*overflow-anchor:\s*none/);
});
