import type { FieldError } from "./result";

/** 需求文档 §2.3 的内容限制；字符按 Unicode 码点计数。 */
export const LIMITS = {
  scenicName: { min: 1, max: 60 },
  title: { min: 1, max: 100 },
  summary: { min: 1, max: 300 },
  addressOrHours: { min: 1, max: 200 },
  markdownBody: { min: 1, max: 20_000 },
  noticeBody: { min: 1, max: 2_000 },
  instruction: { min: 1, max: 500 },
  reason: { min: 1, max: 200 },
  reportNote: { min: 1, max: 300 },
  keyword: { min: 0, max: 60 },
} as const;

export const PHONE_PATTERN = /^[0-9+\-\s]+$/;
export const PHONE_MIN = 7;
export const PHONE_MAX = 20;
export const POI_IMAGE_MAX = 6;
export const MUTE_MINUTES = { min: 1, max: 1440, default: 10 };

export function codePointLength(value: string): number {
  return [...value].length;
}

export function trimmedLength(value: string): number {
  return codePointLength(value.trim());
}

export interface Limit {
  min: number;
  max: number;
}

export function checkText(value: unknown, field: string, limit: Limit, label: string): FieldError | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { field, message: `${label}不能为空` };
  }
  const length = trimmedLength(value);
  if (length < limit.min) return { field, message: `${label}至少 ${limit.min} 字` };
  if (length > limit.max) return { field, message: `${label}不超过 ${limit.max} 字（当前 ${length} 字）` };
  return null;
}

export function checkPhone(value: unknown, field = "servicePhone"): FieldError | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { field, message: "服务电话不能为空" };
  if (!PHONE_PATTERN.test(text)) return { field, message: "服务电话只能包含数字、+、空格与连字符" };
  if (text.length < PHONE_MIN || text.length > PHONE_MAX) {
    return { field, message: `服务电话长度为 ${PHONE_MIN}—${PHONE_MAX} 位` };
  }
  return null;
}

export function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function collectErrors(errors: Array<FieldError | null>): FieldError[] {
  return errors.filter((error): error is FieldError => error !== null);
}

export function firstError(errors: FieldError[]): FieldError | undefined {
  return errors[0];
}
