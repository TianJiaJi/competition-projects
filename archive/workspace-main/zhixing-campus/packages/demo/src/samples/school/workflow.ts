import { referenceMaterials } from "./materials.ts";
import type { WorkflowNode, RoleId, WorkflowKind } from "../../builder/types";
const nodes: WorkflowNode[] = [];
function node(
  stage: RoleId,
  key: string,
  kind: WorkflowKind,
  title: string,
  summary: string,
  deps: string[],
  extra: Partial<WorkflowNode> = {},
) {
  const id = `${stage}-${key}`;
  nodes.push({ id, stage, kind, title, summary, deps, ...extra });
  return id;
}
function source(
  stage: RoleId,
  key: string,
  title: string,
  filename: string,
  summary: string,
) {
  return node(stage, key, "source", title, summary, [], {
    filename,
    materials: referenceMaterials(`${stage}-${key}`),
  });
}
function chain(
  stage: RoleId,
  rows: [string, string, string][],
  previous: string,
) {
  for (const [key, title, summary] of rows)
    previous = node(stage, key, "process", title, summary, [previous]);
  return previous;
}
const map = source(
  "01",
  "map",
  "图片地图",
  "M01.png",
  "校园区域、道路和建筑轮廓的输入材料。",
);
const coordinates = source(
  "01",
  "coordinates",
  "设施坐标与地形",
  "M03.json",
  "建筑、设施编号与空间坐标，交给空间映射节点。",
);
const reference = source(
  "01",
  "reference",
  "沙盘参考模板",
  "sandbox-reference.json",
  "完整校园模型、浏览方式和重点标识规范。",
);
let p = node(
  "01",
  "requirement",
  "requirement",
  "描述空间需求",
  "明确地图范围、重点区域和浏览方式。",
  [map],
);
p = chain(
  "01",
  [
    ["outline", "识别区域与轮廓", "已整理教学区、生活区、公共空间及道路边界。"],
    [
      "svg",
      "整理 SVG 地图",
      "区域路径、建筑轮廓与标识图层已整理，保留完整校园范围。",
    ],
  ],
  p,
);
p = node(
  "01",
  "mapping",
  "process",
  "映射建筑与设施",
  "建立建筑—设施—坐标关系；明理楼 B1 关联投影设备 F4。",
  [p, coordinates],
  { artifact: 1 },
);
p = node(
  "01",
  "scheme",
  "process",
  "形成沙盘方案",
  "套用完整模型与浏览模板，提供旋转、缩放、区域浏览和空间详情。",
  [p, reference],
);
p = node(
  "01",
  "adjustment",
  "adjustment",
  "调整空间方案",
  "审阅初稿，描述调整并确认采用的方案。",
  [p],
);
p = chain(
  "01",
  [
    [
      "revision",
      "应用视角与标识调整",
      "默认学习视角；突出教学区，统一重点标识，补充 B1 → F4 聚焦入口。",
    ],
  ],
  p,
);
p = node(
  "01",
  "publish",
  "execution",
  "生成空间成果",
  "空间浏览入口与本轮成果清单已整理。",
  [p],
  { action: "publish" },
);
const spatial = node(
  "01",
  "acceptance",
  "acceptance",
  "验收沙盘成果",
  "检查模型浏览、教学区聚焦和设施详情，将空间成果交给前端。",
  [p],
);
const pages = source(
  "02",
  "pages",
  "页面模板",
  "public-pages.html",
  "公共端、运行监控、手机、后勤、管理后台页面模板。",
);
const components = source(
  "02",
  "components",
  "公共组件",
  "navigation-layout.html",
  "导航、沙盘、指标、列表、详情、表单和状态组件。",
);
p = node(
  "02",
  "requirement",
  "requirement",
  "描述分端需求",
  "接收空间成果，明确五端面向的角色与功能。",
  [spatial, pages, components],
);
p = chain(
  "02",
  [
    [
      "roles",
      "拆解五端职责",
      "公共端展示空间；监控关注运行；手机提交与查看；后勤处理；管理维护。",
    ],
    [
      "components-plan",
      "匹配页面与组件",
      "为首页、列表、详情及表单匹配组件，公共端和监控接入沙盘。",
    ],
    [
      "navigation",
      "整理导航与布局",
      "按角色组织导航与首屏信息，保持五端全部现有页面可访问。",
    ],
  ],
  p,
);
p = node(
  "02",
  "adjustment",
  "adjustment",
  "调整页面方案",
  "审阅页面结构，描述分端职责及导航调整。",
  [p],
);
p = chain(
  "02",
  [
    [
      "assembly",
      "连接页面与组件",
      "页面、导航、沙盘和业务组件已对应；列表、详情、筛选与表单可操作。",
    ],
    [
      "data-needs",
      "整理数据需求清单",
      "交接实体字段、关联编号和读写操作；区分提交人与处理人，预约使用日期、时段和人数。",
    ],
  ],
  p,
);
p = node(
  "02",
  "publish",
  "execution",
  "生成五端页面成果",
  "公共端、运行监控、手机、后勤和管理后台入口已整理。",
  [p],
  { action: "publish" },
);
const frontend = node(
  "02",
  "acceptance",
  "acceptance",
  "验收五端页面",
  "检查分端职责、导航与页面交互，将数据需求清单交给数据与服务负责人。",
  [p],
);
const sql = source(
  "03",
  "sql-template",
  "表结构与 SQL 模板",
  "schema-and-queries.sql",
  "实体表、关联查询、参数化写入和业务状态操作模板。",
);
const services = source(
  "03",
  "service-template",
  "服务处理模板",
  "service-contract.json",
  "参数校验、业务规则、SQL 绑定、返回结构和错误处理。",
);
p = node(
  "03",
  "requirement",
  "requirement",
  "描述数据与服务需求",
  "接收页面数据清单，明确实体关系、查询和业务操作。",
  [frontend, sql, services],
);
p = chain(
  "03",
  [
    [
      "entities",
      "整理实体与关联",
      "楼宇关联设施，工单关联设施及提交人；预约保留设施、日期、时段和人数。",
    ],
    [
      "schema",
      "适配表结构",
      "分离 submitterId 与 assigneeId，保留 buildingId、facilityId 与处理结果。",
    ],
    [
      "queries",
      "适配参数化 SQL",
      "按列表、详情、提交、领取、完成和取消操作整理参数化查询与写入。",
    ],
    [
      "validation",
      "接收并校验参数",
      "检查字段、关联编号和必要参数，整理明确的错误返回。",
    ],
    [
      "rules",
      "执行业务规则",
      "校验角色、记录归属和任务状态；完成必须填写处理结果。",
    ],
    [
      "binding",
      "绑定 SQL 参数",
      "将服务入参对应到 SQL 占位参数，区分读取、写入与事务操作。",
    ],
    [
      "response",
      "整理返回结构",
      "返回记录、关联字段和更新时间，供五端列表、详情、指标与表单使用。",
    ],
  ],
  p,
);
p = node(
  "03",
  "adjustment",
  "adjustment",
  "调整数据与服务方案",
  "审阅关联、人员归属、业务规则与接口返回，确认组装。",
  [p],
);
p = chain(
  "03",
  [
    [
      "revision",
      "汇总修订产物",
      "表结构、查询和服务契约已整理；领取保留提交人归属，完成结果可跨端查看。",
    ],
  ],
  p,
);
p = node(
  "03",
  "database",
  "execution",
  "初始化本轮数据库",
  "创建表结构，准备业务数据并检查关联查询。",
  [p],
  { action: "initialize", artifact: 0 },
);
p = node(
  "03",
  "collect",
  "process",
  "汇集应用产物",
  "接收空间组件、五端页面、数据结构及服务契约，整理组装清单。",
  [p, spatial, frontend],
);
p = chain(
  "03",
  [
    [
      "manifest",
      "核对装配清单",
      "空间编号、页面需求、服务字段与操作入口已对应到本轮产物。",
    ],
    [
      "space-pages",
      "连接沙盘与页面",
      "公共展示和运行监控接入沙盘；空间详情关联楼宇与设施记录。",
    ],
    [
      "fields",
      "对应字段与接口",
      "列表、详情、指标与表单字段对应服务记录；统一设施、楼宇及人员关联。",
    ],
    [
      "actions",
      "绑定按钮与业务操作",
      "提交报修→后勤领取→填写结果→完成；预约、取消和管理编辑对应各自服务操作。",
    ],
    [
      "collaboration",
      "配置跨端协作",
      "各端使用本轮服务与身份；操作后更新当前页面，其他端约每两秒同步。",
    ],
  ],
  p,
);
p = node(
  "03",
  "connection",
  "execution",
  "检查服务连接",
  "检查服务响应和本轮数据读取，保留连接结果。",
  [p],
  { action: "connect" },
);
p = node(
  "03",
  "publish",
  "execution",
  "生成应用成果",
  "五端成果链接与装配清单已整理，可以打开页面验收。",
  [p],
  { action: "publish" },
);
p = node(
  "03",
  "acceptance",
  "acceptance",
  "验收整体应用",
  "查看五端联通成果，登记观察后交给测试负责人。",
  [p],
);
p = node(
  "04",
  "testing",
  "placeholder",
  "测试流程",
  "待定义 · 接收整体应用与交接记录。",
  [p],
);
node(
  "04",
  "delivery",
  "placeholder",
  "最终交付",
  "待定义 · 测试结论与最终交付内容将在后续补充。",
  [p],
);
for (const item of nodes) {
  if (
    ["03-response", "02-data-needs", "03-manifest", "01-scheme"].includes(
      item.id,
    )
  )
    item.showArtifacts = true;
}
// Module placement is a sample concern; execution follows deps, never these coordinates.
export const modules = [
  { id: "space", title: "空间构建", role: "01", placement: "left" },
  { id: "pages", title: "界面搭建", role: "02", placement: "top" },
  { id: "services", title: "数据与服务", role: "03", placement: "right" },
  { id: "assembly", title: "自动总装", role: "03", placement: "center" },
  { id: "delivery", title: "测试与交付", role: "04", placement: "bottom" },
] as const;
node(
  "01",
  "coordinate-plan",
  "process",
  "整理空间坐标",
  "建筑、设施与坐标条目已对应，形成空间映射输入。",
  ["01-requirement", coordinates],
);
node(
  "01",
  "reference-plan",
  "process",
  "分析视角与标识",
  "浏览视角、重点标识与模型参考已整理。",
  ["01-requirement", reference],
);
const update = (id: string, values: Partial<WorkflowNode>) =>
  Object.assign(nodes.find((n) => n.id === id)!, values);
