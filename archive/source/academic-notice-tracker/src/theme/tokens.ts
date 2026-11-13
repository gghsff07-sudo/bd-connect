/**
 * Design tokens: calm, highly legible, slate + teal.
 *
 * Status is never communicated by color alone — every status also has an
 * icon and a text label (see StatusBadge). Text colors meet WCAG AA
 * (>= 4.5:1) on their intended backgrounds in both light and dark themes.
 */

export interface Palette {
  /** Page background. */
  bg: string;
  /** Card / raised surface. */
  surface: string;
  /** Subtle filled surface (chips, inputs, segmented control track). */
  surfaceAlt: string;
  /** Hairline borders. */
  border: string;
  /** Primary ink. */
  text: string;
  /** Secondary ink. */
  textSecondary: string;
  /** Muted ink (meta text, still AA on surface). */
  textMuted: string;
  /** Brand / interactive teal. */
  primary: string;
  /** Soft teal fill (selected chips, highlights). */
  primarySoft: string;
  /** Teal text on soft fill. */
  primaryOnSoft: string;
  /** Text on solid primary buttons. */
  onPrimary: string;
  /** General warning banner tint. */
  warningBg: string;
  warningBorder: string;
  warningText: string;
  /** Danger / overdue tint. */
  danger: string;
  dangerSoft: string;
  dangerOnSoft: string;
  /** Neutral "offline" tint. */
  neutralBg: string;
  neutralBorder: string;
  /** Skeleton placeholder fill. */
  skeleton: string;
  /** Pressed/ripple overlay on cards. */
  pressOverlay: string;
  /** Per-status colors: text, soft background, border. */
  statusOpen: StatusColors;
  statusExtended: StatusColors;
  statusClosing: StatusColors;
  statusClosed: StatusColors;
  statusPostponed: StatusColors;
  statusInfo: StatusColors;
}

export interface StatusColors {
  text: string;
  bg: string;
  border: string;
}

export interface TypeScaleEntry {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
}

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  type: {
    display: TypeScaleEntry;
    title: TypeScaleEntry;
    heading: TypeScaleEntry;
    body: TypeScaleEntry;
    label: TypeScaleEntry;
    caption: TypeScaleEntry;
  };
  /** Minimum accessible touch target (pt). */
  touchTarget: 44;
}

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
// Dynamic font scaling stays enabled (RN default); sizes below are base sizes.
const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} satisfies Record<string, TypeScaleEntry>;

export const lightPalette: Palette = {
  bg: '#F6F8F9',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF1F2',
  border: '#DCE3E6',
  text: '#1C2B33',
  textSecondary: '#41545F',
  textMuted: '#5B6B76',
  primary: '#0F766E',
  primarySoft: '#D7ECE9',
  primaryOnSoft: '#0E5F58',
  onPrimary: '#FFFFFF',
  warningBg: '#FCF3E1',
  warningBorder: '#E8CE96',
  warningText: '#7A4E07',
  danger: '#B4232F',
  dangerSoft: '#FAE5E7',
  dangerOnSoft: '#9A1E28',
  neutralBg: '#E9EEF2',
  neutralBorder: '#C7D3DA',
  skeleton: '#E3E9EC',
  pressOverlay: 'rgba(15, 118, 110, 0.06)',
  statusOpen: { text: '#0E5F58', bg: '#D7ECE9', border: '#B5DCD7' },
  statusExtended: { text: '#0E5A6B', bg: '#D8EDF3', border: '#B3DCE7' },
  statusClosing: { text: '#7A4E07', bg: '#FCF3E1', border: '#E8CE96' },
  statusClosed: { text: '#42525E', bg: '#E5EAEE', border: '#CBD5DC' },
  statusPostponed: { text: '#5B3BA4', bg: '#EBE6FA', border: '#D4CBF2' },
  statusInfo: { text: '#1E4E9C', bg: '#E2EBF9', border: '#C3D6F1' },
};

export const darkPalette: Palette = {
  bg: '#10181C',
  surface: '#1A252B',
  surfaceAlt: '#223037',
  border: '#31404A',
  text: '#E9F0F2',
  textSecondary: '#B6C5CD',
  textMuted: '#93A5AE',
  primary: '#4FD1C5',
  primarySoft: '#1C3B38',
  primaryOnSoft: '#8FE3DA',
  onPrimary: '#0B2E2B',
  warningBg: '#3A2E14',
  warningBorder: '#6B5524',
  warningText: '#F5D08C',
  danger: '#F2A0A6',
  dangerSoft: '#3E2023',
  dangerOnSoft: '#F2A0A6',
  neutralBg: '#233038',
  neutralBorder: '#41525C',
  skeleton: '#223037',
  pressOverlay: 'rgba(79, 209, 197, 0.08)',
  statusOpen: { text: '#8FE3DA', bg: '#1C3B38', border: '#2E5B55' },
  statusExtended: { text: '#9BD8E8', bg: '#173A44', border: '#2C5A66' },
  statusClosing: { text: '#F5D08C', bg: '#3A2E14', border: '#6B5524' },
  statusClosed: { text: '#C3CED6', bg: '#28343C', border: '#41525C' },
  statusPostponed: { text: '#CFC4F5', bg: '#2E2847', border: '#4A4170' },
  statusInfo: { text: '#B4CCF3', bg: '#1E3049', border: '#33507A' },
};

export function buildTheme(scheme: 'light' | 'dark'): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkPalette : lightPalette,
    spacing,
    radii,
    type,
    touchTarget: 44,
  };
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
