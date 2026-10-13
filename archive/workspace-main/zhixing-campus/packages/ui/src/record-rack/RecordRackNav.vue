<script setup lang="ts">
import {layoutViewport,layoutRect,DISPLAY_CHANGE} from "../display";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { sleeveExposure, type SleeveSurface } from './exposure';
import { rackSpacing } from './spacing';
import RecordRackDisc from './RecordRackDisc.vue';
import { clamp, finite, wheelPixels } from './motion';
import { recordRackDefaults, type RecordRackGroup, type RackActivation, type RackPreview, type RackLayout, type RackMotion, type RackOrientation, type RackPlacement, type RackSource, type RackTheme } from './types';

const props = withDefaults(defineProps<{
  items: RecordRackGroup[];
  activeId?: string;
  placement?: RackPlacement;
  orientation?: RackOrientation;
  layout?: RackLayout;
  motion?: RackMotion;
  theme?: RackTheme;
  nestedTheme?: RackTheme;
  ariaLabel?: string;
  title?: string;
}>(), { placement: 'left', orientation: 'auto', ariaLabel: '唱片架导航', title: '功能导航' });
const emit = defineEmits<{
  activate: [value: RackActivation];
  'preview-change': [value: RackPreview];
}>();
const root = ref<HTMLElement>();
const viewport = ref({ width: 1280, height: 800 });
const reduced = ref(false);
const hovered = ref<string | null>(null);
const opened = ref<string | null>(null);
const engaged = ref(false);
const position = ref(0);
const rackOffset = ref(0);
const pointerInside = ref(false);
const keyboardMode = ref(false);
const focusInside = ref(false);
const exposedSummaries = ref<Set<string>>(new Set());
let summaryTimer: ReturnType<typeof setTimeout> | undefined;
const discs = ref<InstanceType<typeof RecordRackDisc>[]>([]);
const childDisc = ref<InstanceType<typeof RecordRackDisc>>();
const branchId = ref<string | null>(null);
const childPosition = ref(0);
let parkTimer: ReturnType<typeof setTimeout> | undefined;
let media: MediaQueryList | undefined;
let hoverPoint: { x: number; y: number } | undefined;
const vertical = computed(() => props.orientation === 'vertical' || (props.orientation === 'auto' && ['left', 'right'].includes(props.placement)));
const direction = computed(() => ({ left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[props.placement]));
const layout = computed(() => {
  const d = recordRackDefaults.layout, p = props.layout;
  const edge = finite(p?.edge, d.edge, 4, 80);
  const extract = finite(p?.extract, d.extract, 0.35, 0.75);
  const probe = finite(p?.probe, d.probe, 0, 100);
  const depth = ['left', 'right'].includes(props.placement) ? viewport.value.width : viewport.value.height;
  const depthFactor = props.items.some(g => g.items.some(i => i.children?.length)) ? 1 + 2 * extract : 1 + extract;
  const available = Math.min(viewport.value.width - edge * 2, viewport.value.height - edge * 2, (depth - edge * 2 - probe) / depthFactor);
  const size = Math.min(finite(p?.size, d.size, 180, 420), Math.max(120, available));
  return { size, edge, extract, probe, fill: p?.fill ?? false, maxVisible: Math.round(finite(p?.maxVisible, d.maxVisible, 3, 24)), spacing: finite(p?.spacing, d.spacing, 48, size), tilt: finite(p?.tilt, d.tilt, -12, 12), retreat: finite(p?.retreat, d.retreat, 0, size * 0.6), zIndex: finite(p?.zIndex, d.zIndex, 0, 2147483647) };
});
const motion = computed(() => {
  const d = recordRackDefaults.motion, p = props.motion;
  return { duration: finite(p?.duration, d.duration, 0, 1500), damping: finite(p?.damping, d.damping, 6, 40), wheelStep: finite(p?.wheelStep, d.wheelStep, 30, 300), settleDelay: finite(p?.settleDelay, d.settleDelay, 180, 1000), parkDelay: finite(p?.parkDelay, d.parkDelay, 0, 1500), snapEpsilon: finite(p?.snapEpsilon, d.snapEpsilon, 0.0001, 0.02) };
});
const currentGroup = computed(() => props.items.find(g => !g.disabled && g.items.some(i => !i.disabled && (i.children?.length ? i.children.some(child => !child.disabled && child.id === props.activeId) : i.id === props.activeId))));
const currentItem = computed(() => currentGroup.value?.items.find(i => !i.disabled && (i.id === props.activeId || i.children?.some(child => !child.disabled && child.id === props.activeId))));
const openGroup = computed(() => props.items.find(g => g.id === opened.value && !g.disabled));
const availableItems = computed(() => openGroup.value?.items.filter(i => !i.disabled) ?? []);
const branches = computed(() => openGroup.value?.items.filter(item => item.children?.length) ?? []);
const branch = computed(() => branches.value.find(item => item.id === branchId.value && !item.disabled));
const childItems = computed(() => branch.value?.children?.filter(item => !item.disabled) ?? []);
const childPreview = computed(() => clamp(Math.round(childPosition.value), 0, Math.max(0, childItems.value.length - 1)));
const previewIndex = computed(() => clamp(Math.round(position.value), 0, Math.max(0, availableItems.value.length - 1)));
const emphasized = computed(() => engaged.value ? (hovered.value ?? opened.value) : null);
const axisLength = computed(() => vertical.value ? viewport.value.height : viewport.value.width);
const titleCount = computed(() => props.title ? 1 : 0);
const recordCount = computed(() => props.items.length + titleCount.value);
const effectiveSpacing = computed(() => rackSpacing(recordCount.value, layout.value.maxVisible, axisLength.value, layout.value.size, layout.value.spacing, layout.value.edge, 0, layout.value.fill));
const primaryLimit = computed(() => layout.value.maxVisible);
const pageStart = computed(() => Math.min(Math.max(0, recordCount.value - primaryLimit.value), Math.floor(rackOffset.value / effectiveSpacing.value)));
const windowOffset = computed(() => rackOffset.value - pageStart.value * effectiveSpacing.value);
const lastVisibleIndex = computed(() => Math.min(recordCount.value - 1, pageStart.value + primaryLimit.value - 1));
const spreadSize = computed(() => Math.min(recordCount.value, layout.value.maxVisible) > 1 ? Math.max(0, layout.value.size - effectiveSpacing.value - 28) : 0);
// Reserve the package preview on hover. Clicking and selecting tracks keep the same anchor.
const spreadGroup = computed(() => hovered.value ?? opened.value);
const spreadIndex = computed(() => {
  const index = props.items.findIndex(group => group.id === spreadGroup.value);
  return index < 0 ? -1 : index + titleCount.value;
});
const totalLength = computed(() => Math.max(0, Math.min(recordCount.value, primaryLimit.value) - 1) * effectiveSpacing.value + layout.value.size + (recordCount.value ? spreadSize.value : 0));
const scrollControlSpace = computed(() => layout.value.fill ? 0 : 40);
const maxOffset = computed(() => Math.max(0, recordCount.value - primaryLimit.value) * effectiveSpacing.value + Math.max(0, totalLength.value - axisLength.value + layout.value.edge * 2 + scrollControlSpace.value));
const rootStyle = computed(() => ({ ...props.theme, '--rack-size': `${layout.value.size}px`, '--rack-duration': `${reduced.value ? 0 : motion.value.duration}ms`, zIndex: layout.value.zIndex }) as CSSProperties);

function stopWheel() { discs.value.forEach(disc => disc.cancel(true)); }
function stopChildWheel() { childDisc.value?.cancel(true); }
function resetPosition(initialIndex?: number) {
  stopWheel();
  const index = initialIndex ?? Math.max(0, availableItems.value.findIndex(i => i.id === currentItem.value?.id));
  position.value = index; discs.value.forEach(disc => disc.reset(index));
}
function restore() {
  stopWheel(); hovered.value = null; opened.value = currentGroup.value?.id ?? null;
  resetPosition(); restoreBranch(); engaged.value = false;
}
function clearPark() { if (parkTimer) clearTimeout(parkTimer); parkTimer = undefined; }
function enter() { pointerInside.value = true; clearPark(); engaged.value = true; }
function schedulePark() {
  clearPark();
  if (pointerInside.value || (keyboardMode.value && focusInside.value)) return;
  parkTimer = setTimeout(restore, motion.value.parkDelay);
}
function leave(event: PointerEvent) {
  // Crossing sibling hit regions is still inside the navigation, including their bridges.
  if (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget)) return;
  pointerInside.value = false; schedulePark();
}
function hoverRecord(group: RecordRackGroup, event: PointerEvent) {
  // Reflow can fire pointer-enter without mouse movement. Only real movement changes the preview anchor.
  if (hoverPoint && hoverPoint.x === event.clientX && hoverPoint.y === event.clientY) return;
  hoverPoint = { x: event.clientX, y: event.clientY };
  enter(); hovered.value = group.id;
}
function open(group: RecordRackGroup, source: RackSource = 'pointer') {
  if (group.disabled) return;
  clearPark(); engaged.value = true; opened.value = group.id; hovered.value = group.id; resetPosition(0); activate(0, source); if (branches.value.length) ensureVisible(props.items.indexOf(group));
}
function activate(index: number, source: RackSource) {
  const item = availableItems.value[index];
  if (!item || !openGroup.value) return;
  if (source === 'wheel' && !pointerInside.value && !(keyboardMode.value && focusInside.value)) return;
  if (source === 'wheel' && item.children?.length && branchId.value === item.id) return;
  stopChildWheel();
  branchId.value = item.children?.length ? item.id : null;
  childPosition.value = 0;
  const leaf = item.children?.length ? item.children.find(child => !child.disabled) : item;
  if (leaf && leaf.id !== props.activeId) emit('activate', { groupId: openGroup.value.id, itemId: leaf.id, ...(item.children?.length ? { parentItemId: item.id } : {}), source });
}
function readDisc(level: 2 | 3) {
  clearPark(); engaged.value = true; hovered.value = opened.value;
  if (level === 2) stopChildWheel(); else stopWheel();
}
function discInteract(level: 2 | 3, source: 'wheel' | 'keyboard') {
  readDisc(level);
  if (source === 'wheel') enter(); else { keyboardMode.value = true; clearPark(); engaged.value = true; }
}
function select(index: number, source: RackSource) {
  stopWheel(); position.value = index; activate(index, source);
}
function scrollRack(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey || !maxOffset.value) return;
  event.preventDefault();
  rackOffset.value = clamp(rackOffset.value + wheelPixels(event.deltaY || event.deltaX, event.deltaMode, axisLength.value), 0, maxOffset.value);
}
function ensureVisible(index: number) {
  index += titleCount.value;
  const step = effectiveSpacing.value;
  if (index < pageStart.value) rackOffset.value = index * step;
  else if (index >= pageStart.value + primaryLimit.value) rackOffset.value = (index - primaryLimit.value + 1) * step;
  const selectedIndex = spreadIndex.value;
  const localStart = (index - pageStart.value) * step + (selectedIndex >= pageStart.value && (index > selectedIndex || (index === selectedIndex && index === lastVisibleIndex.value)) ? spreadSize.value : 0);
  const room = axisLength.value - layout.value.edge * 2 - scrollControlSpace.value;
  if (localStart < windowOffset.value) rackOffset.value -= windowOffset.value - localStart;
  if (localStart + layout.value.size > windowOffset.value + room) rackOffset.value += localStart + layout.value.size - windowOffset.value - room;
  rackOffset.value = clamp(rackOffset.value, 0, maxOffset.value);
}
function focusSleeve(id: string) {
  const index = props.items.findIndex(g => g.id === id);
  ensureVisible(index);
  nextTick(() => root.value?.querySelectorAll<HTMLButtonElement>('.rr-primary > button.rr-sleeve')[index]?.focus());
}
function sleeveKey(event: KeyboardEvent, group: RecordRackGroup, index: number) {
  const prev = vertical.value ? 'ArrowUp' : 'ArrowLeft';
  const next = vertical.value ? 'ArrowDown' : 'ArrowRight';
  if ([prev, next, 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const enabled = props.items.map((g, i) => ({ g, i })).filter(({ g }) => !g.disabled);
    let n = enabled.findIndex(e => e.i === index);
    n = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : clamp(n + (event.key === next ? 1 : -1), 0, enabled.length - 1);
    if (enabled[n]) { hovered.value = enabled[n].g.id; focusSleeve(enabled[n].g.id); }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); open(group, 'keyboard');
    nextTick(() => discs.value[0]?.focus());
  }
}
function keydown(event: KeyboardEvent) {
  keyboardMode.value = true;
  if (event.key !== 'Escape') { clearPark(); engaged.value = true; }
  if (event.key === 'Tab' && event.shiftKey && (event.target as HTMLElement).closest('.rr-child')) {
    event.preventDefault(); stopChildWheel(); nextTick(() => discs.value[0]?.focus());
  }
  if (event.key === 'Tab' && !event.shiftKey && childItems.value.length && (event.target as HTMLElement).closest('.rr-disc[data-level="2"]')) {
    event.preventDefault(); stopWheel(); nextTick(() => childDisc.value?.focus());
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    const id = currentGroup.value?.id ?? opened.value;
    restore();
    if (id) focusSleeve(id);
  }
}
function sleeveFocus(group: RecordRackGroup, index: number) {
  if (keyboardMode.value) { hovered.value = group.id; ensureVisible(index); }
}
function focusin() { focusInside.value = true; clearPark(); if (keyboardMode.value) engaged.value = true; }
function focusout(event: FocusEvent) {
  if (root.value?.contains(event.relatedTarget as Node)) return;
  focusInside.value = false; schedulePark();
}
function globalKey(event: KeyboardEvent) { if (event.key === 'Tab') keyboardMode.value = true; }
function pointerMode() { keyboardMode.value = false; }
function measure() { viewport.value = layoutViewport(); }
function mediaChange() { reduced.value = media?.matches ?? false; }

