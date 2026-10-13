import {api,sync,versionOf,rawItem,requestError,getStore,getRun} from './store';
import {ok,fail,type ApiResult} from '../core/result';
import {parseWallClock} from '../core/time';
const stamp=(v:string)=>{const time=parseWallClock(v);if(time===null)throw Error('公告时间无效');return new Date(time).toISOString();};
export async function writeOnline<T>(name:string,args:any[],read:(id:string)=>Promise<ApiResult<T>>):Promise<ApiResult<T>>{
 try{
  const priorRun=getStore().activeRunId;await api.runtime();if(priorRun!==api.runId)return fail('RUN_EXPIRED','运行已切换，请返回列表重新打开，旧草稿未提交');
  let path='',input:any={},collection='',id='',key:string|undefined;
  const [a,b]=args;
  switch(name){
   case 'saveScenic':collection='content';id='scenic';path='/admin/scenic';input={...a,title:a.name,body:a.summary};break;
   case 'createArticle':case 'saveArticle':collection='articles';id=name==='saveArticle'?a:'';input={...(id?rawItem(collection,id):{}),...(id?b:a)};path='/admin/articles'+(id?'/'+id:'');break;
   case 'deleteArticle':collection='articles';id=a;path='/admin/articles/'+id;input={action:'delete'};break;
   case 'savePoiContent':collection='content';id=a;path='/admin/pois/'+id;input={...b,title:b.name,body:b.body||b.summary};break;
   case 'createNotice':case 'saveNotice':collection='notices';id=name==='saveNotice'?a:'';input={...(id?rawItem(collection,id):{}),...(id?b:a)};input.startsAt=stamp(input.startsAt);input.expiresAt=stamp((id?b:a).endsAt);input.active=input.published===true;input.suppressed=!input.active;path='/admin/notices'+(id?'/'+id:'');break;
   case 'deleteNotice':collection='notices';id=a;path='/admin/notices/'+id;input={action:'delete'};break;
   case 'adminCancelOrder':collection='orders';id=a;path='/admin/orders/'+id+'/cancel';input={reason:b.reason};key=b.actionId;break;
   case 'adminRescheduleOrder':{collection='orders';id=a;const [date,kind,lot,start]=b.targetSlotId.split('|');const available=await api.request<any>('/booking/slots?date='+encodeURIComponent(date)+'&kind='+kind+(lot?'&lotId='+encodeURIComponent(lot):''));const slot=available.items.find((s:any)=>s.id===b.targetSlotId);if(!slot)throw Error('目标时段不存在');path='/admin/orders/'+id+'/reschedule';input={date:slot.date,slot:slot.slot,note:b.note};key=b.actionId;break;}
   case 'saveSlotCapacity':id=a.slotId;path='/admin/booking/slots/'+encodeURIComponent(id);input={capacity:a.interactiveQuota};break;
   case 'updateFacilityState':case 'saveRestroomAdjustment':id=a;path='/admin/facilities/'+(id==='cable-main'?'upper':id);input={availability:b.state,reason:b.reason||'管理员调整设施状态',...(b.requested?{requestedPaused:b.requested}:{})};break;
   case 'createInspectionPlan':case 'updateInspectionPlan':case 'setInspectionPlanEnabled':collection='inspections';id=name==='createInspectionPlan'?'':a;path='/admin/inspections'+(id?'/'+id:'');input=name==='setInspectionPlanEnabled'?{...rawItem(collection,id),enabled:b}:name==='createInspectionPlan'?a:b;break;
   case 'setUserDisabled':id=a;path='/admin/users/'+id+'/disabled';input={disabled:b};break;
   case 'resolveReport':collection='reports';id=a;path='/admin/reports/'+id;input={decision:b.outcome==='dismissed'?'rejected':'retained',reason:b.note};key=b.actionId;break;
   case 'removeMessage':collection='messages';id=a;path='/admin/messages/'+id+'/remove';input={reason:b.reason};break;
   case 'muteUser':id=a.userId;path='/admin/users/'+id+'/mute';input={minutes:a.minutes,reason:a.reason};break;
   case 'unmuteUser':id=a;path='/admin/users/'+id+'/mute';input={minutes:0,reason:'管理员解除禁言'};break;
   default:throw Error('未接入的业务操作：'+name);
  }
  if(collection&&id)input.expectedVersion=versionOf(collection,id);
  const result=await api.request<any>(path,'POST',input,key);const refreshed=await sync(true);if(!refreshed.ok)return refreshed;
  return await read(id==='cable-main'?id:result.id||id);
 }catch(e){return requestError(e);}
}
