import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {RoadPosition} from '@scene/contracts';
import { waterfallProfile } from './geometry';

/** Add submerged side faces: the moving water has a real cross-section. */
export function waterVolumeGeometry(profile:RoadPosition[],widths:number[],depth=.28){
  const vertices:number[]=[],indices:number[]=[];
  profile.forEach((p,i)=>{
    const a=profile[Math.max(0,i-1)],b=profile[Math.min(profile.length-1,i+1)];
    const dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dy,dz)||1;
    for(const x of [p.x-widths[i],p.x+widths[i]])vertices.push(x,p.y,p.z,x,p.y-depth*dz/length,p.z+depth*dy/length);
    if(i<profile.length-1){const j=i*4;indices.push(j,j+1,j+4,j+1,j+5,j+4,j+2,j+6,j+3,j+3,j+6,j+7,j+1,j+3,j+5,j+3,j+7,j+5);}
  });
  const end=(profile.length-1)*4;indices.push(0,2,1,1,2,3,end,end+1,end+2,end+1,end+3,end+2);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Low, uneven voxel banks enclose each terrace while leaving the falling face open. */
export function createWatercourseBanks(parent:THREE.Group,material:(color:string)=>THREE.Material){
  const parts:THREE.BufferGeometry[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y+h/2,z);parts.push(geometry);
  };
  for(let i=1;i<waterfallProfile.length;i++){
    const a=waterfallProfile[i-1],b=waterfallProfile[i],length=b.z-a.z;
    if(length<.2||Math.abs(b.y-a.y)>.3||b.y<1)continue;
    const count=Math.ceil(length/.85);
    for(let j=0;j<count;j++){
      const t=(j+.5)/count,z=a.z+length*t,y=a.y+(b.y-a.y)*t;
      const lipInset=j===count-1?.22:0;
      box(a.x,y-.72,z-lipInset/2,4.7,.32,length/count+.015-lipInset);
      for(const side of [-1,1]){
        const height=.61+.12*Math.sin(j*1.7+i+side);
        box(a.x+side*2.08,y-.43,z,.76,height,length/count+.025);
      }
    }
  }
  const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());
  const channel=new THREE.Mesh(geometry,material('#779b8d'));channel.name='voxel-watercourse-grooves';channel.castShadow=true;channel.receiveShadow=true;parent.add(channel);
}
