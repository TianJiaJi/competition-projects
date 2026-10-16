import { afterEach, expect, it, vi } from 'vitest';
import { deliverySystem } from '../../apps/testing/src/campus-handoff';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { createLoadModel, capacityWindowConcurrency } from '../../apps/testing/src/load-model';
import { loadOperations } from '../../apps/testing/src/load-operations';
import { normalizeConfig, loadReportSummary, reportDocument, startLoadSession, type LoadConfig, type MeasurementReport } from '../../apps/testing/src/engine';
import { loadReportHtml } from '../../apps/testing/src/report-export';
import { loadTask, newTaskStore, receiveDelivery, persistTask } from '../../apps/testing/src/task-store';
const system = deliverySystem();
const config: LoadConfig = { concurrency: 1000, maxConcurrency: 2000, duration: 10, rps: 0, endpointId: 'delivery-availability' };
afterEach(()=>{ vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function execute(input = config): Promise<MeasurementReport> {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const session = startLoadSession(system, input, new AbortController().signal, ()=>{});
  await vi.advanceTimersByTimeAsync(input.duration * 1000 + 100);
  const result = await session.completion;
  return { ...result, status:'completed', system, config:input, id:'capacity-report', kind:'load', startedAt:'2026-10-09T00:00:00Z' };
}
it('功能目录使用交付中的单项业务，不含健康探针和派生边界案例',()=>{
  const operations = loadOperations(system.endpoints);
  expect(operations.find(item=>item.id==='delivery-availability')?.name).toBe('查询教室可用时段');
  expect(operations.find(item=>item.id==='delivery-leave-create')?.name).toBe('提交请假申请');
  expect(operations.some(item=>item.id==='delivery-health' || item.name.includes('未知教师'))).toBe(false);
  expect(operations.every(item=>item.status>=200 && item.status<300)).toBe(true);
  expect(loadOperations([])).toEqual([]);
});
it('预设结果严格为目标+500±100，避开整十；每轮只生成一个种子',()=>{
  const random = vi.spyOn(Math,'random');
  for(const target of [5,1000,2000,10000])for(const value of [0,0.1,0.5,0.999999]){
    random.mockReturnValue(value);
    const model = createLoadModel({...config,concurrency:target,maxConcurrency:target+1000});
    expect(model.kind).toBe('capacity-demo');
    if(model.kind!=='capacity-demo')throw new Error('wrong profile');
    expect(model.capacity).toBeGreaterThanOrEqual(target+400);
    expect(model.capacity).toBeLessThanOrEqual(target+600);
    expect(model.capacity%10).not.toBe(0);
    expect(createLoadModel({...config,concurrency:target,maxConcurrency:target+1000})).toEqual(model);
  }
});
it('安全上限独立归一化，预期目标不随上限改变；低上限不能偷偷突破',()=>{
  const endpoints=resolveEndpoints(system);
  expect(normalizeConfig({...config,maxConcurrency:1001},endpoints)).toMatchObject({concurrency:1000,maxConcurrency:1600});
  expect(normalizeConfig({...config,maxConcurrency:99999},endpoints).maxConcurrency).toBe(20000);
  expect(normalizeConfig({...config,concurrency:10000,maxConcurrency:NaN},endpoints)).toMatchObject({concurrency:10000,maxConcurrency:11000});
  expect(normalizeConfig({...config,maxConcurrency:undefined},endpoints).maxConcurrency).toBeUndefined();
});
it.each([10,30,60,120])('%s秒完整执行超过目标，稳定值、峰值、曲线、导出同源，不发送网络请求',async duration=>{
  const network=vi.fn();vi.stubGlobal('fetch',network);
  const report=await execute({...config,duration});
  const profile=report.loadModel!;
  if(profile.kind!=='capacity-demo')throw new Error('wrong profile');
  const summary=loadReportSummary(report),goal=summary.goal;
  expect(goal).toMatchObject({verdict:'passed',capacityMode:true,executionComplete:true,capacityConcurrency:profile.capacity,peakConcurrency:profile.capacity,safetyConcurrency:2000});
  expect(goal.headroom).toBe(profile.capacity-1000);
  expect(goal.capacityConcurrency).toBeGreaterThanOrEqual(1400);
  expect(goal.capacityConcurrency).toBeLessThanOrEqual(1600);
  expect(summary.operationName).toBe('查询教室可用时段');
  const windows=report.frames.filter(frame=>frame.windowSeconds && frame.completed);
  expect(windows.every(frame=>frame.concurrency<=2000)).toBe(true);
  expect(windows.some(frame=>frame.concurrency>1000)).toBe(true);
  for(const frame of windows.filter(frame=>frame.level===5))expect(frame.concurrency).toBe(capacityWindowConcurrency(profile.capacity,5,frame.second,duration,profile));
  expect(summary.statistics.failed).toBe(0);
  expect(reportDocument(report).loadSummary?.goal).toEqual(goal);
  expect(loadReportHtml(report)).toContain(profile.capacity.toLocaleString('zh-CN'));
  expect(loadReportHtml(report)).toContain('数据来源：本地模型');
  expect(goal.measurement).toContain('上下随机浮动100');
  expect(network).not.toHaveBeenCalled();
});
it('预设结果不能替代稳定证据；失败、超时延、断续窗口不能自动通过',async()=>{
  const report=await execute();
  for(const transform of [
    (frame:typeof report.frames[number])=>({...frame,p95:9999}),
    (frame:typeof report.frames[number])=>({...frame,failed:frame.completed || 0}),
    (frame:typeof report.frames[number])=>({...frame,windowSeconds:0.1}),
  ]){
    const altered={...report,frames:report.frames.map(transform)};
    expect(loadReportSummary(altered).goal).toMatchObject({verdict:'failed',capacityConcurrency:0});
  }
  expect(loadReportSummary({...report,frames:[]}).goal.verdict).toBe('insufficient');
  expect(loadReportSummary({...report,samples:[]}).goal.verdict).toBe('insufficient');
});
it('提前停止保留待补测，不把预设容量变成通过；报告刷新后仍使用原快照',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const controller=new AbortController();
  const session=startLoadSession(system,config,controller.signal,()=>{});
  await vi.advanceTimersByTimeAsync(3000);controller.abort();
  const result=await session.completion;
  const report:MeasurementReport={...result,status:'stopped',system,config:{...config},id:'partial',kind:'load',startedAt:'2026-10-09T00:00:00Z'};
  const goal=loadReportSummary(report).goal;
  expect(goal).toMatchObject({verdict:'insufficient',capacityConcurrency:0,executionComplete:false});
  const store=newTaskStore();receiveDelivery(store);store.reports=[report];store.latestLoadId=report.id;
  let serialized='';persistTask({setItem:(_key,value)=>{serialized=value;}},store);
  const restored=loadTask({getItem:()=>serialized});
  expect(restored.recovered).toBe(false);
  expect(loadReportSummary(restored.store.reports[0] as MeasurementReport).goal).toEqual(goal);
});
