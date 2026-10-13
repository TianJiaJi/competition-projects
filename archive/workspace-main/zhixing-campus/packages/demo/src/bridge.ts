import { CASE_ID, VERSION, type DemoStage } from "./data";
export const WORKBENCH_ORIGIN = "http://localhost:5506";
export const protocol = "campus-demo-v1";
export const stagePort = (stage: DemoStage) =>
  stage === "campus-map" ? 5500 : 5503;
export interface Context {
  run: string;
  stage: DemoStage;
}
export interface Message extends Context {
  protocol: typeof protocol;
  type: "ready" | "probe" | "reset" | "reset-done";
  caseId: string;
  version: string;
  requestId: string;
  next?: Context;
  clearIdentity?: boolean;
  pageId?: string;
}
export function message(
  type: Message["type"],
  context: Context,
  requestId: string,
): Message {
  return {
    protocol,
    type,
    caseId: CASE_ID,
    version: VERSION,
    ...context,
    requestId,
  };
}
export function matches(value: unknown, context: Context): value is Message {
  if (!value || typeof value !== "object") return false;
  const v = value as Message;
  return (
    v.protocol === protocol &&
    v.caseId === CASE_ID &&
    v.version === VERSION &&
    v.run === context.run &&
    v.stage === context.stage &&
    typeof v.requestId === "string" &&
    ["ready", "probe", "reset", "reset-done"].includes(v.type)
  );
}
export function parseDemo(
  search: string,
  terminal: string,
): { enabled: boolean; context?: Context; error?: string; requestId: string } {
  const q = new URLSearchParams(search);
  if (q.get("demo") !== "1") return { enabled: false, requestId: "" };
  const stage = q.get("stage");
  const run = q.get("run");
  const valid =
    terminal === "public"
      ? stage === "campus-map"
      : terminal === "staff" &&
        (stage === "template" || stage === "campus-ready");
  if (!valid || !run || !/^[a-zA-Z0-9_-]{1,100}$/.test(run))
    return {
      enabled: true,
      error: "演示参数无效：请从 5506 工作台打开正确阶段。",
      requestId: "",
    };
  return {
    enabled: true,
    context: { run, stage: stage as DemoStage },
    requestId: q.get("request") ?? "",
  };
}
export function stageUrl(context: Context, requestId: string) {
  const q = new URLSearchParams({
    demo: "1",
    stage: context.stage,
    run: context.run,
    request: requestId,
  });
  return `http://localhost:${stagePort(context.stage)}/?${q}`;
}
export function identityKey(run: string) {
  return `campus-demo.identity.${run}`;
}
export type BridgeStatus =
  | "waiting"
  | "ready"
  | "error"
  | "closed"
  | "reloaded";
interface Slot {
  window: Window;
  context: Context;
  requestId: string;
  timer?: ReturnType<typeof setTimeout>;
  status: BridgeStatus;
  pageId?: string;
}
export class ResultBridge {
  slots = new Map<number, Slot>();
  private listener = (event: MessageEvent) => {
    for (const [port, slot] of this.slots) {
      if (
        event.origin !== `http://localhost:${port}` ||
        event.source !== slot.window ||
        !matches(event.data, slot.context) ||
        event.data.requestId !== slot.requestId ||
        !["ready", "reset-done"].includes(event.data.type)
      )
        continue;
      if (slot.pageId && event.data.pageId && slot.pageId !== event.data.pageId)
        this.notify(
          slot.context,
          "reloaded",
          "成果页已重新加载，需重新登记页面操作证据",
        );
      slot.pageId = event.data.pageId;
      clearTimeout(slot.timer);
      slot.status = "ready";
      this.notify(slot.context, "ready", "目标页面已就绪");
    }
  };
  private monitor: ReturnType<typeof setInterval>;
  constructor(
    private notify: (
      context: Context,
      status: BridgeStatus,
      detail: string,
    ) => void,
    private timeout = 20000,
  ) {
    window.addEventListener("message", this.listener);
    this.monitor = setInterval(() => {
      for (const slot of this.slots.values())
        if (slot.window.closed && slot.status !== "closed") {
          clearTimeout(slot.timer);
          slot.status = "closed";
          this.notify(
            slot.context,
            "closed",
            "成果页已关闭；重开会恢复 URL 对应的初始业务状态",
          );
        }
    }, 1000);
  }
  open(context: Context, reload = false) {
    const port = stagePort(context.stage);
    const old = this.slots.get(port);
    if (
      old &&
      !old.window.closed &&
      !reload &&
      old.context.run === context.run &&
      old.context.stage === context.stage
    ) {
      old.window.focus();
      this.arm(old);
      old.window.postMessage(
        message("probe", context, old.requestId),
        `http://localhost:${port}`,
      );
      return;
    }
    const requestId = crypto.randomUUID();
    const target = window.open(
      stageUrl(context, requestId),
      port === 5500 ? "campus-demo-map" : "campus-demo-staff",
    );
    if (!target) {
      this.notify(
        context,
        "error",
        "浏览器阻止了成果标签页，请允许弹出窗口后重试",
      );
      return;
    }
    if (old) clearTimeout(old.timer);
    const slot: Slot = {
      window: target,
      context,
      requestId,
      status: "waiting",
    };
    this.slots.set(port, slot);
    this.arm(slot);
    target.focus();
  }
  private arm(slot: Slot) {
    clearTimeout(slot.timer);
    slot.status = "waiting";
    this.notify(slot.context, "waiting", "等待成果页；如显示登录页，请先登录");
    slot.timer = setTimeout(() => {
      slot.status = "error";
      this.notify(
        slot.context,
        "error",
        "等待成果页超时；可查看已有页面或重新加载",
      );
    }, this.timeout);
  }
  reset(context: Context, clearIdentity = false) {
    const port = stagePort(context.stage);
    const slot = this.slots.get(port);
    if (!slot || slot.window.closed) return false;
    const previous = { ...slot.context };
    slot.context = context;
    slot.requestId = crypto.randomUUID();
    this.arm(slot);
    slot.window.postMessage(
      {
        ...message("reset", previous, slot.requestId),
        next: context,
        clearIdentity,
      },
      `http://localhost:${port}`,
    );
    return true;
  }
  cancel() {
    for (const slot of this.slots.values()) clearTimeout(slot.timer);
  }
  dispose() {
    this.cancel();
    clearInterval(this.monitor);
    window.removeEventListener("message", this.listener);
  }
}
