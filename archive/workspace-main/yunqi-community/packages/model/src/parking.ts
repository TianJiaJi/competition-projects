/** Three distinct parking courts sit outside the gates, each with its own aisle. */
export const parkingCourts=[
  {id:'west',x:-17.4,z:27.4,width:10,depth:4,laneZ:28.3,driveX:-21.5,driveEnd:30.8},
  {id:'southwest',x:-8.8,z:33.2,width:9.4,depth:4,laneZ:32.25,driveX:-12.65,driveEnd:35.35},
  {id:'east',x:15.5,z:29.4,width:8,depth:4.2,laneZ:28.45,driveX:18.8,driveEnd:31.95},
];
export const parkingZones=[
  {id:'p1',court:'west',x:-17,z:26.2,entrance:{x:-11.8,z:26.2},bayXs:[-20.1,-19.05,-18,-16.95,-15.9,-14.85,-13.8],face:1},
  {id:'p3',court:'southwest',x:-8.5,z:34.3,entrance:{x:-3.5,z:32.25},bayXs:[-11.1,-10.05,-9,-7.95,-6.9,-5.85],face:-1},
  {id:'p2',court:'east',x:14.7,z:30.35,entrance:{x:11,z:28.25},bayXs:[12.2,13.25,14.3,15.35,16.4,17.45],face:-1},
];
export const parkingById=Object.fromEntries(parkingZones.map(zone=>[zone.id,zone]));
export function parkingAreaAt(x:number,z:number,padding=0){
  return parkingCourts.find(c=>(Math.abs(x-c.x)<=c.width/2+padding&&Math.abs(z-c.z)<=c.depth/2+padding)||
    (Math.abs(x-c.driveX)<=.75+padding&&z>=c.laneZ-padding&&z<=c.driveEnd+padding));
}
