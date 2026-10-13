import { sampleSnapshot } from "../../packages/client/testing/snapshot";
import { regions, points } from "@scenic/scenic";
import type {
  OpsAlert,
  OpsAlertCategory,
  OpsAlertStatus,
  OpsPrototypeSnapshot,
  OpsSeverity,
  OpsFeedEvent,
} from "@scenic/contracts";
export const severityLabels: Record<OpsSeverity, string> = {
  reminder: "提醒",
  important: "重要",
  critical: "紧急",
};
export const statusLabels: Record<OpsAlertStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已处理",
};
export const categoryLabels: Record<OpsAlertCategory, string> = {
  crowd: "客流拥堵",
  parking: "停车紧张",
  cable: "索道排队",
  restroom: "卫生间异常",
  equipment: "设施故障",
  help: "游客求助",
  cleaning: "环境保洁",
  inspection: "定期检修",
};
export const severityRank: Record<OpsSeverity, number> = {
  critical: 0,
  important: 1,
  reminder: 2,
};
export const scenarios = [
  { id: "alerts", label: "多类新告警" },
  { id: "normal", label: "正常运行" },
  { id: "processing", label: "处理中" },
  { id: "completed", label: "完成消除" },
  { id: "still-high", label: "完成但负载仍高" },
  { id: "recurrence", label: "恢复后再次告警" },
] as const;
export type ScenarioId = (typeof scenarios)[number]["id"];
const time = (clock: string) => `2026-09-12T${clock}:00+08:00`;
function alert(
  id: string,
  anchorId: string,
  regionId: string,
  category: OpsAlertCategory,
  severity: OpsSeverity,
  title: string,
  location: string,
  reason: string,
  metric: string,
  clock: string,
): OpsAlert {
  return {
    id,
    anchorId,
    regionId,
    category,
    severity,
    status: "pending",
    title,
    location,
    reason,
    metric,
    startedAt: time(clock),
    records: [
      {
        at: time(clock),
        kind: "created",
        actor: category === "inspection" ? "检修计划" : "监测中心",
        text: reason,
      },
    ],
  };
}
function start(a: OpsAlert, clock: string, actor: string, text: string) {
  a.status = "processing";
  a.records.push({ at: time(clock), kind: "started", actor, text });
}
function finish(a: OpsAlert, clock: string, actor: string, text: string) {
  a.status = "resolved";
  a.records.push({ at: time(clock), kind: "completed", actor, text });
}
export function sortAlerts(alerts: OpsAlert[]) {
  return [...alerts].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      b.startedAt.localeCompare(a.startedAt) ||
      a.id.localeCompare(b.id),
  );
}
export function buildSnapshot(id: ScenarioId = "alerts"): OpsPrototypeSnapshot {
  const clock = {
    alerts: "14:30",
    normal: "14:30",
    processing: "14:35",
    completed: "14:45",
    "still-high": "14:45",
    recurrence: "15:10",
  }[id];
  const businessTime = time(clock),
    publicData = sampleSnapshot(new Date(businessTime), { alwaysOpen: true });
  publicData.updatedAt = businessTime;
  // Complete, deterministic fixture. Availability and load are independent.
  publicData.weather = {
    label: "晴间多云",
    temperature: 25,
    humidity: 72,
    wind: "东南风",
    aqi: 34,
    ions: 1860,
  };
  for (const point of points.filter((p) => p.kind === "safety"))
    publicData.points[point.id] = {
      availability: publicData.regions[point.regionId].availability,
      load: "unknown",
    };
  publicData.points["fire-bamboo"] = {
    availability: "maintenance",
    load: "unknown",
    reason: "压力指针低于正常范围，待更换备用灭火器。",
  };
  publicData.points["help-creek"] = {
    availability: "maintenance",
    load: "unknown",
    reason: "求助通话后音频模块异常，通信检修中。",
  };
  const parking = [
    ["p1", 700, 128],
    ["p2", 500, 96],
    ["p3", 300, 64],
  ] as const;
  parking.forEach(([key, capacity, free]) => {
    const ratio = (capacity - free) / capacity;
    publicData.points[key] = {
      availability: "open",
      load: ratio >= 0.9 ? "busy" : ratio >= 0.7 ? "moderate" : "quiet",
      parkingCapacity: capacity,
      parkingFree: free,
    };
  });
  for (const key of ["upper", "lower"]) {
    const prior = publicData.points[key].cable!;
    publicData.points[key] = {
      availability: "open",
      load: key === "upper" ? "moderate" : "quiet",
      cable: {
        ...prior,
        queueCount: key === "upper" ? 112 : 48,
        waitMinutes: key === "upper" ? 6 : 2.8,
        inTransit: key === "upper" ? 36 : 24,
      },
    };
  }
  const alerts: OpsAlert[] = [
    alert(
      "A-230",
      "region-Z4",
      "Z4",
      "crowd",
      "important",
      "望岳台客流持续拥挤",
      "山顶观景区",
      "区域承载率连续 2 分钟超过 85%，需要现场疏导。",
      "1,268 人 / 参考承载 1,300 人 · 97.5%",
      "14:26",
    ),
    alert(
      "A-231",
      "help-creek",
      "Z1",
      "help",
      "critical",
      "游客身体不适，等待协助",
      "溪谷一键求助点",
      "游客通过求助点报告头晕，同行人员在现场陪同。",
      "求助人数 1 人 · 现场有陪同",
      "14:28",
    ),
    alert(
      "A-232",
      "fire-bamboo",
      "Z2",
      "equipment",
      "important",
      "灭火器压力异常",
      "竹间驿灭火器",
      "巡检发现压力指针低于正常范围，需要更换设备。",
      "设备不可用 · 待更换 1 具",
      "14:12",
    ),
    alert(
      "A-233",
      "aed-summit",
      "Z4",
      "inspection",
      "reminder",
      "AED 到期例行检查",
      "山顶 AED",
      "本日计划核验电量、电极片有效期与柜门状态。",
      "设备当前可用 · 本次检查 3 项",
      "14:05",
    ),
    alert(
      "A-234",
      "t3",
      "Z3",
      "restroom",
      "important",
      "卫生间管线检修",
      "峡谷卫生间",
      "供水管线渗漏，现场已设置检修围挡，请检查并恢复。",
      "设施维修中 · 邻近溪谷卫生间开放",
      "14:10",
    ),
    alert(
      "A-235",
      "help-creek",
      "Z1",
      "equipment",
      "important",
      "求助点音频模块异常",
      "溪谷一键求助点",
      "本次求助已接收，后续通话出现杂音，需现场检修。",
      "音频自检异常 · 设备暂不可用",
      "14:29",
    ),
    alert(
      "A-236",
      "market",
      "Z0",
      "cleaning",
      "reminder",
      "商业区地面积水清理",
      "归云集 · 出口商业区",
      "饮水区附近少量积水，请安排保洁并放置防滑提示。",
      "待清理面积 6 平方米",
      "14:18",
    ),
  ];
  start(
    alerts[2],
    "14:16",
    "李明 · 设施维护",
    "已携备用设备前往竹间驿，现场更换。",
  );
  start(
    alerts[4],
    "14:15",
    "王强 · 设施维护",
    "已关闭支路供水，正在检修连接管线。",
  );
  const parkingHistory = alert(
    "A-218",
    "p1",
    "Z0",
    "parking",
    "important",
    "一号停车场车辆疏导",
    "一号停车场",
    "午间车辆集中抵达，现场开展停车引导。",
    "触发时占用率 93% · 当前余位 128 个",
    "12:40",
  );
  start(
    parkingHistory,
    "12:43",
    "赵磊 · 秩序维护",
    "按现场安排引导车辆进入二号停车场。",
  );
  finish(
    parkingHistory,
    "13:08",
    "赵磊 · 秩序维护",
    "入口通道恢复顺畅，本次现场疏导完成。",
  );
  const cableHistory = alert(
    "A-219",
    "upper",
    "Z4",
    "cable",
    "important",
    "索道候乘区秩序维护",
    "索道上站",
    "午间集中返程，需要维护候乘队列。",
    "触发时预计等待 12 分钟 · 当前 6 分钟",
    "12:48",
  );
  start(
    cableHistory,
    "12:51",
    "陈静 · 秩序维护",
    "已到达候乘区，按批次引导登乘。",
  );
  finish(
    cableHistory,
    "13:20",
    "陈静 · 秩序维护",
    "候乘区秩序稳定，现场处置完成。",
  );
  alerts.push(parkingHistory, cableHistory);
  const pastJobs: [string,string,OpsAlertCategory,string,string,string][] = [
    ['market','Z0','cleaning','商业区开园保洁','落叶集中堆积，需清扫通道','清扫 12 平方米，通道恢复整洁'],
    ['p1','Z0','parking','一号停车场入口疏导','入场车辆短时排队','引导 18 辆车完成停放'],
    ['lower','Z0','cable','索道下站队列整理','候乘队列需要引导分流','分批引导 40 人有序候乘'],
    ['t3','Z3','cleaning','峡谷卫生间地面保洁','洗手区地面有积水','清理 4 平方米并复查防滑情况'],
    ['fire-bamboo','Z2','inspection','竹林消防设备巡检','计划核验消防设备外观与封签','完成 3 项检查，巡检时设备可用'],
    ['help-creek','Z1','help','溪谷游客路线协助','游客需要前往索道的路线说明','为 2 名游客提供路线与现场指引'],
    ['market','Z0','cleaning','商业区垃圾清运','垃圾桶达到清运阈值','清运 2 桶垃圾并更换内袋'],
    ['aed-summit','Z4','inspection','山顶急救柜外观检查','计划检查急救柜柜门与标识','完成 2 项外观检查，柜门正常'],
    ['p1','Z0','parking','停车场临时通道整理','车辆占用临时通行线','协调 1 辆车移至指定车位'],
    ['lower','Z0','cable','索道下站候乘协助','团队游客需要候乘分组','完成 3 组游客候乘分组'],
    ['t3','Z3','cleaning','峡谷洗手区清洁','台面有污渍，需要清洁','清洁 3 处台面并补充洗手液'],
    ['help-creek','Z1','help','溪谷游客物品协助','游客在休息区遗落水杯','核对特征后归还 1 件物品'],
    ['market','Z0','cleaning','商业区午间清扫','休息区散落餐饮包装','清扫 8 平方米并完成垃圾分类'],
    ['p1','Z0','inspection','停车指示牌巡检','计划检查指示牌固定情况','紧固 1 处连接，指示牌稳定'],
    ['lower','Z0','cleaning','索道下站候乘区保洁','候乘座椅与地面需要保洁','擦拭 6 张座椅并清洁地面'],
  ];
  const at=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  pastJobs.forEach(([anchor,region,category,title,reason,result],i)=>{
    const minute=8*60+5+i*19;
    const place=points.find(p=>p.id===anchor)!;
    const job=alert(`A-${200+i}`,anchor,region,category,category==='parking'||category==='cable'?'important':'reminder',title,place.name,reason,result,at(minute));
    const actor=['李明 · 设施维护','赵磊 · 秩序维护','王芳 · 环境保洁'][i%3];
    start(job,at(minute+2+i%4),actor,'已到达现场，开始检查和处理。');
    finish(job,at(minute+12+i%7),actor,result);
    alerts.push(job);
  });

  if (id === "processing")
    start(
      alerts[0],
      "14:33",
      "陈静 · 秩序维护",
      "接到人工工作安排，已抵达望岳台组织游客有序通行。",
    );
  if (["completed", "still-high", "recurrence"].includes(id)) {
    start(alerts[0], "14:33", "陈静 · 秩序维护", "已在观景平台开展现场疏导。");
    finish(
      alerts[0],
      "14:42",
      "陈静 · 秩序维护",
      "平台通道已清理，现场疏导工作完成。",
    );
  }
  if (id === "normal" || id === "completed") {
    publicData.regions.Z4.count = 860;
    publicData.regions.Z8.count! += 408;
  }
  if (id === "normal") {
    for (const a of alerts.filter((a) => a.status !== "resolved")) {
      a.records = a.records.filter((r) => r.kind === "created");
      start(a, "14:29", "值班班组", "已完成现场检查与处置。");
      finish(a, "14:30", "值班班组", "本次工作完成，记录已归档。");
    }
    for (const key of ["fire-bamboo", "help-creek", "t3"]) {
      publicData.points[key].availability = "open";
      publicData.points[key].load = key === "t3" ? "quiet" : "unknown";
      delete publicData.points[key].reason;
    }
    const restroom = publicData.points.t3.restroom!;
    for (const group of [
      restroom,
      restroom.female!,
      restroom.male!,
      restroom.maleUrinals!,
      restroom.accessible!,
    ]) {
      group.occupiedStalls = 0;
      group.availableStalls = group.totalStalls;
      group.queueCount = 0;
    }
  }
  if (id === "recurrence") {
    const fresh = alert(
      "A-237",
      "region-Z4",
      "Z4",
      "crowd",
      "important",
      "望岳台客流再次达到阈值",
      "山顶观景区",
      "14:50 承载率回落至 75% 以下；15:08 再次超限并持续 2 分钟，形成新事件。",
      "1,268 人 / 参考承载 1,300 人 · 97.5%",
      "15:10",
    );
    fresh.previousAlertId = "A-230";
    alerts.push(fresh);
  }
  for (const region of regions) {
    const state = publicData.regions[region.id];
    if (state.availability === "open") {
      const ratio = state.count! / region.capacity;
      state.load = ratio >= 0.85 ? "busy" : ratio >= 0.6 ? "moderate" : "quiet";
    }
  }
  publicData.visitors = Object.values(publicData.regions).reduce(
    (n, r) => n + r.count!,
    0,
  );
  publicData.parkingFree = parking.reduce((sum, row) => sum + row[2], 0);
  const history = [
    ["08:00", 0],
    ["09:00", 1460],
    ["10:00", 2780],
    ["11:00", 3920],
    ["12:00", 4720],
    ["13:00", 5180],
    ["14:00", 5390],
  ].map(([t, count]) => ({ time: time(String(t)), count: Number(count) }));
  if (id === "recurrence") history.push({ time: time("15:00"), count: 5461 });
  history.push({ time: businessTime, count: publicData.visitors });
  const events: OpsFeedEvent[] = alerts
    .flatMap((a) =>
      a.records.map((record, index) => ({
        id: `${a.id}-${index}`,
        alertId: a.id,
        at: record.at,
        kind: record.kind,
        title: a.title,
        text: `${record.actor}：${record.text}`,
        severity: a.severity,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  return {
    id,
    label: scenarios.find((s) => s.id === id)!.label,
    businessTime,
    public: publicData,
    checkedInToday: 8236,
    windSpeedMps: 2.4,
    history,
    alerts,
    events,
  };
}
export function groupAlerts(alerts: OpsAlert[]) {
  const groups = new Map<string, OpsAlert[]>();
  for (const a of sortAlerts(alerts)) {
    const group = groups.get(a.anchorId) ?? [];
    group.push(a);
    groups.set(a.anchorId, group);
  }
  return [...groups].map(([anchorId, items]) => ({
    anchorId,
    items,
    severity: items[0].severity,
  }));
}
