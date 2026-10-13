export type Collection =
  | "facilities"
  | "tasks"
  | "inspections"
  | "people"
  | "buildings"
  | "bookings"
  | "visitors"
  | "notices"
  | "security"
  | "parking";
export interface RecordItem {
  id: string;
  title: string;
  location: string;
  category: string;
  status: string;
  description: string;
  date: string;
  contact?: string;
  result?: string;
  capacity?: number;
  used?: number;
  owner?: string;
}
export interface Metric {
  label: string;
  value: string;
  unit: string;
  note: string;
}
export interface Scenario {
  id: string;
  kind: "community" | "campus";
  name: string;
  english: string;
  tagline: string;
  description: string;
  person: string;
  worker: string;
  location: string;
  ports: Record<
    "public" | "ops" | "staff" | "admin" | "mobile" | "preview",
    number
  >;
  theme: {
    brand: string;
    accent: string;
    canvas: string;
    surface: string;
    ink: string;
    muted: string;
    line: string;
    dark: string;
  };
  metricLabels: {
    primary: string;
    secondary: string;
    tasks: string;
    health: string;
  };
  labels: Record<Collection, string>;
  navigation: {
    id: string;
    label: string;
    items: { id: string; label: string }[];
  }[];
  seed: Record<Collection, RecordItem[]>;
  usage: {
    labels: string[];
    electricity: number[];
    water: number[];
    occupancy: number[];
  };
  questions: { question: string; answer: string }[];
}
export interface SceneState {
  records: Record<Collection, RecordItem[]>;
  identity: string | null;
  nextId: number;
}
