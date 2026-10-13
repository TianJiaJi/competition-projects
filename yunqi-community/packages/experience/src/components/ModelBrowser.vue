<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { communityPlaces, type CommunityView } from "@scene/model/community";
import BubbleLeader from "./BubbleLeader.vue";
import type { RecordItem } from "@scene/domain";
import { CommunityMap } from "@scene/ui/community";
import { scenario } from "../../../../scenario/config";
import { LiquidGlassButton, LiquidGlassSurface } from "@scene/ui/liquid-glass";
import {
  Plus,
  Minus,
  RotateCcw,
  Pause,
  Play,
  X,
  MapPin,
  Clock3,
} from "lucide-vue-next";
const props = withDefaults(
  defineProps<{
    intro?: boolean;
    view?: CommunityView;
    immersive?: boolean;
    screenFraming?: boolean;
    records?: RecordItem[];
  }>(),
  {
    intro: false,
    view: "housing",
  },
);
const map = ref<InstanceType<typeof CommunityMap>>();
const emit = defineEmits<{
  "preparation-progress": [progress: number];
  "intro-state": [state: string];
}>();
const rotating = ref(true);
const introState = ref("loading");
function updateIntroState(state: string) {
  introState.value = state;
  emit("intro-state", state);
}
const selected = ref<string | null>(null);
const facility = computed(() => {
  const place = communityPlaces.find((p) => p.id === selected.value);
  const record = (
    props.records ?? [
      ...scenario.seed.facilities,
      ...scenario.seed.parking,
      ...scenario.seed.buildings,
    ]
  ).find((r) => r.id === selected.value);
  if (record) return { ...record, title: place?.name ?? record.title };
  if (place)
    return {
      id: place.id,
      title: place.name,
      location: place.location,
      description: place.description,
      category: "社区空间",
      date: "",
      status: "",
      capacity: undefined,
      used: undefined,
    };
  return undefined;
});
let markerTrigger: HTMLElement | null = null;
async function selectFacility(id: string) {
  markerTrigger = document.activeElement as HTMLElement;
  selected.value = id;
  await nextTick();
  document.querySelector<HTMLElement>(".facility-bubble button")?.focus();
}
function closeFacility() {
  selected.value = null;
  markerTrigger?.focus();
}
watch(
  () => props.view,
  () => closeFacility(),
);
function resetScene() {
  selected.value = null;
  map.value?.reset();
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape" && selected.value) {
    event.preventDefault();
    event.stopPropagation();
    closeFacility();
  }
}
function otherMenu(event: PointerEvent) {
  if (
    selected.value &&
    (event.target as Element).closest(".stage-dock,.stage-notice")
  )
    closeFacility();
}
onMounted(() => {
  document.addEventListener("keydown", escape);
  document.addEventListener("pointerdown", otherMenu);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", escape);
  document.removeEventListener("pointerdown", otherMenu);
});
</script>
<template>
  <div
    class="model-browser"
    :class="{ 'model-immersive': immersive }"
    data-testid="model-browser"
  >
    <CommunityMap
      ref="map"
      :show-loading-progress="false"
      :overview-scale="1"
      :palette="scenario.theme"
      :selected="selected"
      :view="view"
      :show-markers="immersive"
      :screen-framing="screenFraming || immersive"
      @select="selectFacility"
      @blank="closeFacility"
      @preparation-progress="emit('preparation-progress', $event)"
      @intro-state="updateIntroState"
      :intro="props.intro"
      :auto-rotate="rotating"
    />
    <BubbleLeader
      v-if="facility && immersive"
      :source="`[data-testid=community-marker-${selected}]`"
      target=".facility-bubble"
    />
    <LiquidGlassSurface
      v-if="facility"
      class="facility-bubble"
      :radius="24"
      :blur="8"
      :tint-opacity="0.2"
      role="dialog"
      :aria-label="facility.title + '详情'"
      @pointerdown.stop
    >
      <header>
        <div>
          <p class="eyebrow">LIFE IN YUNQI</p>
          <h2>{{ facility.title }}</h2>
        </div>
        <LiquidGlassButton
          aria-label="关闭设施详情"
          :radius="99"
          :tint-opacity="0.06"
          @click="closeFacility"
          ><X :size="17"
        /></LiquidGlassButton>
      </header>
      <p class="facility-location">
        <MapPin :size="14" />{{ facility.location }}
      </p>
      <span
        v-if="facility.status"
        class="facility-status"
        :class="{
          'needs-attention': !['正常', '开放', '使用中'].includes(
            facility.status,
          ),
        }"
        >{{ facility.status }}</span
      >
      <p class="facility-description">{{ facility.description }}</p>
      <dl v-if="facility.capacity !== undefined">
        <div>
          <dt>总容量</dt>
          <dd>{{ facility.capacity }}</dd>
        </div>
        <div>
          <dt>
            {{ facility.category.includes("停车") ? "空余车位" : "当前使用" }}
          </dt>
          <dd>
            {{
              facility.category.includes("停车")
                ? facility.capacity - (facility.used ?? 0)
                : (facility.used ?? 0)
            }}
          </dd>
        </div>
      </dl>
      <footer>
        <template v-if="facility.date"
          ><Clock3 :size="13" />{{ facility.date }} · </template
        >{{ facility.category }}
      </footer>
    </LiquidGlassSurface>
    <div
      class="model-tools"
      :class="{ 'intro-hidden': immersive && introState !== 'ready' }"
      :inert="immersive && introState !== 'ready'"
    >
      <LiquidGlassButton aria-label="放大沙盘" @click="map?.zoom(1.15)"
        ><Plus :size="18" /></LiquidGlassButton
      ><LiquidGlassButton aria-label="缩小沙盘" @click="map?.zoom(0.87)"
        ><Minus :size="18" /></LiquidGlassButton
      ><LiquidGlassButton aria-label="复位沙盘" @click="resetScene"
        ><RotateCcw :size="18" /></LiquidGlassButton
      ><LiquidGlassButton
        :aria-label="rotating ? '暂停旋转' : '继续旋转'"
        @click="rotating = !rotating"
        ><Pause v-if="rotating" :size="18" /><Play v-else :size="18"
      /></LiquidGlassButton>
    </div>
  </div>
