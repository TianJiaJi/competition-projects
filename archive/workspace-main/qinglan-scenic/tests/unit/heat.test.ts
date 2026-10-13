import { describe, expect, it } from 'vitest';
import { heatPixels, interpolateVisitor, rasterizeHeat, createHeatProjection, HEAT_SIZE } from '../../packages/scenic/src/heat';
import type { PublicSnapshot, VisitorFlowPoint } from '../../packages/contracts/src/index';
import { sampleSnapshot } from '../../packages/client/testing/snapshot';
import { regions } from '../../packages/scenic/src/data';
import { referencePressure } from '../../packages/scenic/src/pressure';
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';

const point = (overrides: Partial<VisitorFlowPoint> = {}): VisitorFlowPoint => ({
  id: 'visitor-1', people: 40, regionId: 'Z1', x: 0, z: 0, heading: 0,
  speedMps: 1, walking: true, phase: 'touring',
  trajectory: [{seconds: 0, x: 0, z: 0}, {seconds: 30, x: 10, z: 0}, {seconds: 60, x: 10, z: 10}], ...overrides,
});
function snapshot(): PublicSnapshot {
  const result = sampleSnapshot();
  result.visitors = 40;
  result.visitorFlow = [point()];
  for (const region of Object.values(result.regions)) { region.availability = 'open'; region.load = 'quiet'; region.count = 0; }
  return result;
}
const cellAt = (x: number, z: number, size = HEAT_SIZE) => Math.floor((z + 36) / 72 * size) * size + Math.floor((x + 36) / 72 * size);
const rgbAt = (pixels: Uint8Array, x: number, z: number) => [...pixels.slice(cellAt(x, z) * 4, cellAt(x, z) * 4 + 3)];

