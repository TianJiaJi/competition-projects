import {expect,test} from '@playwright/test';
import {fixtures,receive,nav,noOverflow} from './helpers';
for(const [width,height] of [[1920,960],[1440,900],[1280,720]])test(`UI测试首屏操作 ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await fixtures(page);await receive(page);await nav(page,'UI测试');
 await expect(page.locator('.project-task-header')).toHaveCount(0);
 await expect(page.getByText('智慧校园项目验收',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'打开项目预览',exact:true}).click();
 await expect(page.frameLocator('iframe').getByRole('heading',{name:'知行校园项目',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 const preview=await page.locator('.preview-panel').boundingBox();expect(preview!.y).toBeLessThan(230);
 const frame=await page.locator('.scaled-frame').boundingBox();expect(frame!.y+frame!.height).toBeLessThan(height);
 const save=await page.getByRole('button',{name:'保存页面检查',exact:true}).boundingBox();expect(save!.y+save!.height).toBeLessThanOrEqual(height);
 await noOverflow(page);
 await page.screenshot({path:`.local/qa/testing-ui-compact-${width}.png`});
 await page.getByRole('button',{name:'桌面',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 await page.getByRole('button',{name:'保存页面检查',exact:true}).click();await expect(page.getByRole('status')).toContainText('页面检查已保存');
});
