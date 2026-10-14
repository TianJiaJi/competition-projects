import { expect, test } from '@playwright/test';
import { scenario } from '../../scenario/config';

const mobileUrl = `http://localhost:${process.env.E2E_MOBILE_PORT || scenario.ports.mobile}`;
test('从首页进入预约使用实时源码，不引用长期缓存的工作区包', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // A stale package URL must never be requested, even when entering lazily.
  await page.route('**/node_modules/@scene/bookings/**', route => route.abort());
  await page.goto(`${mobileUrl}/#/pages/home/index`);
  await page.getByRole('button', { name: '预约', exact: true }).click();
  await expect(page.locator('.venue-option')).toHaveCount(6);
  await expect(page.locator('.uni-async-error')).toHaveCount(0);
  const sourceUrl = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => entry.name).find(name => name.includes('/packages/bookings/src/index.ts')));
  expect(sourceUrl).toBeTruthy();
  const response = await page.request.get(sourceUrl!);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).not.toContain('immutable');
  expect(errors).toEqual([]);
});
