import { loadTask, newTaskStore, persistTask, TASK_STORAGE_KEY, type CampusTaskStore } from './task-store';
export const SESSION_KEY='service-test-workbench.service-session.v1';
let activeSession:string|null=null;
export function applyServiceSession(id:string, storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>=localStorage) {
  const previous=storage.getItem(SESSION_KEY);
  if(previous!==null && previous!==id)storage.removeItem(TASK_STORAGE_KEY);
  storage.setItem(SESSION_KEY,id);
  activeSession=id;
  return previous!==null && previous!==id;
}
async function sessionId(){const response=await fetch('/__workbench_session',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('Session unavailable');const data=await response.json();if(typeof data.id!=='string' || !data.id)throw Error('Invalid session');return data.id as string;}
export async function initializeServiceSession(){try{applyServiceSession(await sessionId());}catch{/* Network/storage failures never imply reset. */}}
export async function checkServiceRestart(){try{const id=await sessionId();if(activeSession && id!==activeSession){applyServiceSession(id);location.reload();}else if(!activeSession)applyServiceSession(id);}catch{/* Keep the current page intact while offline. */}}
export function restoreRuntimeTask(){return loadTask({getItem:key=>localStorage.getItem(key)}).store;}
export function saveRuntimeTask(store:CampusTaskStore){return persistTask({setItem:(key,value)=>localStorage.setItem(key,value)},store);}
/** Retained for callers that explicitly request a blank run, never used on refresh. */
export function startFreshTask(storage:()=>Pick<Storage,'removeItem'>=()=>globalThis.localStorage){try{storage().removeItem(TASK_STORAGE_KEY);}catch{}return newTaskStore();}
