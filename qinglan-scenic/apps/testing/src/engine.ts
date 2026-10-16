import { specialSummary, type SpecialReport } from "./special-engine";
import { resolveEndpoints } from "./systems";
import { assessLoadGoal, LOAD_DEFAULTS, LOAD_LIMITS } from './load-goal';
import { createLoadModel, modelWindowConcurrency, capacityWindowConcurrency, plannedConcurrency } from './load-model';
import { loadOperationName } from './load-operations';
import type {
  Check,
  Endpoint,
  Frame,
  LoadConfig,
  LoadEvent,
  LoadResult,
  Phase,
  Report,
  MeasurementReport,
  Sample,
  Statistics,
  SystemConfig,
} from "./types";
export type * from "./types";

const round = (value: number) => Math.round(value * 10) / 10;
export const phaseName = (phase: Phase) =>
  ({
    warmup: "预热",
    ramp: "递增加压",
    peak: "稳定观察",
    completed: "已完成",
    stopped: "已停止",
  })[phase];
export function percentile(values: number[], percent: number): number {
  const sorted = values
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  return sorted.length
    ? sorted[
        Math.max(
          0,
          Math.min(
            sorted.length - 1,
            Math.ceil((percent / 100) * sorted.length) - 1,
          ),
        )
      ]
    : 0;
}
export const sampleWeight = (sample: Sample): number =>
  sample.source === "model" && Number.isSafeInteger(sample.weight) && sample.weight! >= 0
    ? sample.weight! : 1;
export const sampleCount = (samples: Sample[]) =>
  samples.reduce((count, sample) => count + sampleWeight(sample), 0);
export function summarize(samples: Sample[], elapsedMs = 0): Statistics {
  const completed = samples.filter((s) => s.outcome !== "cancelled" && sampleWeight(s) > 0);
  const count = sampleCount(completed),
    passed = sampleCount(completed.filter((s) => s.outcome === "passed"));
  const ordered = [...completed].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const rank = (percent: number) => {
    const target = Math.ceil(count * percent / 100);
    let cumulative = 0;
    for (const sample of ordered) {
      cumulative += sampleWeight(sample);
      if (cumulative >= target) return sample.elapsedMs;
    }
    return 0;
  };
  return {
    count,
    passed,
    failed: count - passed,
    cancelled: sampleCount(samples.filter((s) => s.outcome === "cancelled")),
    p50: rank(50),
    p95: rank(95),
    p99: rank(99),
    average: count
      ? completed.reduce((sum, sample) => sum + sample.elapsedMs * sampleWeight(sample), 0) / count
      : 0,
    max: ordered.at(-1)?.elapsedMs || 0,
    successRate: count ? (passed / count) * 100 : 0,
    rps: elapsedMs > 0 ? (count * 1000) / elapsedMs : 0,
  };
}
export function assess(
  endpoint: Endpoint,
  status: number,
  body: unknown,
  elapsedMs: number,
): Check[] {
  return [
    {
      label: `HTTP ${endpoint.status}${endpoint.status >= 400 ? "（预期拒绝）" : ""}`,
      passed: status === endpoint.status,
    },
    { label: endpoint.contract, passed: endpoint.validate(body) },
    {
      label: `响应耗时 ≤ ${endpoint.budget} ms`,
      passed: elapsedMs <= endpoint.budget,
    },
  ];
}
/** All derived values originate in a sample; charts never fabricate percentile values separately. */
export function modelSample(
  endpoint: Endpoint,
  sequence = 0,
  pressure = 0,
  second = 0,
  sinceRaise = 20,
  source: Sample["source"] = "model",
): Sample {
  const individual =
    ((sequence * 37 + Math.round(endpoint.baseline * 13)) % 997) / 997;
  const window =
    1 + 0.2 * Math.sin(second * 1.71) + 0.12 * Math.cos(second * 0.63);
  const transient = 0.55 * Math.exp(-Math.max(0, sinceRaise) / 2.2);
  const median =
    endpoint.baseline * (1 + 1.65 * pressure * pressure + transient) * window;
  const elapsedMs = round(
    Math.max(
      0.1,
      Math.min(
        (endpoint.fixtureBudget ?? endpoint.budget) * 0.92,
        median * (0.7 + 0.65 * individual + 0.35 * individual ** 6),
      ),
    ),
  );
  const preview =
    endpoint.fixture === undefined
      ? ""
      : JSON.stringify(endpoint.fixture, null, 2);
  const responseStatus = endpoint.fixtureStatus ?? endpoint.status;
  const checks = assess(endpoint, responseStatus, endpoint.fixture, elapsedMs);
  return {
    endpointId: endpoint.id,
    source,
    at: new Date().toISOString(),
    elapsedMs,
    status: responseStatus,
    outcome: checks.every((c) => c.passed) ? "passed" : "failed",
    checks,
    requestId: `${source}-${endpoint.id}-${sequence}`,
    bytes: new TextEncoder().encode(preview).length,
    preview,
  };
}
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("已停止", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("已停止", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
/** API verification is an offline simulation, including its cancellable response delay. */
export async function simulatedSample(endpoint: Endpoint, sequence: number, signal: AbortSignal): Promise<Sample> {
  const sample = modelSample(endpoint, sequence);
  try {
    await delay(sample.elapsedMs, signal);
    return sample;
  } catch (error) {
    if (!signal.aborted) throw error;
    return { ...sample, outcome: "cancelled", checks: [], error: "模拟已停止" };
  }
}
export function normalizeConfig(
  input: LoadConfig,
  endpoints: Endpoint[],
): LoadConfig {
  const integer = (
    value: number,
    min: number,
    max: number,
    fallback: number,
  ) =>
    Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value)))
      : fallback;
  const duration = integer(input.duration, LOAD_LIMITS.minDuration, LOAD_LIMITS.maxDuration, LOAD_DEFAULTS.duration);
  const concurrency = integer(input.concurrency, LOAD_LIMITS.minConcurrency, LOAD_LIMITS.maxConcurrency, LOAD_DEFAULTS.concurrency);
  return {
    concurrency,
    ...(input.maxConcurrency !== undefined ? { maxConcurrency: integer(input.maxConcurrency, concurrency + 600, LOAD_LIMITS.maxSafetyConcurrency, Math.min(LOAD_LIMITS.maxSafetyConcurrency, concurrency + 1000)) } : {}),
    duration,
    rps: integer(input.rps, 0, 50000, 0),
    endpointId: endpoints.some((e) => e.id === input.endpointId)
      ? input.endpointId
      : endpoints[0].id,
  };
}

