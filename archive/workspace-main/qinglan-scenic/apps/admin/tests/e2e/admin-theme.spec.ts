import { expect, test, type Page } from '@playwright/test';
import { gotoPage, login } from './helpers';

async function appearance(page: Page, value: string) {
  const menu = page.locator('.admin-account');
  if (await menu.count() && (await menu.getAttribute('open')) === null) await menu.locator('summary').click();
  await page.getByLabel('外观', { exact: true }).selectOption(value);
  if (await menu.count()) await menu.locator('summary').press('Escape');
}

async function assertReadable(page: Page, selector: string) {
  const colors = await page.locator(selector).evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => {
    const parse = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
    let backdrop = [16, 28, 26];
    const chain: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) chain.unshift(node);
    for (const node of chain) {
      const [r,g,b,a=1] = parse(getComputedStyle(node).backgroundColor);
      if (r !== undefined) backdrop = [r,g,b].map((c,i) => c*a + backdrop[i]*(1-a));
    }
    const lum = (rgb: number[]) => rgb.slice(0,3).map(c => c/255).map(c => c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i) => s+c*[.2126,.7152,.0722][i],0);
    const text = lum(parse(getComputedStyle(el).color)); const bg = lum(backdrop);
    return { text: el.textContent?.trim().slice(0,45), ratio: (Math.max(text,bg)+.05)/(Math.min(text,bg)+.05) };
  }));
  expect(colors.length).toBeGreaterThan(0);
  for (const item of colors) expect(item.ratio, item.text).toBeGreaterThanOrEqual(4.5);
}

test('默认跟随系统，手动选择持久化，恢复系统后实时响应', async ({ page }) => {
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/login');
  await expect(page.locator('body')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme','dark');
  await assertReadable(page, '.login-card label, .login-card h1, .login-card .muted');
  await page.emulateMedia({colorScheme:'light'});
  await expect(page.locator('body')).toHaveAttribute('data-theme','light');
  await appearance(page,'dark'); await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme','dark');
  await expect(page.getByLabel('外观',{exact:true})).toHaveValue('dark');
  await appearance(page,'system');
  await expect(page.locator('body')).toHaveAttribute('data-theme','light');
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('body')).toHaveAttribute('data-theme','dark');
});

test('切换外观及跨标签同步不丢草稿、阅读位置和未保存保护', async ({ page, context }) => {
  await login(page); await gotoPage(page,'/content/articles/new','新增内容');
  await page.locator('#summary').fill('主题切换保留的草稿');
  await page.locator('#body').fill('长正文\n'.repeat(80));
  const area=page.locator('.flow-editor__scroll');
  const top=await area.evaluate(el=>el.scrollTop);
  await appearance(page,'dark');
  await expect(page.locator('#summary')).toHaveValue('主题切换保留的草稿');
  expect(await area.evaluate(el=>el.scrollTop)).toBe(top);
  const other=await context.newPage();await other.goto('/#/overview');
  await expect(other.locator('body')).toHaveAttribute('data-theme','dark');
  await appearance(other,'light');
  await expect(page.locator('body')).toHaveAttribute('data-theme','light');
  await page.getByRole('link',{name:'返回列表',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('#summary')).toHaveValue('主题切换保留的草稿');
  await other.close();
});

test('深色覆盖各页及窄容器，墨青唱片、表头和状态保持清晰', async ({page}) => {
  test.setTimeout(90000);
  await page.emulateMedia({colorScheme:'dark'}); await login(page);
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  const routes=[['/overview','工作台'],['/content/scenic','景区资料'],['/content/articles','资讯与指南'],['/content/pois','景点介绍'],['/notices','公告管理'],['/orders','订单管理'],['/booking/slots','预约配额'],['/facilities','设施运行'],['/inspections','检修计划'],['/alerts','告警记录'],['/users/visitors','游客管理'],['/users/staff','员工管理'],['/knowledge','知识查看'],['/chat','聊天管理'],['/chat?tab=reports','聊天管理'],['/chat?tab=mutes','聊天管理'],['/service-status','服务状态']];
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[1200,768]]) {
    await page.setViewportSize({width,height});
    for(const [route,title] of routes) {
      await gotoPage(page,route,title);
      await expect(page.locator('.admin-content .spinner')).toHaveCount(0);
      await expect(page.locator('.admin-background')).toHaveAttribute('data-theme','dark');
      const rack=await page.locator('.admin-record-rack').evaluate(el=>getComputedStyle(el).getPropertyValue('--rack-tint').trim());
      expect(rack).toBe('22 53 49');
      await assertReadable(page,'.admin-content h1, .admin-content .tag, .admin-content th');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),route).toBe(false);
      if(await page.locator('.flow-page').count()) expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),route).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});

test('深色预览、删除确认、筛选浮层和表单错误可读且保留玻璃', async ({page}) => {
  await page.emulateMedia({colorScheme:'dark'}); await login(page);
  await gotoPage(page,'/content/articles','资讯与指南');
  await page.getByRole('button',{name:'预览',exact:true}).first().click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color','rgba(25, 47, 40, 0.94)');
  await assertReadable(page,'.drawer h2, .drawer dt, .drawer dd, .drawer p');
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click();
  await page.getByRole('button',{name:'删除',exact:true}).first().click();
  await expect(page.getByRole('alertdialog')).toHaveCSS('backdrop-filter','blur(8px) saturate(1.12)');
  await assertReadable(page,'.modal h2, .modal p, .modal button');
  await page.getByRole('alertdialog').press('Escape');
  await gotoPage(page,'/orders','订单管理');
  await page.getByRole('button',{name:/^筛选/}).click();
  await assertReadable(page,'.flow-filter-popup label, .flow-filter-popup select, .flow-filter-popup button');
  await page.getByRole('dialog',{name:'筛选条件'}).press('Escape');
  await gotoPage(page,'/content/scenic','景区资料');
  await page.getByRole('button',{name:'编辑资料',exact:true}).click();
  await page.locator('#name').fill('');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
  await assertReadable(page,'.field__error, .form-error-banner');
});

test('偏好存储不可用时仍能切换深色，不产生脚本错误', async ({page}) => {
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError');};});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#/login');await appearance(page,'dark');
  await expect(page.locator('body')).toHaveAttribute('data-theme','dark');
  expect(errors).toEqual([]);
});


test('PC宽屏唱片标题的标识与全称完整显示', async ({ page }) => {
  await login(page);
  for (const theme of ['light', 'dark']) {
    await appearance(page, theme);
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      const title = page.locator('.rr-title');
      await expect(title).toHaveText('青岚山境');
      await expect.poll(() => title.evaluate(el => {
        const brand = el.querySelector<HTMLElement>('.admin-rack-brand')!;
        return el.scrollWidth <= el.clientWidth && brand.scrollWidth <= brand.clientWidth;
      })).toBe(true);
      const bounds = await page.locator('.admin-rack-brand').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThan(width);
    }
  }
});
