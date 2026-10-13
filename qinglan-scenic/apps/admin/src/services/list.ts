import { fail, ok, type ApiResult } from "../core/result";

export interface ListQuery {
  page?: number;
  pageSize?: number;
}

export const PAGE_SIZES = [20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function normalizeQuery(query: ListQuery = {}): { page: number; pageSize: number } {
  const requested = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requested) ? requested : DEFAULT_PAGE_SIZE;
  const page = Number.isInteger(query.page) && (query.page as number) > 0 ? (query.page as number) : 1;
  return { page, pageSize };
}

/** 先完成全部筛选再分页；页码越界时回到最近有效页。 */
export function paginate<T>(items: T[], query: ListQuery = {}): ListResult<T> {
  const { page, pageSize } = normalizeQuery(query);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export function matchKeyword(keyword: string | undefined, values: Array<string | undefined>): boolean {
  const query = (keyword ?? "").trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(query));
}

export function sortByUpdatedDesc<T extends { updatedAt: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.updatedAt === a.updatedAt ? a.id.localeCompare(b.id) : b.updatedAt - a.updatedAt));
}

export function notFound(message = "没有找到对应的数据。"): ApiResult<never> {
  return fail("NOT_FOUND", message);
}

export function validation(message: string, fieldErrors?: Array<{ field: string; message: string }>): ApiResult<never> {
  return fail("VALIDATION_ERROR", message, fieldErrors ? { fieldErrors } : {});
}

export { ok, fail };
