import {points, scenicName} from './data';
import {isIsland, insidePolygon, distanceToRoadSegment} from './geometry';
import {paintedRoads} from './svg-qinglv-paths';
import type {ScenicSvgOptions} from './svg-map';

type XY = {x:number;z:number};
type Anchor = (id:string)=>XY|undefined;
const n=(v:number)=>Number(v.toFixed(3));
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const path=(d:string,attrs='')=>`<path d="${d}" ${attrs}/>`;
const poly=(ps:number[][])=>ps.map(([x,z],i)=>`${i?'L':'M'}${n(x)} ${n(z)}`).join(' ')+'Z';
/** Flowing closed brush contours: no polygon corners on the large landscape forms. */
function curvedOutline(ps:number[][],tension=.78){
  const factor=tension/6;
  return `M${ps[0].map(n).join(' ')} `+ps.map((b,i)=>{
    const a=ps[(i+ps.length-1)%ps.length],c=ps[(i+1)%ps.length],d=ps[(i+2)%ps.length];
    return `C${n(b[0]+(c[0]-a[0])*factor)} ${n(b[1]+(c[1]-a[1])*factor)} ${n(c[0]-(d[0]-b[0])*factor)} ${n(c[1]-(d[1]-b[1])*factor)} ${c.map(n).join(' ')}`;
  }).join(' ')+'Z';
}
function outlinePoint(ps:number[][],i:number,t:number,tension=.85){
  const a=ps[(i+ps.length-1)%ps.length],b=ps[i],c=ps[(i+1)%ps.length],d=ps[(i+2)%ps.length],f=tension/6,u=1-t;
  return [0,1].map(k=>u*u*u*b[k]+3*u*u*t*(b[k]+(c[k]-a[k])*f)+3*u*t*t*(c[k]-(d[k]-b[k])*f)+t*t*t*c[k]);
}
const paintedLake=[[-13,2],[-12,-3],[-7,-6],[-2,-6],[3,-3],[6,3],[12,7],[23,7.1],[38,7.4],[38,13.8],[23,13.5],[15,12.9],[8,12],[1,12],[-5,12.5],[-10,9],[-13,5]];
const lakeShape=curvedOutline(paintedLake,.85);
const lakeSamples=paintedLake.flatMap((_,i)=>Array.from({length:16},(_,j)=>outlinePoint(paintedLake,i,j/16)));
const isPaintedLake=(x:number,z:number)=>insidePolygon(x,z,lakeSamples);
const paintedCourt=[[-12,18.7],[-8.3,18],[-4.7,19.4],[-.4,19.2],[3.6,17.3],[7.5,18],[9.8,20.1],[14.7,21.2],[15.4,23.8],[12.8,25.5],[10.6,28],[6.3,29.3],[2.6,28.4],[-.8,29.1],[-4.7,28.9],[-7.4,27.2],[-9.3,24.8],[-12.6,23.2],[-11.5,21]];
const courtShape=curvedOutline(paintedCourt,.9);
const isPaintedCourt=(x:number,z:number)=>insidePolygon(x,z,paintedCourt);
const line=(ps:XY[])=>ps.map((p,i)=>`${i?'L':'M'}${n(p.x)} ${n(p.z)}`).join(' ');
const group=(x:number,z:number,s:number,body:string,attrs='')=>`<g transform="translate(${n(x)} ${n(z)}) scale(${n(s)})" ${attrs}>${body}</g>`;
function random(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const serif='Songti SC,STSong,Noto Serif CJK SC,serif';

/** Reusable, genuinely vector brushwork. No external images, fonts, or CSS. */
function definitions(id:string){return `<defs>
  <radialGradient id="${id}-paper"><stop offset="0" stop-color="#f8f1de"/><stop offset=".78" stop-color="#f8f2e4" stop-opacity=".95"/><stop offset="1" stop-color="#faf6eb" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}-mountain" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#235f68"/><stop offset=".32" stop-color="#4a8c83"/><stop offset=".7" stop-color="#8ca77a"/><stop offset="1" stop-color="#d9d2a5" stop-opacity="0"/></linearGradient>
  <linearGradient id="${id}-peak-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset=".62" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <mask id="${id}-peak-mask" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${id}-peak-fade)"/></mask>
  <linearGradient id="${id}-shade" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="#143e55" stop-opacity=".72"/><stop offset=".58" stop-color="#306e76" stop-opacity=".36"/><stop offset="1" stop-color="#559b8b" stop-opacity="0"/></linearGradient>
  <linearGradient id="${id}-mist" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f8f2e5" stop-opacity="0"/><stop offset=".6" stop-color="#f8f2e5" stop-opacity=".8"/><stop offset="1" stop-color="#f8f2e5" stop-opacity="0"/></linearGradient>
  <linearGradient id="${id}-water" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#81b6a8" stop-opacity=".7"/><stop offset=".45" stop-color="#b5d2bd" stop-opacity=".72"/><stop offset="1" stop-color="#d6e0c9" stop-opacity=".25"/></linearGradient>
  <linearGradient id="${id}-fade"><stop offset="0" stop-color="white"/><stop offset=".85" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <mask id="${id}-water-fade" maskUnits="userSpaceOnUse" x="-16" y="-9" width="54" height="26"><rect x="-16" y="-9" width="54" height="26" fill="url(#${id}-fade)"/></mask>
  <radialGradient id="${id}-ground"><stop stop-color="#c3c59c" stop-opacity=".36"/><stop offset=".66" stop-color="#d7d2b1" stop-opacity=".22"/><stop offset="1" stop-color="#e6ddc2" stop-opacity="0"/></radialGradient>
  <filter id="${id}-soft" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation=".2"/></filter>
  <pattern id="${id}-grain" patternUnits="userSpaceOnUse" width="3.3" height="2.9"><g fill="#847b57" opacity=".1"><circle cx=".25" cy=".4" r=".022"/><circle cx="1.2" cy="2.1" r=".016"/><circle cx="2.8" cy=".9" r=".025"/><path d="M.7 1.1h.1v.012H.7ZM2.1 2.6h.18v.015H2.1Z"/></g></pattern>
 </defs>`;}

/** Each peak has its own silhouette, ridge, strata and seeded broken ink strokes. */
function mountain(id:string,x:number,z:number,w:number,h:number,seed:number,opacity=1){
  const r=random(seed);
  const peakShift=(r()-.5)*.12;
  const shapes=[
    [[-.5,.05],[-.44,-.18],[-.32,-.32],[-.31,-.56],[-.22,-.62],[-.18,-.83],[-.06,-1],[.03,-.96],[.12,-.72],[.25,-.69],[.26,-.47],[.39,-.2],[.5,.05]],
    [[-.5,.05],[-.43,-.22],[-.35,-.25],[-.33,-.61],[-.18,-.7],[-.12,-.94],[.02,-1],[.13,-.85],[.14,-.65],[.27,-.51],[.29,-.29],[.42,-.12],[.5,.05]],
    [[-.5,.05],[-.42,-.14],[-.4,-.4],[-.26,-.48],[-.23,-.79],[-.13,-.91],[-.05,-1],[.1,-.97],[.13,-.77],[.24,-.74],[.28,-.36],[.41,-.2],[.5,.05]],
    [[-.5,.05],[-.44,-.25],[-.3,-.39],[-.31,-.6],[-.19,-.69],[-.18,-.88],[-.02,-1],[.08,-.82],[.19,-.74],[.18,-.58],[.34,-.4],[.4,-.11],[.5,.05]],
  ];
  const profile=shapes[seed%4].map(([px,py],i)=>[w*(px+(i>1&&i<11?peakShift+(r()-.5)*.055:0)),h*py]);
  const peak=profile[6][0];
  const silhouette=curvedOutline(profile,.76);
  const shadow=curvedOutline(profile.slice(6).concat([[w*.08,h*.02],[w*.02,-h*.3],[w*.04,-h*.48],[-w*.01,-h*.72]]),.66);
  let ink='';
  for(let i=0;i<95;i++){
    const t=.1+r()*.77,side=r()<.54?-1:1,spread=(1-t)*w*.4;
    const px=peak*t+side*spread*r(),py=-h*t;
    const length=.2+r()*h*.12,dx=(r()-.5)*.28;
    ink+=path(`M${n(px)} ${n(py)}q${n(dx)} ${n(length*.35)} ${n(dx-.04)} ${n(length*.58)}t${n(dx+.06)} ${n(length*.42)}`,`stroke="${i%4===0?'#b8c294':'#244f50'}" stroke-width="${n(.025+r()*.04)}" opacity="${n(.12+r()*.28)}"`);
    if(i%3===0)ink+=path(`M${n(px-.12)} ${n(py+.18)}l.22-.1 .18.04`, 'stroke="#d7ce9f" stroke-width=".045" opacity=".3"');
  }
  let dots='';
  for(let i=0;i<130;i++){
    const t=.2+r()*.68,px=peak*t+(r()-.5)*w*(1-t)*.56,py=-h*t;
    dots+=`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(.008+r()*.024)}" ry="${n(.01+r()*.04)}" fill="${i%3?'#204e50':'#e0d2a4'}" opacity=".24"/>`;
  }
  for(let i=0;i<23;i++){
    const t=r(),px=-w*.36+t*w*.68,py=-h*(.14+.2*Math.sin(t*3));
    dots+=`<ellipse cx="${n(px)}" cy="${n(py+r()*.6)}" rx="${n(.04+r()*.08)}" ry="${n(.025+r()*.06)}" fill="#365d47" opacity=".65"/>`;
  }
  return group(x,z,1,`
    ${path(silhouette,`fill="url(#${id}-mountain)"`)}
    ${path(shadow,`fill="url(#${id}-shade)"`)}
    ${path(silhouette, 'stroke="#294f4e" stroke-width=".075" opacity=".6"')}
    ${path(`M${-w*.34} ${-h*.29}L${-w*.24} ${-h*.45} ${-w*.16} ${-h*.47} ${-w*.13} ${-h*.68}M${w*.3} ${-h*.2}L${w*.16} ${-h*.37} ${w*.16} ${-h*.56}M${-w*.12} ${-h*.08}L${-w*.07} ${-h*.35} ${w*.02} ${-h*.48}`, 'stroke="#315f59" stroke-width=".075" opacity=".55"')}
    ${path(`M${-w*.3} ${-h*.35}Q${-w*.21} ${-h*.48} ${-w*.18} ${-h*.6}M${-w*.25} ${-h*.32}Q${-w*.16} ${-h*.43} ${-w*.14} ${-h*.55}M${w*.06} ${-h*.7}Q${w*.14} ${-h*.62} ${w*.12} ${-h*.46}M${w*.09} ${-h*.65}Q${w*.18} ${-h*.52} ${w*.15} ${-h*.35}`, 'stroke="#bdc193" stroke-width=".1" opacity=".38"')}${ink}${dots}
    <ellipse cy="1" rx="${w*.68}" ry="1.6" fill="url(#${id}-mist)"/>
  `,`opacity="${opacity}" mask="url(#${id}-peak-mask)"`);
}
function rock(x:number,z:number,s:number,seed:number){
  const r=random(seed),a=.2+r()*.35;
  return group(x,z,s,`${path(`M-1 .2L-.7-.4 -.2-${n(a+.35)} .45-.55 1 .1 .55.4Z`,'fill="#a2b295" stroke="#536e5c" stroke-width=".08"')}${path(`M-.2-${n(a+.35)}L-.08-.15 .55.4M-.7-.4L-.08-.15 1 .1M-.55 .12l.3-.1M.32-.2l.23.12`,'stroke="#687d65" stroke-width=".065"')}`);
}
function pine(seed:number){
  const r=random(seed),lean=(r()-.5)*.9;
  let crown='';
  const clusters=[[-.8,-1.45,.7],[.6,-2.05,.77],[-.35,-2.65,.72],[.08,-3.15,.47]];
  for(const [cx,cy,size] of clusters){
    for(let j=0;j<8;j++){
      const px=cx+lean+(r()-.5)*size*1.6,py=cy+(r()-.5)*.28;
      crown+=path(`M${n(px-.21)} ${n(py)}q.04-.17.18-.11q.12-.19.22.02q.2-.06.22.12q-.26.16-.62-.03Z`,`fill="${j%3?'#3d6958':'#67816a'}" stroke="#244d46" stroke-width=".032" opacity=".88"`);
    }
  }
  return `${path(`M-.12 0Q.28-1.1 ${lean} -2.8L${lean+.14}-2.83Q.04-1.1.14 0Z`,'fill="#968968" stroke="#52654e" stroke-width=".055"')}${path(`M.05-1.3L${-.85+lean}-1.64M.08-1.8L${.8+lean}-2.14M${lean}-2.3L${-.5+lean}-2.73`,'stroke="#455f49" stroke-width=".09"')}${crown}${path('M-.32.06Q0-.15.38.07','stroke="#62775b" stroke-width=".05"')}`;
}
function bamboo(seed:number){
  const r=random(seed);let result='';
  for(let j=0;j<5;j++){
    const x=(j-2)*.24,h=1.9+r()*1.5,lean=(r()-.5)*.7;
    result+=path(`M${x} 0Q${n(x+lean*.4)} ${n(-h*.5)} ${n(x+lean)} ${n(-h)}`,'stroke="#49795c" stroke-width=".045"');
    for(let k=1;k<5;k++){
      const y=-h*k/5,bx=x+lean*k/5;
      result+=path(`M${n(bx-.055)} ${n(y)}h.11`,'stroke="#d6d5a9" stroke-width=".045"');
      const side=k%2?1:-1;
      result+=path(`M${n(bx)} ${n(y)}q${n(side*.2)}-.3 ${n(side*.65)}-.4`,'stroke="#37604b" stroke-width=".035"');
      for(let l=0;l<3;l++)result+=path(`M${n(bx+side*(.15+l*.13))} ${n(y-.18-l*.07)}q${n(side*.25)}-.25 ${n(side*.4)}-.22q${n(-side*.09)}.23 ${n(-side*.4)}.22Z`,`fill="${l%2?'#537d53':'#376750'}" opacity=".85"`);
    }
  }
  return result;
}
function broadleaf(seed:number){
  const r=random(seed);let leaves='';
  for(let j=0;j<12;j++)leaves+=`<ellipse cx="${n((r()-.5)*1.7)}" cy="${n(-1.2-r()*.8)}" rx="${n(.23+r()*.3)}" ry="${n(.19+r()*.25)}" fill="${['#728e62','#a6ab70','#577b5a'][j%3]}" opacity=".7" stroke="#647a53" stroke-width=".03"/>`;
  return path('M0 0v-1.8M0-.8l-.5-.55M0-1.05l.6-.5','stroke="#6f7051" stroke-width=".065"')+leaves;
}
function pavilion(x:number,z:number,s:number,kind:'pavilion'|'house'|'gate'='pavilion'){
  const gate=kind==='gate',house=kind==='house';
  let details='';
  for(let i=0;i<9;i++)details+=path(`M${n(-1.25+i*.31)}-1.65l-.15.38`,'stroke="#b6c0a6" stroke-width=".045"');
  return group(x,z,s,`
    <ellipse cy=".16" rx="1.9" ry=".36" fill="#5e7158" opacity=".09"/>
    ${path('M-1.55-.15L1.25-.15 1.65.16-1.25.16Z','fill="#d7cba5" stroke="#7f866a" stroke-width=".06"')}
    ${house?path('M-1.2-1.3H1.2V-.15H-1.2Z','fill="#eee3c6" stroke="#687d69" stroke-width=".07"'):''}
    ${path(`M-1.12-.15V-1.45M1.12-.15V-1.45${gate?'':'M-.62-.15V-1.3M.62-.15V-1.3'}`,'stroke="#8c7152" stroke-width=".12"')}
    ${path('M-1.12-1.24H1.12','stroke="#78684d" stroke-width=".12"')}
    ${path(`M-1.75-1.25Q-.8-1.6 0-${gate?'2.1':'2.25'}Q.75-1.6 1.75-1.25L1.27-1.12H-1.27Z`,'fill="#466769" stroke="#2b5353" stroke-width=".075"')}
    ${path('M-1.75-1.25q.3.03.4-.14M1.75-1.25q-.3.03-.4-.14M-.14-2.22h.28','stroke="#345751" stroke-width=".09"')}
    ${details}
    ${house?path('M-.3-.16v.01V-.93h.55v.77M-.95-.85h.4v.36h-.4ZM.58-.85h.4v.36h-.4Z','fill="#697d71" stroke="#9eac8b" stroke-width=".06"'):gate?path('M-.5-1.19H.5V-.83H-.5Z','fill="#536c5c" stroke="#a89b69" stroke-width=".04"'):path('M-1.1-.36H1.1M-1.1-.65H-.64M.64-.65H1.1M-.85-.36v-.29M.85-.36v-.29','stroke="#9a8259" stroke-width=".07"')}
  `);
}
function deck(x:number,z:number,s:number){
  let slats='';for(let i=0;i<10;i++)slats+=path(`M${n(-1.5+i*.3)}-.35v.95`,'stroke="#9b906d" stroke-width=".035"');
  return group(x,z,s,path('M-1.65-.5H1.65V.7H-1.65Z','fill="#d8c6a0" stroke="#807e60" stroke-width=".075"')+slats+path('M-1.65.2H1.65M-1.65-.06H1.65M-1.6-.2v.9M-1-.2v.9M-.35-.2v.9M.35-.2v.9M1-.2v.9M1.6-.2v.9','stroke="#8b7856" stroke-width=".06"'));
}

const segments=paintedRoads.flatMap(e=>e.samples.slice(1).map((b,i)=>({a:e.samples[i],b})));
function nearRoad(x:number,z:number,d:number){return segments.some(({a,b})=>distanceToRoadSegment(x,z,a,b)<d);}
function planting(anchor:Anchor){
  const r=random(93435),trees:{x:number;z:number;s:number;kind:string;seed:number}[]=[];
  // Irregular groves composed around the real land and route corridors.
  const groves=[[-22,9,5,6,57,'pine'],[25,3,4,5,58,'bamboo'],[-23,-7,5,8,32,'pine'],[14,-18,6,6,28,'pine'],[-15,-22,5,4,22,'pine'],[24,18,5,3,18,'broad'],[1,29,20,4,42,'broad'],[-23,23,3,5,14,'pine']] as const;
  const occupied=points.filter(p=>p.kind!=='parking').map(p=>anchor(p.id)!);
  for(const [cx,cz,rx,rz,count,kind] of groves){
    for(let i=0;i<count;i++){
      // Bounded attempts; rejection preserves readable road and facility corridors.
      const angle=r()*Math.PI*2,radius=Math.sqrt(r()),x=cx+Math.cos(angle)*radius*rx,z=cz+Math.sin(angle)*radius*rz,s=.36+r()*.28;
      if(!isIsland(x,z)||isPaintedLake(x,z)||isPaintedCourt(x,z)||Math.abs(x+6)<1.3&&z<-5.5||nearRoad(x,z,.75)||nearRoad(x,z-s*1.6,.55)||occupied.some(p=>Math.hypot(p.x-x,p.z-z)<1.1))continue;
      trees.push({x,z,s,kind,seed:Math.floor(r()*100000)});
    }
  }
  return `<g data-layer="vegetation">${trees.sort((a,b)=>a.z-b.z).map(t=>group(t.x,t.z,t.s,t.kind==='pine'?pine(t.seed):t.kind==='bamboo'?bamboo(t.seed):broadleaf(t.seed))).join('')}</g>`;
}
function terrain(id:string){
  const rear=[[-17,-22,15,9,1,.25],[-1,-25,17,9,2,.24],[15,-21,20,10,3,.21],[25,-14,12,13,5,.16]];
  const front=[[-15,-18,12,13,13,.82],[-4,-20,10,12,43,.95],[6,-19,16,14,71,1],[17,-13,11,13,102,.96],[24,-7,9,12,123,.86],[-24,-3,8,12,152,.7],[-15,-8,8,9,184,.64],[1,-9,9,10,264,.63],[12,-4,8,11,338,.72]];
  return `<g data-layer="terrain">
    <ellipse cx="0" cy="8" rx="35" ry="30" fill="url(#${id}-ground)"/>
    <path d="M-29-7Q-31-18-19-20T1-20Q17-23 26-13T26 1Q16-4 6-3T-19 2Z" fill="url(#${id}-ground)"/>
    ${rear.map(([x,z,w,h,s,o])=>mountain(id,x,z,w,h,s,o)).join('')}
    <path d="M-30-19Q-14-26 0-22T31-18L31-15Q10-19-7-18T-30-16Z" fill="url(#${id}-mist)"/>
    ${front.map(([x,z,w,h,s,o])=>mountain(id,x,z,w,h,s,o)).join('')}
    ${path('M-29 0Q-26-8-21-5T-16 4M17 17Q23 14 28 17M-24 18Q-19 13-14 17','stroke="#a0aa7d" stroke-width=".15" opacity=".4"')}
    <path d="M-29-8Q-17-14-3-10T27-8L28-5Q11-10-2-7T-29-5Z" fill="url(#${id}-mist)" opacity=".65"/>
  </g>`;
}
function water(id:string){
  // Only the east boundary is an open water cut, so it extends into a masked wash.
  let ripples='';const r=random(492);
  for(let i=0;i<88;i++){
    const x=-12+r()*48,z=-5+r()*18;
    if(!isPaintedLake(x,z))continue;
    const length=.25+r()*1.5;
    ripples+=path(`M${n(x)} ${n(z)}q${n(length*.5)} ${n(-.12-r()*.08)} ${n(length)} 0`,`stroke="${i%3?'#6d9f96':'#f9f6e6'}" stroke-width="${i%3?'.035':'.065'}" opacity=".38"`);
  }
  let shore='';
  for(let i=0;i<paintedLake.length;i++){
    if(i===8||i===9)continue;
    for(let t=.07+r()*.15;t<1;t+=.08+r()*.27){
      const [x,z]=outlinePoint(paintedLake,i,t);
      if(nearRoad(x,z,.7))continue;
      shore+=rock(x+(r()-.5)*.3,z+(r()-.5)*.24,.13+r()*.32,i*89+Math.round(t*100));
      if(r()>.6)shore+=rock(x+.3,z+.12,.16,i*43);
      if(i%3===0)shore+=group(x+.2,z,.5,path('M0 0q-.05-.8-.3-1M.15.05q.4-.7.25-1.3M.1 0v-1.5M.1-.85l.24-.3M-.04-.5l-.3-.2','stroke="#87976b" stroke-width=".055"'));
    }
  }
  return `<g data-layer="water" mask="url(#${id}-water-fade)">
    ${path(lakeShape,`fill="url(#${id}-water)"`)}
    
    ${path('M-10-1Q-6-4-2-2L1 3-1 2-2 5-4 0-5 3-7-1-8 2Z','fill="#4c8880" opacity=".06"')}
    ${ripples}${shore}
  </g>`;
}
function waterfall(id:string){
  const r=random(3514);let threads='',spray='',mist='';
  for(let i=0;i<11;i++){
    const x=-7.3+i*.16,finish=-7.5+i*.29;
    threads+=path(`M${n(x)} -27.8C${n(x+.75)} -24.5 ${n(x+.5)} -19.8 ${n(x+.3)} -17.1S${n(finish-.2)} -10.8 ${n(finish)} -7.3`, `stroke="${i%3?'#fdfcf2':'#b7d1bf'}" stroke-width="${n(.035+r()*.075)}" opacity="${n(.45+r()*.45)}"`);
  }
  for(let i=0;i<44;i++){
    const side=i%2?1:-1,x=-6+side*(.5+r()*2.8),z=-6.8-r()*2.1;
    spray+=path(`M${n(x)} ${n(z)}q${n(side*.12)}-.35 ${n(side*.38)}-.55`,'stroke="#fdfcf1" stroke-width=".055" opacity=".85"');
    spray+=`<circle cx="${n(x+side*.25)}" cy="${n(z-.6-r()*.7)}" r="${n(.025+r()*.055)}" fill="#fcfbef" opacity=".8"/>`;
  }
  for(let i=0;i<13;i++){
    const x=-10.1+i*.66,z=-6.6+Math.sin(i*1.7)*.4;
    mist+=`<ellipse cx="${n(x)}" cy="${n(z)}" rx="${n(.65+r()*.7)}" ry="${n(.24+r()*.4)}" fill="#faf9ec" opacity="${n(.45+r()*.4)}"/>`;
  }
  return `<g data-layer="waterfall" data-waterfall-type="single-plunge">
    <defs><linearGradient id="${id}-cliff" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="#335b60" stop-opacity=".15"/><stop offset=".6" stop-color="#2e6269" stop-opacity=".85"/><stop offset="1" stop-color="#173f50" stop-opacity=".9"/></linearGradient><linearGradient id="${id}-torrent" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f8f9e9"/><stop offset=".6" stop-color="#fefff4"/><stop offset="1" stop-color="#f9faf0" stop-opacity=".65"/></linearGradient></defs>
    ${path('M-9.3-29Q-11-24-9.6-20T-10.3-12Q-11.2-8-9.1-5.6L-6.7-6.2Q-7.5-11-7.1-17T-7-28Z',`fill="url(#${id}-cliff)"`)}
    ${path('M-5.2-28.5Q-1.8-25-3.3-19.5T-1.5-11Q-1.6-7-3.3-5.2L-5.2-6.8Q-4.9-13-4.8-18.4T-5.2-28.5Z',`fill="url(#${id}-mountain)" opacity=".74"`)}
    ${path('M-8.8-27Q-9.6-24-8.6-21T-9-14M-8.2-25Q-8.6-21-8-17M-4-25Q-2.9-21-4-18M-3.1-17Q-2.8-14-3.5-10M-9.5-11l.4 3','stroke="#294c53" stroke-width=".075" opacity=".6"')}
    ${path('M-8.4-30.7Q-8.7-29.2-7.4-28.4L-5.6-28.3Q-6.2-29.2-6.4-30.4Z','fill="#aed0bd" opacity=".9"')}
    ${path('M-7.5-28.6C-7.9-25.8-6.6-24.4-6.8-21.2C-7.2-16.1-6.3-12.6-7.8-7.3Q-6.1-6.5-3.8-7.2C-5.7-12.4-4.3-18.3-5.2-23.9Q-5.8-26.4-5.4-28.6Z',`data-fall-curtain="main" fill="url(#${id}-torrent)"`)}
    ${path('M-7.9-28.5Q-6.8-28.8-5.3-28.5','stroke="#fdfcf2" stroke-width=".2"')}${threads}
    <ellipse cx="-6.1" cy="-6.3" rx="4.4" ry="1.2" fill="#94bbac" opacity=".55"/>
    ${path('M-9.7-6.3Q-6.3-7.5-2.6-6.2M-8.6-5.7q2.6-.7 5.4-.1','stroke="#739f94" stroke-width=".07" opacity=".6"')}
    ${spray}<g filter="url(#${id}-soft)">${mist}</g>
    ${path('M-10.4-6.1q1.2-.7 2.5-.25q1.2-.8 2.5-.1q1.6-.6 3.1.1M-8.9-5.5q1.7-.35 3.5-.1t3.5-.1','stroke="#fafaf0" stroke-width=".11" opacity=".9"')}
  </g>`;
}
function roadRibbon(samples:XY[],halfWidth:number){
  const left:number[][]=[],right:number[][]=[];
  samples.forEach((p,i)=>{
    const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)],length=Math.hypot(b.x-a.x,b.z-a.z)||1;
    const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    const width=halfWidth*(1+.1*Math.sin(p.x*1.1+p.z*.7)+.045*Math.sin(p.x*2.3-p.z*1.7));
    left.push([p.x-dz*width,p.z+dx*width]);right.push([p.x+dz*width,p.z-dx*width]);
  });
  return poly([...left,...right.reverse()]);
}
function roads(id:string,showFixtures:boolean){
  let routes='',details='',bridges='',identities='';
  const drawn=new Set<string>();
  for(const e of paintedRoads){
    if(!showFixtures&&e.id.startsWith('access-'))continue;
    identities+=path(e.d,`data-edge-id="${e.id}" fill="none" stroke="#998867" stroke-width=".55" opacity="0"`);
    const access=e.id.startsWith('access-'),width=access?.12:.28;
    for(const part of e.sections){
      const key=part.samples.map(p=>`${n(p.x)},${n(p.z)}`).join(';'),back=[...part.samples].reverse().map(p=>`${n(p.x)},${n(p.z)}`).join(';');
      if(drawn.has(key)||drawn.has(back))continue;
      drawn.add(key);
      routes+=`<g data-road-shape="${e.bridge?'straight-bridge':'winding'}"><path d="${roadRibbon(part.samples,width)}" fill="#998867" fill-opacity=".66"/><path d="${roadRibbon(part.samples,width*.79)}" fill="#ead6ad"/></g>`;
      let travelled=0;
      for(let i=1;i<part.samples.length;i++){
      const a=part.samples[i-1],b=part.samples[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.005)continue;
      const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
      const bridge=e.bridge||Math.abs((a.x+b.x)/2+6)<1.65&&a.z<-5.5;
      if(bridge)bridges+=path(`M${n(a.x-dz*.31)} ${n(a.z+dx*.31)}L${n(b.x-dz*.31)} ${n(b.z+dx*.31)}M${n(a.x+dz*.31)} ${n(a.z-dx*.31)}L${n(b.x+dz*.31)} ${n(b.z-dx*.31)}`,'stroke="#736e50" stroke-width=".07"');
      const stairs=e.mountain&&Math.floor(travelled/2.8)%3===1;
      const spacing=bridge?.24:stairs?.2:.8;
      for(let at=spacing-travelled%spacing;at<=length;at+=spacing){
        const x=a.x+dx*at,z=a.z+dz*at,half=bridge?.27:width*.62;
        if(bridge||stairs)details+=path(`M${n(x-dz*half)} ${n(z+dx*half)}l${n(dz*half*2)} ${n(-dx*half*2)}`,'stroke="#a18b66" stroke-width=".047" opacity=".65"');
        else if(!access)details+=path(`M${n(x-dz*half*.5)} ${n(z+dx*half*.5)}l${n(dx*.17)} ${n(dz*.17)} ${n(dz*half*.7)} ${n(-dx*half*.7)} ${n(-dx*.22)} ${n(-dz*.22)}Z`,'fill="#c2ad86" opacity=".38"');
      }
      travelled+=length;
      }
    }
  }
  return `<defs><mask id="${id}-route-court" maskUnits="userSpaceOnUse" x="-37" y="-36" width="76" height="76"><rect x="-37" y="-36" width="76" height="76" fill="white"/>${path(courtShape,'fill="black"')}</mask></defs><g data-layer="roads" mask="url(#${id}-route-court)">${routes}${details}${bridges}<g data-layer="route-identities">${identities}</g></g>`;
}
function cableStation(x:number,z:number){
  return group(x,z,.88,`${path('M-1.6-.1H1.7V-1.5H-1.6Z','fill="#d9cba8" stroke="#64705a" stroke-width=".09"')}${path('M-2-1.5Q-1-1.7-.4-2.35L1.8-1.75 2.2-1.42Z','fill="#436568" stroke="#35554f" stroke-width=".08"')}${path('M-1.2-.12V-1.35M.95-.12V-1.3M-.75-.3H.55V-1.13H-.75Z','fill="#6e8c82" stroke="#9a865e" stroke-width=".1"')}<circle cx="-.1" cy="-.65" r=".32" fill="#d3cbaa" stroke="#3f625b" stroke-width=".09"/>${path('M-.1-.97v.64M-.42-.65H.22M-1.8.02H1.9','stroke="#6f7557" stroke-width=".065"')}`);
}
function buildings(anchor:Anchor){
  const a=(id:string)=>anchor(id)!;
  let result='';
  for(const [id,s] of [['summit',.87],['falls',.72],['bamboo',.64],['lake',.71]] as const){
    const p=a(id);result+=`<g data-landmark-id="${id}">${deck(p.x,p.z+.15,s)}${pavilion(p.x,p.z,s)}</g>`;
  }
  for(const id of ['creek','gorge']){const p=a(id);result+=`<g data-landmark-id="${id}">${deck(p.x,p.z,.85)}</g>`;}
  const forest=a('forest');result+=`<g data-landmark-id="forest">${rock(forest.x,forest.z,.45,23)}${group(forest.x+.5,forest.z+.6,.6,path('M-.65-.3H.65V-.1H-.65ZM-.45-.1V.2M.45-.1V.2','fill="#b6b493" stroke="#747f64" stroke-width=".07"'))}</g>`;
  const market=a('market');
  result+=`<g data-landmark-id="market">${path(`M${market.x-3} ${market.z-1.5}h6v3h-6Z`,'fill="#e1d8b8" opacity=".45"')}${pavilion(market.x-1.55,market.z-.85,.67,'house')}${pavilion(market.x+1.35,market.z-.65,.78,'house')}${pavilion(market.x-.35,market.z+1,.66,'house')}</g>`;
  for(const id of ['supply','upper','lower']){const p=a(id);result+=`<g data-landmark-id="${id}">${id==='supply'?pavilion(p.x,p.z,.68,'house'):cableStation(p.x,p.z)}</g>`;}
  for(const id of ['entry','gate-out']){const p=a(id);result+=`<g data-landmark-id="${id}">${pavilion(p.x,p.z,id==='entry'?1:.63,'gate')}</g>`;}
  return `<g data-layer="landmarks">${result}</g>`;
}
function plaza(id:string){
  const r=random(6213);let stones='';
  // Irregular flagstones are concentrated around the gates and gradually dissolve.
  for(let i=0;i<180;i++){
    const x=-13+r()*29,z=17+r()*13;
    if(!isPaintedCourt(x,z))continue;
    const w=.23+r()*.48,h=.13+r()*.19;
    stones+=path(curvedOutline([[x-w,z],[x-w*.6,z-h],[x+w*.6,z-h*.8],[x+w,z+h*.2],[x+w*.2,z+h],[x-w*.8,z+h*.7]],.5),`fill="${i%4?'#dcccad':'#ece0c4'}" fill-opacity="${n(.18+r()*.24)}" stroke="#b5a786" stroke-width=".025" stroke-opacity=".24"`);
  }
  let margin='';
  for(let i=0;i<paintedCourt.length;i++){
    const [x,z]=outlinePoint(paintedCourt,i,.2+r()*.5,.9);
    if(nearRoad(x,z,1.1)||points.some(p=>{const q=labels[p.id];return q&&Math.hypot(q.x-x,q.z-z)<1.5;}))continue;
    margin+=rock(x,z,.3+r()*.3,98+i)+group(x+.4,z+.3,.43,broadleaf(i*19));
  }
  return `<g data-layer="courts" data-court-shape="garden-clearing"><defs><clipPath id="${id}-plaza-clip">${path(courtShape)}</clipPath></defs>
    ${path(courtShape,'fill="#e5d5b3" fill-opacity=".28"')}
    <g clip-path="url(#${id}-plaza-clip)">${stones}</g>${margin}
  </g>`;
}
function cable(anchor:Anchor){
  const a=anchor('upper')!,b=anchor('lower')!;
  const point=(t:number)=>{const u=1-t;return {x:u*u*u*a.x+3*u*t*t*(-11)+t*t*t*b.x,z:u*u*u*a.z+3*u*u*t*(-8)+3*u*t*t*9+t*t*t*b.z};};
  const cablePath=`M${a.x} ${a.z}C0 -8 -11 9 ${b.x} ${b.z}`;
  let cabins='',towers='';
  for(const [i,t] of [.24,.43,.64,.82].entries()){
    const p=point(t);
    cabins+=group(p.x,p.z,.96,`<g data-cable-cabin="${i}">
      ${path('M0 0q-.2.25 0 .5L.2.9M-.45.95L.6.9 1.05 1.2 .85 2.15-.4 2.2-.75 1.75Z','fill="#eadbbc" stroke="#4e695f" stroke-width=".075"')}
      ${path('M.6.9L1.05 1.2 .85 2.15 .45 1.95Z','fill="#668e82" stroke="#43675e" stroke-width=".065"')}
      ${path('M-.5 1.18L.48 1.12 .42 1.62-.5 1.65Z','fill="#90b5ad" stroke="#526f63" stroke-width=".065"')}
      ${path('M-.46 1.76L.43 1.73 .42 1.98-.42 2Z','fill="#a6704e" opacity=".75"')}
      ${path('M-.04 1.17v.45M.65 1.18l.21.1-.07.38-.2-.08M-.27 1.23l.19-.02','stroke="#e7efda" stroke-width=".05"')}
      <circle cy=".02" r=".13" fill="#617969"/>
    </g>`);
  }
  for(const [i,t] of [.12,.92].entries()){
    const p=point(t);
    towers+=group(p.x,p.z,1,`<g data-cable-tower="${i}">${path('M-.85 2.8L-.1.35 .25.35 .85 2.8M-.57 1.85H.56M-.45 1.48L.62 2.6M.45 1.48L-.62 2.6M-1-.02H1M-.65.25H.65','stroke="#607467" stroke-width=".085"')}<circle cx="-.57" cy=".08" r=".16" fill="#e1d5b4" stroke="#526b60" stroke-width=".06"/><circle cx=".57" cy=".08" r=".16" fill="#e1d5b4" stroke="#526b60" stroke-width=".06"/></g>`);
  }
  return `<g data-layer="cable">${towers}${path(cablePath,'data-edge-id="cable-down" stroke="#5b756c" stroke-width=".075"')}${path(cablePath,'transform="translate(.24 0)" stroke="#7c8a70" stroke-width=".045"')}${cabins}</g>`;
}
function icon(kind:string,safetyKind?:string){
  const stroke='stroke="currentColor" stroke-width=".1"';
  if(kind==='toilet')return '<text y=".19" text-anchor="middle" font-size=".5" font-family="sans-serif" fill="currentColor">WC</text>';
  if(kind==='terminal')return path('M-.3-.3h.6v.43h-.6ZM0 .13v.2M-.15.33h.3',stroke);
  if(kind==='cable')return path('M-.28-.16h.56v.5h-.56ZM0-.16v-.22M-.35-.38h.7',stroke);
  if(kind==='safety'){
    if(safetyKind==='lifebuoy')return '<circle r=".27" stroke="currentColor" stroke-width=".11"/>';
    if(safetyKind==='shelter')return path('M-.34.28L0-.32.34.28ZM0-.04v.15',stroke);
    if(safetyKind==='help')return '<text y=".27" text-anchor="middle" font-size=".8" font-family="serif" fill="currentColor">!</text>';
    if(safetyKind==='extinguisher')return path('M-.14-.15h.28v.47h-.28ZM-.07-.15v-.16h.22l.1.18',stroke);
    return path('M-.08-.32h.16v.24h.24v.16H.08v.24h-.16V.08h-.24v-.16h.24Z','fill="currentColor"');
  }
  return '<circle r=".12" fill="currentColor"/>';
}
// Absolute, individually composed label positions. Anchor dots stay on the shared coordinates.
const labels:Record<string,{x:number;z:number;text?:string;align?:string}>={
  summit:{x:5,z:-24.6},falls:{x:-14,z:-19.3},gorge:{x:25.1,z:-10.4},bamboo:{x:29.6,z:5.4},
  creek:{x:25.6,z:20.4},lake:{x:-19.6,z:4.9},forest:{x:-25,z:12.4},
  entry:{x:1,z:25.4},'gate-out':{x:-4.7,z:25.4},market:{x:-20.5,z:24,text:'归云集'},
  supply:{x:28.6,z:-.5,text:'竹间驿'},upper:{x:-2.2,z:-22.5},lower:{x:-19,z:18.3},
};
function markers(anchor:Anchor,showLabels:boolean,showFacilities:boolean,showFixtures:boolean){
  return `<g data-layer="markers">${points.filter(p=>p.kind!=='parking'&&(showFixtures||!['terminal','safety'].includes(p.kind))&&(showFacilities||['attraction','entrance','commercial'].includes(p.kind))).map(p=>{
    const a=anchor(p.id)!,isMain=['attraction','entrance','commercial'].includes(p.kind),color=p.kind==='safety'?'#986850':'#426961';
    const label=labels[p.id];
    const offset:Record<string,[number,number]>={'help-gorge':[.45,-.7],'help-falls':[-.3,.3]};
    const [ox,oz]=offset[p.id]??[0,0];
    return `<g data-point-id="${escape(p.id)}" transform="translate(${n(a.x)} ${n(a.z)})" color="${color}"><title>${escape(p.name)}</title>${isMain||p.kind==='cable'?'<circle r=".17" fill="#95644b" stroke="#fff4dc" stroke-width=".08"/>':`<path d="M0 0L${ox} ${oz}" stroke="currentColor" stroke-width=".05"/><g transform="translate(${ox} ${oz})"><rect x="-.47" y="-.47" width=".94" height=".94" rx=".22" fill="#f9f3e3" fill-opacity=".96" stroke="currentColor" stroke-width=".055"/>${icon(p.kind,p.safetyKind)}</g>`}</g>${showLabels&&label?`<g data-label-id="${p.id}"><text x="${label.x}" y="${label.z}" text-anchor="middle" font-family="${serif}" font-size="${isMain?'.96':'.65'}" font-weight="${isMain?'600':'400'}" letter-spacing=".1" fill="#344e43" stroke="#faf4e6" stroke-width=".18" paint-order="stroke">${escape(label.text??p.name)}</text></g>`:''}`;
  }).join('')}</g>`;
}
function furniture(showLabels:boolean,showFacilities:boolean,showFixtures:boolean){
  const legend=[['toilet','卫生间'],['cable','索道'],...(showFixtures?[['terminal','导览'],['safety','安全设施']]:[])];
  return `<g data-layer="furniture">
    ${showLabels?`<g fill="#314f45" font-family="${serif}"><text x="-30.8" y="-24.5" font-size="2.4" font-family="STKaiti,Kaiti SC,KaiTi,${serif}" letter-spacing=".5" writing-mode="vertical-rl">青岚山境</text><text x="-27.4" y="-24.4" font-size=".59" letter-spacing=".35" writing-mode="vertical-rl" fill="#7b8067">山水游览图</text><g transform="translate(-31.8 -12.7)"><rect width="1.9" height="1.9" rx=".1" fill="#a14e38" opacity=".88"/><text x=".95" y=".79" text-anchor="middle" font-size=".65" fill="#faf0dc">青岚</text><text x=".95" y="1.49" text-anchor="middle" font-size=".65" fill="#faf0dc">山境</text></g></g>`:''}
    <g transform="translate(32 -26)" stroke="#6b806e" stroke-width=".075"><path d="M0 2V-1M-.45-.15L0-1 .45-.15"/><circle r="1.25" stroke-opacity=".22"/><text y="-2" text-anchor="middle" fill="#5c7263" stroke="none" font-family="${serif}" font-size=".7">北</text></g>
    ${showFacilities?`<g transform="translate(-8 34)" font-family="${serif}" font-size=".56" fill="#637663">${legend.map(([kind,label],i)=>`<g transform="translate(${i*4.4} 0)"><g color="#637663" fill="none">${icon(kind)}</g><text x=".65" y=".2">${label}</text></g>`).join('')}</g>`:''}
    ${showLabels?`<g font-family="${serif}" fill="#758675" text-anchor="middle"><text x="1" y="6.8" font-size="1.3" letter-spacing="1.1" opacity=".68">镜 湖</text><text x="1" y="8" font-size=".39" letter-spacing=".24" opacity=".7">一湖山色 · 四时清音</text></g>`:''}
  </g>`;
}

