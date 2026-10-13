import data, { pointById } from "../data";
import type { LocalState, OrderInput, Preferences } from "./types";
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const dateAt = (offset = 0) => {
  const date = new Date(Date.now() + offset * 86400000 + 8 * 3600000);
  return date.toISOString().slice(0, 10);
};
export const slots = Array.from(
  { length: 9 },
  (_, i) =>
    `${String(i + 8).padStart(2, "0")}:00—${String(i + 9).padStart(2, "0")}:00`,
);
export function seed(): LocalState {
  return {
    version: 1,
    runId: "local-" + uid(),
    nickname: "",
    orders: [],
    favourites: [],
    messages: [],
    closedPoints: [],
    closedEdges: [],
    tour: null,
    aiSession: "",
    aiRunId: "",
    conversationIds: [],
  };
}
export function matchingRoutes(s: LocalState, p: Preferences) {
  return data.routes
    .filter(
      (r) =>
        r.minutes * (p.pace === "轻松" ? 1.2 : p.pace === "紧凑" ? 0.85 : 1) <=
          p.hours * 60 &&
        (!p.accessible || r.accessible) &&
        p.required.every((id) => r.stops.includes(id)) &&
        !r.edgeIds.some((id) => s.closedEdges.includes(id)) &&
        !r.nodeIds.some((id) => s.closedPoints.includes(id)),
    )
    .sort((a, b) => {
      const score = (r: typeof a) =>
        r.interests.filter((i) => p.interests.includes(i)).length * 5 -
        (p.avoidBusy
          ? r.stops.filter(
              (id) =>
                (s.pointLoads ||
                  (data.snapshot.points as Record<string, { load: string }>))[
                  id
                ]?.load === "busy",
            ).length * 3
          : 0) -
        (p.elderly || p.children ? r.distance / 1000 : 0);
      return score(b) - score(a) || a.minutes - b.minutes;
    });
}
