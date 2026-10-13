import type { ScenicPoint, ScenicViewMode, Availability } from '@scenic/contracts';
export const viewLabels:Record<ScenicViewMode,string>={default:'游览',crowd:'人流',toilet:'卫生间',safety:'安全设施'};
export function pointInView(point:ScenicPoint,view:ScenicViewMode,currentTerminalId?:string){
  if(point.id===currentTerminalId)return true;
  if(view==='crowd')return false;
  if(view==='toilet'||view==='safety')return point.kind===view;
  return point.kind!=='toilet'&&point.kind!=='safety';
}
export function viewForPoint(point:ScenicPoint):ScenicViewMode{
  return point.kind==='toilet'||point.kind==='safety'?point.kind:'default';
}
export function safetyStatus(availability?:Availability){
  return availability==='open'?'可用':availability==='closed'||availability==='maintenance'?'不可用':'状态未知';
}

/** Match the on-map icon palette for the entire focused fixture model. */
export function facilityColor(point:ScenicPoint,state?:import('@scenic/contracts').PointState):string{
  if(point.kind==='safety')return state?.availability==='open'?'#226b4d':['closed','maintenance'].includes(state?.availability??'')?'#b33f36':'#616d6a';
  if(state?.availability!=='open')return '#616d6a';
  return {quiet:'#226b4d',moderate:'#8a580e',busy:'#b33f36',unknown:'#616d6a'}[state.load];
}
