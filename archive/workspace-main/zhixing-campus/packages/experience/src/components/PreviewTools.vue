<script setup lang="ts">
import { LiquidGlassButton as GlassButton } from "@scene/ui/liquid-glass";
import { Focus, RefreshCw } from "lucide-vue-next";
defineProps<{
  identity?: string;
  error?: string;
  focus?: boolean;
  refresh?: boolean;
}>();
const emit = defineEmits<{ refresh: []; focus: [] }>();
</script>
<template>
  <div class="preview-tools">
    <span v-if="identity" class="preview-identity">{{ identity }}</span
    ><GlassButton
      v-if="refresh"
      aria-label="刷新数据"
      title="刷新数据"
      @click="emit('refresh')"
      ><RefreshCw :size="18" aria-hidden="true" /></GlassButton
    ><GlassButton
      v-if="focus"
      aria-label="聚焦教学区 · 设施详情"
      title="聚焦教学区 · 设施详情"
      @click="emit('focus')"
      ><Focus :size="18" aria-hidden="true" /></GlassButton
    ><span v-if="error" role="alert">数据可能已过期：{{ error }}</span>
  </div>
</template>
<style scoped>
.preview-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}
.preview-tools button {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 8px;
}
.preview-tools [role="alert"] {
  max-width: 340px;
  color: #b44735;
}
.preview-identity {
  white-space: nowrap;
}
</style>