export function createQinglvSvg(options:ScenicSvgOptions,anchor:Anchor){
  const {showLabels=true,showFacilities=true,showVisitorFixtures=true,showMarkers=true,projection}=options;
  const id=(options.idPrefix??'scenic').replace(/[^a-zA-Z0-9_-]/g,'_')+'-qinglv';
  const viewBox=projection?`${-projection.width/2} ${-projection.depth/2} ${projection.width} ${projection.depth}`:'-37 -36 76 76';
  const transform=projection?`rotate(${n(projection.azimuth*180/Math.PI)}) translate(${n(-(projection.center?.x??0))} ${n(-(projection.center?.z??2))})`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${projection?'width="1536" height="1536" preserveAspectRatio="none"':''} role="img" aria-label="${scenicName}景区导览地图" data-map-style="qinglv" fill="none">
  <title>${scenicName}景区导览地图</title><desc>青绿设色、墨骨山水。北向朝上，景点沿用景区锚点，游路按连接关系作曲线写意表达。图中曲线不表示精确轨迹或距离。</desc>
  ${definitions(id)}
  <g transform="${transform}" stroke-linecap="round" stroke-linejoin="round">
    <g data-layer="paper"><ellipse cx="1" cy="2" rx="38" ry="38" fill="url(#${id}-paper)"/><ellipse cx="1" cy="2" rx="35" ry="35" fill="url(#${id}-grain)"/></g>
    ${terrain(id)}${water(id)}${waterfall(id)}${plaza(id)}${planting(anchor)}${roads(id,showVisitorFixtures)}${cable(anchor)}${buildings(anchor)}${showMarkers?markers(anchor,showLabels,showFacilities,showVisitorFixtures):''}${furniture(showLabels,showFacilities,showVisitorFixtures)}
  </g></svg>`;
}
