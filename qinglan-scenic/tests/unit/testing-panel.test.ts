import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assess,
  simulatedSample,
  loadReportSummary,
  modelSample,
  modeledThroughput,
  normalizeConfig,
  percentile,
  PressureSchedule,
  reportDocument,
  retainReports,
  startLoadSession,
  summarize,
  type LoadConfig,
  type Report,
} from "../../apps/testing/src/engine";
import {
  defaultSystem,
  MAX_ENDPOINTS,
  loadSystems,
  newSystem,
  persistSystems,
  requestUrl,
  resolveEndpoints,
  STORAGE_KEY,
  validateSystem,
} from "../../apps/testing/src/systems";
import { loadReportHtml } from "../../apps/testing/src/report-export";
const system = defaultSystem(),
  endpoints = resolveEndpoints(system);
const config: LoadConfig = {
  concurrency: 200,
  duration: 60,
  rps: 120,
  endpointId: "live",
};
const response = () =>
  new Response(
    JSON.stringify({ data: { ok: true }, meta: { requestId: "actual-123" } }),
    { status: 200 },
  );
const clock = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("system configuration", () => {
  it("provides 110 valid read-only cases while preserving the original contracts", () => {
    expect(validateSystem(system)).toEqual([]);
    expect(endpoints).toHaveLength(110);
    expect(new Set(endpoints.map(endpoint => endpoint.id)).size).toBe(110);
    expect(endpoints.every((e) => modelSample(e).outcome === "passed")).toBe(
      true,
    );
    expect(endpoints.find((e) => e.id === "snapshot")?.name).toBe("业务概览");
    expect(endpoints.find((e) => e.id === "auth")?.status).toBe(401);
    for (const endpoint of endpoints)
      expect(assess(endpoint, endpoint.status, null, 1)[1].passed).toBe(false);
  });
  it("checks paging, resource identity and expected rejection contracts", () => {
    const find = (id: string) => endpoints.find(endpoint => endpoint.id === id)!;
    expect(find("article-next").validate({ data: { page: 1, pageSize: 5, total: 0, items: [] } })).toBe(false);
    expect(find("article-small").validate({ data: { page: 1, pageSize: 1, total: 2, items: [{ id: "a" }, { id: "b" }] } })).toBe(false);
    expect(find("poi-unique").validate({ data: { items: [{ id: "a" }, { id: "a" }] } })).toBe(false);
    expect(find("point-status").validate({ data: { points: null } })).toBe(false);
    const boundary = find("article-page-zero");
    expect(assess(boundary, 400, boundary.fixture, 12).every(check => check.passed)).toBe(true);
    expect(assess(boundary, 200, boundary.fixture, 12)[0].passed).toBe(false);
  });
  it("validates the eight additional business groups and their payload fields", () => {
    const added = endpoints.slice(30);
    const groups = [...new Set(added.map(endpoint => endpoint.group))];
    expect(groups).toHaveLength(8);
    for (const group of groups) expect(added.filter(endpoint => endpoint.group === group)).toHaveLength(10);
    for (const endpoint of added) {
      expect(endpoint.validate(endpoint.fixture)).toBe(true);
      expect(endpoint.validate({ data: {} })).toBe(false);
    }
    const orders = endpoints.find(endpoint => endpoint.id === "scenic-my-orders")!;
    expect(orders.validate({ data: { items: [null], total: 1, page: 1, pageSize: 20 } })).toBe(false);
    expect(orders.validate({ data: { items: [], total: -1, page: 1, pageSize: 20 } })).toBe(false);
    expect(orders.validate({ data: { items: [], total: Infinity, page: 1, pageSize: 20 } })).toBe(false);
  });
  it("upgrades an untouched nine-case catalog once without overwriting other systems", () => {
    const legacy = defaultSystem();
    legacy.endpoints = legacy.endpoints.slice(0, 9);
    const custom = newSystem();
    const stored = { version: 1, activeId: custom.id, systems: [legacy, custom] };
    const loaded = loadSystems({ getItem: () => JSON.stringify(stored) });
    expect(loaded.upgraded).toBe(true);
    expect(loaded.store.systems[0].endpoints).toHaveLength(110);
    expect(loaded.store.systems[1]).toEqual(custom);
    expect(loaded.store.activeId).toBe(custom.id);
    loaded.store.systems[0].endpoints = loaded.store.systems[0].endpoints.slice(0, 9);
    expect(loadSystems({ getItem: () => JSON.stringify(loaded.store) }).store.systems[0].endpoints).toHaveLength(9);
    legacy.endpoints[0].budget = 150;
    const edited = loadSystems({ getItem: () => JSON.stringify(stored) });
    expect(edited.upgraded).not.toBe(true);
    expect(edited.store.systems[0]).toEqual(legacy);
  });
  it("upgrades the untouched thirty-case catalog once while retaining selection and custom systems", () => {
    const legacy = defaultSystem();
    legacy.endpoints = legacy.endpoints.slice(0, 30).reverse();
    const custom = { ...structuredClone(legacy), id: "copied-system", name: "景区副本" };
    const stored = { version: 1, catalogVersion: 2, serviceCatalogVersion: 1, activeId: custom.id, systems: [legacy, custom] };
    const loaded = loadSystems({ getItem: () => JSON.stringify(stored) });
    expect(loaded).toMatchObject({ upgraded: true, catalogUpdated: true, recovered: false });
    expect(loaded.store.catalogVersion).toBe(3);
    expect(loaded.store.systems[0].endpoints).toHaveLength(110);
    expect(loaded.store.systems[0].endpoints.slice(0, 30)).toEqual(legacy.endpoints);
    expect(loaded.store.systems[1]).toEqual(custom);
    expect(loaded.store.activeId).toBe(custom.id);
    loaded.store.systems[0].endpoints = loaded.store.systems[0].endpoints.slice(0, 30);
    const next = loadSystems({ getItem: () => JSON.stringify(loaded.store) });
    expect(next.upgraded).toBe(false);
    expect(next.store).toEqual(loaded.store);
  });
  it("preserves edited thirty-case catalogs and previous deliberate deletions", () => {
    for (const count of [9, 30]) {
      const edited = defaultSystem();
      edited.endpoints = edited.endpoints.slice(0, count);
      if (count === 30) edited.endpoints[0].path = "/my-health";
      const loaded = loadSystems({ getItem: () => JSON.stringify({ version: 1, catalogVersion: 2, serviceCatalogVersion: 1, activeId: "default", systems: [edited] }) });
      expect(loaded.upgraded).toBe(false);
      expect(loaded.store.systems[0]).toEqual(edited);
      expect(loaded.store.catalogVersion).toBe(3);
    }
  });
  it("accepts up to 200 configured endpoints and rejects overflow", () => {
    const expanded = defaultSystem();
    expanded.endpoints = Array.from({ length: MAX_ENDPOINTS }, (_, i) => ({ ...expanded.endpoints[0], id: `case-${i}` }));
    expect(validateSystem(expanded)).toEqual([]);
    expanded.endpoints.push({ ...expanded.endpoints[0], id: "overflow" });
    expect(validateSystem(expanded)).toContain("每个系统需要 1–200 个接口");
  });
  it("supports editable custom status and budgets without inheriting unrelated contracts", () => {
    const custom = newSystem();
    custom.name = "订单服务";
    custom.endpoints[0].status = 201;
    custom.endpoints[0].budget = 1;
    const endpoint = resolveEndpoints(custom)[0];
    expect(endpoint.contract).toBe("响应为有效 JSON");
    for (let i = 0; i < 100; i++)
      expect(modelSample(endpoint, i, 1, i, 0).outcome).toBe("passed");
    const changed = defaultSystem();
    changed.endpoints[0].path = "/different";
    expect(resolveEndpoints(changed)[0].contract).toBe("响应为有效 JSON");
    custom.endpoints[0].status = 204;
    expect(resolveEndpoints(custom)[0].validate(undefined)).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "//evil.test/api",
    "https://user:password@example.test",
    "/api?token=1",
    "/api#x",
    "/api/../private",
  ])("rejects invalid base URL %s", (baseUrl) => {
    expect(validateSystem({ ...system, baseUrl }).length).toBeGreaterThan(0);
  });
  it.each([
    "//evil.test",
    "/a/../b",
    "/%2e%2e/b",
    "/a\\b",
    "https://elsewhere.test/",
    "/bad path",
  ])("rejects escaping or malformed endpoint path %s", (path) => {
    const custom = newSystem();
    custom.endpoints[0].path = path;
    expect(validateSystem(custom).length).toBeGreaterThan(0);
  });
  it("validates names, endpoint counts, IDs, status and finite thresholds", () => {
    const custom = newSystem();
    custom.name = "";
    custom.endpoints[0].budget = NaN;
    custom.endpoints[0].status = 99;
    expect(validateSystem(custom)).toHaveLength(3);
    custom.endpoints.push(custom.endpoints[0]);
    expect(validateSystem(custom)).toContain("接口 2：标识无效或重复");
    expect(validateSystem({ ...system, endpoints: [] })).toContain(
      "每个系统需要 1–200 个接口",
    );
  });
  it("builds relative and absolute requests within the selected interface catalog", () => {
    expect(requestUrl(system, endpoints[0])).toBe("/api/v1/health/live");
    const remote = { ...system, baseUrl: "https://service.example.test/v2/" };
    expect(requestUrl(remote, endpoints[0])).toBe(
      "https://service.example.test/v2/health/live",
    );
    expect(() =>
      requestUrl(system, { ...endpoints[0], path: "/other" }),
    ).toThrow();
  });
  it("restores default configuration after malformed storage and survives unavailable storage", () => {
    for (const raw of [
      "{bad",
      "null",
      '{"version":1,"systems":[null]}',
      '{"version":9}',
    ])
      expect(loadSystems({ getItem: () => raw }).recovered).toBe(true);
    expect(
      loadSystems({
        getItem: () => {
          throw Error("denied");
        },
      }).store.activeId,
    ).toBe("default");
    expect(
      persistSystems(
        {
          setItem: () => {
            throw Error("quota");
          },
        },
        { version: 1, activeId: "default", systems: [system] },
      ),
    ).toBe(false);
  });
  it("round trips multiple systems and restores missing active selection to default", () => {
    const custom = newSystem();
    const store = {
      version: 1 as const,
      catalogVersion: 3,
      serviceCatalogVersion: 2,
      activeId: custom.id,
      systems: [system, custom],
    };
    const setItem = vi.fn();
    expect(persistSystems({ setItem }, store)).toBe(true);
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEY);
    expect(
      loadSystems({ getItem: () => setItem.mock.calls[0][1] }).store,
    ).toEqual(store);
    expect(
      loadSystems({
        getItem: () => JSON.stringify({ ...store, activeId: "missing" }),
      }).store.activeId,
    ).toBe("default");
  });
});

