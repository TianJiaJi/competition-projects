import * as THREE from 'three';
import type { PublicSnapshot, VisitorFlowPoint } from '@scene/contracts';
import { regions } from './data';
import { regionPressure, pressureBands, pressureUnknownColor } from './pressure';

export const HEAT_SIZE = 128;
export const HEAT_REFRESH_MS = 150;
const EXTENT = 72;
// These are island coordinates, not metres. Overlapping kernels form a field,
// rather than isolated dots or the old nine region-sized disks.
const WALK_SIGMA = 2.6;
const STOP_SIGMA = 3.2;
const DENSITY_SCALE = 1.8;
export type HeatPosition = Pick<VisitorFlowPoint, 'people' | 'phase' | 'speedMps'> & { x: number; z: number };

export function interpolateVisitor(point: VisitorFlowPoint, elapsed: number): HeatPosition {
  const result = { x: point.x, z: point.z, people: point.people, phase: point.phase, speedMps: point.speedMps };
  const track = point.trajectory;
  if (!track?.length) return result;
  const seconds = THREE.MathUtils.clamp(elapsed, 0, track.at(-1)!.seconds);
  const next = track.findIndex(sample => sample.seconds >= seconds);
  if (next === 0) return { ...result, x: track[0].x, z: track[0].z };
  if (next < 0) return { ...result, x: track.at(-1)!.x, z: track.at(-1)!.z };
  const a = track[next - 1], b = track[next];
  const fraction = THREE.MathUtils.clamp((seconds - a.seconds) / Math.max(1e-6, b.seconds - a.seconds), 0, 1);
  return { ...result, x: THREE.MathUtils.lerp(a.x, b.x, fraction), z: THREE.MathUtils.lerp(a.z, b.z, fraction) };
}

export function visitorPositions(snapshot: PublicSnapshot, elapsed: number): HeatPosition[] {
  return (snapshot.visitorFlow ?? []).map(point => interpolateVisitor(point, elapsed));
}

/** Absolute people density: doubling people increases heat; splitting a group does not. */
export function rasterizeHeat(positions: HeatPosition[], size = HEAT_SIZE) {
  const values = new Float32Array(size * size), cell = EXTENT / size;
  const layers = [new Float32Array(values.length), new Float32Array(values.length)];
  const active = [false, false];
  for (const point of positions) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(point.people) || point.people <= 0) continue;
    if (point.x < -36 || point.x > 36 || point.z < -36 || point.z > 36) continue;
    const layer = point.speedMps < .35 || point.phase === 'arriving' ? 1 : 0;
    active[layer] = true;
    const x = THREE.MathUtils.clamp((point.x + 36) / cell - .5, 0, size - 1);
    const z = THREE.MathUtils.clamp((point.z + 36) / cell - .5, 0, size - 1);
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
      const weight = (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
      if (weight) layers[layer][(iz + dz) * size + ix + dx] += point.people * weight / (cell * cell);
    }
  }
  // Two separable convolutions cost O(grid size), independent of crowd count.
  for (let layer = 0; layer < layers.length; layer++) {
    if (!active[layer]) continue;
    const sigma = (layer ? STOP_SIGMA : WALK_SIGMA) / cell, radius = Math.ceil(sigma * 3);
    const kernel = new Float32Array(radius * 2 + 1);
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const weight = Math.exp(-i * i / (2 * sigma * sigma)) * (1 - THREE.MathUtils.smoothstep(Math.abs(i), sigma * 2, radius));
      kernel[i + radius] = weight; sum += weight;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
    const horizontal = new Float32Array(values.length);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      let value = 0;
      for (let d = Math.max(-radius, -x); d <= Math.min(radius, size - 1 - x); d++) value += layers[layer][z * size + x + d] * kernel[d + radius];
      horizontal[z * size + x] = value;
    }
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      let value = 0;
      for (let d = Math.max(-radius, -z); d <= Math.min(radius, size - 1 - z); d++) value += horizontal[(z + d) * size + x] * kernel[d + radius];
      values[z * size + x] += value;
    }
  }
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return { values, maximum };
}

