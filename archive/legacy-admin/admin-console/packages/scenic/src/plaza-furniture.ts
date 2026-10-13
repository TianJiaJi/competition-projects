import * as THREE from 'three';
import {entryPlaza} from './plaza';
type Block=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,parent:THREE.Object3D)=>THREE.Mesh;
export const plazaRestAreas=[
  {x:.3,z:17.7,width:5.8,depth:3.2,trees:2},
  {x:-10.3,z:21,width:3.4,depth:4,trees:1},
  {x:12.65,z:20.7,width:3.5,depth:3.2,trees:1},
  {x:-6,z:24.3,width:3,depth:2.4,trees:1},
];
export function createPlazaRestAreas(group:THREE.Group,block:Block){
  const y=entryPlaza.ground+.12;
  for(const [i,a] of plazaRestAreas.entries()){
    const w=a.width-.65,d=a.depth-1.1;
    block(a.x,y,a.z,w,.35,d,'#97ad99',group);
    block(a.x,y+.35,a.z,w-.24,.08,d-.24,'#648d69',group);
    for(let n=0;n<a.trees;n++){
      const x=a.x+(n-(a.trees-1)/2)*2.65,z=a.z+(i%2?.23:-.15),h=i===3?2.25:2.9;
      block(x,y+.4,z,.23,h,.24,'#796e51',group);
      block(x-.2,y+h*.64,z,1.65,.72,1.5,'#3c7a59',group);
      block(x+.26,y+h*.88,z-.08,1.5,.75,1.35,'#578d67',group);
      block(x-.1,y+h+ .43,z+.1,1.04,.45,.96,'#7ca277',group);
    }
    // Wood seating sits on the planter rim; low shrubs keep the corners soft.
    for(const side of [-1,1]){
      block(a.x,y+.36,a.z+side*(d/2+.22),Math.min(w,3.25),.12,.42,'#b29d74',group);
      for(const dx of [-.65,.65])block(a.x+dx,y,a.z+side*(d/2+.22),.14,.36,.28,'#6e7c65',group);
    }
    for(const side of [-1,1])block(a.x+side*w*.34,y+.42,a.z-.15,.55,.4,.55,i%2?'#7b9e6b':'#83a87c',group);
  }
}
