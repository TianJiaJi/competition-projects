import { chromium, expect } from "@playwright/test";
import { PNG } from "pngjs";

// Run only with scripts/experience-preview.ts; approvals are written to its temporary schema.
const browser = await chromium.launch();
const gate = await browser.newPage({ viewport: { width: 390, height: 844 } });
const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
for (const page of [gate, admin]) page.on("pageerror", error => errors.push(error.message));
const png = new PNG({ width: 2, height: 2 });
png.data.fill(180);
const photo = PNG.sync.write(png);
const prefix = `设施申请操作验收 ${Date.now()}`;

async function submitRequest(reason, withPhoto) {
  await gate.getByRole("button", { name: "发起申报" }).click();
  const dialog = gate.getByRole("dialog", { name: "发起现场申报" });
  await dialog.locator("select").nth(1).selectOption("creek");
  await dialog.getByPlaceholder("描述损坏、风险及现场情况").fill(reason);
  if (withPhoto) {
    await dialog.locator('input[type="file"]').setInputFiles({ name: "现场测试.png", mimeType: "image/png", buffer: photo });
    await expect(dialog).toContainText("已上传 1 张");
  }
  await dialog.getByRole("button", { name: "提交申报" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(gate.locator(".gate-workflow__row").filter({ hasText: reason })).toBeVisible();
}

try {
  await gate.goto("http://127.0.0.1:6177/");
  await gate.getByLabel("员工账号").fill("staff01");
  await gate.getByLabel("密码", { exact: true }).fill("123456");
  await gate.getByRole("button", { name: "登录", exact: true }).click();
  await gate.getByRole("button", { name: "报修", exact: true }).first().click();
  const approvedReason = `${prefix}：批准申请`;
  await submitRequest(approvedReason, true);

  await admin.goto("http://127.0.0.1:6179/");
  await admin.locator("#username").fill("admin01");
  await admin.locator("#password").fill("123456");
  await admin.getByRole("button", { name: "登录", exact: true }).click();
  await expect(admin.getByText("工作台", { exact: true }).first()).toBeVisible();
  await admin.goto("http://127.0.0.1:6179/#/oa");
  const approval = admin.locator(".workflow > article").filter({ hasText: approvedReason });
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "查看现场照片" }).click();
  const photoDialog = admin.getByRole("dialog", { name: "现场照片" });
  await expect(photoDialog).toBeVisible();
  const image = await photoDialog.locator("img").evaluate(element => ({ width: element.naturalWidth, y: element.getBoundingClientRect().y }));
  if (image.width !== 2 || image.y < 0 || image.y >= 900) throw Error("照片未显示在屏幕中");
  await photoDialog.getByRole("button", { name: "关闭照片" }).click();

  await approval.getByRole("button", { name: "批准并生成工单" }).click();
  let dialog = admin.getByRole("dialog", { name: "设施申请审批" });
  await expect(dialog).toContainText(approvedReason);
  await dialog.getByPlaceholder("说明批准或驳回原因").fill("核对照片后批准，安排维修");
  await dialog.getByRole("button", { name: "确认提交" }).click();
  await expect(approval.last()).toContainText("已批准");
  await expect(admin.locator(".workflow > article").filter({ hasText: approvedReason }).filter({ has: admin.getByRole("button", { name: "查看与处理" }) })).toBeVisible();

  const rejectedReason = `${prefix}：驳回申请`;
  await submitRequest(rejectedReason, false);
  await admin.reload();
  const rejection = admin.locator(".workflow > article").filter({ hasText: rejectedReason });
  await expect(rejection).toBeVisible();
  await rejection.getByRole("button", { name: "驳回" }).click();
  dialog = admin.getByRole("dialog", { name: "设施申请审批" });
  await expect(dialog).toContainText("驳回设施申请");
  await dialog.getByPlaceholder("说明批准或驳回原因").fill("信息不足，请补充现场照片后重报");
  await dialog.getByRole("button", { name: "确认提交" }).click();
  await expect(rejection).toContainText("已驳回");
  await expect(admin.locator(".workflow > article").filter({ hasText: rejectedReason }).filter({ has: admin.getByRole("button", { name: "查看与处理" }) })).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, photo: image, approvedReason, rejectedReason }));
} finally {
  await browser.close();
}
