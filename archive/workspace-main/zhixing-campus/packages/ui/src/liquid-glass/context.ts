import type { InjectionKey, Ref } from 'vue';

export type GlassVariant = 'surface' | 'transparent' | 'primary';
/** Requested material mode; browsers without backdrop-filter still draw the clear surface. */
export type GlassStatus = 'css' | 'plain';
export interface GlassContext {
  status: Readonly<Ref<GlassStatus>>;
}
export const glassContextKey: InjectionKey<GlassContext> = Symbol('scenic-liquid-glass');

export function finiteClamp(value: number, fallback: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}
