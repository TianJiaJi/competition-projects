import {sampleSnapshot} from "../../packages/client/testing/snapshot";
import { describe, it, expect } from "vitest";
import {
  validateSnapshot,
} from "../../packages/client/src/index";
import {
  findRoute,
  shortestPath,
  edges,
  points,
  buildHandoffUrl,
  readHandoff,
} from "@scenic/scenic";
const fixture = () => sampleSnapshot(new Date("2026-09-11T04:00:00Z"));
describe("public routes", () => {
  it("chooses the shorter direction and preserves distance in reverse", () => {
    const s = fixture(),
      out = findRoute("entry", "forest", "walk", s),
      back = findRoute("forest", "entry", "walk", s);
    expect(out.ok && out.nodeIds).toEqual(["entry", "r7", "forest"]);
    expect(out.ok && back.ok && out.distance === back.distance).toBe(true);
  });
  it("routes around a closed main-road edge and rejects a disconnected destination", () => {
    const s = fixture();
    s.closedEdgeIds = ["road-7", "road-15"];
    const detour = findRoute("entry", "forest", "walk", s);
    expect(detour.ok && detour.nodeIds).toContain("r1");
    expect(detour.ok && detour.edgeIds).not.toContain("road-7");
    s.closedEdgeIds.push("road-14");
    expect(findRoute("entry", "forest", "walk", s).ok).toBe(false);
  });
  it("rejects closed, unknown, or invalid endpoints without inventing zero routes", () => {
    const s = fixture();
    expect(findRoute("entry", "lake", "walk", s).ok).toBe(false);
    expect(findRoute("entry", "missing", "walk", s).ok).toBe(false);
    delete s.points.creek;
    expect(findRoute("entry", "creek", "walk", s).ok).toBe(false);
    s.regions.Z6.availability = "closed";
    expect(findRoute("entry", "forest", "walk", s).ok).toBe(false);
  });
  it("forces the down cable in the summit return and does not use it for ordinary routes", () => {
    const s = fixture(),
      cable = findRoute("summit", "market", "cable", s),
      walk = findRoute("summit", "market", "walk", s);
    expect(cable.ok && cable.edgeIds).toContain("cable-down");
    expect(walk.ok && walk.edgeIds).not.toContain("cable-down");
    expect(findRoute("entry", "market", "cable", s).ok).toBe(false);
    expect(
      shortestPath(
        "lower",
        "upper",
        edges.filter((e) => e.mode === "cable"),
      ),
    ).toBeNull();
    s.points.upper.availability = "closed";
    expect(findRoute("summit", "market", "cable", s).ok).toBe(false);
    expect(findRoute("summit", "market", "walk", s).ok).toBe(true);
  });
  it("handles same-origin paths and produces connected segments for every open point", () => {
    const s = fixture(),
      same = findRoute("entry", "entry", "walk", s);
    expect(same.ok && same.distance).toBe(0);
    for (const point of points.filter(
      (p) => s.points[p.id].availability === "open",
    )) {
      const route = findRoute("entry", point.id, "walk", s);
      expect(route.ok, point.id).toBe(true);
      if (route.ok)
        route.edgeIds.forEach((id, i) => {
          const edge = edges.find((e) => e.id === id)!;
          expect([edge.from, edge.to]).toContain(route.nodeIds[i]);
          expect([edge.from, edge.to]).toContain(route.nodeIds[i + 1]);
        });
    }
  });
});
describe("public data and handoff boundary", () => {
  it("keeps regional counts and actual parking totals consistent", () => {
    const s = fixture();
    expect(s.visitors).toBe(
      Object.values(s.regions).reduce((n, r) => n + (r.count ?? 0), 0),
    );
    expect(s.parkingFree).toBe(
      ["p1", "p2", "p3"].reduce((n, id) => n + s.points[id].parkingFree!, 0),
    );
    expect(validateSnapshot(s)).toEqual(s);
  });
  it("rejects malformed snapshots and preserves unknown metrics", () => {
    expect(() => validateSnapshot({})).toThrow();
    const s = fixture();
    s.visitors = null;
    expect(validateSnapshot(s).visitors).toBeNull();
    s.points.t1.load = "invalid" as never;
    expect(() => validateSnapshot(s)).toThrow();
  });
  it("serializes only public handoff fields, strips existing query and rejects invalid ids", () => {
    const url = buildHandoffUrl("https://mobile.example/?token=private#old", {
      origin: "summit",
      destination: "market",
      mode: "cable",
    });
    expect(url).not.toContain("token");
    expect(readHandoff(new URL(url).search).value).toMatchObject({
      origin: "summit",
      destination: "market",
      mode: "cable",
    });
    expect(readHandoff("?from=entry&to=nope").error).toBeTruthy();
    expect(readHandoff("?from=entry").error).toBeTruthy();
  });
});

