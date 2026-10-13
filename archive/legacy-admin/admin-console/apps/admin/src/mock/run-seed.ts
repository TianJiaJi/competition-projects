import { demoUsers } from "./global-seed";
import type { OpsAlert } from "@scenic/contracts";
import {
  BUSINESS_ISO,
  BUSINESS_TIME_MS,
  DEFAULT_RUN_ID,
  fromShanghai,
  toIsoString,
} from "../core/time";
import type {
  ChatMessage,
  ChatRoom,
  InspectionPlan,
  MuteRecord,
  Notice,
  Order,
  PartBaselineSample,
  Report,
  RestroomPartKey,
  RunData,
  Slot,
} from "../core/types";

const TODAY = "2026-09-12";
const TOMORROW = "2026-09-13";
const minute = 60_000;
const hour = 3_600_000;

const admissionQuotaToday: Record<number, number> = {
  8: 40, 9: 40, 10: 36, 11: 36, 12: 32, 13: 32, 14: 32, 15: 32, 16: 30,
};
const parkingCapacityToday: Record<string, number> = { p1: 24, p2: 20, p3: 18 };
const parkingLots = ["p1", "p2", "p3"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  for (const [date, tomorrow] of [[TODAY, false], [TOMORROW, true]] as Array<[string, boolean]>) {
    for (let startHour = 8; startHour < 17; startHour += 1) {
      slots.push({
        id: `slot-admission-${date}-${pad(startHour)}`,
        date,
        type: "admission",
        start: `${pad(startHour)}:00`,
        end: `${pad(startHour + 1)}:00`,
        unit: "person",
        interactiveQuota: tomorrow ? 40 : admissionQuotaToday[startHour],
        backgroundQuota: 60,
      });
    }
    for (const lotId of parkingLots) {
      for (let startHour = 8; startHour < 17; startHour += 1) {
        slots.push({
          id: `slot-parking-${lotId}-${date}-${pad(startHour)}`,
          date,
          type: "parking",
          lotId,
          start: `${pad(startHour)}:00`,
          end: `${pad(startHour + 1)}:00`,
          unit: "vehicle",
          interactiveQuota: parkingCapacityToday[lotId],
          backgroundQuota: 30,
        });
      }
    }
  }
  return slots;
}

interface OrderSeed {
  id: string;
  type: Order["type"];
  date: string;
  start: string;
  source: Order["source"];
  batchId?: string;
  contactName?: string;
  contactPhone?: string;
  people?: number;
  vehicles?: number;
  plate?: string;
  lotId?: string;
  actualLotId?: string;
  reservationStatus: Order["reservationStatus"];
  visitStatus?: Order["visitStatus"];
  parkingStatus?: Order["parkingStatus"];
  invalidReason?: string;
  createdAt: number;
}

