<script setup lang="ts">
import AdminButton from "./AdminButton.vue";
import { cloneVNode, computed, defineComponent, Fragment, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, useSlots, type VNode } from "vue";
import { LiquidGlassButton, LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import { flowKey } from "../app/flow";
const props = withDefaults(defineProps<{ model: Record<string, any>; busy?: boolean; primary: string[]; search?: string }>(), { search: "" });
const emit = defineEmits<{ submit: []; reset: [] }>();
const slots = useSlots();
const flow = inject(flowKey, null);
const host = ref<HTMLElement>();
const popup = ref<HTMLElement>();
const trigger = ref<InstanceType<typeof LiquidGlassButton>>();
const narrow = ref(false);
const open = ref(false);
const draft = ref<Record<string, any>>({});
const applied = ref({ ...props.model });
let observer: ResizeObserver | undefined;
const count = computed(() => Object.entries(applied.value).filter(([key, value]) => !["page", "pageSize"].includes(key) && value !== "" && value !== "all" && value != null).length);
function flatten(nodes: VNode[]): VNode[] { return nodes.flatMap(node => node.type === Fragment && Array.isArray(node.children) ? flatten(node.children as VNode[]) : [node]); }
// Inline and popup controls share bindings but need distinct label/ID pairs.
function popupNode(node: VNode): VNode {
  const attributes: Record<string, string> = {};
  for (const key of ["id", "field", "for", "aria-describedby"]) {
    if (typeof node.props?.[key] === "string") attributes[key] = node.props[key].split(" ").map((id: string) => `${id}--popup`).join(" ");
  }
  const copy = cloneVNode(node, attributes);
  if (Array.isArray(node.children)) copy.children = node.children.map(child => typeof child === "object" && child !== null ? popupNode(child as VNode) : child);
  else if (node.children && typeof node.children === "object") {
    copy.children = Object.fromEntries(Object.entries(node.children).map(([key, slot]) => [key,
      typeof slot === "function" ? (...args: unknown[]) => {
        const children = slot(...args);
        return Array.isArray(children) ? children.map(popupNode) : children;
      } : slot,
    ]));
  }
  return copy;
}
const Fields = defineComponent({
  props: { location: { type: String, required: true } },
  setup(p) { return () => {
    const nodes = flatten(slots.default?.({ filter: p.location === "popup" ? draft.value : props.model }) ?? []);
    const fields = nodes.filter(node => {
      const id = node.props?.field;
      if (!id) return false;
      if (p.location === "popup") return true;
      return narrow.value ? id === props.search : props.primary.includes(id);
    });
    return p.location === "inline" ? fields.sort((a, b) => props.primary.indexOf(a.props?.field) - props.primary.indexOf(b.props?.field)) : fields.map(popupNode);
  }; },
});
const hasMore = computed(() => narrow.value || flatten(slots.default?.({ filter: props.model }) ?? []).some(node => node.props?.field && !props.primary.includes(node.props.field)));
watch(() => props.busy, busy => { if (!busy) applied.value = { ...props.model }; });
function submit() { if (props.busy) return; applied.value = { ...props.model }; if (flow) flow.reset.value++; emit("submit"); }
async function show() {
  draft.value = { ...props.model };
  open.value = true;
  await nextTick();
  popup.value?.querySelector<HTMLElement>("input,select,button")?.focus();
}
function close() { open.value = false; trigger.value?.focus(); }
function apply() { Object.assign(props.model, draft.value); close(); submit(); }
async function reset() { close(); if (flow) flow.reset.value++; emit("reset"); await nextTick(); applied.value = { ...props.model }; }
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") { event.stopPropagation(); close(); }
  if (event.key !== "Tab") return;
  const items = Array.from(popup.value?.querySelectorAll<HTMLElement>('input,select,button:not([disabled]),[href]') ?? []);
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(() => { observer = new ResizeObserver(entries => { narrow.value = entries[0].contentRect.width < 900; }); if (host.value) observer.observe(host.value); });
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div ref="host" class="flow-filters">
    <form class="flow-filters__row" @submit.prevent="submit">
      <Fields location="inline" />
      <div class="flow-filters__actions">
        <LiquidGlassButton variant="primary" type="submit" :disabled="busy" :radius="14">查询</LiquidGlassButton>
        <LiquidGlassButton v-if="hasMore" ref="trigger" :disabled="busy" :aria-expanded="open" aria-haspopup="dialog" :radius="14" @click="show">筛选<span v-if="count" class="num">{{ count }}</span></LiquidGlassButton>
        <AdminButton variant="ghost"  type="button" :disabled="busy" @click="reset">重置</AdminButton>
      </div>
    </form>
    <Teleport to="body">
      <div v-if="open" class="flow-filter-overlay" @mousedown.self="close">
        <LiquidGlassSurface class="flow-filter-popup" :radius="22" :blur="8" :tint-opacity="0.94">
          <form ref="popup" role="dialog" aria-modal="true" aria-label="筛选条件" @submit.prevent="apply" @keydown="keyboard">
            <header><h2>筛选条件</h2><AdminButton variant="ghost" type="button"  @click="close">关闭</AdminButton></header>
            <div class="flow-filter-popup__body"><Fields location="popup" /></div>
            <footer><AdminButton variant="ghost"  type="button" @click="reset">重置</AdminButton><LiquidGlassButton variant="primary" type="submit">应用</LiquidGlassButton></footer>
          </form>
        </LiquidGlassSurface>
      </div>
    </Teleport>
  </div>
</template>
