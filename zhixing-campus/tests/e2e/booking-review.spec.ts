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

test("全局重置自动刷新学生教师后台，清除申请与内存修改并恢复预置历史", async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const teacher = await browser.newPage();
  const admin = await browser.newPage();
  try {
    await studentLogin(student);
    await studentBooking(student, '重置前预约记录');
    await teacherLogin(teacher);
    await isolate(admin);
    await admin.goto(`${adminUrl}/#/notices`);
    await admin.getByRole('button', { name: '进入工作台' }).click();
    await admin.getByRole('button', { name: '新增', exact: true }).click();
    await admin.getByLabel('名称', { exact: true }).fill('重置前新增公告');
    await admin.getByLabel('位置', { exact: true }).fill('服务中心');
    await admin.getByLabel('详细说明', { exact: true }).fill('大重置应清除此内存更改');
    await admin.getByRole('button', { name: '保存', exact: true }).click();
    await expect(admin.getByText('重置前新增公告', { exact: true })).toBeVisible();
    // Ensure every terminal has an established baseline before resetting.
    await Promise.all([student, teacher, admin].map(page => page.waitForResponse('**/api/demo/revision')));
    const reloaded = Promise.all([student, teacher, admin].map(page => page.waitForEvent('load')));
    const response = await fetch(isolatedUrl + '/api/demo/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'reset-campus-demo' }) });
    expect(response.status).toBe(200);
    await reloaded;
    await expect(teacher.getByRole('button', { name: '进入工作台' })).toBeVisible();
    await expect(admin.getByRole('button', { name: '进入工作台' })).toBeVisible();
    await admin.getByRole('button', { name: '进入工作台' }).click();
    await expect(admin.getByText('重置前新增公告', { exact: true })).toHaveCount(0);
    await expect(admin.getByText(scenario.seed.notices[0].title, { exact: true })).toBeVisible();
    expect(await (await fetch(isolatedUrl + '/api/bookings')).json()).toEqual({ data: [] });
    // Re-enter the same booking slot: the old application no longer blocks it.
    await studentLogin(student);
    await studentBooking(student, '重置后再次预约');
  } finally { await student.close(); await teacher.close(); await admin.close(); }
});

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

