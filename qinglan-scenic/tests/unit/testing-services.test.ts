import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campusSystem, platformSystem, publishedPlatforms } from "../../apps/testing/src/service-catalog";
import { discoverServices, type DiscoveryEvent } from "../../apps/testing/src/service-discovery";
import { defaultSystem, loadSystems, resolveEndpoints, validateSystem } from "../../apps/testing/src/systems";
import { modelSample, simulatedSample } from "../../apps/testing/src/engine";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("campus catalog and release discovery", () => {
  it("provides 110 grouped campus contracts with anonymous, coherent B1/F4/T1 records", () => {
    const system = campusSystem(), endpoints = resolveEndpoints(system);
    expect(validateSystem(system)).toEqual([]);
    expect(endpoints).toHaveLength(110);
    expect(new Set(endpoints.map(endpoint => endpoint.id)).size).toBe(110);
    expect(new Set(endpoints.map(endpoint => endpoint.path)).size).toBe(110);
    expect(new Set(endpoints.map(endpoint => endpoint.group)).size).toBe(8);
    for (const group of ["平台基础", "校园空间", "设施运维", "后勤工单", "教学服务", "权限审计"])
      expect(endpoints.filter(endpoint => endpoint.group === group)).toHaveLength(15);
    for (const group of ["生活服务", "安全巡检"])
      expect(endpoints.filter(endpoint => endpoint.group === group)).toHaveLength(10);
    for (const endpoint of endpoints) {
      expect(modelSample(endpoint).outcome).toBe("passed");
      expect(endpoint.validate({ data: {} })).toBe(false);
      expect(endpoint.validate(null)).toBe(false);
    }
    expect(endpoints.find(endpoint => endpoint.id === "campus-task")?.fixture).toMatchObject({ data: { id: "T1", facilityId: "F4", buildingId: "B1" } });
    expect(endpoints.find(endpoint => endpoint.id === "campus-facility-work-orders")?.fixture).toMatchObject({ data: { items: [{ id: "T1", facilityId: "F4", buildingId: "B1", status: "pending" }] } });
  });
  it("rejects malformed added business payloads", () => {
    const endpoints = resolveEndpoints(campusSystem());
    const find = (id: string) => endpoints.find(endpoint => endpoint.id === `campus-${id}`)!;
    expect(find("inspection-summary").validate({ data: { totalCheckpoints: 64, checked: -1, normal: 64, coverage: 1 } })).toBe(false);
    expect(find("dorm-rooms").validate({ data: { items: [null], total: 1, page: 1, pageSize: 20 } })).toBe(false);
    expect(find("task-eligibility").validate({ data: { orderId: "T1", accountId: "STAFF-01", eligible: false, version: 0 } })).toBe(false);
  });
  it("runs all 110 campus samples without business network requests", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const pending = Promise.all(resolveEndpoints(campusSystem()).map((endpoint, index) => simulatedSample(endpoint, index, new AbortController().signal)));
    await vi.runAllTimersAsync();
    const samples = await pending;
    expect(samples).toHaveLength(110);
    expect(samples.every(sample => sample.source === "model" && sample.outcome === "passed")).toBe(true);
    expect(samples.flatMap(sample => sample.checks)).toHaveLength(330);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("upgrades untouched thirty-case campus catalogs once and preserves order, selection and discovered services", () => {
    const campus = campusSystem(); campus.endpoints = campus.endpoints.slice(0, 30).reverse();
    const discovered = platformSystem(publishedPlatforms[0], "2026-10-10T00:00:00Z");
    const store = { version: 1, catalogVersion: 3, serviceCatalogVersion: 1, activeId: campus.id, systems: [defaultSystem(), campus, discovered] };
    const loaded = loadSystems({ getItem: () => JSON.stringify(store) });
    expect(loaded).toMatchObject({ campusUpgraded: true, servicesUpdated: true, recovered: false });
    expect(loaded.store.serviceCatalogVersion).toBe(2);
    expect(loaded.store.activeId).toBe(campus.id);
    expect(loaded.store.systems[0]).toEqual(store.systems[0]);
    expect(loaded.store.systems[1].endpoints).toHaveLength(110);
    expect(loaded.store.systems[1].endpoints.slice(0, 30)).toEqual(campus.endpoints);
    expect(loaded.store.systems[1].registration).toEqual(campus.registration);
    expect(loaded.store.systems[2]).toEqual(discovered);
    expect(loadSystems({ getItem: () => JSON.stringify(loaded.store) }).store).toEqual(loaded.store);
    loaded.store.systems[1].endpoints = loaded.store.systems[1].endpoints.slice(0, 30);
    expect(loadSystems({ getItem: () => JSON.stringify(loaded.store) }).store).toEqual(loaded.store);
  });
  it.each(["name", "path", "budget", "deletion"])("preserves campus edits to %s", field => {
    const campus = campusSystem(); campus.endpoints = campus.endpoints.slice(0, 30);
    if (field === "name") campus.name = "自定义校园";
    if (field === "path") campus.endpoints[0].path = "/custom-health";
    if (field === "budget") campus.endpoints[0].budget = 300;
    if (field === "deletion") campus.endpoints.pop();
    const loaded = loadSystems({ getItem: () => JSON.stringify({ version: 1, catalogVersion: 3, serviceCatalogVersion: 1, activeId: campus.id, systems: [defaultSystem(), campus] }) });
    expect(loaded.campusUpgraded).toBe(false);
    expect(loaded.store.systems[1]).toEqual(campus);
    expect(loaded.store.serviceCatalogVersion).toBe(2);
  });
  it("does not restore a previously deleted campus catalog during the version upgrade", () => {
    const loaded = loadSystems({ getItem: () => JSON.stringify({ version: 1, catalogVersion: 3, serviceCatalogVersion: 1, activeId: "default", systems: [defaultSystem()] }) });
    expect(loaded.store.systems).toEqual([defaultSystem()]);
    expect(loaded.store.serviceCatalogVersion).toBe(2);
    expect(loaded.campusUpgraded).toBe(false);
  });
  it("adds campus once while preserving edited systems, selection, and later explicit deletion", () => {
    const edited = { ...defaultSystem(), name: "保留名称", baseUrl: "/custom", endpoints: defaultSystem().endpoints.slice(0, 5) };
    const loaded = loadSystems({ getItem: () => JSON.stringify({ version: 1, activeId: "default", systems: [edited] }) });
    expect(loaded.servicesUpdated).toBe(true);
    expect(loaded.store.systems).toEqual([edited, campusSystem()]);
    expect(loaded.store.activeId).toBe("default");
    expect(loadSystems({ getItem: () => JSON.stringify(loaded.store) }).store).toEqual(loaded.store);
    loaded.store.systems.pop();
    expect(loadSystems({ getItem: () => JSON.stringify(loaded.store) }).store.systems).toEqual([edited]);
  });
  it("parses and validates three manifests without networking, then deduplicates without overwriting edits", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const events: DiscoveryEvent[] = [], current = [defaultSystem(), campusSystem()];
    const pending = discoverServices(current, new AbortController().signal, event => events.push(event));
    await vi.runAllTimersAsync(); const additions = await pending;
    expect(additions).toHaveLength(3);
    expect(additions.map(system => system.id)).toEqual(publishedPlatforms.map(platform => platform.id));
    for (const system of additions) {
      expect(system.endpoints).toHaveLength(12);
      expect(validateSystem(system)).toEqual([]);
      expect(system.registration).toMatchObject({ source: "discovery", dataSource: "local-manifest" });
      expect(resolveEndpoints(system).every(endpoint => endpoint.validate(endpoint.fixture))).toBe(true);
    }
    expect(events.map(event => event.stage)).toEqual(Array(3).fill(["found", "validated", "ready"]).flat());
    additions[0].name = "改名后的后勤";
    const repeated = discoverServices([...current, ...additions], new AbortController().signal, event => events.push(event));
    await vi.runAllTimersAsync(); expect(await repeated).toEqual([]);
    expect(additions[0].name).toBe("改名后的后勤");
    expect(events.slice(-3).every(event => event.stage === "existing")).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("respects twenty-system capacity in both catalog migration and discovery", async () => {
    const current = Array.from({ length: 20 }, (_, index) => ({ ...defaultSystem(), id: index ? `system-${index}` : "default" }));
    const migrated = loadSystems({ getItem: () => JSON.stringify({ version: 1, activeId: "default", systems: current }) });
    expect(migrated.store.systems).toHaveLength(20);
    const events: DiscoveryEvent[] = [], pending = discoverServices(current, new AbortController().signal, event => events.push(event));
    await vi.runAllTimersAsync(); expect(await pending).toEqual([]);
    expect(events.filter(event => event.stage === "limit")).toHaveLength(3);
  });
  it("aborts a partially parsed scan without returning registrations or writing later events", async () => {
    const controller = new AbortController(), publish = vi.fn();
    const pending = discoverServices([], controller.signal, publish).catch(error => error);
    await vi.advanceTimersByTimeAsync(900);
    controller.abort(); const calls = publish.mock.calls.length;
    await vi.runAllTimersAsync();
    expect((await pending).name).toBe("AbortError");
    expect(publish).toHaveBeenCalledTimes(calls);
    expect(calls).toBe(2);
  });
});
