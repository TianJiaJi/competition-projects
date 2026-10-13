import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createCommunityBatches } from "../../packages/model/src/community/batches";
import { createCommunityFountain } from "../../packages/model/src/community/fountain";
import { defaultPalette } from "../../packages/model/src/community/palette";
const transform = (x: number, w = 2) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(w, 2, 2),
  );
describe("社区表面深度冲突", () => {
  it("平台共面交叠区域只有一张可见面，未覆盖区域保留", () => {
    const cube = new THREE.BoxGeometry(1, 1, 1),
      a = new THREE.MeshStandardMaterial(),
      b = new THREE.MeshStandardMaterial();
    const batch = createCommunityBatches(
      new Map([
        ["ground", [transform(0, 4)]],
        ["platform", [transform(1, 2)]],
      ]),
      new Map([
        ["ground", a],
        ["platform", b],
      ]),
      cube,
    );
    const root = new THREE.Group();
    root.add(...batch.meshes);
    root.updateMatrixWorld(true);
    for (const [x, material] of [
      [-0.65, a],
      [0.35, b],
      [1.65, b],
    ] as const) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 5, 0.23),
        new THREE.Vector3(0, -1, 0),
      );
      const hits = ray.intersectObjects(root.children);
      expect(hits).toHaveLength(1);
      expect((hits[0].object as THREE.Mesh).material).toBe(material);
    }
    expect(batch.trimmed).toBeGreaterThan(0);
    cube.dispose();
    batch.geometries.forEach((g) => g.dispose());
    a.dispose();
    b.dispose();
  });
  it("独立体素继续实例化，玻璃逐片排序", () => {
    const cube = new THREE.BoxGeometry(1, 1, 1),
      solid = new THREE.MeshStandardMaterial(),
      glass = new THREE.MeshStandardMaterial({
        transparent: true,
        depthWrite: false,
      });
    const batch = createCommunityBatches(
      new Map([
        ["solid", [transform(0), transform(5)]],
        ["glass", [transform(10), transform(15)]],
      ]),
      new Map([
        ["solid", solid],
        ["glass", glass],
      ]),
      cube,
    );
    expect(
      batch.meshes.filter((m) => m instanceof THREE.InstancedMesh),
    ).toHaveLength(1);
    const panes = batch.meshes.filter((m) => m.material === glass);
    expect(panes).toHaveLength(2);
    expect(
      panes.every((m) => !(m instanceof THREE.InstancedMesh) && !m.castShadow),
    ).toBe(true);
    cube.dispose();
    solid.dispose();
    glass.dispose();
  });
});
it("喷泉有八道水柱，水滴随时间流动，减少动态效果时保持静止", () => {
  const fountain = createCommunityFountain(defaultPalette);
  expect(
    fountain.root.children.filter((m) => m.name === "fountain-jet"),
  ).toHaveLength(8);
  const drops = fountain.root.getObjectByName(
    "fountain-moving-droplets",
  ) as THREE.InstancedMesh;
  fountain.update(0);
  const before = Array.from(drops.instanceMatrix.array);
  fountain.update(0.5);
  expect(Array.from(drops.instanceMatrix.array)).not.toEqual(before);
  fountain.update(1, true);
  expect(Array.from(drops.instanceMatrix.array)).toEqual(before);
  fountain.update(2, true);
  expect(Array.from(drops.instanceMatrix.array)).toEqual(before);
  fountain.geometries.forEach((g) => g.dispose());
  const mats = new Set<THREE.Material>();
  fountain.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const material = o.material;
      for (const m of Array.isArray(material) ? material : [material])
        mats.add(m);
    }
  });
  mats.forEach((m) => m.dispose());
});
