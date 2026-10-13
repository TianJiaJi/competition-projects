import {edges,nodes,points,scenicName} from './data';
import {islandOutline,lakeOutline,mountainHeight,waterfallProfile} from './geometry';
import {entryPlaza,isEntryPlazaSegment} from './plaza';
import {siteById} from './places';
import {parkingById,parkingCourts} from './parking';

export interface ScenicSvgOptions {
  showVisitorFixtures?:boolean;
  showLabels?:boolean;
  idPrefix?:string;
  showFacilities?:boolean;
  /** Project the map into a painting sheet; omit for a north-up SVG base map. */
  projection?:{width:number;depth:number;azimuth:number;center?:{x:number;z:number}};
}
const number=(n:number)=>Number(n.toFixed(3));
const xml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const polygon=(p:number[][])=>p.map(([x,z],i)=>`${i?'L':'M'}${number(x)},${number(z)}`).join(' ')+'Z';
const line=(p:{x:number;z:number}[])=>p.map(({x,z},i)=>`${i?'L':'M'}${number(x)},${number(z)}`).join(' ');
export const scenicSvgPoint=(id:string)=>parkingById[id]??siteById[id]?.building??nodes.find(n=>n.id===id);
const coordinate=(id:string)=>scenicSvgPoint(id)!;

// Marching squares produces continuous vector contours of the same mountain
// function as the voxel model. No raster tiles or separately maintained map.
function contour(level:number){
  type P=[number,number];
  const segments:[P,P][]=[];
  const pairs:Record<number,number[][]>={1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],5:[[3,0],[1,2]],6:[[0,2]],7:[[3,2]],8:[[2,3]],9:[[0,2]],10:[[0,1],[2,3]],11:[[1,2]],12:[[1,3]],13:[[0,1]],14:[[3,0]]};
  for(let z=-48;z<48;z+=1.5)for(let x=-48;x<48;x+=1.5){
    const p:P[]=[[x,z],[x+1.5,z],[x+1.5,z+1.5],[x,z+1.5]],h=p.map(([x,z])=>mountainHeight(x,z));
    const code=h.reduce((c,v,i)=>c+(v>=level?1<<i:0),0);
    const crossing=(edge:number):P=>{const a=p[edge],b=p[(edge+1)%4],t=(level-h[edge])/(h[(edge+1)%4]-h[edge]);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
    for(const [a,b] of pairs[code]??[])segments.push([crossing(a),crossing(b)]);
  }
  const key=(p:P)=>`${p[0].toFixed(3)},${p[1].toFixed(3)}`,adjacent=new Map<string,number[]>();
  segments.forEach((segment,i)=>segment.forEach(p=>adjacent.set(key(p),[...(adjacent.get(key(p))??[]),i])));
  const used=new Set<number>(),paths:string[]=[];
  for(let i=0;i<segments.length;i++){
    if(used.has(i))continue;
    used.add(i);const chain=[...segments[i]];let end=chain[1];
    for(let steps=0;steps<segments.length;steps++){
      const next=adjacent.get(key(end))?.find(index=>!used.has(index));if(next===undefined)break;
      used.add(next);const edge=segments[next];end=key(edge[0])===key(end)?edge[1]:edge[0];chain.push(end);
      if(key(end)===key(chain[0]))break;
    }
    paths.push(polygon(chain));
  }
  return paths.join(' ');
}
let terrainLayers:string|undefined;
function terrain(){
  return terrainLayers??= [2.4,4.4,7,10,13,17,20.5].map((h,i)=>`<path d="${contour(h)}" fill="${['#d1dbb7','#b1c9a1','#8db695','#72a496','#518c88','#3f747c','#315f71'][i]}" fill-opacity=".72" stroke="#366f6d" stroke-opacity=".24" stroke-width=".11"/>`).join('');
}
const labelOffsets:Record<string,[number,number]>={summit:[3,-3.2],falls:[-2.2,-3],gorge:[4.3,-2],bamboo:[2,3.3],creek:[3,3.5],lake:[-5,-1.8],forest:[-2.5,3.8],entry:[1,4.5],market:[-5.5,-3.6]};
const symbol=(kind:string)=>{
  if(kind==='terminal')return '<path d="M-1-.9H1V.55H-1ZM0 .55V1M-.5 1H.5" fill="none" stroke="currentColor" stroke-width=".18"/>';
  if(kind==='safety')return '<path d="M-.25-1H.25V-.25H1V.25H.25V1H-.25V.25H-1V-.25H-.25Z" fill="currentColor"/>';
  if(kind==='attraction')return '<path d="M-1.05 .65L-.42-.55 .05 .04 .48-.85 1.15 .65Z" fill="none" stroke="currentColor" stroke-width=".16" stroke-linejoin="round"/>';
  if(kind==='commercial')return '<path d="M-1-.35H1L.7-.95H-.7ZM-.7-.25V.85H.7V-.25M-.2.8V.15H.25V.8" fill="none" stroke="currentColor" stroke-width=".15"/>';
  if(kind==='entrance')return '<path d="M-1-.55H1M-.75-.6V.9M.75-.6V.9M-1.2-.8L0-1.1 1.2-.8" fill="none" stroke="currentColor" stroke-width=".2"/>';
  if(kind==='cable')return '<path d="M-.85-.25H.85V.8H-.85ZM0-.25V-.8M-1-.85H1M-.5 0V.3M.5 0V.3" fill="none" stroke="currentColor" stroke-width=".14"/>';
  return `<text text-anchor="middle" y=".55" font-size="${kind==='parking'?1.65:1.05}" font-family="sans-serif" font-weight="600" fill="currentColor">${kind==='parking'?'P':'WC'}</text>`;
};

