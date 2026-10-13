<script setup lang="ts">
import {
  computed,
  shallowRef,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import {
  Armchair,
  Dumbbell,
  DoorOpen,
  Building2,
  House,
  Trees,
  HeartPulse,
  CircleHelp,
  TriangleAlert,
  Flame,
  ParkingCircle,
} from "lucide-vue-next";
import { LiquidGlassButton } from "../liquid-glass";
import {
  createCommunityScene,
  defaultPalette,
  type CommunityPalette,
  type CommunityView,
  type CommunityScene,
  communityMarkers,
  type MarkerProjection,
} from "@scene/model/community";
import { ScrollPresentation, type ScrollIntroState } from "../scroll";
const props = withDefaults(
  defineProps<{
    palette?: CommunityPalette;
    view?: CommunityView;
    selected?: string | null;
    showMarkers?: boolean;
    intro?: boolean;
    autoRotate?: boolean;
    overviewScale?: number;
    screenFraming?: boolean;
    showLoadingProgress?: boolean;
  }>(),
  {
    view: "housing",
    selected: null,
    showMarkers: true,
    intro: false,
    autoRotate: true,
    overviewScale: 1,
    showLoadingProgress: true,
  },
);
const emit = defineEmits<{
  select: [id: string];
  blank: [];
  "preparation-progress": [value: number];
  "intro-state": [state: ScrollIntroState];
}>();
const host = ref<HTMLElement>(),
  state = ref<ScrollIntroState>("loading"),
  progress = ref(0),
  failed = ref(false);
const projections = shallowRef<Record<string, MarkerProjection>>({});
const icons = {
  space: Armchair,
  gym: Dumbbell,
  gate: DoorOpen,
  tower: Building2,
  villa: House,
  garden: Trees,
  aed: HeartPulse,
  help: CircleHelp,
  shelter: TriangleAlert,
  fire: Flame,
  parking: ParkingCircle,
};
// Stable tiers are part of the marker layout, never recomputed during rotation or selection.
const markers = computed(() =>
  communityMarkers
    .filter((marker) => marker.view === props.view)
    .flatMap((marker) => {
      const p = projections.value[marker.id];
      if (!p?.visible) return [];
      return [
        { ...marker, x: p.x, y: p.y - (marker.tier ?? 0) * 44, originY: p.y },
      ];
    }),
);
let scene: CommunityScene | undefined;
function updateState(value: ScrollIntroState) {
  state.value = value;
  emit("intro-state", value);
}
function failure() {
  failed.value = true;
  updateState("failed");
}
onMounted(() => {
  try {
    scene = createCommunityScene(host.value!, {
      palette: props.palette ?? defaultPalette,
      intro: props.intro,
      autoRotate: props.autoRotate,
      overviewScale: props.overviewScale,
      screenFraming: props.screenFraming,
      view: props.view,
      onProgress(value) {
        progress.value = value;
        emit("preparation-progress", value);
      },
      onProject(value) {
        projections.value = value;
      },
      onBlank() {
        emit("blank");
      },
      onIntroState: updateState,
      onError: failure,
    });
  } catch {
    failure();
  }
});
watch(
  () => props.view,
  (value) => scene?.setView(value),
);
watch(
  () => props.autoRotate,
  (value) => scene?.setAutoRotate(value),
);
watch(
  () => props.overviewScale,
  (value) => scene?.setOverviewScale(value),
);
watch(
  () => props.palette,
  (value) => scene?.setPalette(value ?? defaultPalette),
  { deep: true },
);
watch(
  () => props.selected,
  (id) => (id ? scene?.focus(id) : scene?.restoreFocus()),
);
onBeforeUnmount(() => scene?.dispose());
defineExpose({
  zoom: (factor: number) => scene?.zoom(factor),
  reset: () => scene?.reset(),
  focus: (id: string) => scene?.focus(id),
  restoreFocus: () => scene?.restoreFocus(),
  setAutoRotate: (value: boolean) => scene?.setAutoRotate(value),
});
</script>
<template>
  <ScrollPresentation
    class="scene-shell community-map"
    :state="state"
    :progress="progress"
    :show-progress="showLoadingProgress"
  >
    <div ref="host" class="community-canvas" data-testid="community-canvas" />
    <div
      v-if="showMarkers"
      :class="{ 'intro-hidden': state !== 'ready' }"
      :inert="state !== 'ready'"
      :aria-hidden="state !== 'ready'"
      class="community-markers"
      aria-label="社区空间与公共设施标点"
    >
      <svg class="marker-leaders" aria-hidden="true">
        <line
          v-for="marker in markers"
          :key="marker.id"
          :data-anchor="marker.id"
          :x1="marker.x"
          :y1="marker.originY"
          :x2="marker.x"
          :y2="marker.y"
        />
      </svg>
      <LiquidGlassButton
        v-for="marker in markers"
        :key="marker.id"
        class="community-marker"
        :class="{
          'is-selected': selected === marker.id,
          'place-marker': marker.alwaysLabel,
        }"
        :style="{ left: marker.x + 'px', top: marker.y + 'px' }"
        :radius="99"
        :blur="5"
        :tint-opacity="1"
        :data-testid="'community-marker-' + marker.id"
        :aria-label="'查看' + marker.name + '详情'"
        :aria-pressed="selected === marker.id"
        @pointerdown.stop
        @click.stop="emit('select', marker.id)"
        ><component
          :is="icons[marker.kind]"
          :size="16"
          :stroke-width="1.6"
        /><span :class="marker.alwaysLabel ? 'place-name' : 'marker-name'">{{
          marker.name
        }}</span></LiquidGlassButton
      >
    </div>
    <div v-if="failed" class="community-error" role="alert">
      沙盘加载失败，请刷新重试
    </div>
  </ScrollPresentation>
</template>
<style scoped>
.community-map {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.community-canvas {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.community-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.community-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink);
  background: var(--canvas);
}
.community-markers.intro-hidden {
  opacity: 0;
}
.community-markers {
  opacity: 1;
  transition: opacity 0.6s;
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.marker-leaders {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.marker-leaders line {
  stroke: var(--brand);
  stroke-opacity: 0.45;
  stroke-width: 1;
}
.community-marker {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: auto;
  min-height: 32px;
  width: 32px;
  padding: 7px;
  color: var(--brand);
  background: var(--surface);
  box-shadow: 0 2px 8px #3e302818;
}
.community-marker::after {
  content: "";
  position: absolute;
  width: 4px;
  height: 4px;
  background: var(--brand);
  border-radius: 50%;
  bottom: -7px;
  left: calc(50% - 2px);
}
.community-marker.is-selected {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  background: var(--surface);
  z-index: 2;
}
.marker-name {
  position: absolute;
  bottom: calc(100% + 9px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 5px 9px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  backdrop-filter: blur(8px);
  font-size: 11px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.community-marker:hover .marker-name,
.community-marker:focus-visible .marker-name,
.community-marker.is-selected .marker-name {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .community-markers,
  .marker-name {
    transition: none;
  }
}
</style>
