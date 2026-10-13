import type { OpsAlert, OpsAlertStatistics } from '@scenic/contracts';
/** All views derive from the same day's event records, never the active list filter. */
export function summarizeAlerts(alerts: OpsAlert[], businessTime: string): OpsAlertStatistics {
  const end=Date.parse(businessTime), day=businessTime.slice(0,10);
  const today=alerts.filter(a=>a.startedAt.startsWith(day)&&Date.parse(a.startedAt)<=end);
  const counts={pending:0,processing:0,resolved:0};
  const responses:number[]=[],durations:number[]=[];
  const begin=Date.parse(`${day}T08:00:00+08:00`);
  const trend=Array.from({length:Math.max(1,Math.floor((end-begin)/3600000)+1)},(_,i)=>({
    time:`${String(8+i).padStart(2,'0')}:00`, created:0,completed:0,
  }));
  for(const a of today){
    counts[a.status]++;
    const start=a.records.find(r=>r.kind==='started'&&Date.parse(r.at)<=end);
    const complete=a.records.find(r=>r.kind==='completed'&&Date.parse(r.at)<=end);
    if(start)responses.push((Date.parse(start.at)-Date.parse(a.startedAt))/60000);
    if(start&&complete)durations.push((Date.parse(complete.at)-Date.parse(start.at))/60000);
    const bucket=(at:string)=>Math.max(0,Math.floor((Date.parse(at)-begin)/3600000));
    if(trend[bucket(a.startedAt)])trend[bucket(a.startedAt)].created++;
    if(complete&&trend[bucket(complete.at)])trend[bucket(complete.at)].completed++;
  }
  const average=(values:number[])=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10:0;
  return {total:today.length,...counts,averageResponseMinutes:average(responses),averageProcessingMinutes:average(durations),trend};
}
