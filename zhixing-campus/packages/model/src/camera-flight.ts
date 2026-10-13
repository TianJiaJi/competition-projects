import * as THREE from 'three';
export interface CameraPose {target:THREE.Vector3;offset:THREE.Vector3}
/** Interpolate orbit target and distance together, keeping the current viewing direction. */
export function createCameraFlight(from:CameraPose,to:CameraPose,duration=1.05){
  const start={target:from.target.clone(),offset:from.offset.clone()};
  const end={target:to.target.clone(),offset:to.offset.clone()};
  const startOrbit=new THREE.Spherical().setFromVector3(start.offset);
  const endOrbit=new THREE.Spherical().setFromVector3(end.offset);
  const turn=Math.atan2(Math.sin(endOrbit.theta-startOrbit.theta),Math.cos(endOrbit.theta-startOrbit.theta));
  let elapsed=0;
  return {
    advance(dt:number,immediate=false){
      elapsed=immediate?duration:Math.min(duration,elapsed+Math.max(0,dt));
      const t=duration>0?elapsed/duration:1;
      if(t>=1)return {target:end.target.clone(),offset:end.offset.clone(),done:true};
      const eased=t*t*t*(t*(t*6-15)+10);
      const orbit=new THREE.Spherical(THREE.MathUtils.lerp(startOrbit.radius,endOrbit.radius,eased),THREE.MathUtils.lerp(startOrbit.phi,endOrbit.phi,eased),startOrbit.theta+turn*eased);
      return {target:start.target.clone().lerp(end.target,eased),offset:new THREE.Vector3().setFromSpherical(orbit),done:t>=1};
    },
  };
}
