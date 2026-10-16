import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { scenario } from "../../scenario/config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createBookingServer } from "../../scripts/booking-service.mjs";
import { demoClass } from "../../scenario/teaching";
import { todayInShanghai } from "../../packages/bookings/src";

let server: Server;
let directory: string;
let dataFile: string;
let base: string;
const after = (days: number) => {
  const date = new Date(`${todayInShanghai()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
async function start() {
  server = createBookingServer({ dataFile });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务未启动");
  base = `http://127.0.0.1:${address.port}`;
}
async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(base + path, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, payload: await response.json() };
}
const booking = (owner = "林悦", date = after(2)) => ({
  facilityId: "F1", owner, date, time: "09:00–10:00", count: 3,
  activity: "课程讨论", purpose: "小组研讨与汇报", phone: "13900001001", note: "准备白板",
});
const leave = (owner = "林悦", date = after(2)) => ({
  owner, type: "病假", startDate: date, startTime: "13:20:30", endDate: after(3), endTime: "08:10:20",
  reason: "发烧就医需要请假休息", phone: "13900001001",
  leavingCampus: true, leavingCity: false, destination: "医院就诊", address: "人民医院门诊部",
  emergencyName: "林女士", emergencyPhone: "13900001111", nature: "日常请假", cc: ["陈越"], confirmed: true,
});
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "campus-requests-"));
  dataFile = join(directory, "bookings.json");
  await start();
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});

it("大重置清除所有测试申请与审批，保留预置历史，重启后同一时段可再次提交", async () => {
  const seed = JSON.stringify(scenario.seed);
  const oldRevision = (await call('/api/demo/revision')).payload.data.revision;
  const booked = await call('/api/bookings', 'POST', booking());
  const requested = await call('/api/leaves', 'POST', leave());
  expect(booked.status).toBe(201); expect(requested.status).toBe(201);
  await call(`/api/bookings/${booked.payload.data.id}`, 'PATCH', { action: 'approve', reviewer: '陈越' });
  await call(`/api/leaves/${requested.payload.data.id}`, 'PATCH', { action: 'approve', reviewer: '陈越' });
  expect((await call('/api/leaves', 'POST', leave())).status).toBe(409);
  const cancelled = await call('/api/leaves', 'POST', leave('陈晨'));
  await call(`/api/leaves/${cancelled.payload.data.id}`, 'PATCH', { action: 'cancel', owner: '陈晨' });
  const rejected = await call('/api/leaves', 'POST', leave('顾宁'));
  await call(`/api/leaves/${rejected.payload.data.id}`, 'PATCH', { action: 'reject', reviewer: '陈越', reason: '补充材料' });
  const reset = await call('/api/demo/reset', 'POST', { confirm: 'reset-campus-demo' });
  expect(reset.status).toBe(200);
  expect(reset.payload.data).toMatchObject({ reset: true });
  expect(reset.payload.data.revision).not.toBe(oldRevision);
  expect((await call('/api/demo/revision')).payload.data.revision).toBe(reset.payload.data.revision);
  expect((await call('/api/bookings')).payload.data).toEqual([]);
  expect((await call('/api/leaves')).payload.data).toEqual([]);
  expect(JSON.parse(readFileSync(dataFile, 'utf8'))).toEqual([]);
  expect(JSON.parse(readFileSync(join(directory, 'leave-requests.json'), 'utf8'))).toEqual([]);
  expect(JSON.stringify(scenario.seed)).toBe(seed);
  expect(scenario.seed.bookings.length).toBeGreaterThan(0);
  await new Promise<void>(resolve => server.close(() => resolve()));
  await start();
  expect((await call('/api/bookings')).payload.data).toEqual([]);
  expect((await call('/api/leaves')).payload.data).toEqual([]);
  expect((await call('/api/leaves', 'POST', leave())).status).toBe(201);
  expect((await call('/api/bookings', 'POST', booking())).status).toBe(201);
  expect((await call('/api/demo/reset', 'POST', { confirm: 'reset-campus-demo' })).status).toBe(200);
  expect((await call('/api/demo/reset', 'POST', { confirm: 'reset-campus-demo' })).status).toBe(200);
});

it("重置需要显式确认，拒绝外站请求与非 JSON 表单", async () => {
  await call('/api/leaves', 'POST', leave());
  expect((await call('/api/demo/reset', 'POST', {})).status).toBe(400);
  expect((await call('/api/demo/reset')).status).toBe(404);
  const external = await fetch(base + '/api/demo/reset', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'reset-campus-demo' }) });
  expect(external.status).toBe(403);
  const form = await fetch(base + '/api/demo/reset', { method: 'POST', body: JSON.stringify({ confirm: 'reset-campus-demo' }) });
  expect(form.status).toBe(415);
  expect((await call('/api/leaves')).payload.data).toHaveLength(1);
});

