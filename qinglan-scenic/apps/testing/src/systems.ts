import { defaultEndpoints } from "./catalog";
import { deliveryEndpoints } from './campus-handoff';
import { campusEndpoints, campusSystem, CAMPUS_SYSTEM_ID } from "./service-catalog";
import type { Endpoint, EndpointConfig, SystemConfig } from "./types";

export const STORAGE_KEY = "service-test-workbench.systems.v1";
export const DEFAULT_SYSTEM_ID = "default";
export const MAX_ENDPOINTS = 200;
const CATALOG_VERSION = 3;
const SERVICE_CATALOG_VERSION = 2;
export interface SystemStore {
  version: 1;
  catalogVersion?: number;
  serviceCatalogVersion?: number;
  activeId: string;
  systems: SystemConfig[];
}
const contractTemplates = [...defaultEndpoints, ...campusEndpoints, ...deliveryEndpoints];
export const cloneSystem = (system: SystemConfig): SystemConfig =>
  JSON.parse(JSON.stringify(system));
export function defaultSystem(): SystemConfig {
  return {
    id: DEFAULT_SYSTEM_ID,
    name: "默认服务",
    baseUrl: "/api/v1",
    endpoints: defaultEndpoints.map((e) => ({
      id: e.id,
      name: e.name,
      path: e.path,
      status: e.status,
      budget: e.budget,
      contractId: e.id,
    })),
  };
}
export function newEndpoint(): EndpointConfig {
  return {
    id: crypto.randomUUID(),
    name: "健康检查",
    path: "/health",
    status: 200,
    budget: 500,
  };
}
export function newSystem(): SystemConfig {
  return {
    id: crypto.randomUUID(),
    name: "新建系统",
    baseUrl: "/api/v1",
    endpoints: [newEndpoint()],
  };
}

