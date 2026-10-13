import { state, save, go } from "../model/store";
import { uid } from "../model/domain";
import { SseParser } from "../../../../packages/client/src/sse";
import type {
  QaRequest,
  QaEvent,
} from "../../../../packages/contracts/src/mobile-qa";
export type {
  Source,
  QaMessage,
  QaWorkbench,
} from "../../../../packages/contracts/src/mobile-qa";
import type { QaMessage } from "../../../../packages/contracts/src/mobile-qa";
export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
  }
}
let base = "/api/v1";
// #ifdef MP-WEIXIN
base =
  (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787") + "/api/v1";
// #endif
export function headers(key?: string) {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + state.aiSession,
    "X-Run-Id": state.aiRunId,
    "X-Requested-With": "scenic-demo",
    ...(key ? { "Idempotency-Key": key } : {}),
  };
}
export async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  data?: unknown,
  key?: string,
): Promise<T> {
  return new Promise((resolve, reject) =>
    uni.request({
      url: base + path,
      timeout: 15000,
      method,
      data: data as Record<string, unknown>,
      header: headers(method === "POST" ? key || uid() : key),
      success: (r) => {
        const value = r.data as {
          data: T;
          error?: { message: string; code: string };
        };
        if (r.statusCode === 401) {
          state.aiSession = "";
          state.aiRunId = "";
          state.conversationIds = [];
          save();
        }
        if (r.statusCode >= 400)
          reject(new ApiError(value.error?.message || "服务暂不可用。", r.statusCode, value.error?.code));
        else resolve(value.data);
      },
      fail: () => reject(new ApiError("暂时无法连接服务，请检查网络后重试。")),
    }),
  );
}
let sessionPending: Promise<void> | null = null;
export function ensureSession() {
  if (!sessionPending)
    sessionPending = establishSession().finally(() => {
      sessionPending = null;
    });
  return sessionPending;
}
async function establishSession() {
  if (state.aiSession && state.aiRunId) return;
  go('login/index');
  throw Error('请先登录游客账号');
}
export async function createConversation(poiId?: string) {
  await ensureSession();
  const value = await request<{ id: string }>(
    "/qa/conversations",
    "POST",
    poiId ? { poiId } : {},
    uid(),
  );
  state.conversationIds.push(value.id);
  save();
  return value.id;
}
export async function getHistory(id: string) {
  await ensureSession();
  return (
    await request<{ items: QaMessage[] }>(
      "/qa/conversations/" + id + "/messages",
    )
  ).items;
}
export async function getConversations() {
  await ensureSession();
  return (
    await request<{
      items: Array<{ id: string; poiId: string | null; createdAt: string }>;
    }>("/qa/conversations")
  ).items;
}
export function ask(
  id: string,
  payload: QaRequest,
  onEvent: <K extends keyof QaEvent>(event: K, data: QaEvent[K]) => void,
): { stop: () => void; done: Promise<void> } {
  const parser = new SseParser((event) => {
    onEvent(event.event as keyof QaEvent, JSON.parse(event.data));
  });
  const url = base + "/qa/conversations/" + id + "/messages";
  const key = uid();
  // #ifdef H5
  const controller = new AbortController();
  const done = (async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const value = await response.json();
      throw Error(value.error?.message || "问答请求失败。");
    }
    if (!response.body) throw Error("当前环境不支持流式响应。");
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parser.push(chunk.value);
      }
      parser.finish();
    } finally {
      reader.releaseLock();
    }
  })();
  return { stop: () => controller.abort(), done };
  // #endif
  // #ifdef MP-WEIXIN
  let task: UniApp.RequestTask;
  let received = false;
  const wxDone = new Promise<void>((resolve, reject) => {
    task = uni.request({
      url,
      method: "POST",
      data: payload,
      header: headers(key),
      enableChunked: true,
      responseType: "arraybuffer",
      success: (r) => {
        if (r.statusCode >= 400) {
          reject(Error("问答请求失败（" + r.statusCode + "），请稍后重试。"));
          return;
        }
        if (!received && r.data instanceof ArrayBuffer)
          parser.push(new Uint8Array(r.data));
        parser.finish();
        resolve();
      },
      fail: () => reject(Error("连接中断，回答可能未完成。")),
    });
    (
      task as unknown as {
        onChunkReceived: (
          callback: (chunk: { data: ArrayBuffer }) => void,
        ) => void;
      }
    ).onChunkReceived((r) => {
      received = true;
      try {
        parser.push(new Uint8Array(r.data));
      } catch {
        task.abort();
        reject(Error("无法读取流式回答。"));
      }
    });
  });
  return { stop: () => task.abort(), done: wxDone };
  // #endif
}
