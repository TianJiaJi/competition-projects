import { formatDateTime } from "../core/time";
import type { ServiceStatusData } from "../core/types";
import { ok, type ApiResult } from "../core/result";
import { requireStaff, runtimeInfo } from "./store";
import {api,requestError} from "./store";

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
  try{const data=await api.request<any>('/admin/service-status');const ids:Record<string,string>={visitor:'guide',mobile:'visitor',gate:'staff',ops:'screen',admin:'admin',backend:'backend',devices:'devices'};return ok({source:'live',checkedAt:data.checkedAt,modules:data.modules.map((m:any)=>({id:ids[m.id],healthyCount:m.healthy,abnormalCount:m.unhealthy,unknownCount:m.unknown,checkedAt:m.checkedAt})),sampleReadAt:Date.now(),sampleReadAtText:formatDateTime(Date.now())});}catch(e){return requestError(e);}
}
