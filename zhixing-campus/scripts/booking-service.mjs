import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scenario } from "../scenario/config.ts";
import { bookingSlots, validBookingCount } from "../packages/bookings/src/rules.ts";
import { validateLeaveDetails, validLeaveTime, leaveBounds } from "../packages/bookings/src/leave.ts";
import { bookingWindowDays, demoClass, demoTeacher, leaveTypes, leaveWindowDays, studentFor } from "../scenario/teaching.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const defaultDataFile = join(root, ".local", "booking-requests.json");
const slots = bookingSlots;
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
const nowTime = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const fail = (status, message) => { throw { status, message }; };
const cleanText = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const classOf = (item) => item.classId || studentFor(item.owner)?.classId;
const sortNewest = (items) => items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function load(file) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(data)) throw new Error("申请数据文件格式错误");
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function save(file, records) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(records, null, 2) + "\n");
  renameSync(temporary, file);
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(status < 400 ? { data } : { error: data }));
}
async function bodyOf(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16384) fail(413, "请求内容过长");
  }
  try {
    const value = JSON.parse(body);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  fail(400, "请求内容格式错误");
}
function validDate(date, days) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date &&
    date >= today() && (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000 < days;
}
function bookableVenue(facilityId) {
  return scenario.seed.facilities.find((item) => item.id === facilityId && item.capacity && item.status === "正常" && ["研讨空间", "教学空间"].includes(item.category));
}
function slotReason(records, venue, date, time) {
  if (date === today() && time.slice(0, 5) <= nowTime()) return "时段已开始";
  if (records.some((item) => item.status === "approved" && item.facilityId === venue.id && item.date === date && item.time === time) ||
      scenario.seed.bookings.some((item) => item.status === "已预约" && item.location === venue.title && item.date === date && item.description.includes(time)))
    return "已被预约";
  return "";
}
function verifyStudent(owner) {
  const student = studentFor(owner);
  if (!student) fail(403, "演示学生身份不存在");
  return student;
}
function verifyTeacher(reviewer, record) {
  if (reviewer !== demoTeacher.name || classOf(record) !== demoClass.id) fail(403, "只能审核所带班级的学生申请");
}

