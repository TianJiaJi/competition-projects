import { platformSystem, publishedPlatforms } from "./service-catalog";
import { resolveEndpoints, validateSystem } from "./systems";
import type { SystemConfig } from "./types";

export interface DiscoveryEvent {
  platformId: string; at: string; stage: "found" | "validated" | "ready" | "existing" | "limit" | "rejected" | "registered";
  message: string;
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** Read local release manifests and validate contracts; never infer network reachability. */
export async function discoverServices(existing: SystemConfig[], signal: AbortSignal, publish: (event: DiscoveryEvent) => void, pace = 420): Promise<SystemConfig[]> {
  const known = new Set(existing.flatMap(system => [system.id, system.registration?.manifestId].filter((id): id is string => !!id)));
  const added: SystemConfig[] = [];
  const event = (platformId: string, stage: DiscoveryEvent["stage"], message: string) => {
    signal.throwIfAborted();
    publish({ platformId, stage, message, at: new Date().toISOString() });
  };
  for (const platform of publishedPlatforms) {
    await wait(pace, signal);
    if (known.has(platform.id)) { event(platform.id, "existing", "服务已在测试目录中，保留现有配置"); continue; }
    event(platform.id, "found", `已识别 ${platform.templateName} 的平台发布清单`);
    if (existing.length + added.length >= 20) { event(platform.id, "limit", "系统目录已达 20 项，请释放名额后重试"); continue; }
    await wait(pace, signal);
    const system = platformSystem(platform, new Date().toISOString());
    const errors = validateSystem(system), endpoints = resolveEndpoints(system);
    if (errors.length || endpoints.some(endpoint => !endpoint.validate(endpoint.fixture))) {
      event(platform.id, "rejected", "发布清单未通过契约校验，未加入目录"); continue;
    }
    event(platform.id, "validated", `${endpoints.length} 项接口契约已校验 · ${new Set(endpoints.map(endpoint => endpoint.group)).size} 个业务分组`);
    await wait(pace, signal);
    added.push(system); known.add(platform.id);
    event(platform.id, "ready", "已生成接口目录、预期状态码与延迟阈值");
  }
  signal.throwIfAborted();
  return added;
}
