import { beforeAll, describe, expect, it } from 'vitest';
import { buildAcceptance, feedbackAcceptance, acceptanceDocument, acceptanceHtml } from '../../apps/testing/src/acceptance';
import { taskProgress, taskSubmissionBlockers, completeTask } from '../../apps/testing/src/task-lifecycle';
import { historicalTasks } from '../../apps/testing/src/task-history';
import { copy, newTaskStore, receiveDelivery, parseMaterials, generateApiCases, touchTask, validTaskStore, persistTask, loadTask, type CampusTaskStore } from '../../apps/testing/src/task-store';
import { campusProject, deliverySystem, assignments, API_CASE_COUNT } from '../../apps/testing/src/campus-handoff';
import { modelSample } from '../../apps/testing/src/engine';
import { resolveEndpoints } from '../../apps/testing/src/systems';
import { SpecialSession } from '../../apps/testing/src/special-engine';

const planCount = campusProject.pages.reduce((sum,page)=>sum+page.checks.length,0) + API_CASE_COUNT + assignments.length + 1;
let finished: CampusTaskStore;
beforeAll(async () => {
  finished=newTaskStore();receiveDelivery(finished);parseMaterials(finished);generateApiCases(finished);
  for(const page of campusProject.pages)for(const [index] of page.checks.entries())finished.uiChecks[`${page.id}:${index}`]={pageId:page.id,index,result:'passed',note:'已人工检查',source:'manual-observation',savedAt:new Date().toISOString()};
  for(const endpoint of resolveEndpoints(deliverySystem()))finished.apiResults[endpoint.id]=modelSample(endpoint);
  const session=new SpecialSession(()=>{},0,undefined,'campus');
  for(const assignment of assignments)for(const step of [0,1,2])await session.advance(assignment.id,step);
  finished.specialRuns=session.snapshot();finished.specialGeneratedAt=new Date().toISOString();session.dispose();
  finished.reports=[{id:'load-complete',kind:'load',system:deliverySystem(),startedAt:new Date().toISOString(),status:'completed',elapsedMs:10000,samples:[modelSample(resolveEndpoints(deliverySystem())[1])],observations:[],frames:[{second:10,concurrency:5,rps:1,targetRps:1,p50:1,p95:1,p99:1,failed:0,level:5,phase:'completed',windowSeconds:1,completed:1}],events:[],config:{concurrency:5,duration:10,rps:0,endpointId:'delivery-availability'}}];
  finished.latestLoadId='load-complete';
});

