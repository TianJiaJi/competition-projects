import type { BusinessStore } from "./types";

export const BUSINESS_KEY = "qinglan.admin.mock.v1";
export const SESSION_KEY = "qinglan.admin.mock.session.v1";
export const STORE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StoreLoad =
  | { status: "empty" }
  | { status: "ok"; store: BusinessStore }
  | { status: "corrupt"; message: string }
  | { status: "unavailable"; message: string };

export type StoreSave = { ok: true } | { ok: false; code: "MOCK_STORAGE_FAILED"; message: string };

export function resolveStorage(): StorageLike | null {
  return resolveBackend(() => localStorage, BUSINESS_KEY);
}

/** 会话使用 sessionStorage 命名空间：关闭标签后需重新登录。 */
export function resolveSessionStorage(): StorageLike | null {
  return resolveBackend(() => sessionStorage, SESSION_KEY);
}

function resolveBackend(pick: () => Storage, probeKey: string): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const backend = pick();
    const probe = `${probeKey}.probe`;
    backend.setItem(probe, "1");
    backend.removeItem(probe);
    return backend;
  } catch {
    return null;
  }
}

function isValidStore(value: unknown): value is BusinessStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<BusinessStore>;
  if (store.version !== STORE_VERSION) return false;
  if (typeof store.revision !== "number") return false;
  if (typeof store.activeRunId !== "string") return false;
  if (!store.global || typeof store.global !== "object") return false;
  if (!store.runs || typeof store.runs !== "object") return false;
  const global = store.global as BusinessStore["global"];
  return Array.isArray(global.articles) && Array.isArray(global.users) && typeof global.scenic === "object";
}

export function readStore(backend: StorageLike | null = resolveStorage()): StoreLoad {
  if (!backend) return { status: "unavailable", message: "浏览器本地存储不可用，本次只能查看初始样例。" };
  let raw: string | null = null;
  try {
    raw = backend.getItem(BUSINESS_KEY);
  } catch {
    return { status: "unavailable", message: "浏览器本地存储不可用，本次只能查看初始样例。" };
  }
  if (!raw) return { status: "empty" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStore(parsed)) {
      return { status: "corrupt", message: "本地后台数据版本不兼容或结构损坏，请使用“恢复样例”。" };
    }
    return { status: "ok", store: parsed };
  } catch {
    return { status: "corrupt", message: "本地后台数据无法解析，请使用“恢复样例”。" };
  }
}

export function writeStore(store: BusinessStore, backend: StorageLike | null = resolveStorage()): StoreSave {
  if (!backend) return { ok: false, code: "MOCK_STORAGE_FAILED", message: "本地存储不可用，保存失败。" };
  try {
    backend.setItem(BUSINESS_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, code: "MOCK_STORAGE_FAILED", message: "本地保存失败（容量不足或写入被拒绝），数据未变更。" };
  }
}

/** 只清理后台自己的键，绝不调用 localStorage.clear()。 */
export function clearAdminKeys(backend: StorageLike | null = resolveStorage(), includeSession = false): void {
  if (!backend) return;
  try {
    backend.removeItem(BUSINESS_KEY);
    if (includeSession) backend.removeItem(SESSION_KEY);
  } catch {
    /* 存储不可用时无需处理 */
  }
}