const orderSeeds: OrderSeed[] = [
  {
    id: "ORD-20260912-0001", type: "admission", date: TODAY, start: "15:00", source: "onsite",
    contactName: "林岚", contactPhone: "138-0000-1001", people: 3,
    reservationStatus: "confirmed", visitStatus: "not_entered", createdAt: BUSINESS_TIME_MS - 26 * hour,
  },
  {
    id: "ORD-20260912-0002", type: "admission", date: TODAY, start: "15:00", source: "onsite",
    contactName: "周叙", contactPhone: "138-0000-1002", people: 4,
    reservationStatus: "confirmed", visitStatus: "not_entered", createdAt: BUSINESS_TIME_MS - 25 * hour,
  },
  {
    id: "ORD-20260912-0003", type: "admission", date: TODAY, start: "15:00", source: "onsite",
    contactName: "何砚", contactPhone: "138-0000-1003", people: 5,
    reservationStatus: "confirmed", visitStatus: "in_park", createdAt: BUSINESS_TIME_MS - 24 * hour,
  },
  {
    id: "ORD-20260912-0004", type: "admission", date: TODAY, start: "16:00", source: "onsite",
    contactName: "团体·青岚书院", contactPhone: "138-0000-1004", people: 8,
    reservationStatus: "confirmed", visitStatus: "not_entered", createdAt: BUSINESS_TIME_MS - 50 * hour,
  },
  {
    id: "ORD-20260912-0005", type: "admission", date: TODAY, start: "09:00", source: "onsite",
    contactName: "苏辞", contactPhone: "138-0000-1005", people: 6,
    reservationStatus: "confirmed", visitStatus: "exited", createdAt: BUSINESS_TIME_MS - 30 * hour,
  },
  {
    id: "ORD-20260912-0006", type: "admission", date: TODAY, start: "10:00", source: "onsite",
    contactName: "陆栖", contactPhone: "138-0000-1006", people: 2,
    reservationStatus: "cancelled", visitStatus: "not_entered", createdAt: BUSINESS_TIME_MS - 28 * hour,
  },
  {
    id: "ORD-20260912-0007", type: "admission", date: TODAY, start: "08:00", source: "onsite",
    contactName: "叶知秋", contactPhone: "138-0000-1007", people: 4,
    reservationStatus: "expired", visitStatus: "not_entered",
    invalidReason: "截至 17:00 未入园，订单自动失效（演示样例）", createdAt: BUSINESS_TIME_MS - 34 * hour,
  },
  {
    id: "ORD-20260913-0008", type: "admission", date: TOMORROW, start: "09:00", source: "onsite",
    contactName: "温野", contactPhone: "138-0000-1008", people: 2,
    reservationStatus: "confirmed", visitStatus: "not_entered", createdAt: BUSINESS_TIME_MS - 12 * hour,
  },
  {
    id: "BATCH-20260912-A-0009", type: "admission", date: TODAY, start: "15:00", source: "background",
    batchId: "BATCH-20260912-A", people: 120, reservationStatus: "confirmed", visitStatus: "not_entered",
    createdAt: BUSINESS_TIME_MS - 20 * hour,
  },
  {
    id: "BATCH-20260912-B-0010", type: "admission", date: TODAY, start: "11:00", source: "background",
    batchId: "BATCH-20260912-B", people: 260, reservationStatus: "confirmed", visitStatus: "in_park",
    createdAt: BUSINESS_TIME_MS - 22 * hour,
  },
  {
    id: "ORD-20260912-0011", type: "parking", date: TODAY, start: "15:00", source: "onsite",
    contactName: "郑野", contactPhone: "138-0000-1011", vehicles: 2, plate: "沪A·12345", lotId: "p1",
    reservationStatus: "confirmed", parkingStatus: "not_arrived", createdAt: BUSINESS_TIME_MS - 18 * hour,
  },
  {
    id: "ORD-20260912-0012", type: "parking", date: TODAY, start: "15:00", source: "onsite",
    contactName: "何望", contactPhone: "138-0000-1012", vehicles: 3, plate: "沪B·23456", lotId: "p1",
    reservationStatus: "confirmed", parkingStatus: "waiting", createdAt: BUSINESS_TIME_MS - 17 * hour,
  },
  {
    id: "ORD-20260912-0013", type: "parking", date: TODAY, start: "15:00", source: "onsite",
    contactName: "石青", contactPhone: "138-0000-1013", vehicles: 3, plate: "沪C·34567", lotId: "p2",
    reservationStatus: "confirmed", parkingStatus: "not_arrived", createdAt: BUSINESS_TIME_MS - 16 * hour,
  },
  {
    id: "ORD-20260912-0014", type: "parking", date: TODAY, start: "08:00", source: "onsite",
    contactName: "闻笛", contactPhone: "138-0000-1014", vehicles: 4, plate: "沪D·45678", lotId: "p2",
    actualLotId: "p2", reservationStatus: "confirmed", parkingStatus: "departed", createdAt: BUSINESS_TIME_MS - 30 * hour,
  },
  {
    id: "ORD-20260912-0015", type: "parking", date: TODAY, start: "16:00", source: "onsite",
    contactName: "秦川", contactPhone: "138-0000-1015", vehicles: 1, plate: "沪E·56789", lotId: "p3",
    reservationStatus: "confirmed", parkingStatus: "not_arrived", createdAt: BUSINESS_TIME_MS - 10 * hour,
  },
  {
    id: "BATCH-20260912-C-0016", type: "parking", date: TODAY, start: "15:00", source: "background",
    batchId: "BATCH-20260912-C", vehicles: 40, lotId: "p1", reservationStatus: "confirmed",
    parkingStatus: "not_arrived", createdAt: BUSINESS_TIME_MS - 19 * hour,
  },
  {
    id: "ORD-20260912-0017", type: "parking", date: TODAY, start: "14:00", source: "onsite",
    contactName: "顾南", contactPhone: "138-0000-1017", vehicles: 1, plate: "沪F·67890", lotId: "p3",
    actualLotId: "p3", reservationStatus: "confirmed", parkingStatus: "parked", createdAt: BUSINESS_TIME_MS - 9 * hour,
  },
];

