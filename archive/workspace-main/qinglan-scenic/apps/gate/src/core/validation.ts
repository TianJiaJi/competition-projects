import {
  categoryLabels,
  oaStatusLabels,
  oaTypeLabels,
  severityLabels,
  statusLabels,
  type Database,
} from "./types";
export class GateError extends Error {
  constructor(
    public code: string,
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "GateError";
  }
}
export function requireRule(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new GateError(code, message);
}
export function fieldText(value: string, field: string): string {
  const text = value.trim();
  if (!text || Array.from(text).length > 500)
    throw new GateError("VALIDATION_ERROR", "请检查填写内容。", {
      [field]: "请填写 1—500 字。",
    });
  return text;
}
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(v));
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const member = (v: unknown, labels: object) =>
  str(v) && Object.hasOwn(labels, v);
const employee = (v: unknown) => obj(v) && str(v.id) && str(v.name);
/** Validate persisted nested data before allowing any screen or write to use it. */
export function validDatabase(v: unknown): v is Database {
  if (
    !obj(v) ||
    v.schemaVersion !== 1 ||
    !str(v.runId) ||
    !integer(v.revision) ||
    !Array.isArray(v.tasks) ||
    !Array.isArray(v.requests) ||
    !obj(v.commands)
  )
    return false;
  const taskIds = new Set<string>();
  for (const t of v.tasks) {
    if (
      !obj(t) ||
      ![
        "id",
        "title",
        "anchorId",
        "regionId",
        "location",
        "reason",
        "metric",
      ].every((k) => str(t[k])) ||
      t.runId !== v.runId ||
      !integer(t.version) ||
      !member(t.category, categoryLabels) ||
      !member(t.severity, severityLabels) ||
      !member(t.status, statusLabels) ||
      !date(t.startedAt) ||
      !Array.isArray(t.records)
    )
      return false;
    if (taskIds.has(t.id as string)) return false;
    taskIds.add(t.id as string);
    if (
      !t.records.length ||
      !t.records.every(
        (r) =>
          obj(r) &&
          date(r.at) &&
          ["created", "started", "completed"].includes(String(r.kind)) &&
          str(r.actor) &&
          str(r.text),
      )
    )
      return false;
    if (
      t.status === "pending"
        ? t.assignee !== null ||
          t.handlingStartedAt !== null ||
          t.completedAt !== null
        : !employee(t.assignee) || !date(t.handlingStartedAt)
    )
      return false;
    if (t.status === "processing" && t.completedAt !== null) return false;
    if (t.status === "resolved" && !date(t.completedAt)) return false;
  }
  const oaIds = new Set<string>();
  for (const o of v.requests) {
    if (
      !obj(o) ||
      !["id", "taskId", "taskTitle", "reason", "needs"].every((k) =>
        str(o[k]),
      ) ||
      o.runId !== v.runId ||
      !integer(o.version) ||
      !member(o.type, oaTypeLabels) ||
      !member(o.status, oaStatusLabels) ||
      !date(o.createdAt) ||
      !date(o.updatedAt) ||
      !employee(o.applicant) ||
      !Array.isArray(o.records) ||
      !o.records.length
    )
      return false;
    if (!taskIds.has(o.taskId as string) || oaIds.has(o.id as string))
      return false;
    oaIds.add(o.id as string);
    if (
      !o.records.every(
        (r) =>
          obj(r) &&
          date(r.at) &&
          employee(r.actor) &&
          str(r.text) &&
          ["submitted", "approved", "rejected", "withdrawn"].includes(
            String(r.kind),
          ),
      )
    )
      return false;
    if (
      ["approved", "rejected"].includes(String(o.status))
        ? !obj(o.decision) ||
          !employee(o.decision.actor) ||
          !date(o.decision.at) ||
          !str(o.decision.opinion)
        : o.decision !== null
    )
      return false;
    const task = v.tasks.find((t) => t.id === o.taskId);
    if (task.status === "resolved" && o.status === "pending") return false;
  }
  return Object.values(v.commands).every(
    (c) => obj(c) && str(c.fingerprint) && str(c.resultId),
  );
}
