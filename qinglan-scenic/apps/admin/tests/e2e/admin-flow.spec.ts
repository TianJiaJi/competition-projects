import { expect, test, type Page } from '@playwright/test';
import { gotoPage, login } from './helpers';
const pages: Array<[string, string]> = [
  ['/content/articles', '资讯与指南'], ['/content/pois', '景点介绍'], ['/notices', '公告管理'], ['/orders', '订单管理'],
  ['/booking/slots', '预约配额'], ['/facilities', '设施运行'], ['/inspections', '检修计划'], ['/alerts', '告警记录'],
  ['/users/visitors', '游客管理'], ['/users/staff', '员工管理'], ['/knowledge', '知识查看'], ['/chat?tab=reports', '聊天管理'], ['/chat?tab=mutes', '聊天管理'],
];
async function ready(page: Page) { await expect(page.locator('.flow-page .spinner, .flow-page [aria-busy="true"], .flow-page .flow-load-note[role="status"]')).toHaveCount(0); }

test('各列表桌面及窄容器固定外框，分页与表头可见，滚动留在表格内', async ({ page }) => {
  test.setTimeout(90000);
  await login(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[1366,768], [1440,900], [1920,1080], [1200,768], [1366,600]]) {
    await page.setViewportSize({width,height});
    for (const [path, title] of pages) {
      await gotoPage(page,path,title); await expect(page.locator(".flow-page tbody tr").first()).toBeVisible(); await ready(page);
      const geometry = await page.locator('.flow-page').evaluate(root => {
        const panel = root.querySelector('.flow-panel')!;
        const table = panel.querySelector<HTMLElement>('.table-scroll');
        if (table) table.scrollTop = table.scrollHeight;
        const pager = panel.querySelector('.pager')?.getBoundingClientRect();
        const head = table?.querySelector('thead')?.getBoundingClientRect();
        return { outerY: document.documentElement.scrollHeight > innerHeight, outerX: document.documentElement.scrollWidth > innerWidth,
          panelBottom: panel.getBoundingClientRect().bottom, viewport: innerHeight, tableHeight: table?.clientHeight ?? 0,
          pagerBottom: pager?.bottom ?? 0, scrollY: window.scrollY, headTop: head?.top, tableTop: table?.getBoundingClientRect().top,
          tint: getComputedStyle(panel).getPropertyValue('--glass-tint-opacity') };
      });
      expect(geometry.outerY, `${path} ${width} outer Y`).toBe(false);
      expect(geometry.outerX, `${path} ${width} outer X`).toBe(false);
      expect(geometry.panelBottom).toBeLessThanOrEqual(height);
      expect(geometry.pagerBottom).toBeLessThanOrEqual(height);
      expect(geometry.tableHeight, `${path} ${width} usable table`).toBeGreaterThan(100);
      expect(geometry.scrollY).toBe(0);
      expect(geometry.tint.trim()).toBe('0.16');
      const table = page.locator('.flow-panel .table-scroll').first();
      await table.hover(); await page.mouse.wheel(0, 3000);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
  }
  expect(errors).toEqual([]);
});

test('筛选浮层独立草稿、应用计数、焦点及窄容器的字段联动', async ({ page }) => {
  await login(page); await gotoPage(page,'/orders','订单管理'); await ready(page);
  const filter = page.getByRole('button',{name:/^筛选/});
  const popup = page.getByRole('dialog',{name:'筛选条件'});
  const first = await page.locator('tbody').innerText();
  await filter.click();
  await popup.getByLabel('来源',{exact:true}).selectOption('all');
  await popup.getByLabel('关键词',{exact:true}).fill('未应用的筛选');
  await popup.press('Escape');
  await expect(filter).toBeFocused();
  await expect(page.getByLabel('关键词',{exact:true})).toHaveValue('');
  expect(await page.locator('tbody').innerText()).toBe(first);
  await filter.click(); await expect(popup.getByLabel('来源',{exact:true})).toHaveValue('onsite');
  await popup.getByLabel('来源',{exact:true}).selectOption('all');
  await popup.getByLabel('预约状态',{exact:true}).selectOption('confirmed');
  await popup.getByRole('button',{name:'应用',exact:true}).click(); await ready(page);
  await expect(filter).toContainText('3');
  await expect(page.locator('tbody')).not.toContainText('已取消');
  await page.setViewportSize({width:1200,height:768});
  await filter.click(); await popup.getByLabel('类型',{exact:true}).selectOption('parking');
  await expect(popup.getByLabel('履约状态',{exact:true}).locator('option[value="parked"]')).toHaveCount(1);
  await popup.getByRole('button',{name:'应用',exact:true}).click(); await ready(page);
  await expect(page.locator('tbody')).toContainText('辆');
  await filter.click(); await popup.getByRole('button',{name:'重置',exact:true}).click(); await ready(page);
  await filter.click(); await expect(popup.getByLabel('类型',{exact:true})).toHaveValue('admission');
});

