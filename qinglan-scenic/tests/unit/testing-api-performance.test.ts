import { afterEach, expect, it, vi } from 'vitest';
import { createBufferedAutosave } from '../../apps/testing/src/buffered-autosave';
import { evaluateAcceptance, buildAcceptance } from '../../apps/testing/src/acceptance';
import { taskProgress } from '../../apps/testing/src/task-lifecycle';
import { deliverySystem } from '../../apps/testing/src/campus-handoff';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { modelSample } from '../../apps/testing/src/engine';
import { newTaskStore, receiveDelivery, persistTask } from '../../apps/testing/src/task-store';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('连续更新按200ms保存检查点，而不是每次都序列化；最终保存捕获最新状态',()=>{
 vi.useFakeTimers();let value=0;const seen:number[]=[];
 const autosave=createBufferedAutosave(()=>seen.push(value));
 for(let i=1;i<=10;i++){value=i;autosave.schedule();vi.advanceTimersByTime(20);}
 expect(seen).toEqual([10]);
 value=11;autosave.schedule();autosave.saveNow();expect(seen).toEqual([10,11]);
 vi.advanceTimersByTime(200);expect(seen).toEqual([10,11]);autosave.dispose();
});
it('刷新/离开页面时立即保存待写进度，dispose之后不再启动计时器',()=>{
 vi.useFakeTimers();const save=vi.fn(),autosave=createBufferedAutosave(save);
 autosave.schedule();vi.advanceTimersByTime(50);autosave.saveNow();expect(save).toHaveBeenCalledTimes(1);
 autosave.schedule();autosave.dispose();expect(save).toHaveBeenCalledTimes(2);
 autosave.schedule();autosave.saveNow();vi.runAllTimers();expect(save).toHaveBeenCalledTimes(2);
});
it('进度统计不读取大型响应正文，也不克隆证据或生成报告ID',()=>{
 const store=newTaskStore();receiveDelivery(store);
 const endpoint=resolveEndpoints(deliverySystem())[0],sample=modelSample(endpoint);
 Object.defineProperty(sample,'preview',{get:()=>{throw Error('Live progress must not serialize response bodies');},enumerable:true});
 store.apiResults[endpoint.id]=sample;
 const stringify=vi.spyOn(JSON,'stringify'),uuid=vi.spyOn(crypto,'randomUUID');
 expect(evaluateAcceptance(store).sections.find(section=>section.name==='API契约')?.done).toBe(1);
 expect(taskProgress(store)?.done).toBe(1);expect(stringify).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});
it('轻量统计与正式验收报告的范围、问题与未测判定完全一致',()=>{
 const store=newTaskStore();receiveDelivery(store);
 const endpoint=resolveEndpoints(deliverySystem())[0];store.apiResults[endpoint.id]=modelSample(endpoint);
 const live=evaluateAcceptance(store),snapshot=buildAcceptance(store);
 expect(live).toEqual({sections:snapshot.sections,issues:snapshot.issues,untested:snapshot.untested,verdict:snapshot.verdict});
 store.apiResults[endpoint.id].outcome='failed';expect(snapshot.evidence.apiResults[endpoint.id].outcome).toBe('passed');
});
it('保存时整体淘汰超大报告，不修改内存中的报告及其内容',()=>{
 const store=newTaskStore();receiveDelivery(store);
 const system=deliverySystem(),sample=modelSample(resolveEndpoints(system)[0]);sample.preview='x'.repeat(1_600_000);
 store.reports=[{id:'large-performance-fixture',kind:'suite',system,startedAt:new Date().toISOString(),elapsedMs:1,status:'completed',samples:[sample],observations:[],frames:[],events:[]}];
 const original=store.reports;let raw='';
 expect(persistTask({setItem:(_key,value)=>{raw=value;}},store)).toEqual({saved:true,evicted:true});
 expect(JSON.parse(raw).reports).toHaveLength(0);expect(store.reports).toBe(original);expect(store.reports[0].kind==='suite' && store.reports[0].samples[0].preview.length).toBe(1_600_000);
});
