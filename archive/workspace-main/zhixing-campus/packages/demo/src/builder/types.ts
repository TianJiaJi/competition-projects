import type { RecordItem, Collection } from "../../../domain/src/types";
export type Stage = "01" | "02" | "03";
export type Terminal = "public" | "ops" | "mobile" | "staff" | "admin";
export interface LinkedRecord extends RecordItem {
  facilityId?: string;
  buildingId?: string;
  submitterId?: string;
  assigneeId?: string;
  timeSlot?: string;
  count?: number;
}
export type Records = Record<Collection, LinkedRecord[]>;
export interface Artifact {
  title: string;
  before: string;
  after: string;
  assets?: { label: string; url: string; image?: boolean }[];
}
export interface StepDefinition {
  id: Stage;
  title: string;
  owner: string;
  purpose: string;
  prompt: string;
  adjustment: string;
  templates: string[];
  draft: string;
  revised: string;
  handoff: string;
  artifacts: Artifact[];
}
export interface SampleDefinition {
  caseId: string;
  version: string;
  name: string;
  steps: StepDefinition[];
  previews: { id: Terminal; label: string; port: number; stages: Stage[] }[];
  manual: { id: string; title: string }[];
  workflow: WorkflowNode[];
  modules?: {
    id: string;
    title: string;
    role: RoleId;
    placement: "left" | "top" | "right" | "center" | "bottom";
  }[];
}
export interface StageState {
  requirement: string;
  adjustment: string;
  revision: number;
  status: "empty" | "draft" | "revised" | "confirmed" | "assembled";
  acceptance?: Evidence;
}
export interface Evidence {
  id: string;
  passed: boolean;
  detail: string;
  at: string;
  revision: number;
}
export interface RunState {
  run: string;
  caseId: string;
  version: string;
  startedAt: string;
  stages: Record<Stage, StageState>;
  latest: Stage | null;
  revision: number;
  sequence?: number;
  graph?: Record<string, string>;
  history: { at: string; kind: string; stage?: Stage; detail: string }[];
  checks: Evidence[];
  manual: Evidence[];
  nodes: Record<string, NodeRun>;
}
export interface PreviewContext {
  run: string;
  caseId: string;
  version: string;
  stage: Stage;
  terminal: Terminal;
}

export type RoleId = Stage | "04";
export type WorkflowKind =
  | "source"
  | "requirement"
  | "adjustment"
  | "process"
  | "execution"
  | "acceptance"
  | "placeholder";
export interface WorkflowNode {
  id: string;
  stage: RoleId;
  kind: WorkflowKind;
  title: string;
  summary: string;
  deps: string[];
  detail?: string;
  filename?: string;
  materials?: (MaterialFile & { path: string })[];
  action?: "initialize" | "connect" | "publish";
  artifact?: number;
  showArtifacts?: boolean;
  module?: string;
  layout?: { column: number; row: number };
  task?: string;
  outputName?: string;
  inputs?: Record<string, string>;
  phases?: string[];
  durationMs?: number;
}
export type NodeStatus =
  | "blocked"
  | "ready"
  | "running"
  | "waiting"
  | "complete"
  | "failed"
  | "invalidated";
export interface MaterialFile {
  id?: string;
  name: string;
  size?: number;
  type?: string;
  lastModified?: number;
  prepared?: boolean;
}
export interface NodeRun {
  status: NodeStatus;
  input?: string;
  submitted?: boolean;
  /** Compatibility alias for pre-list clients. */
  file?: MaterialFile;
  files?: MaterialFile[];
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  execution?: unknown;
  generation?: number;
  durationMs?: number;
}
export interface NodeActionFeedback {
  status: "queued" | "pending" | "failed";
  fileName?: string;
  error?: string;
  body: Record<string, unknown>;
}
