import {test,expect} from '@playwright/test';
import {scenario} from '../../scenario/config';
test('进度笔触和滚动条继承子项目配色并跟随深浅色切换',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(`http://localhost:${scenario.ports.preview}`);
 await expect(page.locator('.scene-shell')).toHaveAttribute('data-intro-state','ready',{timeout:45000});
 await expect(page.locator('.global-loading')).toHaveCount(0);
 const flow=page.locator('.ink-flow').first(),area=page.getByRole('region',{name:'可滚动内容'}).first();
 const colors=()=>page.evaluate(()=>{const flow=document.querySelector('.ink-flow')!;return{brand:getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),ink:getComputedStyle(flow).backgroundImage,tip:getComputedStyle(flow,'::after').backgroundColor};});
 const light=await colors();expect(light.brand.toLowerCase()).toBe(scenario.theme.brand.toLowerCase());
 await area.hover();await expect.poll(()=>page.locator('.sg-scroll-overlay').evaluateAll(els=>els.some(el=>getComputedStyle(el).getPropertyValue('--brand').trim()===getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()))).toBe(true);
 await page.getByRole('button',{name:'切换深色'}).click();const dark=await colors();expect(dark.brand).not.toBe(light.brand);expect(dark.ink).not.toBe(light.ink);expect(dark.tip).not.toBe(light.tip);
 await area.hover();await expect.poll(()=>page.locator('.sg-scroll-overlay').evaluateAll(els=>els.filter(el=>el.getAttribute('data-visible')==='true').some(el=>getComputedStyle(el).getPropertyValue('--brand').trim()===getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()))).toBe(true);
 await page.getByRole('button',{name:'切换浅色'}).click();expect((await colors()).ink).toBe(light.ink);await expect(flow).toBeVisible();
});
