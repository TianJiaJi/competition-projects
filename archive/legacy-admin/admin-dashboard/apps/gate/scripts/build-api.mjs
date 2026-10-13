import { writeFileSync } from "node:fs";
const str = { type: "string", minLength: 1 },
  text = { type: "string", minLength: 1, maxLength: 500 },
  date = { type: "string", format: "date-time" },
  positive = { type: "integer", minimum: 1 };
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const obj = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const nullable = (s) => ({ anyOf: [s, { type: "null" }] });
const arr = (s) => ({ type: "array", items: s });
const enumeration = (...values) => ({ type: "string", enum: values });
const schemas = {
  Employee: obj({ id: str, name: str }),
  TaskStatus: enumeration("pending", "processing", "resolved"),
  Severity: enumeration("critical", "important", "reminder"),
  Category: enumeration(
    "crowd",
    "parking",
    "cable",
    "restroom",
    "equipment",
    "help",
    "cleaning",
    "inspection",
  ),
  OAType: enumeration("reinforcement", "cordon", "supplies", "other"),
  OAStatus: enumeration("pending", "approved", "rejected", "withdrawn"),
  HandlingRecord: obj({
    at: date,
    kind: enumeration("created", "started", "completed"),
    actor: str,
    text: str,
  }),
  Task: obj(
    {
      id: str,
      runId: str,
      version: positive,
      anchorId: str,
      regionId: str,
      category: ref("Category"),
      severity: ref("Severity"),
      status: ref("TaskStatus"),
      title: str,
      location: str,
      reason: str,
      metric: str,
      startedAt: { ...date, description: "事件发生时间，沿用 OpsAlert。" },
      records: arr(ref("HandlingRecord")),
      previousAlertId: str,
      assignee: nullable(ref("Employee")),
      handlingStartedAt: nullable(date),
      completedAt: nullable(date),
    },
    [
      "id",
      "runId",
      "version",
      "anchorId",
      "regionId",
      "category",
      "severity",
      "status",
      "title",
      "location",
      "reason",
      "metric",
      "startedAt",
      "records",
      "assignee",
      "handlingStartedAt",
      "completedAt",
    ],
  ),
  OARecord: obj({
    kind: enumeration("submitted", "approved", "rejected", "withdrawn"),
    at: date,
    actor: ref("Employee"),
    text: str,
  }),
  Decision: obj({ actor: ref("Employee"), at: date, opinion: text }),
  OARequest: obj({
    id: str,
    runId: str,
    taskId: str,
    taskTitle: str,
    type: ref("OAType"),
    reason: text,
    needs: text,
    status: ref("OAStatus"),
    applicant: ref("Employee"),
    createdAt: date,
    updatedAt: date,
    version: positive,
    decision: nullable(ref("Decision")),
    records: arr(ref("OARecord")),
  }),
  Meta: obj({ requestId: str, runId: str }, ["requestId"]),
  Error: obj({
    error: obj(
      {
        code: enumeration(
          "AUTH_REQUIRED",
          "AUTH_INVALID",
          "FORBIDDEN",
          "NOT_FOUND",
          "RUN_EXPIRED",
          "VALIDATION_ERROR",
          "VERSION_CONFLICT",
          "TASK_STATE_CONFLICT",
          "OA_STATE_CONFLICT",
          "OA_PENDING",
          "IDEMPOTENCY_CONFLICT",
          "SERVICE_UNAVAILABLE",
        ),
        message: str,
        fieldErrors: arr(obj({ field: str, message: str })),
        details: { type: "object", additionalProperties: true },
      },
      ["code", "message"],
    ),
    meta: ref("Meta"),
  }),
  LoginInput: obj({
    username: { ...str, maxLength: 100 },
    password: { ...str, maxLength: 200 },
  }),
  Session: obj({
    employee: ref("Employee"),
    expiresAt: date,
    capabilities: arr(
      enumeration("frontline:read", "frontline:handle", "oa:approve"),
    ),
  }),
  VersionInput: obj({ expectedVersion: positive }),
  CompletionInput: obj({ expectedVersion: positive, result: text }),
  CreateOAInput: obj({
    expectedVersion: { ...positive, description: "关联任务版本。" },
    type: ref("OAType"),
    reason: text,
    needs: text,
  }),
  DecisionInput: obj({
    expectedVersion: { ...positive, description: "申请版本。" },
    decision: enumeration("approved", "rejected"),
    opinion: text,
  }),
  Receipt: obj({ request: ref("OARequest"), task: ref("Task") }),
  TaskPage: obj({
    items: arr(ref("Task")),
    total: { type: "integer", minimum: 0 },
    page: positive,
    pageSize: { type: "integer", minimum: 1, maximum: 50 },
  }),
  OAPage: obj({
    items: arr(ref("OARequest")),
    total: { type: "integer", minimum: 0 },
    page: positive,
    pageSize: { type: "integer", minimum: 1, maximum: 50 },
  }),
  Logout: obj({ loggedOut: { const: true, type: "boolean" } }),
};
for (const name of [
  "Task",
  "Session",
  "Receipt",
  "TaskPage",
  "OAPage",
  "OARequest",
  "Logout",
])
  schemas[`${name}Response`] = obj({ data: ref(name), meta: ref("Meta") });
