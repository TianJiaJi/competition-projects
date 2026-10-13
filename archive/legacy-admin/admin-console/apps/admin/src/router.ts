import { computed, type ComputedRef } from "vue";
import { routePath, setHash } from "./app/state";

export type RouteName =
  | "login"
  | "overview"
  | "scenic"
  | "articles"
  | "article-new"
  | "article-edit"
  | "pois"
  | "poi-edit"
  | "notices"
  | "orders"
  | "slots"
  | "facilities"
  | "inspections"
  | "alerts"
  | "users"
  | "chat"
  | "knowledge"
  | "service-status"
  | "not-found";

export interface RouteMatch {
  name: RouteName;
  path: string;
  params: Record<string, string>;
  label: string;
  public: boolean;
}

interface RouteDefinition {
  name: RouteName;
  pattern: string;
  label: string;
  public?: boolean;
}

export const routeDefinitions: RouteDefinition[] = [
  { name: "login", pattern: "/login", label: "员工登录", public: true },
  { name: "overview", pattern: "/overview", label: "工作台" },
  { name: "scenic", pattern: "/content/scenic", label: "景区资料" },
  { name: "articles", pattern: "/content/articles", label: "资讯与指南" },
  { name: "article-new", pattern: "/content/articles/new", label: "新增内容" },
  { name: "article-edit", pattern: "/content/articles/:id/edit", label: "编辑内容" },
  { name: "pois", pattern: "/content/pois", label: "景点介绍" },
  { name: "poi-edit", pattern: "/content/pois/:id/edit", label: "编辑景点" },
  { name: "notices", pattern: "/notices", label: "公告管理" },
  { name: "orders", pattern: "/orders", label: "订单管理" },
  { name: "slots", pattern: "/booking/slots", label: "预约配额" },
  { name: "facilities", pattern: "/facilities", label: "设施运行" },
  { name: "inspections", pattern: "/inspections", label: "检修计划" },
  { name: "alerts", pattern: "/alerts", label: "告警记录" },
  { name: "users", pattern: "/users", label: "用户管理" },
  { name: "chat", pattern: "/chat", label: "聊天管理" },
  { name: "knowledge", pattern: "/knowledge", label: "知识查看" },
  { name: "service-status", pattern: "/service-status", label: "服务状态" },
];

export const sidebarGroups: Array<{ title: string; items: Array<{ name: RouteName; path: string; label: string }> }> = [
  { title: "概览", items: [{ name: "overview", path: "/overview", label: "工作台" }] },
  {
    title: "内容管理",
    items: [
      { name: "scenic", path: "/content/scenic", label: "景区资料" },
      { name: "articles", path: "/content/articles", label: "资讯与指南" },
      { name: "pois", path: "/content/pois", label: "景点介绍" },
    ],
  },
  { title: "公告与订单", items: [{ name: "notices", path: "/notices", label: "公告管理" }, { name: "orders", path: "/orders", label: "订单管理" }, { name: "slots", path: "/booking/slots", label: "预约配额" }] },
  { title: "运行保障", items: [{ name: "facilities", path: "/facilities", label: "设施运行" }, { name: "inspections", path: "/inspections", label: "检修计划" }, { name: "alerts", path: "/alerts", label: "告警记录" }] },
  { title: "账号与互动", items: [{ name: "users", path: "/users", label: "用户管理" }, { name: "chat", path: "/chat", label: "聊天管理" }, { name: "knowledge", path: "/knowledge", label: "知识查看" }] },
  { title: "系统", items: [{ name: "service-status", path: "/service-status", label: "服务状态" }] },
];

export function resolveRoute(path: string): RouteMatch {
  const clean = path.split("?")[0] || "/overview";
  for (const definition of routeDefinitions) {
    const params = matchPattern(definition.pattern, clean);
    if (params) {
      return {
        name: definition.name,
        path: clean,
        params,
        label: definition.label,
        public: Boolean(definition.public),
      };
    }
  }
  return { name: "not-found", path: clean, params: {}, label: "未知页面", public: false };
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(":")) {
      try {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      } catch {
        return null;
      }
      continue;
    }
    if (patternPart !== pathPart) return null;
  }
  return params;
}

export function matchFor(path: string): RouteMatch {
  const parsed = new URLSearchParams(path.includes("?") ? path.split("?")[1] : "");
  const base = resolveRoute(path);
  const params: Record<string, string> = { ...base.params };
  for (const [key, value] of parsed.entries()) params[`query.${key}`] = value;
  return { ...base, params };
}

export function useRoute(): ComputedRef<RouteMatch> {
  return computed(() => matchFor(routePath.value));
}

export function linkTo(path: string): string {
  return `#${path}`;
}

export function navigateTo(path: string, replace = false): void {
  setHash(path, replace);
}

export function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}
