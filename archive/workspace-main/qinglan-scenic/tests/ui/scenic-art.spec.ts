import { test, expect } from '@playwright/test';

test('art gallery renders accessible, independent SVGs and supports downloads and cropping', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/scenic-art.html');
  await expect(page.getByRole('heading', { name: '青岚山境 · 山水图集' })).toBeVisible();
  await expect(page.locator('.grid article')).toHaveCount(9);
  await expect(page.locator('.scenic-illustration[role="img"]')).toHaveCount(10);
  const ids = await page.locator('svg [id]').evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(await page.locator('svg').evaluateAll(nodes => nodes.every(svg =>
    [...svg.querySelectorAll('[fill^="url(#"]')].every(el =>
      !!document.getElementById(el.getAttribute('fill')!.slice(5, -1)))))).toBe(true);
  await page.getByRole('checkbox').check();
  await expect(page.locator('.grid svg').first()).toHaveAttribute('preserveAspectRatio', 'xMidYMid slice');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 Logo ↗' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('qinglan-logo.svg');
  const cards = await page.locator('.grid article').evaluateAll(nodes => nodes.map(node => ({
    card: node.getBoundingClientRect().toJSON(), caption: node.querySelector('.caption')!.getBoundingClientRect().toJSON(),
  })));
  for (const { card, caption } of cards) expect(caption.bottom).toBeLessThanOrEqual(card.bottom + 1);
  await page.screenshot({ path: '.local/qa/scenic-art/gallery-wide.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: '.local/qa/scenic-art/gallery-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