function buildOrders(): Order[] {
  return orderSeeds.map((seed, index) => {
    const startMs = fromShanghai(seed.date, seed.start);
    const endMs = startMs + hour;
    return {
      id: seed.id,
      type: seed.type,
      slotDate: seed.date,
      slotStart: seed.start,
      slotEnd: `${pad(Number(seed.start.slice(0, 2)) + 1)}:00`,
      source: seed.source,
      batchId: seed.batchId,
      contactName: seed.contactName,
      contactPhone: seed.contactPhone,
      people: seed.people,
      vehicles: seed.vehicles,
      plate: seed.plate,
      parkingLotId: seed.lotId,
      actualParkingLotId: seed.actualLotId,
      reservationStatus: seed.reservationStatus,
      visitStatus: seed.visitStatus ?? "not_entered",
      parkingStatus: seed.parkingStatus ?? "not_arrived",
      invalidReason: seed.invalidReason,
      createdAt: seed.createdAt,
      updatedAt: seed.createdAt + (index + 1) * minute,
      enteredAt: seed.visitStatus === "in_park" || seed.visitStatus === "exited" ? startMs + 5 * minute : undefined,
      exitedAt: seed.visitStatus === "exited" ? startMs + 80 * minute : undefined,
      arrivedAt: seed.parkingStatus === "parked" || seed.parkingStatus === "departed" ? startMs + 10 * minute : undefined,
      departedAt: seed.parkingStatus === "departed" ? endMs + 20 * minute : undefined,
      history: [],
    } satisfies Order;
  });
}

function buildNotices(): Notice[] {
  const seeds: Array<{ title: string; body: string; audience: Notice["audience"]; published: boolean; start: string; end: string }> = [
    { title: "今日索道运营正常", body: "索道按计划运行，排队时间以现场显示为准。", audience: "public", published: true, start: "13:00", end: "20:00" },
    { title: "内部值班交接提醒", body: "14:30 完成值班交接，巡检记录同步到后台。", audience: "internal", published: true, start: "09:00", end: "18:00" },
    { title: "峡谷段短时限流预告", body: "叠翠峡将于 15:00 起短时限流，请提前引导游客分流。", audience: "public", published: true, start: "15:00", end: "16:00" },
    { title: "午后客流提示（已过期）", body: "本条演示 13:00—14:30 区间的过期状态。", audience: "public", published: true, start: "13:00", end: "14:30" },
    { title: "清晨设备检查（已过期）", body: "开园前设备检查已完成，本条演示更早的过期区间。", audience: "public", published: true, start: "06:00", end: "07:00" },
    { title: "周末团队预约安排（未发布）", body: "草稿状态公告，未发布时不对外展示。", audience: "public", published: false, start: "14:00", end: "15:00" },
    { title: "内部演练安排（未发布）", body: "内部演练草稿，尚未发布。", audience: "internal", published: false, start: "16:00", end: "18:00" },
    { title: "卫生间分项维护说明", body: "部分卫生间分项维护中，可用服务位以现场显示为准。", audience: "public", published: true, start: "14:00", end: "15:00" },
  ];
  return seeds.map((seed, index) => ({
    id: `notice-${String(index + 1).padStart(3, "0")}`,
    title: seed.title,
    body: seed.body,
    audience: seed.audience,
    published: seed.published,
    startsAt: toIsoString(fromShanghai(TODAY, seed.start)),
    endsAt: toIsoString(fromShanghai(TODAY, seed.end)),
    createdAt: BUSINESS_TIME_MS - (40 - index) * hour,
    updatedAt: BUSINESS_TIME_MS - (index + 1) * 30 * minute,
  }));
}

