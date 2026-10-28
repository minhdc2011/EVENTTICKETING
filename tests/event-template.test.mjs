import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  calculateCountdown,
  determineCountdownTarget,
  formatDateShort,
  formatEventDateTime,
  formatMoney,
  getCategoryLabel,
  getSaleStatusMeta,
  hasAssistAction,
  hasContactContent,
  hasMediaContent,
  hasPolicyContent,
  hasVenueContent,
  isMachineSloganToken,
  normalizeEventSlogan,
  parseTierBenefits,
  resolveCtaState,
  resolveEventBackdrop,
  resolveHeroCta,
  SALE_STATUS,
} from '../src/components/event-template/eventTemplateLogic.js';

test('getCategoryLabel maps category keys to readable Vietnamese labels', () => {
  assert.equal(getCategoryLabel('AM_NHAC'), 'Âm nhạc');
  assert.equal(getCategoryLabel('HOI_THAO'), 'Hội thảo');
  assert.equal(getCategoryLabel('THE_THAO'), 'Thể thao');
  assert.equal(getCategoryLabel('SAN_KHAU'), 'Sân khấu');
  assert.equal(getCategoryLabel('WORKSHOP'), 'Workshop');
  assert.equal(getCategoryLabel('THAM_QUAN'), 'Tham quan');
  assert.equal(getCategoryLabel('TRIEN_LAM'), 'Triển lãm');
  assert.equal(getCategoryLabel('CONG_NGHE'), 'Công nghệ');
  assert.equal(getCategoryLabel('KHAC'), 'Sự kiện khác');
  assert.equal(getCategoryLabel('CHUA_XAC_DINH'), 'CHUA XAC DINH');
  assert.equal(getCategoryLabel(null), 'Sự kiện');
  assert.equal(getCategoryLabel(''), 'Sự kiện');
});

test('formatMoney formats amounts into VND currency standard or free label', () => {
  assert.equal(formatMoney(0), '0 ₫ (Miễn phí)');
  assert.match(formatMoney(450000), /450\.000\s*(₫|VND)/);
  assert.match(formatMoney(1200000), /1\.200\.000\s*(₫|VND)/);
  assert.equal(formatMoney(null), 'Đang cập nhật');
  assert.equal(formatMoney(undefined), 'Đang cập nhật');
  assert.equal(formatMoney(Number.NaN), 'Đang cập nhật');
});

test('formatEventDateTime and formatDateShort format dates cleanly with fallbacks', () => {
  const sampleIso = '2026-11-20T19:30:00+07:00';
  const full = formatEventDateTime(sampleIso);
  assert.match(full, /20\/11\/2026/);
  assert.match(full, /19:30/);

  const short = formatDateShort(sampleIso);
  assert.equal(short, '20/11/2026');

  assert.equal(formatEventDateTime(null), 'Đang cập nhật');
  assert.equal(formatEventDateTime('invalid-date'), 'Đang cập nhật');
  assert.equal(formatDateShort(null), 'Đang cập nhật');
  assert.equal(formatDateShort('invalid-date'), 'Đang cập nhật');
});

test('getSaleStatusMeta provides tone and live indicators for sale statuses', () => {
  const onSale = getSaleStatusMeta(SALE_STATUS.ON_SALE);
  assert.equal(onSale.label, 'Đang mở bán');
  assert.equal(onSale.tone, 'emerald');
  assert.equal(onSale.isLive, true);

  const upcoming = getSaleStatusMeta(SALE_STATUS.UPCOMING);
  assert.equal(upcoming.label, 'Sắp mở bán');
  assert.equal(upcoming.tone, 'amber');
  assert.equal(upcoming.isLive, false);

  const soldOut = getSaleStatusMeta(SALE_STATUS.SOLD_OUT);
  assert.equal(soldOut.label, 'Hết vé');
  assert.equal(soldOut.tone, 'rose');
  assert.equal(soldOut.isLive, false);

  const closed = getSaleStatusMeta(SALE_STATUS.CLOSED);
  assert.equal(closed.label, 'Đã đóng bán');
  assert.equal(closed.tone, 'slate');
  assert.equal(closed.isLive, false);

  const unknown = getSaleStatusMeta('OTHER');
  assert.equal(unknown.label, 'Đang cập nhật');
  assert.equal(unknown.tone, 'slate');
});

test('resolveEventBackdrop handles banner and poster combinations gracefully', () => {
  const both = resolveEventBackdrop('https://example.com/banner.jpg', 'https://example.com/poster.jpg');
  assert.equal(both.backgroundUrl, 'https://example.com/banner.jpg');
  assert.equal(both.posterUrl, 'https://example.com/poster.jpg');
  assert.equal(both.hasImage, true);

  const posterOnly = resolveEventBackdrop(undefined, 'https://example.com/poster.jpg');
  assert.equal(posterOnly.backgroundUrl, 'https://example.com/poster.jpg');
  assert.equal(posterOnly.posterUrl, 'https://example.com/poster.jpg');
  assert.equal(posterOnly.hasImage, true);

  const bannerOnly = resolveEventBackdrop('https://example.com/banner.jpg', undefined);
  assert.equal(bannerOnly.backgroundUrl, 'https://example.com/banner.jpg');
  assert.equal(bannerOnly.posterUrl, 'https://example.com/banner.jpg');
  assert.equal(bannerOnly.hasImage, true);

  const none = resolveEventBackdrop('', '   ');
  assert.equal(none.backgroundUrl, null);
  assert.equal(none.posterUrl, null);
  assert.equal(none.hasImage, false);
});

test('parseTierBenefits extracts benefits from newlines, bullets, and delimiters', () => {
  const multiline = `• Chỗ ngồi khu VIP trung tâm
- Tặng gift set lưu niệm
* Lối check-in ưu tiên`;
  const parsed1 = parseTierBenefits(multiline);
  assert.deepEqual(parsed1, [
    'Chỗ ngồi khu VIP trung tâm',
    'Tặng gift set lưu niệm',
    'Lối check-in ưu tiên',
  ]);

  const semicolonSeparated = 'Ghế ngồi tự do; Miễn phí gửi xe; Nước uống chào mừng';
  const parsed2 = parseTierBenefits(semicolonSeparated);
  assert.deepEqual(parsed2, [
    'Ghế ngồi tự do',
    'Miễn phí gửi xe',
    'Nước uống chào mừng',
  ]);

  const singleLine = 'Toàn quyền tham dự phiên thảo luận chính';
  assert.deepEqual(parseTierBenefits(singleLine), [
    'Toàn quyền tham dự phiên thảo luận chính',
  ]);

  assert.deepEqual(parseTierBenefits(''), []);
  assert.deepEqual(parseTierBenefits(null), []);
  assert.deepEqual(parseTierBenefits(undefined), []);
});

