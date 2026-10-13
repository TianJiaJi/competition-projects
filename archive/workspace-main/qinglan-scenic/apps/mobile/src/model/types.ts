export interface Order {
  id: string;
  kind: "entry" | "parking";
  date: string;
  slot: string;
  people: number;
  name: string;
  phone: string;
  plate: string;
  parkingId: string;
  status: "confirmed" | "cancelled";
  entered: boolean;
  exited?: boolean;
  createdAt: string;
}
export interface ChatMessage {
  id: string;
  room: string;
  name: string;
  text: string;
  at: string;
  simulated: boolean;
}
export interface Tour {
  routeId: string;
  status: "preview" | "ready" | "running" | "paused" | "completed";
  progress: number;
  orderId: string | null;
}
export interface LocalState {
  version: 1;
  runId: string;
  nickname: string;
  orders: Order[];
  favourites: string[];
  messages: ChatMessage[];
  closedPoints: string[];
  closedEdges: string[];
  pointLoads?: Record<string, { load: string }>;
  tour: Tour | null;
  aiSession: string;
  aiRunId: string;
  conversationIds: string[];
}
export interface Preferences {
  hours: number;
  interests: string[];
  pace: "轻松" | "标准" | "紧凑";
  elderly: boolean;
  children: boolean;
  accessible: boolean;
  required: string[];
  avoidBusy: boolean;
}
export interface OrderInput {
  kind: Order["kind"];
  date: string;
  slot: string;
  people: number;
  name: string;
  phone: string;
  plate: string;
  parkingId: string;
}
