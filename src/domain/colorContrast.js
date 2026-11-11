/**
 * WCAG contrast helpers (NFR-07): pick a readable text colour for a given background.
 */

/** @param {string} hex #rgb or #rrggbb @returns {[number, number, number] | null} */
export function parseHex(hex) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

/** Relative luminance per WCAG 2.x. */
export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours (1..21), or null if either is not a valid hex. */
export function contrastRatio(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return null;
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Chooses the ink with the higher contrast against `background`.
 * @param {string} background hex colour
 * @param {string} [dark]
 * @param {string} [light]
 */
export function readableInk(background, dark = '#070908', light = '#ffffff') {
  const onDark = contrastRatio(background, dark);
  const onLight = contrastRatio(background, light);
  if (onDark == null || onLight == null) return dark;
  return onLight > onDark ? light : dark;
}

function toHex(rgb) {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

/**
 * Badge colours with at least `minimum` contrast: tries the dark then white ink on the accent and,
 * when neither reaches the minimum, darkens the accent step by step (white ink).
 * @param {string} accent hex colour
 * @param {number} [minimum]
 * @returns {{background: string, color: string}}
 */
export function accessibleBadgeColors(accent, minimum = 4.5, dark = '#070908', light = '#ffffff') {
  const rgb = parseHex(accent);
  if (!rgb) return {background: accent, color: dark};
  for (const ink of [dark, light]) {
    const ratio = contrastRatio(accent, ink);
    if (ratio != null && ratio >= minimum) return {background: accent, color: ink};
  }
  let current = rgb;
  for (let i = 0; i < 20; i += 1) {
    current = current.map((c) => c * 0.92);
    const background = toHex(current);
    if ((contrastRatio(background, light) ?? 0) >= minimum) return {background, color: light};
  }
  return {background: '#1f2937', color: light};
}