test('列表详情和编辑返回保留滚动，查询与翻页回到顶部', async ({ page }) => {
  await login(page); await gotoPage(page,'/content/articles','资讯与指南'); await ready(page);
  const scroll = page.locator('.flow-panel .table-scroll');
  await scroll.evaluate(element => { element.scrollTop = 500; });
  const row = page.locator('tbody tr').nth(6);
  await row.getByRole('button',{name:'预览',exact:true}).click();
  const top = await scroll.evaluate(element => element.scrollTop);
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click();
  expect(await scroll.evaluate(element => element.scrollTop)).toBe(top);
  await row.getByRole('link',{name:'编辑',exact:true}).click();
  await page.getByRole('link',{name:'返回列表',exact:true}).click(); await ready(page);
  expect(await scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'下一页',exact:true}).click(); await ready(page);
  expect(await scroll.evaluate(element => element.scrollTop)).toBe(0);
  await page.getByLabel('关键词',{exact:true}).fill('不存在的标题'); await page.getByRole('button',{name:'查询',exact:true}).click(); await ready(page);
  await expect(page.locator('.flow-panel')).toContainText('没有');
  expect(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight)).toBe(true);
});

test('聊天消息加载历史保持锚点，窄容器用房间选择且无整页滚动', async ({ page }) => {
  await login(page); await gotoPage(page,'/chat','聊天管理'); await ready(page);
  const messages = page.locator('.message-list');
  await expect.poll(() => messages.locator('li').count()).toBe(50);
  expect(await messages.evaluate(element => element.scrollHeight-element.scrollTop-element.clientHeight)).toBeLessThan(5);
  await messages.evaluate(element => { element.scrollTop = 0; });
  const anchor = await messages.locator('li').first().getAttribute('data-message-id');
  const top = await page.locator(`[data-message-id="${anchor}"]`).evaluate(element => element.getBoundingClientRect().top);
  await page.getByRole('button',{name:'加载更早消息',exact:true}).click(); await ready(page);
  await expect(messages.locator('li')).toHaveCount(55);
  expect(await page.locator(`[data-message-id="${anchor}"]`).evaluate(element => element.getBoundingClientRect().top)).toBeCloseTo(top,0);
  const scrollTop = await messages.evaluate(element => element.scrollTop);
  await page.getByRole('button',{name:'刷新',exact:true}).click(); await ready(page);
  expect(await messages.evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop,0);
  await page.setViewportSize({width:1200,height:768});
  await expect(page.getByLabel('聊天室',{exact:true})).toBeVisible();
  await page.getByLabel('聊天室',{exact:true}).selectOption({index:1}); await ready(page);
  await expect(messages.locator('li')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight)).toBe(true);
});

test('新增只读详情保留移出的字段，不必进入编辑', async ({page}) => {
  await login(page);
  for (const [path,title,label] of [['/content/pois','景点介绍','点位 ID'],['/notices','公告管理','公告编号'],['/inspections','检修计划','计划 ID'],['/chat?tab=mutes','聊天管理','原因']]) {
    await gotoPage(page,path,title); await expect(page.locator(".flow-page tbody tr").first()).toBeVisible(); await ready(page);
    await page.locator('tbody').getByRole('button',{name:'查看',exact:true}).first().click();
    await expect(page.getByRole('dialog')).toContainText(label);
    await expect(page.getByRole('dialog').locator('input,textarea')).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click();
  }
});

