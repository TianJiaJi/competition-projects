import { terrainHeight, campusLake, lakeRadius } from "./terrain.ts";
export { terrainHeight, landforms, lakeRadius } from "./terrain.ts";
/** +x east, +z south. One plan unit = four metres; render scale is independent. */
export const metresPerUnit = 4;
export const sceneScale = 0.48;
export type Point = readonly [number, number];
export interface Footprint {
  x: number;
  z: number;
  width: number;
  depth: number;
}
export type BuildingKind =
  | "teaching"
  | "library"
  | "lab"
  | "dorm"
  | "teacher"
  | "dining"
  | "activity"
  | "gym"
  | "auditorium"
  | "service"
  | "clinic";
export interface CampusBuilding extends Footprint {
  id: string;
  name: string;
  kind: BuildingKind;
  floors: number;
  heading?: number;
}
const building = (
  id: string,
  name: string,
  kind: BuildingKind,
  x: number,
  z: number,
  width: number,
  depth: number,
  floors: number,
): CampusBuilding => ({ id, name, kind, x, z, width, depth, floors });
export const buildings: CampusBuilding[] = [
  building("B1", "明理楼", "teaching", 8, -19, 17, 12, 5),
  building("B2", "致远楼", "teaching", -37, -19, 17, 12, 5),
  building("teaching-3", "博学楼", "teaching", -34.7, 3, 17, 12, 4),
  building("teaching-4", "笃行楼", "teaching", 5.3, 3, 17, 12, 4),
  building("B3", "知行图书馆", "library", -14.8, -13, 16, 18, 4),
  building("B4", "科创中心", "lab", 34, -22, 14, 10, 4),
  ...[
    [-56, -36, 26, 24],
    [-59.57, -2, 26, 24],
    [-48, 58, 26, 24],
    [-43.22, 92, 25, 24],
  ].map(([z, x, w, d], i) =>
    building(`dorm-${i + 1}`, `学生公寓 ${i + 1} 栋`, "dorm", x, z, w, d, 6),
  ),
  building("teacher", "教师宿舍", "teacher", 22, -57, 14, 10, 5),
  building("dining", "学生食堂", "dining", 39, 8, 22, 12, 2),
  building("B5", "学生活动中心", "activity", 64, 14, 18, 12, 3),
  building("B6", "体育馆", "gym", -76, -23, 26, 18, 2),
  building("auditorium", "大学礼堂", "auditorium", 40, 36, 24, 18, 2),
  building("services", "生活服务站", "service", 57, 28, 8, 8, 1),
  building("clinic", "校医务室", "clinic", 69, 30, 8, 8, 1),
];
/** Local order: adjacent buildings share one axis; groups follow different terraces. */
export const buildingGroups = [
  { id: "west-learning", heading: 6, ids: ["B2", "teaching-3"] },
  { id: "east-learning", heading: -7, ids: ["B1", "teaching-4", "B4"] },
  { id: "north-residential", heading: 6, ids: ["dorm-1", "dorm-2", "teacher"] },
  { id: "east-residential", heading: -8, ids: ["dorm-3", "dorm-4"] },
  {
    id: "life-services",
    heading: -4,
    ids: ["dining", "B5", "services", "clinic"],
  },
  { id: "civic", heading: 0, ids: ["B3", "auditorium"] },
  { id: "sports", heading: 0, ids: ["B6"] },
];
for (const g of buildingGroups)
  for (const b of buildings.filter((b) => g.ids.includes(b.id)))
    b.heading = (g.heading * Math.PI) / 180;
