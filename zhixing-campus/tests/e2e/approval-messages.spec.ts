import {expect,test} from '@playwright/test';
const url=`http://localhost:${process.env.E2E_MOBILE_PORT || 5502}`;
test.beforeEach(async({page})=>{
  await page.route('**/api/demo/revision',route=>route.fulfill({json:{data:{revision:'records-ui'}}}));
});
for (const width of [360,390,430]) {
  test(`其他服务空状态与移动适配 ${width}`,async({page})=>{
    await page.setViewportSize({width,height:854});
    await page.addInitScript(()=>localStorage.setItem('zhixing:student-session','林悦'));
    await page.route('**/api/bookings?**',route=>route.fulfill({json:{data:[]}}));
    await page.route('**/api/leaves?**',route=>route.fulfill({json:{data:[]}}));
    await page.goto(`${url}/#/pages/records/index?category=other`);
    await expect(page.locator('.records-empty-title')).toHaveText('还没有服务记录');
    await expect(page.getByRole('button',{name:'返回',exact:true})).toBeVisible();
    await expect(page.locator('.records-back-chevron')).toBeVisible();
    expect(await page.locator('.records-back-chevron').evaluate(element=>getComputedStyle(element).borderLeftWidth)).toBe('2px');
    await expect(page.locator('.record-category-tabs').getByRole('button',{name:/其他服务/})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('button',{name:'刷新审批消息'})).toBeEnabled();
    await expect(page.locator('.records-empty-art img')).toHaveCount(1);
    await expect.poll(()=>page.locator('.records-empty-art img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`.local/qa/records-empty-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'报修服务',exact:true}).click();
    await expect(page).toHaveURL(/pages\/repair\/index/);
  });
}
test('加载、失败与刷新恢复不会误显示空记录',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('zhixing:student-session','林悦'));
  let finish!:()=>void;
  const hold=new Promise<void>(resolve=>{finish=resolve;});
  await page.route('**/api/bookings?**',async route=>{await hold;await route.fulfill({json:{data:[]}});});
  await page.route('**/api/leaves?**',async route=>{await hold;await route.fulfill({json:{data:[]}});});
  await page.goto(`${url}/#/pages/records/index`);
  await expect(page.getByRole('status',{name:'正在加载服务记录'})).toBeVisible();
  await expect(page.locator('.records-empty')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'刷新审批消息'})).toBeDisabled();
  finish();
  await expect(page.locator('.records-empty-title')).toHaveText('还没有预约记录');
  await page.route('**/api/bookings?**',route=>route.abort());
  await page.getByRole('button',{name:'刷新审批消息'}).click();
  await expect(page.getByRole('alert')).toContainText('暂时无法同步记录');
  await expect(page.locator('.records-empty')).toHaveCount(0);
  await page.route('**/api/bookings?**',route=>route.fulfill({json:{data:[]}}));
  await page.getByRole('button',{name:'刷新审批消息'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.records-empty-title')).toHaveText('还没有预约记录');
});
test('返回箭头不依赖图片资源，点击可返回首页',async({page})=>{
  await page.route('**/static/icons/**',route=>route.abort());
  await page.goto(`${url}/#/pages/records/index?category=other`);
  await expect(page.locator('.records-back-chevron')).toBeVisible();
  await page.getByRole('button',{name:'返回',exact:true}).click();
  // uni-app canonicalizes the first page to #/ after reLaunch.
  await expect(page.locator('.mobile-brand')).toHaveText('知行校园');
  await expect(page.locator('.approval-entry')).toBeVisible();
});
test('旧服务不支持详情接口时明确提示重启，而不是让学生误以为假条丢失',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('zhixing:student-session','林悦'));
  await page.route('**/api/leaves/LV-old?**',route=>route.fulfill({status:404,json:{error:'接口不存在'}}));
  await page.goto(`${url}/#/pages/leave-detail/index?id=LV-old`);
  await expect(page.getByRole('alert')).toContainText('请假服务仍是旧版本');
  await expect(page.getByRole('alert')).toContainText('已保存的假条不会删除');
  await expect(page.locator('.leave-detail-actions')).toHaveCount(0);
});
test('未登录时明确引导登录而不是误报没有申请',async({page})=>{
  await page.goto(`${url}/#/pages/records/index?category=leave`);
  await expect(page.locator('.records-empty-title')).toHaveText('登录后，查看你的申请');
  await page.getByRole('button',{name:'登录查看'}).click();
  await expect(page).toHaveURL(/pages\/login\/index/);
});
test('首页可直达请假与预约，分类隔离且按更新时间降序',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('zhixing:student-session','林悦'));
  const base={owner:'林悦',classId:'CLS-2401',status:'approved',createdAt:'2026-01-01T08:00:00+08:00',reviewer:'陈越'};
  await page.route('**/api/bookings?**',route=>route.fulfill({json:{data:[{...base,id:'B1',activity:'较早预约',venue:'教室305',date:'2026-11-01',time:'18:00–19:00',count:2,purpose:'讨论',updatedAt:'2026-01-02T08:00:00+08:00'},{...base,id:'B2',activity:'最新预约',venue:'教室306',date:'2026-10-01',time:'18:00–19:00',count:2,purpose:'讨论',updatedAt:'2026-01-05T08:00:00+08:00'}]}}));
  await page.route('**/api/leaves?**',route=>route.fulfill({json:{data:[{...base,id:'L1',type:'事假',reason:'较早请假',startDate:'2026-11-01',endDate:'2026-11-01',startTime:'08:00:00',endTime:'09:00:00',updatedAt:'2026-01-02T08:00:00+08:00'},{...base,id:'L2',type:'病假',reason:'最新请假',startDate:'2026-10-01',endDate:'2026-10-01',startTime:'08:00:00',endTime:'09:00:00',updatedAt:'2026-01-06T08:00:00+08:00'}]}}));
  await page.goto(`${url}/#/pages/home/index`);
  await page.locator('.approval-entry').getByRole('button',{name:/请假消息/}).click();
  await expect(page.locator('.service-record')).toHaveCount(2);
  await expect(page.locator('.service-record').first()).toContainText('最新请假');
  await expect(page.locator('.service-record')).not.toContainText(['预约','预约']);
  await page.locator('.record-category-tabs').getByRole('button',{name:/预约消息/}).click();
  await expect(page.locator('.service-record')).toHaveCount(2);
  await expect(page.locator('.service-record').first()).toContainText('最新预约');
  await expect(page.locator('.service-record').first()).toContainText('审核教师：陈越');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/approval-messages-booking.png',fullPage:true});
  await page.goto(`${url}/#/pages/records/index?category=leave`);
  await expect(page.locator('.service-record').first()).toContainText('最新请假');
  await page.screenshot({path:'test-results/approval-messages-leave.png',fullPage:true});
});
