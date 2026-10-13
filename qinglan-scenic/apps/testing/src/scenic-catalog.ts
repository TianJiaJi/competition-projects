import type { Endpoint } from "./types";

type CaseRow = [id: string, name: string, path: string, payload: Record<string, unknown>];
const page = (item: Record<string, unknown>) => ({ items: [item], total: 1, page: 1, pageSize: 20 });
function matches(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(value) && value.every(item => !expected.length || matches(item, expected[0]));
  if (expected && typeof expected === "object") return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(expected).every(([key, child]) => matches((value as Record<string, unknown>)[key], child));
  if (typeof expected === "number") return typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (typeof expected === "boolean") return value === expected;
  return typeof value === "string" && value.length > 0;
}
// Preset GET contracts for the workbench. These identifiers do not register backend routes.
const modules: { group: string; cases: CaseRow[] }[] = [
  { group: "启动身份", cases: [
    ["bootstrap", "站点启动配置", "/bootstrap", { brandName: "智慧景区", timezone: "Asia/Shanghai", contentVersion: "content-1" }],
    ["current-run", "当前运行上下文", "/runs/current", { id: "RUN-01", mode: "realtime", revision: 128 }],
    ["run-detail", "指定运行详情", "/runs/RUN-01", { id: "RUN-01", status: "running", speed: 1 }],
    ["scenic-info", "景区基本资料", "/scenic", { id: "SCENIC-01", name: "智慧景区", capacity: 12000 }],
    ["site-features", "平台能力清单", "/bootstrap/features", { items: [{ id: "booking", enabled: true }] }],
    ["entry-rules", "开放时间与入园规则", "/scenic/entry-rules", { opensAt: "08:00", closesAt: "17:00", bookingRequired: true }],
    ["visitor-profile", "游客身份资料", "/me/profile", { accountId: "VISITOR-01", role: "visitor", nickname: "游客 01" }],
    ["session-info", "访问会话信息", "/auth/session", { sessionId: "SESSION-01", accountId: "VISITOR-01", expiresIn: 3600 }],
    ["role-menu", "岗位菜单权限", "/auth/menu", { role: "staff", items: [{ id: "work-orders", readable: true }] }],
    ["public-config", "公共端功能配置", "/public/config", { mapVersion: "map-1", idleSeconds: 60, bookingEnabled: true }],
  ] },
  { group: "预约订单", cases: [
    ["entry-slots", "入园预约时段", "/booking/slots?kind=entry", page({ id: "SLOT-01", capacity: 500, remaining: 240 })],
    ["parking-slots", "停车预约时段", "/booking/slots?kind=parking&lotId=P1", page({ id: "PARK-SLOT-01", lotId: "P1", remaining: 60 })],
    ["my-orders", "游客预约订单列表", "/orders?status=reserved", page({ id: "ORDER-01", accountId: "VISITOR-01", status: "reserved" })],
    ["order-detail", "预约订单详情", "/orders/ORDER-01", { id: "ORDER-01", kind: "entry", status: "reserved", partySize: 2 }],
    ["order-credential", "订单核销凭证", "/orders/ORDER-01/credential", { orderId: "ORDER-01", credentialId: "CRED-01", expiresAt: "2026-10-10T17:00:00+08:00" }],
    ["order-history", "订单状态流转记录", "/orders/ORDER-01/history", page({ id: "ORDER-EVENT-01", orderId: "ORDER-01", action: "reserved" })],
    ["booking-quotas", "预约配额查询", "/booking/quotas", { date: "2026-10-10", capacity: 2000, reserved: 840, remaining: 1160 }],
    ["parking-lots", "停车场余位列表", "/parking/lots", page({ id: "P1", capacity: 300, occupied: 180, free: 120 })],
    ["parking-order", "停车预约详情", "/orders/PARK-ORDER-01", { id: "PARK-ORDER-01", lotId: "P1", kind: "parking", status: "reserved" }],
    ["booking-summary", "预约业务统计", "/booking/summary", { entryOrders: 420, parkingOrders: 86, cancelledOrders: 12 }],
  ] },
  { group: "入园核销", cases: [
    ["gate-points", "核销点目录", "/gate/points", page({ id: "GATE-01", kind: "entry", enabled: true })],
    ["gate-records", "近期核销记录", "/gate/check-ins", page({ id: "CHECK-01", orderId: "ORDER-01", gateId: "GATE-01" })],
    ["gate-result", "核销请求结果查询", "/gate/requests/CHECK-KEY-01", { requestId: "CHECK-KEY-01", orderId: "ORDER-01", status: "completed" }],
    ["gate-workspace", "核销工作台数据", "/gate/workspace", { runId: "RUN-01", pendingTasks: 2, staff: [{ id: "STAFF-01", role: "staff" }] }],
    ["gate-stats", "核销通行统计", "/gate/statistics", { entryCount: 1640, departureCount: 420, inPark: 1220 }],
    ["gate-devices", "闸机设备状态", "/gate/devices", page({ id: "DEVICE-G01", gateId: "GATE-01", state: "online" })],
    ["gate-entry-flow", "入口通行趋势", "/gate/metrics/entry", { points: [{ time: "09:00", count: 120 }] }],
    ["gate-departures", "游客离园记录", "/gate/departures", page({ id: "DEPART-01", partySize: 2, gateId: "GATE-02" })],
    ["gate-parking-exits", "车辆出场记录", "/gate/parking-exits", page({ id: "EXIT-01", orderId: "PARK-ORDER-01", lotId: "P1" })],
    ["gate-capacity", "出入口通行能力", "/gate/capacity", { gateId: "GATE-01", lanes: 4, hourlyCapacity: 2400 }],
  ] },
  { group: "路线导览", cases: [
    ["map-config", "二维三维地图配置", "/map", { version: "map-1", points: [{ id: "G1", x: 120, y: 80 }] }],
    ["poi-detail", "景点内容详情", "/pois/G1", { id: "G1", name: "景点一", status: "open", capacity: 600 }],
    ["route-options", "游览偏好选项", "/routes/options", { items: [{ id: "family", name: "亲子路线", minutes: 90 }] }],
    ["route-detail", "游览路线详情", "/routes/ROUTE-01", { id: "ROUTE-01", minutes: 90, points: [{ id: "G1", sequence: 1 }] }],
    ["tour-detail", "个人游览会话", "/tour-sessions/TOUR-01", { id: "TOUR-01", routeId: "ROUTE-01", status: "running", progress: 0.4 }],
    ["guide-facilities", "导览设施目录", "/facilities", page({ id: "FACILITY-01", kind: "restroom", status: "open" })],
    ["guide-facility", "导览设施详情", "/facilities/FACILITY-01", { id: "FACILITY-01", availability: "open", queueCount: 2 }],
    ["guide-favorites", "游客收藏列表", "/me/favorites", page({ id: "FAV-01", resourceId: "G1", resourceType: "poi" })],
    ["guide-search", "导览内容搜索", "/search?q=服务", page({ id: "SEARCH-01", resourceId: "FACILITY-01", title: "游客服务点" })],
    ["guide-handoff", "跨端导览交接信息", "/handoffs/HANDOFF-01", { id: "HANDOFF-01", resourceId: "G1", targetApp: "mobile", valid: true }],
  ] },
  { group: "互动消息", cases: [
    ["chat-rooms", "游客聊天房间", "/chat/rooms", page({ id: "ROOM-01", name: "游览交流", closed: false })],
    ["chat-history", "房间消息历史", "/chat/rooms/ROOM-01/messages", page({ id: "MSG-01", roomId: "ROOM-01", authorId: "VISITOR-01", text: "游览交流" })],
    ["chat-feed", "实时消息列表", "/chat/messages?roomId=ROOM-01", page({ id: "MSG-01", roomId: "ROOM-01", removed: false })],
    ["chat-mute", "游客发言权限", "/chat/me/mute", { accountId: "VISITOR-01", muted: false, remainingSeconds: 0 }],
    ["chat-notifications", "个人通知列表", "/notifications?status=unread", page({ id: "NOTIFY-01", accountId: "VISITOR-01", read: false })],
    ["chat-unread", "未读通知统计", "/notifications/summary", { total: 8, unread: 2, read: 6 }],
    ["chat-notices", "生效公告列表", "/notices", page({ id: "NOTICE-01", title: "游览提示", audience: "public", active: true })],
    ["chat-article", "资讯文章详情", "/articles/ARTICLE-01", { id: "ARTICLE-01", title: "游览指南", body: "请遵循导览指引", published: true }],
    ["chat-report-list", "游客反馈记录", "/me/reports", page({ id: "REPORT-01", accountId: "VISITOR-01", status: "resolved" })],
    ["chat-appeal-list", "申诉处理进度", "/me/appeals", page({ id: "APPEAL-01", accountId: "VISITOR-01", status: "completed" })],
  ] },
  { group: "知识问答", cases: [
    ["qa-workbench", "知识问答工作区", "/qa/workbench", { sourceCount: 32, conversationCount: 6, available: true }],
    ["qa-sources", "已发布知识来源", "/knowledge/sources", page({ id: "SOURCE-01", title: "游览服务指南", published: true })],
    ["qa-source", "知识来源详情", "/knowledge/sources/SOURCE-01", { id: "SOURCE-01", title: "游览服务指南", content: "景区服务与导览知识" }],
    ["qa-conversations", "游客问答会话列表", "/qa/conversations", page({ id: "CONV-01", accountId: "VISITOR-01", messageCount: 4 })],
    ["qa-messages", "问答会话历史", "/qa/conversations/CONV-01/messages", { items: [{ id: "ANSWER-01", role: "assistant", status: "completed", text: "可查看导览地图" }] }],
    ["qa-citations", "回答引用来源", "/qa/messages/ANSWER-01/citations", { messageId: "ANSWER-01", items: [{ id: "SOURCE-01", title: "游览服务指南" }] }],
    ["qa-generation", "回答生成状态", "/qa/messages/ANSWER-01/status", { id: "ANSWER-01", status: "completed", tokenCount: 128 }],
    ["qa-categories", "知识分类目录", "/knowledge/categories", page({ id: "CATEGORY-01", name: "游客服务", sourceCount: 12 })],
    ["qa-suggestions", "常用问答推荐", "/qa/suggestions", { items: [{ id: "SUGGEST-01", question: "如何查询游览路线" }] }],
    ["qa-status", "问答服务状态", "/qa/status", { available: true, activeConversations: 6, knowledgeVersion: "knowledge-1" }],
  ] },
  { group: "园区运维", cases: [
    ["ops-snapshot", "园方运营快照", "/ops/snapshot", { visitors: 3286, parkingFree: 412, pendingAlerts: 2 }],
    ["ops-history", "运营历史指标", "/ops/metrics/history", { points: [{ time: "09:00", visitors: 3200, parkingFree: 420 }] }],
    ["ops-alerts", "运营预警列表", "/ops/alerts", page({ id: "ALERT-01", category: "crowd", status: "acknowledged" })],
    ["ops-alert", "运营预警详情", "/ops/alerts/ALERT-01", { id: "ALERT-01", regionId: "REGION-01", status: "acknowledged", level: "notice" }],
    ["ops-guidances", "分流处置记录", "/ops/guidances", page({ id: "GUIDE-01", alertId: "ALERT-01", status: "active" })],
    ["ops-task-detail", "岗位任务详情", "/tasks/TASK-01", { id: "TASK-01", assigneeId: "STAFF-01", status: "processing" }],
    ["ops-oa-detail", "审批申请详情", "/oa-requests/OA-01", { id: "OA-01", applicantId: "STAFF-01", status: "approved" }],
    ["ops-devices", "园区设备运行状态", "/admin/devices", page({ id: "DEVICE-01", state: "online", value: 120 })],
    ["ops-facilities", "设施运行目录", "/admin/facilities", page({ id: "FACILITY-01", availability: "open", load: "quiet" })],
    ["ops-inspections", "巡检计划列表", "/admin/inspections", page({ id: "INSPECTION-01", assigneeId: "STAFF-01", status: "scheduled" })],
  ] },
  { group: "运营管理", cases: [
    ["admin-dashboard", "管理端运营看板", "/admin/dashboard", { visitors: 3286, orders: 506, pendingAlerts: 2, pendingOA: 1 }],
    ["admin-workspace", "后台工作台汇总", "/admin/workspace", { runId: "RUN-01", revision: 128, modules: [{ id: "orders", count: 506 }] }],
    ["admin-order-list", "后台订单检索", "/admin/orders?status=reserved", page({ id: "ORDER-01", kind: "entry", status: "reserved" })],
    ["admin-user-list", "游客与员工目录", "/admin/users", page({ id: "STAFF-01", name: "工作人员 01", role: "staff", disabled: false })],
    ["admin-personnel", "岗位人员与工种", "/admin/people", { items: [{ id: "STAFF-01", role: "staff", tradeId: "TRADE-01" }], trades: [{ id: "TRADE-01", name: "设施维护" }] }],
    ["admin-activity", "岗位工作留痕", "/admin/people/STAFF-01/activity", page({ id: "ACTIVITY-01", actorId: "STAFF-01", action: "task-completed" })],
    ["admin-content", "后台资讯目录", "/admin/articles", page({ id: "ARTICLE-01", title: "游览指南", published: true })],
    ["admin-notices", "后台公告管理", "/admin/notices", page({ id: "NOTICE-01", audience: "public", active: true })],
    ["admin-service-status", "平台模块服务状态", "/admin/service-status", { modules: [{ id: "backend", healthy: 1, unhealthy: 0, unknown: 0 }] }],
    ["admin-audit", "管理操作审计", "/admin/logs", page({ id: "LOG-01", actorId: "STAFF-01", action: "read", resourceId: "ORDER-01" })],
  ] },
];
export const scenicExtendedEndpoints: Endpoint[] = modules.flatMap(({ group, cases }) => cases.map(([id, name, path, payload]): Endpoint => ({
  id: `scenic-${id}`, name, group, path, status: 200, budget: 500, baseline: 30 + id.length * 3 % 30,
  contract: `data 包含 ${Object.keys(payload).join("、")}，字段类型、非负数值及列表结构有效`,
  fixture: { data: payload }, validate: body => matches(body, { data: payload }),
})));
