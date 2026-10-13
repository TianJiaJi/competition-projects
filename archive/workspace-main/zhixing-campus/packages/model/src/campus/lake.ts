import * as THREE from "three";
import { lake, lakePoint } from "./layout";
import { campusColors } from "./palette";
/** Animated water remains an opaque, depth-writing surface: no alpha sorting artifacts. */
export function createCampusLake() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2,
      [x, z] = lakePoint(a);
    if (i) shape.lineTo(x, -z);
    else shape.moveTo(x, -z);
  }
  const geometry = new THREE.ShapeGeometry(shape, 96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: campusColors.water,
    roughness: 0.28,
    metalness: 0.2,
  });
  const time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLakeTime = time;
    shader.vertexShader = "varying vec2 vLakePosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvLakePosition = position.xz;",
    );
    shader.fragmentShader =
      "uniform float uLakeTime; varying vec2 vLakePosition;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 p=vLakePosition;
      float t=uLakeTime;
      float drift=sin(p.x*.65+p.y*.28-t*.55)*sin(p.y*.92-p.x*.18+t*.38);
      float ripple=sin(p.x*1.9+p.y*.8-t*1.2 + sin(p.y*.35+t*.27)*1.4);
      float bank=length((p-vec2(${lake.x.toFixed(1)},${lake.z.toFixed(1)}))/vec2(${lake.rx.toFixed(1)},${lake.rz.toFixed(1)}));
      float shore=sin(bank*150.0-t*1.7)*smoothstep(.77,1.0,bank);
      float bridge=sin(length(p-vec2(-24.0,44.0))*4.5-t*1.6)*exp(-length(p-vec2(-24.0,44.0))*.2);
      float glint=pow(max(0.0,ripple),18.0)*(.5+.5*sin(p.x*.51-p.y*.6+t*.2));
      diffuseColor.rgb *= 0.93 + drift*.055 + shore*.025 + bridge*.025;
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.82,.94,.98),glint*.24);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      normal = normalize(normal + vec3(cos(vLakePosition.x*.65+vLakePosition.y*.28-uLakeTime*.55)*.045, sin(vLakePosition.y*.92+uLakeTime*.38)*.04,0.0));
    `,
    );
  };
  material.customProgramCacheKey = () => "campus-lake-flow-v1";
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.12;
  mesh.name = "campus-living-lake";
  mesh.receiveShadow = true;
  return {
    mesh,
    update(elapsed: number, reduced: boolean) {
      time.value = reduced ? 0 : elapsed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
