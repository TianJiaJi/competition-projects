import { HANDOFF_ID, MESSAGE_ID, TASK_ID, apiMaterials, campusProject, deliverySystem } from './campus-handoff';
import type { EndpointConfig, Report, Sample, Frame, LoadEvent, LoadConfig, Statistics } from './types';
import type { ScenarioId, ScenarioRuns } from './special-engine';
export const TASK_STORAGE_KEY = 'service-test-workbench.campus-task.v1';
export type CheckResult = 'pending' | 'passed' | 'issue';
export interface UiCheck { pageId: string; index: number; result: CheckResult; note: string; savedAt: string; source: 'manual-observation' }
export interface TimelineEntry { id: string; at: string; title: string; detail: string; actor: string }
export interface CaseNote { note: string; checkpoint: string; result?: CheckResult }
export interface SpecialNote { note: string; checkpoint: string; result: CheckResult; parameter?: string }
export interface AcceptanceEvidence { uiChecks: Record<string, UiCheck>; apiCases: EndpointConfig[]; apiResults: Record<string, Sample>; apiNotes: Record<string, CaseNote>; specialRuns: Partial<ScenarioRuns>; specialNotes: Partial<Record<ScenarioId, SpecialNote>>; load: { id:string; status:string; config?:LoadConfig; statistics:Statistics; frames:Frame[]; events:LoadEvent[] } | null }
export interface AcceptanceSnapshot { evidence:AcceptanceEvidence; id: string; revision: number; at: string; sections: { name: string; done: number; total: number; issues: number }[]; issues: string[]; untested: string[]; reportIds: string[]; verdict: 'review' | 'partial' | 'passed'; feedback?: { id: string; at: string; status: '待整改' | '待补测' | '验收材料已反馈' } }
export interface CampusTaskStore {
  uiReports?: import('./ui-report').UiReport[];
  version: 1; handoffId: string; taskId: string; messageId: string; receivedAt: string | null; revision: number;
  apiParsedAt: string | null; apiGeneratedAt: string | null; apiCases: EndpointConfig[]; apiNotes: Record<string, CaseNote>; apiResults: Record<string, Sample>;
  specialGeneratedAt: string | null; specialRuns: ScenarioRuns | null; specialNotes: Partial<Record<ScenarioId, SpecialNote>>;
  uiChecks: Record<string, UiCheck>; timeline: TimelineEntry[]; reports: Report[]; latestLoadId: string | null; acceptance: AcceptanceSnapshot | null;
}
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function newTaskStore(): CampusTaskStore { return { version: 1, handoffId: HANDOFF_ID, taskId: TASK_ID, messageId: MESSAGE_ID, receivedAt: null, revision: 0, apiParsedAt: null, apiGeneratedAt: null, apiCases: [], apiNotes: {}, apiResults: {}, specialGeneratedAt: null, specialRuns: null, specialNotes: {}, uiChecks: {}, timeline: [], reports: [], latestLoadId: null, acceptance: null }; }
export function appendEvent(store: CampusTaskStore, title: string, detail: string, actor = '测试工程师') { store.timeline.push({ id: crypto.randomUUID(), at: new Date().toISOString(), title, detail, actor }); store.timeline = store.timeline.slice(-100); }
export function touchTask(store: CampusTaskStore) { store.revision++; }
export function receiveDelivery(store: CampusTaskStore): boolean {
  if (store.receivedAt) return false;
  store.receivedAt = new Date().toISOString(); touchTask(store);
  appendEvent(store, '收到项目交付', `${campusProject.solution} → ${campusProject.brand} v${campusProject.version}`, campusProject.frontend);
  appendEvent(store, '创建测试任务', `${TASK_ID} · 五端 UI / ${apiMaterials.length} 项 API / 4 项专项指派`);
  return true;
}
export function parseMaterials(store: CampusTaskStore) { if (!store.receivedAt || store.apiParsedAt) return false; store.apiParsedAt = new Date().toISOString(); touchTask(store); appendEvent(store, 'API材料解析完成', `${apiMaterials.length} 项接口 · GET / POST / PATCH · 请求、响应与验收点`); return true; }
export function generateApiCases(store: CampusTaskStore) { if (!store.apiParsedAt || store.apiGeneratedAt) return false; store.apiCases = copy(deliverySystem().endpoints); store.apiGeneratedAt = new Date().toISOString(); touchTask(store); appendEvent(store, '生成API测试用例', `${store.apiCases.length} 项用例已就绪，等待手动执行`); return true; }
export function uiCheckKey(pageId: string, index: number) { return `${pageId}:${index}`; }
export function validTaskStore(value: unknown): value is CampusTaskStore {
  try {
    const s = value as CampusTaskStore;
    const date = (v: unknown) => v === null || typeof v === 'string' && Number.isFinite(Date.parse(v));
    if (!s || s.version !== 1 || s.handoffId !== HANDOFF_ID || s.taskId !== TASK_ID || s.messageId !== MESSAGE_ID || !Number.isSafeInteger(s.revision) || s.revision < 0 || !date(s.receivedAt) || !date(s.apiParsedAt) || !date(s.apiGeneratedAt) || !date(s.specialGeneratedAt)) return false;
    if (!Array.isArray(s.apiCases) || !Array.isArray(s.reports) || !Array.isArray(s.timeline) || s.timeline.length > 100 || s.reports.length > 8 || !s.uiChecks || !s.apiNotes || !s.apiResults || !s.specialNotes) return false;
    const allowed = new Map(deliverySystem().endpoints.map(e => [e.id, e]));
    if (s.apiCases.length > allowed.size || new Set(s.apiCases.map(e => e.id)).size !== s.apiCases.length || s.apiCases.some(e => !allowed.has(e.id) || e.path !== allowed.get(e.id)!.path || e.method !== allowed.get(e.id)!.method || e.contractId !== allowed.get(e.id)!.contractId || !e.name || e.name.length > 80 || !Number.isInteger(e.status) || e.status < 100 || e.status > 599 || !Number.isFinite(e.budget) || e.budget < 1 || e.budget > 60000)) return false;
    if (!s.receivedAt && (s.apiParsedAt || s.apiGeneratedAt || s.specialGeneratedAt || Object.keys(s.uiChecks).length || s.reports.length)) return false;
    if (s.apiGeneratedAt && (!s.apiParsedAt || ![12,allowed.size].includes(s.apiCases.length))) return false;
    if (s.timeline.some(e => !e.id || !date(e.at) || typeof e.title !== 'string' || typeof e.detail !== 'string' || typeof e.actor !== 'string')) return false;
    if (Object.entries(s.uiChecks).some(([key, check]) => !campusProject.pages.some(p => p.id === check.pageId && check.index >= 0 && check.index < p.checks.length) || key !== uiCheckKey(check.pageId, check.index) || !['pending', 'passed', 'issue'].includes(check.result) || typeof check.note !== 'string' || check.note.length > 1000 || check.source !== 'manual-observation' || !date(check.savedAt))) return false;
    if (Object.entries(s.apiResults).some(([id, r]) => !allowed.has(id) || r.endpointId !== id || !['passed', 'failed', 'cancelled'].includes(r.outcome) || !Array.isArray(r.checks) || !Number.isFinite(r.elapsedMs) || typeof r.preview !== 'string' || !date(r.at))) return false;
    if (Object.values(s.apiNotes).some(n => typeof n.note !== 'string' || typeof n.checkpoint !== 'string' || n.result !== undefined && !['pending', 'passed', 'issue'].includes(n.result))) return false;
    if (Object.values(s.specialNotes).some(n => !n || typeof n.note !== 'string' || typeof n.checkpoint !== 'string' || !['pending', 'passed', 'issue'].includes(n.result))) return false;
    if (s.reports.some(r => !['suite', 'load', 'special'].includes(r.kind) || !r.id || !r.system || r.system.id !== 'campus-delivery' || (r.kind === 'special' ? !Array.isArray(r.scenarios) : !Array.isArray(r.samples) || !Array.isArray(r.frames)))) return false;
    if (s.specialRuns && (typeof s.specialRuns !== 'object' || ['claim', 'duplicate', 'stock', 'permission', 'retry', 'callback'].some(id => { const r = s.specialRuns![id as ScenarioId]; return !r || r.scenarioId !== id || ![0, 1, 2, 3].includes(r.step) || !Array.isArray(r.requests) || !Array.isArray(r.events) || !Array.isArray(r.assertions) || !r.state; }))) return false;
    if(s.uiReports && (!Array.isArray(s.uiReports) || s.uiReports.length>8 || s.uiReports.some(r=>r.kind!=='ui' || !r.id || !Array.isArray(r.checks) || r.checks.length!==17)))return false;
    if (s.acceptance && (!Array.isArray(s.acceptance.sections) || !Array.isArray(s.acceptance.issues) || !Array.isArray(s.acceptance.untested) || !Array.isArray(s.acceptance.reportIds) || !['review', 'partial', 'passed'].includes(s.acceptance.verdict) || !s.acceptance.evidence || !s.acceptance.evidence.uiChecks || !s.acceptance.evidence.apiResults || !s.acceptance.evidence.specialRuns)) return false;
    return true;
  } catch { return false; }
}
export function loadTask(storage: Pick<Storage, 'getItem'>): { store: CampusTaskStore; recovered: boolean } { try { const raw = storage.getItem(TASK_STORAGE_KEY); if (!raw) return { store: newTaskStore(), recovered: false }; const value: unknown = JSON.parse(raw); if (validTaskStore(value)) {
  if(value.apiGeneratedAt && value.apiCases.length===12 && deliverySystem().endpoints.length>12){
    const existing=new Set(value.apiCases.map(c=>c.id));value.apiCases.push(...deliverySystem().endpoints.filter(c=>!existing.has(c.id)));touchTask(value);appendEvent(value,'扩展API用例库','原12项记录保留，新增98项待测试用例');
  }
  return { store: value, recovered: false };
} } catch {} return { store: newTaskStore(), recovered: true }; }
/** Whole report snapshots are evicted, never truncated or presented as complete evidence. */
export function persistTask(storage: Pick<Storage, 'setItem'>, store: CampusTaskStore): { saved: boolean; evicted: boolean } {
  const snapshot = copy(store); snapshot.reports = snapshot.reports.slice(0, 8);
  while (JSON.stringify(snapshot).length > 1_500_000 && snapshot.reports.length) snapshot.reports.pop();
  try { storage.setItem(TASK_STORAGE_KEY, JSON.stringify(snapshot)); return { saved: true, evicted: snapshot.reports.length !== store.reports.length }; } catch { return { saved: false, evicted: false }; }
}
