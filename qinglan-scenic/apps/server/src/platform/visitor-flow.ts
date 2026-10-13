import {readFileSync} from 'node:fs';
import type {VisitorFlowPoint} from '../../../../packages/contracts/src/index.ts';
import {siteById} from '../../../../packages/scenic/src/places.ts';

const MINUTE = 60_000;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const data = JSON.parse(readFileSync(new URL('../../../../packages/scenic/generated/mobile.json', import.meta.url), 'utf8')) as {
  scaleMetres: number;
  points: {id: string; regionId: string; anchor: {x: number; z: number}}[];
  routes: {id: string; stops: string[]; path: {x: number; z: number}[]}[];
};
export const FLOW_VERSION = 4;
export const MAIN_STOPS = ['entry', 'creek', 'bamboo', 'gorge', 'summit', 'falls', 'lake', 'forest', 'market', 'gate-out'];
export const MAIN_MINUTES = [4, 24, 22, 22, 30, 25, 25, 22, 20, 6];
const speedClasses = [{factor: .85, weight: .25}, {factor: 1, weight: .5}, {factor: 1.2, weight: .25}];
const routeChoices = [{id: 'loop', weight: .85, minutes: 200}, {id: 'creek', weight: .05, minutes: 60}, {id: 'bamboo', weight: .05, minutes: 90}, {id: 'lake', weight: .05, minutes: 90}];

type Path = {path: {x: number; z: number}[]; distances: number[]; length: number};
type Stage = {id: string; region: number; from: number; to: number; start: number; end: number};
export type FlowTemplate = {id: string; routeId: string; factor: number; weight: number; duration: number; stages: Stage[]; geometry: Path};

