import {expect,test} from '@playwright/test';
import {fixtures,receive,nav,generateApi,noOverflow} from './helpers';

test.beforeEach(async({page})=>fixtures(page));
test('API按解析、生成逐步展示：初始空白，12项材料导入，110项用例完整迁入同一卡片',async({page})=>{
 await receive(page);await nav(page,'API测试');
 const card=page.getByRole('region',{name:'API材料与测试工作台',exact:true});
 await expect(card).toBeVisible();await expect(card).toContainText('尚未导入API');
 await expect(card.locator('.api-table')).toHaveCount(0);await expect(card.locator('.material-detail')).toHaveCount(0);
 await expect(card.locator('.endpoint-path,pre')).toHaveCount(0);
 await expect(card.getByRole('button',{name:'运行全部API',exact:true})).toBeDisabled();
 await card.getByRole('button',{name:'解析API材料',exact:true}).click();
 await expect(card.locator('.api-table tbody tr')).toHaveCount(12);
 await expect(card.locator('.material-detail,pre')).toHaveCount(0);
 await expect(card).toContainText('接口已导入，等待生成用例');
 await expect(card.getByRole('button',{name:'运行全部API',exact:true})).toBeDisabled();
 await page.reload();await nav(page,'API测试');
 await expect(card.locator('.api-table tbody tr')).toHaveCount(12);
 await expect(card.locator('.material-detail,pre')).toHaveCount(0);
 await card.getByRole('button',{name:'生成测试用例',exact:true}).click();
 await expect(card.locator('.api-table tbody tr')).toHaveCount(110);
 await expect(card.locator('.material-detail')).toContainText('请求参数 / 交付示例');
 await expect(card.getByRole('button',{name:'运行全部API',exact:true})).toBeEnabled();
 await expect(page.locator('.api-test-panel')).toHaveCount(0);
 await expect(card.locator('.api-table .badge').filter({hasText:'待测试'})).toHaveCount(110);
 await card.getByRole('button',{name:'选择提交秒级请假申请 · 离校缺少详细地址',exact:true}).click();
 await expect(card.locator('.material-detail')).toContainText('HTTP 400');
 await expect(card.locator('.material-detail')).toContainText('本地离校参数边界模型');
 await page.getByLabel('搜索API用例').fill('离校缺少');await expect(card.locator('.api-table tbody tr')).toHaveCount(2);
 await expect(card.getByRole('button',{name:'运行筛选用例',exact:true})).toBeEnabled();
 await page.getByLabel('搜索API用例').fill('没有这样的API');await expect(card.locator('.api-table tbody tr')).toHaveCount(0);
 await expect(card.getByRole('button',{name:'运行筛选用例',exact:true})).toBeDisabled();
 await page.getByLabel('搜索API用例').fill('');await page.getByLabel('筛选API分组').selectOption('学生请假');
 const count=await card.locator('.api-table tbody tr').count();expect(count).toBeGreaterThan(3);expect(count).toBeLessThan(110);
 await page.getByLabel('筛选API分组').selectOption('all');await expect(card.locator('.api-table tbody tr')).toHaveCount(110);
});

for(const [width,height] of [[1920,960],[1440,900],[1280,720],[900,720],[390,844]]){
 test(`统一API工作台 ${width}：完整列表与详情无横向溢出，响应码位于列表右侧`,async({page})=>{
  await page.setViewportSize({width,height});await receive(page);await generateApi(page);
  const card=page.getByRole('region',{name:'API材料与测试工作台',exact:true});
  const run=card.locator('.api-workbench-heading').getByRole('button',{name:'运行全部API',exact:true});
  await expect(run).toBeVisible();if(width>1100)await expect(run).toBeInViewport();
  await expect(card.locator('.api-table tbody tr')).toHaveCount(110);
  await card.getByRole('button',{name:'运行预约请假服务健康检查',exact:true}).click();
  const row=card.locator('tr[data-case-id="delivery-health"]');
  await expect(row.locator('.case-response')).toContainText('HTTP 200');
  await expect(card.locator('.case-execution')).toContainText('HTTP 200');
  const positions=await row.evaluate(el=>({name:el.querySelector('.case-label')!.getBoundingClientRect().right,status:el.querySelector('.case-response')!.getBoundingClientRect().left}));
  expect(positions.status).toBeGreaterThanOrEqual(positions.name);
  await noOverflow(page);
  expect(await card.locator('.api-case-directory').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await card.locator('.api-detail-viewport').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:`.local/qa/testing-api-workspace-${width}.png`,fullPage:true});
 });
}
