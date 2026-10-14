import { expect, it } from 'vitest';
import { assignments, deliverySystem } from '../../apps/testing/src/campus-handoff';
import { SpecialSession, createSpecialReport, specialSummary, campusScenarios, type ScenarioId, type ScenarioRuns } from '../../apps/testing/src/special-engine';
import { compileSpecialPlan, createCompiledSpecialRuns, specialGenerationDelay, specialTemplates } from '../../apps/testing/src/special-plan';
import { runSpecialSequence, specialReportMatches } from '../../apps/testing/src/special-batch';
it('固定四项校园指派逐步执行，不自动推进并具有校园证据', async () => {
  const session=new SpecialSession(()=>{},0,undefined,'campus');
  expect(campusScenarios).toHaveLength(4);expect(session.snapshot().duplicate.step).toBe(0);
  for (const a of assignments) {
    await session.advance(a.id,0);expect(session.snapshot()[a.id].step).toBe(1);expect(session.snapshot()[a.id].assertions).toEqual([]);
    await session.advance(a.id,1);expect(session.snapshot()[a.id].step).toBe(2);
    await session.advance(a.id,2);const r=session.snapshot()[a.id];expect(r.assertions.every(c=>c.passed)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('订单');expect(r.state.orderId).toMatch(/^BR-TEST/);
  }
  const report=createSpecialReport(deliverySystem(),session.snapshot(),assignments.map(a=>a.id));expect(specialSummary(report)).toMatchObject({completed:4,total:4,passed:12});expect(report.scenarios).toHaveLength(4);session.dispose();
});
it('恢复场景与参数调整不篡改已有报告，取消当前场景不伪造通过', async () => {
  const session=new SpecialSession(()=>{},0,undefined,'campus');await session.advance('duplicate',0);await session.advance('duplicate',1);await session.advance('duplicate',2);
  const report=createSpecialReport(deliverySystem(),session.snapshot(),assignments.map(a=>a.id));
  const restored=new SpecialSession(()=>{},0,session.snapshot(),'campus');restored.reset('duplicate','3');expect(restored.snapshot().duplicate.step).toBe(0);expect(report.scenarios[0].step).toBe(3);
  const inFlight=restored.advance('stock',0);restored.cancel();await inFlight;expect(restored.snapshot().stock.step).toBe(0);expect(restored.snapshot().stock.assertions).toEqual([]);session.dispose();restored.dispose();
});
it('需求编排实际匹配本地模板并构造未执行场景，不伪造请求或断言',()=>{
  const plan=compileSpecialPlan(),runs=createCompiledSpecialRuns(plan);
  expect(plan.map(item=>item.scenarioId)).toEqual(assignments.map(item=>item.id));
  for(const item of plan){
    expect(specialTemplates.some(template=>template.id===item.templateId && template.scenarioId===item.scenarioId)).toBe(true);
    expect(item.blocks).toHaveLength(3);expect(item.stages).toHaveLength(3);
    expect(item.acceptance).toBe(assignments.find(assignment=>assignment.id===item.scenarioId)!.standard);
    expect(item.executionMode).toBe('local-scenario-model');
    expect(runs[item.scenarioId]).toMatchObject({profile:'campus',step:0,parameter:item.parameter,requests:[],assertions:[],events:[]});
  }
  expect(()=>createCompiledSpecialRuns([...plan.slice(0,3),plan[0]])).toThrow('编排');
});
it('一键测试按指派顺序执行全部三阶段，报告与执行记录严格匹配',async()=>{
  const session=new SpecialSession(()=>{},0,createCompiledSpecialRuns(compileSpecialPlan()),'campus');
  const ids=assignments.map(item=>item.id),order:ScenarioId[]=[],steps:string[]=[];
  expect(await runSpecialSequence(session,ids,{signal:new AbortController().signal,onScenario:id=>order.push(id),onStep:(id,step)=>steps.push(`${id}:${step}`),settleMs:0})).toBe(true);
  expect(order).toEqual(ids);expect(steps).toEqual(ids.flatMap(id=>[`${id}:0`,`${id}:1`,`${id}:2`]));
  const runs=session.snapshot(),report=createSpecialReport(deliverySystem(),runs,ids);
  expect(specialSummary(report)).toMatchObject({completed:4,total:4,assertions:12,passed:12});
  expect(specialReportMatches(report,runs,ids,{})).toBe(true);
  expect(specialReportMatches(report,runs,ids,{duplicate:{note:'人工补充',checkpoint:'待人工确认',result:'pending'}})).toBe(false);
  session.reset('duplicate');expect(specialReportMatches(report,session.snapshot(),ids,{})).toBe(false);expect(report.scenarios[0].step).toBe(3);session.dispose();
});
it('一键测试恢复未完成步骤，跳过已核验场景且不清除参数或证据',async()=>{
  const session=new SpecialSession(()=>{},0,undefined,'campus'),ids=assignments.map(item=>item.id),order:ScenarioId[]=[];
  for(const step of [0,1,2])await session.advance('duplicate',step);
  const completed=session.snapshot().duplicate;session.reset('stock','5');await session.advance('stock',0);const prepared=session.snapshot().stock;
  expect(await runSpecialSequence(session,ids,{signal:new AbortController().signal,onScenario:id=>order.push(id),settleMs:0})).toBe(true);
  expect(order).toEqual(['stock','permission','retry']);expect(session.snapshot().duplicate).toEqual(completed);
  expect(session.snapshot().stock.id).toBe(prepared.id);expect(session.snapshot().stock.parameter).toBe('5');
  expect(session.snapshot().stock.events.filter(event=>event.action==='准备条件')).toHaveLength(1);session.dispose();
});
it('取消一键测试仅重置当前未完成场景，保留前项且不启动后项，可继续执行',async()=>{
  const controller=new AbortController();let session:SpecialSession;
  session=new SpecialSession((runs,id)=>{if(id==='stock' && runs.stock.requests.some(request=>request.status==='processing') && !controller.signal.aborted)controller.abort();},0,undefined,'campus');
  const ids=assignments.map(item=>item.id),order:ScenarioId[]=[];
  expect(await runSpecialSequence(session,ids,{signal:controller.signal,onScenario:id=>order.push(id),settleMs:0})).toBe(false);
  const stopped=session.snapshot();expect(order).toEqual(['duplicate','stock']);expect(stopped.duplicate.step).toBe(3);
  for(const id of ['stock','permission','retry'] as const)expect(stopped[id]).toMatchObject({step:0,requests:[],assertions:[],events:[]});
  const continued:ScenarioId[]=[];expect(await runSpecialSequence(session,ids,{signal:new AbortController().signal,onScenario:id=>continued.push(id),settleMs:0})).toBe(true);
  expect(continued).toEqual(['stock','permission','retry']);expect(session.snapshot().duplicate).toEqual(stopped.duplicate);session.dispose();
});
it('场景切换间隙取消不会清除已完成场景，也不会误启动下一项',async()=>{
  const session=new SpecialSession(()=>{},0,undefined,'campus'),controller=new AbortController(),ids=assignments.map(item=>item.id);
  expect(await runSpecialSequence(session,ids,{signal:controller.signal,onScenario:()=>{},onStep:(id,step)=>{if(id==='duplicate' && step===2)controller.abort();},settleMs:10})).toBe(false);
  expect(session.snapshot().duplicate.step).toBe(3);expect(session.snapshot().stock.step).toBe(0);
  const before=session.snapshot();expect(await runSpecialSequence(session,ids,{signal:controller.signal,onScenario:()=>{throw Error('不得启动');}})).toBe(false);expect(session.snapshot()).toEqual(before);session.dispose();
});
it.each(['duplicate','stock','permission','retry'] as const)('%s 请求部分处理后刷新恢复，已处理请求不再次写入或追加计数',async id=>{
  let checkpoint:ScenarioRuns|undefined;
  const original=new SpecialSession((runs,busyId)=>{
    if(busyId===id && runs[id].step===1 && runs[id].requests.some(request=>!['queued','processing'].includes(request.status)) && !checkpoint)checkpoint=runs;
  },0,undefined,'campus');
  await original.advance(id,0);await original.advance(id,1);expect(checkpoint).toBeDefined();
  const expected=original.snapshot()[id],alreadyHandled=checkpoint![id].requests.filter(request=>!['queued','processing'].includes(request.status));
  const restored=new SpecialSession(()=>{},0,checkpoint,'campus');
  expect(await runSpecialSequence(restored,[id],{signal:new AbortController().signal,onScenario:()=>{},settleMs:0})).toBe(true);
  const resumed=restored.snapshot()[id];expect(resumed.assertions.every(check=>check.passed)).toBe(true);
  expect(resumed.state).toEqual(expected.state);
  expect(resumed.events.filter(event=>event.requestId!=='—')).toHaveLength(expected.requests.length);
  for(const processed of alreadyHandled)expect(resumed.requests.find(request=>request.id===processed.id)).toEqual(processed);
  original.dispose();restored.dispose();
});
it('专项编排演示节奏整体放慢12%，六段动画总时长约2.9秒',()=>{
  expect(specialGenerationDelay(400)).toBe(455);
  expect(specialGenerationDelay(220)).toBe(250);
  expect(specialGenerationDelay(120)).toBe(136);
  const stages=[450,400,220,220,220,220,450,250,120].map(specialGenerationDelay);
  expect(stages.reduce((sum,ms)=>sum+ms,0)).toBe(2897);
});
