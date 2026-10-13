import { expect, test, type Page } from '@playwright/test';
import { scenario } from '../../scenario/config';
import { todayInShanghai } from '../../packages/bookings/src';
import { setWheelTime } from './time-wheel-helper';
const mobile = `http://localhost:${process.env.E2E_MOBILE_PORT || scenario.ports.mobile}`;
const staff = `http://localhost:${process.env.E2E_STAFF_PORT || scenario.ports.staff}`;
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [360, 390, 430, 540]) {
  test(`表单/登录/个人页对齐 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${mobile}/#/pages/login/index`);
    await expect(page.getByText('演示账号', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '账号' })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `test-results/student-login-${width}.png` });
    await page.goto(`${mobile}/#/pages/me/index`);
    const card = await page.locator('.profile-card').boundingBox();
    const login = await page.getByRole('button', { name: '登录 / 进入' }).boundingBox();
    expect(Math.abs((login!.x + login!.width / 2) - (card!.x + card!.width / 2))).toBeLessThan(2);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/student-profile-${width}.png` });
    await page.goto(`${mobile}/#/pages/leave/index`);
    await expect(page.locator('.date-scroll')).toHaveCount(0);
    await expect(page.locator('.leave-group')).toHaveCount(3);
    await page.locator('.field-leavingCampus').getByRole('button', { name: '是', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '详细地址', exact: true })).toBeVisible();
    const positions = await page.locator('.leave-row .leave-label').evaluateAll((labels) => labels.map((label) => Math.round(label.getBoundingClientRect().x)));
    expect(new Set(positions).size).toBe(1);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/student-leave-form-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '请假时长', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `test-results/student-leave-calendar-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('请假表单校验、秒级时间选择和不离校隐藏去向字段', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${mobile}/#/pages/leave/index`);
  await page.getByRole('button', { name: '登录并提交' }).click();
  await expect(page.getByRole('alert')).toContainText('必填');
  await expect(page).toHaveURL(/pages\/leave\/index/);
  await page.locator('.field-leavingCampus').getByRole('button', { name: '否', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '详细地址', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '请假时长', exact: true }).click();
  const date = new Date(`${todayInShanghai()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const day = date.toISOString().slice(0, 10);
  const dialog = page.getByRole('dialog');
  if (day.slice(0, 7) !== todayInShanghai().slice(0, 7)) await dialog.getByRole('button', { name: '下个月' }).click();
  await dialog.getByRole('button', { name: day, exact: true }).click();
  await dialog.getByRole('button', { name: day, exact: true }).click();
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await dialog.getByRole('button', { name: '下一步，选时间' }).click();
  const hourWheel = dialog.getByRole('spinbutton', { name: '开始时', exact: true });
  await hourWheel.hover();
  await page.mouse.wheel(0, 100);
  await expect(hourWheel).toHaveAttribute('aria-valuenow', '9');
  await page.screenshot({ path: 'test-results/leave-wheel-scroll.png' });
  await setWheelTime(page, '开始', '14:20:30');
  await setWheelTime(page, '结束', '10:00:00');
  await dialog.getByRole('button', { name: '完成时间选择' }).click();
  await expect(dialog.getByRole('alert')).toContainText('必须晚于');
  await dialog.getByRole('spinbutton', { name: '结束时', exact: true }).press('End');
  await expect(dialog.getByRole('spinbutton', { name: '结束时', exact: true })).toHaveAttribute('aria-valuenow', '23');
  await setWheelTime(page, '结束', '14:20:31');
  await dialog.getByRole('button', { name: '返回日历' }).click();
  await expect(dialog.getByRole('button', { name: day, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '下一步，选时间' }).click();
  await expect(dialog.getByRole('button', { name: '设置结束时间' })).toContainText('14:20:31');
  await dialog.getByRole('button', { name: '完成时间选择' }).click();
  await expect(page.locator('.field-time')).toContainText('1 秒');
  await expect(page.locator('.field-time')).toContainText('14:20:30');
  await expect(page.locator('.field-time')).toContainText('14:20:31');
});

test('教师账号提示隐藏、教学分类没有浏览器默认按钮背景', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(staff);
  await expect(page.getByText('演示账号', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: '进入工作台' }).click();
  await page.getByRole('button', { name: '教学', exact: true }).click();
  const neutral = page.getByRole('button', { name: '我的班级', exact: true });
  expect(await neutral.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/teacher-teaching-ui-390.png' });
});
