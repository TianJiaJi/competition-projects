import { expect, test } from '@playwright/test';

test('CSS glass keeps native actions, material controls and remounting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const scene = page.locator('[data-glass-status]');
  const button = page.getByRole('button', { name: '开始游览', exact: true });
  await expect(scene).toHaveAttribute('data-glass-status', 'css');
  await expect(button).toHaveCSS('border-top-left-radius', '14px');
  await expect(button).toHaveCSS('backdrop-filter', 'blur(2px) saturate(1.12)');
  await button.click();
  await button.press('Enter');
  await button.press('Space');
  await expect(page.locator('.feedback')).toHaveText('开始游览 · 已触发 3 次');
  await expect(page.getByRole('button', { name: '暂不可用', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '正在处理', exact: true })).toBeDisabled();
  await page.getByRole('slider', { name: '圆角', exact: true }).fill('0');
  await expect(button).toHaveCSS('border-top-left-radius', '0px');
  await page.getByRole('slider', { name: '底色浓度', exact: true }).fill('0.1');
  await expect(button).toHaveCSS('--glass-tint-opacity', '0.1');
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(button).toHaveCSS('border-top-left-radius', '14px');
  await expect(button).toHaveCSS('--glass-tint-opacity', '0.18');
  await page.getByRole('checkbox', { name: '关闭模糊，保留通透感' }).check();
  await expect(scene).toHaveAttribute('data-glass-status', 'plain');
  await expect(button).toHaveCSS('backdrop-filter', 'none');
  await button.click();
  await expect(page.locator('.feedback')).toHaveText('开始游览 · 已触发 4 次');
  await page.getByRole('checkbox', { name: '关闭模糊，保留通透感' }).uncheck();
  await expect(button).toHaveCSS('backdrop-filter', 'blur(2px) saturate(1.12)');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '卸载场景', exact: true }).click();
    await expect(scene).toHaveCount(0);
    await page.getByRole('button', { name: '挂载场景', exact: true }).click();
    await expect(scene).toHaveAttribute('data-glass-status', 'css');
  }
  expect(errors).toEqual([]);
});

test('glass allocates no canvas or renderer and has no idle JS frame loop', async ({ page }) => {
  const rendererRequests: string[] = [];
  page.on('request', request => {
    if (/vendor\/renderer|renderer-adapter|liquid-glass-webgl/.test(request.url())) rendererRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const calls = { contexts: 0, frames: 0 };
    Object.assign(window, { glassRuntimeCalls: calls });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      calls.contexts++;
      return original.apply(this, args);
    } as typeof original;
    const frame = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { calls.frames++; return frame(callback); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '开始游览', exact: true }).click();
  await expect(page.locator('.feedback')).toHaveText('开始游览 · 已触发 1 次');
  await expect(page.locator('canvas')).toHaveCount(0);
  const calls = () => page.evaluate(() => (window as unknown as { glassRuntimeCalls: { contexts: number; frames: number } }).glassRuntimeCalls);
  const before = await calls();
  // A bounded idle window detects accidental continuous rendering after interaction.
  await page.waitForTimeout(250);
  expect(await calls()).toEqual(before);
  expect(before.contexts).toBe(0);
  expect(rendererRequests).toEqual([]);
});

test('broken background preserves actions and narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/landscape.svg?import&url', route => route.fulfill({
    contentType: 'text/javascript', body: 'export default "/missing-glass-background.svg";',
  }));
  await page.route('**/missing-glass-background.svg', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.feedback')).toContainText('玻璃背景加载失败');
  await page.getByRole('button', { name: '规划路线', exact: true }).click();
  await expect(page.locator('.feedback')).toHaveText('规划路线 · 已触发 1 次');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('reduced motion and forced colors preserve native button accessibility', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.liquid-glass-button__spinner')).toHaveCSS('animation-name', 'none');
  const button = page.getByRole('button', { name: '开始游览', exact: true });
  await button.press('Space');
  await expect(page.locator('.feedback')).toHaveText('开始游览 · 已触发 1 次');
  await button.hover();
  await expect(button).toHaveCSS('text-decoration-line', 'none');
  expect(await button.evaluate(el => getComputedStyle(el, '::before').opacity)).toBe('1');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(button).toHaveCSS('backdrop-filter', 'none');
  await button.press('Enter');
  await expect(page.locator('.feedback')).toHaveText('开始游览 · 已触发 2 次');
});

test('shared surface preserves semantic sections and the three material roles',async({page})=>{
  await page.goto('/');
  const surface=page.getByRole('region',{name:'公共玻璃容器预览'});
  await expect(surface).toHaveCSS('--glass-tint-opacity','0.18');
  await expect(surface).toHaveCSS('border-radius','14px');
  await expect(surface).toHaveCSS('backdrop-filter','blur(2px) saturate(1.12)');
  await expect(surface.getByRole('button',{name:'普通操作'})).toHaveCSS('--glass-tint-opacity','0.09');
  await expect(surface.getByRole('button',{name:'已选中'})).toHaveClass(/liquid-glass-button--primary/);
  await surface.getByRole('button',{name:'普通操作'}).press('Enter');
  await expect(page.locator('.feedback')).toHaveText('容器内操作 · 已触发 1 次');
});
