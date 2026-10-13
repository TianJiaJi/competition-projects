import { globalSeed } from "../mock/global-seed";
import { applyInspectionGeneration } from "../mock/inspection-generation";
import { runSeed } from "../mock/run-seed";
import { BUSINESS_ISO, DEFAULT_RUN_ID } from "../core/time";
import { sessionExpiredMessage } from "../core/session";
import { readSession } from "../core/session";
import type { StaffSession } from "../core/types";
import type { StorageLike } from "../core/storage";
import { readStore, resolveSessionStorage, resolveStorage, writeStore, SESSION_KEY, STORE_VERSION } from "../core/storage";
import { fail, ok, type ApiResult } from "../core/result";
import type { BusinessStore, RunData } from "../core/types";

export type RuntimeStatus = "ready" | "readonly" | "corrupt" | "conflict";

export interface RuntimeInfo {
  status: RuntimeStatus;
  persistent: boolean;
  message?: string;
  runId: string;
}

let storageOverride: StorageLike | null | undefined;
let sessionStorageOverride: StorageLike | null | undefined;
let session: StaffSession | null = null;
let runtime: { store: BusinessStore; info: RuntimeInfo } | null = null;
let sessionPersistWarning: string | null = null;
// 独立保存持久化基线，页面读取到的对象不会充当跨标签比较依据。
let persistedSnapshot: string | null = null;
const runtimeListeners = new Set<(info: RuntimeInfo) => void>();

export function subscribeRuntime(listener: (info: RuntimeInfo) => void): () => void {
  runtimeListeners.add(listener);
  return () => { runtimeListeners.delete(listener); };
}

function notifyRuntime(): void {
  if (runtime) for (const listener of runtimeListeners) listener(runtime.info);
}

/** 存储事件用于及时提示；每次写入前也检查，避免依赖事件投递顺序。 */
export function checkStorageChanges(): RuntimeInfo {
  const info = bootstrap();
  if (info.status !== "ready") return info;
  const latest = readStore(storageBackend());
  if (latest.status === "unavailable") {
    // 临时读取失败仍可重试，但这次不能保存。
    return { ...info, status: "readonly", message: latest.message };
  }
  if (latest.status !== "ok" || JSON.stringify(latest.store) !== persistedSnapshot) {
    runtime!.info = {
      ...info,
      status: "conflict",
      message: "其他标签已更改后台数据，请重新加载后继续保存；当前未保存草稿仍保留，请先复制需要的内容。",
    };
    notifyRuntime();
  }
  return runtime!.info;
}

export function configureRuntime(options: { storage?: StorageLike | null; session?: StaffSession | null } = {}): void {
  if ("storage" in options) {
    storageOverride = options.storage;
    sessionStorageOverride = options.storage;
  }
  if ("session" in options) session = options.session ?? null;
  runtime = null;
  persistedSnapshot = null;
}

export function storageBackend(): StorageLike | null {
  return storageOverride === undefined ? resolveStorage() : storageOverride;
}

/** 会话单独使用 sessionStorage 命名空间。 */
export function sessionStoreBackend(): StorageLike | null {
  return sessionStorageOverride === undefined ? resolveSessionStorage() : sessionStorageOverride;
}

export function sessionWarning(): string | null {
  return sessionPersistWarning;
}

export function noteSessionPersistWarning(message: string | null): void {
  sessionPersistWarning = message;
}

export function currentSession(): StaffSession | null {
  if (session && session.expiresAt <= Date.now()) {
    session = null;
    clearSessionOnly();
  }
  return session;
}

/** 页面加载时把持久化会话读入内存；过期会话直接丢弃。 */
export function bootstrapSession(): StaffSession | null {
  if (session) return session;
  const stored = readSession(sessionStoreBackend());
  if (stored) session = stored;
  return session;
}

export function setSession(next: StaffSession | null): void {
  session = next;
}

export function sessionStorageKey(): string {
  return SESSION_KEY;
}

function clearSessionOnly(): void {
  const backend = sessionStoreBackend();
  if (!backend) return;
  try {
    backend.removeItem(SESSION_KEY);
  } catch {
    /* 忽略 */
  }
}

export function createSeedStore(): BusinessStore {
  return {
    version: STORE_VERSION,
    revision: 1,
    activeRunId: DEFAULT_RUN_ID,
    global: globalSeed(),
    runs: { [DEFAULT_RUN_ID]: runSeed(DEFAULT_RUN_ID) },
  };
}

