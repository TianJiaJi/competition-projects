import {
  cableConfig,
  kindLabels,
  nodeById,
  parkingZones,
  pointById,
  points,
  restroomCapacities,
  restroomDefinitions,
  regions,
  safetyLabels,
  visitorFixtures,
  edges,
} from "@scenic/scenic";
import type { PathCheckpoint } from "../core/paths";
import type {
  Facility,
  FacilityCategory,
  FacilityMetrics,
  PartBaselineSample,
  RestroomPartKey,
} from "../core/types";
import { RESTROOM_PART_KEYS } from "../core/types";

const categoryOrder: FacilityCategory[] = [
  "attraction",
  "road",
  "parking",
  "toilet",
  "cable",
  "safety",
  "commercial",
  "terminal",
  "entrance",
];

export function regionName(regionId: string): string {
  return regions.find((region) => region.id === regionId)?.name ?? regionId;
}

export function nodeLabel(nodeId: string): string {
  const point = pointById[nodeId];
  if (point) return point.name;
  return nodeId;
}

function pointFacility(
  pointId: string,
  category: FacilityCategory,
  readonly: FacilityMetrics[],
  impact: string[],
  stateMode: Facility["stateMode"] = "full",
): Facility | null {
  const point = pointById[pointId];
  if (!point) return null;
  return {
    id: point.id,
    name: point.name,
    category,
    regionId: point.regionId,
    regionName: regionName(point.regionId),
    safetyKind: point.safetyKind,
    sharedId: point.id,
    nodeId: point.nodeId,
    stateMode,
    readonly,
    impact,
    hasBusiness: category === "parking" || category === "toilet" || category === "attraction",
  };
}

function buildAttractions(): Facility[] {
  return points
    .filter((point) => point.kind === "attraction")
    .map((point) =>
      pointFacility(
        point.id,
        "attraction",
        [
          { label: "区域", value: regionName(point.regionId) },
          { label: "路网节点", value: point.nodeId },
          { label: "营业说明", value: point.hours },
          { label: "共享配置名称", value: point.name },
        ],
        ["停用只改变可用性，不把区域人数改为零", "区域与 ID 保持共享值，不能在此修改"],
      ),
    )
    .filter((item): item is Facility => item !== null);
}

function buildRoads(): Facility[] {
  return edges
    .filter((edge) => edge.id.startsWith("road-"))
    .map((edge) => ({
      id: edge.id,
      name: `${nodeLabel(edge.from)}—${nodeLabel(edge.to)}`,
      category: "road" as const,
      regionId: "",
      regionName: "公共路网",
      sharedId: edge.id,
      stateMode: "road" as const,
      readonly: [
        { label: "起点", value: nodeLabel(edge.from) },
        { label: "终点", value: nodeLabel(edge.to) },
        { label: "长度", value: `${edge.length} 米` },
        { label: "通行方式", value: edge.mode === "cable" ? "索道" : "步行" },
        ...(edge.structure === "bridge" ? [{ label: "结构", value: "桥面" }] : []),
      ],
      impact: ["关闭前进行返程通路校验", "保留方向与长度，不改路网节点"],
      hasBusiness: true,
    }));
}

function buildParking(): Facility[] {
  return parkingZones
    .map((zone) =>
      pointFacility(
        zone.id,
        "parking",
        [
          { label: "区域", value: regionName(pointById[zone.id]?.regionId ?? "Z0") },
          { label: "车位排布", value: `${zone.bayXs.length} 个划线车位（示意）` },
          { label: "营业时间", value: pointById[zone.id]?.hours ?? "07:00—19:30" },
        ],
        ["停用不清空车辆、占用与既有订单", "物理余位与“可接收新预约”分别展示"],
      ),
    )
    .filter((item): item is Facility => item !== null);
}

function buildToilets(): Facility[] {
  return restroomDefinitions
    .map((definition) => {
      const capacity = restroomCapacities[definition.size];
      const total = RESTROOM_PART_KEYS.reduce((sum, key) => sum + capacity[key], 0);
      return pointFacility(
        definition.id,
        "toilet",
        [
          { label: "规格", value: definition.size === "large" ? "大卫生间" : "小卫生间" },
          { label: "服务位总数", value: `${total} 位` },
          {
            label: "分项配置",
            value: `女 ${capacity.female}／男 ${capacity.male}／小便位 ${capacity.maleUrinals}／无障碍 ${capacity.accessible}`,
          },
        ],
        ["分项暂停按 §4.3 计算实际暂停与等待释放", "不提前清退使用者，不模拟占用释放"],
        "restroom",
      );
    })
    .filter((item): item is Facility => item !== null);
}

