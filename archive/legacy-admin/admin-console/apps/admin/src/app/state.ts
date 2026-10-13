import { ref, computed, type ComputedRef, type Ref } from "vue";

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  details?: string[];
  confirmText: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

export const session = ref<import("../core/types").StaffSession | null>(null);
export const runtimeMessage = ref<string | undefined>(undefined);
export const toasts = ref<ToastItem[]>([]);
export const confirmRequest = ref<ConfirmRequest | null>(null);

function initialPath(): string {
  if (typeof window === "undefined") return "/overview";
  return currentHashPath();
}

/** 唯一的路由状态源：锚点点击、浏览器前进后退与程序导航都写入这里。 */
export const routePath = ref(initialPath());

let skipGuardOnce = false;

if (typeof window !== "undefined") {
  /**
   * 未保存保护在“发布新路由之前”同步判定：先回退地址再询问，
   * 避免页面先被卸载、未保存修改无声丢失。
   */
  window.addEventListener("hashchange", () => {
    const next = currentHashPath();
    if (skipGuardOnce) {
      skipGuardOnce = false;
      routePath.value = next;
      return;
    }
    const summary = unsavedSummary();
    if (summary) {
      const revert = routePath.value;
      window.history.replaceState(null, "", `#${revert}`);
      void askConfirm({
        title: "有未保存的修改",
        message: `${summary} 离开当前页面将放弃这些修改。`,
        details: [`即将前往：${next}`],
        confirmText: "放弃修改并离开",
        danger: true,
      }).then((confirmed) => {
        if (!confirmed) return;
        skipGuardOnce = true;
        window.location.hash = `#${next}`;
      });
      return;
    }
    routePath.value = next;
  });
}

let toastSeq = 1;
let unsavedGuards: Array<() => string | null> = [];
let navigationLock = false;

export function currentHashPath(): string {
  const raw = window.location.hash.replace(/^#/, "");
  return raw || "/overview";
}

export function pushToast(kind: ToastItem["kind"], text: string): void {
  const id = toastSeq++;
  toasts.value = [...toasts.value, { id, kind, text }];
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== id);
  }, kind === "error" ? 6000 : 3200);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((item) => item.id !== id);
}

export function registerUnsavedGuard(guard: () => string | null): () => void {
  unsavedGuards.push(guard);
  return () => {
    unsavedGuards = unsavedGuards.filter((item) => item !== guard);
  };
}

export function unsavedSummary(): string | null {
  for (const guard of unsavedGuards) {
    const message = guard();
    if (message) return message;
  }
  return null;
}

export function askConfirm(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest.value = { ...options, resolve };
  });
}

export function resolveConfirm(value: boolean): void {
  const request = confirmRequest.value;
  confirmRequest.value = null;
  request?.resolve(value);
}

/** 路由跳转前的统一守卫：未保存修改需要确认放弃。 */
export async function guardNavigation(intent: string): Promise<boolean> {
  if (navigationLock) return false;
  const message = unsavedSummary();
  if (!message) return true;
  navigationLock = true;
  const confirmed = await askConfirm({
    title: "有未保存的修改",
    message: `${message} 离开当前页面将放弃这些修改。`,
    details: [`即将前往：${intent}`],
    confirmText: "放弃修改并离开",
    danger: true,
  });
  navigationLock = false;
  return confirmed;
}

export function isNavigationLocked(): boolean {
  return navigationLock;
}
export function useQuery(): ComputedRef<Record<string, string>> {
  return computed(() => {
    const params = new URLSearchParams(routePath.value.includes("?") ? routePath.value.split("?")[1] : "");
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) result[key] = value;
    return result;
  });
}

export function hashPathOnly(hash: string): string {
  const raw = hash.replace(/^#/, "");
  return raw.split("?")[0] || "/overview";
}

/** 程序导航；会同步路由状态，因此 replaceState 也不会丢页。 */
export function setHash(to: string, replace = false): void {
  const target = to.startsWith("#") ? to : `#${to}`;
  if (typeof window === "undefined") {
    routePath.value = currentHashPath();
    return;
  }
  if (window.location.hash === target) {
    routePath.value = currentHashPath();
    return;
  }
  if (replace) window.history.replaceState(null, "", target);
  else window.location.hash = target;
  routePath.value = currentHashPath();
}

export const activeSession = computed(() => session.value);
export const isLoggedIn: Ref<boolean> = computed(() => Boolean(session.value)) as unknown as Ref<boolean>;
