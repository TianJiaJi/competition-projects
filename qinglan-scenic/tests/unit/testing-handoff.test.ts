import { expect, it, vi } from 'vitest';
import { apiDisplayTiming } from '../../apps/testing/src/api-display-timing';
it('API在加速后减速8%的预算包含三次模拟停顿',()=>{
 const timing=apiDisplayTiming(110);
 expect(timing).toHaveLength(110);
 expect(timing.reduce((sum,t)=>sum+t.delayMs,0)).toBe(Math.round(110*25/1.2/0.92));
 expect(timing.filter(t=>t.stalled)).toHaveLength(3);
 expect(timing.filter(t=>t.stalled).every(t=>t.delayMs>=240)).toBe(true);
 expect(apiDisplayTiming(1)).toEqual([{delayMs:23,stalled:false}]);
 expect(apiDisplayTiming(0)).toEqual([]);
});
import { startFreshTask } from '../../apps/testing/src/runtime-task';
import { receiveDelivery, newTaskStore, parseMaterials, generateApiCases, loadTask, persistTask, TASK_STORAGE_KEY, validTaskStore } from '../../apps/testing/src/task-store';
import { apiMaterials, apiTestMaterials, deliverySystem } from '../../apps/testing/src/campus-handoff';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { modelSample } from '../../apps/testing/src/engine';
it('初始化不接收、不生成、不伪造通过记录', () => {
  const store = newTaskStore(); expect(validTaskStore(store)).toBe(true);
  expect(store.receivedAt).toBeNull(); expect(store.apiCases).toEqual([]); expect(store.apiResults).toEqual({}); expect(store.reports).toEqual([]);
  expect(parseMaterials(store)).toBe(false); expect(generateApiCases(store)).toBe(false);
});
it('手动接收去重，解析与生成不会自动执行', () => {
  const s = newTaskStore(); expect(receiveDelivery(s)).toBe(true); expect(receiveDelivery(s)).toBe(false);
  expect(s.timeline).toHaveLength(2); expect(s.taskId).toBe('QA-CAMPUS-001');
  expect(generateApiCases(s)).toBe(false); expect(parseMaterials(s)).toBe(true); expect(s.apiCases).toEqual([]);
  expect(generateApiCases(s)).toBe(true); expect(generateApiCases(s)).toBe(false);
  expect(s.apiCases).toHaveLength(apiTestMaterials.length); expect(s.apiResults).toEqual({}); expect(validTaskStore(s)).toBe(true);
});
it('校园交付契约携带正确方法与本地固定响应，修改预期状态会失败', () => {
  const system = deliverySystem(); const endpoints = resolveEndpoints(system);
  expect(apiMaterials).toHaveLength(12);expect(endpoints).toHaveLength(110); expect(endpoints.find(e => e.id === 'delivery-booking-create')!.method).toBe('POST');
  expect(endpoints.every(e => modelSample(e).outcome === 'passed')).toBe(true);
  system.endpoints[3].status = 200;
  const sample = modelSample(resolveEndpoints(system)[3]); expect(sample.status).toBe(201); expect(sample.outcome).toBe('failed');
  system.endpoints[3].status=201; system.endpoints[3].budget=1; expect(modelSample(resolveEndpoints(system)[3]).outcome).toBe('failed');
});
it('旧存储工具兼容性：校验损坏内容与写入失败（运行界面不再使用）', () => {
  const values = new Map<string, string>(); const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  const s = newTaskStore(); receiveDelivery(s); parseMaterials(s); generateApiCases(s);
  expect(persistTask(storage, s).saved).toBe(true); expect(loadTask(storage).store.apiCases).toHaveLength(110);
  values.set(TASK_STORAGE_KEY, '{oops'); expect(loadTask(storage).recovered).toBe(true); expect(loadTask(storage).store.receivedAt).toBeNull();
  expect(persistTask({ setItem: () => { throw Error('quota'); } }, s).saved).toBe(false);
});
it('运行界面启动清理旧任务，不读取旧记录或写入新记录',()=>{
  const storage={removeItem:vi.fn(),getItem:vi.fn(),setItem:vi.fn()};
  expect(startFreshTask(()=>storage)).toEqual(newTaskStore());
  expect(storage.removeItem).toHaveBeenCalledTimes(1);expect(storage.removeItem).toHaveBeenCalledWith(TASK_STORAGE_KEY);
  expect(storage.getItem).not.toHaveBeenCalled();expect(storage.setItem).not.toHaveBeenCalled();
});
it('每次启动均是独立空任务，不保留上一轮解析用例和时间线',()=>{
  const storage={removeItem:vi.fn()};const first=startFreshTask(()=>storage);
  receiveDelivery(first);parseMaterials(first);generateApiCases(first);
  const second=startFreshTask(()=>storage);expect(second).toEqual(newTaskStore());
  expect(first.apiCases).toHaveLength(110);expect(second.apiCases).toEqual([]);
});
it('浏览器禁用存储访问时仍正常开始空白会话',()=>{
  expect(startFreshTask(()=>{throw Error('SecurityError');})).toEqual(newTaskStore());
});
it('旧记录清理受限时也不恢复历史数据、不阻塞启动',()=>{
  expect(startFreshTask(()=>({removeItem:()=>{throw Error('denied');}}))).toEqual(newTaskStore());
});
it('110项用例保持唯一编号、方法路径来源和固定失败响应',()=>{
 expect(apiTestMaterials).toHaveLength(110);expect(new Set(apiTestMaterials.map(m=>m.id)).size).toBe(110);
 for(const m of apiTestMaterials.filter(m=>m.sourceMaterialId)){
  const source=apiMaterials.find(base=>base.id===m.sourceMaterialId)!;
  expect(m.path).toBe(source.path);expect(m.method).toBe(source.method);
 }
 const c=deliverySystem();const invalid=c.endpoints.find(e=>e.id==='delivery-booking-create-case-1')!;
 const sample=modelSample(resolveEndpoints(c).find(e=>e.id===invalid.id)!);expect(sample.status).toBe(400);expect(sample.outcome).toBe('passed');
 invalid.status=201;expect(modelSample(resolveEndpoints(c).find(e=>e.id===invalid.id)!).outcome).toBe('failed');
});
it('旧12项任务扩容保留已有结果和备注，新增用例不伪造通过',()=>{
 const s=newTaskStore();receiveDelivery(s);parseMaterials(s);generateApiCases(s);s.apiCases=s.apiCases.slice(0,12);
 s.apiResults['delivery-health']=modelSample(resolveEndpoints(deliverySystem())[0]);s.apiNotes['delivery-health']={note:'旧备注',checkpoint:''};
 const restored=loadTask({getItem:()=>JSON.stringify(s)});expect(restored.recovered).toBe(false);expect(restored.store.apiCases).toHaveLength(110);
 expect(Object.keys(restored.store.apiResults)).toEqual(['delivery-health']);expect(restored.store.apiNotes['delivery-health'].note).toBe('旧备注');
});
