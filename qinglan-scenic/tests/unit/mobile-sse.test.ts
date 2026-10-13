import { describe, it, expect } from "vitest";
import { SseParser, Utf8Decoder } from "../../packages/client/src/sse";
describe("portable stream parser", () => {
  it("decodes Chinese and emoji across every possible network split", () => {
    const text = "山水之间🙂，你好！";
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i <= bytes.length; i++) {
      const d = new Utf8Decoder();
      expect(
        d.decode(bytes.slice(0, i)) +
          d.decode(bytes.slice(i)) +
          d.decode(new Uint8Array(), true),
      ).toBe(text);
    }
  });
  it("handles comments, CRLF, multiline data and individual bytes", () => {
    const events: unknown[] = [];
    const p = new SseParser((e) => events.push(e));
    const bytes = new TextEncoder().encode(
      ": heartbeat\r\n\r\nevent: delta\r\ndata: 青岚\r\ndata: 山境\r\n\r\nevent: done\ndata: {}\n\n",
    );
    for (const byte of bytes) p.push(new Uint8Array([byte]));
    p.finish();
    expect(events).toEqual([
      { event: "delta", data: "青岚\n山境" },
      { event: "done", data: "{}" },
    ]);
  });
  it("does not invent a done event when the socket ends mid-frame", () => {
    const events: unknown[] = [];
    const p = new SseParser((e) => events.push(e));
    p.push("event: done\ndata: {}");
    p.finish();
    expect(events).toEqual([]);
  });
});
