export type ContourTheme = 'light' | 'dark';
export type ContourVariant = 'corners' | 'left' | 'right';

export interface ContourBackgroundProps {
  theme?: ContourTheme;
  variant?: ContourVariant;
  /** Any CSS color. The host controls foreground/content colors independently. */
  backgroundColor?: string;
  lineColor?: string;
  /** Line layer only, clamped to 0–1. Defaults to 0.05 (light) / 0.06 (dark). */
  lineOpacity?: number;
}
