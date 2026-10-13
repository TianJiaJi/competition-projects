import type { Store } from "./store.ts";
import { sources } from "../knowledge.ts";
/** Named demo accounts only. Stable identifiers make repeated generation harmless. */
export async function seedDemoActivity(
  store: Store,
  runId: string,
  time: number,
) {
  const date = new Date(time).toISOString(),
    users = await store.db
      .prepare(
        "SELECT id,name FROM accounts WHERE username IN ('visitor01','visitor02','visitor03','visitor04','visitor05') AND disabled=false ORDER BY id",
      )
      .all();
  let added = 0;
  const put = async (c: string, id: string, data: unknown) => {
    if (await store.get(c, id, runId)) return;
    await store.put(c, id, data, runId);
    added++;
  };
  for (const [i, u] of users.entries()) {
    const prefix = "demo-activity-" + u.id,
      mid = prefix + "-message";
    await put("messages", mid, {
      id: mid,
      roomId: "lobby",
      authorId: u.id,
      authorName: u.name,
      text: "【演示活动】请问听溪台适合休息吗？",
      version: 1,
      removed: false,
      simulated: true,
      createdAt: date,
    });
    await put("reports", prefix + "-report", {
      id: prefix + "-report",
      messageId: mid,
      messageVersion: 1,
      userId: u.id,
      reason: "【演示活动】反馈消息信息需核实",
      status: "pending",
      version: 1,
      createdAt: date,
    });
    await put("activity", prefix + "-route", {
      id: prefix + "-route",
      userId: u.id,
      type: "route",
      detail: "【演示活动】查看路线推荐与听溪台介绍",
      createdAt: date,
    });
    await put("activity", prefix + "-entry", {
      id: prefix + "-entry",
      userId: u.id,
      type: "entry-exit",
      detail: "【历史演示记录】入园后完成游览并离园；不计入当前现场在园人数",
      createdAt: date,
    });
    const cid = prefix + "-" + runId;
    await store.db
      .prepare(
        "INSERT INTO conversations(id,owner,run_id,poi_id,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      )
      .run(cid, u.id, runId, "creek", date);
    for (const [role, text] of [
      ["user", "【演示问答】听溪台有什么游览建议？"],
      [
        "assistant",
        "【演示答复】可沿开放步道游览，留意当日公告与开放状态。[K1]",
      ],
    ])
      await store.db
        .prepare(
          "INSERT INTO messages(id,conversation_id,role,text,status,sources,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",
        )
        .run(
          cid + "-" + role,
          cid,
          role,
          text,
          "completed",
          JSON.stringify(role === "assistant" ? [sources[0]] : []),
          date,
        );
  }
  return { added, accounts: users.length };
}