test('calculateCountdown accurately breaks down future target into days, hours, mins, secs', () => {
  const baseTime = new Date('2026-10-10T10:00:00Z').getTime();
  // 2 days, 3 hours, 4 minutes, 5 seconds in the future
  const futureMs = baseTime + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000;
  const targetIso = new Date(futureMs).toISOString();

  const cd = calculateCountdown(targetIso, baseTime);
  assert.equal(cd.days, 2);
  assert.equal(cd.hours, 3);
  assert.equal(cd.minutes, 4);
  assert.equal(cd.seconds, 5);
  assert.equal(cd.isPast, false);
  assert.deepEqual(cd.formatted, {
    days: '02',
    hours: '03',
    minutes: '04',
    seconds: '05',
  });

  // Target in the past
  const pastMs = baseTime - 10000;
  const pastCd = calculateCountdown(new Date(pastMs).toISOString(), baseTime);
  assert.equal(pastCd.isPast, true);
  assert.equal(pastCd.days, 0);
  assert.equal(pastCd.formatted.days, '00');

  // Invalid or null target
  assert.equal(calculateCountdown(null, baseTime).isPast, true);
  assert.equal(calculateCountdown('not-a-date', baseTime).isPast, true);
});

test('determineCountdownTarget selects appropriate target date and copy per sale state', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const futureSale = '2026-10-05T09:00:00Z';
  const futureStart = '2026-10-20T19:00:00Z';

  // 1. UPCOMING event targets saleStartsAt
  const upcomingRes = determineCountdownTarget(
    {saleStartsAt: futureSale, startsAt: futureStart},
    SALE_STATUS.UPCOMING,
    now
  );
  assert.equal(upcomingRes.targetIso, futureSale);
  assert.equal(upcomingRes.isActive, true);
  assert.match(upcomingRes.heading, /MỞ BÁN/);

  // 2. ON_SALE event targets startsAt
  const onSaleRes = determineCountdownTarget(
    {saleStartsAt: '2026-09-20T00:00:00Z', startsAt: futureStart},
    SALE_STATUS.ON_SALE,
    now
  );
  assert.equal(onSaleRes.targetIso, futureStart);
  assert.equal(onSaleRes.isActive, true);
  assert.match(onSaleRes.heading, /KHAI MẠC/);

  // 3. CLOSED event reports completion
  const closedRes = determineCountdownTarget(
    {saleStartsAt: '2026-09-01T00:00:00Z', startsAt: '2026-09-10T00:00:00Z'},
    SALE_STATUS.CLOSED,
    now
  );
  assert.equal(closedRes.targetIso, null);
  assert.equal(closedRes.isActive, false);
  assert.match(closedRes.heading, /KẾT THÚC/);
});

test('resolveCtaState governs booking CTA actions and disabled invariants strictly', () => {
  const sampleTier = {id: 1, name: 'VIP', price: 500000, available: 10};
  const soldOutTier = {id: 2, name: 'Standard', price: 200000, available: 0};

  // Case 1: No tiers configured
  const noTiers = resolveCtaState({
    saleStatus: SALE_STATUS.ON_SALE,
    selectedTier: null,
    hasTiers: false,
  });
  assert.equal(noTiers.disabled, true);
  assert.equal(noTiers.action, 'none');

  // Case 2: UPCOMING state
  const upcoming = resolveCtaState({
    saleStatus: SALE_STATUS.UPCOMING,
    selectedTier: sampleTier,
    hasTiers: true,
  });
  assert.equal(upcoming.disabled, true);
  assert.equal(upcoming.action, 'upcoming');
  assert.equal(upcoming.label, 'Sắp mở bán');

  // Case 3: CLOSED state
  const closed = resolveCtaState({
    saleStatus: SALE_STATUS.CLOSED,
    selectedTier: sampleTier,
    hasTiers: true,
  });
  assert.equal(closed.disabled, true);
  assert.equal(closed.action, 'closed');
  assert.equal(closed.label, 'Đã đóng bán');

  // Case 4: SOLD_OUT event
  const soldOut = resolveCtaState({
    saleStatus: SALE_STATUS.SOLD_OUT,
    selectedTier: sampleTier,
    hasTiers: true,
  });
  assert.equal(soldOut.disabled, true);
  assert.equal(soldOut.action, 'sold_out');
  assert.equal(soldOut.label, 'Hết vé');

  // Case 5: ON_SALE without selected tier prompts tier selection
  const onSaleNoSelect = resolveCtaState({
    saleStatus: SALE_STATUS.ON_SALE,
    selectedTier: null,
    hasTiers: true,
  });
  assert.equal(onSaleNoSelect.disabled, false);
  assert.equal(onSaleNoSelect.action, 'select_tier');
  assert.equal(onSaleNoSelect.label, 'Chọn hạng vé');

  // Case 6: ON_SALE with sold-out selected tier disables action
  const onSaleSoldOutTier = resolveCtaState({
    saleStatus: SALE_STATUS.ON_SALE,
    selectedTier: soldOutTier,
    hasTiers: true,
  });
  assert.equal(onSaleSoldOutTier.disabled, true);
  assert.equal(onSaleSoldOutTier.action, 'tier_sold_out');
  assert.equal(onSaleSoldOutTier.label, 'Hạng vé đã hết');

  // Case 7: ON_SALE with available tier enables honest booking assistance CTA
  const onSaleReady = resolveCtaState({
    saleStatus: SALE_STATUS.ON_SALE,
    selectedTier: sampleTier,
    hasTiers: true,
    hasAssistAction: true,
  });
  assert.equal(onSaleReady.disabled, false);
  assert.equal(onSaleReady.action, 'checkout_assist');
  assert.equal(onSaleReady.label, 'Liên hệ đặt vé');

  // Case 8: ON_SALE with available tier but no assist action channels disables CTA
  const onSaleNoAssist = resolveCtaState({
    saleStatus: SALE_STATUS.ON_SALE,
    selectedTier: sampleTier,
    hasTiers: true,
    hasAssistAction: false,
  });
  assert.equal(onSaleNoAssist.disabled, true);
  assert.equal(onSaleNoAssist.action, 'no_assist_channel');
  assert.equal(onSaleNoAssist.label, 'Chưa có kênh liên hệ');
});

