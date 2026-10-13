import {nodeById} from './data';
import {siteById} from './places';
import {terrainHeight} from './geometry';

export function cableSupportLayout(){
  const station=(id:string)=>{const site=siteById[id],p=site?.building??nodeById[id];return {x:p.x,z:p.z,y:(site?.ground??terrainHeight(p.x,p.z))+5};};
  const a=station('upper'),b=station('lower'),length=Math.hypot(b.x-a.x,b.z-a.z);
  const across={x:(b.z-a.z)/length,z:-(b.x-a.x)/length};
  return [.22,.5,.78].map((ratio,i)=>{
    const center={x:a.x+(b.x-a.x)*ratio,z:a.z+(b.z-a.z)*ratio,y:a.y+(b.y-a.y)*ratio};
    const offset=i===0?2.1:0,shaft={x:center.x+across.x*offset,z:center.z+across.z*offset};
    return {ratio,center,across,offset,shaft:{...shaft,y:terrainHeight(shaft.x,shaft.z)},beamStart:-1,beamEnd:i===0?2.3:1};
  });
}
