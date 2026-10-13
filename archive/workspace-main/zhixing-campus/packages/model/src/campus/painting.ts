import * as THREE from "three";
import {
  buildings,
  bridge,
  dormWings,
  islandOutline,
  roads,
  lake,
  lakePoint,
  athletics,
  trackOuterRadius,
  shops,
  gates,
  garage,
  courts,
} from "./layout";
import { campusColors, type CampusPalette } from "./palette";
export function createCampusPainting(palette: CampusPalette) {
  const canvas = document.createElement("canvas");
  canvas.width = 1792;
  canvas.height = 1536;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("校园画卷无法创建");
  const c = context;
  c.translate(855, 740);
  c.scale(6.7, 7.0);
  c.lineWidth = 0.2;
  c.strokeStyle = palette.brand;
  c.fillStyle = palette.canvas;
  c.beginPath();
  islandOutline.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z)));
  c.closePath();
  c.fill();
  c.stroke();
  for (let n = 0; n < 4; n++) {
    c.beginPath();
    for (let x = -76; x < 90; x += 2) {
      const z = -66 - n * 2 - Math.sin(x * 0.1) * 2;
      if (x === -76) c.moveTo(x, z);
      else c.lineTo(x, z);
    }
    c.strokeStyle = palette.line;
    c.stroke();
  }
  for (const r of roads) {
    c.beginPath();
    r.points.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z)));
    c.strokeStyle = r.kind === "road" ? palette.line : palette.surface;
    c.lineWidth = r.width;
    c.stroke();
  }
  c.lineWidth = 0.2;
  c.strokeStyle = palette.brand;
  c.beginPath();
  for (let i = 0; i <= 96; i++) {
    const [x, z] = lakePoint((i / 96) * Math.PI * 2, 1.5);
    if (i) c.lineTo(x, z);
    else c.moveTo(x, z);
  }
  c.stroke();
  c.fillStyle = campusColors.water;
  c.beginPath();
  for (let i = 0; i <= 96; i++) {
    const [x, z] = lakePoint((i / 96) * Math.PI * 2);
    if (i) c.lineTo(x, z);
    else c.moveTo(x, z);
  }
  c.fill();
  c.beginPath();
  c.moveTo(...bridge.from);
  c.lineTo(...bridge.to);
  c.strokeStyle = campusColors.road;
  c.lineWidth = 2.3;
  c.stroke();
  c.lineWidth = 0.2;
  c.strokeStyle = palette.brand;
  const rect = (b: { x: number; z: number; width: number; depth: number }) =>
    [b.x - b.width / 2, b.z - b.depth / 2, b.width, b.depth] as const;
  c.font = "1.5px sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const b of buildings) {
    const shapes =
      b.kind === "dorm" ? dormWings.filter((w) => w.parentId === b.id) : [b];
    for (const part of shapes) {
      c.save();
      c.translate(b.x, b.z);
      c.rotate(-(b.heading ?? 0));
      c.translate(-b.x, -b.z);
      c.fillStyle = palette.surface;
      c.fillRect(...rect(part));
      c.strokeRect(...rect(part));
      c.restore();
    }
    c.fillStyle = palette.brand;
    c.fillText(b.name, b.x, b.z);
  }
  for (const s of shops) {
    c.fillStyle = campusColors.warm;
    c.fillRect(...rect(s));
    c.strokeRect(...rect(s));
  }
  function oval(r: number) {
    c.beginPath();
    c.arc(athletics.x, athletics.z + athletics.straight / 2, r, 0, Math.PI);
    c.arc(
      athletics.x,
      athletics.z - athletics.straight / 2,
      r,
      Math.PI,
      Math.PI * 2,
    );
    c.closePath();
  }
  c.fillStyle = campusColors.track;
  oval(trackOuterRadius);
  c.fill();
  c.fillStyle = campusColors.pitch;
  oval(athletics.innerRadius);
  c.fill();
  c.fillStyle = campusColors.pitch;
  c.fillRect(...rect(courts));
  c.strokeRect(...rect(courts));
  c.fillStyle = palette.brand;
  c.fillText("400 m", athletics.x, athletics.z);
  c.fillText("知行湖", lake.x, lake.z);
  c.strokeRect(...rect(garage));
  for (const g of gates) {
    c.fillStyle = palette.brand;
    c.fillRect(g.x - 2, g.z - 1, 4, 2);
  }
  c.font = "3px serif";
  c.fillText("知 行 校 园", 0, 85);
  c.font = "1px sans-serif";
  c.fillText("L E A R N · E X P L O R E · G R O W", 0, 89);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
