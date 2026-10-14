import {expect,test} from '@playwright/test';
import {fixtures,receive,generateApi} from './helpers';
test('110用例执行时当前行固定在表头下方，只有列表滚动',async({page})=>{
 await fixtures(page);await receive(page);await generateApi(page);
 await expect(page.locator('.api-table tbody tr')).toHaveCount(110);
 const scrollY=await page.evaluate(()=>window.scrollY);
 await page.getByRole('button',{name:'运行全部API',exact:true}).click();
 await expect(page.locator('.api-workbench-heading').getByRole('button',{name:'停止API测试',exact:true})).toBeVisible();
 await expect(page.locator('.api-workbench .run-progress')).toBeVisible();
 const progress=await page.locator('.run-progress').boundingBox(),directory=await page.locator('.api-case-directory').boundingBox();
 expect(progress!.y+progress!.height).toBeLessThanOrEqual(directory!.y+1);
 await expect(page.locator('.api-table tr.running')).toBeVisible();
 await expect.poll(()=>page.locator('.api-table-wrap').evaluate(el=>el.scrollTop)).toBeGreaterThan(300);
 const alignment=()=>page.evaluate(()=>{
  const row=document.querySelector('.api-table tr.running')!,header=document.querySelector('.api-table thead th')!;
  return Math.abs(row.getBoundingClientRect().top-header.getBoundingClientRect().bottom);
 });
 await expect.poll(alignment).toBeLessThan(3);
 await expect.poll(()=>page.locator('.api-table-wrap').evaluate(el=>el.scrollTop)).toBeGreaterThan(700);
 await expect.poll(alignment).toBeLessThan(3);
 expect(await page.evaluate(()=>window.scrollY)).toBe(scrollY);
 await expect(page.getByLabel('搜索API用例')).toBeDisabled();
 await page.screenshot({path:'.local/qa/testing-api-fixed-highlight.png'});
 await page.getByRole('button',{name:'停止API测试',exact:true}).click();await expect(page.getByRole('status')).toContainText('已停止');
});