function buildAlerts(): OpsAlert[] {
  const at = (offsetMinutes: number) => toIsoString(BUSINESS_TIME_MS - offsetMinutes * minute);
  return [
    {
      id: "alert-01", anchorId: "entry", regionId: "Z0", category: "crowd", severity: "critical",
      status: "pending", title: "入口服务区负载超过阈值", location: "入口服务区 · 入口广场",
      reason: "瞬时聚集人数持续高于承载上限的 85%", metric: "实时负载 92%／阈值 85%",
      startedAt: at(26), records: [{ at: at(26), kind: "created", actor: "监测服务", text: "负载超阈值自动记录" }],
    },
    {
      id: "alert-02", anchorId: "p1", regionId: "Z0", category: "parking", severity: "important",
      status: "processing", title: "一号停车场余位紧张", location: "入口服务区 · 一号停车场",
      reason: "物理余位低于 15%", metric: "可用余位 8／容量 60",
      startedAt: at(64),
      records: [
        { at: at(64), kind: "created", actor: "监测服务", text: "余位不足自动记录" },
        { at: at(52), kind: "started", actor: "值班主管", text: "已安排现场人员引导车辆" },
      ],
    },
    {
      id: "alert-03", anchorId: "t2", regionId: "Z1", category: "restroom", severity: "reminder",
      status: "pending", title: "溪谷卫生间女厕位排队偏长", location: "溪谷区 · 溪谷卫生间",
      reason: "排队人数连续 10 分钟高于 6 人", metric: "排队 7 人",
      startedAt: at(18), records: [{ at: at(18), kind: "created", actor: "监测服务", text: "排队超阈值自动记录" }],
    },
    {
      id: "alert-04", anchorId: "upper", regionId: "Z4", category: "cable", severity: "critical",
      status: "pending", title: "索道上站等候时间偏长", location: "山顶观景区 · 索道上站",
      reason: "分方向排队时间超过 40 分钟", metric: "预计等候 46 分钟／在途 24 人",
      startedAt: at(35), records: [{ at: at(35), kind: "created", actor: "监测服务", text: "等候时间超阈值自动记录" }],
    },
    {
      id: "alert-05", anchorId: "entry", regionId: "Z0", category: "crowd", severity: "important",
      status: "resolved", title: "入口服务区负载偏高（已处理）", location: "入口服务区 · 入口广场",
      reason: "瞬时聚集人数高于承载上限的 75%", metric: "完成时实时负载 88%（仍高于阈值）",
      startedAt: at(180),
      records: [
        { at: at(180), kind: "created", actor: "监测服务", text: "负载超阈值自动记录" },
        { at: at(168), kind: "started", actor: "值班主管", text: "入口加开验证通道" },
        { at: at(150), kind: "completed", actor: "演示值班员", text: "人工确认现场已疏导，本次事件关闭；负载读数仍偏高，保留记录" },
      ],
    },
    {
      id: "alert-06", anchorId: "help-creek", regionId: "Z1", category: "help", severity: "reminder",
      status: "resolved", title: "溪谷一键求助点触发", location: "溪谷区 · 溪谷一键求助点",
      reason: "游客触发一键求助", metric: "触发 1 次",
      startedAt: at(300),
      records: [
        { at: at(300), kind: "created", actor: "监测服务", text: "求助设备触发" },
        { at: at(298), kind: "started", actor: "值班主管", text: "联系现场巡查人员" },
        { at: at(292), kind: "completed", actor: "值班主管", text: "游客已得到协助并致谢，事件关闭" },
      ],
    },
    {
      id: "alert-07", anchorId: "entry", regionId: "Z0", category: "crowd", severity: "important",
      status: "pending", title: "入口服务区再次出现负载上升", location: "入口服务区 · 入口广场",
      reason: "恢复后再次超过阈值，独立记录为新事件", metric: "实时负载 81%／阈值 80%", startedAt: at(12),
      previousAlertId: "alert-05",
      records: [{ at: at(12), kind: "created", actor: "监测服务", text: "恢复后再次超限，生成新事件" }],
    },
    {
      id: "alert-08", anchorId: "t5", regionId: "Z5", category: "equipment", severity: "reminder",
      status: "processing", title: "湖畔卫生间感应冲水异常", location: "湖畔游览区 · 湖畔卫生间",
      reason: "分项设备自检上报异常", metric: "异常点位 2 处",
      startedAt: at(90),
      records: [
        { at: at(90), kind: "created", actor: "监测服务", text: "设备自检上报" },
        { at: at(80), kind: "started", actor: "值班主管", text: "已通知设施保障组" },
      ],
    },
    {
      id: "alert-09", anchorId: "market", regionId: "Z0", category: "cleaning", severity: "reminder",
      status: "pending", title: "归云集地面清洁待处理", location: "入口服务区 · 归云集",
      reason: "现场巡查上报需要清洁", metric: "上报 1 次",
      startedAt: at(22), records: [{ at: at(22), kind: "created", actor: "巡查人员", text: "现场巡查上报" }],
    },
  ];
}

