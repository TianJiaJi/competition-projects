import { regions } from '../../packages/scenic/src/data';
import { sampleSnapshot } from '../../packages/client/testing/snapshot';
import { createFormulaFlow, recordAdmission, visitorDistribution } from '../../apps/server/src/platform/visitor-flow';
export const pressureScenarios = ['normal', 'near-full', 'overloaded'] as const;
export function pressureSnapshot(scenario: typeof pressureScenarios[number]) {
  const day = Date.parse('2026-09-14T00:00:00+08:00'), time = day + 720 * 60000;
  const flow = createFormulaFlow(day);
  for(let minute=480;minute<=720;minute++) recordAdmission(flow,day+minute*60000,10);
  const distribution=visitorDistribution(flow,time,0,{trajectory:true});
  const snapshot=sampleSnapshot(new Date(time));
  const ratios=scenario==='normal'?[.1,.35,.55,.75,.6,.4,.2,.65,.45]:scenario==='near-full'?regions.map(()=>.95):regions.map(()=>1.1);
  snapshot.visitors=0;
  regions.forEach((region,i)=>{
    const count=Math.round(region.capacity*ratios[i]);
    snapshot.regions[region.id]={availability:'open',count,load:'busy'};
    snapshot.visitors!+=count;
  });
  snapshot.visitorFlow=distribution.markers.map(marker=>({...marker,people:marker.people*snapshot.regions[marker.regionId].count!/distribution.counts[Number(marker.regionId.slice(1))]}));
  snapshot.visitorFlowClock={speed:1,paused:true};
  return snapshot;
}
