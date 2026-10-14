import { expect, it } from 'vitest';
import { normalizeConfig } from '../../apps/testing/src/engine';
import { deliverySystem, campusProject, apiTestMaterials } from '../../apps/testing/src/campus-handoff';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { newTaskStore, receiveDelivery, uiCheckKey } from '../../apps/testing/src/task-store';
import { workflowSteps, nextTestStep, testWorkflow } from '../../apps/testing/src/test-workflow';
import { modelSample } from '../../apps/testing/src/engine';
it('并发参数无效时回落到2000并发、30秒，并保留合法的手动配置',()=>{
 const endpoints=resolveEndpoints(deliverySystem());
 expect(normalizeConfig({concurrency:NaN,duration:NaN,rps:0,endpointId:endpoints[0].id},endpoints)).toMatchObject({concurrency:2000,duration:30});
 expect(normalizeConfig({concurrency:100,duration:30,rps:0,endpointId:endpoints[0].id},endpoints)).toMatchObject({concurrency:100,duration:30});
});
it('推荐顺序为UI、API、并发、专项，开始测试与导航不产生测试证据',()=>{
 const store=newTaskStore();receiveDelivery(store);
 expect(testWorkflow.map(step=>step.id)).toEqual(['ui','api','load','special']);
 expect(nextTestStep(store)).toBe('ui');expect(workflowSteps(store).every(step=>!step.done)).toBe(true);
 expect(store.apiResults).toEqual({});expect(store.reports).toEqual([]);
 for(const page of campusProject.pages)for(const [index] of page.checks.entries())store.uiChecks[uiCheckKey(page.id,index)]={pageId:page.id,index,result:'passed',note:'',savedAt:new Date().toISOString(),source:'manual-observation'};
 expect(nextTestStep(store,'ui')).toBe('api');
});
it('API完整执行后引导并发，取消及人工补充待确认不会冒充完成',()=>{
 const store=newTaskStore();receiveDelivery(store);
 for(const endpoint of resolveEndpoints(deliverySystem()))store.apiResults[endpoint.id]=modelSample(endpoint);
 expect(workflowSteps(store).find(step=>step.id==='api')?.done).toBe(true);
 expect(nextTestStep(store,'api')).toBe('load');
 const id=`delivery-${apiTestMaterials[0].id}`;
 store.apiNotes[id]={note:'',checkpoint:'人工核对',result:'pending'};
 expect(workflowSteps(store).find(step=>step.id==='api')?.done).toBe(false);
 store.apiNotes[id].result='passed';store.apiResults[id].outcome='cancelled';
 expect(workflowSteps(store).find(step=>step.id==='api')?.done).toBe(false);
});
