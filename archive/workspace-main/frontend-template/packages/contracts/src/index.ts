export type PointKind =
  | "attraction"
  | "toilet"
  | "parking"
  | "cable"
  | "commercial"
  | "entrance"
  | "terminal"
  | "safety";
export type ScenicViewMode = "default" | "crowd" | "toilet" | "safety";
export type SafetyKind = "aed" | "first-aid" | "help" | "lifebuoy" | "extinguisher" | "shelter";
export type Availability = "open" | "closed" | "maintenance" | "unknown";
export type LoadLevel = "quiet" | "light" | "moderate" | "busy" | "unknown";
export type TravelMode = "walk" | "cable";
export interface RoadNode {
  id: string;
  x: number;
  z: number;
}
export interface RoadPosition { x: number; y: number; z: number; }
export interface RoadEdge {
  path?: RoadPosition[];
  structure?: "bridge";
  id: string;
  from: string;
  to: string;
  length: number;
  mode: TravelMode;
  directed?: boolean;
}
export interface ScenicPoint {
  id: string;
  name: string;
  kind: PointKind;
  safetyKind?: SafetyKind;
  nodeId: string;
  regionId: string;
  description: string;
  services?: string[];
  hours: string;
}
export interface Region {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  capacity: number;
}
export interface RestroomCounts {
  totalStalls: number | null;
  occupiedStalls: number | null;
  availableStalls: number | null;
  queueCount: number | null;
}
export interface RestroomState extends RestroomCounts {
  male?: RestroomCounts;
  female?: RestroomCounts;
  maleUrinals?: RestroomCounts;
  accessible?: RestroomCounts;
}
export interface CableState {
  direction: 'up' | 'down';
  cabinSeats: number;
  cabinCount: number;
  totalCapacity: number;
  directionCapacity: number;
  dispatchSeconds: number;
  travelMinutes: number;
  capacityPerMinute: number;
  opensAt: string;
  closesAt: string;
  queueCount: number | null;
  inTransit: number | null;
  waitMinutes: number | null;
}
export interface PointState {
  cable?: CableState;
  restroom?: RestroomState;
  availability: Availability;
  load: LoadLevel;
  reason?: string;
  parkingFree?: number;
  parkingCapacity?: number;
}
export interface RegionState {
  availability: Availability;
  load: LoadLevel;
  count: number | null;
  reason?: string;
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  pointId?: string;
}
export interface VisitorFlowPoint {trajectory?:{seconds:number;x:number;z:number}[];id:string;people:number;regionId:string;x:number;z:number;heading:number;speedMps:number;walking:boolean;phase:'arriving'|'touring'|'departing'}
export interface PublicSnapshot {
  visitorFlow?: VisitorFlowPoint[];
  visitorFlowClock?: {speed:number;paused:boolean};
  revision: number;
  updatedAt: string;
  parkOpen: boolean;
  visitors: number | null;
  parkingFree: number | null;
  weather: {
    label: string;
    temperature: number | null;
    humidity: number | null;
    wind: string;
    aqi: number | null;
    ions: number | null;
  };
  points: Record<string, PointState>;
  regions: Record<string, RegionState>;
  closedEdgeIds: string[];
  announcements: Announcement[];
}
export type RouteResult =
  | {
      ok: true;
      origin: string;
      destination: string;
      mode: TravelMode;
      nodeIds: string[];
      edgeIds: string[];
      distance: number;
    }
  | { ok: false; reason: string };
export type ConnectionState =
  | "loading"
  | "sample"
  | "connected"
  | "disconnected";
export interface Handoff {
  point?: string;
  origin?: string;
  destination?: string;
  mode?: TravelMode;
}

/** Frontend prototype contract. It does not claim a live API is available. */
export type OpsSeverity = 'reminder' | 'important' | 'critical';
export type OpsAlertStatus = 'pending' | 'processing' | 'resolved';
export type OpsAlertCategory = 'crowd' | 'parking' | 'cable' | 'restroom' | 'equipment' | 'help' | 'cleaning' | 'inspection';
export interface OpsHandlingRecord {
  at: string;
  kind: 'created' | 'started' | 'completed';
  actor: string;
  text: string;
}
export interface OpsAlert {
  id: string;
  anchorId: string;
  regionId: string;
  category: OpsAlertCategory;
  severity: OpsSeverity;
  status: OpsAlertStatus;
  title: string;
  location: string;
  reason: string;
  metric: string;
  startedAt: string;
  records: OpsHandlingRecord[];
  previousAlertId?: string;
}
export interface OpsFeedEvent {
  id: string;
  alertId: string;
  at: string;
  kind: OpsHandlingRecord['kind'];
  title: string;
  text: string;
  severity: OpsSeverity;
}
export interface OpsPrototypeSnapshot {
  id: string;
  label: string;
  businessTime: string;
  public: PublicSnapshot;
  checkedInToday: number;
  exitedToday?: number;
  windSpeedMps: number;
  history: {time:string;count:number}[];
  alerts: OpsAlert[];
  events: OpsFeedEvent[];
}

export interface OpsAlertStatistics {
  total:number; pending:number; processing:number; resolved:number;
  averageResponseMinutes:number; averageProcessingMinutes:number;
  trend:{time:string;created:number;completed:number}[];
}
export interface ScenicRegionLabel { regionId:string; title:string; value:string }
