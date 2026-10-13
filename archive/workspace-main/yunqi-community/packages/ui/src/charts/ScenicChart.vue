<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { use, init, type EChartsCoreOption } from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  SVGRenderer,
]);
const props = defineProps<{ option: EChartsCoreOption; label: string }>();
const emit = defineEmits<{ select: [index: number]; ready: [] }>();
const host = ref<HTMLElement>();
let readyFrame = 0;
let chart: ReturnType<typeof init> | undefined,
  observer: ResizeObserver | undefined;
onMounted(() => {
  chart = init(host.value!, undefined, { renderer: "svg" });
  chart.setOption(props.option);
  readyFrame = requestAnimationFrame(() => emit("ready"));
  chart.on("click", (e) => {
    if (typeof e.dataIndex === "number") emit("select", e.dataIndex);
  });
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(host.value!);
});
watch(
  () => props.option,
  (option) => chart?.setOption(option, { notMerge: true }),
);
onBeforeUnmount(() => {
  cancelAnimationFrame(readyFrame);
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <div ref="host" class="scenic-chart" role="img" :aria-label="label" />
</template>
<style scoped>
.scenic-chart {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
