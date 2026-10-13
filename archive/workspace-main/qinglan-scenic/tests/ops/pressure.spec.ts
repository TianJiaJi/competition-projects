import {test,expect} from '@playwright/test';
import {pressureScenarios,pressureSnapshot} from '../fixtures/pressure';
import {buildSnapshot} from '../fixtures/ops';
for(const scenario of pressureScenarios) test(`运营游线承载压力 ${scenario}`,async({page})=>{
  const snapshot=buildSnapshot('normal');snapshot.public=pressureSnapshot(scenario);snapshot.businessTime=snapshot.public.updatedAt;
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.routeWebSocket('**/ws?*',()=>{});
  await page.route('**/api/v1/**',route=>{
    const run={id:'pressure-qa',businessTime:snapshot.businessTime,mode:'replay',paused:true,speed:1};
    return route.fulfill({json:{data:route.request().url().endsWith('/runtime')?{run}:{...snapshot,run,exitedToday:0}}});
  });
  await page.goto('/?scenicDiagnostics=1');
  await expect(page.locator('.ops-screen')).toHaveAttribute('data-entry-state','ready',{timeout:60000});
  await expect(page.locator('.heat-gradient')).toBeVisible();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-context-muted','true');
  await expect(page.locator('.map-legends')).toContainText('参考承载压力');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-heat-revision',/[1-9]/);
  for(const label of await page.locator('.ops-region-label > span').allTextContents()) expect(label).toMatch(/^约 [\d,]+ 人$/);
  await page.screenshot({path:`.local/qa/pressure-ops-${scenario}.png`});
  await page.locator('.region-values button').first().click();
  await expect(page.locator('.region-focus-note')).toContainText('参考容量');
  await expect(page.locator('.region-focus-note')).toContainText('按区域参考容量估算');
  expect(errors).toEqual([]);
});
