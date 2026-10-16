import type { LeaveRequest } from './index';
export type LeaveAction = 'submitted' | 'withdrawn' | 'resubmitted' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export interface LeaveEvent { action: LeaveAction; actor: string; at: string; reason?: string }
export const leaveActionLabel: Record<LeaveAction, string> = {
  submitted: '提交申请', withdrawn: '撤回修改', resubmitted: '修改后重新提交',
  approved: '审核通过', rejected: '审核拒绝', cancelled: '取消申请', completed: '返校核销 · 流程完结',
};
/** Old files have no audit trail. Only show facts/timestamps actually stored. */
export function leaveHistory(record: LeaveRequest): LeaveEvent[] {
  if (record.history?.length) return record.history.map(event => ({ ...event }));
  const events: LeaveEvent[] = [{ action: 'submitted', actor: record.owner, at: record.createdAt }];
  if (record.status !== 'pending') events.push({
    action: record.status,
    actor: ['approved', 'rejected'].includes(record.status) ? record.reviewer || '带班教师' : record.owner,
    at: record.updatedAt,
    reason: record.status === 'rejected' ? record.reviewReason : undefined,
  });
  return events;
}
