import { fail } from "./database.mjs";
import { materialList } from "./materials.mjs";
const now = () => new Date().toISOString();
const automatic = (n) => ["process", "execution"].includes(n.kind);
/** Durable DAG runner: jobs are guarded by run and record generation, not global revision. */
export function createWorkflow({
  definition,
  getState,
  save,
  event,
  execute,
  delay,
}) {
  const definitions = definition.workflow;
  const byId = new Map(definitions.map((n) => [n.id, n]));
  const visited = new Set(),
    visiting = new Set();
  function validate(id) {
    if (visiting.has(id)) throw Error(`工作流包含循环依赖：${id}`);
    if (visited.has(id)) return;
    if (!byId.has(id)) throw Error(`工作流引用不存在的节点：${id}`);
    visiting.add(id);
    byId.get(id).deps.forEach(validate);
    visiting.delete(id);
    visited.add(id);
  }
  definitions.forEach((n) => validate(n.id));
  const graph = Object.fromEntries(
    definitions.map((n) => [
      n.id,
      JSON.stringify([n.kind, n.action, [...n.deps].sort()]),
    ]),
  );
  const jobs = new Map();
  let timer,
    stopped = false,
    executionQueue = Promise.resolve();
  function prepare() {
    clearTimeout(timer);
    timer = undefined;
    for (const job of jobs.values()) clearTimeout(job.timer);
    jobs.clear();
    const state = getState(),
      hadNodes = !!state.nodes;
    if (!hadNodes) {
      state.nodes = {};
      if (state.history.length)
        event(
          "workflow-migration",
          "保留既有输入、产物及数据库；未补造节点执行或人工验收记录。",
        );
    }
    const changed = hadNodes
      ? definitions
          .filter((n) =>
            state.graph
              ? state.graph[n.id] !== graph[n.id]
              : n.kind !== "source",
          )
          .map((n) => n.id)
      : [];
    for (const n of definitions) {
      state.nodes[n.id] ??= { status: "blocked", generation: 0 };
      const r = state.nodes[n.id];
      if (n.kind === "source") {
        r.files = materialList(r.files || (r.file ? [r.file] : []));
        r.file = r.files[0];
      }
    }
    if (changed.length && state.history.length) {
      invalidateMany(changed);
      event(
        "workflow-migration",
        "依赖关系已更新，相关确认与结果需重新执行；输入、素材、历史和数据库已保留。",
      );
    }
    state.graph = graph;
    reconcile();
    save();
  }
  function reconcile() {
    const state = getState();
    for (const n of definitions) {
      const r = state.nodes[n.id];
      if (["complete", "running", "failed"].includes(r.status)) continue;
      if (n.kind === "placeholder") {
        r.status = "blocked";
        continue;
      }
      const ready = n.deps.every(
        (id) => state.nodes[id]?.status === "complete",
      );
      // Legacy published artifacts retain explicit manual acceptance without inventing executions.
      const published =
        n.kind === "acceptance" &&
        state.stages[n.stage].status === "assembled" &&
        definitions
          .filter((p) => p.kind === "acceptance" && p.stage < n.stage)
          .every((p) => state.nodes[p.id]?.status === "complete");
      r.status = published
        ? "waiting"
        : ready
          ? "ready"
          : r.status === "invalidated"
            ? "invalidated"
            : "blocked";
    }
  }
  function invalidateMany(ids) {
    const state = getState(),
      affected = new Set(ids);
    let changed;
    do {
      changed = false;
      for (const n of definitions)
        if (!affected.has(n.id) && n.deps.some((d) => affected.has(d))) {
          affected.add(n.id);
          changed = true;
        }
    } while (changed);
    state.revision++;
    const stages = new Set();
    for (const id of affected) {
      const n = byId.get(id),
        old = state.nodes[id];
      if (!n || !old) continue;
      if (n.stage !== "04") stages.add(n.stage);
      state.nodes[id] = {
        status: old.status === "blocked" ? "blocked" : "invalidated",
        generation: (old.generation || 0) + 1,
        ...(old.input !== undefined ? { input: old.input } : {}),
        ...(old.file ? { file: old.file } : {}),
        ...(old.files ? { files: old.files } : {}),
      };
    }
    for (const stage of stages) {
      const s = state.stages[stage];
      s.revision++;
      delete s.acceptance;
      s.status = s.requirement ? "revised" : "empty";
    }
    state.latest =
      ["01", "02", "03"]
        .filter((s) => state.stages[s].status === "assembled")
        .at(-1) || null;
    event(
      "invalidated",
      JSON.stringify({ node: ids[0], affected: [...affected] }),
    );
    for (const [key, job] of jobs)
      if (affected.has(job.id)) {
        clearTimeout(job.timer);
        jobs.delete(key);
      }
  }
  const invalidate = (id) => invalidateMany([id]);
  function complete(n, output, execution) {
    const r = getState().nodes[n.id];
    Object.assign(r, { status: "complete", output, completedAt: now() });
    delete r.error;
    if (execution !== undefined) r.execution = execution;
    event(
      "node-completed",
      JSON.stringify({
        node: n.id,
        output,
        mode: n.kind === "process" ? "prepared" : n.kind,
        execution,
      }),
      n.stage,
    );
  }
  function launch(n) {
    const state = getState(),
      r = state.nodes[n.id],
      run = state.run;
    const key = `${run}:${n.id}:${r.generation || 0}`;
    if (jobs.has(key)) return;
    if (r.status !== "running") {
      r.status = "running";
      r.startedAt = now();
      r.durationMs =
        n.kind === "process" ? (delay ?? n.durationMs ?? 25000) : 0;
      event("node-started", n.id, n.stage);
    }
    const live = () =>
      !stopped &&
      getState().run === run &&
      getState().nodes[n.id] === r &&
      r.status === "running";
    const finish = async () => {
      try {
        if (!live()) return;
        const result = n.kind === "execution" ? await execute(n) : undefined;
        if (live()) complete(n, result?.summary || n.summary, result);
      } catch (error) {
        if (live()) {
          Object.assign(r, { status: "failed", error: error.message });
          event(
            "node-failed",
            JSON.stringify({ node: n.id, error: error.message }),
            n.stage,
          );
        }
      } finally {
        jobs.delete(key);
        if (
          live() ||
          (!stopped && getState().run === run && getState().nodes[n.id] === r)
        ) {
          reconcile();
          save();
          wake();
        }
      }
    };
    const remaining = Math.max(
      0,
      (r.durationMs ?? delay ?? n.durationMs ?? 0) -
        (Date.now() - Date.parse(r.startedAt)),
    );
    const job = {
      id: n.id,
      timer: setTimeout(() => {
        if (n.kind === "execution")
          executionQueue = executionQueue.then(finish, finish);
        else void finish();
      }, remaining),
    };
    jobs.set(key, job);
  }
  function tick() {
    timer = undefined;
    if (stopped) return;
    reconcile();
    const ready = definitions.filter(
      (n) =>
        automatic(n) &&
        ["ready", "running"].includes(getState().nodes[n.id].status),
    );
    ready.forEach(launch);
    if (ready.length) save();
  }
  function wake() {
    if (!stopped && !timer) timer = setTimeout(tick, 0);
  }
  function text(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 10000)
      fail("请填写说明（最多 10000 字）");
    return value;
  }
  function handle(body) {
    const state = getState();
    const n = definitions.find((n) => n.id === body.node);
    if (!n || n.kind === "placeholder") fail("节点不存在或尚未定义");
    let r = state.nodes[n.id];
    const action = body.action;
    // Safe duplicate delivery of an already acknowledged action.
    if (
      r.status === "complete" &&
      ((action === "confirm" && n.kind === "adjustment") ||
        (action === "accept" &&
          body.passed === true &&
          n.kind === "acceptance"))
    )
      return;
    if (body.revision !== undefined && body.revision !== state.revision)
      fail("节点已更新，请刷新后继续", 409);
    const ready = n.deps.every((d) => state.nodes[d]?.status === "complete");
    if (action === "import" && n.kind === "source") {
      const previous = r.files || (r.file ? materialList([r.file]) : []);
      const mode = body.mode || (body.file ? "replace" : "append");
      let files;
      if (mode === "remove") {
        if (typeof body.fileId !== "string") fail("请选择要移除的文件");
        files = previous.filter((f) => f.id !== body.fileId);
      } else if (mode === "reference") {
        files = materialList(
          (n.materials || []).map((f) => ({ ...f, prepared: true })),
        );
        if (!files.length) fail("参考素材尚未准备好");
      } else if (mode === "append" || mode === "replace") {
        const incoming = materialList(
          body.files || (body.file ? [body.file] : []),
        );
        if (!incoming.length) fail("请选择素材");
        files = materialList(
          mode === "append" ? [...previous, ...incoming] : incoming,
        );
      } else fail("素材操作无效");
      // Set equality keeps duplicate imports and reordered lists from invalidating work.
      if (
        files.length === previous.length &&
        files.every((f) => previous.some((p) => p.id === f.id))
      )
        return;
      invalidate(n.id);
      r = state.nodes[n.id];
      r.files = files;
      r.file = files[0];
      if (files.length) complete(n, `已导入 ${files.length} 份素材`);
      event("material", JSON.stringify({ node: n.id, mode, files }), n.stage);
    } else if (
      action === "submit" &&
      ["requirement", "adjustment"].includes(n.kind)
    ) {
      if (!ready) fail("请先完成上游交接与输入", 409);
      const value = text(body.text);
      if (r.input === value && (r.status === "complete" || r.submitted)) return;
      invalidate(n.id);
      r = state.nodes[n.id];
      r.input = value;
      r.submitted = true;
      const s = state.stages[n.stage];
      s[n.kind] = value;
      s.status = n.kind === "requirement" ? "draft" : "revised";
      if (n.kind === "requirement") s.adjustment = "";
      event(n.kind, JSON.stringify({ node: n.id, input: value }), n.stage);
      if (n.kind === "requirement") complete(n, value);
    } else if (action === "confirm" && n.kind === "adjustment") {
      if (!ready || !r.submitted) fail("请先提交调整并审阅差异", 409);
      state.stages[n.stage].status = "confirmed";
      complete(n, state.stages[n.stage].adjustment);
      event("confirmed", "方案已由操作员确认", n.stage);
    } else if (action === "accept" && n.kind === "acceptance") {
      if (
        r.status !== "waiting" ||
        state.stages[n.stage].status !== "assembled"
      )
        fail("成果尚未就绪", 409);
      const detail = text(body.detail);
      if (typeof body.passed !== "boolean") fail("请选择验收结果");
      const evidence = {
        id: n.id,
        detail,
        passed: body.passed,
        at: now(),
        revision: state.revision,
      };
      event("acceptance", JSON.stringify(evidence), n.stage);
      if (body.passed) {
        state.stages[n.stage].acceptance = evidence;
        complete(n, detail);
      } else {
        invalidate(`${n.stage}-adjustment`);
        const adjustment = state.nodes[`${n.stage}-adjustment`];
        adjustment.input = state.stages[n.stage].adjustment;
        adjustment.submitted = false;
        state.stages[n.stage].acceptance = evidence;
      }
    } else if (action === "retry" && automatic(n) && r.status === "failed") {
      if (!ready) fail("上游结果已失效", 409);
      r.status = "ready";
      delete r.error;
      event("node-retry", n.id, n.stage);
    } else fail("当前节点不支持此操作", 409);
    reconcile();
    save();
    wake();
  }
  prepare();
  return {
    handle,
    wake,
    prepare,
    reconcile,
    stop() {
      stopped = true;
      clearTimeout(timer);
      for (const job of jobs.values()) clearTimeout(job.timer);
      jobs.clear();
    },
  };
}
