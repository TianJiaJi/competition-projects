import {describe,expect,it} from 'vitest';
import {createScenicSvg,scenicSvgPoint} from '../../packages/scenic/src/svg-map';
import {paintedRoads,omittedPaintedRoadIds} from '../../packages/scenic/src/svg-qinglv-paths';
import {edges,points} from '../../packages/scenic/src/data';
const ids=(svg:string,attr:string)=>[...svg.matchAll(new RegExp(`${attr}="([^"]+)"`,'g'))].map(m=>m[1]);

describe('shared qinglv guide artwork',()=>{
  it('uses the new artwork by default, including projected scroll output',()=>{
    expect(createScenicSvg()).toBe(createScenicSvg({style:'qinglv'}));
    const projection={width:76,depth:76,azimuth:.2};
    expect(createScenicSvg({projection})).toBe(createScenicSvg({style:'qinglv',projection}));
    expect(createScenicSvg({style:'classic'})).not.toContain('data-map-style="qinglv"');
  });
  it('retains displayed anchors and routes while omitting parking artwork',()=>{
    const svg=createScenicSvg({style:'qinglv'});
    expect(ids(svg,'data-point-id').sort()).toEqual(points.filter(p=>p.kind!=='parking').map(p=>p.id).sort());
    expect(ids(svg,'data-edge-id').sort()).toEqual(edges.filter(e=>!omittedPaintedRoadIds.has(e.id)).map(e=>e.id).sort());
    for(const p of points.filter(p=>p.kind!=='parking')){
      const a=scenicSvgPoint(p.id)!;
      expect(svg).toContain(`data-point-id="${p.id}" transform="translate(${Number(a.x.toFixed(3))} ${Number(a.z.toFixed(3))})"`);
    }
    expect(svg).toContain('viewBox="-37 -36 76 76"');
    expect(scenicSvgPoint('missing')).toBeUndefined();
  });
  it('composes curved routes independently without moving their graph endpoints',()=>{
    for(const road of paintedRoads){
      const source=edges.find(e=>e.id===road.id)!;
      expect(road.d).toMatch(/^M[-\d. ]+[CL]/);
      expect(road.samples[0]).toEqual({x:source.path![0].x,z:source.path![0].z});
      expect(road.samples.at(-1)).toEqual({x:source.path!.at(-1)!.x,z:source.path!.at(-1)!.z});
    }
  });
  it('keeps bridges straight and shares crowded approach corridors',()=>{
    for(const road of paintedRoads.filter(e=>e.bridge)){
      expect(road.d).not.toContain('C');
      const a=road.samples[0],b=road.samples.at(-1)!;
      expect(road.samples.every(p=>Math.abs((p.x-a.x)*(b.z-a.z)-(p.z-a.z)*(b.x-a.x))<1e-8)).toBe(true);
    }
    const main=paintedRoads.find(e=>e.id==='road-6')!;
    const branch=paintedRoads.find(e=>e.id==='road-14')!;
    expect(branch.samples.slice(0,49)).toEqual(main.samples.slice(-49).reverse());
    expect(paintedRoads.find(e=>e.id==='road-20')!.sections).toEqual(paintedRoads.find(e=>e.id==='road-15')!.sections.slice(1));
  });
  it('hides annotations independently of the illustrated landmarks',()=>{
    const full=createScenicSvg({style:'qinglv'});
    const bare=createScenicSvg({style:'qinglv',showLabels:false,showFacilities:false,showVisitorFixtures:false});
    expect(ids(bare,'data-landmark-id')).toEqual(ids(full,'data-landmark-id'));
    expect(ids(bare,'data-label-id')).toHaveLength(0);
    expect(ids(bare,'data-point-id').sort()).toEqual(points.filter(p=>['attraction','entrance','commercial'].includes(p.kind)).map(p=>p.id).sort());
    expect(ids(bare,'data-edge-id')).not.toContain('access-terminal-entry');
    const fixturesOff=createScenicSvg({style:'qinglv',showVisitorFixtures:false});
    expect(ids(fixturesOff,'data-point-id')).toContain('t1');
    expect(ids(fixturesOff,'data-point-id')).not.toContain('terminal-entry');
    const mobile=createScenicSvg({showMarkers:false,showLabels:false});
    expect(ids(mobile,'data-point-id')).toHaveLength(0);
    expect(ids(mobile,'data-landmark-id')).toEqual(ids(full,'data-landmark-id'));
  });
  it('draws illustrated cable cabins, a single plunge and an organic entrance clearing',()=>{
    const svg=createScenicSvg();
    expect(ids(svg,'data-cable-cabin')).toHaveLength(4);
    expect(ids(svg,'data-cable-tower')).toHaveLength(2);
    expect(svg).toContain('data-waterfall-type="single-plunge"');
    expect(svg).toContain('data-court-shape="garden-clearing"');
    for(const id of ['road-3','road-5','road-11'])expect((paintedRoads.find(e=>e.id===id)!.d.match(/C/g)??[]).length).toBeGreaterThan(3);
  });
  it('is deterministic, self-contained and isolates every paint-server reference',()=>{
    const a=createScenicSvg({style:'qinglv',idPrefix:'first'}),b=createScenicSvg({style:'qinglv',idPrefix:'second'});
    expect(a).toBe(createScenicSvg({style:'qinglv',idPrefix:'first'}));
    expect(a).not.toMatch(/<image|<script|<foreignObject|NaN|Infinity|(?:href|src)="https?:/);
    const defined=ids(a,'(?<![a-z-])id');
    expect(new Set(defined).size).toBe(defined.length);
    for(const [,id] of a.matchAll(/url\(#([^)]+)\)/g))expect(defined).toContain(id);
    expect(ids(b,'(?<![a-z-])id').some(id=>defined.includes(id))).toBe(false);
    expect(a.length).toBeLessThan(2_000_000);
  });
});
