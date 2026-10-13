import { createPlatformClient, ApiError } from '../../../../packages/client/src/platform';
import type { Database, Command, Session, OAType } from '../core/types';
import type { Task, OA, RunInfo, WorkStatus } from '../../../../packages/contracts/src/platform';
import { GateError, fieldText } from '../core/validation';

const api = createPlatformClient('gate');
let session: Session | null = null;

async function call<T>(path: string, method = 'GET', input?: unknown, key?: string): Promise<T> {
  try { return await api.request<T>(path, method, input, key); }
  catch (e) { if (e instanceof ApiError) throw new GateError(e.code, e.message); throw e; }
}

async function load(): Promise<Database> {
  await api.runtime();
  if (!session) {
    const user = await api.restore();
    if (user?.role === 'staff') session = { employee: { id: user.id, name: user.name }, expiresAt: Date.now() + 7 * 86400000 };
  }
  const { run, tasks, oa, names, workStatuses } = await call<{
    run: RunInfo; tasks: Task[]; oa: OA[];
    names: { id: string; name: string }[];
    workStatuses: { taskId: string; status: WorkStatus }[];
  }>('/gate/workspace');
  if (run.id !== api.runId) throw new GateError('RUN_EXPIRED', '运行已切换，请重新加载');
  const personName = (id: string) => names.find(person => person.id === id)?.name || id;
  return {
    schemaVersion: 1, runId: api.runId, revision: run.revision, commands: {},
    tasks: tasks.map(task => ({
      ...task, runId: api.runId,
      assignee: task.assigneeId ? { id: task.assigneeId, name: task.assigneeName || personName(task.assigneeId) } : null,
      handlingStartedAt: task.records.find(record => record.kind === 'started')?.at || null,
      completedAt: task.resolvedAt,
      workOrderStatus: workStatuses.find(work => work.taskId === task.id)?.status,
    })),
    requests: oa.map(item => {
      const records = item.records.some(record => record.decision === 'submitted') ? item.records : [
        { at: item.createdAt, actorId: item.applicantId, actorName: personName(item.applicantId), decision: 'submitted', opinion: '提交申请' },
        ...item.records,
      ];
      const decision = [...records].reverse().find(record => ['approved', 'rejected', 'withdrawn'].includes(record.decision));
      return {
        ...item, runId: api.runId,
        taskTitle: tasks.find(task => task.id === item.taskId)?.title || '',
        applicant: { id: item.applicantId, name: personName(item.applicantId) },
        updatedAt: records.at(-1)?.at || item.createdAt,
        decision: decision ? { actor: { id: decision.actorId, name: decision.actorName }, at: decision.at, opinion: decision.opinion } : null,
        records: records.map(record => ({ kind: record.decision as 'submitted' | 'approved' | 'rejected' | 'withdrawn', at: record.at, actor: { id: record.actorId, name: record.actorName }, text: record.opinion })),
      };
    }),
  };
}
async function write(path: string, command: Command, input = {}) {
  await call(path, 'POST', { ...input, expectedVersion: command.expectedVersion }, command.key);
  return load();
}
async function createOA(id: string, input: { type: OAType; reason: string; needs: string }, command: Command) {
  const result = await call<{ request: OA }>('/oa-requests', 'POST', {
    ...input, reason: fieldText(input.reason, 'reason'), needs: fieldText(input.needs, 'needs'),
    taskId: id, expectedVersion: command.expectedVersion,
  }, command.key);
  return { ...await load(), createdRequestId: result.request.id };
}
export const liveService = {
  api,
  needsPasswordChange: () => Boolean(api.user?.mustChangePassword),
  changePassword: (password: string) => api.changePassword(password),
  getSession: () => session,
  restore: async () => {
    const user = await api.restore();
    if (user?.role === 'staff') session = { employee: { id: user.id, name: user.name }, expiresAt: Date.now() + 7 * 86400000 };
    return session;
  },
  login: async (username: string, password: string) => {
    const result = await api.login(username, password);
    if (result.user.role !== 'staff') { await api.logout(); throw new GateError('FORBIDDEN', '请使用前线员工账号'); }
    session = { employee: { id: result.user.id, name: result.user.name }, expiresAt: Date.now() + 7 * 86400000 };
    return session;
  },
  logout: async () => { try { await api.logout(); } finally { session = null; } },
  load,
  start: (id: string, command: Command) => write(`/tasks/${id}/start`, command),
  complete: (id: string, result: string, command: Command) => write(`/tasks/${id}/complete`, command, { result: fieldText(result, 'result') }),
  createOA,
  withdraw: (id: string, command: Command) => write(`/oa-requests/${id}/withdraw`, command),
  decideDemo: async (..._args: unknown[]) => { throw new GateError('FORBIDDEN', '请在管理员终端审批'); },
};
export const subscribeLive = api.subscribe;
