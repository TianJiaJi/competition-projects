import {regionLabelSites} from './region-label-anchors';
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PublicSnapshot, RouteResult, ScenicViewMode } from "@scenic/contracts";
import { nodes, nodeById, points, regions, edges, stairLandings } from "./data";

import { terrainHeight, isIsland, isLake, isWaterfall, lakeLevel, lakeOutline, islandOutline, roadGroundHeight, distanceToRoadSegment } from "./geometry";
import { junctions, portPositions, isJunctionSegment, junctionBoundary } from "./junctions";
import { siteById, pointCourtAt } from "./places";
import { entryPlaza,isEntryPlaza,isEntryPlazaSegment } from "./plaza";
import { createMarketVillage } from "./market";
import { parkingById,parkingAreaAt } from './parking';
import { createParkingGround,createParkingRow } from './parking-model';
import { createPlazaRestAreas } from './plaza-furniture';
import { createWaterAndMist } from "./water";
import { createWatercourseBanks } from './water-channel';
import { createCameraFlight, type CameraPose } from './camera-flight';
import {centeredIslandPose,rotateIslandPose,createIslandFlight,type IslandPose} from './floating-island';
import { createContextMuting } from './focus-materials';
import { facilityColor } from './view';
import { closedRouteNodes } from './routing';
import { pointById } from './data';
import { createHeatProjection } from "./heat";
import { cableSupportLayout } from './cable-supports';
import {createScrollModel,createIntroTimeline,smoothProgress,type ScrollIntroState} from '@scenic/scroll';
import {createScenicPainting} from './scroll-painting';
import {islandRockFloor,rockColumn} from './rock-layout';
export { terrainHeight } from "./geometry";
const markerOffset=(id:string)=>id==='entry'?7.7:id.startsWith('t')||id.startsWith('p')?2:4;
const position = (id: string, offset = 0.1) => {
  const site=siteById[id],n=parkingById[id]??site?.building??nodeById[id];
  return new THREE.Vector3(n.x, (site?.ground??terrainHeight(n.x, n.z)) + offset, n.z);
};
export interface ScenicScene {
  update: (
    snapshot: PublicSnapshot,
    heat: boolean,
    selected: string | null,
    route: RouteResult | null,
    viewMode?: ScenicViewMode,
  ) => void;
  reset: (preserveAngle?: boolean) => void;
  interact: () => void;
  resume: () => void;
  zoom: (factor: number) => void;
  focus: (id: string) => void;
  restoreFocus: () => void;
  setAutoRotate: (enabled:boolean) => void;
  setFocusInset:(right:number)=>void;
  dispose: () => void;
}
export interface ScenicSceneOptions {
  enableRegionLabels?:boolean;
  overviewScale?:number;
  autoRotate?:boolean;
  canSelect?:(id:string)=>boolean;
  onBlank?:()=>void;
  showScroll?:boolean;
  intro?:boolean;
  onIntroState?:(state:ScrollIntroState)=>void;
  onError?:(error:unknown)=>void;
  onPreparationProgress?:(percentage:number)=>void;
}
export function createScenicScene(
  host: HTMLElement,
  onSelect: (id: string) => void,
  onProject: (
    positions: Record<string, { x: number; y: number; visible: boolean }>,
  ) => void,
  onPerformance: (level: number) => void,
  options:ScenicSceneOptions={},
): ScenicScene {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 250);
  const overviewOffset=new THREE.Vector3(32,81.333,118.667).multiplyScalar((.85**2)*(options.overviewScale??1));
  camera.position.set(0,2,2).add(overviewOffset);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled=true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  renderer.setClearColor(0, 0);
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "青岚山境三维沙盘，可拖动旋转、滚轮缩放，或使用景点列表选择位置",
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  const orbitOrigin = new THREE.Vector3(0, 2, 2);
  controls.target.copy(orbitOrigin);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 32;
  controls.maxDistance = 190;
  controls.maxPolarAngle = controls.minPolarAngle = Math.atan2(Math.hypot(24,89),61);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  controls.update();
  const defaultDistance = camera.position.distanceTo(controls.target);
  const islandFrame=new THREE.Group();islandFrame.name='floating-island';scene.add(islandFrame);
  const islandInverse=new THREE.Matrix4(),mistCamera=new THREE.Camera();
  const baseAzimuth=Math.atan2(overviewOffset.x,overviewOffset.z);
  const islandPose=():IslandPose=>({position:islandFrame.position.clone(),heading:islandFrame.rotation.y});
  const applyIslandPose=(p:IslandPose)=>{islandFrame.position.copy(p.position);islandFrame.rotation.y=p.heading;islandFrame.updateMatrixWorld(true);islandInverse.copy(islandFrame.matrixWorld).invert();};
  const worldPosition=(id:string,offset=0.1)=>islandFrame.localToWorld(position(id,offset));
  let islandFlight:ReturnType<typeof createIslandFlight>|undefined;
  let savedIsland:IslandPose|undefined;
  let islandFlightTarget:IslandPose|undefined;
  let spinSpeed=0, cableRunning=false, controlsInteracting=false;
  let autoRotate=options.autoRotate??true;
  let flight:ReturnType<typeof createCameraFlight>|undefined;
  let savedOverview:CameraPose|undefined;
  let flightTarget:CameraPose|undefined;
  let focusedId:string|null=null;
  const pose=():CameraPose=>({target:controls.target.clone(),offset:camera.position.clone().sub(controls.target)});
  const applyPose=(p:CameraPose)=>{controls.target.copy(p.target);camera.position.copy(p.target).add(p.offset);controls.update();};
  function settleOverviewOrigin(){
    if(focusedId)return;
    // A gesture can interrupt the return flight before it reaches the overview.
    // Preserve angle/distance while removing any remaining facility translation.
    const offset=camera.position.clone().sub(controls.target);
    controls.target.copy(orbitOrigin);camera.position.copy(orbitOrigin).add(offset);
    applyIslandPose(centeredIslandPose(orbitOrigin,islandFrame.rotation.y));
    controls.update();
  }
  const interact=()=>{spinSpeed=0;flight=undefined;islandFlight=undefined;islandFlightTarget=undefined;flightTarget=undefined;settleOverviewOrigin();};
  function moveTo(next:CameraPose,nextIsland=islandPose()){
    spinSpeed=0;
    flightTarget=next;
    flight=createCameraFlight(pose(),next);
    islandFlight=createIslandFlight(islandPose(),nextIsland);islandFlightTarget=nextIsland;
    if(reduced){applyPose(flight.advance(0,true));applyIslandPose(islandFlight.advance(0,true));flight=undefined;islandFlight=undefined;islandFlightTarget=undefined;flightTarget=undefined;}
  }
  function restoreFocus(){
    if(!unlocked()||!savedOverview)return;
    const next={target:orbitOrigin.clone(),offset:savedOverview.offset.clone()};focusedId=null;
    // Restore the original limits when the return flight completes.
    moveTo(next,savedIsland??centeredIslandPose(orbitOrigin,islandFrame.rotation.y));
    if(!flight){controls.minDistance=32;savedOverview=undefined;}
  }
  const directInteract=()=>{controlsInteracting=true;interact();if(!focusedId){savedOverview=undefined;controls.minDistance=32;}};
  controls.addEventListener('start',directInteract);
  controls.addEventListener('end',()=>{controlsInteracting=false;});
  scene.add(new THREE.HemisphereLight(0xf4fff7, 0x457562, 2.8));
  const sun = new THREE.DirectionalLight(0xfff6d8, 3.1);
  sun.position.set(-25, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -45,
    right: 45,
    top: 45,
    bottom: -45,
    far: 140,
  });
  sun.shadow.normalBias = 0.1;
  islandFrame.add(sun,sun.target);
  const root = new THREE.Group();
  root.name='scenic-island';root.visible=false;
  let focusInset=0,focusInsetTarget=0;
  const labelFacingState=new Map<string,boolean>();
  const updateFocusInset=()=>{if(focusInset)camera.setViewOffset(host.clientWidth,host.clientHeight,focusInset/2,0,host.clientWidth,host.clientHeight);else camera.clearViewOffset();};
  islandFrame.add(root);
  const timeline=createIntroTimeline(!!options.intro);
  const paperY=islandRockFloor()-6;
  const scrollAzimuth=Math.atan2(overviewOffset.x,overviewOffset.z);
  const artwork=options.showScroll?createScenicPainting(100,78,scrollAzimuth):undefined;
  // Separate depth passes share one camera and the same perspective.
  // The scroll stays in world space beneath the island; camera motion affects both equally.
  const scrollScene=new THREE.Scene();
  scrollScene.add(new THREE.HemisphereLight(0xf4fff7,0x457562,2.8));
  const scrollSun=sun.clone();scrollSun.castShadow=false;scrollScene.add(scrollSun);
  const scroll=options.showScroll?createScrollModel(scrollScene,{width:100,depth:78,y:paperY,center:{x:0,z:2},painting:artwork?.texture}):undefined;
  if(scroll)scroll.group.rotation.order='YXZ'; // Wind tilt stays local to the fixed world-space scroll.
  function renderLayers(){
    const autoClear=renderer.autoClear;
    try{
      if(scroll){
        renderer.autoClear=true;renderer.render(scrollScene,camera);
        renderer.autoClear=false;renderer.clearDepth();
      }
      renderer.render(scene,camera);
    }finally{renderer.autoClear=autoClear;}
  }
  const clipPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-paperY-.3);
  let modelReady=false, compiling=false, artworkReady=!artwork;
  let preparationTimer:ReturnType<typeof setTimeout>|undefined;
  let preparationProgress=-1;
  function reportPreparation(value:number){
    const percentage=Math.max(preparationProgress,Math.min(100,Math.floor(value)));
    if(percentage===preparationProgress)return;
    preparationProgress=percentage;host.dataset.preparation=String(percentage);
    options.onPreparationProgress?.(percentage);
  }
  reportPreparation(artwork?0:10);
  let introCameraSettled=!options.intro;
  let introState:ScrollIntroState='loading';
  let waterEffects:ReturnType<typeof createWaterAndMist>|undefined, sloganTexture:THREE.Texture|undefined;
  let modelUpdate:ScenicScene['update']|undefined;
  let pendingUpdate:Parameters<ScenicScene['update']>|undefined;
  let updateCabins=(elapsed:number)=>{void elapsed;};
  const unlocked=()=>introState==='ready';
  controls.enabled=false;
  const setIntroState=(state:ScrollIntroState)=>{
    if(state===introState)return;
    introState=state;host.dataset.introState=state;options.onIntroState?.(state);
    controls.enabled=state==='ready';
    if(state==='ready'){if(!options.intro)spinSpeed=0;}
    if(state==='finishing')spinSpeed=0;
  };
  host.dataset.introState=introState;options.onIntroState?.(introState);
  const update:ScenicScene['update']=(...args)=>{pendingUpdate=args;modelUpdate?.(...args);};
  const picks: THREE.Object3D[] = [];
  const heatProjection=createHeatProjection(islandInverse);
  const contextMuting=createContextMuting();
  const focusMaterials=new Map<string,THREE.MeshStandardMaterial>();
  function focusMaterial(color:string){
    let mat=focusMaterials.get(color);
    if(!mat){mat=new THREE.MeshStandardMaterial({color,roughness:.9});mat.userData.focusMaterial=true;mat.clippingPlanes=[clipPlane];mat.clipShadows=true;focusMaterials.set(color,mat);}
    return mat;
  }
  function* buildModel():Generator<void,void,unknown> {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  function material(color: string) {
    if (!mats.has(color))
      mats.set(
        color,
        color === "#8b9791" ? new THREE.MeshStandardMaterial({color,roughness:.9}) : heatProjection.attach(new THREE.MeshStandardMaterial({ color, roughness: 0.9 })),
      );
    return mats.get(color)!;
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function block(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    parent: THREE.Object3D = root,
  ) {
    const mesh = new THREE.Mesh(cube, material(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const terrainMaterial = heatProjection.attach(new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}));
  const walkingPaths=edges.filter(e=>e.mode==='walk'&&!e.structure).map(e=>e.path!);
  const terrainCells: { x: number; z: number; height: number }[] = [];
  for (let x = -32; x <= 32; x += 1.1) {
    for (let z = -30; z <= Math.max(...islandOutline.map(p=>p[1])); z += 1.1) {
      if (!isIsland(x,z)) continue;
      terrainCells.push({ x, z, height: roadGroundHeight(x,z,walkingPaths) });
    }
    reportPreparation(10+(x+32)/64*15);
    yield;
  }
  reportPreparation(25);
  const terrain = new THREE.InstancedMesh(
    cube,
    terrainMaterial,
    terrainCells.length,
  );
  const matrix = new THREE.Matrix4();
  const col = new THREE.Color();
  terrainCells.forEach((c, i) => {
    matrix.compose(
      new THREE.Vector3(c.x, c.height - .7, c.z),
      new THREE.Quaternion(),
      new THREE.Vector3(1.1, 1.4, 1.1),
    );
    terrain.setMatrixAt(i, matrix);
    col.set(c.height > 7 ? "#527f72" : c.height > 3 ? "#47786a" : "#659b7e");
    col.multiplyScalar(0.97 + 0.08 * Math.sin(i * 7.2));
    terrain.setColorAt(i, col);
  });
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  root.add(terrain);
  // A separate, excluded rock material keeps the floating underside in ink colors.
  const rock = new THREE.InstancedMesh(cube,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),terrainCells.length*2);
  terrainCells.forEach((c,i)=>{
    const base=c.height-1.4;
    const {bottom,tail}=rockColumn(c.x,c.z);
    const depth=base-bottom;
    matrix.compose(new THREE.Vector3(c.x,base-depth/2,c.z),new THREE.Quaternion(),new THREE.Vector3(1.1,depth,1.1));
    rock.setMatrixAt(i*2,matrix);rock.setColorAt(i*2,new THREE.Color(i%3?'#294f53':'#315c55'));
    matrix.compose(new THREE.Vector3(c.x*.97,base-depth-tail/2,c.z*.97),new THREE.Quaternion(),new THREE.Vector3(.76,tail,.76));
    rock.setMatrixAt(i*2+1,matrix);rock.setColorAt(i*2+1,new THREE.Color(i%2?'#244451':'#264b49'));
  });
  rock.castShadow=true;rock.receiveShadow=true;root.add(rock);
  yield;
  const plazaShape=new THREE.Shape(entryPlaza.outline.map(([x,z])=>new THREE.Vector2(x,-z)));
  const plazaGeometry=new THREE.ExtrudeGeometry(plazaShape,{depth:.34,bevelEnabled:false});
  plazaGeometry.rotateX(-Math.PI/2);plazaGeometry.translate(0,entryPlaza.ground-.22,0);
  const plaza=new THREE.Mesh(plazaGeometry,material('#bcc9b7'));plaza.name='entrance-plaza';
  plaza.receiveShadow=true;plaza.castShadow=true;root.add(plaza);
  const forecourtDetails=new THREE.Group();forecourtDetails.name='forecourt-rest-and-parking';root.add(forecourtDetails);
  createPlazaRestAreas(forecourtDetails,block);createParkingGround(forecourtDetails,block);
  function samples(from:string,to:string,offset:number) {
    const edge=edges.find(e=>e.mode==='walk'&&((e.from===from&&e.to===to)||(e.from===to&&e.to===from)))!;
    const path=edge.path!.map(p=>new THREE.Vector3(p.x,p.y+offset-.16,p.z));
    return edge.from===from?path:path.reverse();
  }
  function ribbon(
    path: THREE.Vector3[],
    width: number,
    color: string,
    parent: THREE.Group,
  ) {
    const vertices: number[] = [],
      indices: number[] = [];
    path.forEach((p, i) => {
      const tangent = path[Math.min(i + 1, path.length - 1)]
        .clone()
        .sub(path[Math.max(i - 1, 0)]);
      const cross = new THREE.Vector3(-tangent.z, 0, tangent.x)
        .normalize()
        .multiplyScalar(width / 2);
      vertices.push(
        p.x + cross.x,
        p.y,
        p.z + cross.z,
        p.x - cross.x,
        p.y,
        p.z - cross.z,
      );
      if (i < path.length - 1 && !(parent===roads && (isJunctionSegment(p,path[i+1])||isEntryPlazaSegment(p,path[i+1])))) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      parent===roads ? heatProjection.attach(new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:1})) : new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide,depthTest:false }),
    );
    mesh.renderOrder=parent===roads?1:7;
    mesh.receiveShadow=true;
    parent.add(mesh);
    return mesh;
  }
  const roads = new THREE.Group();
  root.add(roads);
  edges
    .filter((e) => e.mode === "walk")
    .forEach((e, i) =>
      ribbon(
        samples(e.from, e.to, 0.12),
        i < 8 ? 1.35 : [10,11,12].includes(i) ? 1.26 : .78,
        "#d9d8b9",
        roads,
      ),
    );
  const roadStructures=new Map<string,THREE.Group>();
  for(const edge of edges.filter(e=>e.mode==='walk'&&!e.structure)){
    yield;
    const deck=new THREE.Group();deck.name=`walking-steps-${edge.id}`;root.add(deck);roadStructures.set(edge.id,deck);
    const path=edge.path!,width=Number(edge.id.slice(5))<8?1.44:['road-10','road-11','road-12'].includes(edge.id)?1.35:.88;
    for(const landing of stairLandings[edge.id]??[]){if(!isEntryPlaza(landing.x,landing.z))block(landing.x,landing.y-.3,landing.z,width+.25,.23,width+.25,'#d0ceb0',deck);}
    let sinceSupport=2;
    path.slice(1).forEach((p,i)=>{
      const a=path[i],distance=Math.hypot(p.x-a.x,p.z-a.z);if(distance<.01||isJunctionSegment(a,p)||isEntryPlazaSegment(a,p))return;
      const x=(a.x+p.x)/2,z=(a.z+p.z)/2,angle=Math.atan2(p.x-a.x,p.z-a.z),top=a.y-.06;
      const slab=block(x,top-.22,z,width,.22,distance+.015,'#c7c5a7',deck);slab.rotation.y=angle;
      // A dark nosing separates each true step at normal overview scale.
      const riser=path[i+2];
      if(riser&&Math.abs(riser.y-p.y)>.06){
        const lip=block(p.x,top-.035,p.z,width,.035,.055,'#a8ad8e',deck);lip.rotation.y=angle;
      }
      sinceSupport+=distance;
      if(top-terrainHeight(x,z)>.7||isWaterfall(x,z)){
        for(const side of [-1,1]){
          const sx=x+Math.cos(angle)*side*width*.47,sz=z-Math.sin(angle)*side*width*.47;
          const rail=block(sx,top+.65,sz,.1,.12,distance+.04,'#64755f',deck);rail.rotation.y=angle;
          if(sinceSupport>=1.8){const ground=roadGroundHeight(sx,sz,walkingPaths);block(sx,ground,sz,.16,Math.max(.7,top+.7-ground),.16,'#64755f',deck);}
        }
        if(sinceSupport>=1.8)sinceSupport=0;
      }
    });
  }
  // Branches meet on one level, walkable apron. The summit court has only the
  // pavilion approach and two short service paths; the falls has one approach.
  for(const [id,width,depth] of [['r5',3.0,2.4],['summit',12.6,4.2]] as const){
    const n=nodeById[id],y=terrainHeight(n.x,n.z)+.16;
    block(id==='summit'?3:n.x,y-.3,id==='summit'?-20.5:n.z,width,.23,depth,'#c6c7ac');
  }
  // Junctions own their whole surface, including the shared facility throat.
  // There are no independent steps, diagonal fences or duplicate ribbons inside.
  const junctionGroups:THREE.Group[]=[];
  for(const j of junctions){
    const court=new THREE.Group();court.name=`junction-${j.id}`;root.add(court);junctionGroups.push(court);
    block(j.x,j.y-.68,j.z,j.width,.6,j.depth,'#89977c',court);
    block(j.x,j.y-.16,j.z,j.width,.12,j.depth,'#d8d6b8',court);
    for(const p of j.ports){
      const {gate,outer,dx,dz}=portPositions(j,p);
      block((gate.x+outer.x)/2,j.y-.3,(gate.z+outer.z)/2,dx?p.collar:p.width,.26,dx?p.width:p.collar,'#d8d6b8',court);
    }
    for(const {a,b} of junctionBoundary(j)){
      const length=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(b.x-a.x,b.z-a.z);
      for(const height of [.43,.82]){const rail=block((a.x+b.x)/2,j.y+height,(a.z+b.z)/2,.12,.12,length,'#66735a',court);rail.rotation.y=angle;}
      const count=Math.ceil(length/1.25);
      for(let n=0;n<=count;n++){const t=n/count;block(a.x+(b.x-a.x)*t,j.y-.04,a.z+(b.z-a.z)*t,.16,1.0,.16,'#66735a',court);}
    }
    for(const dx of [-1,1])for(const dz of [-1,1]){
      const x=j.x+dx*(j.width/2-.3),z=j.z+dz*(j.depth/2-.3),ground=roadGroundHeight(x,z,walkingPaths);
      block(x,ground,z,.46,Math.max(.3,j.y-.2-ground),.46,'#75816c',court);
    }
  }
  // The bridge deck, arch belly and balustrades follow road-1's shared elevation.
  const bridge=new THREE.Group();root.add(bridge);
  const bridgePath=edges.find(e=>e.structure==='bridge')!.path!;
  bridgePath.forEach((p,i)=>{
    if(i%2)return;
    const next=bridgePath[Math.min(i+1,bridgePath.length-1)],prev=bridgePath[Math.max(0,i-1)];
    const angle=Math.atan2(next.x-prev.x,next.z-prev.z);
    const slab=block(p.x,p.y-.44,p.z,1.62,.36,.8,'#c4b992',bridge);slab.rotation.y=angle;
    for(const side of [-1,1]){
      const x=p.x+Math.cos(angle)*side*.77,z=p.z-Math.sin(angle)*side*.77;
      const rail=block(x,p.y+.55,z,.12,.14,.85,'#8a493a',bridge);rail.rotation.y=angle;
      if(i%6===0){block(x,p.y,z,.17,.85,.17,'#bdaa82',bridge);block(x,p.y+.85,z,.26,.12,.26,'#cabc99',bridge);}
    }
  });
  reportPreparation(45);
  // A physical roadside sign, kept clear of the gorge and the climbing trail.
  yield;
  const sloganTextureCanvas=document.createElement('canvas');sloganTextureCanvas.width=1536;sloganTextureCanvas.height=768;
  const signContext=sloganTextureCanvas.getContext('2d')!;
  const signGradient=signContext.createLinearGradient(0,0,1536,768);
  signGradient.addColorStop(0,'#e1efcf');signGradient.addColorStop(1,'#b8d7b5');
  signContext.fillStyle=signGradient;signContext.fillRect(0,0,1536,768);
  // Quiet triangle mountain line art below the two-line message.
  signContext.strokeStyle='#719b7a';signContext.fillStyle='#a8c9a6';signContext.lineWidth=6;
  for(const [x,y,w,h] of [[60,716,330,255],[290,716,440,330],[1000,716,450,290],[1250,716,240,185]]){
    signContext.beginPath();signContext.moveTo(x,y);signContext.lineTo(x+w*.5,y-h);signContext.lineTo(x+w,y);signContext.closePath();signContext.fill();signContext.stroke();
    signContext.beginPath();signContext.moveTo(x+w*.35,y-h*.7);signContext.lineTo(x+w*.5,y-h*.85);signContext.lineTo(x+w*.65,y-h*.7);signContext.stroke();
  }
  signContext.strokeStyle='#456f56';signContext.lineWidth=7;signContext.strokeRect(35,35,1466,698);
  signContext.fillStyle='#204e3f';signContext.textAlign='center';signContext.textBaseline='middle';
  signContext.font='600 142px "PingFang SC", "Microsoft YaHei", sans-serif';
  signContext.fillText('绿水青山',768,235);signContext.fillText('就是金山银山',768,420);
  sloganTexture=new THREE.CanvasTexture(sloganTextureCanvas);sloganTexture.colorSpace=THREE.SRGBColorSpace;sloganTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const sign=new THREE.Group();sign.name='ecology-slogan';sign.position.set(14.8,terrainHeight(14.8,-18.8),-18.8);sign.rotation.y=.26;root.add(sign);
  block(0,0,0,.75,3.5,.65,'#526c60',sign);
  // The texture is the front/back material of one solid board: no coplanar
  // overlay or duplicate face can fight the frame depth while orbiting.
  const edgeMaterial=new THREE.MeshStandardMaterial({color:'#456f56',roughness:1});
  const faceMaterial=new THREE.MeshBasicMaterial({map:sloganTexture,toneMapped:false});
  const board=new THREE.Mesh(new THREE.BoxGeometry(9.6,5.6,.4),[edgeMaterial,edgeMaterial,edgeMaterial,edgeMaterial,faceMaterial,faceMaterial]);
  board.position.y=6.2;board.castShadow=true;sign.add(board);
  renderer.domElement.setAttribute('aria-description','景区宣传标牌：绿水青山，就是金山银山。');
  createWatercourseBanks(root,material);
  yield;
  waterEffects=createWaterAndMist(root);
  yield;
  // Deterministic grove placement keeps paths and point hit targets clear.
  let seed = 71;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const treeParts: {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    color: string;
    d?: number;
    yaw?: number;
  }[] = [];
  for (let i = 0; i < 450; i++) {
    if(i%30===0)yield;
    const x = rand() * 56 - 28,
      z = rand() * 52 - 24;
    if (
      points.some(p=>['terminal','safety'].includes(p.kind)&&Math.hypot(x-nodeById[p.nodeId].x,z-nodeById[p.nodeId].z)<1.3) ||
      !isIsland(x,z) || isLake(x,z) || isWaterfall(x,z) || isEntryPlaza(x,z,1.4) || parkingAreaAt(x,z,1.4) || pointCourtAt(x,z,.8) || (Math.abs(x-14.8)<5.5&&z>-21&&z<-14) ||
      nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 2.6)
    )
      continue;
    const nearRoad = edges.some(e=>e.mode==='walk'&&e.path!.some((p,i,path)=>i>0&&distanceToRoadSegment(x,z,path[i-1],p)<1.8));
    if (nearRoad) continue;
    const y = terrainHeight(x, z),
      h = 1.2 + rand() * 1.8;
    if(Math.hypot(x-23,z-3)<7.5){
      // Slender jointed culms, clustered together with sparse angular leaf sprays.
      for(let stem=0;stem<3;stem++){
        const sx=x+Math.cos(stem*2.4)*.38,sz=z+Math.sin(stem*2.4)*.38,height=3.4+rand()*1.5,base=terrainHeight(sx,sz);
        treeParts.push({x:sx,y:base,z:sz,w:.16,h:height,color:'#648a42'});
        for(let joint=.65;joint<height;joint+=.65){
          treeParts.push({x:sx,y:base+joint,z:sz,w:.22,h:.09,color:'#b5c584'});
          if(joint<height*.45)continue;
          const angle=stem*2.4+joint*2;
          for(const side of [-1,1])treeParts.push({x:sx+Math.cos(angle)*side*.43,y:base+joint+.1,z:sz+Math.sin(angle)*side*.43,w:1.1,d:.23,h:.15,yaw:-angle,color:side<0?'#386c44':'#588d4e'});
        }
      }
      continue;
    }
    if(Math.hypot(x+21,z-10)<7.5){
      const height=3.4+rand()*1.2;
      treeParts.push({x,y,z,w:.34,h:height,color:'#6a6248'});
      // Distinct, broad tiers of needles taper to a small upright crown.
      for(let tier=0;tier<3;tier++){
        const width=2.7-tier*.65,base=y+1.1+tier*.95;
        treeParts.push({x,y:base,z,w:width,h:.32,color:'#204d43'},
          {x,y:base+.32,z,w:width*.75,h:.36,color:'#2f6651'},
          {x,y:base+.68,z,w:width*.43,h:.28,color:'#417958'});
      }
      treeParts.push({x,y:y+4,z,w:.35,h:.7,color:'#417958'});
      continue;
    }
    treeParts.push(
      { x, y, z, w: 0.23, h, color: "#705e41" },
      {
        x,
        y: y + h * 0.55,
        z,
        w: 1.4,
        h: h * 0.6,
        color: i % 3 ? "#205e51" : "#34785a",
      },
      { x, y: y + h, z, w: 0.95, h: h * 0.4, color: "#468668" },
    );
  }
  const treeMaterial=heatProjection.attach(new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}));
  const trees = new THREE.InstancedMesh(cube, treeMaterial, treeParts.length);
  treeParts.forEach((p, i) => {
    matrix.compose(
      new THREE.Vector3(p.x, p.y + p.h / 2, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw??0),
      new THREE.Vector3(p.w, p.h, p.d??p.w),
    );
    trees.setMatrixAt(i, matrix);
    trees.setColorAt(i, new THREE.Color(p.color));
  });
  trees.castShadow = true;
  trees.receiveShadow = true;
  root.add(trees);
  reportPreparation(60);
  const pointGroups = new Map<string, THREE.Group>();
  function pavilion(
    x: number,
    y: number,
    z: number,
    parent: THREE.Group,
    scale = 1,
  ) {
    block(x, y, z, 3.6 * scale, 0.3, 3 * scale, "#d3c8a6", parent);
    for (const dx of [-1.2, 1.2])
      for (const dz of [-0.9, 0.9])
        block(
          x + dx * scale,
          y + 0.3,
          z + dz * scale,
          0.22 * scale,
          1.8 * scale,
          0.22 * scale,
          "#6f4335",
          parent,
        );
    for (let i = 0; i < 3; i++)
      block(
        x,
        y + 2 * scale + i * 0.3,
        z,
        (4.4 - i) * scale,
        0.33,
        (3.8 - i * 0.8) * scale,
        "#255d65",
        parent,
      );
  }
  for (const [pointIndex,point] of points.entries()) {
    reportPreparation(60+pointIndex/points.length*20);
    yield;
    const p = position(point.nodeId);
    const group = new THREE.Group();
    group.userData.pointId = point.id;
    pointGroups.set(point.id, group);
    root.add(group);
    const site=siteById[point.id];
    if(site){
      const c=site.court;
      block(c.x,site.ground-.2,c.z,c.width,.3,c.depth,'#d0ceb0',group);
      for(const dx of [-1,1])for(const dz of [-1,1]){
        const x=c.x+dx*(c.width/2-.3),z=c.z+dz*(c.depth/2-.3),ground=roadGroundHeight(x,z,walkingPaths);
        block(x,ground,z,.3,Math.max(.2,site.ground-ground),.3,'#75816c',group);
      }
    }
    if (point.kind === "attraction") {
      if (point.id === "bamboo") {
        for (let i = 0; i < 6; i++)
          block(
            p.x + ((i % 3) - 1) * 0.9,
            p.y,
            p.z + Math.floor(i / 3) - .5,
            0.35,
            3,
            0.35,
            "#3c826b",
            group,
          );
      } else {
        pavilion(p.x, p.y, p.z, group, point.id === "summit" ? 1.2 : 0.8);
      }
    }
    if (point.kind === "entrance") {
      if(point.id==='entry'){
        // Three clear passages, stepped eaves and a solid, legible name plaque.
        for(const dx of [-4.2,-2.1,2.1,4.2]){
          const inner=Math.abs(dx)<3;
          block(p.x+dx,p.y,p.z,.95,.38,1.0,'#bcc2a7',group);
          block(p.x+dx,p.y+.38,p.z,.56,inner?5.35:3.65,.62,'#e3dec0',group);
          block(p.x+dx,p.y+.72,p.z,.64,.16,.7,'#9aab8e',group);
          block(p.x+dx,p.y+(inner?5.3:3.65),p.z,.88,.3,.96,'#8fa68b',group);
        }
        block(p.x,p.y+3.7,p.z,9.5,.46,1.25,'#477566',group);
        block(p.x,p.y+4.04,p.z,10.8,.25,2.8,'#235e62',group);
        block(p.x,p.y+4.29,p.z,10.15,.24,2.2,'#337773',group);
        block(p.x,p.y+4.53,p.z,9.5,.18,1.5,'#548e7d',group);
        for(const side of [-1,1]){
          block(p.x+side*5.05,p.y+4.29,p.z,.8,.22,2.75,'#337773',group);
          block(p.x+side*5.35,p.y+4.5,p.z,.44,.2,2.65,'#548e7d',group);
        }
        block(p.x,p.y+5.55,p.z,5.5,.35,1.55,'#426c5b',group);
        block(p.x,p.y+5.86,p.z,6.5,.26,3.0,'#235e62',group);
        block(p.x,p.y+6.12,p.z,5.85,.24,2.35,'#337773',group);
        block(p.x,p.y+6.36,p.z,5.1,.2,1.6,'#548e7d',group);
        block(p.x,p.y+6.56,p.z,4.45,.2,.38,'#c6bb87',group);
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=288;
        const ctx=canvas.getContext('2d')!;
        ctx.fillStyle='#214e48';ctx.fillRect(0,0,1024,288);
        ctx.strokeStyle='#cdbf86';ctx.lineWidth=10;ctx.strokeRect(13,13,998,262);
        ctx.fillStyle='#f7ecd0';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.font='600 165px "PingFang SC", "Microsoft YaHei", sans-serif';ctx.fillText('青岚山境',512,151);
        const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=renderer.capabilities.getMaxAnisotropy();
        const face=new THREE.MeshBasicMaterial({map,toneMapped:false}),edge=new THREE.MeshStandardMaterial({color:'#b7ab7d',roughness:1});
        const plaque=new THREE.Mesh(new THREE.BoxGeometry(5.1,1.42,.26),[edge,edge,edge,edge,face,face]);
        plaque.position.set(p.x,p.y+5.05,p.z+1.3);group.add(plaque);
      }else{
        for(const dx of [-1.25,1.25])block(p.x+dx,p.y,p.z,.45,3.0,.6,'#b9ac82',group);
        block(p.x,p.y+2.55,p.z,3.4,.45,1.3,'#276858',group);
        block(p.x,p.y+2.95,p.z,3.8,.25,1.8,'#285e69',group);
      }
    }
    if(point.id==='market')createMarketVillage(group,p.y,block);
    else if (point.kind === "commercial") {
      const isSupply=point.id==='supply',shops=isSupply?new THREE.Group():group;
      const origin=isSupply?new THREE.Vector3():p;
      if(isSupply){shops.position.copy(p);shops.rotation.y=-Math.PI/2;group.add(shops);}
      for (let i = 0; i < (point.id === "market" ? 5 : 2); i++) {
        const x = origin.x + (isSupply?i-.5:(i % 3)-1) * 2.8,
          z = origin.z + Math.floor(i / 3) * 2.6;
        block(x, origin.y, z, 2.4, 1.7, 2, "#eadfc4", shops);
        block(
          x,
          origin.y + 1.7,
          z,
          2.8,
          0.45,
          2.4,
          i % 2 ? "#526d63" : "#986648",
          shops,
        );
        block(x, origin.y + 0.8, z + 1.1, 2.6, 0.12, 0.7, "#b6a274", shops);
      }
    }
    if (point.kind === "cable") {
      // The station platform is visibly grounded, including terrain cut by roads.
      block(p.x,p.y-.28,p.z,3.9,.28,2.9,'#aeb59b',group);
      for(const dx of [-1.45,1.45])for(const dz of [-.95,.95]){
        const x=p.x+dx,z=p.z+dz,ground=Math.min(p.y-.28,roadGroundHeight(x,z,walkingPaths));
        block(x,ground-.15,z,.38,p.y-ground+.15,.38,'#6e8070',group);
      }
      block(p.x, p.y, p.z, 3.2, 2.1, 2.2, "#ebe4c9", group);
      block(p.x, p.y + 2.1, p.z, 3.8, 0.35, 2.8, "#285d65", group);
      // A small station gantry carries the cable endpoint above the roof.
      const other=position(point.id==='upper'?'lower':'upper',5),endpoint=position(point.id,5);
      const along=other.clone().sub(endpoint).setY(0).normalize(),across=new THREE.Vector3(-along.z,0,along.x);
      for(const side of [-1,1])block(p.x+across.x*side*1.28,p.y+2.45,p.z+across.z*side*1.28,.26,endpoint.y-p.y-2.65,.26,'#607c6d',group);
      const head=block(p.x,endpoint.y-.2,p.z,2.96,.2,.4,'#607c6d',group);head.rotation.y=-Math.atan2(across.z,across.x);
      block(p.x,endpoint.y-.45,p.z,.5,.25,.5,'#52665c',group);
      group.userData.stationSupported=true;
    }
    if(point.kind==='parking')createParkingRow(point.id,group,block);
    if (point.kind === "toilet") {
      block(p.x, p.y, p.z, 1.3, 1, 1, "#dbe7d7", group);
      block(p.x, p.y + 1, p.z, 1.6, 0.2, 1.2, "#547a70", group);
    }
    if(point.kind==='terminal'){
      group.name=`fixture-${point.id}`;
      block(p.x,p.y,p.z,.95,.16,.7,'#b9c6b1',group);
      block(p.x,p.y+.16,p.z,.65,1.55,.38,'#477568',group);
      block(p.x,p.y+1.71,p.z,.95,.72,.4,'#e3e8cf',group);
      block(p.x,p.y+1.8,p.z+.215,.73,.5,.04,'#255d65',group);
      block(p.x,p.y+1.88,p.z+.242,.48,.04,.015,'#a5d4c5',group);
    }
    if(point.kind==='safety'){
      block(p.x,p.y,p.z,.18,1.25,.18,'#647d6c',group);
      block(p.x,p.y+1.25,p.z,.65,.65,.18,point.safetyKind==='extinguisher'?'#ac5a47':'#477c65',group);
      block(p.x,p.y+1.52,p.z+.1,.4,.1,.03,'#f4f3df',group);
      if(point.safetyKind==='aed'||point.safetyKind==='first-aid')block(p.x,p.y+1.37,p.z+.1,.1,.4,.03,'#f4f3df',group);
    }
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(
        ['terminal','safety'].includes(point.kind)?1.2:point.id==='entry'?11:point.kind === "commercial" ? 8 : 4,
        point.id==='entry'?7.4:5,
        point.kind === "commercial" ? 7 : 4,
      ),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.copy(p).add(new THREE.Vector3(0,point.id==='entry'?3.4:2,0));
    hit.userData.pointId = point.id;
    group.add(hit);
    picks.push(hit);
  }
  reportPreparation(80);
  // Batch static voxel parts by material; point groups remain independently selectable.
  for(const group of [...pointGroups.values(),bridge,...roadStructures.values(),...junctionGroups,forecourtDetails]) {
    yield;
    const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
    for(const child of [...group.children]) {
      if(!(child instanceof THREE.Mesh)||child.userData.pointId||Array.isArray(child.material))continue;
      child.updateMatrix();
      const geometry=child.geometry.clone().applyMatrix4(child.matrix);
      const batch=batches.get(child.material)??[];batch.push(geometry);batches.set(child.material,batch);group.remove(child);
    }
    for(const [mat,geometries] of batches){
      const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
      const mesh=new THREE.Mesh(combined,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
  }
  reportPreparation(85);
  const cablePath = [position("upper",5),position("lower",5)];
  const direction=cablePath[1].clone().sub(cablePath[0]).normalize(), across=new THREE.Vector3(-direction.z,0,direction.x).normalize();
  const cableLoopPoints:THREE.Vector3[]=[];
  for(let i=0;i<=120;i++) {
    const t=i/120*Math.PI*2;
    // A capsule-like closed loop with rounded station turnarounds, no position reset.
    const along=(1-Math.cos(t))/2;
    cableLoopPoints.push(cablePath[0].clone().lerp(cablePath[1],along).addScaledVector(across,Math.sin(t)*.85));
  }
  const cableCurve=new THREE.CatmullRomCurve3(cableLoopPoints.slice(0,-1),true);
  root.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(cableCurve.getPoints(240)),new THREE.LineBasicMaterial({color:'#405d58'})));
  for(const support of cableSupportLayout()) {
    const {center:p,shaft,across,beamStart,beamEnd}=support;
    block(shaft.x,shaft.y,shaft.z,.32,Math.max(.5,p.y-shaft.y),.32,'#718677');
    const middle=(beamStart+beamEnd)/2;
    const beam=block(p.x+across.x*middle,p.y,p.z+across.z*middle,beamEnd-beamStart,.22,.35,'#52665c');
    beam.rotation.y=-Math.atan2(across.z,across.x);
  }
  const cabins:THREE.Group[]=[];
  for(let i=0;i<6;i++) {
    const cabin=new THREE.Group();
    block(0,-1.6,0,1.15,.8,.9,'#c6a362',cabin);block(0,-1,0,1.16,.36,.92,'#d3e8de',cabin);block(0,-.7,0,.1,.7,.1,'#52665c',cabin);
    root.add(cabin);cabins.push(cabin);cabin.position.copy(cableCurve.getPointAt(i/6));
  }
  const selection = new THREE.Group();
  root.add(selection);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 2.67, 64),
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  selection.add(ring);
  const innerRing=new THREE.Mesh(new THREE.RingGeometry(2.53,2.61,64),new THREE.MeshBasicMaterial({color:'#255d78',side:THREE.DoubleSide,depthTest:false}));
  innerRing.rotation.copy(ring.rotation);innerRing.renderOrder=6;selection.add(innerRing);
  selection.visible = false;
  const routeGroup = new THREE.Group();
  root.add(routeGroup);
  let routeKey = "";
  const clearGroup = (group: THREE.Group) => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((m) => m.dispose());
      }
    }
  };
  function update(
    snapshot: PublicSnapshot,
    heat: boolean,
    selected: string | null,
    route: RouteResult | null,
    viewMode?: ScenicViewMode,
  ) {
    heatProjection.update(snapshot,heat);
    const focusKind=viewMode==='toilet'||viewMode==='safety'?viewMode:null;
    contextMuting.amount.value=focusKind?1:0;
    host.dataset.viewMode=viewMode??(heat?'crowd':'default');
    host.dataset.contextMuted=String(!!focusKind);
    host.dataset.facilityColors=JSON.stringify(focusKind?Object.fromEntries(points.filter(p=>p.kind===focusKind).map(p=>[p.id,facilityColor(p,snapshot.points[p.id])])):{});
    cableRunning=snapshot.points.upper?.availability==='open'&&snapshot.points.lower?.availability==='open'&&!snapshot.closedEdgeIds.includes('cable-down');
    const closedNodes=closedRouteNodes(snapshot);
    const bridgeClosed=snapshot.closedEdgeIds.includes('road-1');
    bridge.traverse(child=>{if(child instanceof THREE.Mesh){child.userData.originalMaterial??=child.material;child.material=bridgeClosed?material('#8b9791'):child.userData.originalMaterial;}});
    edges
      .filter((e) => e.mode === "walk")
      .forEach((e, i) => {
        const closed =
          snapshot.closedEdgeIds.includes(e.id) ||
          [e.from,e.to].some(id=>closedNodes.has(id));
        (
          roads.children[i] as THREE.Mesh<
            THREE.BufferGeometry,
            THREE.MeshStandardMaterial
          >
        ).material = closed ? material('#8b9791') : material('#d9d8b9');
        roadStructures.get(e.id)?.traverse(child=>{if(child instanceof THREE.Mesh){child.userData.originalMaterial??=child.material;child.material=closed?material('#8b9791'):child.userData.originalMaterial;}});
      });
    for (const [id, group] of pointGroups) {
      const state = snapshot.points[id];
      group.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial
        ) {
          if (!child.userData.originalMaterial)
            child.userData.originalMaterial = child.material;
          child.material =
            state && state.availability !== "open"
              ? material("#8b9791")
              : child.userData.originalMaterial;
          if(focusKind&&pointById[id].kind===focusKind)child.material=focusMaterial(facilityColor(pointById[id],state));
        }
      });
    }
    selection.visible = !!selected;
    if (selected) selection.position.copy(position(selected, 0.4));
    const key = JSON.stringify(route);
    if (key !== routeKey) {
      routeKey = key;
      clearGroup(routeGroup);
      if (route?.ok) {
        route.edgeIds.forEach((id, i) => {
          const edge = edges.find((e) => e.id === id)!;
          const path =
            edge.mode === "cable"
              ? cableCurve.getPoints(160).slice(0,81).map(p=>p.add(new THREE.Vector3(0,.15,0)))
              : samples(route.nodeIds[i], route.nodeIds[i + 1], 0.26);
          ribbon(path, 0.66, "#f7fcf1", routeGroup);
          ribbon(
            path.map((p) => p.clone().add(new THREE.Vector3(0, 0.025, 0))),
            0.33,
            "#204f6d",
            routeGroup,
          );
          const arrowPoint = path[Math.floor(path.length / 2)],
            direction = path[Math.min(path.length-1,Math.floor(path.length/2)+1)].clone().sub(path[Math.max(0,Math.floor(path.length/2)-1)]);
          direction.y = 0;
          direction.normalize();
          const shape = new THREE.Shape();
          shape.moveTo(0, 0.48);
          shape.lineTo(-0.35, -0.3);
          shape.lineTo(0.35, -0.3);
          shape.closePath();
          const arrow = new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({
              color: "#fffdf0",
              side: THREE.DoubleSide,
              depthTest: false,
            }),
          );
          arrow.rotation.x = -Math.PI / 2;
          arrow.rotation.z = Math.atan2(direction.x, -direction.z);
          arrow.position.copy(arrowPoint).add(new THREE.Vector3(0, 0.12, 0));
          arrow.renderOrder = 8;
          routeGroup.add(arrow);
        });
      }
    }
    root.traverse(child=>{
      if(child.parent===routeGroup||child.parent===selection)return;
      if(child instanceof THREE.Mesh||child instanceof THREE.Line){
        for(const mat of Array.isArray(child.material)?child.material:[child.material])contextMuting.attach(mat);
      }
    });
  }
  modelUpdate=update;
  updateCabins=(elapsed)=>cabins.forEach((c,i)=>c.position.copy(cableCurve.getPointAt((elapsed/110+i/6)%1)));
  if(pendingUpdate)modelUpdate(...pendingUpdate);
  root.traverse(o=>{
    if(o instanceof THREE.Mesh||o instanceof THREE.Line){
      for(const mat of Array.isArray(o.material)?o.material:[o.material]){
        if(!(mat instanceof THREE.ShaderMaterial)){mat.clippingPlanes=[clipPlane];mat.clipShadows=true;}
      }
    }
  });
  }
  const build=buildModel();
  const fail=(error:unknown)=>{
    if(disposed||introState==='failed')return;
    timeline.fail();setIntroState('failed');root.visible=false;
    options.onError?.(error);
  };
  artwork?.ready.then(()=>{if(!disposed){artworkReady=true;reportPreparation(10);}}).catch(fail);
  renderer.debug.onShaderError=()=>fail(new Error('Scenic material could not compile'));
  const contextLost=(event:Event)=>{event.preventDefault();fail(new Error('WebGL context lost'));};
  renderer.domElement.addEventListener('webglcontextlost',contextLost);
  const advanceBuild=()=>{
    if(modelReady||compiling||!artworkReady||introState==='failed')return;
    try{
      const start=performance.now();
      for(let steps=0;steps<8;steps++){
        if(build.next().done){
          reportPreparation(90);
          compiling=true;root.visible=true;root.updateMatrixWorld(true);
          Promise.all([renderer.compileAsync(scene, camera),renderer.compileAsync(scrollScene,camera)]).then(()=>{
            if(disposed||introState==='failed')return;
            reportPreparation(95);
            // Compile alone does not upload all buffers/textures or draw shadows.
            // Warm an offscreen frame before the visible timeline starts.
            const warmTarget=new THREE.WebGLRenderTarget(64,64);
            const previousTarget=renderer.getRenderTarget(),previousY=root.position.y,previousClip=clipPlane.constant;
            try{
              root.visible=true;root.position.y=0;clipPlane.constant=10000;
              scroll?.update({opening:1,opacity:1,ink:1,time:0,azimuth:scrollAzimuth});
              renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(warmTarget);
              renderLayers();renderer.getContext().finish();
              host.dataset.prepared='true';reportPreparation(100);
              preparationTimer=setTimeout(()=>{if(!disposed&&introState!=='failed')modelReady=true;},180);
            }finally{
              renderer.setRenderTarget(previousTarget);warmTarget.dispose();
              root.visible=false;root.position.y=previousY;clipPlane.constant=previousClip;
              scroll?.update({opening:.02,opacity:0,ink:1,time:0,azimuth:scrollAzimuth});
              renderer.shadowMap.needsUpdate=true;
            }
          }).catch(fail);
          root.visible=false;
          break;
        }
        if(performance.now()-start>7)break;
      }
    }catch(error){fail(error);}
  };
  let pointerStart = { x: 0, y: 0 }, pointerDragged=false;
  const activePointers=new Set<number>();
  const pointerDown = (e: PointerEvent) => {
    activePointers.add(e.pointerId);
    if(activePointers.size===1){pointerStart={x:e.clientX,y:e.clientY};pointerDragged=false;}
    else pointerDragged=true;
  };
  const pointerMove=(e:PointerEvent)=>{
    if(activePointers.has(e.pointerId)&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>7)pointerDragged=true;
  };
  const pointerCancel=(e:PointerEvent)=>{activePointers.delete(e.pointerId);pointerDragged=true;};
  const pointerUp = (e: PointerEvent) => {
    const tracked=activePointers.delete(e.pointerId);
    if(!tracked||!unlocked()||pointerDragged||activePointers.size>0||e.button!==0)return;
    if (Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 7)
      return;
    const rect = renderer.domElement.getBoundingClientRect(),
      mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(picks.filter(p=>options.canSelect?.(p.userData.pointId)??true))[0];
    if (hit) onSelect(hit.object.userData.pointId);
    else options.onBlank?.();
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointercancel", pointerCancel);
  let resizePending = true;
  const resizeViewport = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    resizePending = false;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(34*Math.PI/360)*Math.max(1,1.1/camera.aspect)));
    updateFocusInset();
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  };
  const observer = new ResizeObserver(() => {
    // ResizeObserver runs after RAF. Resizing here clears the drawing buffer
    // after rendering and exposes an empty canvas during container transitions.
    // Apply the resize in the render frame so it is redrawn before paint.
    resizePending = true;
  });
  observer.observe(host);
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = media.matches;
  const change = () => {
    reduced = media.matches;
    controls.enableDamping = false;
  };
  media.addEventListener("change", change);
  change();
  let frame = 0,
    disposed = false,
    lastMeasure = performance.now(),
    frames = 0,
    slowWindows = 0,
    level = 0,
    previousTime=0, animationTime=0, cableTime=0, paperTime=0;
  const animate = (time: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt=Math.min((time-previousTime)/1000,.05);previousTime=time;
    if (document.hidden) {
      lastMeasure = time;
      frames = 0;
      return;
    }
    if(introState==='failed')return;
    if (resizePending) resizeViewport();
    const intro=timeline.advance(artworkReady?dt:0,modelReady&&artworkReady,reduced);
    setIntroState(intro.state);
    root.visible=modelReady&&(intro.rise>0||!options.intro||reduced);
    // The intro owns its initial framing once; later point flights own the orbit target.
    const currentPaperY=paperY;
    if(options.intro&&intro.time<6&&!reduced){
      const approach=smoothProgress((intro.time-3)/3);
      const azimuth=controls.getAzimuthalAngle()-Math.atan2(overviewOffset.x,overviewOffset.z);
      const shotOffset=overviewOffset.clone().multiplyScalar(THREE.MathUtils.lerp(1.48,1,approach));
      shotOffset.applyAxisAngle(new THREE.Vector3(0,1,0),azimuth);
      controls.target.set(0,THREE.MathUtils.lerp(paperY+1,2,approach),2);
      camera.position.copy(controls.target).add(shotOffset);
    }else if(options.intro&&!introCameraSettled){
      introCameraSettled=true;
      const azimuth=controls.getAzimuthalAngle()-Math.atan2(overviewOffset.x,overviewOffset.z);
      controls.target.set(0,2,2);camera.position.copy(controls.target).add(overviewOffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),azimuth));
    }
    root.position.y=(paperY-30)*(1-intro.rise);
    clipPlane.constant=intro.rise>=1?10000:-paperY-.3;
    waterEffects?.setIntro(intro.mist,intro.rise>=1?-10000:paperY+.3);
    host.dataset.introTime=intro.time.toFixed(3);host.dataset.modelReady=String(modelReady);
    host.dataset.islandY=root.position.y.toFixed(3);host.dataset.paperY=currentPaperY.toFixed(3);
    if(unlocked()&&flight){
      const next=flight.advance(dt,reduced);applyPose(next);
      if(islandFlight)applyIslandPose(islandFlight.advance(dt,reduced));
      if(next.done){flight=undefined;islandFlight=undefined;islandFlightTarget=undefined;flightTarget=undefined;if(!focusedId){controls.minDistance=32;savedOverview=undefined;}}
    }
    if(!reduced) {
      animationTime+=dt;
      if(unlocked())paperTime+=dt;
      if(cableRunning)cableTime+=dt;
      updateCabins(cableTime);

      if(autoRotate&&!focusedId&&!flight&&!controlsInteracting&&(unlocked()||introState==='finishing')){
        if(unlocked())settleOverviewOrigin();
        spinSpeed=Math.min(1,spinSpeed+dt/3);
        applyIslandPose(rotateIslandPose(islandPose(),orbitOrigin,-dt*Math.PI*2/240*spinSpeed));
      }
    }
    controls.update();
    // OrbitControls supplies mouse/touch gestures; only the floating model consumes yaw.
    // Keep the shared camera's heading stable so the scroll base does not turn.
    const turn=Math.atan2(Math.sin(controls.getAzimuthalAngle()-baseAzimuth),Math.cos(controls.getAzimuthalAngle()-baseAzimuth));
    if(unlocked()&&Math.abs(turn)>1e-10){
      applyIslandPose(rotateIslandPose(islandPose(),controls.target,-turn));
      const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),-turn);
      camera.position.copy(controls.target).add(offset);controls.update();
    }
    islandFrame.updateMatrixWorld(true);
    // Island and sunlight rotate together, so the cached shadow texture remains valid.
    sun.shadow.updateMatrices(sun);
    camera.updateMatrixWorld();
    mistCamera.quaternion.copy(islandFrame.quaternion).invert().multiply(camera.quaternion);
    waterEffects?.update(animationTime,mistCamera);
    scroll?.update({opening:intro.open,opacity:reduced||!options.intro?1:smoothProgress(intro.time/.5),ink:intro.ink*(1-intro.rise*.88),time:paperTime,azimuth:scrollAzimuth});
    if(scroll){
      scroll.group.updateMatrixWorld(true);
      host.dataset.scrollTransform=JSON.stringify(scroll.group.matrixWorld.toArray());
      host.dataset.scrollAnchor=JSON.stringify(scroll.group.position.clone().project(camera).toArray());
      host.dataset.scrollFootprint=JSON.stringify([[-50,-39],[50,-39],[50,39],[-50,39]].map(([x,z])=>scroll.group.localToWorld(new THREE.Vector3(x,0,z)).project(camera).toArray()));
    }
    host.dataset.scrollCamera='shared';
    host.dataset.scrollLayer='background';
    host.dataset.scrollAzimuth=(scroll?.group.rotation.y??0).toFixed(5);
    host.dataset.paperTime=paperTime.toFixed(3);
    if(intro.state==='revealing'||intro.state==='finishing')renderer.shadowMap.needsUpdate=true;
    const pivot=controls.target.clone().project(camera);host.dataset.center=JSON.stringify({x:(pivot.x+1)*host.clientWidth/2,y:(1-pivot.y)*host.clientHeight/2});host.dataset.distance=camera.position.distanceTo(controls.target).toFixed(3);
    host.dataset.islandTransform=JSON.stringify(islandFrame.matrixWorld.toArray());
    host.dataset.cameraAzimuth=controls.getAzimuthalAngle().toFixed(5);
    host.dataset.azimuth=(baseAzimuth-islandFrame.rotation.y).toFixed(5);host.dataset.polar=controls.getPolarAngle().toFixed(5);
    host.dataset.spinning=String(autoRotate&&!focusedId&&!flight&&!controlsInteracting&&(unlocked()||introState==='finishing')&&!reduced);
    host.dataset.cameraMotion=flight?'flying':focusedId?'focused':'overview';
    host.dataset.focusedPoint=focusedId??'';
    host.dataset.target=JSON.stringify(controls.target.toArray());host.dataset.cableRunning=String(cableRunning&&!reduced);
    host.dataset.animationTime=animationTime.toFixed(3);host.dataset.cableTime=cableTime.toFixed(3);
    if(Math.abs(focusInset-focusInsetTarget)>.01){focusInset=reduced?focusInsetTarget:THREE.MathUtils.damp(focusInset,focusInsetTarget,12,dt);updateFocusInset();}
    host.dataset.regionLabelCount=String(options.enableRegionLabels?Object.keys(regionLabelSites).length:0);
    try{renderLayers();}catch(error){fail(error);return;}
    if(!modelReady)advanceBuild();
    frames++;
    {
      // Project on the same RAF as the camera render; throttling this made DOM
      // markers lag behind the model during rotation and direct dragging.
      const out: Record<string, { x: number; y: number; visible: boolean }> =
        {};
      for (const n of nodes) {
        const v = worldPosition(n.id,markerOffset(n.id)).project(camera);
        out[n.id] = {
          x: ((v.x + 1) / 2) * host.clientWidth,
          y: ((1 - v.y) / 2) * host.clientHeight,
          visible:
            modelReady && intro.rise>=1 && v.z < 1 && v.z > -1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
        };
      }
      for(const region of regions){
        const v=islandFrame.localToWorld(new THREE.Vector3(region.x,terrainHeight(region.x,region.z)+1.5,region.z)).project(camera);
        out[`region-${region.id}`]={x:(v.x+1)*host.clientWidth/2,y:(1-v.y)*host.clientHeight/2,
          visible:modelReady&&intro.rise>=1&&Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1};

      }
      if(options.enableRegionLabels){
        for(const [id,site] of Object.entries(regionLabelSites)){
          const world=islandFrame.localToWorld(new THREE.Vector3(site.x,site.y??-2.1,site.z));
          const normal=new THREE.Vector3(site.nx,0,site.nz).normalize().transformDirection(islandFrame.matrixWorld);
          const facing=normal.dot(camera.position.clone().sub(world).normalize());
          const wasVisible=labelFacingState.get(id)??false;
          const facingVisible=!!site.alwaysVisible||facing>Math.cos((wasVisible?84:76)*Math.PI/180);
          labelFacingState.set(id,facingVisible);
          const v=world.project(camera);
          out[`region-label-${id}`]={x:(v.x+1)*host.clientWidth/2,y:(1-v.y)*host.clientHeight/2,visible:modelReady&&intro.rise>=1&&facingVisible&&Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1};
        }
      }
      onProject(out);
    }
    if (unlocked() && time - lastMeasure >= 5000) {
      const fps = (frames * 1000) / (time - lastMeasure);
      slowWindows = fps < 30 ? slowWindows + 1 : 0;
      if (slowWindows >= 2 && level < 3) {
        level++;
        renderer.setPixelRatio(level === 1 ? 1.2 : 1);
        if (level >= 2) renderer.shadowMap.enabled = false;
        waterEffects?.setQuality(level);
        onPerformance(level);
        slowWindows = 0;
      }
      frames = 0;
      lastMeasure = time;
    }
  };
  frame = requestAnimationFrame(animate);
  return {
    update,
    interact(){if(unlocked())interact();},
    resume(){if(unlocked())spinSpeed=0;},
    reset(preserveAngle=false) {
      if(!unlocked())return;
      const offset=preserveAngle?camera.position.clone().sub(controls.target).setLength(defaultDistance):overviewOffset.clone();
      savedOverview=undefined;savedIsland=undefined;focusedId=null;
      // Keep the focused distance legal until the return transition has finished.
      controls.minDistance=20;
      moveTo({target:orbitOrigin.clone(),offset},centeredIslandPose(orbitOrigin,preserveAngle?islandFrame.rotation.y:0));
      if(!flight)controls.minDistance=32;
    },
    zoom(factor) {
      if(!unlocked())return;
      if(!Number.isFinite(factor)||factor<=0)return;
      // Repeated presses accumulate against the destination while continuing
      // smoothly from the camera's current pose.
      const next=flightTarget??pose();
      const distance=THREE.MathUtils.clamp(next.offset.length()*factor,focusedId?20:32,controls.maxDistance);
      moveTo({target:focusedId?next.target.clone():orbitOrigin.clone(),offset:next.offset.clone().setLength(distance)},islandFlightTarget??(focusedId?islandPose():centeredIslandPose(orbitOrigin,islandFrame.rotation.y)));
    },
    focus(id){
      const region=id.startsWith('region-')?regions.find(r=>`region-${r.id}`===id):undefined;
      if(!unlocked()||(!pointById[id]&&!region))return;
      if(!savedOverview){savedOverview=pose();savedIsland=islandPose();}focusedId=id;controls.minDistance=20;
      const distance=Math.max(20,Math.min(savedOverview.offset.length()*.48,60));
      moveTo({target:region?islandFrame.localToWorld(new THREE.Vector3(region.x,terrainHeight(region.x,region.z)+1.5,region.z)):worldPosition(pointById[id].nodeId,markerOffset(id)),offset:pose().offset.normalize().multiplyScalar(distance)});
    },
    restoreFocus,
    setFocusInset(right){focusInsetTarget=right;},
    setAutoRotate(enabled){autoRotate=enabled;if(!enabled)spinSpeed=0;},
    dispose() {
      disposed = true;
      clearTimeout(preparationTimer);
      cancelAnimationFrame(frame);
      build.return();scroll?.dispose();artwork?.dispose();waterEffects?.dispose();
      renderer.domElement.removeEventListener('webglcontextlost',contextLost);
      observer.disconnect();
      media.removeEventListener("change", change);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      focusMaterials.forEach(mat=>mat.dispose());
      heatProjection.dispose();sloganTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
