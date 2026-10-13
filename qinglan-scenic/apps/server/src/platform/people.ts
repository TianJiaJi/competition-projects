import { randomUUID, randomBytes } from "node:crypto";
import { assert, textField, passwordHash, type Store } from "./store.ts";
import type { Account } from "../../../../packages/contracts/src/platform.ts";
export interface StaffTrade {
  id: string;
  name: string;
  archived?: boolean;
  version: number;
}
export interface AccountMeta {
  version: number;
  createdAt: string;
  archived?: boolean;
  mustChangePassword?: boolean;
  tradeIds: string[];
  regionIds: string[];
}
export const defaultTrades: StaffTrade[] = [
  "保安",
  "维修",
  "保洁",
  "客服",
  "巡检",
].map((name, i) => ({
  id: ["security", "repair", "cleaning", "service", "inspection"][i],
  name,
  version: 1,
}));
export async function trades(store: Store) {
  const saved = await store.list<StaffTrade>("staff-trades");
  return [
    ...defaultTrades.filter((t) => !saved.some((s) => s.id === t.id)),
    ...saved,
  ];
}
export async function people(store: Store) {
  return Promise.all(
    (
      await store.db.prepare("SELECT * FROM accounts ORDER BY username").all()
    ).map(async (row) => ({
      ...store.account(row),
      version: 1,
      createdAt: "",
      tradeIds: [],
      regionIds: [],
      ...(await store.get<AccountMeta>("account-meta", String(row.id))),
    })),
  );
}
export async function personActivity(
  store: Store,
  userId: string,
  runId: string,
) {
  const items: any[] = [];
  for (const [collection, label, key] of [
    ["orders", "预约订单", "userId"],
    ["messages", "聊天室发言", "authorId"],
    ["reports", "举报", "userId"],
    ["appeals", "申诉", "userId"],
    ["activity", "活动", "userId"],
  ] as const)
    for (const item of await store.list<any>(collection, runId))
      if (item[key] === userId)
        items.push({
          id: collection + "-" + item.id,
          type: label,
          at: item.createdAt || "",
          detail:
            collection === "orders"
              ? `${item.date} ${item.slot}—${item.slotEnd || ""} · ${item.kind} · ${item.status} · ${item.entered ? (item.exited ? "已离园" : "在园") : "未入园"}`
              : item.text || item.reason || item.detail,
        });
  const profile = await store.get<any>("profiles", userId, runId);
  if (profile)
    items.push({
      id: "profile",
      type: "路线与收藏",
      at: "",
      detail: `路线：${profile.routeId || "未选择"}；收藏：${(profile.favourites || []).join("、") || "无"}`,
    });
  for (const row of await store.db
    .prepare(
      "SELECT seq,business_time,kind,payload FROM journal WHERE actor_id=$1 AND run_id=$2 ORDER BY seq DESC LIMIT 200",
    )
    .all(userId, runId))
    items.push({
      id: "event-" + row.seq,
      type: row.kind,
      at: row.business_time,
      detail: row.payload,
    });
  for (const row of await store.db
    .prepare(
      "SELECT m.id,m.text,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner=$1 AND c.run_id=$2 AND m.role='user' ORDER BY m.created_at DESC LIMIT 100",
    )
    .all(userId, runId))
    items.push({
      id: "qa-" + row.id,
      type: "AI问答",
      at: row.created_at,
      detail: row.text,
    });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
export async function peopleWrite(
  store: Store,
  user: Account,
  runId: string,
  path: string,
  input: any,
) {
  if (
    !path.startsWith("/admin/people") &&
    !path.startsWith("/admin/staff-trades")
  )
    return undefined;
  assert(user.role === "admin", "FORBIDDEN", "需要管理员权限", 403);
  const parts = path.split("/").filter(Boolean),
    id = parts[2],
    action = parts[3];
  if (parts[1] === "staff-trades") {
    const rows = await trades(store),
      old = rows.find((r) => r.id === id);
    if (id) {
      assert(old, "NOT_FOUND", "工种不存在", 404);
      assert(
        old.version === input.expectedVersion,
        "VERSION_CONFLICT",
        "工种已更新",
      );
    }
    const item = {
      id: id || randomUUID(),
      name: textField(input.name, 30),
      archived: input.archived === true,
      version: (old?.version || 0) + 1,
    };
    assert(
      !rows.some(
        (t) => t.id !== item.id && !t.archived && t.name.localeCompare(item.name, undefined, { sensitivity: "base" }) === 0,
      ),
      "CONFLICT",
      "工种名称已存在",
    );
    if (item.archived)
      assert(
        !(await people(store)).some(
          (p) => !p.archived && p.tradeIds.includes(item.id),
        ),
        "CONFLICT",
        "请先调整绑定此工种的员工",
      );
    await store.put("staff-trades", item.id, item);
    return item;
  }
  if (!id) {
    assert(
      ["visitor", "staff"].includes(input.role),
      "VALIDATION_ERROR",
      "身份无效",
      400,
    );
    assert(
      /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(input.username),
      "VALIDATION_ERROR",
      "账号须为3—32位字母数字下划线，以字母开头",
      400,
    );
    assert(
      !(await store.db
        .prepare("SELECT id FROM accounts WHERE username=$1")
        .get(input.username)),
      "USERNAME_EXISTS",
      "账号已存在",
    );
    const newId = randomUUID(),
      password = randomBytes(9).toString("base64url") + "7a!";
    await store.db
      .prepare(
        "INSERT INTO accounts(id,username,name,role,password) VALUES($1,$2,$3,$4,$5)",
      )
      .run(
        newId,
        input.username,
        textField(input.name, 30),
        input.role,
        passwordHash(password),
      );
    await store.put("account-meta", newId, {
      version: 1,
      createdAt: new Date().toISOString(),
      mustChangePassword: true,
      ...(await staffFields(store, input)),
    });
    return { id: newId, temporaryPassword: password };
  }
  const target = (await people(store)).find((p) => p.id === id);
  assert(
    target && target.role !== "admin",
    "NOT_FOUND",
    "游客或员工账号不存在",
    404,
  );
  assert(
    target.version === input.expectedVersion,
    "VERSION_CONFLICT",
    "账号已更新，请重新打开",
  );
  const meta: AccountMeta = {
    version: target.version + 1,
    createdAt: target.createdAt,
    archived: target.archived,
    mustChangePassword: target.mustChangePassword,
    tradeIds: target.tradeIds,
    regionIds: target.regionIds,
  };
  if (action === "archive") {
    const runs = await store.list<any>("runs");
    for (const run of runs)
      assert(
        !(await store.list<any>("work-orders", run.id)).some(
          (w) =>
            w.assigneeId === id &&
            !["completed", "cancelled"].includes(w.status),
        ),
        "ACTIVE_WORK",
        "请先改派该员工尚未完成的工单",
      );
    meta.archived = true;
    await store.db
      .prepare("UPDATE accounts SET disabled=true WHERE id=$1")
      .run(id);
    await store.db
      .prepare("DELETE FROM auth_sessions WHERE user_id=$1")
      .run(id);
  } else if (action === "reset-password") {
    const password = randomBytes(9).toString("base64url") + "7a!";
    meta.mustChangePassword = true;
    await store.db
      .prepare("UPDATE accounts SET password=$1 WHERE id=$2")
      .run(passwordHash(password), id);
    await store.db
      .prepare("DELETE FROM auth_sessions WHERE user_id=$1")
      .run(id);
    await store.put("account-meta", id, meta);
    return { id, temporaryPassword: password };
  } else {
    assert(!target.archived, "ARCHIVED", "已归档账号不可修改");
    Object.assign(
      meta,
      await staffFields(store, { ...input, role: target.role }),
    );
    const username =
      input.username === undefined ? target.username : String(input.username);
    assert(
      /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(username),
      "VALIDATION_ERROR",
      "账号须为3—32位字母数字下划线，以字母开头",
      400,
    );
    const duplicate = await store.db
      .prepare("SELECT id FROM accounts WHERE username=$1 AND id<>$2")
      .get(username, id);
    assert(!duplicate, "USERNAME_EXISTS", "账号已存在");
    await store.db
      .prepare(
        "UPDATE accounts SET name=$1,disabled=$2,username=$3 WHERE id=$4",
      )
      .run(textField(input.name, 30), input.disabled === true, username, id);
    if (input.disabled)
      await store.db
        .prepare("DELETE FROM auth_sessions WHERE user_id=$1")
        .run(id);
  }
  await store.put("account-meta", id, meta);
  return { id };
}
async function staffFields(store: Store, input: any) {
  if (input.role !== "staff") return { tradeIds: [], regionIds: [] };
  const allowed = (await trades(store))
    .filter((t) => !t.archived)
    .map((t) => t.id);
  assert(
    Array.isArray(input.tradeIds) &&
      input.tradeIds.length > 0 &&
      input.tradeIds.every((id: unknown) => allowed.includes(String(id))),
    "VALIDATION_ERROR",
    "请选择有效工种",
    400,
  );
  assert(
    Array.isArray(input.regionIds) &&
      input.regionIds.length > 0 &&
      input.regionIds.every((id: unknown) => /^Z[0-8]$/.test(String(id))),
    "VALIDATION_ERROR",
    "请选择负责区域",
    400,
  );
  return {
    tradeIds: [...new Set(input.tradeIds)],
    regionIds: [...new Set(input.regionIds)],
  };
}
