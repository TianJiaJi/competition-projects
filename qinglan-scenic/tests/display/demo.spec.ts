import {test,expect} from '@playwright/test';
for(const dpr of [1,1.25,1.5,1.75,2])test.describe(`demo display ${dpr}`,()=>{
  test.use({deviceScaleFactor:dpr,viewport:{width:Math.round(1920/dpr),height:Math.round(1080/dpr)}});
  test('login and control layout keep composition proportions',async({page})=>{
    await page.goto('/');const form=page.locator('.login');await expect(form).toBeVisible();
    expect((await form.boundingBox())!.width*dpr).toBeCloseTo(420,0);
    await page.getByLabel('密码').fill('123456');await page.getByRole('button',{name:'登录',exact:true}).click();
    await expect(page.locator('.stats article')).toHaveCount(3);
    expect(await page.locator('.grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
    await page.screenshot({path:`.local/qa/display/demo-${dpr}.png`});
    await page.setViewportSize({width:Math.round(650/dpr),height:Math.round(768/dpr)});
    await expect.poll(()=>page.locator('.grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  });
});
