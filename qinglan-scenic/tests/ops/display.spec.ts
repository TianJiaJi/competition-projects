import {test,expect} from '@playwright/test';
import {buildSnapshot} from '../fixtures/ops';
for(const dpr of [1,1.25,1.5,1.75,2])test.describe(`ops display ${dpr}`,()=>{
  test.use({deviceScaleFactor:dpr,viewport:{width:Math.round(1920/dpr),height:Math.round(1080/dpr)},reducedMotion:'reduce'});
  test('charts, alert selection and portal use the same display coordinates',async({page})=>{
    await page.routeWebSocket('**/ws?*',()=>{});await page.route('**/api/v1/**',route=>{
      const snapshot=buildSnapshot('alerts'),run={id:'ops-display',businessTime:snapshot.businessTime,mode:'replay',paused:true,speed:1};
      return route.fulfill({json:{data:route.request().url().endsWith('/runtime')?{run}:{...snapshot,run,exitedToday:snapshot.checkedInToday-snapshot.public.visitors!}}});
    });
    await page.goto('/?scenicDiagnostics=1');await expect(page.locator('.ops-screen')).toHaveAttribute('data-entry-state','ready',{timeout:60000});
    await expect(page.locator('.scenic-chart svg')).toHaveCount(4);
    const heading=await page.locator('.brand h1').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));expect(heading).toBe(27);
    await page.locator('[data-alert-id="A-231"]').click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('游客身体不适');
    await expect.poll(async()=>{const box=await dialog.boundingBox();return Math.abs((page.viewportSize()!.width-box!.x-box!.width)*dpr-32);}).toBeLessThan(2);
    await expect.poll(async()=>{const box=await page.locator('.alert-marker:visible').boundingBox();return Math.hypot(box!.x+box!.width/2-page.viewportSize()!.width/2,box!.y+box!.height/2-page.viewportSize()!.height/2)*dpr;}).toBeLessThan(4);
    await page.screenshot({path:`.local/qa/display/ops-${dpr}.png`});
  });
});
