import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createService } from "../../packages/demo/server/service.mjs";
import {
  definition,
  schoolScenario,
} from "../../packages/demo/src/samples/school/index.ts";
import {
  openDatabase,
  initialize,
  snapshot,
  mutate,
  checks,
} from "../../packages/demo/server/database.mjs";
const staff = { role: "staff", username: "staff01" },
  mobile = { role: "mobile", username: "user01" },
  admin = { role: "admin", username: "admin01" };
function fixture(t) {
  const db = openDatabase(":memory:");
  initialize(db);
  t.after(() => db.close());
  return db;
}
test("real SQL join, isolated checks, rejected references and unchanged source", (t) => {
  const db = fixture(t),
    before = JSON.stringify(snapshot(db));
  const results = checks();
  assert.equal(results.length, 10);
  assert.ok(results.every((c) => c.passed));
  assert.match(
    results.find((c) => c.id === "D02").detail,
    /错误输入被拒绝；拦截断言通过/,
  );
  assert.equal(JSON.stringify(snapshot(db)), before);
  assert.throws(
    () => mutate(db, admin, "tasks", "T1", "save", { facilityId: "F404" }),
    /引用不存在/,
  );
  assert.throws(
    () =>
      mutate(db, admin, "tasks", "T1", "save", {
        facilityId: "F1",
        buildingId: "B1",
      }),
    /不一致/,
  );
});
test("repair ownership, prerequisites, durable result, retry deduplication", (t) => {
  const db = fixture(t);
  const input = {
    title: "投影检修",
    location: "明理楼",
    description: "检查信号线",
    category: "设备",
    date: "2026-10-09",
    facilityId: "F4",
  };
  const first = mutate(
    db,
    mobile,
    "tasks",
    undefined,
    "save",
    input,
    "same-request",
  ).item;
  assert.equal(
    mutate(db, mobile, "tasks", undefined, "save", input, "same-request").item
      .id,
    first.id,
  );
  assert.throws(
    () => mutate(db, staff, "tasks", first.id, "complete", { result: "完成" }),
    /领取/,
  );
  mutate(db, staff, "tasks", first.id, "claim");
  assert.throws(() => mutate(db, staff, "tasks", first.id, "claim"), /重复/);
  assert.throws(
    () => mutate(db, staff, "tasks", first.id, "complete", { result: " " }),
    /填写/,
  );
  const result = mutate(db, staff, "tasks", first.id, "complete", {
    result: "更换线缆，检查正常",
  }).item;
  assert.equal(result.submitterId, "user01");
  assert.equal(result.owner, "师生用户 01");
  assert.equal(result.assigneeId, "staff01");
  assert.equal(result.status, "已完成");
  assert.equal(
    snapshot(db).tasks.find((t) => t.id === first.id).result,
    result.result,
  );
});
test("booking relation/capacity/ownership and staff inspection lifecycle", (t) => {
  const db = fixture(t);
  const input = {
    title: "学习讨论",
    location: "研讨室",
    category: "预约",
    description: "小组学习",
    date: "2026-10-09",
    facilityId: "F1",
    timeSlot: "09:00–10:00",
    count: 6,
  };
  assert.throws(
    () =>
      mutate(db, mobile, "bookings", undefined, "save", {
        ...input,
        count: 99,
      }),
    /人数/,
  );
  const item = mutate(db, mobile, "bookings", undefined, "save", input).item;
  assert.throws(
    () =>
      mutate(
        db,
        { ...mobile, username: "user02" },
        "bookings",
        item.id,
        "cancel",
      ),
    /自己的/,
  );
  assert.equal(
    mutate(db, mobile, "bookings", item.id, "cancel").item.status,
    "已取消",
  );
  mutate(db, staff, "inspections", "I1", "claim");
  assert.equal(
    mutate(db, staff, "inspections", "I1", "complete", { result: "巡检完成" })
      .item.status,
    "已完成",
  );
});
test("all eight admin collections create/edit, no delete or role escalation", (t) => {
  const db = fixture(t);
  const seed = schoolScenario().seed;
  for (const c of [
    "buildings",
    "people",
    "facilities",
    "tasks",
    "inspections",
    "bookings",
    "notices",
    "security",
  ]) {
    const item = mutate(db, admin, c, undefined, "save", {
      ...seed[c][0],
      title: `新增${c}`,
    }).item;
    assert.equal(
      mutate(db, admin, c, item.id, "save", { title: `编辑${c}` }).item.title,
      `编辑${c}`,
    );
  }
  assert.throws(
    () => mutate(db, mobile, "people", undefined, "save", seed.people[0]),
    /无权/,
  );
  assert.throws(() => mutate(db, staff, "tasks", "T1", "delete"), /未知操作/);
});
test("HTTP persistence, stage gating, invalidation, failures, sessions, reset and old run expiry", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "assembly-test-"));
  let server;
  async function start() {
    server = createService(dir, { nodeDelay: 2 });
    await new Promise((resolve) => server.listen(0, "localhost", resolve));
    return `http://localhost:${server.address().port}`;
  }
  let host = await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const api = async (
    url,
    method = "GET",
    body,
    token,
    origin = "http://localhost:5506",
  ) => {
    const response = await fetch(host + url, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  let state = (await api("/api/workbench")).body.state;
  const root = `/api/runs/${state.run}`;
  assert.equal((await api(root + "/records")).status, 409);
  assert.equal(
    (await api(root + "/stage", "POST", { stage: "03", kind: "assemble" }))
      .status,
    409,
  );
  for (const stage of ["01", "02", "03"]) {
    for (const n of definition.workflow.filter(
      (n) => n.stage === stage && n.kind === "source",
    )) {
      assert.equal(
        (
          await api(root + "/node", "POST", {
            node: n.id,
            action: "import",
            file: { name: "anything.bin" },
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await api(root + "/node", "POST", {
          node: stage + "-requirement",
          action: "submit",
          text: "人工原文 " + stage,
        })
      ).status,
      200,
    );
    for (let i = 0; i < 200; i++) {
      state = (await api("/api/workbench")).body.state;
      if (state.nodes[stage + "-adjustment"].status === "ready") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(state.nodes[stage + "-adjustment"].status, "ready");
    for (const action of ["submit", "confirm"])
      assert.equal(
        (
          await api(root + "/node", "POST", {
            node: stage + "-adjustment",
            action,
            text: "人工调整 " + stage,
          })
        ).status,
        200,
      );
    for (let i = 0; i < 200; i++) {
      state = (await api("/api/workbench")).body.state;
      if (state.nodes[stage + "-acceptance"].status === "waiting") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(state.nodes[stage + "-acceptance"].status, "waiting");
    assert.equal(
      (
        await api(root + "/node", "POST", {
          node: stage + "-acceptance",
          action: "accept",
          passed: true,
          detail: "",
        })
      ).status,
      400,
    );
    state = (
      await api(root + "/node", "POST", {
        node: stage + "-acceptance",
        action: "accept",
        passed: true,
        detail: "核对成果，交接完成",
      })
    ).body;
  }
  assert.equal(state.latest, "03");
  assert.ok(existsSync(path.join(dir, `run-${state.run}.sqlite`)));
  const token = (
    await api(root + "/session", "POST", {
      username: "staff01",
      password: "123456",
      terminal: "staff",
    })
  ).body.token;
  assert.equal(
    (await api(root + "/records/tasks/T1/claim", "POST", {}, token)).status,
    200,
  );
  assert.equal(
    (
      await api(
        root + "/records/tasks/T1/complete",
        "POST",
        { result: " " },
        token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        root + "/records/tasks/T1/complete",
        "POST",
        { result: "服务结果" },
        token,
      )
    ).status,
    200,
  );
  const before = (await api(root + "/records")).body.records;
  const checked = await api(root + "/checks", "POST", {});
  assert.ok(checked.body.checks.every((c) => c.passed));
  assert.deepEqual((await api(root + "/records")).body.records, before);
  assert.equal(
    (
      await api(root + "/manual", "POST", {
        id: "H01",
        passed: false,
        detail: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(root + "/manual", "POST", {
        id: "H01",
        passed: false,
        detail: "现场字号偏小",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        root +
          "/context?" +
          new URLSearchParams({
            caseId: definition.caseId,
            version: "wrong",
            stage: "03",
            terminal: "public",
          }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        root + "/records",
        "GET",
        undefined,
        undefined,
        "http://evil.example",
      )
    ).status,
    403,
  );
  await new Promise((resolve) => server.close(resolve));
  host = await start();
  assert.equal((await api("/api/workbench")).body.state.run, state.run);
  assert.deepEqual((await api(root + "/records")).body.records, before);
  assert.equal(
    (await api(root + "/session", "GET", undefined, token)).status,
    200,
  );
  const invalidated = (
    await api(root + "/node", "POST", {
      node: "02-adjustment",
      action: "submit",
      text: "新调整",
    })
  ).body;
  assert.equal(invalidated.latest, "01");
  assert.notEqual(invalidated.stages["03"].status, "assembled");
  assert.ok(
    invalidated.checks.every((c) => c.revision !== invalidated.revision),
  );
  assert.ok(invalidated.history.some((h) => h.kind === "failure"));
  assert.equal((await api(root + "/records")).status, 409);
  const next = (await api("/api/new", "POST", { run: state.run })).body;
  assert.notEqual(next.run, state.run);
  assert.equal((await api(root + "/records")).status, 410);
  assert.ok(!readdirSync(dir).some((f) => f.includes(".sqlite")));
});
