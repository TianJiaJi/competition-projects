import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
export function json(
  res: ServerResponse,
  status: number,
  data: unknown,
  error = false,
) {
  res.writeHead(status, {
    "Content-Type": "application/json;charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(
    JSON.stringify({
      [error ? "error" : "data"]: data,
      meta: { requestId: randomUUID(), generatedAt: new Date().toISOString(), ...(res.getHeader("X-Run-Id")?{runId:res.getHeader("X-Run-Id"),revision:Number(res.getHeader("X-Revision"))}:{}) },
    }),
  );
}
export function fail(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
) {
  json(res, status, { code, message }, true);
}
export class RequestBodyError extends Error {
  status:number;code:string;
  constructor(message:string,status=400,code='VALIDATION_ERROR'){super(message);this.status=status;this.code=code;}
}
export async function body(req: IncomingMessage) {
  let value = "";
  for await (const chunk of req) {
    value += chunk;
    if (Buffer.byteLength(value) > 80_000) throw new RequestBodyError("请求内容过大。",413,"PAYLOAD_TOO_LARGE");
  }
  let parsed:unknown;
  try{parsed=JSON.parse(value||"{}");}catch{throw new RequestBodyError("请求格式不正确。");}
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RequestBodyError("请求格式不正确。");
  return parsed as Record<string, unknown>;
}
export function sse(res: ServerResponse, event: string, data: unknown) {
  if (!res.destroyed)
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