test('hasAssistAction detects available assistance communication channels correctly', () => {
  assert.equal(hasAssistAction({contactHotline: '0901234567'}), true);
  assert.equal(hasAssistAction({contactEmail: 'support@event.vn'}), true);
  assert.equal(hasAssistAction({onlineLink: 'https://zoom.us/j/123'}), true);
  assert.equal(
    hasAssistAction({
      contactHotline: '0901234567',
      contactEmail: 'support@event.vn',
      onlineLink: 'https://zoom.us/j/123',
    }),
    true
  );

  // Negative cases
  assert.equal(hasAssistAction({}), false);
  assert.equal(hasAssistAction({contactHotline: '', contactEmail: '   ', onlineLink: null}), false);
  assert.equal(hasAssistAction(null), false);
  assert.equal(hasAssistAction(undefined), false);
});

test('optional sections visibility predicates collapse empty sections completely', () => {
  // Empty event record
  const emptyEvent = {};
  assert.equal(hasMediaContent(emptyEvent), false);
  assert.equal(hasVenueContent(emptyEvent), false);
  assert.equal(hasPolicyContent(emptyEvent), false);
  assert.equal(hasContactContent(emptyEvent), false);

  // Media
  assert.equal(hasMediaContent({trailerUrl: 'https://youtube.com/watch?v=123'}), true);
  assert.equal(hasMediaContent({seatingMapUrl: 'https://example.com/map.png'}), true);
  assert.equal(hasMediaContent({trailerUrl: '  '}), false);

  // Venue
  assert.equal(hasVenueContent({venueName: 'Hội trường A'}), true);
  assert.equal(hasVenueContent({address: '123 Đường B'}), true);
  assert.equal(hasVenueContent({locationMode: 'ONLINE'}), true);
  assert.equal(hasVenueContent({onlineLink: 'https://zoom.us/j/123'}), true);
  assert.equal(hasVenueContent({onlineInstructions: 'Cài đặt Zoom trước'}), true);

  // Policy
  assert.equal(hasPolicyContent({ageRestriction: '16+'}), true);
  assert.equal(hasPolicyContent({refundPolicy: 'Không hoàn tiền'}), true);
  assert.equal(hasPolicyContent({termsAndConditions: 'Quy định trang phục'}), true);

  // Contact
  assert.equal(hasContactContent({contactEmail: 'support@event.vn'}), true);
  assert.equal(hasContactContent({contactHotline: '0901234567'}), true);
  assert.equal(hasContactContent({fanpageUrl: 'https://fb.com/event'}), true);
  assert.equal(hasContactContent({permitNumber: 'GP-2026/HN'}), true);
});

