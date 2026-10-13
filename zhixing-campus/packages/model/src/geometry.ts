import { junctionSurfaceAt } from './junctions';
import { pointCourtAt } from './places';
import { isEntryPlaza,entryPlaza } from './plaza';
import { parkingAreaAt } from './parking';
import type { RoadPosition } from '@scene/contracts';
// The two cut vertices lie on the island's eastern (32,5) → (28,17) edge.
export const lakeOutline = [[-13,-2],[-10,-6],[-5,-7],[1,-5],[5,-1],[6,4],[12,7],[31.2,7.4],[29.0666667,13.8],[20,13.5],[14,13.5],[9,11],[0,12],[-5,13],[-10,10],[-13,5]];
export const lakeCut = [lakeOutline[7], lakeOutline[8]];
export const waterfallProfile: RoadPosition[] = [
  [-30.55,21],[-24,21],[-23.1,20.85],[-23.1,14.5],
  [-18,14.5],[-17.1,14.35],[-17.1,8],
  [-12,8],[-11.1,7.85],[-11.1,2.65],
  [-8,2.65],[-7.1,2.5],[-7.1,.25],[-5.5,0],
].map(([z,y])=>({x:-6,y,z}));
export const watercourseBed = (z:number)=>z < -24 ? 20.6 : z < -18 ? 14.1 : z < -12 ? 7.6 : z < -8 ? 2.25 : -.9;
export const islandOutline = [[-29,18],[-32,8],[-27,1],[-30,-10],[-22,-16],[-20,-25],[-9,-23],[-9,-30],[8,-29],[12,-22],[24,-21],[29,-11],[25,-3],[32,5],[28,17],[21,20],[20,32],[5,34],[-3,35.8],[-17,35.5],[-24,30],[-25,27]];
export function insidePolygon(x: number,z: number, polygon: number[][]) {
  let inside = false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export const isLake = (x:number,z:number)=>insidePolygon(x,z,lakeOutline);
export const isIsland = (x:number,z:number)=>insidePolygon(x,z,islandOutline);
export const isWaterfall = (x:number,z:number)=>z < -5.5 && z >= -30 && Math.abs(x+6)<3.4;
export function mountainHeight(x:number,z:number) {
  return .8 + 19*Math.exp(-((x-4)**2/115+(z+19)**2/115)) + 10*Math.exp(-((x-21)**2/70+(z+12)**2/95)) + 12*Math.exp(-((x+8)**2/95+(z+24)**2/155)) + 4*Math.exp(-((x+24)**2/40+(z+4)**2/160));
}
export function terrainHeight(x:number,z:number) {
  if(isLake(x,z)) return -.9;
  if(isWaterfall(x,z)) return watercourseBed(z);
  if(isEntryPlaza(x,z))return entryPlaza.ground;
  if(parkingAreaAt(x,z))return entryPlaza.ground;
  const court=pointCourtAt(x,z);
  if(court)return court.ground;
  // Small shared terraces keep buildings, service paths and their approaches on
  // one surface, instead of putting each object on a different voxel stair.
  if(x>=-4&&x<=10&&z>=-23&&z<=-18)return 22.1;
  if(x>=-13.5&&x<=-9.5&&z>=-18.5&&z<=-13)return 11.05;
  if(Math.hypot(x-15,z+5)<1.9)return 5.85;
  return Math.round(mountainHeight(x,z)/.65)*.65;
}
export const lakeLevel = .25;
export function polylineLength(path:RoadPosition[]) {
  return path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y,p.z-path[i].z),0)*46;
}
export function distanceToRoadSegment(x:number,z:number,a:{x:number;z:number},b:{x:number;z:number}){
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length)):0;
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}
export function roadPath(anchors:number[][], bridge=false):RoadPosition[] {
  const result:RoadPosition[]=[];
  const length=anchors.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-anchors[i][0],p[1]-anchors[i][1]),0);
  let travelled=0;
  anchors.slice(1).forEach((b,j)=>{
    const a=anchors[j],d=Math.hypot(b[0]-a[0],b[1]-a[1]), count=Math.ceil(d/(bridge?.38:.8));
    for(let i=j?1:0;i<=count;i++){
      const t=i/count,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      const progress=(travelled+d*t)/length;
      const arch=bridge ? terrainHeight(anchors[0][0],anchors[0][1])*(1-progress)+terrainHeight(anchors.at(-1)![0],anchors.at(-1)![1])*progress+.16+1.85*Math.sin(Math.PI*progress) : mountainHeight(x,z)+.24;
      result.push({x,y:arch,z});
    }
    travelled+=d;
  });
  if(bridge)return result;
  // Endpoints stay exactly on the shared node platforms. The road follows smooth
  // mountain height, not the terrain's coarse 0.65-unit voxel terraces.
  result[0].y=terrainHeight(result[0].x,result[0].z)+.16;
  const end=result.at(-1)!;end.y=terrainHeight(end.x,end.z)+.16;
  for(const p of result){
    if(Math.hypot(p.x-result[0].x,p.z-result[0].z)<1.1)p.y=result[0].y;
    if(Math.hypot(p.x-end.x,p.z-end.z)<1.1)p.y=end.y;
  }
  // Span the stream above both banks instead of dropping into the water bed.
  for(let i=0;i<result.length;i++){
    if(!isWaterfall(result[i].x,result[i].z))continue;
    const start=Math.max(0,i-1);
    while(i<result.length&&isWaterfall(result[i].x,result[i].z))i++;
    const finish=Math.min(i,result.length-1),a=result[start],b=result[finish];
    for(let j=start+1;j<finish;j++)result[j].y=a.y+(b.y-a.y)*(j-start)/(finish-start);
  }
  return gradedRoadPath(result);
}

