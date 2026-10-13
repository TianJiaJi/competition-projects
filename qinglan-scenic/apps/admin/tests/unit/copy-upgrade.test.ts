import { describe, expect, it } from "vitest";
import { upgradeStoredCopy } from "../../src/core/copy-upgrade";
import { createSession, readSession } from "../fixtures/session";
import { createFakeStorage, SESSION_KEY } from "./helpers";

describe("历史内置文案更新", () => {
  it("更新旧版固定说明，保留用户内容、标识与业务状态，不修改传入对象", () => {
    const original = {
      id: "run_admin_mock_20260912", count: 406, status: "confirmed",
      records: [{ actor: "演示值班员", body: "用户补充\n> 本页内容为演示说明，不代表景区正式公告。" }],
      custom: "我写的演示说明，不属于内置文案", deletedAt: null,
    };
    const updated = upgradeStoredCopy(original);
    expect(updated).toEqual({
      ...original,
      records: [{ actor: "值班员", body: "用户补充\n> 出行前请留意景区最新公告。" }],
    });
    expect(original.records[0].actor).toBe("演示值班员");
    expect(upgradeStoredCopy(updated)).toEqual(updated);
  });
  it("已有登录会话保留有效期和身份，只更新旧默认称呼", () => {
    const backend = createFakeStorage();
    const original = createSession("admin_demo", "演示值班员", "staff-demo");
    backend.setItem(SESSION_KEY, JSON.stringify(original));
    expect(readSession(backend)).toEqual({ ...original, nickname: "值班员" });
  });
});
