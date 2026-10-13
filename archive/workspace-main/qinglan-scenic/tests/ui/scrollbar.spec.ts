import { test, expect, type Page } from '@playwright/test';
const table = (page: Page) => page.getByRole('region', { name: '景区数据表', exact: true });
const bar = (page: Page, direction = '纵向') => page.getByRole('scrollbar', { name: `景区数据表（${direction}）`, exact: true });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/scrollbar.html');
});

test('native scrolling, sticky header, dynamic content and empty axes', async ({ page }) => {
  const host = table(page);
  await host.hover(); await expect(bar(page)).toHaveCSS('opacity', '1');
  const headerY = (await host.locator('th').first().boundingBox())!.y;
  await host.evaluate(el => { el.scrollTop = 260; });
  await expect.poll(() => bar(page).getAttribute('aria-valuenow')).toBe('260');
  expect(Math.abs((await host.locator('th').first().boundingBox())!.y - headerY)).toBeLessThan(2);
  const max = Number(await bar(page).getAttribute('aria-valuemax'));
  await page.getByRole('button', { name: '添加内容' }).click();
  await expect.poll(async () => Number(await bar(page).getAttribute('aria-valuemax'))).toBeGreaterThan(max);
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(bar(page)).toBeHidden();
});

test('track pages, thumb drags, wheel over track and keyboard reaches boundaries', async ({ page, isMobile, browserName }) => {
  const host = table(page); await host.hover();
  const track = bar(page), bounds = (await track.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * .8);
  await expect.poll(() => host.evaluate(el => el.scrollTop)).toBeGreaterThan(200);
  const before = await host.evaluate(el => el.scrollTop);
  await expect.poll(() => track.getAttribute('aria-valuenow')).toBe(String(Math.round(before)));
  const thumb = (await track.locator('.sg-scroll-thumb').boundingBox())!;
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down(); await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2 + 40, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => host.evaluate(el => el.scrollTop)).toBeGreaterThan(before);
  await track.focus(); await page.keyboard.press('Home'); await expect.poll(() => host.evaluate(el => el.scrollTop)).toBe(0);
  if (!(isMobile && browserName === 'webkit')) {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 25); await page.mouse.wheel(0, 120);
    await expect.poll(() => host.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  }
  await track.focus(); await page.keyboard.press('End');
  await expect.poll(() => host.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
});

test('horizontal axes, theme, focus visibility and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('select').first().selectOption('dark');
  const horizontal = bar(page, '横向'); await horizontal.focus();
  await page.keyboard.press('End');
  await expect.poll(() => table(page).evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(horizontal.locator('..')).toHaveAttribute('data-theme', 'dark');
  await expect(horizontal).toHaveCSS('transition-duration', '0s');
  await expect(horizontal).toHaveCSS('opacity', '1');
  await page.getByRole('heading', { name: '液态玻璃滚动条', exact: true }).click();
  await expect(horizontal).toHaveCSS('opacity', '0');
});

test('native input remains native and multiple mounts clean up overlays', async ({ page }) => {
  const textarea = page.getByRole('textbox', { name: '游览笔记' });
  await expect(textarea).not.toHaveClass(/sg-scroll-host/);
  await textarea.fill('可以选择和编辑的文字'); await textarea.press('ControlOrMeta+A');
  expect(await textarea.evaluate(el => (el as HTMLTextAreaElement).selectionEnd)).toBe('可以选择和编辑的文字'.length);
  const count = await page.locator('.sg-scroll-overlay').count();
  await page.getByRole('button', { name: '挂载 / 卸载' }).click();
  await expect(page.locator('.sg-scroll-overlay')).toHaveCount(count - 1);
  await page.getByRole('button', { name: '挂载 / 卸载' }).click();
  await expect(page.locator('.sg-scroll-overlay')).toHaveCount(count);
});

test('new overflow containers and native dialogs attach, resize and detach', async ({ page }) => {
  await page.evaluate(() => {
    const dialog = document.createElement('dialog'); dialog.id = 'dynamic-dialog';
    dialog.style.cssText = 'width:300px;height:200px;overflow:auto;padding:28px';
    dialog.setAttribute('aria-label', '动态对话框'); dialog.innerHTML = '<div style="height:1000px">内容</div>';
    document.body.append(dialog); dialog.showModal();
  });
  const dialog = page.locator('#dynamic-dialog');
  await expect(dialog).toHaveClass(/sg-scroll-host/);
  await dialog.hover();
  const track = page.getByRole('scrollbar', { name: '动态对话框（纵向）' });
  await expect(track).toBeVisible();
  expect(await track.evaluate(el => el.closest('dialog')?.id)).toBe('dynamic-dialog');
  await dialog.evaluate(el => { el.style.height = '300px'; });
  await expect.poll(async () => Number(await track.getAttribute('aria-valuemax'))).toBeLessThan(800);
  await dialog.evaluate(el => el.remove());
  await expect(track).toHaveCount(0);
});

test('touch pointer can drag the visible thumb without scrolling a different host', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Real touch injection uses Chromium CDP; physical WebKit touch remains device acceptance.');
  await table(page).scrollIntoViewIfNeeded();
  await table(page).evaluate(el => { el.scrollTop = 100; });
  const track = bar(page), thumb = track.locator('.sg-scroll-thumb');
  await expect(track).toHaveCSS('opacity', '1');
  const bounds = (await thumb.boundingBox())!;
  const trackBounds = (await track.boundingBox())!;
  const x = trackBounds.x + 2, y = bounds.y + bounds.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 40 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => table(page).evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await session.detach();
});

test('visual overview', async ({ page }, info) => {
  await page.locator('select').nth(1).selectOption('always');
  await expect(bar(page)).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('scrollbar.png'), fullPage: true });
  await page.locator('select').first().selectOption('dark');
  await expect(bar(page)).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('scrollbar-dark.png'), fullPage: true });
});
