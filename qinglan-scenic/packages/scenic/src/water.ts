import {indexExactGeometry} from './indexed-geometry';
import * as THREE from 'three';
import { islandOutline, lakeOutline, lakeCut, lakeLevel, lakeShoreDistance, waterfallProfile } from './geometry';
import { createWaterFoam, type FoamSource } from './water-foam';
import { waterVolumeGeometry } from './water-channel';

const waterColors={surface:'#91d2ce',depth:'#78bfbd'};

const waveCode = `
  uniform float uTime;
  float waveHeight(vec2 p) {
    return .18*sin(dot(p,vec2(.62,.28))-uTime*.96664)
      +.045*sin(dot(p,vec2(-.95,.72))-uTime*1.1424);
  }
  vec2 waveGradient(vec2 p) {
    return .18*vec2(.62,.28)*cos(dot(p,vec2(.62,.28))-uTime*.96664)
      +.045*vec2(-.95,.72)*cos(dot(p,vec2(-.95,.72))-uTime*1.1424);
  }
`;
const shoreFade=(x:number,z:number)=>THREE.MathUtils.smoothstep(lakeShoreDistance(x,z),0,1.8);

export function createWaterAndMist(root:THREE.Group) {
  const time={value:0};
  const group=new THREE.Group();group.name='water-and-ink';root.add(group);
  const surfacePoints:number[]=[];
  const contour=lakeOutline.map(p=>new THREE.Vector2(p[0],p[1]));
  // Subdivide triangulated shoreline geometry: exact cut edge, enough vertices to show waves.
  function subdivide(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2) {
    const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a);
    if(Math.max(ab,bc,ca)<.55*.55){if((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>0) surfacePoints.push(a.x,lakeLevel,a.y,c.x,lakeLevel,c.y,b.x,lakeLevel,b.y);
      else surfacePoints.push(a.x,lakeLevel,a.y,b.x,lakeLevel,b.y,c.x,lakeLevel,c.y);return;}
    if(ab>=bc&&ab>=ca){const m=a.clone().add(b).multiplyScalar(.5);subdivide(a,m,c);subdivide(m,b,c);}
    else if(bc>=ca){const m=b.clone().add(c).multiplyScalar(.5);subdivide(a,b,m);subdivide(a,m,c);}
    else {const m=c.clone().add(a).multiplyScalar(.5);subdivide(a,b,m);subdivide(m,b,c);}
  }
  THREE.ShapeUtils.triangulateShape(contour,[]).forEach(([a,b,c])=>subdivide(contour[a],contour[b],contour[c]));
  const waterGeo=new THREE.BufferGeometry();
  waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(surfacePoints,3));
  const shore:number[]=[],normals:number[]=[];
  for(let i=0;i<surfacePoints.length;i+=3){
    const x=surfacePoints[i],z=surfacePoints[i+2],e=.03;
    shore.push(shoreFade(x,z),(shoreFade(x+e,z)-shoreFade(x-e,z))/(2*e),(shoreFade(x,z+e)-shoreFade(x,z-e))/(2*e));
    normals.push(0,1,0);
  }
  waterGeo.setAttribute('shore',new THREE.Float32BufferAttribute(shore,3));
  waterGeo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  indexExactGeometry(waterGeo);
  const waterMaterial=new THREE.MeshStandardMaterial({color:waterColors.surface,roughness:.36,metalness:.04,side:THREE.DoubleSide});
  waterMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uTime=time;
    shader.vertexShader=waveCode+'\nattribute vec3 shore; varying vec3 vWater; varying float vWave; varying vec2 vSlope;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      vec2 gradient=waveGradient(position.xz)*shore.x+waveHeight(position.xz)*shore.yz;
      objectNormal=normalize(vec3(-gradient.x,1.0,-gradient.y));`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vWave=waveHeight(position.xz)*shore.x;transformed.y+=vWave;vWater=transformed;vSlope=gradient;`);
    shader.fragmentShader='uniform float uTime; varying vec3 vWater; varying float vWave; varying vec2 vSlope;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb*=.70;
      diffuseColor.rgb+=vec3(.05,.09,.085)*(vWave/.225);
      float glint=pow(clamp(.55+vSlope.x*2.5+vSlope.y*1.8,0.0,1.0),5.0);
      diffuseColor.rgb+=vec3(.035,.07,.065)*glint;
      float radius=distance(vWater.xz,vec2(-6.0,-5.5));
      float rings=pow(.5+.5*cos(radius*5.2-uTime*2.4),12.0)*exp(-radius*.55);
      diffuseColor.rgb+=vec3(.20,.24,.22)*rings;`);
  };
  const water=new THREE.Mesh(waterGeo,waterMaterial);water.name='lake-water';group.add(water);
  function flowMaterial(fadeTail=false){
    const material=new THREE.MeshStandardMaterial({color:waterColors.surface,roughness:.37,side:THREE.DoubleSide,transparent:fadeTail,depthWrite:!fadeTail});
    material.onBeforeCompile=shader=>{
      shader.uniforms.uTime=time;
      shader.vertexShader=waveCode+'\nattribute vec2 flowUv;attribute vec3 flowAnchor;varying vec2 vFlow;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vFlow=flowUv;${fadeTail?'transformed.y+=waveHeight(flowAnchor.xy)*flowAnchor.z;':''}`);
      shader.fragmentShader='uniform float uTime;varying vec2 vFlow;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float streak=pow(.5+.5*sin(vFlow.x*92.0+sin(vFlow.x*31.0)*1.6),3.0);
        float flow=.45+.55*sin(vFlow.y*3.8-uTime*5.8+sin(vFlow.x*12.0));
        diffuseColor.rgb+=vec3(.17,.19,.18)*streak*flow;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.73,.91,.87),pow(abs(vFlow.x-.5)*2.0,14.0)*.35);
        ${fadeTail?'diffuseColor.a*=1.0-smoothstep(6.2,9.7,vFlow.y);':''}`);
    };
    material.customProgramCacheKey=()=>fadeTail?'lake-outfall-flow':'mountain-waterfall-flow';
    return material;
  }
  // The open lake edge folds out beyond the rock cut, then falls into the ink mist.
  const [a,b]=lakeCut,cutLength=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const outward={x:(b[1]-a[1])/cutLength,z:-(b[0]-a[0])/cutLength};
  const cutRows=[{out:0,y:lakeLevel,wave:1},{out:.7,y:.08,wave:.85},{out:1.05,y:-.35,wave:.35},{out:1.18,y:-6.6,wave:0},{out:1.5,y:-8.5,wave:0}];
  const cutVertices:number[]=[],cutUvs:number[]=[],cutAnchors:number[]=[],cutIndices:number[]=[],segments=32;
  let cutDistance=0;
  cutRows.forEach((row,r)=>{
    if(r){const previous=cutRows[r-1];cutDistance+=Math.hypot(row.out-previous.out,row.y-previous.y);}
    for(let i=0;i<=segments;i++){
      const t=i/segments,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      cutVertices.push(x+outward.x*row.out,row.y+(r===cutRows.length-1?.22*Math.sin(t*27):0),z+outward.z*row.out);
      cutUvs.push(t,cutDistance);cutAnchors.push(x,z,shoreFade(x,z)*row.wave);
      if(r<cutRows.length-1&&i<segments){const j=r*(segments+1)+i;cutIndices.push(j,j+segments+1,j+1,j+1,j+segments+1,j+segments+2);}
    }
  });
  const cutGeo=new THREE.BufferGeometry();cutGeo.setAttribute('position',new THREE.Float32BufferAttribute(cutVertices,3));cutGeo.setAttribute('flowUv',new THREE.Float32BufferAttribute(cutUvs,2));cutGeo.setAttribute('flowAnchor',new THREE.Float32BufferAttribute(cutAnchors,3));cutGeo.setIndex(cutIndices);cutGeo.computeVertexNormals();
  const cutMesh=new THREE.Mesh(cutGeo,flowMaterial(true));cutMesh.name='lake-cut-outfall';group.add(cutMesh);

  // Explicit lips and vertical curtains are joined by shared vertices; flow distance includes height.
  const fallVertices:number[]=[],fallUvs:number[]=[],fallIndices:number[]=[];
  let distance=0;
  waterfallProfile.forEach((p,i)=>{
    if(i){const before=waterfallProfile[i-1];distance+=Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z);}
    const width=i===waterfallProfile.length-1?2.15:1.65;
    fallVertices.push(p.x-width,p.y,p.z,p.x+width,p.y,p.z);
    fallUvs.push(0,distance,1,distance);
    if(i<waterfallProfile.length-1){const j=i*2;fallIndices.push(j,j+2,j+1,j+1,j+2,j+3);}
  });
  const fallsGeo=new THREE.BufferGeometry();fallsGeo.setAttribute('position',new THREE.Float32BufferAttribute(fallVertices,3));fallsGeo.setAttribute('flowUv',new THREE.Float32BufferAttribute(fallUvs,2));fallsGeo.setIndex(fallIndices);fallsGeo.computeVertexNormals();
  const falls=new THREE.Mesh(fallsGeo,flowMaterial());falls.name='continuous-waterfall';group.add(falls);
  const volume=new THREE.Mesh(waterVolumeGeometry(waterfallProfile,waterfallProfile.map((_,i)=>i===waterfallProfile.length-1?2.15:1.65)),new THREE.MeshStandardMaterial({color:waterColors.depth,roughness:.38,side:THREE.DoubleSide}));
  volume.name='waterfall-water-volume';group.add(volume);
  const foamSources:FoamSource[]=[{...waterfallProfile[0],z:waterfallProfile[0].z+.25,width:3,depth:.65,lift:.32}];
  for(let i=1;i<waterfallProfile.length;i++){
    const p=waterfallProfile[i],before=waterfallProfile[i-1],after=waterfallProfile[i+1];
    if(p.z===before.z&&before.y-p.y>1&&p.y>1)foamSources.push({...p,z:p.z+.35,width:3.1,depth:.65,lift:.5});
    if(after&&after.z===p.z&&p.y-after.y>1)foamSources.push({...p,z:p.z-.25,y:p.y+.07,width:3,depth:.35,lift:.25});
  }
  foamSources.push({x:-6,y:lakeLevel,z:-5.5,width:3.5,depth:1.2,lift:.4,lake:true});
  foamSources.push({x:(a[0]+b[0])/2-outward.x*.15,y:lakeLevel,z:(a[1]+b[1])/2-outward.z*.15,width:cutLength*.8,depth:.3,lift:.22,lake:true,direction:outward});
  foamSources.push({x:(a[0]+b[0])/2+outward.x*1.45,y:-6.4,z:(a[1]+b[1])/2+outward.z*1.45,width:cutLength*.8,depth:.6,lift:.25,direction:outward,falling:true});
  const foam=createWaterFoam(group,foamSources,(x,z,t)=>lakeLevel+shoreFade(x,z)*(.18*Math.sin(x*.62+z*.28-t*.96664)+.045*Math.sin(-x*.95+z*.72-t*1.1424)));

  // Bake the multi-scale ink field once; the shader advects it instead of evaluating
  // dozens of procedural noise octaves for every cloud pixel every frame.
  const noiseSize=256,noisePixels=new Uint8Array(noiseSize*noiseSize*4);
  const hash=(x:number,y:number,period:number)=>{
    const value=Math.sin(((x%period+period)%period)*127.1+((y%period+period)%period)*311.7)*43758.5453;
    return value-Math.floor(value);
  };
  const lattice=(x:number,y:number,period:number)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy,period),hash(ix+1,iy,period),sx),THREE.MathUtils.lerp(hash(ix,iy+1,period),hash(ix+1,iy+1,period),sx),sy);
  };
  for(let y=0;y<noiseSize;y++)for(let x=0;x<noiseSize;x++){
    let density=0;
    for(let octave=0;octave<4;octave++){const frequency=2**octave;density+=lattice(x/noiseSize*16*frequency,y/noiseSize*16*frequency,16*frequency)*.5/frequency;}
    const i=(y*noiseSize+x)*4;noisePixels[i]=noisePixels[i+1]=noisePixels[i+2]=Math.round(density/.9375*255);noisePixels[i+3]=255;
  }
  const noiseTexture=new THREE.DataTexture(noisePixels,noiseSize,noiseSize);
  noiseTexture.wrapS=noiseTexture.wrapT=THREE.RepeatWrapping;noiseTexture.minFilter=noiseTexture.magFilter=THREE.LinearFilter;noiseTexture.needsUpdate=true;
  const reveal={value:1},floor={value:-10000};
  const noiseCode='uniform float uReveal;uniform float uFloor;uniform sampler2D uInkNoise;float fbm(vec2 p){return texture2D(uInkNoise,p/16.0).r;}';
  const fogGeometry=new THREE.PlaneGeometry(1,1),fogs:THREE.Mesh[]=[];
  // Follow the actual island cut, including new parking terraces, instead of a
  // fixed-radius circle. Neighbouring ink sheets overlap around every edge.
  const perimeterEdges=islandOutline.map((a,i)=>{
    const b=islandOutline[(i+1)%islandOutline.length];
    return {a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};
  });
  const perimeterLength=perimeterEdges.reduce((sum,edge)=>sum+edge.length,0);
  const winding=Math.sign(perimeterEdges.reduce((area,{a,b})=>area+a[0]*b[1]-b[0]*a[1],0));
  const cloudCount=Math.ceil(perimeterLength/15);
  function perimeterPosition(distance:number){
    let remaining=((distance%perimeterLength)+perimeterLength)%perimeterLength;
    for(const {a,b,length} of perimeterEdges){
      if(remaining<=length){
        const t=remaining/length,dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
        return {x:a[0]+(b[0]-a[0])*t+dz*winding*.7,z:a[1]+(b[1]-a[1])*t-dx*winding*.7};
      }
      remaining-=length;
    }
    return {x:islandOutline[0][0],z:islandOutline[0][1]};
  }
  for(let i=0;i<cloudCount;i++){
    const mat=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{uReveal:reveal,uFloor:floor,uTime:time,uSeed:{value:i*7.13},uInkNoise:{value:noiseTexture},uCeiling:{value:new THREE.Vector2(-4.5,-2.2)},uOpacity:{value:.86}},
      vertexShader:'varying vec2 vUv;varying float vHeight;void main(){vUv=uv;vec4 world=modelMatrix*vec4(position,1.0);vHeight=world.y;gl_Position=projectionMatrix*viewMatrix*world;}',
      fragmentShader:`uniform float uTime;uniform float uSeed;uniform vec2 uCeiling;uniform float uOpacity;varying vec2 vUv;varying float vHeight;${noiseCode}
        float inkDrop(vec2 uv,float age,float seed){
          float growth=mix(.12,.85,smoothstep(0.0,.88,age));
          vec2 origin=vec2(.42+.13*sin(seed),.68+.08*cos(seed*1.7));
          vec2 drift=vec2(sin(seed+age*3.0)*age*.13,-age*.34);
          vec2 p=(uv-origin-drift)/vec2(growth*1.25,growth*.86);
          vec2 warp=vec2(fbm(p*2.1+seed+age*.4),fbm(p*2.1+vec2(5.7,1.2)-age*.3))-.5;
          vec2 flow=p+warp*1.7;
          float edge=1.0-smoothstep(.42,1.02,length(flow));
          float veins=smoothstep(.22,.78,fbm(flow*5.0+warp*2.0+seed));
          float core=exp(-dot(flow,flow)*5.0)*.38;
          float diffusion=(edge*(.12+.9*veins*veins)+core)*smoothstep(0.0,.12,age)*(1.0-smoothstep(.64,1.0,age));
          return diffusion;
        }
        void main(){
          float age=fract(uTime/24.0+uSeed*.073);
          float cloud=inkDrop(vUv,age,uSeed)+inkDrop(vUv,fract(age+.5),uSeed+11.7);
          float border=smoothstep(0.0,.13,vUv.x)*smoothstep(0.0,.13,1.0-vUv.x)*smoothstep(0.0,.16,vUv.y)*smoothstep(0.0,.16,1.0-vUv.y);
          float density=(1.0-exp(-cloud*2.0))*border;
          float ceiling=1.0-smoothstep(uCeiling.x,uCeiling.y,vHeight);
          vec3 ink=mix(vec3(.10,.23,.17),vec3(.025,.07,.13),smoothstep(.03,.7,density));
          if(vHeight<uFloor)discard;gl_FragColor=vec4(ink,density*uOpacity*ceiling*uReveal);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    const fog=new THREE.Mesh(fogGeometry,mat);fog.name='ink-cloud';
    fog.userData.distance=i/cloudCount*perimeterLength;fog.userData.layer=i;
    fog.userData.width=26+i%3*2;
    const p=perimeterPosition(fog.userData.distance);
    fog.position.set(p.x,-8.5-i%3*2,p.z);
    fog.scale.set(fog.userData.width,13+i%2*2,1);group.add(fog);fogs.push(fog);
  }
  // Mountain ink is a broad, slowly diffusing wash. No expanding radial source,
  // high-frequency tendrils or rising emitter: pigment spreads within the sheet.
  const rearPlumes:THREE.Group[]=[];
  const plumeLocations=[[-22,4,-20],[-12,10,-29],[13,9,-26],[26,5,-17]];
  const washFragment=`uniform float uTime;uniform float uSeed;varying vec2 vUv;varying float vHeight;${noiseCode}
    void main(){
      vec2 drift=vec2(uTime*.009,-uTime*.004);
      vec2 warp=vec2(fbm(vUv*3.1+drift+uSeed),fbm(vUv*3.1-drift+uSeed+7.3))-.5;
      vec2 p=vUv+warp*.18;
      float spread=.015*sin(uTime*.12+uSeed);
      vec2 a=(p-vec2(.39,.47))/vec2(.42+spread,.30+spread);
      vec2 b=(p-vec2(.64,.56))/vec2(.30+spread,.25+spread);
      float blot=exp(-dot(a,a)*1.7)+exp(-dot(b,b)*2.0)*.65;
      float pigment=fbm(p*4.0+drift*.5+uSeed);
      float bleed=smoothstep(.055,.75,blot+(pigment-.5)*.11);
      float interior=mix(.18,.90,smoothstep(.20,.76,pigment));
      float border=smoothstep(0.0,.15,vUv.x)*smoothstep(0.0,.15,1.0-vUv.x)*smoothstep(0.0,.19,vUv.y)*smoothstep(0.0,.19,1.0-vUv.y);
      float density=bleed*interior*border;
      vec3 ink=mix(vec3(.12,.27,.24),vec3(.035,.12,.18),smoothstep(.1,.75,pigment));
      if(vHeight<uFloor)discard;gl_FragColor=vec4(ink,density*.40*uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  plumeLocations.forEach(([x,y,z],i)=>{
    const plume=new THREE.Group();plume.name='mountain-ink-volume';plume.position.set(x,y,z);plume.userData.baseY=y;group.add(plume);rearPlumes.push(plume);
    for(let layer=0;layer<3;layer++){
      const mat=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,
        uniforms:{uReveal:reveal,uFloor:floor,uTime:time,uInkNoise:{value:noiseTexture},uSeed:{value:33+i*9.7+layer*4.3}},
        vertexShader:(fogs[0].material as THREE.ShaderMaterial).vertexShader,fragmentShader:washFragment});
      const sheet=new THREE.Mesh(fogGeometry,mat);sheet.rotation.y=i*.7+layer*Math.PI/3;
      sheet.position.set((layer-1)*1.5,layer*.6,0);sheet.scale.set(23+layer*2,13-layer,1);plume.add(sheet);
    }
  });
  return {
    setIntro(opacity:number,minY:number){reveal.value=opacity;floor.value=minY;},
    update(elapsed:number,camera:THREE.Camera){
      time.value=elapsed;
      foam.update(elapsed);
      rearPlumes.forEach((plume,i)=>{plume.position.y=plume.userData.baseY+Math.sin(elapsed*.06+i)*.18;plume.rotation.y=Math.sin(elapsed*.04+i)*.025;});
      fogs.forEach((fog,i)=>{
        const p=perimeterPosition(fog.userData.distance+Math.sin(elapsed*.035+i)*1.3);
        fog.position.x=p.x;fog.position.z=p.z;
        fog.position.y=-8.5-i%3*2+Math.sin(elapsed*.24+i)*.65;
        fog.quaternion.copy(camera.quaternion);
      });
    },
    setQuality(level:number){foam.setQuality(level);fogs.forEach((fog,i)=>{fog.visible=level<3||i%2===0;fog.scale.x=fog.userData.width*(level<3?1:1.3);});rearPlumes.forEach(plume=>plume.children.forEach((sheet,i)=>sheet.visible=level<3||i!==1));},
    dispose(){noiseTexture.dispose();root.remove(group);group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});},
  };
}
