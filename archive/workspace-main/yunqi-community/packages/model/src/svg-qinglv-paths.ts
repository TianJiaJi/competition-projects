import {edges} from './data';

type P={x:number;z:number};
export interface PaintedSection {a:P;b:P;c1?:P;c2?:P;d:string;samples:P[]}
export interface PaintedRoad {id:string;d:string;samples:P[];sections:PaintedSection[];bridge:boolean;mountain:boolean}
const number=(v:number)=>Number(v.toFixed(3));
export const omittedPaintedRoadIds=new Set(['road-27','road-28','road-29']);
/** Multi-bend footpaths, hand-composed around hills and coves. Shared graph
 * endpoints remain fixed; the intermediate path belongs only to the painting.
 */
const turns:Record<string,number[][]>={
  'road-0':[[5.2,25.2],[4.4,22.1],[8.3,20.5],[9.4,17.5],[12.1,17.1]],
  'road-1':[[14.4,12.8],[16.3,10.8],[15.8,8.3]],
  'road-2':[[19.7,5.4],[20.9,2.9],[19.4,1.2],[21.3,-1.6],[18.4,-3.5],[16.7,-3.3]],
  'road-3':[[15.8,-7.2],[13.5,-8.5],[11.3,-7.6],[9.8,-10.1],[6.7,-9.7],[5.1,-11.3]],
  'road-4':[[.7,-10.9],[-1.8,-11.9],[-3.8,-11.3],[-8.2,-11.3],[-9.2,-13.4]],
  'road-5':[[-14,-13.3],[-17,-14],[-18.7,-11.8],[-17.4,-9.6],[-20.3,-7.8],[-19.6,-4.9],[-18.1,-3.7],[-19,-1.1]],
  'road-6':[[-18.3,3.8],[-17.7,6.1],[-18.3,8.8],[-16.5,11.5]],
  'road-7':[[-10.2,16.1],[-7,17.3],[-6.2,20.2],[-2.3,21.3],[.1,24.8]],
  'road-8':[[15.8,16.4],[17.4,16.8],[17.9,18.6],[19.6,19.2]],
  'road-9':[[18.4,6.9],[20,7.1],[20.9,6.3]],
  'road-10':[[17,-6.3],[18.7,-6.8]],
  'road-11':[[5.4,-13.9],[7.8,-14.7],[7.1,-16.2],[9.2,-17.5],[8.2,-19.3],[5.8,-19.8]],
  'road-12':[[-12.6,-14.9],[-13.9,-16.3],[-12.5,-17.2]],
  'road-13':[[-16.7,2.1],[-15.8,2.35]],
  'road-14':[[-16.2,14.6],[-18.1,13.2],[-20.8,13.1],[-22.2,11.5]],
  'road-15':[[-12.65,17],[-13.6,19.3],[-11.9,21.2]],
  'road-16':[[-11.3,25.5],[-8.9,26],[-7.8,27.5]],
  'road-17':[[-2.7,27.8],[.4,27.5]],
  'road-18':[[20.5,4.1],[21.3,2.8],[21.1,1.6]],
  'road-19':[[2.2,-20.5],[.8,-19.7],[-.5,-20.3]],
  'road-20':[[-14.1,18.7],[-12.3,20.5],[-13.4,22.4]],
  'road-21':[[8,26.7],[11.4,24.7],[13.5,24.9]],
  'road-22':[[17,14.2],[19.5,15.4],[22.4,15]],
  'road-23':[[16.7,-4.1],[18,-4.7]],
  'road-24':[[5.4,-21.8],[6.8,-21.4]],
  'road-25':[[-18.5,.1],[-18.1,-1.3]],
  'road-26':[[-14.4,12.4],[-16.3,11.8],[-17,10.2]],
};
function section(a:P,b:P,c1?:P,c2?:P):PaintedSection{
  const d=`M${number(a.x)} ${number(a.z)}`+(c1&&c2?`C${number(c1.x)} ${number(c1.z)} ${number(c2.x)} ${number(c2.z)} ${number(b.x)} ${number(b.z)}`:`L${number(b.x)} ${number(b.z)}`);
  const samples=Array.from({length:25},(_,j)=>{
    const t=j/24,u=1-t;
    return c1&&c2?{x:u*u*u*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*b.x,z:u*u*u*a.z+3*u*u*t*c1.z+3*u*t*t*c2.z+t*t*t*b.z}:{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  });
  // Exact endpoints also make adjoining shared corridors deterministic.
  samples[0]=a;samples[samples.length-1]=b;
  return {a,b,c1,c2,d,samples};
}
function compose(ps:P[],straight=false):PaintedSection[]{
  return ps.slice(1).map((p2,i)=>{
    const p0=ps[Math.max(0,i-1)],p1=ps[i],p3=ps[Math.min(ps.length-1,i+2)],f=.15;
    const acrossFalls=p1.x===-3.8&&p2.x===-8.2;
    return straight||acrossFalls?section(p1,p2):section(p1,p2,{x:p1.x+(p2.x-p0.x)*f,z:p1.z+(p2.z-p0.z)*f},{x:p2.x-(p3.x-p1.x)*f,z:p2.z-(p3.z-p1.z)*f});
  });
}
function applySections(road:PaintedRoad,sections:PaintedSection[]){
  road.sections=sections;
  road.d=sections.map((s,i)=>i?s.d.replace(/^M[-\d.]+ [-\d.]+/,''):s.d).join('');
  road.samples=sections.flatMap((s,i)=>i?s.samples.slice(1):s.samples);
}
export const paintedRoads:PaintedRoad[]=edges.filter(e=>e.mode==='walk'&&!omittedPaintedRoadIds.has(e.id)).map(e=>{
  const sourceA=e.path![0],sourceB=e.path!.at(-1)!;
  const a={x:sourceA.x,z:sourceA.z},b={x:sourceB.x,z:sourceB.z};
  const bridge=e.structure==='bridge'||e.id==='road-13';
  const dx=b.x-a.x,dz=b.z-a.z;
  const waypoints=bridge?[]:turns[e.id]??[[a.x+dx*.5-dz*.08,a.z+dz*.5+dx*.08]];
  const road:PaintedRoad={id:e.id,d:'',samples:[],sections:[],bridge,mountain:Math.max(sourceA.y,sourceB.y)>4};
  applySections(road,compose([a,...waypoints.map(([x,z])=>({x,z})),b],bridge));
  return road;
});
const byId=Object.fromEntries(paintedRoads.map(r=>[r.id,r]));
const reverse=(parts:PaintedSection[])=>[...parts].reverse().map(p=>({...section(p.b,p.a,p.c2,p.c1),samples:[...p.samples].reverse()}));
function sharedSpur(id:string,corridor:PaintedSection[],via:number[][]=[]){
  const road=byId[id],end=road.samples.at(-1)!;
  applySections(road,[...corridor,...compose([corridor.at(-1)!.b,...via.map(([x,z])=>({x,z})),end])]);
}
// Nearby paths share the exact same corridor and only branch at the destination.
sharedSpur('road-14',reverse(byId['road-6'].sections.slice(3)),[[-19.6,9.1]]);
sharedSpur('road-26',reverse(byId['road-6'].sections.slice(3)),[[-16.8,8.6]]);
sharedSpur('road-25',reverse(byId['road-5'].sections.slice(-2)));
sharedSpur('road-9',byId['road-2'].sections.slice(0,1));
sharedSpur('road-18',[...reverse(byId['road-9'].sections.slice(-1)),...byId['road-2'].sections.slice(1,3)],[[21.1,1.1]]);
sharedSpur('road-23',reverse(byId['road-2'].sections.slice(-2)));
sharedSpur('road-22',byId['road-8'].sections.slice(0,2),[[21.5,15.8]]);
applySections(byId['road-20'],byId['road-15'].sections.slice(1));
sharedSpur('road-24',reverse(byId['road-11'].sections.slice(-2)));
