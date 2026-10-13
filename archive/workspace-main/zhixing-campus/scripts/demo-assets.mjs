// Offline, deterministic map assets derived from the actual model layout.
import {
  buildings,
  roads,
  islandOutline,
  lake,
  metresPerUnit,
} from "../packages/model/src/campus/layout.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
const dir = new URL("../packages/demo/assets/", import.meta.url);
await mkdir(dir, { recursive: true });
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const px = (x) => 590 + x * 4.1,
  pz = (z) => 450 + z * 4.1;
const points = (p) => p.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="920" viewBox="0 0 1280 920">
<rect width="1280" height="920" fill="#edf2f8"/><style>text{font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;fill:#263652} .label{font-size:13px;text-anchor:middle}</style>
<text x="50" y="57" font-size="30" font-weight="700">知行校园</text><text x="50" y="88" font-size="16">东 +x / 南 +z · 每单位 ${metresPerUnit} 米</text>
<polygon id="campus-region" points="${points(islandOutline)}" fill="#dde9df" stroke="#b1c7b7" stroke-width="3"/>
<ellipse id="lake-region" cx="${px(lake.x)}" cy="${pz(lake.z)}" rx="${lake.rx * 4.1}" ry="${lake.rz * 4.1}" fill="#a9cddd"/>
${roads.map((r) => `<polyline id="road-${r.id}" points="${points(r.points)}" fill="none" stroke="${r.kind === "road" ? "#f8f6ed" : "#c2cab4"}" stroke-width="${r.width * 4.1}" stroke-linecap="round" stroke-linejoin="round"/>`).join("\n")}
${buildings.map((b) => `<g id="${b.id}"><rect x="${px(b.x - b.width / 2)}" y="${pz(b.z - b.depth / 2)}" width="${b.width * 4.1}" height="${b.depth * 4.1}" rx="4" fill="${b.id === "B1" ? "#4665bc" : "#aab8d1"}" stroke="#7387ac" transform="rotate(${-(((b.heading ?? 0) * 180) / Math.PI)} ${px(b.x)} ${pz(b.z)})"/><text class="label" x="${px(b.x)}" y="${pz(b.z) + b.depth * 2.05 + 19}">${escape(b.name)}${b.id === "B1" ? " · B1" : ""}</text></g>`).join("\n")}
<path d="M ${px(8)} ${pz(-19)} L 800 305 L 950 305" stroke="#405db0" stroke-width="3" fill="none"/><circle cx="${px(8)}" cy="${pz(-19)}" r="6" fill="#fff" stroke="#405db0" stroke-width="3"/>
<rect x="920" y="255" width="295" height="99" rx="14" fill="#fff" stroke="#4665bc"/><text x="940" y="291" font-size="19" font-weight="700">F4 · 明理楼投影设备</text><text x="940" y="321" font-size="16">B1 明理楼 · 302 · T1 报修</text>
<text x="1180" y="118" font-size="22">北 ↑</text><text x="50" y="870" font-size="16">建筑与道路索引</text>
</svg>`;
await writeFile(new URL("M02.svg", dir), svg);
await writeFile(
  new URL("M03.json", dir),
  JSON.stringify(
    {
      version: "2026-10-09.1",
      coordinateSystem: "模型相对坐标，东 +x，南 +z",
      metresPerUnit,
      building: buildings.find((b) => b.id === "B1"),
      facility: { id: "F4", buildingId: "B1", location: "明理楼 302" },
      buildings,
      roads,
    },
    null,
    2,
  ) + "\n",
);
const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL || "chrome",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 920 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: fileURLToPath(new URL("M01.png", dir)) });
} finally {
  await browser.close();
}
console.log("Generated M01.png, M02.svg and M03.json from campus layout.");
