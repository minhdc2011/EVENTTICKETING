export interface CategoryTheme {
  key: string;
  label: string;
  tagline: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  glow: string;
  cardBorder: string;
  cardBg: string;
  gradient: string;
  iconSvg: string;
}

export declare const CATEGORY_KEYS: readonly string[];

export declare const CATEGORY_THEMES: Record<string, CategoryTheme>;

export declare function getCategoryTheme(rawCategory: string | null | undefined): CategoryTheme;
