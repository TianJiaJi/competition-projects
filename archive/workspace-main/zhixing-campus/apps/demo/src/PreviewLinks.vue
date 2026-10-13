<script setup lang="ts">
import { computed } from "vue";
import { previewUrl, previewKey } from "@scene/demo/builder";
import type {
  PreviewContext,
  RunState,
  SampleDefinition,
  Stage,
} from "@scene/demo/builder-types";
const props = defineProps<{
  state: RunState;
  definition: SampleDefinition;
  stage: Stage;
  statuses: Record<string, string>;
}>();
const emit = defineEmits<{ open: [context: PreviewContext, port: number] }>();
const previews = computed(() =>
  props.definition.previews.filter((p) => p.stages.includes(props.stage)),
);
function context(terminal: PreviewContext["terminal"]): PreviewContext {
  return {
    run: props.state.run,
    stage: props.stage,
    terminal,
    caseId: props.state.caseId,
    version: props.state.version,
  };
}
const ready = computed(
  () => props.state.stages[props.stage].status === "assembled",
);
</script>
<template>
  <div class="preview-links">
    <div class="preview-item" v-for="p in previews" :key="p.id">
      <a
        v-if="ready"
        :href="previewUrl(context(p.id), p.port)"
        :target="'assembly-' + previewKey(context(p.id))"
        @click.prevent="emit('open', context(p.id), p.port)"
        >{{ stage === "01" ? "沙盘" : p.label }} ↗</a
      >
      <span v-else class="preview-unavailable">{{
        stage === "01" ? "沙盘" : p.label
      }}</span>
      <span
        class="window-status"
        role="status"
        :title="statuses[previewKey(context(p.id))]"
        >{{
          ready ? statuses[previewKey(context(p.id))] || "可打开" : "等待成果"
        }}</span
      >
      <button
        v-if="
          ready &&
          /超时|阻止|失败|关闭/.test(statuses[previewKey(context(p.id))] || '')
        "
        @click="emit('open', context(p.id), p.port)"
      >
        重试
      </button>
    </div>
  </div>
</template>
