import type { Collection, SceneState } from "../../../domain/src/types";
import type {
  LinkedRecord,
  PreviewContext,
  Records,
  Stage,
  Terminal,
} from "./types";
export const API = "http://localhost:5507";
export const WORKBENCH = "http://localhost:5506";
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API + path, {
      method,
      signal: controller.signal,
      headers: {
        ...(body
          ? {
              "Content-Type": "application/json",
              "X-Request-Id": crypto.randomUUID(),
            }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(result.error || "服务请求失败"), {
        status: response.status,
        code: result.code,
      });
    return result;
  } catch (error) {
    if (error instanceof TypeError || (error as Error).name === "AbortError")
      throw new Error("本机服务不可用或请求超时，请检查 5507 服务后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function parsePreview(search: string, terminal: Terminal) {
  const query = new URLSearchParams(search);
  const enabled = query.get("demo") === "1";
  if (!enabled) return { enabled: false };
  const run = query.get("run") || "",
    stage = query.get("stage") as Stage,
    caseId = query.get("caseId") || "",
    version = query.get("version") || "";
  if (
    !["01", "02", "03"].includes(stage) ||
    !/^[\w-]{1,100}$/.test(run) ||
    !caseId ||
    !version ||
    (stage === "01" && terminal !== "public")
  )
    return { enabled: true, error: "成果参数无效，请从工作台打开最新成果" };
  return {
    enabled: true,
    context: { run, stage, caseId, version, terminal } as PreviewContext,
  };
}
export function previewUrl(context: PreviewContext, port: number) {
  return `http://localhost:${port}/?${new URLSearchParams({ demo: "1", ...context })}`;
}
export function acceptsMessage(
  event: MessageEvent,
  source: Window | null,
  origin: string,
  context: PreviewContext,
) {
  const data = event.data;
  return (
    !!data &&
    event.source === source &&
    event.origin === origin &&
    data.protocol === "assembly-v2" &&
    ["run", "stage", "caseId", "version", "terminal"].every(
      (k) => data[k] === context[k as keyof PreviewContext],
    )
  );
}
export interface PreviewStatus {
  ready: boolean;
  error: string;
  fatal: boolean;
  updatedAt: string;
}
export function createPreviewClient(
  context: PreviewContext,
  state: SceneState,
  status: PreviewStatus,
  visible: () => boolean = () => true,
) {
  const root = `/api/runs/${context.run}`;
  const key = `assembly.identity.${context.run}.${context.terminal}`;
  let session:
    | { token: string; identity: string; username: string }
    | undefined;
  try {
    session = JSON.parse(sessionStorage.getItem(key) || "null") || undefined;
  } catch {}
  if (session) state.identity = session.identity;
  let mutationSerial = 0;
  let disposed = false,
    inflight = false,
    interval: ReturnType<typeof setInterval> | undefined;
  let requestId = "",
    ack = "ready";
  const pageId = crypto.randomUUID();
  const announce = () => {
    if (
      status.ready &&
      !status.fatal &&
      !status.error &&
      visible() &&
      window.opener
    )
      window.opener.postMessage(
        { protocol: "assembly-v2", ...context, type: ack, requestId, pageId },
        WORKBENCH,
      );
  };
  const merge = (records: Records) => {
    for (const collection of Object.keys(records) as Collection[]) {
      const previous = new Map(
        state.records[collection].map((item) => [item.id, item]),
      );
      state.records[collection] = records[collection].map((item) => {
        const old = previous.get(item.id);
        if (old) {
          for (const k of Object.keys(old))
            if (!(k in item))
              delete (old as unknown as Record<string, unknown>)[k];
          return Object.assign(old, item);
        }
        return item;
      });
    }
  };
  async function refresh() {
    if (disposed || inflight || status.fatal) return;
    inflight = true;
    const serial = mutationSerial;
    try {
      const result = await request<{ stage: Stage }>(
        `${root}/context?${new URLSearchParams({ ...context })}`,
      );
      if (result.stage !== context.stage)
        throw new Error("成果阶段不匹配，请返回工作台重开");
      if (context.stage === "03") {
        const data = await request<{ records: Records; updatedAt: string }>(
          root + "/records",
        );
        if (serial === mutationSerial) {
          merge(data.records);
          status.updatedAt = data.updatedAt;
        }
      }
      status.ready = true;
      status.error = "";
      announce();
    } catch (error) {
      status.error = (error as Error).message;
      if (
        [400, 409, 410].includes((error as { status?: number }).status || 0) &&
        (error as { code?: string }).code !== "ARTIFACT_UNAVAILABLE"
      ) {
        status.fatal = true;
        if ((error as { status?: number }).status === 410) {
          sessionStorage.removeItem(key);
          state.identity = null;
        }
      }
    } finally {
      inflight = false;
    }
  }
  async function login(username: string, password: string) {
    if (status.fatal) throw new Error(status.error);
    session = await request(root + "/session", "POST", {
      username,
      password,
      terminal: context.terminal,
    });
    sessionStorage.setItem(key, JSON.stringify(session));
    state.identity = session!.identity;
    announce();
  }
  async function logout() {
    await request(root + "/session", "DELETE", undefined, session?.token);
    session = undefined;
    sessionStorage.removeItem(key);
    state.identity = null;
  }
  async function write(
    collection: Collection,
    id: string | undefined,
    action: string,
    input: Partial<LinkedRecord> = {},
  ) {
    if (status.fatal || !status.ready)
      throw new Error(status.error || "页面尚未就绪");
    if (context.stage === "03") {
      mutationSerial++;
      const path = `${root}/records/${collection}${id ? "/" + encodeURIComponent(id) : ""}${action === "save" ? "" : "/" + action}`;
      const data = await request<{
        records: Records;
        item: LinkedRecord;
        updatedAt: string;
      }>(path, id && action === "save" ? "PUT" : "POST", input, session?.token);
      merge(data.records);
      status.updatedAt = data.updatedAt;
      status.error = "";
      return data.item;
    }
    if (!session) throw new Error("请先登录");
    const items = state.records[collection] as LinkedRecord[];
    let item = items.find((item) => item.id === id);
    if (action === "save") {
      if (item) Object.assign(item, input);
      else {
        item = {
          ...input,
          id: `${collection}-${crypto.randomUUID()}`,
        } as LinkedRecord;
        items.unshift(item);
      }
      if (context.terminal === "mobile")
        Object.assign(item, {
          submitterId: session.username,
          owner: session.identity,
        });
    } else {
      if (!item) throw new Error("记录不存在");
      if (action === "claim") {
        if (item.status !== "待处理") throw new Error("任务已被领取");
        item.status = "处理中";
        item.assigneeId = session.username;
      }
      if (action === "complete") {
        if (item.status !== "处理中") throw new Error("请先领取任务");
        if (!input.result?.trim()) throw new Error("请填写处理结果");
        item.result = input.result.trim();
        item.status = "已完成";
      }
      if (action === "cancel") {
        if (item.submitterId !== session.username)
          throw new Error("只能取消自己的预约");
        if (item.status !== "已预约") throw new Error("预约已取消");
        item.status = "已取消";
      }
    }
    return item;
  }
  const listener = (event: MessageEvent) => {
    if (!acceptsMessage(event, window.opener, WORKBENCH, context)) return;
    requestId = event.data.requestId;
    if (event.data.type === "probe") announce();
    if (event.data.type === "reset") {
      // Reset only the view; business state is managed by the service and survives reload.
      if (event.data.clearIdentity) {
        sessionStorage.removeItem(key);
        state.identity = null;
      }
      sessionStorage.setItem(
        `assembly.reset.${context.run}.${context.terminal}`,
        requestId,
      );
      location.reload();
    }
  };
  const ackKey = `assembly.reset.${context.run}.${context.terminal}`;
  if (sessionStorage.getItem(ackKey)) {
    requestId = sessionStorage.getItem(ackKey)!;
    ack = "reset-done";
    sessionStorage.removeItem(ackKey);
  }
  window.addEventListener("message", listener);
  async function start() {
    if (session) {
      try {
        await request(root + "/session", "GET", undefined, session.token);
      } catch (error) {
        if ((error as { status?: number }).status === 401) {
          session = undefined;
          state.identity = null;
          sessionStorage.removeItem(key);
        }
      }
    }
    await refresh();
    if (!disposed) interval = setInterval(refresh, 2000);
  }
  void start();
  return {
    refresh,
    login,
    logout,
    write,
    announce,
    dispose: () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("message", listener);
    },
  };
}
export function previewKey(context: PreviewContext) {
  return `${context.run}-${context.stage}-${context.terminal}`;
}
export class PreviewWindows {
  slots = new Map<
    string,
    {
      window: Window;
      context: PreviewContext;
      requestId: string;
      url: string;
      timer?: ReturnType<typeof setTimeout>;
      status: string;
    }
  >();
  private monitor: ReturnType<typeof setInterval>;
  private listener = (event: MessageEvent) => {
    for (const [id, slot] of this.slots) {
      if (
        !acceptsMessage(
          event,
          slot.window,
          new URL(slot.url).origin,
          slot.context,
        ) ||
        event.data.requestId !== slot.requestId ||
        !["ready", "reset-done"].includes(event.data.type)
      )
        continue;
      clearTimeout(slot.timer);
      slot.status = "ready";
      this.notify(id, "目标页面已就绪");
    }
  };
  constructor(
    private notify: (id: string, text: string) => void,
    private timeout = 20000,
  ) {
    window.addEventListener("message", this.listener);
    this.monitor = setInterval(() => {
      for (const [id, slot] of this.slots) {
        if (slot.window.closed && slot.status !== "closed") {
          clearTimeout(slot.timer);
          slot.status = "closed";
          this.notify(id, "窗口已关闭，可重新打开");
        } else if (slot.status === "waiting")
          slot.window.postMessage(
            {
              protocol: "assembly-v2",
              ...slot.context,
              type: "probe",
              requestId: slot.requestId,
            },
            new URL(slot.url).origin,
          );
      }
    }, 500);
  }
  open(context: PreviewContext, port: number) {
    const id = previewKey(context);
    const previous = this.slots.get(id);
    const key = `assembly.window.${id}`;
    const serialized = JSON.stringify(context);
    let remembered = false;
    try {
      remembered = sessionStorage.getItem(key) === serialized;
    } catch {}
    const same =
      previous &&
      !previous.window.closed &&
      JSON.stringify(previous.context) === serialized;
    const target = same
      ? previous.window
      : window.open(
          remembered ? "" : previewUrl(context, port),
          `assembly-${id}`,
          "popup=yes,width=1366,height=850",
        );
    if (!target) {
      this.notify(id, "弹出窗口被阻止，请允许后重试，或复制成果链接");
      return;
    }
    // Recover a named window after refreshing the workbench without navigating it.
    // A closed named window is recreated as about:blank and needs its first URL.
    if (remembered && !same) {
      try {
        if (target.location.href === "about:blank")
          target.location.href = previewUrl(context, port);
      } catch {
        // Cross-origin access is expected for an already-open result window.
      }
    }
    try {
      sessionStorage.setItem(key, serialized);
    } catch {}
    if (previous) clearTimeout(previous.timer);
    const slot = {
      window: target,
      context,
      requestId: crypto.randomUUID(),
      status: "waiting",
      url: previewUrl(context, port),
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    this.slots.set(id, slot);
    this.notify(id, "等待页面就绪；需要身份的页面请先登录");
    slot.timer = setTimeout(() => {
      slot.status = "timeout";
      this.notify(id, "等待超时，请检查页面并点击重试");
    }, this.timeout);
    target.focus();
    target.postMessage(
      {
        protocol: "assembly-v2",
        ...context,
        type: "probe",
        requestId: slot.requestId,
      },
      new URL(slot.url).origin,
    );
  }
  dispose() {
    clearInterval(this.monitor);
    for (const slot of this.slots.values()) clearTimeout(slot.timer);
    window.removeEventListener("message", this.listener);
  }
}
