// @ts-check

/**
 * @typedef {Object} CategoryTheme
 * @property {string} key
 * @property {string} label
 * @property {string} tagline
 * @property {string} primary
 * @property {string} primaryLight
 * @property {string} primaryDark
 * @property {string} badgeBg
 * @property {string} badgeBorder
 * @property {string} badgeText
 * @property {string} glow
 * @property {string} cardBorder
 * @property {string} cardBg
 * @property {string} gradient
 * @property {string} iconSvg
 */

export const CATEGORY_KEYS = Object.freeze([
  'AM_NHAC',
  'SAN_KHAU',
  'THE_THAO',
  'HOI_THAO',
  'WORKSHOP',
  'THAM_QUAN',
  'KHAC',
]);

/** @type {Record<string, CategoryTheme>} */
export const CATEGORY_THEMES = Object.freeze({
  AM_NHAC: {
    key: 'AM_NHAC',
    label: 'Âm nhạc',
    tagline: 'Live Concerts, Đêm nhạc & Nghệ sĩ biểu diễn',
    // Super Concert 2026 electric fluorescent-lime / black stage identity
    primary: '#d8ff3e',
    primaryLight: '#e8ff6b',
    primaryDark: '#84cc16',
    badgeBg: 'rgba(216, 255, 62, 0.14)',
    badgeBorder: 'rgba(216, 255, 62, 0.38)',
    badgeText: '#d8ff3e',
    glow: 'rgba(216, 255, 62, 0.22)',
    cardBorder: 'rgba(216, 255, 62, 0.35)',
    cardBg: '#080c09',
    gradient: 'linear-gradient(145deg, #10170f 0%, #0a0e0a 55%, #050705 100%)',
    iconSvg: 'music',
  },
  SAN_KHAU: {
    key: 'SAN_KHAU',
    label: 'Sân khấu',
    tagline: 'Kịch nói, Nhạc kịch, Cải lương & Xiếc nghệ thuật',
    // Velvet crimson / rose gold theatrical elegance
    primary: '#f43f5e',
    primaryLight: '#fb7185',
    primaryDark: '#be123c',
    badgeBg: 'rgba(244, 63, 94, 0.14)',
    badgeBorder: 'rgba(244, 63, 94, 0.38)',
    badgeText: '#fb7185',
    glow: 'rgba(244, 63, 94, 0.22)',
    cardBorder: 'rgba(244, 63, 94, 0.35)',
    cardBg: '#13080e',
    gradient: 'linear-gradient(145deg, #1f0a15 0%, #12070d 55%, #080306 100%)',
    iconSvg: 'theatre',
  },
  THE_THAO: {
    key: 'THE_THAO',
    label: 'Thể thao',
    tagline: 'Giải đấu thể thao, Esports & Sự kiện đối kháng',
    // High-energy stadium azure electric blue
    primary: '#0ea5e9',
    primaryLight: '#38bdf8',
    primaryDark: '#0369a1',
    badgeBg: 'rgba(14, 165, 233, 0.14)',
    badgeBorder: 'rgba(14, 165, 233, 0.38)',
    badgeText: '#38bdf8',
    glow: 'rgba(14, 165, 233, 0.22)',
    cardBorder: 'rgba(14, 165, 233, 0.35)',
    cardBg: '#06101d',
    gradient: 'linear-gradient(145deg, #091a30 0%, #06101d 55%, #03070d 100%)',
    iconSvg: 'trophy',
  },
  HOI_THAO: {
    key: 'HOI_THAO',
    label: 'Hội thảo',
    tagline: 'Diễn đàn kinh tế, Hội nghị công nghệ & Tọa đàm',
    // Executive deep sapphire indigo & titanium
    primary: '#6366f1',
    primaryLight: '#818cf8',
    primaryDark: '#4338ca',
    badgeBg: 'rgba(99, 102, 241, 0.14)',
    badgeBorder: 'rgba(99, 102, 241, 0.38)',
    badgeText: '#a5b4fc',
    glow: 'rgba(99, 102, 241, 0.22)',
    cardBorder: 'rgba(99, 102, 241, 0.35)',
    cardBg: '#080a1c',
    gradient: 'linear-gradient(145deg, #111536 0%, #080a1c 55%, #04050e 100%)',
    iconSvg: 'presentation',
  },
  WORKSHOP: {
    key: 'WORKSHOP',
    label: 'Workshop',
    tagline: 'Khóa học thực chiến, Đào tạo & Workshop kỹ năng',
    // Fresh emerald jade craft & growth
    primary: '#10b981',
    primaryLight: '#34d399',
    primaryDark: '#047857',
    badgeBg: 'rgba(16, 185, 129, 0.14)',
    badgeBorder: 'rgba(16, 185, 129, 0.38)',
    badgeText: '#6ee7b7',
    glow: 'rgba(16, 185, 129, 0.22)',
    cardBorder: 'rgba(16, 185, 129, 0.35)',
    cardBg: '#05130d',
    gradient: 'linear-gradient(145deg, #0a2519 0%, #05130d 55%, #020805 100%)',
    iconSvg: 'lightbulb',
  },
  THAM_QUAN: {
    key: 'THAM_QUAN',
    label: 'Tham quan',
    tagline: 'Triển lãm nghệ thuật, Di tích & Trải nghiệm văn hóa',
    // Warm terracotta dusk & ochre wanderlust
    primary: '#f97316',
    primaryLight: '#fb923c',
    primaryDark: '#c2410c',
    badgeBg: 'rgba(249, 115, 22, 0.14)',
    badgeBorder: 'rgba(249, 115, 22, 0.38)',
    badgeText: '#fdba74',
    glow: 'rgba(249, 115, 22, 0.22)',
    cardBorder: 'rgba(249, 115, 22, 0.35)',
    cardBg: '#140c06',
    gradient: 'linear-gradient(145deg, #241409 0%, #140c06 55%, #0a0502 100%)',
    iconSvg: 'compass',
  },
  KHAC: {
    key: 'KHAC',
    label: 'Sự kiện khác',
    tagline: 'Lễ hội đa sắc tộc, Giao lưu văn hóa & Cộng đồng',
    // Polished amethyst violet obsidian
    primary: '#a855f7',
    primaryLight: '#c084fc',
    primaryDark: '#7e22ce',
    badgeBg: 'rgba(168, 85, 247, 0.14)',
    badgeBorder: 'rgba(168, 85, 247, 0.38)',
    badgeText: '#d8b4fe',
    glow: 'rgba(168, 85, 247, 0.22)',
    cardBorder: 'rgba(168, 85, 247, 0.35)',
    cardBg: '#0f0817',
    gradient: 'linear-gradient(145deg, #1c102a 0%, #0f0817 55%, #060309 100%)',
    iconSvg: 'sparkles',
  },
});

/**
 * Normalizes and resolves a category key to its theme definition.
 * Falls back gracefully to KHAC for undefined, null, or unrecognized categories.
 *
 * @param {string | null | undefined} rawCategory
 * @returns {CategoryTheme}
 */
export function getCategoryTheme(rawCategory) {
  if (!rawCategory || typeof rawCategory !== 'string') {
    return CATEGORY_THEMES.KHAC;
  }
  const normalized = rawCategory.trim().toUpperCase();

  // Direct match
  if (CATEGORY_THEMES[normalized]) {
    return CATEGORY_THEMES[normalized];
  }

  // Alias / Secondary mappings
  if (normalized === 'TRIEN_LAM') return CATEGORY_THEMES.THAM_QUAN;
  if (normalized === 'CONG_NGHE') return CATEGORY_THEMES.HOI_THAO;
  if (normalized === 'GIAI_TRI') return CATEGORY_THEMES.AM_NHAC;
  if (normalized === 'CONG_DONG') return CATEGORY_THEMES.KHAC;

  return CATEGORY_THEMES.KHAC;
}
