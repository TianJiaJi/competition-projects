import { expect, test, type Page } from '@playwright/test';
import { gotoPage, login } from './helpers';

async function ready(page: Page) {
  await expect(page.locator('.flow-page .spinner, .flow-page [aria-busy="true"]')).toHaveCount(0);
}

test('游客和员工有独立入口及固定身份，旧链接不再展示混合列表', async ({page}) => {
  await login(page);
  await gotoPage(page,'/users','游客管理'); await ready(page);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('tbody')).not.toContainText('staff-');
  await expect(page.locator('#user-identity')).toHaveCount(0);
  await page.locator('#user-keyword').fill('staff');
  await page.getByRole('button',{name:'查询',exact:true}).click(); await ready(page);
  await expect(page.locator('.flow-panel')).toContainText('没有符合条件的游客账号');
  await page.getByRole('button',{name:'重置',exact:true}).click(); await ready(page);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await gotoPage(page,'/users/staff?identity=visitor','员工管理'); await ready(page);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody')).not.toContainText('visitor-');
  await expect(page.locator('tbody').getByRole('button',{name:/禁用|恢复/})).toHaveCount(0);
  await expect(page.locator('.admin-record-rack .rr-track').filter({hasText:'员工管理'})).toHaveAttribute('aria-current','page');
  await page.locator('tbody').getByRole('button',{name:'详情',exact:true}).first().click();
  await expect(page.getByRole('dialog')).toContainText('员工账号仅支持查看');
  await expect(page.getByRole('dialog')).not.toContainText('禁言');
  await expect(page.getByRole('dialog')).not.toContainText('关联现场订单');
});

test('两类账号分别保留筛选、分页和滚动位置', async ({page}) => {
  await login(page);
  await page.evaluate(() => {
    const key='qinglan.admin.mock.v1'; const data=JSON.parse(localStorage.getItem(key)!);
    data.global.users.push(...Array.from({length:44},(_,i)=>({id:`visitor-test-${i}`,nickname:`测试游客 ${i}`,identity:'visitor',createdAt:'2026-09-11 10:00',disabled:false})));
    localStorage.setItem(key,JSON.stringify(data));
  });
  await page.reload(); await gotoPage(page,'/users/visitors','游客管理'); await ready(page);
  await page.locator('#user-keyword').fill('测试游客');
  await page.getByRole('button',{name:'查询',exact:true}).click(); await ready(page);
  await page.getByRole('button',{name:'下一页',exact:true}).click(); await ready(page);
  await page.locator('.table-scroll').evaluate(el=>{el.scrollTop=220;});
  const top=await page.locator('.table-scroll').evaluate(el=>el.scrollTop);
  await gotoPage(page,'/users/staff','员工管理'); await ready(page);
  await expect(page.locator('#user-keyword')).toHaveValue('');
  await expect(page.locator('.pager__info')).toContainText('共 2 条，第 1 / 1 页');
  await page.locator('#user-keyword').fill('主管');
  await page.getByRole('button',{name:'查询',exact:true}).click(); await ready(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await gotoPage(page,'/users/visitors','游客管理'); await ready(page);
  await expect(page.locator('#user-keyword')).toHaveValue('测试游客');
  await expect(page.locator('.pager__info')).toContainText('第 2 / 3 页');
  await expect.poll(()=>page.locator('.table-scroll').evaluate(el=>el.scrollTop)).toBe(top);
  await gotoPage(page,'/users/staff','员工管理'); await ready(page);
  await expect(page.locator('#user-keyword')).toHaveValue('主管');
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('游客详情仍能禁用与恢复，深浅主题下两类信息流保持容器滚动', async ({page}) => {
  await login(page); await gotoPage(page,'/users/visitors','游客管理'); await ready(page);
  const visitor=page.locator('tbody tr',{hasText:'visitor-1001'});
  await visitor.getByRole('button',{name:'详情',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('关联现场订单');
  await page.getByRole('dialog').getByRole('button',{name:'禁用账号',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'禁用账号',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'恢复账号',exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'恢复账号',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'恢复账号',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'禁用账号',exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click();
  for(const theme of ['dark','light'] as const){
    await page.emulateMedia({colorScheme:theme});
    for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[1200,768]]){
      await page.setViewportSize({width,height});
      for(const [path,title] of [['/users/visitors','游客管理'],['/users/staff','员工管理']]){
        await gotoPage(page,path,title);await ready(page);
        await expect(page.locator('.pager')).toBeInViewport();
        expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth)).toBe(false);
      }
    }
  }
});
