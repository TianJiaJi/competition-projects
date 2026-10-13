import type { IncomingMessage, ServerResponse } from "node:http";
import type { Session } from "../database.ts";
import { body, json, fail, sse } from "../http.ts";
import { sources } from "../knowledge.ts";
import { workbench, stopAnswer, listConversations, createConversation, getMessages, answerQuestion, QaError, } from "../services/qa.ts";
import { getScenicState, updateScenicState } from "../services/scenic-state.ts";
export async function routeQa(req: IncomingMessage, res: ServerResponse, session: Session, path: string) {
    try {
        if (path === "/api/v1/qa/workbench" && req.method === "GET") {
            json(res, 200, workbench(new URL(req.url!, "http://localhost").searchParams.get("poiId")));
            return;
        }
        if (path === "/api/v1/scenic/state" && req.method === "GET") {
            json(res, 200, (await getScenicState(session.run_id)));
            return;
        }
        if (path === "/api/v1/debug/scenic/state" && req.method === "POST") {
            json(res, 200, (await updateScenicState(session.run_id, await body(req))));
            return;
        }
        if (path === "/api/v1/knowledge/sources" && req.method === "GET") {
            json(res, 200, { items: sources });
            return;
        }
        const key = String(req.headers["idempotency-key"] || "");
        if (path === "/api/v1/qa/conversations") {
            if (req.method === "GET") {
                json(res, 200, { items: (await listConversations(session)) });
                return;
            }
            if (req.method === "POST") {
                json(res, 201, (await createConversation(session, await body(req), key)));
                return;
            }
        }
        const stop = path.match(/^\/api\/v1\/qa\/conversations\/([^/]+)\/messages\/([^/]+)\/stop$/);
        if (stop && req.method === "POST") {
            const result = await stopAnswer(session, stop[1], stop[2]);
            if (!result)
                fail(res, 404, "NOT_FOUND", "回答不存在。");
            else
                json(res, 200, result);
            return;
        }
        const match = path.match(/^\/api\/v1\/qa\/conversations\/([^/]+)\/messages$/);
        if (!match) {
            fail(res, 404, "NOT_FOUND", "接口不存在。");
            return;
        }
        if (req.method === "GET") {
            json(res, 200, {
                items: (await getMessages(session, match[1])),
                nextBefore: null,
            });
            return;
        }
        if (req.method !== "POST") {
            fail(res, 405, "METHOD_NOT_ALLOWED", "不支持此操作。");
            return;
        }
        const input = await body(req);
        const disconnected = new AbortController();
        const onClose = () => disconnected.abort();
        res.on("close", onClose);
        const heartbeat = setInterval(() => {
            if (res.headersSent && !res.destroyed)
                res.write(": heartbeat\n\n");
        }, 5000);
        try {
            await answerQuestion(session, match[1], input, key, {
                signal: disconnected.signal,
                begin(replay) {
                    if (replay)
                        res.setHeader("X-Stream-Replay", "true");
                    res.writeHead(200, {
                        "Content-Type": "text/event-stream;charset=utf-8",
                        "Cache-Control": "no-cache, no-transform",
                        "X-Accel-Buffering": "no",
                    });
                },
                emit(event, data) {
                    sse(res, event, data);
                },
            });
            res.end();
        }
        finally {
            clearInterval(heartbeat);
            res.off("close", onClose);
        }
    }
    catch (e) {
        if (e instanceof QaError && !res.headersSent) {
            fail(res, e.status, e.code, e.message);
            return;
        }
        throw e;
    }
}
