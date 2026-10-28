import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {getDefaultDraftDates} from '../src/components/organizer-ui/organizerLogic.js';

test('organizer-ui.css adheres to tokenized graphite design system, accessible touch targets, and contrast rules', async () => {
  const css = await readFile(
    new URL('../src/components/organizer-ui/organizer-ui.css', import.meta.url),
    'utf8',
  );

  // 1. Warm graphite surface tokens
  assert.match(css, /--org-bg:\s*#090c0a/i, 'Dark obsidian/graphite base background');
  assert.match(css, /--org-surface:\s*#101512/i, 'Warm graphite primary surface');
  assert.match(css, /--org-surface-raised:\s*#161c18/i, 'Elevated surface token');
  assert.match(css, /--org-surface-card:\s*#131915/i, 'Card surface token');

  // 2. Lime brand cue
  assert.match(css, /--org-lime:\s*#d8ff3e/i, 'Fluorescent lime brand accent token');
  assert.match(css, /--org-lime-contrast:\s*#070908/i, 'High-contrast text on lime token');

  // 3. Status tones (success, warning, danger, info)
  assert.match(css, /--org-status-success:/i, 'Status success token defined');
  assert.match(css, /--org-status-warning:/i, 'Status warning token defined');
  assert.match(css, /--org-status-danger:/i, 'Status danger token defined');
  assert.match(css, /--org-status-info:/i, 'Status info token defined');

  // 4. Focus-visible accessibility ring
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px\s*solid\s*var\(--org-lime\)/i, 'Accessible focus visible ring');

  // 5. Touch target >= 44px on primary buttons and inputs
  assert.match(css, /\.org-btn\s*\{[^}]*min-height:\s*44px/i, 'Buttons touch target >= 44px');
  assert.match(css, /\.org-input[^{]*\{[^}]*min-height:\s*44px/i, 'Inputs touch target >= 44px');

  // 6. Reduced-motion compliance
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'Reduced motion media query');

  // 7. Responsive breakpoints
  assert.match(css, /@media\s*\(max-width:\s*1024px\)/i, 'Desktop to tablet breakpoint');
  assert.match(css, /@media\s*\(max-width:\s*768px\)/i, 'Tablet to mobile breakpoint');
  assert.match(css, /@media\s*\(max-width:\s*480px\)/i, 'Compact mobile breakpoint');

  // 8. Tabular numerics on stats and metric cards
  assert.match(css, /font-variant-numeric:\s*tabular-nums/i, 'Tabular numerics rule for currency and counts');

  // 9. Legibility invariant: strictly no font-size under 11px anywhere in organizer stylesheet
  const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(fontSizes.length > 0, 'Found font-size rules');
  for (const size of fontSizes) {
    assert.ok(size >= 11, `Disallowed illegible sub-11px font size found: ${size}px`);
  }
});

test('getDefaultDraftDates generates chronologically sound relational dates', () => {
  const dates = getDefaultDraftDates();
  assert.ok(dates.startsAt, 'startsAt is populated');
  assert.ok(dates.endsAt, 'endsAt is populated');
  assert.ok(dates.saleStartsAt, 'saleStartsAt is populated');
  assert.ok(dates.saleEndsAt, 'saleEndsAt is populated');

  const start = new Date(dates.startsAt).getTime();
  const end = new Date(dates.endsAt).getTime();
  const saleStart = new Date(dates.saleStartsAt).getTime();
  const saleEnd = new Date(dates.saleEndsAt).getTime();

  assert.ok(end > start, 'Event ends after it starts');
  assert.ok(saleEnd > saleStart, 'Ticket sales end after they start');
  assert.ok(saleStart < start, 'Ticket sales start before event starts');
  assert.ok(saleEnd <= start, 'Ticket sales end before or when event starts');
});

test('organizer-ui component files exist and contain no emoji icons', async () => {
  const fileUrls = [
    '../src/components/organizer-ui/OrganizerIcons.tsx',
    '../src/components/organizer-ui/OrganizerTopBar.tsx',
    '../src/components/organizer-ui/OrganizerSidebar.tsx',
    '../src/components/organizer-ui/OrganizerStatsCards.tsx',
    '../src/components/organizer-ui/OrganizerEventCard.tsx',
    '../src/components/organizer-ui/OrganizerEmptyState.tsx',
    '../src/components/organizer-ui/OrganizerOnboarding.tsx',
    '../src/components/organizer-ui/OrganizerAuthView.tsx',
    '../src/components/organizer-ui/OrganizerAccessDeniedView.tsx',
    '../src/components/organizer-ui/OrganizerEventWizard.tsx',
  ];

  // Regex to detect common emojis (rocket, floppy disk, lightning, warning sign, lock, etc.)
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  for (const relUrl of fileUrls) {
    const content = await readFile(new URL(relUrl, import.meta.url), 'utf8');
    assert.ok(content.length > 50, `${relUrl} is populated`);
    // Assert no emoji characters are embedded in the UI code
    const emojiMatch = content.match(emojiRegex);
    assert.equal(
      emojiMatch,
      null,
      `Forbidden emoji found in ${relUrl}: ${emojiMatch ? emojiMatch[0] : ''}`,
    );
  }
});
