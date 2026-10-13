import {test, expect} from '@playwright/test';
import {sampleSnapshot} from '../../packages/client/testing/snapshot';
import {createFormulaFlow, recordAdmission, visitorDistribution} from '../../apps/server/src/platform/visitor-flow';

for (const [label, minute] of [['morning', 482], ['noon', 720], ['closing', 1125]] as const) {
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
    await page.goto('/');
    await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state', 'ready', {timeout: 25000});
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('visitors')).not.toHaveText('—');
    await page.getByRole('button', {name: '人流', exact: true}).click();
    await expect(page.locator('.heat-legend')).toBeVisible();
    await page.screenshot({path: `.local/qa/formula-flow-${label}.png`});
    expect(errors).toEqual([]);
  });
}