export function validPath(value: unknown, query = true): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\s\\#]/.test(value)
  )
    return false;
  if (!query && value.includes("?")) return false;
  try {
    const decoded = decodeURIComponent(value.split("?")[0]);
    return (
      !decoded.startsWith("//") &&
      !/[\\\s#]/.test(decoded) &&
      !decoded.split("/").some((part) => part === ".." || part === ".")
    );
  } catch {
    return false;
  }
}
export function validBaseUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/.test(value))
    return false;
  if (value.startsWith("/")) return validPath(value, false);
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export function validateSystem(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["系统配置格式不正确"];
  const system = value as SystemConfig;
  const errors: string[] = [];
  if (
    typeof system.id !== "string" ||
    !system.id.trim() ||
    system.id.length > 100
  )
    errors.push("系统标识无效");
  if (
    typeof system.name !== "string" ||
    !system.name.trim() ||
    system.name.length > 40
  )
    errors.push("系统名称需为 1–40 个字符");
  if (!validBaseUrl(system.baseUrl))
    errors.push(
      "API 地址需为同源路径或 HTTP/HTTPS 地址，不能包含账号、查询参数或片段",
    );
  if (system.registration !== undefined) {
    const meta = system.registration;
    if (!meta || !["catalog", "discovery"].includes(meta.source) || meta.dataSource !== "local-manifest" ||
      ![meta.manifestId, meta.templateName, meta.publisher, meta.version].every(value => typeof value === "string" && value.length > 0 && value.length <= 100) ||
      (meta.source === "discovery" && (typeof meta.registeredAt !== "string" || !Number.isFinite(Date.parse(meta.registeredAt)))))
      errors.push("服务来源信息无效");
  }
  if (
    !Array.isArray(system.endpoints) ||
    !system.endpoints.length ||
    system.endpoints.length > MAX_ENDPOINTS
  )
    return [...errors, `每个系统需要 1–${MAX_ENDPOINTS} 个接口`];
  const ids = new Set<string>();
  system.endpoints.forEach((endpoint, index) => {
    const prefix = `接口 ${index + 1}：`;
    if (!endpoint || typeof endpoint !== "object") {
      errors.push(prefix + "配置格式不正确");
      return;
    }
    if (typeof endpoint.id !== "string" || !endpoint.id || ids.has(endpoint.id))
      errors.push(prefix + "标识无效或重复");
    ids.add(endpoint.id);
    if (
      typeof endpoint.name !== "string" ||
      !endpoint.name.trim() ||
      endpoint.name.length > 40
    )
      errors.push(prefix + "名称需为 1–40 个字符");
    if (endpoint.method !== undefined && !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(endpoint.method)) errors.push(prefix + 'HTTP方法无效');
    if (!validPath(endpoint.path) || endpoint.path.length > 2048)
      errors.push(prefix + "路径需以单个 / 开始，不能包含空格、片段或上级目录");
    if (
      !Number.isInteger(endpoint.status) ||
      endpoint.status < 100 ||
      endpoint.status > 599
    )
      errors.push(prefix + "预期状态码需为 100–599 的整数");
    if (
      !Number.isFinite(endpoint.budget) ||
      endpoint.budget < 1 ||
      endpoint.budget > 60000
    )
      errors.push(prefix + "延迟阈值需在 1–60,000 ms 之间");
    if (
      endpoint.contractId !== undefined &&
      !contractTemplates.some((e) => e.id === endpoint.contractId)
    )
      errors.push(prefix + "契约模板无效");
  });
  return errors;
}
export function resolveEndpoints(system: SystemConfig): Endpoint[] {
  return system.endpoints.map((config) => {
    const template = contractTemplates.find(
      (e) =>
        e.id === config.contractId &&
        e.path === config.path &&
        (e.id.startsWith('delivery-') || e.status === config.status),
    );
    if (template)
      return {
        ...template,
        ...config,
        baseline: template.fixtureBudget ? template.baseline : Math.min(template.baseline, config.budget * 0.25),
      };
    const emptyBody = [204, 205, 304].includes(config.status);
    return {
      ...config,
      group: "自定义接口",
      baseline: Math.min(65, config.budget * 0.25),
      contract: emptyBody ? "响应无需内容" : "响应为有效 JSON",
      validate: (body: unknown) => emptyBody || body !== undefined,
      fixture: emptyBody
        ? undefined
        : { data: { ok: true, service: system.name, endpoint: config.name } },
    };
  });
}
export function requestUrl(
  system: SystemConfig,
  endpoint: EndpointConfig,
): string {
  if (
    !validBaseUrl(system.baseUrl) ||
    !validPath(endpoint.path) ||
    !system.endpoints.some(
      (e) => e.id === endpoint.id && e.path === endpoint.path,
    )
  )
    throw new Error("请求不在当前系统接口配置中");
  return `${system.baseUrl.replace(/\/+$/, "")}${endpoint.path}`;
}
export function loadSystems(storage: Pick<Storage, "getItem">): {
  store: SystemStore;
  recovered: boolean;
  upgraded?: boolean;
  catalogUpdated?: boolean;
  servicesUpdated?: boolean;
  campusUpgraded?: boolean;
} {
  const fallback = (): SystemStore => ({
    version: 1,
    catalogVersion: CATALOG_VERSION,
    serviceCatalogVersion: SERVICE_CATALOG_VERSION,
    activeId: DEFAULT_SYSTEM_ID,
    systems: [defaultSystem(), campusSystem()],
  });
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { store: fallback(), recovered: false, servicesUpdated: true };
    const store = JSON.parse(raw) as SystemStore;
    if (
      store.version !== 1 ||
      !Array.isArray(store.systems) ||
      !store.systems.length ||
      store.systems.length > 20 ||
      store.systems.some((s) => validateSystem(s).length) ||
      new Set(store.systems.map((s) => s.id)).size !== store.systems.length ||
      !store.systems.some((s) => s.id === DEFAULT_SYSTEM_ID)
    )
      throw new Error("Invalid configuration");
    if (!store.systems.some((s) => s.id === store.activeId))
      store.activeId = DEFAULT_SYSTEM_ID;
    // Upgrade only the untouched original catalog; preserve edited and custom systems.
    const current = store.systems.find((system) => system.id === DEFAULT_SYSTEM_ID)!;
    const original = defaultSystem();
    const catalogUpdated = (store.catalogVersion ?? 0) < CATALOG_VERSION;
    const legacyCount = current.endpoints.length === 30 ? 30 : !store.catalogVersion ? 9 : 0;
    const legacyIds = new Set(original.endpoints.slice(0, legacyCount).map(endpoint => endpoint.id));
    let upgraded = false;
    if (catalogUpdated && legacyCount && current.name === original.name && current.baseUrl === original.baseUrl &&
      current.endpoints.length === legacyIds.size && current.endpoints.every((endpoint) => {
        const expected = original.endpoints.find((item) => item.id === endpoint.id);
        return legacyIds.has(endpoint.id) && expected &&
          (["name", "path", "status", "budget", "contractId"] as const).every((key) => endpoint[key] === expected[key]);
      })) {
      current.endpoints.push(...original.endpoints.filter((endpoint) => !legacyIds.has(endpoint.id)));
      upgraded = true;
    }
    // Mark the migration as considered even for edited catalogs, so later deletions stay deleted.
    if (catalogUpdated) store.catalogVersion = CATALOG_VERSION;
    const servicesUpdated = (store.serviceCatalogVersion ?? 0) < SERVICE_CATALOG_VERSION;
    let campusUpgraded = false;
    if (servicesUpdated) {
      const campus = store.systems.find(system => system.id === CAMPUS_SYSTEM_ID);
      const template = campusSystem();
      if (!store.serviceCatalogVersion && !campus && store.systems.length < 20) store.systems.push(template);
      const oldEndpoints = new Map(template.endpoints.slice(0, 30).map(endpoint => [endpoint.id, endpoint]));
      if (campus && campus.name === template.name && campus.baseUrl === template.baseUrl &&
        campus.endpoints.length === oldEndpoints.size && campus.endpoints.every(endpoint => {
          const expected = oldEndpoints.get(endpoint.id);
          return expected && (["name", "path", "status", "budget", "contractId"] as const).every(key => endpoint[key] === expected[key]);
        })) {
        campus.endpoints.push(...template.endpoints.slice(30));
        campusUpgraded = true;
      }
      // Preserve edited catalogs, discovered platforms and intentionally removed campus entries.
      store.serviceCatalogVersion = SERVICE_CATALOG_VERSION;
    }
    return { store, recovered: false, upgraded, catalogUpdated, servicesUpdated, campusUpgraded };
  } catch {
    return { store: fallback(), recovered: true };
  }
}
export function persistSystems(
  storage: Pick<Storage, "setItem">,
  store: SystemStore,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
