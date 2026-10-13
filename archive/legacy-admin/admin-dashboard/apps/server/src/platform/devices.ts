import type { Platform } from './service.ts';
import { U } from './simulation.ts';
export const remoteDeviceCount = 89;
/** Deterministic simulated readings, shared by all terminals; no effect on actual visitor counts. */
export async function deviceSnapshot(platform: Platform, id: string) {
 const run=await platform.run(id),snapshot=(await platform.snapshot(id)).public,bucket=Math.floor(run.simulation.time/300000);
 const definitions=[
  {id:'remote-entry',name:'入口客流遥感',pointId:'entry',metric:'visitors',unit:'人',value:snapshot.visitors},
  {id:'remote-summit',name:'山顶气象监测',pointId:'summit',metric:'temperature',unit:'°C',value:snapshot.weather.temperature},
  {id:'remote-lake',name:'湖畔空气湿度监测',pointId:'lake',metric:'humidity',unit:'%',value:snapshot.weather.humidity},
  {id:'remote-parking',name:'一号停车场感知',pointId:'p1',metric:'parkingFree',unit:'个',value:snapshot.points.p1?.parkingFree},
  {id:'remote-cable',name:'索道候乘监测',pointId:'lower',metric:'queueCount',unit:'人',value:snapshot.points.lower?.cable?.queueCount},
  {id:'remote-air',name:'园区空气质量监测',pointId:'entry',metric:'aqi',unit:'',value:snapshot.weather.aqi},
 ];
 const points=platform.scenic.points;
 for(let i=definitions.length;i<remoteDeviceCount;i++){
  const point=points[(i-6)%points.length],reading=snapshot.points[point.id],index=String(i+1).padStart(3,'0');
  let metric='temperature',unit='°C',label='气象监测',value=snapshot.weather.temperature;
  if(reading?.parkingCapacity){metric='parkingFree';unit='个';label='车位感知';value=reading.parkingFree??0;}
  else if(reading?.cable){metric='queueCount';unit='人';label='候乘监测';value=reading.cable.queueCount??0;}
  else if(reading?.restroom){metric='availableStalls';unit='个';label='厕位感知';value=reading.restroom.availableStalls;}
  else if(i%3===0){metric='humidity';unit='%';label='湿度监测';value=snapshot.weather.humidity;}
  else if(i%3===1){metric='aqi';unit='';label='空气质量监测';value=snapshot.weather.aqi;}
  definitions.push({id:'remote-'+index,name:point.name+label+' '+index,pointId:point.id,metric,unit,value});
 }
 return {source:'mock',runId:id,revision:run.revision,seed:run.id,checkedAt:run.businessTime,items:definitions.map(d=>{
  const n=U(run.id+d.id+bucket),state=n<.08?'offline':n<.18?'abnormal':'online';
  return {...d,source:'mock',state,value:state==='offline'?null:d.value,checkedAt:run.businessTime,reason:state==='offline'?'模拟通信中断':state==='abnormal'?'模拟设备自检异常':'模拟设备正常上报'};
 })};
}
