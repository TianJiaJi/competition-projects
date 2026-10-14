import { apiTestMaterials as apiMaterials, assignments, campusProject } from './campus-handoff';
import { loadReportSummary, sampleCount } from './engine';
import { assessLoadGoal } from './load-goal';
import { copy, uiCheckKey, type CampusTaskStore, type AcceptanceSnapshot, type TaskCompletion } from './task-store';
import type { ScenarioRuns } from './special-engine';
/** Live progress evaluation must not clone evidence, serialize reports or mint report IDs. */
export function evaluateAcceptance(store: CampusTaskStore): Pick<AcceptanceSnapshot,'sections'|'issues'|'untested'|'verdict'> {
  if(!store.receivedAt)throw Error('请先接收项目交付。');
  const issues:string[]=[],untested:string[]=[];
  let uiDone=0,uiIssues=0,uiTotal=0;
  for(const page of campusProject.pages)for(const [index,label] of page.checks.entries()){uiTotal++;const check=store.uiChecks[uiCheckKey(page.id,index)];if(!check || check.result==='pending')untested.push(`UI · ${page.name}：${label}`);else{uiDone++;if(check.result==='issue'){uiIssues++;issues.push(`UI · ${page.name}：${label} — ${check.note}`);}}}
  let apiDone=0,apiIssues=0,apiTotal=apiMaterials.length;
  for(const material of apiMaterials){const id=`delivery-${material.id}`,result=store.apiResults[id];if(!result || result.outcome==='cancelled')untested.push(`API · ${material.name}：${result?.outcome==='cancelled'?'本轮已取消':'尚未执行'}`);else{apiDone++;if(result.outcome==='failed'){apiIssues++;issues.push(`API · ${material.name}：${result.checks.filter(c=>!c.passed).map(c=>c.label).join('；')}`);}}
    const note=store.apiNotes[id];if(note?.checkpoint){apiTotal++;if(note.result==='pending' || !note.result || !result || result.outcome==='cancelled')untested.push(`API人工补充 · ${material.name}：${note.checkpoint}`);else{apiDone++;if(note.result==='issue'){apiIssues++;issues.push(`API人工补充 · ${material.name}：${note.checkpoint}`);}}}
  }
  let specialDone=0,specialIssues=0,specialTotal=assignments.length;
  for(const assignment of assignments){const run=store.specialRuns?.[assignment.id];if(!run || run.step!==3)untested.push(`专项 · ${assignment.title}：未完成核验`);else{specialDone++;if(run.assertions.some(a=>!a.passed)){specialIssues++;issues.push(`专项 · ${assignment.title}：断言未通过`);}}
    const note=store.specialNotes[assignment.id];if(note?.checkpoint){specialTotal++;if(note.result==='pending' || !run || run.step!==3)untested.push(`专项人工补充 · ${assignment.title}：${note.checkpoint}`);else{specialDone++;if(note.result==='issue'){specialIssues++;issues.push(`专项人工补充 · ${assignment.title}：${note.checkpoint}`);}}}
  }
  const load=store.reports.find(r=>r.id===store.latestLoadId && r.kind==='load');
  let loadDone=0,loadIssues=0;
  if(!load || load.kind!=='load')untested.push(store.latestLoadId?'并发测试：原始证据已过期，请重新执行或使用已导出报告':'并发测试：尚未执行');
  else {
    const completed=load.samples.filter(sample=>sample.outcome!=='cancelled');
    const goal=assessLoadGoal(load,sampleCount(completed));
    if(goal.executionComplete && goal.verdict!=='insufficient')loadDone=1;
    else untested.push(goal.verdict==='insufficient'?`并发测试：${goal.reason}`:'并发测试：仅保存已停止或未完整结束的阶段记录，需完成设定时长');
    for(const issue of goal.issues){loadIssues++;issues.push(issue);}
    if(sampleCount(completed.filter(sample=>sample.outcome==='failed'))){loadIssues++;issues.push('并发测试：存在未通过请求契约的模型记录（与并发目标判定分开记录）');}
  }
  return {sections:[{name:'UI界面',done:uiDone,total:uiTotal,issues:uiIssues},{name:'API契约',done:apiDone,total:apiTotal,issues:apiIssues},{name:'并发测试',done:loadDone,total:1,issues:loadIssues},{name:'专项边界',done:specialDone,total:specialTotal,issues:specialIssues}],issues,untested,verdict:issues.length?'review':untested.length?'partial':'passed'};
}
/** Only an explicit report action builds an independent, deep-copied evidence snapshot. */
export function buildAcceptance(store: CampusTaskStore): AcceptanceSnapshot {
  const assessment=evaluateAcceptance(store);
  const load=store.reports.find(r=>r.id===store.latestLoadId && r.kind==='load');
  const summary=load?.kind==='load'?loadReportSummary(load):null;
  const specialRuns=Object.fromEntries(assignments.flatMap(a=>store.specialRuns?.[a.id]?[[a.id,store.specialRuns[a.id]]]:[])) as Partial<ScenarioRuns>;
  return {id:`AC-${crypto.randomUUID()}`,revision:store.revision,at:new Date().toISOString(),...assessment,reportIds:[...store.reports.map(r=>r.id),...(store.uiReports || []).map(r=>r.id)],evidence:copy({uiChecks:store.uiChecks,apiCases:store.apiCases,apiResults:store.apiResults,apiNotes:store.apiNotes,specialRuns,specialNotes:store.specialNotes,load:load?.kind==='load' && summary?{id:load.id,status:load.status,config:load.config,statistics:summary.statistics,goal:summary.goal,frames:load.frames,events:load.events}:null})};
}
export function feedbackAcceptance(store: CampusTaskStore): boolean {const report=store.acceptance;if(!report || report.revision!==store.revision || report.feedback)return false;report.feedback={id:`ACK-${crypto.randomUUID().slice(0,8).toUpperCase()}`,at:new Date().toISOString(),status:report.verdict==='review'?'待整改':report.verdict==='partial'?'待补测':'验收材料已反馈'};return true;}
export function acceptanceDocument(report: AcceptanceSnapshot, completion?: TaskCompletion | null) {return {schemaVersion:1,taskCompletion:completion?copy(completion):undefined,project:copy(campusProject),dataSource:'local-manifest',executionMode:'local-model-and-manual-ui',automatedBusinessRequestCount:0,measurement:'UI记录来自人工观察本地项目；API、专项及并发测试记录由本地契约和场景模型产生；反馈回执为本工作台本地记录，不代表远程团队实际接收。',...copy(report)};}
export const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function acceptanceHtml(report:AcceptanceSnapshot, completion?: TaskCompletion | null) {return `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>智慧校园综合验收报告</title><style>body{font:14px/1.9 system-ui,sans-serif;color:#304562;max-width:1000px;margin:45px auto;padding:25px}h1{font-size:28px}small,p{color:#8192aa}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border-bottom:1px solid #e5eaf2;text-align:left;padding:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fb;padding:20px;border-radius:9px}li{margin-bottom:8px}@media print{body{margin:0}}</style><h1>智慧校园综合验收报告</h1><p>${escapeHtml(report.id)} · ${escapeHtml(report.at)}</p>${completion?`<p>测试任务已完成 · 本地归档回执 ${escapeHtml(completion.id)} · ${escapeHtml(completion.at)}。任务完结不等于真实服务性能验收通过。</p>`:''}<h2>${report.verdict==='review'?'存在需整改项':report.verdict==='partial'?'部分检查待补测':'本轮已记录检查通过'}</h2><table><tr><th>验证范围</th><th>已执行</th><th>需整改</th></tr>${report.sections.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${s.done}/${s.total}</td><td>${s.issues}</td></tr>`).join('')}</table><h2>问题清单</h2><ul>${report.issues.map(i=>`<li>${escapeHtml(i)}</li>`).join('')||'<li>已执行检查未发现需整改项</li>'}</ul><h2>未测范围</h2><ul>${report.untested.map(i=>`<li>${escapeHtml(i)}</li>`).join('')||'<li>本轮检查范围已执行</li>'}</ul><p>证据来源：UI人工观察 / API、专项、并发测试本地模型。自动业务网络请求数0。反馈为本地回执，不代表真实远程团队接收。</p><h2>原始任务快照</h2><pre>${escapeHtml(JSON.stringify(acceptanceDocument(report,completion),null,2))}</pre></html>`;}
