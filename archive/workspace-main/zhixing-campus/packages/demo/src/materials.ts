import {
  C01,
  F03,
  SQL,
  SQL_CONTRACT,
  referenceInput,
  sqlRows,
  VERSION,
} from "./data";
import { checkDefinitions } from "./checks";
import { manualDefinitions } from "./workflow";
import recoveryMap from "../assets/R01-campus.png";
import mapPng from "../assets/M01.png";
import mapSvg from "../assets/M02.svg?url";
import svgSource from "../assets/M02.svg?raw";
import terrain from "../assets/M03.json";
import checksSource from "./checks.ts?raw";
import dataSource from "./data.ts?raw";
import listSource from "../../experience/src/components/RecordList.vue?raw";
import domainSource from "../../domain/src/index.ts?raw";
export interface Material {
  id: string;
  title: string;
  kind: string;
  text: string;
  image?: string;
  download?: string;
  preview?: string;
}
const json = (data: unknown) => JSON.stringify(data, null, 2);
const material = (
  id: string,
  title: string,
  data: unknown,
  kind = "预制材料",
): Material => ({
  id,
  title,
  kind,
  text: typeof data === "string" ? data : json(data),
});
export const materials: Record<string, Material> = Object.fromEntries(
  [
    material("C01", "统一案例来源", C01),
    {
      ...material(
        "M01",
        "校园原始示意图",
        "依据现有校园模型布局制作的预制示意图，非真实测绘图。PNG 与 SVG 同源，不声称现场 AI 转换。",
      ),
      image: mapPng,
      download: mapPng,
    },
    {
      ...material("M02", "SVG 产物", svgSource),
      image: mapSvg,
      download: mapSvg,
    },
    material("M03", "设施与地形配置", terrain),
    material("M04", "沙盘参考标准", {
      model: "现有校园 Three.js 模型",
      coordinates: "东 +x / 南 +z，每单位四米；模型相对坐标",
      mapping: "F4 → B1，明理楼 302",
      style: "学习视图；保持既有地形、建筑与交互",
      boundary: "工单完成不自动改变沙盘设施状态",
    }),
    material("M05", "沙盘阶段清单", {
      stage: "campus-map",
      version: VERSION,
      view: "learning",
      focus: "B1",
      detail: "F4",
      port: 5500,
    }),
    material(
      "S01",
      "校园需求",
      "明理楼 302 投影画面偏色。按设施查看工单；工作人员领取后处理；空白结果必须拦截；完成记录保留处理结果。",
    ),
    material(
      "S02",
      "SQL 模板与字段契约",
      SQL.replace("'T1'", ":workOrderId").replace("'F4'", ":facilityId") +
        "\n\n" +
        json(SQL_CONTRACT),
    ),
    material("S03", "错误引用输入", referenceInput(true)),
    material("S04", "修正引用输入", referenceInput()),
    material("S05", "SQL 展示文本 · 未执行", SQL),
    material("S06", "配套样例行 · 来自 C01", sqlRows()),
    material("F01", "通用前端起点", {
      name: "通用服务模板",
      stage: "template",
      navigation: ["今日任务", "任务列表", "巡检计划", "历史记录"],
      tasks: [],
      instructions: "等待校园名称、设施及工单适配",
    }),
    material(
      "F02",
      "公共组件及真实源码片段",
      "RecordList：搜索、状态筛选、列表/卡片\nDrawer：详情抽屉\nStatusTag：状态显示\nclaim / complete：领取与完成\n\n" +
        listSource.slice(
          listSource.indexOf("const filtered"),
          listSource.indexOf("const pageCount"),
        ) +
        "\n" +
        domainSource.slice(
          domainSource.indexOf("export function claim"),
          domainSource.indexOf("export function answerQuestion"),
        ),
    ),
    material("F03", "校园配置", F03),
    material(
      "F04",
      "接口契约与前端适配",
      json(SQL_CONTRACT.mapping) +
        "\n\n" +
        dataSource.slice(
          dataSource.indexOf("export function adaptRows"),
          dataSource.indexOf("export const F03"),
        ),
    ),
    material("F05", "校园页面阶段清单", {
      stage: "campus-ready",
      version: VERSION,
      port: 5503,
      identity: "后勤人员",
      task: "T1",
      facility: "F4",
      building: "B1",
    }),
    material(
      "T01",
      "检查需求",
      checkDefinitions.map(([id, category, expected]) => ({
        id,
        category,
        expected,
      })),
    ),
    material("T02", "预制测试脚本 · 实际执行", checksSource),
    material(
      "T03",
      "真实检查报告",
      "尚未运行。运行后生成本轮实际结果，不预填通过。",
      "运行时生成",
    ),
    material(
      "T04",
      "人工验收清单",
      manualDefinitions.map(([id, expected]) => ({
        id,
        expected,
        status: "待核验",
      })),
      "人工记录",
    ),
    {
      ...material(
        "R01",
        "预制校园成果图",
        "既有校园学习视图截图，仅供故障讲解，不作为本轮交互验收。",
        "预制完成态",
      ),
      image: recoveryMap,
    },
    material(
      "R02",
      "预制完成态工单",
      {
        ...C01.workOrders[0],
        status: "已完成",
        owner: "后勤人员",
        result: C01.completionResult,
      },
      "预制完成态",
    ),
  ].map((m) => [m.id, m]),
);

// The first view shows useful business fields / assertions, not import boilerplate.
materials.C01.preview = [
  `caseId: ${C01.caseId}`,
  `version: ${VERSION}`,
  `B1: ${C01.buildings[0].title}`,
  `F4 → B1: ${C01.facilities[0].title}`,
  `T1 → F4: ${C01.workOrders[0].title}`,
  `location: ${C01.workOrders[0].location}`,
  `status: ${C01.workOrders[0].status}`,
  `owner / result: 初始为空`,
].join("\n");
for (const [id, broken] of [
  ["S03", true],
  ["S04", false],
] as const)
  materials[id].preview = json(referenceInput(broken).workOrders[0]);
materials.M03.preview = json({
  coordinateSystem: terrain.coordinateSystem,
  metresPerUnit: terrain.metresPerUnit,
  building: {
    id: terrain.building.id,
    x: terrain.building.x,
    z: terrain.building.z,
  },
  facility: terrain.facility,
});
materials.M02.preview = svgSource
  .split("\n")
  .filter(
    (line) =>
      line.includes('id="road-learning') ||
      line.includes('id="B1"') ||
      line.includes('id="campus-region"'),
  )
  .map((line) => (line.length > 250 ? line.slice(0, 245) + " …" : line))
  .join("\n");
materials.T01.preview = checkDefinitions
  .map(([id, category, expected]) => `${id} [${category}] ${expected}`)
  .join("\n");
materials.T02.preview = checksSource
  .slice(
    checksSource.indexOf("    B03: () => {"),
    checksSource.indexOf("    B04: () => {"),
  )
  .trim();