/** Mutable schedule owned by one run, separate from the renderer. */
export class PressureSchedule {
  level = 0;
  lastRaise = -20;
  nextAutomatic: number;
  readonly interval: number;
  readonly events: LoadEvent[] = [];
  constructor(readonly config: LoadConfig, readonly capacity?: number) {
    this.nextAutomatic = Math.min(5, config.duration * 0.1);
    this.interval = (config.duration * 0.8 - this.nextAutomatic) / 4;
  }
  get phase(): Phase {
    return this.level === 0 ? "warmup" : this.level === 5 ? "peak" : "ramp";
  }
  get factor() {
    return this.level ? this.level / 5 : 0.1;
  }
  get concurrency() {
    return this.capacity === undefined
      ? Math.max(1, Math.round(this.config.concurrency * this.factor))
      : plannedConcurrency(this.config.concurrency, this.capacity, this.level);
  }
  advance(second: number, manual = false): boolean {
    if (this.level === 5 || (!manual && second < this.nextAutomatic))
      return false;
    this.level++;
    this.lastRaise = second;
    this.nextAutomatic =
      second + (manual ? Math.max(5, this.interval) : this.interval);
    this.events.push({
      id: this.events.length + 1,
      second,
      type: manual ? "manual" : "automatic",
      level: this.level,
      concurrency: this.concurrency,
    });
    return true;
  }
}
export interface LoadSession {
  completion: Promise<LoadResult>;
  increase: () => boolean;
}
/** Closed-loop load: each virtual client starts another request after its response. */
export function modeledThroughput(concurrency: number, meanResponseMs: number, rateLimit = 0) {
  const capacity = concurrency * 1000 / Math.max(0.1, meanResponseMs);
  return rateLimit > 0 ? Math.min(capacity, rateLimit) : capacity;
}
export function startLoadSession(
  system: SystemConfig,
  input: LoadConfig,
  signal: AbortSignal,
  update: (result: LoadResult) => void,
): LoadSession {
  const endpoints = resolveEndpoints(system),
    config = normalizeConfig(input, endpoints);
  const endpoint = endpoints.find((e) => e.id === config.endpointId)!;
  const loadModel = createLoadModel(config);
  const schedule = new PressureSchedule(config, loadModel.kind === 'capacity-demo' ? loadModel.capacity : undefined);
  let lastRecordedConcurrency = schedule.concurrency;
  const samples: Sample[] = [],
    observations: Sample[] = [],
    frames: Frame[] = [];
  const start = performance.now();
  let stoppedAt: number | undefined;
  const abort = () => {
    stoppedAt ??= Math.min(config.duration, (performance.now() - start) / 1000);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let running = true,
    status: LoadResult["status"] = "running";
  let lastSecond = 0,
    fractionalCompletions = 0,
    cumulativeCompleted = 0,
    bucketSequence = 0;
  let latestStats = summarize([]),
    latestRps = 0,
    latestTargetRps = 0;
  const elapsed = () =>
    stoppedAt ?? Math.min(config.duration, (performance.now() - start) / 1000);
  const frame = (second: number, concurrency = schedule.concurrency): Frame => ({
    second,
    cumulativeCompleted,
    p50: latestStats.p50,
    p95: latestStats.p95,
    p99: latestStats.p99,
    rps: latestRps,
    failed: latestStats.failed,
    concurrency,
    targetRps: latestTargetRps,
    level: schedule.level,
    phase: status === "running" ? schedule.phase : status,
  });
  const snapshot = (): LoadResult => ({
    loadModel: { ...loadModel },
    samples: [...samples],
    observations: [...observations],
    frames: [...frames],
    events: [...schedule.events],
    elapsedMs: elapsed() * 1000,
    level: schedule.level,
    phase: status === "running" ? schedule.phase : status,
    status,
  });
  const emit = () => update(snapshot());
  frames.push(frame(0));
  emit();
  const increase = () => {
    const second = elapsed();
    if (
      !running ||
      signal.aborted ||
      second >= config.duration ||
      schedule.level === 5
    )
      return false;
    flushUntil(second, true);
    if (schedule.level === 5) return false;
    schedule.advance(second, true);
    frames.push(frame(second));
    emit();
    return true;
  };
  const completion = (async (): Promise<LoadResult> => {
    try {
      while (!signal.aborted && elapsed() < config.duration) {
        flushUntil(elapsed());
        try {
          await delay(50, signal);
        } catch {
          break;
        }
      }
      // Include the final fractional interval on stop; never count beyond the stop time.
      flushUntil(elapsed(), true);
    } finally {
      running = false;
      signal.removeEventListener("abort", abort);
    }
    status = signal.aborted ? "stopped" : "completed";
    frames.push(frame(elapsed(), lastRecordedConcurrency));
    const result = snapshot();
    update(result);
    return result;
  })();
  function flushUntil(second: number, includePartial = false) {
    while (lastSecond < second) {
      const boundary = Math.min(Math.floor(lastSecond) + 1,
        schedule.level < 5 ? schedule.nextAutomatic : Infinity, config.duration);
      if (boundary > second && !includePartial) break;
      const end = Math.min(boundary, second);
      sampleWindow(end);
      if (schedule.advance(end)) {
        frames.push(frame(end));
        emit();
      }
    }
  }
  function sampleWindow(second: number) {
    const windowSeconds = second - lastSecond;
    if (windowSeconds <= 0) return;
    const concurrency = loadModel.kind === 'capacity-demo'
      ? capacityWindowConcurrency(schedule.concurrency, schedule.level, second, config.duration, loadModel)
      : modelWindowConcurrency(schedule.concurrency, schedule.level, second, loadModel.seed);
    const pressure = concurrency / (loadModel.kind === 'capacity-demo' ? loadModel.capacity : config.concurrency);
    const goalRatio = concurrency / config.concurrency;
    // Compact latency buckets represent many completions without capping the request total.
    const distribution = Array.from({ length: 64 }, (_, index) =>
      modelSample(endpoint, bucketSequence + index, pressure, second, second - schedule.lastRaise));
    bucketSequence += distribution.length;
    const meanResponseMs = summarize(distribution).average;
    const capacityRps = modeledThroughput(concurrency, meanResponseMs);
    latestTargetRps = modeledThroughput(concurrency, meanResponseMs, config.rps * Math.min(1, goalRatio));
    const expected = latestTargetRps * windowSeconds + fractionalCompletions;
    const count = Math.floor(expected);
    fractionalCompletions = expected - count;
    const batch = distribution.map((sample, index) => ({
      ...sample,
      weight: Math.floor((index + 1) * count / distribution.length) - Math.floor(index * count / distribution.length),
    })).filter(sample => sample.weight > 0);
    samples.push(...batch);
    cumulativeCompleted += count;
    latestStats = summarize(batch);
    latestRps = count / windowSeconds;
    lastRecordedConcurrency = concurrency;
    frames.push({ ...frame(second, concurrency), windowSeconds, completed: count, meanResponseMs, capacityRps });
    lastSecond = second;
    emit();
  }
  return { completion, increase };
}
export function baselineFrames(endpoints: Endpoint[]): Frame[] {
  return Array.from({ length: 24 }, (_, index) => {
    const stats = summarize(
      endpoints.flatMap((e) =>
        Array.from({ length: 8 }, (_, i) =>
          modelSample(e, index * 8 + i, 0, index),
        ),
      ),
    );
    return {
      second: index + 1,
      p50: stats.p50,
      p95: stats.p95,
      p99: stats.p99,
      rps: 0,
      concurrency: 0,
      targetRps: 0,
      level: 0,
      phase: "warmup",
      failed: 0,
    };
  });
}
export function retainReports(reports: Report[], report: Report): Report[] {
  const retained = [report, ...reports].slice(0, 8);
  while (
    retained.length > 1 &&
    retained.reduce(
      (total, item) => total + (item.kind === "special" ? specialSummary(item).events : item.samples.length + item.observations.length),
      0,
    ) > 24000
  )
    retained.pop();
  return retained;
}
export function loadReportSummary(report: MeasurementReport) {
  const statistics = summarize(report.samples, report.elapsedMs);
  const observedStatistics = summarize(report.observations, report.elapsedMs);
  const endpoint = resolveEndpoints(report.system).find((item) => item.id === report.config?.endpointId);
  const goal = assessLoadGoal(report, statistics.count);
  return {
    goal,
    endpointName: endpoint?.name || "未记录接口",
    operationName: loadOperationName(report.system.endpoints, report.config?.endpointId),
    endpointPath: endpoint?.path || "—",
    endpointMethod: endpoint?.method || 'GET',
    statistics,
    observedStatistics,
    peakConcurrency: goal.peakConcurrency,
    peakRps: Math.max(0, ...report.frames.map((frame) => frame.rps)),
    reachedTarget: goal.reachedTarget,
    modelCount: sampleCount(report.samples.filter((sample) => sample.source === "model")),
    fallbackCount: sampleCount(report.samples.filter((sample) => sample.fallback)),
    stages: Array.from({ length: 6 }, (_, level) => {
      const frames = report.frames.filter((frame) => frame.level === level);
      return {
        level,
        label: level === 0 ? "预热" : `第 ${level} 级`,
        reached: frames.length > 0,
        concurrency: Math.max(0, ...frames.map((frame) => frame.concurrency)),
        peakRps: Math.max(0, ...frames.map((frame) => frame.rps)),
        maxWindowP95: Math.max(0, ...frames.map((frame) => frame.p95)),
      };
    }),
  };
}

function measurementDocument(report: MeasurementReport) {
  return {
    schemaVersion: 3,
    baselineVersion: "service-baseline-v3",
    ...report,
    executionMode: report.observations.length ? "legacy-mixed" : "simulation",
    measurement: report.observations.length
      ? "历史记录：模型与实际观测分别保留。"
      : "纯模拟测试：状态码、响应内容、耗时与负载均由预设契约和模型生成，不发送业务网络请求。",
    networkRequestCount: report.observations.length,
    percentileMethod: "weighted nearest-rank; cancelled samples excluded",
    sampleRepresentation: "Model sample.weight is the number of completed requests in that latency bucket; omitted weight and all live observations count once.",
    loadCalculation: "capacityRps = concurrency * 1000 / meanResponseMs; targetRps = capacityRps unless an explicit rate limit applies; integrate targetRps * windowSeconds with fractional carry. rps = completed / windowSeconds.",
    statistics: summarize(report.samples, report.elapsedMs),
    observedStatistics: summarize(report.observations, report.elapsedMs),
    fallbackCount: sampleCount(report.samples.filter((s) => s.fallback)),
    ...(report.kind === "load" ? { loadSummary: loadReportSummary(report) } : {}),
  };
}

function specialDocument(report: SpecialReport) {
  const { verified: _verified, ...summary } = specialSummary(report);
  return { schemaVersion: 3, ...report, executionMode: "simulation", networkRequestCount: 0,
    measurement: "本地场景引擎：依据预制业务数据执行约束与断言，未连接业务后端。", summary };
}
export function reportDocument(report: MeasurementReport): ReturnType<typeof measurementDocument>;
export function reportDocument(report: SpecialReport): ReturnType<typeof specialDocument>;
export function reportDocument(report: Report): ReturnType<typeof measurementDocument> | ReturnType<typeof specialDocument>;
export function reportDocument(report: Report) {
  return report.kind === "special" ? specialDocument(report) : measurementDocument(report);
}
