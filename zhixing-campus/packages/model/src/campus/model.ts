import * as THREE from "three";
import {
  buildings,
  buildingPoint,
  dormWings,
  islandBounds,
  campusLobes,
  insideIsland,
  terrainHeight,
  buildingElevation,
  inBuildingFootprint,
  bridge,
  roadHeightAt,
  roads,
  roadAt,
  inFootprint,
  lakeContains,
  lakePoint,
  lake,
  athletics,
  trackOuterRadius,
  courts,
  garage,
  gates,
  shops,
  sceneScale,
  type CampusBuilding,
} from "./layout";
import { campusColors, type CampusPalette } from "./palette";
import { safetySites } from "./markers";
import { createCampusLake } from "./lake";
import { sportsSites } from "./terrain";

type Tone = keyof CampusPalette | keyof typeof campusColors;
export function createCampusModel(palette: CampusPalette) {
  const root = new THREE.Group();
  root.name = "zhixing-campus-island";
  root.scale.setScalar(sceneScale);
  const cube = new THREE.BoxGeometry(1, 1, 1),
    matrices = new Map<string, THREE.Matrix4[]>(),
    materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries: THREE.BufferGeometry[] = [],
    textures: THREE.Texture[] = [],
    labelMaterials: THREE.Material[] = [];
  const colors = { ...palette, ...campusColors };
  for (const [key, color] of Object.entries(colors))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: key === "glass" ? 0.35 : 0.88,
        metalness: key === "glass" ? 0.1 : 0,
      }),
    );
  const dummy = new THREE.Object3D();
  let activeBuilding: CampusBuilding | undefined;
  let flatElevation = 0;
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tone: Tone,
    angle = 0,
    safety = false,
  ) {
    if (activeBuilding) {
      [x, z] = buildingPoint(activeBuilding, x, z);
      angle += activeBuilding.heading ?? 0;
    }
    safety ||= activeBuilding?.kind === "clinic";
    y += flatElevation;
    const key = safety ? `safety:${tone}` : tone;
    if (!materials.has(key)) {
      const m = materials.get(tone)!.clone();
      m.userData.focusMaterial = true;
      materials.set(key, m);
    }
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, angle, 0);
    dummy.updateMatrix();
    const list = matrices.get(key) ?? [];
    list.push(dummy.matrix.clone());
    matrices.set(key, list);
  }
  function groundBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tone: Tone,
    angle = 0,
  ) {
    box(x, y + terrainHeight(x, z), z, w, h, d, tone, angle);
  }
  const strokes = new Map<string, number[]>();
  function line(points: THREE.Vector3[], color: string, closed = false) {
    const vertices = strokes.get(color) ?? [];
    for (let i = 1; i < points.length + (closed ? 1 : 0); i++) {
      const a = points[i - 1],
        b = points[i % points.length];
      vertices.push(
        a.x,
        a.y + flatElevation,
        a.z,
        b.x,
        b.y + flatElevation,
        b.z,
      );
    }
    strokes.set(color, vertices);
  }
  function sign(
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    angle = 0,
    safety = false,
  ) {
    if (activeBuilding) {
      [x, z] = buildingPoint(activeBuilding, x, z);
      angle += activeBuilding.heading ?? 0;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.fillStyle = palette.surface;
    c.fillRect(0, 0, 768, 128);
    c.fillStyle = palette.brand;
    c.font = '500 57px "PingFang SC", "Microsoft YaHei", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 384, 68, 732);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const g = new THREE.PlaneGeometry(width, width / 6);
    geometries.push(g);
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
    m.userData.focusMaterial = safety;
    labelMaterials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y + flatElevation, z);
    mesh.rotation.y = angle;
    root.add(mesh);
  }
  function tree(x: number, z: number, s = 1, y = terrainHeight(x, z)) {
    box(x, y + 0.8 * s, z, 0.3 * s, 1.6 * s, 0.3 * s, "wood");
    box(x, y + 2.1 * s, z, 1.8 * s, 1.9 * s, 1.8 * s, "leaf");
    box(
      x - 0.2 * s,
      y + 3.2 * s,
      z + 0.1 * s,
      1.2 * s,
      0.7 * s,
      1.2 * s,
      "leafLight",
    );
  }
  function bench(x: number, z: number, angle = 0, y = terrainHeight(x, z)) {
    box(x, y + 0.45, z, 1.7, 0.16, 0.55, "wood", angle);
    box(x, y + 0.22, z, 1.4, 0.4, 0.15, "roof", angle);
    box(x, y + 0.75, z - 0.25, 1.7, 0.5, 0.12, "wood", angle);
  }
  function islandBottom(x: number, z: number) {
    const depth = Math.max(
      ...campusLobes.map((c, i) => {
        const r = Math.hypot(x - c.x, z - c.z) / c.radius;
        return (
          9 + ((i ? 33 : 44) - 9) * Math.min(1, Math.max(0, (1 - r) / 0.5))
        );
      }),
    );
    return (
      -depth + 1.2 * Math.sin(Math.floor(x / 7) * 1.7 + Math.floor(z / 7) * 0.9)
    );
  }
  function surfaceHeight(x: number, z: number) {
    const sx = Math.round(x / 2) * 2,
      sz = Math.round(z / 2) * 2;
    const site = buildings.find((b) => inBuildingFootprint(sx, sz, b, 1.4));
    if (site) return buildingElevation(site) - 0.07;
    return terrainHeight(sx, sz) - (roadAt(sx, sz) ? 2 : 0) + 0.01;
  }
  // Mutually exclusive surface cells prevent coplanar overlays across slopes.
  const step = 2;
  for (let x = islandBounds.minX; x <= islandBounds.maxX; x += step)
    for (let z = islandBounds.minZ; z <= islandBounds.maxZ; z += step) {
      if (!insideIsland(x, z)) continue;
      const road = roadAt(x, z);
      const site = buildings.find((b) => inBuildingFootprint(x, z, b, 1.4));
      const h = site
        ? buildingElevation(site) - 0.08
        : inFootprint(x, z, garage)
          ? -Math.max(0, garage.z + garage.depth / 2 - z) * 0.055
          : terrainHeight(x, z) - (road ? 2 : 0);
      const geology =
        2 * Math.sin(Math.floor(x / 6) * 1.7 + Math.floor(z / 6) * 0.9);
      const bottom = islandBottom(x, z);
      const middle = -6 + geology * 0.4,
        lower = (middle + bottom) * 0.5;
      box(x, (h + middle) / 2 - 0.14, z, step, h - middle, step, "rockLight");
      box(
        x,
        (middle + lower) / 2 - 0.14,
        z,
        step,
        middle - lower,
        step,
        "rock",
      );
      box(
        x,
        (lower + bottom) / 2 - 0.14,
        z,
        step,
        lower - bottom,
        step,
        (Math.floor(x / 6) + Math.floor(z / 6)) % 3 === 0 ? "rock" : "rockDeep",
      );
      const isLake = lakeContains(x, z),
        rim = lakeContains(x, z, 2.2) && !isLake;
      box(
        x,
        h - 0.13,
        z,
        step,
        0.28,
        step,
        isLake
          ? "water"
          : rim
            ? "road"
            : road
              ? road.kind === "road"
                ? "road"
                : "wall"
              : "grass",
      );
    }
  // A truncated underside carries a few irregular low-poly stalactite clusters.
  for (const [x, z, length, radius] of [
    [-46, 8, 9, 4.2],
    [-19, 27, 12, 4.8],
    [8, -9, 8, 3.5],
    [70, -42, 8, 3.2],
    [-34, -20, 5, 2.3],
  ]) {
    const y = islandBottom(x, z);
    const g = new THREE.ConeGeometry(radius, length, 5, 1);
    g.rotateZ(Math.PI);
    geometries.push(g);
    const spike = new THREE.Mesh(g, materials.get("rockDeep"));
    spike.position.set(x, y - length / 2 + 0.8, z);
    spike.rotation.y = x * 0.1;
    spike.castShadow = true;
    root.add(spike);
    box(x, y + 0.2, z, radius * 1.6, 1.8, radius * 1.6, "rock");
    const small = new THREE.ConeGeometry(radius * 0.45, length * 0.55, 4);
    small.rotateZ(Math.PI);
    geometries.push(small);
    const shard = new THREE.Mesh(small, materials.get("rock"));
    shard.position.set(x + radius * 0.8, y - length * 0.2, z - radius * 0.3);
    root.add(shard);
  }
  // Every road is a continuous ribbon sampled over terrain: visible, traversable ramps.
  for (const road of roads) {
    const positions: number[] = [],
      indices: number[] = [],
      embankmentPositions: number[] = [];
    let count = 0;
    const leftEdge: THREE.Vector3[] = [],
      rightEdge: THREE.Vector3[] = [];
    for (let segment = 1; segment < road.points.length; segment++) {
      const a = road.points[segment - 1],
        b = road.points[segment],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        steps = Math.max(1, Math.ceil(length / 0.6));
      const nx = ((-dz / length) * road.width) / 2,
        nz = ((dx / length) * road.width) / 2;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          x = a[0] + dx * t,
          z = a[1] + dz * t;
        for (const side of [-1, 1]) {
          const xx = x + nx * side,
            zz = z + nz * side;
          const y = roadHeightAt(road, segment - 1, t) + 0.12;
          positions.push(xx, y, zz);
          (side < 0 ? leftEdge : rightEdge).push(
            new THREE.Vector3(xx, y + 0.055, zz),
          );
        }
        if (i > 0) {
          const q = count - 2;
          indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
          const top = (index: number) =>
            new THREE.Vector3(
              positions[index * 3],
              positions[index * 3 + 1],
              positions[index * 3 + 2],
            );
          const bottom = (v: THREE.Vector3) =>
            new THREE.Vector3(
              v.x,
              Math.min(surfaceHeight(v.x, v.z), v.y) - 2.5,
              v.z,
            );
          const a0 = top(q),
            a1 = top(q + 1),
            b0 = top(q + 2),
            b1 = top(q + 3),
            aa0 = bottom(a0),
            aa1 = bottom(a1),
            bb0 = bottom(b0),
            bb1 = bottom(b1);
          const face = (
            a: THREE.Vector3,
            b: THREE.Vector3,
            c: THREE.Vector3,
            d: THREE.Vector3,
          ) =>
            embankmentPositions.push(
              ...a.toArray(),
              ...b.toArray(),
              ...c.toArray(),
              ...a.toArray(),
              ...c.toArray(),
              ...d.toArray(),
            );
          face(a0, b0, bb0, aa0);
          face(b1, a1, aa1, bb1);
          if (i === 1) face(a1, a0, aa0, aa1);
          if (i === steps) face(b0, b1, bb1, bb0);
          face(aa0, bb0, bb1, aa1);
        }
        count += 2;
        if (
          road.kind === "road" &&
          i % 6 === 0 &&
          Math.abs(
            terrainHeight(x + dx / steps, z + dz / steps) - terrainHeight(x, z),
          ) > 0.025
        ) {
          for (const side of [-1, 1]) {
            const xx = x + (nx + 0.3 * Math.sign(nx)) * side,
              zz = z + (nz + 0.3 * Math.sign(nz)) * side;
            box(xx, terrainHeight(xx, zz) + 0.55, zz, 0.12, 1.1, 0.12, "roof");
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometries.push(geometry);
    const mesh = new THREE.Mesh(
      geometry,
      materials.get(road.kind === "road" ? "asphalt" : "wall"),
    );
    mesh.receiveShadow = true;
    mesh.name = `campus-ramp-${road.id}`;
    root.add(mesh);
    const foundationGeometry = new THREE.BufferGeometry();
    foundationGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(embankmentPositions, 3),
    );
    foundationGeometry.computeVertexNormals();
    geometries.push(foundationGeometry);
    const support = new THREE.Mesh(foundationGeometry, materials.get("road"));
    support.castShadow = true;
    support.receiveShadow = true;
    support.name = `campus-road-bed-${road.id}`;
    root.add(support);
    if (road.kind === "road") {
      line(leftEdge, campusColors.white);
      line(rightEdge, campusColors.white);
    }
  }
  // Retaining bases support all flat building floors independently of the slope.
  function block(
    b: CampusBuilding,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    level: number,
    balconies = false,
  ) {
    const ground = Math.min(
      terrainHeight(x - w / 2, z - d / 2),
      terrainHeight(x + w / 2, z + d / 2),
    );
    box(
      x,
      (ground + level) / 2,
      z,
      w + 0.5,
      Math.max(0.2, level - ground) + 0.15,
      d + 0.5,
      "shade",
    );
    box(x, level + h / 2, z, w, h, d, "wall");
    box(x, level + h + 0.16, z, w + 0.55, 0.32, d + 0.55, "roof");
    box(x, level + 0.2, z, w + 0.25, 0.4, d + 0.25, "shade");
    for (let f = 0; f < b.floors; f++) {
      const y = level + 0.62 + f * (h / b.floors);
      for (let xx = x - w / 2 + 0.9; xx < x + w / 2 - 0.5; xx += 1.8)
        for (const s of [-1, 1]) {
          box(xx, y, z + s * (d / 2 + 0.026), 1.1, 0.55, 0.045, "glass");
          if (balconies) {
            box(xx, y - 0.32, z + s * (d / 2 + 0.22), 1.5, 0.1, 0.42, "shade");
            box(xx, y - 0.07, z + s * (d / 2 + 0.4), 1.5, 0.12, 0.07, "accent");
          }
        }
      for (let zz = z - d / 2 + 0.95; zz < z + d / 2 - 0.5; zz += 1.8)
        for (const s of [-1, 1])
          box(x + s * (w / 2 + 0.025), y, zz, 0.045, 0.55, 1.1, "glass");
      if (f > 0)
        box(
          x,
          level + f * (h / b.floors),
          z,
          w + 0.12,
          0.07,
          d + 0.12,
          "shade",
        );
    }
    box(
      x - w * 0.22,
      level + h + 0.5,
      z - d * 0.16,
      Math.min(3, w / 3),
      0.6,
      Math.min(2, d / 3),
      "shade",
    );
    if (b.kind === "teaching" || b.kind === "lab") {
      box(
        x + w * 0.22,
        level + h + 0.4,
        z - d * 0.22,
        w * 0.4,
        0.5,
        d * 0.4,
        "wall",
      );
      box(
        x - w * 0.25,
        level + h + 0.32,
        z + d * 0.22,
        w * 0.3,
        0.3,
        d * 0.35,
        "accent",
      );
      box(
        x - w * 0.32,
        level + h * 0.5,
        z + d / 2 + 0.08,
        1.2,
        h,
        0.22,
        "brand",
      );
    }
  }
  for (const b of buildings) {
    activeBuilding = b;
    const level = buildingElevation(b),
      h = b.floors * 1.05;
    if (b.kind === "dorm") {
      const courtyardZ = b.z + 3;
      box(b.x, level - 0.06, b.z, b.width + 0.8, 0.12, b.depth + 0.8, "road");
      box(b.x, level + 0.05, courtyardZ, 11, 0.1, 13, "grass");
      for (const wing of dormWings.filter((w) => w.parentId === b.id))
        block(b, wing.x, wing.z, wing.width, wing.depth, h, level, true);
      // Stair cores distinguish the three connected wings; open south face remains unobstructed.
      for (const x of [b.x - 7, b.x + 7]) {
        box(x, level + h / 2, b.z - 5.95, 1.1, h, 0.12, "accent");
        box(x, level + h + 0.6, b.z - 8, 1.5, 1, 2, "wall");
      }
      for (const x of [b.x - 3.5, b.x + 3.5]) {
        tree(x, b.z + 3, 0.75, level);
        bench(x, b.z + 7, 0, level);
      }
      box(b.x, level + 0.04, b.z + 9, 2, 0.1, 6, "wall");
      sign(b.name, b.x, level + h - 0.55, b.z - 5.9, 8);
      continue;
    }
    if (b.kind === "gym" || b.kind === "auditorium") {
      const tall = b.kind === "gym" ? 5.2 : 5.7;
      box(b.x, level - 0.05, b.z, b.width + 1, 0.15, b.depth + 1, "road");
      box(b.x, level + tall / 2, b.z, b.width, tall, b.depth, "wall");
      box(b.x, level + tall + 0.2, b.z, b.width + 1, 0.4, b.depth + 1, "roof");
      for (let k = -4; k <= 4; k++)
        box(
          b.x + k * 2.6,
          level + tall + 0.48,
          b.z,
          0.45,
          0.18,
          b.depth + 0.4,
          "accent",
        );
      for (let x = b.x - b.width / 2 + 1.3; x < b.x + b.width / 2; x += 2.7) {
        box(x, level + 2.2, b.z + b.depth / 2 + 0.03, 1.8, 3, 0.07, "glass");
        box(
          x - 1.1,
          level + 2.4,
          b.z + b.depth / 2 + 0.18,
          0.38,
          4.8,
          0.4,
          "shade",
        );
      }
      box(
        b.x,
        level + 2.2,
        b.z + b.depth / 2 + 1,
        Math.min(15, b.width - 4),
        0.25,
        2.3,
        "accent",
      );
      for (let s = 0; s < 3; s++)
        box(
          b.x,
          level + 0.15 + s * 0.12,
          b.z + b.depth / 2 + 2 - s * 0.5,
          15,
          0.22,
          1,
          "shade",
        );
      sign(b.name, b.x, level + tall - 0.75, b.z + b.depth / 2 + 0.24, 9);
    } else {
      block(b, b.x, b.z, b.width, b.depth, h, level, b.kind === "teacher");
      const grand = b.kind === "library";
      if (grand) {
        box(b.x, level + h + 1, b.z, 7, 1.7, 9, "wall");
        box(b.x, level + h + 1.95, b.z, 7.6, 0.22, 9.6, "brand");
        box(b.x, level + h / 2, b.z + b.depth / 2 + 0.08, 5, h, 0.13, "glass");
        for (const dx of [-6, -3, 3, 6])
          box(
            b.x + dx,
            level + 1.6,
            b.z + b.depth / 2 + 0.8,
            0.55,
            3.2,
            0.6,
            "wall",
          );
        box(b.x, level + 3.3, b.z + b.depth / 2 + 0.8, 14, 0.3, 2, "shade");
      }
      box(b.x, level + 1.2, b.z + b.depth / 2 + 0.035, 2, 2.25, 0.07, "glass");
      box(
        b.x,
        level + 2.4,
        b.z + b.depth / 2 + 0.7,
        grand ? 6 : 4,
        0.18,
        1.6,
        "accent",
      );
      sign(
        b.name,
        b.x,
        level + h - 0.55,
        b.z + b.depth / 2 + 0.06,
        Math.min(b.width - 2, 8),
      );
    }
  }
  activeBuilding = undefined;
  // Shared study courts sit on the existing shoulders between each aligned pair.
  for (const b of buildings.filter((b) => b.kind === "teaching")) {
    const [x, z] = buildingPoint(b, b.x, b.z + b.depth / 2 + 2.3);
    bench(x, z);
  }
  flatElevation = sportsSites.athletics.elevation;
  box(
    sportsSites.athletics.x,
    0.07,
    sportsSites.athletics.z,
    sportsSites.athletics.width,
    0.14,
    sportsSites.athletics.depth,
    "road",
  );
  // 400m eight-lane oval, oriented north/south with a full 105 x 68m football pitch.
  function oval(radius: number, y: number) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI;
      pts.push(
        new THREE.Vector3(
          athletics.x + Math.cos(a) * radius,
          y,
          athletics.z + athletics.straight / 2 + Math.sin(a) * radius,
        ),
      );
    }
    for (let i = 0; i <= 48; i++) {
      const a = Math.PI + (i / 48) * Math.PI;
      pts.push(
        new THREE.Vector3(
          athletics.x + Math.cos(a) * radius,
          y,
          athletics.z - athletics.straight / 2 + Math.sin(a) * radius,
        ),
      );
    }
    return pts;
  }
  function flatShape(points: THREE.Vector3[], tone: Tone) {
    const shape = new THREE.Shape(
        points.map((p) => new THREE.Vector2(p.x, -p.z)),
      ),
      g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    geometries.push(g);
    const mesh = new THREE.Mesh(g, materials.get(tone)!);
    mesh.position.y = points[0].y + flatElevation;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  flatShape(oval(trackOuterRadius, 0.18), "track");
  flatShape(oval(athletics.innerRadius, 0.195), "pitch");
  for (let lane = 0; lane <= 8; lane++)
    line(
      oval(athletics.innerRadius + lane * athletics.laneWidth, 0.22),
      campusColors.white,
      true,
    );
  const fx = athletics.x,
    fz = athletics.z,
    fw = 68 / 4,
    fd = 105 / 4;
  for (let stripe = 0; stripe < 10; stripe++)
    box(
      fx,
      0.205,
      fz - fd / 2 + ((stripe + 0.5) * fd) / 10,
      fw,
      0.008,
      fd / 10,
      stripe % 2 ? "pitch" : "leafLight",
    );
  const pitchRect = (x: number, z: number, w: number, d: number) =>
    line(
      [
        [x - w / 2, 0.23, z - d / 2],
        [x + w / 2, 0.23, z - d / 2],
        [x + w / 2, 0.23, z + d / 2],
        [x - w / 2, 0.23, z + d / 2],
      ].map((p) => new THREE.Vector3(...(p as [number, number, number]))),
      campusColors.white,
      true,
    );
  pitchRect(fx, fz, fw, fd);
  line(
    [
      new THREE.Vector3(fx - fw / 2, 0.23, fz),
      new THREE.Vector3(fx + fw / 2, 0.23, fz),
    ],
    campusColors.white,
  );
  line(
    Array.from(
      { length: 48 },
      (_, i) =>
        new THREE.Vector3(
          fx + Math.cos((i / 48) * Math.PI * 2) * 2.2875,
          0.23,
          fz + Math.sin((i / 48) * Math.PI * 2) * 2.2875,
        ),
    ),
    campusColors.white,
    true,
  );
  for (const side of [-1, 1]) {
    pitchRect(fx, fz + side * (fd / 2 - 2.0625), 10.08, 4.125);
    box(fx, 0.9, fz + (side * fd) / 2, 1.83, 0.1, 0.12, "white");
    for (const xx of [-0.915, 0.915])
      box(fx + xx, 0.53, fz + (side * fd) / 2, 0.1, 1.05, 0.1, "white");
  }
  line(
    [
      new THREE.Vector3(fx + athletics.innerRadius, 0.24, fz + 5),
      new THREE.Vector3(fx + trackOuterRadius, 0.24, fz + 5),
    ],
    campusColors.white,
  );
  // Compact bleachers outside the track clear space.
  for (let n = 0; n < 3; n++)
    box(
      -82 + n * 0.55,
      0.25 + n * 0.24,
      12,
      0.6,
      0.35,
      20,
      n % 2 ? "accent" : "wall",
    );
  sign("400 m", -68, 0.5, 35, 5);
  // Two full outdoor basketball courts, parallel to the track.
  flatElevation = sportsSites.courts.elevation;
  box(
    sportsSites.courts.x,
    0.07,
    sportsSites.courts.z,
    sportsSites.courts.width,
    0.14,
    sportsSites.courts.depth,
    "road",
  );
  for (const cx of [-70, -56]) {
    box(cx, 0.17, 48, 12, 0.12, 17, "pitch");
    pitchRect(cx, 48, 10.5, 16);
    line(
      [
        new THREE.Vector3(cx - 5.25, 0.26, 48),
        new THREE.Vector3(cx + 5.25, 0.26, 48),
      ],
      campusColors.white,
    );
    for (const z of [41, 55]) {
      box(cx, 1.1, z, 0.15, 2.2, 0.15, "roof");
      box(cx, 2.1, z, 1.6, 0.85, 0.1, "white");
      box(cx, 1.9, z + (z < 48 ? 0.45 : -0.45), 0.7, 0.06, 0.55, "track");
    }
  }
  flatElevation = 0;
  const water = createCampusLake();
  root.add(water.mesh);
  // Ring path and lakeside furniture; path geometry follows the lake footprint.
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2,
      [x, z] = lakePoint(a, 1.5);
    box(x, 0.2, z, 1.8, 0.12, 1.8, "road", -a);
    if (i % 12 === 0) {
      bench(x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8, a);
      tree(x + Math.cos(a) * 3.2, z + Math.sin(a) * 3.2, 0.85);
    }
  }
  // A shore-to-shore bridge; its ends touch the shared ring path and piers reach the bed.
  const bridgeDx = bridge.to[0] - bridge.from[0],
    bridgeDz = bridge.to[1] - bridge.from[1],
    bridgeLength = Math.hypot(bridgeDx, bridgeDz),
    bridgeAngle = Math.atan2(-bridgeDz, bridgeDx);
  const by0 = terrainHeight(...bridge.from) + 0.3,
    by1 = terrainHeight(...bridge.to) + 0.3;
  const steps = Math.ceil(bridgeLength / 0.8);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      x = bridge.from[0] + bridgeDx * t,
      z = bridge.from[1] + bridgeDz * t,
      y = by0 * (1 - t) + by1 * t + Math.sin(t * Math.PI) * 0.65;
    box(x, y, z, bridgeLength / steps + 0.06, 0.24, 2.3, "shade", bridgeAngle);
    for (const side of [-1, 1]) {
      const xx = x - (bridgeDz / bridgeLength) * side,
        zz = z + (bridgeDx / bridgeLength) * side;
      box(xx, y + 0.5, zz, 0.14, 0.9, 0.14, "roof");
      box(
        xx,
        y + 0.9,
        zz,
        bridgeLength / steps + 0.07,
        0.12,
        0.12,
        "roof",
        bridgeAngle,
      );
    }
    if (i % 4 === 0) {
      const bed = -0.3;
      box(x, (y + bed) / 2, z, 0.55, y - bed, 0.7, "rock");
    }
  }
  // East lakeside reading pavilion.
  box(19, 0.25, 18, 7, 0.3, 6, "road");
  for (const dx of [-2.7, 2.7])
    for (const dz of [-2, 2])
      box(19 + dx, 1.7, 18 + dz, 0.35, 2.6, 0.35, "wall");
  box(19, 3.15, 18, 7, 0.3, 6, "brand");
  box(19, 3.4, 18, 5.8, 0.2, 5, "accent");
  bench(19, 19);
  // Monumental south gate: three openings and a clear middle vista.
  for (const x of [-17, -12, 0, 5]) {
    box(x, 2.5, 63, 1.5, 5, 2, "wall", 0, true);
    box(x, 0.25, 63, 2.1, 0.5, 2.5, "shade", 0, true);
  }
  box(-6, 5.3, 63, 25, 0.65, 2.6, "wall", 0, true);
  box(-6, 5.8, 63, 26, 0.28, 3, "brand", 0, true);
  sign("知 行 校 园", -6, 5.3, 64.34, 11, 0, true);
  for (let i = -2; i <= 2; i++)
    box(-6, 0.09, 58 + i * 1.2, 24, 0.08, 0.22, "shade");
  // Enclosure follows the two connected round groups, with openings only at the two gates.
  const perimeter = roads.find((r) => r.id === "outer")!.points;
  for (let i = 1; i < perimeter.length; i++) {
    const a = perimeter[i - 1],
      b = perimeter[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      steps = Math.ceil(length / 2.8),
      angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const dx = (b[0] - a[0]) / length,
      dz = (b[1] - a[1]) / length;
    for (let n = 0; n < steps; n++) {
      const t = (n + 0.5) / steps,
        x = a[0] + (b[0] - a[0]) * t + dz * 3.5,
        z = a[1] + (b[1] - a[1]) * t - dx * 3.5;
      if ((Math.abs(x + 6) < 15 && z > 58) || (Math.abs(z - 32) < 7 && x > 82))
        continue;
      if (!insideIsland(x - 0.5, z - 0.5) || !insideIsland(x + 0.5, z + 0.5))
        continue;
      const ground = surfaceHeight(x, z),
        top = Math.max(ground, terrainHeight(x, z)) + 1.25;
      box(x, (ground + top) / 2, z, 0.3, top - ground + 0.06, 0.3, "shade");
      const half = (length / steps - 0.2) / 2;
      const p0 = new THREE.Vector3(
        x - dx * half,
        Math.max(
          surfaceHeight(x - dx * half, z - dz * half),
          terrainHeight(x - dx * half, z - dz * half),
        ) + 1.05,
        z - dz * half,
      );
      const p1 = new THREE.Vector3(
        x + dx * half,
        Math.max(
          surfaceHeight(x + dx * half, z + dz * half),
          terrainHeight(x + dx * half, z + dz * half),
        ) + 1.05,
        z + dz * half,
      );
      line([p0, p1], campusColors.roof);
      line(
        [
          p0.clone().add(new THREE.Vector3(0, -0.4, 0)),
          p1.clone().add(new THREE.Vector3(0, -0.4, 0)),
        ],
        campusColors.roof,
      );
    }
  }
  for (const g of gates) {
    const x = g.id === "main-gate" ? 9 : 83,
      z = g.id === "main-gate" ? 61 : 25;
    box(x, 1.1, z, 3.4, 2.2, 3, "wall", 0, true);
    box(x, 2.35, z, 3.8, 0.25, 3.4, "brand", 0, true);
    box(x, 1.35, z + 1.52, 2, 0.7, 0.05, "glass", 0, true);
  }
  box(87, 3.2, 32, 2, 0.35, 11, "accent", 0, true);
  for (const z of [27, 37]) box(87, 1.6, z, 0.6, 3.2, 0.6, "wall", 0, true);
  for (const z of [28.7, 30, 31.3]) {
    box(87, 0.55, z, 1.3, 1.1, 0.24, "roof", 0, true);
    box(87, 1.25, z, 0.5, 0.35, 0.15, "glass", 0, true);
  }
  box(86, 1, 35, 0.18, 0.12, 3.5, "red", 0, true);
  // A single garage portal in a sunken retaining box; all parking stays underground.
  const gy = 0.25;
  box(garage.x, -0.35, garage.z, garage.width, 0.15, garage.depth, "roof");
  for (const side of [-1, 1])
    box(garage.x + side * 3.2, 0.45, garage.z, 0.4, 1.5, garage.depth, "shade");
  box(garage.x, 1.7, garage.z - 6, 7, 0.5, 1.4, "wall");
  box(garage.x, 0.62, garage.z - 6, 6, 1.65, 0.2, "ink");
  sign("P  地下车库", garage.x, 1.65, garage.z - 5.25, 5);
  for (let i = 0; i < 14; i++) {
    const z = garage.z + 6.5 - i;
    box(garage.x, gy - i * 0.055, z, 5.8, 0.12, 1, "road");
    if (i % 2 === 0)
      box(garage.x, gy + 0.08 - i * 0.055, z, 0.12, 0.035, 0.6, "yellow");
  }
  // School gate food street: eight small shops and a pedestrian frontage.
  for (const [i, s] of shops.entries()) {
    flatElevation = buildingElevation(s);
    box(s.x, -0.12, s.z, s.width + 0.2, 0.24, s.depth + 0.2, "shade");
    box(s.x, 1.25, s.z, s.width, 2.5, s.depth, "wall");
    box(
      s.x,
      2.7,
      s.z,
      s.width + 0.5,
      0.35,
      s.depth + 0.4,
      i % 2 ? "accent" : "roof",
    );
    box(s.x - 3.04, 1.2, s.z, 0.06, 1.9, 3.3, "glass");
    box(s.x - 3.65, 2.05, s.z, 1.4, 0.18, 4, "warm");
    sign(s.name, s.x - 3.08, 2.35, s.z, 3.3, -Math.PI / 2);
    if (i % 2 === 0) {
      box(93.9, 0.8, s.z, 1.2, 0.14, 1.2, "wood");
      box(93.9, 0.4, s.z, 0.18, 0.8, 0.18, "roof");
    }
  }
  flatElevation = 0;

  // Bicycle shelters at dorm exits, dining and the teaching courts; no car parks.
  for (const [x, z] of [
    [-36, -39],
    [-2, -39],
    [61, -25],
    [90, -24],
    [49, 20],
    [-36, 13],
    [9, 13],
  ]) {
    const y = terrainHeight(x, z);
    box(x, y + 1.9, z, 5, 0.18, 2.5, "accent");
    for (const dx of [-2, 2]) box(x + dx, y + 0.9, z, 0.14, 1.8, 0.14, "roof");
    for (let n = 0; n < 5; n++) {
      box(x - 1.7 + n * 0.85, y + 0.4, z, 0.1, 0.6, 1.1, "roof");
      box(x - 1.7 + n * 0.85, y + 0.65, z - 0.3, 0.5, 0.1, 0.1, "brand");
    }
  }
  for (const s of safetySites) {
    const y = Math.max(s.y, terrainHeight(s.x, s.z));
    if (s.kind === "fire") {
      box(s.x, y + 0.5, s.z, 0.5, 1, 0.5, "red", 0, true);
      box(s.x, y + 0.7, s.z, 1, 0.18, 0.25, "red", 0, true);
    } else if (s.kind === "aed") {
      box(s.x, y + 0.8, s.z, 0.6, 1.6, 0.3, "medical", 0, true);
      box(s.x, y + 1.1, s.z + 0.18, 0.45, 0.15, 0.035, "white", 0, true);
      box(s.x, y + 1.1, s.z + 0.2, 0.15, 0.45, 0.035, "white", 0, true);
    } else if (s.id === "lake-rescue") {
      box(s.x, y + 0.9, s.z, 0.18, 1.8, 0.18, "roof", 0, true);
      for (const [dx, dy] of [
        [-0.35, 0],
        [0.35, 0],
        [0, 0.35],
        [0, -0.35],
      ])
        box(s.x + dx, y + 1.1 + dy, s.z + 0.2, 0.23, 0.23, 0.2, "red", 0, true);
    } else {
      box(
        s.x,
        y + 1,
        s.z,
        0.4,
        2,
        0.4,
        s.kind === "shelter" ? "medical" : "accent",
        0,
        true,
      );
      box(s.x, y + 1.6, s.z + 0.22, 0.8, 0.6, 0.06, "white", 0, true);
    }
  }
  // Deterministic planting: retain every facility footprint and all access paths.
  for (let x = -80; x < 89; x += 5)
    for (let z = -74; z < 58; z += 5) {
      const xx = x + Math.sin(x * 2 + z) * 0.6,
        zz = z + Math.cos(z * 2 - x) * 0.6;
      if (
        !insideIsland(xx, zz) ||
        lakeContains(xx, zz, 5) ||
        roadAt(xx, zz) ||
        buildings.some((b) => inFootprint(xx, zz, b, 2.8)) ||
        inFootprint(xx, zz, { ...courts, width: 31, depth: 22 }) ||
        inFootprint(xx, zz, {
          x: athletics.x,
          z: athletics.z,
          width: 31,
          depth: 49,
        }) ||
        inFootprint(xx, zz, { ...garage, width: 10, depth: 19 })
      )
        continue;
      if (z < -64 || Math.round(x + z) % 3 === 0)
        tree(xx, zz, z < -64 ? 1.2 : 0.85);
    }
  for (const road of roads)
    for (const p of road.points) {
      const x = p[0] + 2,
        z = p[1],
        y = terrainHeight(x, z);
      if (!insideIsland(x, z)) continue;
      box(x, y + 1.25, z, 0.12, 2.5, 0.12, "roof");
      box(x, y + 2.55, z, 0.65, 0.16, 0.45, "warm");
    }
  for (const [color, vertices] of strokes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometries.push(geometry);
    const material = new THREE.LineBasicMaterial({ color });
    labelMaterials.push(material);
    root.add(new THREE.LineSegments(geometry, material));
  }
  for (const [tone, list] of matrices) {
    const mesh = new THREE.InstancedMesh(
      cube,
      materials.get(tone),
      list.length,
    );
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = `campus-${tone}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.userData.buildingCount = buildings.length;
  root.userData.studentCourts = 4;
  root.userData.studentWings = dormWings.length;
  return {
    root,
    update(elapsed: number, reduced: boolean) {
      water.update(elapsed, reduced);
    },
    dispose() {
      cube.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      labelMaterials.forEach((m) => m.dispose());
      water.dispose();
    },
  };
}
