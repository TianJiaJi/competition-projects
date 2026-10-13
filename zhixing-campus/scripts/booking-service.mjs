import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scenario } from "../scenario/config.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const defaultDataFile = join(root, ".local", "booking-requests.json");
const slots = new Set(["09:00–10:00", "14:00–15:00", "18:00–19:00"]);
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );

function load(dataFile) {
  try {
    const data = JSON.parse(readFileSync(dataFile, "utf8"));
    if (!Array.isArray(data)) throw new Error("预约数据文件格式错误");
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function save(dataFile, records) {
  mkdirSync(dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(records, null, 2) + "\n");
  renameSync(temporary, dataFile);
}

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(status < 400 ? { data } : { error: data }));
}

async function bodyOf(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16384) throw { status: 413, message: "请求内容过长" };
  }
  try {
    const value = JSON.parse(body);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  throw { status: 400, message: "请求内容格式错误" };
}

function cleanText(value, max) {
  return typeof value === "string" && value.trim().length <= max
    ? value.trim()
    : "";
}

export function createBookingServer({ dataFile = defaultDataFile } = {}) {
  let records = load(dataFile);
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
      if (req.method === "GET" && url.pathname === "/health")
        return send(res, 200, { ok: true });
      if (req.method === "GET" && url.pathname === "/api/bookings") {
        const owner = url.searchParams.get("owner");
        return send(
          res,
          200,
          records
            .filter((item) => !owner || item.owner === owner)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }
      if (req.method === "POST" && url.pathname === "/api/bookings") {
        const input = await bodyOf(req);
        const venue = scenario.seed.facilities.find(
          (item) => item.id === input.facilityId && item.capacity && item.status === "正常" && ["研讨空间", "教学空间"].includes(item.category),
        );
        const owner = cleanText(input.owner, 30);
        const purpose = cleanText(input.purpose, 200);
        const date = cleanText(input.date, 10);
        const time = cleanText(input.time, 30);
        const count = input.count;
        if (!venue) throw { status: 400, message: "请选择可预约的教室" };
        if (!owner) throw { status: 400, message: "请先登录学生端" };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
            new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
            date < today())
          throw { status: 400, message: "请选择今天或之后的有效日期" };
        if (!slots.has(time)) throw { status: 400, message: "请选择有效的预约时段" };
        if (!Number.isInteger(count) || count < 1 || count > venue.capacity)
          throw { status: 400, message: `使用人数应为 1–${venue.capacity}` };
        if (purpose.length < 2)
          throw { status: 400, message: "请填写至少两个字的使用说明" };
        if (
          records.some(
            (item) =>
              item.owner === owner &&
              item.facilityId === venue.id &&
              item.date === date &&
              item.time === time &&
              ["pending", "approved"].includes(item.status),
          )
        )
          throw { status: 409, message: "你已申请过该教室与时段" };
        const now = new Date().toISOString();
        const booking = {
          id: `BR-${randomUUID()}`,
          facilityId: venue.id,
          venue: venue.title,
          owner,
          date,
          time,
          count,
          purpose,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        const next = [booking, ...records];
        save(dataFile, next);
        records = next;
        return send(res, 201, booking);
      }
      const match = /^\/api\/bookings\/(BR-[0-9a-f-]+)$/.exec(url.pathname);
      if (req.method === "PATCH" && match) {
        const input = await bodyOf(req);
        const booking = records.find((item) => item.id === match[1]);
        if (!booking) throw { status: 404, message: "预约申请不存在" };
        const action = input.action;
        let updated;
        if (action === "cancel") {
          if (input.owner !== booking.owner)
            throw { status: 403, message: "只能取消自己的预约" };
          if (!["pending", "approved"].includes(booking.status))
            throw { status: 409, message: "该预约已无法取消" };
          updated = { ...booking, status: "cancelled", updatedAt: new Date().toISOString() };
        } else if (action === "approve" || action === "reject") {
          if (booking.status !== "pending")
            throw { status: 409, message: "该申请已处理，请刷新列表" };
          const reviewer = cleanText(input.reviewer, 30);
          const reason = cleanText(input.reason, 200);
          if (!reviewer) throw { status: 400, message: "请先登录管理员端" };
          if (action === "reject" && !reason)
            throw { status: 400, message: "拒绝时请填写原因" };
          if (action === "approve") {
            const conflict = records.some(
              (item) =>
                item.id !== booking.id &&
                item.status === "approved" &&
                item.facilityId === booking.facilityId &&
                item.date === booking.date &&
                item.time === booking.time,
            ) || scenario.seed.bookings.some(
              (item) =>
                item.status === "已预约" &&
                item.location === booking.venue &&
                item.date === booking.date &&
                item.description.includes(booking.time),
            );
            if (conflict)
              throw { status: 409, message: "该教室时段已有通过的预约，请拒绝并说明原因" };
          }
          updated = {
            ...booking,
            status: action === "approve" ? "approved" : "rejected",
            reviewReason: reason || undefined,
            reviewer,
            updatedAt: new Date().toISOString(),
          };
        } else throw { status: 400, message: "不支持的预约操作" };
        const next = records.map((item) => item.id === booking.id ? updated : item);
        save(dataFile, next);
        records = next;
        return send(res, 200, updated);
      }
      send(res, 404, "接口不存在");
    } catch (error) {
      send(res, error.status || 500, error.message || "预约服务异常");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BOOKING_PORT || 5606);
  const host = process.env.BOOKING_HOST || "localhost";
  createBookingServer({ dataFile: process.env.BOOKING_DATA_FILE || defaultDataFile })
    .listen(port, host, () => console.log(`预约审核服务：http://${host}:${port}`));
}
