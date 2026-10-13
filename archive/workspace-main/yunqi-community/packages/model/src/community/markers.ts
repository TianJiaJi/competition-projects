import { safetySites } from "./safety-sites";
import {
  anchorById,
  buildings,
  buildingElevation,
  garage,
  garden,
} from "./layout";
export type CommunityView = "housing" | "public" | "safety";
export interface CommunityMarker {
  view: CommunityView;
  id: string;
  name: string;
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
export interface MarkerProjection {
  x: number;
  y: number;
  visible: boolean;
}
const roman = ["I", "II", "III", "IV", "V", "VI"];
/** Spatial descriptions only: these do not add records to the business collections. */
export const communityPlaces = [
  {
    id: "south-entry",
    name: "小区大门",
    location: "南侧中央步行主入口",
    description:
      "从小区主入口沿中央景观轴进入花园，左右连接别墅组团与公共步道。",
    x: 0,
    z: 37,
    y: 1,
    markerY: 3.5,
  },
  ...safetySites.map((s) => ({ ...s, markerY: s.y + 3.6 })),
  {
    id: "west-gate",
    name: "西门智能道闸",
    location: "西门入口 · 通行空间",
    description: "西侧车行入口连接外围环路，旁侧设独立人行门禁。",
    x: anchorById["west-gate"].x,
    z: anchorById["west-gate"].z,
    y: 1,
    markerY: 3.4,
  },
  ...buildings
    .filter((b) => b.kind === "tower")
    .map((b, i) => ({
      id: b.id,
      name: `单元楼 ${roman[i]} 栋`,
      location: `${i < 3 ? "东" : "西"}区 · ${b.name}`,
      description: `${b.name}，${b.floors} 层单元住宅。`,
      x: b.x,
      z: b.z,
      y: buildingElevation(b) + (b.floors * 1.05) / 2,
      markerY: buildingElevation(b) + b.floors * 1.05 + 2.3,
    })),
  ...[-1, 1].map((side, i) => {
    const homes = buildings.filter(
      (b) =>
        ["detached", "duplex", "townhouse"].includes(b.kind) &&
        Math.sign(b.x) === side,
    );
    return {
      id: `villa-${roman[i]}`,
      name: `别墅 ${roman[i]} 区`,
      location: i ? "东侧别墅组团" : "西侧别墅组团",
      description:
        "由北向南布置联排、双拼与独栋住宅，配有露台、庭院及通往中央花园的步道。",
      x: homes.reduce((s, b) => s + b.x, 0) / homes.length,
      z: homes.reduce((s, b) => s + b.z, 0) / homes.length,
      y: 1.5,
      markerY: 5.8,
    };
  }),
  {
    id: garden.id,
    name: "中央花园",
    location: "社区中央景观轴",
    description:
      "中央草坪连接东西两侧公共建筑，设有体素喷泉、休憩座椅与环园步道。",
    x: garden.x,
    z: garden.z,
    y: 0.5,
    markerY: 3,
  },
];
export const communityMarkers: CommunityMarker[] = [
  ...safetySites.map((s, i) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    view: "safety" as const,
    tier: (i % 2) as 0 | 1,
  })),
  ...communityPlaces
    .filter((p) => !safetySites.some((s) => s.id === p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: (p.id.startsWith("B")
        ? "tower"
        : p.id.startsWith("villa")
          ? "villa"
          : p.id === "west-gate" || p.id === "south-entry"
            ? "gate"
            : "garden") as CommunityMarker["kind"],
      view: (p.id === "west-gate"
        ? "safety"
        : p.id === "garden"
          ? "public"
          : "housing") as CommunityView,
      alwaysLabel: !["west-gate", "south-entry"].includes(p.id),
      tier: (["B2", "B5", "garden"].includes(p.id) ? 1 : 0) as 0 | 1,
    })),
  { id: "F1", name: "邻里会客厅", kind: "space", view: "public" },
  { id: "F2", name: "社区健身房", kind: "gym", view: "public", tier: 1 },
  { id: "F3", name: "东门智能道闸", kind: "gate", view: "safety" },
  { id: "F5", name: "花园消防栓", kind: "fire", view: "safety" },
  { id: "C1", name: "东区停车场", kind: "parking", view: "public", tier: 1 },
  { id: "C2", name: "西区停车场", kind: "parking", view: "public", tier: 1 },
  { id: "C3", name: "地下停车场", kind: "parking", view: "public" },
];
export function facilitySite(id: string, marker = false) {
  const place = communityPlaces.find((p) => p.id === id);
  if (place)
    return { x: place.x, y: marker ? place.markerY : place.y, z: place.z };
  const a = anchorById[id];
  if (!a) return null;
  if (id === "C3")
    return { x: garage.x, y: marker ? 4 : 1, z: garage.z - garage.depth / 2 };
  const b = buildings.find((b) => b.id === a.parentId);
  if (b) {
    const h =
      b.kind === "tower" ? b.floors * 1.05 : b.kind === "center" ? 4.7 : 2.6;
    return {
      x: marker ? a.x : b.x,
      z: marker ? a.z : b.z,
      y: buildingElevation(b) + (marker ? h + 2 : h / 2),
    };
  }
  return { x: a.x, y: marker ? Math.max(2.4, a.y + 2) : a.y + 1, z: a.z };
}
