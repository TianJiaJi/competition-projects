import { createServer } from "node:http";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { db } from "./database.ts";
import type { Session } from "./database.ts";
import { sources } from "./knowledge.ts";
import { routeQa } from "./routes/qa.ts";
import { active } from "./services/qa.ts";
import { body, json, fail } from "./http.ts";
import { configureScenicState } from "./services/scenic-state.ts";
import { seedContent } from "./platform/seed.ts";
import { startAI } from "./platform/ai.ts";
import { openStore } from "./platform/store.ts";
import { createPlatform } from "./platform/service.ts";
import { platformHttp } from "./platform/http.ts";
const platformStore = openStore();
await db.ready();
await db.startWriter();

const platform = createPlatform(platformStore);
await platform.restoreClocks();
await db.transaction(async()=>{
 const interrupted=await db.query("UPDATE messages SET status='interrupted',error_code='GENERATION_INTERRUPTED' WHERE status='generating' RETURNING id");
 if(interrupted.rowCount){const run=await platform.run();await db.query('INSERT INTO journal(run_id,business_time,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5)',[run.id,run.businessTime,'qa/recovered-interruption','system',JSON.stringify({messageIds:interrupted.rows.map(r=>r.id)})]);}
});
configureScenicState(async (id) => {
    try {
        return (await platform.snapshot(id)).public;
    }
    catch {
        return undefined;
    }
});
const platformApi = platformHttp(platform);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const limits = new Map<string, number[]>();
function allowed(key: string, max: number) {
    const now = Date.now(), times = (limits.get(key) || []).filter((t) => now - t < 60000);
    if (times.length >= max)
        return false;
    times.push(now);
    limits.set(key, times);
    return true;
}
let stopping=false;
const server = createServer(async (req, res) => {
    if(stopping){fail(res,503,'SHUTTING_DOWN','服务正在关闭');return;}
    const endpoint=new URL(req.url||'/','http://localhost').pathname;
    const origin = req.headers.origin;
    const permitted = (process.env.ALLOWED_ORIGINS || [5173, 5174, 5175, 5176, 5177, 5178, 5179].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]).join(",")).split(",");
    if (origin && !permitted.includes(origin)) {
        fail(res, 403, "ORIGIN_REJECTED", "当前站点未获准访问。");
        return;
    }
    if(endpoint==='/api/v1/health/live'){json(res,200,{ok:true});return;}
    if(endpoint==='/api/v1/health/ready'||endpoint==='/api/v1/health'){
      try{await db.ready();await platform.run();json(res,200,{ok:true,database:'postgresql',schemaVersion:2,model:process.env.DEEPSEEK_MODEL||'deepseek-flash',configured:Boolean(process.env.DEEPSEEK_API_KEY&&process.env.DEEPSEEK_BASE_URL)});}catch{fail(res,503,'DATABASE_NOT_READY','数据库尚未就绪');}return;
    }
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Run-Id,Idempotency-Key,X-Requested-With",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        });
        res.end();
        return;
    }
    try {
        if (await platformApi.route(req, res))
            return;
        const path = new URL(req.url || "/", "http://localhost").pathname;
        if (path === "/api/v1/health") {
            json(res, 200, {
                ok: true,
                model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
                configured: Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_BASE_URL),
            });
            return;
        }
        if (path === "/api/v1/auth/experience" && req.method === "POST") {
            if (process.env.SCENIC_LEGACY_EXPERIENCE !== "1") {
                fail(res, 410, "EXPERIENCE_RETIRED", "请使用游客账号注册或登录。");
                return;
            }
            if (!allowed("auth-" + req.socket.remoteAddress, 10)) {
                fail(res, 429, "RATE_LIMITED", "访问会话创建过于频繁，请稍后重试。");
                return;
            }
            const input = await body(req), nickname = typeof input.nickname === "string"
                ? input.nickname.trim().slice(0, 30)
                : "山间来客";
            const token = randomBytes(32).toString("hex"), id = randomUUID(), runId = "qa-run-" + randomUUID();
            (await db.prepare("INSERT INTO sessions VALUES ($1,$2,$3,$4,$5)").run(id, hash(token), nickname, runId, Date.now() + 7 * 86400000));
            json(res, 201, { token, runId, user: { id, nickname } });
            return;
        }
        const sourceMatch = path.match(/^\/api\/v1\/knowledge\/sources\/([^/]+)$/);
        if (sourceMatch && req.method === "GET") {
            const source = sources.find((s) => s.id === decodeURIComponent(sourceMatch[1]));
            if (!source) {
                fail(res, 404, "NOT_FOUND", "来源不存在。");
                return;
            }
            json(res, 200, { ...source, url: null });
            return;
        }
        const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
        const platformUser = (await platformApi.user(req));
        const session = platformUser ? { id: platformUser.id, nickname: platformUser.name, run_id: (await platformApi.runId(req)), expires: Date.now() + 3600000 } : (await db
            .prepare("SELECT * FROM sessions WHERE token_hash=$1 AND expires>$2")
            .get(hash(token), Date.now())) as Session | undefined;
        if (!session) {
            fail(res, 401, "AUTH_REQUIRED", "访问已过期，请重新进入。");
            return;
        }
        if (req.headers["x-run-id"] !== session.run_id) {
            fail(res, 409, "RUN_MISMATCH", "问答运行已变更，请重新进入。");
            return;
        }
        await routeQa(req, res, session, path);
    }
    catch (error) {
        if (!res.headersSent)
            fail(res, 400, "VALIDATION_ERROR", (error as Error).message.includes("JSON")
                ? "请求格式不正确。"
                : "请求无法处理，请检查输入。");
        else
            res.end();
    }
});
const closePlatform = platformApi.attach(server);
const closeAI = startAI(platform, platformApi.broadcast);
server.listen(Number(process.env.PORT || 8787), process.env.HOST || "127.0.0.1", () => {
    const address = server.address();
    console.log("Scenic QA listening on 127.0.0.1:" +
        (address && typeof address === "object"
            ? address.port
            : process.env.PORT));
});
for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
        if(stopping)return;stopping=true;
        const closed=new Promise<void>(resolve=>server.close(()=>resolve()));
        const tasks=[...active.values()];for(const task of tasks)task.controller.abort();
        await Promise.all([closeAI(),closePlatform(),...tasks.map(t=>t.done),closed]);
        await db.close();
        process.exit(0);
    });
