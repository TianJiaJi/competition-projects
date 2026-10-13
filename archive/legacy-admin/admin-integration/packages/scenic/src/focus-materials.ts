import * as THREE from 'three';

/** A pale, low-contrast context keeps status-colored fixtures easy to distinguish. */
export function createContextMuting(){
  const amount={value:0};
  const attached=new WeakSet<THREE.Material>();
  const colorTreatment=`
    uniform float uScenicContextMuted;
    vec3 scenicMutedContext(vec3 rgb) {
      float gray=dot(rgb,vec3(.2126,.7152,.0722));
      vec3 faintColor=mix(vec3(gray),rgb,.18);
      vec3 mist=mix(faintColor,vec3(.48,.50,.48),.58);
      return mix(rgb,mist,uScenicContextMuted);
    }
  `;
  function attach(mat:THREE.Material){
    if(attached.has(mat)||mat.userData.focusMaterial||!mat.visible)return;
    attached.add(mat);
    const compile=mat.onBeforeCompile,cacheKey=mat.customProgramCacheKey();
    mat.onBeforeCompile=(shader,renderer)=>{
      compile.call(mat,shader,renderer);
      shader.uniforms.uScenicContextMuted=amount;
      shader.fragmentShader=colorTreatment+shader.fragmentShader;
      if(shader.fragmentShader.includes('#include <opaque_fragment>')){
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = scenicMutedContext(outgoingLight);\n#include <opaque_fragment>');
      }else{
        shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb = scenicMutedContext(gl_FragColor.rgb);\n#include <tonemapping_fragment>');
      }
    };
    mat.customProgramCacheKey=()=>`${cacheKey}-context-muting-v1`;
    mat.needsUpdate=true;
  }
  return {attach,amount};
}
