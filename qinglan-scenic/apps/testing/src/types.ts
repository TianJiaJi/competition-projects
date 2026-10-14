export interface EndpointConfig {
  id: string;
  name: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  status: number;
  budget: number;
  contractId?: string;
}
export interface SystemConfig {
  id: string;
  name: string;
  baseUrl: string;
  endpoints: EndpointConfig[];
  registration?: {
    source: "catalog" | "discovery";
    manifestId: string;
    templateName: string;
    publisher: string;
    version: string;
    registeredAt?: string;
    dataSource: "local-manifest";
  };
}
export interface Endpoint extends EndpointConfig {
  group: string;
  baseline: number;
  contract: string;
  validate: (body: unknown) => boolean;
  fixture: unknown;
  fixtureStatus?: number;
  fixtureBudget?: number;
}
export type SampleSource = "live" | "baseline" | "fallback" | "model";
export type Outcome = "passed" | "failed" | "cancelled";
export interface Check {
  label: string;
  passed: boolean;
}
export interface Sample {
  /** Number of modeled completions represented by this latency bucket. Raw observations always count once. */
  weight?: number;
  endpointId: string;
  source: SampleSource;
  at: string;
  elapsedMs: number;
  status: number | null;
  outcome: Outcome;
  checks: Check[];
  requestId: string;
  bytes: number;
  preview: string;
  error?: string;
  observed?: Sample;
  fallback?: boolean;
}
export interface Statistics {
  count: number;
  passed: number;
  failed: number;
  cancelled: number;
  p50: number;
  p95: number;
  p99: number;
  average: number;
  max: number;
  successRate: number;
  rps: number;
}
export interface LoadConfig {
  concurrency: number;
  duration: number;
  rps: number; // 0 = derive throughput from concurrency / mean response time
  endpointId: string;
}
export type Phase = "warmup" | "ramp" | "peak" | "completed" | "stopped";
export interface Frame {
  windowSeconds?: number;
  completed?: number;
  cumulativeCompleted?: number;
  meanResponseMs?: number;
  capacityRps?: number;
  second: number;
  p50: number;
  p95: number;
  p99: number;
  rps: number;
  failed: number;
  concurrency: number;
  targetRps: number;
  level: number;
  phase: Phase;
}
export interface LoadEvent {
  id: number;
  second: number;
  type: "automatic" | "manual";
  level: number;
  concurrency: number;
}
export interface LoadModelProfile {
  kind: 'peak-overshoot-demo';
  seed: number;
  minOvershootPercent: number;
  maxOvershootPercent: number;
}
export interface LoadResult {
  loadModel?: LoadModelProfile;
  samples: Sample[];
  observations: Sample[];
  frames: Frame[];
  events: LoadEvent[];
  elapsedMs: number;
  level: number;
  phase: Phase;
  status: "running" | "completed" | "stopped";
}
export interface MeasurementReport {
  loadModel?: LoadModelProfile;
  id: string;
  taskId?: string;
  handoffId?: string;
  caseNotes?: Record<string, { note: string; checkpoint: string }>;
  kind: "suite" | "load";
  system: SystemConfig;
  startedAt: string;
  elapsedMs: number;
  status: "completed" | "stopped";
  samples: Sample[];
  observations: Sample[];
  frames: Frame[];
  events: LoadEvent[];
  config?: LoadConfig;
}

export type Report = MeasurementReport | import("./special-engine").SpecialReport;