it("重置写盘失败不会发布新版本或清空内存，已写文件会回滚", async () => {
  await call('/api/bookings', 'POST', booking());
  await call('/api/leaves', 'POST', leave());
  const oldRevision = (await call('/api/demo/revision')).payload.data.revision;
  const leaveFile = join(directory, 'leave-requests.json');
  renameSync(leaveFile, leaveFile + '.backup');
  mkdirSync(leaveFile); // Force the second rename to fail without changing permissions.
  expect((await call('/api/demo/reset', 'POST', { confirm: 'reset-campus-demo' })).status).toBe(500);
  expect((await call('/api/demo/revision')).payload.data.revision).toBe(oldRevision);
  expect((await call('/api/bookings')).payload.data).toHaveLength(1);
  expect((await call('/api/leaves')).payload.data).toHaveLength(1);
  expect(JSON.parse(readFileSync(dataFile, 'utf8'))).toHaveLength(1);
  rmSync(leaveFile, { recursive: true });
  renameSync(leaveFile + '.backup', leaveFile);
  expect((await call('/api/demo/reset', 'POST', { confirm: 'reset-campus-demo' })).status).toBe(200);
});

it("校验完整预约、可用性、班级审核、占用冲突、取消与重启持久化", async () => {
  expect(todayInShanghai()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect((await call("/api/bookings", "POST", { ...booking(), facilityId: "F2" })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...booking(), date: "2026-02-30" })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...booking(), date: after(14) })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...booking(), count: 99 })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...booking(), activity: "" })).status).toBe(400);
  expect((await call("/api/bookings", "POST", { ...booking(), phone: "1" })).status).toBe(400);
  const date = after(2);
  const path = `/api/bookings/availability?facilityId=F1&date=${date}`;
  expect((await call(path)).payload.data[0]).toMatchObject({ available: true, pending: 0 });
  const created = await call("/api/bookings", "POST", booking());
  expect(created.status).toBe(201);
  expect(created.payload.data).toMatchObject({ status: "pending", classId: demoClass.id, activity: "课程讨论" });
  const id = created.payload.data.id;
  expect((await call(path)).payload.data[0]).toMatchObject({ available: true, pending: 1 });
  expect((await call("/api/bookings", "POST", booking())).status).toBe(409);
  const second = await call("/api/bookings", "POST", booking("陈晨"));
  expect(second.status).toBe(201);
  expect((await call("/api/bookings?teacher=%E9%99%88%E8%B6%8A")).payload.data).toHaveLength(2);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "approve", reviewer: "管理员" })).status).toBe(403);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "reject", reviewer: "陈越" })).status).toBe(400);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "approve", reviewer: "陈越" })).payload.data.status).toBe("approved");
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "approve", reviewer: "陈越" })).status).toBe(409);
  expect((await call(path)).payload.data[0]).toMatchObject({ available: false, reason: "已被预约" });
  expect((await call("/api/bookings", "POST", booking("顾宁"))).status).toBe(409);
  expect((await call(`/api/bookings/${second.payload.data.id}`, "PATCH", { action: "approve", reviewer: "陈越" })).status).toBe(409);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "cancel", owner: "陈晨" })).status).toBe(403);
  expect((await call(`/api/bookings/${id}`, "PATCH", { action: "cancel", owner: "林悦" })).payload.data.status).toBe("cancelled");
  expect((await call(`/api/bookings/${second.payload.data.id}`, "PATCH", { action: "reject", reviewer: "陈越", reason: "与课程冲突" })).payload.data.reviewReason).toBe("与课程冲突");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await start();
  expect((await call("/api/bookings?owner=%E6%9E%97%E6%82%A6")).payload.data[0].status).toBe("cancelled");
});

it("六个空间支持丰富时段并按实际容量限制整数人数", async () => {
  for (const [facilityId, capacity] of [["F1", 12], ["F7", 36], ["F8", 40], ["F9", 60], ["F10", 100], ["F11", 200]] as const) {
    const available = await call(`/api/bookings/availability?facilityId=${facilityId}&date=${after(2)}`);
    expect(available.status).toBe(200);
    expect(available.payload.data.map((item: { time: string }) => item.time)).toEqual([
      "09:00–10:00", "10:00–11:00", "11:00–12:00", "14:00–15:00",
      "15:00–16:00", "16:00–17:00", "18:00–19:00", "19:00–20:00",
    ]);
    for (const count of [0, -1, 1.5, capacity + 1, "10", null]) {
      expect((await call("/api/bookings", "POST", { ...booking(), facilityId, count })).status).toBe(400);
    }
    expect((await call("/api/bookings", "POST", { ...booking(), facilityId, count: 1, time: "10:00–11:00" })).status).toBe(201);
    expect((await call("/api/bookings", "POST", { ...booking(), facilityId, count: capacity, time: "19:00–20:00" })).status).toBe(201);
    expect((await call("/api/bookings", "POST", { ...booking(), facilityId, time: "20:00–21:00" })).status).toBe(400);
  }
});

