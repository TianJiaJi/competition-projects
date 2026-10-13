import {employees} from "./employees";
import {
  clone,
  oaTypeLabels,
  type Command,
  type Database,
  type Employee,
  type OARequest,
  type OAType,
  type Session,
  type Task,
} from "../../src/core/types";
import { createId } from "../../src/core/id";
import {
  fieldText,
  GateError,
  requireRule,
  validDatabase,
} from "../../src/core/validation";
import { BUSINESS_KEY, RUN_ID, seed, SESSION_KEY } from "./seed";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface Dependencies {
  business: StoragePort;
  session: StoragePort;
  now?: () => string;
  id?: () => string;
  demoEnabled?: boolean;
  lock?: <T>(action: () => Promise<T>) => Promise<T>;
}
export function createGateService(deps: Dependencies) {
  let baseline: string | null | undefined;
  const now = deps.now ?? (() => new Date().toISOString());
  const id = deps.id ?? createId;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const work = queue.then(() => (deps.lock ? deps.lock(action) : action()));
    queue = work.catch(() => {});
    return work;
  };
  function readRaw() {
    try {
      return deps.business.getItem(BUSINESS_KEY);
    } catch {
      throw new GateError(
        "MOCK_STORAGE_FAILED",
        "无法读取本地数据，请检查浏览器存储设置。",
      );
    }
  }
  function decode(raw: string): Database {
    try {
      const db: unknown = JSON.parse(raw);
      if (validDatabase(db)) return db;
    } catch {
      /* handled below */
    }
    throw new GateError(
      "MOCK_STORAGE_CORRUPT",
      "本地数据损坏，请从账号菜单恢复本端样例。",
    );
  }
  function save(db: Database) {
    const raw = JSON.stringify(db);
    try {
      deps.business.setItem(BUSINESS_KEY, raw);
    } catch {
      throw new GateError(
        "MOCK_STORAGE_FAILED",
        "本地保存失败，输入内容已保留。",
      );
    }
    baseline = raw;
  }
  function getSession(): Session | null {
    try {
      const raw = deps.session.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      const known = employees.find(
        (e) =>
          e.id === session?.employee?.id && e.name === session.employee.name,
      );
      if (
        !known ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= Date.now()
      )
        return null;
      return { employee: { ...known }, expiresAt: session.expiresAt };
    } catch {
      return null;
    }
  }
  function auth(): Employee {
    const session = getSession();
    requireRule(session, "AUTH_REQUIRED", "登录已失效，请重新登录。");
    return session.employee;
  }
  function readCurrent() {
    const raw = readRaw();
    requireRule(
      baseline !== undefined && raw === baseline,
      "MOCK_STORAGE_CONFLICT",
      "本端数据已在其他页面变化，请重新加载后再操作。",
    );
    requireRule(raw, "MOCK_STORAGE_CONFLICT", "本地数据已被删除，请重新加载。");
    const db = decode(raw);
    requireRule(
      db.runId === RUN_ID,
      "RUN_EXPIRED",
      "当前运行已失效，请恢复本端样例。",
    );
    return db;
  }
  const task = (db: Database, taskId: string) => {
    const t = db.tasks.find((t) => t.id === taskId);
    requireRule(t, "NOT_FOUND", "任务不存在。");
    return t;
  };
  const oa = (db: Database, oaId: string) => {
    const o = db.requests.find((o) => o.id === oaId);
    requireRule(o, "NOT_FOUND", "申请不存在。");
    return o;
  };
  const version = (actual: number, expected: number) =>
    requireRule(
      actual === expected,
      "VERSION_CONFLICT",
      "记录已变化，请重新加载后再操作。",
    );
  const owner = (t: Task, actor: Employee) =>
    requireRule(
      t.assignee?.id === actor.id,
      "FORBIDDEN",
      "只有任务负责人可以执行此操作。",
    );
  async function write(
    action: string,
    target: string,
    payload: unknown,
    command: Command,
    change: (db: Database, actor: Employee) => string,
  ): Promise<Database> {
    return serial(async () => {
      const actor = auth();
      const db = readCurrent();
      requireRule(
        typeof command.key === "string" &&
          command.key.length >= 8 &&
          command.key.length <= 128,
        "VALIDATION_ERROR",
        "提交标识无效。",
      );
      requireRule(
        Number.isSafeInteger(command.expectedVersion) &&
          command.expectedVersion > 0,
        "VALIDATION_ERROR",
        "版本无效。",
      );
      const commandId = JSON.stringify([actor.id, command.key]);
      const fingerprint = JSON.stringify([
        action,
        target,
        payload,
        command.expectedVersion,
      ]);
      const prior = db.commands[commandId];
      if (prior) {
        requireRule(
          prior.fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
          "同一提交标识不能用于不同操作。",
        );
        return clone(db);
      }
      const resultId = change(db, actor);
      db.revision += 1;
      db.commands[commandId] = { fingerprint, resultId };
      // Recheck immediately before the synchronous persistence boundary.
      requireRule(
        readRaw() === baseline,
        "MOCK_STORAGE_CONFLICT",
        "本端数据已变化，请重新加载后再操作。",
      );
      save(db);
      return clone(db);
    });
  }
  return {
    getSession,
    async login(username: string, password: string): Promise<Session> {
      const index = ["chen_demo", "li_demo"].indexOf(username.trim());
      requireRule(
        index >= 0 && password === "GateDemo123!",
        "AUTH_INVALID",
        "账号或密码不正确。",
      );
      const session = {
        employee: { ...employees[index] },
        expiresAt: Date.now() + 12 * 3600000,
      };
      try {
        deps.session.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        throw new GateError(
          "MOCK_STORAGE_FAILED",
          "无法保存登录状态，请检查浏览器存储设置。",
        );
      }
      return session;
    },
    async logout() {
      try {
        deps.session.removeItem(SESSION_KEY);
      } catch {
        throw new GateError(
          "MOCK_STORAGE_FAILED",
          "退出失败，请重试或关闭本标签。",
        );
      }
    },
    async load(): Promise<Database> {
      return serial(async () => {
        auth();
        const raw = readRaw();
        if (raw === null) {
          const db = seed(now());
          save(db);
          return clone(db);
        }
        baseline = raw;
        const db = decode(raw);
        requireRule(
          db.runId === RUN_ID,
          "RUN_EXPIRED",
          "当前运行已失效，请恢复本端样例。",
        );
        return clone(db);
      });
    },
    async reset(): Promise<Database> {
      return serial(async () => {
        auth();
        const raw = readRaw();
        requireRule(
          baseline !== undefined && raw === baseline,
          "MOCK_STORAGE_CONFLICT",
          "本端数据已变化，请先重新加载再恢复样例。",
        );
        const db = seed(now());
        save(db);
        return clone(db);
      });
    },
    start(taskId: string, command: Command) {
      return write("start", taskId, {}, command, (db, actor) => {
        const t = task(db, taskId);
        version(t.version, command.expectedVersion);
        requireRule(
          t.status === "pending",
          "TASK_STATE_CONFLICT",
          "此任务已被领取或已完成。",
        );
        Object.assign(t, {
          status: "processing",
          assignee: { ...actor },
          handlingStartedAt: now(),
          version: t.version + 1,
        });
        t.records.push({
          kind: "started",
          at: t.handlingStartedAt!,
          actor: actor.name,
          text: "开始处理",
        });
        return t.id;
      });
    },
    complete(taskId: string, result: string, command: Command) {
      return write("complete", taskId, { result }, command, (db, actor) => {
        const t = task(db, taskId);
        owner(t, actor);
        version(t.version, command.expectedVersion);
        requireRule(
          t.status === "processing",
          "TASK_STATE_CONFLICT",
          "只有处理中任务可以完成。",
        );
        requireRule(
          !db.requests.some((o) => o.taskId === t.id && o.status === "pending"),
          "OA_PENDING",
          "还有 OA 待审批，请等待审批或撤回申请后再完成。",
        );
        const text = fieldText(result, "result");
        Object.assign(t, {
          status: "resolved",
          completedAt: now(),
          version: t.version + 1,
        });
        t.records.push({
          kind: "completed",
          at: t.completedAt!,
          actor: actor.name,
          text,
        });
        return t.id;
      });
    },
    createOA(
      taskId: string,
      input: { type: OAType; reason: string; needs: string },
      command: Command,
    ) {
      return write("createOA", taskId, input, command, (db, actor) => {
        const t = task(db, taskId);
        owner(t, actor);
        version(t.version, command.expectedVersion);
        requireRule(
          t.status === "processing",
          "TASK_STATE_CONFLICT",
          "只有处理中任务可以申请 OA。",
        );
        requireRule(
          Object.hasOwn(oaTypeLabels, input.type),
          "VALIDATION_ERROR",
          "请选择有效的申请类型。",
        );
        const reason = fieldText(input.reason, "reason"),
          needs = fieldText(input.needs, "needs");
        const at = now();
        const request: OARequest = {
          id: id(),
          runId: db.runId,
          taskId,
          taskTitle: t.title,
          type: input.type,
          reason,
          needs,
          status: "pending",
          applicant: { ...actor },
          createdAt: at,
          updatedAt: at,
          version: 1,
          decision: null,
          records: [
            {
              kind: "submitted",
              at,
              actor: { ...actor },
              text: "提交协同申请",
            },
          ],
        };
        db.requests.push(request);
        t.version++;
        return request.id;
      });
    },
    withdraw(oaId: string, command: Command) {
      return write("withdraw", oaId, {}, command, (db, actor) => {
        const o = oa(db, oaId);
        requireRule(
          o.applicant.id === actor.id,
          "FORBIDDEN",
          "只有申请人可以撤回。",
        );
        version(o.version, command.expectedVersion);
        requireRule(
          o.status === "pending",
          "OA_STATE_CONFLICT",
          "该申请已结束，不能撤回。",
        );
        Object.assign(o, {
          status: "withdrawn",
          updatedAt: now(),
          version: o.version + 1,
        });
        o.records.push({
          kind: "withdrawn",
          at: o.updatedAt,
          actor: { ...actor },
          text: "申请人撤回",
        });
        task(db, o.taskId).version++;
        return o.id;
      });
    },
    /** Local development adapter only. Never a staff approval API. */
    decideDemo(
      oaId: string,
      decision: "approved" | "rejected",
      opinion: string,
      command: Command,
    ) {
      return write(
        "demoDecision",
        oaId,
        { decision, opinion },
        command,
        (db) => {
          requireRule(deps.demoEnabled, "FORBIDDEN", "当前环境不支持审批。");
          requireRule(
            decision === "approved" || decision === "rejected",
            "VALIDATION_ERROR",
            "审批结果无效。",
          );
          const o = oa(db, oaId);
          version(o.version, command.expectedVersion);
          requireRule(
            o.status === "pending",
            "OA_STATE_CONFLICT",
            "该申请已审批或撤回。",
          );
          const text = fieldText(opinion, "opinion");
          const at = now(),
            actor = { id: "admin-demo", name: "值班管理员" };
          Object.assign(o, {
            status: decision,
            updatedAt: at,
            version: o.version + 1,
            decision: { actor, at, opinion: text },
          });
          o.records.push({ kind: decision, at, actor, text });
          task(db, o.taskId).version++;
          return o.id;
        },
      );
    },
  };
}
export type GateService = ReturnType<typeof createGateService>;
