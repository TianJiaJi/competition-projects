import { CASE_ID, VERSION } from "./data";
import type { CheckReport } from "./checks";
export type Group = "map" | "sql" | "frontend" | "test" | "acceptance";
export type NodeStatus =
  | "pending"
  | "running"
  | "produced"
  | "passed"
  | "failed"
  | "preloaded"
  | "stale";
export interface WorkflowNode {
  id: string;
  label: string;
  caption: string;
  group: Group;
  x: number;
  y: number;
  deps: string[];
  action: string;
  materials: string[];
}
export const groups: {
  id: Group;
  label: string;
  step: string;
  x: number;
  y: number;
  width: number;
  height: number;
}[] = [
  {
    id: "map",
    label: "空间产物",
    step: "01",
    x: 30,
    y: 30,
    width: 960,
    height: 410,
  },
  {
    id: "sql",
    label: "数据与引用",
    step: "02",
    x: 30,
    y: 470,
    width: 960,
    height: 410,
  },
  {
    id: "frontend",
    label: "校园前端",
    step: "03",
    x: 1030,
    y: 30,
    width: 680,
    height: 620,
  },
  {
    id: "test",
    label: "真实检查",
    step: "04",
    x: 1750,
    y: 30,
    width: 650,
    height: 620,
  },
  {
    id: "acceptance",
    label: "人工验收与交付",
    step: "05",
    x: 1030,
    y: 690,
    width: 1370,
    height: 190,
  },
];
export const nodes: WorkflowNode[] = [
  {
    id: "image",
    label: "校园图片",
    caption: "M01 · 预制布局示意图",
    group: "map",
    x: 60,
    y: 120,
    deps: [],
    action: "载入校园图片",
    materials: ["M01", "C01"],
  },
  {
    id: "svg",
    label: "预制 SVG",
    caption: "M02 · 建筑与道路",
    group: "map",
    x: 370,
    y: 120,
    deps: ["image"],
    action: "加载 SVG 产物",
    materials: ["M02"],
  },
  {
    id: "terrain",
    label: "设施与地形配置",
    caption: "M03 · 模型相对坐标",
    group: "map",
    x: 60,
    y: 300,
    deps: [],
    action: "载入设施配置",
    materials: ["M03"],
  },
  {
    id: "standard",
    label: "沙盘参考标准",
    caption: "M04 · 样式与映射",
    group: "map",
    x: 370,
    y: 300,
    deps: [],
    action: "载入参考标准",
    materials: ["M04"],
  },
  {
    id: "map",
    label: "沙盘产物装配",
    caption: "M05 · 打开真实校园模型",
    group: "map",
    x: 690,
    y: 190,
    deps: ["svg", "terrain", "standard"],
    action: "查看校园沙盘",
    materials: ["M05"],
  },
  {
    id: "requirement",
    label: "自然语言需求",
    caption: "S01 · 固定校园需求",
    group: "sql",
    x: 60,
    y: 560,
    deps: ["map"],
    action: "载入需求",
    materials: ["S01"],
  },
  {
    id: "sql-template",
    label: "SQL 模板",
    caption: "S02 · 字段与替换参数",
    group: "sql",
    x: 60,
    y: 735,
    deps: ["map"],
    action: "载入 SQL 模板",
    materials: ["S02"],
  },
  {
    id: "reference",
    label: "字段与引用校验",
    caption: "S03 / S04 · 唯一异常",
    group: "sql",
    x: 370,
    y: 630,
    deps: ["requirement", "sql-template"],
    action: "检查当前引用",
    materials: ["S03", "S04"],
  },
  {
    id: "sql",
    label: "SQL 与配套结果",
    caption: "S05 / S06 · SQL 未执行",
    group: "sql",
    x: 690,
    y: 630,
    deps: ["reference"],
    action: "加载 SQL 与结果",
    materials: ["S05", "S06"],
  },
  {
    id: "template",
    label: "通用前端模板",
    caption: "F01 · 打开应用前页面",
    group: "frontend",
    x: 1060,
    y: 120,
    deps: ["sql"],
    action: "查看通用模板",
    materials: ["F01"],
  },
  {
    id: "components",
    label: "公共组件",
    caption: "F02 · 列表、详情、状态操作",
    group: "frontend",
    x: 1390,
    y: 120,
    deps: ["sql"],
    action: "载入公共组件清单",
    materials: ["F02"],
  },
  {
    id: "contract",
    label: "数据契约与适配",
    caption: "F04 · 显式字段映射",
    group: "frontend",
    x: 1060,
    y: 320,
    deps: ["sql"],
    action: "加载数据适配",
    materials: ["F04"],
  },
  {
    id: "config",
    label: "校园配置与需求",
    caption: "F03 · 名称、设施与主题",
    group: "frontend",
    x: 1390,
    y: 320,
    deps: ["sql"],
    action: "载入校园配置",
    materials: ["F03"],
  },
  {
    id: "frontend",
    label: "校园前端装配",
    caption: "F05 · 应用校园工单页面",
    group: "frontend",
    x: 1220,
    y: 520,
    deps: ["map", "template", "components", "contract", "config"],
    action: "应用校园成果",
    materials: ["F05"],
  },
  {
    id: "test-requirement",
    label: "测试需求",
    caption: "T01 · 数据与业务断言",
    group: "test",
    x: 1780,
    y: 120,
    deps: ["frontend"],
    action: "载入测试需求",
    materials: ["T01"],
  },
  {
    id: "test-template",
    label: "测试模板",
    caption: "T02 · 真实业务函数",
    group: "test",
    x: 2100,
    y: 120,
    deps: ["frontend"],
    action: "载入测试模板",
    materials: ["T02"],
  },
  {
    id: "cases",
    label: "载入预制测试脚本",
    caption: "T02 · 每项独立创建副本",
    group: "test",
    x: 1940,
    y: 320,
    deps: ["test-requirement", "test-template"],
    action: "准备检查脚本",
    materials: ["T02"],
  },
  {
    id: "test",
    label: "真实检查",
    caption: "T03 · 运行后生成报告",
    group: "test",
    x: 1940,
    y: 520,
    deps: ["cases", "frontend"],
    action: "运行真实检查",
    materials: ["T03"],
  },
  {
    id: "manual",
    label: "人工验收",
    caption: "T04 · 观察证据与判定",
    group: "acceptance",
    x: 1220,
    y: 770,
    deps: ["test"],
    action: "打开人工清单",
    materials: ["T04"],
  },
  {
    id: "delivery",
    label: "校园交付成果",
    caption: "自动检查与人工验收分开记录",
    group: "acceptance",
    x: 1940,
    y: 770,
    deps: ["manual"],
    action: "确认本轮交付",
    materials: ["C01", "T03", "T04"],
  },
];
export const manualDefinitions = [
  ["H01", "明理楼可定位，F4 设施详情正确，缩放或旋转可操作"],
  ["H02", "模板与校园成果有明确变化，F4 可筛选，T1 详情可打开"],
  ["H03", "自动检查后，现场 T1 仍待处理，位置与设施一致"],
  ["H04", "领取后处理中；空结果被拦截；填写固定结果后已完成"],
  ["H05", "完成记录保留结果；回到沙盘仍可查看校园成果"],
] as const;
export interface ManualRecord {
  id: string;
  status: "pending" | "passed" | "failed";
  evidence: string;
  at?: string;
}
export interface HistoryEntry {
  at: string;
  node: string;
  kind: string;
  detail: unknown;
}
export interface Workflow {
  run: string;
  rehearsal: boolean;
  statuses: Record<string, NodeStatus>;
  corrected: boolean;
  rejectedOnce: boolean;
  history: HistoryEntry[];
  reports: { valid: boolean; report: CheckReport }[];
  manual: ManualRecord[];
}
export const newRun = () =>
  `run-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
export function createWorkflow(run = newRun()): Workflow {
  return {
    run,
    rehearsal: false,
    statuses: Object.fromEntries(nodes.map((n) => [n.id, "pending"])),
    corrected: false,
    rejectedOnce: false,
    history: [],
    reports: [],
    manual: manualDefinitions.map(([id]) => ({
      id,
      status: "pending",
      evidence: "",
    })),
  };
}
export function log(w: Workflow, node: string, kind: string, detail: unknown) {
  w.history.push({ at: new Date().toISOString(), node, kind, detail });
}
export function canExecute(w: Workflow, id: string): boolean {
  const node = nodes.find((n) => n.id === id);
  if (!node || w.statuses[id] === "running") return false;
  return node.deps.every(
    (dep) =>
      ["produced", "passed"].includes(w.statuses[dep]) ||
      (w.rehearsal && w.statuses[dep] === "preloaded"),
  );
}
export function invalidate(w: Workflow, ids: string[]) {
  const affected = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (!affected.has(n.id) && n.deps.some((d) => affected.has(d))) {
        affected.add(n.id);
        changed = true;
      }
  }
  for (const id of affected) w.statuses[id] = "stale";
  if (affected.has("test")) w.reports.forEach((r) => (r.valid = false));
  if (affected.has("manual"))
    w.manual.forEach((m) => {
      m.status = "pending";
      m.evidence = "";
      delete m.at;
    });
  return affected;
}
export function resetGroup(w: Workflow, group: Group) {
  const ids = nodes.filter((n) => n.group === group).map((n) => n.id);
  invalidate(w, ids);
  ids.forEach((id) => (w.statuses[id] = "pending"));
  if (group === "sql" || group === "map") {
    w.corrected = false;
    w.rejectedOnce = false;
  }
  log(w, group, "reset", "本阶段及下游结果已失效；历史保留");
}
export function directTo(w: Workflow, group: Group) {
  w.rehearsal = true;
  const needed = new Set<string>();
  const visit = (id: string) => {
    const n = nodes.find((n) => n.id === id)!;
    for (const dep of n.deps)
      if (!needed.has(dep)) {
        needed.add(dep);
        visit(dep);
      }
  };
  nodes.filter((n) => n.group === group).forEach((n) => visit(n.id));
  needed.forEach((id) => {
    if (!["passed", "produced"].includes(w.statuses[id]))
      w.statuses[id] = "preloaded";
  });
  w.corrected = group !== "sql";
  log(w, group, "rehearsal", "直达仅预载材料；前序检查与页面应用未执行");
}
export function currentReport(w: Workflow) {
  return [...w.reports].reverse().find((r) => r.valid)?.report;
}
export function automatedPassed(w: Workflow) {
  const r = currentReport(w);
  return !!r && r.results.length === 10 && r.results.every((r) => r.passed);
}
export function deliveryReady(w: Workflow) {
  return (
    automatedPassed(w) &&
    w.manual.every((m) => m.status === "passed") &&
    ["map", "template", "frontend", "reference"].every(
      (id) => w.statuses[id] === "passed",
    )
  );
}
export function exportReport(w: Workflow) {
  return {
    caseId: CASE_ID,
    version: VERSION,
    run: w.run,
    exportedAt: new Date().toISOString(),
    mode: w.rehearsal ? "排练" : "正式",
    provenance: {
      materials: "预制产物，SQL 未执行",
      automatic: "浏览器内数据与业务函数检查，非 UI 自动化",
      manual: "操作者填写的观察证据",
    },
    automaticPassed: automatedPassed(w),
    manualCompleted: w.manual.every((m) => m.status === "passed"),
    deliveryReady: deliveryReady(w),
    statuses: w.statuses,
    reports: w.reports,
    manual: w.manual,
    history: w.history,
  };
}
