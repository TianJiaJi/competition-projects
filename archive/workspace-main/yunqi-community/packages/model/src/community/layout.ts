/** Local coordinates: +x east, +z south; ground y=0. All views share this plan. */
export interface Footprint {
  x: number;
  z: number;
  width: number;
  depth: number;
}
export type PlanPoint = readonly [number, number];
export type BuildingKind =
  | "tower"
  | "detached"
  | "duplex"
  | "townhouse"
  | "club"
  | "center";
export interface CommunityBuilding extends Footprint {
  id: string;
  name: string;
  kind: BuildingKind;
  floors: number;
  units: number;
  facing: "south" | "east" | "west";
}
export interface CommunityAnchor {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  parentId?: string;
  records: string[];
}
export interface CommunityRoad {
  id: string;
  kind: "road" | "walk";
  width: number;
  points: PlanPoint[];
}
export const island = { width: 110, depth: 90 } as const;
// An asymmetric shoreline, with northern shoulders and a small southern inlet.
export const islandOutline: PlanPoint[] = [
  [-54, -7],
  [-51, -25],
  [-45, -30],
  [-46, -37],
  [-30, -41],
  [-15, -40],
  [-9, -43],
  [9, -41],
  [23, -42],
  [37, -37],
  [46, -29],
  [50, -23],
  [49, -12],
  [53, -4],
  [51, 10],
  [49, 24],
  [43, 29],
  [40, 36],
  [27, 40],
  [13, 40],
  [4, 41],
  [-9, 39],
  [-15, 42],
  [-29, 38],
  [-40, 36],
  [-43, 29],
  [-50, 25],
  [-49, 10],
];
function polygonContains(x: number, z: number) {
  let inside = false;
  for (
    let i = 0, j = islandOutline.length - 1;
    i < islandOutline.length;
    j = i++
  ) {
    const [ax, az] = islandOutline[i],
      [bx, bz] = islandOutline[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}
export function segmentDistance(
  x: number,
  z: number,
  a: PlanPoint,
  b: PlanPoint,
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
export function insideIsland(x: number, z: number, inset = 0) {
  return (
    polygonContains(x, z) &&
    islandOutline.every(
      (p, i) =>
        segmentDistance(
          x,
          z,
          p,
          islandOutline[(i + 1) % islandOutline.length],
        ) >= inset,
    )
  );
}
export const buildings: CommunityBuilding[] = [
  ...[
    [12, -29, 8],
    [27, -23, 10],
    [38, -12, 12],
    [-10, -30, 8],
    [-26, -25, 10],
    [-39, -12, 12],
  ].map(([x, z, floors], i) => ({
    id: `B${i + 1}`,
    name: `${i + 1}号楼`,
    kind: "tower" as const,
    x,
    z,
    width: 8,
    depth: 8,
    floors,
    units: 1,
    facing: "south" as const,
  })),
  ...[-1, 1].flatMap((side, i) => [
    {
      id: `V-row-${i + 1}`,
      name: `${i ? "东" : "西"}庭联排`,
      kind: "townhouse" as const,
      x: side * 19,
      z: i ? 13 : 12,
      width: 16,
      depth: 6,
      floors: 3,
      units: 3,
      facing: "south" as const,
    },
    {
      id: `V-pair-${i + 1}`,
      name: `${i ? "东" : "西"}庭双拼`,
      kind: "duplex" as const,
      x: side * 19,
      z: i ? 24 : 23,
      width: 10,
      depth: 6,
      floors: 2,
      units: 2,
      facing: "south" as const,
    },
    {
      id: `V-home-${i + 1}`,
      name: `${i ? "东" : "西"}庭独栋`,
      kind: "detached" as const,
      x: side * 9,
      z: 30,
      width: 7,
      depth: 6,
      floors: 2,
      units: 1,
      facing: "south" as const,
    },
  ]),
  {
    id: "club",
    name: "邻里会客厅",
    kind: "club",
    x: -25,
    z: -1,
    width: 10,
    depth: 8,
    floors: 1,
    units: 1,
    facing: "east",
  },
  {
    id: "life-center",
    name: "生活中心",
    kind: "center",
    x: 23,
    z: 2,
    width: 12,
    depth: 10,
    floors: 2,
    units: 1,
    facing: "west",
  },
];
export const parking = [
  { id: "C1", name: "东区停车场", x: 34, z: 17, width: 9, depth: 10 },
  { id: "C2", name: "西区停车场", x: -34, z: 17, width: 9, depth: 10 },
];
export const garage = { id: "garage-ramp", x: 37, z: 2, width: 6, depth: 10 };
export const garden = { id: "garden", x: 0, z: -4, width: 30, depth: 24 };
export const water = { id: "water", x: 8, z: -2, width: 5, depth: 9 };
const fireLane: PlanPoint[] = [
  [-47, 6],
  [-36, -4],
  [-24, -14],
  [-10, -21],
  [7, -20],
  [23, -14],
  [31, -6],
  [37, -5],
  [44, -5],
  [47, 7],
];
function nearestFirePoint(x: number, z: number): PlanPoint {
  let result: PlanPoint = [x, z],
    distance = Infinity;
  for (let i = 1; i < fireLane.length; i++) {
    const a = fireLane[i - 1],
      b = fireLane[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
      );
    const p: PlanPoint = [a[0] + dx * t, a[1] + dz * t],
      d = Math.hypot(x - p[0], z - p[1]);
    if (d < distance) {
      distance = d;
      result = p;
    }
  }
  return result;
}
export const roads: CommunityRoad[] = [
  {
    id: "perimeter",
    kind: "road",
    width: 3.2,
    points: [
      [0, -38],
      [20, -35],
      [37, -28],
      [47, -13],
      [47, 7],
      [43, 17],
      [38, 26],
      [26, 35],
      [12, 38],
      [0, 35],
      [-14, 38],
      [-34, 29],
      [-45, 15],
      [-49, -3],
      [-45, -23],
      [-27, -35],
      [0, -38],
    ],
  },
  { id: "garden-fire-lane", kind: "road", width: 3.2, points: fireLane },
  {
    id: "garage-approach",
    kind: "road",
    width: 6,
    points: [
      [37, -5],
      [37, -3],
    ],
  },
  {
    id: "east-gate-road",
    kind: "road",
    width: 3.2,
    points: [
      [44, 12],
      [49, 12],
    ],
  },
  {
    id: "west-gate-road",
    kind: "road",
    width: 3.2,
    points: [
      [-46, 12],
      [-49, 12],
    ],
  },
  ...parking.map((p) => ({
    id: `${p.id}-entry`,
    kind: "road" as const,
    width: 2.6,
    points: [
      [p.x, p.z],
      [Math.sign(p.x) * 44, p.z],
    ] as PlanPoint[],
  })),
  {
    id: "axis",
    kind: "walk",
    width: 2.3,
    points: [
      [0, 38],
      [-1, 23],
      [1, 12],
      [-2, 4],
      [-3, -8],
      [0, -20],
    ],
  },
  {
    id: "garden-walk",
    kind: "walk",
    width: 1.5,
    points: [
      [-15, 6],
      [-18, -5],
      [-12, -16],
      [4, -16],
      [15, -10],
      [15, 3],
      [8, 8],
      [-3, 9],
      [-15, 6],
    ],
  },
  {
    id: "club-walk",
    kind: "walk",
    width: 1.6,
    points: [
      [-25, 3],
      [-18, 3],
      [-14, 6],
    ],
  },
  {
    id: "center-walk",
    kind: "walk",
    width: 1.6,
    points: [
      [23, 7],
      [16, 7],
      [15, 3],
    ],
  },
  {
    id: "west-villas",
    kind: "walk",
    width: 1.4,
    points: [
      [0, 17],
      [-26, 17],
      [-27, 26],
      [-24, 29],
      [-18, 34],
      [-15, 37],
      [0, 37],
    ],
  },
  {
    id: "east-villas",
    kind: "walk",
    width: 1.4,
    points: [
      [0, 18],
      [27, 18],
      [27, 28],
      [23, 31],
      [18, 36],
      [14, 37],
      [0, 37],
    ],
  },
  ...buildings
    .filter((b) => b.kind === "tower")
    .map((b) => ({
      id: `${b.id}-walk`,
      kind: "walk" as const,
      width: 1.5,
      points: [[b.x, b.z + 4], nearestFirePoint(b.x, b.z + 4)] as PlanPoint[],
    })),
];
export function roadDistance(x: number, z: number, r: CommunityRoad) {
  return Math.min(
    ...r.points.slice(1).map((p, i) => segmentDistance(x, z, r.points[i], p)),
  );
}
export function inFootprint(x: number, z: number, p: Footprint, margin = 0) {
  return (
    Math.abs(x - p.x) < p.width / 2 + margin &&
    Math.abs(z - p.z) < p.depth / 2 + margin
  );
}
export const anchors: CommunityAnchor[] = [
  ...buildings.map((b) => ({
    id: b.id,
    name: b.name,
    x: b.x,
    y: 0,
    z: b.z,
    records: b.kind === "tower" ? [b.id] : b.id === "life-center" ? ["N3"] : [],
  })),
  {
    id: "F1",
    name: "邻里会客厅",
    x: -25,
    y: 1,
    z: -1,
    parentId: "club",
    records: ["F1", "R1", "R3"],
  },
  {
    id: "F2",
    name: "社区健身房",
    x: 23,
    y: 1,
    z: 5,
    parentId: "life-center",
    records: ["F2", "R2", "T3"],
  },
  { id: "east-gate", name: "东门入口", x: 48, y: 0, z: 12, records: ["S1"] },
  {
    id: "F3",
    name: "东门智能道闸",
    x: 48,
    y: 0,
    z: 12,
    parentId: "east-gate",
    records: ["F3"],
  },
  { id: "west-gate", name: "西门入口", x: -48, y: 0, z: 12, records: ["T4"] },
  {
    id: "F4",
    name: "2号楼客梯",
    x: 27,
    y: 1,
    z: -23,
    parentId: "B2",
    records: ["F4", "N2"],
  },
  {
    id: "F5",
    name: "花园消防栓",
    x: 14.5,
    y: 0,
    z: -12.5,
    parentId: "garden",
    records: ["F5", "I1", "S2"],
  },
  {
    id: "F6",
    name: "生活中心照明",
    x: 16.7,
    y: 2.6,
    z: 2,
    parentId: "life-center",
    records: ["F6"],
  },
  { id: "garden", name: "中央花园", x: 0, y: 0, z: -4, records: ["N1"] },
  {
    id: "garden-tap",
    name: "花园取水点",
    x: -14.5,
    y: 0,
    z: 1,
    parentId: "garden",
    records: ["T2"],
  },
  {
    id: "B1-lift",
    name: "1号楼电梯",
    x: 12,
    y: 1,
    z: -29,
    parentId: "B1",
    records: ["I3"],
  },
  {
    id: "B2-corridor",
    name: "2号楼三层走廊照明",
    x: 27,
    y: 3,
    z: -20,
    parentId: "B2",
    records: ["T1"],
  },
  ...parking.map((p) => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: 0,
    z: p.z,
    records: [p.id],
  })),
  {
    id: "C3",
    name: "地下停车场",
    x: 23,
    y: -3,
    z: 2,
    parentId: "life-center",
    records: ["C3", "I2"],
  },
  {
    id: "garage-ramp",
    name: "地下车库入口 · 限高2.2米",
    x: 37,
    y: 0,
    z: -3,
    parentId: "C3",
    records: [],
  },
  { id: "south-entry", name: "南侧步行入口", x: 0, y: 0, z: 37, records: [] },
];
export const anchorById = Object.fromEntries(anchors.map((a) => [a.id, a]));
export const recordAnchor = Object.fromEntries(
  anchors.flatMap((a) => a.records.map((id) => [id, a.id])),
);
export function overlaps(a: Footprint, b: Footprint, gap = 0) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + gap
  );
}
export const communityLayout = {
  island,
  islandOutline,
  buildings,
  parking,
  garage,
  garden,
  water,
  roads,
  anchors,
};
/** Roads stay level. Relief belongs to compact, engineered building platforms. */
export function buildingElevation(b: CommunityBuilding) {
  return b.kind === "tower"
    ? b.floors === 12
      ? 0.8
      : b.floors === 10
        ? 0.6
        : 0.4
    : b.kind === "club" || b.kind === "center"
      ? 0.2
      : 0;
}
export function terrainHeight(x: number, z: number) {
  if (
    roads.some((r) => roadDistance(x, z, r) <= r.width / 2 + 0.15) ||
    parking.some((p) => inFootprint(x, z, p))
  )
    return 0;
  const b = buildings.find((b) => inFootprint(x, z, b, 1.1));
  return b ? buildingElevation(b) : 0;
}
