import * as THREE from 'three';
import {parkingCourts,parkingZones} from './parking';
import {entryPlaza} from './plaza';
type Block=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,parent:THREE.Object3D)=>THREE.Mesh;
export function createParkingGround(group:THREE.Group,block:Block){
  const y=entryPlaza.ground+.12;
  for(const c of parkingCourts){
    block(c.x,y-.24,c.z,c.width,.24,c.depth,'#8e9e92',group);
    block(c.x,y+.005,c.laneZ,c.width-.2,.025,1.95,'#768d81',group);
    block(c.driveX,y-.2,(c.laneZ+c.driveEnd)/2,1.4,.2,c.driveEnd-c.laneZ,'#768d81',group);
    const walkX=c.id!=='east'?c.x+c.width/2+.35:c.x-c.width/2-.35;
    block(walkX,y-.12,c.z,.7,.14,c.depth,'#c0c9b4',group);
    for(let z=c.z-c.depth/2+.35;z<c.z+c.depth/2;z+=1.2)block(walkX,y+.02,z,.065,.035,.52,'#e1e5cf',group);
    for(const direction of [-1,1]){
      const x=c.x+direction*1.6,z=c.laneZ-direction*.42;
      block(x,y+.04,z,1.05,.025,.065,'#dbe0c8',group);
      for(const side of [-1,1]){
        const arrow=block(x+direction*.35,y+.04,z+side*.14,.4,.025,.065,'#dbe0c8',group);arrow.rotation.y=direction*side*Math.PI/4;
      }
    }
    const crossingX=c.id!=='east'?c.x+c.width/2-.5:c.x-c.width/2+.5;
    for(let z=c.laneZ-.75;z<c.laneZ+.8;z+=.32)block(crossingX,y+.04,z,.85,.025,.16,'#e3e4cb',group);
    for(const z of [c.z-c.depth/2+.25,c.z+c.depth/2-.25]){
      block(walkX,y+.02,z,.14,.48,.14,'#657e6a',group);
      block(walkX,y+.39,z,.15,.08,.15,'#d8d4af',group);
    }
    // A short threshold and barrier identify the vehicle entrance at the map cut.
    block(c.driveX-.58,y,c.driveEnd-.45,.18,.65,.18,'#4e6c60',group);
    block(c.driveX-.2,y+.62,c.driveEnd-.45,.88,.08,.1,'#d7c798',group);
  }
}
export function createParkingRow(id:string,parent:THREE.Group,block:Block){
  const zone=parkingZones.find(z=>z.id===id)!;const y=entryPlaza.ground+.12;
  for(const [i,x] of zone.bayXs.entries()){
    for(const side of [-1,1])block(x+side*.49,y+.025,zone.z,.045,.025,1.52,'#e4e8d6',parent);
    block(x,y+.025,zone.z-zone.face*.76,.98,.025,.045,'#e4e8d6',parent);
    block(x,y+.05,zone.z-zone.face*.6,.5,.06,.09,'#c3c1a1',parent);
    if((i+(id==='p3'?1:0))%3===1)continue;
    block(x,y+.06,zone.z,.57,.34,1.13,i%2?'#4c716c':'#e0dfcc',parent);
    block(x,y+.4,zone.z-zone.face*.04,.51,.23,.61,'#a1bec0',parent);
    for(const side of [-1,1])block(x+side*.26,y+.05,zone.z,.06,.18,.73,'#40554e',parent);
  }
}