// A continuous cold-to-warm ramp, capped by the region's reference pressure.
const unknown = new THREE.Color(pressureUnknownColor);
const colors = pressureBands.map(band => new THREE.Color(band.color));
const rampStops = [0, .3, .5, .7, .9, 1];
const palette = new Uint8Array(1024 * 3);
for (let i = 0; i < 1024; i++) {
  const value = i / 1023;
  let band = 0;
  while (band < rampStops.length - 2 && value > rampStops[band + 1]) band++;
  const mix = THREE.MathUtils.smoothstep(value, rampStops[band], rampStops[band + 1]);
  const color = colors[band].clone().lerpHSL(colors[band + 1], mix);
  palette.set([color.r, color.g, color.b].map(value => Math.round(value * 255)), i * 3);
}
const geometryCache = new Map<number, ReturnType<typeof buildGeometry>>();
function buildGeometry(size: number) {
  const closures = new Float32Array(size * size * regions.length);
  const nearest = new Uint8Array(size * size), neighbour = new Uint8Array(size * size);
  const interior = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + .5) / size * EXTENT - 36, z = (j + .5) / size * EXTENT - 36, cell = j * size + i;
    let distance = Infinity, second = Infinity;
    regions.forEach((region, r) => {
      const d = Math.hypot(x - region.x, z - region.z) / region.radius;
      if (d < distance) { second = distance; neighbour[cell] = nearest[cell]; distance = d; nearest[cell] = r; }
      else if (d < second) { second = d; neighbour[cell] = r; }
      closures[cell * regions.length + r] = 1 - THREE.MathUtils.smoothstep(d, .62, .83);
    });
    interior[cell] = THREE.MathUtils.smoothstep(second - distance, 0, .35);
  }
  return { closures, nearest, neighbour, interior };
}
function geometry(size: number) {
  let cached = geometryCache.get(size);
  if (!cached) { cached = buildGeometry(size); geometryCache.set(size, cached); }
  return cached;
}

/** Visitor positions own the footprint; regional pressure only colors occupied flow. */
export function heatPixels(snapshot: PublicSnapshot, positions = visitorPositions(snapshot, 0), size = HEAT_SIZE, pixels = new Uint8Array(size * size * 4)) {
  const raster = rasterizeHeat(snapshot.visitors === 0 ? [] : positions, size);
  const spatial = geometry(size), pressures = regions.map(region => regionPressure(snapshot, region.id));
  for (let cell = 0; cell < size * size; cell++) {
    const pressure = pressures[spatial.nearest[cell]], adjacent = pressures[spatial.neighbour[cell]];
    const k = cell * 4;
    // No visitor support means a transparent overlay: the scene's shared
    // context-muting treatment supplies the same base as toilet/safety views.
    if (raster.values[cell] <= 0) {
      pixels[k] = pixels[k + 1] = pixels[k + 2] = pixels[k + 3] = 0;
      continue;
    }
    if (pressure.band < 0) {
      pixels[k] = Math.round(unknown.r * 255); pixels[k + 1] = Math.round(unknown.g * 255); pixels[k + 2] = Math.round(unknown.b * 255);
    } else {
      const cap = rampStops[pressure.band], neighbourCap = adjacent.band < 0 ? cap : rampStops[adjacent.band];
      const interior = spatial.interior[cell];
      // Smooth the pressure ceiling across region boundaries. Red regions fade
      // back to orange at the edge, so red never leaks into a neighbour below 90%.
      const blended = THREE.MathUtils.lerp(Math.min(cap, neighbourCap), cap, interior);
      const ceiling = pressure.band === 5 ? (adjacent.band === 5 ? 1 : .9 + .1 * interior) : .9;
      const density = THREE.MathUtils.clamp((1 - Math.exp(-raster.values[cell] / DENSITY_SCALE)) / .8, 0, 1);
      const value = density * Math.min(blended, ceiling);
      const p = Math.min(1023, Math.floor(value * 1023)) * 3;
      const brightness = .9 + .1 * density;
      pixels[k] = Math.round(palette[p] * brightness); pixels[k + 1] = Math.round(palette[p + 1] * brightness); pixels[k + 2] = Math.round(palette[p + 2] * brightness);
    }
    pixels[k + 3] = 255;
  }
  return pixels;
}