/** Distance to real shore; the map cut is open water, not an artificial shore. */
export function lakeShoreDistance(x:number,z:number) {
  let distance=Infinity;
  for(let i=0;i<lakeOutline.length;i++){
    if(i===7)continue;
    const a=lakeOutline[i],b=lakeOutline[(i+1)%lakeOutline.length];
    const t=Math.max(0,Math.min(1,((x-a[0])*(b[0]-a[0])+(z-a[1])*(b[1]-a[1]))/((b[0]-a[0])**2+(b[1]-a[1])**2)));
    distance=Math.min(distance,Math.hypot(x-a[0]-t*(b[0]-a[0]),z-a[1]-t*(b[1]-a[1])));
  }
  return distance;
}

/** Horizontal treads and small vertical risers shared by every walking path. */
export function gradedRoadPath(anchors:RoadPosition[]):RoadPosition[] {
  const path:RoadPosition[]=[anchors[0]];
  anchors.slice(1).forEach((b,j)=>{
    const a=anchors[j],steps=Math.max(Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.32),Math.ceil(Math.abs(b.y-a.y)/.12));
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      const y=j===anchors.length-2&&i===steps?b.y:Math.round((a.y+(b.y-a.y)*t)/.18)*.18;
      const previous=path.at(-1)!;
      path.push({x,y:previous.y,z});
      if(Math.abs(y-previous.y)>.001)path.push({x,y,z});
    }
  });
  return path;
}

/** Straight flights meet horizontal landings, rather than changing slope at every voxel. */
export function stairFlightPath(anchors:RoadPosition[]):RoadPosition[]{
  const profile:RoadPosition[]=[anchors[0]];
  for(let i=1;i<anchors.length-1;i++){
    const p=anchors[i],before=anchors[i-1],after=anchors[i+1];
    const lead=Math.min(.65,Math.hypot(p.x-before.x,p.z-before.z)/4),trail=Math.min(.65,Math.hypot(after.x-p.x,after.z-p.z)/4);
    const offset=(toward:RoadPosition,d:number)=>{
      const length=Math.hypot(toward.x-p.x,toward.z-p.z);
      return {x:p.x+(toward.x-p.x)*d/length,y:p.y,z:p.z+(toward.z-p.z)*d/length};
    };
    profile.push(offset(before,lead),p,offset(after,trail));
  }
  profile.push(anchors.at(-1)!);
  return gradedRoadPath(profile);
}

/** One real tread per riser; long flights include level rest platforms. */
export function walkableStairPath(anchors:RoadPosition[]):RoadPosition[]{
  const path:RoadPosition[]=[anchors[0]],landing=.65;
  const inset=(p:RoadPosition,toward:RoadPosition,d:number)=>{
    const length=Math.hypot(toward.x-p.x,toward.z-p.z);
    return {x:p.x+(toward.x-p.x)*d/length,y:p.y,z:p.z+(toward.z-p.z)*d/length};
  };
  for(let i=1;i<anchors.length;i++){
    const a=anchors[i-1],b=anchors[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    const start=i===1?a:inset(a,b,Math.min(landing,length/4));
    const finish=i===anchors.length-1?b:inset(b,a,Math.min(landing,length/4));
    if(i>1)path.push(start);
    const distance=Math.hypot(finish.x-start.x,finish.z-start.z),rise=finish.y-start.y;
    if(Math.abs(rise)<.001){path.push(finish);}
    else{
      const count=Math.ceil(Math.abs(rise)/.18-1e-7),rests=Math.floor((count-1)/10),restLength=.7;
      const tread=(distance-rests*restLength)/count;
      let walked=0;
      const point=(run:number,y:number)=>({x:start.x+(finish.x-start.x)*run/distance,y,z:start.z+(finish.z-start.z)*run/distance});
      for(let step=1;step<=count;step++){
        walked+=tread;
        path.push(point(walked,start.y+rise*(step-1)/count),point(walked,start.y+rise*step/count));
        if(step%10===0&&step<count){walked+=restLength;path.push(point(walked,start.y+rise*step/count));}
      }
    }
    // Exact shared endpoint, plus a flat turn with room to change direction.
    if(i<anchors.length-1)path.push(b);else path[path.length-1]=b;
  }
  return path;
}

/** Cut a shallow road bed so voxel shoulders cannot hide the walking surface. */
export function roadGroundHeight(x:number,z:number,paths:RoadPosition[][]) {
  let height=terrainHeight(x,z);
  if(isLake(x,z)||isWaterfall(x,z))return height;
  if(isEntryPlaza(x,z,.65))height=Math.min(height,entryPlaza.ground-.16);
  if(parkingAreaAt(x,z,.6))height=Math.min(height,entryPlaza.ground-.16);
  const junction=junctionSurfaceAt(x,z,.78);
  if(junction)height=Math.min(height,junction.y-.4);
  const court=pointCourtAt(x,z,.6);
  if(court)height=Math.min(height,court.ground-.16);
  for(const path of paths)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    if(x<Math.min(a.x,b.x)-1.35||x>Math.max(a.x,b.x)+1.35||z<Math.min(a.z,b.z)-1.35||z>Math.max(a.z,b.z)+1.35)continue;
    const d=(b.x-a.x)**2+(b.z-a.z)**2;if(d<.00001)continue;
    const t=Math.max(0,Math.min(1,((x-a.x)*(b.x-a.x)+(z-a.z)*(b.z-a.z))/d));
    if(Math.hypot(x-a.x-t*(b.x-a.x),z-a.z-t*(b.z-a.z))<1.35)height=Math.min(height,a.y+(b.y-a.y)*t-.26);
  }
  return height;
}
