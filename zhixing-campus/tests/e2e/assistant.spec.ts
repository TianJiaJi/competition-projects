import { expect, test, type Page } from '@playwright/test';
import { scenario } from '../../scenario/config';
const url = `http://localhost:${process.env.E2E_MOBILE_PORT || 5502}`;
test.beforeEach(async ({ page }) => {
  await page.route('**/api/demo/revision', route => route.fulfill({ json: { data: { revision: 'assistant-ui' } } }));
});
async function open(page: Page) { await page.goto(`${url}/#/pages/assistant/index`); }
async function composerVisible(page: Page) {
  const box = await page.locator('.assistant-composer').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [360, 430]) {
  test(`助手首屏布局、固定输入与快捷问答 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 854 });
    await open(page);
    await expect(page.locator('.assistant-chevron')).toBeVisible();
    await expect(page.locator('.assistant-starter')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
    await expect(page.locator('.assistant-disclaimer')).toContainText('本地预设回答');
    await composerVisible(page);
    await page.screenshot({ path: `.local/qa/assistant-welcome-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /图书馆什么时候开放/ }).click();
    await expect(page.locator('.assistant-message.assistant').last()).toContainText(scenario.questions[2].answer);
    await expect(page.getByRole('log')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.assistant-message.user')).toHaveCount(1);
    await composerVisible(page);
    await page.screenshot({ path: `.local/qa/assistant-chat-${width}.png`, fullPage: true });
  });
}
test('多轮聊天只滚动消息区，收缩窗口后输入与最新回复仍可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await open(page);
  for (let index = 0; index < 5; index++) {
    const question = scenario.questions[index % 3];
    await page.getByRole('button', { name: new RegExp(question.question.replace('？', '')) }).click();
    await expect(page.locator('.assistant-message.assistant').last()).toContainText(question.answer);
    await expect(page.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  }
  await expect(page.locator('.assistant-message.user')).toHaveCount(5);
  await expect(page.locator('.assistant-message.assistant').last()).toBeInViewport();
  await composerVisible(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.setViewportSize({ width: 390, height: 460 });
  await composerVisible(page);
  await expect(page.locator('.assistant-message.assistant').last()).toBeInViewport();
  await page.screenshot({ path: '.local/qa/assistant-small-height.png', fullPage: true });
  // Scroll as a user: uni-app has nested wrappers with the same CSS class,
  // and the first wrapper is not the actual scrolling element.
  await page.locator('.assistant-thread').hover();
  await page.mouse.wheel(0, -10000);
  await expect(page.getByRole('button', { name: /回到最新消息/ })).toBeVisible();
  await page.getByRole('button', { name: /回到最新消息/ }).click();
  await expect(page.locator('.assistant-message.assistant').last()).toBeInViewport();
});
test('支持输入发送和新对话，返回箭头不依赖图片', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const input = page.getByRole('textbox', { name: '输入问题', exact: true });
  await input.fill('如何提交报修？');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.assistant-message.user')).toContainText('如何提交报修？');
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await expect(page.locator('.assistant-message')).toHaveCount(1);
  await expect(page.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.assistant-starter')).toHaveCount(3);
  await input.fill('图书馆什么时候开放？');
  await input.press('Enter');
  await expect(page.locator('.assistant-message.assistant').last()).toContainText(scenario.questions[2].answer);
  await page.route('**/static/icons/**', route => route.abort());
  await page.reload();
  await expect(page.locator('.assistant-chevron')).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.mobile-brand')).toHaveText('知行校园');
});