describe("offline simulation and statistics", () => {
  it("counts compressed completions and weights percentiles without inflating raw observations", () => {
    const sample = modelSample(endpoints[0]);
    expect(summarize([
      { ...sample, weight: 95, elapsedMs: 20 },
      { ...sample, weight: 5, elapsedMs: 200, outcome: "failed" },
      { ...sample, weight: 30, elapsedMs: 3000, outcome: "cancelled" },
    ], 2000)).toMatchObject({ count: 100, passed: 95, failed: 5, cancelled: 30,
      p50: 20, p95: 20, p99: 200, average: 29, max: 200, successRate: 95, rps: 50 });
    expect(summarize([{ ...sample, source: "live", weight: 1000 }]).count).toBe(1);
  });
  it("computes nearest-rank percentiles and excludes cancelled observations", () => {
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
    const sample = modelSample(endpoints[0]);
    expect(
      summarize(
        [
          { ...sample, elapsedMs: 10 },
          { ...sample, outcome: "failed", elapsedMs: 90 },
          { ...sample, outcome: "cancelled", elapsedMs: 3000 },
        ],
        2000,
      ),
    ).toMatchObject({
      count: 2,
      failed: 1,
      cancelled: 1,
      p50: 10,
      p95: 90,
      rps: 1,
    });
  });
  it("simulates all 110 API contracts without sending network requests", async () => {
    clock();
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    const pending = Promise.all(endpoints.map((endpoint, index) => simulatedSample(endpoint, index, new AbortController().signal)));
    await vi.advanceTimersByTimeAsync(1000);
    const samples = await pending;
    expect(samples).toHaveLength(110);
    expect(samples.every(sample => sample.source === "model" && sample.outcome === "passed")).toBe(true);
    expect(samples.every(sample => !sample.observed && !sample.fallback)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels simulation delays without manufacturing successful completions", async () => {
    clock();
    const controller = new AbortController();
    const pending = simulatedSample(endpoints[0], 1, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ source: "model", outcome: "cancelled", checks: [] });
    expect((await simulatedSample(endpoints[0], 2, controller.signal)).outcome).toBe("cancelled");
    expect(summarize([await pending]).count).toBe(0);
  });
});

