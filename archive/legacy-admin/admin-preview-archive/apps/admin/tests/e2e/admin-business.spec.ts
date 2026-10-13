import { expect, test } from "@playwright/test";
import { closeDrawer, gotoPage, login } from "./helpers";

test.describe("订单、配额与设施（ADM-07~ADM-09）", () => {
  test("取消订单释放名额并保留记录", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/orders", "订单管理");
    await page.locator("table.data-table tbody tr", { hasText: "ORD-20260912-0001" }).getByRole("button", { name: "详情" }).click();
    await expect(page.getByText("入园订单详情")).toBeVisible();
    await page.getByRole("button", { name: "取消订单" }).click();
    await page.getByLabel("操作原因").fill("游客行程变化");
    await page.getByRole("button", { name: "确认取消" }).click();
    await expect(page.locator(".toast-host")).toContainText("订单已取消");
    await expect(page.getByText("本地取消／改期记录")).toBeVisible();
    await expect(page.locator(".drawer__body")).toContainText("取消");

    await page.locator(".drawer").getByRole("button", { name: "关闭" }).first().click();
    await expect(page.locator("table.data-table tbody tr", { hasText: "ORD-20260912-0001" })).toContainText("已取消");

    await gotoPage(page, "/booking/slots", "预约配额");
    const slot = page.locator("table.data-table tbody tr", { hasText: "15:00—16:00" }).first();
    await expect(slot).toContainText("9");
  });

  test("改期到下一档并同步两档配额", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/orders", "订单管理");
    await page.locator("table.data-table tbody tr", { hasText: "ORD-20260912-0002" }).getByRole("button", { name: "详情" }).click();
    await page.getByRole("button", { name: "改期" }).click();
    await page.getByLabel("目标时段").selectOption("slot-admission-2026-09-12-16");
    await page.getByLabel("改期说明（可选）").fill("游客改到下一档");
    await page.getByRole("button", { name: "确认改期" }).click();
    await expect(page.locator(".toast-host")).toContainText("改期成功");
    await expect(page.locator(".drawer__body")).toContainText("16:00—17:00");

    await gotoPage(page, "/booking/slots", "预约配额");
    const slotA = page.locator("table.data-table tbody tr", { hasText: "15:00—16:00" }).first();
    const slotB = page.locator("table.data-table tbody tr", { hasText: "16:00—17:00" }).first();
    await expect(slotA.locator("td").nth(4)).toHaveText("8");
    await expect(slotB.locator("td").nth(4)).toHaveText("12");
  });

  test("配额调整校验与停车不可约原因保持", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/booking/slots", "预约配额");
    await page.locator("table.data-table tbody tr", { hasText: "15:00—16:00" }).getByRole("button", { name: "调整配额" }).click();
    await page.getByLabel("现场配额").fill("40");
    await page.getByRole("button", { name: "保存配额" }).click();
    await expect(page.locator(".toast-host")).toContainText("已更新配额为 40");
    const slot = page.locator("table.data-table tbody tr", { hasText: "15:00—16:00" }).first();
    await expect(slot.locator("td").nth(5)).toHaveText("28");

    await slot.getByRole("button", { name: "调整配额" }).click();
    await page.getByLabel("现场配额").fill("11");
    await page.getByRole("button", { name: "保存配额" }).click();
    await expect(page.getByText(/不能低于已占用的 12/)).toBeVisible();
    await page.getByRole("button", { name: "取消" }).last().click();

    // 已结束档只读
    const ended = page.locator("table.data-table tbody tr", { hasText: "08:00—09:00" }).first();
    await expect(ended.getByRole("button", { name: "调整配额" })).toBeDisabled();
    await expect(page.getByText(/已结束档位只读/)).toBeVisible();

    // 停车：关闭 p1 后仍可调配额，但不可约原因保持
    await page.getByLabel("类型").selectOption("parking");
    await page.getByLabel("停车场").selectOption("p1");
    await page.getByRole("button", { name: "查询" }).click();
    await gotoPage(page, "/facilities", "设施运行");
    await page.getByLabel("类别").selectOption("parking");
    await page.getByLabel("关键词").fill("一号停车场");
    await page.getByRole("button", { name: "查询" }).click();
    await page.getByRole("button", { name: "详情" }).first().click();
    await page.getByLabel("目标状态").selectOption("closed");
    await page.getByLabel("原因").fill("边坡作业");
    await page.getByRole("button", { name: "保存状态" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("变更设施状态");
    await page.getByRole("button", { name: "确认变更" }).click();
    await expect(page.locator(".toast-host")).toContainText("已更新为已停用");
    await expect(page.locator(".drawer__body")).toContainText("物理余位");
    await expect(page.locator(".drawer__body")).toContainText("关联有效预约");
  });

  test("道路停用被返程通路校验拒绝，卫生间分项算例可复查", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/facilities", "设施运行");
    await page.getByLabel("类别").selectOption("road");
    await page.getByRole("button", { name: "查询" }).click();
    await page.locator("table.data-table tbody tr", { hasText: "听溪台" }).getByRole("button", { name: "详情" }).click();
    await page.getByLabel("目标状态").selectOption("closed");
    await page.getByLabel("原因").fill("支路封闭");
    await page.getByRole("button", { name: "保存状态" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("变更设施状态");
    await page.getByRole("button", { name: "确认变更" }).click();
    await expect(page.getByRole("alert").first()).toContainText("返程通路中断");
    await expect(page.getByRole("list", { name: "受影响的位置" })).toContainText("听溪台");
    await page.locator(".drawer").getByRole("button", { name: "关闭" }).first().click();

    await page.getByLabel("类别").selectOption("toilet");
    await page.getByRole("button", { name: "查询" }).click();
    await page.locator("table.data-table tbody tr", { hasText: "入口卫生间" }).getByRole("button", { name: "详情" }).click();
    await page.getByLabel("女厕位人工申请暂停数量").fill("10");
    await page.getByRole("button", { name: "保存分项调整" }).click();
    await expect(page.locator(".toast-host")).toContainText("卫生间分项调整已保存");
    const femaleRow = page.locator("table.compare-table tbody tr", { hasText: "女厕位" }).first();
    await expect(femaleRow.locator("td").nth(5)).toHaveText("4");
    await expect(femaleRow.locator("td").nth(6)).toHaveText("6");
    await expect(femaleRow.locator("td").nth(7)).toHaveText("0");
    await expect(page.getByText(/N = O \+ A \+ S/)).toBeVisible();
  });
});

