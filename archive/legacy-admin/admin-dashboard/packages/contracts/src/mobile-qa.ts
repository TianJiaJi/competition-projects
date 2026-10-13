export interface Source {
  id: string;
  title: string;
  excerpt: string;
  kind: string;
  version: string;
  citation?: string;
}
export type QaStatus =
  "generating" | "completed" | "failed" | "interrupted" | "stopped";
export interface QaMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: QaStatus;
  sources: Source[];
  createdAt: string;
  errorCode?: string | null;
}
export type QaRequest =
  { text: string; retryOf?: never } | { retryOf: string; text?: string };
export interface QaWorkbench {
  context: { id: string; name: string } | null;
  categories: Array<{ id: string; title: string; questions: string[] }>;
}
export interface ScenicState {
  points: Record<
    string,
    {
      availability: "open" | "closed" | "maintenance" | "unknown";
      load: "quiet" | "light" | "moderate" | "busy" | "unknown";
    }
  >;
  closedEdgeIds: string[];
  updatedAt: string;
}
export type QaEvent = {
  start: { conversationId: string; messageId: string; runId?: string };
  delta: { text: string; messageId?: string };
  sources: { sources: Source[] };
  done: { status: QaStatus; messageId?: string };
  error: {
    status: QaStatus;
    code: string | null;
    message: string;
    messageId?: string;
    partial?: boolean;
  };
};
