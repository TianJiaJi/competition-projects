import { randomUUID, createHash } from "node:crypto";
import { db } from "../database.ts";
import type { Session, Conversation, Message } from "../database.ts";
import { contextFor, sources } from "../knowledge.ts";
import { generate } from "../model.ts";
import { getScenicState, scenic } from "./scenic-state.ts";
import type { QaWorkbench, QaEvent, QaMessage, } from "../../../../packages/contracts/src/mobile-qa.ts";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const active = new Map<string, {
    controller: AbortController;
    messageId: string;
    done: Promise<void>;
}>();
const limits = new Map<string, number[]>();
function allowed(key: string, max: number) {
    const now = Date.now(), times = (limits.get(key) || []).filter((t) => now - t < 60000);
    if (times.length >= max)
        return false;
    times.push(now);
    limits.set(key, times);
    return true;
}
const publicMessage = (m: Message): QaMessage & {
    sourceIds: string[];
} => ({
    id: m.id,
    role: m.role,
    text: m.text,
    status: m.status,
    sources: JSON.parse(m.sources),
    sourceIds: JSON.parse(m.sources).map((s: {
        id: string;
    }) => s.id),
    createdAt: m.created_at,
    errorCode: m.error_code,
});
export function workbench(poiId: string | null): QaWorkbench {
    const poi = poiId
        ? scenic.points.find((p: {
            id: string;
        }) => p.id === poiId)
        : null;
    if (poiId && !poi)
        throw Error("未知景点");
    return {
        context: poi ? { id: poi.id, name: poi.name } : null,
        categories: [
            {
                id: "points",
                title: "景点介绍",
                questions: [
                    poi ? `介绍一下${poi.name}` : "镜湖栈道有哪些风景？",
                    "有哪些适合拍照的景点？",
                    "有哪些值得了解的山水故事？",
                ],
            },
            {
                id: "routes",
                title: "路线建议",
                questions: [
                    "如何选择适合自己的路线？",
                    "带老人和孩子适合怎么游览？",
                    "两小时可以游览哪些地方？",
                ],
            },
            {
                id: "rules",
                title: "游览须知",
                questions: [
                    "有哪些游览注意事项？",
                    "景区什么时候停止入园？",
                    poi ? `${poi.name}现在开放吗？` : "镜湖栈道现在开放吗？",
                ],
            },
        ],
    };
}
export async function stopAnswer(session: Session, conversationId: string, messageId: string) {
    const message = (await db
        .prepare("SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.id=$2 AND c.owner=$3 AND c.run_id=$4")
        .get(messageId, conversationId, session.id, session.run_id)) as Message | undefined;
    if (!message || message.role !== "assistant")
        return null;
    const running = active.get(session.id);
    if (running?.messageId === messageId) {
        running.controller.abort("user-stop");
        await running.done;
    }
    return publicMessage((await db
        .prepare("SELECT * FROM messages WHERE id=$1")
        .get(messageId)) as unknown as Message);
}
export class QaError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export async function listConversations(session: Session) {
    return (await db
        .prepare("SELECT id,poi_id AS \"poiId\",created_at AS \"createdAt\" FROM conversations WHERE owner=$1 AND run_id=$2 ORDER BY created_at DESC")
        .all(session.id, session.run_id));
}
async function ownedConversation(session: Session, id: string) {
    const conv = (await db
        .prepare("SELECT * FROM conversations WHERE id=$1 AND owner=$2 AND run_id=$3")
        .get(id, session.id, session.run_id)) as Conversation | undefined;
    if (!conv)
        throw new QaError(404, "NOT_FOUND", "会话不存在。");
    return conv;
}
async function readMessages(id: string) {
    return (await db
        .prepare("SELECT * FROM messages WHERE conversation_id=$1 ORDER BY seq")
        .all(id)) as unknown as Message[];
}
export async function getMessages(session: Session, id: string) {
    return (await readMessages((await ownedConversation(session, id)).id)).map(publicMessage);
}
export async function createConversation(session: Session, input: Record<string, unknown>, key: string) {
    return db.transaction(async () => {
    const poiId = typeof input.poiId === "string" ? input.poiId : null;
    if (poiId && !sources.some((s) => s.id === "poi-" + poiId)) {
        throw new QaError(400, "VALIDATION_ERROR", "未知景点。");
    }
    if (key.length < 8 || key.length > 128) {
        throw new QaError(400, "VALIDATION_ERROR", "缺少有效请求编号。");
    }
    const fingerprint = hash(JSON.stringify({ poiId })), scope = "create-" + session.id;
    const prior = (await db
        .prepare("SELECT * FROM attempts WHERE scope=$1 AND request_key=$2")
        .get(scope, key)) as {
        fingerprint: string;
        message_id: string;
    } | undefined;
    if (prior) {
        if (prior.fingerprint !== fingerprint) {
            throw new QaError(409, "IDEMPOTENCY_CONFLICT", "请求编号冲突。");
        }
        const old = (await db
            .prepare("SELECT * FROM conversations WHERE id=$1")
            .get(prior.message_id)) as unknown as Conversation;
        return {
            id: old.id,
            poiId: old.poi_id,
            createdAt: old.created_at,
        };
        return;
    }
    const id = randomUUID(), createdAt = new Date().toISOString();
    await db.transaction(async () => {
        (await db.prepare("INSERT INTO conversations VALUES ($1,$2,$3,$4,$5)").run(id, session.id, session.run_id, poiId, createdAt));
        (await db.prepare("INSERT INTO attempts VALUES ($1,$2,$3,$4)").run(scope, key, fingerprint, id));
    });
    return { id, poiId, createdAt };
    return;
    });
}