function cardStyle(group: RecordRackGroup | null, index: number): CSSProperties {
  index += titleCount.value;
  const l = layout.value, [dx, dy] = direction.value;
  const highlighted = emphasized.value === group?.id;
  const tail = index === lastVisibleIndex.value;
  const selectedIndex = spreadIndex.value;
  const spread = selectedIndex < pageStart.value || selectedIndex >= pageStart.value + l.maxVisible ? 0 : (index > selectedIndex || (tail && index === selectedIndex)) ? spreadSize.value : 0;
  const start = l.edge + Math.max(0, (axisLength.value - totalLength.value - l.edge * 2) / 2);
  const along = start + (index - pageStart.value) * effectiveSpacing.value - windowOffset.value + spread;
  let x = vertical.value ? (props.placement === 'right' ? viewport.value.width - l.edge - l.size : props.placement === 'left' ? l.edge : (viewport.value.width - l.size) / 2) : along;
  let y = !vertical.value ? (props.placement === 'bottom' ? viewport.value.height - l.edge - l.size : props.placement === 'top' ? l.edge : (viewport.value.height - l.size) / 2) : along;
  // The final visible sleeve closes the rack edge; only its disc extends inward.
  const move = highlighted && !tail ? l.probe : -l.retreat;
  x += dx * move; y += dy * move;
  // Clamp the open composite to the viewport along the stacking axis. Retraction may intentionally reach the edge.
  if (highlighted && !tail) {
    const extension = l.size * l.extract;
    x = clamp(x, l.edge + Math.max(0, -dx * extension), viewport.value.width - l.edge - l.size - Math.max(0, dx * extension));
    y = clamp(y, l.edge + Math.max(0, -dy * extension), viewport.value.height - l.edge - l.size - Math.max(0, dy * extension));
  }
  // In the natural cross-axis layout, later sleeves retain their original front-to-back order.
  // Their small overlap covers only the package edge, leaving the outward disc unobstructed.
  const aboveOpen = selectedIndex >= 0 && index > selectedIndex && (vertical.value ? dx !== 0 : dy !== 0);
  return { ...group?.theme, left: `${x}px`, top: `${y}px`, zIndex: aboveOpen ? props.items.length + 4 + index : highlighted ? props.items.length + 3 : index + 1, '--rr-safe-left': `${Math.max(0, -x)}px`, '--rr-safe-right': `${Math.max(0, x + l.size - viewport.value.width)}px`, '--rr-safe-top': `${Math.max(0, -y)}px`, '--rr-safe-bottom': `${Math.max(0, y + l.size - viewport.value.height)}px`, '--rr-dx': dx, '--rr-dy': dy, '--rr-extract': `${l.size * l.extract}px`, '--rr-marker': `${Math.max(0.025, .5 - l.extract + .015) * 100}%`, '--rr-tilt': `${highlighted ? 0 : l.tilt}deg` } as CSSProperties;
}
function bridgeStyle(isOpen: boolean): CSSProperties {
  const [dx, dy] = direction.value;
  const back = layout.value.probe + (isOpen ? layout.value.retreat : 0);
  const extension = isOpen ? layout.value.size * layout.value.extract : 0;
  return { left: `${dx > 0 ? -back : dx < 0 ? -extension : 0}px`, top: `${dy > 0 ? -back : dy < 0 ? -extension : 0}px`, width: `${layout.value.size + Math.abs(dx) * (back + extension)}px`, height: `${layout.value.size + Math.abs(dy) * (back + extension)}px` };
}
const nestedOnScreen = computed(() => {
  const index = props.items.findIndex(group => group.id === opened.value) + titleCount.value;
  return branches.value.length > 0 && index >= pageStart.value && index < pageStart.value + primaryLimit.value;
});
function restoreBranch() {
  stopChildWheel();
  branchId.value = currentItem.value?.children?.length ? currentItem.value.id : null;
  childPosition.value = Math.max(0, childItems.value.findIndex(item => item.id === props.activeId));
  childDisc.value?.reset(childPosition.value);
}
function activateChild(index: number, source: RackSource) {
  if (source === 'wheel' && !pointerInside.value && !(keyboardMode.value && focusInside.value)) return;
  const item = childItems.value[index];
  if (item && branch.value && openGroup.value && item.id !== props.activeId) emit('activate', { groupId: openGroup.value.id, parentItemId: branch.value.id, itemId: item.id, source });
}
function childKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault(); event.stopPropagation(); stopChildWheel();
  position.value = Math.max(0, availableItems.value.findIndex(item => item.id === branchId.value));
  discs.value[0]?.focus();
}
function retireChild(element: Element) {
  stopChildWheel();
  element.setAttribute('inert', '');
  element.setAttribute('aria-hidden', 'true');
}
const childEngaged = computed(() => engaged.value && emphasized.value === opened.value);
// 收起时只取消动画；此时子组件可能仍持有上一目录，不能用旧片单长度裁剪刚恢复的位置。
watch(childEngaged, active => { if (!active) { discs.value.forEach(disc => disc.cancel()); childDisc.value?.cancel(); } });
function childStyle(): CSSProperties {
  const l = layout.value, [dx, dy] = direction.value;
  const parent = cardStyle(openGroup.value ?? null, props.items.findIndex(group => group.id === opened.value));
  const offset = l.size * (childEngaged.value ? l.extract : .18);
  let x = Number.parseFloat(String(parent.left)) + dx * offset;
  // A small stagger keeps the shared sleeve layered without growing the rack layout.
  let y = Number.parseFloat(String(parent.top)) + dy * offset + 12;
  if (childEngaged.value) y = clamp(y, l.edge + Math.max(0, -dy * l.size * l.extract),
    viewport.value.height - l.edge - l.size - Math.max(0, dy * l.size * l.extract));
  // Only the child yields: the primary rack and the secondary reading target stay still.
  const room = dx > 0 ? viewport.value.width - l.edge - x - l.size * (1 + l.extract)
    : dx < 0 ? x - l.size * l.extract - l.edge
    : dy > 0 ? viewport.value.height - l.edge - y - l.size * (1 + l.extract)
    : y - l.size * l.extract - l.edge;
  const yielding = childEngaged.value ? Math.min(l.size * .22, Math.max(0, room)) : 0;
  x += dx * yielding; y += dy * yielding;
  return { ...parent, ...props.nestedTheme, ...branch.value?.theme, '--rr-yield-distance': `${yielding}px`, left: `${x}px`, top: `${y}px`, zIndex: Math.max(0, Number(parent.zIndex) - 1), '--rr-tilt': '0deg' };
}
watch(rackOffset, () => { stopWheel(); stopChildWheel(); });
function updateExposedSummaries() {
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    const surfaces = Array.from(root.value?.querySelectorAll<HTMLElement>('.rr-record') ?? [])
      .filter(record => record.getClientRects().length)
      .map(record => {
        const sleeve = record.querySelector<HTMLElement>('.rr-sleeve:not(.rr-hierarchy-hint)')!;
        const rect = layoutRect(sleeve);
        const matrix = new DOMMatrix(getComputedStyle(sleeve).transform);
        const discElement=record.querySelector('.rr-disc');
        const disc = discElement?layoutRect(discElement):undefined;
        return {
          id: record.dataset.group,
          x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
          width: sleeve.offsetWidth, height: sleeve.offsetHeight,
          angle: Math.atan2(matrix.b, matrix.a), layer: Number(getComputedStyle(record).zIndex),
          disc: disc ? { x: disc.left + disc.width / 2, y: disc.top + disc.height / 2, radius: disc.width / 2 } : undefined,
        } satisfies SleeveSurface & { id?: string };
      });
    exposedSummaries.value = new Set(surfaces.filter(surface => surface.id && sleeveExposure(surface, surfaces, viewport.value) >= .85).map(surface => surface.id!));
  }, reduced.value ? 0 : motion.value.duration + 32);
}
watch([opened, hovered, engaged, branchId, pageStart, titleCount, rackOffset, layout, vertical, () => props.placement, () => props.items, viewport, motion, reduced], updateExposedSummaries, { flush: 'post', deep: true });
watch(() => [props.activeId, props.items] as const, () => {
  const hadKeyboardFocus = keyboardMode.value && typeof document !== 'undefined' && root.value?.contains(document.activeElement);
  const wasChild = hadKeyboardFocus && document.activeElement?.closest('.rr-child');
  opened.value = currentGroup.value?.id ?? null; hovered.value = null; resetPosition(); restoreBranch();
  const currentIndex = props.items.findIndex(group => group.id === opened.value);
  const physicalIndex = currentIndex + titleCount.value;
  if (currentIndex >= 0 && (physicalIndex < pageStart.value || physicalIndex >= pageStart.value + primaryLimit.value)) ensureVisible(currentIndex);
  if (hadKeyboardFocus) nextTick(() => {
    if (wasChild && branchId.value) childDisc.value?.focus();
    else if (!root.value?.contains(document.activeElement)) {
      if (discs.value[0]) discs.value[0].focus();
      else root.value?.querySelector<HTMLButtonElement>('.rr-primary > button:not(:disabled)')?.focus();
    }
  });
}, { immediate: true, deep: true });
watch([childPreview, branchId], () => { if (branchId.value) emit('preview-change', { groupId: opened.value ?? '', parentItemId: branchId.value, itemId: childItems.value[childPreview.value]?.id ?? null }); });
watch([previewIndex, opened], () => emit('preview-change', { groupId: opened.value ?? '', itemId: availableItems.value[previewIndex.value]?.id ?? null }), { immediate: true });
watch([() => props.placement, () => props.orientation], () => { resetPosition(); stopChildWheel(); rackOffset.value = 0; nextTick(() => { if (branches.value.length) ensureVisible(props.items.findIndex(group => group.id === opened.value)); }); });
watch([primaryLimit, viewport], () => {
  const index = props.items.findIndex(group => group.id === opened.value);
  if (index >= 0) ensureVisible(index);
}, { flush: 'post' });
watch(maxOffset, value => { rackOffset.value = clamp(rackOffset.value, 0, value); });
onMounted(() => {
  measure(); media = window.matchMedia('(prefers-reduced-motion: reduce)'); mediaChange(); media.addEventListener('change', mediaChange);
  window.addEventListener('resize', measure);window.addEventListener(DISPLAY_CHANGE,measure); document.addEventListener('keydown', globalKey); document.addEventListener('pointerdown', pointerMode);
});
onBeforeUnmount(() => {
  if (summaryTimer) clearTimeout(summaryTimer);
  stopWheel(); stopChildWheel(); clearPark(); media?.removeEventListener('change', mediaChange);
  window.removeEventListener('resize', measure);window.removeEventListener(DISPLAY_CHANGE,measure); document.removeEventListener('keydown', globalKey); document.removeEventListener('pointerdown', pointerMode);
});
</script>

