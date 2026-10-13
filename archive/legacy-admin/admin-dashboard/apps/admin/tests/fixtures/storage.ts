import { upgradeStoredCopy } from "../../src/core/copy-upgrade";
import type { BusinessStore } from "../../src/core/types";
import { isValidBusinessStore } from "../../src/core/store-validation";

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
    // 已满的存储仍应可读；是否能写由实际保存结果决定。
    backend.getItem(probeKey);
    return backend;
  } catch {
    return null;
  }
}

export function readStore(backend: StorageLike | null = resolveStorage()): StoreLoad {
  if (!backend) return { status: "unavailable", message: "浏览器本地存储不可用，本次只能只读查看。" };
  let raw: string | null = null;
  try {
    raw = backend.getItem(BUSINESS_KEY);
  } catch {
    return { status: "unavailable", message: "浏览器本地存储不可用，本次只能只读查看。" };
  }
  if (!raw) return { status: "empty" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidBusinessStore(parsed, STORE_VERSION)) {
      return { status: "corrupt", message: "本地后台数据版本不兼容或结构损坏，请使用“重置数据”。" };
    }
    return { status: "ok", store: upgradeStoredCopy(parsed) };
  } catch {
    return { status: "corrupt", message: "本地后台数据无法解析，请使用“重置数据”。" };
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
