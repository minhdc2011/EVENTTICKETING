// Transitional runtime retained during the component-by-component React migration.
import {loadTicketingCatalog} from '../services/ticketDataService';

// ==========================================
      // 1. DATA DEFINITIONS & SEAT CATALOG
      // ==========================================
      const ZONES = {};
      const ZONE_KEY_BY_CODE = {
        VVIP_DIAMOND: 'VIP',
        VIP_PLATINUM_1: 'VIP',
        VIP_PLATINUM_2: 'VIP',
        GA_STAND_1: 'STANDING',
        GA_STAND_2: 'STANDING',
        ZONE_A_T1: 'A',
        ZONE_B_T2: 'B',
        ZONE_CD_UP: 'C'
      };
      const ZONE_VISUAL_COLORS = {
        VVIP_DIAMOND: '#d8ff3e',
        VIP_PLATINUM_1: '#6ea8ff',
        VIP_PLATINUM_2: '#58c7ff',
        GA_STAND_1: '#4ade80',
        GA_STAND_2: '#2dd4bf',
        ZONE_A_T1: '#ffb454',
        ZONE_B_T2: '#b98cff',
        ZONE_CD_UP: '#b9e986'
      };

      const FALLBACK_ZONES = [
        { KhuVucID: 1, MaKhuVuc: 'VVIP_DIAMOND', TenKhuVuc: 'VVIP Diamond Lounge', GiaVeNiemYet: 4500000, MauSacHex: '#D500F9' },
        { KhuVucID: 2, MaKhuVuc: 'VIP_PLATINUM_1', TenKhuVuc: 'VIP Platinum 1', GiaVeNiemYet: 3500000, MauSacHex: '#2979FF' },
        { KhuVucID: 3, MaKhuVuc: 'VIP_PLATINUM_2', TenKhuVuc: 'VIP Platinum 2', GiaVeNiemYet: 3000000, MauSacHex: '#00B0FF' },
        { KhuVucID: 4, MaKhuVuc: 'GA_STAND_1', TenKhuVuc: 'GA Fanzone Standing 1 (Khu A)', GiaVeNiemYet: 2200000, MauSacHex: '#00E676' },
        { KhuVucID: 5, MaKhuVuc: 'GA_STAND_2', TenKhuVuc: 'GA Fanzone Standing 2 (Khu B)', GiaVeNiemYet: 1800000, MauSacHex: '#76FF03' },
        { KhuVucID: 6, MaKhuVuc: 'ZONE_A_T1', TenKhuVuc: 'Khán đài A Tầng 1 (Tribune A)', GiaVeNiemYet: 1500000, MauSacHex: '#FF9100' },
        { KhuVucID: 7, MaKhuVuc: 'ZONE_B_T2', TenKhuVuc: 'Khán đài B Tầng 2 (Tribune B)', GiaVeNiemYet: 1200000, MauSacHex: '#FFC400' },
        { KhuVucID: 8, MaKhuVuc: 'ZONE_CD_UP', TenKhuVuc: 'Khán đài C-D Tầng cao (Upper Tier)', GiaVeNiemYet: 800000, MauSacHex: '#90A4AE' }
      ];

      // Compact fallback catalog mirrors the 48 records in data_seats.json.
      const FALLBACK_SEAT_STATUS = {
        1: ['DA_BAN', 'DA_BAN', 'TRONG', 'TRONG', 'DANG_GIU', 'TRONG', 'DA_BAN', 'DA_BAN', 'DA_BAN', 'TRONG', 'TRONG', 'TRONG'],
        2: ['DA_BAN', 'DA_BAN', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'DA_BAN', 'DA_BAN', 'TRONG', 'TRONG', 'DANG_GIU', 'TRONG'],
        6: ['DA_BAN', 'DA_BAN', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'DA_BAN', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG'],
        7: ['DA_BAN', 'DA_BAN', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG', 'TRONG']
      };
      const FALLBACK_SEAT_ROWS = { 1: ['A', 'B'], 2: ['C', 'D'], 6: ['E', 'F'], 7: ['G', 'H'] };
      const FALLBACK_SEAT_ID_OFFSETS = { 1: 0, 2: 12, 6: 24, 7: 36 };

      let seatsData = [];
      let selectedSeatIds = new Set();
      const standingQuantities = { GA_STAND_1: 0, GA_STAND_2: 0 };
      const STANDING_CAPACITY = { GA_STAND_1: 200, GA_STAND_2: 200 };
      const standingTickets = new Map();
      let currentZoneFilter = 'ALL';
      let currentSearchQuery = '';
      let holdTimerInterval = null;
      let holdTimeRemaining = 300; // 5 minutes (300 seconds)
      let pendingMapSeat = null;
      let pendingStandingZoneCode = null;
      let activeDetailZoneCode = null;
      let activeCameraZoneCode = null;
      let stadiumCameraFrame = null;
      let currentStadiumViewBox = [0, 0, 1000, 1000];

      function buildFallbackSeats() {
        return Object.entries(FALLBACK_SEAT_STATUS).flatMap(([zoneId, statuses]) => {
          const zone = FALLBACK_ZONES.find(item => item.KhuVucID === Number(zoneId));
          const rows = FALLBACK_SEAT_ROWS[zoneId];
          return statuses.map((status, index) => {
            const row = rows[Math.floor(index / 6)];
            const number = String((index % 6) + 1).padStart(2, '0');
            return {
              GheID: FALLBACK_SEAT_ID_OFFSETS[zoneId] + index + 1,
              KhuVucID: Number(zoneId),
              TenKhuVuc: zone.TenKhuVuc,
              SoHang: row,
              SoGhe: number,
              MaGheDayDu: `${zone.MaKhuVuc === 'VVIP_DIAMOND' ? 'VVIP' : zone.MaKhuVuc === 'VIP_PLATINUM_1' ? 'VIP1' : zone.MaKhuVuc === 'ZONE_A_T1' ? 'KDA' : 'KDB'}-${row}-${number}`,
              TrangThai: status,
              GiaVeNiemYet: zone.GiaVeNiemYet
            };
          });
        });
      }

      function normalizeZone(zone) {
        const zoneKey = ZONE_KEY_BY_CODE[zone.MaKhuVuc] || 'C';
        return {
          id: zone.KhuVucID,
          code: zone.MaKhuVuc,
          name: zone.TenKhuVuc,
          price: Number(zone.GiaVeNiemYet),
          color: zone.MauSacHex,
          zoneKey
        };
      }

      function normalizeSeat(seat, zoneById) {
        const zone = zoneById.get(Number(seat.KhuVucID));
        const statusMap = { TRONG: 'AVAILABLE', DA_BAN: 'SOLD', DANG_GIU: 'HELD' };
        return {
          id: seat.MaGheDayDu,
          dbId: seat.GheID,
          zoneId: Number(seat.KhuVucID),
            zoneCode: zone ? zone.code : '',
          zoneKey: zone ? zone.zoneKey : 'C',
          zoneName: seat.TenKhuVuc,
          row: seat.SoHang,
          number: seat.SoGhe,
          price: Number(seat.GiaVeNiemYet),
          status: statusMap[seat.TrangThai] || 'HELD',
          sourceStatus: seat.TrangThai
        };
      }

      function buildUpperTierVisualSeats() {
        const zone = ZONES.ZONE_CD_UP;
        if (!zone) return [];
        return Array.from({ length: 32 }, (_, index) => {
          const seatNumber = index + 1;
          const isBehindStage = seatNumber >= 13 && seatNumber <= 20;
          const isHeld = seatNumber % 13 === 0;
          const isSold = !isHeld && seatNumber % 7 === 0;
          return {
            id: `KDC-${String(301 + index)}`,
            dbId: `visual-upper-${seatNumber}`,
            zoneId: zone.id,
            zoneCode: zone.code,
            zoneKey: zone.zoneKey,
            zoneName: zone.name,
            row: 'U',
            number: String(seatNumber).padStart(2, '0'),
            price: zone.price,
            status: isBehindStage ? 'BLOCKED' : isHeld ? 'HELD' : isSold ? 'SOLD' : 'AVAILABLE',
            sourceStatus: isBehindStage ? 'KHONG_MO_BAN' : isHeld ? 'DANG_GIU' : isSold ? 'DA_BAN' : 'TRONG',
            visualOnly: true
          };
        });
      }

      async function loadDataFromDatabase() {
        let rawZones;
        let rawSeats;
        try {
          const catalog = await loadTicketingCatalog();
          rawZones = catalog.zones;
          rawSeats = catalog.seats;
        } catch (error) {
          rawZones = FALLBACK_ZONES;
          rawSeats = buildFallbackSeats();
          console.warn('Không tải được JSON, sử dụng dữ liệu mẫu dự phòng:', error.message);
        }

        Object.keys(ZONES).forEach(key => delete ZONES[key]);
        rawZones.map(normalizeZone).forEach(zone => {
          ZONES[zone.code] = zone;
          if (!ZONES[zone.zoneKey]) {
            ZONES[zone.zoneKey] = zone;
          }
        });
        seatsData = rawSeats.map(seat => normalizeSeat(seat, new Map(rawZones.map(zone => [Number(zone.KhuVucID), normalizeZone(zone)]))));
        if (!seatsData.some(seat => seat.zoneCode === 'ZONE_CD_UP')) {
          seatsData.push(...buildUpperTierVisualSeats());
        }
        updateZonePresentation();
      }

      function updateZonePresentation() {
        document.querySelectorAll('#seats-wrapper > .zone-block[data-zone-code]').forEach(block => {
          const zone = ZONES[block.dataset.zoneCode];
          if (!zone) return;
          const heading = block.querySelector('h4');
          const price = block.querySelector(':scope > div:first-of-type > span:last-child');
          if (heading) heading.textContent = `PHÂN KHU: ${zone.name.toUpperCase()}`;
          if (price) price.textContent = `${formatVND(zone.price)} / ${zone.code.startsWith('GA_STAND') ? 'vé' : 'ghế'}`;
        });

        document.querySelectorAll('.zone-tab').forEach(tab => {
          const zoneKey = tab.id.replace('tab-zone-', '');
          if (zoneKey === 'ALL') {
            const sellableSeatCount = seatsData.filter(seat => seat.status !== 'BLOCKED').length;
            tab.textContent = `Tất cả (${sellableSeatCount} ghế mở bán)`;
          } else if (ZONES[zoneKey]) {
            tab.textContent = ZONES[zoneKey].name;
          }
        });

        document.querySelectorAll('#pricing-section [data-zone-code]').forEach(card => {
          const zone = ZONES[card.dataset.zoneCode];
          if (!card || !zone) return;
          const title = card.querySelector('h3');
          const price = card.querySelector('h3 + div span:first-child');
          if (title) title.textContent = zone.name;
          if (price) price.textContent = new Intl.NumberFormat('vi-VN').format(zone.price);
        });
      }

      function mountZonesOnStadiumMap() {
        const svg = document.getElementById('stadium-svg');
        if (!svg || svg.dataset.ready === 'true') return;
        buildOvalStadiumSectors();
        svg.dataset.ready = 'true';

        svg.querySelectorAll('#oval-stadium-root .stadium-svg-zone').forEach(zoneShape => {
          const zoneCode = zoneShape.dataset.zoneCode;
          const zone = ZONES[zoneCode];
          if (zone) {
            zoneShape.dataset.price = zone.price;
            zoneShape.dataset.name = zone.name;
          }

          zoneShape.addEventListener('mouseenter', showSvgZoneTooltip);
          zoneShape.addEventListener('mousemove', moveSvgZoneTooltip);
          zoneShape.addEventListener('mouseleave', hideSvgZoneTooltip);
          zoneShape.addEventListener('focus', showSvgZoneTooltip);
          zoneShape.addEventListener('blur', hideSvgZoneTooltip);
          zoneShape.addEventListener('click', () => selectTicketFromSvgZone(zoneCode));
          zoneShape.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectTicketFromSvgZone(zoneCode);
            }
          });
        });
        document.getElementById('stadium-reset-view')?.addEventListener('click', resetStadiumCamera);
      }

      function pointOnEllipse(cx, cy, rx, ry, angle) {
        const radians = angle * Math.PI / 180;
        return [cx + rx * Math.cos(radians), cy + ry * Math.sin(radians)];
      }

      function ellipticalSectorPath(cx, cy, outerRx, outerRy, innerRx, innerRy, startAngle, endAngle) {
        const outerStart = pointOnEllipse(cx, cy, outerRx, outerRy, startAngle);
        const outerEnd = pointOnEllipse(cx, cy, outerRx, outerRy, endAngle);
        const innerEnd = pointOnEllipse(cx, cy, innerRx, innerRy, endAngle);
        const innerStart = pointOnEllipse(cx, cy, innerRx, innerRy, startAngle);
        const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
        return `M ${outerStart[0].toFixed(2)} ${outerStart[1].toFixed(2)} A ${outerRx} ${outerRy} 0 ${largeArc} 1 ${outerEnd[0].toFixed(2)} ${outerEnd[1].toFixed(2)} L ${innerEnd[0].toFixed(2)} ${innerEnd[1].toFixed(2)} A ${innerRx} ${innerRy} 0 ${largeArc} 0 ${innerStart[0].toFixed(2)} ${innerStart[1].toFixed(2)} Z`;
      }

      function buildOvalStadiumSectors() {
        const layer = document.getElementById('oval-sector-layer');
        if (!layer || layer.children.length) return;
        const ns = 'http://www.w3.org/2000/svg';
        const sectorConfigs = [];

        for (let index = 0; index < 10; index++) {
          sectorConfigs.push({
            start: 150 + index * 24,
            end: 150 + (index + 1) * 24,
            radii: [455, 405, 365, 325],
            zoneCode: 'ZONE_CD_UP',
            zoneFilter: 'C',
            color: '#a9cb73',
            tier: 'Khán đài C · Upper Tier'
          });
        }

        [[150,178],[178,206],[206,234]].forEach(([start,end]) => sectorConfigs.push({ start,end,radii:[350,315,280,247],zoneCode:'ZONE_A_T1',zoneFilter:'A',color:'#f0b44e',tier:'Khán đài A · Tầng 1' }));
        [[306,334],[334,362],[362,390]].forEach(([start,end]) => sectorConfigs.push({ start,end,radii:[350,315,280,247],zoneCode:'ZONE_B_T2',zoneFilter:'B',color:'#9b7af0',tier:'Khán đài B · Tầng 2' }));

        const vvipCodes = ['105','104','106'];
        [[234,258],[258,282],[282,306]].forEach(([start,end],index) => sectorConfigs.push({ start,end,radii:[272,240,224,196],zoneCode:'VVIP_DIAMOND',zoneFilter:'VIP',color:'#e5bc38',tier:`VVIP Lounge · Sector ${vvipCodes[index]}`,sectorCode:vvipCodes[index] }));
        [[234,258],[258,282],[282,306]].forEach(([start,end]) => sectorConfigs.push({ start,end,radii:[350,315,280,247],zoneCode:'VIP_PLATINUM_1',zoneFilter:'VIP_PLATINUM_1',color:'#6f95ed',tier:'VIP Platinum 1' }));

        sectorConfigs.forEach((config,index) => {
          const [outerRx,outerRy,innerRx,innerRy] = config.radii;
          const path = document.createElementNS(ns,'path');
          path.setAttribute('d', ellipticalSectorPath(500,470,outerRx,outerRy,innerRx,innerRy,config.start,config.end));
          path.setAttribute('class','stadium-svg-zone oval-sector');
          path.setAttribute('tabindex','0');
          path.setAttribute('role','button');
          path.dataset.zoneCode = config.zoneCode;
          path.dataset.zoneFilter = config.zoneFilter;
          path.dataset.tier = config.tier;
          path.dataset.name = config.tier;
          path.dataset.price = ZONES[config.zoneCode]?.price || 0;
          path.dataset.available = getZoneAvailability(config.zoneCode);
          if (config.sectorCode) path.dataset.sectorCode = config.sectorCode;
          path.style.setProperty('--zone-color',config.color);
          path.setAttribute('aria-label',config.tier);
          layer.appendChild(path);
        });

        [[30,70],[70,110],[110,150]].forEach(([start,end]) => {
          const path = document.createElementNS(ns,'path');
          path.setAttribute('d', ellipticalSectorPath(500,470,455,405,365,325,start,end));
          path.setAttribute('class','oval-sector blocked-sector');
          path.setAttribute('aria-hidden','true');
          layer.appendChild(path);
        });
      }

      function getZoneAvailability(zoneCode) {
        if (zoneCode in STANDING_CAPACITY) return Math.max(0, STANDING_CAPACITY[zoneCode] - [...standingTickets.values()].filter(ticket => ticket.zoneCode === zoneCode).length);
        return seatsData.filter(seat => seat.zoneCode === zoneCode && seat.status === 'AVAILABLE' && !selectedSeatIds.has(seat.id)).length;
      }

      function showSvgZoneTooltip(event) {
        const target = event.currentTarget;
        const tooltipEl = document.getElementById('svg-zone-tooltip');
        if (!target || !tooltipEl) return;
        const zoneCode = target.dataset.zoneCode;
        const zone = ZONES[zoneCode];
        const color = ZONE_VISUAL_COLORS[zoneCode] || zone?.color || '#d8ff3e';
        const available = getZoneAvailability(zoneCode);
        tooltipEl.style.setProperty('--tooltip-color', color);
        tooltipEl.innerHTML = `
          <div class="svg-tooltip-kicker">${target.dataset.tier || 'Phân khu sân vận động'}</div>
          <div class="svg-tooltip-title">${zone?.name || target.dataset.name}</div>
          <div class="svg-tooltip-meta"><span>Giá niêm yết</span><strong>${formatVND(zone?.price || Number(target.dataset.price))}</strong></div>
          <div class="svg-tooltip-meta"><span>Còn trống</span><strong>${available} chỗ</strong></div>
        `;
        tooltipEl.classList.add('is-visible');
        tooltipEl.setAttribute('aria-hidden', 'false');
        moveSvgZoneTooltip(event);
      }

      function moveSvgZoneTooltip(event) {
        const tooltipEl = document.getElementById('svg-zone-tooltip');
        if (!tooltipEl || !tooltipEl.classList.contains('is-visible')) return;
        const fallbackRect = event.currentTarget?.getBoundingClientRect?.();
        const clientX = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (fallbackRect?.left || 0) + (fallbackRect?.width || 0) / 2;
        const clientY = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (fallbackRect?.top || 0);
        tooltipEl.style.left = `${Math.min(clientX, window.innerWidth - 300)}px`;
        tooltipEl.style.top = `${Math.max(clientY, 120)}px`;
      }

      function hideSvgZoneTooltip() {
        const tooltipEl = document.getElementById('svg-zone-tooltip');
        if (!tooltipEl) return;
        tooltipEl.classList.remove('is-visible');
        tooltipEl.setAttribute('aria-hidden', 'true');
      }

      function selectTicketFromSvgZone(zoneCode) {
        const zone = ZONES[zoneCode];
        if (!zone) return;
        currentZoneFilter = ZONE_KEY_BY_CODE[zoneCode] || zoneCode;
        updateActiveZoneTab(currentZoneFilter);
        focusStadiumZone(zoneCode);
      }

      function getCameraViewBox(zoneCode) {
        const views = {
          VVIP_DIAMOND: [300, 165, 400, 260],
          VIP_PLATINUM_1: [265, 85, 470, 260],
          ZONE_A_T1: [40, 160, 400, 520],
          ZONE_B_T2: [560, 160, 400, 520],
          ZONE_CD_UP: [170, 35, 660, 300],
          GA_STAND_1: [280, 285, 440, 330],
          GA_STAND_2: [280, 285, 440, 330]
        };
        return views[zoneCode] || [0,0,1000,1000];
      }

      function animateStadiumViewBox(targetViewBox, duration = 360, onComplete = null) {
        const svg = document.getElementById('stadium-svg');
        if (!svg) return;
        if (stadiumCameraFrame) clearTimeout(stadiumCameraFrame);
        svg.querySelector(':scope > animate[data-camera-animation]')?.remove();
        svg.classList.add('is-camera-moving');
        const startViewBox = svg.getAttribute('viewBox') || currentStadiumViewBox.join(' ');
        const targetValue = targetViewBox.join(' ');
        const animation = document.createElementNS('http://www.w3.org/2000/svg','animate');
        animation.dataset.cameraAnimation = 'true';
        animation.setAttribute('attributeName','viewBox');
        animation.setAttribute('from',startViewBox);
        animation.setAttribute('to',targetValue);
        animation.setAttribute('dur',`${duration}ms`);
        animation.setAttribute('calcMode','spline');
        animation.setAttribute('keySplines','.22 1 .36 1');
        animation.setAttribute('fill','freeze');
        svg.appendChild(animation);
        animation.beginElement();
        stadiumCameraFrame = setTimeout(() => {
          svg.setAttribute('viewBox',targetViewBox.map(value => value.toFixed(2)).join(' '));
          currentStadiumViewBox = [...targetViewBox];
          animation.remove();
          svg.classList.remove('is-camera-moving');
          stadiumCameraFrame = null;
          if (typeof onComplete === 'function') onComplete();
        }, duration + 20);
      }

      function focusStadiumZone(zoneCode) {
        const svg = document.getElementById('stadium-svg');
        if (!svg) return;
        activeCameraZoneCode = zoneCode;
        activeDetailZoneCode = null;
        svg.classList.add('is-camera-zoomed');
        document.getElementById('stadium-reset-view')?.classList.add('is-visible');
        document.getElementById('stadium-seat-layer')?.replaceChildren();
        animateStadiumViewBox(getCameraViewBox(zoneCode), 360, () => {
          if (activeCameraZoneCode === zoneCode && !zoneCode.startsWith('GA_STAND')) {
            renderCameraSeats(zoneCode);
          }
        });
        if (zoneCode.startsWith('GA_STAND')) {
          showStandingSelectionPanel(zoneCode);
        } else {
          pendingStandingZoneCode = null;
          pendingMapSeat = null;
          renderMapSelectionPanel();
        }
        renderSeats();
      }

      function resetStadiumCamera() {
        const svg = document.getElementById('stadium-svg');
        activeCameraZoneCode = null;
        activeDetailZoneCode = null;
        pendingStandingZoneCode = null;
        pendingMapSeat = null;
        currentZoneFilter = 'ALL';
        updateActiveZoneTab('ALL');
        document.getElementById('stadium-reset-view')?.classList.remove('is-visible');
        document.getElementById('stadium-seat-layer')?.replaceChildren();
        renderMapSelectionPanel();
        svg?.classList.remove('is-camera-zoomed');
        renderSeats();
        animateStadiumViewBox([0,0,1000,1000], 320);
      }

      function renderCameraSeats(zoneCode) {
        const layer = document.getElementById('stadium-seat-layer');
        const zone = ZONES[zoneCode];
        if (!layer || !zone) return;
        layer.replaceChildren();
        const ns = 'http://www.w3.org/2000/svg';
        const zoneSeats = seatsData.filter(seat => seat.zoneCode === zoneCode && !seat.visualOnly);
        if (!zoneSeats.length) return;

        const heading = document.createElementNS(ns,'text');
        heading.setAttribute('class','camera-zone-heading');
        const subheading = document.createElementNS(ns,'text');
        subheading.setAttribute('class','camera-zone-subheading');
        heading.textContent = zone.name;
        subheading.textContent = `Giá vé: ${formatVND(zone.price)} | Còn trống: ${getZoneAvailability(zoneCode)} ghế`;

        const layoutByZone = {
          VVIP_DIAMOND: {
            header:[310,175,220,32], heading:[420,188], headingWidth:170, angles:[234,306],
            rows:{ A:{ outer:[248,218], inner:[224,196] }, B:{ outer:[272,240], inner:[248,218] } }
          },
          VIP_PLATINUM_1: {
            header:[282,96,226,34], heading:[395,109], headingWidth:160, angles:[234,306],
            rows:{ C:{ outer:[315,281], inner:[280,247] }, D:{ outer:[350,315], inner:[315,281] } }
          },
          ZONE_A_T1: {
            header:[55,171,236,34], heading:[173,184], headingWidth:180, angles:[150,234],
            rows:{ E:{ outer:[315,281], inner:[280,247] }, F:{ outer:[350,315], inner:[315,281] } }
          },
          ZONE_B_T2: {
            header:[575,171,236,34], heading:[693,184], headingWidth:180, angles:[306,390],
            rows:{ G:{ outer:[315,281], inner:[280,247] }, H:{ outer:[350,315], inner:[315,281] } }
          }
        };
        const layout = layoutByZone[zoneCode];
        if (!layout) return;
        heading.setAttribute('x',layout.heading[0]); heading.setAttribute('y',layout.heading[1]);
        heading.setAttribute('textLength',layout.headingWidth);
        heading.setAttribute('lengthAdjust','spacingAndGlyphs');
        subheading.setAttribute('x',layout.heading[0]); subheading.setAttribute('y',layout.heading[1]+11);
        const headerBackdrop = document.createElementNS(ns,'rect');
        headerBackdrop.setAttribute('class','camera-zone-header-bg');
        headerBackdrop.setAttribute('x',layout.header[0]);
        headerBackdrop.setAttribute('y',layout.header[1]);
        headerBackdrop.setAttribute('width',layout.header[2]);
        headerBackdrop.setAttribute('height',layout.header[3]);
        headerBackdrop.setAttribute('rx','5');

        [...new Set(zoneSeats.map(seat => String(seat.row).toUpperCase()))].forEach(row => {
          const rowLayout = layout.rows[row];
          if (!rowLayout) return;
          const rowSeats = zoneSeats.filter(seat => String(seat.row).toUpperCase() === row).sort((a,b) => Number(a.number)-Number(b.number));
          const angleStep = (layout.angles[1] - layout.angles[0]) / rowSeats.length;
          rowSeats.forEach((seat,index) => {
            const startAngle = layout.angles[0] + angleStep * index;
            const endAngle = startAngle + angleStep;
            const middleAngle = (startAngle + endAngle) / 2;
            const center = pointOnEllipse(
              500,470,
              (rowLayout.outer[0] + rowLayout.inner[0]) / 2,
              (rowLayout.outer[1] + rowLayout.inner[1]) / 2,
              middleAngle
            );
            const group = document.createElementNS(ns,'g');
            const selected = selectedSeatIds.has(seat.id);
            const stateClass = selected ? 'selected' : seat.status === 'SOLD' ? 'sold' : seat.status === 'HELD' ? 'held' : 'available';
            group.setAttribute('class',`camera-seat-cell ${stateClass}`);
            group.setAttribute('tabindex',seat.status === 'AVAILABLE' ? '0' : '-1');
            group.setAttribute('role','button');
            group.dataset.seatId = seat.id;
            group.setAttribute('aria-label',`Ghế ${seat.id}, ${seat.sourceStatus}, ${formatVND(seat.price)}`);
            const nativeTitle = document.createElementNS(ns,'title');
            nativeTitle.textContent = `${seat.id} · ${seat.sourceStatus} · ${formatVND(seat.price)}`;
            const tile = document.createElementNS(ns,'path');
            tile.setAttribute('d',ellipticalSectorPath(
              500,470,
              rowLayout.outer[0],rowLayout.outer[1],
              rowLayout.inner[0],rowLayout.inner[1],
              startAngle,endAngle
            ));
            const label = document.createElementNS(ns,'text');
            label.setAttribute('x',center[0].toFixed(1));
            label.setAttribute('y',center[1].toFixed(1));
            label.textContent = `${row}-${String(seat.number).padStart(2,'0')}`;
            group.append(nativeTitle,tile,label);
            if (seat.status === 'SOLD') {
              const slash = document.createElementNS(ns,'line');
              slash.setAttribute('class','seat-cell-slash');
              slash.setAttribute('x1',(center[0]-8).toFixed(1));
              slash.setAttribute('y1',(center[1]+5).toFixed(1));
              slash.setAttribute('x2',(center[0]+8).toFixed(1));
              slash.setAttribute('y2',(center[1]-5).toFixed(1));
              group.appendChild(slash);
            }
            if (seat.status === 'AVAILABLE') {
              group.addEventListener('click',event => { event.stopPropagation(); handleSeatClick(seat); });
              group.addEventListener('keydown',event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSeatClick(seat); } });
            }
            layer.appendChild(group);
          });

        });
        layer.append(headerBackdrop,heading,subheading);
      }

      function updateActiveZoneTab(zoneKey) {
        document.querySelectorAll('.zone-tab').forEach(tab => {
          const isActive = tab.id === `tab-zone-${zoneKey}`;
          tab.classList.toggle('active-gold-tab', isActive);
          tab.classList.toggle('ghost-tab', !isActive);
        });
      }

      function renderZoneDetailPanel() {
        const panel = document.getElementById('zone-detail-panel');
        const zone = ZONES[activeDetailZoneCode];
        if (!panel || !zone) return;

        const color = ZONE_VISUAL_COLORS[zone.code] || zone.color || '#d8ff3e';
        const zoneSeats = seatsData.filter(seat => seat.zoneCode === zone.code && !seat.visualOnly);
        const availableCount = zone.code.startsWith('GA_STAND')
          ? getZoneAvailability(zone.code)
          : zoneSeats.filter(seat => seat.status === 'AVAILABLE' && !selectedSeatIds.has(seat.id)).length;
        panel.classList.add('is-active');
        panel.style.setProperty('--detail-color', color);

        const header = `
          <div class="zone-detail-header">
            <div>
              <div class="zone-detail-kicker">Chi tiết phân khu · Database drilldown</div>
              <h3 class="zone-detail-name">${zone.name}</h3>
            </div>
            <div class="zone-detail-stats">
              <div class="zone-detail-stat"><span>Giá niêm yết</span><strong class="accent">${formatVND(zone.price)}</strong></div>
              <div class="zone-detail-stat"><span>Còn trống</span><strong>${availableCount} ${zone.code.startsWith('GA_STAND') ? 'vé' : 'ghế'}</strong></div>
            </div>
          </div>
        `;

        if (zone.code.startsWith('GA_STAND')) {
          panel.innerHTML = `${header}
            <div class="detail-standing-card">
              <div class="detail-standing-copy">
                <strong>Vé đứng tự do · Không đánh số ghế</strong>
                <p>Chọn số lượng, sau đó thêm vào tạm tính. Giới hạn tối đa 4 vé mỗi tài khoản.</p>
              </div>
              <div class="detail-standing-actions">
                <div class="detail-standing-qty" aria-label="Số lượng vé ${zone.name}">
                  <button type="button" id="detail-standing-minus" aria-label="Giảm số lượng">−</button>
                  <span id="detail-standing-count-${zone.code}">${standingQuantities[zone.code]}</span>
                  <button type="button" id="detail-standing-plus" aria-label="Tăng số lượng">+</button>
                </div>
                <button type="button" id="detail-standing-add" class="detail-standing-add">Thêm vào tạm tính</button>
              </div>
            </div>`;
          panel.querySelector('#detail-standing-minus')?.addEventListener('click', () => window.updateStandingQuantity(zone.code, -1));
          panel.querySelector('#detail-standing-plus')?.addEventListener('click', () => window.updateStandingQuantity(zone.code, 1));
          panel.querySelector('#detail-standing-add')?.addEventListener('click', () => window.addStandingTickets(zone.code));
          return;
        }

        if (zoneSeats.length === 0) {
          panel.innerHTML = `${header}<div class="zone-detail-empty"><span class="zone-detail-empty-icon">DB</span><div><strong>Chưa có bản ghi ghế mẫu trong bảng GHE</strong><p>Phân khu vẫn được hiển thị trên sơ đồ tổng quan nhưng chưa có dữ liệu hàng/cột để chọn chi tiết.</p></div></div>`;
          return;
        }

        const rows = [...new Set(zoneSeats.map(seat => String(seat.row).toUpperCase()))];
        const rowsMarkup = rows.map(row => {
          const seats = zoneSeats
            .filter(seat => String(seat.row).toUpperCase() === row)
            .sort((a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10));
          const seatsMarkup = seats.map(seat => {
            const selected = selectedSeatIds.has(seat.id);
            const stateClass = selected ? 'selected' : seat.status === 'SOLD' ? 'sold' : seat.status === 'HELD' ? 'held' : seat.status === 'BLOCKED' ? 'blocked' : 'available';
            const sourceLabel = selected ? 'Đang chọn' : seat.sourceStatus === 'DA_BAN' ? 'Đã bán' : seat.sourceStatus === 'DANG_GIU' ? 'Đang giữ' : 'Còn trống';
            const disabled = seat.status !== 'AVAILABLE' ? 'disabled' : '';
            return `<button type="button" class="detail-seat ${stateClass}" data-detail-seat-id="${seat.id}" ${disabled} aria-label="Ghế ${seat.id}, ${sourceLabel}, ${formatVND(seat.price)}">
              <span class="detail-seat-number">${seat.number}</span>
              <span class="detail-seat-code">${seat.id}</span>
            </button>`;
          }).join('');
          return `<div class="detail-seat-row"><div class="detail-row-label">Hàng ${row}</div><div class="detail-row-grid">${seatsMarkup}</div></div>`;
        }).join('');

        panel.innerHTML = `${header}
          <div class="detail-seat-legend">
            <span><i class="legend-available"></i>Trống · TRONG</span>
            <span><i class="legend-sold"></i>Đã bán · DA_BAN</span>
            <span><i class="legend-held"></i>Đang giữ · DANG_GIU</span>
          </div>
          <div class="detail-seat-rows">${rowsMarkup}</div>`;

        panel.querySelectorAll('[data-detail-seat-id]').forEach(button => {
          const seat = seatsData.find(item => item.id === button.dataset.detailSeatId);
          if (seat && seat.status === 'AVAILABLE') button.addEventListener('click', () => handleSeatClick(seat));
        });
      }

      function positionSeatOnStadiumRing(seatEl, seat) {
        const seatNumber = Number.parseInt(seat.number, 10) || 1;
        let ring = 'inner';
        let angle = 0;
        let radiusX = 29;
        let radiusY = 27;

        if (seat.zoneCode === 'ZONE_CD_UP') {
          ring = 'outer';
          const step = 360 / 32;
          angle = -90 + step * (seatNumber - 0.5);
          radiusX = 43;
          radiusY = 40.5;
        } else {
          const row = String(seat.row).toUpperCase();
          const outerRowOrder = { E: 0, A: 1, C: 2, G: 3 };
          const innerRowOrder = { F: 0, B: 1, D: 2, H: 3 };
          const isMiddleRing = Object.prototype.hasOwnProperty.call(outerRowOrder, row);
          const groupIndex = isMiddleRing
            ? outerRowOrder[row]
            : (innerRowOrder[row] ?? 1);
          const groupArc = 75;
          const groupStart = 120 + groupIndex * groupArc;
          const step = groupArc / 6;

          // Hai vòng ghế đang bán chỉ chạy trên cung 300°, chừa trống hoàn toàn
          // phần phía sau Main Stage. Mỗi phân khu chiếm một phần cung bằng nhau.
          angle = groupStart + step * (Math.max(1, Math.min(6, seatNumber)) - 0.5);
          ring = isMiddleRing ? 'middle' : 'inner';
          radiusX = isMiddleRing ? 35.5 : 28.5;
          radiusY = isMiddleRing ? 33 : 26;
        }

        const radians = angle * Math.PI / 180;
        const x = 50 + radiusX * Math.cos(radians);
        const y = 50 + radiusY * Math.sin(radians);
        const tangentAngle = angle + 90;

        seatEl.classList.add('stadium-ring-seat');
        seatEl.style.left = `${x.toFixed(2)}%`;
        seatEl.style.top = `${y.toFixed(2)}%`;
        seatEl.style.setProperty('--seat-angle', `${tangentAngle.toFixed(2)}deg`);
        seatEl.style.setProperty('--seat-text-angle', `${(-tangentAngle).toFixed(2)}deg`);
        seatEl.dataset.ring = ring;
      }

      function renderMapSelectionPanel() {
        const panel = document.getElementById('map-selection-panel');
        if (!panel) return;

        if (pendingMapSeat) {
          const seat = seatsData.find(item => item.id === pendingMapSeat.id) || pendingMapSeat;
          const isSelected = selectedSeatIds.has(seat.id);
          const unavailable = seat.status === 'SOLD' || seat.status === 'HELD';
          const statusLabel = seat.status === 'SOLD'
            ? 'Đã bán'
            : seat.status === 'HELD'
              ? 'Đang được giữ'
              : isSelected ? 'Đang chọn' : 'Còn trống';
          const actionLabel = unavailable
            ? statusLabel
            : isSelected ? 'Bỏ chọn ghế' : 'Chọn ghế này';
          panel.classList.add('is-active');
          panel.innerHTML = `
            <div>
              <div class="map-selection-eyebrow">${seat.zoneName} · ${statusLabel}</div>
              <div class="map-selection-title">Ghế ${seat.id}</div>
              <div class="map-selection-detail">Giá vé: <span class="map-selection-price">${formatVND(seat.price)}</span></div>
            </div>
            <div class="map-selection-actions">
              <button id="map-seat-action" type="button" class="map-selection-action" ${unavailable ? 'disabled' : ''}>${actionLabel}</button>
            </div>
          `;
          const action = document.getElementById('map-seat-action');
          if (action && !unavailable) action.addEventListener('click', () => handleSeatClick(seat));
          return;
        }

        if (pendingStandingZoneCode) {
          const zone = ZONES[pendingStandingZoneCode];
          if (!zone) return;
          panel.classList.add('is-active');
          panel.innerHTML = `
            <div>
              <div class="map-selection-eyebrow">Vé đứng tự do · Không đánh số ghế</div>
              <div class="map-selection-title">${zone.name}</div>
              <div class="map-selection-detail">Giá vé: <span class="map-selection-price">${formatVND(zone.price)}</span> / vé · Còn trống: ${getZoneAvailability(pendingStandingZoneCode)}/${STANDING_CAPACITY[pendingStandingZoneCode]}</div>
            </div>
            <div class="map-selection-actions">
              <div class="map-qty-control" aria-label="Chọn số lượng vé đứng">
                <button id="map-standing-minus" type="button" aria-label="Giảm số lượng">−</button>
                <span id="map-standing-count">${standingQuantities[pendingStandingZoneCode]}</span>
                <button id="map-standing-plus" type="button" aria-label="Tăng số lượng">+</button>
              </div>
              <button id="map-standing-action" type="button" class="map-selection-action">Thêm vào tạm tính</button>
            </div>
          `;
          document.getElementById('map-standing-minus')?.addEventListener('click', () => window.updateStandingQuantity(pendingStandingZoneCode, -1));
          document.getElementById('map-standing-plus')?.addEventListener('click', () => window.updateStandingQuantity(pendingStandingZoneCode, 1));
          document.getElementById('map-standing-action')?.addEventListener('click', () => window.addStandingTickets(pendingStandingZoneCode));
          return;
        }

        panel.classList.remove('is-active');
        panel.replaceChildren();
      }

      function showSeatSelectionPanel(seat) {
        pendingMapSeat = seat;
        pendingStandingZoneCode = null;
        renderMapSelectionPanel();
      }

      function showStandingSelectionPanel(zoneCode) {
        pendingMapSeat = null;
        pendingStandingZoneCode = zoneCode;
        renderMapSelectionPanel();
      }

      // ==========================================
      // 2. RENDER SEATS INTO GRIDS
      // ==========================================
      function renderSeats() {
        const normalizedSearch = currentSearchQuery.toLocaleLowerCase('vi');
        document.querySelectorAll('.stadium-svg-zone[data-zone-code]').forEach(zoneShape => {
          const zoneCode = zoneShape.dataset.zoneCode;
          const zone = ZONES[zoneCode];
          const zoneFilter = zoneShape.dataset.zoneFilter || ZONE_KEY_BY_CODE[zoneCode] || 'C';
          const matchesFilter = currentZoneFilter === 'ALL' || currentZoneFilter === zoneFilter || currentZoneFilter === zoneCode;
          const searchableText = `${zoneCode} ${zone?.name || zoneShape.dataset.name || ''}`.toLocaleLowerCase('vi');
          const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
          const hasSelectedTicket = [...selectedSeatIds].some(ticketId => {
            const standingTicket = standingTickets.get(ticketId);
            if (standingTicket) return standingTicket.zoneCode === zoneCode;
            return seatsData.find(seat => seat.id === ticketId)?.zoneCode === zoneCode;
          });
          const available = getZoneAvailability(zoneCode);

          zoneShape.dataset.available = available;
          zoneShape.style.setProperty('--zone-color', ZONE_VISUAL_COLORS[zoneCode] || zone?.color || '#d8ff3e');
          zoneShape.classList.toggle('is-dimmed', !matchesFilter);
          zoneShape.classList.toggle('is-search-miss', !matchesSearch);
          zoneShape.classList.toggle('is-selected', hasSelectedTicket);
          zoneShape.classList.toggle('is-filter-match', currentZoneFilter !== 'ALL' && matchesFilter);
          zoneShape.classList.toggle('is-active-zone', activeCameraZoneCode === zoneCode);
          zoneShape.setAttribute('aria-label', `${zone?.name || zoneShape.dataset.name}, ${formatVND(zone?.price || Number(zoneShape.dataset.price))}, còn ${available} chỗ. Bấm để phóng to phân khu.`);
        });

        if (
          activeCameraZoneCode &&
          !activeCameraZoneCode.startsWith('GA_STAND') &&
          !document.getElementById('stadium-svg')?.classList.contains('is-camera-moving')
        ) renderCameraSeats(activeCameraZoneCode);
      }

      // ==========================================
      // 3. SEAT INTERACTION & LOGIC
      // ==========================================
      function handleSeatClick(seat) {
        if (seat.status === 'SOLD') {
          // SRS REQUIREMENT: Nếu click vào ghế màu xám: Hiển thị toast thông báo "Ghế này đã có người mua!"
          showToast(`Ghế ${seat.id} này đã có người mua! Vui lòng chọn ghế màu xanh lá.`, 'error');
          // Shake effect on the seat
          const el = document.getElementById(`seat-btn-${seat.id}`);
          if (el) {
            el.classList.add('animate-ping');
            setTimeout(() => el.classList.remove('animate-ping'), 400);
          }
          return;
        }

        if (seat.status === 'HELD') {
          showToast(`Ghế ${seat.id} đang được giữ tạm thời. Vui lòng chọn ghế màu xanh lá.`, 'warning');
          return;
        }

        if (selectedSeatIds.has(seat.id)) {
          // Unselect
          selectedSeatIds.delete(seat.id);
          showToast(`Đã bỏ chọn ghế ${seat.id}`, 'info');
        } else {
          // Check limit 4 tickets (FR-T2-02)
          if (selectedSeatIds.size >= 4) {
            showToast('Bạn chỉ được chọn tối đa 4 vé trên mỗi tài khoản (Quy định SRS FR-T2-02)', 'warning');
            return;
          }
          // Select
          selectedSeatIds.add(seat.id);
          showToast(`Đã chọn ghế ${seat.id} (${formatVND(seat.price)})`, 'success');
        }

        updateSidebar();
        renderSeats();
      }

      function updateStandingQuantityDisplay(zoneCode) {
        const countEl = document.getElementById(`standing-count-${zoneCode}`);
        if (countEl) countEl.innerText = standingQuantities[zoneCode];
        const detailCountEl = document.getElementById(`detail-standing-count-${zoneCode}`);
        if (detailCountEl) detailCountEl.innerText = standingQuantities[zoneCode];
        if (pendingStandingZoneCode === zoneCode) {
          const mapCountEl = document.getElementById('map-standing-count');
          if (mapCountEl) mapCountEl.innerText = standingQuantities[zoneCode];
        }
        if (activeDetailZoneCode === zoneCode) renderZoneDetailPanel();
      }

      window.updateStandingQuantity = function(zoneCode, delta) {
        if (!(zoneCode in standingQuantities)) return;
        const selectedStandingCount = Object.values(standingQuantities).reduce((sum, count) => sum + count, 0);
        const nextQuantity = standingQuantities[zoneCode] + delta;
        if (nextQuantity < 0 || (delta > 0 && selectedSeatIds.size + selectedStandingCount >= 4)) {
          showToast('Bạn chỉ được chọn tối đa 4 vé trên mỗi tài khoản.', 'warning');
          return;
        }
        standingQuantities[zoneCode] = nextQuantity;
        updateStandingQuantityDisplay(zoneCode);
      };

      window.addStandingTickets = function(zoneCode) {
        const quantity = standingQuantities[zoneCode] || 0;
        const zone = ZONES[zoneCode];
        if (!zone || quantity === 0) {
          showToast('Hãy chọn số lượng vé đứng trước khi thêm vào tạm tính.', 'warning');
          return;
        }
        if (selectedSeatIds.size + quantity > 4) {
          showToast('Tổng số vé không được vượt quá 4 vé.', 'warning');
          return;
        }

        const prefix = zoneCode === 'GA_STAND_1' ? 'GA1-STAND-' : 'GA2-STAND-';
        let added = 0;
        for (let index = 1; added < quantity && index <= 4; index++) {
          const ticketId = `${prefix}${String(index).padStart(2, '0')}`;
          if (selectedSeatIds.has(ticketId)) continue;
          selectedSeatIds.add(ticketId);
          standingTickets.set(ticketId, {
            id: ticketId,
            zoneCode,
            zoneName: zone.name,
            price: zone.price
          });
          added++;
        }
        standingQuantities[zoneCode] = 0;
        updateStandingQuantityDisplay(zoneCode);
        if (pendingStandingZoneCode === zoneCode) renderMapSelectionPanel();
        showToast(`Đã thêm ${added} vé ${zone.name} vào tạm tính.`, 'success');
        updateSidebar();
        renderSeats();
      };

      // ==========================================
      // 4. SIDEBAR SUMMARY UPDATE (TẠM TÍNH VÉ ĐÃ CHỌN)
      // ==========================================
      function updateSidebar() {
        const listContainer = document.getElementById('selected-seats-list');
        const emptyMsg = document.getElementById('empty-seats-msg');
        const summaryCount = document.getElementById('summary-count');
        const summaryTotal = document.getElementById('summary-total');
        const proceedBtn = document.getElementById('btn-proceed-booking');
        const clearBtn = document.getElementById('btn-clear-all-seats');
        const holdTimerContainer = document.getElementById('hold-timer-container');

        if (!listContainer || !emptyMsg || !summaryCount || !summaryTotal || !proceedBtn) return;

        listContainer.querySelectorAll('[data-selected-ticket]').forEach(item => item.remove());

        if (selectedSeatIds.size === 0) {
          listContainer.appendChild(emptyMsg);
          emptyMsg.classList.remove('hidden');
          summaryCount.innerText = '0 / 4 vé';
          summaryTotal.innerText = '0 VNĐ';
          proceedBtn.disabled = true;
          if (clearBtn) clearBtn.classList.add('hidden');
          if (holdTimerContainer) holdTimerContainer.classList.add('hidden');
          stopHoldCountdown();
          return;
        }

        emptyMsg.classList.add('hidden');
        if (clearBtn) clearBtn.classList.remove('hidden');
        if (holdTimerContainer) holdTimerContainer.classList.remove('hidden');

        // Start 5-min Hold Countdown if not already running
        if (!holdTimerInterval) {
          startHoldCountdown();
        }

        // Render every selected ticket, including standing tickets.
        let totalAmount = 0;

        selectedSeatIds.forEach(ticketId => {
          const standingTicket = standingTickets.get(ticketId);
          const seat = standingTicket || seatsData.find(item => item.id === ticketId);
          if (!seat) return;
          const ticketName = standingTicket ? standingTicket.id : seat.id;
          const zoneName = standingTicket ? standingTicket.zoneName : seat.zoneName;
          const ticketPrice = standingTicket ? standingTicket.price : seat.price;
          totalAmount += ticketPrice;

          const itemEl = document.createElement('div');
          itemEl.dataset.selectedTicket = 'true';
          itemEl.className = 'p-2.5 rounded-[10px] inset-dark-cell flex items-center justify-between gap-2 text-xs hover:border-amber-500/40 transition';
          itemEl.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-[#EAB308] shadow-sm shadow-amber-400/50"></span>
              <div>
                <div class="font-mono font-bold text-white">${ticketName}</div>
                <div class="text-[10px] text-slate-400">${zoneName}</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-bold text-amber-400 text-xs">${formatVND(ticketPrice)}</span>
              <button
                type="button"
                data-remove-ticket-id="${ticketName}"
                class="p-1 rounded-[6px] text-slate-400 hover:text-red-400 hover:bg-white/[0.08] transition cursor-pointer"
                title="Bỏ ghế này"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          `;
          const removeButton = itemEl.querySelector('[data-remove-ticket-id]');
          if (removeButton) {
            removeButton.addEventListener('click', event => {
              event.preventDefault();
              event.stopPropagation();
              window.removeSingleSeat(ticketName);
            });
          }
          listContainer.appendChild(itemEl);
        });

        summaryCount.innerText = `${selectedSeatIds.size} / 4 vé`;
        summaryTotal.innerText = formatVND(totalAmount);
        proceedBtn.disabled = false;
      }

      window.removeSingleSeat = function(ticketId) {
        selectedSeatIds.delete(ticketId);
        standingTickets.delete(ticketId);
        showToast(`Đã bỏ chọn vé ${ticketId}`, 'info');
        updateSidebar();
        renderSeats();
      };

      window.clearAllSeats = function() {
        selectedSeatIds.clear();
        standingTickets.clear();
        standingQuantities.GA_STAND_1 = 0;
        standingQuantities.GA_STAND_2 = 0;
        updateStandingQuantityDisplay('GA_STAND_1');
        updateStandingQuantityDisplay('GA_STAND_2');
        showToast('Đã xóa tất cả vé đã chọn', 'info');
        updateSidebar();
        renderSeats();
      };

      // ==========================================
      // 5. COUNTDOWN TIMER SIMULATION (FR-T3-01 5 PHÚT GIỮ CHỖ)
      // ==========================================
      function startHoldCountdown() {
        holdTimeRemaining = 300; // 5 minutes
        updateHoldTimerDisplay();
        clearInterval(holdTimerInterval);
        holdTimerInterval = setInterval(() => {
          holdTimeRemaining--;
          updateHoldTimerDisplay();
          if (holdTimeRemaining <= 0) {
            stopHoldCountdown();
            selectedSeatIds.clear();
            standingTickets.clear();
            standingQuantities.GA_STAND_1 = 0;
            standingQuantities.GA_STAND_2 = 0;
            updateStandingQuantityDisplay('GA_STAND_1');
            updateStandingQuantityDisplay('GA_STAND_2');
            updateSidebar();
            renderSeats();
            showToast('Đã hết hạn giữ chỗ 5 phút! Ghế đã được tự động mở lại theo chuẩn FR-T3-01.', 'warning');
          }
        }, 1000);
      }

      function stopHoldCountdown() {
        clearInterval(holdTimerInterval);
        holdTimerInterval = null;
      }

      function updateHoldTimerDisplay() {
        const timerEl = document.getElementById('hold-countdown');
        if (!timerEl) return;
        const mins = Math.floor(holdTimeRemaining / 60).toString().padStart(2, '0');
        const secs = (holdTimeRemaining % 60).toString().padStart(2, '0');
        timerEl.innerText = `${mins}:${secs}`;
      }

      // ==========================================
      // 6. REALTIME CONCERT COUNTDOWN TIMER (3D MECHANICAL SPLIT-FLAP)
      // ==========================================
      function setFlipCard(unitId, nextVal) {
        const container = document.getElementById(unitId);
        if (!container) return;
        const currentVal = container.getAttribute('data-val');

        const topStatic = container.querySelector('.flip-top-static .flip-num');
        const bottomStatic = container.querySelector('.flip-bottom-static .flip-num');
        const leafTop = container.querySelector('.flip-leaf-top');
        const leafTopNum = leafTop ? leafTop.querySelector('.flip-num') : null;
        const leafBottom = container.querySelector('.flip-leaf-bottom');
        const leafBottomNum = leafBottom ? leafBottom.querySelector('.flip-num') : null;

        if (!topStatic || !bottomStatic || !leafTop || !leafBottom) return;

        // First initialization
        if (!currentVal) {
          container.setAttribute('data-val', nextVal);
          topStatic.innerText = nextVal;
          bottomStatic.innerText = nextVal;
          if (leafTopNum) leafTopNum.innerText = nextVal;
          if (leafBottomNum) leafBottomNum.innerText = nextVal;
          return;
        }

        if (currentVal === nextVal) return;

        container.setAttribute('data-val', nextVal);

        // Prepare values for flip:
        // 1. Static top immediately has NEXT value (revealed when leafTop folds away)
        topStatic.innerText = nextVal;
        // 2. Leaf top holds OLD value and folds down
        if (leafTopNum) leafTopNum.innerText = currentVal;
        // 3. Static bottom holds OLD value until leafBottom unfolds onto it
        bottomStatic.innerText = currentVal;
        // 4. Leaf bottom has NEXT value
        if (leafBottomNum) leafBottomNum.innerText = nextVal;

        // Trigger animation
        leafTop.classList.remove('flipping');
        leafBottom.classList.remove('flipping');
        void leafTop.offsetWidth; // force DOM reflow

        leafTop.classList.add('flipping');
        leafBottom.classList.add('flipping');

        setTimeout(() => {
          bottomStatic.innerText = nextVal;
          if (leafTopNum) leafTopNum.innerText = nextVal;
          leafTop.classList.remove('flipping');
          leafBottom.classList.remove('flipping');
        }, 580);
      }

      function initConcertCountdown() {
        // Date: 10:00, Ngày 01/10/2026
        const targetDate = new Date('2026-10-01T10:00:00+07:00').getTime();

        function update() {
          const now = new Date().getTime();
          const distance = targetDate - now;

          if (distance <= 0) {
            setFlipCard('flip-unit-days', '00');
            setFlipCard('flip-unit-hours', '00');
            setFlipCard('flip-unit-minutes', '00');
            setFlipCard('flip-unit-seconds', '00');
            return;
          }

          const days = Math.floor(distance / (1000 * 60 * 60 * 24));
          const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((distance % (1000 * 60)) / 1000);

          const daysStr = days.toString().padStart(2, '0');
          const hoursStr = hours.toString().padStart(2, '0');
          const minsStr = minutes.toString().padStart(2, '0');
          const secsStr = seconds.toString().padStart(2, '0');

          setFlipCard('flip-unit-days', daysStr);
          setFlipCard('flip-unit-hours', hoursStr);
          setFlipCard('flip-unit-minutes', minsStr);
          setFlipCard('flip-unit-seconds', secsStr);

          // Update accessibility fallbacks
          const daysEl = document.getElementById('countdown-days');
          const hoursEl = document.getElementById('countdown-hours');
          const minsEl = document.getElementById('countdown-minutes');
          const secsEl = document.getElementById('countdown-seconds');
          if (daysEl) daysEl.innerText = daysStr;
          if (hoursEl) hoursEl.innerText = hoursStr;
          if (minsEl) minsEl.innerText = minsStr;
          if (secsEl) secsEl.innerText = secsStr;
        }

        update();
        setInterval(update, 1000);
      }

      // ==========================================
      // 7. TOOLTIP LOGIC (FR-T1-02 Should-Have)
      // ==========================================
      const tooltip = document.getElementById('seat-tooltip');

      function showSeatTooltip(e, seat) {
        if (!tooltip) return;
        const isSelected = selectedSeatIds.has(seat.id);
        const isSold = seat.status === 'SOLD';
        const isHeld = seat.status === 'HELD';

        document.getElementById('tooltip-seat-code').innerText = seat.id;
        document.getElementById('tooltip-zone').innerText = seat.zoneName;
        document.getElementById('tooltip-row').innerText = seat.row;
        document.getElementById('tooltip-number').innerText = seat.number;
        document.getElementById('tooltip-price').innerText = formatVND(seat.price);

        const statusEl = document.getElementById('tooltip-seat-status');
        if (isSelected) {
          statusEl.innerText = 'Đang chọn tạm tính';
          statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        } else if (isSold) {
          statusEl.innerText = 'Đã bán';
          statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-white/[0.08] text-slate-400 border border-white/[0.08]';
        } else if (isHeld) {
          statusEl.innerText = 'Đang được giữ';
          statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        } else {
          statusEl.innerText = 'Còn trống';
          statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        }

        tooltip.style.opacity = '1';
        moveSeatTooltip(e);
      }

      function moveSeatTooltip(e) {
        if (!tooltip) return;
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY - 12}px`;
      }

      function hideSeatTooltip() {
        if (!tooltip) return;
        tooltip.style.opacity = '0';
      }

      // ==========================================
      // 8. TOAST NOTIFICATIONS (MÃ MÀU VÀ PHẢN HỒI)
      // ==========================================
      function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');

        let borderClass = 'border-white/[0.1] bg-[#0D1117]/95 text-slate-200';
        let iconSvg = `<svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

        if (type === 'error') {
          borderClass = 'border-red-500/50 bg-[#160b0e]/95 text-red-200 shadow-red-950/50';
          iconSvg = `<svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        } else if (type === 'success') {
          borderClass = 'border-emerald-500/50 bg-[#0a1610]/95 text-emerald-200 shadow-emerald-950/50';
          iconSvg = `<svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        } else if (type === 'warning') {
          borderClass = 'border-amber-500/50 bg-[#191409]/95 text-amber-200 shadow-amber-950/50';
          iconSvg = `<svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        }

        toast.className = `toast-animate pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-[12px] border text-xs shadow-2xl backdrop-blur-md max-w-sm ${borderClass}`;
        toast.innerHTML = `
          ${iconSvg}
          <span class="flex-1 font-medium leading-tight">${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(10px)';
          toast.style.transition = 'all 0.25s ease';
          setTimeout(() => toast.remove(), 250);
        }, 3600);
      }

      // ==========================================
      // 9. FILTERS & SEARCH (MỞ RỘNG SHOULD-HAVE)
      // ==========================================
      function filterByZone(zoneKey, shouldScroll = true) {
        currentZoneFilter = zoneKey;
        const detailZoneByFilter = {
          VIP: 'VVIP_DIAMOND',
          VIP_PLATINUM_1: 'VIP_PLATINUM_1',
          STANDING: 'GA_STAND_1',
          A: 'ZONE_A_T1',
          B: 'ZONE_B_T2',
          C: 'ZONE_CD_UP'
        };
        const cameraZoneCode = detailZoneByFilter[zoneKey] || null;

        // Update active tab styles
        document.querySelectorAll('.zone-tab').forEach(tab => {
          tab.classList.remove('active-gold-tab');
          tab.classList.add('ghost-tab');
        });

        const activeTab = document.getElementById(`tab-zone-${zoneKey}`);
        if (activeTab) {
          activeTab.classList.remove('ghost-tab');
          activeTab.classList.add('active-gold-tab');
        }

        const inventoryLabel = document.getElementById('inventory-zone-label');
        if (inventoryLabel) {
          const labels = {
            ALL: 'Hiển thị tất cả',
            VIP: 'VVIP Lounge & VIP Platinum',
            VIP_PLATINUM_1: 'VIP Platinum 1',
            STANDING: 'Fanzone Standing 1 & 2',
            A: 'Khán đài A · Tầng 1',
            B: 'Khán đài B · Tầng 2',
            C: 'Khán đài C–D · Tầng cao'
          };
          inventoryLabel.textContent = labels[zoneKey] || zoneKey;
        }

        if (cameraZoneCode) focusStadiumZone(cameraZoneCode);
        else resetStadiumCamera();

        // Smooth scroll to seating section if triggered from pricing table
        const seatingSection = document.getElementById('seating-section');
        if (seatingSection && shouldScroll) {
          seatingSection.scrollIntoView({ behavior: 'auto' });
        }
      }

      // Search Seat Input Handler
      const searchInput = document.getElementById('search-seat-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          currentSearchQuery = e.target.value.trim();
          renderSeats();
        });
      }

      // Zoom Controls Handler
      let currentZoom = 1;
      const zoomContainer = document.getElementById('map-zoom-container');
      const zoomText = document.getElementById('zoom-level-text');

      const btnZoomIn = document.getElementById('btn-zoom-in');
      if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
          if (currentZoom < 1.4) {
            currentZoom += 0.1;
            applyZoom();
          }
        });
      }

      const btnZoomOut = document.getElementById('btn-zoom-out');
      if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
          if (currentZoom > 0.7) {
            currentZoom -= 0.1;
            applyZoom();
          }
        });
      }

      const btnZoomReset = document.getElementById('btn-zoom-reset');
      if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
          currentZoom = 1;
          applyZoom();
        });
      }

      function applyZoom() {
        if (!zoomContainer || !zoomText) return;
        zoomContainer.style.transform = `scale(${currentZoom})`;
        zoomText.innerText = `${Math.round(currentZoom * 100)}%`;
      }

      // Academic SRS Toggle Handler (safe guard)
      const toggleSrsBtn = document.getElementById('toggle-srs-badge-btn');
      if (toggleSrsBtn) {
        let srsBadgesVisible = true;
        const srsStatusText = document.getElementById('srs-status-text');
        toggleSrsBtn.addEventListener('click', () => {
          srsBadgesVisible = !srsBadgesVisible;
          const badges = document.querySelectorAll('.srs-badge');
          badges.forEach(b => {
            b.style.display = srsBadgesVisible ? 'inline-flex' : 'none';
          });
          if (srsStatusText) srsStatusText.innerText = srsBadgesVisible ? 'BẬT' : 'TẮT';
        });
      }

      // Clear all seats button
      const clearBtn = document.getElementById('btn-clear-all-seats');
      if (clearBtn) {
        clearBtn.addEventListener('click', window.clearAllSeats);
      }

      // Modal Triggers
      const teamModal = document.getElementById('team-modal');
      const scheduleModal = document.getElementById('schedule-modal');
      const bookingModal = document.getElementById('booking-modal');

      const btnOpenTeam = document.getElementById('btn-open-team-info');
      if (btnOpenTeam && teamModal) {
        btnOpenTeam.addEventListener('click', () => teamModal.classList.remove('hidden'));
      }

      const btnCloseTeam = document.getElementById('btn-close-team-modal');
      if (btnCloseTeam && teamModal) {
        btnCloseTeam.addEventListener('click', () => teamModal.classList.add('hidden'));
      }

      const btnCloseTeam2 = document.getElementById('btn-close-team-modal-2');
      if (btnCloseTeam2 && teamModal) {
        btnCloseTeam2.addEventListener('click', () => teamModal.classList.add('hidden'));
      }

      const btnViewSchedule = document.getElementById('btn-view-schedule');
      if (btnViewSchedule && scheduleModal) {
        btnViewSchedule.addEventListener('click', () => scheduleModal.classList.remove('hidden'));
      }

      const btnCloseSchedule = document.getElementById('btn-close-schedule-modal');
      if (btnCloseSchedule && scheduleModal) {
        btnCloseSchedule.addEventListener('click', () => scheduleModal.classList.add('hidden'));
      }

      const btnCloseSchedule2 = document.getElementById('btn-close-schedule-modal-2');
      if (btnCloseSchedule2 && scheduleModal) {
        btnCloseSchedule2.addEventListener('click', () => scheduleModal.classList.add('hidden'));
      }

      const btnCloseBooking = document.getElementById('btn-close-booking-modal');
      if (btnCloseBooking && bookingModal) {
        btnCloseBooking.addEventListener('click', () => bookingModal.classList.add('hidden'));
      }

      // Proceed Booking Action (Modal Preview)
      const btnProceedBooking = document.getElementById('btn-proceed-booking');
      if (btnProceedBooking) {
        btnProceedBooking.addEventListener('click', () => {
          if (selectedSeatIds.size === 0 || !bookingModal) return;

          let itemsHtml = '';
          let total = 0;
          selectedSeatIds.forEach(id => {
            const ticket = standingTickets.get(id) || seatsData.find(x => x.id === id);
            if (ticket) {
              total += ticket.price;
              itemsHtml += `
                <div class="flex justify-between py-1 border-b border-slate-900">
                  <span class="font-mono text-amber-400">${ticket.id} (${ticket.zoneName})</span>
                  <span class="text-white">${formatVND(ticket.price)}</span>
                </div>
              `;
            }
          });

          itemsHtml += `
            <div class="flex justify-between font-bold text-white pt-2 text-sm">
              <span>Tổng cộng (${selectedSeatIds.size} vé):</span>
              <span class="text-amber-400 font-display">${formatVND(total)}</span>
            </div>
          `;

          const summaryEl = document.getElementById('booking-modal-summary');
          if (summaryEl) summaryEl.innerHTML = itemsHtml;
          bookingModal.classList.remove('hidden');
        });
      }

      function simulateNextSprint() {
        if (bookingModal) bookingModal.classList.add('hidden');
        showToast('Chuyển tiếp thành công: Dữ liệu ghế đã chọn sẽ chuyển tới Sprint 2 (Xác thực OTP) & Sprint 3 (Thanh toán đa kênh VNPAY/MoMo)!', 'success');
      }

      // Compatibility bridge for validated prototype controls that still use
      // inline handlers. These will be replaced by React callbacks in phase 2.
      window.filterByZone = filterByZone;
      window.simulateNextSprint = simulateNextSprint;

      // Format Currency (VNĐ)
      function formatVND(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
      }

      // ==========================================
      // 10. DYNAMIC STARFIELD ENGINE (PIXEL CONTRACT)
      // ==========================================
      function initStarfield() {
        const stA = document.getElementById('stA');
        const stB = document.getElementById('stB');
        if (!stA || !stB) return;

        function generateStars(count, size, palette) {
          const stars = [];
          const maxW = Math.max(window.innerWidth, 1920);
          const maxH = Math.max(window.innerHeight, 2400);
          for (let i = 0; i < count; i++) {
            const x = Math.floor(Math.random() * maxW);
            const y = Math.floor(Math.random() * maxH);
            const color = palette[Math.floor(Math.random() * palette.length)];
            stars.push(`${x}px ${y}px 0 ${size}px ${color}`);
          }
          return stars.join(', ');
        }

        // Layer A: 120 fine ambient points
        stA.style.boxShadow = generateStars(120, 0, [
          'rgba(255, 255, 255, 0.18)',
          'rgba(254, 240, 138, 0.15)',
          'rgba(253, 230, 138, 0.12)',
          'rgba(240, 249, 255, 0.22)',
          'rgba(255, 255, 255, 0.08)'
        ]);

        // Layer B: sparse glittering highlights
        stB.style.boxShadow = generateStars(20, 0.5, [
          'rgba(255, 255, 255, 0.55)',
          'rgba(253, 224, 71, 0.48)',
          'rgba(250, 204, 21, 0.42)',
          'rgba(255, 255, 255, 0.60)'
        ]);
      }

      // ==========================================
      // 11. FOCUS ON SCROLL (Sequential Section Dimming)
      // ==========================================
      function initFocusOnScroll() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const sectionIds = ['concert-hero', 'artist-lineup', 'pricing-section', 'seating-section'];
        const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
        if (sections.length === 0) return;

        let activeSectionId = 'concert-hero';
        const ratios = new Map(sections.map(section => [section.id, 0]));

        function applyFocus(targetId) {
          if (!targetId || activeSectionId === targetId) return;
          activeSectionId = targetId;
          sections.forEach(section => {
            const isActive = section.id === targetId;
            section.classList.toggle('section-focused', isActive);
            section.classList.toggle('section-dimmed', !isActive);
          });
        }

        const observer = new IntersectionObserver(entries => {
          entries.forEach(entry => ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0));
          let bestId = activeSectionId;
          let bestRatio = 0;
          ratios.forEach((ratio, id) => {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = id;
            }
          });
          if (bestRatio > 0) applyFocus(bestId);
        }, {
          rootMargin: '-22% 0px -22% 0px',
          threshold: [0, 0.15, 0.35]
        });

        sections.forEach(section => observer.observe(section));
      }

      // ==========================================
      // INITIAL BOOTSTRAP
      // ==========================================
      async function bootstrap() {
        initStarfield();
        await loadDataFromDatabase();
        mountZonesOnStadiumMap();
        renderSeats();
        initConcertCountdown();
        initFocusOnScroll();
      }

      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', bootstrap);
      } else {
        bootstrap();
      }