<template>
  <nav ref="root" class="rr-root" :class="[`rr-${placement}`, { 'rr-vertical': vertical, 'rr-parked': !engaged, 'rr-browsing-second': engaged && branches.length > 0 }]" :style="rootStyle" :aria-label="ariaLabel" @keydown="keydown" @focusin="focusin" @focusout="focusout">
    <div v-if="title" v-show="pageStart === 0" class="rr-record rr-title-record" :style="cardStyle(null, -1)">
      <div class="rr-sleeve rr-title-sleeve"><h2 class="rr-title"><slot name="title">{{ title }}</slot></h2><span class="rr-title-caption">MENU COLLECTION</span></div>
    </div>
    <div v-for="(group, index) in items" :key="group.id" v-show="index + titleCount >= pageStart && index + titleCount < pageStart + primaryLimit" class="rr-record rr-primary" :class="{ 'rr-open': opened === group.id, 'rr-current': currentGroup?.id === group.id, 'rr-summary-visible': exposedSummaries.has(group.id) || opened === group.id || (engaged && hovered === group.id) }" :style="cardStyle(group, index)" :data-group="group.id" @pointerenter="enter" @pointermove="hoverRecord(group, $event)" @pointerleave="leave" @wheel="scrollRack">
      <div v-if="opened === group.id || hovered === group.id" class="rr-bridge" :style="bridgeStyle(opened === group.id)" aria-hidden="true" />
      <div v-if="group.items.some(item => item.children?.length) && opened !== group.id" class="rr-sleeve rr-hierarchy-hint" aria-hidden="true" />
      <RecordRackDisc v-if="opened === group.id" ref="discs" :key="group.id" v-model:position="position" :items="availableItems" :active-id="activeId" :ancestor-id="currentItem?.children?.length ? currentItem.id : undefined" :size="layout.size" :extract="layout.extract" :placement="placement" :motion="motion" :reduced="reduced" :label="`${group.label}片单`" :level="2" @pointerenter="readDisc(2)" @focusin="readDisc(2)" @activate="select" @interact="discInteract(2, $event)">
        <template v-if="$slots.item" #item="slotProps"><slot name="item" v-bind="slotProps" :group="group" :level="2" /></template>
        <template v-if="$slots.indicator" #indicator="slotProps"><slot name="indicator" v-bind="slotProps" :group="group" :level="2" /></template>
      </RecordRackDisc>
      <button class="rr-sleeve" type="button" :disabled="group.disabled" :aria-expanded="opened === group.id" :aria-label="group.label" @click="open(group)" @focus="sleeveFocus(group, index)" @keydown="sleeveKey($event, group, index)">
        <div class="rr-cover"><slot name="cover" :group="group"><img v-if="group.cover" :src="group.cover" alt="" /><span v-else class="rr-cover-art" aria-hidden="true" /></slot></div>
        <div class="rr-label"><slot name="label" :group="group" :active="currentGroup?.id === group.id"><span class="rr-number">{{ String(index + 1).padStart(2, '0') }}</span><component :is="group.icon" v-if="group.icon" class="rr-icon" /><strong>{{ group.label }}</strong><span v-if="currentGroup?.id === group.id" class="rr-current-dot" aria-label="当前页面所在分组" /></slot></div>
        <div class="rr-summary"><slot name="summary" :group="group"><span class="rr-caption">片 单 / TRACKLIST</span><span v-for="(item, i) in group.items.slice(0, 4)" :key="item.id" :class="{ 'rr-disabled': item.disabled }">{{ String(i + 1).padStart(2, '0') }} <span>{{ item.label }}</span></span><span v-if="group.items.length > 4">+ {{ group.items.length - 4 }} TRACKS</span></slot></div>
        <span class="rr-sleeve-footer" aria-hidden="true">GLASS COLLECTION <span>◉</span></span>
      </button>
    </div>
    <div v-if="nestedOnScreen && openGroup" class="rr-record rr-child" :class="{ 'rr-stacked': !childEngaged }" :data-parent-item="branchId" :style="childStyle()" @pointerenter="enter" @pointerleave="leave" @keydown="childKey">
      <div class="rr-bridge" :style="bridgeStyle(!!branch && childEngaged)" aria-hidden="true" />
      <Transition name="rr-child-disc" :enter="false" @before-leave="retireChild">
      <RecordRackDisc v-if="branch" ref="childDisc" v-model:position="childPosition" :items="childItems" :active-id="activeId" :size="layout.size" :extract="layout.extract" :placement="placement" :motion="motion" :reduced="reduced" :label="`${branch.label}三级菜单`" :level="3" @pointerenter="readDisc(3)" @focusin="readDisc(3)" @activate="activateChild" @interact="discInteract(3, $event)">
        <template v-if="$slots.item" #item="slotProps"><slot name="item" v-bind="slotProps" :group="openGroup" :parent="branch" :level="3" /></template>
        <template v-if="$slots.indicator" #indicator="slotProps"><slot name="indicator" v-bind="slotProps" :group="openGroup" :parent="branch" :level="3" /></template>
      </RecordRackDisc>
      </Transition>
      <div class="rr-sleeve rr-shared-sleeve" aria-hidden="true"><div class="rr-cover"><span class="rr-cover-art" /></div></div>
    </div>
    <div v-if="maxOffset > 0" class="rr-rack-controls" :style="{ zIndex: items.length * 2 + 5 }" :class="`rr-controls-${placement}`" @pointerenter="enter" @pointerleave="leave">
      <button type="button" aria-label="前面的唱片" :disabled="rackOffset <= 0" @click="rackOffset = Math.max(0, rackOffset - layout.size)">↑</button>
      <span>{{ recordCount }} 张唱片</span>
      <button type="button" aria-label="后面的唱片" :disabled="rackOffset >= maxOffset" @click="rackOffset = Math.min(maxOffset, rackOffset + layout.size)">↓</button>
    </div>
  </nav>