export interface AnswerStream {
    begin: (replay: boolean) => void;
    emit: <K extends keyof QaEvent>(event: K, data: QaEvent[K]) => void;
    signal: AbortSignal;
}
export async function answerQuestion(session: Session, conversationId: string, input: Record<string, unknown>, key: string, stream: AnswerStream) {
    const reservation = await db.transaction(async () => {
    const conv = (await ownedConversation(session, conversationId));
    const history = async () => (await readMessages(conv.id));
    let text = typeof input.text === "string" ? input.text.trim() : "";
    const retryOf = typeof input.retryOf === "string" ? input.retryOf : null;
    let retryParent: Message | undefined;
    if (retryOf) {
        const old = (await history()).find((m) => m.id === retryOf &&
            m.role === "assistant" &&
            ["failed", "interrupted", "stopped"].includes(m.status));
        retryParent =
            old && (await history()).find((m) => m.id === old.parent_id && m.role === "user");
        if (!retryParent) {
            throw new QaError(400, "VALIDATION_ERROR", "无法重试这条消息。");
        }
        text = retryParent.text;
    }
    if (!text || text.length > 1200) {
        throw new QaError(400, "VALIDATION_ERROR", "问题应为 1—1200 字。");
    }
    if (key.length < 8 || key.length > 128) {
        throw new QaError(400, "VALIDATION_ERROR", "缺少有效请求编号。");
    }
    const fingerprint = hash(JSON.stringify({ text, retryOf }));
    const prior = (await db
        .prepare("SELECT * FROM attempts WHERE scope=$1 AND request_key=$2")
        .get(conv.id, key)) as {
        fingerprint: string;
        message_id: string;
    } | undefined;
    if (prior) {
        if (prior.fingerprint !== fingerprint) {
            throw new QaError(409, "IDEMPOTENCY_CONFLICT", "相同请求编号的内容不一致。");
        }
        const old = (await db
            .prepare("SELECT * FROM messages WHERE id=$1")
            .get(prior.message_id)) as unknown as Message;
        if (old.status === "generating") {
            throw new QaError(409, "AI_REQUEST_IN_PROGRESS", "回答仍在生成。");
        }
        stream.begin(true);
        stream.emit("start", { conversationId: conv.id, messageId: old.id });
        if (old.text)
            stream.emit("delta", { text: old.text });
        stream.emit("sources", { sources: JSON.parse(old.sources) });
        stream.emit(old.status === "completed" ? "done" : "error", {
            status: old.status,
            message: old.status === "stopped" ? "已停止回答。" : "回答未完成，请稍后重试。",
            code: old.error_code,
        });
        return;
    }
    if (active.has(session.id) || (await db.query("SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner=$1 AND m.status='generating' LIMIT 1",[session.id])).rows.length) {
        throw new QaError(409, "AI_REQUEST_IN_PROGRESS", "请等待当前回答完成。");
    }
    if (!allowed("qa-" + session.id, 5)) {
        throw new QaError(429, "RATE_LIMITED", "提问较频繁，请稍后重试。");
    }
    const userId = retryParent?.id || randomUUID();
    const messageId = randomUUID(), createdAt = new Date().toISOString();
    await db.transaction(async () => {
        if (!retryOf)
            (await db.prepare("INSERT INTO messages(id,conversation_id,role,text,status,sources,created_at,error_code,parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)").run(userId, conv.id, "user", text, "completed", "[]", createdAt, null, null));
        (await db.prepare("INSERT INTO messages(id,conversation_id,role,text,status,sources,created_at,error_code,parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)").run(messageId, conv.id, "assistant", "", "generating", "[]", createdAt, null, userId));
        (await db.prepare("INSERT INTO attempts VALUES ($1,$2,$3,$4)").run(conv.id, key, fingerprint, messageId));
    });
    return {conv,history,text,messageId};
    });
    if(!reservation)return;
    const {conv,history,text,messageId}=reservation;
    const controller = new AbortController();
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
    });
    active.set(session.id, { controller, messageId, done });
    let requestedStop = false;
    controller.signal.addEventListener("abort", () => {
        requestedStop = controller.signal.reason === "user-stop";
    });
    let answer = "", finished = false, timedOut = false;
    const stop = () => {
        if (!finished)
            controller.abort();
    };
    stream.signal.addEventListener("abort", stop);
    if (stream.signal.aborted)
        stop();
    const first = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, 20000);
    const total = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, 90000);
    stream.begin(false);
    stream.emit("start", {
        conversationId: conv.id,
        messageId,
        runId: session.run_id,
    });
    let selected: ReturnType<typeof contextFor> = [];
    try {
        selected = contextFor(text, conv.poi_id, await getScenicState(session.run_id));
        const past = (await history()).filter((m) => m.role === "user" ||
            (m.role === "assistant" && m.status === "completed"))
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.text }));
        if (past.at(-1)?.content !== text || past.at(-1)?.role !== "user")
            past.push({ role: "user", content: text });
        await generate(past, selected, async (chunk) => {
            clearTimeout(first);
            answer += chunk;
            (await db.prepare("UPDATE messages SET text=$1 WHERE id=$2").run(answer, messageId));
            stream.emit("delta", { text: chunk, messageId });
        }, controller.signal);
        if (controller.signal.aborted)
            throw Error("GENERATION_INTERRUPTED");
        if (!answer.trim())
            throw Error("GENERATION_INTERRUPTED");
        const cited = selected.flatMap((source, index) => answer.includes(`[K${index + 1}]`)
            ? [{ ...source, citation: `K${index + 1}` }]
            : []);
        (await db.prepare("UPDATE messages SET text=$1,status=$2,sources=$3 WHERE id=$4").run(answer, "completed", JSON.stringify(cited), messageId));
        finished = true;
        stream.emit("sources", { sources: cited });
        stream.emit("done", { messageId, status: "completed" });
    }
    catch (e) {
        const raw = (e as Error).message;
        const code = timedOut
            ? "MODEL_TIMEOUT"
            : controller.signal.aborted
                ? "GENERATION_INTERRUPTED"
                : [
                    "RATE_LIMITED",
                    "MODEL_UNAVAILABLE",
                    "GENERATION_INTERRUPTED",
                ].includes(raw)
                    ? raw
                    : "MODEL_UNAVAILABLE";
        const status = requestedStop
            ? "stopped"
            : answer
                ? "interrupted"
                : "failed";
        const cited = selected.flatMap((source, index) => answer.includes(`[K${index + 1}]`)
            ? [{ ...source, citation: `K${index + 1}` }]
            : []);
        (await db.prepare("UPDATE messages SET text=$1,status=$2,error_code=$3,sources=$4 WHERE id=$5").run(answer, status, code, JSON.stringify(cited), messageId));
        stream.emit("sources", { sources: cited });
        finished = true;
        stream.emit("error", {
            messageId,
            code,
            status,
            partial: Boolean(answer),
            message: requestedStop ? "已停止回答。" : "回答未完成，请稍后重试。",
        });
    }
    finally {
        finished = true;
        clearTimeout(first);
        clearTimeout(total);
        active.delete(session.id);
        resolveDone();
        stream.signal.removeEventListener("abort", stop);
    }
}
