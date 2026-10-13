import { describe, expect, it } from "vitest";
import { parseWallClock } from "../../src/core/time";
import { resolveRoute } from "../../src/router";
import { bootContext } from "./helpers";
import { getRun, getStore } from "../../src/services/store";

describe("复审边界", () => {
  it("非法 URL 编码进入未知页，正常编码仍解析", () => {
    expect(resolveRoute("/content/articles/%/edit").name).toBe("not-found");
    expect(resolveRoute("/content/articles/%E4%B8%AD/edit").params.id).toBe("中");
  });
  it.each(["2026-02-30T12:00", "2026-13-12T12:00", "2026-09-12T24:00", "2026-09-12T12:60"])("拒绝被日期对象自动进位的公告时间：%s", (value) => {
    expect(parseWallClock(value)).toBeNull();
    expect(parseWallClock("2026-09-12T12:00")).not.toBeNull();
  });
  it("所有房间消息显示的昵称与作者账号一致", () => {
    bootContext();
    for (const message of getRun().messages) {
      expect(message.authorNickname).toBe(getStore().global.users.find((user) => user.id === message.authorId)?.nickname);
    }
  });
});
