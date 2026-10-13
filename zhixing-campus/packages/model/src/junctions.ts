import type { RoadPosition } from '@scene/contracts';
export interface JunctionPort { key:string; side:'north'|'south'|'east'|'west'; offset:number; width:number; collar:number; edgeIds:string[] }
export interface ScenicJunction { id:string;x:number;z:number;y:number;width:number;depth:number;ports:JunctionPort[] }
export const junctions:ScenicJunction[]=[
  {id:'r3',x:15,z:-5,y:6.01,width:4.4,depth:4.4,ports:[
    {key:'arrival',side:'south',offset:0,width:1.7,collar:1.1,edgeIds:['road-2']},
    {key:'climb',side:'north',offset:0,width:1.7,collar:1,edgeIds:['road-3']},
    {key:'gorge',side:'east',offset:0,width:1.7,collar:1,edgeIds:['road-10','road-23']},
  ]},
  {id:'r4',x:3,z:-12,y:14.46,width:5,depth:5,ports:[
    {key:'arrival',side:'east',offset:1.5,width:1.7,collar:1,edgeIds:['road-3']},
    {key:'summit',side:'east',offset:-1.5,width:1.7,collar:1,edgeIds:['road-11']},
    {key:'return',side:'south',offset:0,width:1.7,collar:1,edgeIds:['road-4']},
  ]},
];
export function portPositions(j:ScenicJunction,p:JunctionPort){
  const dx=p.side==='east'?1:p.side==='west'?-1:0,dz=p.side==='south'?1:p.side==='north'?-1:0;
  const gate={x:j.x+dx*j.width/2+(dz?p.offset:0),z:j.z+dz*j.depth/2+(dx?p.offset:0),y:j.y};
  return {gate,outer:{x:gate.x+dx*p.collar,z:gate.z+dz*p.collar,y:j.y},dx,dz};
}
export function junctionConnection(node:string,edgeId:string){
  const junction=junctions.find(j=>j.id===node),port=junction?.ports.find(p=>p.edgeIds.includes(edgeId));
  return junction&&port?{junction,port,...portPositions(junction,port)}:undefined;
}
export function junctionSurfaceAt(x:number,z:number,padding=0){
  return junctions.find(j=>{
    if(Math.abs(x-j.x)<=j.width/2+padding&&Math.abs(z-j.z)<=j.depth/2+padding)return true;
    return j.ports.some(p=>{
      const {gate,dx,dz}=portPositions(j,p),along=(x-gate.x)*dx+(z-gate.z)*dz,across=(x-gate.x)*dz-(z-gate.z)*dx;
      return along>=-padding&&along<=p.collar+padding&&Math.abs(across)<=p.width/2+padding;
    });
  });
}
/** One shared tread surface owns the core and entry collars; edge meshes stop outside. */
export function isJunctionSegment(a:RoadPosition,b:RoadPosition){return !!junctionSurfaceAt((a.x+b.x)/2,(a.z+b.z)/2);}
/** Closed perimeter portions only. Every road opening is omitted from the guardrail. */
export function junctionBoundary(j:ScenicJunction){
  const segments:{a:RoadPosition;b:RoadPosition}[]=[];
  for(const side of ['north','south','east','west'] as const){
    const horizontal=side==='north'||side==='south',half=(horizontal?j.width:j.depth)/2;
    const openings=j.ports.filter(p=>p.side===side).map(p=>[p.offset-p.width/2-.06,p.offset+p.width/2+.06]).sort((a,b)=>a[0]-b[0]);
    let cursor=-half;
    const point=(t:number)=>({x:j.x+(horizontal?t:side==='east'?j.width/2:-j.width/2),z:j.z+(horizontal?side==='south'?j.depth/2:-j.depth/2:t),y:j.y});
    for(const [lo,hi] of [...openings,[half,half]]){if(lo>cursor+.08)segments.push({a:point(cursor),b:point(Math.min(lo,half))});cursor=Math.max(cursor,hi);}
  }
  for(const p of j.ports){
    const {gate,outer,dx,dz}=portPositions(j,p);
    for(const side of [-1,1])segments.push({
      a:{x:gate.x+dz*side*p.width/2,z:gate.z-dx*side*p.width/2,y:j.y},
      b:{x:outer.x+dz*side*p.width/2,z:outer.z-dx*side*p.width/2,y:j.y},
    });
  }
  return segments;
}
