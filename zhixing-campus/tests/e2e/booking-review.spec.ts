import { expect, test, type Page } from "@playwright/test";
import { scenario } from "../../scenario/config";
import { todayInShanghai } from "../../packages/bookings/src";
import { setWheelTime } from './time-wheel-helper';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createBookingServer } from '../../scripts/booking-service.mjs';
let isolatedServer:Server, isolatedUrl:string, temporary:string;
test.beforeEach(async()=>{
  temporary=mkdtempSync(join(tmpdir(),'campus-approval-e2e-'));
  isolatedServer=createBookingServer({dataFile:join(temporary,'bookings.json')});
  await new Promise<void>(resolve=>isolatedServer.listen(0,'127.0.0.1',resolve));
  const address=isolatedServer.address();if(!address || typeof address==='string')throw Error('测试服务未启动');
  isolatedUrl=`http://127.0.0.1:${address.port}`;
});
test.afterEach(async()=>{await new Promise<void>((resolve,reject)=>isolatedServer.close(error=>error?reject(error):resolve()));rmSync(temporary,{recursive:true,force:true});});
async function isolate(page:Page){await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/')){await route.fallback();return;}const response=await route.fetch({url:isolatedUrl+url.pathname+url.search});await route.fulfill({response});});}
const mobileUrl = `http://localhost:${process.env.E2E_MOBILE_PORT || scenario.ports.mobile}`;
const staffUrl = `http://localhost:${process.env.E2E_STAFF_PORT || scenario.ports.staff}`;
const adminUrl = `http://localhost:${process.env.E2E_ADMIN_PORT || scenario.ports.admin}`;
async function studentLogin(page: Page) {
  await isolate(page);
  await page.goto(`${mobileUrl}/#/pages/login/index`);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
async function studentBooking(page: Page, activity: string) {
  await page.goto(`${mobileUrl}/#/pages/booking/index`);
  await expect(page.locator(".slot-option").first()).toBeVisible();
  await page.locator(".slot-option:not(.unavailable)").first().click();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("textbox", { name: "活动名称" }).fill(activity);
  await page.getByRole("textbox", { name: "使用用途" }).fill("软件工程项目讨论与汇报");
  await page.getByRole("button", { name: /下一步/ }).click();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/bookings") && response.request().method() === "POST");
  await page.getByRole("button", { name: /确认提交申请/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  return (await response.json()).data.id as string;
}
async function teacherLogin(page: Page) {
  await isolate(page);
  await page.goto(staffUrl);
  await page.getByRole("button", { name: "进入工作台" }).click();
}

test("学生完整预约 → 教师终审 → 学生查看/取消，管理员只读", async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const teacher = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const admin = await browser.newPage();
  await isolate(admin);
  const activity = `课程研讨${Date.now()}`;
  try {
    await studentLogin(student);
    const id = await studentBooking(student, activity);
    const card = student.locator(".notice-card").filter({ hasText: activity });
    await expect(card).toContainText("待审核");
    await teacherLogin(teacher);
    await teacher.getByRole("button", { name: "审批", exact: true }).click();
    await teacher.getByRole("button", { name: "刷新申请" }).click();
    await teacher.getByRole("textbox", { name: "搜索教室预约" }).fill(id);
    await teacher.locator(".teacher-card").filter({ hasText: activity }).click();
    await expect(teacher.getByRole("dialog")).toContainText("软件工程项目讨论与汇报");
    await teacher.getByRole("button", { name: "通过申请" }).click();
    await expect(teacher.getByRole("dialog")).toContainText("已预约");
    await student.getByRole("button", { name: "刷新审批消息" }).click();
    await expect(card).toContainText("已预约");
    await admin.goto(`${adminUrl}/#/bookings`);
    await admin.getByRole("button", { name: "进入工作台" }).click();
    await admin.getByRole("button", { name: "刷新申请" }).click();
    await admin.getByRole("textbox", { name: "搜索教室预约" }).fill(id);
    await expect(admin.locator(".table-wrap tbody tr")).toHaveCount(1);
    await admin.locator(".table-wrap tbody tr .text-button").click();
    await expect(admin.getByRole("dialog")).toContainText(activity);
    await expect(admin.getByRole("dialog").getByRole("button", { name: /通过预约|拒绝申请/ })).toHaveCount(0);
    await card.getByRole("button", { name: "取消预约" }).click();
    await expect(card).toContainText("已取消");
  } finally { await student.close(); await teacher.close(); await admin.close(); }
});

test("教师拒绝预约需原因；学生可见反馈", async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const teacher = await browser.newPage();
  const activity = `预约驳回${Date.now()}`;
  try {
    await studentLogin(student);
    const id = await studentBooking(student, activity);
    await teacherLogin(teacher);
    await teacher.getByRole("button", { name: "审批", exact: true }).click();
    await teacher.getByRole("textbox", { name: "搜索教室预约" }).fill(id);
    await teacher.locator(".teacher-card").filter({ hasText: activity }).click();
    await teacher.getByRole("button", { name: "拒绝申请" }).click();
    await expect(teacher.getByRole("alert")).toContainText("请填写原因");
    await teacher.getByRole("textbox", { name: "拒绝原因" }).fill("请补充活动材料");
    await teacher.getByRole("button", { name: "拒绝申请" }).click();
    await student.getByRole("button", { name: "刷新审批消息" }).click();
    await expect(student.locator(".notice-card").filter({ hasText: activity })).toContainText("审核说明：请补充活动材料");
  } finally { await student.close(); await teacher.close(); }
});

test("学生请假 → 教师审批 → 学生查看结果", async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const teacher = await browser.newPage();
  const reason = `请假就医复查${Date.now()}`;
  try {
    await studentLogin(student);
    await student.goto(`${mobileUrl}/#/pages/leave/index`);
    await student.locator('.field-leavingCampus').getByRole('button', { name: '是', exact: true }).click();
    await student.locator('.field-leavingCity').getByRole('button', { name: '否', exact: true }).click();
    await student.getByRole('button', { name: '离校去向', exact: true }).click();
    await student.getByRole('dialog').getByRole('button', { name: /医院就诊/ }).click();
    await student.getByRole('textbox', { name: '详细地址', exact: true }).fill('人民医院门诊部');
    await student.getByRole('textbox', { name: '紧急联系人', exact: true }).fill('林女士');
    await student.getByRole('textbox', { name: '紧急联系人电话', exact: true }).fill('13900001111');
    await student.getByRole('button', { name: '请假类型', exact: true }).click();
    await student.getByRole('dialog').getByRole('button', { name: /病假/ }).click();
    await student.getByRole('button', { name: '请假性质', exact: true }).click();
    await student.getByRole('dialog').getByRole('button', { name: /日常请假/ }).click();
    await student.getByRole('button', { name: '请假时长', exact: true }).click();
    const date = new Date(`${todayInShanghai()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 2);
    const day = date.toISOString().slice(0, 10);
    const dialog = student.getByRole('dialog');
    if (day.slice(0, 7) !== todayInShanghai().slice(0, 7)) await dialog.getByRole('button', { name: '下个月' }).click();
    await dialog.getByRole('button', { name: day, exact: true }).click();
    await dialog.getByRole('button', { name: day, exact: true }).click();
    await dialog.getByRole('button', { name: '下一步，选时间' }).click();
    await setWheelTime(student, '开始', '08:10:15');
    await setWheelTime(student, '结束', '10:30:20');
    await dialog.getByRole('button', { name: '完成时间选择' }).click();
    await expect(student.locator('.field-time')).toContainText('2 小时 20 分钟 5 秒');
    await student.getByRole('textbox', { name: '请假事由' }).fill(reason);
    await student.getByRole('button', { name: /添加抄送人/ }).click();
    await student.getByRole('dialog').getByRole('button', { name: /陈越/ }).click();
    await student.getByRole('button', { name: /本人确认/ }).click();
    const response = student.waitForResponse((item) => item.url().endsWith("/api/leaves") && item.request().method() === "POST");
    await student.getByRole('button', { name: '提交申请', exact: true }).click();
    expect((await response).status()).toBe(201);
    const card = student.locator(".notice-card").filter({ hasText: reason });
    await expect(card).toContainText("待审核");
    await expect(card.locator('.record-meta')).toContainText('08:10:15');
    await teacherLogin(teacher);
    await teacher.getByRole("button", { name: "审批", exact: true }).click();
    await teacher.getByRole("button", { name: /学生请假/ }).click();
    await teacher.getByRole("button", { name: "刷新申请" }).click();
    await teacher.locator(".teacher-card").filter({ hasText: reason }).click();
    await expect(teacher.getByRole('dialog')).toContainText('人民医院门诊部');
    await expect(teacher.getByRole('dialog')).toContainText('林女士');
    await expect(teacher.getByRole('dialog')).toContainText('13900001111');
    await expect(teacher.getByRole('dialog')).toContainText('08:10:15');
    await expect(teacher.getByRole('dialog')).toContainText('10:30:20');
    await teacher.getByRole("button", { name: "通过申请" }).click();
    await student.getByRole("button", { name: "刷新审批消息" }).click();
    await expect(card).toContainText("已通过");
    const reviewerBox = await card.locator('.record-reviewer').boundingBox();
    const cancelBox = await card.getByRole('button', { name: '取消请假' }).boundingBox();
    expect(cancelBox!.y).toBeGreaterThanOrEqual(reviewerBox!.y + reviewerBox!.height);
    expect(await card.locator('.record-description').evaluate((el) => getComputedStyle(el).fontSize)).toBe('14px');
    await student.screenshot({ path: 'test-results/student-leave-approved-card.png', fullPage: true });
    await card.getByRole("button", { name: "取消请假" }).click();
    await expect(card).toContainText("已取消");
  } finally { await student.close(); await teacher.close(); }
});

test("预约服务不可用时保留填写资料和错误提示", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await studentLogin(page);
  await page.goto(`${mobileUrl}/#/pages/booking/index`);
  await expect(page.locator(".slot-option").first()).toBeVisible();
  await page.locator(".slot-option:not(.unavailable)").first().click();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("textbox", { name: "活动名称" }).fill("服务断开测试");
  await page.getByRole("textbox", { name: "使用用途" }).fill("模拟服务断开时保留资料");
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.route("**/api/bookings", (route) => route.abort());
  await page.getByRole("button", { name: /确认提交申请/ }).click();
  await expect(page.getByRole("alert")).toContainText("预约审核服务暂不可连接");
  await page.getByRole("button", { name: "返回修改资料" }).click();
  await expect(page.getByRole("textbox", { name: "活动名称" })).toHaveValue("服务断开测试");
});