test('学生打开完整假条、撤回修改重提、旧版本审批被拒绝，最新审核后可取消', async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const teacher = await browser.newPage();
  const date = new Date(`${todayInShanghai()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 2);
  const day = date.toISOString().slice(0, 10);
  const reason = '请假前往医院进行检查';
  const changed = '修改后前往医院复诊检查';
  const response = await fetch(isolatedUrl + '/api/leaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    owner: '林悦', type: '病假', startDate: day, startTime: '08:10:15', endDate: day, endTime: '10:30:20',
    reason, phone: '13900001001', leavingCampus: true, leavingCity: true, destination: '医院就诊', address: '人民医院门诊部',
    emergencyName: '林女士', emergencyPhone: '13900001111', nature: '日常请假', cc: ['陈越'], confirmed: true,
  }) });
  expect(response.status).toBe(201);
  const original = (await response.json()).data;
  try {
    await studentLogin(student);
    await student.goto(`${mobileUrl}/#/pages/records/index?category=leave`);
    const card = student.locator('.service-record').filter({ hasText: reason });
    await card.locator('.record-title').click();
    await expect(student).toHaveURL(/pages\/leave-detail\/index/);
    await expect(student.locator('.detail-status-title')).toHaveText('待审核');
    await expect(student.locator('.leave-progress')).toContainText('等待陈越');
    for (const value of ['人民医院门诊部', '林女士', '13900001111', '13900001001', '2024010101', '08:10:15', '10:30:20', '2 小时 20 分钟 5 秒', original.id]) {
      await expect(student.locator('.leave-detail-fields').filter({ hasText: value }).first()).toBeVisible();
    }
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await student.screenshot({ path: '.local/qa/student-leave-detail-pending.png', fullPage: true });
    await teacherLogin(teacher);
    await teacher.getByRole('button', { name: '审批', exact: true }).click();
    await teacher.getByRole('button', { name: /学生请假/ }).click();
    await teacher.getByRole('button', { name: '刷新申请' }).click();
    await teacher.locator('.teacher-card').filter({ hasText: reason }).click(); // Keep the original version open.
    await student.getByRole('button', { name: '撤回修改', exact: true }).click();
    await expect(student.getByRole('dialog', { name: '撤回修改', exact: true })).toBeVisible();
    await expect(student.locator('.uni-modal:visible')).toHaveCount(0);
    await expect(student.locator('uni-toast:visible')).toHaveCount(0);
    await student.screenshot({ path: '.local/qa/leave-confirm-withdraw.png' });
    await student.getByRole('dialog').getByRole('button', { name: '确认撤回', exact: true }).click();
    await expect(student).toHaveURL(/pages\/leave\/index\?id=/);
    await expect(student.getByRole('textbox', { name: '请假事由', exact: true })).toHaveValue(reason);
    await expect(student.getByRole('textbox', { name: '详细地址', exact: true })).toHaveValue('人民医院门诊部');
    await expect(student.locator('.field-leavingCity').getByRole('button', { name: '是', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(student.locator('.field-time')).toContainText('08:10:15');
    await expect(student.getByRole('button', { name: /本人确认/ })).toHaveAttribute('aria-pressed', 'false');
    await student.getByRole('textbox', { name: '请假事由', exact: true }).fill(changed);
    await student.getByRole('textbox', { name: '详细地址', exact: true }).fill('市第一人民医院门诊部');
    await student.getByRole('button', { name: /本人确认/ }).click();
    const path = `**/api/leaves/${original.id}`;
    await student.route(path, route => route.abort());
    await student.getByRole('button', { name: '重新提交审核', exact: true }).click();
    await expect(student.getByRole('alert')).toContainText('暂不可连接');
    await expect(student.getByRole('textbox', { name: '请假事由', exact: true })).toHaveValue(changed);
    await student.unroute(path);
    await student.getByRole('button', { name: '重新提交审核', exact: true }).click();
    await expect(student).toHaveURL(/pages\/leave-detail\/index/);
    await expect(student.locator('.detail-status-title')).toHaveText('待审核');
    await expect(student.locator('.leave-event')).toHaveCount(3);
    await expect(student.locator('.leave-event-list')).toContainText('修改后重新提交');
    await expect(student.locator('.leave-detail-fields').filter({ hasText: changed })).toBeVisible();
    await teacher.getByRole('button', { name: '通过申请', exact: true }).click();
    await expect(teacher.getByRole('alert')).toContainText('表单已更新');
    await teacher.getByRole('button', { name: '关闭详情' }).click();
    await teacher.getByRole('button', { name: '刷新申请' }).click();
    await teacher.locator('.teacher-card').filter({ hasText: changed }).click();
    await expect(teacher.getByRole('dialog')).toContainText('市第一人民医院门诊部');
    await teacher.getByRole('button', { name: '通过申请', exact: true }).click();
    await student.getByRole('button', { name: '刷新假条详情' }).click();
    await expect(student.locator('.detail-status-title')).toHaveText('已通过');
    await expect(student.getByRole('button', { name: '撤回修改', exact: true })).toHaveCount(0);
    await student.getByRole('button', { name: '取消申请', exact: true }).click();
    await expect(student.getByRole('dialog', { name: '取消申请', exact: true })).toBeVisible();
    await expect(student.locator('.uni-modal:visible')).toHaveCount(0);
    await expect(student.locator('uni-toast:visible')).toHaveCount(0);
    await student.screenshot({ path: '.local/qa/leave-confirm-cancel.png' });
    await student.getByRole('dialog').getByRole('button', { name: '确认取消', exact: true }).click();
    await expect(student.locator('.detail-status-title')).toHaveText('已取消');
    await expect(student.locator('.leave-event')).toHaveCount(5);
    await expect(student.locator('.leave-detail-actions')).toHaveCount(0);
    const saved = (await (await fetch(isolatedUrl + '/api/leaves?owner=' + encodeURIComponent('林悦'))).json()).data;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: original.id, status: 'cancelled', reason: changed });
    await student.reload();
    await expect(student.locator('.detail-status-title')).toHaveText('已取消');
    await expect(student.locator('.leave-event')).toHaveCount(5);
  } finally { await student.close(); await teacher.close(); }
});

