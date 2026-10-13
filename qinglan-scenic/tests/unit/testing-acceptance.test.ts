import { expect, it } from 'vitest';
import { completeUiReport, uiReportDocument } from '../../apps/testing/src/ui-report';
import { buildAcceptance, feedbackAcceptance, acceptanceHtml, acceptanceDocument } from '../../apps/testing/src/acceptance';
import { newTaskStore, receiveDelivery, parseMaterials, generateApiCases, touchTask, persistTask, loadTask, validTaskStore } from '../../apps/testing/src/task-store';
import { campusProject, deliverySystem, assignments } from '../../apps/testing/src/campus-handoff';
import { SpecialSession } from '../../apps/testing/src/special-engine';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { modelSample } from '../../apps/testing/src/engine';
it('未执行不通过，部分检查可以反馈待补测，已修改必须重新汇总', () => {
  const s=newTaskStore();expect(()=>buildAcceptance(s)).toThrow('交付');receiveDelivery(s);s.acceptance=buildAcceptance(s);
  expect(s.acceptance.verdict).toBe('partial');expect(s.acceptance.sections.every(c=>c.done===0)).toBe(true);
  expect(feedbackAcceptance(s)).toBe(true);expect(s.acceptance.feedback?.status).toBe('待补测');expect(feedbackAcceptance(s)).toBe(false);
  s.acceptance=buildAcceptance(s);touchTask(s);expect(feedbackAcceptance(s)).toBe(false);
});
it('问题与未测清单、人工来源、独立快照和HTML转义保持一致', () => {
  const s=newTaskStore();receiveDelivery(s);s.uiChecks['mobile:0']={pageId:'mobile',index:0,result:'issue',note:'<script>alert(1)</script>',source:'manual-observation',savedAt:new Date().toISOString()};
  s.acceptance=buildAcceptance(s);expect(s.acceptance.verdict).toBe('review');expect(s.acceptance.sections[0]).toMatchObject({done:1,total:17,issues:1});
  expect(feedbackAcceptance(s)).toBe(true);expect(s.acceptance.feedback?.status).toBe('待整改');
  s.uiChecks['mobile:0'].note='changed';expect(s.acceptance.evidence.uiChecks['mobile:0'].note).toContain('<script>');
  const html=acceptanceHtml(s.acceptance);expect(html).not.toContain('<script>alert');expect(html).toContain('&lt;script&gt;');
  expect(acceptanceDocument(s.acceptance)).toMatchObject({executionMode:'local-model-and-manual-ui',automatedBusinessRequestCount:0});expect(validTaskStore(s)).toBe(true);
});
it('只有全部范围及人工补充确认完成，报告才通过', async () => {
  const s=newTaskStore();receiveDelivery(s);parseMaterials(s);generateApiCases(s);
  for(const page of campusProject.pages)for(const [index] of page.checks.entries())s.uiChecks[`${page.id}:${index}`]={pageId:page.id,index,result:'passed',note:'人工检查通过',source:'manual-observation',savedAt:new Date().toISOString()};
  for(const endpoint of resolveEndpoints(deliverySystem()))s.apiResults[endpoint.id]=modelSample(endpoint);
  const session=new SpecialSession(()=>{},0,undefined,'campus');for(const a of assignments)for(const step of [0,1,2])await session.advance(a.id,step);s.specialRuns=session.snapshot();s.specialGeneratedAt=new Date().toISOString();session.dispose();
  s.reports=[{id:'load-1',kind:'load',system:deliverySystem(),startedAt:new Date().toISOString(),status:'completed',elapsedMs:10000,samples:[modelSample(resolveEndpoints(deliverySystem())[1])],observations:[],frames:[],events:[],config:{concurrency:5,duration:10,rps:0,endpointId:'delivery-availability'}}];s.latestLoadId='load-1';
  expect(buildAcceptance(s).verdict).toBe('passed');s.apiNotes['delivery-health']={note:'',checkpoint:'人工确认',result:'pending'};expect(buildAcceptance(s).verdict).toBe('partial');s.apiNotes['delivery-health'].result='passed';expect(buildAcceptance(s).verdict).toBe('passed');
});
it('超大历史原始证据整体淘汰，任务与独立报告快照仍可恢复', () => {
  const s=newTaskStore();receiveDelivery(s);s.acceptance=buildAcceptance(s);
  const sample=modelSample(resolveEndpoints(deliverySystem())[0]);sample.preview='x'.repeat(1_600_000);
  s.reports=[{id:'large',kind:'suite',system:deliverySystem(),startedAt:new Date().toISOString(),elapsedMs:1,status:'completed',samples:[sample],observations:[],frames:[],events:[]}];
  let raw='';expect(persistTask({setItem:(_k,v)=>{raw=v;}},s)).toMatchObject({saved:true,evicted:true});const restored=loadTask({getItem:()=>raw});expect(restored.recovered).toBe(false);expect(restored.store.reports).toEqual([]);expect(restored.store.acceptance?.id).toBe(s.acceptance.id);expect(s.reports).toHaveLength(1);
});
it('UI检查全部完成才生成独立报告，整改保留且可恢复',()=>{
 const s=newTaskStore();receiveDelivery(s);expect(completeUiReport(s)).toBeNull();
 for(const page of campusProject.pages)for(const [index] of page.checks.entries())s.uiChecks[`${page.id}:${index}`]={pageId:page.id,index,result:'passed',note:'',source:'manual-observation',savedAt:new Date().toISOString()};
 s.uiChecks['mobile:0'].result='issue';expect(completeUiReport(s)).toBeNull();s.uiChecks['mobile:0'].note='需要整改';
 const report=completeUiReport(s)!;expect(report).toMatchObject({total:17,passed:16,issues:1,source:'manual-observation'});
 s.uiReports=[report];s.uiChecks['mobile:0'].note='修改后的说明';expect(report.checks[0].note).toBe('需要整改');
 expect(uiReportDocument(report).automatedBusinessRequestCount).toBe(0);expect(validTaskStore(s)).toBe(true);
 const restored=loadTask({getItem:()=>JSON.stringify(s)});expect(restored.store.uiReports?.[0].issues).toBe(1);
 expect(buildAcceptance(s).reportIds).toContain(report.id);
});
