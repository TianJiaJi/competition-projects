import {test,expect} from '@playwright/test';
test('visitor phone does not install desktop scaling',async({page})=>{
  await page.goto('/#/pages/login/index');await expect(page.locator('input').nth(0)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.dataset.desktopScale)).toBeUndefined();
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.locator('input').nth(0).fill('visitor01');await page.locator('input').nth(1).fill('123456');await page.getByText('登录',{exact:true}).click();
  await expect(page).toHaveURL(/pages\/me\/index/);await page.screenshot({path:'.local/qa/display/visitor-phone.png'});
});