export function buildingPoint(b: CampusBuilding, x: number, z: number): Point {
  const a = b.heading ?? 0,
    dx = x - b.x,
    dz = z - b.z;
  return [
    b.x + dx * Math.cos(a) + dz * Math.sin(a),
    b.z - dx * Math.sin(a) + dz * Math.cos(a),
  ];
}
/** Four parent buildings, each formed from three connected wings opening south. */
export const dormWings = buildings
  .filter((b) => b.kind === "dorm")
  .flatMap((b, i) => [
    {
      id: `${b.id}-north`,
      parentId: b.id,
      x: b.x,
      z: b.z - b.depth / 2 + 3,
      width: b.width,
      depth: 6,
    },
    {
      id: `${b.id}-west`,
      parentId: b.id,
      x: b.x - b.width / 2 + 3,
      z: b.z + 3,
      width: 6,
      depth: b.depth - 6,
    },
    {
      id: `${b.id}-east`,
      parentId: b.id,
      x: b.x + b.width / 2 - 3,
      z: b.z + 2 - (i % 2),
      width: 6,
      depth: b.depth - 8 - (i % 2) * 2,
    },
  ]);
/** Two offset circular masses with coves, shoulders and an uneven foothill edge. */
export const campusLobes = [
  { x: -20, z: 0, radius: 92 },
  { x: 74, z: -44, radius: 42 },
] as const;
export const streetBoundary: Point[] = [
  [73, -21],
  [96, -21],
  [105, -12],
  [105, 27],
  [102, 40],
  [81, 43],
  [73, 24],
];
export const islandOutline: Point[] = Array.from({ length: 112 }, (_, i) => {
  const a = (i / 112) * Math.PI * 2,
    dx = Math.cos(a),
    dz = Math.sin(a),
    ox = -8,
    oz = -3;
  const t = Math.max(
    ...campusLobes.map((c) => {
      const cx = c.x - ox,
        cz = c.z - oz,
        projection = cx * dx + cz * dz;
      const discriminant =
        c.radius * c.radius - (cx * cx + cz * cz - projection * projection);
      return discriminant >= 0 ? projection + Math.sqrt(discriminant) : 0;
    }),
  );
  const southeast = 16 * Math.exp(-Math.pow((a - 0.6) / 0.43, 2));
  const broken =
    2.5 * Math.sin(a * 5 + 0.4) +
    1.8 * Math.sin(a * 9) -
    4 * Math.exp(-Math.pow((a - 2.1) / 0.15, 2));
  let extent = t + southeast + broken;
  // The food street is a joined rock-backed shelf, not detached shop meshes.
  for (let j = 0; j < streetBoundary.length; j++) {
    const p = streetBoundary[j],
      q = streetBoundary[(j + 1) % streetBoundary.length],
      ex = q[0] - p[0],
      ez = q[1] - p[1],
      cross = dx * ez - dz * ex;
    if (Math.abs(cross) < 1e-6) continue;
    const ray = ((p[0] - ox) * ez - (p[1] - oz) * ex) / cross,
      edge = ((p[0] - ox) * dz - (p[1] - oz) * dx) / cross;
    if (ray > 0 && edge >= 0 && edge <= 1) extent = Math.max(extent, ray + 1);
  }
  return [ox + dx * extent, oz + dz * extent] as Point;
});
export const islandBounds = {
  minX: Math.floor(Math.min(...islandOutline.map((p) => p[0])) / 2) * 2,
  maxX: Math.ceil(Math.max(...islandOutline.map((p) => p[0])) / 2) * 2,
  minZ: Math.floor(Math.min(...islandOutline.map((p) => p[1])) / 2) * 2,
  maxZ: Math.ceil(Math.max(...islandOutline.map((p) => p[1])) / 2) * 2,
};
export const lake = campusLake;
// Standard 400m first-lane measurement: 36.5m curb radius + 0.30m measuring offset.
export const athletics = {
  id: "athletics",
  x: -68,
  z: 12,
  straight: 84.39 / 4,
  innerRadius: 36.5 / 4,
  laneWidth: 1.22 / 4,
  lanes: 8,
  measureOffset: 0.3 / 4,
};
export const trackOuterRadius =
  athletics.innerRadius + athletics.laneWidth * athletics.lanes;