</template>

<style scoped>
.model-tools {
  transition: opacity 0.6s;
}
.model-tools.intro-hidden {
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .model-tools {
    transition: none;
  }
}

.facility-bubble {
  position: absolute;
  right: 32px;
  top: 225px;
  width: 330px;
  max-height: calc(100% - 345px);
  overflow: auto;
  z-index: 10;
  padding: 22px;
}
.facility-bubble header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.facility-bubble h2 {
  font-size: 23px;
  margin-top: 4px;
  line-height: 1.5;
}
.facility-bubble header button {
  min-height: 32px;
  padding: 7px;
  flex-shrink: 0;
}
.facility-location {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  margin: 17px 0 10px;
}
.facility-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--brand);
  padding: 4px 9px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--brand) 8%, transparent);
}
.facility-status:before {
  content: "";
  width: 5px;
  height: 5px;
  background: currentColor;
  border-radius: 50%;
}
.facility-status.needs-attention {
  color: var(--accent);
}
.facility-description {
  font-size: 14px;
  line-height: 1.9;
  margin: 20px 0;
}
.facility-bubble dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
  margin: 0 0 18px;
}
.facility-bubble dt {
  font-size: 11px;
  color: var(--muted);
}
.facility-bubble dd {
  font-size: 27px;
  font-weight: 400;
  margin: 5px 0 0;
}
.facility-bubble footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--muted);
}
@media (max-width: 1100px) {
  .facility-bubble {
    right: 22px;
    top: 205px;
    width: 300px;
    max-height: calc(100% - 320px);
  }
}
@media (max-width: 650px) {
  .facility-bubble {
    left: 14px;
    right: 14px;
    width: auto;
    top: auto;
    bottom: 112px;
    max-height: 40%;
    padding: 17px;
  }
  .facility-bubble h2 {
    font-size: 20px;
  }
  .facility-description {
    margin: 12px 0;
    font-size: 12px;
  }
}
</style>
