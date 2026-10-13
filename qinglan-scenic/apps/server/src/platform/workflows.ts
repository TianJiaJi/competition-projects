import { randomUUID } from "node:crypto";
import { assert, textField, type Store } from "./store.ts";
import { people } from "./people.ts";
import { scenic } from "./simulation.ts";
import type {
  Account,
  Task,
  WorkOrder,
  FacilityRequest,
  WorkflowRecord,
} from "../../../../packages/contracts/src/platform.ts";
export async function notifyStaff(
  store: Store,
  runId: string,
  title: string,
  body: string,
  options: {
    regionId?: string;
    userId?: string;
    admins?: boolean;
    urgent?: boolean;
    eventId?: string;
  } = {},
) {
  for (const p of await people(store))
    if (
      !p.disabled &&
      !p.archived &&
      ((options.admins && p.role === "admin") ||
        (p.role === "staff" &&
          (options.userId
            ? p.id === options.userId
            : !options.regionId ||
              p.regionIds.includes(options.regionId) ||
              (p.regionIds.length === 0 && options.regionId !== "__admins__"))))
    ) {
      const id = randomUUID();
      await store.put(
        "notifications",
        id,
        {
          id,
          userId: p.id,
          title,
          body,
          urgent: !!options.urgent,
          createdAt: new Date().toISOString(),
          read: false,
        },
        runId,
      );
    }
  if (options.urgent) {
    const id = options.eventId
      ? "work-emergency-" + options.eventId
      : randomUUID();
    await store.put(
      "notices",
      id,
      {
        id,
        title,
        body,
        audience: "internal",
        screenVisible: true,
        eventId: options.eventId,
        screenTitle: "紧急现场处置提醒",
        screenBody: "现场任务需要优先处理，请负责人在员工端查看详情。",
        active: true,
        suppressed: false,
        createdAt: new Date().toISOString(),
      },
      runId,
    );
  }
}
export async function migrateWorkflows(store: Store, runId: string) {
  for (const task of await store.list<Task>("tasks", runId)) {
    if (!(await store.get("alerts", task.id, runId)))
      await store.put(
        "alerts",
        task.id,
        { ...task, source: "automatic", archived: false, history: [] },
        runId,
      );
    if (!(await store.get("work-orders", "legacy-" + task.id, runId)))
      await store.put(
        "work-orders",
        "legacy-" + task.id,
        {
          id: "legacy-" + task.id,
          alertId: task.id,
          legacyTaskId: task.id,
          facilityId: task.anchorId,
          regionId: task.regionId,
          title: task.title,
          description: task.reason,
          status:
            task.status === "resolved"
              ? "completed"
              : task.status === "processing"
                ? "in_progress"
                : "created",
          priority: task.severity === "critical" ? "urgent" : "normal",
          assigneeId: task.assigneeId,
          version: 1,
          createdAt: task.startedAt,
          records: task.records.map((v) => ({
            at: v.at,
            actorId: "legacy",
            actorName: v.actor,
            action: v.kind,
            reason: v.text,
            photoIds: [],
          })),
        },
        runId,
      );
  }
}
export async function syncLegacy(store: Store, runId: string, w: WorkOrder) {
  if (!w.legacyTaskId) return;
  const t = await store.get<Task>("tasks", w.legacyTaskId, runId);
  if (!t) return;
  const employee = (await people(store)).find((p) => p.id === w.assigneeId);
  const record = w.records.at(-1)!;
  const submission = [...w.records].reverse().find(item => item.action === "submit");
  const legacyRecord = w.status === "completed" && !t.records.some(item => item.kind === "completed")
    ? { at: (submission || record).at, actor: (submission || record).actorName, kind: "completed" as const, text: (submission || record).reason }
    : w.status === "in_progress" && !t.records.some(item => item.kind === "started")
      ? { at: record.at, actor: record.actorName, kind: "started" as const, text: record.reason }
      : null;
  await store.put(
    "tasks",
    t.id,
    {
      ...t,
      version: t.version + 1,
      assigneeId: w.assigneeId,
      assigneeName: employee?.name || null,
      status:
        w.status === "completed"
          ? "resolved"
          : w.status === "created" || w.status === "dispatched" || w.status === "accepted"
            ? "pending"
            : "processing",
      resolvedAt: w.status === "completed" ? record.at : null,
      records: legacyRecord ? [...t.records, legacyRecord] : t.records,
    },
    runId,
  );
}
export async function workflowWrite(
  store: Store,
  user: Account,
  runId: string,
  time: string,
  path: string,
  input: any,
  changeFacility: (id: string, reason: string) => Promise<unknown>,
) {
  if (
    !/^\/(?:admin\/alerts|work-orders|facility-requests|notifications)(?:\/|$)/.test(
      path,
    )
  )
    return undefined;
  const parts = path.split("/").filter(Boolean);
  const record: WorkflowRecord = {
    at: time,
    actorId: user.id,
    actorName: user.name,
    action: parts.at(-1) || "create",
    reason: typeof input.reason === "string" ? input.reason.trim() : "",
    photoIds: [],
  };
  if (parts[0] === "notifications") {
    const n = await store.get<any>("notifications", parts[1], runId);
    assert(n && n.userId === user.id, "NOT_FOUND", "通知不存在", 404);
    await store.put("notifications", parts[1], { ...n, read: true }, runId);
    return { ok: true };
  }
  assert(
    ["staff", "admin"].includes(user.role),
    "FORBIDDEN",
    "需要员工或管理员权限",
    403,
  );
  const admin = () =>
    assert(user.role === "admin", "FORBIDDEN", "需要管理员权限", 403);
  if (parts[0] === "admin") {
    admin();
    const id = parts[2] || randomUUID(),
      old = await store.get<any>("alerts", id, runId);
    if (parts[2]) {
      assert(old, "NOT_FOUND", "告警不存在", 404);
      assert(
        old.version === input.expectedVersion,
        "VERSION_CONFLICT",
        "告警已变化",
      );
    }
    const reason = textField(input.reason);
    const alert = old
      ? { ...old }
      : {
          id,
          source: "manual",
          startedAt: time,
          status: "pending",
          history: [],
        };
    if (input.action === "archive") alert.archived = true;
    else {
      assert(
        ["reminder", "important", "critical"].includes(input.severity),
        "VALIDATION_ERROR",
        "告警等级无效",
        400,
      );
      Object.assign(alert, {
        title: textField(input.title, 120),
        reason,
        severity: input.severity,
        anchorId: textField(input.facilityId, 64),
      });
      const p = scenic.points.find((p) => p.id === alert.anchorId);
      assert(p, "VALIDATION_ERROR", "设施不存在", 400);
      alert.regionId = p.regionId;
      alert.location = p.name;
    }
    alert.history = [
      ...(old?.history || []),
      {
        ...record,
        reason,
        before: old
          ? {
              title: old.title,
              reason: old.reason,
              severity: old.severity,
              archived: old.archived,
            }
          : null,
      },
    ];
    alert.version = (old?.version || 0) + 1;
    await store.put("alerts", id, alert, runId);
    if (alert.severity === "critical" && !alert.archived)
      await notifyStaff(store, runId, alert.title, reason, {
        regionId: alert.regionId,
        admins: true,
        urgent: true,
      });
    return alert;
  }
  const photos = async () => {
    assert(
      input.photoIds === undefined ||
        (Array.isArray(input.photoIds) && input.photoIds.length <= 6),
      "VALIDATION_ERROR",
      "最多上传6张照片",
      400,
    );
    for (const id of input.photoIds || []) {
      const photo = await store.get<any>("attachments", String(id), runId);
      assert(
        photo && (photo.userId === user.id || user.role === "admin"),
        "FORBIDDEN",
        "照片不存在或无权使用",
        403,
      );
      record.photoIds.push(String(id));
    }
  };
  if (parts[0] === "facility-requests") {
    if (!parts[1]) {
      await photos();
      assert(
        ["repair", "closure"].includes(input.kind),
        "VALIDATION_ERROR",
        "申请类型无效",
        400,
      );
      const p = scenic.points.find((p) => p.id === input.facilityId);
      assert(p, "NOT_FOUND", "设施不存在", 404);
      const request: FacilityRequest = {
        id: randomUUID(),
        facilityId: p.id,
        regionId: p.regionId,
        kind: input.kind,
        reason: textField(input.reason),
        photoIds: record.photoIds,
        applicantId: user.id,
        status: "pending",
        version: 1,
        createdAt: time,
        createdAtWall: new Date().toISOString(),
        records: [record],
      };
      await store.put("facility-requests", request.id, request, runId);
      await notifyStaff(
        store,
        runId,
        input.kind === "closure" ? "设施关闭申请" : "现场报修",
        `${p.name}：${request.reason}`,
        { admins: true, userId: "", regionId: "__admins__" },
      );
      return request;
    }
    admin();
    const request = await store.get<FacilityRequest>(
      "facility-requests",
      parts[1],
      runId,
    );
    assert(request, "NOT_FOUND", "申请不存在", 404);
    assert(
      request.version === input.expectedVersion && request.status === "pending",
      "VERSION_CONFLICT",
      "申请已处理",
    );
    assert(
      ["approve", "reject"].includes(parts[2]),
      "VALIDATION_ERROR",
      "审批动作无效",
      400,
    );
    record.reason = textField(input.reason);
    if (parts[2] === "approve") {
      if (request.kind === "closure")
        await changeFacility(
          request.facilityId,
          request.reason + "；审批说明：" + record.reason,
        );
      if (input.createWorkOrder) {
        const w = (await workflowWrite(
          store,
          user,
          runId,
          time,
          "/work-orders",
          {
            facilityId: request.facilityId,
            title:
              "现场报修：" +
              (scenic.points.find((p) => p.id === request.facilityId)?.name ||
                request.facilityId),
            description: request.reason,
            priority: "normal",
          },
          changeFacility,
        )) as WorkOrder;
        w.records[0].photoIds = [...request.photoIds];
        await store.put("work-orders", w.id, w, runId);
        request.workOrderId = w.id;
      }
    }
    request.status = parts[2] === "approve" ? "approved" : "rejected";
    request.version++;
    request.records.push(record);
    await store.put("facility-requests", request.id, request, runId);
    await notifyStaff(store, runId, "设施申请已处理", record.reason, {
      userId: request.applicantId,
    });
    return request;
  }
  if (!parts[1]) {
    admin();
    const p = scenic.points.find((p) => p.id === input.facilityId);
    assert(p, "NOT_FOUND", "设施不存在", 404);
    record.action = "created";
    record.reason = textField(input.description);
    if (input.alertId)
      assert(
        await store.get("alerts", String(input.alertId), runId),
        "NOT_FOUND",
        "告警不存在",
        404,
      );
    const w: WorkOrder = {
      id: randomUUID(),
      alertId: input.alertId || undefined,
      facilityId: p.id,
      regionId: p.regionId,
      title: textField(input.title, 120),
      description: textField(input.description),
      priority: input.priority === "urgent" ? "urgent" : "normal",
      status: "created",
      assigneeId: null,
      version: 1,
      createdAt: time,
      createdAtWall: new Date().toISOString(),
      records: [record],
    };
    await store.put("work-orders", w.id, w, runId);
    return w;
  }
  const w = await store.get<WorkOrder>("work-orders", parts[1], runId);
  assert(w, "NOT_FOUND", "工单不存在", 404);
  assert(
    w.version === input.expectedVersion,
    "VERSION_CONFLICT",
    "工单已变化，请刷新",
  );
  const action = parts[2];
  record.reason = input.reason ? textField(input.reason) : action;
  record.action = action;
  const assigned = () =>
    assert(
      user.role === "staff" && w.assigneeId === user.id,
      "FORBIDDEN",
      "仅指派员工可操作",
      403,
    );
  const state = (...states: string[]) =>
    assert(
      states.includes(w.status),
      "WORK_STATE_CONFLICT",
      "当前状态不支持此操作",
    );
  await photos();
  if (action === "claim") {
    assert(user.role === "staff" && w.legacyTaskId && !w.assigneeId, "FORBIDDEN", "仅未指派的现场任务可领取", 403);
    state("created");
    w.assigneeId = user.id;
    w.status = "in_progress";
    record.reason = "员工领取并开始处理";
  } else if (action === "dispatch" || action === "reassign") {
    admin();
    state("created", "dispatched", "accepted", "in_progress", "suspended");
    const p = (await people(store)).find(
      (p) =>
        p.id === input.assigneeId &&
        p.role === "staff" &&
        !p.disabled &&
        !p.archived,
    );
    assert(p, "VALIDATION_ERROR", "请选择有效员工", 400);
    assert(
      p.regionIds.length === 0 || p.regionIds.includes(w.regionId),
      "VALIDATION_ERROR",
      "该员工未绑定负责区域",
      400,
    );
    w.assigneeId = p.id;
    w.status = "dispatched";
    await notifyStaff(store, runId, "收到新工单", w.title, {
      userId: p.id,
      urgent: w.priority === "urgent",
      eventId: w.id,
    });
  } else if (action === "accept") {
    assigned();
    state("dispatched");
    w.status = "accepted";
  } else if (action === "start") {
    assigned();
    state("accepted");
    w.status = "in_progress";
  } else if (action === "submit") {
    assigned();
    state("in_progress");
    assert(
      !w.legacyTaskId ||
        !(await store.list<any>("oa", runId)).some(
          (o) => o.taskId === w.legacyTaskId && o.status === "pending",
        ),
      "OA_PENDING",
      "仍有待审批申请",
    );
    record.reason = textField(input.reason);
    w.status = "awaiting_acceptance";
    await notifyStaff(store, runId, "工单待验收", w.title, {
      admins: true,
      regionId: "__admins__",
    });
  } else if (action === "block") {
    assigned();
    state("accepted", "in_progress");
    record.reason = textField(input.reason);
    w.status = "suspended";
    await notifyStaff(
      store,
      runId,
      "工单受阻",
      `${w.title}：${record.reason}`,
      { admins: true, regionId: w.regionId, urgent: true, eventId: w.id },
    );
  } else if (action === "resources") {
    admin();
    state("suspended");
    record.reason = textField(input.reason);
    await notifyStaff(store, runId, "工单资源已补充", record.reason, {
      userId: w.assigneeId || "",
    });
  } else if (action === "resume") {
    admin();
    state("suspended");
    record.reason = textField(input.reason);
    w.status = "in_progress";
    await notifyStaff(store, runId, "工单恢复处理", record.reason, {
      userId: w.assigneeId || "",
    });
  } else if (action === "escalate") {
    admin();
    assert(w.status !== "completed", "WORK_STATE_CONFLICT", "工单已完成");
    record.reason = textField(input.reason);
    w.priority = "urgent";
    await notifyStaff(
      store,
      runId,
      "紧急工单",
      `${w.title}：${record.reason}`,
      { regionId: w.regionId, admins: true, urgent: true, eventId: w.id },
    );
  } else if (action === "approve" || action === "reject") {
    admin();
    state("awaiting_acceptance");
    record.reason = textField(input.reason);
    w.status = action === "approve" ? "completed" : "in_progress";
    await notifyStaff(
      store,
      runId,
      action === "approve" ? "工单验收通过" : "工单退回返工",
      record.reason,
      { userId: w.assigneeId || "" },
    );
  } else assert(false, "NOT_FOUND", "未知工单动作", 404);
  if (action === "approve" && w.legacyTaskId) {
    for (const plan of await store.list<any>("inspections")) {
      const schedule = await store.get<any>(
        "inspection-schedule",
        plan.id,
        runId,
      );
      if (schedule?.alertId === w.legacyTaskId) {
        const due = new Date(
          Date.parse(time) + plan.intervalDays * 86400000 + 8 * 3600000,
        )
          .toISOString()
          .slice(0, 10);
        await store.put(
          "inspection-schedule",
          plan.id,
          { dueDate: due },
          runId,
        );
      }
    }
  }
  if (action === "approve") {
    const notice = await store.get<any>(
      "notices",
      "work-emergency-" + w.id,
      runId,
    );
    if (notice)
      await store.put(
        "notices",
        notice.id,
        { ...notice, active: false },
        runId,
      );
  }
  w.version++;
  w.records.push(record);
  await store.put("work-orders", w.id, w, runId);
  await syncLegacy(store, runId, w);
  return w;
}
