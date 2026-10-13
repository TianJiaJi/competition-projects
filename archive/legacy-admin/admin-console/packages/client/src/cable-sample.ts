import type {PointState,RegionState} from '@scenic/contracts';
import {cableConfig} from '@scenic/scenic';
const ramp=(minute:number,a:number,b:number,c:number,d:number)=>Math.max(0,Math.min(1,(minute-a)/(b-a),(d-minute)/(d-c)));
export function sampleCable(now:Date,regions:Record<string,RegionState>,states:Record<string,PointState>,alwaysOpen=false){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now).split(':').map(Number);
  const actual=parts[0]*3600+parts[1]*60+parts[2],clock=alwaysOpen&&(actual<28800||actual>=66600)?43200+parts[1]*60+parts[2]:actual;
  const end=Math.floor(Math.min(clock,67080)/10),start=2880;
  for(const [id,direction] of [['lower','up'],['upper','down']] as const){
    let queue=0,inTransit=0,remainder=0;const releases=new Array<number>(Math.max(end+50,start+50)).fill(0);
    const people=(region:string)=>regions[region]?.count??0;
    const covered=direction==='up'?people('Z0')+.35*people('Z8'):people('Z4')+.35*people('Z3')+.35*people('Z7');
    for(let tick=start;tick<=end;tick++){
      inTransit-=releases[tick];
      if(tick>=6660)continue;
      const minute=tick/6,peak=direction==='up'?ramp(minute,480,510,540,600):ramp(minute,780,840,900,1020);
      const perMinute=covered*(direction==='up'?1.4:.6)/60*(.6+.9*peak);
      remainder+=perMinute/6;const arrivals=Math.floor(remainder);remainder-=arrivals;queue+=arrivals;
      const elapsed=(tick-start)*10;
      const departed=Math.floor(elapsed/cableConfig.dispatchSeconds)-Math.floor(Math.max(0,elapsed-10)/cableConfig.dispatchSeconds);
      const boarded=Math.min(queue,departed*cableConfig.cabinSeats);queue-=boarded;inTransit+=boarded;releases[tick+cableConfig.travelMinutes*6]+=boarded;
    }
    const open=states[id].availability==='open';
    const nextDeparture=(cableConfig.dispatchSeconds-((Math.max(0,Math.floor(clock/10)*10-28800))%cableConfig.dispatchSeconds))/60;
    const wait=open?Math.round((Math.floor(queue/cableConfig.cabinSeats)*cableConfig.dispatchSeconds/60+nextDeparture)*10)/10:null;
    states[id].cable={...cableConfig,direction,queueCount:open?queue:null,inTransit,waitMinutes:wait};
    if(open)states[id].load=wait!>=10?'busy':wait!>=5?'moderate':'quiet';
  }
}
