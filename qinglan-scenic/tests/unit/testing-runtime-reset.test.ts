import { afterEach, expect, it, vi } from 'vitest';
import { newTaskStore, TASK_STORAGE_KEY } from '../../apps/testing/src/task-store';

afterEach(() => { vi.unstubAllGlobals(); });
it('服务重启清空后，页面离开及延迟自动保存不会写回旧任务', async () => {
  vi.resetModules();
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal('localStorage', storage);
  const runtime = await import('../../apps/testing/src/runtime-task');
  runtime.applyServiceSession('old');
  const task = newTaskStore();
  runtime.saveRuntimeTask(task);
  expect(storage.getItem(TASK_STORAGE_KEY)).not.toBeNull();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 'new' }) })));
  const reload = vi.fn(() => runtime.saveRuntimeTask(task)); // pagehide autosave
  vi.stubGlobal('location', { reload });
  await runtime.checkServiceRestart();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(storage.getItem(runtime.SESSION_KEY)).toBe('new');
  runtime.saveRuntimeTask(task); // a buffered save finishing before navigation
  expect(storage.getItem(TASK_STORAGE_KEY)).toBeNull();
});
