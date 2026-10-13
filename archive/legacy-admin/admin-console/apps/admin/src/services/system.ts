import { businessNow, formatDateTime, toIsoString } from "../core/time";
import type { ServiceStatusData } from "../core/types";
import { ok, type ApiResult } from "../core/result";
import { getRun, requireStaff, runtimeInfo } from "./store";

async function settle<T>(value: T, ms = 120): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export interface ServiceStatusView extends ServiceStatusData {
  /** 本次样例读取的真实时间，与最近快照时间分开显示。 */
  sampleReadAt: number;
  sampleReadAtText: string;
  runtimeMessage?: string;
}

export async function getServiceStatus(): Promise<ApiResult<ServiceStatusView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  const readAt = Date.now();
  const snapshot = Date.parse(run.businessTime);
  return settle(
    ok({
      backend: "ready",
      database: "ready",
      llm: "unknown",
      appVersion: "admin-mock-0.1.0",
      lastSnapshotAt: toIsoString(snapshot),
      connections: 3,
      sampleReadAt: readAt,
      sampleReadAtText: formatDateTime(readAt),
      runtimeMessage: runtimeInfo().message,
    }),
  );
}

export function serviceStatusNote(): string {
  return `所有状态均为预置样例，业务时间为固定值 ${formatDateTime(businessNow())}。`;
}