describe('任务列表与完结状态', () => {
  it('历史示例独立于真实任务，不创建交付、证据或报告', () => {
    const s=newTaskStore();expect(historicalTasks).toHaveLength(3);expect(taskProgress(s)).toBeNull();
    expect(s.reports).toEqual([]);expect(s.receivedAt).toBeNull();
    receiveDelivery(s);expect(receiveDelivery(s)).toBe(false);
    expect(taskProgress(s)).toMatchObject({phase:'pending',label:'待测试',done:0,total:planCount});
    expect(buildAcceptance(s).sections.every(section=>section.done===0)).toBe(true);
    expect(JSON.stringify(s)).not.toContain(historicalTasks[0].id);
  });
  it('准备材料和保存记录显示测试中，运行状态优先展示', () => {
    const s=newTaskStore();receiveDelivery(s);parseMaterials(s);
    expect(taskProgress(s)?.phase).toBe('testing');
    expect(taskProgress(finished,true)?.phase).toBe('testing');
  });
  it('全部计划完成后依次待汇总、待提交，重测使报告过期', () => {
    const s=copy(finished);expect(taskProgress(s)?.phase).toBe('summarize');
    s.acceptance=buildAcceptance(s);expect(taskProgress(s)).toMatchObject({phase:'submit',percent:100,done:planCount,total:planCount});
    touchTask(s);expect(taskProgress(s)?.phase).toBe('summarize');
    expect(completeTask(s)).toBe(false);
  });
  it('阶段反馈可记录但不能完结任务或创建完成记录', () => {
    const s=newTaskStore();receiveDelivery(s);s.acceptance=buildAcceptance(s);
    expect(feedbackAcceptance(s)).toBe(true);expect(taskProgress(s)?.phase).toBe('supplement');
    expect(completeTask(s)).toBe(false);expect(s.completion).toBeUndefined();
    expect(taskSubmissionBlockers(s).join('')).toContain('未测范围');
  });
  it('缺少报告、仍在运行或报告过期均阻止完结', () => {
    const s=copy(finished);expect(completeTask(s)).toBe(false);
    s.acceptance=buildAcceptance(s);expect(completeTask(s,true)).toBe(false);
    expect(taskSubmissionBlockers(s,true).join('')).toContain('正在运行');
    touchTask(s);expect(taskSubmissionBlockers(s).join('')).toContain('重新汇总');
    expect(s.completion).toBeUndefined();
  });
  it('停止的压力阶段不等于完整执行，不允许据此完结', () => {
    const s=copy(finished);s.reports[0].status='stopped';s.acceptance=buildAcceptance(s);
    expect(completeTask(s)).toBe(false);expect(s.acceptance.untested.join('')).toContain('阶段记录');
  });
  it('人工补充检查未确认时仍需补测', () => {
    const s=copy(finished);s.apiNotes['delivery-health']={note:'',checkpoint:'人工核对',result:'pending'};s.acceptance=buildAcceptance(s);
    expect(completeTask(s)).toBe(false);expect(taskSubmissionBlockers(s).join('')).toContain('未测范围');
  });
  it('如实归档有整改项的完整任务，不把整改结论改为通过', () => {
    const s=copy(finished);s.uiChecks['mobile:0'].result='issue';s.uiChecks['mobile:0'].note='导航对比度需调整';s.acceptance=buildAcceptance(s);
    expect(completeTask(s)).toBe(true);
    expect(s.completion).toMatchObject({taskId:s.taskId,reportId:s.archivedTask!.acceptance!.id,verdict:'review',issueCount:1});
    expect(s.archivedTask!.acceptance!.verdict).toBe('review');expect(s.archivedTask!.acceptance!.feedback?.status).toBe('待整改');
    expect(taskProgress(s)).toMatchObject({phase:'completed',label:'已完成',issues:1});
    expect(validTaskStore(s)).toBe(true);
  });
  it('确认提交后创建关联回执、完成事件，重复提交不会生成第二份记录', () => {
    const s=copy(finished);s.acceptance=buildAcceptance(s);const revision=s.revision;
    expect(completeTask(s)).toBe(true);const completion=copy(s.completion),feedback=copy(s.archivedTask!.acceptance!.feedback),events=s.timeline.length;
    expect(s.revision).toBe(revision);expect(completeTask(s)).toBe(false);
    expect(s.completion).toEqual(completion);expect(s.archivedTask!.acceptance!.feedback).toEqual(feedback);expect(s.timeline).toHaveLength(events);
    expect(s.timeline.at(-1)?.title).toBe('测试任务已完成');
    expect(validTaskStore(s)).toBe(true);
  });
  it('已记录的完整阶段反馈可复用为最终提交回执', () => {
    const s=copy(finished);s.acceptance=buildAcceptance(s);feedbackAcceptance(s);const id=s.acceptance.feedback!.id;
    expect(completeTask(s)).toBe(true);expect(s.completion?.feedbackId).toBe(id);
  });
  it('完成任务可持久化恢复并导出完结元数据，已有无completion记录向后兼容', () => {
    const s=copy(finished);s.acceptance=buildAcceptance(s);completeTask(s);
    let raw='';persistTask({setItem:(_key,value)=>{raw=value;}},s);const restored=loadTask({getItem:()=>raw});
    expect(restored.recovered).toBe(false);expect(restored.store.completion).toEqual(s.completion);
    expect(taskProgress(restored.store)?.phase).toBe('completed');
    const report=s.archivedTask!.acceptance!;
    expect(acceptanceDocument(report,s.completion).taskCompletion?.reportId).toBe(report.id);
    expect(acceptanceHtml(report,s.completion)).toContain(s.completion!.id);
    expect(restored.store.uiChecks).toEqual({});expect(restored.store.apiResults).toEqual({});
    expect(restored.store.archivedTask!.acceptance!.evidence.apiCases).toHaveLength(API_CASE_COUNT);
    const legacy=newTaskStore();expect(validTaskStore(legacy)).toBe(true);expect(loadTask({getItem:()=>JSON.stringify(legacy)}).recovered).toBe(false);
  });
  it('不接受缺少完整报告或引用错误的完成记录', () => {
    const s=copy(finished);s.acceptance=buildAcceptance(s);completeTask(s);
    s.completion!.reportId='another-report';expect(validTaskStore(s)).toBe(false);
    s.completion!.reportId=s.archivedTask!.acceptance!.id;s.archivedTask!.acceptance!.untested=['还未执行'];expect(validTaskStore(s)).toBe(false);
  });
  it('完结只清空工作区，交付元数据、完成任务、时间线和独立报告均保留', () => {
    const s=copy(finished);s.acceptance=buildAcceptance(s);const oldChecks=s.uiChecks,receivedAt=s.receivedAt;
    expect(completeTask(s)).toBe(true);
    expect(s.uiChecks).toEqual({});expect(s.apiCases).toEqual([]);expect(s.apiResults).toEqual({});expect(s.apiNotes).toEqual({});
    expect(s.apiParsedAt).toBeNull();expect(s.apiGeneratedAt).toBeNull();expect(s.specialGeneratedAt).toBeNull();
    expect(s.specialRuns).toBeNull();expect(s.specialNotes).toEqual({});expect(s.reports).toEqual([]);expect(s.uiReports).toEqual([]);
    expect(s.latestLoadId).toBeNull();expect(s.acceptance).toBeNull();
    expect(s.receivedAt).toBe(receivedAt);expect(s.timeline.at(-1)?.title).toBe('测试任务已完成');
    expect(s.archivedTask!.uiChecks['mobile:0'].result).toBe('passed');
    expect(s.archivedTask!.reports).toHaveLength(1);expect(s.archivedTask!.acceptance!.sections.every(section=>section.done===section.total)).toBe(true);
    oldChecks['mobile:0'].note='外部旧引用修改';expect(s.archivedTask!.uiChecks['mobile:0'].note).not.toBe('外部旧引用修改');
    expect(receiveDelivery(s)).toBe(false);expect(parseMaterials(s)).toBe(false);expect(generateApiCases(s)).toBe(false);
    expect(validTaskStore(s)).toBe(true);
  });
  it('旧版已完成任务自动迁移为归档加空白工作区，不丢失验收报告或重复归档', () => {
    const s=copy(finished);s.acceptance=buildAcceptance(s);completeTask(s);
    const oldStore=copy(s.archivedTask!);expect(validTaskStore(oldStore)).toBe(true);
    const migrated=loadTask({getItem:()=>JSON.stringify(oldStore)});
    expect(migrated.recovered).toBe(false);expect(migrated.store.acceptance).toBeNull();expect(migrated.store.apiCases).toEqual([]);
    expect(migrated.store.archivedTask).toEqual(oldStore);expect(migrated.store.completion).toEqual(oldStore.completion);
    expect(migrated.store.timeline).toEqual(oldStore.timeline);expect(validTaskStore(migrated.store)).toBe(true);
    const again=loadTask({getItem:()=>JSON.stringify(migrated.store)});
    expect(again.store).toEqual(migrated.store);expect(again.store.archivedTask).not.toHaveProperty('archivedTask');
  });
});