const time = "2026-09-13T14:32:00+08:00";
const employee = { id: "staff-chen", name: "陈越" };
const task = {
  id: "task-1",
  runId: "run_gate_mock_v1",
  version: 2,
  anchorId: "lake",
  regionId: "Z5",
  category: "crowd",
  severity: "critical",
  status: "processing",
  title: "镜湖栈道客流拥堵",
  location: "镜湖栈道 · 临水观景段",
  reason: "观景段游客聚集，双向通行缓慢。",
  metric: "区域承载率 92%",
  startedAt: "2026-09-13T14:26:00+08:00",
  records: [
    {
      kind: "created",
      at: "2026-09-13T14:26:00+08:00",
      actor: "现场监测",
      text: "观景段游客聚集，双向通行缓慢。",
    },
    { kind: "started", at: time, actor: "陈越", text: "开始处理" },
  ],
  assignee: employee,
  handlingStartedAt: time,
  completedAt: null,
};
const oa = {
  id: "oa-001",
  runId: task.runId,
  taskId: task.id,
  taskTitle: task.title,
  type: "reinforcement",
  reason: "现场人手不足",
  needs: "两名安保协助疏导",
  status: "pending",
  applicant: employee,
  createdAt: time,
  updatedAt: time,
  version: 1,
  decision: null,
  records: [
    { kind: "submitted", at: time, actor: employee, text: "提交协同申请" },
  ],
};
const meta = { requestId: "request-001", runId: task.runId };
const wrap = (data) => ({ data, meta });
const endedOA = (status) => ({
  ...oa,
  status,
  version: 2,
  decision:
    status === "withdrawn"
      ? null
      : {
          actor: { id: "admin-001", name: "值班管理员" },
          at: time,
          opinion: "已批准申请，请按安排执行。",
        },
  records: [
    ...oa.records,
    {
      kind: status,
      at: time,
      actor:
        status === "withdrawn"
          ? employee
          : { id: "admin-001", name: "值班管理员" },
      text:
        status === "withdrawn" ? "申请人撤回" : "已批准申请，请按安排执行。",
    },
  ],
});
const run = {
  name: "X-Run-Id",
  in: "header",
  required: true,
  schema: str,
  example: task.runId,
};
const idem = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
  example: "command-0001",
};
const query = (name, schema, description, example) => ({
  name,
  in: "query",
  required: false,
  schema,
  ...(description ? { description } : {}),
  ...(example !== undefined ? { example } : {}),
});
const pathParam = (name) => ({
  name,
  in: "path",
  required: true,
  schema: str,
  example: name === "taskId" ? "task-1" : "oa-001",
});
const pagination = [
  query("page", { ...positive, default: 1 }, "", 1),
  query(
    "pageSize",
    { type: "integer", minimum: 1, maximum: 50, default: 20 },
    "",
    20,
  ),
];
const errors = {
  400: ["VALIDATION_ERROR", "请检查填写内容。"],
  401: ["AUTH_REQUIRED", "请重新登录。"],
  403: ["FORBIDDEN", "无权执行此操作。"],
  404: ["NOT_FOUND", "记录不存在。"],
  409: ["VERSION_CONFLICT", "记录已变化，请重新加载。"],
  410: ["RUN_EXPIRED", "当前运行已失效。"],
  503: ["SERVICE_UNAVAILABLE", "服务暂时不可用。"],
};
const paths = {};
function endpoint(
  path,
  method,
  id,
  summary,
  responseName,
  example,
  {
    body,
    bodyExample,
    parameters = [],
    capability = "frontline:read",
    auth = true,
    status = "200",
    errorStatuses = [401, 403, 404, 410, 503],
  } = {},
) {
  const responses = {
    [status]: {
      description: "成功",
      content: {
        "application/json": {
          schema: ref(`${responseName}Response`),
          example: wrap(example),
        },
      },
    },
  };
  for (const code of errorStatuses) {
    const [errorCode, message] = errors[code];
    responses[code] = {
      description: message,
      content: {
        "application/json": {
          schema: ref("Error"),
          example: { error: { code: errorCode, message }, meta },
        },
      },
    };
  }
  const operation = {
    operationId: id,
    summary,
    "x-required-capability": capability,
    security: auth ? [{ staffSession: [] }] : [],
    parameters,
    responses,
  };
  if (body)
    operation.requestBody = {
      required: true,
      content: {
        "application/json": { schema: ref(body), example: bodyExample },
      },
    };
  paths[path] ??= {};
  paths[path][method] = operation;
}
endpoint(
  "/auth/login",
  "post",
  "frontlineLogin",
  "员工登录",
  "Session",
  {
    employee,
    expiresAt: "2026-09-14T02:32:00+08:00",
    capabilities: ["frontline:read", "frontline:handle"],
  },
  {
    auth: false,
    capability: "none",
    body: "LoginInput",
    bodyExample: { username: "chen_demo", password: "GateDemo123!" },
    errorStatuses: [400, 401, 503],
  },
);
endpoint(
  "/auth/me",
  "get",
  "frontlineGetSession",
  "读取员工会话",
  "Session",
  {
    employee,
    expiresAt: "2026-09-14T02:32:00+08:00",
    capabilities: ["frontline:read", "frontline:handle"],
  },
  { parameters: [], errorStatuses: [401, 503] },
);
endpoint(
  "/auth/logout",
  "post",
  "frontlineLogout",
  "退出员工会话",
  "Logout",
  { loggedOut: true },
  { errorStatuses: [401, 503] },
);
endpoint(
  "/frontline/tasks",
  "get",
  "listFrontlineTasks",
  "查询任务",
  "TaskPage",
  { items: [task], total: 1, page: 1, pageSize: 20 },
  {
    parameters: [
      run,
      query("scope", {
        ...enumeration("current", "mine", "history"),
        default: "current",
      }),
      query("status", ref("TaskStatus")),
      query("category", ref("Category")),
      query("keyword", { type: "string", maxLength: 200 }),
      query(
        "from",
        { type: "string", format: "date" },
        "上海日期，包含当天；history 按完成日期，其余按发生日期。",
      ),
      query(
        "to",
        { type: "string", format: "date" },
        "包含当天，不能早于 from。",
      ),
      ...pagination,
    ],
    errorStatuses: [400, 401, 403, 410, 503],
  },
);
endpoint(
  "/frontline/tasks/{taskId}",
  "get",
  "getFrontlineTask",
  "读取任务详情",
  "Task",
  task,
  { parameters: [run, pathParam("taskId")] },
);
const taskWrite = {
  parameters: [run, idem, pathParam("taskId")],
  capability: "frontline:handle",
  errorStatuses: [400, 401, 403, 404, 409, 410, 503],
};
endpoint(
  "/frontline/tasks/{taskId}/start",
  "post",
  "startFrontlineTask",
  "开始处理并成为负责人",
  "Task",
  task,
  { ...taskWrite, body: "VersionInput", bodyExample: { expectedVersion: 1 } },
);
endpoint(
  "/frontline/tasks/{taskId}/complete",
  "post",
  "completeFrontlineTask",
  "提交结果并结案",
  "Task",
  {
    ...task,
    status: "resolved",
    version: 3,
    completedAt: time,
    records: [
      ...task.records,
      {
        kind: "completed",
        at: time,
        actor: employee.name,
        text: "已完成现场疏导。",
      },
    ],
  },
  {
    ...taskWrite,
    body: "CompletionInput",
    bodyExample: { expectedVersion: 2, result: "已完成现场疏导。" },
  },
);
endpoint(
  "/frontline/tasks/{taskId}/oa-requests",
  "post",
  "createFrontlineOA",
  "创建协同申请",
  "Receipt",
  { request: oa, task: { ...task, version: 3 } },
  {
    ...taskWrite,
    status: "201",
    body: "CreateOAInput",
    bodyExample: {
      expectedVersion: 2,
      type: "reinforcement",
      reason: oa.reason,
      needs: oa.needs,
    },
  },
);
endpoint(
  "/oa-requests",
  "get",
  "listOARequests",
  "查询协同申请",
  "OAPage",
  { items: [oa], total: 1, page: 1, pageSize: 20 },
  {
    parameters: [
      run,
      query("scope", { ...enumeration("all", "mine"), default: "all" }),
      query("status", ref("OAStatus")),
      query("type", ref("OAType")),
      query("taskId", str),
      query("applicantId", str),
      query(
        "keyword",
        { type: "string", maxLength: 200 },
        "匹配关联任务标题、原因和需求。",
      ),
      query(
        "from",
        { type: "string", format: "date" },
        "按申请时间的上海日期，包含当天。",
      ),
      query("to", { type: "string", format: "date" }, "包含当天。"),
      ...pagination,
    ],
    errorStatuses: [400, 401, 403, 410, 503],
  },
);
endpoint(
  "/oa-requests/{oaId}",
  "get",
  "getOARequest",
  "读取协同申请",
  "OARequest",
  oa,
  { parameters: [run, pathParam("oaId")] },
);
endpoint(
  "/oa-requests/{oaId}/withdraw",
  "post",
  "withdrawFrontlineOA",
  "申请人撤回未决申请",
  "Receipt",
  { request: endedOA("withdrawn"), task: { ...task, version: 4 } },
  {
    body: "VersionInput",
    bodyExample: { expectedVersion: 1 },
    parameters: [run, idem, pathParam("oaId")],
    capability: "frontline:handle",
    errorStatuses: [400, 401, 403, 404, 409, 410, 503],
  },
);
endpoint(
  "/admin/oa-requests/{oaId}/decision",
  "post",
  "decideOARequest",
  "管理员批准或驳回申请",
  "Receipt",
  { request: endedOA("approved"), task: { ...task, version: 4 } },
  {
    body: "DecisionInput",
    bodyExample: {
      expectedVersion: 1,
      decision: "approved",
      opinion: "已批准申请，请按安排执行。",
    },
    parameters: [run, idem, pathParam("oaId")],
    capability: "oa:approve",
    errorStatuses: [400, 401, 403, 404, 409, 410, 503],
  },
);
const document = {
  openapi: "3.1.0",
  info: {
    title: "前线处置与 OA 专项接口",
    version: "1.0.0",
    description:
      "设计契约，业务后端尚未实现。本地前端使用独立 Mock。任务字段兼容 OpsAlert，但使用专项路径，不覆盖旧 ops 接口。审批仅管理员可用；本地演示审批不是 HTTP API。",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      staffSession: {
        type: "apiKey",
        in: "cookie",
        name: "scenic_session",
        description:
          "服务端签发的 HttpOnly 会话；对外部署使用 Secure、SameSite=Lax，写操作验证 Origin/CSRF。",
      },
    },
    schemas,
  },
  paths,
};
writeFileSync(
  new URL("../../../docs/openapi/frontline-api-v1.0.json", import.meta.url),
  JSON.stringify(document, null, 2) + "\n",
);
console.log("Generated frontline-api-v1.0.json");
