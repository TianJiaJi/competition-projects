import { expect, test } from '@playwright/test';
import { fixtures, receive, nav, generateApi, selectChoice, noOverflow } from './helpers';

test.beforeEach(async ({page}) => fixtures(page));

test('初始展示隔离的历史任务，手动接收仅新增一个既定任务，筛选和刷新保持一致', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.historical-task-row')).toHaveCount(3);
  await expect(page.locator('.delivery-task-card')).toHaveCount(0);
  await expect(page.locator('.inbox-panel .badge')).toHaveText('0');
  await expect(page.locator('.inbox-panel')).toContainText('尚未接收本轮交付');
  await expect(page.locator('.task-list')).toContainText('历史示例仅供展示');
  await expect(page.locator('.task-metrics article').nth(1).locator('strong')).toHaveText('0项');
  await page.getByRole('button',{name:'查看QA-SCENIC-019历史摘要',exact:true}).click();
  const history=page.getByRole('dialog',{name:'历史任务摘要',exact:true});
  await expect(history).toContainText('已完成');await expect(history).toContainText('2 项待整改');await expect(history).toContainText('不代表本轮实际执行');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'接收上游交付',exact:true}).click();
  await expect(page.locator('.delivery-task-card')).toHaveCount(1);
  await expect(page.getByText('收到新交付消息',{exact:false})).toHaveCount(0);
  await expect(page.locator('.historical-task-row')).toHaveCount(3);
  await expect(page.locator('.delivery-task-card')).toHaveCount(1);
  await expect(page.locator('.inbox-panel .badge')).toHaveText('1');
  await expect(page.locator('.inbox-panel .message-author')).toBeVisible();
  await expect(page.locator('.delivery-task-card .task-status')).toHaveText('待测试');
  await expect(page.locator('.delivery-task-card')).toContainText('已检查 0 / 150');
  await expect(page.getByRole('button',{name:'接收上游交付',exact:true})).toBeDisabled();
  await page.getByRole('group',{name:'筛选测试任务'}).getByRole('button',{name:'进行中 1',exact:true}).click();
  await expect(page.locator('.historical-task-row')).toHaveCount(0);
  await expect(page.locator('.delivery-task-card')).toHaveCount(1);
  await page.getByRole('group',{name:'筛选测试任务'}).getByRole('button',{name:'已完成 3',exact:true}).click();
  await expect(page.locator('.historical-task-row')).toHaveCount(3);await expect(page.locator('.delivery-task-card')).toHaveCount(0);
  await page.reload();await expect(page.locator('.historical-task-row')).toHaveCount(3);await expect(page.locator('.delivery-task-card')).toHaveCount(1);
  await expect(page.locator('.task-timeline li').filter({hasText:'创建测试任务'})).toHaveCount(1);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await noOverflow(page);
    await page.screenshot({path:`.local/qa/testing-task-list-${width}.png`,fullPage:true});
  }
});

test('接收取消不新增任务；历史摘要不改变本轮验收与时间线', async ({page}) => {
  await page.goto('/');await page.getByRole('button',{name:'接收上游交付',exact:true}).click();
  await page.getByRole('button',{name:'关闭接收项目交付',exact:true}).click();
  await expect(page.locator('.delivery-task-card')).toHaveCount(0);await expect(page.locator('.historical-task-row')).toHaveCount(3);
  await receive(page);await nav(page,'任务中心');
  await page.getByRole('button',{name:'查看QA-COMM-025历史摘要',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('.task-timeline li')).toHaveCount(2);
  await nav(page,'验收报告');await page.getByRole('button',{name:'汇总验收报告',exact:true}).click();
  await expect(page.locator('.acceptance-stat-grid article b')).toHaveText(['0/ 17','0/ 128','0/ 1','0/ 4']);
  await expect(page.locator('.archived-reports article')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'提交报告并完结任务',exact:true})).toBeDisabled();
});

test('阶段反馈不完结，进度变化、报告过期和运行中状态均不会误判完成', async ({page}) => {
  await receive(page);await nav(page,'UI测试');await selectChoice(page,'检查结果1','通过');await page.getByRole('button',{name:'保存页面检查',exact:true}).click();
  await nav(page,'任务中心');await expect(page.locator('.delivery-task-card .task-status')).toHaveText('测试中');
  await expect(page.locator('.delivery-task-card')).toContainText('已检查 1 / 150');
  await nav(page,'验收报告');await page.getByRole('button',{name:'汇总验收报告',exact:true}).click();
  await expect(page.getByRole('button',{name:'提交报告并完结任务',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'提交验收反馈',exact:true}).click();await expect(page.locator('.feedback-receipt')).toContainText('待补测');
  await nav(page,'任务中心');await expect(page.locator('.delivery-task-card .task-status')).toHaveText('待补测');
  await expect(page.locator('.task-metrics article').nth(1).locator('strong')).toHaveText('1项');
  await generateApi(page);await page.getByRole('button',{name:'运行全部API',exact:true}).click();
  await nav(page,'验收报告');await expect(page.getByRole('button',{name:'提交报告并完结任务',exact:true})).toBeDisabled();
  await expect(page.getByRole('list',{name:'待完成事项'})).toContainText('正在运行');
  await expect(page.getByRole('list',{name:'待完成事项'})).toContainText('重新汇总');
  await nav(page,'任务中心');await expect(page.locator('.delivery-task-card .task-status')).toHaveText('测试中');
  await expect(page.locator('.task-completion-receipt')).toHaveCount(0);
  await expect(page.locator('.inbox-panel .badge')).toHaveText('1');
  await expect(page.locator('.inbox-panel .message-author')).toBeVisible();
});
