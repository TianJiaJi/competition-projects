import * as THREE from 'three';

export interface FoamSource {
  x:number;y:number;z:number;
  width:number;depth:number;lift:number;
  lake?:boolean;
  falling?:boolean;
  direction?:{x:number;z:number};
}

/** A few faceted bubbles and small foam rings, shared across all water impacts. */
export function createWaterFoam(parent:THREE.Group,sources:FoamSource[],lakeHeight:(x:number,z:number,time:number)=>number){
  const perSource=10,ringsPerSource=3;
  const bubbleMaterial=new THREE.MeshStandardMaterial({color:'#e2faf1',emissive:'#91d2ce',emissiveIntensity:.12,roughness:.35,transparent:true,opacity:.82,depthWrite:false});
  const bubbles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),bubbleMaterial,sources.length*perSource);
  bubbles.name='water-impact-bubbles';bubbles.frustumCulled=false;bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(bubbles);
  const rings=new THREE.InstancedMesh(new THREE.RingGeometry(.64,1,16),new THREE.MeshBasicMaterial({color:'#e6fcf3',transparent:true,opacity:.52,side:THREE.DoubleSide,depthWrite:false}),sources.length*ringsPerSource);
  rings.name='water-impact-foam-rings';rings.frustumCulled=false;rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(rings);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const horizontal=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  const random=(seed:number)=>{const n=Math.sin(seed*127.1+31.7)*43758.5453;return n-Math.floor(n);};
  let quality=0;
  return {
    update(time:number){
      sources.forEach((source,s)=>{
        const flow=source.direction??{x:0,z:1},across={x:flow.z,z:-flow.x};
        for(let i=0;i<perSource;i++){
          const seed=s*17+i,age=(time/(1.7+random(seed+1)*1.4)+random(seed+2))%1;
          const sideways=(random(seed+3)-.5)*source.width;
          const forward=(random(seed+4)-.5)*source.depth+age*.48;
          const x=source.x+across.x*sideways+flow.x*forward,z=source.z+across.z*sideways+flow.z*forward;
          const ground=source.lake?lakeHeight(x,z,time):source.y;
          const radius=(.09+random(seed+5)*.12)*Math.pow(Math.sin(Math.PI*age),.7)*(quality<3||i%2===0?1:0);
          position.set(x,ground+.045+Math.sin(age*Math.PI)*source.lift-(source.falling?age*1.8:0),z);scale.setScalar(radius);
          matrix.compose(position,rotation,scale);bubbles.setMatrixAt(s*perSource+i,matrix);
        }
        for(let i=0;i<ringsPerSource;i++){
          const age=(time/2.8+i/ringsPerSource+s*.17)%1;
          const sideways=(i-1)*source.width*.24,x=source.x+across.x*sideways+flow.x*age*.55,z=source.z+across.z*sideways+flow.z*age*.55;
          const ground=source.lake?lakeHeight(x,z,time):source.y;
          const radius=source.falling?0:(.18+age*.55)*Math.sin(Math.PI*age);
          position.set(x,ground+.055,z);scale.set(radius,radius*.72,1);
          matrix.compose(position,horizontal,scale);rings.setMatrixAt(s*ringsPerSource+i,matrix);
        }
      });
      bubbles.instanceMatrix.needsUpdate=true;rings.instanceMatrix.needsUpdate=true;
    },
    setQuality(level:number){quality=level;},
  };
}
