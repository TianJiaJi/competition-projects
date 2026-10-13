import raw from "../assets/C01.json";
import { createState, type RecordItem, type Scenario } from "@scene/domain";
export interface DemoWorkOrder extends RecordItem {
  facilityId: string;
}
export interface DemoCase {
  caseId: string;
  version: string;
  buildings: { id: string; title: string }[];
  facilities: {
    id: string;
    buildingId: string;
    title: string;
    location: string;
  }[];
  workOrders: DemoWorkOrder[];
  completionResult: string;
}
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
export const C01: DemoCase = freeze(clone(raw));
export const CASE_ID = C01.caseId;
export const VERSION = C01.version;
export const ROLE = "后勤人员";
export function referenceInput(broken = false): DemoCase {
  const input = clone(C01);
  if (broken) input.workOrders[0].facilityId = "F404";
  return input;
}
export interface SqlRow {
  work_order_id: string;
  facility_id: string;
  building_id: string;
  facility_name: string;
  location: string;
  status: string;
  title: string;
  description: string;
  owner: string;
  result: string;
  category: string;
  date: string;
}
export function sqlRows(input = C01): SqlRow[] {
  return input.workOrders.map((t) => {
    const f = input.facilities.find((f) => f.id === t.facilityId);
    if (!f) throw new Error(`${t.id} 的设施引用 ${t.facilityId} 不存在`);
    return {
      work_order_id: t.id,
      facility_id: f.id,
      building_id: f.buildingId,
      facility_name: f.title,
      location: t.location,
      status: t.status,
      title: t.title,
      description: t.description,
      owner: t.owner ?? "",
      result: t.result ?? "",
      category: t.category,
      date: t.date,
    };
  });
}
export function adaptRows(rows: SqlRow[]): DemoWorkOrder[] {
  return rows.map((r) => ({
    id: r.work_order_id,
    facilityId: r.facility_id,
    title: r.title,
    location: r.location,
    status: r.status,
    description: r.description,
    owner: r.owner,
    result: r.result,
    category: r.category,
    date: r.date,
  }));
}
export function adaptFacilities(rows: SqlRow[]): DemoCase["facilities"] {
  return [
    ...new Map(
      rows.map((row) => [
        row.facility_id,
        {
          id: row.facility_id,
          buildingId: row.building_id,
          title: row.facility_name,
          location: row.location,
        },
      ]),
    ).values(),
  ];
}
export const F03 = freeze({
  name: "知行校园",
  facilities: C01.facilities,
  fields: ["id", "facilityId", "location", "status", "owner", "result"],
  theme: { brand: "#465B97", canvas: "#EEF2F8" },
});
export const SQL = `-- 预制 SQL 展示文本，未连接数据库、未执行\nSELECT w.id AS work_order_id, f.id AS facility_id,\n       b.id AS building_id, f.title AS facility_name,\n       w.location, w.status, w.title, w.description,\n       w.owner, w.result, w.category, w.date\nFROM work_orders w\nJOIN facilities f ON w.facility_id = f.id\nJOIN buildings b ON f.building_id = b.id\nWHERE w.id = 'T1' AND f.id = 'F4';`;
export const SQL_CONTRACT = {
  tables: ["buildings", "facilities", "work_orders"],
  parameters: { workOrderId: "T1", facilityId: "F4" },
  mapping: {
    work_order_id: "id",
    facility_id: "facilityId",
    building_id: "facilities[].buildingId",
    facility_name: "facilities[].title",
    location: "location",
    status: "status",
  },
};
export type DemoStage = "template" | "campus-ready" | "campus-map";
export function demoScenario(base: Scenario, stage: DemoStage): Scenario {
  const result = clone(base);
  // Sanitize the entire reachable demo copy, including hash-addressable collections.
  const names = [
    ...new Set([
      ...base.seed.people.map((p) => p.title),
      ...Object.values(base.seed)
        .flat()
        .map((p) => p.owner)
        .filter((n): n is string => !!n),
    ]),
  ].sort((a, b) => b.length - a.length);
  let serialized = JSON.stringify(result);
  names.forEach((name, i) => {
    serialized = serialized
      .split(name)
      .join(`角色 ${String(i + 1).padStart(2, "0")}`);
  });
  const anonymous: Scenario = JSON.parse(serialized);
  Object.values(anonymous.seed)
    .flat()
    .forEach((r) => {
      if (r.contact) r.contact = "";
    });
  if (stage === "campus-map") {
    const facility = anonymous.seed.facilities.find((f) => f.id === "F4");
    if (facility) Object.assign(facility, C01.facilities[0]);
    const task = anonymous.seed.tasks.find((t) => t.id === "T1");
    if (task) Object.assign(task, clone(C01.workOrders[0]));
    return anonymous;
  }
  Object.keys(anonymous.seed).forEach((k) => {
    anonymous.seed[k as keyof typeof anonymous.seed] = [];
  });
  if (stage === "campus-ready") {
    anonymous.name = F03.name;
    anonymous.theme = { ...anonymous.theme, ...F03.theme };
    anonymous.seed.tasks = adaptRows(sqlRows());
    anonymous.seed.facilities = adaptFacilities(sqlRows()).map((f) => ({
      ...f,
      category: "教学设备",
      status: "检修中",
      description: "关联楼宇 B1 · 明理楼；设施 F4。",
      date: "2026-10-09",
    }));
    anonymous.seed.buildings = C01.buildings.map((b) => ({
      ...b,
      location: "校园教学区",
      category: "教学楼",
      status: "使用中",
      description: "设施 F4 所属楼宇",
      date: "2026-10-09",
    }));
  } else {
    anonymous.name = "通用服务模板";
    anonymous.english = "SERVICE TEMPLATE";
    anonymous.tagline = "配置你的服务工作台";
    anonymous.description =
      "工单结构已就绪，等待应用场景名称、设施与数据适配。";
    anonymous.location = "服务区域";
  }
  return anonymous;
}
export function caseState(base: Scenario) {
  return createState(demoScenario(base, "campus-ready"));
}
export function facilityFor(item: RecordItem) {
  return C01.facilities.find(
    (f) => f.id === (item as DemoWorkOrder).facilityId,
  );
}
