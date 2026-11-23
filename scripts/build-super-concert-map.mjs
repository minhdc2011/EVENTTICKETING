#!/usr/bin/env node
/**
 * Sinh tệp public/maps/super-concert-stadium.svg: sơ đồ sân vận động Mỹ Đình của Super Concert dùng bản đồ chung
 * (OfficialSeatingMap). Hình học lấy đúng từ bộ chạy cũ (concertRuntime.js: buildOvalStadiumSectors): các khu hình vành
 * elip quanh tâm (500, 470), khu vé đứng ở lòng sân, sân khấu và đường dẫn ra giữa sân.
 *
 * Mỗi khu là MỘT phần tử có data-zone-code trùng mã khu trong cơ sở dữ liệu. Khu vành cung có thêm data-arc
 * ("cx cy bánKínhNgoàiX bánKínhNgoàiY bánKínhTrongX bánKínhTrongY gócĐầu gócCuối") để bản đồ chung xếp ghế theo vành.
 * Khu không có ghế ngồi (vé đứng) không cần data-arc.
 *
 *   node scripts/build-super-concert-map.mjs
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {pointOnEllipse} from '../src/domain/zoneSeatLayout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../public/maps/super-concert-stadium.svg');
const CX = 500;
const CY = 470;
const f = (n) => n.toFixed(2);

function sectorPath(oRx, oRy, iRx, iRy, start, end) {
  const os = pointOnEllipse(CX, CY, oRx, oRy, start);
  const oe = pointOnEllipse(CX, CY, oRx, oRy, end);
  const ie = pointOnEllipse(CX, CY, iRx, iRy, end);
  const is = pointOnEllipse(CX, CY, iRx, iRy, start);
  const large = Math.abs(end - start) > 180 ? 1 : 0;
  return `M ${f(os.x)} ${f(os.y)} A ${oRx} ${oRy} 0 ${large} 1 ${f(oe.x)} ${f(oe.y)} L ${f(ie.x)} ${f(ie.y)} A ${iRx} ${iRy} 0 ${large} 0 ${f(is.x)} ${f(is.y)} Z`;
}

function radialLine(oRx, oRy, iRx, iRy, angle) {
  const a = pointOnEllipse(CX, CY, oRx, oRy, angle);
  const b = pointOnEllipse(CX, CY, iRx, iRy, angle);
  return `M ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)}`;
}

// code, tên, màu, bán kính [outerRx, outerRy, innerRx, innerRy], khoảng góc của khu, khoảng góc dùng để xếp ghế, số múi chia
const zones = [
  {code: 'ZONE_CD_UP', name: 'Khán đài C-D Tầng cao (Upper Tier)', color: '#a9cb73', radii: [455, 405, 365, 325], range: [150, 390], seats: [225, 315], slices: 10},
  {code: 'ZONE_A_T1', name: 'Khán đài A Tầng 1 (Tribune A)', color: '#f0b44e', radii: [350, 315, 280, 247], range: [150, 234], seats: [150, 234], slices: 3},
  {code: 'ZONE_B_T2', name: 'Khán đài B Tầng 2 (Tribune B)', color: '#9b7af0', radii: [350, 315, 280, 247], range: [306, 390], seats: [306, 390], slices: 3},
  {code: 'VIP_PLATINUM_1', name: 'VIP Platinum 1', color: '#6f95ed', radii: [350, 315, 280, 247], range: [234, 306], seats: [234, 306], slices: 3},
  {code: 'VVIP_DIAMOND', name: 'VVIP Diamond Lounge', color: '#e5bc38', radii: [272, 240, 224, 196], range: [234, 306], seats: [234, 306], slices: 3},
];

const zoneSvg = zones
  .map((z) => {
    const [oRx, oRy, iRx, iRy] = z.radii;
    const arc = `${CX} ${CY} ${oRx} ${oRy} ${iRx} ${iRy} ${z.seats[0]} ${z.seats[1]}`;
    return `    <path data-zone-code="${z.code}" role="button" tabindex="0" aria-label="${z.name}" data-arc="${arc}" d="${sectorPath(oRx, oRy, iRx, iRy, z.range[0], z.range[1])}" fill="${z.color}" stroke="#0c100e" stroke-width="2"/>`;
  })
  .join('\n');

const separators = zones
  .map((z) => {
    const [oRx, oRy, iRx, iRy] = z.radii;
    const lines = [];
    for (let i = 1; i < z.slices; i += 1) {
      lines.push(radialLine(oRx, oRy, iRx, iRy, z.range[0] + ((z.range[1] - z.range[0]) * i) / z.slices));
    }
    return lines.join(' ');
  })
  .filter(Boolean)
  .join(' ');

const blocked = [[30, 70], [70, 110], [110, 150]]
  .map(([s, e]) => `    <path d="${sectorPath(455, 405, 365, 325, s, e)}" fill="url(#blockedPattern)" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>`)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 930" width="100%" height="100%" role="img" aria-label="Sơ đồ mặt bằng sân vận động Mỹ Đình" style="background:#0d1527;font-family:'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <title>Sơ đồ mặt bằng sân vận động Mỹ Đình</title>
  <desc>Sơ đồ dạng móng ngựa với sân khấu ở phía dưới, khu vé đứng trong lòng sân và các tầng khán đài bao quanh. Sinh bởi scripts/build-super-concert-map.mjs.</desc>
  <defs>
    <linearGradient id="sc-stage" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ecff70"/>
      <stop offset="1" stop-color="#b9df22"/>
    </linearGradient>
    <pattern id="pitchGrid" width="64" height="64" patternUnits="userSpaceOnUse">
      <rect width="64" height="64" fill="#111812"/>
      <rect width="32" height="64" fill="#151e16"/>
    </pattern>
    <pattern id="blockedPattern" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="18" height="18" fill="#151719"/>
      <rect width="7" height="18" fill="#292c30"/>
    </pattern>
    <path id="sc-arc-vvip" d="M354.23 293.63 A248 218 0 0 1 645.77 293.63"/>
    <path id="sc-arc-vip" d="M314.85 242.67 A315 281 0 0 1 685.15 242.67"/>
    <path id="sc-arc-a" d="M227.20 610.50 A315 281 0 0 1 314.85 242.67"/>
    <path id="sc-arc-b" d="M685.15 242.67 A315 281 0 0 1 772.80 610.50"/>
    <path id="sc-arc-upper" d="M128.46 315.73 A410 365 0 0 1 871.54 315.73"/>
  </defs>

  <ellipse cx="500" cy="470" rx="455" ry="405" fill="#0c100e" stroke="rgba(255,255,255,0.17)" stroke-width="3"/>
  <g aria-hidden="true">
${blocked}
  </g>

  <g id="sc-zones">
${zoneSvg}
  </g>
  <path d="${separators}" fill="none" stroke="#0c100e" stroke-width="3" pointer-events="none" aria-hidden="true"/>

  <ellipse cx="500" cy="475" rx="258" ry="246" fill="url(#pitchGrid)" stroke="rgba(216,255,62,0.2)" stroke-width="2" pointer-events="none"/>

  <g>
    <rect data-zone-code="GA_STAND_1" role="button" tabindex="0" aria-label="GA Fanzone Standing 1 (Khu A)" x="330" y="330" width="340" height="160" rx="14" fill="#78d683" stroke="#c8ffb6" stroke-width="3"/>
    <text x="500" y="410" fill="#071008" font-size="23" font-weight="800" letter-spacing="0.6" text-anchor="middle" dominant-baseline="middle" pointer-events="none">STANDING · FANZONE</text>
  </g>

  <path d="M475 540 Q475 520 500 520 Q525 520 525 540 L525 670 L475 670 Z" fill="url(#sc-stage)" stroke="#f4ff9b" stroke-width="1.5" pointer-events="none"/>
  <rect x="380" y="670" width="240" height="70" rx="12" fill="url(#sc-stage)" stroke="#f4ff9b" stroke-width="1.5" pointer-events="none"/>
  <text x="500" y="705" fill="#0b1204" font-size="26" font-weight="800" letter-spacing="1.5" text-anchor="middle" dominant-baseline="middle" pointer-events="none">STAGE</text>

  <g fill="rgba(255,255,255,0.9)" font-size="16" font-weight="800" letter-spacing="1" pointer-events="none" aria-hidden="true">
    <text><textPath href="#sc-arc-vvip" startOffset="50%" text-anchor="middle">VVIP LOUNGE</textPath></text>
    <text><textPath href="#sc-arc-vip" startOffset="50%" text-anchor="middle">VIP PLATINUM 1</textPath></text>
    <text><textPath href="#sc-arc-a" startOffset="50%" text-anchor="middle">KHÁN ĐÀI A</textPath></text>
    <text><textPath href="#sc-arc-b" startOffset="50%" text-anchor="middle">KHÁN ĐÀI B</textPath></text>
    <text><textPath href="#sc-arc-upper" startOffset="50%" text-anchor="middle">KHÁN ĐÀI C · UPPER TIER</textPath></text>
    <text x="500" y="902" fill="rgba(255,255,255,0.4)" font-size="14" text-anchor="middle">KHUẤT TẦM NHÌN · KHÔNG BÁN</text>
  </g>
</svg>
`;

writeFileSync(out, svg, 'utf8');
console.log('Đã ghi', out, `(${svg.length} byte)`);
