import {FLOW_VERSION,createFormulaFlow,recordAdmission,businessVisitMinutes,visitorDistribution,type FormulaFlow} from './visitor-flow.ts';
import { visitorFixtures } from '../../../../packages/scenic/src/visitor-points.ts';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { PublicSnapshot, PointState, LoadLevel } from '../../../../packages/contracts/src/index.ts';
import { crowdLoad } from '../../../../packages/scenic/src/view.ts';
import type { FacilityOverride } from '../../../../packages/contracts/src/platform.ts';
import { restroomDefinitions, restroomCapacities, restroomCoverage } from '../../../../packages/scenic/src/restrooms.ts';
export const scenic=JSON.parse(readFileSync(new URL('../../../../packages/scenic/generated/mobile.json',import.meta.url),'utf8')) as {name:string;points:{id:string;name:string;kind:string;regionId:string;description:string}[];edges:{id:string;from:string;to:string}[];routes:{id:string;minutes:number;edgeIds:string[];nodeIds:string[]}[];snapshot:PublicSnapshot};
// The mobile export deliberately omits emergency fixtures. The server owns the full inventory.
scenic.points.push(...visitorFixtures.filter(p=>!scenic.points.some(q=>q.id===p.id)).map(p=>({...p,description:p.name})));
export const regionCapacities=[1000,1100,1100,1000,1300,1300,1000,1000,2500];
export const U=(key:string)=>createHash('sha256').update('scenic-2|'+key).digest().readUInt32BE(0)/2**32;
export const dateOf=(time:number)=>new Date(time+8*3600000).toISOString().slice(0,10);
export const midnight=(time:number)=>Date.parse(dateOf(time)+'T00:00:00+08:00');
export const hourOf=(time:number)=>(time-midnight(time))/3600000;
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function allocate(total:number,weights:number[]) {const sum=weights.reduce((a,b)=>a+b,0);if(!sum)return weights.map(()=>0);const raw=weights.map(w=>total*w/sum),out=raw.map(Math.floor);raw.map((x,i)=>({i,r:x-out[i]})).sort((a,b)=>b.r-a.r||a.i-b.i).slice(0,total-out.reduce((a,b)=>a+b,0)).forEach(x=>out[x.i]++);return out;}
export function noise(time:number,interval:number,key:string,amplitude:number){const t=time/interval,i=Math.floor(t);return ((U(key+'|'+i)*(1-(t-i))+U(key+'|'+(i+1))*(t-i))*2-1)*amplitude;}
const plans=new Map<string,number[]>();
export function arrivalPlan(date:string,version='initial-1') {const key=date+'|'+version;if(plans.has(key))return plans.get(key)!;const day=new Date(date+'T12:00:00+08:00').getUTCDay(),weekend=day===0||day===6,total=Math.round((weekend?18000:10000)*(.9+.2*U(key+'demand'))),shift=(20*U(key+'peak')-10)/60,weights=[.22,.20,.13,.08,.05,.13,.09,.06,.04],start=Date.parse(date+'T00:00:00+08:00');const raw=Array.from({length:8640},(_,i)=>{const h=i/360;if(h<7.5||h>=17)return 0;const x=clamp(h-shift,8,16.999),at=Math.floor(x)-8;return (h<8?.044:weights[at])*(1+noise(start+i*10000,300000,key+'arrival',.15));});const result=allocate(total,raw);plans.set(key,result);if(plans.size>16)plans.delete(plans.keys().next().value!);return result;}
type Cohort={people:number;enterAt:number;exitAt:number;lot:number;cars:number;cable:'up'|'down'|'none';cableAt:number;cableDone:boolean;cableQueued?:boolean};
type Transit={people:number;until:number;owner?:string};
const cohortKey=(c:Cohort)=>`${c.enterAt}|${c.lot}|${c.people}`;
type Stall={occupied:number;queue:number;credit:number;releases:Transit[];paused:number;pending:number};
export interface Simulation {flowVersion?:number;flow?:FormulaFlow;time:number;date:string;entered:number;exited:number;cohorts:Cohort[];arrivals:Cohort[];carReturns:{lot:number;cars:number;at:number}[];parking:number[];gateCredit:number;cable:{up:{queue:Transit[];transit:Transit[];credit:number};down:{queue:Transit[];transit:Transit[];credit:number}};stalls:Record<string,Record<string,Stall>>;history:{time:string;count:number}[];snapshot:PublicSnapshot;windSpeedMps:number;arrivalTotal?:number;currentDemandScale?:number;transport?:{carCredit:number;coachCredit:number;carPool:number;coachPool:number;coachBays:{until:number}[]};}
export function initialSimulation(time:number):Simulation {const simulation:Simulation = {flowVersion:FLOW_VERSION,flow:createFormulaFlow(midnight(time)),time:midnight(time),date:dateOf(time),entered:0,exited:0,cohorts:[],arrivals:[],carReturns:[],parking:[0,0,0],gateCredit:0,cable:{up:{queue:[],transit:[],credit:0},down:{queue:[],transit:[],credit:0}},stalls:{},history:[],snapshot:{...structuredClone(scenic.snapshot),visitors:0,parkingFree:1500,announcements:[],closedEdgeIds:[],regions:{}},windSpeedMps:0};simulation.time-=10000;step(simulation,{});return simulation;}
export function level(value:number,a:number,b:number):LoadLevel {if(a===.3&&b===.5)return crowdLoad(value);return value<a?'quiet':value<b?'moderate':'busy';}
/** Upgrade paused as well as running snapshots without replaying a day of visitor behaviour. */
export function upgradeSimulationFlow(s:Simulation) {
 if(s.flowVersion===FLOW_VERSION&&s.flow)return false;
 const flow=createFormulaFlow(midnight(s.time));
 const current=s.cohorts.filter(c=>dateOf(c.enterAt)===s.date);
 const active=current.reduce((sum,c)=>sum+c.people,0);
 flow.exitedBaseline=Math.max(s.exited,s.entered-active);
 flow.entered=flow.exitedBaseline;
 for(const c of current)recordAdmission(flow,c.enterAt,c.people);
 const extra=Math.max(0,(s.snapshot.visitors||0)-s.cohorts.reduce((sum,c)=>sum+c.people,0));
 s.flow=flow;s.flowVersion=FLOW_VERSION;s.entered=flow.entered;
 const distribution=visitorDistribution(flow,s.time,extra,{markers:false});s.exited=distribution.exited;
 s.snapshot.visitors=distribution.visitors;s.snapshot.visitorFlow=[];
 distribution.counts.forEach((count,i)=>{
  const id='Z'+i,open=hourOf(s.time)>=8&&hourOf(s.time)<19;
  s.snapshot.regions[id]={...s.snapshot.regions[id],count,availability:open?'open':'closed',load:open?level(count/regionCapacities[i],.3,.5):'unknown'};
 });
 for(const p of scenic.points){const state=s.snapshot.points[p.id];if(state&&!state.parkingCapacity&&!state.cable&&!state.restroom)state.load=state.availability==='open'?s.snapshot.regions[p.regionId].load:'unknown';}
 return true;
}
export function step(s:Simulation,overrides:Record<string,FacilityOverride>,extraPeople=0,extraParking=[0,0,0],config:{demandScale?:number}={}) {
 upgradeSimulationFlow(s);
 const t=s.time+10000,h=hourOf(t),date=dateOf(t);if(date!==s.date){s.date=date;s.entered=0;s.exited=0;s.history=[];s.arrivalTotal=0;s.flow=createFormulaFlow(midnight(t));}s.time=t;
 for(const r of s.carReturns.filter(r=>r.at<=t))s.parking[r.lot]-=r.cars;s.carReturns=s.carReturns.filter(r=>r.at>t);
 for(const c of s.cohorts.filter(c=>c.exitAt<=t)){if(c.cars)s.carReturns.push({lot:c.lot,cars:c.cars,at:t+(10+c.lot*3)*60000});}
 s.cohorts=s.cohorts.filter(c=>c.exitAt>t);
 const rawDemand=(arrivalPlan(date)[Math.floor((t-midnight(t))/10000)]||0)*(config.demandScale??1);const demand=Math.floor(rawDemand)+(U(date+'scaled'+t)<rawDemand%1?1:0);
 s.arrivalTotal=(s.arrivalTotal??0)+demand;s.currentDemandScale=config.demandScale??1;
 const transport=s.transport??={carCredit:0,coachCredit:0,carPool:0,coachPool:0,coachBays:[]};transport.coachBays=transport.coachBays.filter(b=>b.until>t);let carPeople=0,coachPeople=0;const modes=['car','other','coach','other','car','other','car','coach','other','car'];for(let j=0;j<demand;j++){const mode=modes[(s.arrivalTotal-demand+j)%10];if(mode==='car')carPeople++;if(mode==='coach')coachPeople++;}transport.carPool+=carPeople;transport.coachPool+=coachPeople;const other=demand-carPeople-coachPeople;
 if(h>=17){transport.carPool=0;transport.coachPool=0;}

 const carBatch=Math.min(6,Math.floor(transport.carPool/3)*3),coachBatch=transport.coachBays.length<6&&transport.coachPool>=35?35:0;
 for(const [n,kind] of [[carBatch,'car'],[coachBatch,'coach'],[other,'other']] as const){if(!n||h>=17)continue;let lot=-1,cars=0;if(kind==='car'){cars=Math.ceil(n/3);lot=[0,1,2].find(i=>overrides['p'+(i+1)]?.availability!=='closed'&&overrides['p'+(i+1)]?.availability!=='maintenance'&&s.parking[i]+extraParking[i]+cars<=[700,500,300][i])??-1;if(lot<0)continue;s.parking[lot]+=cars;transport.carPool-=n;}if(kind==='coach'){lot=-2;transport.coachPool-=n;transport.coachBays.push({until:t+3*60000});}const travel=lot===-2?8:lot<0?0:[5,8,12][lot];const duration=businessVisitMinutes(t+travel*60000);const choice=U(date+'cable'+t+lot),weekend=[0,6].includes(new Date(t).getUTCDay());const cable=h>=15.5?'none':choice<(weekend?.35:.3)?'up':choice<(weekend?.45:.4)?'down':'none';s.arrivals.push({people:n,lot,cars,enterAt:t+travel*60000,exitAt:Math.min(t+(duration+travel)*60000,midnight(t)+19*3600000),cable,cableAt:0,cableDone:cable==='none'});}

 s.gateCredit=Math.min(15,s.gateCredit+15);let inPark=visitorDistribution(s.flow!,t,0,{markers:false}).visitors;
 for(const c of [...s.arrivals]){if(c.enterAt>t)continue;if(h>=17){if(c.cars)s.carReturns.push({lot:c.lot,cars:c.cars,at:t+15*60000});s.arrivals.splice(s.arrivals.indexOf(c),1);continue;}if(h<8)continue;if(c.people>15&&c.lot===-2){const piece={...c,people:Math.min(15,c.people)};c.people-=piece.people;s.arrivals.push(piece);continue;}if(c.people>s.gateCredit||inPark+c.people>Math.min(9900,10000-extraPeople))continue;s.gateCredit-=c.people;s.entered+=c.people;recordAdmission(s.flow!,t,c.people);inPark+=c.people;c.enterAt=t;c.exitAt=Math.min(t+businessVisitMinutes(t)*60000,midnight(t)+19*3600000);c.cableAt=t+(c.cable==='up'?5:120)*60000;s.cohorts.push(c);s.arrivals.splice(s.arrivals.indexOf(c),1);}
 // Queue and travel completion belong to each cohort, never to the whole cable line.
 for(const direction of ['up','down'] as const){
  const q=s.cable[direction],id=direction==='up'?'lower':'upper',close=direction==='up'?17:18.5;
  q.transit=q.transit.filter(x=>x.until>t);
  const open=h>=8&&h<close&&!['closed','maintenance'].includes(overrides[id]?.availability||'open');
  for(const c of s.cohorts){
   if(c.cable!==direction||c.cableDone||c.cableAt>t)continue;
   const owner=cohortKey(c);
   if(!c.cableQueued){
    if(h>=close){c.cableDone=true;continue;}
    q.queue.push({people:c.people,until:t,owner});c.cableQueued=true;
   }else if(!q.queue.some(x=>x.owner===owner)&&!q.transit.some(x=>x.owner===owner))c.cableDone=true;
  }
  // At closing, waiting groups take the walking return; cabins already in flight finish normally.
  if(h>=close)q.queue=[];
  q.credit+=10/3;
  let capacity=open?Math.floor(q.credit):0,boarded=0;
  while(capacity&&q.queue.length){
   const first=q.queue[0],n=Math.min(capacity,first.people);
   first.people-=n;capacity-=n;boarded+=n;
   q.transit.push({people:n,until:t+8*60000,owner:first.owner});
   if(!first.people)q.queue.shift();
  }
  q.credit=Math.min(10/3,q.credit-boarded);
 }

 const {counts,markers,visitors,exited}=visitorDistribution(s.flow!,t,extraPeople,{markers:false});s.exited=exited;
 const regions=Object.fromEntries(counts.map((count,i)=>['Z'+i,{availability:h>=8&&h<19?'open' as const:'closed' as const,count,load:h>=8&&h<19?level(count/regionCapacities[i],.3,.5):'unknown' as const}]));
 const points:Record<string,PointState>={};for(const p of scenic.points){const override=overrides[p.id];const availability=override?.availability??(p.kind==='safety'||p.kind==='terminal'||h>=8&&h<19?'open':'closed');points[p.id]={availability,load:availability==='open'?regions[p.regionId]?.load||'quiet':'unknown',reason:override?.reason};}
 [700,500,300].forEach((capacity,i)=>{const p=points['p'+(i+1)],occupied=s.parking[i]+extraParking[i];p.parkingCapacity=capacity;p.parkingFree=capacity-occupied;if(!overrides['p'+(i+1)])p.availability=h>=7&&h<19.5?'open':'closed';p.load=p.availability==='open'?level(occupied/capacity,.7,.9):'unknown';});
 for(const def of restroomDefinitions){const p=points[def.id],caps=restroomCapacities[def.size];s.stalls[def.id]??={};const parts:Record<string,any>={};let maxLoad=0;for(const part of ['female','male','maleUrinals','accessible'] as const){const st=s.stalls[def.id][part]??={occupied:0,queue:0,credit:0,releases:[],paused:0,pending:0};const released=st.releases.filter(r=>r.until<=t).reduce((a,b)=>a+b.people,0);st.occupied-=released;st.releases=st.releases.filter(r=>r.until>t);const offset=Number(def.id.slice(1))-1,clean=[9,15].some(x=>h>=x+offset/6&&h<x+(offset+1)/6),baseline=clean?Math.max(1,Math.floor(caps[part]*.1)):0,requested=overrides[def.id]?.requestedPaused?.[part]||0,target=p.availability==='open'?Math.max(baseline,requested):caps[part];st.paused=Math.min(target,caps[part]-st.occupied);st.pending=target-st.paused;const covered=counts.reduce((a,n,i)=>a+n*(restroomCoverage['Z'+i]?.[def.id]||0),0),share=part==='female'?.49:part==='accessible'?.02:.49*caps[part]/(caps.male+caps.maleUrinals);if(p.availability==='open')st.credit+=covered*.25/360*share*(h>=11&&h<14?def.lunchMax:1);const arrivals=Math.floor(st.credit);st.credit-=arrivals;st.queue+=arrivals;const served=Math.min(st.queue,caps[part]-st.occupied-st.paused);st.queue-=served;st.occupied+=served;if(served){const [min,max]=part==='maleUrinals'?[1,2]:part==='accessible'?[4,8]:[3,6];st.releases.push({people:served,until:t+(min+(max-min)*U(date+def.id+part+t))*60000});}const available=caps[part]-st.occupied-st.paused;parts[part]={totalStalls:caps[part],occupiedStalls:st.occupied,availableStalls:available,queueCount:st.queue,baselinePaused:baseline,requestedPaused:requested,effectivePaused:st.paused,pendingRelease:st.pending};maxLoad=Math.max(maxLoad,(st.occupied+st.queue)/caps[part]);}const sum=(key:string)=>Object.values(parts).reduce((a,p)=>a+p[key],0);p.restroom={...parts,totalStalls:sum('totalStalls'),occupiedStalls:sum('occupiedStalls'),availableStalls:sum('availableStalls'),queueCount:sum('queueCount')};p.load=p.availability==='open'?level(maxLoad,.65,.9):'unknown';}
 for(const direction of ['up','down'] as const){const p=points[direction==='up'?'lower':'upper'],q=s.cable[direction],queued=q.queue.reduce((a,b)=>a+b.people,0),transit=q.transit.reduce((a,b)=>a+b.people,0);p.cable={direction,cabinSeats:8,cabinCount:40,totalCapacity:320,directionCapacity:160,dispatchSeconds:24,travelMinutes:8,capacityPerMinute:20,opensAt:'08:00',closesAt:direction==='up'?'17:00':'18:30',queueCount:queued,inTransit:transit,waitMinutes:Math.round(queued/20*10)/10};p.load=p.availability==='open'?level(queued/20,5,10):'unknown';}
 const rain=U(date+'weather')>.8?Math.max(0,1-Math.abs(h-12.5)/1.5):0,delta=(U(date+'temp')*2-1)*1.5;const temp0=h>=6&&h<14?16+11*(1-Math.cos(Math.PI*(h-6)/8))/2:27-11*(1-Math.cos(Math.PI*((h<6?h+24:h)-14)/16))/2;const temperature=clamp(temp0+delta-1.5*rain+noise(t,1800000,'temperature',.4),10,32),humidity=clamp(80-1.4*(temperature-16)+8*rain+noise(t,1800000,'humidity',3),45,98);s.windSpeedMps=clamp(1.8+.8*Math.max(0,Math.sin((h-8)/11*Math.PI))+noise(t,1800000,'wind',.5),.2,6);
 s.snapshot={revision:s.snapshot.revision+1,updatedAt:new Date(t).toISOString(),parkOpen:h>=8&&h<18,visitorFlow:markers,visitors,parkingFree:1500-s.parking.reduce((a,b)=>a+b,0)-extraParking.reduce((a,b)=>a+b,0),points,regions,closedEdgeIds:Object.entries(overrides).filter(([id,o])=>scenic.edges.some(e=>e.id===id)&&o.availability!=='open').map(([id])=>id),announcements:[],weather:{label:rain>0?'小雨':U(date+'weather')<.4?'晴':'多云',temperature:Math.round(temperature*10)/10,humidity:Math.round(humidity),wind:['北风','东北风','东风','东南风','南风','西南风','西风','西北风'][Math.floor(U(date+'windDirection')*8)],aqi:Math.round(clamp(38+5*Math.sin(2*Math.PI*(h-8)/24)+noise(t,1800000,'aqi',4),10,80)),ions:Math.round(clamp(2600+8*(humidity-70)+200*rain+noise(t,1800000,'ions',100),1000,5000))}};
 if(t%3600000===0)s.history.push({time:new Date(t).toISOString(),count:visitors});
 if(visitors<0||visitors>10000||s.parking.some((n,i)=>n<0||n+extraParking[i]>[700,500,300][i])||counts.reduce((a,b)=>a+b,0)!==visitors)throw Error('SIMULATION_INVARIANT_FAILED');
}
