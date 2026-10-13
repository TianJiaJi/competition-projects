<script setup lang="ts">
import { LiquidGlassButton } from "@scenic/ui/liquid-glass";
import { nextTick, onMounted, onUpdated, ref, watch } from "vue";
import FlowPanel from "./FlowPanel.vue";
const props = defineProps<{ modelValue: 'edit' | 'preview'; dirty: boolean; busy: boolean; error?: string | null }>();
const emit = defineEmits<{ 'update:modelValue': ['edit' | 'preview'] }>();
const scroll = ref<HTMLElement>();
const positions = { edit: 0, preview: 0 };
async function change(value: 'edit' | 'preview') {
  if (scroll.value) positions[props.modelValue] = scroll.value.scrollTop;
  emit('update:modelValue', value);
  await nextTick();
  resize();
  if (scroll.value) scroll.value.scrollTop = positions[value];
}
function resize() {
  if (!scroll.value || props.modelValue !== 'edit') return;
  const top = scroll.value.scrollTop;
  for (const field of scroll.value.querySelectorAll<HTMLTextAreaElement>('textarea')) {
    if (!field.getClientRects().length) continue;
    field.style.height = 'auto';
    field.style.height = `${Math.max(140, field.scrollHeight + 2)}px`;
    field.style.overflowY = 'hidden';
  }
  scroll.value.scrollTop = top;
}
watch(() => props.error, async error => {
  if (!error) return;
  await change('edit');
  await nextTick();
  const target = scroll.value?.querySelector<HTMLElement>('[aria-invalid="true"], .form-error-banner');
  // Field errors take precedence over the summary banner.
  const field = scroll.value?.querySelector<HTMLElement>('[aria-invalid="true"]');
  const focus = field ?? target;
  if (focus) { if (!field) focus.tabIndex = -1; focus.focus(); focus.scrollIntoView({ block: 'center' }); }
});
onMounted(resize);
onUpdated(resize);
</script>
<template>
  <FlowPanel class="flow-editor">
    <div class="tabs" role="tablist" aria-label="内容视图">
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="modelValue === 'edit'" :disabled="busy" @click="change('edit')">编辑</LiquidGlassButton>
      <LiquidGlassButton variant="transparent" class="tab" role="tab" :aria-selected="modelValue === 'preview'" :disabled="busy" @click="change('preview')">完整预览</LiquidGlassButton>
      <span v-if="dirty" class="muted small" role="status">未保存</span>
    </div>
    <div ref="scroll" class="flow-editor__scroll" tabindex="0" :aria-label="modelValue === 'edit' ? '编辑内容' : '完整预览'" @input="resize">
      <div v-show="modelValue === 'edit'" :inert="busy" class="flow-editor__fields"><slot /></div>
      <div v-show="modelValue === 'preview'" class="flow-editor__preview"><slot name="preview" /></div>
    </div>
  </FlowPanel>
</template>
