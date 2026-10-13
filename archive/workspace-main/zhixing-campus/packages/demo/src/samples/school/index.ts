import { materialAssets } from "./materials.ts";
import { workflow, modules } from "./workflow.ts";
import { scenario as base } from "../../../../../scenario/config.ts";
import type { Scenario } from "../../../../domain/src/types";
import type { Records, SampleDefinition } from "../../builder/types";
export const caseId = "school-assembly";
export const version = "2.0.0";
export const assetFiles = [
  "M01.png",
  "M02.svg",
  "M03.json",
  "R01-campus.png",
  ...materialAssets,
];
export const roles = {
  mobile: "师生用户 01",
  staff: "后勤人员",
  admin: "管理员",
};
export const collections = [
  "buildings",
  "people",
  "facilities",
  "tasks",
  "inspections",
  "bookings",
  "notices",
  "security",
  "visitors",
  "parking",
] as const;
export const editable = collections.slice(0, 8);
export function schoolScenario(): Scenario & { seed: Records } {
  let serialized = JSON.stringify(base);
  const names = [
    ...new Set([
      ...base.seed.people.map((p) => p.title),
      ...Object.values(base.seed)
        .flat()
        .map((p) => p.owner)
        .filter(Boolean),
    ]),
  ] as string[];
  names
    .sort((a, b) => b.length - a.length)
    .forEach((name, i) => {
      serialized = serialized
        .split(name)
        .join(`角色 ${String(i + 1).padStart(2, "0")}`);
    });
  const result = JSON.parse(serialized) as Scenario & { seed: Records };
  for (const item of Object.values(result.seed).flat()) {
    if (item.contact) item.contact = "";
  }
  const mapping: Record<string, string> = {
    F1: "B3",
    F2: "B6",
    F3: "B4",
    F4: "B1",
    F6: "B3",
    F7: "B1",
  };
  for (const item of result.seed.facilities) item.buildingId = mapping[item.id];
  for (const item of [...result.seed.tasks, ...result.seed.inspections]) {
    item.submitterId = "user01";
    item.owner = roles.mobile;
    if (item.status !== "待处理") item.assigneeId = "staff01";
  }
  Object.assign(result.seed.tasks[0], { facilityId: "F4", buildingId: "B1" });
  Object.assign(result.seed.tasks[2], { facilityId: "F1", buildingId: "B3" });
  Object.assign(result.seed.tasks[3], { facilityId: "F2", buildingId: "B6" });
  for (const [i, item] of result.seed.bookings.entries()) {
    const facility = result.seed.facilities[[0, 1, 2, 0][i]];
    Object.assign(item, {
      facilityId: facility.id,
      buildingId: facility.buildingId,
      submitterId: i === 0 ? "user01" : `user0${i + 1}`,
      owner: i === 0 ? roles.mobile : `师生用户 0${i + 1}`,
      timeSlot: ["14:00–15:00", "18:00–19:00", "15:00–16:00", "09:00–10:00"][i],
      count: [6, 4, 8, 1][i],
    });
  }
  return result;
}
export const columns = [
  "id",
  "title",
  "location",
  "category",
  "status",
  "description",
  "date",
  "contact",
  "result",
  "capacity",
  "used",
  "owner",
  "facilityId",
  "buildingId",
  "submitterId",
  "assigneeId",
  "timeSlot",
  "count",
] as const;
export const schema = collections
  .map(
    (name) => `CREATE TABLE IF NOT EXISTS ${name} (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);`,
  )
  .join("\n");
