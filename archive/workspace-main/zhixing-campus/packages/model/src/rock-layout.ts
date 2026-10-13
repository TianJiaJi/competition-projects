import {isIsland,islandOutline} from './geometry';

export function rockColumn(x:number,z:number){
  const bottom=-3-9*Math.exp(-((x+7)**2/280+(z-1)**2/380))-3.8*(.5+.5*Math.sin(x*.43)*Math.cos(z*.29));
  const tail=1.5+Math.abs(Math.sin(x*.82+z*.39))*4;
  return {bottom,tail};
}
/** Independent of road grading; available before the heavy terrain build. */
export function islandRockFloor(){
  let floor=0;
  for(let x=-32;x<=32;x+=1.1)for(let z=-30;z<=Math.max(...islandOutline.map(p=>p[1]));z+=1.1){
    if(!isIsland(x,z))continue;
    const {bottom,tail}=rockColumn(x,z);floor=Math.min(floor,bottom-tail);
  }
  return floor;
}