function buildCable(): Facility {
  const upper = pointById.upper;
  const lower = pointById.lower;
  return {
    id: "cable-main",
    name: "青岚索道（整线）",
    category: "cable",
    regionId: upper?.regionId ?? "Z4",
    regionName: `${regionName(upper?.regionId ?? "Z4")}／${regionName(lower?.regionId ?? "Z0")}`,
    sharedId: "cable-down",
    stateMode: "full",
    readonly: [
      { label: "上站", value: upper?.name ?? "索道上站" },
      { label: "下站", value: lower?.name ?? "索道下站" },
      { label: "单程时长", value: `${cableConfig.travelMinutes} 分钟` },
      { label: "单方向运力", value: `${cableConfig.capacityPerMinute} 人／分钟` },
      { label: "车厢", value: `${cableConfig.cabinCount} 个 × ${cableConfig.cabinSeats} 座` },
      { label: "运营时间", value: `${cableConfig.opensAt}—${cableConfig.closesAt}` },
    ],
    impact: ["操作同时作用上下站，不提供单站停用", "排队与在途人数保留，不清零"],
    hasBusiness: true,
  };
}

function buildSafety(): Facility[] {
  return visitorFixtures
    .filter((fixture) => fixture.kind === "safety")
    .map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      category: "safety" as const,
      regionId: fixture.regionId,
      regionName: regionName(fixture.regionId),
      safetyKind: fixture.safetyKind,
      sharedId: fixture.id,
      nodeId: fixture.id,
      stateMode: "full" as const,
      readonly: [
        { label: "安全类别", value: fixture.safetyKind ? safetyLabels[fixture.safetyKind] : "安全设施" },
        { label: "位置节点", value: nodeLabel(fixture.connectTo) },
        { label: "片区", value: regionName(fixture.regionId) },
      ],
      impact: ["只改变后台可用状态，不控制真实设备", "关联检修计划与告警在此只读展示"],
      hasBusiness: false,
    }));
}

function buildPointGroup(kind: "commercial" | "terminal" | "entrance", category: FacilityCategory): Facility[] {
  return points
    .filter((point) => point.kind === kind)
    .map((point) =>
      pointFacility(
        point.id,
        category,
        [
          { label: "区域", value: regionName(point.regionId) },
          { label: "营业说明", value: point.hours },
          { label: "共享配置名称", value: point.name },
        ],
        category === "entrance"
          ? ["入口服务停用只停止新使用，不删除入口广场路网节点", "景区出口 gate-out 是唯一配置出口，停用会被拒绝"]
          : ["不控制支付、远程开关机等真实设备", "不改变现有位置与服务信息"],
      ),
    )
    .filter((item): item is Facility => item !== null);
}

export const facilities: Facility[] = [
  ...buildAttractions(),
  ...buildRoads(),
  ...buildParking(),
  ...buildToilets(),
  buildCable(),
  ...buildSafety(),
  ...buildPointGroup("commercial", "commercial"),
  ...buildPointGroup("terminal", "terminal"),
  ...buildPointGroup("entrance", "entrance"),
].sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

export const facilityById: Record<string, Facility> = Object.fromEntries(facilities.map((item) => [item.id, item]));

export { kindLabels };

const regionRepresentatives: Record<string, string[]> = {
  Z0: ["entry"],
  Z1: ["r1"],
  Z2: ["r2"],
  Z3: ["r3"],
  Z4: ["r4"],
  Z5: ["r6"],
  Z6: ["r7"],
  Z7: ["r5"],
  Z8: ["entry", "r1", "r2", "r3", "r4", "r5", "r6", "r7"],
};

export interface PathCheckpointInput {
  facilityStates: Record<string, { state: string }>;
  parkingStats: Record<string, { capacity: number; occupied: number }>;
  restroomBaselines: Record<string, Record<RestroomPartKey, PartBaselineSample>>;
}

/** 检查起点：区域代表节点 + 所有开放景点 + 仍有样例占用的可定位节点。 */
export function buildPathCheckpoints(input: PathCheckpointInput): {
  checkpointNodes: string[];
  checkpointLabels: Record<string, PathCheckpoint>;
} {
  const labels: Record<string, PathCheckpoint> = {};
  const nodes = new Set<string>();
  const add = (nodeId: string, label: string, kind: PathCheckpoint["kind"]) => {
    if (!nodeById[nodeId]) return;
    nodes.add(nodeId);
    if (!labels[nodeId]) labels[nodeId] = { id: nodeId, label, kind };
  };

  add("gate-out", "景区出口", "region");
  for (const [regionId, nodeIds] of Object.entries(regionRepresentatives)) {
    for (const nodeId of nodeIds) {
      add(nodeId, `${regionName(regionId)}代表通行节点（${nodeLabel(nodeId)}）`, "region");
    }
  }

  for (const facility of facilities) {
    if (facility.category !== "attraction" || !facility.nodeId) continue;
    const state = input.facilityStates[facility.id]?.state ?? "open";
    if (state === "open") add(facility.nodeId, `${facility.name}（开放景点）`, "attraction");
  }

  for (const [lotId, stats] of Object.entries(input.parkingStats)) {
    if (stats.occupied > 0) add(lotId, `${pointById[lotId]?.name ?? lotId}（仍有占用车辆）`, "occupied");
  }
  for (const [toiletId, parts] of Object.entries(input.restroomBaselines)) {
    const occupied = RESTROOM_PART_KEYS.reduce((sum, key) => sum + (parts[key]?.occupied ?? 0), 0);
    if (occupied > 0) add(toiletId, `${pointById[toiletId]?.name ?? toiletId}（仍有使用中服务位）`, "occupied");
  }

  return { checkpointNodes: [...nodes], checkpointLabels: labels };
}