export function insertSql(table: string, upsert = false) {
  if (!(collections as readonly string[]).includes(table))
    throw Error("未知数据表");
  return `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})${
    upsert
      ? ` ON CONFLICT(id) DO UPDATE SET ${columns
          .filter((k) => k !== "id")
          .map((k) => `${k}=excluded.${k}`)
          .join(",")}`
      : ""
  }`;
}
export const relationQuery = `SELECT t.id, t.title, t.status, t.submitterId, t.assigneeId,
  f.id AS facilityId, f.title AS facilityTitle, b.id AS buildingId, b.title AS buildingTitle
FROM tasks t JOIN facilities f ON t.facilityId = f.id
JOIN buildings b ON f.buildingId = b.id WHERE t.id = ?;`;
const dataNeeds = `公共端：楼宇、设施、场馆、预约、公告、指标\n运行监控：工单待办、安防、设施状态、空间指标\n手机：我的报修/预约、设施选择、提交/取消、处理结果\n后勤：工单/巡检领取、结果校验、完成历史\n管理后台：楼宇/师生/设施/工单/巡检/预约/公告/安防的新增和编辑\n关联：buildingId、facilityId、submitterId、assigneeId\n预约：date、timeSlot、count；完成：result`;
export const definition: SampleDefinition = {
  caseId,
  version,
  name: "学校应用样例",
  workflow,
  modules: modules.map((m) => ({ ...m })),
  steps: [
    {
      id: "01",
      title: "空间构建",
      owner: "空间构建负责人",
      purpose: "从地图素材和空间模板整理可浏览的空间成果。",
      prompt:
        "以学校为样例，保留完整校园模型和建筑详情，支持缩放、旋转和区域浏览。",
      adjustment:
        "突出教学区，统一重点标识，默认使用学习视角，并提供明理楼投影设备的聚焦入口。",
      templates: ["完整空间模型", "区域与建筑映射", "标识和浏览交互"],
      draft: "使用完整校园模型，展示楼宇、道路与公共空间；从全景开始浏览。",
      revised:
        "保留完整模型，使用学习视角；重点空间使用统一标识，增加教学区及设施详情聚焦入口。",
      handoff: "交给 02：空间结构、楼宇与设施编号、默认视角及可复用沙盘组件。",
      artifacts: [
        {
          title: "空间方案与调整",
          before: "默认全景；区域同等展示；通用空间标识。",
          after: "默认 learning 学习视角；突出教学区；B1 → F4 聚焦与详情。",
        },
        {
          title: "地图与空间映射",
          assets: [
            {
              label: "M01 · 地图示意图",
              url: "http://localhost:5507/api/assets/M01.png",
              image: true,
            },
            {
              label: "M02 · SVG 素材",
              url: "http://localhost:5507/api/assets/M02.svg",
              image: true,
            },
            {
              label: "M03 · 完整坐标材料",
              url: "http://localhost:5507/api/assets/M03.json",
            },
          ],
          before: "地图素材 → 区域与建筑 → 现有三维模型",
          after: JSON.stringify(
            {
              notice: "校园区域与空间映射材料",
              assets: ["M01.png", "M02.svg", "M03.json"],
              building: "B1",
              facility: "F4",
              view: "learning",
              model: "完整校园模型",
            },
            null,
            2,
          ),
        },
      ],
    },
    {
      id: "02",
      title: "界面搭建",
      owner: "界面搭建负责人",
      purpose: "把页面与组件模板组织成面向不同角色的应用。",
      prompt:
        "需要公共展示、运行监控、师生手机、后勤处理、管理后台五端，保留各端全部现有页面。",
      adjustment:
        "区分各端职责：手机负责提交和查看本人记录，后勤负责处理，管理端负责维护；调整导航与首页重点，整理数据交接清单。",
      templates: [
        "公共展示与沙盘",
        "运行看板",
        "手机服务页面",
        "任务工作台",
        "管理列表与编辑器",
      ],
      draft: "五端页面模板已列出，使用样例数据展示页面结构、列表、详情和表单。",
      revised:
        "按角色划分导航与首屏信息；各端支持页面交互，并向数据负责人交付字段、关系和读写需求。",
      handoff:
        "交给 03：五端页面、组件清单和数据需求清单；同时交付页面交互与数据需求说明。",
      artifacts: [
        {
          title: "分端页面与组件",
          before: "五端通用页面模板：导航、列表、详情、表单、指标、沙盘。",
          after:
            "公共端：空间与公告\n监控：指标、安防、待办、设施\n手机：首页、服务、预约、报修、记录、我的\n后勤：待办、工单、巡检、历史\n管理：八类业务列表和编辑器",
        },
        {
          title: "数据需求清单 → 03",
          before: "列表数据、详情字段、表单提交。",
          after: dataNeeds,
        },
      ],
    },
    {
      id: "03",
      title: "数据与服务",
      owner: "SQL / 服务负责人",
      purpose: "将表结构、SQL 与服务模板接到页面，执行并验证读写。",
      prompt:
        "接收五端数据需求，建立楼宇与设施关联，支持报修、预约、巡检和后台维护，提供本机 HTTP 服务。",
      adjustment:
        "提交人与处理人分开保存；报修和预约使用结构化关联；领取校验状态，完成必须有结果，返回可供五端直接使用的字段。",
      templates: [
        "通用表结构",
        "关联查询与参数绑定",
        "角色与业务校验",
        "HTTP 返回结构",
      ],
      draft:
        "通用数据表使用 owner 字段描述人员，查询返回基础列表，页面操作等待接入数据服务。",
      revised:
        "提交人 submitterId 与处理人 assigneeId 分离；服务校验角色及前置条件，参数化执行 SQL；五端共享 SQLite 的业务结果。",
      handoff:
        "交付五端联通成果、数据库结构、服务契约、初始化与调用记录；04 暂未定义。",
      artifacts: [
        {
          title: "建表 SQL",
          before: "人员仅有 owner；设施与预约信息尚未结构化。",
          after: schema,
        },
        {
          title: "关联查询 SQL",
          before: "SELECT id, title, owner FROM tasks;",
          after: relationQuery,
        },
        {
          title: "服务契约",
          before: "页面内部读写内存；无共享服务。",
          after:
            "接收与校验参数 → 校验角色 / 状态 / 归属 → 参数绑定并执行 SQL → 返回 records 与更新时间\nGET /api/runs/:run/records\nPOST /api/runs/:run/session\nDELETE /api/runs/:run/session\nPOST /api/runs/:run/records/:collection\nPUT /api/runs/:run/records/:collection/:id\nPOST /api/runs/:run/records/:collection/:id/:claim|complete|cancel\n响应失败：明确的 HTTP 状态及 error，不回落样例数据。",
        },
        {
          title: "字段与返回结构",
          before: "owner 被领取覆盖；预约信息写在描述里。",
          after: dataNeeds,
        },
      ],
    },
  ],
  previews: [
    {
      id: "public",
      label: "公共端",
      port: 5500,
      stages: ["01", "02", "03"],
    },
    { id: "ops", label: "运行监控", port: 5501, stages: ["02", "03"] },
    { id: "mobile", label: "手机端", port: 5502, stages: ["02", "03"] },
    { id: "staff", label: "后勤端", port: 5503, stages: ["02", "03"] },
    { id: "admin", label: "管理后台", port: 5504, stages: ["02", "03"] },
  ],
  manual: [
    { id: "H01", title: "大屏文字、沙盘与空间详情可读" },
    { id: "H02", title: "五端页面与分工清楚，独立窗口可切换" },
    { id: "H03", title: "报修、领取、结果与跨端更新现场核验" },
    { id: "H04", title: "设备连接、离线启动及恢复核验" },
    { id: "H05", title: "真人排练观察记录（两轮记录另见文档）" },
  ],
};
