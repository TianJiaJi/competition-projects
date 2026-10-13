import * as THREE from "three";
import {
  buildings,
  roads,
  parking,
  garden,
  water,
  garage,
  island,
  islandOutline,
} from "./layout";
import type { CommunityPalette } from "./palette";
/** Plan artwork and 3D models share footprints and north orientation. */
export function createCommunityPainting(palette: CommunityPalette) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1152;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("社区画卷无法创建");
  c.translate(768, 560);
  c.scale(10.5, 10.5);
  c.lineWidth = 0.12;
  c.strokeStyle = palette.brand;
  c.fillStyle = palette.canvas;
  c.beginPath();
  islandOutline.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z)));
  c.closePath();
  c.fill();
  c.stroke();
  const rect = (p: { x: number; z: number; width: number; depth: number }) =>
    [p.x - p.width / 2, p.z - p.depth / 2, p.width, p.depth] as const;
  c.fillStyle = palette.line;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const r of roads) {
    c.beginPath();
    r.points.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z)));
    c.lineWidth = r.width;
    c.strokeStyle = r.kind === "road" ? palette.line : palette.surface;
    c.stroke();
  }
  c.lineWidth = 0.12;

  c.fillStyle = "#c6ccba";
  c.fillRect(...rect(garden));
  c.fillStyle = "#adbfbc";
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x = water.x + Math.cos(a) * 2.45,
      z = water.z + Math.sin(a) * 4.35;
    if (i) c.lineTo(x, z);
    else c.moveTo(x, z);
  }
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.arc(water.x, water.z, 0.85, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    c.beginPath();
    c.moveTo(water.x, water.z);
    c.quadraticCurveTo(
      water.x + Math.cos(a) * 0.8,
      water.z + Math.sin(a) * 1.5,
      water.x + Math.cos(a) * 1.65,
      water.z + Math.sin(a) * 3.04,
    );
    c.stroke();
  }
  c.font = "1.1px sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const b of buildings) {
    c.fillStyle = palette.surface;
    c.fillRect(...rect(b));
    c.strokeStyle = palette.brand;
    c.strokeRect(...rect(b));
    c.fillStyle = palette.brand;
    c.fillText(b.name, b.x, b.z);
  }
  for (const p of [...parking, { ...garage, name: "地下车库" }]) {
    c.strokeRect(...rect(p));
    c.fillStyle = palette.brand;
    c.fillText(p.name, p.x, p.z);
  }
  c.fillStyle = palette.brand;
  c.font = "2.5px serif";
  c.fillText("云 栖 雅 苑", 0, island.depth / 2 + 5);
  c.font = ".9px sans-serif";
  c.fillText("L I V I N G   I N   H A R M O N Y", 0, island.depth / 2 + 7.5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
