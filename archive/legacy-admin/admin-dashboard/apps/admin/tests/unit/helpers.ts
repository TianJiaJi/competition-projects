import type { StorageLike } from "../fixtures/storage";
import { BUSINESS_KEY, SESSION_KEY } from "../fixtures/storage";
import { createSession } from "../fixtures/session";
import { configureRuntime, resetSample } from "../../src/services/store";

export function createFakeStorage(): StorageLike & { dump(): Record<string, string>; failWrites: boolean } {
  const map = new Map<string, string>();
  const backend = {
    failWrites: false,
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      if (backend.failWrites) throw new Error("quota exceeded");
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
  return backend;
}

export interface TestContext {
  storage: ReturnType<typeof createFakeStorage>;
  rawStore(): string | null;
}

/** 每个测试用例使用独立存储与固定会话，不触碰真实 localStorage。 */
export function bootContext(): TestContext {
  const storage = createFakeStorage();
  const session = createSession("admin_demo", "值班员", "staff-demo", Date.now());
  configureRuntime({ storage, session });
  resetSample();
  return {
    storage,
    rawStore: () => storage.getItem(BUSINESS_KEY),
  };
}

export function expireSession(): void {
  configureRuntime({ session: null });
}

export { BUSINESS_KEY, SESSION_KEY };
