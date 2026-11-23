import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcSectorBBox, parseArcSpec} from '../src/domain/zoneSeatLayout.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const svg = read('public/maps/super-concert-stadium.svg');

test('SVG Super Concert có đủ khu ghế và khu vé đứng với mã khu trùng cơ sở dữ liệu', () => {
  for (const code of ['VVIP_DIAMOND', 'VIP_PLATINUM_1', 'ZONE_A_T1', 'ZONE_B_T2', 'ZONE_CD_UP', 'GA_STAND_1']) {
    assert.equal((svg.match(new RegExp(`data-zone-code="${code}"`, 'g')) ?? []).length, 1, `${code} đúng một phần tử`);
  }
  assert.match(svg, /<svg[^>]*viewBox="0 0 1000 930"/);
});

test('mỗi khu ghế ngồi có data-arc hợp lệ để xếp ghế theo vành', () => {
  const arcs = [...svg.matchAll(/data-zone-code="([A-Z_0-9]+)"[^>]*data-arc="([^"]+)"/g)];
  assert.equal(arcs.length, 5, 'năm khu ghế ngồi');
  for (const [, code, raw] of arcs) {
    const arc = parseArcSpec(raw);
    assert.ok(arc, `${code}: data-arc hợp lệ`);
    const box = arcSectorBBox(arc);
    assert.ok(box.w > 50 && box.h > 30, `${code}: hộp bao hợp lý`);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1000 && box.y + box.h <= 930, `${code}: nằm trong khung tranh`);
  }
});

test('khu vé đứng không có data-arc (chọn số lượng ở bảng vé đứng)', () => {
  const standing = svg.match(/<rect[^>]*data-zone-code="GA_STAND_1"[^>]*>/)[0];
  assert.doesNotMatch(standing, /data-arc/);
});

test('Super Concert dùng bản đồ chung: SVG được khai báo, gán cho sự kiện (mô phỏng và thật), bỏ khe sơ đồ riêng', () => {
  assert.match(read('src/components/event-template/OfficialSeatingMap.tsx'), /'super-concert-stadium\.svg'/);
  const svc = read('src/services/eventService.ts');
  assert.match(svc, /SUPER_CONCERT_MAP = '\/maps\/super-concert-stadium\.svg'/);
  assert.match(svc, /seatingMapUrl: resolveAssetUrl\(SUPER_CONCERT_MAP\)/, 'sự kiện mô phỏng');
  assert.match(svc, /resolveTemplateKey\(row\) === 'SUPER_CONCERT_2026'\s*\? resolveAssetUrl\(SUPER_CONCERT_MAP\)\s*: row\.SoDoTongQuanURL/, 'sự kiện thật: luôn dùng sơ đồ đi kèm, bỏ qua URL cũ trong cột');
  const page = read('src/components/GenericEventPage.tsx');
  assert.doesNotMatch(page, /seating:\s*<SeatingSection/);
});

test('bản đồ chung hỗ trợ khu hình vành, thoát khu để xem toàn cảnh và chống ảnh hưởng giao diện khác khi kéo chuột', () => {
  const map = read('src/components/event-template/OfficialSeatingMap.tsx');
  assert.match(map, /parseArcSpec\(el\.getAttribute\('data-arc'\)\)/, 'đọc data-arc');
  assert.match(map, /arcSectorBBox\(shape\.arc\)/, 'camera theo hộp của cung ghế');
  assert.match(map, /geometryElement/, 'khu là nhóm <g> dùng hình thật của phần tử con');
  assert.match(map, /className="et-tm-exit"/, 'nút Xem toàn cảnh');
  assert.match(map, /Xem toàn cảnh/);
  assert.match(map, /e\.key === 'Escape' && activeRef\.current/, 'Escape thoát khu');
  assert.match(map, /et-tm-dragging/, 'lớp chặn bôi đen khi kéo');
  assert.match(map, /selectstart/);
  assert.match(map, /getSelection\?\.\(\)\?\.removeAllRanges\(\)/);
  assert.match(map, /e\.preventDefault\(\);\s*if \(document\.activeElement !== stage\)/, 'không để nhấn chuột bắt đầu bôi đen');
  const css = read('src/components/event-template/SeatMapSection.css');
  assert.match(css, /body\.et-tm-dragging[^{]*\{[^}]*user-select:\s*none/);
  assert.match(css, /\.et-tm-exit\s*\{[^}]*min-height:\s*44px/);
  const section = read('src/components/event-template/SeatMapSection.tsx');
  assert.match(section, /onExitZone=\{\(\) => \{\s*setSelectedZoneId\(null\);\s*setFilter\('all'\);/);
  assert.match(section, /mappedZoneCodes\.has\(z\.MaKhuVuc\)/, 'danh sách chọn khu chỉ gồm khu có hình trên bản đồ');
});

test('khu hình bình hành của nhà hát dùng hình thật của path con (không tràn ra cạnh nghiêng)', () => {
  const theater = read('public/maps/ticketmaster-theater-proscenium.svg');
  assert.match(theater, /<g data-zone-code="ORCHESTRA_RIGHT"[^>]*>\s*<path d="M 680 220 L 790 220 L 820 440 L 700 440 Z"/);
});
