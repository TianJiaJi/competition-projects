<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { Check, ChevronDown, Search } from 'lucide-vue-next';
import type { EndpointConfig } from './engine';
const props = defineProps<{ modelValue: string; endpoints: EndpointConfig[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const open = ref(false);
const search = ref('');
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const searchInput = ref<HTMLInputElement>();
const selected = computed(() => props.endpoints.find(item => item.id === props.modelValue));
const filtered = computed(() => props.endpoints.filter(item => `${item.name} ${item.path} ${item.method}`.toLowerCase().includes(search.value.trim().toLowerCase())));
watch(() => props.disabled, value => { if (value) open.value = false; });
async function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) { search.value = ''; await nextTick(); searchInput.value?.focus(); }
}
function close() { open.value = false; trigger.value?.focus(); }
function choose(id: string) { if (props.disabled) return; emit('update:modelValue', id); close(); }
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('pointerdown', outside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
function blur(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) open.value = false;
}
function move(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  if (event.target === searchInput.value && ['Home', 'End'].includes(event.key)) return;
  const items = Array.from(root.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
  if (!items.length) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
  items[index]?.focus();
}
</script>
<template>
  <div ref="root" class="endpoint-select" @focusout="blur" @keydown.esc.prevent.stop="close" @keydown="move">
    <button ref="trigger" type="button" class="endpoint-trigger" aria-label="并发测试目标接口" aria-haspopup="listbox" :aria-expanded="open" :disabled="disabled || !endpoints.length" @click="toggle" @keydown.down.prevent="!open && toggle()">
      <span><strong>{{ selected?.name || '请选择目标接口' }}</strong><code>{{ selected?.path || '先生成 API 用例' }}</code></span><ChevronDown :size="15" :class="{ rotated: open }"/>
    </button>
    <div v-if="open" class="endpoint-popover">
      <div class="endpoint-search"><Search :size="15"/><input ref="searchInput" v-model="search" aria-label="搜索目标接口" placeholder="搜索接口名称、路径或方法"/></div>
      <div class="endpoint-options" role="listbox" aria-label="目标接口列表">
        <button v-for="item in filtered" :key="item.id" type="button" role="option" :aria-selected="item.id === modelValue" class="endpoint-option" @click="choose(item.id)">
          <span class="endpoint-method">{{ item.method }}</span><span class="endpoint-copy"><strong>{{ item.name }}</strong><code>{{ item.path }}</code></span><Check v-if="item.id === modelValue" :size="15"/>
        </button>
        <p v-if="!filtered.length" class="endpoint-empty" role="status">没有匹配的接口，试试其他关键词</p>
      </div>
      <div class="endpoint-footer">{{ filtered.length }} 个接口 · ↑↓ 选择 · Enter 确认 · Esc 关闭</div>
    </div>
  </div>
</template>
<style scoped>
.endpoint-select { position:relative; min-width:0; margin:8px 0 17px; font-size:12px; }
.endpoint-trigger { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:11px 12px; text-align:left; border:1px solid #dfe7df; border-radius:8px; background:#fff; color:#334f3d; cursor:pointer; }
.endpoint-trigger > span { min-width:0; }.endpoint-trigger strong,.endpoint-trigger code { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.endpoint-trigger strong { font-size:12px; font-weight:500; }.endpoint-trigger code { margin-top:5px; font-size:10px; color:#819087; }.endpoint-trigger svg { flex-shrink:0; transition:transform .15s; }.rotated { transform:rotate(180deg); }.endpoint-trigger:disabled { opacity:.55; cursor:not-allowed; }
.endpoint-trigger:focus-visible,.endpoint-option:focus-visible { outline:2px solid #689778; outline-offset:2px; }
.endpoint-popover { position:absolute; top:calc(100% + 7px); left:0; z-index:50; width:min(520px,calc(100vw - 64px)); max-width:calc(100vw - 64px); padding:8px; border:1px solid #dbe6da; border-radius:12px; background:#fff; box-shadow:0 12px 35px #294b3526; }
.endpoint-search { display:flex; align-items:center; gap:8px; border:1px solid #e0e8dc; border-radius:7px; background:#f6f9f3; padding:0 10px; color:#819477; }.endpoint-search input { min-width:0; width:100%; border:0; background:transparent; padding:10px 0; font:inherit; color:#334f3d; outline:none; }.endpoint-search:focus-within { outline:2px solid #689778; }
.endpoint-options { max-height:min(320px,45vh); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#b6c9ae #f4f7f1; margin-top:7px; }
.endpoint-option { display:flex; align-items:center; gap:10px; width:100%; padding:11px 10px; border:0; border-radius:7px; background:transparent; text-align:left; color:#435e47; cursor:pointer; }.endpoint-option:hover,.endpoint-option:focus-visible { background:#f3f7ef; }.endpoint-option[aria-selected="true"] { background:#eaf3e5; color:#326444; }.endpoint-method { flex-shrink:0; width:44px; padding:4px 0; border-radius:4px; background:#eef2e9; text-align:center; font:10px monospace; }.endpoint-copy { min-width:0; flex:1; }.endpoint-copy strong { display:block; font-size:12px; font-weight:500; }.endpoint-copy code { display:block; margin-top:5px; font-size:10px; color:#82917c; overflow-wrap:anywhere; }.endpoint-option svg { flex-shrink:0; }.endpoint-empty { padding:22px 10px; color:#819087; text-align:center; }.endpoint-footer { border-top:1px solid #edf1e9; margin-top:7px; padding:10px 4px 2px; color:#8c9b82; font-size:10px; }
</style>
