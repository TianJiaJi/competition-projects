import {state,save,go} from '../model/store';
import {request, ApiError} from './qa';
import type {AuthResult,Booking,RunInfo} from '../../../../packages/contracts/src/platform';
export let businessTime='';
export async function runtime(){const value=await request<{run:RunInfo}>('/runtime');businessTime=value.run.businessTime;if(state.aiRunId!==value.run.id){state.aiRunId=value.run.id;state.runId=value.run.id;state.orders=[];state.messages=[];state.conversationIds=[];state.tour=null;save();}return value.run;}
export async function signIn(username:string,password:string,name?:string){const result=await request<AuthResult>(name===undefined?'/auth/login':'/auth/register','POST',{username,password,...(name===undefined?{}:{name})});if(result.user.role!=='visitor')throw Error('请使用游客账号登录');uni.setStorageSync("platform-user-id",result.user.id);state.aiSession=result.token;state.aiRunId=result.runId;state.runId=result.runId;state.nickname=result.user.name;save();uni.setStorageSync("platform-password-required",Boolean(result.user.mustChangePassword));if(!result.user.mustChangePassword)await refreshOrders();return result;}
export async function changeFirstPassword(password:string){const result=await request<AuthResult>("/auth/password","POST",{password});state.aiSession=result.token;save();uni.removeStorageSync("platform-password-required");await refreshOrders();}
export async function requireLogin(){if(uni.getStorageSync("platform-password-required")){go("login/index");throw Error("请先修改临时密码");}if(!state.aiSession){go('login/index');throw Error('请先登录游客账号');}await runtime();}
export async function signOut(){
  try { if(state.aiSession) await request('/auth/logout','POST',{}); }
  catch { /* 本地会话仍需清理，避免继续携带已失效凭证。 */ }
  state.aiSession='';state.aiRunId='';state.runId='';state.nickname='';state.orders=[];state.messages=[];state.favourites=[];state.conversationIds=[];state.tour=null;save();
}
export async function refreshOrders(){if(!state.aiSession)return;await runtime();const value=await request<{items:Booking[]}>('/orders?pageSize=50');state.orders=value.items.map(o=>({...o,name:state.nickname,phone:'',plate:'',parkingId:o.lotId||'',status:o.status as 'confirmed'|'cancelled'}));save();}
export async function orderAction(id:string,action:'cancel'|'reschedule',input:Record<string,unknown>={}){await requireLogin();const o=state.orders.find(o=>o.id===id) as (typeof state.orders[number]&{version:number})|undefined;if(!o)throw Error('订单不存在');await request('/orders/'+id+'/'+action,'POST',{...input,...(typeof input.slot==='string'?{slot:input.slot.slice(0,5)}:{}),expectedVersion:o.version});await refreshOrders();}
export async function saveProfile(favourites=state.favourites,routeId=state.tour?.routeId){await requireLogin();const value=await request<{favourites:string[];routeId:string|null}>('/me/profile','POST',{favourites,routeId});state.favourites=value.favourites;save();}

export async function refreshProfile(){if(!state.aiSession)return;const profile=await request<any>('/me/profile');state.favourites=profile.favourites;state.tour=profile.tour||null;save();}
export function isAuthError(error: unknown){return error instanceof ApiError && error.status===401;}
export async function tourAction(routeId:string,action:'select'|'start'|'pause'){await requireLogin();const value=await request<any>('/me/tour','POST',{routeId,action});state.tour=value.tour;save();}
