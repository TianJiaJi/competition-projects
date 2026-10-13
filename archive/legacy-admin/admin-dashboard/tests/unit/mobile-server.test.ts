import {testStore} from '../helpers/postgres';
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
let service: ChildProcess,
  base = "",
  calls = 0,
  truncateNext = false,
  holdNext = false,
  lastPayload: any = null;
let fixture:Awaited<ReturnType<typeof testStore>>;
let serverEnv: NodeJS.ProcessEnv;
const sockets = new Set<import("node:net").Socket>();
const upstream = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    lastPayload = JSON.parse(raw);
    calls++;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(
      "data: " +
        JSON.stringify({
          choices: [{ delta: { content: "这是测试回答。[K1]" } }],
        }) +
        "\n\n",
    );
    if (truncateNext) {
      truncateNext = false;
      res.end();
      return;
    }
    if (holdNext) {
      holdNext = false;
      return;
    }
    res.end("data: [DONE]\n\n");
  });
});
beforeAll(async () => {
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  upstream.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  const address = upstream.address() as { port: number };
  mkdirSync(".local", { recursive: true });
  const dir = mkdtempSync(".local/qa-test-");
  fixture=await testStore();
  serverEnv = {
    ...process.env,
    PORT: "0",
    DATABASE_URL: fixture.url,
    SCENIC_LEGACY_EXPERIENCE: "1",
    DEEPSEEK_BASE_URL: "http://127.0.0.1:" + address.port,
    DEEPSEEK_API_KEY: "test-only",
    DEEPSEEK_MODEL: "test-only",
  };
  await startService();
});
async function startService() {
  let stderr="";
  base = "";
  service = spawn(process.execPath, ["apps/server/src/index.ts"], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stderr!.on("data",chunk=>{stderr+=String(chunk);});
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("QA server start timed out")),
      30000,
    );
    service.stdout!.on("data", (chunk) => {
      const match = String(chunk).match(/listening on (127\.0\.0\.1:\d+)/);
      if (match) {
        base = "http://" + match[1] + "/api/v1";
        clearTimeout(timer);
        resolve();
      }
    });
    service.on("exit", (code) => {
      if (!base) {
        clearTimeout(timer);
        reject(Error("QA server exited " + code+"\n"+stderr));
      }
    });
  });
}
afterAll(async () => {
  if(service&&!service.killed&&service.exitCode===null&&service.signalCode===null){service.kill("SIGTERM");await new Promise<void>(resolve=>service.once("exit",()=>resolve()));}
  if(fixture)await fixture.close();
  for (const s of sockets) s.destroy();
  await new Promise<void>((r) => upstream.close(() => r()));
});
async function identity() {
  const res = await fetch(base + "/auth/experience", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"nickname":"测试身份"}',
  });
  const value = (await res.json()).data;
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + value.token,
    "X-Run-Id": value.runId,
    "Idempotency-Key": crypto.randomUUID(),
  };
}
async function conversation(headers: Record<string, string>) {
  const res = await fetch(base + "/qa/conversations", {
    method: "POST",
    headers,
    body: "{}",
  });
  return (await res.json()).data.id as string;
}
describe("minimal QA API with an explicitly fake upstream", () => {
  it("isolates visitor histories and rejects foreign origins", async () => {
    const a = await identity(),
      b = await identity(),
      id = await conversation(a);
    expect(
      (
        await fetch(base + "/qa/conversations/" + id + "/messages", {
          headers: b,
        })
      ).status,
    ).toBe(404);
    const other = { ...b, "X-Run-Id": a["X-Run-Id"] };
    expect(
      (
        await fetch(base + "/qa/conversations/" + id + "/messages", {
          headers: other,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fetch(base + "/health", {
          headers: { Origin: "https://untrusted.invalid" },
        })
      ).status,
    ).toBe(403);
  });
  it("persists stream results and replays an identical key without another model call", async () => {
    const headers = await identity(),
      id = await conversation(headers);
    headers["Idempotency-Key"] = crypto.randomUUID();
    const before = calls;
    const url = base + "/qa/conversations/" + id + "/messages";
    const init = { method: "POST", headers, body: '{"text":"介绍一下景区"}' };
    const first = await fetch(url, init),
      text = await first.text();
    expect(text).toContain("event: done");
    expect(text).toContain("visit-rules");
    const second = await fetch(url, init);
    expect(second.headers.get("X-Stream-Replay")).toBe("true");
    await second.text();
    expect(calls - before).toBe(1);
    const history = (await (await fetch(url, { headers })).json()).data.items;
    expect(history).toHaveLength(2);
    expect(history[1].status).toBe("completed");
    expect(
      (await fetch(url, { ...init, body: '{"text":"另一个问题"}' })).status,
    ).toBe(409);
  });
  it("preserves interrupted output and retries without duplicating the question", async () => {
    const headers = await identity(),
      id = await conversation(headers);
    headers["Idempotency-Key"] = crypto.randomUUID();
    const url = base + "/qa/conversations/" + id + "/messages";
    truncateNext = true;
    const stream = await (
      await fetch(url, {
        method: "POST",
        headers,
        body: '{"text":"中断重试验证"}',
      })
    ).text();
    expect(stream).toContain("event: error");
    const history = (await (await fetch(url, { headers })).json()).data.items;
    expect(history[1].status).toBe("interrupted");
    expect(history[1].text).toContain("这是测试回答");
    headers["Idempotency-Key"] = crypto.randomUUID();
    const retry = await (
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ retryOf: history[1].id }),
      })
    ).text();
    expect(retry).toContain("event: done");
    const after = (await (await fetch(url, { headers })).json()).data.items;
    expect(
      after.filter((m: { role: string }) => m.role === "user"),
    ).toHaveLength(1);
    expect(after.at(-1).status).toBe("completed");
  });
  it("serves baseline public source details without granting history access", async () => {
    const res = await fetch(base + "/knowledge/sources/poi-lake");
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("poi-lake");
    expect((await fetch(base + "/knowledge/sources/missing")).status).toBe(404);
  });
  it("does not accept arbitrary or missing user identities", async () => {
    expect(
      (
        await fetch(base + "/qa/conversations", {
          headers: { Authorization: "Bearer made-up" },
        })
      ).status,
    ).toBe(401);
  });
});

