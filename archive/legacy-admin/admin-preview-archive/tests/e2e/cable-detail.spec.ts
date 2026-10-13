import {test,expect} from '@playwright/test';
test('shows directional cable queues, capacity and supported station models',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1366,height:768});
  await page.goto('/?alwaysOpen=1');await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  for(const id of ['upper','lower']){
    await page.getByRole('button',{name:'设施',exact:true}).click();await page.locator(`[data-point-choice="${id}"]`).click();
    await expect(page.getByTestId('cable-capacity')).toHaveText('320人');
    await expect(page.getByTestId('cable-queue')).not.toContainText('暂无数据');
    await expect(page.getByTestId('cable-wait')).not.toContainText('暂无数据');
    await expect(page.locator('.cable-direction')).toHaveText(id==='upper'?'下行至山脚':'上行至山顶');
    await expect(page.locator('.cable-detail')).toContainText('全线 40 厢，每厢 8 人');
    const header=await page.locator('.top-information').boundingBox(),card=await page.locator('.detail-panel').boundingBox();expect(card!.y-header!.y-header!.height).toBeGreaterThanOrEqual(15.5);
    await page.screenshot({path:`.local/qa/cable-station-${id}.png`});
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
  }
});
