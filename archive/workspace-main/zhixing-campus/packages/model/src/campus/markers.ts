import {
  buildings,
  buildingElevation,
  terrainHeight,
  lake,
  athletics,
  garage,
  gates,
  recordAnchor,
} from "./layout";
export type CampusView = "learning" | "life" | "safety";
export interface MarkerProjection {
  x: number;
  y: number;
  visible: boolean;
}
export interface CampusPlace {
  id: string;
  name: string;
  location: string;
  description: string;
  x: number;
  y: number;
  z: number;
  markerY: number;
  focusDistance: number;
}
export const safetySites = [
  ...[
    ["fire-library", "图书馆消防系统", -26, -3],
    ["fire-west", "西教学区消防点", -47, 9],
    ["fire-east", "东教学区消防点", 18, 9],
    ["fire-science", "科创消防点", 43, -13],
    ["fire-dorm", "北公寓消防点", -19, -42],
    ["fire-east-dorm", "东公寓消防点", 79, -25],
    ["fire-dining", "食堂消防点", 53, 3],
    ["fire-gym", "体育馆消防点", -88, -12],
    ["fire-hall", "礼堂消防点", 54, 37],
  ].map(([id, name, x, z]) => ({
    id: id as string,
    name: name as string,
    kind: "fire" as const,
    x: x as number,
    z: z as number,
    y: 0,
    description:
      "室外消防设施与对应建筑消防系统的空间位置，周边保留取用净空和消防通道。",
  })),
  ...[
    ["aed-library", "图书馆 AED", -12, -2],
    ["aed-gym", "体育馆 AED", -70, -12],
    ["aed-north-dorm", "北公寓 AED", -13, -44],
    ["aed-east-dorm", "东公寓 AED", 80, -28],
    ["aed-dining", "食堂 AED", 43, 16],
    ["aed-hall", "礼堂 AED", 43, 47],
  ].map(([id, name, x, z]) => ({
    id: id as string,
    name: name as string,
    kind: "aed" as const,
    x: x as number,
    z: z as number,
    y: 0,
    description:
      "入口附近配置自动体外除颤器，覆盖教学、住宿、餐饮或运动活动人群。",
  })),
  {
    id: "help-main",
    name: "主门求助点",
    kind: "help" as const,
    x: 4,
    z: 61,
    y: 0,
    description: "主门值班与紧急求助设施。",
  },
  {
    id: "help-east",
    name: "东门求助点",
    kind: "help" as const,
    x: 84,
    z: 27,
    y: 0,
    description: "东门门卫旁的紧急求助柱，靠近生活区与校外小吃街。",
  },
  {
    id: "lake-rescue",
    name: "湖岸救生点",
    kind: "help" as const,
    x: 20,
    z: 38,
    y: 0,
    description: "临水步道旁设置救生圈、救生杆及安全提示。",
  },
  {
    id: "assembly",
    name: "运动场应急集合点",
    kind: "shelter" as const,
    x: -50,
    z: 33,
    y: 0,
    description: "田径场东南侧集合点，保持通往场地的疏散路径畅通。",
  },
];
export const campusPlaces: CampusPlace[] = [
  ...buildings.map((b) => ({
    id: b.id,
    name: b.name,
    location:
      b.kind === "dorm"
        ? b.x < 20
          ? "主校园北侧 · 三翼合院"
          : "东侧附属台地 · 三翼合院"
        : b.kind === "teacher"
          ? "北侧山脚 · 独立庭院"
          : b.kind === "teaching"
            ? "中央教学台地"
            : b.kind === "gym"
              ? "西侧运动区"
              : b.kind === "auditorium"
                ? "南侧主入口广场东侧"
                : "知行校园",
    description:
      b.kind === "dorm"
        ? `${b.name}由北侧横楼及东西两翼三个子栋连接围成，共 ${b.floors} 层。庭院向南开口，设共享绿地、连廊、自行车停放与组间消防通道。`
        : b.kind === "teacher"
          ? "五层教师宿舍，独立庭院与山脚绿化相接，与学生生活区适度分隔。"
          : b.kind === "gym"
            ? "独立大跨度体育馆，承接原风雨操场、羽毛球馆的体育课程与预约功能，北邻山脚，南接标准田径场。"
            : b.kind === "auditorium"
              ? "独立大学礼堂，面向主入口广场，可承接典礼、报告及文艺活动，地下车库位于礼堂与广场下方。"
              : b.kind === "service"
                ? "生活服务站集中设置便利店、快递点，步行连接学生食堂与东侧门。"
                : b.kind === "clinic"
                  ? "校医务室靠近东侧门，为师生日常健康服务与紧急转运提供便利。"
                  : b.kind === "dining"
                    ? "两层学生食堂，紧邻学生公寓，入口连接生活步道及自行车棚。"
                    : `${b.name}，${b.floors} 层学院式建筑，通过步道连接教学庭院、校园湖与校园公共设施。`,
    x: b.x,
    z: b.z,
    y: buildingElevation(b) + b.floors / 2,
    markerY: buildingElevation(b) + b.floors * 1.05 + 2.2,
    focusDistance: b.kind === "dorm" ? 76 : b.kind === "gym" ? 72 : 60,
  })),
  {
    id: "lake",
    name: "知行湖",
    location: "中南部 · 校园景观中心",
    description:
      "完整环湖步道串联小桥、亭廊与临水平台。湖面呈现缓慢流动的波纹、移动高光及岸边涟漪。",
    x: lake.x,
    z: lake.z,
    y: 0.3,
    markerY: 2.5,
    focusDistance: 90,
  },
  {
    id: "athletics",
    name: "400 米田径场",
    location: "西侧运动区",
    description:
      "八道标准 400 米跑道，内置足球场，北接体育馆，南连室外篮球场。第一道按标准测量线确定周长。",
    x: athletics.x,
    z: athletics.z,
    y: 0.2,
    markerY: 3,
    focusDistance: 90,
  },
  {
    id: "courts",
    name: "室外球场",
    location: "田径场南侧",
    description: "室外篮球场及看台，连接体育馆与校园步道。",
    x: -63,
    z: 48,
    y: 1.4,
    markerY: 3.7,
    focusDistance: 65,
  },
  {
    id: "garage",
    name: "地下停车场",
    location: "礼堂与广场地下 · 东侧入口",
    description:
      "校园唯一汽车停车场，供教职工、后勤及必要来访使用。从东侧门进入后沿外围通道到达坡道。地面不设汽车停车位。",
    x: garage.x,
    z: garage.z + 7,
    y: 0,
    markerY: 3,
    focusDistance: 50,
  },
  {
    id: "snack-street",
    name: "校门小吃街",
    location: "东侧门外",
    description:
      "面馆、烘焙、茶饮与家常小吃沿校外步行街展开，与宿舍区通过东侧门相连。",
    x: 98,
    z: 10,
    y: 1,
    markerY: 4,
    focusDistance: 70,
  },
  ...gates.map((g) => ({
    ...g,
    location: g.id === "main-gate" ? "南侧主入口" : "东侧生活区入口",
    description:
      g.id === "main-gate"
        ? "学院式柱廊大门，经过开阔广场进入校园，远望湖面与图书馆。"
        : "师生人行门禁与必要车行通道分置，门外连接小吃街，门内连接外围道路与地下车库。",
    y: 2,
    markerY: g.id === "main-gate" ? 9 : 5,
    focusDistance: 60,
  })),
  ...safetySites.map((s) => ({
    ...s,
    location: "校园安全设施",
    y: Math.max(s.y, terrainHeight(s.x, s.z)),
    markerY: Math.max(s.y, terrainHeight(s.x, s.z)) + 3,
    focusDistance: 32,
  })),
];
export interface CampusMarker {
  id: string;
  name: string;
  view: CampusView;
  kind:
    | "space"
    | "gym"
    | "gate"
    | "fire"
    | "parking"
    | "tower"
    | "villa"
    | "garden"
    | "aed"
    | "help"
    | "shelter";
  alwaysLabel?: boolean;
  tier?: 0 | 1;
}
export const campusMarkers: CampusMarker[] = [
  ...buildings.map((b, i) => ({
    id: b.id,
    name: b.name,
    view: (b.kind === "clinic"
      ? "safety"
      : ["teaching", "library", "lab"].includes(b.kind)
        ? "learning"
        : "life") as CampusView,
    kind: (b.kind === "clinic"
      ? "aed"
      : b.kind === "gym"
        ? "gym"
        : b.kind === "dorm" || b.kind === "teacher"
          ? "tower"
          : "space") as CampusMarker["kind"],
    alwaysLabel: ["dorm", "teaching", "library"].includes(b.kind),
    tier: (i % 2) as 0 | 1,
  })),
  ...[
    "lake",
    "athletics",
    "courts",
    "garage",
    "snack-street",
    "main-gate",
    "east-gate",
  ].map((id, i) => ({
    id,
    name: campusPlaces.find((p) => p.id === id)!.name,
    view: "life" as const,
    kind: (id === "garage"
      ? "parking"
      : id.includes("gate")
        ? "gate"
        : id === "lake"
          ? "garden"
          : "gym") as CampusMarker["kind"],
    tier: (i % 2) as 0 | 1,
  })),
  ...safetySites.map((s, i) => ({
    id: s.id,
    name: s.name,
    view: "safety" as const,
    kind: s.kind,
    tier: (i % 2) as 0 | 1,
  })),
  ...gates.map((g) => ({
    id: g.id,
    name: g.id === "main-gate" ? "主门门卫" : "东门人行闸机",
    view: "safety" as const,
    kind: "gate" as const,
  })),
];
export function facilitySite(id: string, marker = false) {
  const p =
    campusPlaces.find((p) => p.id === id) ||
    campusPlaces.find((p) => p.id === recordAnchor[id]);
  return p
    ? {
        x: p.x,
        y: marker ? p.markerY : p.y,
        z: p.z,
        focusDistance: p.focusDistance,
      }
    : null;
}
