import { createWorkflow } from "./workflow.mjs";
import { createServer } from "node:http";
import {
  mkdirSync,
  statSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  definition as sampleDefinition,
  roles,
  assetFiles,
} from "../src/samples/school/index.ts";
import {
  openDatabase,
  initialize,
  snapshot,
  mutate,
  checks,
  audit,
  fail,
} from "./database.mjs";
import { materialMime } from "../src/samples/school/materials.ts";
const definition = {
  ...sampleDefinition,
  workflow: sampleDefinition.workflow.map((n) => ({
    ...n,
    ...(n.materials
      ? {
          materials: n.materials.map((f) => ({
            ...f,
            size: statSync(new URL("../assets/" + f.path, import.meta.url))
              .size,
          })),
        }
      : {}),
  })),
};
import {
  recordActions,
  serviceContract,
} from "../src/samples/school/service-contract.ts";
const stages = ["01", "02", "03"];
const origins = new Set(
  [5500, 5501, 5502, 5503, 5504, 5506].map((p) => `http://localhost:${p}`),
);
const now = () => new Date().toISOString();
const emptyStage = () => ({
  requirement: "",
  adjustment: "",
  revision: 0,
  status: "empty",
});
function fresh() {
  return {
    run: randomUUID(),
    caseId: definition.caseId,
    version: definition.version,
    startedAt: now(),
    stages: Object.fromEntries(stages.map((s) => [s, emptyStage()])),
    latest: null,
    revision: 0,
    history: [],
    checks: [],
    manual: [],
    sessions: {},
  };
}
export function createService(directory, options = {}) {
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "current.json");
  let state = existsSync(filename)
    ? JSON.parse(readFileSync(filename, "utf8"))
    : fresh();
  if (
    state.caseId !== definition.caseId ||
    state.version !== definition.version
  )
    throw Error(
      "持久化素材版本不匹配，请备份 .local/builder 后迁移；未覆盖原记录。",
    );
  let db;
  const save = () => {
    state.sequence = (state.sequence || 0) + 1;
    writeFileSync(filename + ".tmp", JSON.stringify(state, null, 2));
    renameSync(filename + ".tmp", filename);
  };
  const dbFile = () => path.join(directory, `run-${state.run}.sqlite`);
  const database = () => {
    if (!db) {
      if (!existsSync(dbFile())) fail("本轮数据库尚未初始化", 409);
      db = openDatabase(dbFile());
    }
    return db;
  };
  const event = (kind, detail, stage) =>
    state.history.push({ at: now(), kind, detail, stage });
  const publicState = () => {
    const { sessions, ...value } = state;
    return value;
  };
  save();
  let workflow;
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const respond = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(origins.has(origin)
          ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
          : {}),
      });
      res.end(JSON.stringify(value));
    };
    try {
      if (origin && !origins.has(origin)) fail("请求来源不匹配", 403);
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": origin || "http://localhost:5506",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Request-Id",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          Vary: "Origin",
        });
        res.end();
        return;
      }
      const url = new URL(req.url, "http://localhost:5507");
      const parts = url.pathname.split("/").filter(Boolean);
      const assetPath = decodeURIComponent(parts.slice(2).join("/"));
      if (
        parts[0] === "api" &&
        parts[1] === "assets" &&
        assetFiles.includes(assetPath) &&
        req.method === "GET"
      ) {
        const data = readFileSync(
          new URL("../assets/" + assetPath, import.meta.url),
        );
        res.writeHead(200, {
          "Content-Type": materialMime(assetPath),
          "X-Content-Type-Options": "nosniff",
          ...(assetPath.startsWith("material-pack")
            ? {
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(assetPath.split("/").at(-1))}`,
              }
            : {}),
          "Cache-Control": "no-store",
        });
        res.end(data);
        return;
      }
      if (url.pathname === "/api/health") {
        respond(200, { ok: true });
        return;
      }
      let body = {};
      if (!["GET", "HEAD"].includes(req.method)) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 100000) fail("请求过大", 413);
        }
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          fail("请求必须是 JSON");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          fail("请求内容无效");
      }
      const workbench = () => {
        if (origin && origin !== "http://localhost:5506")
          fail("此操作仅由工作台发起", 403);
      };
      if (url.pathname === "/api/workbench" && req.method === "GET") {
        respond(200, { definition, state: publicState() });
        return;
      }
      if (url.pathname === "/api/new" && req.method === "POST") {
        workbench();
        if (body.run !== state.run) fail("轮次已变化，请刷新工作台", 409);
        if (db) {
          db.close();
          db = undefined;
        }
        mkdirSync(path.join(directory, "history"), { recursive: true });
        writeFileSync(
          path.join(directory, "history", `${state.run}.json`),
          JSON.stringify(publicState(), null, 2),
        );
        for (const suffix of ["", "-wal", "-shm"])
          if (existsSync(dbFile() + suffix)) unlinkSync(dbFile() + suffix);
        state = fresh();
        workflow.prepare();
        save();
        respond(200, publicState());
        return;
      }
      if (parts[0] !== "api" || parts[1] !== "runs" || parts[2] !== state.run)
        fail("本轮成果已失效，请返回工作台打开最新成果", 410);
      const resource = parts[3];
      if (resource === "context" && req.method === "GET") {
        if (
          url.searchParams.get("caseId") !== state.caseId ||
          url.searchParams.get("version") !== state.version
        )
          fail("样例或素材版本不匹配", 409);
        if (!stages.includes(url.searchParams.get("stage")))
          fail("成果阶段无效");
        const stage = url.searchParams.get("stage");
        if (state.stages[stage].status !== "assembled")
          throw Object.assign(
            new Error("本阶段成果尚未就绪或已失效，请返回工作台"),
            { status: 409, code: "ARTIFACT_UNAVAILABLE" },
          );
        const terminal = url.searchParams.get("terminal");
        if (
          !definition.previews
            .find((p) => p.id === terminal)
            ?.stages.includes(stage)
        )
          fail("当前阶段没有此成果端", 409);
        respond(200, { stage, revision: state.stages[stage].revision });
        return;
      }
      if (resource === "node" && req.method === "POST") {
        workbench();
        workflow.handle(body);
        respond(200, publicState());
        return;
      }
      if (resource === "stage" && req.method === "POST") {
        workbench();
        fail("请使用节点操作，完成素材导入、调整确认和人工验收", 409);
      }
      if (resource === "checks" && req.method === "POST") {
        workbench();
        if (state.latest !== "03") fail("请完成数据与服务组装后执行检查", 409);
        const results = checks().map((result) => ({
          ...result,
          at: now(),
          revision: state.revision,
        }));
        state.checks.push(...results);
        event(
          "checks",
          `独立副本检查：${results.filter((r) => r.passed).length}/${results.length} 通过`,
        );
        save();
        respond(200, publicState());
        return;
      }
      if (resource === "manual" && req.method === "POST") {
        workbench();
        if (
          !definition.manual.some((m) => m.id === body.id) ||
          typeof body.passed !== "boolean" ||
          typeof body.detail !== "string" ||
          !body.detail.trim()
        )
          fail("通过或失败均需填写观察说明");
        state.manual.push({
          id: body.id,
          passed: body.passed,
          detail: body.detail.trim(),
          at: now(),
          revision: state.revision,
        });
        save();
        respond(200, publicState());
        return;
      }
      if (resource === "report" && req.method === "GET") {
        respond(200, {
          ...publicState(),
          definition,
          execution: existsSync(dbFile()) ? audit(database()) : [],
          notice:
            "自动检查、人工观察与真人排练为不同证据；预制方案不代表实际执行通过。",
        });
        return;
      }
      if (resource === "session" && req.method === "POST") {
        const accounts = Object.fromEntries(
          Object.entries(serviceContract.sessions.credentials).map(
            ([role, username]) => [username, role],
          ),
        );
        const role = accounts[body.username];
        if (
          !role ||
          body.password !== serviceContract.sessions.password ||
          body.terminal !== role
        )
          fail("账号或密码不正确", 401);
        const token = randomUUID();
        state.sessions[token] = { role, username: body.username };
        save();
        respond(200, { token, identity: roles[role], username: body.username });
        return;
      }
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      const session = state.sessions[token];
      if (resource === "session" && req.method === "DELETE") {
        delete state.sessions[token];
        save();
        respond(200, { ok: true });
        return;
      }
      if (resource === "session" && req.method === "GET") {
        if (!session) fail("请重新登录", 401);
        respond(200, { ...session, identity: roles[session.role] });
        return;
      }
      if (resource === "records") {
        if (
          state.stages["03"].status !== "assembled" &&
          !(
            req.method === "GET" &&
            state.nodes?.["03-database"]?.status === "complete"
          )
        )
          fail("当前成果尚未连接数据服务", 409);
        if (req.method === "GET") {
          respond(200, { records: snapshot(database()), updatedAt: now() });
          return;
        }
        if (!session) fail("请先登录", 401);
        if (parts[6] && !recordActions.includes(parts[6])) fail("未知操作");
        const c = parts[4],
          id = parts[5];
        if (
          !(
            (req.method === "PUT" && id && !parts[6]) ||
            (req.method === "POST" && (!id || parts[6]))
          )
        )
          fail("请求方法不匹配", 405);
        const result = mutate(
          database(),
          session,
          c,
          id,
          parts[6] || "save",
          body,
          req.headers["x-request-id"],
        );
        respond(200, {
          ...result,
          records: snapshot(database()),
          updatedAt: now(),
        });
        return;
      }
      fail("接口不存在", 404);
    } catch (error) {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        event("failure", error.message);
        save();
      }
      respond(error.status || 500, { error: error.message, code: error.code });
    }
  });
  workflow = createWorkflow({
    definition,
    getState: () => state,
    save,
    event,
    delay:
      options.nodeDelay ??
      (process.env.DEMO_NODE_DELAY_MS
        ? Number(process.env.DEMO_NODE_DELAY_MS)
        : undefined),
    execute: async (node) => {
      if (node.action === "initialize") {
        const result = initialize(databaseForAssembly());
        event("database", JSON.stringify(result), node.stage);
        return { summary: "数据库初始化完成，关联查询已返回结果。", ...result };
      }
      if (node.action === "connect") {
        const address = server.address();
        const host =
          address.family === "IPv6" ? `[${address.address}]` : address.address;
        const base = `http://${host}:${address.port}`;
        const results = [];
        for (const route of ["/api/health", `/api/runs/${state.run}/records`]) {
          const response = await fetch(base + route, {
            signal: AbortSignal.timeout(5000),
          });
          const data = await response.json();
          if (
            !response.ok ||
            (route.endsWith("records") ? !data.records : !data.ok)
          )
            throw Error(data.error || "服务连接检查失败");
          results.push({
            route,
            status: response.status,
            at: now(),
            collections: data.records ? Object.keys(data.records) : undefined,
          });
        }
        return {
          summary: "服务已响应，本轮业务数据读取成功。",
          requests: results,
        };
      }
      if (node.action === "publish") {
        state.stages[node.stage].status = "assembled";
        state.latest = node.stage;
        event("assembled", "成果已生成，等待人工验收", node.stage);
        return { summary: "成果已生成，可打开页面并登记验收观察。" };
      }
      throw Error("执行动作未配置");
    },
  });
  function databaseForAssembly() {
    if (!db) db = openDatabase(dbFile());
    return db;
  }
  server.on("listening", () => workflow.wake());
  server.on("close", () => {
    workflow.stop();
    if (db) {
      db.close();
      db = undefined;
    }
  });
  return server;
}
