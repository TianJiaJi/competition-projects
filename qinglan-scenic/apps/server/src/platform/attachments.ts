import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Account } from "../../../../packages/contracts/src/platform.ts";
import { assert, type Store } from "./store.ts";
import { json } from "../http.ts";
const directory = resolve(process.env.UPLOAD_DIR || "data/uploads");
export async function attachments(
  store: Store,
  user: Account,
  runId: string,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
) {
  if (!/^\/attachments(?:\/|$)/.test(path)) return false;
  assert(
    ["staff", "admin"].includes(user.role),
    "FORBIDDEN",
    "需要员工权限",
    403,
  );
  if (req.method === "POST" && path === "/attachments") {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      assert(
        size <= 5 * 1024 * 1024,
        "PAYLOAD_TOO_LARGE",
        "照片不能超过5MB",
        413,
      );
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    let type = "";
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      type = "image/png";
    else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
      type = "image/jpeg";
    else if (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    )
      type = "image/webp";
    assert(type, "VALIDATION_ERROR", "仅支持PNG、JPEG或WebP照片", 400);
    const id = randomUUID();
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, id), buffer, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      await store.transaction(() =>
        store.put(
          "attachments",
          id,
          {
            id,
            userId: user.id,
            type,
            size,
            createdAt: new Date().toISOString(),
          },
          runId,
        ),
      );
    } catch (e) {
      await unlink(resolve(directory, id));
      throw e;
    }
    json(res, 201, { id, type, size });
    return true;
  }
  assert(req.method === "GET", "METHOD_NOT_ALLOWED", "不支持此方法", 405);
  const id = path.split("/")[2];
  assert(/^[a-f0-9-]{36}$/.test(id), "NOT_FOUND", "照片不存在", 404);
  const item = await store.get<any>("attachments", id, runId);
  assert(item, "NOT_FOUND", "照片不存在", 404);
  if (user.role !== "admin" && item.userId !== user.id) {
    const work = await store.list<any>("work-orders", runId);
    assert(
      work.some(
        (w) =>
          w.assigneeId === user.id &&
          w.records.some((r: any) => (r.photoIds || []).includes(id)),
      ),
      "FORBIDDEN",
      "无权读取照片",
      403,
    );
  }
  const buffer = await readFile(resolve(directory, id));
  res.writeHead(200, {
    "Content-Type": item.type,
    "Content-Length": buffer.length,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(buffer);
  return true;
}
