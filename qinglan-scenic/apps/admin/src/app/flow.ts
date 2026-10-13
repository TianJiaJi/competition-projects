import { inject, nextTick, onBeforeUnmount, ref, type InjectionKey, type Ref } from "vue";
export interface FlowContext { key: string; reset: Ref<number> }
export const flowKey: InjectionKey<FlowContext> = Symbol("admin-flow");
const positions = new Map<string, { top: number; left: number }>();
export function useFlowScroll(suffix = "table") {
  const flow = inject(flowKey, null);
  const element = ref<HTMLElement>();
  const key = flow ? `${flow.key}:${suffix}` : "";
  let restored = false;
  function remember() {
    if (key && element.value && !element.value.closest(".drawer")) positions.set(key, { top: element.value.scrollTop, left: element.value.scrollLeft });
  }
  async function restore() {
    await nextTick();
    if (restored || !element.value || !key || element.value.closest(".drawer")) return;
    const position = positions.get(key);
    if (position) { element.value.scrollTop = position.top; element.value.scrollLeft = position.left; }
    restored = true;
  }
  function reset() {
    if (key) positions.delete(key);
    if (element.value) element.value.scrollTop = 0;
    restored = true;
  }
  onBeforeUnmount(remember);
  return { flow, element, remember, restore, reset };
}
