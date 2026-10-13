import * as THREE from 'three';
import {createScenicSvg} from './svg-map';

/** The scroll rasterizes the exact public SVG base map, rather than a second drawing. */
export function createScenicPainting(width:number,depth:number,azimuth:number){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;
  const context=canvas.getContext('2d')!,texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const svg=createScenicSvg({showVisitorFixtures:false,showLabels:true,showFacilities:true,projection:{width,depth,azimuth,center:{x:0,z:2}}});
  const source=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(source),image=new Image();
  let disposed=false;
  const ready=new Promise<void>((resolve,reject)=>{
    image.onload=()=>{
      if(!disposed){context.drawImage(image,0,0,canvas.width,canvas.height);texture.needsUpdate=true;}
      URL.revokeObjectURL(url);resolve();
    };
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Scenic SVG artwork could not load'));};
    image.src=url;
  });
  return {texture,ready,dispose(){disposed=true;URL.revokeObjectURL(url);texture.dispose();}};
}