it("学生请假秒级/跨天、重叠、拒绝与班级边界", async () => {
  expect((await call("/api/leaves", "POST", { ...leave(), endDate: after(1) })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), reason: "短" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), startDate: after(30) })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), confirmed: false })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), emergencyName: "" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), address: "" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), emergencyPhone: "123" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), cc: ["其他教师"] })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), leavingCampus: false, leavingCity: true })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), startTime: "24:00:00" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), endTime: "12:60:00" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), startTime: "12:00:60" })).status).toBe(400);
  expect((await call("/api/leaves", "POST", { ...leave(), endDate: after(2), endTime: "13:20:30" })).status).toBe(400);
  const created = await call("/api/leaves", "POST", leave());
  expect(created.status).toBe(201);
  expect(created.payload.data).toMatchObject({ startTime: "13:20:30", endTime: "08:10:20" });
  expect(created.payload.data).toMatchObject({ emergencyName: "林女士", address: "人民医院门诊部", confirmed: true, cc: ["陈越"] });
  const id = created.payload.data.id;
  expect((await call("/api/leaves", "POST", { ...leave(), startDate: after(3), startTime: "08:10:19", endTime: "09:00:00" })).status).toBe(409);
  const other = await call("/api/leaves", "POST", leave("赵明"));
  expect(other.status).toBe(201);
  expect((await call("/api/leaves?teacher=%E9%99%88%E8%B6%8A")).payload.data).toHaveLength(1);
  expect((await call(`/api/leaves/${other.payload.data.id}`, "PATCH", { action: "approve", reviewer: "陈越" })).status).toBe(403);
  expect((await call(`/api/leaves/${id}`, "PATCH", { action: "reject", reviewer: "陈越" })).status).toBe(400);
  expect((await call(`/api/leaves/${id}`, "PATCH", { action: "approve", reviewer: "陈越" })).payload.data.status).toBe("approved");
  expect((await call(`/api/leaves/${id}`, "PATCH", { action: "cancel", owner: "林悦" })).payload.data.status).toBe("cancelled");
  const again = await call("/api/leaves", "POST", leave());
  expect(again.status).toBe(201);
  expect((await call(`/api/leaves/${again.payload.data.id}`, "PATCH", { action: "reject", reviewer: "陈越", reason: "请补充材料" })).payload.data.reviewReason).toBe("请补充材料");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await start();
  expect((await call("/api/leaves?owner=%E6%9E%97%E6%82%A6")).payload.data).toHaveLength(2);
  const onCampus = await call("/api/leaves", "POST", { ...leave("林悦", after(5)), endDate: after(5), endTime: "18:00:00", leavingCampus: false, leavingCity: false, destination: "", address: "", reason: "学习期间身体不适需要休息" });
  expect(onCampus.status).toBe(201);
  expect(onCampus.payload.data).toMatchObject({ leavingCampus: false, address: "" });
});

it("旧预约不丢失；未知班级只能在管理员列表只读展示", async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const record = { id: "BR-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", owner: "林悦", facilityId: "F1", venue: "图书馆研讨室", date: after(2), time: "14:00–15:00", count: 2, purpose: "旧版讨论", status: "pending", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  writeFileSync(dataFile, JSON.stringify([record, { ...record, id: "BR-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", owner: "未知学生" }]));
  await start();
  expect((await call("/api/bookings")).payload.data).toHaveLength(2);
  expect((await call("/api/bookings?teacher=%E9%99%88%E8%B6%8A")).payload.data).toHaveLength(1);
  expect((await call(`/api/bookings/${record.id}`, "PATCH", { action: "reject", reviewer: "陈越", reason: "材料不足" })).status).toBe(200);
  expect((await call(`/api/bookings/BR-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, "PATCH", { action: "approve", reviewer: "陈越" })).status).toBe(403);
  expect(JSON.parse(readFileSync(dataFile, "utf8"))).toHaveLength(2);
});

it("秒级区间允许首尾衔接，阻止一秒重叠并兼容旧请假", async () => {
  const first = await call('/api/leaves', 'POST', { ...leave(), endDate: after(2), endTime: '14:00:00' });
  expect(first.status).toBe(201);
  const adjacent = await call('/api/leaves', 'POST', { ...leave(), startTime: '14:00:00', endDate: after(2), endTime: '15:00:00' });
  expect(adjacent.status).toBe(201);
  expect((await call('/api/leaves', 'POST', { ...leave(), startTime: '13:59:59', endDate: after(2), endTime: '15:00:01' })).status).toBe(409);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  writeFileSync(join(directory, 'leave-requests.json'), JSON.stringify([{
    ...leave(), startTime: undefined, endTime: undefined, startPeriod: '下午', endPeriod: '上午',
    id: 'LV-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'approved', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }]));
  await start();
  expect((await call('/api/leaves?owner=%E6%9E%97%E6%82%A6')).payload.data).toHaveLength(1);
  expect((await call('/api/leaves', 'POST', { ...leave(), startTime: '12:00:01', endDate: after(2), endTime: '12:00:02' })).status).toBe(409);
});