describe("staged pressure lifecycle", () => {
  it("supports automatic throughput and bounds explicit rate limits independently of duration", () => {
    const normalized = normalizeConfig(
      {
        ...config,
        concurrency: Infinity,
        duration: 999,
        rps: 9999,
        endpointId: "missing",
      },
      endpoints,
    );
    expect(normalized).toMatchObject({
      concurrency: 1000,
      duration: 120,
      rps: 9999,
      endpointId: "live",
    });
    expect(normalizeConfig({ ...config, rps: 0 }, endpoints).rps).toBe(0);
    expect(normalizeConfig({ ...config, rps: Infinity }, endpoints).rps).toBe(0);
    expect(normalizeConfig({ ...config, rps: 999999 }, endpoints).rps).toBe(50000);
    expect(modeledThroughput(1000, 200)).toBe(5000);
    expect(modeledThroughput(1000, 400)).toBe(2500);
    expect(modeledThroughput(500, 200)).toBe(2500);
    expect(modeledThroughput(1000, 200, 120)).toBe(120);
  });
  it("raises five automatic levels monotonically and waits at least five seconds after a manual step", () => {
    const schedule = new PressureSchedule(config);
    expect(schedule.advance(4)).toBe(false);
    expect(schedule.advance(5)).toBe(true);
    expect(schedule.advance(6, true)).toBe(true);
    expect(schedule.level).toBe(2);
    expect(schedule.advance(10.99)).toBe(false);
    while (schedule.level < 5) schedule.advance(schedule.nextAutomatic);
    expect(schedule.events.map((e) => e.concurrency)).toEqual([
      40, 80, 120, 160, 200,
    ]);
    expect(schedule.advance(59, true)).toBe(false);
    expect(schedule.events[1].type).toBe("manual");
  });
  it("generates visible, sample-derived fluctuations and completes the default five-level run", async () => {
    clock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => response()),
    );
    const session = startLoadSession(
      system,
      config,
      new AbortController().signal,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(60100);
    const result = await session.completion;
    expect(result).toMatchObject({
      status: "completed",
      phase: "completed",
      level: 5,
    });
    expect(result.events.map((e) => e.concurrency)).toEqual([
      40, 80, 120, 160, 200,
    ]);
    expect(
      result.frames.every(
        (frame, index) =>
          index === 0 || frame.second >= result.frames[index - 1].second,
      ),
    ).toBe(true);
    const windows = result.frames.filter((f) => f.rps > 0);
    expect(new Set(windows.map((f) => f.p95)).size).toBeGreaterThan(20);
    expect(windows.every((f) => f.p50 <= f.p95 && f.p95 <= f.p99)).toBe(true);
    expect(windows.at(-1)!.rps).toBeGreaterThan(windows[0].rps * 5);
    expect(result.samples.every((s) => s.outcome === "passed")).toBe(true);
    expect(result.observations.every((s) => s.source === "live")).toBe(true);
    expect(result.samples.length).toBeLessThanOrEqual(12000);
    expect(session.increase()).toBe(false);
  });
  it("manually raises the offline simulation immediately and retains its events", async () => {
    clock();
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    let latest = { level: 0, frames: [] } as unknown as Awaited<
      ReturnType<typeof startLoadSession>["completion"]
    >;
    const controller = new AbortController();
    const session = startLoadSession(
      system,
      config,
      controller.signal,
      (result) => {
        latest = result;
      },
    );
    await vi.advanceTimersByTimeAsync(1200);
    expect(latest.samples.length).toBeGreaterThan(0);
    expect(session.increase()).toBe(true);
    expect(latest.level).toBe(1);
    expect(latest.frames.at(-1)?.concurrency).toBe(40);
    await vi.advanceTimersByTimeAsync(4000);
    expect(latest.level).toBe(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    const result = await session.completion;
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.events[0].type).toBe("manual");
    expect(result.status).toBe("stopped");
    expect(result.samples.every((s) => s.outcome === "passed")).toBe(true);
    expect(result.samples.some((s) => s.fallback)).toBe(false);
    expect(
      result.observations.filter((s) => s.outcome === "failed"),
    ).toHaveLength(0);
  });
  it.each([10, 120])("integrates concurrency-derived throughput for %s seconds without a request cap and exports matching totals", async (duration) => {
    clock();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const session = startLoadSession(system, { ...config, concurrency: 1000, duration, rps: 0, endpointId: "snapshot" },
      new AbortController().signal, () => {});
    await vi.advanceTimersByTimeAsync(duration * 1000 + 100);
    const result = await session.completion;
    const windows = result.frames.filter(frame => frame.windowSeconds);
    let expected = 0, cumulative = 0;
    for (const window of windows) {
      expect(window.targetRps).toBeCloseTo(window.concurrency * 1000 / window.meanResponseMs!, 8);
      expected += window.targetRps * window.windowSeconds!;
      cumulative += window.completed!;
      expect(window.rps * window.windowSeconds!).toBeCloseTo(window.completed!, 8);
      expect(window.cumulativeCompleted).toBe(cumulative);
      expect(cumulative).toBe(Math.floor(expected));
    }
    const stats = summarize(result.samples, result.elapsedMs);
    expect(stats.count).toBe(cumulative);
    expect(stats.count).toBeGreaterThan(12000);
    expect(result.samples.length).toBeLessThanOrEqual((duration + 6) * 64);
    const peaks = windows.filter(window => window.level === 5);
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks.every(window => window.concurrency > 1000 && window.concurrency <= 1040 && window.rps > 2000)).toBe(true);
    expect(result.elapsedMs).toBe(duration * 1000);
    const report: Report = { ...result, id: "auto-load", kind: "load", system, startedAt: new Date().toISOString(),
      status: "completed", config: { ...config, concurrency: 1000, duration, rps: 0 } };
    const document = reportDocument(report);
    expect(document.statistics.count).toBe(cumulative);
    expect(document.loadSummary?.modelCount).toBe(cumulative);
    expect(document.loadSummary?.fallbackCount).toBe(0);
    expect(document.observedStatistics.count).toBe(0);
    expect(loadReportHtml(report)).toContain(cumulative.toLocaleString("zh-CN"));
  });
  it("honors explicit rate limits and retains fractional intervals on manual raise and stop", async () => {
    clock();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const controller = new AbortController();
    const session = startLoadSession(system, { ...config, concurrency: 1000, rps: 120 }, controller.signal, () => {});
    await vi.advanceTimersByTimeAsync(375);
    session.increase();
    await vi.advanceTimersByTimeAsync(1750);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    const result = await session.completion;
    // 0.375 s × 12 req/s + 1.750 s × 24 req/s = 46.5, carry 0.5 instead of rounding every window.
    expect(summarize(result.samples).count).toBe(46);
    expect(result.elapsedMs).toBe(2125);
    expect(result.frames.at(-1)?.cumulativeCompleted).toBe(46);
    expect(result.frames.every(frame => frame.second <= 2.125)).toBe(true);
    expect(result.frames.filter(frame => frame.windowSeconds).reduce((sum, frame) => sum + frame.windowSeconds!, 0)).toBe(2.125);
  });
  it("reconstructs timed stages after a delayed browser tick without bursting real requests", async () => {
    clock();
    let now = 0;
    const time = vi.spyOn(performance, "now").mockImplementation(() => now);
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    try {
      const session = startLoadSession(system, { ...config, concurrency: 1000, duration: 10, rps: 120 },
        new AbortController().signal, () => {});
      now = 9000;
      await vi.advanceTimersByTimeAsync(50);
      now = 10000;
      await vi.advanceTimersByTimeAsync(50);
      const result = await session.completion;
      expect(result.events.map(event => event.second)).toEqual([1, 2.75, 4.5, 6.25, 8]);
      expect(result.events.map(event => event.concurrency)).toEqual([200, 400, 600, 800, 1000]);
      expect(summarize(result.samples).count).toBe(672);
      expect(fetcher).not.toHaveBeenCalled();
    } finally { time.mockRestore(); }
  });
  it("sends no HTTP requests during load and stops all model updates after cancellation", async () => {
    clock();
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const updates = vi.fn();
    const session = startLoadSession(system, { ...config, concurrency: 1000, rps: 0 }, controller.signal, updates);
    await vi.advanceTimersByTimeAsync(1700);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    const result = await session.completion;
    const updateCount = updates.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.observations).toEqual([]);
    expect(result.samples.every(sample => sample.source === "model")).toBe(true);
    expect(result.status).toBe("stopped");
    expect(result.elapsedMs).toBe(1700);
    expect(updates).toHaveBeenCalledTimes(updateCount);
    expect(session.increase()).toBe(false);
  });
  it("exports v3 system snapshots and separate observation statistics", () => {
    const observed = {
      ...modelSample(endpoints[0]),
      source: "live" as const,
      outcome: "failed" as const,
      status: 503,
    };
    const report: Report = {
      id: "report",
      kind: "suite",
      system,
      startedAt: new Date().toISOString(),
      elapsedMs: 1000,
      status: "completed",
      samples: [{ ...modelSample(endpoints[0]), source: "fallback", observed, fallback: true }],
      observations: [observed],
      frames: [],
      events: [],
    };
    const document = reportDocument(report);
    expect(document).toMatchObject({
      schemaVersion: 3,
      system: { id: "default" },
      statistics: { successRate: 100 },
      observedStatistics: { failed: 1 },
      fallbackCount: 1,
    });
    const big = {
      ...report,
      samples: Array(10000).fill(report.samples[0]),
      observations: [],
    };
    expect(retainReports([big, big], big)).toHaveLength(2);
    expect(retainReports(Array(10).fill(report), report)).toHaveLength(8);
  });
  it("summarizes frozen load records without treating model success as observed success", () => {
    const sample = modelSample(endpoints[0]);
    const report: Report = {
      id: "load-summary", kind: "load", system, startedAt: "2026-10-09T00:00:00Z",
      elapsedMs: 2000, status: "stopped", config: { ...config, concurrency: 1000 },
      samples: [{ ...sample, elapsedMs: 20 }, { ...sample, elapsedMs: 80 }, { ...sample, outcome: "cancelled", elapsedMs: 999 }],
      observations: [{ ...sample, source: "live", status: 503, outcome: "failed" }],
      frames: [
        { second: 0, concurrency: 100, rps: 0, targetRps: 12, p50: 0, p95: 0, p99: 0, level: 0, phase: "warmup", failed: 0 },
        { second: 1, concurrency: 400, rps: 40, targetRps: 48, p50: 20, p95: 80, p99: 80, level: 2, phase: "ramp", failed: 0 },
      ], events: [],
    };
    const snapshot = JSON.stringify(report);
    const summary = loadReportSummary(report);
    expect(summary).toMatchObject({ peakConcurrency: 400, peakRps: 40, reachedTarget: false,
      statistics: { count: 2, cancelled: 1, successRate: 100, p95: 80 },
      observedStatistics: { count: 1, failed: 1, successRate: 0 } });
    expect(summary.stages[5].reached).toBe(false);
    expect(summary.stages[2].maxWindowP95).toBe(80);
    expect(reportDocument(report).loadSummary).toEqual(summary);
    const html = loadReportHtml({ ...report, system: { ...system, name: '<img src=x onerror="alert(1)">' } });
    expect(html).toContain("&lt;img src=x onerror=&quot;");
    expect(html).not.toContain("<img");
    expect(html).toContain("本轮已提前停止");
    expect(html).toContain("未达标 · 未达到并发目标");
    expect(html).toContain("距离目标差额");
    expect(html).toContain("数据来源：本地模型");
    expect(html).toContain("未达标问题 · 已记录");
    expect(html).not.toContain("第 5 级");
    expect(reportDocument(report).observedStatistics.failed).toBe(1);
    expect(html.match(/<svg /g)).toHaveLength(2);
    expect(JSON.stringify(report)).toBe(snapshot);
    const empty = loadReportSummary({ ...report, samples: [], observations: [], frames: [] });
    expect(empty.statistics.count).toBe(0);
    expect(empty.observedStatistics.count).toBe(0);
    expect(empty.stages.every(stage => !stage.reached)).toBe(true);
  });
});
