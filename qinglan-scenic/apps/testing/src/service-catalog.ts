import type { Endpoint, SystemConfig } from "./types";
import { campusExtendedGroups } from "./campus-extended-cases";

export const CAMPUS_SYSTEM_ID = "smart-campus";
function matches(value: unknown, shape: unknown): boolean {
  if (Array.isArray(shape)) return Array.isArray(value) && value.every(item => !shape.length || matches(item, shape[0]));
  if (shape && typeof shape === "object") return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(shape).every(([key, child]) => matches((value as Record<string, unknown>)[key], child));
  if (typeof shape === "number") return typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (typeof shape === "boolean") return value === shape;
  return typeof value === "string" && value.length > 0;
}
function endpoint(id: string, group: string, name: string, path: string, data: Record<string, unknown>, budget = 500): Endpoint {
  return { id: `campus-${id}`, name, group, path, status: 200, budget, baseline: 28 + (id.length * 7 % 65),
    contract: `data 包含 ${Object.keys(data).join("、")}，字段类型与列表结构有效`,
    fixture: { data }, validate: body => matches(body, { data }) };
}
export const campusEndpoints: Endpoint[] = [
  endpoint("health", "平台基础", "校园服务健康检查", "/health", { ok: true, service: "campus" }, 200),
  endpoint("version", "平台基础", "平台发布版本", "/platform/version", { version: "1.0.0", revision: 16 }, 200),
  endpoint("modules", "平台基础", "业务模块清单", "/platform/modules", { items: [{ id: "logistics", name: "后勤服务", enabled: true }] }),
  endpoint("config", "平台基础", "校园基础配置", "/campus/config", { campusId: "CAMPUS-01", buildingCount: 8, facilityCount: 64 }),
  endpoint("overview", "平台基础", "校园运行概览", "/campus/overview", { buildings: 8, facilities: 64, pendingTasks: 1 }),
  endpoint("buildings", "校园空间", "楼宇目录", "/buildings", { items: [{ id: "B1", name: "教学楼一", floors: 4 }] }),
  endpoint("building", "校园空间", "B1 楼宇详情", "/buildings/B1", { id: "B1", name: "教学楼一", floors: 4 }),
  endpoint("floors", "校园空间", "楼层空间索引", "/buildings/B1/floors", { items: [{ id: "B1-L4", level: 4, roomCount: 12 }] }),
  endpoint("map", "校园空间", "校园地图坐标", "/campus/map", { items: [{ id: "B1", x: 320, y: 180 }] }),
  endpoint("locations", "校园空间", "设施位置关联", "/facilities/F4/location", { facilityId: "F4", buildingId: "B1", floor: 4 }),
  endpoint("facilities", "设施运维", "校园设施目录", "/facilities?buildingId=B1", { items: [{ id: "F4", buildingId: "B1", name: "照明设施", status: "online" }] }),
  endpoint("facility", "设施运维", "F4 设施详情", "/facilities/F4", { id: "F4", buildingId: "B1", category: "lighting", status: "online" }),
  endpoint("telemetry", "设施运维", "设备实时指标", "/facilities/F4/telemetry", { facilityId: "F4", voltage: 220, power: 45 }),
  endpoint("alerts", "设施运维", "设施告警清单", "/facilities/alerts", { items: [{ id: "ALERT-01", facilityId: "F4", level: "notice" }] }),
  endpoint("maintenance", "设施运维", "设施维护记录", "/facilities/F4/maintenance", { items: [{ id: "MAINT-01", facilityId: "F4", operatorId: "STAFF-01" }] }),
  endpoint("tasks", "后勤工单", "后勤工单列表", "/work-orders?buildingId=B1", { items: [{ id: "T1", facilityId: "F4", buildingId: "B1", status: "pending" }] }),
  endpoint("task", "后勤工单", "T1 工单详情", "/work-orders/T1", { id: "T1", facilityId: "F4", buildingId: "B1", status: "pending", version: 0 }),
  endpoint("pending", "后勤工单", "后勤待办数量", "/work-orders/summary", { pending: 1, processing: 0, completed: 12 }),
  endpoint("assignees", "后勤工单", "可分配岗位目录", "/work-orders/assignees", { items: [{ id: "STAFF-01", role: "后勤人员", available: true }] }),
  endpoint("task-history", "后勤工单", "工单流转记录", "/work-orders/T1/history", { items: [{ id: "EVENT-01", action: "created", operatorId: "ROLE-01" }] }),
  endpoint("rooms", "教学服务", "教学空间目录", "/teaching/rooms", { items: [{ id: "ROOM-401", buildingId: "B1", capacity: 48 }] }),
  endpoint("timetable", "教学服务", "教室课表查询", "/teaching/rooms/ROOM-401/timetable", { items: [{ id: "CLASS-01", roomId: "ROOM-401", slot: "08:00–09:40" }] }),
  endpoint("bookings", "教学服务", "空间预约记录", "/teaching/bookings", { items: [{ id: "BOOK-01", roomId: "ROOM-401", accountId: "ACCOUNT-01", status: "confirmed" }] }),
  endpoint("availability", "教学服务", "空闲时段查询", "/teaching/rooms/ROOM-401/availability", { items: [{ id: "SLOT-02", available: true, capacity: 48 }] }),
  endpoint("resources", "教学服务", "教学资源清单", "/teaching/resources", { items: [{ id: "RES-01", roomId: "ROOM-401", category: "projector", available: true }] }),
  endpoint("identity", "权限审计", "岗位身份信息", "/access/identity", { accountId: "STAFF-01", role: "后勤人员" }),
  endpoint("roles", "权限审计", "角色权限目录", "/access/roles", { items: [{ id: "ROLE-01", name: "后勤人员", permissionCount: 6 }] }),
  endpoint("permissions", "权限审计", "资源访问权限", "/access/permissions?resource=T1", { resourceId: "T1", accountId: "STAFF-01", readable: true }),
  endpoint("scope", "权限审计", "岗位数据范围", "/access/scope", { accountId: "STAFF-01", items: [{ id: "B1", type: "building" }] }),
  endpoint("audit", "权限审计", "业务审计日志", "/audit/events", { items: [{ id: "AUDIT-01", accountId: "STAFF-01", action: "read", resourceId: "T1" }] }),
  ...campusExtendedGroups.flatMap(({ group, cases }) => cases.map(([id, name, path, data]) => endpoint(id, group, name, path, data))),
];
const configurations = (endpoints: Endpoint[]) => endpoints.map(({ id, name, path, status, budget }) => ({ id, name, path, status, budget, contractId: id }));
export function campusSystem(): SystemConfig {
  return { id: CAMPUS_SYSTEM_ID, name: "智慧校园", baseUrl: "/campus-api/v1", endpoints: configurations(campusEndpoints),
    registration: { source: "catalog", manifestId: "campus-platform-v1", templateName: "智慧校园一体化解决方案", publisher: "方案设计岗位", version: "1.0.0", dataSource: "local-manifest" } };
}
export interface PublishedPlatform {
  id: string; name: string; baseUrl: string; templateName: string; publisher: string; version: string; description: string; endpointIds: string[];
}
export const publishedPlatforms: PublishedPlatform[] = [
  { id: "campus-logistics", name: "智慧后勤服务平台", baseUrl: "/logistics-api/v1", templateName: "校园后勤服务模板", publisher: "应用开发岗位 02", version: "1.2.0", description: "设施定位、工单受理、岗位分派与运维留痕", endpointIds: ["health", "version", "buildings", "locations", "facilities", "alerts", "maintenance", "tasks", "task", "pending", "assignees", "task-history"] },
  { id: "campus-booking", name: "教学空间预约平台", baseUrl: "/booking-api/v1", templateName: "空间预约解决方案", publisher: "应用开发岗位 03", version: "1.0.0", description: "空间目录、课表查询、空闲时段与预约权限", endpointIds: ["health", "version", "buildings", "floors", "locations", "rooms", "timetable", "bookings", "availability", "resources", "roles", "scope"] },
  { id: "campus-inspection", name: "校园安全巡检平台", baseUrl: "/inspection-api/v1", templateName: "设备巡检与权限审计模板", publisher: "应用开发岗位 04", version: "1.1.0", description: "设备指标、告警巡检、维护追踪与访问审计", endpointIds: ["health", "version", "facilities", "facility", "telemetry", "alerts", "maintenance", "identity", "roles", "permissions", "scope", "audit"] },
];
export function platformSystem(platform: PublishedPlatform, registeredAt: string): SystemConfig {
  const entries = platform.endpointIds.map(id => {
    const entry = campusEndpoints.find(endpoint => endpoint.id === `campus-${id}`);
    if (!entry) throw new Error(`发布清单包含未知接口：${id}`);
    return entry;
  });
  return { id: platform.id, name: platform.name, baseUrl: platform.baseUrl, endpoints: configurations(entries),
    registration: { source: "discovery", manifestId: platform.id, templateName: platform.templateName, publisher: platform.publisher, version: platform.version, registeredAt, dataSource: "local-manifest" } };
}
