import * as THREE from "three";
import { water } from "./layout";
import type { CommunityPalette } from "./palette";

/** Faceted stone basin with continuous arc jets, moving droplets and expanding ripples. */
export function createCommunityFountain(palette: CommunityPalette) {
  const root = new THREE.Group();
  root.name = "community-fountain";
  root.position.set(water.x, 0, water.z);
  const geometries: THREE.BufferGeometry[] = [];
  const stone = new THREE.MeshStandardMaterial({
    color: palette.surface,
    roughness: 0.84,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: palette.accent,
    roughness: 0.7,
  });
  const pool = new THREE.MeshStandardMaterial({
    color: "#78afaf",
    roughness: 0.24,
    metalness: 0.12,
  });
  const jet = new THREE.MeshStandardMaterial({
    color: "#b8e4e1",
    roughness: 0.2,
    emissive: "#6eb6b6",
    emissiveIntensity: 0.14,
  });
  const sparkle = new THREE.MeshStandardMaterial({
    color: "#eefdfa",
    roughness: 0.18,
    emissive: "#b7e6df",
    emissiveIntensity: 0.24,
  });
  const clock = { value: 0 };
  pool.onBeforeCompile = (shader) => {
    shader.uniforms.uFountainTime = clock;
    shader.vertexShader =
      "varying vec3 fountainPosition;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfountainPosition=position;",
      );
    shader.fragmentShader =
      "uniform float uFountainTime; varying vec3 fountainPosition;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat wave=sin(length(fountainPosition.xz)*9.0-uFountainTime*4.0); diffuseColor.rgb*=1.0+wave*0.07;",
      );
  };
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    y: number,
    sx = 1,
    sz = sx,
  ) {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.y = y;
    m.scale.set(sx, 1, sz);
    m.castShadow = material === stone || material === trim;
    m.receiveShadow = true;
    root.add(m);
    return m;
  }
  mesh(new THREE.CylinderGeometry(1, 1, 0.22, 8), trim, 0.11, 2.45, 4.35);
  mesh(new THREE.CylinderGeometry(1, 1, 0.24, 8), stone, 0.34, 2.32, 4.1);
  mesh(new THREE.CylinderGeometry(1, 1, 0.07, 8), pool, 0.495, 2.03, 3.77);
  mesh(new THREE.CylinderGeometry(0.36, 0.55, 1.45, 8), stone, 1.2);
  mesh(new THREE.CylinderGeometry(0.85, 0.46, 0.28, 8), trim, 1.86);
  mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 8), pool, 2.045);
  mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.4, 8), trim, 2.26);
  const curves: THREE.QuadraticBezierCurve3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(a) * 0.1, 2.46, Math.sin(a) * 0.1),
      new THREE.Vector3(Math.cos(a) * 1.05, 5.05, Math.sin(a) * 1.8),
      new THREE.Vector3(Math.cos(a) * 1.65, 0.54, Math.sin(a) * 3.04),
    );
    curves.push(curve);
    const geometry = new THREE.TubeGeometry(curve, 20, 0.045, 4, false);
    geometries.push(geometry);
    const stream = new THREE.Mesh(geometry, jet);
    stream.name = "fountain-jet";
    root.add(stream);
  }
  const dropGeo = new THREE.BoxGeometry(0.095, 0.14, 0.095);
  geometries.push(dropGeo);
  const drops = new THREE.InstancedMesh(dropGeo, sparkle, curves.length * 7);
  drops.name = "fountain-moving-droplets";
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.frustumCulled = false;
  root.add(drops);
  const dummy = new THREE.Object3D();
  const ripples: { mesh: THREE.Mesh; phase: number }[] = [];
  const ringGeo = new THREE.RingGeometry(0.78, 1, 16);
  ringGeo.rotateX(-Math.PI / 2);
  geometries.push(ringGeo);
  curves.forEach((curve, i) => {
    for (let r = 0; r < 2; r++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: "#d4f2e9",
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      );
      m.position.copy(curve.getPoint(1));
      m.position.y = 0.55 + r * 0.015;
      root.add(m);
      ripples.push({ mesh: m, phase: i * 0.113 + r * 0.5 });
    }
  });
  function update(time: number, reduced = false) {
    const t = reduced ? 0 : time;
    clock.value = t;
    curves.forEach((curve, i) => {
      for (let k = 0; k < 7; k++) {
        const phase = (t * 0.58 + k / 7 + i * 0.031) % 1;
        dummy.position.copy(curve.getPoint(phase));
        dummy.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          curve.getTangent(phase),
        );
        dummy.updateMatrix();
        drops.setMatrixAt(i * 7 + k, dummy.matrix);
      }
    });
    drops.instanceMatrix.needsUpdate = true;
    for (const ripple of ripples) {
      const phase = (t * 0.72 + ripple.phase) % 1;
      const size = 0.06 + phase * 0.38;
      ripple.mesh.scale.set(size, 1, size);
      (ripple.mesh.material as THREE.MeshBasicMaterial).opacity =
        (1 - phase) * 0.52;
    }
  }
  update(0);
  return { root, geometries, update };
}