describe("server-owned workbench and scenic state", () => {
  it("validates context and stores isolated state, ignoring forged client snapshots", async () => {
    const a = await identity(),
      b = await identity();
    const bench = await fetch(base + "/qa/workbench?poiId=lake", {
      headers: a,
    });
    const workbench = (await bench.json()).data;
    expect(workbench.context.name).toBe("镜湖栈道");
    expect(workbench.categories.map((c: any) => c.title)).toEqual([
      "景点介绍",
      "路线建议",
      "游览须知",
    ]);
    expect(
      (await fetch(base + "/qa/workbench?poiId=missing", { headers: a }))
        .status,
    ).toBe(400);
    const other = (
      await (await fetch(base + "/scenic/state", { headers: b })).json()
    ).data;
    const availability =
      other.points.lake.availability === "open" ? "closed" : "open";
    const changed = await fetch(base + "/debug/scenic/state", {
      method: "POST",
      headers: a,
      body: JSON.stringify({
        kind: "point",
        id: "lake",
        availability,
        load: "busy",
      }),
    });
    expect(changed.status).toBe(200);
    expect((await changed.json()).data.points.lake).toEqual({
      availability,
      load: "busy",
    });
    expect(
      (await (await fetch(base + "/scenic/state", { headers: b })).json()).data,
    ).toEqual(other);
    expect(
      (
        await fetch(base + "/debug/scenic/state", {
          method: "POST",
          headers: a,
          body: JSON.stringify({
            kind: "point",
            id: "lake",
            availability: "fake",
          }),
        })
      ).status,
    ).toBe(400);
    const id = await conversation(a);
    a["Idempotency-Key"] = crypto.randomUUID();
    await (
      await fetch(base + "/qa/conversations/" + id + "/messages", {
        method: "POST",
        headers: a,
        body: JSON.stringify({
          text: "镜湖栈道现在开放吗？",
          snapshot: {
            lake: {
              availability: availability === "open" ? "closed" : "open",
              load: "quiet",
            },
          },
        }),
      })
    ).text();
    expect(lastPayload.messages[0].content).toContain(
      "镜湖栈道：开放状态=" +
        (availability === "open" ? "开放" : "暂时关闭") +
        "，忙闲=拥堵",
    );
  });
  it("stops on the server, preserves partial text, and safely repeats stop", async () => {
    const a = await identity(),
      b = await identity();
    const id = await conversation(a),
      url = base + "/qa/conversations/" + id + "/messages";
    a["Idempotency-Key"] = crypto.randomUUID();
    holdNext = true;
    const response = await fetch(url, {
      method: "POST",
      headers: a,
      body: JSON.stringify({ text: "请介绍山水" }),
    });
    const reader = response.body!.getReader();
    let stream = "";
    while (!stream.includes("event: delta"))
      stream += new TextDecoder().decode((await reader.read()).value);
    const history = (await (await fetch(url, { headers: a })).json()).data
      .items;
    const messageId = history[1].id;
    const stopUrl = url + "/" + messageId + "/stop";
    expect((await fetch(stopUrl, { method: "POST", headers: b })).status).toBe(
      404,
    );
    const stopped = (
      await (await fetch(stopUrl, { method: "POST", headers: a })).json()
    ).data;
    expect(stopped.status).toBe("stopped");
    expect(stopped.text).toContain("这是测试回答");
    expect(
      (await (await fetch(stopUrl, { method: "POST", headers: a })).json())
        .data,
    ).toEqual(stopped);
    await reader.cancel();
    a["Idempotency-Key"] = crypto.randomUUID();
    const retry = await (
      await fetch(url, {
        method: "POST",
        headers: a,
        body: JSON.stringify({ retryOf: messageId, text: "篡改原问题" }),
      })
    ).text();
    expect(retry).toContain("event: done");
    expect(lastPayload.messages.at(-1).content).toBe("请介绍山水");
    const after = (await (await fetch(url, { headers: a })).json()).data.items;
    expect(after.filter((m: any) => m.role === "user")).toHaveLength(1);
    a["Idempotency-Key"] = crypto.randomUUID();
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: a,
          body: JSON.stringify({ retryOf: after.at(-1).id }),
        })
      ).status,
    ).toBe(400);
  });
});

it("recovers a hard interruption with partial output and persisted scenic state", async () => {
  const headers = await identity();
  const id = await conversation(headers);
  await fetch(base + "/debug/scenic/state", {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "point", id: "lake", availability: "open" }),
  });
  headers["Idempotency-Key"] = crypto.randomUUID();
  holdNext = true;
  const response = await fetch(base + "/qa/conversations/" + id + "/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "重启前的回答" }),
  });
  const reader = response.body!.getReader();
  let stream = "";
  while (!stream.includes("event: delta"))
    stream += new TextDecoder().decode((await reader.read()).value);
  await new Promise<void>((resolve) => {
    service.once("exit", () => resolve());
    service.kill("SIGKILL");
  });
  await reader.cancel().catch(() => {});
  await startService();
  const history = (
    await (
      await fetch(base + "/qa/conversations/" + id + "/messages", { headers })
    ).json()
  ).data.items;
  expect(history[1].status).toBe("interrupted");
  expect(history[1].text).toContain("这是测试回答");
  expect(
    (await (await fetch(base + "/scenic/state", { headers })).json()).data
      .points.lake.availability,
  ).toBe("open");
});