function buildChat(): { rooms: ChatRoom[]; messages: ChatMessage[] } {
  const rooms: ChatRoom[] = [
    { id: "room-park", name: "全园聊天室", kind: "park" },
    { id: "room-poi-creek", name: "听溪台聊天室", kind: "poi", poiId: "creek" },
  ];
  const nickname = (id: string) => demoUsers.find((user) => user.id === id)!.nickname;
  const bodies = [
    "听溪台这边的水声很清楚，推荐下午来。",
    "请问从入口走到山顶大概要多久？",
    "竹林区的石阶有点湿，注意慢行。",
    "山顶风大，建议加件外套。",
    "索道排队大概二十分钟，秩序还好。",
    "湖畔栈道的倒影很好看。",
    "卫生间在溪谷区靠主路一侧。",
    "归云集的文创店今天开着。",
  ];
  const messages: ChatMessage[] = [];
  for (let index = 0; index < 55; index += 1) {
    const at = BUSINESS_TIME_MS - (55 - index) * 90_000;
    const authorIndex = index % 5;
    messages.push({
      id: `msg-${String(index + 1).padStart(4, "0")}`,
      roomId: "room-park",
      authorId: `visitor-${1001 + authorIndex}`,
      authorNickname: nickname(`visitor-${1001 + authorIndex}`),
      source: index % 7 === 0 ? "background" : "onsite",
      body: bodies[index % bodies.length],
      at,
      removed: false,
    });
  }
  for (let index = 0; index < 12; index += 1) {
    const at = BUSINESS_TIME_MS - (12 - index) * 4 * minute;
    messages.push({
      id: `msg-creek-${String(index + 1).padStart(3, "0")}`,
      roomId: "room-poi-creek",
      authorId: `visitor-${1002 + (index % 3)}`,
      authorNickname: nickname(`visitor-${1002 + (index % 3)}`),
      source: "onsite",
      body: bodies[(index + 3) % bodies.length],
      at,
      removed: false,
    });
  }
  return { rooms, messages };
}

function buildReports(): Report[] {
  return [
    {
      id: "report-001", roomId: "room-park", messageId: "msg-0050", reporterNickname: "听溪的人",
      reason: "spam", status: "pending", createdAt: BUSINESS_TIME_MS - 40 * minute,
    },
    {
      id: "report-002", roomId: "room-park", messageId: "msg-0012", reporterNickname: "归云客",
      reason: "abuse", status: "resolved", note: "已提醒发布者注意用语，内容保留。",
      handledAt: BUSINESS_TIME_MS - 120 * minute, handledBy: "演示值班员", createdAt: BUSINESS_TIME_MS - 150 * minute,
    },
    {
      id: "report-003", roomId: "room-poi-creek", messageId: "msg-creek-004", reporterNickname: "竹林听风",
      reason: "other", status: "dismissed", note: "核对后属于正常询问，驳回举报。",
      handledAt: BUSINESS_TIME_MS - 200 * minute, handledBy: "值班主管", createdAt: BUSINESS_TIME_MS - 240 * minute,
    },
  ];
}

