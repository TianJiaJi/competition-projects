import type {
  PublicSnapshot,
  ConnectionState,
  PointState,
  LoadLevel,
  RegionState,
} from "@scenic/contracts";
import { points, regions } from "@scenic/scenic";
export function validateSnapshot(value: unknown): PublicSnapshot {
  if (!value || typeof value !== "object") throw new Error("数据格式不正确");
  const s = value as PublicSnapshot;
  if (
    !Number.isFinite(s.revision) ||
    !Number.isFinite(Date.parse(s.updatedAt)) ||
    typeof s.parkOpen !== "boolean" ||
    !s.points ||
    !s.regions ||
    !s.weather ||
    !Array.isArray(s.closedEdgeIds) ||
    !s.closedEdgeIds.every((id) => typeof id === "string") ||
    !Array.isArray(s.announcements)
  )
    throw new Error("数据格式不正确");
  const numberOrNull = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (
    !numberOrNull(s.visitors) ||
    !numberOrNull(s.parkingFree) ||
    !numberOrNull(s.weather.temperature) ||
    typeof s.weather.label !== "string"
  )
    throw new Error("数据指标不正确");
  const avail = ["open", "closed", "maintenance", "unknown"],
    load = ["quiet", "light", "moderate", "busy", "unknown"];
  for (const state of Object.values(s.points))
    if (
      !state ||
      !avail.includes(state.availability) ||
      !load.includes(state.load)
    )
      throw new Error("点位状态不正确");
  for(const state of Object.values(s.points)){
    const r=state.restroom;if(r===undefined)continue;
    const keys=['totalStalls','occupiedStalls','availableStalls','queueCount'] as const;
    const count=(v:unknown)=>v===null||(typeof v==='number'&&Number.isInteger(v)&&v>=0);
    const validCounts=(v:unknown)=>{
      if(!v||typeof v!=='object')return false;
      const c=v as Record<string,unknown>;
      if(!keys.every(key=>count(c[key])))return false;
      const total=c.totalStalls as number|null,occupied=c.occupiedStalls as number|null,available=c.availableStalls as number|null;
      return total===null||((occupied===null||occupied<=total)&&(available===null||available<=total)&&(occupied===null||available===null||occupied+available<=total));
    };
    if(!validCounts(r))throw new Error('卫生间坑位数据不正确');
    const parts=[r.male,r.female,r.maleUrinals,r.accessible];
    if(parts.some(part=>part!==undefined&&!validCounts(part)))throw new Error('卫生间坑位数据不正确');
    for(const key of keys){
      const total=r[key],subtotal=parts.reduce((sum,part)=>sum+(part?.[key]??0),0);
      if(total!==null&&subtotal>total)throw new Error('卫生间男女分项超过合计');
    }
  }
  for(const state of Object.values(s.points)){
    const c=state.cable;if(c===undefined)continue;
    const integer=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0;
    if(!c||!['up','down'].includes(c.direction)||![c.cabinSeats,c.cabinCount,c.totalCapacity,c.directionCapacity].every(integer)||
      ![c.dispatchSeconds,c.travelMinutes,c.capacityPerMinute].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||
      ![c.queueCount,c.inTransit].every(n=>n===null||integer(n))||!numberOrNull(c.waitMinutes)||
      c.cabinSeats*c.cabinCount!==c.totalCapacity||c.directionCapacity>c.totalCapacity||(c.inTransit!==null&&c.inTransit>c.directionCapacity)||
      !/^\d{2}:\d{2}$/.test(c.opensAt)||!/^\d{2}:\d{2}$/.test(c.closesAt))throw new Error('索道容量或排队数据不正确');
  }
  for (const state of Object.values(s.regions))
    if (
      !state ||
      !avail.includes(state.availability) ||
      !load.includes(state.load) ||
      !numberOrNull(state.count)
    )
      throw new Error("区域状态不正确");
  if (
    !s.announcements.every(
      (a) =>
        a &&
        typeof a.id === "string" &&
        typeof a.title === "string" &&
        typeof a.body === "string",
    )
  )
    throw new Error("公告格式不正确");
  return s;
}
export interface PublicClientOptions {
  mode?: "live";
  onSnapshot: (s: PublicSnapshot) => void;
  onState: (s: ConnectionState) => void;
  fetcher?: typeof fetch;
}
export function connectPublicClient(options: PublicClientOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let loading = false;
  let latestRevision = -1;
  let latestRunId = "";
  let failures = 0;
  const deliver = (s: PublicSnapshot) => {
    if (!stopped && s.revision >= latestRevision) {
      latestRevision = s.revision;
      options.onSnapshot(s);
    }
  };
  const state = (s: ConnectionState) => {
    if (!stopped) options.onState(s);
  };
  let controller: AbortController | undefined;
  async function refresh() {
    if (stopped || loading) return;
    loading = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await (options.fetcher ?? fetch)(
        "/api/v1/public/state",
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("无法读取数据");
      const envelope = await response.json();
      const value = envelope.data;
      if (value.run.id !== latestRunId) { latestRunId = value.run.id; latestRevision = -1; }
      deliver(validateSnapshot(value.public));
      failures = 0;
      state("connected");
    } catch {
      failures++;
      state("disconnected");
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }
  function attachSocket() {
    if (stopped || typeof WebSocket === "undefined") return;
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?app=visitor`,
    );
    socket.onopen = () => { void refresh(); heartbeat = setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send("ping");},5000); };
    socket.onmessage = () => void refresh();
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      clearInterval(heartbeat);
      if (!stopped) {
        void refresh();
      }
    };
  }
  const poll = async () => {
    await refresh();
    if (stopped) return;
    if (!socket || socket.readyState === WebSocket.CLOSED) attachSocket();
    timer = setTimeout(poll, Math.min(15000, 2000 + failures * 2000));
  };
  state("loading");
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    clearInterval(heartbeat);
    socket?.close();
  };
}
