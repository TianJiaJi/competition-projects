import {Vector3} from 'three';

export interface IslandPose {position:Vector3;heading:number}
const up=new Vector3(0,1,0);

/** Rotate a rigid island around a world-space pivot without moving its base. */
export function rotateIslandPose(pose:IslandPose,pivot:Vector3,angle:number):IslandPose {
  return {position:pose.position.clone().sub(pivot).applyAxisAngle(up,angle).add(pivot),heading:pose.heading+angle};
}

export function centeredIslandPose(pivot:Vector3,heading:number):IslandPose {
  return rotateIslandPose({position:new Vector3(),heading:0},pivot,heading);
}

/** Match the camera flight's duration and easing when returning from a detail pivot. */
export function createIslandFlight(from:IslandPose,to:IslandPose,duration=1.05){
  const start={position:from.position.clone(),heading:from.heading};
  const end={position:to.position.clone(),heading:to.heading};
  const turn=Math.atan2(Math.sin(end.heading-start.heading),Math.cos(end.heading-start.heading));
  let elapsed=0;
  return {advance(dt:number,immediate=false):IslandPose {
    elapsed=immediate?duration:Math.min(duration,elapsed+Math.max(0,dt));
    const t=duration>0?elapsed/duration:1,eased=t*t*t*(t*(t*6-15)+10);
    if(t>=1)return {position:end.position.clone(),heading:end.heading};
    return {position:start.position.clone().lerp(end.position,eased),heading:start.heading+turn*eased};
  }};
}
