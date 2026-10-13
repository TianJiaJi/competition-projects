import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkflow } from "../../packages/demo/server/workflow.mjs";
import { definition } from "../../packages/demo/src/samples/school/index.ts";
const wait = async (check) => {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok(check(), "condition timed out");
};
function fixture(execute = async () => ({ summary: "ok" }), workflow) {
  const state = {
    run: "isolated",
    revision: 0,
    history: [],
    stages: Object.fromEntries(
      ["01", "02", "03"].map((s) => [
        s,
        { status: "empty", requirement: "", adjustment: "", revision: 0 },
      ]),
    ),
  };
  // Deliberately reverse topological order to catch array-order dependent traversal.
  const nodes = workflow || [
    {
      id: "join",
      stage: "01",
      kind: "process",
      deps: ["left", "right"],
      summary: "joined",
    },
    {
      id: "left",
      stage: "01",
      kind: "execution",
      deps: ["source"],
      summary: "left",
    },
    {
      id: "right",
      stage: "01",
      kind: "process",
      deps: ["source"],
      summary: "right",
    },
    { id: "source", stage: "01", kind: "source", deps: [] },
    { id: "unrelated", stage: "02", kind: "source", deps: [] },
  ];
  const engine = createWorkflow({
    definition: { workflow: nodes },
    getState: () => state,
    save() {
      state.sequence = (state.sequence || 0) + 1;
    },
    event(kind, detail) {
      state.history.push({ kind, detail });
    },
    execute,
    delay: 25,
  });
  return {
    state,
    engine,
    import: (id, name) =>
      engine.handle({ node: id, action: "import", file: { name } }),
  };
}
test("independent branches run together, join waits, unrelated revision does not discard execution", async (t) => {
  let release;
  const f = fixture(() => new Promise((r) => (release = r)));
  t.after(() => f.engine.stop());
  f.import("source", "one.txt");
  await wait(
    () =>
      f.state.nodes.left.status === "running" &&
      f.state.nodes.right.status === "running",
  );
  f.import("unrelated", "two.txt");
  await wait(() => f.state.nodes.right.status === "complete");
  assert.equal(f.state.nodes.join.status, "blocked");
  release({ summary: "real result" });
  await wait(() => f.state.nodes.join.status === "complete");
  assert.equal(f.state.nodes.left.output, "real result");
});
test("invalidating a branch rejects late execution and follows dependencies regardless of array order", async (t) => {
  let release,
    calls = 0;
  const f = fixture(() =>
    ++calls === 1
      ? new Promise((r) => (release = r))
      : Promise.resolve({ summary: "new" }),
  );
  t.after(() => f.engine.stop());
  f.import("source", "old.txt");
  await wait(() => !!release);
  const generation = f.state.nodes.left.generation;
  f.import("source", "new.txt");
  assert.ok(f.state.nodes.left.generation > generation);
  assert.equal(f.state.nodes.join.status, "blocked");
  release({ summary: "stale" });
  await wait(() => f.state.nodes.join.status === "complete");
  assert.equal(f.state.nodes.left.output, "new");
  assert.ok(!f.state.history.some((h) => h.detail?.includes("stale")));
});
test("failure blocks only dependent work and explicit retry preserves failure history", async (t) => {
  let calls = 0;
  const f = fixture(async () => {
    if (++calls === 1) throw Error("broken");
    return { summary: "recovered" };
  });
  t.after(() => f.engine.stop());
  f.import("source", "input");
  await wait(
    () =>
      f.state.nodes.left.status === "failed" &&
      f.state.nodes.right.status === "complete",
  );
  assert.equal(f.state.nodes.join.status, "blocked");
  f.engine.handle({ node: "left", action: "retry" });
  await wait(() => f.state.nodes.join.status === "complete");
  assert.equal(
    f.state.history.filter((h) => h.kind === "node-failed").length,
    1,
  );
});
test("default sample has real forks, staged assembly and an 8–12 minute critical path", () => {
  const byId = new Map(definition.workflow.map((n) => [n.id, n])),
    memo = new Map();
  const duration = (id) => {
    if (memo.has(id)) return memo.get(id);
    const n = byId.get(id);
    const value = (n.durationMs || 0) + Math.max(0, ...n.deps.map(duration));
    memo.set(id, value);
    return value;
  };
  assert.ok(
    duration("03-acceptance") >= 480000 && duration("03-acceptance") <= 720000,
  );
  assert.deepEqual(byId.get("03-collect").deps, ["01-acceptance"]);
  assert.ok(byId.get("03-space-pages").deps.includes("02-acceptance"));
  assert.ok(byId.get("03-fields").deps.includes("03-database"));
  assert.ok(!byId.get("02-navigation").deps.includes("02-components-plan"));
  for (const n of definition.workflow) {
    assert.ok(n.module && n.layout && n.outputName);
    if (n.kind === "process") {
      assert.ok(n.phases.length >= 3);
      assert.ok(!n.task.includes("已完成"));
    }
  }
});
test("changed graph migrates only downstream work and preserves records without inventing completion", async (t) => {
  const f = fixture();
  f.import("source", "input");
  await wait(() => f.state.nodes.join.status === "complete");
  f.import("unrelated", "keep.txt");
  f.engine.stop();
  const oldHistory = f.state.history.length;
  const workflow = [
    { id: "source", kind: "source", stage: "01", deps: [] },
    { id: "left", kind: "process", stage: "01", deps: ["source"] },
    { id: "right", kind: "process", stage: "01", deps: ["source"] },
    { id: "join", kind: "process", stage: "01", deps: ["right"] },
    { id: "unrelated", kind: "source", stage: "02", deps: [] },
  ];
  const engine = createWorkflow({
    definition: { workflow },
    getState: () => f.state,
    save() {},
    event(kind, detail) {
      f.state.history.push({ kind, detail });
    },
    execute: async () => ({}),
    delay: 1,
  });
  t.after(() => engine.stop());
  assert.equal(f.state.nodes.unrelated.status, "complete");
  assert.equal(f.state.nodes.unrelated.file.name, "keep.txt");
  assert.notEqual(f.state.nodes.join.status, "complete");
  assert.ok(f.state.history.length > oldHistory);
  assert.ok(
    !f.state.history.slice(oldHistory).some((h) => h.kind === "node-completed"),
  );
});