test('编辑与完整预览保留输入和位置，预览中校验失败定位字段', async ({page}) => {
  await login(page); await gotoPage(page,'/content/articles/new','新增内容');
  await page.locator('#summary').fill('摘要内容');
  await page.locator('#body').fill('## 完整预览\n\n'+ '长内容\n'.repeat(100));
  const area = page.locator('.flow-editor__scroll');
  const before = await area.evaluate(element => element.scrollTop);
  await page.getByRole('tab',{name:'完整预览',exact:true}).click();
  await expect(page.locator('.flow-editor__preview')).toContainText('长内容');
  await page.getByRole('tab',{name:'编辑',exact:true}).click();
  expect(await area.evaluate(element => element.scrollTop)).toBeCloseTo(before,0);
  await page.getByRole('tab',{name:'完整预览',exact:true}).click();
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  await expect(page.getByRole('tab',{name:'编辑',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#title')).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('列表首次异常可重试，查询失败保留内容，再次重试保持阅读位置', async ({page}) => {
  await page.route(/\/src\/services\/orders\.ts$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      import { adminListOrders as actual } from '/src/services/orders.ts?flow-test-original';
      export * from '/src/services/orders.ts?flow-test-original';
      export async function adminListOrders(...args) {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (sessionStorage.getItem('flow-read-error') === 'throw') throw new Error('读取异常');
        if (sessionStorage.getItem('flow-read-error') === 'fail') return {ok:false,error:{code:'MOCK_STORAGE_FAILED',message:'读取失败'}};
        return actual(...args);
      }`,
  }));
  await login(page);
  await page.evaluate(() => sessionStorage.setItem('flow-read-error', 'throw'));
  await gotoPage(page,'/orders','订单管理');
  await expect(page.locator('.flow-page').getByRole('alert')).toContainText('读取失败');
  await expect(page.locator('.flow-page tbody')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight)).toBe(true);
  await page.evaluate(() => sessionStorage.removeItem('flow-read-error'));
  await page.locator('.flow-page').getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('tbody tr').first()).toBeVisible(); await ready(page);
  const text = await page.locator('tbody').innerText();
  const table = page.locator('.flow-panel .table-scroll');
  await table.evaluate(el => { el.scrollTop = 150; });
  await page.evaluate(() => sessionStorage.setItem('flow-read-error','fail'));
  await page.getByRole('button',{name:'查询',exact:true}).click();
  await expect(page.locator('.flow-load-note[role="alert"]')).toContainText('当前仍为上次读取的数据');
  expect(await page.locator('tbody').innerText()).toBe(text);
  expect(await table.evaluate(el=>el.scrollTop)).toBe(0);
  await table.evaluate(el => { el.scrollTop = 150; });
  const top = await table.evaluate(el => el.scrollTop);
  await page.locator('.flow-load-note').getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('.flow-load-note[role="alert"]')).toBeVisible();
  expect(await table.evaluate(el=>el.scrollTop)).toBe(top);
  await page.evaluate(() => sessionStorage.removeItem('flow-read-error'));
  await page.locator('.flow-load-note').getByRole('button',{name:'重试',exact:true}).click(); await ready(page);
  await expect(page.locator('.flow-load-note[role="alert"]')).toHaveCount(0);
});

test('预览及危险确认浮层遮蔽背景，键盘焦点留在弹窗内', async ({page}) => {
  await login(page); await gotoPage(page,'/content/articles','资讯与指南'); await ready(page);
  await page.getByRole('button',{name:'预览',exact:true}).first().click();
  const preview=page.getByRole('dialog');
  await expect(preview).toHaveCSS('background-color','rgba(230, 242, 235, 0.94)');
  for (const [width,height] of [[1366,768],[1440,900],[1920,1080],[1000,600]]) {
    await page.setViewportSize({width,height});
    const box=await preview.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y+box!.height).toBeLessThanOrEqual(height);
    await preview.locator('.drawer__body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await expect(preview.locator('.drawer__footer')).toBeInViewport();
  }
  await preview.getByRole('button',{name:'关闭',exact:true}).first().click();
  const remove=page.getByRole('button',{name:'删除',exact:true}).first();
  await remove.click();
  const confirm=page.getByRole('alertdialog');
  await expect(confirm).toHaveCSS('background-color','rgba(230, 242, 235, 0.94)');
  await expect(confirm.getByRole('button',{name:'删除',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirm.getByRole('button',{name:'取消',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm.getByRole('button',{name:'删除',exact:true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(confirm).toHaveCount(0); await expect(remove).toBeFocused();
});