/** Standalone, north-up vector artwork. Coordinates and point IDs match the 3D map. */
export function createScenicSvg(options:ScenicSvgOptions={}){
  const {showLabels=true,showFacilities=true,showVisitorFixtures=true,projection}=options;
  const viewBox=projection?`${-projection.width/2} ${-projection.depth/2} ${projection.width} ${projection.depth}`:'-37 -36 76 76';
  const transform=projection?`rotate(${number(projection.azimuth*180/Math.PI)}) translate(${- (projection.center?.x??0)} ${- (projection.center?.z??2)})`:'';
  const island=polygon(islandOutline),lake=polygon(lakeOutline),clipId=(options.idPrefix??'scenic').replace(/[^a-zA-Z0-9_-]/g,'_')+'-terrain-clip';
  const roadLine=(path:{x:number;y:number;z:number}[])=>path.slice(1).map((p,i)=>isEntryPlazaSegment(path[i],p)?'':`M${number(path[i].x)},${number(path[i].z)}L${number(p.x)},${number(p.z)}`).join(' ');
  const paths=edges.filter(e=>e.mode==='walk'&&(showVisitorFixtures||!e.id.startsWith('access-'))).map(e=>`<path data-edge-id="${e.id}" d="${roadLine(e.path!)}"/>`).join('');
  const upper=coordinate('upper'),lower=coordinate('lower');
  const sites=points.filter(p=>(showVisitorFixtures||!['terminal','safety'].includes(p.kind))&&(showFacilities||['attraction','entrance','commercial'].includes(p.kind))).map(point=>{
    const p=coordinate(point.id),offset=labelOffsets[point.id],label=showLabels&&offset;
    const color=point.kind==='attraction'?'#285c67':point.kind==='entrance'?'#6c5736':'#567269';
    return `<g data-point-id="${xml(point.id)}" transform="translate(${number(p.x)} ${number(p.z)})" color="${color}"><title>${xml(point.name)}</title><circle r="1.45" fill="#f6efdb" fill-opacity=".96" stroke="${color}" stroke-width=".16"/>${symbol(point.kind)}${label?`<text x="${offset[0]}" y="${offset[1]}" text-anchor="middle" font-family="Songti SC,STSong,serif" font-size="1.55" font-weight="600" fill="#2d5555" stroke="#f4efd9" stroke-width=".45" paint-order="stroke">${xml(point.id==='market'?'出口商业区':point.name)}</text>`:''}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" ${projection?'width="1536" height="1536" preserveAspectRatio="none"':''} viewBox="${viewBox}" role="img" aria-label="${scenicName}景区导览地图" fill="none">
    <title>${scenicName}景区导览地图</title>
    <g transform="${transform}" stroke-linecap="round" stroke-linejoin="round">
      <path d="${island}" fill="#e0e3c6" stroke="#688679" stroke-width=".25"/>
      <defs><clipPath id="${clipId}"><path d="${island}"/></clipPath></defs><g clip-path="url(#${clipId})">${terrain()}</g>
      <path d="${polygon(entryPlaza.outline)}" fill="#e9dfbe" stroke="#acaa86" stroke-width=".2"/>
      <path d="${lake}" fill="#9dcec0" stroke="#538f87" stroke-width=".32"/>
      <path d="${line(waterfallProfile)}" stroke="#78b6b4" stroke-width="1.25"/>
      <path d="${line(waterfallProfile)}" stroke="#e2f1d9" stroke-width=".35"/>
      <g stroke="#689d92" stroke-width=".11" opacity=".65"><path d="M-8 1q3-1 6 0m-5 1.3q3-1 6 0M-6 5q3-.8 6 0m-5 1.3q3-.8 6 0M6 9q2.5-.8 5 0m-4 1.3q2.5-.8 5 0M23 10q2-.6 4 0"/></g>
      <g stroke="#8c9271" stroke-width=".83">${paths}</g>
      <g stroke="#e2d3a5" stroke-width=".5">${paths}</g>
      <path data-edge-id="cable-down" d="M${upper.x} ${upper.z}L${lower.x} ${lower.z}" stroke="#416c73" stroke-width=".23" stroke-dasharray=".55 .65"/>
      ${parkingCourts.map(c=>`<g fill="#d1d7bd" stroke="#829889" stroke-width=".15"><rect x="${c.x-c.width/2}" y="${c.z-c.depth/2}" width="${c.width}" height="${c.depth}" rx=".4"/>${Array.from({length:6},(_,i)=>`<path d="M${c.x-c.width/2+.8+i*1.1} ${c.z-.5}v1.5h.85v-1.5"/>`).join('')}</g>`).join('')}
      <g stroke="#ad7b4c" stroke-width=".21"><path d="${line(edges.find(e=>e.id==='road-1')!.path!)}"/></g>
      ${sites}
      <g transform="translate(-29 -28)" stroke="#3c6a68" stroke-width=".2"><path d="M0 4V-2M-1-.2L0-2 1-.2"/><text y="6" text-anchor="middle" fill="#3c6a68" stroke="none" font-size="1.45" font-family="serif">北</text></g>
    </g>
  </svg>`;
}
