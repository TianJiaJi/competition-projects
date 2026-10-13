import type { Component } from 'vue';

export type RackPlacement = 'left' | 'right' | 'top' | 'bottom';
export type RackOrientation = 'auto' | 'vertical' | 'horizontal';
export type RackSource = 'wheel' | 'pointer' | 'keyboard';
export type RackTheme = Partial<Record<`--rack-${string}`, string | number>>;
export interface RecordRackLeaf {
  id: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
  href?: string;
}
export interface RecordRackItem extends RecordRackLeaf {
  children?: RecordRackLeaf[];
  theme?: RackTheme;
}
export interface RecordRackGroup {
  id: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
  cover?: string;
  theme?: RackTheme;
  items: RecordRackItem[];
}
export interface RackActivation { groupId: string; itemId: string; parentItemId?: string; source: RackSource }
export interface RackPreview { groupId: string; itemId: string | null; parentItemId?: string }
export interface RackLayout {
  fill?: boolean;
  size?: number;
  spacing?: number;
  maxVisible?: number;
  tilt?: number;
  probe?: number;
  extract?: number;
  retreat?: number;
  edge?: number;
  zIndex?: number;
}
export interface RackMotion {
  duration?: number;
  damping?: number;
  wheelStep?: number;
  settleDelay?: number;
  parkDelay?: number;
  snapEpsilon?: number;
}
export const recordRackDefaults = {
  layout: { size: 240, spacing: 62, maxVisible: 8, tilt: -1.5, probe: 16, extract: 0.5, retreat: 124, edge: 18, zIndex: 40 },
  motion: { duration: 260, damping: 18, wheelStep: 100, settleDelay: 180, parkDelay: 200, snapEpsilon: 0.002 },
} as const;
