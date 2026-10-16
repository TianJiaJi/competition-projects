import { expect, test } from '@playwright/test';
import { fixtures, receive, generateApi, nav, noOverflow } from './helpers';

test('实时与报告曲线使用规整刻度和统一数字样式，窄屏不裁切标签', async ({ page }) => {
  await fixtures(page); await receive(page); await generateApi(page); await nav(page, '并发测试');
  await page.getByLabel('预期并发目标', { exact: true }).fill('5');
  await page.getByLabel('安全加压上限', { exact: true }).fill('1000');
  await page.getByLabel('持续时长', { exact: true }).fill('10');
  const live = page.getByRole('img', { name: '本轮负载与吞吐趋势', exact: true });
  await expect(live.locator('.axis-left .axis-tick')).toHaveText(['0', '200', '400', '600', '800', '1,000']);
  await expect(live.locator('.axis-time')).toHaveText(['0 s', '2 s', '4 s', '6 s', '8 s', '10 s']);
  await page.getByRole('button', { name: '开始并发测试', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看并发测试报告', exact: true })).toBeVisible({ timeout: 25000 });
  await page.getByRole('button', { name: '查看并发测试报告', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '并发测试报告', exact: true });
  const load = dialog.getByRole('img', { name: '报告负载与吞吐趋势', exact: true });
  const latency = dialog.getByRole('img', { name: '报告响应延迟趋势', exact: true });
  await expect(load.locator('.axis-left .axis-tick')).toHaveText(['0', '200', '400', '600', '800', '1,000']);
  await expect(load.locator('.axis-time')).toHaveText(['0 s', '2 s', '4 s', '6 s', '8 s', '10 s']);
  for (const axis of [load.locator('.axis-right .axis-tick'), latency.locator('.axis-left .axis-tick')]) {
    const values = (await axis.allTextContents()).map(value => Number(value.replaceAll(',', '').trim()));
    expect(values.length).toBeGreaterThan(2);
    expect(new Set(values).size).toBe(values.length);
    for (let i = 2; i < values.length; i++) expect(values[i] - values[i - 1]).toBeCloseTo(values[1] - values[0]);
    await expect(axis.first()).toHaveCSS('font-size', '11px');
  }
  await expect(load.locator('.axis-left .axis-tick').first()).toHaveCSS('fill', 'rgb(113, 133, 104)');
  await expect(load.locator('.axis-right .axis-tick').first()).toHaveCSS('fill', 'rgb(162, 124, 62)');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await dialog.locator('.report-chart-grid').scrollIntoViewIfNeeded();
    await expect.poll(() => dialog.locator('.trend-chart svg').evaluateAll(charts => charts.every(chart => {
      const bounds = chart.getBoundingClientRect();
      return [...chart.querySelectorAll('text')].every(text => {
        const label = text.getBoundingClientRect();
        return label.left >= bounds.left - 1 && label.right <= bounds.right + 1;
      });
    }))).toBe(true);
    await noOverflow(page);
    await dialog.locator('.report-chart-grid').screenshot({ path: `.local/qa/testing-chart-axis-${width}.png` });
  }
});
