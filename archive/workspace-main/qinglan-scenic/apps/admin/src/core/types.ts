import type { Availability, OpsAlert, OpsHandlingRecord, SafetyKind } from "@scenic/contracts";

export type RestroomPartKey = "female" | "male" | "maleUrinals" | "accessible";
export const RESTROOM_PART_KEYS: RestroomPartKey[] = ["female", "male", "maleUrinals", "accessible"];
export const RESTROOM_PART_LABELS: Record<RestroomPartKey, string> = {
  female: "女厕位",
  male: "男厕位",
  maleUrinals: "小便位",
  accessible: "无障碍间",
};

export type FacilityCategory =
  | "attraction"
  | "road"
  | "parking"
  | "toilet"
  | "cable"
  | "safety"
  | "commercial"
  | "terminal"
  | "entrance";

export const facilityCategoryLabels: Record<FacilityCategory, string> = {
  attraction: "景点",
  road: "道路",
  parking: "停车场",
  toilet: "卫生间",
  cable: "索道",
  safety: "安全设施",
  commercial: "商业服务点",
  terminal: "游客终端",
  entrance: "出入口",
};

/** 设施编辑能力：道路只能开放/关闭，卫生间走分项抽屉，其他三类状态可选。 */
export type FacilityStateMode = "full" | "road" | "restroom";

export interface FacilityMetrics {
  label: string;
  value: string;
}

export interface Facility {
  id: string;
  name: string;
  category: FacilityCategory;
  regionId: string;
  regionName: string;
  safetyKind?: SafetyKind;
  /** 共享点位 ID 或道路 ID；道路为起终点名称。 */
  sharedId: string;
  nodeId?: string;
  stateMode: FacilityStateMode;
  /** 只读说明：容量、起终点、上下站等信息。 */
  readonly: FacilityMetrics[];
  impact: string[];
  hasBusiness: boolean;
}

export type FacilityState = "open" | "maintenance" | "closed" | "unknown";

export const facilityStateLabels: Record<FacilityState, string> = {
  open: "开放中",
  maintenance: "维护中",
  closed: "已停用",
  unknown: "状态未知",
};

export interface FacilityStateRecord {
  facilityId: string;
  state: FacilityState;
  reason?: string;
  updatedAt: number;
}

export interface StaffSession {
  userId: string;
  username: string;
  nickname: string;
  startedAt: number;
  expiresAt: number;
  readonly demo: true;
}

export interface AdminUser {
  id: string;
  nickname: string;
  identity: "visitor" | "staff";
  createdAt: string;
  disabled: boolean;
}

export interface ScenicProfile {
  name: string;
  summary: string;
  address: string;
  servicePhone: string;
  coverUrl: string;
  openingText: string;
  updatedAt: number;
}

