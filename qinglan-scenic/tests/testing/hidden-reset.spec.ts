import { expect, test } from '@playwright/test';
import { fixtures, receive, generateApi, nav } from './helpers';
test.beforeEach(async({page})=>fixtures(page));
test('左下角测头像保留外观，点击直接清空且不弹确认',async({page})=>{
  await receive(page);await generateApi(page);
  const reset=page.locator('.sidebar-footer').getByRole('button',{name:'立即重置工作台',exact:true});
  await expect(reset).toHaveText('测');await expect(reset).toHaveClass('avatar');
  await reset.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.delivery-task-card,.api-table,.acceptance-cover')).toHaveCount(0);
  await expect(page.locator('.task-metrics')).toContainText('等待接收');
  await expect(page.locator('.task-timeline li')).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('button',{name:/^API测试/})).toBeDisabled();
  await page.getByRole('button',{name:'接收上游交付',exact:true}).first().click();
  await expect(page.locator('.delivery-task-card')).toHaveCount(1);
  await nav(page,'API测试');
  await expect(page.getByRole('button',{name:'解析API材料',exact:true})).toBeEnabled();
});
test('运行操作时头像重置入口禁用，取消后可通过键盘直接重置',async({page})=>{
  await receive(page);await nav(page,'API测试');
  const reset=page.locator('.sidebar-footer').getByRole('button',{name:'立即重置工作台',exact:true});
  await page.getByRole('button',{name:'解析API材料',exact:true}).click();
  await expect(reset).toBeDisabled();
  await page.getByRole('button',{name:'取消本次操作',exact:true}).click();
  await expect(reset).toBeEnabled();
  await reset.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.task-metrics')).toContainText('等待接收');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
