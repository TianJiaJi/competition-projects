import type {PointState,RegionState,RestroomCounts,RestroomState} from '@scenic/contracts';
import {restroomDefinitions,restroomCapacities,restroomCoverage} from '@scenic/scenic';
const groups=['female','male','maleUrinals','accessible'] as const;
const durationRanges={female:[3,6],male:[3,6],maleUrinals:[1,2],accessible:[4,8]} as const;
/** Minute buckets represent counts, never individual people or sensor readings. */
export function sampleRestrooms(now:Date,regions:Record<string,RegionState>,states:Record<string,PointState>,open:boolean){
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).split(':').map(Number);
  const actualMinute=clock[0]*60+clock[1],endMinute=actualMinute>=480&&actualMinute<1080?actualMinute:720+clock[1];
  for(const [index,definition] of restroomDefinitions.entries()){
    const state=states[definition.id],capacity=restroomCapacities[definition.size];
    if(!open&&state.availability==='open'){state.availability='closed';state.load='unknown';}
    const available=open&&state.availability==='open';
    const covered=Object.entries(regions).reduce((sum,[id,r])=>sum+(r.count??0)*(restroomCoverage[id]?.[definition.id]??0),0);
    const result={} as Record<typeof groups[number],RestroomCounts>;
    for(const [groupIndex,group] of groups.entries()){
      const total=capacity[group];
      if(!available){result[group]={totalStalls:total,occupiedStalls:0,availableStalls:0,queueCount:0};continue;}
      const maleSitShare=capacity.male/(capacity.male+capacity.maleUrinals);
      const share=group==='female'?.49:group==='accessible'?.02:group==='male'?.49*maleSitShare:.49*(1-maleSitShare);
      const [minDuration,maxDuration]=durationRanges[group],releases=new Array<number>(endMinute+10).fill(0);
      let occupied=0,queue=0,remainder=0,sequence=index+groupIndex,active=total;
      for(let minute=480;minute<=endMinute;minute++){
        occupied-=releases[minute];
        const lunch=Math.max(0,Math.min(1,(minute-630)/60,(870-minute)/90));
        remainder+=covered*.25/60*share*(1+(definition.lunchMax-1)*lunch);
        const arrivals=Math.floor(remainder);remainder-=arrivals;queue+=arrivals;
        const cleaning=[540,900].some(start=>minute>=start+index*10&&minute<start+index*10+10);
        active=total-(cleaning?Math.max(1,Math.round(total*.1)):0);
        const admitted=Math.min(queue,Math.max(0,active-occupied));queue-=admitted;occupied+=admitted;
        for(let n=0;n<admitted;n++){const duration=minDuration+(sequence++%(maxDuration-minDuration+1));releases[minute+duration]++;}
      }
      result[group]={totalStalls:total,occupiedStalls:occupied,availableStalls:Math.max(0,active-occupied),queueCount:queue};
    }
    const sum=(key:keyof RestroomCounts)=>groups.reduce((total,g)=>total+(result[g][key]??0),0);
    state.restroom={totalStalls:sum('totalStalls'),occupiedStalls:sum('occupiedStalls'),availableStalls:sum('availableStalls'),queueCount:sum('queueCount'),...result} satisfies RestroomState;
    if(available){const load=Math.max(...groups.map(g=>(result[g].occupiedStalls!+result[g].queueCount!)/result[g].totalStalls!));state.load=load>=.9?'busy':load>=.65?'moderate':'quiet';}
  }
}
