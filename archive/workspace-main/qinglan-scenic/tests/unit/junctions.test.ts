import { describe,it,expect } from 'vitest';
import { edges,junctions,portPositions,junctionConnection,junctionSurfaceAt,junctionBoundary,isJunctionSegment,roadGroundHeight } from '@scenic/scenic';

describe('dedicated three-way junctions',()=>{
  it('joins every approach to the same flat deck through an explicit gate and collar',()=>{
    for(const j of junctions)for(const port of j.ports)for(const edgeId of port.edgeIds){
      const edge=edges.find(e=>e.id===edgeId)!,path=edge.path!;
      const {gate,outer}=junctionConnection(j.id,edgeId)!;
      expect(path).toContainEqual(gate);expect(path).toContainEqual(outer);
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i];
        if(junctionSurfaceAt((a.x+b.x)/2,(a.z+b.z)/2)?.id!==j.id)continue;
        expect(a.y,edgeId).toBe(j.y);expect(b.y,edgeId).toBe(j.y);
        expect(isJunctionSegment(a,b)).toBe(true);
      }
    }
  });
  it('reserves at least 1.7 units at each opening and places no guardrail across the walking axis',()=>{
    for(const j of junctions)for(const p of j.ports){
      expect(p.width).toBeGreaterThanOrEqual(1.7);
      const {gate,outer}=portPositions(j,p);
      for(const {a,b} of junctionBoundary(j)){
        for(const point of [gate,outer]){
          const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
          expect(Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t)).toBeGreaterThanOrEqual(p.width/2-1e-6);
        }
      }
    }
  });
  it('cuts the full platform footprint below its slab, including corners between roads',()=>{
    const paths=edges.filter(e=>e.mode==='walk').map(e=>e.path!);
    for(const j of junctions)for(let x=j.x-j.width/2;x<=j.x+j.width/2;x+=.4)for(let z=j.z-j.depth/2;z<=j.z+j.depth/2;z+=.4){
      expect(roadGroundHeight(x,z,paths)).toBeLessThanOrEqual(j.y-.4+1e-6);
    }
  });
});
