import * as THREE from "three";

type Rect = [number, number, number, number];
type Face = {
  owner: number;
  axis: number;
  side: number;
  plane: number;
  rect: Rect;
  parts: Rect[];
};
const EPS = 1e-5;
function overlap(a: Rect, b: Rect) {
  return (
    Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > EPS &&
    Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > EPS
  );
}
function subtract(a: Rect, b: Rect): Rect[] {
  if (!overlap(a, b)) return [a];
  const x0 = Math.max(a[0], b[0]),
    y0 = Math.max(a[1], b[1]),
    x1 = Math.min(a[2], b[2]),
    y1 = Math.min(a[3], b[3]);
  return [
    [a[0], a[1], x0, a[3]],
    [x1, a[1], a[2], a[3]],
    [x0, a[1], x1, y0],
    [x0, y1, x1, a[3]],
  ].filter((r) => r[2] - r[0] > EPS && r[3] - r[1] > EPS) as Rect[];
}
/** Resolve coplanar coverage geometrically; retain instancing for untouched boxes. */
export function createCommunityBatches<T extends string>(
  matrices: Map<T, THREE.Matrix4[]>,
  materials: Map<T, THREE.MeshStandardMaterial>,
  cube: THREE.BoxGeometry,
) {
  const boxes: {
    tone: T;
    matrix: THREE.Matrix4;
    faces: Face[];
    changed: boolean;
  }[] = [];
  const planes = new Map<string, Map<string, Face[]>>();
  let trimmed = 0;
  for (const [tone, list] of matrices)
    for (const matrix of list) {
      const owner = boxes.length,
        box = { tone, matrix, faces: [] as Face[], changed: false };
      boxes.push(box);
      const e = matrix.elements;
      if (
        materials.get(tone)!.transparent ||
        Math.abs(e[2]) + Math.abs(e[8]) > EPS
      )
        continue;
      const pos = [e[12], e[13], e[14]],
        size = [e[0], e[5], e[10]];
      for (let axis = 0; axis < 3; axis++)
        for (const side of [-1, 1]) {
          const plane = pos[axis] + (side * size[axis]) / 2,
            uv = [0, 1, 2].filter((a) => a !== axis);
          const rect: Rect = [
            pos[uv[0]] - size[uv[0]] / 2,
            pos[uv[1]] - size[uv[1]] / 2,
            pos[uv[0]] + size[uv[0]] / 2,
            pos[uv[1]] + size[uv[1]] / 2,
          ];
          const face: Face = { owner, axis, side, plane, rect, parts: [rect] };
          box.faces.push(face);
          const key = `${axis}:${side}:${Math.round(plane / 0.001)}`;
          let grid = planes.get(key);
          if (!grid) {
            grid = new Map();
            planes.set(key, grid);
          }
          const cells: string[] = [];
          for (
            let u = Math.floor(rect[0] / 8);
            u <= Math.floor((rect[2] - EPS) / 8);
            u++
          )
            for (
              let v = Math.floor(rect[1] / 8);
              v <= Math.floor((rect[3] - EPS) / 8);
              v++
            )
              cells.push(`${u},${v}`);
          const candidates = new Set(
            cells.flatMap((cell) => grid!.get(cell) ?? []),
          );
          for (const old of candidates)
            if (
              overlap(old.rect, rect) &&
              old.parts.some((r) => overlap(r, rect))
            ) {
              old.parts = old.parts.flatMap((r) => subtract(r, rect));
              boxes[old.owner].changed = true;
              trimmed++;
            }
          for (const cell of cells) {
            const bucket = grid.get(cell) ?? [];
            bucket.push(face);
            grid.set(cell, bucket);
          }
        }
    }
  const meshes: THREE.Mesh[] = [],
    geometries: THREE.BufferGeometry[] = [];
  const vertices = new Map<T, { positions: number[]; normals: number[] }>(),
    intact = new Map<T, THREE.Matrix4[]>();
  for (const box of boxes) {
    const material = materials.get(box.tone)!;
    if (material.transparent) {
      // Separate transparent objects allow Three.js to sort panes by camera distance.
      const mesh = new THREE.Mesh(cube, material);
      mesh.applyMatrix4(box.matrix);
      mesh.name = `community-${box.tone}`;
      meshes.push(mesh);
      continue;
    }
    if (!box.changed) {
      const list = intact.get(box.tone) ?? [];
      list.push(box.matrix);
      intact.set(box.tone, list);
      continue;
    }
    const data = vertices.get(box.tone) ?? { positions: [], normals: [] };
    vertices.set(box.tone, data);
    for (const face of box.faces)
      for (const r of face.parts) {
        const uv = [0, 1, 2].filter((a) => a !== face.axis);
        const corners = [
          [r[0], r[1]],
          [r[2], r[1]],
          [r[2], r[3]],
          [r[0], r[3]],
        ].map(([u, v]) => {
          const p = [0, 0, 0];
          p[face.axis] = face.plane;
          p[uv[0]] = u;
          p[uv[1]] = v;
          return p;
        });
        const winding =
          (face.axis === 1 ? -1 : 1) * face.side > 0
            ? [0, 1, 2, 0, 2, 3]
            : [0, 2, 1, 0, 3, 2];
        for (const index of winding) {
          data.positions.push(...corners[index]);
          const n = [0, 0, 0];
          n[face.axis] = face.side;
          data.normals.push(...n);
        }
      }
  }
  for (const [tone, list] of intact) {
    const mesh = new THREE.InstancedMesh(
      cube,
      materials.get(tone),
      list.length,
    );
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = `community-${tone}`;
    meshes.push(mesh);
  }
  for (const [tone, data] of vertices) {
    if (!data.positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(data.normals, 3),
    );
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials.get(tone));
    mesh.name = `community-${tone}-surface`;
    meshes.push(mesh);
  }
  for (const mesh of meshes) {
    mesh.castShadow = !(mesh.material as THREE.Material).transparent;
    mesh.receiveShadow = !(mesh.material as THREE.Material).transparent;
  }
  return { meshes, geometries, trimmed };
}
