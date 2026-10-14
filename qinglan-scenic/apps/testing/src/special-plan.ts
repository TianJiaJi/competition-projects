import { assignments } from './campus-handoff';
import { campusScenarios, createRuns, newScenario, type ScenarioId } from './special-engine';

/** These are real local scenario templates, not downloaded scripts or remote AI output. */
export const specialTemplates = [
  {scenarioId:'duplicate',id:'guard/idempotent-submit.v1',strategy:'为同一申请生成相同业务键，连续提交后比对申请数量和回执编号。',blocks:['相同业务键请求构造','连续提交与回执归并','单次写入及编号一致性断言']},
  {scenarioId:'stock',id:'guard/unique-slot.v1',strategy:'准备最后一个可用时段，同时放行多名学生的预约，核对占用与剩余量。',blocks:['唯一可用时段准备','多学生并发预约','唯一占用及非负余量断言']},
  {scenarioId:'permission',id:'guard/class-permission.v1',strategy:'准备申请人与班级身份，使用外班教师发起操作，核对拦截和敏感字段。',blocks:['跨账户及班级身份构造','越权操作请求','权限拦截与数据不变断言']},
  {scenarioId:'retry',id:'guard/retry-dedup.v1',strategy:'模拟首次写入后回执暂缓，使用原业务键重试，核对写入次数及返回编号。',blocks:['写入成功但回执暂缓条件','原业务键重试','单次写入与回执复用断言']},
] as const;
export const specialGenerationStages=['分析后端指派需求','检索并匹配脚本模板','拼装条件、请求与断言','校验执行顺序和验收映射','发布可交互测试用例'];
/** Orchestration demo pacing only: slow the generation dialog down by 12% (durations ÷0.88). */
export function specialGenerationDelay(ms:number){return Math.round(ms/0.88);}
export interface CompiledSpecialCase {
  scenarioId: ScenarioId;
  name: string;
  templateId: string;
  endpointId: string;
  parameter: string;
  blocks: string[];
  stages: string[];
  acceptance: string;
  executionMode: 'local-scenario-model';
}
export function compileSpecialPlan(): CompiledSpecialCase[] {
  return assignments.map(assignment=>{
    const template=specialTemplates.find(item=>item.scenarioId===assignment.id);
    const scenario=campusScenarios.find(item=>item.id===assignment.id);
    if(!template || !scenario)throw new Error(`缺少专项模板：${assignment.id}`);
    return {scenarioId:assignment.id,name:assignment.title,templateId:template.id,endpointId:assignment.endpointId,parameter:scenario.defaultValue,blocks:[...template.blocks],stages:[...scenario.actions],acceptance:assignment.standard,executionMode:'local-scenario-model'};
  });
}
export function createCompiledSpecialRuns(plan: CompiledSpecialCase[]) {
  const expected=assignments.map(item=>item.id);
  if(plan.length!==expected.length || new Set(plan.map(item=>item.scenarioId)).size!==expected.length || plan.some(item=>!expected.some(id=>id===item.scenarioId)))throw new Error('专项编排与上游指派不一致');
  const runs=createRuns('campus');
  for(const item of plan)runs[item.scenarioId]=newScenario(item.scenarioId,item.parameter,undefined,'campus');
  return runs;
}
