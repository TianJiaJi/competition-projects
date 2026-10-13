import "./generate-contour.mjs";
import "../../../scripts/export-scenic-art.mjs";
import { build } from "esbuild";
import { Resvg } from "@resvg/resvg-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const output = path.resolve(here, "../src/static");
const scratch = path.join(root, ".local/mobile-assets");
await mkdir(scratch, { recursive: true });
await mkdir(path.join(output, "icons"), { recursive: true });
const result = await build({
  stdin: {
    contents:
      "export {createScenicSvg,scenicSvgPoint} from './packages/scenic/src/svg-map';export {paintedRoads} from './packages/scenic/src/svg-qinglv-paths';export {points,edges,nodes,scenicName} from './packages/scenic/src/data';export {shortestPath} from './packages/scenic/src/routing';export {emptySnapshot} from './packages/contracts/src/empty-snapshot';",
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
await writeFile(path.join(scratch, "source.mjs"), result.outputFiles[0].text);
const source = await import(path.join(scratch, "source.mjs"));
const svg = source
  .createScenicSvg({
    style: "qinglv",
    showMarkers: false,
    showLabels: false,
    showFacilities: false,
    showVisitorFixtures: false,
    idPrefix: "mobile",
  });
await writeFile(
  path.join(output, "scenic-map.png"),
  new Resvg(svg, { fitTo: { mode: "width", value: 1400 } }).render().asPng(),
);
const req = createRequire(import.meta.url),
  iconsDir = path.dirname(req.resolve("lucide-static/package.json"));
for (const name of [
  "house",
  "map",
  "calendar-days",
  "user-round",
  "message-circle",
  "messages-square",
  "route",
  "map-pin",
  "bookmark",
  "arrow-right",
  "arrow-up-right",
  "chevron-right",
  "chevron-left",
  "expand",
  "locate-fixed",
  "scan-line",
  "check",
  "info",
  "pencil",
  "smile",
  "x",
  "search",
  "car",
  "tree-pine",
  "pause",
  "play",
]) {
  const raw = await readFile(
    path.join(iconsDir, "icons", name + ".svg"),
    "utf8",
  );
  for (const [suffix, color] of [
    ["", "#536b63"],
    ["-active", "#175f54"],
    ["-white", "#ffffff"],
  ])
    await writeFile(
      path.join(output, "icons", name + suffix + ".png"),
      new Resvg(raw.replaceAll("currentColor", color), {
        fitTo: { mode: "width", value: 64 },
      })
        .render()
        .asPng(),
    );
}
const plans = [
  [
    "creek",
    "听溪轻游",
    ["entry", "creek", "entry"],
    ["自然", "亲子"],
    10,
    false,
  ],
  [
    "bamboo",
    "竹影寻幽",
    ["entry", "creek", "bamboo", "entry"],
    ["自然", "摄影"],
    35,
    false,
  ],
  [
    "lake",
    "镜湖慢行",
    ["entry", "lake", "market", "gate-out"],
    ["自然", "摄影"],
    35,
    false,
  ],
  [
    "forest",
    "松风漫步",
    ["entry", "forest", "market", "gate-out"],
    ["自然", "亲子"],
    30,
    false,
  ],
  [
    "falls",
    "飞瀑寻声",
    ["entry", "forest", "falls", "entry"],
    ["自然", "摄影"],
    45,
    false,
  ],
  [
    "summit",
    "望岳登高",
    ["entry", "gorge", "summit", "entry"],
    ["自然", "摄影"],
    45,
    false,
  ],
  [
    "culture",
    "入口人文短游",
    ["entry", "market", "gate-out"],
    ["古建", "文物", "亲子"],
    10,
    true,
  ],
  [
    "loop",
    "青岚全景环线",
    [
      "entry",
      "creek",
      "bamboo",
      "gorge",
      "summit",
      "falls",
      "lake",
      "forest",
      "market",
      "gate-out",
    ],
    ["自然", "古建", "摄影"],
    60,
    false,
  ],
];
const routes = plans.map(
  ([id, name, stops, interests, stayMinutes, accessible]) => {
    let paths = [],
      edgeIds = [],
      nodeIds = [],
      length = 0;
    for (let i = 1; i < stops.length; i++) {
      const route = source.shortestPath(
        stops[i - 1],
        stops[i],
        source.edges.filter((e) => e.mode === "walk"),
      );
      if (!route) throw Error("Unconnected route " + id);
      let current = stops[i - 1];
      for (const edgeId of route.edgeIds) {
        const edge = source.edges.find((e) => e.id === edgeId);
        const painted = source.paintedRoads.find((road) => road.id === edgeId);
        if (!painted) throw Error("Missing painted route " + edgeId);
        paths.push(
          ...(edge.from === current ? painted.samples : [...painted.samples].reverse()),
        );
        current = edge.from === current ? edge.to : edge.from;
      }
      edgeIds.push(...route.edgeIds);
      nodeIds.push(...route.nodeIds);
      length += route.distance;
    }
    const distance = Math.round(length); // Shared RoadEdge.length is already in metres (geometry scale = 46).
    return {
      id,
      name,
      stops,
      interests,
      accessible,
      edgeIds: [...new Set(edgeIds)],
      nodeIds: [...new Set(nodeIds)],
      path: paths.map((p) => ({ x: p.x, z: p.z })),
      distance,
      minutes: Math.ceil(distance / 50 + stayMinutes),
      reason: accessible
        ? "入口附近的短程往返，减少行走与停留负担。"
        : "沿既有步道串联景点，给途中观察、摄影与休息留出时间。",
    };
  },
);
const data = {
  name: source.scenicName,
  version: 1,
  scaleMetres: 46,
  mapStyle: "qinglv",
  mapVersion: 2,
  viewBox: { x: -37, y: -36, width: 76, height: 76 },
  points: source.points
    .filter((p) => !["terminal", "safety"].includes(p.kind))
    .map((p) => ({ ...p, anchor: source.scenicSvgPoint(p.id) })),
  edges: source.edges
    .filter((e) => !e.id.startsWith("access-"))
    .map((e) => ({ id: e.id, from: e.from, to: e.to, mode: e.mode })),
  routes,
  snapshot: source.emptySnapshot(source.points.map(p=>p.id), [...new Set(source.points.map(p=>p.regionId))]),
};
await mkdir(path.join(output, "routes"), { recursive: true });
for (const route of routes) {
  const d = route.path
    .map((p, i) => (i ? "L" : "M") + p.x + " " + p.z)
    .join(" ");
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-37 -36 76 76"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="#f8fcfa" stroke-width=".88"/><path d="${d}" stroke="#255d78" stroke-width=".42"/></g></svg>`;
  await writeFile(
    path.join(output, "routes", route.id + ".png"),
    new Resvg(overlay, { fitTo: { mode: "width", value: 1400 } })
      .render()
      .asPng(),
  );
}
await mkdir(path.join(root, "packages/scenic/generated"), { recursive: true });
await writeFile(
  path.join(root, "packages/scenic/generated/mobile.json"),
  JSON.stringify(data),
);
console.log(
  `Generated shared map, ${data.points.length} points and ${routes.length} connected route templates.`,
);
