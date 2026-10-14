// Display-only examples. Never inserted into the active store, evidence, reports, or counters.
export interface HistoricalTask {
  id: string;
  name: string;
  version: string;
  owner: string;
  receivedAt: string;
  completedAt: string;
  reportId: string;
  verdict: 'passed' | 'review';
  checks: number;
  issues: number;
  summary: string;
}
export const historicalTasks: ReadonlyArray<HistoricalTask> = [
  { id:'QA-COMM-025', name:'智慧社区 · 便民服务迭代验收', version:'1.2.0', owner:'测试工程师 · 林悦', receivedAt:'2025-11-18T09:20:00+08:00', completedAt:'2025-11-20T16:35:00+08:00', reportId:'AC-DEMO-COMM-025', verdict:'passed', checks:96, issues:0, summary:'覆盖报修申请、物业派单与居民评价；复测记录齐全，本轮测试报告已归档。' },
  { id:'QA-SCENIC-019', name:'景区服务 · 导览预约交付验收', version:'1.1.0', owner:'测试工程师 · 林悦', receivedAt:'2025-11-12T10:10:00+08:00', completedAt:'2025-11-14T15:40:00+08:00', reportId:'AC-DEMO-SCENIC-019', verdict:'review', checks:84, issues:2, summary:'导览、预约与票务链路检查已结束；遗留两项显示与提示问题已列入交付反馈，测试任务已完结，项目仍待整改。' },
  { id:'QA-SERVICE-013', name:'政务服务 · 事项办理回归测试', version:'2.0.1', owner:'测试工程师 · 陈禾', receivedAt:'2025-11-06T08:50:00+08:00', completedAt:'2025-11-08T17:10:00+08:00', reportId:'AC-DEMO-SERVICE-013', verdict:'passed', checks:72, issues:0, summary:'已覆盖事项查询、材料提交和办理进度；历史回归任务及验收摘要已归档。' },
];
