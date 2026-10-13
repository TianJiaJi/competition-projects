import type { ScrollState } from './geometry';
export type ScrollDirection = 'vertical' | 'horizontal' | 'both';
export type ScrollTheme = 'auto' | 'light' | 'dark';
export type ScrollVisibility = 'interaction' | 'always' | 'scroll';
export interface ScrollbarOptions {
  direction?: ScrollDirection;
  theme?: ScrollTheme;
  visibility?: ScrollVisibility;
  label?: string;
  onScroll?: (state: ScrollState) => void;
}
export interface ScrollbarController {
  readonly element: HTMLElement;
  update(): void;
  scrollTo(options: ScrollToOptions): void;
  scrollBy(options: ScrollToOptions): void;
  destroy(): void;
}
