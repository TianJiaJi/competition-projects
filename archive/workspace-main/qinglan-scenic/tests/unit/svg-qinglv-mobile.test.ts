import {describe,it,expect} from 'vitest';
import mobile from '../../packages/scenic/generated/mobile.json';
import {paintedRoads} from '../../packages/scenic/src/svg-qinglv-paths';
const key=(p:{x:number;z:number})=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`;
describe('mobile uses the same painted map routes',()=>{
  it('regenerates all tour overlays and progress positions from the new curves',()=>{
    expect(mobile.mapStyle).toBe('qinglv');
    expect(mobile.routes).toHaveLength(8);
    for(const route of mobile.routes){
      const allowed=new Set(route.edgeIds.flatMap(id=>paintedRoads.find(e=>e.id===id)!.samples.map(key)));
      expect(route.path.length).toBeGreaterThan(0);
      expect(route.path.every(p=>allowed.has(key(p)))).toBe(true);
      expect(route.distance).toBeGreaterThan(0);
    }
  });
  it('retains parking business records even though parking artwork is omitted',()=>{
    expect(mobile.points.filter(p=>p.kind==='parking').map(p=>p.id).sort()).toEqual(['p1','p2','p3']);
  });
});
