import * as THREE from 'three';
import {scrollWind} from './wind';

export interface ScrollModelOptions {
  width:number;
  depth:number;
  y:number;
  center?:{x:number;z:number};
  painting?:THREE.Texture;
}
export interface ScrollFrame {
  opening:number;
  opacity:number;
  ink:number;
  time:number;
  azimuth:number;
}

function paperTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const context=canvas.getContext('2d')!,pixels=context.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4,n=Math.sin(x*127.1+y*311.7)*43758.5453;
    const grain=(n-Math.floor(n)-.5)*9+Math.sin(y*1.7+x*.12)*1.1;
    pixels.data[i]=225+grain;pixels.data[i+1]=213+grain;pixels.data[i+2]=187+grain;pixels.data[i+3]=255;
  }
  context.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

/** A scenery-independent 3D scroll. The caller owns its renderer, camera and artwork. */
export function createScrollModel(parent:THREE.Object3D,options:ScrollModelOptions){
  const {width,depth}=options,group=new THREE.Group();group.name='antique-scroll';
  group.position.set(options.center?.x??0,options.y,options.center?.z??0);parent.add(group);
  const paper=paperTexture(),blank=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);blank.needsUpdate=true;
  const opening={value:.02},time={value:0},ink={value:0},painting={value:options.painting??blank};
  const edgeLift={value:new THREE.Vector2()},windEnvelope={value:0};
  const material=new THREE.MeshStandardMaterial({map:paper,roughness:1,side:THREE.DoubleSide,transparent:true});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uOpening:opening,uScrollTime:time,uInk:ink,uPainting:painting,uEdgeLift:edgeLift,uWindEnvelope:windEnvelope});
    shader.vertexShader=`uniform float uOpening;uniform float uScrollTime;uniform vec2 uEdgeLift;uniform float uWindEnvelope;varying vec2 vPaperUv;
      float paperWave(vec2 p){
        float pin=pow(max(0.0,1.0-p.x*p.x),1.35);
        float billow=1.35*sin(p.x*2.4+p.y*1.7-uScrollTime*.52)+.60*sin(p.y*4.2-p.x*.8-uScrollTime*.31);
        return mix(uEdgeLift.x,uEdgeLift.y,(p.x+1.0)*.5)+pin*billow*uWindEnvelope;
      }
      float paperCurl(float x){return .50*pow(smoothstep(.93,1.0,abs(x)),2.0);}
      `+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      vec2 q=vec2(position.x/${(width/2).toFixed(6)},position.z/${(depth/2).toFixed(6)});
      float epsilon=.003;
      float sx=(paperWave(q+vec2(epsilon,0.0))-paperWave(q-vec2(epsilon,0.0))+paperCurl(q.x+epsilon)-paperCurl(q.x-epsilon))/(2.0*epsilon*${(width/2).toFixed(6)}*max(uOpening,.02));
      float sz=(paperWave(q+vec2(0.0,epsilon))-paperWave(q-vec2(0.0,epsilon)))/(2.0*epsilon*${(depth/2).toFixed(6)});
      objectNormal=normalize(vec3(-sx,1.0,-sz));`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vPaperUv=vec2(position.x*max(uOpening,.02)/${width.toFixed(6)}+.5,.5-position.z/${depth.toFixed(6)});
      #ifdef USE_MAP
        vMapUv=vPaperUv;
      #endif
      transformed.x*=max(uOpening,.02);transformed.y+=paperWave(q)*uOpening+paperCurl(q.x);`);
    shader.fragmentShader='uniform sampler2D uPainting;uniform float uInk;varying vec2 vPaperUv;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float edgeX=min(vPaperUv.x,1.0-vPaperUv.x),edgeY=min(vPaperUv.y,1.0-vPaperUv.y);
      float cloth=1.0-smoothstep(.035,.037,edgeX)*smoothstep(.026,.028,edgeY);
      float weave=.025*sin(vPaperUv.x*1100.0)*sin(vPaperUv.y*1100.0);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.32,.23)+weave,cloth);
      float rule=(1.0-smoothstep(.001,.002,abs(edgeX-.043)))+(1.0-smoothstep(.001,.002,abs(edgeY-.034)));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.34,.20),min(rule,1.0)*.6);
      vec4 art=texture2D(uPainting,vPaperUv);diffuseColor.rgb=mix(diffuseColor.rgb,art.rgb,art.a*uInk*(1.0-cloth));
      diffuseColor.rgb*=.76;`);
  };
  material.customProgramCacheKey=()=>`antique-scroll-${width.toFixed(6)}-${depth.toFixed(6)}`;
  const geometry=new THREE.PlaneGeometry(width,depth,128,80);geometry.rotateX(-Math.PI/2);
  const sheet=new THREE.Mesh(geometry,material);sheet.name='scroll-paper';sheet.receiveShadow=true;group.add(sheet);
  const underside=sheet.clone();underside.position.y=-.035;underside.name='scroll-paper-underside';group.add(underside);
  const wood=new THREE.MeshStandardMaterial({color:'#5a493b',roughness:.66,transparent:true});
  const endMaterial=new THREE.MeshStandardMaterial({color:'#403f31',roughness:.54,transparent:true});
  const binding=new THREE.MeshStandardMaterial({color:'#9b8661',roughness:.78,transparent:true});
  const rolledPaper=new THREE.MeshStandardMaterial({map:paper,color:'#d3c7a8',roughness:1,transparent:true});
  const rollers:THREE.Group[]=[];
  for(const side of [-1,1]){
    const roller=new THREE.Group();roller.name=side<0?'scroll-left-roller':'scroll-right-roller';group.add(roller);rollers.push(roller);
    const cylinder=(radius:number,length:number,z:number,mat:THREE.Material)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,24),mat);mesh.rotation.x=Math.PI/2;mesh.position.z=z;roller.add(mesh);
    };
    cylinder(.76,depth+.9,0,wood);cylinder(1.0,depth-.2,0,rolledPaper);
    for(const end of [-1,1]){
      cylinder(.88,.7,end*(depth/2+.65),binding);
      cylinder(1.12,.9,end*(depth/2+1.4),endMaterial);
      cylinder(.75,.25,end*(depth/2+1.97),wood);
    }
  }
  return {
    group,
    setPainting(texture:THREE.Texture){painting.value=texture;},
    update(frame:ScrollFrame){
      opening.value=Math.max(.02,frame.opening);time.value=frame.time;ink.value=frame.ink;
      const wind=scrollWind(frame.time);
      edgeLift.value.set(wind.left,wind.right);windEnvelope.value=wind.envelope;
      group.rotation.set(wind.pitch,frame.azimuth,wind.roll);
      group.position.set((options.center?.x??0)+Math.cos(frame.azimuth)*wind.sway,
        options.y+wind.lift,(options.center?.z??0)-Math.sin(frame.azimuth)*wind.sway);
      group.visible=frame.opacity>0;
      for(const mat of [material,wood,endMaterial,binding,rolledPaper])mat.opacity=frame.opacity;
      rollers.forEach((roller,i)=>{
        const side=i===0?-1:1;roller.position.set(side*(width*opening.value/2+.8),.6+(i===0?wind.left:wind.right),0);
        roller.rotation.z=-side*frame.opening*width/2;
      });
    },
    dispose(){
      parent.remove(group);const geometries=new Set<THREE.BufferGeometry>();
      group.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());
      [material,wood,endMaterial,binding,rolledPaper].forEach(m=>m.dispose());paper.dispose();blank.dispose();
    },
  };
}