export function bootstrap(): RuntimeInfo {
  if (runtime) return runtime.info;
  const load = readStore(storageBackend());
  if (load.status === "ok") {
    persistedSnapshot = JSON.stringify(load.store);
    runtime = {
      store: load.store,
      info: { status: "ready", persistent: true, runId: load.store.activeRunId },
    };
    persistGenerated();
    return runtime.info;
  }
  if (load.status === "empty") {
    const store = createSeedStore();
    const saved = writeStore(store, storageBackend());
    persistedSnapshot = saved.ok ? JSON.stringify(store) : null;
    runtime = {
      store,
      info: {
        status: saved.ok ? "ready" : "readonly",
        persistent: saved.ok,
        message: saved.ok ? undefined : "首次初始化无法写入本地存储，本次只能只读查看初始样例。",
        runId: store.activeRunId,
      },
    };
    persistGenerated();
    return runtime.info;
  }
  const store = createSeedStore();
  runtime = {
    store,
    info:
      load.status === "corrupt"
        ? { status: "corrupt", persistent: false, message: load.message, runId: store.activeRunId }
        : { status: "readonly", persistent: false, message: load.message, runId: store.activeRunId },
  };
  return runtime.info;
}

function persistGenerated(): void {
  if (!runtime || checkStorageChanges().status !== "ready") return;
  const draft = structuredClone(runtime.store);
  const outcome = applyInspectionGeneration(draft, draft.activeRunId);
  if (!outcome.created) return;
  const saved = writeStore(draft, storageBackend());
  if (saved.ok) {
    runtime.store = draft;
    persistedSnapshot = JSON.stringify(draft);
  } else if (runtime.info.status === "ready") {
    runtime.info = { ...runtime.info, status: "readonly", persistent: false, message: saved.message };
  }
}

export function runtimeInfo(): RuntimeInfo {
  return bootstrap();
}

export function getStore(): BusinessStore {
  bootstrap();
  return runtime!.store;
}

export function getRun(): RunData {
  const store = getStore();
  const run = store.runs[store.activeRunId];
  if (!run) throw new Error(`运行样例 ${store.activeRunId} 不存在`);
  return run;
}

export function requireStaff(): ApiResult<StaffSession> {
  const active = currentSession();
  if (!active) return fail("AUTH_REQUIRED", "需要以员工身份登录后才能访问。");
  return ok(active);
}

export function refreshBusinessTime(): string {
  return BUSINESS_ISO;
}

/**
 * 校验最新存储 → 在草稿上应用全部变更 → 一次持久化 → 更新内存。
 * 任何一步失败都保持原数据不变。
 */
export function mutate<T>(
  label: string,
  apply: (draft: BusinessStore) => ApiResult<T>,
  actionId?: string,
): ApiResult<T> {
  const info = checkStorageChanges();
  if (info.status === "conflict") {
    return fail("MOCK_STORAGE_CONFLICT", info.message!);
  }
  if (info.status === "corrupt") {
    return fail("MOCK_STORAGE_FAILED", "本地数据损坏或版本不兼容，请先使用“恢复样例”再修改。");
  }
  if (info.status === "readonly") {
    return fail("MOCK_STORAGE_FAILED", info.message ?? "本地存储不可用，本次不能保存。");
  }
  const draft = structuredClone(runtime!.store);
  const run = draft.runs[draft.activeRunId];
  if (actionId && run) {
    const cached = run.actionLog[actionId];
    if (cached && cached.result === "ok") return ok(cached.data as T);
  }
  let result: ApiResult<T>;
  try {
    result = apply(draft);
  } catch (error) {
    return fail("MOCK_STORAGE_FAILED", `保存失败：${(error as Error).message}`);
  }
  if (!result.ok) {
    if (actionId && run) run.actionLog[actionId] = { at: Date.now(), result: "failed", label };
    return result;
  }
  if (!run) return fail("RUN_EXPIRED", `运行样例 ${draft.activeRunId} 已不可用。`);
  draft.revision += 1;
  run.revision += 1;
  if (actionId) run.actionLog[actionId] = { at: Date.now(), result: "ok", label, data: result.data };
  const saved = writeStore(draft, storageBackend());
  if (!saved.ok) return fail("MOCK_STORAGE_FAILED", saved.message);
  runtime!.store = draft;
  persistedSnapshot = JSON.stringify(draft);
  return result;
}

/** 恢复样例：新样例写入成功后才替换内存，失败保留旧存储和会话。 */
export function resetSample(): ApiResult<{ revision: number }> {
  if (runtime?.info.status === "ready" || runtime?.info.status === "conflict") {
    const info = checkStorageChanges();
    if (info.status !== "ready") {
      return fail(info.status === "conflict" ? "MOCK_STORAGE_CONFLICT" : "MOCK_STORAGE_FAILED", info.message!);
    }
  }
  const store = createSeedStore();
  applyInspectionGeneration(store, store.activeRunId);
  const saved = writeStore(store, storageBackend());
  if (!saved.ok) return fail("MOCK_STORAGE_FAILED", saved.message);
  persistedSnapshot = JSON.stringify(store);
  runtime = { store, info: { status: "ready", persistent: true, runId: store.activeRunId } };
  notifyRuntime();
  return ok({ revision: store.revision });
}

export function authExpiredMessage(): string {
  return sessionExpiredMessage();
}
