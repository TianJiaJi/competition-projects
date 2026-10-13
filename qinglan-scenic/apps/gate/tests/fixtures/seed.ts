import {employees} from "./employees";
import {
  type Database,
  type Task,
  type OARequest,
} from "../../src/core/types";
export const BUSINESS_KEY = "qinglan.gate.mock.v1";
export const SESSION_KEY = "qinglan.gate.session.v1";
export const RUN_ID = "run_gate_mock_v1";
export function seed(now = new Date().toISOString()): Database {
  const ago = (minutes: number) =>
    new Date(new Date(now).getTime() - minutes * 60000).toISOString();
  const rows: [
    Task["category"],
    Task["severity"],
    string,
    string,
    string,
    string,
    string,
  ][] = [
    [
      "crowd",
      "critical",
      "镜湖栈道客流拥堵",
      "镜湖栈道 · 临水观景段",
      "观景段游客聚集，双向通行缓慢，请前往现场疏导。",
      "区域承载率 92%",
      "lake",
    ],
    [
      "equipment",
      "important",
      "望岳台护栏松动",
      "望岳台 · 东侧步道",
      "巡查发现护栏连接件松动，请检查并处理。",
      "现场巡查报告",
      "summit",
    ],
    [
      "cleaning",
      "reminder",
      "竹影幽径保洁",
      "竹影幽径 · 休憩区",
      "休憩区垃圾需要清理。",
      "现场保洁需求",
      "bamboo",
    ],
    [
      "parking",
      "important",
      "入口停车场通道拥堵",
      "景区入口 · 停车场",
      "出口车辆排队，请协助疏导。",
      "出口排队 12 辆",
      "entry",
    ],
    [
      "cable",
      "important",
      "山顶索道排队疏导",
      "望岳台 · 索道上站",
      "排队游客较多，请维持队伍秩序。",
      "预计等待 25 分钟",
      "summit",
    ],
    [
      "restroom",
      "reminder",
      "镜湖卫生间洗手台漏水",
      "镜湖栈道 · 卫生间",
      "洗手台持续滴水，地面湿滑。",
      "现场巡查报告",
      "lake",
    ],
    [
      "help",
      "critical",
      "游客身体不适求助",
      "飞瀑亭 · 休息亭",
      "游客报告头晕，需要工作人员协助联系医疗人员。",
      "游客现场求助",
      "falls",
    ],
    [
      "inspection",
      "reminder",
      "入口 AED 定期检修",
      "景区入口 · 服务中心",
      "核查设备电量、耗材有效期与封签。",
      "定期检修计划",
      "entry",
    ],
  ];
  const tasks: Task[] = rows.map((r, i) => ({
    id: `task-${i + 1}`,
    runId: RUN_ID,
    version: 1,
    category: r[0],
    severity: r[1],
    title: r[2],
    location: r[3],
    reason: r[4],
    metric: r[5],
    anchorId: r[6],
    regionId: (
      {
        entry: "Z0",
        bamboo: "Z2",
        summit: "Z4",
        falls: "Z7",
        lake: "Z5",
      } as Record<string, string>
    )[r[6]],
    status: "pending",
    startedAt: ago(8 + i * 8),
    assignee: null,
    handlingStartedAt: null,
    completedAt: null,
    records: [
      { at: ago(8 + i * 8), kind: "created", actor: "现场监测", text: r[4] },
    ],
  }));
  for (const [index, employee] of [
    [1, employees[1]],
    [4, employees[0]],
  ] as const) {
    Object.assign(tasks[index], {
      status: "processing",
      assignee: { ...employee },
      handlingStartedAt: ago(4),
      version: 2,
    });
    tasks[index].records.push({
      kind: "started",
      at: ago(4),
      actor: employee.name,
      text: "开始处理",
    });
  }
  tasks.push({
    ...tasks[2],
    id: "task-history",
    title: "镜湖休憩区保洁",
    location: "镜湖栈道 · 休憩区",
    anchorId: "lake",
    regionId: "Z5",
    status: "resolved",
    version: 3,
    assignee: { ...employees[0] },
    startedAt: ago(110),
    handlingStartedAt: ago(100),
    completedAt: ago(80),
    records: [
      {
        at: ago(110),
        kind: "created",
        actor: "巡查人员",
        text: "休憩区保洁需求",
      },
      {
        at: ago(100),
        kind: "started",
        actor: employees[0].name,
        text: "开始处理",
      },
      {
        at: ago(80),
        kind: "completed",
        actor: employees[0].name,
        text: "已清理垃圾并擦拭座椅。",
      },
    ],
  });
  const requests: OARequest[] = (
    ["approved", "rejected", "withdrawn"] as const
  ).map((status, i) => {
    const actor = { id: "admin-demo", name: "值班管理员" };
    const opinion =
      status === "approved"
        ? "已批准申请，请按现场安排执行。"
        : "请明确所需物资数量后重新申请。";
    return {
      id: `oa-sample-${i}`,
      runId: RUN_ID,
      taskId: "task-5",
      taskTitle: tasks[4].title,
      type: i === 1 ? "supplies" : "reinforcement",
      reason: "索道排队需要协助",
      needs: i === 1 ? "需要现场物资" : "申请安保协助维持排队秩序",
      status,
      applicant: { ...employees[0] },
      createdAt: ago(3),
      updatedAt: ago(1),
      version: 2,
      decision: status === "withdrawn" ? null : { actor, at: ago(1), opinion },
      records: [
        {
          kind: "submitted",
          at: ago(3),
          actor: { ...employees[0] },
          text: "提交协同申请",
        },
        {
          kind: status,
          at: ago(1),
          actor: status === "withdrawn" ? { ...employees[0] } : actor,
          text: status === "withdrawn" ? "申请人撤回" : opinion,
        },
      ],
    };
  });
  return {
    schemaVersion: 1,
    runId: RUN_ID,
    revision: 1,
    tasks,
    requests,
    commands: {},
  };
}