describe('v2 shared road geometry',()=>{
  it('uses the same raised bridge and sampled heights for distance and rendering',async()=>{
    const {polylineLength,isLake}=await import('@scenic/scenic');
    for(const edge of edges.filter(e=>e.mode==='walk')){
      expect(edge.path!.length).toBeGreaterThanOrEqual(2);
      expect(edge.length).toBe(Math.round(polylineLength(edge.path!)));
      for(const p of edge.path!){
        if(isLake(p.x,p.z))expect(edge.structure,edge.id).toBe('bridge');
      }
    }
    const bridge=edges.find(e=>e.structure==='bridge')!;
    expect(Math.max(...bridge.path!.map(p=>p.y))).toBeLessThan(3.4);
    const {lakeLevel}=await import('@scenic/scenic');
    for(const p of bridge.path!.filter(p=>isLake(p.x,p.z)))expect(p.y-.44).toBeGreaterThan(lakeLevel+.225+.35);
  });
  it('keeps the ring bidirectional and lets walkers bypass a closed bridge',()=>{
    const ring=edges.filter(e=>Number(e.id.replace('road-',''))<8);
    const forward=shortestPath('r1','r2',ring)!;
    expect(forward.edgeIds).toEqual(['road-1']);
    expect(shortestPath('r2','r1',ring)!.distance).toBe(forward.distance);
    const bypass=shortestPath('r1','r2',ring,['road-1'])!;
    expect(bypass.edgeIds).toHaveLength(7);
    expect(bypass.edgeIds).not.toContain('road-1');
  });
});

describe('walkable return geometry',()=>{
  it('uses small continuous stair risers instead of cliff-sized jumps',()=>{
    const path=edges.find(e=>e.id==='road-4')!.path!;
    const highestRiser=Math.max(...path.slice(1).map((p,i)=>Math.abs(p.y-path[i].y)));
    expect(highestRiser).toBeLessThanOrEqual(.25);
    const route=findRoute('summit','market','walk',fixture());expect(route.ok).toBe(true);
    if(route.ok){expect(route.edgeIds).toContain('road-4');expect(route.edgeIds).not.toContain('cable-down');}
  });
  it('cuts voxel shoulders below the return treads and leaves the water bed intact',async()=>{
    const {roadGroundHeight,terrainHeight,isWaterfall}=await import('@scenic/scenic');
    const path=edges.find(e=>e.id==='road-4')!.path!;
    for(const p of path){
      const ground=roadGroundHeight(p.x,p.z,[path]);
      expect(ground).toBeLessThan(p.y);
      if(isWaterfall(p.x,p.z))expect(ground).toBe(terrainHeight(p.x,p.z));
    }
  });
});

