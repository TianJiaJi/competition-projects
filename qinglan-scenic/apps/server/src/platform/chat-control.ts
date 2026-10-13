import { assert, integer, textField, type Store } from "./store.ts";
import type {
  Account,
  ChatMessage,
} from "../../../../packages/contracts/src/platform.ts";
export const roomDefaults = [
  { id: "lobby", name: "山间茶叙" },
  { id: "routes", name: "同路山水" },
];
export async function chatRooms(store: Store, runId: string) {
  const global = await store.get<any>("chat-control", "global", runId);
  return Promise.all(
    roomDefaults.map(async (r) => ({
      ...r,
      ...(await store.get<any>("chat-control", r.id, runId)),
      closed: Boolean(
        global?.closed ||
        (await store.get<any>("chat-control", r.id, runId))?.closed,
      ),
    })),
  );
}
export async function assertRoomOpen(store: Store, runId: string, id: string) {
  assert(
    (await chatRooms(store, runId)).some((r) => r.id === id && !r.closed),
    "ROOM_CLOSED",
    "聊天室已关闭",
    403,
  );
}
export async function chatControlWrite(
  store: Store,
  user: Account,
  runId: string,
  path: string,
  input: any,
) {
  if (!path.startsWith("/admin/chat-control")) return undefined;
  assert(user.role === "admin", "FORBIDDEN", "需要管理员权限", 403);
  if (path === "/admin/chat-control/rooms") {
    assert(
      ["global", ...roomDefaults.map((r) => r.id)].includes(input.id),
      "VALIDATION_ERROR",
      "房间无效",
      400,
    );
    assert(
      typeof input.closed === "boolean",
      "VALIDATION_ERROR",
      "状态无效",
      400,
    );
    const old = await store.get<any>("chat-control", input.id, runId);
    assert(
      (old?.version || 0) === input.expectedVersion,
      "VERSION_CONFLICT",
      "房间状态已变化",
    );
    const value = {
      id: input.id,
      closed: input.closed,
      version: (old?.version || 0) + 1,
      reason: input.closed ? textField(input.reason) : "",
      actorId: user.id,
      updatedAt: new Date().toISOString(),
    };
    await store.put("chat-control", input.id, value, runId);
    return value;
  }
  assert(
    path === "/admin/chat-control/messages",
    "NOT_FOUND",
    "接口不存在",
    404,
  );
  assert(
    Array.isArray(input.items) &&
      input.items.length > 0 &&
      input.items.length <= 100,
    "VALIDATION_ERROR",
    "每次请选择1—100条消息",
    400,
  );
  assert(
    ["remove", "restore", "mute"].includes(input.action),
    "VALIDATION_ERROR",
    "操作无效",
    400,
  );
  const reason = textField(input.reason);
  const seen = new Set<string>();
  for (const item of input.items) {
    assert(!seen.has(item.id), "VALIDATION_ERROR", "消息重复", 400);
    seen.add(item.id);
    const msg = await store.get<ChatMessage>("messages", item.id, runId);
    assert(msg, "NOT_FOUND", "消息不存在", 404);
    assert(
      msg.version === item.version,
      "VERSION_CONFLICT",
      "消息已更新，请刷新",
    );
    if (input.action === "mute") {
      const minutes = integer(input.minutes, 1, 43200);
      await store.put(
        "mutes",
        msg.authorId,
        {
          until: Date.now() + minutes * 60000,
          minutes,
          setAt: Date.now(),
          reason,
        },
        runId,
      );
    } else {
      await store.put(
        "messages",
        msg.id,
        {
          ...msg,
          removed: input.action === "remove",
          version: msg.version + 1,
        },
        runId,
      );
    }
    const history = (await store.get<any>("chat-history", msg.id, runId)) || {
      items: [],
    };
    history.items.push({
      action: input.action,
      reason,
      actorId: user.id,
      at: new Date().toISOString(),
      messageVersion: msg.version,
    });
    await store.put("chat-history", msg.id, history, runId);
  }
  return { count: seen.size };
}
