import {test, expect} from '@playwright/test';
import {buildSnapshot} from '../fixtures/ops';
import {createFormulaFlow, recordAdmission, visitorDistribution} from '../../apps/server/src/platform/visitor-flow';

test('运营沙盘使用人群坐标绘制连续热力场', async ({page}) => {
  const snapshot = buildSnapshot('normal');
  const day = Date.parse('2026-09-14T00:00:00+08:00'), time = day + 720 * 60000;
  const flow = createFormulaFlow(day);
  for (let minute = 480; minute <= 720; minute++) recordAdmission(flow, day + minute * 60000, 10);
  const distribution = visitorDistribution(flow, time, 0, {trajectory: true});
  snapshot.public.visitors = distribution.visitors;
  snapshot.public.visitorFlow = distribution.markers;
  snapshot.public.visitorFlowClock = {speed: 1, paused: true};
  snapshot.public.updatedAt = new Date(time).toISOString();
  snapshot.businessTime = snapshot.public.updatedAt;
  distribution.counts.forEach((count, i) => { snapshot.public.regions[`Z${i}`] = {availability: 'open', count, load: 'moderate'}; });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.routeWebSocket('**/ws?*', () => {});
  await page.route('**/api/v1/**', route => {
    const run = {id: 'heat-ops', businessTime: snapshot.businessTime, mode: 'replay', paused: true, speed: 1};
    const data = route.request().url().endsWith('/runtime') ? {run} : {...snapshot, run, exitedToday: snapshot.checkedInToday - snapshot.public.visitors!};
    return route.fulfill({json: {data}});
  });
  await page.goto('/');
  await expect(page.locator('.ops-screen')).toHaveAttribute('data-entry-state', 'ready', {timeout: 60000});
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-heat-revision', /[1-9]/);
  await page.screenshot({path: '.local/qa/heat-ops-noon.png'});
  expect(errors).toEqual([]);
});

test.beforeEach(async({page})=>{await page.addInitScript(()=>{const url=new URL(location.href);url.searchParams.set('scenicDiagnostics','1');history.replaceState(null,'',url);});});
