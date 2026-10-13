import * as THREE from "three";
import { safetySites } from "./safety-sites";
export function createSafetyFixtures() {
  const root = new THREE.Group();
  root.name = "community-safety-fixtures";
  const cube = new THREE.BoxGeometry(1, 1, 1),
    geometries = [cube];
  const green = new THREE.MeshStandardMaterial({
      color: "#397d67",
      roughness: 0.7,
    }),
    red = new THREE.MeshStandardMaterial({ color: "#b75342", roughness: 0.7 }),
    white = new THREE.MeshStandardMaterial({
      color: "#fff8e8",
      roughness: 0.8,
    }),
    dark = new THREE.MeshStandardMaterial({ color: "#42605a", roughness: 0.8 });
  for (const mat of [green, red, white, dark])
    mat.userData.focusMaterial = true;
  function block(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  for (const site of safetySites) {
    const group = new THREE.Group();
    group.name = `safety:${site.id}`;
    group.position.set(site.x, site.y, site.z);
    root.add(group);
    block(group, 0, 0.7, 0, 0.16, 1.4, 0.16, dark);
    if (site.kind === "shelter") {
      block(group, 0, 1.65, 0, 1.4, 0.95, 0.14, green);
      for (const side of [-1, 1]) {
        block(group, side * 0.4, 1.62, 0.09, 0.35, 0.1, 0.04, white);
        block(group, side * 0.24, 1.75, 0.09, 0.1, 0.28, 0.04, white);
      }
      block(group, 0, 1.45, 0.09, 0.22, 0.25, 0.04, white);
    } else {
      block(
        group,
        0,
        1.3,
        0,
        0.8,
        0.85,
        0.34,
        site.kind === "fire" ? red : green,
      );
      if (site.kind === "aed") {
        block(group, 0, 1.32, 0.19, 0.46, 0.1, 0.04, white);
        block(group, 0, 1.32, 0.19, 0.1, 0.46, 0.04, white);
      } else if (site.kind === "help") {
        block(group, 0, 1.5, 0.19, 0.13, 0.28, 0.04, white);
        block(group, 0, 1.2, 0.2, 0.16, 0.16, 0.04, white);
      } else block(group, 0, 1.25, 0.19, 0.23, 0.45, 0.04, white);
    }
  }
  return { root, geometries };
}
