import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkflow } from "../../packages/demo/server/workflow.mjs";
import { createService } from "../../packages/demo/server/service.mjs";
import { definition } from "../../packages/demo/src/samples/school/index.ts";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await sleep(5);
  }
  assert.ok(check(), "timed out");
}
function fixture(execute = async () => ({ summary: "ok" }), delay = 5) {
  const state = {
    run: "test",
    revision: 0,
    stages: {
      "01": { status: "empty", revision: 0, requirement: "", adjustment: "" },
      "02": { status: "empty", revision: 0, requirement: "", adjustment: "" },
      "03": { status: "empty", revision: 0, requirement: "", adjustment: "" },
    },
    history: [],
    nodes: {},
  };
  const engine = createWorkflow({
    definition,
    getState: () => state,
    save() {},
    event(kind, detail) {
      state.history.push({ kind, detail });
    },
    execute,
    delay,
  });
  const action = (node, action, extra = {}) =>
    engine.handle({ node, action, ...extra });
  const importAll = (stage) =>
    definition.workflow
      .filter((n) => n.stage === stage && n.kind === "source")
      .forEach((n) =>
        action(n.id, "import", {
          file: { name: "完全不匹配.txt", type: "wrong/format" },
        }),
      );
  return { state, engine, action, importAll };
}
test("arbitrary material, dependency gating, durable automatic chain and explicit approval", async (t) => {
  const f = fixture();
  t.after(() => f.engine.stop());
  assert.throws(
    () => f.action("02-requirement", "submit", { text: "early" }),
    /上游/,
  );
  f.importAll("01");
  f.action("01-requirement", "submit", { text: "原文\n保留" });
  await until(() => f.state.nodes["01-adjustment"].status === "ready");
  assert.equal(f.state.stages["01"].requirement, "原文\n保留");
  f.action("01-adjustment", "submit", { text: "修改" });
  await sleep(15);
  assert.equal(f.state.nodes["01-revision"].status, "blocked");
  f.action("01-adjustment", "confirm");
  f.action("01-adjustment", "confirm");
  await until(() => f.state.nodes["01-publish"].status === "complete");
  // Test fixture's execution handler does not publish. Acceptance must remain gated.
  assert.throws(
    () => f.action("01-acceptance", "accept", { passed: true, detail: "good" }),
    /尚未就绪/,
  );
  assert.equal(f.state.nodes["02-requirement"].status, "blocked");
  assert.equal(f.state.history.filter((h) => h.kind === "confirmed").length, 1);
});
test("execution failures remain recorded, downstream stays blocked, retry is explicit", async (t) => {
  let attempts = 0;
  const f = fixture(async () => {
    attempts++;
    if (attempts === 1) throw Error("connection refused");
    return { summary: "connected" };
  });
  t.after(() => f.engine.stop());
  f.importAll("01");
  f.action("01-requirement", "submit", { text: "需求" });
  await until(() => f.state.nodes["01-adjustment"].status === "ready");
  f.action("01-adjustment", "submit", { text: "调整" });
  f.action("01-adjustment", "confirm");
  await until(() => f.state.nodes["01-publish"].status === "failed");
  await sleep(25);
  assert.equal(attempts, 1);
  assert.equal(f.state.nodes["01-acceptance"].status, "blocked");
  f.action("01-publish", "retry");
  await until(() => f.state.nodes["01-publish"].status === "complete");
  assert.equal(attempts, 2);
  assert.ok(f.state.history.some((h) => h.kind === "node-failed"));
});
test("HTTP restart resumes running steps, acceptance rejection and revision mismatch preserve evidence", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canvas-resume-"));
  let server, base;
  async function start() {
    server = createService(dir, { nodeDelay: 120 });
    await new Promise((r) => server.listen(0, "localhost", r));
    base = `http://localhost:${server.address().port}`;
  }
  await start();
  t.after(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  const api = async (p, body) => {
    const response = await fetch(base + p, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const read = async () => (await api("/api/workbench")).data.state;
  let state = await read();
  const root = `/api/runs/${state.run}/node`;
  for (const n of definition.workflow.filter(
    (n) => n.stage === "01" && n.kind === "source",
  ))
    await api(root, {
      node: n.id,
      action: "import",
      file: { name: "wrong.data" },
    });
  await api(root, {
    node: "01-requirement",
    action: "submit",
    text: "保留输入",
  });
  await sleep(20);
  const running = await read();
  assert.equal(running.nodes["01-outline"].status, "running");
  await new Promise((r) => server.close(r));
  await start();
  for (let i = 0; i < 200; i++) {
    state = await read();
    if (state.nodes["01-adjustment"].status === "ready") break;
    await sleep(10);
  }
  assert.equal(state.nodes["01-adjustment"].status, "ready");
  assert.equal(
    state.history.filter(
      (h) => h.kind === "node-started" && h.detail === "01-outline",
    ).length,
    1,
  );
  await api(root, {
    node: "01-adjustment",
    action: "submit",
    text: "调整原文",
  });
  await api(root, { node: "01-adjustment", action: "confirm" });
  for (let i = 0; i < 200; i++) {
    state = await read();
    if (state.nodes["01-acceptance"].status === "waiting") break;
    await sleep(10);
  }
  assert.equal(state.nodes["01-acceptance"].status, "waiting");
  assert.equal(
    (
      await api(root, {
        node: "01-acceptance",
        action: "accept",
        passed: false,
        detail: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(root, {
        node: "01-acceptance",
        action: "accept",
        passed: false,
        detail: "视角需要调整",
      })
    ).status,
    200,
  );
  state = await read();
  assert.equal(state.nodes["01-adjustment"].status, "ready");
  assert.equal(state.nodes["01-adjustment"].submitted, false);
  assert.equal(state.stages["01"].status, "revised");
  assert.ok(
    state.history.some(
      (h) => h.kind === "acceptance" && h.detail.includes("视角需要调整"),
    ),
  );
  assert.equal(
    (
      await api(root, {
        node: "01-adjustment",
        action: "submit",
        text: "新版",
        revision: 0,
      })
    ).status,
    409,
  );
  // Same text is allowed after rejection and still requires a fresh confirmation.
  assert.equal(
    (
      await api(root, {
        node: "01-adjustment",
        action: "submit",
        text: "调整原文",
      })
    ).status,
    200,
  );
});
test("legacy migration retains published artifacts but never fabricates acceptance or node completion", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canvas-migrate-"));
  let server = createService(dir);
  await new Promise((r) => server.listen(0, "localhost", r));
  await new Promise((r) => server.close(r));
  const filename = path.join(dir, "current.json"),
    old = JSON.parse(readFileSync(filename, "utf8"));
  delete old.nodes;
  old.latest = "01";
  old.stages["01"] = {
    status: "assembled",
    requirement: "旧需求",
    adjustment: "旧调整",
    revision: 1,
  };
  old.stages["02"] = { ...old.stages["01"] };
  old.stages["03"] = { ...old.stages["01"] };
  old.latest = "03";
  old.history = [
    { kind: "assembled", detail: "旧成果", at: new Date().toISOString() },
  ];
  writeFileSync(filename, JSON.stringify(old));
  server = createService(dir);
  await new Promise((r) => server.listen(0, "localhost", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  const current = await (
    await fetch(`http://localhost:${server.address().port}/api/workbench`)
  ).json();
  assert.equal(current.state.run, old.run);
  assert.equal(current.state.nodes["01-acceptance"].status, "waiting");
  assert.equal(current.state.stages["01"].acceptance, undefined);
  assert.equal(current.state.nodes["02-acceptance"].status, "blocked");
  assert.equal(current.state.nodes["03-acceptance"].status, "blocked");
  assert.equal(current.state.nodes["01-outline"].status, "blocked");
  assert.equal(
    current.state.history.filter((h) => h.kind === "node-completed").length,
    0,
  );
});

test("batch metadata append, deduplication, replacement and removal invalidate only on real changes", async (t) => {
  const f = fixture();
  t.after(() => f.engine.stop());
  const send = (values) => f.action("01-map", "import", values);
  send({
    files: [
      {
        name: "a.any",
        size: 12,
        type: "anything",
        lastModified: 10,
        content: "not retained",
      },
      { name: "b.html", size: 34 },
    ],
  });
  const saved = f.state.nodes["01-map"];
  assert.equal(saved.files.length, 2);
  assert.equal(saved.files[0].content, undefined);
  assert.equal(saved.status, "complete");
  const revision = f.state.revision,
    history = f.state.history.length;
  send({
    files: [{ name: "a.any", size: 12, type: "anything", lastModified: 10 }],
  });
  assert.equal(f.state.revision, revision);
  assert.equal(f.state.history.length, history);
  send({ files: [{ name: "c.txt" }] });
  assert.equal(f.state.nodes["01-map"].files.length, 3);
  assert.equal(f.state.revision, revision + 1);
  const id = f.state.nodes["01-map"].files[0].id;
  send({ mode: "remove", fileId: id });
  assert.equal(f.state.nodes["01-map"].files.length, 2);
  send({ mode: "remove", fileId: id });
  assert.equal(f.state.revision, revision + 2);
  send({ mode: "reference" });
  assert.deepEqual(
    f.state.nodes["01-map"].files.map((f) => f.name),
    ["M01.png"],
  );
  assert.equal(f.state.nodes["01-map"].files[0].prepared, true);
  const final = f.state.nodes["01-map"].files[0].id;
  send({ mode: "remove", fileId: final });
  assert.equal(f.state.nodes["01-map"].status, "ready");
  assert.deepEqual(f.state.nodes["01-map"].files, []);
  assert.equal(f.state.nodes["01-map"].completedAt, undefined);
  assert.ok(
    f.state.history.some(
      (h) => h.kind === "material" && h.detail.includes("a.any"),
    ),
  );
  assert.throws(() => send({ files: [] }), /请选择/);
  // Old clients still replace their single file and receive the file alias.
  send({ file: { name: "legacy.dat" } });
  assert.equal(f.state.nodes["01-map"].file.name, "legacy.dat");
});

test("old single-file records migrate without changing the run, approvals, revisions or execution history", (t) => {
  const f = fixture();
  t.after(() => f.engine.stop());
  f.action("01-map", "import", { file: { name: "old.bin", size: 42 } });
  delete f.state.nodes["01-map"].files;
  const before = structuredClone(f.state);
  f.engine.prepare();
  assert.equal(f.state.run, before.run);
  assert.equal(f.state.revision, before.revision);
  assert.deepEqual(f.state.history, before.history);
  assert.deepEqual(f.state.stages, before.stages);
  assert.equal(f.state.nodes["01-map"].files.length, 1);
  assert.equal(f.state.nodes["01-map"].files[0].name, "old.bin");
  assert.equal(f.state.nodes["01-map"].status, "complete");
});
