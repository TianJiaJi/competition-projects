import * as THREE from "three";
import {
  buildings,
  roads,
  parking,
  garage,
  water,
  insideIsland,
  anchors,
  islandOutline,
  roadDistance,
  inFootprint,
  anchorById,
  terrainHeight,
  buildingElevation,
  type CommunityBuilding,
} from "./layout";
import { createSafetyFixtures } from "./safety-model";
import { createCommunityFountain } from "./fountain";
import { createCommunityBatches } from "./batches";
import { createSurfaceCells, surfaceStep } from "./surface";
import type { CommunityPalette } from "./palette";

type BaseTone =
  | keyof CommunityPalette
  | "grass"
  | "leaf"
  | "leafLight"
  | "rock"
  | "rockLight"
  | "road"
  | "glazing"
  | "glass"
  | "water"
  | "red";
type Tone = BaseTone | `safety:${BaseTone}`;
/** All cuboids of the same material share one draw call. */
export function createCommunityModel(palette: CommunityPalette) {
  const root = new THREE.Group();
  root.name = "yunqi-community-island";
  const cube = new THREE.BoxGeometry(1, 1, 1),
    matrices = new Map<Tone, THREE.Matrix4[]>();
  const materials = new Map<Tone, THREE.MeshStandardMaterial>(),
    textures: THREE.Texture[] = [];
  const extraGeometries: THREE.BufferGeometry[] = [];
  const tones = {
    ...palette,
    grass: "#a9b398",
    leaf: "#738974",
    leafLight: "#92a387",
    rock: "#9c8b78",
    rockLight: "#b6a58e",
    road: "#b4a99a",
    glass: "#829b99",
    glazing: "#829b99",
    water: "#9bb8b5",
    red: "#ad5947",
  };
  for (const [key, color] of Object.entries(tones))
    materials.set(
      key as Tone,
      new THREE.MeshStandardMaterial({
        color,
        roughness: key === "glass" ? 0.28 : key === "water" ? 0.24 : 0.85,
        metalness: key === "glass" ? 0.12 : 0,
        transparent: key === "glazing",
        opacity: key === "glazing" ? 0.32 : 1,
        depthWrite: key !== "glazing",
      }),
    );
  const dummy = new THREE.Object3D();
  let followTerrain = false;
  let safetyPart = false;
  let buildingLevel: number | undefined;
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tone: BaseTone,
    angle = 0,
  ) {
    dummy.position.set(
      x,
      y + (followTerrain ? (buildingLevel ?? terrainHeight(x, z)) : 0),
      z,
    );
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, angle, 0);
    dummy.updateMatrix();
    const key: Tone = safetyPart ? `safety:${tone}` : tone;
    if (!materials.has(key)) {
      const mat = materials.get(tone)!.clone();
      mat.userData.focusMaterial = true;
      materials.set(key, mat);
    }
    const list = matrices.get(key) ?? [];
    list.push(dummy.matrix.clone());
    matrices.set(key, list);
  }
  function label(
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    rotation = 0,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.fillStyle = palette.surface;
    c.fillRect(0, 0, 512, 96);
    c.strokeStyle = palette.accent;
    c.lineWidth = 5;
    c.strokeRect(4, 4, 504, 88);
    c.fillStyle = palette.brand;
    c.font = '500 38px "PingFang SC", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 256, 50, 470);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const geo = new THREE.PlaneGeometry(width, (width * 96) / 512);
    extraGeometries.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
    if (safetyPart) mat.userData.focusMaterial = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + (buildingLevel ?? terrainHeight(x, z)), z);
    mesh.rotation.y = rotation;
    root.add(mesh);
  }
  function tree(x: number, z: number, scale = 1) {
    box(x, 1.1 * scale, z, 0.36 * scale, 2.2 * scale, 0.36 * scale, "brand");
    box(x, 2.4 * scale, z, 1.8 * scale, 1.5 * scale, 1.8 * scale, "leaf");
    box(
      x - 0.25 * scale,
      3.2 * scale,
      z - 0.15 * scale,
      1.3 * scale,
      0.7 * scale,
      1.3 * scale,
      "leafLight",
    );
  }
  function hedge(x: number, z: number, w: number, d: number) {
    box(x, 0.35, z, w, 0.7, d, "leaf");
  }
  function bench(x: number, z: number, angle = 0) {
    box(x, 0.48, z, 1.9, 0.18, 0.65, "brand", angle);
    box(x, 0.25, z, 0.2, 0.5, 0.6, "accent");
    if (!angle) box(x, 0.88, z - 0.3, 1.9, 0.5, 0.13, "accent");
  }
  function lamp(x: number, z: number) {
    box(x, 1.2, z, 0.12, 2.4, 0.12, "brand");
    box(x, 2.43, z, 0.48, 0.16, 0.48, "accent");
    box(x, 2.31, z, 0.3, 0.16, 0.3, "surface");
  }

  // A single, mutually exclusive surface classification replaces overlapping road slabs.
  for (const cell of createSurfaceCells())
    box(
      cell.x,
      terrainHeight(cell.x, cell.z) - 0.45,
      cell.z,
      surfaceStep,
      0.9,
      surfaceStep,
      cell.kind === "grass"
        ? "grass"
        : cell.kind === "road"
          ? "road"
          : "canvas",
    );
  for (let layer = 0; layer < 6; layer++) {
    const inset = 2 + layer * 2.1;
    for (let x = -52; x < 53; x += 3)
      for (let z = -42; z < 43; z += 3) {
        const noise = Math.sin(x * 0.7 + z * 0.38) * 0.8;
        if (!insideIsland(x, z, inset + noise)) continue;
        if (layer === 0 && inFootprint(x, z, garage, 2)) continue;
        const edge =
          !insideIsland(x + 3, z, inset) ||
          !insideIsland(x - 3, z, inset) ||
          !insideIsland(x, z + 3, inset) ||
          !insideIsland(x, z - 3, inset);
        if (!edge && layer > 0 && layer < 5) continue;
        const n = Math.sin(x * 3.17 + z * 5.81 + layer * 3);
        box(
          x,
          -2.6 - layer * 2.8 + n * 0.2,
          z,
          3.05,
          3.1 + Math.abs(n),
          3.05,
          n > 0.1 ? "rockLight" : "rock",
        );
        if (edge && layer > 0 && n > 0.1)
          box(
            x + Math.sign(x) * 0.9,
            -1.6 - layer * 2.8,
            z + Math.sign(z) * 0.6,
            2.5,
            3.8 + n,
            2.5,
            "rock",
          );
      }
  }
  followTerrain = true;
  // Lane dashes follow the same polyline as the road, above the sole top surface.
  const perimeter = roads.find((r) => r.id === "perimeter")!;
  perimeter.points.slice(1).forEach((b, i) => {
    const a = perimeter.points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 2; d < length - 1; d += 5) {
      const t = d / length;
      box(
        a[0] + (b[0] - a[0]) * t,
        0.045,
        a[1] + (b[1] - a[1]) * t,
        0.1,
        0.025,
        1.7,
        "surface",
        Math.atan2(b[0] - a[0], b[1] - a[1]),
      );
    }
  });
  function tower(b: CommunityBuilding) {
    const h = b.floors * 1.05;
    box(b.x, 0.25, b.z, 9, 0.5, 9, "line");
    box(b.x, h / 2 + 0.5, b.z, 8, h, 8, "surface");
    box(b.x - 2.8, h / 2 + 0.5, b.z, 1.2, h + 0.1, 8.12, "canvas");
    for (let f = 0; f < b.floors; f++) {
      const y = 1 + f * 1.05;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++)
          box(
            b.x - 2.65 + k * 1.75,
            y,
            b.z + side * 4.03,
            1.05,
            0.64,
            0.09,
            "glass",
          );
        box(b.x + 0.9, y - 0.39, b.z + side * 4.4, 4.5, 0.14, 0.8, "line");
        box(b.x + 0.9, y - 0.12, b.z + side * 4.77, 4.5, 0.32, 0.12, "accent");
      }
      for (const side of [-1, 1])
        for (const offset of [-2, 1])
          box(b.x + side * 4.04, y, b.z + offset, 0.1, 0.65, 1.3, "glass");
    }
    box(b.x, h + 0.63, b.z, 8.4, 0.25, 8.4, "brand");
    box(b.x + 0.4, h + 1.03, b.z - 1, 5, 0.65, 4.6, "canvas");
    box(b.x + 0.4, h + 1.4, b.z - 1, 5.3, 0.12, 4.9, "accent");
    box(b.x - 1.6, h + 1.6, b.z - 1.3, 1.3, 1.2, 1.7, "line"); // lift machine room
    box(b.x, 0.85, b.z + 4.08, 1.7, 1.7, 0.14, "brand");
    box(b.x, 1.9, b.z + 4.65, 2.8, 0.18, 1.5, "accent");
    label(b.name, b.x - 2.45, h - 0.9, b.z + 4.1, 1.8);
    lamp(b.x + 3.3, b.z + 5.3);
    box(b.x - 3.1, 0.3, b.z + 4.8, 0.24, 0.6, 0.24, "red");
    tree(b.x - 4.7, b.z + 2, 0.75);
  }
  function villa(b: CommunityBuilding) {
    const unit = b.width / b.units,
      h = b.floors * 1.25;
    box(b.x, 0.12, b.z, b.width + 0.5, 0.24, b.depth + 0.5, "line");
    for (let u = 0; u < b.units; u++) {
      const x = b.x - b.width / 2 + unit * (u + 0.5);
      box(x, h / 2 + 0.25, b.z, unit - 0.18, h, b.depth, "surface");
      box(x - unit * 0.34, h / 2 + 0.3, b.z, 0.55, h, b.depth + 0.1, "brand");
      box(x, h + 0.36, b.z, unit, 0.2, b.depth + 0.2, "accent");
      // Upper floor retreats from the terrace edge; parapets have open centers.
      box(x, h + 0.7, b.z - 1.2, unit * 0.58, 0.5, 2.5, "canvas");
      for (const f of Array.from({ length: b.floors }, (_, i) => i)) {
        box(
          x + 0.35,
          1 + f * 1.25,
          b.z + 3.04,
          unit * 0.55,
          0.75,
          0.1,
          "glass",
        );
        box(
          x + 0.2,
          0.62 + f * 1.25,
          b.z + 3.28,
          unit * 0.7,
          0.12,
          0.6,
          "line",
        );
        if (f > 0)
          box(
            x + 0.2,
            0.83 + f * 1.25,
            b.z + 3.53,
            unit * 0.7,
            0.33,
            0.1,
            "accent",
          );
      }
      box(x - unit * 0.28, 0.85, b.z + 3.08, 0.8, 1.4, 0.12, "brand");
      box(x, 0.04, b.z + 4, unit - 0.2, 0.12, 1.7, "canvas");
      box(x - unit * 0.28, 0.06, b.z + 4.8, 0.85, 0.12, 1.8, "canvas");
      hedge(x + unit * 0.36, b.z + 4.2, 0.45, 1.8);
      for (const side of [-1, 1])
        box(x + (side * unit) / 2, 0.4, b.z + 4.2, 0.12, 0.8, 1.8, "line");
    }
    tree(b.x - b.width / 2 - 1.4, b.z + 1, 0.8);
    if (b.kind === "detached") {
      box(b.x + 1.6, 3.9, b.z, 3.4, 0.12, 3, "brand");
      for (let i = 0; i < 5; i++)
        box(b.x + 0.2 + i * 0.7, 4.06, b.z, 0.14, 0.18, 3, "accent");
      bench(b.x + 1, b.z + 4);
    }
  }
  for (const b of buildings) {
    const level = buildingElevation(b);
    buildingLevel = 0;
    if (level > 0) {
      box(b.x, level / 2, b.z, b.width + 2.2, level, b.depth + 2.2, "line");
      const steps = Math.ceil(level / 0.2);
      for (let step = 0; step < steps; step++) {
        const h = level * (1 - step / steps);
        box(
          b.x,
          h / 2,
          b.z + b.depth / 2 + 1.2 + step * 0.45,
          2.1,
          h,
          0.5,
          "canvas",
        );
      }
    }
    buildingLevel = level;
    if (b.kind === "tower") {
      tower(b);
      continue;
    }
    if (!["club", "center"].includes(b.kind)) {
      villa(b);
      continue;
    }
    const h = b.kind === "club" ? 2.6 : 4.7;
    box(b.x, 0.15, b.z, b.width + 0.6, 0.3, b.depth + 0.6, "line");
    // Recess the south facade to expose a shallow public-room interior.
    box(b.x, h / 2 + 0.25, b.z - 1, b.width, h, b.depth - 2, "surface");
    box(b.x, 0.32, b.z, b.width, 0.2, b.depth, "canvas");
    if (b.kind === "center") box(b.x, 3, b.z, b.width, 0.25, b.depth, "line");
    for (let i = 0; i < 6; i++)
      box(
        b.x - b.width / 2 + 0.2 + (i * (b.width - 0.4)) / 5,
        1.5,
        b.z + b.depth / 2,
        0.18,
        2.7,
        0.22,
        "surface",
      );
    box(b.x, h + 0.35, b.z, b.width + 0.9, 0.25, b.depth + 0.9, "brand");
    box(b.x, h + 0.55, b.z, b.width - 1, 0.2, b.depth - 1, "grass");
    for (let i = 0; i < 5; i++)
      box(
        b.x - b.width / 2 + 1.2 + (i * (b.width - 2.4)) / 4,
        1.5,
        b.z + b.depth / 2 + 0.04,
        1.5,
        2,
        0.1,
        "glazing",
      );
    const direction = b.facing === "east" ? 1 : -1;
    box(
      b.x + direction * (b.width / 2 + 0.04),
      1.5,
      b.z,
      0.1,
      2.2,
      b.depth - 1,
      "glass",
    );
    box(
      b.x + direction * (b.width / 2 + 1),
      0.12,
      b.z,
      2,
      0.22,
      b.depth,
      "canvas",
    );
    box(
      b.x + direction * (b.width / 2 + 0.5),
      2.9,
      b.z,
      2,
      0.2,
      b.depth + 1,
      "accent",
    );
    label(b.name, b.x, 2.5, b.z + b.depth / 2 + 0.15, b.width * 0.64);
    for (const z of [b.z - 2, b.z + 2])
      bench(b.x + direction * (b.width / 2 + 1), z, Math.PI / 2);
    if (b.kind === "center") {
      for (let i = 0; i < 5; i++)
        box(b.x - 4 + i * 2, 3.85, b.z + 5.05, 1.2, 0.8, 0.1, "glass");
      // Gym equipment is a shallow visible vignette inside the south glazing.
      for (const x of [b.x - 3, b.x, b.x + 3]) {
        box(x, 0.45, b.z + b.depth / 2 - 0.45, 1.4, 0.2, 1.6, "brand");
        box(x, 1.05, b.z + b.depth / 2 - 0.8, 0.15, 1.2, 0.15, "accent");
        box(x, 1.65, b.z + b.depth / 2 - 0.8, 1, 0.12, 0.15, "brand");
      }
      label("社区健身房", b.x, 1.1, b.z + b.depth / 2 + 0.16, 5);
      lamp(b.x - 7, b.z - 3);
      lamp(b.x - 7, b.z + 3);
    }
  }
  buildingLevel = undefined;
  // A faceted fountain replaces the flat rectangular pool at the existing garden site.
  const fountain = createCommunityFountain(palette);
  root.add(fountain.root);
  extraGeometries.push(...fountain.geometries);
  for (const x of [-11, 4])
    for (const z of [-10, 0]) {
      bench(x, z);
      tree(x - 1, z - 1.9, 0.9);
    }
  for (const x of [-6, 5]) box(x, 0.15, -11, 2.5, 0.3, 1.5, "leafLight");
  for (const z of [-9, -4, 1]) box(-4, 0.13, z, 1.3, 0.1, 1.3, "canvas");
  safetyPart = true;
  box(14.5, 0.44, -12.5, 0.35, 0.88, 0.35, "red");
  box(14.5, 0.64, -12.5, 0.8, 0.24, 0.23, "red");
  safetyPart = false;
  box(-14.5, 0.35, 1, 0.18, 0.7, 0.18, "accent");
  box(-14.28, 0.67, 1, 0.5, 0.13, 0.13, "accent");
  // Parking stalls share the road surface, leaving the middle row open for entry.
  for (const p of parking) {
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const x = p.x + side * 2.5,
          z = p.z - 3.1 + i * 3.1;
        box(x, 0.06, z - 1.35, 3.4, 0.025, 0.1, "surface");
        if (i === 1) continue;
        box(x, 0.58, z, 2.8, 0.8, 1.3, i % 2 ? "surface" : "brand");
        box(x, 0.92, z, 1.4, 0.45, 1.2, "glass");
        for (const wx of [-1, 1])
          for (const wz of [-0.6, 0.6])
            box(x + wx, 0.3, z + wz, 0.4, 0.4, 0.18, "ink");
      }
    const signX = p.x - Math.sign(p.x) * 3;
    box(signX, 1.15, p.z - 5, 0.13, 2.3, 0.13, "brand");
    label("P", signX, 2.05, p.z - 4.9, 1.3);
    hedge(p.x - Math.sign(p.x) * 5.3, p.z, 1, 10);
  }
  const rampGeo = new THREE.BoxGeometry(
    garage.width - 0.2,
    0.18,
    Math.hypot(garage.depth, 2.5),
  );
  extraGeometries.push(rampGeo);
  const ramp = new THREE.Mesh(rampGeo, materials.get("road"));
  ramp.position.set(garage.x, -1.2, garage.z);
  ramp.rotation.x = Math.atan2(2.5, garage.depth);
  ramp.receiveShadow = true;
  root.add(ramp);
  for (const side of [-1, 1])
    box(
      garage.x + side * (garage.width / 2 + 0.1),
      -0.65,
      garage.z,
      0.3,
      2.2,
      garage.depth,
      "line",
    );
  const end = garage.z + garage.depth / 2 - 1;
  box(garage.x, 1.9, end, garage.width + 0.7, 0.35, 2.2, "brand");
  for (const side of [-1, 1])
    box(
      garage.x + (side * garage.width) / 2,
      0.3,
      end,
      0.35,
      3.3,
      0.35,
      "accent",
    );
  const entry = garage.z - garage.depth / 2 + 0.4;
  box(garage.x, 1.45, entry, garage.width - 0.3, 0.2, 0.2, "accent");
  for (const side of [-1, 1])
    box(
      garage.x + side * (garage.width / 2 - 0.2),
      0.72,
      entry,
      0.15,
      1.44,
      0.15,
      "brand",
    );
  label("P  地下车库 · 2.2m", garage.x, 1.85, entry + 0.2, garage.width - 0.5);
  safetyPart = true;
  for (const side of [-1, 1]) {
    const g = anchorById[side > 0 ? "east-gate" : "west-gate"];
    box(g.x, 1.05, g.z - 3, 1.5, 2.1, 1.7, "surface");
    box(g.x, 2.17, g.z - 3, 1.9, 0.18, 2, "brand");
    box(g.x, 1.3, g.z - 2.12, 1.1, 0.7, 0.08, "glass");
    box(g.x, 0.7, g.z - 1.3, 0.3, 1.4, 0.3, "brand");
    box(g.x, 1.35, g.z, 0.16, 0.14, 2.6, "accent");
    for (const z of [g.z + 2.1, g.z + 3.3])
      box(g.x, 0.65, z, 0.4, 1.3, 0.25, "accent");
    label(side > 0 ? "东门" : "西门", g.x, 1.9, g.z - 2.02, 1.5);
  }
  safetyPart = false;
  const safety = createSafetyFixtures();
  root.add(safety.root);
  extraGeometries.push(...safety.geometries);
  for (const x of [-3, 3]) {
    box(x, 1.05, 37, 0.6, 2.1, 0.6, "brand");
    lamp(x, 36);
  }
  label("云栖雅苑", 0, 0.8, 38.2, 5);
  // Uneven green shoulders soften the silhouette without changing the broad island form.
  for (let i = 0; i < islandOutline.length; i++) {
    const [x, z] = islandOutline[i],
      tx = x * 0.93,
      tz = z * 0.91;
    if (
      insideIsland(tx, tz, 1.5) &&
      !buildings.some((b) => inFootprint(tx, tz, b, 2)) &&
      roads.every((r) => roadDistance(tx, tz, r) > r.width / 2 + 1)
    )
      tree(tx, tz, 0.7 + (i % 3) * 0.12);
    if (i % 4 === 0)
      for (let k = 0; k < 4; k++)
        box(
          x * 0.97,
          -0.5 - k * 0.85,
          z * 0.97 - k * 0.12,
          0.7,
          0.8,
          0.8,
          "leaf",
        );
  }
  for (const [x, z] of [
    [-33, 4],
    [33, 10],
    [-8, 22],
    [8, 23],
    [-5, -26],
    [5, -27],
  ])
    tree(x, z, 0.9);
  for (const z of [-8, 3, 18, 29]) {
    lamp(-3.4, z);
    lamp(3.4, z);
  }
  const batches = createCommunityBatches(matrices, materials, cube);
  extraGeometries.push(...batches.geometries);
  root.add(...batches.meshes);
  for (const a of anchors) {
    const marker = new THREE.Object3D();
    marker.name = `anchor:${a.id}`;
    marker.position.set(a.x, a.y, a.z);
    marker.userData = {
      anchorId: a.id,
      parentId: a.parentId,
      records: a.records,
    };
    root.add(marker);
  }
  return {
    root,
    update: fountain.update,
    dispose() {
      cube.dispose();
      extraGeometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      const all = new Set<THREE.Material>(materials.values());
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (Array.isArray(o.material)) o.material.forEach((m) => all.add(m));
          else all.add(o.material);
          if (o instanceof THREE.InstancedMesh) o.dispose();
        }
      });
      all.forEach((m) => m.dispose());
    },
  };
}
