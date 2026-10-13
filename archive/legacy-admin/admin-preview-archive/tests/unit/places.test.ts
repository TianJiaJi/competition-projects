import {describe,it,expect} from 'vitest';
import {edges,pointSites,nodeById,stairLandings,distanceToRoadSegment,findRoute} from '@scenic/scenic';
import {sampleSnapshot} from '../../packages/client/src/index';

describe('separate visitor forecourts',()=>{
  it('keeps the full width of every walking road outside the relocated building footprints',()=>{
    for(const site of pointSites){
      const b=site.building;
      for(const edge of edges.filter(e=>e.mode==='walk')){
        const width=Number(edge.id.slice(5))<8?1.44:['road-10','road-11','road-12'].includes(edge.id)?1.35:.88;
        for(let i=1;i<edge.path!.length;i++){
          const a=edge.path![i-1],end=edge.path![i],length=Math.hypot(end.x-a.x,end.z-a.z),count=Math.max(1,Math.ceil(length/.1));
          for(let k=0;k<=count;k++){
            const x=a.x+(end.x-a.x)*k/count,z=a.z+(end.z-a.z)*k/count;
            const dx=Math.max(0,Math.abs(x-b.x)-b.width/2),dz=Math.max(0,Math.abs(z-b.z)-b.depth/2);
            expect(Math.hypot(dx,dz),`${site.id}/${edge.id}`).toBeGreaterThanOrEqual(width/2+.1);
          }
        }
      }
      expect(nodeById[site.id]).toMatchObject(site.entrance);
    }
  });
  it('gives parallel mountain flights enough lateral separation instead of nearly retracing stairs',()=>{
    for(const id of ['road-3','road-4']){
      const turns=stairLandings[id];
      for(let i=1;i<turns.length;i++)for(let j=i+2;j<turns.length;j++){
        const a=turns[i-1],b=turns[i],c=turns[j-1],d=turns[j];
        const clearance=Math.min(distanceToRoadSegment(a.x,a.z,c,d),distanceToRoadSegment(b.x,b.z,c,d),distanceToRoadSegment(c.x,c.z,a,b),distanceToRoadSegment(d.x,d.z,a,b));
        expect(clearance,id).toBeGreaterThanOrEqual(2.2);
      }
    }
  });
  it('uses one bamboo approach and a short onward spur to the supply forecourt',()=>{
    const access=edges.find(e=>e.id==='road-9')!,supply=edges.find(e=>e.id==='road-18')!;
    expect([access.from,access.to,supply.from,supply.to]).toEqual(['r2','bamboo-court','bamboo-court','supply']);
    expect(new Set(access.path!.map(p=>p.y)).size).toBe(1);
    expect(stairLandings['road-9']).toHaveLength(1);
    expect(new Set(supply.path!.map(p=>p.y)).size).toBe(1);
    const snapshot=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
    snapshot.points.bamboo.availability='closed';
    expect(findRoute('entry','supply','walk',snapshot).ok).toBe(true);
  });
});