export interface Article {
  id: string;
  category: "news" | "guide";
  title: string;
  summary: string;
  body: string;
  coverUrl: string;
  published: boolean;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

export interface PoiContentOverride {
  poiId: string;
  name: string;
  summary: string;
  body: string;
  imageUrls: string[];
  sourceIds: string[];
  updatedAt: number;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: "public" | "internal";
  published: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: number;
  updatedAt: number;
}

export type OrderType = "admission" | "parking";
export type OrderSource = "onsite" | "background";
export type ReservationStatus = "confirmed" | "cancelled" | "expired";
export type VisitStatus = "not_entered" | "in_park" | "exited";
export type ParkingStatus = "not_arrived" | "waiting" | "parked" | "departed";

export const reservationStatusLabels: Record<ReservationStatus, string> = {
  confirmed: "有效",
  cancelled: "已取消",
  expired: "已失效",
};

export const visitStatusLabels: Record<VisitStatus, string> = {
  not_entered: "未入园",
  in_park: "在园",
  exited: "已离园",
};

export const parkingStatusLabels: Record<ParkingStatus, string> = {
  not_arrived: "未到场",
  waiting: "等候入场",
  parked: "已进场",
  departed: "已离场",
};

export interface OrderActionRecord {
  at: number;
  actor: string;
  action: "cancel" | "reschedule";
  fromSlot: string;
  toSlot: string;
  note: string;
}

export interface Order {
  id: string;
  type: OrderType;
  slotDate: string;
  slotStart: string;
  slotEnd: string;
  source: OrderSource;
  batchId?: string;
  contactName?: string;
  contactPhone?: string;
  people?: number;
  vehicles?: number;
  plate?: string;
  parkingLotId?: string;
  actualParkingLotId?: string;
  reservationStatus: ReservationStatus;
  visitStatus: VisitStatus;
  parkingStatus: ParkingStatus;
  invalidReason?: string;
  createdAt: number;
  updatedAt: number;
  enteredAt?: number;
  exitedAt?: number;
  arrivedAt?: number;
  departedAt?: number;
  history: OrderActionRecord[];
}

export interface Slot {
  id: string;
  date: string;
  type: OrderType;
  lotId?: string;
  start: string;
  end: string;
  unit: "person" | "vehicle";
  interactiveQuota: number;
  backgroundQuota: number;
}

export interface SlotView extends Slot {
  interactiveBooked: number;
  remaining: number;
  bookable: boolean;
  unbookableReason?: string;
}

export interface SlotAdjustment extends Slot {
  lotName?: string;
  /** 场地停用等业务原因，用于说明不可约，不因加配额而消失。 */
  facilityState?: FacilityState;
}

export interface RestroomPartMetrics {
  key: RestroomPartKey;
  total: number;
  occupied: number;
  queue: number;
  baselinePaused: number;
  requestedPaused: number;
  effectivePaused: number;
  pendingRelease: number;
  available: number;
}

export interface RestroomAdjustment {
  facilityId: string;
  state: "open" | "maintenance" | "closed";
  reason?: string;
  requested: Record<RestroomPartKey, number>;
  updatedAt: number;
}

export interface RestroomDetail {
  facilityId: string;
  state: RestroomAdjustment["state"];
  reason?: string;
  updatedAt: number;
  parts: RestroomPartMetrics[];
  totals: { total: number; occupied: number; effectivePaused: number; pendingRelease: number; available: number; queue: number };
  /** 数据异常时禁止分项保存，例如 Q>0 却仍可算出空位。 */
  dataIssue?: string;
}

export interface InspectionPlan {
  id: string;
  facilityId: string;
  intervalDays: number;
  nextDueDate: string;
  instructions: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InspectionRecord {
  id: string;
  runId: string;
  planId: string;
  facilityId: string;
  dueDate: string;
  alertId: string;
  at: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  kind: "park" | "poi";
  poiId?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string;
  authorNickname: string;
  source: OrderSource;
  body: string;
  at: number;
  removed: boolean;
  removedAt?: number;
  removedBy?: string;
}

export interface Report {
  id: string;
  roomId: string;
  messageId: string;
  reporterNickname: string;
  reason: "spam" | "abuse" | "other";
  status: "pending" | "resolved" | "dismissed";
  note?: string;
  handledAt?: number;
  handledBy?: string;
  createdAt: number;
}

export const reportReasonLabels: Record<Report["reason"], string> = {
  spam: "广告刷屏",
  abuse: "言语攻击",
  other: "其他",
};

export const reportStatusLabels: Record<Report["status"], string> = {
  pending: "待处理",
  resolved: "已处理",
  dismissed: "已驳回",
};

export interface MuteRecord {
  userId: string;
  nickname: string;
  minutes: number;
  until: number;
  reason: string;
  setAt: number;
  scope: "all";
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  poiId?: string;
  keywords: string[];
  sourceId: string;
  version: string;
  retrievalStatus: "ready" | "disabled";
}

export interface KnowledgeSource {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  publishedAt?: string;
}

export interface AssetItem {
  id: string;
  title: string;
  url: string;
  alt: string;
}

export type ServiceModuleId = "guide" | "admin" | "visitor" | "staff" | "screen" | "backend" | "devices";

export interface ServiceModuleHealth {
  id: ServiceModuleId;
  healthyCount: number;
  abnormalCount: number;
  unknownCount: number;
  checkedAt: string;
}

/** GET /api/v1/admin/service-status 的 data；本期由同结构 Mock 适配。 */
export interface ServiceStatusData {
  source: "mock" | "live";
  checkedAt: string;
  modules: ServiceModuleHealth[];
}

export interface ReplyPublishedNotice {
  id: string;
  title: string;
  audience: Notice["audience"];
  published: boolean;
  startsAt: string;
  endsAt: string;
  updatedAt: number;
}

export interface GlobalData {
  users: AdminUser[];
  scenic: ScenicProfile;
  articles: Article[];
  poiOverrides: Record<string, PoiContentOverride>;
  knowledge: KnowledgeEntry[];
  sources: KnowledgeSource[];
  inspectionPlans: InspectionPlan[];
  nextArticleSeq: number;
  nextPlanSeq: number;
  revision: number;
}

export interface RunData {
  runId: string;
  businessTime: string;
  orders: Order[];
  slots: Slot[];
  notices: Notice[];
  facilityStates: Record<string, FacilityStateRecord>;
  restroomAdjustments: Record<string, RestroomAdjustment>;
  /** 卫生间物理分项只读样例：占用、排队与基础暂停。 */
  restroomBaselines: Record<string, Record<RestroomPartKey, PartBaselineSample>>;
  /** 停车场物理容量与占用，只读展示，不随状态编辑清零。 */
  parkingStats: Record<string, { capacity: number; occupied: number }>;
  /** 索道只读样例：分方向排队与在途。 */
  cableStats: { queueCount: number; inTransit: number };
  alerts: OpsAlert[];
  inspectionRecords: InspectionRecord[];
  chatRooms: ChatRoom[];
  messages: ChatMessage[];
  reports: Report[];
  mutes: MuteRecord[];
  actionLog: Record<string, { at: number; result: "ok" | "failed"; label: string; data?: unknown }>;
  nextOrderSeq: number;
  nextNoticeSeq: number;
  nextReportSeq: number;
  nextMessageSeq: number;
  revision: number;
}

export interface PartBaselineSample {
  occupied: number;
  queue: number;
  baselinePaused: number;
}

export interface BusinessStore {
  version: number;
  revision: number;
  activeRunId: string;
  global: GlobalData;
  runs: Record<string, RunData>;
}

export type AlertRecord = OpsAlert;
export type { Availability, OpsHandlingRecord, SafetyKind };
