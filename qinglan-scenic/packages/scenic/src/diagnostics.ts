import type * as THREE from 'three';
export interface FrameSample {intervalMs:number;updateMs:number;renderSubmitMs:number;projectMs:number}
function summary(values:number[]){
  if(!values.length)return {count:0,mean:0,p95:0,max:0};
  const sorted=[...values].sort((a,b)=>a-b);
  return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.floor((sorted.length-1)*.95)],max:sorted.at(-1)!};
}
const reports=new Map<HTMLElement,()=>unknown>();
declare global {interface Window {scenicDiagnostics?:{reports:()=>unknown[];download:()=>void}}}
export function diagnosticsEnabled(){return new URLSearchParams(location.search).get('scenicDiagnostics')==='1';}
/** All sampling and GPU metadata queries are opt-in. Submission time is not GPU time. */
export function createSceneDiagnostics(host:HTMLElement,renderer:THREE.WebGLRenderer,scene:THREE.Scene){
  const samples:FrameSample[]=[];let cursor=0;
  let panel:HTMLElement|undefined;
  const collect=()=>{
    const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    const rect=host.getBoundingClientRect();let vertices=0,indices=0;const seen=new Set<THREE.BufferGeometry>();const indexing:unknown[]=[];
    scene.traverse(object=>{const geometry=(object as THREE.Mesh).geometry;if(geometry&&!seen.has(geometry)){seen.add(geometry);if(geometry.userData.exactIndex)indexing.push(geometry.userData.exactIndex);vertices+=geometry.getAttribute('position')?.count??0;indices+=geometry.index?.count??0;}});
    return {recordedAt:new Date().toISOString(),userAgent:navigator.userAgent,renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):null,vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):null,webglVersion:gl.getParameter(gl.VERSION),display:{dpr:devicePixelRatio,logicalWidth:host.clientWidth,logicalHeight:host.clientHeight,displayedWidth:rect.width,displayedHeight:rect.height,bufferWidth:renderer.domElement.width,bufferHeight:renderer.domElement.height},draw:{...renderer.info.render},geometry:{vertices,indices,geometries:seen.size,indexing},memory:{...renderer.info.memory},frames:{intervalMs:summary(samples.map(s=>s.intervalMs)),updateMs:summary(samples.map(s=>s.updateMs)),renderSubmitMs:summary(samples.map(s=>s.renderSubmitMs)),projectMs:summary(samples.map(s=>s.projectMs))},notes:['CPU submission time is not GPU execution time.','Renderer metadata may be unavailable; missing metadata does not prove software rendering.','Rolling window: at most 1800 visible frames.']};
  };
  reports.set(host,collect);
  if(!window.scenicDiagnostics){
    const api={reports:()=>Array.from(reports.values(),read=>read()),download:()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(api.reports(),null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='scenic-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }};
    window.scenicDiagnostics=api;
  }
  panel=document.createElement('details');panel.dataset.scenicDiagnostics='';panel.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147483646;background:white;color:#193b35;border:1px solid #78998a;border-radius:8px;padding:10px;font:14px system-ui';
  const title=document.createElement('summary');title.textContent='沙盘诊断';const download=document.createElement('button');download.textContent='导出性能记录';download.addEventListener('click',()=>window.scenicDiagnostics?.download());
  const reset=document.createElement('button');reset.textContent='重新采样';reset.addEventListener('click',()=>{samples.length=0;cursor=0;});panel.append(title,download,reset);document.body.append(panel);
  return {record(sample:FrameSample){samples[cursor]=sample;cursor=(cursor+1)%1800;},dispose(){reports.delete(host);panel?.remove();if(!reports.size)delete window.scenicDiagnostics;}};
}