function buildMutes(): MuteRecord[] {
  return [
    {
      userId: "visitor-1006", nickname: "雾里看山", minutes: 8, until: Date.now() + 8 * minute,
      reason: "短时间内重复发送相同内容", setAt: Date.now() - 2 * minute, scope: "all",
    },
  ];
}

const restroomBaselines: Record<string, Record<RestroomPartKey, PartBaselineSample>> = {
  t1: {
    female: { occupied: 20, queue: 0, baselinePaused: 0 },
    male: { occupied: 3, queue: 0, baselinePaused: 1 },
    maleUrinals: { occupied: 4, queue: 0, baselinePaused: 0 },
    accessible: { occupied: 1, queue: 0, baselinePaused: 0 },
  },
  t2: {
    female: { occupied: 7, queue: 0, baselinePaused: 0 },
    male: { occupied: 2, queue: 0, baselinePaused: 0 },
    maleUrinals: { occupied: 2, queue: 0, baselinePaused: 1 },
    accessible: { occupied: 0, queue: 0, baselinePaused: 0 },
  },
  t3: {
    female: { occupied: 16, queue: 3, baselinePaused: 0 },
    male: { occupied: 4, queue: 0, baselinePaused: 0 },
    maleUrinals: { occupied: 3, queue: 0, baselinePaused: 0 },
    accessible: { occupied: 1, queue: 0, baselinePaused: 0 },
  },
  t4: {
    female: { occupied: 12, queue: 0, baselinePaused: 0 },
    male: { occupied: 3, queue: 0, baselinePaused: 0 },
    maleUrinals: { occupied: 5, queue: 0, baselinePaused: 2 },
    accessible: { occupied: 0, queue: 0, baselinePaused: 0 },
  },
  t5: {
    female: { occupied: 17, queue: 2, baselinePaused: 7 },
    male: { occupied: 4, queue: 0, baselinePaused: 1 },
    maleUrinals: { occupied: 6, queue: 0, baselinePaused: 2 },
    accessible: { occupied: 1, queue: 0, baselinePaused: 0 },
  },
  t6: {
    female: { occupied: 9, queue: 0, baselinePaused: 3 },
    male: { occupied: 2, queue: 0, baselinePaused: 0 },
    maleUrinals: { occupied: 2, queue: 0, baselinePaused: 2 },
    accessible: { occupied: 0, queue: 0, baselinePaused: 1 },
  },
};

export function runSeed(runId: string = DEFAULT_RUN_ID): RunData {
  const chat = buildChat();
  return {
    runId,
    businessTime: BUSINESS_ISO,
    orders: buildOrders(),
    slots: buildSlots(),
    notices: buildNotices(),
    facilityStates: {},
    restroomAdjustments: Object.fromEntries(
      [...Object.keys(restroomBaselines)].map((facilityId) => [
        facilityId,
        {
          facilityId,
          state: "open" as const,
          requested: { female: 0, male: 0, maleUrinals: 0, accessible: 0 },
          updatedAt: BUSINESS_TIME_MS,
        },
      ]),
    ),
    restroomBaselines,
    parkingStats: {
      p1: { capacity: 60, occupied: 38 },
      p2: { capacity: 48, occupied: 22 },
      p3: { capacity: 40, occupied: 9 },
    },
    cableStats: { queueCount: 46, inTransit: 24 },
    alerts: buildAlerts(),
    inspectionRecords: [],
    chatRooms: chat.rooms,
    messages: chat.messages,
    reports: buildReports(),
    mutes: buildMutes(),
    actionLog: {},
    nextOrderSeq: 18,
    nextNoticeSeq: 9,
    nextReportSeq: 4,
    nextMessageSeq: 100,
    revision: 1,
  };
}
