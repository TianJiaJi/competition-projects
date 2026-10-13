import { reactive, watch } from "vue";

/**
 * 列表筛选的会话级缓存：返回列表时保留本次页面筛选（§2.3）。
 * 只保存在内存中，不写入业务存储；刷新页面回到默认筛选。
 */
const filterCache = new Map<string, Record<string, unknown>>();

export function cachedFilters<T extends Record<string, unknown>>(key: string, defaults: T): T {
  const stored = filterCache.get(key);
  const initial = stored ? { ...defaults, ...(stored as Partial<T>) } : defaults;
  const state = reactive(initial) as T;
  watch(
    () => ({ ...state }),
    (value) => filterCache.set(key, { ...value }),
    { deep: true, immediate: true },
  );
  return state;
}

export function resetFilterCache(key?: string): void {
  if (key) filterCache.delete(key);
  else filterCache.clear();
}
