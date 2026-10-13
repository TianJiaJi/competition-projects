<script setup lang="ts">
import { computed, ref } from "vue";
import data from "../data";
import { state } from "../model/store";
const props = withDefaults(
  defineProps<{
    category?: string;
    selected?: string;
    routeId?: string;
    progress?: number;
  }>(),
  { category: "attraction", selected: "", routeId: "", progress: 0 },
);
const emit = defineEmits<{ select: [id: string] }>();
const size = Math.min(600, uni.getSystemInfoSync().windowWidth - 40);
const scale = ref(1),
  x = ref(0),
  y = ref(0);
const points = computed(() =>
  data.points.filter(
    (p) => p.kind !== "parking" && (p.kind === props.category || p.id === props.selected),
  ),
);
const position = (p: { x: number; z: number }) => ({
  left: ((p.x + 37) / 76) * 100 + "%",
  top: ((p.z + 36) / 76) * 100 + "%",
});
const marker = computed(() => {
  const route = data.routes.find((r) => r.id === props.routeId);
  if (!route) return null;
  const index = Math.min(
    route.path.length - 1,
    Math.round(props.progress * (route.path.length - 1)),
  );
  return route.path[index];
});
function reset() {
  scale.value = 1.001;
  x.value = 0.001;
  y.value = 0.001;
  setTimeout(() => {
    scale.value = 1;
    x.value = 0;
    y.value = 0;
  }, 0);
}
defineExpose({ reset });
</script>
<template>
  <view class="map-shell"
    ><movable-area :style="{ width: '100%', height: size + 'px' }"
      ><movable-view
        direction="all"
        scale
        :scale-min="1"
        :scale-max="3"
        :scale-value="scale"
        :x="x"
        :y="y"
        :style="{ width: size + 'px', height: size + 'px' }"
        ><image
          class="map-art"
          src="/static/scenic-map.png"
          mode="aspectFit"
        /><image
          v-if="routeId"
          class="map-art"
          :src="'/static/routes/' + routeId + '.png'"
          mode="aspectFit"
        />
        <button
          v-for="(p, index) in points"
          :key="p.id"
          :style="position(p.anchor)"
          class="map-point"
          :class="{
            chosen: p.id === selected,
            closed: state.closedPoints.includes(p.id),
          }"
          :aria-label="p.name"
          @tap.stop="emit('select', p.id)"
        >
          <text>{{
            p.id === selected || category === "attraction" ? p.name : index + 1
          }}</text></button
        ><view v-if="marker" class="map-position" :style="position(marker)"
          ><view class="dot" /><text>路线预览位置</text></view
        ></movable-view
      ></movable-area
    ><view class="map-caption">双指缩放与拖动</view></view
  >
</template>
<style scoped>
.map-shell {
  overflow: hidden;
  border-radius: 20px;
  background: #eaf3ef;
  position: relative;
}
.map-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.map-point {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 11px;
  background: transparent;
  padding: 4px;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
.map-point text {
  white-space: nowrap;
  flex-shrink: 0;
  background: #f8fcfa;
  border: 1px solid #91aaa0;
  padding: 3px 6px;
  border-radius: 7px;
}
.map-point.chosen text {
  background: #175f54;
  color: white;
}
.map-point.closed text {
  color: #a03b33;
  border-style: dashed;
}
.map-position {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.map-position text {
  font-size: 10px;
  background: #f8fcfa;
  color: #255d78;
  padding: 0 4px;
  white-space: nowrap;
}
.dot {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #255d78;
  border: 3px solid white;
  box-shadow: 0 0 0 4px #255d7825;
}
.map-caption {
  font-size: 11px;
  color: #536b63;
  padding: 6px 12px;
}
</style>
