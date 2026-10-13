import {test,expect} from '@playwright/test';
test('frontline phone keeps native sizing and scroll interactions',async({page})=>{
  await page.goto('/#/tasks');await page.getByLabel('员工账号').fill('staff01');await page.getByLabel('密码',{exact:true}).fill('123456');await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'待办',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.dataset.desktopScale)).toBeUndefined();
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'记录',exact:true}).click();await expect(page.getByRole('heading',{name:'记录',exact:true})).toBeVisible();
  await page.screenshot({path:'.local/qa/display/gate-phone.png'});
});