test('已通过假条可确认核销，学生与教师均显示完结且不能再次操作', async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const teacher = await browser.newPage();
  const date = new Date(`${todayInShanghai()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 2);
  const day = date.toISOString().slice(0, 10);
  const reason = '核销流程测试请假事由';
  const response = await fetch(isolatedUrl + '/api/leaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    owner: '林悦', type: '事假', startDate: day, endDate: day, startTime: '08:00:00', endTime: '10:00:00', reason, phone: '13900001001',
    leavingCampus: false, leavingCity: false, destination: '', address: '', emergencyName: '林女士', emergencyPhone: '13900001111', nature: '日常请假', cc: [], confirmed: true,
  }) });
  expect(response.status).toBe(201);
  const item = (await response.json()).data;
  expect((await fetch(isolatedUrl + `/api/leaves/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', reviewer: '陈越', expectedRevision: 1 }) })).status).toBe(200);
  try {
    let completeRequests = 0;
    student.on('request', request => { if (request.method() === 'PATCH' && request.postDataJSON()?.action === 'complete') completeRequests++; });
    await studentLogin(student);
    await student.goto(`${mobileUrl}/#/pages/records/index?category=leave`);
    const card = student.locator('.service-record').filter({ hasText: reason });
    await card.getByRole('button', { name: '去核销', exact: true }).click();
    await expect(student.locator('.leave-progress')).toContainText('等待本人核销');
    await expect(student.getByRole('button', { name: '取消申请', exact: true })).toBeVisible();
    await student.getByRole('button', { name: '核销假条', exact: true }).click();
    const confirmation = student.getByRole('dialog', { name: '核销假条', exact: true });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('已通过');
    await expect(confirmation).toContainText('已完结');
    await expect(student.locator('.uni-modal:visible')).toHaveCount(0);
    await expect(student.locator('uni-toast:visible')).toHaveCount(0);
    await student.screenshot({ path: '.local/qa/leave-confirm-complete.png' });
    await confirmation.getByRole('button', { name: '暂不操作', exact: true }).click();
    await expect(student.locator('.detail-status-title')).toHaveText('已通过');
    expect(completeRequests).toBe(0);
    await student.getByRole('button', { name: '核销假条', exact: true }).click();
    await student.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await student.getByRole('button', { name: '核销假条', exact: true }).click();
    let finish!: () => void;
    const hold = new Promise<void>(resolve => { finish = resolve; });
    await student.route(`**/api/leaves/${item.id}`, async route => { await hold; await route.fallback(); });
    await confirmation.getByRole('button', { name: '确认核销', exact: true }).click();
    await expect(confirmation.getByRole('button', { name: '正在处理…', exact: true })).toBeDisabled();
    await expect(confirmation.getByRole('button', { name: '关闭确认面板' })).toBeDisabled();
    await expect(confirmation.getByRole('button', { name: '暂不操作', exact: true })).toBeDisabled();
    await student.keyboard.press('Escape');
    await expect(confirmation).toBeVisible();
    finish();
    await expect(student.locator('.detail-status-title')).toHaveText('已完结');
    await expect(student.locator('.leave-progress')).toContainText('正常完结');
    await expect(student.locator('.leave-event-list')).toContainText('返校核销 · 流程完结');
    await expect(student.locator('.leave-detail-fields').filter({ hasText: '核销人' })).toContainText('林悦');
    await expect(student.locator('.leave-detail-actions')).toHaveCount(0);
    expect(completeRequests).toBe(1);
    await student.screenshot({ path: '.local/qa/student-leave-completed.png', fullPage: true });
    await student.getByRole('button', { name: '返回', exact: true }).click();
    await expect(card).toContainText('已完结');
    await expect(card.getByRole('button', { name: /去核销|取消请假/ })).toHaveCount(0);
    await card.getByRole('button', { name: '查看假条详情' }).click();
    await expect(student.locator('.detail-status-title')).toHaveText('已完结');
    await teacherLogin(teacher);
    await teacher.getByRole('button', { name: '审批', exact: true }).click();
    await teacher.getByRole('button', { name: /学生请假/ }).click();
    await teacher.getByRole('button', { name: '刷新申请' }).click();
    await teacher.getByRole('combobox', { name: '状态筛选' }).selectOption('completed');
    await teacher.locator('.teacher-card').filter({ hasText: reason }).click();
    await expect(teacher.getByRole('dialog')).toContainText('已核销完结');
    await expect(teacher.getByRole('button', { name: '通过申请', exact: true })).toHaveCount(0);
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
