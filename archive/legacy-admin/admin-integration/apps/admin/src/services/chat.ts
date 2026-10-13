import { pointById } from "@scenic/scenic";
import { businessNow, formatDateTime } from "../core/time";
import { LIMITS, checkText, collectErrors } from "../core/validate";
import { MUTE_MINUTES } from "../core/validate";
import type { ChatMessage, ChatRoom, MuteRecord, Report } from "../core/types";
import { reportReasonLabels, reportStatusLabels } from "../core/types";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, mutate, requireStaff } from "./store";
import { paginate, type ListQuery, type ListResult } from "./list";

async function settle<T>(value: T, ms = 130): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

const REMOVED_PLACEHOLDER = "该消息已被管理员撤回";

export interface ChatRoomView extends ChatRoom {
  poiName?: string;
  messageCount: number;
}

export async function listChatRooms(): Promise<ApiResult<ChatRoomView[]>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  return settle(
    ok(
      run.chatRooms.map((room) => ({
        ...room,
        poiName: room.poiId ? pointById[room.poiId]?.name : undefined,
        messageCount: run.messages.filter((message) => message.roomId === room.id).length,
      })),
    ),
  );
}

export interface ChatMessageView extends ChatMessage {
  atText: string;
  body: string;
}

export interface ChatMessagePage {
  items: ChatMessageView[];
  hasMore: boolean;
  roomId: string;
  total: number;
}

/** 切换房间加载最近 50 条，按旧到新显示，可向前加载更多（游标，不用页码）。 */
export async function getChatMessages(input: { roomId: string; beforeId?: string; limit?: number }): Promise<ApiResult<ChatMessagePage>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  const room = run.chatRooms.find((item) => item.id === input.roomId);
  if (!room) return settle(fail("NOT_FOUND", "没有找到对应的聊天室。"));
  const limit = input.limit ?? 50;
  const all = run.messages
    .filter((message) => message.roomId === input.roomId)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at - b.at));
  const beforeIndex = input.beforeId ? all.findIndex((message) => message.id === input.beforeId) : -1;
  const upper = beforeIndex >= 0 ? beforeIndex : all.length;
  const start = Math.max(0, upper - limit);
  const slice = all.slice(start, upper);
  return settle(
    ok({
      roomId: input.roomId,
      hasMore: start > 0,
      total: all.length,
      items: slice.map((message) => ({
        ...message,
        atText: formatDateTime(message.at),
        body: message.removed ? REMOVED_PLACEHOLDER : message.body,
      })),
    }),
  );
}

export interface ReportQuery extends ListQuery {
  status?: Report["status"] | "all";
}

export interface ReportView extends Report {
  reasonLabel: string;
  statusLabel: string;
  roomName: string;
  messagePreview: string;
  createdAtText: string;
}

function buildReportView(report: Report, run: ReturnType<typeof getRun>): ReportView {
  const message = run.messages.find((item) => item.id === report.messageId);
  const room = run.chatRooms.find((item) => item.id === report.roomId);
  return {
    ...report,
    reasonLabel: reportReasonLabels[report.reason],
    statusLabel: reportStatusLabels[report.status],
    roomName: room?.name ?? report.roomId,
    messagePreview: message ? (message.removed ? REMOVED_PLACEHOLDER : message.body) : "关联消息缺失",
    createdAtText: formatDateTime(report.createdAt),
  };
}

export async function listReports(query: ReportQuery = {}): Promise<ApiResult<ListResult<ReportView>>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  const items = run.reports
    .filter((report) => !query.status || query.status === "all" || report.status === query.status)
    .map((report) => buildReportView(report, run))
    .sort((a, b) => (b.createdAt === a.createdAt ? a.id.localeCompare(b.id) : b.createdAt - a.createdAt));
  return settle(ok(paginate(items, query)));
}

export interface ReportDetail {
  report: ReportView;
  message?: ChatMessageView;
  roomName: string;
}

export async function getReport(id: string): Promise<ApiResult<ReportDetail>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  const report = run.reports.find((item) => item.id === id);
  if (!report) return settle(fail("NOT_FOUND", "没有找到对应的举报记录。"));
  const message = run.messages.find((item) => item.id === report.messageId);
  const room = run.chatRooms.find((item) => item.id === report.roomId);
  return settle(
    ok({
      report: buildReportView(report, run),
      roomName: room?.name ?? report.roomId,
      message: message
        ? {
            ...message,
            atText: formatDateTime(message.at),
            body: message.removed ? REMOVED_PLACEHOLDER : message.body,
          }
        : undefined,
    }),
  );
}

export interface ResolveReportInput {
  outcome: "resolved" | "dismissed";
  note: string;
  actor?: string;
  actionId?: string;
}