describe('连续全沙盘热力场', () => {
  it('轨迹插值包含拐点，停在预测末端且支持单点轨迹', () => {
    expect(interpolateVisitor(point(), 15)).toMatchObject({x: 5, z: 0});
    expect(interpolateVisitor(point(), 45)).toMatchObject({x: 10, z: 5});
    expect(interpolateVisitor(point(), 120)).toMatchObject({x: 10, z: 10});
    expect(interpolateVisitor(point({trajectory: [{seconds: 0, x: 4, z: 5}]}), 50)).toMatchObject({x: 4, z: 5});
  });
  it('零人数热力层全透明，底色由共享模型淡化提供', () => {
    const s = snapshot(); s.visitors = 0; s.visitorFlow = [];
    const pixels = heatPixels(s), quiet = [...pixels.slice(0, 4)];
    expect(quiet).toEqual([0,0,0,0]);
    for (let k = 0; k < pixels.length; k += 4) expect([...pixels.slice(k, k + 4)]).toEqual(quiet);
    expect(rasterizeHeat([]).maximum).toBe(0);
  });
  it('极少人数也从蓝色起步，热力沿游线连续渐变到承载上限', () => {
    const s=snapshot();s.regions.Z8.count=2200;
    const blue=rgbAt(heatPixels(s,[point({people:.001})]),0,0);
    expect(blue[2]).toBeGreaterThan(blue[0]*2);
    expect(blue).not.toEqual(rgbAt(heatPixels({...s,visitors:0}),0,0));
    const shades=new Set(Array.from({length:40},(_,i)=>rgbAt(heatPixels(s,[point({people:1+i*2})]),0,0).join(',')));
    expect(shades.size).toBeGreaterThan(20);
  });
  it('人数增加提高热度；拆分代表群不改变密度', () => {
    const one = rasterizeHeat([point()]);
    const split = rasterizeHeat([point({people: 20}), point({people: 20})]);
    expect(split.values).toEqual(one.values);
    expect(rasterizeHeat([point({people: 80})]).maximum).toBeCloseTo(one.maximum * 2);
    const s = snapshot(); s.regions.Z8.count = 1000;
    expect(rgbAt(heatPixels(s, [point({people: 400})]), 0, 0)).not.toEqual(rgbAt(heatPixels(s, [point({people: 1})]), 0, 0));
  });
  it('相邻人群形成连续渐变，游线外保持透明', () => {
    const s = snapshot(), positions = [point({x: -3, people: 100}), point({x: 3, people: 150})];
    s.regions.Z8.count = 1000;
    const pixels = heatPixels(s, positions), field = rasterizeHeat(positions);
    expect(field.values[cellAt(0, 0)]).toBeGreaterThan(.5);
    expect(pixels[cellAt(0,0)*4+3]).toBe(255);
    expect(pixels[cellAt(30,30)*4+3]).toBe(0);
    const colors = new Set<string>();
    for (let x = -12; x <= 12; x += .6) colors.add(rgbAt(pixels, x, 0).join(','));
    expect(colors.size).toBeGreaterThan(5);
    expect(rgbAt(pixels, 0, 0)).not.toEqual(rgbAt(pixels, 30, 30));
  });
  it('人群移动会清除旧热度，明确空数组不会铺满区域', () => {
    const s = snapshot(); s.regions.Z8.count=2500;
    expect(rgbAt(heatPixels(s, [point({x: 20})]), 0, 0)).toEqual(rgbAt(heatPixels({...s, visitors: 0}), 0, 0));
    const empty = heatPixels({...s, visitorFlow: []});
    const zero = heatPixels({...s, visitors: 0});
    expect(empty).toEqual(zero);
  });
  it('缺少坐标保持透明热力层，不再铺满区域；业务load不影响有游线的着色', () => {
    const s = snapshot(); delete s.visitorFlow;
    s.regions.Z1 = {availability: 'open', count: 1100, load: 'busy'};
    expect(heatPixels(s)).toEqual(heatPixels({...s,visitors:0}));
    const positions=[point({x:19,z:14,people:500})];
    const full=heatPixels(s,positions);
    s.regions.Z1.load='unknown';
    expect(heatPixels(s,positions)).toEqual(full);
    s.regions.Z1.count=400;
    expect(rgbAt(heatPixels(s,positions),19,14)).not.toEqual(rgbAt(full,19,14));
    expect(rgbAt(full,-30,30)).toEqual(rgbAt(heatPixels({...s,visitors:0}),-30,30));
  });
  it('不同容量采用独立承载率，多区满载不受数量限制', () => {
    const s = snapshot(); s.visitors = 10000;
    for (const region of regions) s.regions[region.id].count = region.capacity;
    const pixels = heatPixels(s, regions.map(r=>point({x:r.x,z:r.z,people:800})));
    for (const region of regions) {
      const [r,g,b] = rgbAt(pixels, region.x, region.z);
      expect(r).toBeGreaterThan(g * 2); expect(r).toBeGreaterThan(b * 2);
    }
    expect(referencePressure(1000,1000).band).toBe(5);
    expect(referencePressure(1000,2500).band).toBe(1);
  });
  it('热力核心保持同一色相，游线红色不会进入低于90%的区域', () => {
    const s = snapshot();
    s.regions.Z8.count = 2200; s.regions.Z4.count = 1500;
    const hue = (rgb:number[]) => new THREE.Color().setRGB(...rgb.map(v=>v/255) as [number,number,number]).getHSL({h:0,s:0,l:0}).h;
    const low = rgbAt(heatPixels(s, [point({people:400})]),0,0);
    const high = rgbAt(heatPixels(s, [point({people:10000})]),0,0);
    expect(hue(low)).toBeCloseTo(hue(high),2);
    const pixels = heatPixels(s, regions.map(r=>point({x:r.x,z:r.z,people:800})));
    for(let z=0;z<HEAT_SIZE;z++) for(let x=0;x<HEAT_SIZE;x++) {
      const px=(x+.5)/HEAT_SIZE*72-36,pz=(z+.5)/HEAT_SIZE*72-36;
      const owner=regions.reduce((a,b)=>Math.hypot(px-a.x,pz-a.z)/a.radius <= Math.hypot(px-b.x,pz-b.z)/b.radius?a:b);
      if(owner.id==='Z4')continue;
      const k=(z*HEAT_SIZE+x)*4;
      const h=hue([...pixels.slice(k,k+3)]);
      const saturation = new THREE.Color().setRGB(pixels[k]/255,pixels[k+1]/255,pixels[k+2]/255).getHSL({h:0,s:0,l:0}).s;
      expect(saturation > .2 && (h < .025 || h > .98)).toBe(false);
    }
  });
  it('未知人数与关闭状态使用灰色，人数变化触发静止场景更新', () => {
    const s = snapshot(); s.regions.Z8.count = null;
    const unknown=rgbAt(heatPixels(s),0,0);
    s.regions.Z8.count=1000; s.regions.Z8.availability='closed';
    expect(rgbAt(heatPixels(s),0,0)).toEqual(unknown);
    const projection=createHeatProjection();
    expect(projection.update(s,true,[],0)).toBe(true);
    s.regions.Z8.availability='open';
    expect(projection.update(s,true,[],200)).toBe(true);
    s.regions.Z8.count=2500;
    expect(projection.update(s,true,[],400)).toBe(true);
    projection.dispose();
  });
  it('边界和非法点安全处理，停留扩散比步行更宽', () => {
    expect([...rasterizeHeat([point({x: 36, z: -36})], 32).values].every(Number.isFinite)).toBe(true);
    expect(rasterizeHeat([point({x: NaN})]).maximum).toBe(0);
    expect(rasterizeHeat([point({speedMps: 0})]).values.filter(Boolean).length).toBeGreaterThan(rasterizeHeat([point()]).values.filter(Boolean).length);
  });
  it('暂停位置不重复上传，恢复更新节流并支持质量降级', () => {
    const projection = createHeatProjection(), s = snapshot();
    expect(projection.update(s, true, [point()], 0)).toBe(true);
    expect(projection.update(s, true, [point()], 200)).toBe(false);
    expect(projection.update(s, true, [point({x: 1})], 250)).toBe(false);
    expect(projection.update(s, true, [point({x: 1})], 400)).toBe(true);
    projection.setQuality(2);
    expect(projection.update(s, true, [point({x: 2})], 600)).toBe(false);
    projection.dispose();
  });
  it('320点动态重绘保留128纹理，记录实际CPU耗时', () => {
    expect(HEAT_SIZE).toBe(128);
    const s = snapshot(), positions = Array.from({length: 320}, (_, i) => point({x: (i % 20) * 2 - 20, z: Math.floor(i / 20) * 2 - 16}));
    heatPixels(s, positions);
    const start = performance.now();
    for (let i = 0; i < 20; i++) heatPixels(s, positions);
    console.info(`128x128 / 320 points: ${((performance.now() - start) / 20).toFixed(2)} ms per heat update`);
  });
});
