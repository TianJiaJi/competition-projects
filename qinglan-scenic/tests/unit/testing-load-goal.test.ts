import { afterEach, expect, it, vi } from 'vitest';
import { deliverySystem } from '../../apps/testing/src/campus-handoff';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { loadReportSummary, modelSample, normalizeConfig, reportDocument, startLoadSession, type MeasurementReport } from '../../apps/testing/src/engine';
import { loadReportHtml } from '../../apps/testing/src/report-export';
import { modelWindowConcurrency, createLoadModel } from '../../apps/testing/src/load-model';
import { buildAcceptance, feedbackAcceptance } from '../../apps/testing/src/acceptance';
import { newTaskStore, receiveDelivery } from '../../apps/testing/src/task-store';
const system=deliverySystem(),endpoint=resolveEndpoints(system)[1];
function report(peak=2000):MeasurementReport{
 return {id:'goal-report',kind:'load',system,startedAt:'2026-10-09T00:00:00Z',status:'completed',elapsedMs:30000,
 config:{concurrency:2000,duration:30,rps:0,endpointId:endpoint.id},samples:[modelSample(endpoint)],observations:[],events:[],
 frames:[{second:30,windowSeconds:1,completed:1,concurrency:peak,rps:1,targetRps:1,p50:10,p95:20,p99:30,level:5,phase:'completed',failed:0}]};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('峰值演示波动只作用于第五级，种子与采样时间可复现，幅度1%–4%',()=>{
 for(const target of [1000,2000,10000]){
  for(let level=0;level<5;level++)expect(modelWindowConcurrency(target,level,30,123)).toBe(target);
  const values=Array.from({length:20},(_,index)=>modelWindowConcurrency(target,5,index+24,123));
  expect(new Set(values).size).toBeGreaterThan(1);
  for(const [index,value] of values.entries()){
   expect(value).toBeGreaterThanOrEqual(target*1.01);expect(value).toBeLessThanOrEqual(target*1.04);
   expect(value).toBe(modelWindowConcurrency(target,5,index+24,123));
  }
 }
 vi.spyOn(Math,'random').mockReturnValue(0.125);
 expect(createLoadModel()).toEqual({kind:'peak-overshoot-demo',seed:536870912,minOvershootPercent:1,maxOvershootPercent:4});
});
it('默认1000并发30秒，2000与10000不被截断；超出上限才限制为10000',()=>{
 const endpoints=resolveEndpoints(system);
 expect(normalizeConfig({concurrency:NaN,duration:NaN,rps:0,endpointId:endpoint.id},endpoints)).toMatchObject({concurrency:1000,duration:30});
 for(const concurrency of [2000,10000])expect(normalizeConfig({...report().config!,concurrency},endpoints).concurrency).toBe(concurrency);
 expect(normalizeConfig({...report().config!,concurrency:10001},endpoints).concurrency).toBe(10000);
});
it.each([2000,2500])('峰值%s达到目标则通过，JSON与HTML给出同一结论',peak=>{
 const r=report(peak),raw=JSON.stringify(r),goal=loadReportSummary(r).goal;
 expect(goal).toMatchObject({verdict:'passed',targetConcurrency:2000,peakConcurrency:peak,gap:0,reachedTarget:true,executionComplete:true,firstReachedSecond:29,targetWindowSeconds:1,issues:[]});
 expect(reportDocument(r).loadSummary?.goal).toEqual(goal);
 expect(loadReportHtml(r)).toContain('通过 · 已达到并发目标');expect(JSON.stringify(r)).toBe(raw);
});
it('峰值1600未达目标2000：80%达成率、400差额，问题进入验收反馈并保留独立快照',()=>{
 const r=report(1600),goal=loadReportSummary(r).goal;
 expect(goal).toMatchObject({verdict:'failed',peakConcurrency:1600,achievementPercent:80,gap:400,executionComplete:true});
 expect(goal.issues[0]).toContain('并发目标未达标');
 const store=newTaskStore();receiveDelivery(store);store.reports=[r];store.latestLoadId=r.id;
 store.acceptance=buildAcceptance(store);
 expect(store.acceptance.sections.find(s=>s.name==='并发测试')).toMatchObject({done:1,total:1,issues:1});
 expect(store.acceptance.verdict).toBe('review');expect(store.acceptance.issues.join()).toContain(goal.issues[0]);
 expect(store.acceptance.evidence.load?.goal).toEqual(goal);
 expect(feedbackAcceptance(store)).toBe(true);expect(store.acceptance.feedback?.status).toBe('待整改');
 r.frames[0].concurrency=2000;expect(store.acceptance.evidence.load?.goal?.gap).toBe(400);
 const html=loadReportHtml(report(1600));expect(html).toContain('未达标 · 未达到并发目标');expect(html).toContain('未达标问题 · 已记录');expect(html).toContain('400');
});
it('空记录、零完成请求、缺少目标、只有计划升档均不能通过',()=>{
 const r=report();
 for(const candidate of [{...r,frames:[]},{...r,samples:[]},{...r,config:undefined},{...r,frames:[{...r.frames[0],windowSeconds:0,completed:0}]}])expect(loadReportSummary(candidate).goal.verdict).toBe('insufficient');
});
it('计划升档或结束帧即使达到目标，也不替代有效采样峰值',()=>{
 const r=report(1600);
 r.frames.push({...r.frames[0],windowSeconds:undefined,completed:undefined,concurrency:2000});
 expect(loadReportSummary(r).goal).toMatchObject({peakConcurrency:1600,verdict:'failed'});
});
it('提前停止后目标达标与完整测试分开判定，仍有补测事项；未达标则同时记录问题',()=>{
 for(const peak of [1600,2000]){
  const r={...report(peak),status:'stopped' as const,elapsedMs:25000,frames:[{...report(peak).frames[0],second:25}]};
  const goal=loadReportSummary(r).goal;
  expect(goal.verdict).toBe(peak===2000?'passed':'failed');expect(goal.executionComplete).toBe(false);
  const s=newTaskStore();receiveDelivery(s);s.reports=[r];s.latestLoadId=r.id;
  const acceptance=buildAcceptance(s);expect(acceptance.sections.find(section=>section.name==='并发测试')?.done).toBe(0);
  expect(acceptance.untested.join()).toContain('需完成设定时长');
 }
});
it('请求契约问题独立于目标通过，不能隐藏在绿色目标结论中',()=>{
 const r=report();r.samples[0].outcome='failed';
 expect(loadReportSummary(r).goal.verdict).toBe('passed');
 const s=newTaskStore();receiveDelivery(s);s.reports=[r];s.latestLoadId=r.id;
 expect(buildAcceptance(s).issues.join()).toContain('与并发目标判定分开记录');
});
it('2000并发30秒完整模型执行确实达到2000；提前停止保留未达标结果',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const config=report().config!;
 const session=startLoadSession(system,config,new AbortController().signal,()=>{});
 await vi.advanceTimersByTimeAsync(30100);const result=await session.completion;
 const goal=loadReportSummary({...report(),...result}).goal;
 expect(goal).toMatchObject({verdict:'passed',targetConcurrency:2000,executionComplete:true});
 expect(goal.peakConcurrency).toBeGreaterThan(2000);expect(goal.peakConcurrency).toBeLessThanOrEqual(2080);
 expect(goal.measurement).toContain('正向随机演示波动');
 expect(goal.loadModel).toEqual(result.loadModel);
 const windows=result.frames.filter(frame=>frame.windowSeconds && frame.level===5);
 for(const frame of windows)expect(frame.concurrency).toBe(modelWindowConcurrency(2000,5,frame.second,result.loadModel!.seed));
 const controller=new AbortController(),stopped=startLoadSession(system,config,controller.signal,()=>{});
 await vi.advanceTimersByTimeAsync(2000);controller.abort();const partial=await stopped.completion;
 expect(loadReportSummary({...report(),...partial}).goal).toMatchObject({verdict:'failed',gap:1800,peakConcurrency:200,executionComplete:false});
});