export async function resolveReport(id: string, input: ResolveReportInput): Promise<ApiResult<ReportView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const errors = collectErrors([checkText(input.note, "note", LIMITS.reportNote, "处理说明")]);
  if (errors.length) return settle(fail("VALIDATION_ERROR", "处理举报需要填写处理说明。", { fieldErrors: errors }));
  return settle(
    mutate(
      "resolveReport",
      (draft) => {
        const run = draft.runs[draft.activeRunId];
        const report = run.reports.find((item) => item.id === id);
        if (!report) return fail("NOT_FOUND", "没有找到对应的举报记录。");
        if (report.status !== "pending") {
          return fail("ORDER_STATE_CONFLICT", "该举报已经结案，不能重复处理。");
        }
        report.status = input.outcome;
        report.note = input.note.trim();
        report.handledAt = businessNow();
        report.handledBy = input.actor ?? "演示值班员";
        return ok(buildReportView(report, run));
      },
      input.actionId,
    ),
  );
}

export interface RemoveMessageInput {
  reason: string;
  actor?: string;
}

export async function removeMessage(messageId: string, input: RemoveMessageInput): Promise<ApiResult<ChatMessageView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const errors = collectErrors([checkText(input.reason, "reason", LIMITS.reason, "撤回原因")]);
  if (errors.length) return settle(fail("VALIDATION_ERROR", "撤回消息需要填写原因。", { fieldErrors: errors }));
  return settle(
    mutate("removeMessage", (draft) => {
      const run = draft.runs[draft.activeRunId];
      const message = run.messages.find((item) => item.id === messageId);
      if (!message) return fail("NOT_FOUND", "没有找到对应的消息。");
      if (message.removed) return fail("ORDER_STATE_CONFLICT", "该消息已经撤回。");
      message.removed = true;
      message.removedAt = businessNow();
      message.removedBy = input.actor ?? "演示值班员";
      message.body = "";
      return ok({ ...message, atText: formatDateTime(message.at), body: REMOVED_PLACEHOLDER });
    }),
  );
}

export interface MuteView extends MuteRecord {
  active: boolean;
  untilText: string;
  setAtText: string;
}

function buildMuteView(mute: MuteRecord): MuteView {
  const active = mute.until > Date.now();
  return { ...mute, active, untilText: formatDateTime(mute.until), setAtText: formatDateTime(mute.setAt) };
}

export async function listMutes(): Promise<ApiResult<MuteView[]>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  return settle(ok(run.mutes.map(buildMuteView).sort((a, b) => b.setAt - a.setAt)));
}

export interface MuteInput {
  userId: string;
  minutes: number;
  reason: string;
  actor?: string;
}

export async function muteUser(input: MuteInput): Promise<ApiResult<MuteView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const errors = collectErrors([checkText(input.reason, "reason", LIMITS.reason, "禁言原因")]);
  if (!Number.isInteger(input.minutes) || input.minutes < MUTE_MINUTES.min || input.minutes > MUTE_MINUTES.max) {
    errors.push({ field: "minutes", message: `禁言时长必须是 ${MUTE_MINUTES.min}—${MUTE_MINUTES.max} 的整数分钟` });
  }
  if (errors.length) return settle(fail("VALIDATION_ERROR", "禁言设置校验未通过。", { fieldErrors: errors }));
  return settle(
    mutate("muteUser", (draft) => {
      const run = draft.runs[draft.activeRunId];
      const user = draft.global.users.find((item) => item.id === input.userId);
      if (!user) return fail("NOT_FOUND", "没有找到对应的账号。");
      if (user.identity === "staff") return fail("FORBIDDEN", "员工不能作为禁言对象。");
      const now = Date.now();
      const record: MuteRecord = {
        userId: user.id,
        nickname: user.nickname,
        minutes: input.minutes,
        until: now + input.minutes * 60_000,
        reason: input.reason.trim(),
        setAt: now,
        scope: "all",
      };
      const index = run.mutes.findIndex((mute) => mute.userId === user.id);
      if (index >= 0) run.mutes[index] = record;
      else run.mutes.push(record);
      return ok(buildMuteView(record));
    }),
  );
}

export async function unmuteUser(userId: string): Promise<ApiResult<{ userId: string }>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  return settle(
    mutate("unmuteUser", (draft) => {
      const run = draft.runs[draft.activeRunId];
      const index = run.mutes.findIndex((mute) => mute.userId === userId);
      if (index < 0) return fail("NOT_FOUND", "该账号当前没有禁言记录。");
      run.mutes.splice(index, 1);
      return ok({ userId });
    }),
  );
}

export function muteStatusText(mute: MuteView | undefined): string {
  if (!mute) return "未禁言";
  return mute.active ? `禁言中，至 ${mute.untilText}` : "禁言已到期，显示为已解除";
}