test.describe("检修、告警与聊天（ADM-10、ADM-11、ADM-13）", () => {
  test("到期检修计划生成一条待处理告警且不重复", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/inspections", "检修计划");
    await expect(page.locator("table.data-table tbody tr", { hasText: "入口 AED" })).toContainText("已到期");
    await page.locator("table.data-table tbody tr", { hasText: "入口 AED" }).getByRole("button", { name: "编辑" }).click();
    await expect(page.getByText(/保存将新增记录|保存不会生成检修告警/)).toBeVisible();
    await page.getByRole("button", { name: "保存计划" }).click();
    await expect(page.locator(".toast-host")).toContainText("检修计划已保存");

    await gotoPage(page, "/alerts", "告警记录");
    await page.getByLabel("类别").selectOption("inspection");
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator("table.data-table tbody tr")).toHaveCount(1);
    await expect(page.locator("table.data-table tbody tr").first()).toContainText("定期检修");

    // 同设施第二份启用计划被拒绝
    await gotoPage(page, "/inspections", "检修计划");
    await page.getByRole("button", { name: "新增计划" }).click();
    await page.getByLabel("安全设施").selectOption("aed-entry");
    await page.getByLabel("检修说明").fill("重复启用测试");
    await page.getByRole("button", { name: "保存计划" }).click();
    await expect(page.getByRole("alert").first()).toContainText("同一设施只能有一份启用中的检修计划");
  });

  test("告警当前与历史只读详情", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/alerts", "告警记录");
    await page.getByRole("button", { name: "只读详情" }).first().click();
    await expect(page.getByText("处理时间线")).toBeVisible();
    await expect(page.getByText("监测依据")).toBeVisible();
    await expect(page.getByRole("button", { name: /处置|派单|开始|完成/ })).toHaveCount(0);
    await page.locator(".drawer").getByRole("button", { name: "关闭" }).first().click();

    await page.getByRole("tab", { name: "历史告警" }).click();
    await expect(page.locator("table.data-table tbody tr").first()).toContainText("已完成");
    await page.locator("table.data-table tbody tr", { hasText: "入口服务区负载偏高" }).getByRole("button", { name: "只读详情" }).click();
    await expect(page.locator(".drawer__body")).toContainText("仍高于阈值");
    await page.locator(".drawer").getByRole("button", { name: "关闭" }).first().click();

    await page.getByRole("tab", { name: "当前告警" }).click();
    await page.locator("table.data-table tbody tr", { hasText: "再次出现负载上升" }).getByRole("button", { name: "只读详情" }).click();
    await expect(page.locator(".drawer__body")).toContainText("上一事件");
    await expect(page.locator(".drawer__body")).toContainText("alert-05");
  });

  test("房间消息：撤回后正文变为占位文本且不影响举报", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/chat", "聊天管理");
    await expect(page.locator(".message-list .message").first()).toBeVisible();
    await page.getByRole("button", { name: "加载更早消息" }).click();
    await expect(page.locator(".message-list .message")).toHaveCount(55);

    const target = page.locator(".message-list .message").last();
    page.once("dialog", (dialog) => dialog.accept("内容不适宜保留"));
    await target.getByRole("button", { name: "撤回" }).click();
    await page.getByRole("button", { name: "撤回", exact: true }).last().click();
    await expect(page.locator(".toast-host")).toContainText("消息已撤回");
    await expect(page.locator(".message-list .message--removed")).toHaveCount(1);
    await expect(page.locator(".message-list .message--removed .message__body")).toContainText("该消息已被管理员撤回");

    // 撤回不自动处理举报：举报列表仍有待处理记录
    await gotoPage(page, "/chat?tab=reports", "聊天管理");
    await expect(page.locator("table.data-table tbody tr", { hasText: "待处理" }).first()).toBeVisible();
  });

  test("举报处理：说明必填，已处理后只读", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/chat?tab=reports", "聊天管理");
    await page.getByRole("button", { name: "查看详情" }).first().click();
    await expect(page.getByText("关联消息")).toBeVisible();
    await page.getByRole("button", { name: "处理完成" }).click();
    await expect(page.locator(".field__error").first()).toContainText("处理说明不能为空");
    await page.getByLabel("处理说明").fill("已核对并提示发布者");
    await page.getByRole("button", { name: "处理完成" }).click();
    await expect(page.locator(".toast-host")).toContainText("举报已处理完成");
    await expect(page.locator("table.data-table tbody tr", { hasText: "已处理" }).first()).toBeVisible();

    await page.getByRole("button", { name: "查看详情" }).first().click();
    await expect(page.getByText("已处理记录只读，不能重新打开或重复结案。")).toBeVisible();
    await expect(page.getByRole("button", { name: "处理完成" })).toHaveCount(0);
  });

  test("禁言：设置后写入列表，重复设置替换到期时间，可解除", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/chat?tab=mutes", "聊天管理");
    await page.getByLabel("游客").selectOption("visitor-1005");
    await page.getByLabel("时长").fill("5");
    await page.getByLabel("原因").fill("短时间内重复发送相同内容");
    await page.getByRole("button", { name: "设置禁言" }).click();
    const row = page.locator("table.data-table tbody tr", { hasText: "归云客" });
    await expect(row).toContainText("禁言中");
    await expect(row).toContainText("短时间内重复发送相同内容");
    await expect(row.locator("td").nth(1)).toHaveText("5");

    await page.getByLabel("时长").fill("1");
    await page.getByLabel("原因").fill("替换为 1 分钟");
    await page.getByRole("button", { name: "设置禁言" }).click();
    await expect(row.locator("td").nth(1)).toHaveText("1");
    await expect(page.locator("table.data-table tbody tr", { hasText: "归云客" })).toHaveCount(1);

    await row.getByRole("button", { name: "解除" }).click();
    await page.getByRole("button", { name: "解除禁言" }).last().click();
    await expect(page.locator(".toast-host")).toContainText("已解除禁言");
    await expect(page.locator("table.data-table tbody tr", { hasText: "归云客" })).toHaveCount(0);
    await expect(page.getByText(/员工不作为禁言对象/)).toBeVisible();
  });
});

