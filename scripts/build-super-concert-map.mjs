#!/usr/bin/env node
/**
 * Sinh tệp public/maps/super-concert-stadium.svg: sơ đồ sân vận động Mỹ Đình của Super Concert
 * theo đúng ngôn ngữ hình ảnh Ticketmaster dùng chung với các sơ đồ BTC khác
 * (ticketmaster-arena-endstage.svg / ticketmaster-theater-proscenium.svg).
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
const CY = 415;
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

// Đường viền đứt nét bao quanh sân vận động (cùng phong cách Arena)
const perimeterStart = pointOnEllipse(CX, CY, 472, 420, -34);
const perimeterEnd = pointOnEllipse(CX, CY, 472, 420, 214);
const perimeterPath = `M ${f(perimeterStart.x)} ${f(perimeterStart.y)} A 472 420 0 1 1 ${f(perimeterEnd.x)} ${f(perimeterEnd.y)}`;

const zones = [
  {
    code: 'ZONE_CD_UP',
    name: 'Khán đài C-D Tầng cao (Upper Tier)',
    fill: 'url(#sc-upper)',
    stroke: '#ffffff',
    strokeWidth: '1',
    radii: [452, 400, 352, 310],
    range: [-32, 212],
    seats: [-29, 209],
    slices: 10,
    label: 'KHÁN ĐÀI C-D · UPPER TIER (TẦNG CAO)',
    sublabel: 'Tầm nhìn bao quát toàn sân vận động',
    subColor: '#ddd6fe',
    labelAngle: 90,
    fontSize: 13,
  },
  {
    code: 'ZONE_A_T1',
    name: 'Khán đài A Tầng 1 (Tribune A)',
    fill: 'url(#sc-bowl)',
    stroke: '#ffffff',
    strokeWidth: '1.2',
    radii: [326, 286, 242, 210],
    range: [134, 212],
    seats: [137, 209],
    slices: 3,
    label: 'KHÁN ĐÀI A',
    sublabel: 'Tầng 1',
    subColor: '#fef3c7',
    labelAngle: 173,
    fontSize: 11,
  },
  {
    code: 'ZONE_B_T2',
    name: 'Khán đài B Tầng 2 (Tribune B)',
    fill: 'url(#sc-bowl)',
    stroke: '#ffffff',
    strokeWidth: '1.2',
    radii: [326, 286, 242, 210],
    range: [-32, 46],
    seats: [-29, 43],
    slices: 3,
    label: 'KHÁN ĐÀI B',
    sublabel: 'Tầng 2',
    subColor: '#fef3c7',
    labelAngle: 7,
    fontSize: 11,
  },
  {
    code: 'VIP_PLATINUM_1',
    name: 'VIP Platinum 1',
    fill: 'url(#sc-vip)',
    stroke: '#ffffff',
    strokeWidth: '1.5',
    radii: [326, 286, 242, 210],
    range: [50, 130],
    seats: [52, 128],
    slices: 3,
    label: 'VIP PLATINUM 1',
    sublabel: 'Trung tâm tầng 1',
    subColor: '#bfdbfe',
    labelAngle: 90,
    fontSize: 13,
  },
  {
    code: 'VVIP_DIAMOND',
    name: 'VVIP Diamond Lounge',
    fill: '#2563eb',
    stroke: '#fbbf24',
    strokeWidth: '2',
    radii: [222, 192, 162, 138],
    range: [48, 132],
    seats: [51, 129],
    slices: 3,
    label: 'VVIP DIAMOND',
    sublabel: 'Trung tâm hạng nhất',
    subColor: '#fef08a',
    labelAngle: 90,
    fontSize: 13,
  },
];

const zoneSvg = zones
  .map((z) => {
    const [oRx, oRy, iRx, iRy] = z.radii;
    const arc = `${CX} ${CY} ${oRx} ${oRy} ${iRx} ${iRy} ${z.seats[0]} ${z.seats[1]}`;
    return `    <path data-zone-code="${z.code}" role="button" tabindex="0" aria-label="${z.name}" data-arc="${arc}" d="${sectorPath(oRx, oRy, iRx, iRy, z.range[0], z.range[1])}" fill="${z.fill}" stroke="${z.stroke}" stroke-width="${z.strokeWidth}"/>`;
  })
  .join('\n');

const labelSvg = zones
  .map((z) => {
    const [oRx, oRy, iRx, iRy] = z.radii;
    const midRx = (oRx + iRx) / 2;
    const midRy = (oRy + iRy) / 2;
    const p = pointOnEllipse(CX, CY, midRx, midRy, z.labelAngle);
    const titleY = z.sublabel ? f(p.y - 4) : f(p.y + 4);
    const sub = z.sublabel
      ? `\n    <text x="${f(p.x)}" y="${f(p.y + 13)}" fill="${z.subColor}" font-size="10" font-weight="600" text-anchor="middle">${z.sublabel}</text>`
      : '';
    return `    <text x="${f(p.x)}" y="${titleY}" fill="#ffffff" font-size="${z.fontSize}" font-weight="800" text-anchor="middle">${z.label}</text>${sub}`;
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

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 930" width="100%" height="100%" role="img" aria-label="Sơ đồ mặt bằng sân vận động Mỹ Đình" style="background:#0b1326;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <title>Sơ đồ mặt bằng sân vận động Mỹ Đình</title>
  <desc>Sơ đồ sân vận động tiêu chuẩn Ticketmaster End-Stage với sân khấu ở phía trên, khu Fanzone đứng trước sân khấu và các tầng khán đài VVIP, VIP Platinum, Khán đài A-B, Upper Tier bao quanh. Sinh bởi scripts/build-super-concert-map.mjs.</desc>
  <style>text { pointer-events: none; }</style>
  <defs>
    <linearGradient id="sc-stage-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="sc-floor-ga" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#059669" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="sc-vip" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="sc-bowl" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="sc-upper" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="#6d28d9" stop-opacity="0.88"/>
    </linearGradient>
    <filter id="sc-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Title & Header Bar -->
  <rect x="0" y="0" width="1000" height="60" fill="#070d1a"/>
  <text x="40" y="38" fill="#ffffff" font-size="18" font-weight="700" letter-spacing="1">EVENTTICKETING STADIUM SEATING CHART</text>
  <text x="960" y="38" fill="#94a3b8" font-size="13" font-weight="500" text-anchor="end">SƠ ĐỒ SÂN VẬN ĐỘNG MỸ ĐÌNH</text>

  <!-- Stadium Outer Perimeter Ring -->
  <path d="${perimeterPath}" fill="none" stroke="#1e293b" stroke-width="3" stroke-dasharray="6 6"/>

  <!-- Stage Complex -->
  <g id="stage-complex" filter="url(#sc-glow)">
    <rect x="330" y="84" width="340" height="84" rx="8" fill="url(#sc-stage-grad)" stroke="#38bdf8" stroke-width="2"/>
    <text x="500" y="124" fill="#f8fafc" font-size="20" font-weight="800" text-anchor="middle" letter-spacing="3">SÂN KHẤU · STAGE</text>
    <text x="500" y="148" fill="#38bdf8" font-size="11" font-weight="600" text-anchor="middle" letter-spacing="1">MAIN STADIUM END-STAGE</text>
    <polygon points="460,168 540,168 522,222 478,222" fill="#334155" stroke="#38bdf8" stroke-width="1.5"/>
    <circle cx="500" cy="222" r="22" fill="#0284c7" stroke="#e0f2fe" stroke-width="2"/>
    <text x="500" y="225" fill="#ffffff" font-size="8" font-weight="700" text-anchor="middle">B-STAGE</text>
  </g>

  <!-- Floor GA Standing -->
  <g id="floor-ga" filter="url(#sc-glow)">
    <rect data-zone-code="GA_STAND_1" role="button" tabindex="0" aria-label="GA Fanzone Standing 1 (Khu A)" x="340" y="256" width="320" height="114" rx="8" fill="url(#sc-floor-ga)" stroke="#ffffff" stroke-width="1.5" opacity="0.95"/>
    <text x="500" y="308" fill="#ffffff" font-size="15" font-weight="800" text-anchor="middle">STANDING · FANZONE</text>
    <text x="500" y="328" fill="#d1fae5" font-size="11" font-weight="600" text-anchor="middle">Khu vé đứng tự do sát sân khấu</text>
  </g>

  <!-- Sound & Lighting Mix (FOH) -->
  <rect x="440" y="424" width="120" height="36" rx="4" fill="#0f172a" stroke="#64748b" stroke-width="1"/>
  <text x="500" y="446" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="middle">SOUND MIX / FOH</text>

  <!-- Seated Stadium Bowls -->
  <g id="sc-zones" filter="url(#sc-glow)">
${zoneSvg}
  </g>
  <path d="${separators}" fill="none" stroke="rgba(11, 19, 38, 0.55)" stroke-width="1.6" pointer-events="none" aria-hidden="true"/>

  <!-- Zone Labels -->
  <g id="sc-labels" pointer-events="none" aria-hidden="true">
${labelSvg}
  </g>

  <!-- Legend Bar -->
  <g id="sc-legend" transform="translate(70, 875)">
    <rect x="0" y="0" width="16" height="16" rx="3" fill="#10b981"/>
    <text x="22" y="13" fill="#cbd5e1" font-size="11">GA Fanzone Standing</text>

    <rect x="165" y="0" width="16" height="16" rx="3" fill="#3b82f6"/>
    <text x="187" y="13" fill="#cbd5e1" font-size="11">VVIP &amp; VIP Platinum</text>

    <rect x="325" y="0" width="16" height="16" rx="3" fill="#f59e0b"/>
    <text x="347" y="13" fill="#cbd5e1" font-size="11">Khán đài A – B</text>

    <rect x="465" y="0" width="16" height="16" rx="3" fill="#8b5cf6"/>
    <text x="487" y="13" fill="#cbd5e1" font-size="11">Upper Tier (Khán đài C-D)</text>
  </g>
</svg>
`;

writeFileSync(out, svg, 'utf8');
console.log('Đã ghi', out, `(${svg.length} byte)`);
