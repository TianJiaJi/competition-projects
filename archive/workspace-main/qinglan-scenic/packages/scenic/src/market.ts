import * as THREE from 'three';

type Block=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,parent:THREE.Object3D)=>THREE.Mesh;

/** Unequal shop volumes gather around a small courtyard instead of a repeated grid. */
export function createMarketVillage(parent:THREE.Group,ground:number,block:Block){
  function orient(x:number,z:number,yaw:number,build:(group:THREE.Group)=>void){
    const group=new THREE.Group();group.position.set(x,ground,z);group.rotation.y=yaw;
    build(group);group.updateMatrix();
    // Flatten the small local assemblies so the existing material batching still applies.
    for(const child of [...group.children]){child.applyMatrix4(group.matrix);parent.add(child);}
  }
  const shops=[
    {x:-17.7,z:20.25,yaw:-.14,w:2.1,d:2,h:2.4,roof:'#536e62',awning:'#a9ba96',label:'茶'},
    {x:-14.8,z:20.6,yaw:.12,w:2.8,d:1.9,h:1.6,roof:'#986648',awning:'#e2cf9f',label:'食'},
    {x:-17.2,z:23.4,yaw:Math.PI+.22,w:2.7,d:1.55,h:1.35,roof:'#326c65',awning:'#c4ad7c',label:'礼'},
  ];
  for(const s of shops)orient(s.x,s.z,s.yaw,g=>{
    block(0,0,0,s.w+.18,.14,s.d+.14,'#bdc1a6',g);
    block(0,.14,0,s.w,s.h,s.d,'#e7ddc0',g);
    for(const side of [-1,1]){
      block(side*(s.w/2-.1),.14,s.d/2+.02,.15,s.h,.16,'#6c6248',g);
      block(side*s.w*.29,.75,s.d/2+.06,s.w*.2,.56,.1,'#4c6b5b',g);
    }
    block(0,.14,s.d/2+.04,.48,1.05,.12,'#65735c',g);
    for(let tier=0;tier<3;tier++)block(0,s.h+.14+tier*.19,0,s.w+.4-tier*.13,.2,Math.max(.4,s.d+.3-tier*.63),s.roof,g);
    block(0,s.h+.71,0,s.w+.12,.12,.2,'#b9ba8e',g);
    block(0,s.h-.08,s.d/2+.34,s.w*.77,.11,.65,s.awning,g);
    block(s.w*.28,.38,s.d/2+.27,.42,.5,.34,'#aa8b5a',g);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=192;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#efe2bc';ctx.fillRect(0,0,128,192);
    ctx.fillStyle='#3e6250';ctx.font='600 94px "PingFang SC",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s.label,64,100);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const face=new THREE.MeshBasicMaterial({map,toneMapped:false});
    const sign=new THREE.Mesh(new THREE.BoxGeometry(.37,.58,.12),face);
    sign.position.set(-s.w*.39,s.h-.12,s.d/2+.39);g.add(sign);
  });
  orient(-14.5,23.4,Math.PI-.18,g=>{
    for(const x of [-.72,.72])for(const z of [-.53,.53])block(x,0,z,.1,1.7,.1,'#776b4e',g);
    block(0,1.62,0,1.9,.16,1.65,'#d1bb8c',g);
    block(0,1.78,0,1.45,.1,1.25,'#e2d1a6',g);
    block(0,0,.36,1.4,.65,.58,'#a18b61',g);
    for(const x of [-.43,0,.43])block(x,.65,.36,.28,.18,.3,'#608877',g);
  });
  // A small outdoor sitting corner leaves the eastern entrance unobstructed.
  orient(-16,22.5,.17,g=>{
    block(0,0,0,.2,.63,.2,'#75694b',g);block(0,.63,0,.85,.1,.85,'#b69f70',g);
    for(const side of [-1,1]){
      block(side*.85,0,0,.1,.35,.32,'#65745b',g);
      block(side*.85,.35,0,.45,.1,.5,'#b29b70',g);
    }
  });
}
