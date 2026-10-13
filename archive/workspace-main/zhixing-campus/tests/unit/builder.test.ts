import { describe, it, expect } from "vitest";
import {
  parsePreview,
  acceptsMessage,
  previewUrl,
} from "../../packages/demo/src/builder/client";
const context = {
  run: "run01",
  caseId: "example",
  version: "2",
  stage: "02" as const,
  terminal: "staff" as const,
};
describe("generic preview contract", () => {
  it("validates stages and leaves ordinary routes unchanged", () => {
    expect(parsePreview("", "staff").enabled).toBe(false);
    expect(
      parsePreview(new URL(previewUrl(context, 5503)).search, "staff").context,
    ).toEqual(context);
    expect(
      parsePreview("?demo=1&caseId=x&stage=04&run=run&version=2", "staff")
        .error,
    ).toBeTruthy();
    expect(
      parsePreview("?demo=1&caseId=x&stage=01&run=run&version=2", "staff")
        .error,
    ).toBeTruthy();
  });
  it("rejects wrong window, origin, version, run, stage and case", () => {
    const source = {} as Window;
    const message = { protocol: "assembly-v2", ...context, type: "ready" };
    const event = {
      source,
      origin: "http://localhost:5503",
      data: message,
    } as MessageEvent;
    expect(acceptsMessage(event, source, event.origin, context)).toBe(true);
    expect(acceptsMessage(event, {} as Window, event.origin, context)).toBe(
      false,
    );
    expect(acceptsMessage(event, source, "http://evil.example", context)).toBe(
      false,
    );
    for (const key of ["caseId", "version", "stage", "run", "terminal"])
      expect(
        acceptsMessage(
          { ...event, data: { ...message, [key]: "wrong" } } as MessageEvent,
          source,
          event.origin,
          context,
        ),
      ).toBe(false);
  });
});
