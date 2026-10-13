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
    "light",
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
