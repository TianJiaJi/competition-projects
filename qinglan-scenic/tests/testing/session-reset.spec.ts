import {expect,test} from '@playwright/test';
import {fixtures,receive,nav,generateApi} from './helpers';
import {TASK_STORAGE_KEY} from '../../apps/testing/src/task-store';
import {SESSION_KEY} from '../../apps/testing/src/runtime-task';
test.beforeEach(async({page})=>fixtures(page));
test('刷新与重新打开保留用例和检查，只有头像重置清空',async({page})=>{
 await receive(page);await generateApi(page);await page.reload();
 await expect(page.locator('.delivery-task-card')).toHaveCount(1);await nav(page,'API测试');await expect(page.locator('.api-table tbody tr')).toHaveCount(110);
 await page.goto('/');await expect(page.locator('.delivery-task-card')).toHaveCount(1);
 await page.getByRole('button',{name:'立即重置工作台',exact:true}).click();await expect(page.locator('.delivery-task-card')).toHaveCount(0);
 await page.reload();await expect(page.locator('.delivery-task-card')).toHaveCount(0);
});
test('同一次服务启动保持数据，重启标识变化才清空',async({page})=>{
 let id='boot-a';await page.route('**/__workbench_session',route=>route.fulfill({json:{id}}));
 await receive(page);await generateApi(page);await page.reload();await expect(page.locator('.delivery-task-card')).toHaveCount(1);
 id='boot-b';await page.reload();await expect(page.locator('.delivery-task-card')).toHaveCount(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),SESSION_KEY)).toBe('boot-b');
 await expect(page.locator('.task-metrics')).toContainText('等待接收');
});
test('服务暂时不可用不清空，旧业务配置保持不变',async({page})=>{
 await receive(page);await page.evaluate(()=>localStorage.setItem('zhixing:student-session','keep'));
 await page.route('**/__workbench_session',route=>route.abort());await page.reload();
 await expect(page.locator('.delivery-task-card')).toHaveCount(1);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).receivedAt,TASK_STORAGE_KEY)).toBeTruthy();
 expect(await page.evaluate(()=>localStorage.getItem('zhixing:student-session'))).toBe('keep');
});
test('页面保持打开时服务重启也会重置',async({page})=>{
 let id='live-a';await page.route('**/__workbench_session',route=>route.fulfill({json:{id}}));
 await receive(page);id='live-b';
 await expect(page.locator('.delivery-task-card')).toHaveCount(0,{timeout:15000});
 await expect(page.locator('.task-metrics')).toContainText('等待接收');
});
