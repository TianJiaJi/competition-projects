import {facilities} from "../core/catalogue";
import {createPlatformClient,ApiError as HttpError} from '../../../../packages/client/src/platform';
import {ok,fail,type ApiResult,type AdminErrorCode} from '../core/result';
import type {BusinessStore,RunData,StaffSession} from '../core/types';
import {setBusinessTime,toWallClockValue} from '../core/time';
import {defaultCoverUrl} from '../core/assets';
export const api=createPlatformClient('admin');
export type RuntimeStatus='ready'|'readonly'|'corrupt'|'conflict';
export interface RuntimeInfo {status:RuntimeStatus;persistent:boolean;message?:string;runId:string}
let state:BusinessStore|undefined,session:StaffSession|null=null,raw:any,pending:Promise<ApiResult<void>>|undefined,lastRead=0;
const listeners=new Set<(info:RuntimeInfo)=>void>();
const versions=new Map<string,number>();
const viewedVersions=new Map<string,number>();
export function captureVersions(){viewedVersions.clear();versions.forEach((v,k)=>viewedVersions.set(k,v));}
let info:RuntimeInfo={status:'readonly',persistent:false,runId:'',message:'正在连接统一后端'};
const ms=(v:any)=>typeof v==='number'?v:Date.parse(v||'')||0;
export function mappedSession(user:any):StaffSession{return {userId:user.id,username:user.username,nickname:user.name,startedAt:Date.now(),expiresAt:Date.now()+7*86400000,demo:true};}
export function requestError(e:unknown):ApiResult<never>{const err=e as HttpError;return fail((err.code||'NETWORK_ERROR') as AdminErrorCode,err.message||'连接后端失败，请重试');}
export function versionOf(collection:string,id:string){return viewedVersions.get(collection+'/'+id)??versions.get(collection+'/'+id);}
export function rawItem(collection:string,id:string){return [...(raw?.global?.[collection]||[]),...(raw?.business?.[collection]||[]),...(collection==='messages'?raw?.messages||[]:[])].find((x:any)=>x.id===id);}
export function rawWorkspace(){return raw;}
function hydrate(data:any){
 raw=data;versions.clear();for(const section of [data.global,data.business,{messages:data.messages}])for(const [collection,items] of Object.entries(section))for(const item of items as any[])if(item.id)versions.set(collection+'/'+item.id,item.version||0);
 const snap=data.snapshot,r=snap.run,now=ms(r.businessTime),pub=snap.public;setBusinessTime(now);
 const users=data.users.map((u:any)=>({id:u.id,nickname:u.name,identity:u.role==='visitor'?'visitor':'staff',createdAt:u.createdAt?toWallClockValue(ms(u.createdAt)).replace('T',' '):'',disabled:u.disabled}));
 const content=data.global.content,profile=content.find((x:any)=>x.id==='scenic');
 const articles=data.global.articles.filter((x:any)=>!x.deleted).map((x:any)=>({...x,category:x.category||'guide',summary:x.summary||'',coverUrl:x.coverUrl||defaultCoverUrl,createdAt:ms(x.createdAt||x.updatedAt),updatedAt:ms(x.updatedAt),revision:x.version}));
 const knowledge=data.global.knowledge.map((x:any)=>({...x,keywords:x.keywords||[],sourceId:x.sourceId||x.id,version:String(x.version),retrievalStatus:x.published?'ready':'disabled'}));
 const orders:RunData["orders"]=[...data.business.orders,...data.background].map((o:any)=>({id:o.id,userId:o.userId,type:o.kind==='entry'?'admission' as const:'parking' as const,slotDate:o.date,slotStart:o.readonly?'08:00':o.slot,slotEnd:o.readonly?'17:00':String(Number(o.slot.slice(0,2))+1).padStart(2,'0')+':00',source:o.readonly?'background' as const:'onsite' as const,batchId:o.readonly?o.id:undefined,contactName:data.users.find((u:any)=>u.id===o.userId)?.name,people:o.kind==='entry'?o.people:undefined,vehicles:o.kind==='parking'?o.people:undefined,parkingLotId:o.lotId,reservationStatus:o.readonly?(o.status==='background_cancelled'?'cancelled':o.status==='background_no_show'?'expired':'confirmed'):o.status,visitStatus:o.entered?(o.exited?'exited':'in_park'):'not_entered',parkingStatus:o.entered?(o.exited?'departed':'parked'):'not_arrived',createdAt:ms(o.createdAt),updatedAt:ms(o.updatedAt||o.createdAt),history:o.history||[]}));
 const slots=data.slots.map((s:any)=>({id:s.id,date:s.date,type:s.kind==='entry'?'admission':'parking',lotId:s.lotId,start:s.slot,end:String(Number(s.slot.slice(0,2))+1).padStart(2,'0')+':00',unit:s.kind==='entry'?'person':'vehicle',interactiveQuota:s.capacity,backgroundQuota:0}));
 const facilityStates:any={},restroomBaselines:any={},restroomAdjustments:any={},parkingStats:any={};
 for(const [id,value] of Object.entries(pub.points)){const p=value as any;facilityStates[id]={facilityId:id,state:p.availability,reason:p.reason,updatedAt:now};if(p.parkingCapacity)parkingStats[id]={capacity:p.parkingCapacity,occupied:p.parkingCapacity-p.parkingFree};if(p.restroom){restroomBaselines[id]={};const requested:any={};for(const k of ['female','male','maleUrinals','accessible']){const part=p.restroom[k];restroomBaselines[id][k]={occupied:part.occupiedStalls,queue:part.queueCount,baselinePaused:part.baselinePaused||0};requested[k]=part.requestedPaused||0;}restroomAdjustments[id]={facilityId:id,state:p.availability,reason:p.reason,requested,updatedAt:now};}}
 for(const facility of facilities.filter(f=>f.category==='road'))facilityStates[facility.id]={facilityId:facility.id,state:pub.closedEdgeIds.includes(facility.sharedId)?'closed':'open',updatedAt:now};
 for(const [id,o] of Object.entries(data.overrides))facilityStates[id]={facilityId:id,state:(o as any).availability,reason:(o as any).reason,updatedAt:now};
 facilityStates['cable-main']={...facilityStates.upper,facilityId:'cable-main'};
 const inspections=data.global.inspections.map((p:any)=>({...p,nextDueDate:data.business['inspection-schedule'].find((s:any)=>s.planId===p.id)?.dueDate||p.nextDueDate,createdAt:ms(p.createdAt),updatedAt:ms(p.updatedAt)}));
 const run:RunData={runId:r.id,businessTime:r.businessTime,orders,slots,notices:data.business.notices.filter((n:any)=>!n.deleted).map((n:any)=>({...n,published:!n.suppressed&&(n.published??true),startsAt:n.startsAt||new Date(0).toISOString(),endsAt:n.expiresAt||'9999-01-01T00:00:00Z',createdAt:ms(n.createdAt||n.updatedAt),updatedAt:ms(n.updatedAt)})),facilityStates,restroomBaselines,restroomAdjustments,parkingStats,cableStats:{queueCount:(pub.points.upper?.cable?.queueCount||0)+(pub.points.lower?.cable?.queueCount||0),inTransit:(pub.points.upper?.cable?.inTransit||0)+(pub.points.lower?.cable?.inTransit||0)},alerts:snap.alerts,inspectionRecords:[],chatRooms:[{id:'lobby',name:'山间茶叙',kind:'park'},{id:'routes',name:'同路山水',kind:'park'}],messages:data.messages.map((m:any)=>({...m,authorNickname:m.authorName,body:m.text,at:ms(m.createdAt),source:m.simulated?'background':'onsite'})),reports:data.business.reports.map((x:any)=>({...x,roomId:data.messages.find((m:any)=>m.id===x.messageId)?.roomId||'lobby',reporterNickname:data.users.find((u:any)=>u.id===x.userId)?.name||'游客',reason:['spam','abuse'].includes(x.reason)?x.reason:'other',note:x.resolution||x.reason,status:x.status==='pending'?'pending':x.status==='rejected'?'dismissed':'resolved',createdAt:ms(x.createdAt)})),mutes:data.business.mutes.map((m:any)=>({...m,nickname:data.users.find((u:any)=>u.id===m.userId)?.name||m.userId,minutes:Math.max(0,Math.ceil((m.until-Date.now())/60000)),setAt:m.setAt||0,scope:'all'})),actionLog:{},nextOrderSeq:0,nextNoticeSeq:0,nextReportSeq:0,nextMessageSeq:0,revision:r.revision};
 state={version:1,revision:r.revision,activeRunId:r.id,global:{users,scenic:{name:profile?.title||'青岚山境',summary:profile?.summary||profile?.body||'',address:profile?.address||'',servicePhone:profile?.servicePhone||'',coverUrl:profile?.coverUrl||defaultCoverUrl,openingText:profile?.openingText||'08:00开放，17:00停止入园，18:00闭园',updatedAt:ms(profile?.updatedAt)},articles,poiOverrides:Object.fromEntries(content.filter((x:any)=>x.id!=='scenic').map((x:any)=>[x.id,{poiId:x.id,name:x.title,summary:x.summary||'',body:x.body,imageUrls:x.imageUrls||[],sourceIds:x.sourceIds||[],updatedAt:ms(x.updatedAt)}])),knowledge,sources:knowledge.map((x:any)=>({id:x.sourceId,title:x.title,publisher:'景区管理方'})),inspectionPlans:inspections,nextArticleSeq:0,nextPlanSeq:0,revision:r.revision},runs:{[r.id]:run}};
 info={status:'ready',persistent:true,runId:r.id};
}
export async function sync(force=false):Promise<ApiResult<void>>{
 if(!api.token)return fail('AUTH_REQUIRED','请先登录管理员账号');
 if(pending){
  if(!force)return pending;
  // A refresh after a write must not reuse a snapshot started before that write committed.
  await pending;
  if(pending)return pending;
 }
 if(!force&&state&&Date.now()-lastRead<400)return ok(undefined);
 pending=(async()=>{try{await api.runtime();const id=api.runId,data=await api.request<any>('/admin/workspace');if(id!==api.runId)throw Error('运行已切换，请重新加载');hydrate(data);lastRead=Date.now();return ok(undefined);}catch(e){info={...info,status:'readonly',message:(e as Error).message};return requestError(e);}finally{pending=undefined;listeners.forEach(fn=>fn(info));}})();return pending;
}
export function subscribeRuntime(fn:(v:RuntimeInfo)=>void){listeners.add(fn);const stop=api.subscribe(()=>{lastRead=0;if(api.token)void sync(true).then(r=>{if(r.ok)window.dispatchEvent(new Event('admin-data-updated'));});});return()=>{listeners.delete(fn);stop();};}
export const bootstrap=()=>info;
export const runtimeInfo=()=>info;
export const checkStorageChanges=()=>info;
export const currentSession=()=>session;
export const bootstrapSession=()=>session;
export const setSession=(s:StaffSession|null)=>{session=s;};
export const sessionWarning=()=>null;
export const noteSessionPersistWarning=(_s:any)=>{};
export const getStore=()=>{if(!state)throw Error('尚未取得后端数据');return state;};
export const getRun=()=>getStore().runs[getStore().activeRunId];
export const requireStaff=()=>session?ok(session):fail('AUTH_REQUIRED','请登录管理员账号');
export const refreshBusinessTime=()=>getRun().businessTime;
export const resetSample=()=>fail('FORBIDDEN','请使用独立演示终端重置运行');
export const authExpiredMessage=()=> '登录已失效，请重新登录';
// Compatibility exports for archived mock tests; online code never writes local business records.
export function configureRuntime(_options:any){}
export const storageBackend=()=>null;
export const sessionStoreBackend=()=>null;
export const sessionStorageKey=()=> 'qinglan.platform.admin';
export const createSeedStore=():BusinessStore=>{throw Error('在线管理员不生成本地样例');};
export function mutate<T>(..._args:any[]):ApiResult<T>{return fail('FORBIDDEN','请通过后端业务接口保存');}
