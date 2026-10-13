import type {
  PublicSnapshot,
  ConnectionState,
  PointState,
  LoadLevel,
  RegionState,
} from "@scenic/contracts";
import { points, regions } from "@scenic/scenic";
import {sampleCable} from "./cable-sample";
import {sampleRestrooms} from "./restroom-sample";

export interface SampleSnapshotOptions {
  /** Keep time-based sample services open without changing the real clock. */
  alwaysOpen?: boolean;
}
export function sampleSnapshot(now = new Date(), options: SampleSnapshotOptions = {}): PublicSnapshot {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const open = options.alwaysOpen === true || (hour >= 8 && hour < 18);
  const levels: LoadLevel[] = [
    "moderate",
    "quiet",
    "moderate",
    "moderate",
    "busy",
    "quiet",
    "quiet",
    "moderate",
    "quiet",
  ];
  const counts = [380, 492, 635, 547, 1268, 387, 303, 640, 1196];
  const regionStates: Record<string, RegionState> = Object.fromEntries(
    regions.map((r, i) => [
      r.id,
      {
        availability: "open" as const,
        load: open ? levels[i] : ("quiet" as LoadLevel),
        count: open ? counts[i] : 0,
      },
    ]),
  );
  const pointStates: Record<string, PointState> = Object.fromEntries(
    points.map((p) => [
      p.id,
      { availability: "open", load: regionStates[p.regionId].load },
    ]),
  );
  pointStates.lake = {
    availability: "closed",
    load: "unknown",
    reason: "栈道养护中，开放时间以公告为准。",
  };
  regionStates.Z5 = {
    availability: "closed",
    load: "unknown",
    count: 0,
    reason: "镜湖区域养护中，请沿主路通行。",
  };
  for (const point of points) {
    const region = regionStates[point.regionId];
    if (region.availability !== "open")
      pointStates[point.id] = {
        availability: "closed",
        load: "unknown",
        reason: pointStates[point.id].reason ?? region.reason,
      };
  }
  pointStates.t3 = {
    availability: "maintenance",
    load: "unknown",
    reason: "设施检修，请使用溪谷卫生间或山顶卫生间。",
  };
  // Equipment availability is distinct from regional visitor load.
  for(const point of points.filter(p=>p.kind==='safety'||p.kind==='terminal')){
    const region=regionStates[point.regionId];
    pointStates[point.id]={availability:region.availability,load:'unknown',reason:region.reason};
  }
  pointStates['fire-bamboo']={availability:'maintenance',load:'unknown',reason:'设备检修中，请使用归云集或索道下站灭火器。'};
  pointStates['help-gorge']={availability:'maintenance',load:'unknown',reason:'求助设备检修中，请联系现场工作人员。'};
  const capacities = [700, 500, 300],
    free = [128, 96, 64];
  ["p1", "p2", "p3"].forEach((id, i) => {
    pointStates[id] = {
      availability: options.alwaysOpen || (hour >= 7 && hour < 20) ? "open" : "closed",
      load: open ? (i === 0 ? "busy" : "moderate") : "quiet",
      parkingCapacity: capacities[i],
      parkingFree: open ? free[i] : capacities[i],
    };
  });
  const cableOpen =
    options.alwaysOpen || (hour >= 8 && (hour < 18 || (hour === 18 && now.getMinutes() < 30)));
  for (const id of ["upper", "lower"])
    pointStates[id] = {
      availability: cableOpen ? "open" : "closed",
      load: cableOpen ? "moderate" : "unknown",
      reason: cableOpen ? undefined : "索道运营时间为 08:00—18:30。",
    };
  sampleRestrooms(now,regionStates,pointStates,open);
  sampleCable(now,regionStates,pointStates,options.alwaysOpen);
  return {
    revision: Math.floor(now.getTime() / 10000),
    updatedAt: now.toISOString(),
    parkOpen: open,
    visitors: Object.values(regionStates).reduce(
      (sum, r) => sum + (r.count ?? 0),
      0,
    ),
    parkingFree: ["p1", "p2", "p3"].reduce(
      (sum, id) => sum + pointStates[id].parkingFree!,
      0,
    ),
    weather: {
      label: "多云",
      temperature: 23,
      humidity: 68,
      wind: "东南风 2.1 m/s",
      aqi: 36,
      ions: 2840,
    },
    points: pointStates,
    regions: regionStates,
    closedEdgeIds: [],
    announcements: [
      {
        id: "lake-care",
        title: "镜湖栈道养护中，请沿主路通行",
        body: "镜湖栈道正在进行日常养护，暂不开放。环形主路正常通行，请勿进入灰色标注区域；恢复开放时间以最新公告为准。",
        pointId: "lake",
      },
    ],
  };
}

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
    load = ["quiet", "moderate", "busy", "unknown"];
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
  mode: "sample" | "live";
  sampleOptions?: SampleSnapshotOptions;
  onSnapshot: (s: PublicSnapshot) => void;
  onState: (s: ConnectionState) => void;
  fetcher?: typeof fetch;
}
export function connectPublicClient(options: PublicClientOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | undefined;
  let loading = false;
  let latestRevision = -1;
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
  if (options.mode === "sample") {
    const tick = () => {
      if (stopped) return;
      deliver(sampleSnapshot(new Date(), options.sampleOptions));
      state("sample");
      timer = setTimeout(tick, 10000);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }
  let controller: AbortController | undefined;
  async function refresh() {
    if (stopped || loading) return;
    loading = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await (options.fetcher ?? fetch)(
        "/api/public/snapshot",
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("无法读取数据");
      deliver(validateSnapshot(await response.json()));
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
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    socket.onopen = () => void refresh();
    socket.onmessage = () => void refresh();
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (!stopped) {
        void refresh();
      }
    };
  }
  const poll = async () => {
    await refresh();
    if (stopped) return;
    if (!socket || socket.readyState === WebSocket.CLOSED) attachSocket();
    timer = setTimeout(poll, Math.min(30000, 10000 + failures * 5000));
  };
  state("loading");
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    socket?.close();
  };
}
