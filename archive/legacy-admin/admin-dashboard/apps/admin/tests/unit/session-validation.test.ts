import { describe, expect, it } from "vitest";
import { createFakeStorage, SESSION_KEY } from "./helpers";
import { createSession, readSession, SESSION_MS } from "../fixtures/session";

describe("员工会话读取校验", () => {
  it("完整的演示员工会话可恢复", () => {
    const backend = createFakeStorage();
    const session = createSession("admin_demo", "值班员", "staff-demo");
    backend.setItem(SESSION_KEY, JSON.stringify(session));
    expect(readSession(backend)).toEqual(session);
  });
  it.each([
    { userId: "visitor-1001" }, { username: "visitor" }, { demo: false },
    { nickname: null }, { startedAt: null }, { expiresAt: null },
    { startedAt: Date.now() + SESSION_MS, expiresAt: Date.now() + 2 * SESSION_MS },
    { startedAt: Date.now() - 2 * SESSION_MS, expiresAt: Date.now() - SESSION_MS },
    { expiresAt: Date.now() + 2 * SESSION_MS },
  ])("无效或非员工会话被丢弃：%j", (overrides) => {
    const backend = createFakeStorage();
    backend.setItem(SESSION_KEY, JSON.stringify({ ...createSession("admin_demo", "值班员", "staff-demo"), ...overrides }));
    expect(readSession(backend)).toBeNull();
    expect(backend.getItem(SESSION_KEY)).toBeNull();
  });
});
