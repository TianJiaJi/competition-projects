import type { Handoff } from "@scenic/contracts";
import { pointById } from "./data";
export function buildHandoffUrl(base: string, state: Handoff): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  if (state.point && pointById[state.point])
    url.searchParams.set("point", state.point);
  if (
    state.origin &&
    state.destination &&
    pointById[state.origin] &&
    pointById[state.destination]
  ) {
    url.searchParams.set("from", state.origin);
    url.searchParams.set("to", state.destination);
    url.searchParams.set("mode", state.mode === "cable" ? "cable" : "walk");
  }
  return url.toString();
}
export function readHandoff(search: string): {
  value: Handoff;
  error?: string;
} {
  const q = new URLSearchParams(search),
    point = q.get("point"),
    origin = q.get("from"),
    destination = q.get("to"),
    mode = q.get("mode");
  if (
    (point && !pointById[point]) ||
    (origin && !pointById[origin]) ||
    (destination && !pointById[destination]) ||
    !!origin !== !!destination ||
    (mode && mode !== "walk" && mode !== "cable")
  )
    return { value: {}, error: "这条导览链接无效，请重新扫描大屏上的二维码。" };
  return {
    value: {
      point: point ?? undefined,
      origin: origin ?? undefined,
      destination: destination ?? undefined,
      mode: mode === "cable" ? "cable" : "walk",
    },
  };
}
