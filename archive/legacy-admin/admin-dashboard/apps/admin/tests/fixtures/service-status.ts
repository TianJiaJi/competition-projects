import type { ServiceStatusData } from "../../src/core/types";

// 固定监控样例，不跟随业务时钟或刷新重新生成；真实后端尚未实现。
const checkedAt = "2026-09-12T14:30:00+08:00";
export function createServiceStatusSample(): ServiceStatusData {
  return {
    source: "mock",
    checkedAt,
    modules: [
      { id: "backend", healthyCount: 7, abnormalCount: 0, unknownCount: 1, checkedAt },
      { id: "devices", healthyCount: 46, abnormalCount: 2, unknownCount: 0, checkedAt },
      { id: "guide", healthyCount: 6, abnormalCount: 0, unknownCount: 0, checkedAt },
      { id: "admin", healthyCount: 3, abnormalCount: 0, unknownCount: 0, checkedAt },
      { id: "visitor", healthyCount: 3, abnormalCount: 0, unknownCount: 0, checkedAt },
      { id: "staff", healthyCount: 2, abnormalCount: 1, unknownCount: 0, checkedAt },
      { id: "screen", healthyCount: 2, abnormalCount: 0, unknownCount: 0, checkedAt },
    ],
  };
}
