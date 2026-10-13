import * as THREE from 'three';
import type { PublicSnapshot } from '@scenic/contracts';
import { regions } from './data';
export function createHeatProjection(worldToIsland=new THREE.Matrix4()) {
  const size=512, pixels=new Uint8Array(size*size*4), masks=new Uint8Array(size*size*4);
  const texture=new THREE.DataTexture(pixels,size,size), mask=new THREE.DataTexture(masks,size,size);
  for(const t of [texture,mask]) {t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;}
  const enabled={value:0}; let signature='';
  function attach(material:THREE.MeshStandardMaterial) {
    material.onBeforeCompile=shader=>{
      shader.uniforms.uWorldToIsland={value:worldToIsland};shader.uniforms.uHeatMap={value:texture};shader.uniforms.uClosedMap={value:mask};shader.uniforms.uHeat=enabled;
      shader.vertexShader='uniform mat4 uWorldToIsland; varying vec3 vScenicWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 scenicWorld=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          scenicWorld=instanceMatrix*scenicWorld;
        #endif
        vScenicWorld=(uWorldToIsland*modelMatrix*scenicWorld).xyz;`);
      shader.fragmentShader='uniform sampler2D uHeatMap; uniform sampler2D uClosedMap; uniform float uHeat; varying vec3 vScenicWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 uvHeat=(vScenicWorld.xz+vec2(36.0))/72.0;
        vec4 heat=texture2D(uHeatMap,uvHeat);
        diffuseColor.rgb=mix(diffuseColor.rgb,heat.rgb,uHeat*heat.a*.82);
        float shut=texture2D(uClosedMap,uvHeat).r;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.48,.46),shut*.95);`);
    };
    material.customProgramCacheKey=()=> 'scenic-projected-texture-v2';
    return material;
  }
  function update(snapshot:PublicSnapshot,heat:boolean) {
    enabled.value=heat?1:0;
    const next=JSON.stringify(snapshot.regions);if(next===signature)return;signature=next;
    for(let j=0;j<size;j++) for(let i=0;i<size;i++) {
      const x=(i+.5)/size*72-36,z=(j+.5)/size*72-36,k=(j*size+i)*4;
      let total=0,weight=0,nearest=Infinity,unknown=false,closed=0;
      for(const r of regions) {
        const state=snapshot.regions[r.id],d=Math.hypot(x-r.x,z-r.z)/r.radius;
        if(d<nearest){nearest=d;unknown=!state||state.load==='unknown'||state.availability==='unknown';}
        if(state && ['closed','maintenance'].includes(state.availability))closed=Math.max(closed,1-THREE.MathUtils.smoothstep(d,.62,.83));
        if(!state||state.load==='unknown'||state.availability!=='open')continue;
        const w=Math.exp(-d*d*2),load=state.load==='busy'?.98:state.load==='moderate'?.6:state.load==='light'?.32:.12;
        total+=w*load;weight+=w;
      }
      const load=total/Math.max(weight,.00001), cold=new THREE.Color('#83CBB6'), blue=new THREE.Color('#3869A1'), mid=new THREE.Color('#F0B65B'),hot=new THREE.Color('#B33F36');
      const color=unknown?new THREE.Color('#929d9a'):load<.3?cold.lerp(blue,THREE.MathUtils.smoothstep(load,.08,.3)):load<.55?blue.lerp(mid,THREE.MathUtils.smoothstep(load,.3,.55)):mid.lerp(hot,THREE.MathUtils.smoothstep(load,.55,.98));
      pixels[k]=Math.round(color.r*255);pixels[k+1]=Math.round(color.g*255);pixels[k+2]=Math.round(color.b*255);pixels[k+3]=unknown?170:245;
      masks[k]=Math.round(closed*255);masks[k+3]=255;
    }
    texture.needsUpdate=true;mask.needsUpdate=true;
  }
  return {attach,update,dispose(){texture.dispose();mask.dispose();}};
}
