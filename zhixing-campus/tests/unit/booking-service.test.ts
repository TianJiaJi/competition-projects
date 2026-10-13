import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createBookingServer } from "../../scripts/booking-service.mjs";
import { scenario } from "../../scenario/config";
import { todayInShanghai } from "../../packages/bookings/src";

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (directory) rmSync(directory, { recursive: true, force: true });
  server = undefined;
  directory = undefined;
});

it("学生申请、管理员审核、冲突检查、取消与持久化", async () => {
  directory = mkdtempSync(join(tmpdir(), "campus-bookings-"));
  const dataFile = join(directory, "bookings.json");
  server = createBookingServer({ dataFile });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server!.address();
  if (!address || typeof address === "string") throw new Error("测试服务未启动");
  let base = `http://127.0.0.1:${address.port}`;
  async function call(path: string, method = "GET", body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, payload: await response.json() };
  }
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const input = {
    facilityId: scenario.seed.facilities.find((item) => item.capacity && item.status === "正常")!.id,
    owner: "林悦",
    date,
    time: "09:00–10:00",
    count: 3,
    purpose: "小组讨论",
  };
  expect((await call("/api/bookings", "POST", { ...input, facilityId: "F2" })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...input, date: "2020-01-01" })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...input, date: "2026-02-30" })).status).toBe(400);
  expect(todayInShanghai()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const created = await call("/api/bookings", "POST", input);
  expect(created.status).toBe(201);
  expect(created.payload.data.status).toBe("pending");
  const id = created.payload.data.id as string;
  expect((await call("/api/bookings", "POST", input)).status).toBe(409);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "reject", reviewer: "管理员" })).status).toBe(400);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "approve", reviewer: "管理员" })).payload.data.status).toBe("approved");
  const second = await call("/api/bookings", "POST", { ...input, owner: "陈晨" });
  expect(second.status).toBe(201);
  expect((await call(`/api/bookings/${second.payload.data.id}`, "PATCH", { action: "approve", reviewer: "管理员" })).status).toBe(409);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "cancel", owner: "其他人" })).status).toBe(403);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "cancel", owner: "林悦" })).payload.data.status).toBe("cancelled");
  expect((await call(`/api/bookings/${second.payload.data.id}`, "PATCH", { action: "reject", reviewer: "管理员", reason: "教室设备维护" })).payload.data.reviewReason).toBe("教室设备维护");
  const mine = await call("/api/bookings?owner=%E9%99%88%E6%99%A8");
  expect(mine.payload.data).toHaveLength(1);
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = createBookingServer({ dataFile });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const restartedAddress = server.address();
  if (!restartedAddress || typeof restartedAddress === "string") throw new Error("测试服务未重启");
  base = `http://127.0.0.1:${restartedAddress.port}`;
  expect((await call("/api/bookings")).payload.data).toHaveLength(2);
});
