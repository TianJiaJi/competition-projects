import type { SampleDefinition, WorkflowNode } from "@scene/demo/builder-types";
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const cardWidth = 280;
export function cardHeight(kind: WorkflowNode["kind"]) {
  return {
    source: 270,
    requirement: 360,
    adjustment: 490,
    acceptance: 520,
    process: 230,
    execution: 230,
    placeholder: 230,
  }[kind];
}
export function arrange(
  definition: SampleDefinition,
  _legacyDimensions?: Record<string, { width: number; height: number }>,
) {
  const modules =
    definition.modules ||
    definition.steps.map((s) => ({
      id: s.id,
      title: s.title,
      role: s.id,
      placement: "center" as const,
    }));
  const local: Record<string, Box> = {},
    bounds: Record<string, Box> = {};
  for (const m of modules) {
    const nodes = definition.workflow.filter(
      (n) => (n.module || n.stage) === m.id,
    );
    for (const n of nodes)
      local[n.id] = {
        x: (n.layout?.column || 0) * 320,
        y: (n.layout?.row || 0) * 290,
        width: cardWidth,
        height: cardHeight(n.kind),
      };
    bounds[m.id] = {
      x: 0,
      y: 0,
      width: Math.max(
        cardWidth,
        ...nodes.map((n) => local[n.id].x + cardWidth),
      ),
      height: Math.max(
        230,
        ...nodes.map((n) => local[n.id].y + local[n.id].height),
      ),
    };
  }
  const center =
    bounds[modules.find((m) => m.placement === "center")?.id || modules[0].id];
  for (const m of modules) {
    const b = bounds[m.id];
    if (m.placement === "left") {
      b.x = -b.width - 360;
      b.y = 0;
    }
    if (m.placement === "right") {
      b.x = center.width + 360;
      b.y = 0;
    }
    if (m.placement === "top") {
      b.x = (center.width - b.width) / 2;
      b.y = -b.height - 360;
    }
    if (m.placement === "bottom") {
      b.x = (center.width - b.width) / 2;
      b.y = center.height + 360;
    }
  }
  const boxes: Record<string, Box> = {};
  for (const n of definition.workflow) {
    const b = bounds[n.module || n.stage];
    boxes[n.id] = {
      ...local[n.id],
      x: local[n.id].x + b.x,
      y: local[n.id].y + b.y,
    };
  }
  return { boxes, bounds, modules };
}
type Point = { x: number; y: number };
// Orthogonal routes use fixed gutters. No content measurement affects anchors.
export function route(a: Box, b: Box, obstacles: Box[], index = 0) {
  const vertical = Math.abs(a.x - b.x) < 140;
  const forward = vertical ? b.y >= a.y : b.x >= a.x;
  const start: Point = vertical
    ? { x: a.x + a.width / 2, y: a.y + (forward ? a.height : 0) }
    : { x: a.x + (forward ? a.width : 0), y: a.y + 34 };
  const end: Point = vertical
    ? { x: b.x + b.width / 2, y: b.y + (forward ? 0 : b.height) }
    : { x: b.x + (forward ? 0 : b.width), y: b.y + 34 };
  const padding = 14 + (index % 4) * 3;
  const s = {
    x: start.x + (vertical ? 0 : forward ? padding : -padding),
    y: start.y + (vertical ? (forward ? padding : -padding) : 0),
  };
  const e = {
    x: end.x + (vertical ? 0 : forward ? -padding : padding),
    y: end.y + (vertical ? (forward ? -padding : padding) : 0),
  };
  const boxes = obstacles.map((r) => ({
    x: r.x - 8,
    y: r.y - 8,
    width: r.width + 16,
    height: r.height + 16,
  }));
  const xs = [
    ...new Set([
      s.x,
      e.x,
      ...obstacles.flatMap((r) => [r.x - padding, r.x + r.width + padding]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      s.y,
      e.y,
      ...obstacles.flatMap((r) => [r.y - padding, r.y + r.height + padding]),
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length,
    startId = ys.indexOf(s.y) * width + xs.indexOf(s.x),
    endId = ys.indexOf(e.y) * width + xs.indexOf(e.x);
  const point = (id: number) => ({
    x: xs[id % width],
    y: ys[Math.floor(id / width)],
  });
  const clear = (a: Point, b: Point) =>
    !boxes.some((r) =>
      a.x === b.x
        ? a.x > r.x &&
          a.x < r.x + r.width &&
          Math.max(a.y, b.y) > r.y &&
          Math.min(a.y, b.y) < r.y + r.height
        : a.y > r.y &&
          a.y < r.y + r.height &&
          Math.max(a.x, b.x) > r.x &&
          Math.min(a.x, b.x) < r.x + r.width,
    );
  const cost = new Map<number, number>([[startId, 0]]),
    previous = new Map<number, number>(),
    heap: { id: number; score: number }[] = [];
  function push(id: number, score: number) {
    heap.push({ id, score });
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p].score <= score) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  }
  function pop() {
    const result = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heap[c + 1].score < heap[c].score) c++;
        if (heap[i].score <= heap[c].score) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    return result.id;
  }
  push(startId, 0);
  const closed = new Set<number>();
  while (heap.length) {
    const id = pop();
    if (closed.has(id)) continue;
    if (id === endId) break;
    closed.add(id);
    const p = point(id),
      x = id % width,
      y = Math.floor(id / width);
    for (const next of [
      x > 0 ? id - 1 : -1,
      x + 1 < width ? id + 1 : -1,
      y > 0 ? id - width : -1,
      y + 1 < ys.length ? id + width : -1,
    ]) {
      if (next < 0 || closed.has(next)) continue;
      const q = point(next);
      if (!clear(p, q)) continue;
      const previousId = previous.get(id);
      const before = previousId === undefined ? p : point(previousId);
      const turn =
        previousId !== undefined && (before.x === p.x) !== (p.x === q.x)
          ? 48
          : 0;
      const value =
        cost.get(id)! + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + turn;
      if (value < (cost.get(next) ?? Infinity)) {
        cost.set(next, value);
        previous.set(next, id);
        push(next, value + Math.abs(q.x - e.x) + Math.abs(q.y - e.y));
      }
    }
  }
  let points: Point[] = [e];
  let current = endId;
  if (previous.has(endId)) {
    while (current !== startId) {
      current = previous.get(current)!;
      points.unshift(point(current));
    }
  } else points = [s, e];
  points = [start, ...points, end].filter(
    (p, i, ps) => i === 0 || p.x !== ps[i - 1].x || p.y !== ps[i - 1].y,
  );
  points = points.filter(
    (p, i, ps) =>
      i === 0 ||
      i === ps.length - 1 ||
      !(
        (ps[i - 1].x === p.x && p.x === ps[i + 1].x) ||
        (ps[i - 1].y === p.y && p.y === ps[i + 1].y)
      ),
  );
  const segments = points.slice(1).map((p, i) => ({
    a: points[i],
    b: p,
    length: Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y),
  }));
  const segment =
    segments
      .filter((s) => s.a.y === s.b.y)
      .sort((a, b) => b.length - a.length)[0] || segments[0];
  return {
    points,
    segments,
    d: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "),
    label: {
      x: (segment.a.x + segment.b.x) / 2,
      y: (segment.a.y + segment.b.y) / 2 - 9,
    },
  };
}
export function currentNode(
  nodes: WorkflowNode[],
  states: Record<string, { status: string }>,
  feedback: Record<string, { status: string }> = {},
) {
  const ordered = nodes
    .filter((n) => n.kind !== "placeholder")
    .sort((a, b) => a.stage.localeCompare(b.stage));
  return (
    ordered.find(
      (n) =>
        states[n.id]?.status === "failed" ||
        feedback[n.id]?.status === "failed",
    ) ||
    ordered.find(
      (n) =>
        ["source", "requirement", "adjustment", "acceptance"].includes(
          n.kind,
        ) && ["ready", "waiting"].includes(states[n.id]?.status),
    ) ||
    ordered.find((n) => states[n.id]?.status === "running")
  );
}
