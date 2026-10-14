import { taskProgress } from './task-lifecycle';
import type { CampusTaskStore } from './task-store';
export const testWorkflow=[
  {id:'ui',label:'UI测试',section:'UI界面'},
  {id:'api',label:'API测试',section:'API契约'},
  {id:'load',label:'并发测试',section:'并发测试'},
  {id:'special',label:'专项测试',section:'专项边界'},
] as const;
export type TestStep=typeof testWorkflow[number]['id'];
export type WorkflowSection={name:string;done:number;total:number};
export function workflowSteps(store:CampusTaskStore,sections?:WorkflowSection[]){
  const progressSections=sections || taskProgress(store)?.sections;
  return testWorkflow.map(step=>{
    const section=progressSections?.find(item=>item.name===step.section);
    return {...step,done:!!section && section.total>0 && section.done===section.total,count:section?.done || 0,total:section?.total || 0};
  });
}
export function nextTestStep(store:CampusTaskStore,current?:TestStep,sections?:WorkflowSection[]):TestStep|'reports'{
  const steps=workflowSteps(store,sections),index=steps.findIndex(step=>step.id===current);
  const remaining=index<0?steps:[...steps.slice(index+1),...steps.slice(0,index+1)];
  return remaining.find(step=>!step.done)?.id || 'reports';
}