export function createBookingServer({ dataFile = defaultDataFile, leaveFile = join(dirname(dataFile), "leave-requests.json") } = {}) {
  let records = load(dataFile);
  let leaves = load(leaveFile);
  // A service restart also invalidates stale in-memory demo pages.
  let revision = randomUUID();
  async function currentBody(req) {
    const startedAt = revision;
    const input = await bodyOf(req);
    if (startedAt !== revision) fail(409, "校园演示已重置，请刷新后重新操作");
    return input;
  }
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return send(res, 200, null);
    const url = new URL(req.url || "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
      if (req.method === "GET" && url.pathname === "/api/demo/revision") {
        res.setHeader("Cache-Control", "no-store");
        return send(res, 200, { revision });
      }
      if (req.method === "POST" && url.pathname === "/api/demo/reset") {
        // Demo-only operation: local callers, JSON and explicit intent.
        const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
        if (!local || (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) fail(403, "仅允许本机演示环境重置");
        if (!req.headers["content-type"]?.startsWith("application/json")) fail(415, "重置请求必须使用 JSON");
        const input = await currentBody(req);
        if (input.confirm !== "reset-campus-demo") fail(400, "缺少校园演示重置确认");
        // Restore the previous files if either write fails; never report partial success.
        try { save(dataFile, []); save(leaveFile, []); }
        catch (error) { save(dataFile, records); save(leaveFile, leaves); throw error; }
        records = []; leaves = []; revision = randomUUID();
        return send(res, 200, { reset: true, revision });
      }
      if (req.method === "GET" && url.pathname === "/api/bookings/availability") {
        const venue = bookableVenue(url.searchParams.get("facilityId"));
        const date = url.searchParams.get("date") || "";
        if (!venue || !validDate(date, bookingWindowDays)) fail(400, "请选择开放日期与教室");
        return send(res, 200, slots.map((time) => {
          const reason = slotReason(records, venue, date, time);
          return { time, available: !reason, reason: reason || undefined,
            pending: records.filter((item) => item.status === "pending" && item.facilityId === venue.id && item.date === date && item.time === time).length };
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/bookings") {
        const owner = url.searchParams.get("owner");
        const teacher = url.searchParams.get("teacher");
        if (teacher && teacher !== demoTeacher.name) fail(403, "教师身份不存在");
        return send(res, 200, sortNewest(records.filter((item) => (!owner || item.owner === owner) && (!teacher || classOf(item) === demoClass.id)).map((item) => ({ ...item, classId: classOf(item) }))));
      }
      if (req.method === "POST" && url.pathname === "/api/bookings") {
        const input = await currentBody(req);
        const venue = bookableVenue(input.facilityId);
        if (!venue) fail(400, "请选择可预约的教室");
        const owner = cleanText(input.owner, 30);
        const student = verifyStudent(owner);
        const date = cleanText(input.date, 10);
        const time = cleanText(input.time, 30);
        const activity = cleanText(input.activity, 50);
        const purpose = cleanText(input.purpose, 200);
        const phone = cleanText(input.phone, 20);
        const note = cleanText(input.note ?? "", 200);
        const count = input.count;
        if (!validDate(date, bookingWindowDays)) fail(400, "请选择未来 14 天内的有效日期");
        if (!slots.includes(time)) fail(400, "请选择有效的预约时段");
        if (!validBookingCount(count, venue.capacity)) fail(400, `使用人数应为 1–${venue.capacity} 的整数`);
        if (activity.length < 2) fail(400, "活动名称需 2–50 字");
        if (purpose.length < 2) fail(400, "使用用途需 2–200 字");
        if (!/^1\d{10}$/.test(phone)) fail(400, "请填写 11 位联系人手机号");
        if (records.some((item) => item.owner === owner && item.facilityId === venue.id && item.date === date && item.time === time && ["pending", "approved"].includes(item.status))) fail(409, "你已申请过该教室与时段");
        const reason = slotReason(records, venue, date, time);
        if (reason) fail(409, `${reason}，请重新选择时段`);
        const now = new Date().toISOString();
        const booking = { id: `BR-${randomUUID()}`, facilityId: venue.id, venue: venue.title, owner, classId: student.classId,
          activity, date, time, count, purpose, phone, note, status: "pending", createdAt: now, updatedAt: now };
        const next = [booking, ...records]; save(dataFile, next); records = next;
        return send(res, 201, booking);
      }
      if (req.method === "GET" && url.pathname === "/api/leaves") {
        const owner = url.searchParams.get("owner");
        const teacher = url.searchParams.get("teacher");
        if (teacher && teacher !== demoTeacher.name) fail(403, "教师身份不存在");
        return send(res, 200, sortNewest(leaves.filter((item) => (!owner || item.owner === owner) && (!teacher || classOf(item) === demoClass.id))));
      }
      if (req.method === "POST" && url.pathname === "/api/leaves") {
        const input = await currentBody(req);
        const owner = cleanText(input.owner, 30);
        const student = verifyStudent(owner);
        const type = cleanText(input.type, 10);
        const startDate = cleanText(input.startDate, 10);
        const endDate = cleanText(input.endDate, 10);
        const startTime = cleanText(input.startTime, 8);
        const endTime = cleanText(input.endTime, 8);
        const reason = cleanText(input.reason, 1000);
        const phone = cleanText(input.phone, 20);
        const detailError = validateLeaveDetails(input);
        if (detailError) fail(400, detailError);
        if (!leaveTypes.includes(type)) fail(400, "请选择请假类型");
        if (!validDate(startDate, leaveWindowDays) || !validDate(endDate, leaveWindowDays) || !validLeaveTime(startTime) || !validLeaveTime(endTime)) fail(400, "请填写有效的起止日期和时分秒");
        const interval = leaveBounds({ startDate, endDate, startTime, endTime });
        if (interval.end <= interval.start) fail(400, "结束时间必须晚于开始时间");
        if (interval.start < Date.now()) fail(400, "开始时间不能早于当前时间");
        if (reason.length < 5) fail(400, "请填写 5–1000 字的请假事由");
        if (!/^1\d{10}$/.test(phone)) fail(400, "请填写 11 位本人手机号");
        if (leaves.some((item) => {
          if (item.owner !== owner || !["pending", "approved"].includes(item.status)) return false;
          const existing = leaveBounds(item);
          return interval.start < existing.end && interval.end > existing.start;
        })) fail(409, "该时段已有有效请假申请");
        const now = new Date().toISOString();
        const leave = { id: `LV-${randomUUID()}`, owner, classId: student.classId, type, startDate, startTime,
          endDate, endTime, reason, phone,
          leavingCampus: input.leavingCampus, leavingCity: input.leavingCity,
          destination: input.leavingCampus ? input.destination : "",
          address: input.leavingCampus ? input.address.trim() : "",
          emergencyName: input.emergencyName.trim(), emergencyPhone: input.emergencyPhone.trim(),
          nature: input.nature, cc: [...input.cc], confirmed: true,
          status: "pending", createdAt: now, updatedAt: now };
        const next = [leave, ...leaves]; save(leaveFile, next); leaves = next;
        return send(res, 201, leave);
      }
      const bookingMatch = /^\/api\/bookings\/(BR-[0-9a-f-]+)$/.exec(url.pathname);
      const leaveMatch = /^\/api\/leaves\/(LV-[0-9a-f-]+)$/.exec(url.pathname);
      if (req.method === "PATCH" && (bookingMatch || leaveMatch)) {
        const input = await currentBody(req);
        const isLeave = !!leaveMatch;
        const source = isLeave ? leaves : records;
        const record = source.find((item) => item.id === (bookingMatch || leaveMatch)[1]);
        if (!record) fail(404, "申请不存在");
        const action = input.action;
        let updated;
        if (action === "cancel") {
          if (input.owner !== record.owner) fail(403, "只能取消自己的申请");
          if (!["pending", "approved"].includes(record.status)) fail(409, "该申请已无法取消");
          updated = { ...record, status: "cancelled", updatedAt: new Date().toISOString() };
        } else if (action === "approve" || action === "reject") {
          verifyTeacher(input.reviewer, record);
          if (record.status !== "pending") fail(409, "该申请已处理，请刷新列表");
          const reason = cleanText(input.reason, 200);
          if (action === "reject" && !reason) fail(400, "拒绝时请填写原因");
          if (action === "approve" && !isLeave && slotReason(records, bookableVenue(record.facilityId), record.date, record.time))
            fail(409, "该教室时段已有通过的预约，请拒绝并说明原因");
          updated = { ...record, status: action === "approve" ? "approved" : "rejected", reviewReason: reason || undefined,
            reviewer: demoTeacher.name, updatedAt: new Date().toISOString() };
        } else fail(400, "不支持的申请操作");
        const next = source.map((item) => item.id === record.id ? updated : item);
        save(isLeave ? leaveFile : dataFile, next);
        if (isLeave) leaves = next; else records = next;
        return send(res, 200, updated);
      }
      send(res, 404, "接口不存在");
    } catch (error) {
      send(res, error.status || 500, error.message || "申请服务异常");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BOOKING_PORT || 5606);
  const host = process.env.BOOKING_HOST || "localhost";
  createBookingServer({ dataFile: process.env.BOOKING_DATA_FILE || defaultDataFile })
    .listen(port, host, () => console.log(`预约审核服务：http://${host}:${port}`));
}
