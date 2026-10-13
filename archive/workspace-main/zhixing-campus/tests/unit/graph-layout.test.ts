import { describe, it, expect } from "vitest";
import { arrange, route } from "../../apps/demo/src/graph-layout";
import { definition } from "../../packages/demo/src/samples/school";
describe("branch canvas geometry", () => {
  it("uses stable module anchors, real forks and no overlapping cards", () => {
    const a = arrange(definition, {});
    const b = arrange(definition, {
      "03-collect": { width: 280, height: 850 },
    });
    expect(b.boxes["01-map"]).toEqual(a.boxes["01-map"]);
    expect(b.boxes["02-pages"]).toEqual(a.boxes["02-pages"]);
    expect(a.bounds.space.x).toBeLessThan(a.bounds.assembly.x);
    expect(a.bounds.pages.y).toBeLessThan(a.bounds.assembly.y);
    expect(a.bounds.services.x).toBeGreaterThan(a.bounds.assembly.x);
    expect(a.boxes["01-outline"].y).toBe(a.boxes["01-coordinate-plan"].y);
    expect(a.boxes["03-schema"].y).toBe(a.boxes["03-validation"].y);
    const boxes = Object.values(a.boxes);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const x = boxes[i],
          y = boxes[j];
        expect(
          x.x + x.width <= y.x ||
            y.x + y.width <= x.x ||
            x.y + x.height <= y.y ||
            y.y + y.height <= x.y,
        ).toBe(true);
      }
  });
  it("routes connections around intervening cards", () => {
    const a = { x: 0, y: 0, width: 280, height: 200 },
      b = { x: 620, y: 0, width: 280, height: 200 },
      middle = { x: 310, y: 0, width: 280, height: 300 };
    const path = route(a, b, [a, b, middle], 2).d;
    const points = [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
    );
    expect(points.length).toBeGreaterThan(3);
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1],
        q = points[i];
      expect(
        p.x === q.x
          ? p.x > middle.x &&
              p.x < middle.x + middle.width &&
              Math.max(p.y, q.y) > middle.y &&
              Math.min(p.y, q.y) < middle.y + middle.height
          : p.y > middle.y &&
              p.y < middle.y + middle.height &&
              Math.max(p.x, q.x) > middle.x &&
              Math.min(p.x, q.x) < middle.x + middle.width,
      ).toBe(false);
    }
  });
});

import { currentNode } from "../../apps/demo/src/graph-layout";
it("all dimensions and anchors ignore changing content", () => {
  const baseline = arrange(definition);
  expect(
    arrange(
      definition,
      Object.fromEntries(
        definition.workflow.map((n) => [n.id, { width: 900, height: 5000 }]),
      ),
    ),
  ).toEqual(baseline);
});
it("locates global failures before ordered human stops, then running work; no completion fallback", () => {
  const states = Object.fromEntries(
    definition.workflow.map((n) => [n.id, { status: "complete" }]),
  );
  expect(currentNode(definition.workflow, states)).toBeUndefined();
  states["01-outline"].status = "running";
  states["02-pages"].status = "ready";
  expect(currentNode(definition.workflow, states)?.id).toBe("02-pages");
  states["03-connection"].status = "failed";
  expect(currentNode(definition.workflow, states)?.id).toBe("03-connection");
  expect(
    currentNode(definition.workflow, states, { "01-map": { status: "failed" } })
      ?.id,
  ).toBe("01-map");
  states["03-connection"].status = "complete";
  states["02-pages"].status = "complete";
  expect(currentNode(definition.workflow, states)?.id).toBe("01-outline");
});
