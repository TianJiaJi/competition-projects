<script setup lang="ts">
import { ref } from "vue";
import { ScenicMap } from "@scene/ui/scenic";
import { emptySnapshot } from "../../../contracts/src/empty-snapshot";
import { points, regions } from "@scene/model";
import { LiquidGlassButton } from "@scene/ui/liquid-glass";
import { Plus, Minus, RotateCcw, Pause, Play } from "lucide-vue-next";
const props = withDefaults(
  defineProps<{
    intro?: boolean;
    immersive?: boolean;
    screenFraming?: boolean;
  }>(),
  {
    intro: false,
  },
);
const map = ref<InstanceType<typeof ScenicMap>>();
const emit = defineEmits<{
  "preparation-progress": [progress: number];
  "intro-state": [state: string];
}>();
const introState = ref("loading");
function updateIntroState(state: string) {
  introState.value = state;
  emit("intro-state", state);
}
const rotating = ref(true);
const snapshot = emptySnapshot(
  points.map((p) => p.id),
  regions.map((r) => r.id),
);
snapshot.parkOpen = true;
</script>
<template>
  <div
    class="model-browser"
    :class="{ 'model-immersive': immersive }"
    data-testid="model-browser"
  >
    <ScenicMap
      ref="map"
      :show-loading-progress="false"
      :overview-scale="screenFraming ? 1.32 : immersive ? 1.3 : 1.16"
      :screen-framing="screenFraming || immersive"
      @preparation-progress="emit('preparation-progress', $event)"
      @intro-state="updateIntroState"
      :snapshot="snapshot"
      :selected="null"
      :route="null"
      :heat="false"
      :show-point-markers="false"
      :show-region-labels="false"
      :enable-point-picking="false"
      :show-details="false"
      :show-scroll="true"
      :intro="props.intro"
      :auto-rotate="rotating"
    />
    <div
      class="model-tools"
      :class="{ 'intro-hidden': immersive && introState !== 'ready' }"
      :inert="immersive && introState !== 'ready'"
    >
      <LiquidGlassButton aria-label="放大沙盘" @click="map?.zoom(1.15)"
        ><Plus :size="18" /></LiquidGlassButton
      ><LiquidGlassButton aria-label="缩小沙盘" @click="map?.zoom(0.87)"
        ><Minus :size="18" /></LiquidGlassButton
      ><LiquidGlassButton aria-label="复位沙盘" @click="map?.reset()"
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
.model-tools.intro-hidden {
  opacity: 0;
  pointer-events: none;
}
.model-tools {
  transition: opacity 0.6s;
}
@media (prefers-reduced-motion: reduce) {
  .model-tools {
    transition: none;
  }
}
</style>
