/** Destination entrances and buildings are separate: a path ends on the forecourt. */
export interface PointSite {
  id:string;
  entrance:{x:number;z:number};
  ground:number;
  court:{x:number;z:number;width:number;depth:number};
  building:{x:number;z:number;width:number;depth:number};
}
export const pointSites:PointSite[]=[
  {id:'market',entrance:{x:-12.65,z:24},ground:.65,court:{x:-16.3,z:21.8,width:7,depth:6},building:{x:-16.3,z:21.8,width:6.2,depth:5.4}},
  {id:'lower',entrance:{x:-12.65,z:17},ground:.65,court:{x:-15.3,z:17,width:4.8,depth:3.2},building:{x:-15.4,z:17,width:3.8,depth:2.8}},
  {id:'t1',entrance:{x:15.15,z:23.3},ground:.65,court:{x:16.55,z:23.3,width:2.3,depth:1.8},building:{x:16.6,z:23.3,width:1.6,depth:1.2}},
  {id:'supply',entrance:{x:22.2,z:0},ground:1.3,court:{x:23.4,z:0,width:3.7,depth:6.2},building:{x:24,z:0,width:2.4,depth:5.6}},
  {id:'bamboo',entrance:{x:23,z:4.5},ground:1.3,court:{x:23.7,z:4.6,width:5.4,depth:2.6},building:{x:25,z:4.5,width:2.15,depth:1.35}},
  {id:'lake',entrance:{x:-14.8,z:1.5},ground:1.3,court:{x:-14.7,z:3.1,width:4.4,depth:5.6},building:{x:-14.7,z:3.8,width:3.52,depth:3.04}},
  {id:'t6',entrance:{x:-15.8,z:8},ground:1.3,court:{x:-14.9,z:8.5,width:3.6,depth:3.2},building:{x:-14.3,z:8,width:1.6,depth:1.2}},
];
export const siteById=Object.fromEntries(pointSites.map(site=>[site.id,site]));
export function pointCourtAt(x:number,z:number,padding=0){
  return pointSites.find(({court:c})=>Math.abs(x-c.x)<=c.width/2+padding&&Math.abs(z-c.z)<=c.depth/2+padding);
}
