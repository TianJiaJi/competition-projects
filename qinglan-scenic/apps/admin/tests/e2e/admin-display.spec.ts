import {test,expect} from '@playwright/test';
import {gotoPage} from './helpers';
async function login(page:import('@playwright/test').Page){
  await page.goto('/#/login');await page.locator('#username').fill('admin01');await page.locator('#password').fill('123456');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'工作台'})).toBeVisible();
}
for(const dpr of [1,1.25,1.5,1.75,2])test.describe(`admin display ${dpr}`,()=>{
  test.use({deviceScaleFactor:dpr,viewport:{width:Math.round(1920/dpr),height:Math.round(1080/dpr)}});
  test('table, filters and scrolling retain desktop layout',async({page})=>{
    await login(page);await gotoPage(page,'/orders','订单管理');
    const filter=page.getByRole('button',{name:/^筛选/});await filter.click();
    const popup=page.getByRole('dialog',{name:'筛选条件'});await expect(popup).toBeVisible();
    const rect=await popup.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
    await popup.getByLabel('关键词',{exact:true}).fill('缩放测试');await popup.press('Escape');
    await expect(filter).toBeFocused();
    const table=page.locator('.table-scroll').first();await expect(table).toBeVisible();
    await table.hover();await page.mouse.wheel(0,1800);
    expect(await page.evaluate(()=>scrollY)).toBe(0);
    const pager=await page.locator('.pager').first().boundingBox();expect(pager!.y+pager!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
    await page.screenshot({path:`.local/qa/display/admin-${dpr}.png`});
  });
});