describe('consistent walking surfaces',()=>{
  it('joins every road exactly at node height with small risers and solid treads',async()=>{
    const {nodeById,terrainHeight}=await import('@scenic/scenic');
    for(const edge of edges.filter(e=>e.mode==='walk'&&!e.structure)){
      const path=edge.path!;
      for(const [id,p] of [[edge.from,path[0]],[edge.to,path.at(-1)!]] as const){
        const node=nodeById[id];expect(p).toEqual({x:node.x,y:terrainHeight(node.x,node.z)+.16,z:node.z});
      }
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],rise=Math.abs(b.y-a.y),run=Math.hypot(b.x-a.x,b.z-a.z);
        expect(rise,edge.id).toBeLessThanOrEqual(.25);
        expect(rise<.001||run<.001,edge.id).toBe(true);
      }
    }
  });
  it('keeps summit flights monotonic with level turning landings and no self intersections',async()=>{
    const {stairLandings}=await import('@scenic/scenic');
    for(const id of ['road-3','road-4','road-11']){
      const path=edges.find(e=>e.id===id)!.path!,direction=id==='road-4'?-1:1;
      for(let i=1;i<path.length;i++)expect((path[i].y-path[i-1].y)*direction,id).toBeGreaterThanOrEqual(-.001);
      for(const p of stairLandings[id]){
        const flat=path.filter(v=>Math.hypot(p.x-v.x,p.z-v.z)<.8&&Math.abs(p.y-v.y)<.001);
        expect(flat.length,id).toBeGreaterThan(1);
      }
      const cross=(a:{x:number;z:number},b:{x:number;z:number},c:{x:number;z:number})=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
      for(let i=1;i<path.length;i++)for(let j=i+2;j<path.length;j++){
        const a=path[i-1],b=path[i],c=path[j-1],d=path[j];
        expect(cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8,id).toBe(false);
      }
    }
  });
});

describe('human-scale mountain stairs',()=>{
  it('gives each riser a usable tread and a rest after at most ten steps',()=>{
    for(const id of ['road-2','road-3','road-4','road-5','road-6','road-9','road-10','road-11','road-12','road-13','road-18','road-23','road-26']){
      const path=edges.find(e=>e.id===id)!.path!;let consecutive=0,flatRun=0;
      for(let i=1;i<path.length;i++){
        const a=path[i-1],p=path[i],run=Math.hypot(p.x-a.x,p.z-a.z),rise=Math.abs(p.y-a.y);
        if(rise<.001){flatRun+=run;if(flatRun>.69)consecutive=0;}
        if(rise>.001){
          flatRun=0;consecutive++;expect(consecutive,id).toBeLessThanOrEqual(10);
          const before=path[i-2];
          const tread=Math.hypot(a.x-before.x,a.z-before.z);
          expect(tread,id).toBeGreaterThanOrEqual(.28);
          expect(rise/tread,id).toBeLessThanOrEqual(.600001);
        }
      }
    }
  });
  it('crosses the waterfall channel on a level walking deck',async()=>{
    const {isWaterfall}=await import('@scenic/scenic');
    const path=edges.find(e=>e.id==='road-4')!.path!;
    const index=path.findIndex((p,i)=>i>0&&p.x<=-6&&path[i-1].x>=-6);
    expect(index).toBeGreaterThan(0);
    const a=path[index-1],b=path[index],t=(-6-a.x)/(b.x-a.x);
    expect(b.y).toBe(a.y);
    expect(isWaterfall(-6,a.z+(b.z-a.z)*t)).toBe(true);
  });
});

describe('mountain access layout',()=>{
  it('places summit services on one terrace and keeps their paths short and level',async()=>{
    const {nodeById,terrainHeight}=await import('@scenic/scenic');
    const heights=['summit','upper','t4'].map(id=>terrainHeight(nodeById[id].x,nodeById[id].z));
    expect(new Set(heights).size).toBe(1);
    for(const id of ['road-19','road-24','road-12']){
      const path=edges.find(e=>e.id===id)!.path!;
      expect(new Set(path.map(p=>p.y)).size).toBe(1);
      expect(path.length).toBeLessThan(10);
    }
  });
  it('avoids crossing stair flights around the summit and waterfall',()=>{
    const roads=edges.filter(e=>['road-3','road-4','road-5','road-10','road-11','road-12','road-19','road-24'].includes(e.id));
    const cross=(a:{x:number;z:number},b:{x:number;z:number},c:{x:number;z:number})=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    for(let r=0;r<roads.length;r++)for(let s=r+1;s<roads.length;s++){
      const first=roads[r],second=roads[s];
      for(let i=1;i<first.path!.length;i++)for(let j=1;j<second.path!.length;j++){
        const a=first.path![i-1],b=first.path![i],c=second.path![j-1],d=second.path![j];
        expect(cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8,`${first.id}/${second.id}`).toBe(false);
      }
    }
  });
});