test('event-template.css adheres to design decisions and accessibility constraints', async () => {
  const css = await readFile(
    new URL('../src/components/event-template/event-template.css', import.meta.url),
    'utf8'
  );

  // 1. Dark-stage visual base with category-aware surface token
  assert.match(
    css,
    /\.et-shell\s*\{[^}]*background-color:\s*var\(--et-cat-bg,\s*#06080d\)/i,
    'Dark obsidian fallback with category-aware background token'
  );
  assert.match(css, /\.et-stage-ambient/i, 'Ambient radial stage glow');
  assert.match(css, /\.et-shell\[data-category="AM_NHAC"\][^{]*\{[^}]*--et-cat-accent:\s*#d8ff3e/i, 'Music inherits the Super Concert lime theme');
  assert.match(css, /\.et-shell\[data-category="HOI_THAO"\][^{]*\{[^}]*--et-cat-accent:\s*#6366f1/i, 'Conference uses an indigo theme');

  // 2. Hairline borders and sticky frosted chrome
  assert.match(css, /backdrop-filter:\s*blur/i, 'Frosted chrome glass filter');
  assert.match(css, /border:\s*1px\s*solid\s*rgba\(255,\s*255,\s*255/i, 'Hairline borders');

  // 3. Tabular numerics
  assert.match(css, /font-variant-numeric:\s*tabular-nums/i, 'Tabular numerics rule');

  // 4. Touch target >= 44px
  assert.match(css, /min-height:\s*44px/i, 'Touch target >= 44px on interactive components');

  // 5. WCAG AA Focus visible
  assert.match(
    css,
    /:focus-visible\s*\{[^}]*outline:\s*2px\s*solid\s*var\(--et-cat-accent-light,\s*#fbbf24\)/i,
    'Accessible category-aware focus visible ring'
  );

  // 6. Reduced motion compliance
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'Reduced motion media query');

  // 7. Responsive breakpoints
  assert.match(css, /@media\s*\(max-width:\s*1023px\)/i, 'Tablet / Mobile split breakpoint');
  assert.match(css, /@media\s*\(max-width:\s*767px\)/i, 'Compact mobile breakpoint');

  // 8. No font-size under 12px anywhere in template stylesheet
  const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(fontSizes.length > 0, 'Found font-size rules');
  for (const size of fontSizes) {
    assert.ok(size >= 12, `Disallowed sub-12px font size found: ${size}px`);
  }
});

test('unified typography tokens and motion contracts in index.css and event-template.css', async () => {
  const indexCss = await readFile(
    new URL('../src/index.css', import.meta.url),
    'utf8'
  );
  const templateCss = await readFile(
    new URL('../src/components/event-template/event-template.css', import.meta.url),
    'utf8'
  );

  // 1. Coherent typography tokens in :root
  assert.match(indexCss, /--font-sans:\s*'Be Vietnam Pro'/i, 'Primary sans token uses Be Vietnam Pro');
  assert.match(indexCss, /--font-display:\s*'Be Vietnam Pro'/i, 'Display token uses Be Vietnam Pro');
  assert.match(indexCss, /--font-weight-regular:\s*400/i, 'Regular font weight token');
  assert.match(indexCss, /--font-weight-bold:\s*700/i, 'Bold font weight token (restraining 800/900)');
  assert.match(indexCss, /--text-xs:\s*clamp/i, 'Fluid text-xs scale token');
  assert.match(indexCss, /--text-hero:\s*clamp/i, 'Fluid text-hero scale token');
  assert.match(indexCss, /--font-tabular:\s*tabular-nums/i, 'Tabular numeric token');

  // 2. Removal of faux monospace on Space Grotesk
  assert.doesNotMatch(indexCss, /'Space Grotesk',\s*monospace/i, 'Space Grotesk faux monospace must not be present');

  // 3. Editorial section heading rhythm matches event template
  assert.match(indexCss, /\.editorial-kicker\s*\{[^}]*font-family:\s*var\(--font-sans\)/i, 'Editorial kicker uses var(--font-sans)');
  assert.match(indexCss, /\.section-number\s*\{[^}]*font-variant-numeric:\s*tabular-nums/i, 'Section number uses tabular-nums');

  // 4. Motion tokens and restrained choreography
  assert.match(indexCss, /--ease-editorial:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/i, 'Editorial cubic-bezier easing token');
  assert.match(indexCss, /--duration-staged:\s*380ms/i, 'Staged animation duration token');
  assert.match(indexCss, /--duration-hero:\s*520ms/i, 'Hero entrance duration token');

  // 5. Complete reduced motion contract
  assert.match(indexCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.entrance-badge/i, 'Entrance badge disabled under reduced motion');
  assert.match(indexCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.entrance-headline/i, 'Entrance headline disabled under reduced motion');
  assert.match(indexCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?opacity:\s*1\s*!important/i, 'Reduced motion never strands content invisible');

  // 6. Template css staged hero entrance and reduced motion
  assert.match(templateCss, /\.et-hero-badges\s*\{[^}]*animation:\s*etFadeSlideDown/i, 'Staged badge entrance in event template');
  assert.match(templateCss, /\.et-hero-title\s*\{[^}]*animation:\s*etFadeSlideUp/i, 'Staged title entrance in event template');
  assert.match(templateCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.et-hero-badges/i, 'Template hero elements respect reduced motion');

  // 7. Typography grammar invariant: hero title max weight 700, natural title case, line-height >= 1.08
  assert.match(templateCss, /\.et-hero-title\s*\{[^}]*font-weight:\s*700/i, 'Hero title maximum weight is 700');
  assert.match(templateCss, /\.et-hero-title\s*\{[^}]*text-transform:\s*none/i, 'Generic hero title renders in natural title case');
  const heroLhMatch = templateCss.match(/\.et-hero-title\s*\{[^}]*line-height:\s*([\d.]+)/i);
  assert.ok(heroLhMatch && parseFloat(heroLhMatch[1]) >= 1.08, 'Hero title line height must be >= 1.08 for Vietnamese diacritics');

  // 8. Section titles and buttons use max weight 700 and no forced uppercase
  assert.match(templateCss, /\.et-section-title\s*\{[^}]*font-weight:\s*700/i, 'Section title weight is 700');
  assert.match(templateCss, /\.et-section-title\s*\{[^}]*text-transform:\s*none/i, 'Section title renders in natural case');
  assert.doesNotMatch(templateCss, /\.et-hero-title\s*\{[^}]*font-weight:\s*(800|900)/i, 'Hero title must not be 800 or 900');
  assert.doesNotMatch(templateCss, /\.et-section-title\s*\{[^}]*font-weight:\s*(800|900)/i, 'Section title must not be 800 or 900');
  assert.doesNotMatch(templateCss, /\.et-hero-primary-cta\s*\{[^}]*font-weight:\s*(800|900)/i, 'Hero primary CTA must not be 800 or 900');
  assert.doesNotMatch(templateCss, /\.et-countdown-val\s*\{[^}]*font-weight:\s*(800|900)/i, 'Countdown numbers must not be 800 or 900');
  assert.doesNotMatch(templateCss, /\.et-tier-price\s*\{[^}]*font-weight:\s*(800|900)/i, 'Tier prices must not be 800 or 900');
  assert.doesNotMatch(templateCss, /\.et-booking-primary-btn\s*\{[^}]*font-weight:\s*(800|900)/i, 'Booking button must not be 800 or 900');
});

test('public event detail architecture is unified across generic events and Super Concert', async () => {
  const appTsx = await readFile(
    new URL('../src/App.tsx', import.meta.url),
    'utf8'
  );
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  const genericPageTsx = await readFile(
    new URL('../src/components/GenericEventPage.tsx', import.meta.url),
    'utf8'
  );
  const headerTsx = await readFile(
    new URL('../src/components/event-template/EventHeader.tsx', import.meta.url),
    'utf8'
  );
  const heroHtml = await readFile(
    new URL('../src/legacy/fragments/hero.html', import.meta.url),
    'utf8'
  );
  const templateCss = await readFile(
    new URL('../src/components/event-template/event-template.css', import.meta.url),
    'utf8'
  );
  const mobileStickyTsx = await readFile(
    new URL('../src/components/event-template/MobileStickyBar.tsx', import.meta.url),
    'utf8'
  );

  // 1. Unified routing: App.tsx routes detail pages directly to GenericEventPage without separate shell or duplicate side effects
  assert.doesNotMatch(appTsx, /event\.templateKey/, 'App.tsx has no detail route branching based on templateKey');
  assert.doesNotMatch(appTsx, /setInterval/, 'App.tsx has no duplicate clock timer interval');
  assert.doesNotMatch(appTsx, /eventticketing:sale-status/, 'App.tsx has no duplicate sale-status side effects');
  assert.match(appTsx, /<GenericEventPage\s+event=\{event\}/i, 'All detail events enter GenericEventPage shared composition');

  // 2. Shared composition EventTemplate has a single main content tree for all events
  assert.match(templateTsx, /<main className="et-main">/i, 'Single unified main content tree');
  assert.doesNotMatch(templateTsx, /<main className="et-concert-sections">/i, 'No alternate main content tree for Super Concert');
  assert.match(templateTsx, /className=\{`et-shell\s*\$\{isConcert\s*\?\s*['"]et-shell--concert['"]\s*:\s*['"]['"]\}`\}/i, 'EventTemplate provides unified .et-shell with concert variant');
  assert.match(templateTsx, /className="et-stage-ambient"/i, 'Shared composition provides stage ambient background');
  assert.match(templateTsx, /<EventHeader\s+event=\{event\}/i, 'Shared composition renders EventHeader');
  assert.match(templateTsx, /className="et-body-surface"/i, 'Shared composition wraps sections in et-body-surface');

  // 3. Core data-driven sections render for every event, and duplicate legacy sections are removed from rendered path
  assert.match(templateTsx, /<section className="et-content-section" aria-labelledby="overview-heading">/i, 'Renders overview section');
  assert.match(templateTsx, /<TicketTiersSection/i, 'Renders shared TicketTiersSection as single source of truth');
  assert.match(templateTsx, /<EventVenueSection/i, 'Renders shared EventVenueSection');
  assert.match(templateTsx, /<EventPolicySection/i, 'Renders shared EventPolicySection');
  assert.match(templateTsx, /<EventContactSection/i, 'Renders shared EventContactSection');
  assert.match(templateTsx, /<BookingSummaryPanel/i, 'Renders shared BookingSummaryPanel');
  assert.match(templateTsx, /<MobileStickyBar/i, 'Renders shared MobileStickyBar');

  assert.doesNotMatch(templateTsx, /<PricingSection/i, 'Legacy PricingSection is eliminated from the rendered path');
  assert.doesNotMatch(templateTsx, /<ConcertGuideSection/i, 'Legacy ConcertGuideSection is eliminated from the rendered path');

  // 4. Stable navigation and runtime anchor hooks are preserved without duplicate UI
  assert.match(templateTsx, /id="pricing-section"/i, 'Preserves pricing-section anchor hook for header link and runtime');
  assert.match(templateTsx, /id="concert-guide-section"/i, 'Preserves concert-guide-section anchor hook for header link');

  // 5. Specialization boundary is explicit at the caller level (GenericEventPage)
  assert.match(genericPageTsx, /export function resolveEventTemplateSlots/i, 'Defines caller-level resolveEventTemplateSlots adapter');
  assert.match(genericPageTsx, /slots=\{slots\}/i, 'Passes resolved slots to EventTemplate');
  assert.match(genericPageTsx, /lineup:\s*<ArtistLineup/i, 'Supplies lineup slot for concert');
  assert.match(genericPageTsx, /seating:\s*<SeatingSection/i, 'Supplies interactive seating slot for concert');
  assert.match(genericPageTsx, /overlays:\s*<ConcertRuntimeOverlays/i, 'Supplies runtime overlays slot for concert');
  assert.match(genericPageTsx, /id="stA"/i, 'Supplies stA starfield hook');
  assert.match(genericPageTsx, /id="stB"/i, 'Supplies stB starfield hook');

  // 6. Shared EventHeader supports both generic and concert navigation
  assert.match(headerTsx, /isConcert/i, 'EventHeader detects concert template');
  assert.match(headerTsx, /href="#artist-lineup"/i, 'Concert navigation includes artist lineup');
  assert.match(headerTsx, /href="#pricing-section"/i, 'Concert navigation includes pricing section');
  assert.match(headerTsx, /href="#seating-section"/i, 'Concert navigation includes seating map');
  assert.match(headerTsx, /id="btn-view-schedule"/i, 'Concert navigation includes schedule timeline modal trigger');
  assert.match(headerTsx, /et-brand/i, 'Shared brand mark across all event pages');

  // 7. Hero section in Super Concert has primary CTA in first viewport
  assert.match(heroHtml, /et-hero-primary-cta/i, 'Super Concert hero contains primary CTA button');
  assert.match(heroHtml, /href="#seating-section"/i, 'Primary CTA links directly to seat selection');
  assert.doesNotMatch(heroHtml, /font-syne/i, 'Hero does not use font-syne');
  assert.doesNotMatch(heroHtml, /tracking-\[-0\.055em\]/i, 'Hero does not use extreme negative tracking');

  // 8. Compact mobile header contract: no wrapped text, 44px touch targets, nonessential buttons hidden under 390px
  assert.match(templateCss, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.et-nav-back-text\s*\{[^}]*display:\s*none/i, 'Back link label hidden on mobile to prevent wrapping');
  assert.match(templateCss, /\.et-nav-back-link\s*\{[^}]*min-height:\s*44px/i, 'Back link has min 44px touch target');
  assert.match(templateCss, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.et-nav-cta\s*\{[^}]*min-height:\s*44px/i, 'Header CTA has min 44px touch target on mobile');
  assert.match(headerTsx, /et-cta-label-compact/i, 'Header CTA renders compact responsive label');
  assert.match(templateCss, /@media\s*\(max-width:\s*390px\)[\s\S]*?\.et-nav-timeline-btn\s*\{[^}]*display:\s*none/i, 'Nonessential timeline button hidden under 390px to prevent clipping');

  // 9. Mobile sticky bar computes minimum price dynamically from loaded tiers
  assert.match(mobileStickyTsx, /Math\.min\(\.\.\.tiers\.map/i, 'Calculates dynamic minPrice from loaded tiers');
  assert.doesNotMatch(mobileStickyTsx, /800\.000\s*(VNĐ|VND)/i, 'Mobile sticky bar contains no hard-coded 800.000 price literal');
});

test('organizer-created music event uses the shared data-driven pipeline without bespoke code', async () => {
  const genericPageTsx = await readFile(
    new URL('../src/components/GenericEventPage.tsx', import.meta.url),
    'utf8'
  );
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  // Organizer events receive empty slots from adapter
  assert.match(
    genericPageTsx,
    /if\s*\(event\.templateKey\s*!==\s*['"]SUPER_CONCERT_2026['"]\)\s*\{\s*return\s*\{\};/i,
    'Non-concert events receive empty slots'
  );
  // And render the standard data-driven pipeline
  assert.match(templateTsx, /<TicketTiersSection/i, 'Renders standard TicketTiersSection');
  assert.match(templateTsx, /<EventVenueSection/i, 'Renders standard EventVenueSection');
  assert.match(templateTsx, /<EventPolicySection/i, 'Renders standard EventPolicySection');
  assert.match(templateTsx, /<EventContactSection/i, 'Renders standard EventContactSection');
  assert.match(templateTsx, /<BookingSummaryPanel/i, 'Renders standard BookingSummaryPanel');
  assert.match(templateTsx, /<MobileStickyBar/i, 'Renders shared MobileStickyBar');
});

test('concert rich sections are plugged into typed extension slots', async () => {
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  assert.match(templateTsx, /export type EventTemplateSlots/i, 'Defines typed EventTemplateSlots');
  assert.match(templateTsx, /slots\?\.ambient/i, 'EventTemplate accepts ambient slot');
  assert.match(templateTsx, /slots\?\.lineup/i, 'EventTemplate accepts lineup slot');
  assert.match(templateTsx, /slots\?\.seating/i, 'EventTemplate accepts seating slot');
  assert.match(templateTsx, /slots\?\.(overlays|modals)/i, 'EventTemplate accepts runtime overlays slot');
});

test('slogan normalization suppresses machine enum tokens while preserving legitimate brand and Vietnamese slogans', () => {
  // Machine-like enum tokens and category codes are treated as missing slogans
  assert.equal(isMachineSloganToken('AM_NHAC'), true);
  assert.equal(isMachineSloganToken('am_nhac', 'AM_NHAC'), true);
  assert.equal(isMachineSloganToken('HOI_THAO'), true);
  assert.equal(isMachineSloganToken('THE_THAO'), true);
  assert.equal(isMachineSloganToken('SAN_KHAU'), true);
  assert.equal(isMachineSloganToken('WORKSHOP'), true);
  assert.equal(isMachineSloganToken('KHAC'), true);
  assert.equal(isMachineSloganToken('DEFAULT'), true);
  assert.equal(isMachineSloganToken('CHUA_XAC_DINH'), true);
  assert.equal(isMachineSloganToken('SYS_EVENT_TOKEN'), true);
  assert.equal(isMachineSloganToken('CATEGORY_CODE_1'), true);

  assert.equal(normalizeEventSlogan('AM_NHAC', 'AM_NHAC'), null);
  assert.equal(normalizeEventSlogan('HOI_THAO', 'HOI_THAO'), null);
  assert.equal(normalizeEventSlogan('WORKSHOP'), null);
  assert.equal(normalizeEventSlogan('SYS_CATEGORY_FALLBACK'), null);
  assert.equal(normalizeEventSlogan(null), null);
  assert.equal(normalizeEventSlogan(''), null);
  assert.equal(normalizeEventSlogan('   '), null);

  // Legitimate uppercase Vietnamese and brand slogans remain completely visible
  assert.equal(
    normalizeEventSlogan('SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026'),
    'SỰ KIỆN ÂM NHẠC TRỌNG ĐIỂM 2026'
  );
  assert.equal(
    normalizeEventSlogan('Ý TƯỞNG, CÔNG NGHỆ VÀ NHỮNG KẾT NỐI MỚI'),
    'Ý TƯỞNG, CÔNG NGHỆ VÀ NHỮNG KẾT NỐI MỚI'
  );
  assert.equal(
    normalizeEventSlogan('SUPER CONCERT 2026'),
    'SUPER CONCERT 2026'
  );
  assert.equal(
    normalizeEventSlogan('Âm nhạc độc lập kết nối'),
    'Âm nhạc độc lập kết nối'
  );
  assert.equal(
    normalizeEventSlogan('JUST DO IT'),
    'JUST DO IT'
  );
});

test('resolveHeroCta delivers honest CTA copy and accessible labels for all sale states', () => {
  // 1. Super Concert specialization
  // ON_SALE: action-oriented ticket/seating copy
  const concertOnSale = resolveHeroCta(SALE_STATUS.ON_SALE, true);
  assert.equal(concertOnSale.label, 'Chọn vé ngay & Sơ đồ');
  assert.equal(concertOnSale.href, '#seating-section');
  assert.match(concertOnSale.ariaLabel, /chọn vé/i);

  // UPCOMING: view map without implying immediate purchase
  const concertUpcoming = resolveHeroCta(SALE_STATUS.UPCOMING, true);
  assert.equal(concertUpcoming.label, 'Xem sơ đồ & Hạng vé');
  assert.equal(concertUpcoming.href, '#seating-section');
  assert.doesNotMatch(concertUpcoming.label, /chọn vé ngay/i);
  assert.match(concertUpcoming.ariaLabel, /sắp mở bán/i);

  // SOLD_OUT: view map; never imply availability
  const concertSoldOut = resolveHeroCta(SALE_STATUS.SOLD_OUT, true);
  assert.equal(concertSoldOut.label, 'Xem sơ đồ & Hạng vé');
  assert.equal(concertSoldOut.href, '#seating-section');
  assert.doesNotMatch(concertSoldOut.label, /chọn vé ngay/i);
  assert.match(concertSoldOut.ariaLabel, /bán hết|hết vé/i);

  // CLOSED: view event/seating info; never imply purchasing
  const concertClosed = resolveHeroCta(SALE_STATUS.CLOSED, true);
  assert.equal(concertClosed.label, 'Xem thông tin & Sơ đồ');
  assert.equal(concertClosed.href, '#seating-section');
  assert.doesNotMatch(concertClosed.label, /chọn vé ngay/i);
  assert.doesNotMatch(concertClosed.label, /mua vé/i);
  assert.match(concertClosed.ariaLabel, /đã đóng bán/i);

  // 2. Generic / Default template events
  const genericOnSale = resolveHeroCta(SALE_STATUS.ON_SALE, false);
  assert.equal(genericOnSale.label, 'Xem hạng vé & Chọn chỗ');
  assert.equal(genericOnSale.href, '#tickets');

  const genericUpcoming = resolveHeroCta(SALE_STATUS.UPCOMING, false);
  assert.equal(genericUpcoming.label, 'Xem thông tin hạng vé');
  assert.equal(genericUpcoming.href, '#tickets');

  const genericSoldOut = resolveHeroCta(SALE_STATUS.SOLD_OUT, false);
  assert.equal(genericSoldOut.label, 'Xem thông tin hạng vé');
  assert.equal(genericSoldOut.href, '#tickets');

  const genericClosed = resolveHeroCta(SALE_STATUS.CLOSED, false);
  assert.equal(genericClosed.label, 'Xem thông tin sự kiện');
  assert.equal(genericClosed.href, '#tickets');
});

test('mobile sticky bar enforces one unified dark/frosted grammar with honest sale state semantics', async () => {
  const css = await readFile(
    new URL('../src/components/event-template/event-template.css', import.meta.url),
    'utf8'
  );
  const mobileStickyTsx = await readFile(
    new URL('../src/components/event-template/MobileStickyBar.tsx', import.meta.url),
    'utf8'
  );
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  const heroTsx = await readFile(
    new URL('../src/components/event-template/EventHero.tsx', import.meta.url),
    'utf8'
  );

  // 1. One reusable dark/frosted surface for every category
  assert.match(
    css,
    /\.et-mobile-sticky\s*\{[^}]*background:\s*rgba\(10,\s*15,\s*26,\s*0\.94\)/i,
    'Unified dark obsidian frosted background for mobile sticky'
  );
  assert.match(
    css,
    /\.et-mobile-sticky\s*\{[^}]*backdrop-filter:\s*blur\(20px\)/i,
    'Frosted backdrop blur filter'
  );
  assert.match(
    css,
    /\.et-mobile-sticky\s*\{[^}]*border-top:\s*1px\s*solid\s*rgba\(255,\s*255,\s*255,\s*0\.12\)/i,
    'Frosted hairline border'
  );

  // 2. No concert-only structural color override
  assert.doesNotMatch(
    css,
    /\.et-shell--concert\s+\.et-mobile-sticky\s*\{/i,
    'No concert-only structural surface override for mobile sticky'
  );
  assert.doesNotMatch(
    css,
    /\.et-shell--concert\s+\.et-mobile-price-val\s*\{/i,
    'No concert-only structural color override for price value'
  );

  // 3. Category accent token and WCAG AA text contrast
  assert.match(
    css,
    /\.et-mobile-price-val\s*\{[^}]*color:\s*var\(--et-cat-accent-light,\s*var\(--et-cat-accent/i,
    'Price val inherits category accent token'
  );
  assert.match(
    css,
    /\.et-mobile-price-label\s*\{[^}]*color:\s*#94a3b8/i,
    'Muted slate price label with high contrast'
  );

  // 4. Safe area spacing
  assert.match(
    css,
    /\.et-mobile-sticky\s*\{[^}]*env\(safe-area-inset-bottom/i,
    'Safe area inset on sticky container padding'
  );
  assert.match(
    css,
    /\.et-mobile-sticky-spacer\s*\{[^}]*env\(safe-area-inset-bottom/i,
    'Safe area inset on spacer height'
  );

  // 5. 44px touch targets
  assert.match(
    css,
    /\.et-mobile-cta-btn\s*\{[^}]*min-height:\s*44px/i,
    'Primary CTA satisfies 44px min-height'
  );
  assert.match(
    css,
    /\.et-mobile-secondary-btn\s*\{[^}]*min-height:\s*44px/i,
    'Secondary action satisfies 44px min-height'
  );

  // 6. Responsive rules prevent clipping at 320-768px
  assert.match(
    css,
    /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.et-mobile-sticky\s*\{[^}]*padding:/i,
    'Responsive padding reduction on compact screens'
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*380px\)\s*\{[\s\S]*?\.et-mobile-secondary-btn\s*\{[^}]*display:\s*none/i,
    'Secondary action hidden under 380px to guarantee no clipping at 320px'
  );

  // 7. Mobile sticky honesty: Closed concert never says "Chọn vé"
  assert.match(
    mobileStickyTsx,
    /isSaleOpen\s*\?\s*['"]Chọn vé['"]\s*:\s*['"]Xem sơ đồ['"]/i,
    'Concert mobile sticky renders "Xem sơ đồ" when closed or not on sale'
  );

  // 8. Overview heading and hero slogan normalize machine tokens
  assert.match(
    templateTsx,
    /cleanSlogan\s*\|\|\s*['"]GIỚI THIỆU SỰ KIỆN['"]/i,
    'Overview title falls back to default heading when slogan is machine token'
  );
  assert.match(
    heroTsx,
    /\{cleanSlogan\s*&&\s*<p className="et-hero-slogan">\{cleanSlogan\}<\/p>\}/i,
    'Hero slogan suppresses machine enum tokens'
  );
});

test('reusable React footer is shared by every event and replaces legacy footer and custom event bridge', async () => {
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  const footerTsx = await readFile(
    new URL('../src/components/event-template/EventFooter.tsx', import.meta.url),
    'utf8'
  );
  const footerCss = await readFile(
    new URL('../src/components/event-template/EventFooter.css', import.meta.url),
    'utf8'
  );

  // 1. EventTemplate mounts the shared React EventFooter
  assert.match(templateTsx, /<EventFooter/i, 'EventTemplate mounts shared EventFooter');
  assert.match(templateTsx, /hasSchedule=\{hasSchedule\}/i, 'Passes hasSchedule to EventFooter');
  assert.match(templateTsx, /onOpenSchedule=\{handleOpenSchedule\}/i, 'Passes onOpenSchedule callback to EventFooter');
  assert.match(templateTsx, /onOpenTeamInfo=\{handleOpenTeamInfo\}/i, 'Passes onOpenTeamInfo callback to EventFooter');

  // 2. Custom event bridge eventticketing:open-schedule is removed from EventTemplate
  assert.doesNotMatch(templateTsx, /eventticketing:open-schedule/i, 'EventTemplate removes eventticketing:open-schedule custom event listener');

  // 3. EventFooter renders brand copy, conditional schedule button, venue anchor, and team info action
  assert.match(footerTsx, /brandCopy/i, 'EventFooter includes brand and copyright copy');
  assert.match(footerTsx, /SUPER CONCERT — ĐẠI NHẠC HỘI NGOẠI THƯƠNG/i, 'EventFooter includes concert brand copy');
  assert.match(footerTsx, /hasSchedule\s*&&\s*onOpenSchedule/i, 'Schedule action is strictly conditioned on schedule existence');
  assert.match(footerTsx, /id="btn-footer-open-schedule"/i, 'Footer schedule button retains accessible ID hook');
  assert.match(footerTsx, /onClick=\{onOpenSchedule\}/i, 'Footer schedule button wires onOpenSchedule callback directly');
  assert.match(footerTsx, /id="btn-open-team-info"/i, 'Footer team info action retains accessible ID hook');
  assert.match(footerTsx, /onClick=\{onOpenTeamInfo\}/i, 'Footer team info action wires onOpenTeamInfo callback directly');
  assert.match(footerTsx, /href="#concert-guide-section"/i, 'Footer includes anchor link to venue and policies');
  assert.match(footerTsx, /handleScrollToTop/i, 'Footer includes back to top scroll action');

  // 4. Touch target accessibility
  assert.match(footerCss, /\.et-footer-link\s*\{[^}]*min-height:\s*44px/i, 'Footer interactive targets satisfy 44px min-height');
  assert.match(footerCss, /\.et-footer-link:focus-visible\s*\{[^}]*outline:/i, 'Footer interactive targets provide focus-visible ring');
});

test('controlled and accessible TeamInfoDialog replaces legacy team modal', async () => {
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  const dialogTsx = await readFile(
    new URL('../src/components/event-template/TeamInfoDialog.tsx', import.meta.url),
    'utf8'
  );

  // 1. EventTemplate mounts controlled TeamInfoDialog
  assert.match(templateTsx, /<TeamInfoDialog/i, 'EventTemplate mounts TeamInfoDialog');
  assert.match(templateTsx, /isOpen=\{isTeamInfoOpen\}/i, 'TeamInfoDialog receives controlled isOpen state');
  assert.match(templateTsx, /onClose=\{handleCloseTeamInfo\}/i, 'TeamInfoDialog receives controlled onClose callback');

  // 2. Accessibility: modal dialog semantics, keyboard trap, and body scroll lock
  assert.match(dialogTsx, /role="dialog"/i, 'TeamInfoDialog specifies role="dialog"');
  assert.match(dialogTsx, /aria-modal="true"/i, 'TeamInfoDialog specifies aria-modal="true"');
  assert.match(dialogTsx, /aria-labelledby="team-info-dialog-title"/i, 'TeamInfoDialog is labelled by title');
  assert.match(dialogTsx, /document\.body\.style\.overflow\s*=\s*'hidden'/i, 'Locks body scroll while modal is open');
  assert.match(dialogTsx, /e\.key\s*===\s*'Escape'/i, 'Dismisses dialog on Escape key');
  assert.match(dialogTsx, /e\.key\s*===\s*'Tab'/i, 'Contains keyboard focus with Tab/Shift+Tab trapping');
  assert.match(dialogTsx, /handleOverlayClick/i, 'Supports backdrop overlay click dismissal');
  assert.match(dialogTsx, /savedOpenerRef\.current\.focus\(\)/i, 'Restores focus to opener upon closing');

  // 3. Touch targets and legacy compatibility hooks
  assert.match(dialogTsx, /id="btn-close-team-modal"/i, 'Top close button provides legacy hook');
  assert.match(dialogTsx, /id="btn-close-team-modal-2"/i, 'Bottom close button provides legacy hook');
  assert.match(dialogTsx, /min-h-\[44px\]/i, 'Buttons adhere to 44px minimum touch target size');

  // 4. Project SRS content parity
  assert.match(dialogTsx, /Đại học Ngoại Thương/i, 'Presents FTU university name');
  assert.match(dialogTsx, /COSH301/i, 'Presents course code');
  assert.match(dialogTsx, /Đặng Công Minh/i, 'Presents team member lead name');
  assert.match(dialogTsx, /TS\. Phạm Thị Kim Dung/i, 'Presents advisor name');
  assert.doesNotMatch(dialogTsx, /document\.getElementById\([^)]+\)\.classList/i, 'Does not use DOM classList manipulation');
});

test('ConcertRuntimeOverlays boundary strictly preserves seat tooltip, toast container, and booking modal in React without dangerouslySetInnerHTML', async () => {
  const footerModalsHtml = await readFile(
    new URL('../src/legacy/fragments/footer-modals.html', import.meta.url),
    'utf8'
  );
  const concertSectionsTsx = await readFile(
    new URL('../src/components/ConcertSections.tsx', import.meta.url),
    'utf8'
  );

  // 1. Fragment contains no unmigrated overlay markup
  assert.doesNotMatch(footerModalsHtml, /<footer/i, 'footer-modals.html does not contain legacy footer markup');
  assert.doesNotMatch(footerModalsHtml, /id="team-modal"/i, 'footer-modals.html does not contain legacy team modal');
  assert.doesNotMatch(footerModalsHtml, /eventticketing:open-schedule/i, 'footer-modals.html does not contain custom event bridge');
  assert.doesNotMatch(footerModalsHtml, /id="seat-tooltip"/i, 'footer-modals.html does not contain seat tooltip');
  assert.doesNotMatch(footerModalsHtml, /id="toast-container"/i, 'footer-modals.html does not contain toast container');
  assert.doesNotMatch(footerModalsHtml, /id="booking-modal"/i, 'footer-modals.html does not contain booking modal');

  // 2. ConcertSections does not use dangerouslySetInnerHTML for overlays or import footerModalsHtml
  assert.doesNotMatch(concertSectionsTsx, /footer-modals\.html/i, 'ConcertSections does not import footer-modals.html');
  assert.match(concertSectionsTsx, /<SeatTooltip/i, 'ConcertRuntimeOverlays renders React SeatTooltip');
  assert.match(concertSectionsTsx, /<RuntimeToastContainer/i, 'ConcertRuntimeOverlays renders React RuntimeToastContainer');
  assert.match(concertSectionsTsx, /<BookingHoldModal/i, 'ConcertRuntimeOverlays renders React BookingHoldModal');

  // 3. ConcertSections exports truthful ConcertRuntimeOverlays boundary
  assert.match(concertSectionsTsx, /export function ConcertRuntimeOverlays/i, 'ConcertSections exports truthful ConcertRuntimeOverlays');
  assert.match(concertSectionsTsx, /export const FooterAndModals = ConcertRuntimeOverlays/i, 'Exports backward-compatible alias');
});

test('complete elimination of eventticketing:open-schedule across all production sources', async () => {
  async function scanDir(dir) {
    const entries = await readdir(dir, {withFileTypes: true});
    const files = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await scanDir(fullPath)));
      } else if (/\.(tsx?|jsx?|html)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const srcDir = fileURLToPath(new URL('../src', import.meta.url));
  const sourceFiles = await scanDir(srcDir);
  const offending = [];

  for (const file of sourceFiles) {
    const content = await readFile(file, 'utf8');
    if (content.includes('eventticketing:open-schedule')) {
      offending.push(file);
    }
  }

  assert.deepEqual(offending, [], 'Zero production source files contain eventticketing:open-schedule');
});