update("01-mapping", { deps: ["01-svg", "01-coordinate-plan"] });
update("01-scheme", { deps: ["01-mapping", "01-reference-plan"] });
update("02-navigation", { deps: ["02-roles"] });
update("02-adjustment", { deps: ["02-components-plan", "02-navigation"] });
update("02-data-needs", { deps: ["02-adjustment"] });
update("02-publish", { deps: ["02-assembly", "02-data-needs"] });
update("03-validation", { title: "设计参数校验", deps: ["03-entities"] });
update("03-rules", { title: "设计业务规则" });
update("03-response", { title: "设计返回结构", deps: ["03-entities"] });
update("03-binding", {
  title: "核对 SQL 参数绑定",
  deps: ["03-queries", "03-rules"],
});
update("03-adjustment", { deps: ["03-binding", "03-response"] });
update("03-collect", {
  title: "接收空间骨架",
  summary: "空间结构、浏览组件与标识映射已接入应用骨架。",
  deps: [spatial],
});
update("03-manifest", {
  title: "核对空间装配清单",
  summary: "空间组件、区域编号及详情入口已对应到装配清单。",
  deps: ["03-collect"],
});
update("03-space-pages", { deps: ["03-manifest", frontend] });
update("03-fields", { deps: [frontend, "03-database"] });
update("03-collaboration", { deps: ["03-space-pages", "03-actions"] });
const placements: Record<string, [string, number, number, string]> = {
  "01-map": ["space", 0, 0, "地图材料"],
  "01-coordinates": ["space", 1, 0, "坐标材料"],
  "01-reference": ["space", 2, 0, "参考模板"],
  "01-requirement": ["space", 0, 1, "空间需求"],
  "01-outline": ["space", 1, 1, "区域轮廓"],
  "01-svg": ["space", 1, 2, "SVG 图层"],
  "01-coordinate-plan": ["space", 2, 1, "空间坐标"],
  "01-reference-plan": ["space", 3, 0, "视角规范"],
  "01-mapping": ["space", 2, 2, "空间映射"],
  "01-scheme": ["space", 3, 1, "沙盘方案"],
  "01-adjustment": ["space", 4, 0, "确认的空间方案"],
  "01-revision": ["space", 4, 2, "视角与标识配置"],
  "01-publish": ["space", 5, 0, "沙盘入口"],
  "01-acceptance": ["space", 5, 1, "已验收的空间成果"],
  "02-pages": ["pages", 0, 0, "页面模板"],
  "02-components": ["pages", 1, 0, "组件清单"],
  "02-requirement": ["pages", 0, 1, "分端需求"],
  "02-roles": ["pages", 1, 1, "分端职责"],
  "02-components-plan": ["pages", 2, 0, "组件对应表"],
  "02-navigation": ["pages", 2, 1, "导航与布局"],
  "02-adjustment": ["pages", 3, 0, "确认的页面方案"],
  "02-assembly": ["pages", 4, 0, "页面装配结果"],
  "02-data-needs": ["pages", 4, 1, "数据需求清单"],
  "02-publish": ["pages", 5, 0, "五端入口"],
  "02-acceptance": ["pages", 5, 1, "已验收的页面与需求"],
  "03-sql-template": ["services", 0, 0, "SQL 模板"],
  "03-service-template": ["services", 1, 0, "服务模板"],
  "03-requirement": ["services", 0, 1, "数据与服务需求"],
  "03-entities": ["services", 1, 1, "实体与关联"],
  "03-schema": ["services", 2, 1, "表结构"],
  "03-queries": ["services", 2, 2, "参数化 SQL"],
  "03-validation": ["services", 3, 1, "参数校验方案"],
  "03-rules": ["services", 3, 2, "业务规则"],
  "03-response": ["services", 1, 2, "返回契约"],
  "03-binding": ["services", 4, 2, "参数绑定清单"],
  "03-adjustment": ["services", 4, 0, "确认的服务方案"],
  "03-revision": ["services", 5, 0, "服务与 SQL 产物"],
  "03-database": ["services", 5, 1, "本轮数据与服务"],
  "03-collect": ["assembly", 0, 0, "应用空间骨架"],
  "03-manifest": ["assembly", 1, 0, "空间装配清单"],
  "03-space-pages": ["assembly", 2, 0, "空间与页面连接"],
  "03-fields": ["assembly", 0, 1, "字段与接口映射"],
  "03-actions": ["assembly", 1, 1, "业务操作绑定"],
  "03-collaboration": ["assembly", 3, 0, "跨端配置"],
  "03-connection": ["assembly", 3, 1, "连接检查结果"],
  "03-publish": ["assembly", 4, 0, "整体应用入口"],
  "03-acceptance": ["assembly", 4, 1, "整体应用验收"],
  "04-testing": ["delivery", 0, 0, "测试结论"],
  "04-delivery": ["delivery", 1, 0, "交付记录"],
};
const specificPhases: Record<string, string[]> = {
  "01-outline": [
    "读取地图的区域与道路标识",
    "区分教学区、生活区和公共空间",
    "核对建筑边界与区域归属",
    "整理区域轮廓清单",
  ],
  "01-svg": [
    "接收区域轮廓",
    "整理路径、图层与标识",
    "检查图层命名及重叠关系",
    "输出 SVG 地图结构",
  ],
  "01-coordinate-plan": [
    "读取建筑和设施坐标",
    "统一坐标基准",
    "对应空间编号与位置",
    "整理坐标映射输入",
  ],
  "01-reference-plan": [
    "读取模型浏览参考",
    "梳理重点区域与标识",
    "比较默认视角与浏览范围",
    "整理视角和标识规范",
  ],
  "03-validation": [
    "接收页面操作的入参清单",
    "区分必填、格式与关联检查",
    "整理无效参数的错误信息",
    "输出参数校验方案",
  ],
  "03-rules": [
    "读取角色与业务操作",
    "核对提交人、处理人与记录归属",
    "整理领取、完成和取消的前置条件",
    "输出业务规则",
  ],
  "03-response": [
    "读取列表、详情和指标需求",
    "统一关联字段与处理结果",
    "整理成功及错误返回",
    "输出页面可用的返回契约",
  ],
  "03-binding": [
    "汇合 SQL 与服务规则",
    "逐项对应入参和占位参数",
    "检查写入范围与事务边界",
    "输出参数绑定清单",
  ],
  "03-collect": [
    "接收已验收的空间成果",
    "对应区域、建筑与设施标识",
    "接入浏览与详情入口",
    "形成应用空间骨架",
  ],
  "03-space-pages": [
    "接收空间骨架与页面成果",
    "将沙盘接入公共端和监控端",
    "对应导航与空间详情入口",
    "整理页面连接清单",
  ],
  "03-fields": [
    "接收页面字段与服务契约",
    "对应列表、详情、指标和表单",
    "核对实体编号及人员归属",
    "输出字段与接口映射",
  ],
  "03-actions": [
    "读取页面按钮和业务规则",
    "对应报修、领取、完成与取消",
    "连接操作参数及结果反馈",
    "整理业务操作绑定",
  ],
};
for (const n of nodes) {
  const [module, column, row, outputName] = placements[n.id];
  Object.assign(n, { module, layout: { column, row }, outputName });
  const auto = ["process", "execution"].includes(n.kind);
  n.task = auto ? `${n.title}，形成${outputName}。` : n.summary;
  if (n.kind === "process") {
    n.durationMs = [
      "01-mapping",
      "02-assembly",
      "03-queries",
      "03-fields",
      "03-actions",
    ].includes(n.id)
      ? 50000
      : 25000;
    n.phases = specificPhases[n.id] || [
      `接收${n.deps.map((id) => placements[id][3]).join("、")}`,
      `梳理${outputName}所需的约束`,
      `核对${outputName}与上游的对应关系`,
      `整理${outputName}并准备交接`,
    ];
  }
  n.inputs = Object.fromEntries(n.deps.map((id) => [id, placements[id][3]]));
}
export const workflow = nodes;
