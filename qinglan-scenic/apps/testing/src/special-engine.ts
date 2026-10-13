import type { SystemConfig } from "./types";
import { assignments } from './campus-handoff';
export const campusText = (value: string) => value.replaceAll('订单', '申请').replaceAll('库存', '时段余量').replaceAll('成交', '预约').replaceAll('抢购', '预约').replaceAll('下单', '预约').replaceAll('持有人', '申请人');

export type ScenarioId = "claim" | "duplicate" | "stock" | "permission" | "retry" | "callback";
export type Decision = "queued" | "processing" | "accepted" | "protected" | "reused" | "deferred";
export interface ScenarioDefinition {
  id: ScenarioId; name: string; short: string; description: string;
  parameter: string; options: { value: string; label: string }[]; defaultValue: string;
  actions: [string, string, string]; resource: string;
}
const quantities = (values: number[], unit: string) => values.map(value => ({ value: String(value), label: `${value} ${unit}` }));
export const scenarios: ScenarioDefinition[] = [
  { id: "claim", name: "多账户抢单", short: "唯一归属", description: "同时领取同一张订单，核验最终只有一个持有人。", parameter: "参与账户", options: quantities([2, 5, 10], "个"), defaultValue: "2", actions: ["准备待领取订单", "同时放行请求", "核验订单归属"], resource: "待领取订单" },
  { id: "duplicate", name: "重复提交", short: "幂等校验", description: "同一业务连续提交，核验只创建一条订单记录。", parameter: "提交次数", options: quantities([3, 10, 20], "次"), defaultValue: "10", actions: ["准备提交请求", "连续提交请求", "核验创建记录"], resource: "订单创建记录" },
  { id: "stock", name: "库存防超卖", short: "库存一致", description: "多个账户争抢最后一份库存，核验成交与余量一致。", parameter: "抢购人数", options: quantities([5, 10, 20], "人"), defaultValue: "20", actions: ["准备最后一份库存", "并发提交订单", "核验成交与库存"], resource: "限量资源" },
  { id: "permission", name: "越权访问", short: "权限边界", description: "账户 B 操作账户 A 的订单，核验权限与数据边界。", parameter: "访问动作", options: [{ value: "read", label: "查看订单" }, { value: "assign", label: "修改归属" }, { value: "cancel", label: "取消订单" }], defaultValue: "read", actions: ["准备账户与订单", "发起跨账户操作", "核验权限边界"], resource: "账户 A 的订单" },
  { id: "retry", name: "断线重试", short: "写入去重", description: "首笔已写入、回执暂缓，重试后核验仍是同一笔业务。", parameter: "重试次数", options: quantities([1, 3, 5], "次"), defaultValue: "3", actions: ["准备业务请求", "发送并重试", "核验业务写入"], resource: "业务处理记录" },
  { id: "callback", name: "乱序回调", short: "版本保护", description: "改变回调到达顺序，核验旧版本不会覆盖最新状态。", parameter: "到达顺序", options: ["1,3,2", "3,1,2", "3,2,1"].map(value => ({ value, label: value.replaceAll(",", " → ") })), defaultValue: "3,1,2", actions: ["准备三版回调", "按顺序投递回调", "核验最终状态"], resource: "订单状态版本" },
];
export const campusScenarios: ScenarioDefinition[] = assignments.map(assignment => {
  const original=scenarios.find(s=>s.id===assignment.id)!;
  return {...original,name:assignment.title,description:assignment.risk,short:assignment.id==='stock'?'唯一时段占用':original.short,resource:assignment.id==='stock'?'明理楼305 · 18:00–19:00 时段':'校园申请记录',parameter:assignment.id==='stock'?'参与学生':original.parameter,options:original.options.map(o=>({...o,label:campusText(o.label)})),actions:original.actions.map(campusText) as [string,string,string]};
});
export const definition = (id: ScenarioId, profile: 'generic'|'campus' = 'generic') => (profile==='campus' ? campusScenarios : scenarios).find(scenario => scenario.id === id) || scenarios.find(scenario=>scenario.id===id)!;
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export interface BusinessState {
  orderId: string; owner: string | null; stock: number; minStock: number; version: number;
  orderState: string; claimRecords: string[]; orders: { id: string; owner: string }[];
  writes: number; responseIds: string[]; denied: number; sensitiveFields: number; staleIgnored: number;
}
export interface ScenarioRequest {
  id: string; actor: string; action: string; status: Decision; result: string;
  input: Record<string, unknown>; response: Record<string, unknown>;
}
export interface ScenarioEvent {
  id: string; at: string; requestId: string; actor: string; action: string;
  result: string; decision: Decision | "info"; input: Record<string, unknown>; response: Record<string, unknown>;
  before: BusinessState; after: BusinessState;
}
export interface ScenarioAssertion { label: string; expected: string; actual: string; passed: boolean }
export interface ScenarioRun {
  profile?: 'generic'|'campus';
  id: string; scenarioId: ScenarioId; parameter: string; seed: number;
  step: 0 | 1 | 2 | 3; startedAt: string | null; completedAt: string | null; elapsedMs: number;
  state: BusinessState; requests: ScenarioRequest[]; acceptanceOrder: string[];
  events: ScenarioEvent[]; assertions: ScenarioAssertion[];
}
export type ScenarioRuns = Record<ScenarioId, ScenarioRun>;
export interface SpecialReport {
  profile?: 'generic'|'campus';
  taskId?: string; handoffId?: string;
  caseNotes?: Partial<Record<ScenarioId, {note:string;checkpoint:string;result:string}>>;
  id: string; kind: "special"; system: SystemConfig; startedAt: string; generatedAt: string;
  elapsedMs: number; status: "completed" | "stopped"; scenarios: ScenarioRun[];
}
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
const account = (index: number, profile?: string) => profile==='campus' ? index===0?'本班学生林悦':`学生 ${String.fromCharCode(65+index)}` : `账户 ${String.fromCharCode(65 + index)}`;
const freshState = (id: ScenarioId, profile: 'generic'|'campus' = 'generic'): BusinessState => ({
  orderId: `${profile==='campus'?'BR-TEST':'ORD'}-${id.toUpperCase()}-001`, owner: id === "permission" ? account(0,profile) : null,
  stock: 1, minStock: 1, version: id === "permission" ? 1 : 0,
  orderState: profile==='campus' ? '待审核' : id === "claim" ? "待领取" : "待处理", claimRecords: [], orders: [],
  writes: 0, responseIds: [], denied: 0, sensitiveFields: 0, staleIgnored: 0,
});
export function newScenario(id: ScenarioId, parameter = definition(id).defaultValue, seed = crypto.getRandomValues(new Uint32Array(1))[0], profile: 'generic'|'campus' = 'generic'): ScenarioRun {
  if (!definition(id).options.some(option => option.value === parameter)) throw new Error("场景参数无效");
  return { id: crypto.randomUUID(), profile, scenarioId: id, parameter, seed, step: 0, startedAt: null,
    completedAt: null, elapsedMs: 0, state: freshState(id,profile), requests: [], acceptanceOrder: [], events: [], assertions: [] };
}
export function createRuns(profile: 'generic'|'campus' = 'generic'): ScenarioRuns {
  return Object.fromEntries(scenarios.map(scenario => [scenario.id, newScenario(scenario.id, undefined, undefined, profile)])) as ScenarioRuns;
}
function prepare(run: ScenarioRun) {
  const id = run.scenarioId;
  const count = id === "permission" ? 1 : id === "callback" ? 3 : Number(run.parameter) + (id === "retry" ? 1 : 0);
  run.requests = Array.from({ length: count }, (_, index) => ({
    id: `REQ-${run.id.slice(0, 6).toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
    actor: id === "permission" ? run.profile==='campus'?'外班教师':account(1) : ["duplicate", "retry"].includes(id) ? account(0,run.profile) : id === "callback" ? "回调服务" : account(index,run.profile),
    action: id === "callback" ? `回调 v${run.parameter.split(",")[index]}` : id === "retry" ? index ? `重试 ${index}` : "首次提交" : definition(id,run.profile).actions[1],
    status: "queued", result: "等待放行", response: {},
    input: { orderId: run.state.orderId, ...(id === "callback" ? { version: Number(run.parameter.split(",")[index]) }
      : id === "permission" ? { action: run.parameter, targetOwner: account(0,run.profile), ...(run.profile==='campus'?{actorClassId:'CLS-2402',targetClassId:'CLS-2401'}:{}) }
      : ["duplicate", "retry"].includes(id) ? { idempotencyKey: `BIZ-${run.id.slice(0, 8)}` }
      : { expectedVersion: 0 }) },
  }));
  run.acceptanceOrder = run.requests.map(request => request.id);
  if (id === "claim" || id === "stock") {
    const random = seededRandom(run.seed);
    for (let i = run.acceptanceOrder.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [run.acceptanceOrder[i], run.acceptanceOrder[j]] = [run.acceptanceOrder[j], run.acceptanceOrder[i]];
    }
  }
}
function event(run: ScenarioRun, request: ScenarioRequest | null, action: string, result: string, before: BusinessState) {
  if(run.profile==='campus') { run.state.orderState=campusText(run.state.orderState); action=campusText(action); result=campusText(result); if(request) {request.result=campusText(request.result); request.action=campusText(request.action);} }
  run.events.push({ id: `${run.id}:${run.events.length + 1}`, at: new Date().toISOString(), requestId: request?.id || "—",
    actor: request?.actor || "验证器", action, result, decision: request?.status || "info",
    input: copy(request?.input || { parameter: run.parameter, seed: run.seed }), response: copy(request?.response || {}),
    before: copy(before), after: copy(run.state) });
}
/** Business mutations are applied once per accepted request; guards operate on the current state. */
function process(run: ScenarioRun, request: ScenarioRequest) {
  const state = run.state, before = copy(state), id = run.scenarioId;
  request.status = "accepted";
  if (id === "claim") {
    if (state.owner === null && state.version === request.input.expectedVersion) {
      state.owner = request.actor; state.version++; state.claimRecords.push(request.id); state.writes++;
      state.orderState = "已领取"; request.result = "领取成功"; request.response = { orderId: state.orderId, owner: state.owner, version: state.version };
    } else { request.status = "protected"; request.result = "订单已被领取"; request.response = { code: "ALREADY_CLAIMED" }; }
  } else if (id === "stock") {
    if (state.stock > 0) {
      state.stock--; state.minStock = Math.min(state.minStock, state.stock); state.owner = request.actor;
      state.orders.push({ id: state.orderId, owner: request.actor }); state.writes++; state.version++;
      state.orderState = "已成交"; request.result = "下单成功"; request.response = { orderId: state.orderId };
    } else { request.status = "protected"; request.result = "库存保护生效"; request.response = { code: "STOCK_PROTECTED" }; }
  } else if (id === "permission") {
    if (request.actor !== state.owner) {
      state.denied++; request.status = "protected"; request.result = "权限保护生效";
      request.response = { code: "ACCESS_PROTECTED", fields: [] };
    } else {
      request.result = "访问已受理"; request.response = { orderId: state.orderId, owner: state.owner }; state.sensitiveFields = 2;
    }
  } else if (id === "callback") {
    const version = Number(request.input.version);
    if (version > state.version) {
      state.version = version; state.orderState = ["待处理", "处理中", "已完成"][version - 1]; state.writes++;
      request.result = `状态更新至 v${version}`;
    } else { state.staleIgnored++; request.status = "protected"; request.result = "版本保护生效"; }
    request.response = { version: state.version, state: state.orderState };
  } else {
    // The business key is identical across this batch. Existing writes are reused on repeat/retry.
    const existing = run.requests.find(item => item !== request && item.input.idempotencyKey === request.input.idempotencyKey && item.response.orderId);
    if (!existing) {
      state.orders.push({ id: state.orderId, owner: request.actor }); state.writes++; state.owner = request.actor;
      state.orderState = "已创建"; state.version++;
      request.result = "订单创建成功";
    } else { request.status = "reused"; request.result = id === "retry" ? "重试返回既有结果" : "复用首次提交结果"; }
    request.response = { orderId: existing?.response.orderId || state.orderId, idempotencyKey: request.input.idempotencyKey };
    if (id === "retry" && !existing) {
      request.status = "deferred"; request.result = "业务已写入 · 回执暂缓";
      request.response.receiptDelivered = false;
    } else { state.responseIds.push(String(request.response.orderId)); request.response.receiptDelivered = true; }
  }
  event(run, request, request.action, request.result, before);
}
export function assertScenario(run: ScenarioRun): ScenarioAssertion[] {
  const s = run.state, receipts = run.requests.filter(request => request.status === "accepted");
  const check = (label: string, actual: number | string, expected: number | string): ScenarioAssertion => ({ label, actual: String(actual), expected: String(expected), passed: actual === expected });
  switch (run.scenarioId) {
    case "claim": return [check("成功领取", receipts.length, 1), check("订单持有人", s.owner ? new Set([...run.events.filter(e => e.decision === "accepted").map(e => e.after.owner), s.owner].filter(Boolean)).size : 0, 1), check("领取记录", s.claimRecords.length, 1)];
    case "duplicate": return [check("创建记录", s.orders.length, 1), check("返回订单编号种类", new Set(s.responseIds).size, 1), check("已处理提交", s.responseIds.length, Number(run.parameter))];
    case "stock": return [check("成交笔数", s.orders.length, 1), check("剩余库存", s.stock, 0), check("最低库存", s.minStock, 0)];
    case "permission": return [check("权限拦截", s.denied, 1), check("返回敏感字段", s.sensitiveFields, 0), check("订单变更", s.writes + (s.owner !== account(0,run.profile) || s.version !== 1 || s.orderState !== (run.profile==='campus'?'待审核':'待处理') ? 1 : 0), 0)];
    case "retry": return [check("业务写入", s.writes, 1), check("重试返回同一编号", s.responseIds.length === Number(run.parameter) && s.responseIds.every(id => id === s.orderId) ? "一致" : "待复核", "一致"), check("重复写入", Math.max(0, s.orders.length - 1), 0)];
    case "callback": return [check("最终版本", s.version, 3), check("最终状态", s.orderState, "已完成"), check("旧消息覆盖次数", run.events.filter(e => e.decision === "protected" && (e.before.version !== e.after.version || e.before.orderState !== e.after.orderState)).length, 0)];
  }
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Stopped", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Stopped", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** One cancellable session per selected system. Published snapshots never alias mutable run state. */
export class SpecialSession {
  private runs = createRuns();
  private controller?: AbortController;
  private disposed = false;
  busyId: ScenarioId | null = null;
  constructor(private update: (runs: ScenarioRuns, busyId: ScenarioId | null) => void, private pace = 70, initial?: ScenarioRuns, private profile: 'generic'|'campus' = 'generic') { this.runs=initial?copy(initial):createRuns(profile); }
  cancel() { if(this.busyId) this.reset(this.busyId); }
  snapshot() { return copy(this.runs); }
  private emit() { if (!this.disposed) this.update(this.snapshot(), this.busyId); }
  reset(id: ScenarioId, parameter = this.runs[id].parameter, seed?: number) {
    if (this.disposed) return;
    const fresh = newScenario(id, parameter, seed, this.profile);
    if (this.busyId === id) { this.controller?.abort(); this.busyId = null; }
    this.runs[id] = fresh; this.emit();
  }
  dispose() { this.disposed = true; this.controller?.abort(); this.busyId = null; }
  async advance(id: ScenarioId, expectedStep: number = this.runs[id].step): Promise<boolean> {
    const run = this.runs[id];
    if (this.disposed || this.busyId || run.step === 3 || run.step !== expectedStep) return false;
    const controller = new AbortController(); this.controller = controller; this.busyId = id;
    run.startedAt ||= new Date().toISOString();
    const start = performance.now(), valid = () => !this.disposed && !controller.signal.aborted && this.runs[id] === run;
    this.emit();
    try {
      if (run.step === 0) {
        await wait(this.pace * 2, controller.signal); if (!valid()) return false;
        prepare(run); event(run, null, "准备条件", `已准备 ${run.requests.length} 个请求`, run.state); run.step = 1;
      } else if (run.step === 1) {
        for (const requestId of run.acceptanceOrder) {
          const request = run.requests.find(item => item.id === requestId)!;
          request.status = "processing"; request.result = "正在处理"; this.emit();
          await wait(this.pace, controller.signal); if (!valid()) return false;
          process(run, request); this.emit();
        }
        run.step = 2;
      } else {
        await wait(this.pace * 2, controller.signal); if (!valid()) return false;
        run.assertions = assertScenario(run).map(check=>({...check,label:run.profile==='campus'?campusText(check.label):check.label})); run.step = 3; run.completedAt = new Date().toISOString();
        event(run, null, "核验结果", `${run.assertions.filter(check => check.passed).length} / ${run.assertions.length} 项断言通过`, run.state);
      }
      run.elapsedMs += performance.now() - start;
      return true;
    } catch (error) { if (!controller.signal.aborted) throw error; return false; }
    finally { if (valid()) { this.busyId = null; this.emit(); } }
  }
}
export function specialSummary(report: SpecialReport) {
  const completed = report.scenarios.filter(run => run.step === 3);
  const checks = completed.flatMap(run => run.assertions);
  return { completed: completed.length, total: report.scenarios.length, assertions: checks.length, passed: checks.filter(check => check.passed).length,
    events: report.scenarios.reduce((n, run) => n + run.events.length, 0), verified: completed };
}
export function createSpecialReport(system: SystemConfig, runs: ScenarioRuns, ids: ScenarioId[] = scenarios.map(s=>s.id)): SpecialReport {
  const snapshots = copy(ids.map(id => runs[id]));
  if (!snapshots.some(run => run.step === 3)) throw new Error("请先完成一个场景的核验");
  return { id: crypto.randomUUID(), profile: snapshots[0]?.profile, kind: "special", system: copy(system), generatedAt: new Date().toISOString(),
    startedAt: snapshots.map(run => run.startedAt).filter((at): at is string => !!at).sort()[0],
    elapsedMs: snapshots.reduce((total, run) => total + run.elapsedMs, 0), status: snapshots.every(run => run.step === 3) ? "completed" : "stopped", scenarios: snapshots };
}
export function businessMetrics(run: ScenarioRun): { label: string; value: string | number }[] { return rawBusinessMetrics(run).map(metric=>({...metric,label:run.profile==='campus'?campusText(metric.label):metric.label})); }
function rawBusinessMetrics(run: ScenarioRun): { label: string; value: string | number }[] {
  const s = run.state;
  switch (run.scenarioId) {
    case "claim": return [{ label: "订单持有人", value: s.owner || "待领取" }, { label: "领取记录", value: s.claimRecords.length }, { label: "数据版本", value: `v${s.version}` }];
    case "duplicate": return [{ label: "创建记录", value: s.orders.length }, { label: "已返回结果", value: s.responseIds.length }, { label: "订单编号种类", value: new Set(s.responseIds).size }];
    case "stock": return [{ label: "剩余库存", value: s.stock }, { label: "成交笔数", value: s.orders.length }, { label: "成交账户", value: s.owner || "等待受理" }];
    case "permission": return [{ label: "订单持有人", value: s.owner || "—" }, { label: "权限拦截", value: s.denied }, { label: "订单变更", value: s.writes }];
    case "retry": return [{ label: "业务写入", value: s.writes }, { label: "已收到回执", value: s.responseIds.length }, { label: "创建记录", value: s.orders.length }];
    case "callback": return [{ label: "当前版本", value: `v${s.version}` }, { label: "订单状态", value: s.orderState }, { label: "旧消息已保护", value: s.staleIgnored }];
  }
}