export function createHeatProjection(worldToIsland = new THREE.Matrix4()) {
  const size = HEAT_SIZE, pixels = new Uint8Array(size * size * 4), masks = new Uint8Array(size * size * 4);
  const texture = new THREE.DataTexture(pixels, size, size), mask = new THREE.DataTexture(masks, size, size);
  for (const t of [texture, mask]) { t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; }
  // Nearest sampling prevents red filtering across a region boundary. The shader
  // restores bilinear smoothing only between texels belonging to the same region.
  texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
  const owners = new Uint8Array(size * size * 4);
  geometry(size).nearest.forEach((owner, cell) => { owners[cell * 4] = owner; owners[cell * 4 + 3] = 255; });
  const ownerTexture = new THREE.DataTexture(owners, size, size);
  ownerTexture.needsUpdate = true;
  const enabled = { value: 0 };
  let signature = '', maskSignature = '', lastUpload = -Infinity, quality = 0;
  function attach(material: THREE.MeshStandardMaterial) {
    material.userData.scenicHeatProjection = true;
    material.onBeforeCompile = shader => {
      shader.uniforms.uWorldToIsland = { value: worldToIsland }; shader.uniforms.uHeatMap = { value: texture }; shader.uniforms.uHeatOwners = { value: ownerTexture }; shader.uniforms.uClosedMap = { value: mask }; shader.uniforms.uHeat = enabled;
      shader.vertexShader = 'uniform mat4 uWorldToIsland; varying vec3 vScenicWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 scenicWorld=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          scenicWorld=instanceMatrix*scenicWorld;
        #endif
        vScenicWorld=(uWorldToIsland*modelMatrix*scenicWorld).xyz;`);
      shader.fragmentShader = 'uniform sampler2D uHeatOwners; uniform sampler2D uHeatMap; uniform sampler2D uClosedMap; uniform float uHeat; varying vec3 vScenicWorld;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 uvHeat=(vScenicWorld.xz+vec2(36.0))/72.0;
        vec4 heat=texture2D(uHeatMap,uvHeat);
        float owner=texture2D(uHeatOwners,uvHeat).r;
        vec2 grid=uvHeat*${size.toFixed(1)}-.5, origin=(floor(grid)+.5)/${size.toFixed(1)}, fraction=fract(grid);
        vec4 smoothed=vec4(0.0);
        for(int dy=0;dy<2;dy++) for(int dx=0;dx<2;dx++) {
          vec2 offset=vec2(float(dx),float(dy));
          vec2 sampleUv=origin+offset/${size.toFixed(1)};
          vec2 weight=mix(vec2(1.0)-fraction,fraction,offset);
          vec4 sampleHeat=abs(texture2D(uHeatOwners,sampleUv).r-owner)<.001?texture2D(uHeatMap,sampleUv):heat;
          smoothed+=sampleHeat*weight.x*weight.y;
        }
        heat=smoothed;
        diffuseColor.rgb=mix(diffuseColor.rgb,heat.rgb,uHeat*heat.a*.94);
        float shut=texture2D(uClosedMap,uvHeat).r;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.48,.46),shut*.95);`);
    };
    material.customProgramCacheKey = () => 'scenic-projected-pressure-v5';
    return material;
  }
  function update(snapshot: PublicSnapshot, heat: boolean, positions: HeatPosition[] | (() => HeatPosition[]) = () => visitorPositions(snapshot, 0), now = performance.now()) {
    const justEnabled = heat && !enabled.value;
    enabled.value = heat ? 1 : 0;
    const nextMask = JSON.stringify(regions.map(region => snapshot.regions[region.id]?.availability));
    if (nextMask !== maskSignature) {
      maskSignature = nextMask;
      const closedRegions = regions.flatMap((region, r) => ['closed', 'maintenance'].includes(snapshot.regions[region.id]?.availability) ? [r] : []);
      const spatial = geometry(size);
      masks.fill(0);
      for (let cell = 0; cell < size * size; cell++) {
        let closed = 0;
        for (const r of closedRegions) closed = Math.max(closed, spatial.closures[cell * regions.length + r]);
        masks[cell * 4] = Math.round(closed * 255); masks[cell * 4 + 3] = 255;
      }
      mask.needsUpdate = true;
    }
    if (!heat || (!justEnabled && now - lastUpload < HEAT_REFRESH_MS * (1 + quality))) return false;
    lastUpload = now;
    const resolvedPositions = typeof positions === 'function' ? positions() : positions;
    const next = JSON.stringify([snapshot.visitors, regions.map(region => [region.capacity, snapshot.regions[region.id]?.count, snapshot.regions[region.id]?.availability]), resolvedPositions]);
    if (next === signature) return false;
    signature = next;
    heatPixels(snapshot, resolvedPositions, size, pixels);
    texture.needsUpdate = true;
    return true;
  }
  return { attach, update, setQuality(level: number) { quality = Math.max(0, level); }, dispose() { texture.dispose(); mask.dispose(); ownerTexture.dispose(); } };
}
