import { expect, test } from '@playwright/test';
import { fixtures, receive, nav, noOverflow, selectChoice } from './helpers';
import { campusProject } from '../../apps/testing/src/campus-handoff';

test.beforeEach(async ({ page }) => fixtures(page));

test('放大预览浮于灰色遮罩上，右侧可校验和保存，收起不重载且保留草稿', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let requests = 0;
  page.on('request', request => { if (/:5502\//.test(request.url())) requests++; });
  await receive(page); await nav(page, 'UI测试');
  await page.getByRole('button', { name: '打开项目预览', exact: true }).click();
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '知行校园项目', exact: true })).toBeVisible();
  await selectChoice(page, '预览视口宽度', '430 px');
  await page.getByLabel('检查备注1', { exact: true }).fill('放大前填写的草稿');
  const before = await page.locator('.scaled-frame').boundingBox();
  const count = requests;
  await page.frameLocator('iframe').locator('body').evaluate(el => el.setAttribute('data-preview-state', 'retained'));
  const expand = page.getByRole('button', { name: '放大项目预览', exact: true });
  await expand.click();
  const dialog = page.getByRole('dialog', { name: '放大项目预览', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.preview-backdrop')).toHaveCSS('background-color', 'rgba(45, 48, 52, 0.58)');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(page.getByRole('button', { name: '关闭放大预览', exact: true })).toBeFocused();
  await expect.poll(async () => (await page.locator('.scaled-frame').boundingBox())!.width).toBeGreaterThan(before!.width);
  const preview = await dialog.locator('.preview-panel').boundingBox();
  const checklist = await dialog.locator('.ui-checklist').boundingBox();
  expect(checklist!.x).toBeGreaterThanOrEqual(preview!.x + preview!.width);
  await expect(dialog.getByLabel('检查备注1', { exact: true })).toHaveValue('放大前填写的草稿');
  await selectChoice(page, '检查结果1', '需整改');
  await dialog.getByLabel('检查备注1', { exact: true }).fill('');
  await dialog.getByRole('button', { name: '保存页面检查', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('问题描述');
  await dialog.getByLabel('检查备注1', { exact: true }).fill('放大后记录的整改问题');
  await dialog.getByRole('button', { name: '保存页面检查', exact: true }).click();
  await expect(dialog.locator('article').first()).toContainText('已保存');
  await dialog.getByLabel('检查备注2', { exact: true }).fill('尚未保存的第二项草稿');
  await page.screenshot({ path: '.local/qa/testing-preview-expanded.png' });
  await page.getByRole('button', { name: '关闭放大预览', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.getByLabel('检查备注2', { exact: true })).toHaveValue('尚未保存的第二项草稿');
  await expect(page.getByRole('combobox', { name: '预览视口宽度', exact: true })).toHaveText('430 px');
  await expect(page.getByRole('combobox', { name: '预览内容密度', exact: true })).toHaveText('更多内容 · 70%');
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-preview-state', 'retained');
  expect(requests).toBe(count);
  await noOverflow(page);
});

test('未打开预览时也可放大，支持焦点循环、Escape 和灰色背景关闭', async ({ page }) => {
  await receive(page); await nav(page, 'UI测试');
  const expand = page.getByRole('button', { name: '放大项目预览', exact: true });
  await expand.click();
  const dialog = page.getByRole('dialog', { name: '放大项目预览', exact: true });
  const close = dialog.getByRole('button', { name: '关闭放大预览', exact: true });
  const first = dialog.getByRole('button', { name: '手机', exact: true });
  await first.focus(); await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '保存页面检查', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(first).toBeFocused();
  await selectChoice(page, '预览内容密度', '原始 · 100%');
  await page.getByRole('combobox', { name: '预览视口宽度', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible(); // Escape first dismisses the open select menu.
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await expand.click();
  await page.locator('.preview-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(dialog).toHaveCount(0);
  await expand.click();
  await dialog.getByRole('button', { name: '打开项目预览', exact: true }).click();
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '知行校园项目', exact: true })).toBeVisible();
  await close.click();
});

test('关闭为文字按钮，刷新为图文按钮且只重新加载预览、不丢失检查草稿', async ({ page }) => {
  await receive(page); await nav(page, 'UI测试');
  await page.getByRole('button', { name: '放大项目预览', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '放大项目预览', exact: true });
  const close = dialog.getByRole('button', { name: '关闭放大预览', exact: true });
  const refresh = dialog.getByRole('button', { name: '重新加载项目预览', exact: true });
  await expect(close).toHaveText('关闭');
  await expect(close.locator('svg')).toHaveCount(0);
  await expect(refresh).toHaveText('刷新');
  await expect(refresh.locator('svg')).toHaveCount(1);
  await expect(refresh).toBeDisabled();
  await dialog.getByRole('button', { name: '打开项目预览', exact: true }).click();
  const body = page.frameLocator('iframe').locator('body');
  await expect(body).toContainText('知行校园项目');
  await body.evaluate(el => el.setAttribute('data-refresh-marker', 'before'));
  await dialog.getByLabel('检查备注1', { exact: true }).fill('刷新时保留这条草稿');
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(body).not.toHaveAttribute('data-refresh-marker', 'before');
  await expect(body).toContainText('知行校园项目');
  await expect(dialog.getByLabel('检查备注1', { exact: true })).toHaveValue('刷新时保留这条草稿');
  await page.screenshot({ path: '.local/qa/testing-preview-action-buttons.png' });
  await close.click();
  await expect(dialog).toHaveCount(0);
});

test('放大模式完成最后一页后报告浮在上层，关闭报告仍保留放大模式', async ({ page }) => {
  await receive(page); await nav(page, 'UI测试');
  for (const [index, entry] of campusProject.pages.entries()) {
    await page.locator('.page-catalog').getByRole('button', { name: new RegExp(entry.name) }).click();
    for (let i = 0; i < entry.checks.length; i++) await selectChoice(page, `检查结果${i + 1}`, '通过');
    if (index === campusProject.pages.length - 1) await page.getByRole('button', { name: '放大项目预览', exact: true }).click();
    await page.getByRole('button', { name: '保存页面检查', exact: true }).click();
  }
  const report = page.getByRole('dialog', { name: 'UI测试报告', exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText('17 项通过');
  await report.getByRole('button', { name: '关闭UI测试报告', exact: true }).click();
  await expect(report).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '放大项目预览', exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

for (const [width, height] of [[1920, 960], [1280, 720], [900, 720], [390, 844]]) {
  test(`放大预览适应 ${width}x${height}，清单和保存按钮可操作`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await receive(page); await nav(page, 'UI测试');
    await page.getByRole('button', { name: '放大项目预览', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '放大项目预览', exact: true });
    await dialog.getByRole('button', { name: '打开项目预览', exact: true }).click();
    await expect(page.frameLocator('iframe').getByRole('heading', { name: '知行校园项目', exact: true })).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await expect(dialog.getByRole('combobox', { name: '预览内容密度', exact: true })).toHaveText('原始 · 100%');
    await expect(dialog.locator('.browser-address')).toBeHidden();
    await expect(dialog.locator('.preview-status')).toBeHidden();
    await expect.poll(async () => (await dialog.locator('.scaled-frame').boundingBox())!.height).toBeGreaterThan(height * .85);
    expect(await dialog.locator('iframe').evaluate(el => (el as HTMLIFrameElement).clientWidth)).toBe(390);
    await page.screenshot({ path: `.local/qa/testing-preview-portrait-fullheight-${width}.png` });
    if (width <= 700) {
      await expect(dialog.locator('.ui-checklist')).toBeHidden();
      await dialog.getByRole('button', { name: '切换测试清单', exact: true }).click();
    }
    const save = dialog.getByRole('button', { name: '保存页面检查', exact: true });
    await expect(save).toBeInViewport();
    await save.click();
    await expect(dialog.locator('article').first()).toContainText('已保存');
    if (width <= 700) await dialog.getByRole('button', { name: '切换测试清单', exact: true }).click();
    await dialog.getByRole('button', { name: '桌面', exact: true }).click();
    await selectChoice(page, '预览视口宽度', '1920 px');
    await expect.poll(async () => {
      const frame = await dialog.locator('.scaled-frame').boundingBox();
      const viewport = await dialog.locator('.project-viewport').boundingBox();
      return frame!.x + frame!.width <= viewport!.x + viewport!.width + 1;
    }).toBe(true);
    await noOverflow(page);
    await page.screenshot({ path: `.local/qa/testing-preview-expanded-${width}.png` });
    await dialog.getByRole('button', { name: '关闭放大预览', exact: true }).click();
    await noOverflow(page);
  });
}