</template>

<style scoped>
.rr-root { --rack-tint: 239 248 247; --rack-opacity: .36; --rack-blur: 18px; --rack-text: #203d3b; --rack-muted: #58736e; --rack-accent: #20685b; --rack-border: rgb(255 255 255 / .78); --rack-shadow: 0 15px 40px rgb(30 60 55 / .14); --rack-radius: 12px; --rack-font: inherit; --rack-label-size: 14px; --rack-track-size: 12px; --rack-active: #236556; --rack-highlight: rgb(255 255 255 / .85); position: fixed; inset: 0; overflow: clip; pointer-events: none; color: var(--rack-text); font-family: var(--rack-font); }
.rr-root * { box-sizing: border-box; }
.rr-record { position: absolute; width: var(--rack-size); height: var(--rack-size); pointer-events: none; transition: left var(--rack-duration) cubic-bezier(.2,.8,.2,1), top var(--rack-duration) cubic-bezier(.2,.8,.2,1); }
.rr-sleeve { border: 1px solid var(--rack-border); background: linear-gradient(135deg, rgb(255 255 255 / .42), transparent 60%), rgb(var(--rack-tint) / var(--rack-opacity)); backdrop-filter: blur(var(--rack-blur)); -webkit-backdrop-filter: blur(var(--rack-blur)); box-shadow: var(--rack-shadow), inset 0 1px 0 rgb(255 255 255 / .9); }
.rr-sleeve { appearance: none; display: flex; flex-direction: column; justify-content: flex-start; position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; padding: calc(16px + var(--rr-safe-top)) calc(16px + var(--rr-safe-right)) calc(16px + var(--rr-safe-bottom)) calc(16px + var(--rr-safe-left)); border-radius: var(--rack-radius); color: inherit; text-align: left; font: inherit; cursor: pointer; pointer-events: auto; overflow: hidden; transform: rotate(var(--rr-tilt)); transition: transform var(--rack-duration), background var(--rack-duration); }
.rr-sleeve:disabled { cursor: not-allowed; opacity: .45; }
.rr-hierarchy-hint { z-index: 0; pointer-events: none; transform: translate(calc(var(--rr-dx) * 10px), calc(var(--rr-dy) * 10px + 8px)) rotate(var(--rr-tilt)); }
.rr-shared-sleeve { pointer-events: none; cursor: default; }
.rr-cover { position: absolute; inset: 0; z-index: -1; opacity: .35; pointer-events: none; }
.rr-cover img { width: 100%; height: 100%; object-fit: cover; }
.rr-cover-art { position: absolute; width: 85%; height: 85%; right: -28%; bottom: -18%; border-radius: 50%; border: 1px solid var(--rack-border); box-shadow: 0 0 0 14px rgb(255 255 255 / .08), 0 0 0 28px rgb(255 255 255 / .08), 0 0 0 42px rgb(255 255 255 / .08); }
.rr-title-record { pointer-events: none; }
.rr-title-sleeve { pointer-events: none; cursor: default; }
.rr-title-caption { font: 8px ui-monospace, monospace; letter-spacing: 2px; color: var(--rack-muted); }
.rr-title { margin: 0; flex-shrink: 0; height: 44px; font-size: var(--rack-title-size, 24px); font-weight: 650; line-height: 36px; letter-spacing: .03em; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.rr-label { display: flex; align-items: center; gap: 8px; height: 30px; flex-shrink: 0; white-space: nowrap; font-size: var(--rack-label-size); }
.rr-label strong { overflow: hidden; text-overflow: ellipsis; }
.rr-number { font: var(--rack-support-size, 10px) ui-monospace, monospace; opacity: .6; }
.rr-current-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--rack-active); }
.rr-sleeve { container-type: size; }
.rr-summary { display: grid; align-content: start; grid-auto-rows: max-content; flex: 1; min-height: 0; overflow: hidden; gap: 9px; margin-top: 22px; font-size: var(--rack-summary-size, 11px); line-height: 16px; color: var(--rack-muted); }
.rr-summary { visibility: hidden; opacity: 0; transition: opacity var(--rack-duration); }
.rr-summary-visible .rr-summary { visibility: visible; opacity: 1; }
.rr-summary > span { display: flex; gap: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rr-caption { font-size: 9px; letter-spacing: 2px; margin-bottom: 3px; }
.rr-disabled { opacity: .45; text-decoration: line-through; }
.rr-summary > span > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rr-sleeve-footer { display: flex; flex-shrink: 0; justify-content: space-between; margin-top: 10px; font: 8px ui-monospace, monospace; letter-spacing: 2px; color: var(--rack-muted); }
/* Retraction reduces the visible content box. Remove decoration first, then whole summary rows. */
@container (height < 180px) {
  .rr-sleeve-footer { display: none; }
  .rr-summary { margin-top: 8px; gap: 6px; }
}
@container (height < 150px) { .rr-summary > span:nth-child(n + 5) { display: none; } }
@container (height < 128px) { .rr-summary > span:nth-child(n + 4) { display: none; } }
@container (height < 106px) { .rr-summary > span:nth-child(n + 3) { display: none; } }
@container (height < 84px) { .rr-summary { display: none; } }
.rr-disc { background-color: rgb(var(--rack-tint) / var(--rack-disc-opacity, .25)); backdrop-filter: blur(var(--rack-disc-blur, var(--rack-blur))); -webkit-backdrop-filter: blur(var(--rack-disc-blur, var(--rack-blur))); width: 100%; height: 100%; position: absolute; left: calc(var(--rr-dx) * var(--rr-extract)); top: calc(var(--rr-dy) * var(--rr-extract)); border-radius: 50%; pointer-events: auto; z-index: 1; animation: rr-extract var(--rack-duration) cubic-bezier(.2,.8,.2,1) both; }

.rr-browsing-second .rr-primary.rr-open > .rr-disc { background-color: rgb(var(--rack-tint) / var(--rack-reading-opacity, .68)); }
.rr-browsing-second .rr-primary.rr-open :deep(.rr-track:not(.rr-preview)) { color: var(--rack-text); opacity: 1 !important; }
.rr-browsing-second .rr-primary.rr-open :deep(.rr-grooves) { opacity: .35; }
.rr-parked .rr-primary.rr-open > .rr-disc, .rr-child.rr-stacked > .rr-disc { border-color: color-mix(in srgb, var(--rack-accent) 32%, var(--rack-border)); }
.rr-child-disc-leave-active { animation: none !important; transition: translate var(--rack-duration) cubic-bezier(.2,.8,.2,1), opacity var(--rack-duration); pointer-events: none !important; }
.rr-child-disc-leave-from { translate: 0 0; opacity: 1; }
.rr-child-disc-leave-to { translate: calc(-1 * var(--rr-dx) * var(--rr-extract)) calc(-1 * var(--rr-dy) * var(--rr-extract)); opacity: 0; }
.rr-bridge { position: absolute; pointer-events: auto; }




.rr-right .rr-indicator { transform: translate(-50%, -50%) rotate(180deg); }
.rr-top .rr-indicator { transform: translate(-50%, -50%) rotate(90deg); }
.rr-bottom .rr-indicator { transform: translate(-50%, -50%) rotate(-90deg); }
.rr-icon { width: 15px; height: 15px; flex-shrink: 0; }

.rr-rack-controls { position: absolute; display: flex; align-items: center; gap: 10px; padding: 4px; border-radius: 20px; background: var(--rack-highlight); font-size: var(--rack-support-size, 10px); pointer-events: auto; z-index: 60; }
.rr-rack-controls button { width: 28px; height: 28px; border: 0; border-radius: 50%; color: inherit; background: transparent; cursor: pointer; }
.rr-rack-controls button:disabled { opacity: .3; }
.rr-controls-left { left: 18px; bottom: 10px; } .rr-controls-right { right: 18px; bottom: 10px; }
.rr-controls-top { top: 10px; right: 10px; } .rr-controls-bottom { bottom: 10px; right: 10px; }
.rr-root button:focus-visible { outline: 2px solid var(--rack-accent); outline-offset: 3px; }
@keyframes rr-extract { from { translate: calc(-1 * var(--rr-dx) * var(--rr-extract)) calc(-1 * var(--rr-dy) * var(--rr-extract)); opacity: .2; } to { translate: 0 0; opacity: 1; } }
@supports not (backdrop-filter: blur(1px)) { .rr-sleeve, .rr-disc { background: rgb(var(--rack-tint) / .93); } }
@media (prefers-reduced-motion: reduce) { .rr-root *, .rr-root *::before { animation: none !important; transition: none !important; } }
@media (forced-colors: active) { .rr-sleeve, .rr-disc, .rr-track.rr-preview { background: Canvas; color: CanvasText; border-color: CanvasText; } .rr-root button:focus-visible { outline-color: Highlight; } }
</style>
