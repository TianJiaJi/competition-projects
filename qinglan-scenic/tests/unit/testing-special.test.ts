import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertScenario, createSpecialReport, definition, scenarios, SpecialSession, specialSummary, type ScenarioId } from "../../apps/testing/src/special-engine";
import { defaultSystem } from "../../apps/testing/src/systems";
import { reportDocument, retainReports } from "../../apps/testing/src/engine";
import { specialReportHtml } from "../../apps/testing/src/special-report";
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function advance(session: SpecialSession, id: ScenarioId) {
  const pending = session.advance(id);
  await vi.runAllTimersAsync();
  expect(await pending).toBe(true);
}
async function complete(session: SpecialSession, id: ScenarioId) {
  await advance(session, id); await advance(session, id); await advance(session, id);
}
describe("special scenario contracts", () => {
  it.each(scenarios.flatMap(scenario => scenario.options.map(option => [scenario.id, option.value] as const)))("%s with %s derives passing assertions from its business state", async (id, parameter) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const session = new SpecialSession(() => {});
    session.reset(id, parameter, 12345);
    await complete(session, id);
    const run = session.snapshot()[id];
    expect(run.step).toBe(3);
    expect(run.assertions).toHaveLength(3);
    expect(run.assertions.every(check => check.passed)).toBe(true);
    expect(run.requests.every(request => !["queued", "processing"].includes(request.status))).toBe(true);
    expect(run.acceptanceOrder).toHaveLength(run.requests.length);
    expect(run.events).toHaveLength(run.requests.length + 2);
    expect(run.events.slice(1, -1).map(event => event.requestId)).toEqual(run.acceptanceOrder);
    expect(run.events.at(-1)!.after).toEqual(run.state);
    expect(run.elapsedMs).toBeGreaterThan(0);
    expect(fetcher).not.toHaveBeenCalled();
    session.dispose();
  });
  it("one owner and one sale remain after all competitors; the seed makes account order reproducible", async () => {
    const left = new SpecialSession(() => {}), right = new SpecialSession(() => {});
    for (const session of [left, right]) { session.reset("claim", "10", 77); await complete(session, "claim"); }
    const a = left.snapshot().claim, b = right.snapshot().claim;
    expect(a.state.owner).toBe(b.state.owner);
    expect(a.requests.filter(request => request.status === "accepted")).toHaveLength(1);
    expect(a.requests.filter(request => request.status === "protected")).toHaveLength(9);
    a.state.owner = "账户 Z";
    expect(assertScenario(a).some(check => !check.passed)).toBe(true);
    expect(left.snapshot().claim.state.owner).not.toBe("账户 Z");
    left.dispose(); right.dispose();
  });
  it("preserves idempotency after the initial receipt is withheld", async () => {
    const session = new SpecialSession(() => {});
    await complete(session, "retry");
    const run = session.snapshot().retry;
    expect(run.requests[0].status).toBe("deferred");
    expect(run.requests[0].response.receiptDelivered).toBe(false);
    expect(run.state.writes).toBe(1);
    expect(run.state.responseIds).toHaveLength(3);
    expect(new Set(run.requests.map(request => request.response.orderId)).size).toBe(1);
    expect(run.events.filter(event => event.decision === "reused").every(event => event.before.writes === event.after.writes)).toBe(true);
  });
  it("never returns protected order fields or mutates ownership on cross-account operations", async () => {
    const session = new SpecialSession(() => {});
    session.reset("permission", "assign"); await complete(session, "permission");
    const run = session.snapshot().permission, event = run.events[1];
    expect(event.response).toEqual({ code: "ACCESS_PROTECTED", fields: [] });
    expect(event.before.owner).toBe(event.after.owner);
    expect(event.before.version).toBe(event.after.version);
    expect(run.state.writes).toBe(0);
    run.state.owner = "账户 B";
    expect(assertScenario(run).at(-1)?.passed).toBe(false);
  });
  it("keeps the latest state when older versions arrive later", async () => {
    const session = new SpecialSession(() => {});
    await complete(session, "callback");
    const run = session.snapshot().callback;
    expect(run.state).toMatchObject({ version: 3, orderState: "已完成", staleIgnored: 2, writes: 1 });
    expect(run.events.filter(event => event.decision === "protected").every(event => event.before.version === event.after.version && event.before.orderState === event.after.orderState)).toBe(true);
  });
});
describe("manual action lifecycle and isolation", () => {
  it("rejects duplicate clicks, cross-scenario operations and skipped steps", async () => {
    const session = new SpecialSession(() => {});
    expect(await session.advance("claim", 2)).toBe(false);
    const pending = session.advance("claim", 0);
    expect(await session.advance("claim", 0)).toBe(false);
    expect(await session.advance("stock", 0)).toBe(false);
    await vi.runAllTimersAsync(); await pending;
    expect(await session.advance("claim", 0)).toBe(false);
    await advance(session, "claim"); await advance(session, "claim");
    expect(await session.advance("claim")).toBe(false);
    expect(session.snapshot().claim.events).toHaveLength(4);
  });
  it("resets only the selected case and rejects invalid parameter values", async () => {
    const session = new SpecialSession(() => {});
    await complete(session, "claim"); await advance(session, "stock");
    const claim = session.snapshot().claim;
    session.reset("stock", "5");
    expect(session.snapshot().claim).toEqual(claim);
    expect(session.snapshot().stock).toMatchObject({ step: 0, parameter: "5", events: [], requests: [] });
    expect(() => session.reset("stock", "999")).toThrow("场景参数无效");
  });
  it("restores the last unit of stock and produces one new sale on every rerun", async () => {
    const session = new SpecialSession(() => {}), ids = new Set<string>(), owners = new Set<string>();
    for (const parameter of ["20", "20", "10", "5", "20"]) {
      session.reset("stock", parameter, ids.size + 2);
      expect(session.snapshot().stock.state).toMatchObject({ stock: 1, minStock: 1, owner: null, orders: [], writes: 0 });
      await complete(session, "stock");
      const run = session.snapshot().stock, winners = run.requests.filter(request => request.status === "accepted");
      expect(winners).toHaveLength(1);
      expect(winners[0].id).toBe(run.acceptanceOrder[0]);
      expect(run.requests.filter(request => request.status === "protected")).toHaveLength(Number(parameter) - 1);
      expect(run.events.filter(event => event.result === "下单成功")).toHaveLength(1);
      expect(run.state).toMatchObject({ stock: 0, minStock: 0, owner: winners[0].actor, writes: 1 });
      expect(run.assertions.every(check => check.passed)).toBe(true);
      ids.add(run.id); owners.add(winners[0].actor);
    }
    expect(ids.size).toBe(5);
    expect(owners.size).toBeGreaterThan(1);
    session.dispose();
  });
  it("cancels stale callbacks when reset during an active request batch", async () => {
    const updates = vi.fn(), session = new SpecialSession(updates);
    session.reset("stock", "20"); await advance(session, "stock");
    const pending = session.advance("stock");
    await vi.advanceTimersByTimeAsync(100);
    session.reset("stock", "5");
    const snapshot = session.snapshot();
    const calls = updates.mock.calls.length;
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(session.snapshot()).toEqual(snapshot);
    expect(updates).toHaveBeenCalledTimes(calls);
    await complete(session, "stock");
    expect(session.snapshot().stock.requests).toHaveLength(5);
  });
  it("disposes active work without updates and new sessions start with independent drafts", async () => {
    const updates = vi.fn(), session = new SpecialSession(updates);
    await advance(session, "claim");
    const pending = session.advance("claim"); session.dispose();
    const calls = updates.mock.calls.length;
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(updates).toHaveBeenCalledTimes(calls);
    expect(await session.advance("claim")).toBe(false);
    expect(new SpecialSession(() => {}).snapshot().claim.step).toBe(0);
  });
});
describe("special report snapshots", () => {
  it("exports only verified scenarios in HTML while keeping every draft in JSON", async () => {
    const session = new SpecialSession(() => {}), system = defaultSystem();
    expect(() => createSpecialReport(system, session.snapshot())).toThrow();
    await complete(session, "claim"); await advance(session, "stock");
    const report = createSpecialReport(system, session.snapshot()), frozen = JSON.stringify(report);
    expect(report.status).toBe("stopped");
    expect(specialSummary(report)).toMatchObject({ completed: 1, total: 6, assertions: 3, passed: 3 });
    const document = reportDocument(report);
    expect(document).toMatchObject({ kind: "special", schemaVersion: 3, executionMode: "simulation", networkRequestCount: 0 });
    expect(document.scenarios).toHaveLength(6);
    expect(document.scenarios.find(run => run.scenarioId === "stock")?.step).toBe(1);
    const html = specialReportHtml({ ...report, system: { ...system, name: '<img src=x onerror="alert(1)">' } });
    expect(html).toContain("已核验 1 项专项场景");
    expect(html).toContain("多账户抢单"); expect(html).not.toContain("库存防超卖");
    expect(html).toContain("&lt;img"); expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<script|模拟|测试模式/);
    session.reset("claim", "10"); system.name = "更名";
    expect(JSON.stringify(report)).toBe(frozen);
  });
  it("summarizes all six scenarios and budgets events alongside other records", async () => {
    const session = new SpecialSession(() => {});
    for (const scenario of scenarios) await complete(session, scenario.id);
    const report = createSpecialReport(defaultSystem(), session.snapshot());
    expect(report.status).toBe("completed");
    expect(specialSummary(report)).toMatchObject({ completed: 6, assertions: 18, passed: 18 });
    expect(specialReportHtml(report)).toContain("六项专项验证已完成");
    expect(retainReports(Array(10).fill(report), report)).toHaveLength(8);
    const large = { ...report, scenarios: [{ ...report.scenarios[0], events: Array(10000).fill(report.scenarios[0].events[0]) }] };
    expect(retainReports([large, large], large)).toHaveLength(2);
  });
});
