export type AdminErrorCode =
  | "NETWORK_ERROR"
  | "VERSION_CONFLICT"
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RUN_EXPIRED"
  | "SLOT_FULL"
  | "ORDER_STATE_CONFLICT"
  | "FACILITY_CLOSED"
  | "MOCK_STORAGE_FAILED"
  | "MOCK_STORAGE_CONFLICT"
  | "RETURN_PATH_BLOCKED"
  | "INSPECTION_PLAN_CONFLICT";

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  code: AdminErrorCode;
  message: string;
  fieldErrors?: FieldError[];
  /** 冲突对象与影响名称，例如被阻塞的区域或计划。 */
  details?: string[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function fail(code: AdminErrorCode, message: string, extra: Omit<ApiError, "code" | "message"> = {}): ApiResult<never> {
  return { ok: false, error: { code, message, ...extra } };
}

export function failFrom(error: ApiError): ApiResult<never> {
  return { ok: false, error };
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

export const errorMessages: Record<AdminErrorCode, string> = {
  NETWORK_ERROR: "连接后端失败，请重试。",
  VERSION_CONFLICT: "数据已更新，请重新读取后再提交。",
  VALIDATION_ERROR: "提交内容不符合要求，请检查标红字段。",
  AUTH_REQUIRED: "需要以员工身份登录后才能访问。",
  FORBIDDEN: "当前账号没有该操作权限。",
  NOT_FOUND: "没有找到对应的数据。",
  RUN_EXPIRED: "当前业务数据已失效，不能继续读写。",
  SLOT_FULL: "目标时段剩余名额不足。",
  ORDER_STATE_CONFLICT: "订单当前状态不允许该操作。",
  FACILITY_CLOSED: "目标设施当前不可用。",
  MOCK_STORAGE_FAILED: "本地保存失败，数据未变更。",
  MOCK_STORAGE_CONFLICT: "其他标签已更改后台数据，请重新加载后继续保存。",
  RETURN_PATH_BLOCKED: "该变更会造成返程通路中断，已拒绝。",
  INSPECTION_PLAN_CONFLICT: "同一设施只能有一份启用中的检修计划。",
};

/** 写请求标识：提交超时后用同一标识重试不会重复执行。 */
export function createActionId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
