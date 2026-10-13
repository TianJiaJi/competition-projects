import type {RoadPosition} from '@scene/contracts';

/** One shared forecourt replaces the entrance's individually modelled paths. */
export const entryPlaza={
  ground:.65,
  outline:[[-13,15.5],[10,15.5],[15.5,19],[15.5,25.5],[9.5,28.5],[-7.5,28.5],[-13,24.5]],
};
/** These services open onto the shared paving, without individual access roads. */
export const plazaServiceIds=['t1','market','lower'];
export const plazaPointPositions:Record<string,{x:number;z:number}>={
  entry:{x:4,z:28.2},'gate-out':{x:-5.5,z:28.2},
};
export function isEntryPlaza(x:number,z:number,padding=0){
  return entryPlaza.outline.every((a,i,points)=>{
    const b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1];
    return dx*(z-a[1])-dz*(x-a[0])>=-padding*Math.hypot(dx,dz)-1e-7;
  });
}
/** Split long flat paths at the paving edge so only their exterior part is drawn. */
export function splitPathAtEntryPlaza(path:RoadPosition[]){
  const result:RoadPosition[]=[path[0]];
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,ts:number[]=[];
    for(let k=0;k<entryPlaza.outline.length;k++){
      const c=entryPlaza.outline[k],d=entryPlaza.outline[(k+1)%entryPlaza.outline.length],ex=d[0]-c[0],ez=d[1]-c[1],cross=dx*ez-dz*ex;
      if(Math.abs(cross)<1e-8)continue;
      const t=((c[0]-a.x)*ez-(c[1]-a.z)*ex)/cross,u=((c[0]-a.x)*dz-(c[1]-a.z)*dx)/cross;
      if(t>1e-6&&t<1-1e-6&&u>=0&&u<=1)ts.push(t);
    }
    for(const t of [...new Set(ts)].sort((a,b)=>a-b))result.push({x:a.x+dx*t,y:a.y+(b.y-a.y)*t,z:a.z+dz*t});
    result.push(b);
  }
  return result;
}
export const isEntryPlazaSegment=(a:RoadPosition,b:RoadPosition)=>isEntryPlaza((a.x+b.x)/2,(a.z+b.z)/2);
