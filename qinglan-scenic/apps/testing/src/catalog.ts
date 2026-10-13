import type { Endpoint } from "./types";
import { scenicExtendedEndpoints } from "./scenic-catalog";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
const data = (body: unknown) => object(object(body).data);
const fixture = (value: unknown) => ({ data: value });
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const isObject = (value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonnegative = (value: unknown) => finite(value) && Number(value) >= 0;
const date = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const errorCase = (id: string, name: string, path: string, status: number, code: string): Endpoint => ({
  id, name, path, status, group: status === 401 ? "安全校验" : "参数边界",
  budget: 300, baseline: 24,
  contract: `HTTP ${status}，error.code = ${code}（预期拦截）`,
  validate: (body) => object(object(body).error).code === code,
  fixture: { error: { code, message: "请求按预期被拦截" } },
});
const articlePage = (id: string, name: string, page: number, pageSize: number): Endpoint => ({
  id, name, group: "内容分页", path: `/articles?page=${page}&pageSize=${pageSize}`,
  status: 200, budget: 300, baseline: 40,
  contract: `page = ${page}，pageSize = ${pageSize}，列表不超过分页大小`,
  validate: (body) => Array.isArray(data(body).items) && data(body).page === page &&
    data(body).pageSize === pageSize && nonnegative(data(body).total) &&
    (data(body).items as unknown[]).length <= pageSize,
  fixture: fixture({ items: [], page, pageSize, total: 0 }),
});

// Fixed GET contracts generate local responses; the auth case represents an unauthenticated request.
export const defaultEndpoints: Endpoint[] = [
  {
    id: "live",
    name: "进程存活",
    group: "基础服务",
    path: "/health/live",
    status: 200,
    budget: 200,
    baseline: 18,
    contract: "data.ok = true",
    validate: (b) => data(b).ok === true,
    fixture: fixture({ ok: true }),
  },
  {
    id: "ready",
    name: "数据库就绪",
    group: "基础服务",
    path: "/health/ready",
    status: 200,
    budget: 300,
    baseline: 32,
    contract: "PostgreSQL 就绪，schemaVersion 为数字",
    validate: (b) =>
      data(b).ok === true &&
      data(b).database === "postgresql" &&
      finite(data(b).schemaVersion),
    fixture: fixture({ ok: true, database: "postgresql", schemaVersion: 2 }),
  },
  {
    id: "runtime",
    name: "运行与场景",
    group: "运行控制",
    path: "/runtime",
    status: 200,
    budget: 300,
    baseline: 45,
    contract: "run.id 存在，scenarios 为数组",
    validate: (b) =>
      typeof object(data(b).run).id === "string" &&
      Array.isArray(data(b).scenarios),
    fixture: fixture({
      run: { id: "baseline-weekday", mode: "replay", revision: 128 },
      scenarios: [{ id: "weekday", name: "平日场景" }],
    }),
  },
  {
    id: "snapshot",
    name: "业务概览",
    group: "业务服务",
    path: "/public/snapshot",
    status: 200,
    budget: 500,
    baseline: 76,
    contract: "visitors、parkingFree 为非负数",
    validate: (b) =>
      finite(data(b).visitors) &&
      Number(data(b).visitors) >= 0 &&
      finite(data(b).parkingFree) &&
      Number(data(b).parkingFree) >= 0,
    fixture: fixture({
      visitors: 3286,
      parkingFree: 412,
      announcements: [],
      points: {},
    }),
  },
  {
    id: "devices",
    name: "设备监测",
    group: "设备服务",
    path: "/public/devices",
    status: 200,
    budget: 500,
    baseline: 93,
    contract: "items 为数组，revision 为数字",
    validate: (b) => Array.isArray(data(b).items) && finite(data(b).revision),
    fixture: fixture({
      source: "mock",
      revision: 128,
      items: [{ id: "remote-entry", state: "online", value: 3286 }],
    }),
  },
  {
    id: "forecast",
    name: "趋势预测",
    group: "业务服务",
    path: "/public/forecast",
    status: 200,
    budget: 500,
    baseline: 68,
    contract: "points 为数组，generatedAt 可解析",
    validate: (b) =>
      Array.isArray(data(b).points) &&
      Number.isFinite(Date.parse(String(data(b).generatedAt))),
    fixture: fixture({
      generatedAt: "2026-10-08T02:00:00.000Z",
      source: "mean-model",
      points: [{ time: "2026-10-08T02:10:00.000Z", visitors: 3460 }],
    }),
  },
  {
    id: "pois",
    name: "资源目录",
    group: "内容服务",
    path: "/pois",
    status: 200,
    budget: 300,
    baseline: 41,
    contract: "items 为数组，每项包含 id",
    validate: (b) =>
      Array.isArray(data(b).items) &&
      (data(b).items as unknown[]).every(
        (item) => typeof object(item).id === "string",
      ),
    fixture: fixture({
      items: [
        { id: "entry", name: "默认资源 A" },
        { id: "summit", name: "默认资源 B" },
      ],
    }),
  },
  {
    id: "articles",
    name: "内容列表",
    group: "内容服务",
    path: "/articles?pageSize=10",
    status: 200,
    budget: 300,
    baseline: 38,
    contract: "items 为数组，total 非负，page = 1",
    validate: (b) =>
      Array.isArray(data(b).items) &&
      finite(data(b).total) &&
      Number(data(b).total) >= 0 &&
      data(b).page === 1,
    fixture: fixture({
      items: [{ id: "guide-1", title: "服务指南" }],
      total: 1,
      page: 1,
      pageSize: 10,
    }),
  },
  {
    id: "auth",
    name: "未授权访问拦截",
    group: "安全校验",
    path: "/admin/orders",
    status: 401,
    budget: 300,
    baseline: 24,
    contract: "error.code = AUTH_REQUIRED",
    validate: (b) => object(object(b).error).code === "AUTH_REQUIRED",
    fixture: { error: { code: "AUTH_REQUIRED", message: "请先登录" } },
  },
  {
    id: "public-state", name: "公共状态快照", group: "业务服务",
    path: "/public/state", status: 200, budget: 500, baseline: 82,
    contract: "run.id 存在，public.visitors 为非负数",
    validate: (body) => typeof object(data(body).run).id === "string" &&
      nonnegative(object(data(body).public).visitors),
    fixture: fixture({ run: { id: "baseline-weekday" }, public: { visitors: 3286 } }),
  },
  {
    id: "ops-screen", name: "监控屏数据聚合", group: "业务服务",
    path: "/screens/ops", status: 200, budget: 600, baseline: 110,
    contract: "public 为对象，history 与 alerts 为数组",
    validate: (body) => isObject(data(body).public) &&
      Array.isArray(data(body).history) && Array.isArray(data(body).alerts),
    fixture: fixture({ public: { visitors: 3286 }, history: [], alerts: [] }),
  },
  {
    id: "runtime-revision", name: "运行版本一致性字段", group: "运行控制",
    path: "/runtime", status: 200, budget: 300, baseline: 43,
    contract: "run.revision 为非负整数，run.mode 有效",
    validate: (body) => Number.isInteger(object(data(body).run).revision) &&
      nonnegative(object(data(body).run).revision) &&
      ["realtime", "replay"].includes(String(object(data(body).run).mode)),
    fixture: fixture({ run: { id: "baseline-weekday", mode: "replay", revision: 128 } }),
  },
  {
    id: "announcements", name: "公告列表结构", group: "业务数据",
    path: "/public/snapshot", status: 200, budget: 500, baseline: 73,
    contract: "announcements 为数组，每项具有 id、title、body",
    validate: (body) => Array.isArray(data(body).announcements) &&
      (data(body).announcements as unknown[]).every((item) =>
        ["id", "title", "body"].every((key) => typeof object(item)[key] === "string")),
    fixture: fixture({ announcements: [{ id: "notice-1", title: "服务提示", body: "请查看最新服务安排" }] }),
  },
  {
    id: "point-status", name: "设施状态映射", group: "业务数据",
    path: "/public/snapshot", status: 200, budget: 500, baseline: 71,
    contract: "points 为对象，每个设施包含 availability 与 load",
    validate: (body) => isObject(data(body).points) &&
      Object.values(object(data(body).points)).every((item) =>
        typeof object(item).availability === "string" && typeof object(item).load === "string"),
    fixture: fixture({ points: { "facility-1": { availability: "open", load: "quiet" } } }),
  },
  {
    id: "device-identity", name: "设备标识与状态", group: "设备服务",
    path: "/public/devices", status: 200, budget: 500, baseline: 90,
    contract: "设备列表的 id 与 state 均为字符串",
    validate: (body) => Array.isArray(data(body).items) &&
      (data(body).items as unknown[]).every((item) =>
        typeof object(item).id === "string" && typeof object(item).state === "string"),
    fixture: fixture({ items: [{ id: "device-1", state: "online" }] }),
  },
  {
    id: "forecast-points", name: "趋势时间与预测值", group: "业务数据",
    path: "/public/forecast", status: 200, budget: 500, baseline: 66,
    contract: "预测点 time 可解析，visitors 为非负数",
    validate: (body) => Array.isArray(data(body).points) &&
      (data(body).points as unknown[]).every((item) =>
        date(object(item).time) && nonnegative(object(item).visitors)),
    fixture: fixture({ points: [{ time: "2026-10-09T09:00:00+08:00", visitors: 3286 }] }),
  },
  {
    id: "poi-unique", name: "资源编号唯一性", group: "内容服务",
    path: "/pois", status: 200, budget: 300, baseline: 42,
    contract: "资源 id 非空且不重复",
    validate: (body) => {
      if (!Array.isArray(data(body).items)) return false;
      const ids = (data(body).items as unknown[]).map((item) => object(item).id);
      return ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
    },
    fixture: fixture({ items: [{ id: "resource-1" }, { id: "resource-2" }] }),
  },
  articlePage("article-small", "内容最小分页", 1, 1),
  articlePage("article-next", "内容下一页查询", 2, 5),
  articlePage("article-max", "内容最大分页", 1, 200),
  errorCase("article-page-zero", "页码下界拦截", "/articles?page=0&pageSize=10", 400, "VALIDATION_ERROR"),
  errorCase("article-size-overflow", "分页上界拦截", "/articles?page=1&pageSize=201", 400, "VALIDATION_ERROR"),
  errorCase("poi-missing", "不存在资源拦截", "/pois/__service_test_missing__", 404, "NOT_FOUND"),
  errorCase("auth-session", "未登录身份查询拦截", "/auth/me", 401, "AUTH_REQUIRED"),
  errorCase("auth-orders", "个人订单访问拦截", "/orders", 401, "AUTH_REQUIRED"),
  errorCase("auth-tasks", "任务列表访问拦截", "/tasks", 401, "AUTH_REQUIRED"),
  errorCase("auth-oa", "审批申请访问拦截", "/oa-requests", 401, "AUTH_REQUIRED"),
  errorCase("auth-booking", "预约时段访问拦截", "/booking/slots", 401, "AUTH_REQUIRED"),
  errorCase("auth-notifications", "个人通知访问拦截", "/notifications", 401, "AUTH_REQUIRED"),
  errorCase("auth-workflow", "内部工作台访问拦截", "/workflow/workspace", 401, "AUTH_REQUIRED"),
  ...scenicExtendedEndpoints,
];
