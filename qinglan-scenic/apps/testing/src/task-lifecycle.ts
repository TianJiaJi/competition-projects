import { evaluateAcceptance, feedbackAcceptance } from './acceptance';
import { appendEvent, archiveCompletedWorkspace, type CampusTaskStore } from './task-store';

export type TaskPhase = 'pending' | 'testing' | 'supplement' | 'summarize' | 'submit' | 'completed';

/** Status is derived from saved evidence; looking at a page never marks a test passed. */
export function taskProgress(store: CampusTaskStore, running = false) {
  if (!store.receivedAt) return null;
  const archivedReport=store.archivedTask?.acceptance || store.acceptance;
  const snapshot = store.completion && archivedReport ? archivedReport : evaluateAcceptance(store);
  const done = snapshot.sections.reduce((sum, section) => sum + section.done, 0);
  const total = snapshot.sections.reduce((sum, section) => sum + section.total, 0);
  const complete = !snapshot.untested.length && snapshot.sections.every(section => section.done === section.total);
  const fresh = !!store.acceptance && store.acceptance.revision === store.revision;
  let phase: TaskPhase = 'pending', label = '待测试', detail = '交付材料已关联，等待测试工程师开始检查。';
  if (store.completion) {
    phase = 'completed'; label = '已完成';
    detail = store.completion.verdict === 'review' ? `报告已提交归档，${store.completion.issueCount} 项问题待交付团队整改。` : '本轮报告已提交归档，计划检查已完成。';
  } else if (running) {
    phase = 'testing'; label = '测试中'; detail = '测试正在运行，结束并汇总最新报告后方可完结任务。';
  } else if (complete) {
    phase = fresh ? 'submit' : 'summarize'; label = fresh ? '待提交' : '待汇总';
    detail = fresh ? '计划测试已完成，请在验收报告中确认提交并完结任务。' : '计划测试已完成，请汇总最新验收报告。';
  } else if (fresh && store.acceptance?.feedback) {
    phase = 'supplement'; label = '待补测'; detail = `阶段反馈已记录，仍有 ${snapshot.untested.length} 项未测范围，任务尚未完结。`;
  } else if (store.apiParsedAt || store.specialGeneratedAt || done || store.acceptance || store.reports.length || Object.keys(store.uiChecks).length || store.timeline.some(entry => entry.title === '打开项目UI')) {
    phase = 'testing'; label = '测试中'; detail = `已记录 ${done} / ${total} 项计划检查，继续完成剩余测试。`;
  }
  return { phase, label, detail, done, total, percent: total ? Math.round(done / total * 100) : 0, issues: snapshot.issues.length, sections: snapshot.sections };
}

export function taskSubmissionBlockers(store: CampusTaskStore, running = false): string[] {
  if (store.completion) return ['本任务已提交归档，请勿重复提交。'];
  if (!store.receivedAt) return ['请先接收上游交付。'];
  const reasons: string[] = [];
  if (running) reasons.push('仍有测试正在运行，请等待结束或停止后重新检查。');
  const report = store.acceptance;
  if (!report) return [...reasons, '请先汇总验收报告。'];
  if (report.revision !== store.revision) reasons.push('测试记录已更新，请重新汇总最新验收报告。');
  if (report.untested.length || report.sections.some(section => section.done !== section.total)) reasons.push(`计划测试尚未完整结束，仍有 ${report.untested.length} 项未测范围；阶段反馈不能完结任务。`);
  return reasons;
}

/** Finish this testing assignment, not a claim that the real project passed production acceptance. */
export function completeTask(store: CampusTaskStore, running = false): boolean {
  if (taskSubmissionBlockers(store, running).length) return false;
  const report = store.acceptance!;
  if (report.verdict === 'partial') return false;
  if (!report.feedback && !feedbackAcceptance(store)) return false;
  store.completion = {
    id: `DONE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    at: new Date().toISOString(), taskId: store.taskId, handoffId: store.handoffId,
    reportId: report.id, revision: report.revision, feedbackId: report.feedback!.id,
    verdict: report.verdict, issueCount: report.issues.length,
  };
  appendEvent(store, '提交任务报告', `${report.id} · 回执 ${report.feedback!.id} · 本地归档`);
  appendEvent(store, '测试任务已完成', `${store.taskId} · ${report.verdict === 'review' ? `${report.issues.length} 项待整改` : '本轮已记录检查通过'} · 记录转为只读`);
  archiveCompletedWorkspace(store);
  return true;
}
