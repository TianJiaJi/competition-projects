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
  GraduationCap,
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
  createCampusScene,
  defaultPalette,
  type CampusPalette,
  type CampusView,
  type CampusScene,
  campusMarkers,
  arrangeCampusMarkers,
  type MarkerProjection,
} from "@scene/model/campus";
import { ScrollPresentation, type ScrollIntroState } from "../scroll";
const props = withDefaults(
  defineProps<{
    palette?: CampusPalette;
    view?: CampusView;
    selected?: string | null;
    showMarkers?: boolean;
    intro?: boolean;
    autoRotate?: boolean;
    overviewScale?: number;
    screenFraming?: boolean;
    showLoadingProgress?: boolean;
  }>(),
  {
    view: "learning",
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
  space: GraduationCap,
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
const markers = computed(() =>
  arrangeCampusMarkers(
    campusMarkers.filter((m) => m.view === props.view),
    projections.value,
    host.value?.clientWidth ?? 1920,
    host.value?.clientHeight ?? 1080,
  ),
);
let scene: CampusScene | undefined;
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
    scene = createCampusScene(host.value!, {
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
    class="scene-shell campus-map"
    :state="state"
    :progress="progress"
    :show-progress="showLoadingProgress"
  >
    <div ref="host" class="campus-canvas" data-testid="campus-canvas" />
    <div
      v-if="showMarkers"
      :class="{ 'intro-hidden': state !== 'ready' }"
      :inert="state !== 'ready'"
      :aria-hidden="state !== 'ready'"
      class="campus-markers"
      aria-label="校园空间与公共设施标点"
    >
      <svg class="marker-leaders" aria-hidden="true">
        <line
          v-for="marker in markers"
          :key="marker.id"
          :data-anchor="marker.id"
          :x1="marker.originX"
          :y1="marker.originY"
          :x2="marker.x"
          :y2="marker.y"
        />
      </svg>
      <LiquidGlassButton
        v-for="marker in markers"
        :key="marker.id"
        class="campus-marker"
        :class="{
          'is-selected': selected === marker.id,
          'place-marker': marker.alwaysLabel,
        }"
        :style="{
          left: marker.x + 'px',
          top: marker.y + 'px',
          width: marker.width + 'px',
        }"
        :radius="99"
        :blur="5"
        :tint-opacity="1"
        :data-testid="'campus-marker-' + marker.id"
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
    <div v-if="failed" class="campus-error" role="alert">
      沙盘加载失败，请刷新重试
    </div>
  </ScrollPresentation>
</template>
<style scoped>
.campus-map {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.campus-canvas {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.campus-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.campus-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink);
  background: var(--canvas);
}
.campus-markers.intro-hidden {
  opacity: 0;
}
.campus-markers {
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
.campus-marker {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: auto;
  min-height: 32px;
  width: 32px;
  padding: 7px;
  color: var(--brand);
  background: var(--surface);
  box-shadow: 0 2px 8px #29364c18;
  transition:
    left 100ms linear,
    top 100ms linear;
}
.campus-marker::after {
  content: "";
  position: absolute;
  width: 4px;
  height: 4px;
  background: var(--brand);
  border-radius: 50%;
  bottom: -7px;
  left: calc(50% - 2px);
}
.campus-marker.is-selected {
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
.campus-marker:hover .marker-name,
.campus-marker:focus-visible .marker-name,
.campus-marker.is-selected .marker-name {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .campus-marker,
  .campus-markers,
  .marker-name {
    transition: none;
  }
}
</style>
