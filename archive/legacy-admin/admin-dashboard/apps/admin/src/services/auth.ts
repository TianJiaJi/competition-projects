import {ok,fail,type ApiResult} from '../core/result';
import type {StaffSession} from '../core/types';
import {api,sync,setSession,mappedSession,requestError} from './store';
export interface LoginInput {username:string;password:string}
export async function staffLogin(input:LoginInput):Promise<ApiResult<StaffSession>>{try{const result=await api.login(input.username.trim(),input.password);if(result.user.role!=='admin'){await api.logout();return fail('FORBIDDEN','请使用管理员账号');}const session=mappedSession(result.user);setSession(session);const ready=await sync(true);return ready.ok?ok(session):ready;}catch(e){return requestError(e);}}
export async function getMe():Promise<ApiResult<StaffSession>>{try{const user=await api.restore();if(!user||user.role!=='admin'){setSession(null);return fail('AUTH_REQUIRED','请登录管理员账号');}const session=mappedSession(user);setSession(session);const ready=await sync();return ready.ok?ok(session):ready;}catch(e){setSession(null);return requestError(e);}}
export async function logout():Promise<ApiResult<{loggedOut:true}>>{try{await api.logout();setSession(null);return ok({loggedOut:true});}catch(e){return requestError(e);}}
