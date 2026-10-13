import { campusProject } from './campus-handoff';
import { copy, uiCheckKey, type CampusTaskStore, type UiCheck } from './task-store';
export interface UiReport {id:string;kind:'ui';taskId:string;handoffId:string;at:string;total:number;passed:number;issues:number;checks:UiCheck[];source:'manual-observation';}
export function completeUiReport(store:CampusTaskStore):UiReport|null {
 const checks=campusProject.pages.flatMap(page=>page.checks.map((_,index)=>store.uiChecks[uiCheckKey(page.id,index)]));
 if(checks.some(check=>!check || check.result==='pending' || check.result==='issue' && !check.note.trim()))return null;
 return {id:`UI-${crypto.randomUUID()}`,kind:'ui',taskId:store.taskId,handoffId:store.handoffId,at:new Date().toISOString(),total:checks.length,passed:checks.filter(c=>c.result==='passed').length,issues:checks.filter(c=>c.result==='issue').length,checks:copy(checks),source:'manual-observation'};
}
export function uiReportDocument(report:UiReport){return {...copy(report),project:campusProject.name,automatedBusinessRequestCount:0,measurement:'五端UI由操作者人工确认，批量确认不代表自动浏览器测试。',pages:campusProject.pages.map(p=>({id:p.id,name:p.name,checks:p.checks}))};}
