import type { ServiceModuleId, ServiceStatusData } from "./types";

export const serviceModules: ReadonlyArray<{ id: ServiceModuleId; name: string; scope: string; primary: boolean }> = [
  { id: "backend", name: "后端服务", scope: "业务 API、数据库、实时推送、仿真、聚合预测、路线服务、知识检索、模型适配", primary: true },
  { id: "devices", name: "园区遥感设备", scope: "按设备统计 · 客流摄像头、环境传感器、停车检测、入园识别", primary: true },
  { id: "guide", name: "导览", scope: "按导览终端统计", primary: false },
  { id: "admin", name: "管理员面板", scope: "页面访问、接口连接、实时同步", primary: false },
  { id: "visitor", name: "游客端小程序", scope: "页面访问、接口连接、实时同步", primary: false },
  { id: "staff", name: "员工端", scope: "页面访问、接口连接、反馈同步", primary: false },
  { id: "screen", name: "数据大屏", scope: "按屏幕统计", primary: false },
];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validDetectionTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

/** 顶层失败作为读取失败；单模块缺失或损坏只影响该卡片。 */
export function isServiceStatusSnapshot(value: unknown): value is ServiceStatusData {
  return record(value) && (value.source === "mock" || value.source === "live")
    && validDetectionTime(value.checkedAt) && Array.isArray(value.modules);
}

export function serviceHealthCards(modules: unknown) {
  const rows = Array.isArray(modules) ? modules.filter(record) : [];
  return serviceModules.map(module => {
    const matches = rows.filter(row => row.id === module.id);
    const node = matches[0];
    const counts = node ? [node.healthyCount, node.abnormalCount, node.unknownCount] : [];
    const validCounts = counts.length === 3 && counts.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
    const total = validCounts ? (counts as number[]).reduce((sum, value) => sum + value, 0) : 0;
    const available = matches.length === 1 && validCounts && Number.isSafeInteger(total) && validDetectionTime(node?.checkedAt);
    const healthy = available ? node!.healthyCount as number : 0;
    const abnormal = available ? node!.abnormalCount as number : 0;
    const unknown = available ? node!.unknownCount as number : 0;
    const healthyPercent = available && total > 0 ? healthy / total * 100 : 0;
    const abnormalPercent = available && total > 0 ? abnormal / total * 100 : 0;
    return {
      ...module, available, total: available ? total : 0, healthy, abnormal, unknown,
      healthyPercent, abnormalPercent,
      percentage: available && total > 0 ? `${(Number.isInteger(healthyPercent) ? healthyPercent : healthyPercent.toFixed(2))}%` : "—",
      message: !available ? "检测数据不可用" : total === 0 ? "暂无检测数据" : "健康率",
    };
  });
}
