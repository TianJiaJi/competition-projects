import type { InjectionKey, Ref } from 'vue';

export type GlassVariant = 'surface' | 'transparent' | 'primary';
export type GlassStatus = 'loading' | 'webgl' | 'fallback';
export interface GlassButtonOptions {
  radius: number;
  blur: number;
  refraction: number;
  variant: GlassVariant;
  disabled: boolean;
}
export interface GlassRegistration {
  element: HTMLButtonElement;
  options: () => GlassButtonOptions;
}
export interface GlassContext {
  status: Readonly<Ref<GlassStatus>>;
  register: (id: string, entry: GlassRegistration) => void;
  unregister: (id: string) => void;
  refresh: () => void;
  press: (id: string, pressed: boolean, event?: PointerEvent) => void;
  drag: (id: string, event: PointerEvent) => void;
}
export const glassContextKey: InjectionKey<GlassContext> = Symbol('scenic-liquid-glass');

export function finiteClamp(value: number, fallback: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}