function geometry(routeId: string) {
  const source = data.routes.find(r => r.id === routeId)!;
  const path = [...source.path], stops = [...source.stops];
  if (stops.at(-1) === 'entry') {
    path.push(...data.routes.find(r => r.id === 'culture')!.path.slice(1));
    stops.push('market', 'gate-out');
  }
  // Keep existing walking paths, including the forecourt approach rather than building centres.
  const distances = [0];
  for (let i = 1; i < path.length; i++) distances.push(distances[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  let previous = 0;
  const ends = stops.slice(1).map(id => {
    const point = siteById[id]?.entrance ?? data.points.find(p => p.id === id)!.anchor;
    let nearest = Infinity, index = previous;
    for (let i = previous + 1; i < path.length; i++) {
      const distance = Math.hypot(path[i].x - point.x, path[i].z - point.z);
      if (distance < nearest) { nearest = distance; index = i; }
    }
    previous = index;
    return distances[index];
  });
  ends[ends.length - 1] = distances.at(-1)!;
  // A short entrance approach occupies its own stage instead of holding everyone at one point.
  ends.unshift(ends[0] * .15);
  return {geometry: {path, distances, length: distances.at(-1)!}, stops, ends};
}

export const flowTemplates: FlowTemplate[] = routeChoices.flatMap(choice => {
  const route = geometry(choice.id);
  return speedClasses.map(speed => {
    let end = 0;
    const stages = route.stops.map((id, i) => {
      const from = i ? route.ends[i - 1] : 0, to = route.ends[i];
      const minutes = choice.id === 'loop' ? MAIN_MINUTES[i] : choice.minutes * (to - from) / route.geometry.length;
      const start = end;
      end += minutes * speed.factor;
      return {id, region: Number(data.points.find(p => p.id === id)!.regionId.slice(1)), from, to, start, end};
    });
    // Exact duration avoids floating-point drift at the closing-time eligibility boundary.
    stages.at(-1)!.end = choice.minutes * speed.factor;
    return {id: `${choice.id}-${speed.factor}`, routeId: choice.id, factor: speed.factor, weight: choice.weight * speed.weight, duration: choice.minutes * speed.factor, stages, geometry: route.geometry};
  });
});

/** A day of actual admissions; no visitor positions or individual itineraries are persisted. */
export interface FormulaFlow {
  day: number;
  admissions: number[];
  entered: number;
  exitedBaseline: number;
}
export function createFormulaFlow(day: number): FormulaFlow {
  return {day, admissions: Array(1440).fill(0), entered: 0, exitedBaseline: 0};
}
export function recordAdmission(flow: FormulaFlow, time: number, people: number) {
  const minute = Math.floor((time - flow.day) / MINUTE);
  if (minute < 480 || minute >= 1020 || people <= 0) return;
  flow.admissions[minute] += people;
  flow.entered += people;
}

// One minute's admissions share eligibility, conservatively using the end of that minute.
const weightsByMinute = Array.from({length: 1440}, (_, minute) => {
  const weights = flowTemplates.map(t => minute >= 480 && minute < 1020 && minute + 1 + t.duration <= 1140 ? t.weight : 0);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => total ? w / total : 0);
});
export function admissionWeights(minute: number): readonly number[] {
  return weightsByMinute[Math.max(0, Math.min(1439, Math.floor(minute)))];
}
/** Business-only parking return estimate; never used to locate people or count departures. */
export function businessVisitMinutes(time: number) {
  const minute = Math.floor(((time + 8 * 3600_000) % 86400_000) / MINUTE);
  return admissionWeights(minute).reduce((sum, w, i) => sum + w * flowTemplates[i].duration, 0);
}

// K(age): occupancy transfers to the next stage in its final two minutes, and finally to exits.
// Kernels are compiled once at the simulation's 10-second resolution, not per visitor or day.
const kernels = flowTemplates.map(template => {
  const width = template.stages.length;
  const table = new Float64Array((Math.ceil(template.duration * 6) + 1) * width);
  for (let tick = 0; tick <= Math.ceil(template.duration * 6); tick++) {
    const age = tick / 6;
    const index = template.stages.findIndex(s => age < s.end);
    if (index < 0) continue;
    const stage = template.stages[index];
    const blend = clamp((age - (stage.end - Math.min(2, stage.end - stage.start))) / Math.min(2, stage.end - stage.start));
    table[tick * width + index] = 1 - blend;
    if (index + 1 < width) table[tick * width + index + 1] = blend;
  }
  return table;
});

export function apportion(total: number, weights: readonly number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const raw = weights.map(w => total * w / sum), counts = raw.map(Math.floor);
  raw.map((n, i) => ({i, remainder: n - counts[i]})).sort((a, b) => b.remainder - a.remainder || a.i - b.i)
    .slice(0, total - counts.reduce((a, b) => a + b, 0)).forEach(({i}) => counts[i]++);
  return counts;
}

export function formulaOccupancy(flow: FormulaFlow, time: number) {
  const minute = (time - flow.day) / MINUTE;
  const masses = flowTemplates.map(t => Array(t.stages.length).fill(0) as number[]);
  // Older buckets have fully departed. Work is bounded by 241 minutes × 12 templates.
  for (let u = Math.max(480, Math.floor(minute - 240)); u <= Math.min(1019, Math.floor(minute)); u++) {
    const admitted = flow.admissions[u];
    if (!admitted) continue;
    const age = minute - u, tick = Math.floor(age * 6), fraction = age * 6 - tick;
    for (let k = 0; k < flowTemplates.length; k++) {
      const template = flowTemplates[k], people = admitted * weightsByMinute[u][k];
      if (!people || age >= template.duration) continue;
      const width = template.stages.length, kernel = kernels[k], offset = tick * width;
      for (let z = 0; z < width; z++) masses[k][z] += people * (kernel[offset + z] * (1 - fraction) + (kernel[offset + width + z] ?? 0) * fraction);
    }
  }
  const rawRegions = Array(9).fill(0) as number[];
  masses.forEach((stages, k) => stages.forEach((mass, z) => { rawRegions[flowTemplates[k].stages[z].region] += mass; }));
  const alive = rawRegions.reduce((a, b) => a + b, 0);
  // Public circulation is a derived passage share, not an extra visitor bucket.
  // It keeps the central connector visible while preserving the regional total.
  if (alive > 0) rawRegions[8] = alive * .08;
  // Round cumulative departures down, so they never reverse when a regional remainder changes.
  const exited = Math.max(flow.exitedBaseline, Math.min(flow.entered, Math.floor(flow.entered - alive + 1e-8)));
  const visitors = flow.entered - exited;
  return {masses, counts: apportion(visitors, rawRegions), visitors, exited};
}

function upperBound(values: number[], value: number) {
  let lo = 0, hi = values.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (values[m] <= value) lo = m + 1; else hi = m; }
  return lo;
}
function at(path: Path, distance: number) {
  const index = Math.min(path.path.length - 1, Math.max(1, upperBound(path.distances, distance)));
  const a = path.path[index - 1], b = path.path[index];
  const t = clamp((distance - path.distances[index - 1]) / Math.max(1e-9, path.distances[index] - path.distances[index - 1]));
  return {x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z)};
}
// Slower motion near each destination spreads a stop over the approach, rather than one coordinate.
const pace = (q: number) => q < .65 ? q * .8 / .65 : .8 + (q - .65) * .2 / .35;
const unpace = (q: number) => q < .8 ? q * .65 / .8 : .65 + (q - .8) * .35 / .2;
function stageIndex(template: FlowTemplate, age: number) {
  const index = template.stages.findIndex(s => age < s.end);
  return index < 0 ? template.stages.length - 1 : index;
}
function distanceAt(template: FlowTemplate, age: number) {
  const stage = template.stages[stageIndex(template, age)];
  return stage.from + (stage.to - stage.from) * pace(clamp((age - stage.start) / (stage.end - stage.start)));
}
function ageAt(template: FlowTemplate, distance: number) {
  const stage = template.stages.find(s => distance < s.to) ?? template.stages.at(-1)!;
  return stage.start + (stage.end - stage.start) * unpace(clamp((distance - stage.from) / Math.max(1e-9, stage.to - stage.from)));
}
function trajectory(template: FlowTemplate, age: number) {
  const from = distanceAt(template, age), to = distanceAt(template, age + 1);
  const times = [0, 60];
  // Include every road vertex and pace boundary crossed, so client interpolation stays on the road.
  const path = template.geometry;
  for (let i = upperBound(path.distances, from); i < path.distances.length && path.distances[i] < to; i++) times.push((ageAt(template, path.distances[i]) - age) * 60);
  for (const stage of template.stages) for (const boundary of [stage.start + (stage.end - stage.start) * .65, stage.end]) {
    if (boundary > age && boundary < age + 1) times.push((boundary - age) * 60);
  }
  return [...new Set(times)].sort((a, b) => a - b).map(seconds => ({seconds, ...at(path, distanceAt(template, age + seconds / 60))}));
}
// Stateless integer hashing gives the same representative births and priorities after reload/replay.
function random(seed: number) {
  let n = Math.imul(seed ^ 0x9e3779b9, 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
type Candidate = {id: string; k: number; age: number; priority: number};
function representatives(flow: FormulaFlow, time: number, masses: number[][], visitors: number, includeTrajectory: boolean) {
  const groups = flowTemplates.flatMap((t, k) => t.stages.map((stage, z) => ({k, stage, mass: masses[k][z], candidates: [] as Candidate[]})));
  const offsets = flowTemplates.map((_, k) => flowTemplates.slice(0, k).reduce((sum, t) => sum + t.stages.length, 0));
  const minute = (time - flow.day) / MINUTE;
  for (let u = Math.max(480, Math.floor(minute - 241)); u <= Math.min(1019, Math.floor(minute)); u++) {
    if (!flow.admissions[u]) continue;
    flowTemplates.forEach((template, k) => {
      const mass = flow.admissions[u] * weightsByMinute[u][k];
      if (!mass) return;
      for (let slot = 0; slot < 4; slot++) {
        const seed = (u * flowTemplates.length + k) * 4 + slot;
        const birth = u + (slot === 0 ? 0 : (slot - .5 + random(seed)) / 4);
        const age = minute - birth;
        if (age < 0 || age >= template.duration) continue;
        groups[offsets[k] + stageIndex(template, age)].candidates.push({id: `formula-${flow.day}-${seed}`, k, age, priority: -Math.log(Math.max(1e-9, random(seed + 100003))) / mass});
      }
    });
  }
  const seats = Math.min(320, visitors), allocation = groups.map(() => 0);
  // Stratify by route, speed and stage, with capacity-aware largest remainders.
  let remaining = seats;
  while (remaining > 0) {
    const weights = groups.map((g, i) => allocation[i] < g.candidates.length ? g.mass : 0);
    if (!weights.some(w => w > 0)) break;
    const shares = apportion(remaining, weights);
    let added = 0;
    shares.forEach((n, i) => { const take = Math.min(n, groups[i].candidates.length - allocation[i]); allocation[i] += take; added += take; });
    if (!added) break;
    remaining -= added;
  }
  const markers: VisitorFlowPoint[] = [];
  groups.forEach((group, i) => {
    if (!allocation[i]) return;
    const selected = group.candidates.sort((a, b) => a.priority - b.priority).slice(0, allocation[i]);
    const people = apportion(Math.max(selected.length, Math.round(group.mass)), selected.map(() => 1));
    selected.forEach((candidate, j) => {
      const template = flowTemplates[candidate.k], distance = distanceAt(template, candidate.age);
      const speedMps = (distanceAt(template, candidate.age + 1 / 60) - distance) * data.scaleMetres;
      const marker: VisitorFlowPoint = {id: candidate.id, people: people[j], regionId: `Z${group.stage.region}`, ...at(template.geometry, distance), speedMps, walking: true, phase: group.stage.id === 'entry' && group.stage.start === 0 ? 'arriving' : group.stage.id === 'gate-out' ? 'departing' : 'touring'};
      if (includeTrajectory) marker.trajectory = trajectory(template, candidate.age).map(({seconds, x, z}) => ({seconds, x, z}));
      markers.push(marker);
    });
  });
  return markers.sort((a, b) => a.id.localeCompare(b.id));
}

export function visitorDistribution(flow: FormulaFlow, time: number, extraPeople = 0, options: {trajectory?: boolean; markers?: boolean} = {}) {
  const occupancy = formulaOccupancy(flow, time);
  const counts = [...occupancy.counts];
  counts[0] += extraPeople;
  return {...occupancy, counts, visitors: occupancy.visitors + extraPeople,
    markers: options.markers === false ? [] : representatives(flow, time, occupancy.masses, occupancy.visitors, !!options.trajectory)};
}
