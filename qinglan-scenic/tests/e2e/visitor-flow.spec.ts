import {test, expect} from '@playwright/test';
import {sampleSnapshot} from '../../packages/client/testing/snapshot';
import {createFormulaFlow, recordAdmission, visitorDistribution} from '../../apps/server/src/platform/visitor-flow';

for (const [label, minute] of [['empty', 479], ['morning', 482], ['noon', 720], ['closing', 1125]] as const) {
  test(`formula visitor flow renders ${label} on the scenic map`, async ({page}) => {
    const day = Date.parse('2026-09-14T00:00:00+08:00'), time = day + minute * 60000;
    const flow = createFormulaFlow(day);
    for (let u = 480; u <= Math.min(minute, 1019); u++) recordAdmission(flow, day + u * 60000, 10);
    const distribution = visitorDistribution(flow, time, 0, {trajectory: true});
    const snapshot = sampleSnapshot(new Date(time));
    snapshot.updatedAt = new Date(time).toISOString();
    snapshot.visitors = distribution.visitors;
    snapshot.visitorFlow = distribution.markers;
    snapshot.visitorFlowClock = {speed: 1, paused: true};
    distribution.counts.forEach((count, i) => {
      snapshot.regions[`Z${i}`] = {availability: 'open', count, load: count < 250 ? 'quiet' : count < 500 ? 'moderate' : 'busy'};
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.routeWebSocket('**/ws?*', () => {});
    await page.route('**/api/v1/public/state', route => route.fulfill({json: {data: {run: {id: 'formula-flow-qa'}, public: snapshot}}}));
    await page.goto('/?scenicDiagnostics=1');
    await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state', 'ready', {timeout: 25000});
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('visitors')).not.toHaveText('—');
    await page.getByRole('button', {name: '人流', exact: true}).click();
    await expect(page.locator('.heat-legend')).toBeVisible();
    await expect(page.locator('.scene-canvas')).toHaveAttribute('data-heat-revision', /[1-9]/);
    await page.screenshot({path: `.local/qa/formula-flow-${label}.png`});
    if (label === 'noon') {
      const canvas = page.locator('.scene-canvas');
      const pausedRevision = await canvas.getAttribute('data-heat-revision');
      await page.waitForTimeout(350);
      expect(await canvas.getAttribute('data-heat-revision')).toBe(pausedRevision);
      snapshot.visitorFlowClock = {speed: 1, paused: false};
      await page.reload();
      await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state', 'ready');
      await page.getByRole('button', {name: '人流', exact: true}).click();
      await expect(canvas).toHaveAttribute('data-heat-revision', /[1-9]/);
      const playingRevision = Number(await canvas.getAttribute('data-heat-revision'));
      await expect.poll(async () => Number(await canvas.getAttribute('data-heat-revision'))).toBeGreaterThan(playingRevision);
      await page.screenshot({path: '.local/qa/formula-flow-playing.png'});
    }
    expect(errors).toEqual([]);
  });
}
