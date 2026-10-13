/** Stable island-local anchors below the terrain; data cards remain DOM overlays. */
export const regionLabelSites:Record<string,{x:number;z:number;nx:number;nz:number;y?:number;alwaysVisible?:boolean}>= {
  Z0:{x:12,z:35.1,nx:.13,nz:1}, Z1:{x:28.9,z:18.6,nx:.9,nz:.44},
  Z2:{x:32.4,z:3.3,nx:.8,nz:-.6}, Z3:{x:29.4,z:-15,nx:.95,nz:-.31},
  Z4:{x:0,z:-30.5,nx:-.06,nz:-1,y:1.4}, Z5:{x:-32.5,z:6,nx:-.9,nz:-.44},
  Z6:{x:-26,z:26,nx:-.97,nz:.25}, Z7:{x:-20,z:-26.4,nx:.18,nz:-.98},
  Z8:{x:0,z:3,nx:0,nz:1,y:.7,alwaysVisible:true},
};