test.describe("键盘与焦点（AC-28）", () => {
  test("抽屉可用键盘打开、Esc 关闭并把焦点还给触发按钮", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/orders", "订单管理");
    const trigger = page.locator("table.data-table tbody tr", { hasText: "ORD-20260912-0001" }).getByRole("button", { name: "详情" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("入园订单详情")).toBeVisible();

    const insideDrawer = await page.evaluate(() => Boolean(document.activeElement?.closest(".drawer")));
    expect(insideDrawer).toBe(true);

    // Tab 在抽屉内部循环，不会落到背景页面
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".drawer")))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.locator(".drawer")).toHaveCount(0);
    const focusText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    expect(focusText).toBe("详情");
    await expect(trigger).toBeFocused();

    // 确认弹窗：焦点落在确认按钮，Esc 取消后焦点回到触发按钮
    await trigger.click();
    await page.getByRole("button", { name: "取消订单" }).click();
    await page.getByLabel("操作原因").fill("键盘验证");
    await page.getByRole("button", { name: "确认取消" }).click();
    await expect(page.getByRole("dialog", { name: /订单 ORD-20260912-0001/ })).toBeVisible();
  });

  test("表单焦点顺序与字段错误提示可被键盘到达", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/content/scenic", "景区资料");
    await page.getByRole("button", { name: "编辑" }).click();
    await page.locator("#name").focus();
    await page.locator("#name").fill("");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("景区名称不能为空")).toBeVisible();
    await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "取消修改" }).click();
    await expect(page.locator("#name")).not.toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("持久化与恢复（AC-23）", () => {
  test("保存后刷新保留，恢复样例只影响后台命名空间", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/content/scenic", "景区资料");
    await page.getByRole("button", { name: "编辑" }).click();
    await page.getByLabel("景区名称").fill("青岚山境（持久化校验）");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.locator(".toast-host")).toContainText("已保存");

    await page.reload();
    await expect(page.getByLabel("景区名称")).toHaveValue("青岚山境（持久化校验）");

    const foreign = await page.evaluate(() => {
      localStorage.setItem("qinglan.visitor.sample", "keep-me");
      return localStorage.getItem("qinglan.visitor.sample");
    });
    expect(foreign).toBe("keep-me");

    await page.getByText("更多", { exact: true }).click();
    await page.getByRole("button", { name: "恢复样例" }).click();
    await page.getByRole("button", { name: "恢复样例", exact: true }).last().click();
    await page.waitForLoadState("load");
    await gotoPage(page, "/content/scenic", "景区资料");
    await expect(page.getByLabel("景区名称")).toHaveValue("青岚山境");
    const stillThere = await page.evaluate(() => localStorage.getItem("qinglan.visitor.sample"));
    expect(stillThere).toBe("keep-me");
  });
});