export const trackFootprint: Footprint = {
  x: athletics.x,
  z: athletics.z,
  width: trackOuterRadius * 2 + 2,
  depth: athletics.straight + trackOuterRadius * 2 + 2,
};
export const courts: Footprint = { x: -63, z: 48, width: 27, depth: 18 };
export const garage = {
  id: "garage",
  x: 54,
  z: 47,
  width: 6,
  depth: 14,
  under: { x: 40, z: 36, width: 30, depth: 24 },
};
export const gates = [
  { id: "main-gate", name: "知行校园主门", x: -6, z: 63 },
  { id: "east-gate", name: "校园东侧门", x: 87, z: 32 },
] as const;
export const shops = Array.from({ length: 8 }, (_, i) => ({
  id: `shop-${i + 1}`,
  name: ["面馆", "烘焙", "茶饮", "盖饭", "小炒", "馄饨", "水果", "夜宵"][i],
  x: 98,
  z: -10 + i * 5.2,
  width: 6,
  depth: 4.5,
}));
export interface CampusRoad {
  id: string;
  kind: "road" | "walk";
  width: number;
  points: Point[];
}
export const roads: CampusRoad[] = [
  {
    id: "outer",
    kind: "road",
    width: 3.2,
    points: [
      [-6, 63],
      [-39, 66],
      [-78, 60],
      [-91, 34],
      [-92, -4],
      [-92, -43],
      [-67, -74],
      [-21, -79],
      [18, -75],
      [40, -68],
      [73, -70],
      [107, -65],
      [111, -43],
      [105, -22],
      [87, -18],
      [87, 3],
      [87, 32],
      [73, 45],
      [57, 60],
      [22, 65],
      [-6, 63],
    ],
  },
  {
    id: "east-entry",
    kind: "road",
    width: 3.2,
    points: [
      [100, 32],
      [87, 32],
      [78, 39],
      [66, 43],
      [57, 60],
      [54, 55],
    ],
  },
  {
    id: "sports-contour",
    kind: "road",
    width: 3,
    points: [
      [-92, -4],
      [-86, -12],
      [-52, -12],
      [-50, 13],
      [-49, 33],
      [-40, 57],
      [-39, 66],
    ],
  },
  {
    id: "north-saddle",
    kind: "road",
    width: 3,
    points: [
      [-92, -43],
      [-57, -40],
      [-20, -37],
      [20, -39],
      [42, -36],
      [46, -20],
      [61, -19],
      [87, 3],
    ],
  },
  {
    id: "mountain-contour",
    kind: "road",
    width: 3,
    points: [
      [18, -75],
      [38, -69],
      [38, -44],
      [20, -39],
      [42, -36],
      [46, -20],
    ],
  },
  {
    id: "east-court-lane",
    kind: "road",
    width: 3,
    points: [
      [73, -70],
      [76.1, -66],
      [76.1, -38],
      [76, -24],
      [105, -22],
    ],
  },
  {
    id: "learning-west",
    kind: "walk",
    width: 2,
    points: [
      [-52, -8.5],
      [-24.3, -8.5],
      [-24.3, 13],
      [-14, 13],
      [-14, -2.8],
    ],
  },
  {
    id: "learning-east",
    kind: "walk",
    width: 2,
    points: [
      [-14, -2.8],
      [-5, -2],
      [-5, -31],
      [17, -34],
      [20, -39],
    ],
  },
  {
    id: "science-walk",
    kind: "walk",
    width: 2,
    points: [
      [18, -32],
      [20, -11],
      [34, -14],
      [44, -12],
      [46, -20],
    ],
  },
  {
    id: "north-dorm-walk",
    kind: "walk",
    width: 2,
    points: [
      [-36, -42],
      [-36, -38],
      [-20, -37],
      [-2, -37],
      [-2, -45],
    ],
  },
  {
    id: "east-dorm-walk",
    kind: "walk",
    width: 2,
    points: [
      [58, -34],
      [61, -19],
      [92, -21],
      [92, -30],
    ],
  },
  {
    id: "life-walk",
    kind: "walk",
    width: 2,
    points: [
      [43, -19],
      [46, -5],
      [52, 0],
      [52, 21],
      [74, 22],
      [77, 36],
      [87, 32],
    ],
  },
  {
    id: "lake-arrival",
    kind: "walk",
    width: 2.4,
    points: [
      [-6, 63],
      [-6, 59],
      [23, 58],
      [23, 14],
      [-14, 13],
    ],
  },
  {
    id: "hall-arrival",
    kind: "walk",
    width: 2,
    points: [
      [-6, 59],
      [40, 59],
      [40, 46.2],
    ],
  },
  {
    id: "sports-walk",
    kind: "walk",
    width: 2,
    points: [
      [-90, 36],
      [-77, 36],
      [-49, 36],
      [-40, 57],
    ],
  },
  {
    id: "snack-street",
    kind: "walk",
    width: 3,
    points: [
      [93, -15],
      [93, 32],
      [100, 32],
    ],
  },
];
export function segmentDistance(x: number, z: number, a: Point, b: Point) {
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
export function inFootprint(x: number, z: number, p: Footprint, inset = 0) {
  return (
    Math.abs(x - p.x) <= p.width / 2 + inset &&
    Math.abs(z - p.z) <= p.depth / 2 + inset
  );
}
export function insideIsland(x: number, z: number) {
  let inside = false;
  for (
    let i = 0, j = islandOutline.length - 1;
    i < islandOutline.length;
    j = i++
  ) {
    const a = islandOutline[i],
      b = islandOutline[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
/** Building slabs follow the pre-existing terrain; foundations bridge only local variation. */
const elevationCache = new WeakMap<Footprint, number>();
export function buildingElevation(b: Footprint) {
  let height = elevationCache.get(b);
  if (height !== undefined) return height;
  height = -Infinity;
  const nx = Math.ceil(b.width),
    nz = Math.ceil(b.depth);
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const p = buildingPoint(
        b as CampusBuilding,
        b.x - b.width / 2 + (i * b.width) / nx,
        b.z - b.depth / 2 + (j * b.depth) / nz,
      );
      height = Math.max(height, terrainHeight(p[0], p[1]));
    }
  elevationCache.set(b, height);
  return height;
}
export function inBuildingFootprint(
  x: number,
  z: number,
  b: CampusBuilding,
  margin = 0,
) {
  const a = -(b.heading ?? 0),
    dx = x - b.x,
    dz = z - b.z;
  return (
    Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= b.width / 2 + margin &&
    Math.abs(-dx * Math.sin(a) + dz * Math.cos(a)) <= b.depth / 2 + margin
  );
}
export const bridge = { from: lakePoint(2.15, 1.5), to: lakePoint(2.9, 1.5) };
export function roadHeightAt(r: CampusRoad, index: number, t: number) {
  const a = r.points[index],
    b = r.points[index + 1];
  return terrainHeight(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
}
export function roadAt(x: number, z: number) {
  return roads.find((r) =>
    r.points
      .slice(1)
      .some((p, i) => segmentDistance(x, z, r.points[i], p) < r.width / 2),
  );
}
export function lakePoint(angle: number, margin = 0): Point {
  const r = lakeRadius(angle);
  return [
    lake.x + Math.cos(angle) * (lake.rx * r + margin),
    lake.z + Math.sin(angle) * (lake.rz * r + margin),
  ];
}
export function lakeContains(x: number, z: number, margin = 0) {
  const dx = (x - lake.x) / (lake.rx + margin),
    dz = (z - lake.z) / (lake.rz + margin);
  return Math.hypot(dx, dz) < lakeRadius(Math.atan2(dz, dx));
}
export const recordAnchor: Record<string, string> = {
  B1: "B1",
  B2: "B2",
  B3: "B3",
  B4: "B4",
  B5: "B5",
  B6: "B6",
  F1: "B3",
  F2: "B6",
  F3: "B4",
  F4: "B1",
  F5: "east-gate",
  F6: "fire-library",
  F7: "B1",
  F8: "B2",
  F9: "B1",
  F10: "B2",
  F11: "B5",
  T1: "B1",
  T2: "dorm-2",
  T3: "B3",
  T4: "B6",
  I1: "B4",
  I2: "B1",
  I3: "B6",
  R1: "B3",
  R2: "B6",
  R3: "B4",
  R4: "B3",
  N1: "B5",
  N2: "B3",
  N3: "B4",
  S1: "B4",
  S2: "fire-library",
};
