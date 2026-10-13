import {describe,it,expect} from 'vitest';
import {edges,points,nodeById,entryPlaza,plazaServiceIds,isEntryPlaza,isEntryPlazaSegment,terrainHeight,parkingZones,parkingCourts,isIsland} from '@scenic/scenic';
import {plazaRestAreas} from '../../packages/scenic/src/plaza-furniture';

describe('open entrance plaza',()=>{
  it('keeps every path inside the plaza on its shared level floor',()=>{
    for(const edge of edges.filter(e=>e.mode==='walk'))for(let i=1;i<edge.path!.length;i++){
      const a=edge.path![i-1],b=edge.path![i];
      if(!isEntryPlazaSegment(a,b))continue;
      expect(a.y,edge.id).toBeCloseTo(entryPlaza.ground+.16,6);
      expect(b.y,edge.id).toBeCloseTo(entryPlaza.ground+.16,6);
      expect(isEntryPlaza(a.x,a.z),edge.id).toBe(true);
      expect(isEntryPlaza(b.x,b.z),edge.id).toBe(true);
    }
    for(let x=-9;x<=9;x+=2)for(let z=18;z<=26;z+=2)expect(terrainHeight(x,z)).toBe(entryPlaza.ground);
  });
  it('reserves the center and moves service and parking destinations to the perimeter',()=>{
    for(const point of points.filter(p=>p.kind!=='entrance'&&p.kind!=='parking'&&p.kind!=='terminal'&&p.kind!=='safety')){
      const n=nodeById[point.nodeId];expect(isEntryPlaza(n.x,n.z),point.id).toBe(plazaServiceIds.includes(point.id));
    }
    for(const id of ['road-16','road-20','road-21']){
      const path=edges.find(edge=>edge.id===id)!.path!;
      for(let i=1;i<path.length;i++)expect(isEntryPlazaSegment(path[i-1],path[i]),id).toBe(true);
    }
    // Parking queries terminate on the pedestrian edge; the actual bays stay outside.
    for(const zone of parkingZones)for(const x of zone.bayXs)for(const dx of [-.49,.49])for(const dz of [-.76,.76])expect(isEntryPlaza(x+dx,zone.z+dz),zone.id).toBe(false);
    for(const id of ['entry','gate-out']){
      const n=nodeById[id];expect(n.z).toBeGreaterThan(28);expect(isEntryPlaza(n.x,n.z)).toBe(true);
    }
  });
  it('leaves the route corridors clear of tree planters and seating',()=>{
    for(const area of plazaRestAreas)for(const edge of edges.filter(e=>e.mode==='walk'))for(let i=1;i<edge.path!.length;i++){
      const a=edge.path![i-1],b=edge.path![i],count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15));
      for(let n=0;n<=count;n++){
        const x=a.x+(b.x-a.x)*n/count,z=a.z+(b.z-a.z)*n/count;
        const distance=Math.hypot(Math.max(0,Math.abs(x-area.x)-area.width/2),Math.max(0,Math.abs(z-area.z)-area.depth/2));
        expect(distance,`${edge.id}/${area.x},${area.z}`).toBeGreaterThan(Number(edge.id.slice(5))<8?.82:.54);
      }
    }
  });
  it('keeps parking bays clear of the driveways and shared vehicle aisles',()=>{
    for(const zone of parkingZones){
      const court=parkingCourts.find(c=>c.id===zone.court)!;
      expect(Math.abs(zone.z-court.laneZ)-.76).toBeGreaterThanOrEqual(.975);
      for(const x of zone.bayXs)expect(Math.abs(x-court.driveX)-.49).toBeGreaterThanOrEqual(.7);
    }
  });
  it('gives each parking zone a separate supported court with a visible gap',()=>{
    expect(new Set(parkingZones.map(z=>z.court)).size).toBe(parkingZones.length);
    for(const [i,a] of parkingCourts.entries()){
      for(const dx of [-1,1])for(const dz of [-1,1])expect(isIsland(a.x+dx*a.width/2,a.z+dz*a.depth/2),a.id).toBe(true);
      for(const b of parkingCourts.slice(i+1)){
        const gap=Math.hypot(Math.max(0,Math.abs(a.x-b.x)-(a.width+b.width)/2),Math.max(0,Math.abs(a.z-b.z)-(a.depth+b.depth)/2));
        expect(gap,`${a.id}/${b.id}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});
