import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  collections,
  editable,
  columns,
  schema,
  insertSql,
  relationQuery,
  schoolScenario,
  roles,
} from "../src/samples/school/index.ts";
import { claim, complete, validateRecord } from "../../domain/src/index.ts";
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  return db;
}
export function initialize(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(schema);
    db.exec(
      "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT, operation TEXT, detail TEXT); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, response TEXT NOT NULL);",
    );
    const seeded = db.prepare("SELECT COUNT(*) AS n FROM buildings").get().n;
    if (!seeded) {
      for (const c of collections) {
        const statement = db.prepare(insertSql(c));
        for (const item of schoolScenario().seed[c])
          statement.run(...columns.map((k) => item[k] ?? null));
      }
    }
    const rows = db.prepare(relationQuery).all("T1");
    db.prepare("INSERT INTO audit(at,operation,detail) VALUES(?,?,?)").run(
      new Date().toISOString(),
      "initialize",
      JSON.stringify({
        seeded: !seeded,
        query: relationQuery,
        parameters: ["T1"],
        rows,
      }),
    );
    db.exec("COMMIT");
    return {
      seeded: !seeded,
      rows,
      tables: collections,
      executedSql: schema,
      query: relationQuery,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function snapshot(db) {
  return Object.fromEntries(
    collections.map((c) => [
      c,
      db
        .prepare(`SELECT * FROM ${c} ORDER BY rowid DESC`)
        .all()
        .map((row) =>
          Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)),
        ),
    ]),
  );
}
export function audit(db) {
  return db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100").all();
}
const statuses = {
  buildings: ["使用中", "维护中"],
  people: ["已认证", "待认证"],
  facilities: ["正常", "检修中"],
  tasks: ["待处理", "处理中", "已完成"],
  inspections: ["待处理", "处理中", "已完成"],
  bookings: ["已预约", "已取消"],
  notices: ["已发布", "草稿"],
  security: ["关注", "正常", "已完成"],
};
function validate(db, c, item) {
  if (
    ["title", "location", "description", "category", "status", "date"].some(
      (k) => typeof item[k] !== "string" || item[k].length > 2000,
    )
  )
    fail("字段格式无效");
  const error = validateRecord(
    item.title,
    item.location,
    item.description,
    item.contact || "",
  );
  if (error) fail(error);
  if (!statuses[c]?.includes(item.status)) fail("状态无效");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
    Number.isNaN(Date.parse(item.date))
  )
    fail("日期无效");
  for (const key of ["capacity", "used"])
    if (item[key] != null && (!Number.isInteger(item[key]) || item[key] < 0))
      fail("数量必须是非负整数");
  if ((item.used ?? 0) > (item.capacity ?? 0)) fail("使用数量不能超过总量");
  for (const [key, table] of [
    ["buildingId", "buildings"],
    ["facilityId", "facilities"],
  ]) {
    if (
      item[key] &&
      !db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(item[key])
    )
      fail(`${key} 引用不存在`);
  }
  if (item.facilityId) {
    const facility = db
      .prepare("SELECT * FROM facilities WHERE id=?")
      .get(item.facilityId);
    if (item.buildingId && facility.buildingId !== item.buildingId)
      fail("设施与楼宇关联不一致");
    item.buildingId = facility.buildingId;
  }
  if (c === "bookings") {
    const facility =
      item.facilityId &&
      db.prepare("SELECT * FROM facilities WHERE id=?").get(item.facilityId);
    if (
      !facility ||
      !facility.capacity ||
      (item.status === "已预约" && facility.status !== "正常")
    )
      fail("请选择可预约空间");
    if (
      !Number.isInteger(item.count) ||
      item.count < 1 ||
      item.count > facility.capacity
    )
      fail(`使用人数应为 1–${facility.capacity}`);
    if (!/^\d{2}:\d{2}[–-]\d{2}:\d{2}$/.test(item.timeSlot || ""))
      fail("请选择有效时段");
    if (!item.submitterId) fail("预约必须有提交人");
  }
  if (["tasks", "inspections"].includes(c)) {
    if (item.status !== "待处理" && !item.assigneeId)
      fail("处理中或已完成任务必须有处理人");
    if (item.status === "已完成" && !item.result?.trim())
      fail("请填写处理结果");
  }
}
export function mutate(
  db,
  { role, username },
  c,
  id,
  action,
  input = {},
  requestId = randomUUID(),
) {
  if (!editable.includes(c)) fail("该数据不支持写入", 403);
  if (!["mobile", "staff", "admin"].includes(role)) fail("请先登录", 401);
  const dedup = db
    .prepare("SELECT response FROM requests WHERE id=?")
    .get(`${username}:${requestId}`);
  if (dedup) return JSON.parse(dedup.response);
  const previous = id
    ? db.prepare(`SELECT * FROM ${c} WHERE id=?`).get(id)
    : null;
  if (id && !previous) fail("记录不存在", 404);
  let item;
  if (action === "save") {
    if (
      role !== "admin" &&
      !(role === "mobile" && !id && ["tasks", "bookings"].includes(c))
    )
      fail("角色无权维护此记录", 403);
    item = {
      ...previous,
      ...Object.fromEntries(
        Object.entries(input).filter(([k]) => columns.includes(k)),
      ),
      id: id || `${c}-${randomUUID()}`,
    };
    if (role === "mobile") {
      if (!item.facilityId) fail("请选择关联设施");
      Object.assign(item, {
        submitterId: username,
        assigneeId: null,
        owner: roles.mobile,
        status: c === "tasks" ? "待处理" : "已预约",
        result: null,
      });
    }
  } else {
    item = { ...previous };
    if (action === "cancel") {
      if (
        role !== "mobile" ||
        c !== "bookings" ||
        item.submitterId !== username
      )
        fail("只能取消自己的预约", 403);
      if (item.status !== "已预约") fail("预约已取消，不能重复操作", 409);
      item.status = "已取消";
    } else {
      if (role !== "staff" || !["tasks", "inspections"].includes(c))
        fail("该操作需要后勤角色", 403);
      if (action === "claim") {
        if (item.status !== "待处理") fail("任务已被领取，不能重复操作", 409);
        const submitterName = item.owner;
        claim(item, username);
        item.owner = submitterName;
        item.assigneeId = username;
      } else if (action === "complete") {
        if (item.status !== "处理中") fail("请先领取任务", 409);
        if (item.assigneeId !== username) fail("只能完成自己领取的任务", 403);
        const error = complete(
          item,
          typeof input.result === "string" ? input.result : "",
        );
        if (error) fail(error);
      } else fail("未知操作");
    }
  }
  for (const key of ["facilityId", "buildingId", "submitterId", "assigneeId"])
    if (item[key] === "") item[key] = null;
  validate(db, c, item);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(insertSql(c, true)).run(...columns.map((k) => item[k] ?? null));
    const response = { item };
    db.prepare("INSERT INTO audit(at,operation,detail) VALUES(?,?,?)").run(
      new Date().toISOString(),
      `${c}.${action}`,
      JSON.stringify({
        id: item.id,
        actor: username,
        role,
        parameterBinding: true,
        changes: Object.keys(input),
      }),
    );
    db.prepare("INSERT INTO requests(id,response) VALUES(?,?)").run(
      `${username}:${requestId}`,
      JSON.stringify(response),
    );
    db.exec("COMMIT");
    return response;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function checks() {
  const db = openDatabase(":memory:");
  const results = [];
  const check = (id, fn) => {
    try {
      results.push({ id, passed: true, detail: fn() || "通过" });
    } catch (e) {
      results.push({ id, passed: false, detail: e.message });
    }
  };
  const expectReject = (fn, pattern) => {
    try {
      fn();
    } catch (e) {
      if (pattern.test(e.message)) return e.message;
      throw e;
    }
    throw new Error("错误输入未被拒绝");
  };
  try {
    initialize(db);
    check("D01", () => {
      if (db.prepare(relationQuery).all("T1")[0]?.buildingId !== "B1")
        throw Error("关联失败");
      return "实际 JOIN：T1 → F4 → B1";
    });
    check(
      "D02",
      () =>
        `错误输入被拒绝；拦截断言通过：${expectReject(() => mutate(db, { role: "admin", username: "admin01" }, "tasks", "T1", "save", { facilityId: "F404" }), /引用不存在/)}`,
    );
    check("D03", () => {
      if (snapshot(db).bookings[0].count === undefined)
        throw Error("预约字段缺失");
      return "SQL 结果适配包含结构化关联与预约字段";
    });
    check("D04", () => {
      if (
        Object.values(snapshot(db))
          .flat()
          .some((r) => r.contact)
      )
        throw Error("匿名化失败");
      return "演示角色与联系信息已匿名化";
    });
    check("D05", () => {
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw Error("外键失败");
      return "独立内存数据库外键检查通过";
    });
    check("B01", () =>
      expectReject(
        () =>
          mutate(
            db,
            { role: "staff", username: "staff01" },
            "tasks",
            "T1",
            "complete",
            { result: "检查" },
          ),
        /先领取/,
      ),
    );
    check("B02", () => {
      mutate(
        db,
        { role: "staff", username: "staff01" },
        "tasks",
        "T1",
        "claim",
      );
      return expectReject(
        () =>
          mutate(
            db,
            { role: "staff", username: "staff01" },
            "tasks",
            "T1",
            "claim",
          ),
        /重复/,
      );
    });
    check("B03", () =>
      expectReject(
        () =>
          mutate(
            db,
            { role: "staff", username: "staff01" },
            "tasks",
            "T1",
            "complete",
            { result: "  " },
          ),
        /填写处理结果/,
      ),
    );
    check("B04", () => {
      mutate(
        db,
        { role: "staff", username: "staff01" },
        "tasks",
        "T1",
        "complete",
        { result: "完成检查，结果正常" },
      );
      const item = db.prepare("SELECT * FROM tasks WHERE id=?").get("T1");
      if (
        item.submitterId !== "user01" ||
        item.assigneeId !== "staff01" ||
        !item.result
      )
        throw Error("人员或结果丢失");
      return "提交人保留、处理人独立、结果真实落库";
    });
    check("B05", () =>
      expectReject(
        () =>
          mutate(
            db,
            { role: "mobile", username: "user02" },
            "bookings",
            "R1",
            "cancel",
          ),
        /自己的预约/,
      ),
    );
  } finally {
    db.close();
  }
  return results;
}
