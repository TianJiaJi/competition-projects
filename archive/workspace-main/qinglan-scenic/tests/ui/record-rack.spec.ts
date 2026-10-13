import { test, expect, type Page } from '@playwright/test';

async function openGroup(page: Page, label = '文字随笔') {
  await page.getByRole('button', { name: label, exact: true }).locator('.rr-label').click();
  await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-expanded', 'true');
}
async function discWheel(page: Page, delta: number, options = {}) {
  await page.locator('.rr-disc').dispatchEvent('wheel', { deltaY: delta, deltaMode: 0, ...options });
}
async function withAdvanced(page: Page, action: () => Promise<unknown>) {
  await page.getByRole('button', { name: '更多设置与演示' }).click();
  await action();
  await page.getByRole('button', { name: '关闭更多设置' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/record-rack.html');
  await withAdvanced(page, () => page.getByLabel('菜单场景').selectOption('normal'));
});

for (const placement of ['top', 'bottom']) {
  test(`${placement}：收起和展开时片单完整行与页脚不重叠`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('停靠位置').selectOption(placement);
    const sleeve = page.getByRole('button', { name: '文字随笔', exact: true });
    const checkContent = async () => {
      await page.waitForTimeout(350);
      expect(await sleeve.evaluate(el => {
        const summary = el.querySelector<HTMLElement>('.rr-summary')!;
        const footer = el.querySelector<HTMLElement>('.rr-sleeve-footer')!;
        const rows = [...summary.children].filter(row => getComputedStyle(row).display !== 'none') as HTMLElement[];
        const label = el.querySelector<HTMLElement>('.rr-label')!;
        return summary.offsetTop >= label.offsetTop + label.offsetHeight &&
          rows.every(row => row.offsetTop + row.offsetHeight <= summary.offsetTop + summary.clientHeight + 1) &&
          (getComputedStyle(footer).display === 'none' || footer.offsetTop >= summary.offsetTop + summary.clientHeight);
      })).toBe(true);
    };
    await checkContent();
    await sleeve.focus(); await sleeve.press('Enter');
    await checkContent();
  });
}

test('滚轮连续输入只导航一次，当前项不重复导航，正文不移动', async ({ page }) => {
  const before = await page.locator('.page-preview').boundingBox();
  await openGroup(page);
  for (const delta of [32, 25, 19, 12, 8, 4]) await discWheel(page, delta);
  await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
  await discWheel(page, 500);
  await expect(page.getByTestId('active-page')).toHaveText('城市漫游');
  await discWheel(page, 500);
  await page.waitForTimeout(650);
  await expect(page.getByTestId('nav-event')).toHaveCount(3);
  expect(await page.locator('.page-preview').boundingBox()).toEqual(before);
});

test('预选与当前页分离，拒绝导航保留原页，离开恢复停靠', async ({ page }) => {
  await withAdvanced(page, () => page.getByRole('checkbox').check());
  await openGroup(page, '创作手记');
  await discWheel(page, 100);
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
  await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
  await expect(page.locator('.rr-current')).toHaveAttribute('data-group', 'content');
  await page.mouse.move(700, 900);
  await expect(page.locator('.rr-root')).toHaveClass(/rr-parked/);
  await expect(page.locator('.rr-open')).toHaveAttribute('data-group', 'content');
  await expect(page.locator('.rr-open [aria-current="page"]')).toHaveText('阅读笔记');
});

test('键盘移动预选不会导航，Enter确认，Escape恢复，外部选中同步', async ({ page }) => {
  const sleeve = page.getByRole('button', { name: '文字随笔', exact: true });
  await sleeve.focus(); await sleeve.press('Enter');
  await expect(page.locator('.rr-preview')).toBeFocused();
  await page.locator('.rr-preview').press('ArrowDown');
  await page.locator('.rr-preview').press('ArrowDown');
  await expect(page.getByTestId('nav-event')).toHaveCount(1);
  await page.locator('.rr-preview').press('Enter');
  await expect(page.getByTestId('active-page')).toHaveText('城市漫游');
  await page.locator('.rr-preview').press('Escape');
  await expect(sleeve).toBeFocused();
  await withAdvanced(page, () => page.getByRole('button', { name: '外部切到开源项目' }).click());
  await expect(page.locator('.rr-open')).toHaveAttribute('data-group', 'operations');
  await expect(page.locator('[aria-current="page"]')).toHaveText('开源项目');
});

test('空菜单、动态移除和卸载取消待提交事件', async ({ page }) => {
  await openGroup(page); await discWheel(page, 100);
  await withAdvanced(page, () => page.getByRole('button', { name: '卸载组件' }).click());
  await page.waitForTimeout(700);
  await expect(page.getByTestId('nav-event')).toHaveCount(1);
  await withAdvanced(page, () => page.getByRole('button', { name: '挂载组件' }).click());
  await withAdvanced(page, () => page.getByLabel('菜单场景').selectOption('removed'));
  await expect(page.locator('.rr-open')).toHaveCount(0);
  await withAdvanced(page, () => page.getByLabel('菜单场景').selectOption('empty'));
  await openGroup(page, '空片单');
  await expect(page.locator('.rr-empty')).toBeVisible();
  await expect(page.getByRole('button', { name: '不可用包装' })).toBeDisabled();
});

test('缩放手势不导航，长片单跳过禁用项，长架可滚动', async ({ page }) => {
  await openGroup(page); await discWheel(page, 100, { ctrlKey: true });
  await page.waitForTimeout(500); await expect(page.getByTestId('nav-event')).toHaveCount(1);
  await withAdvanced(page, () => page.getByLabel('菜单场景').selectOption('long'));
  const extra = page.getByRole('button', { name: '专题归档 1', exact: true });
  await extra.focus(); await extra.press('Enter');
  await page.locator('.rr-preview').press('ArrowDown');
  await expect(page.locator('.rr-preview')).toHaveText('归档文章 3');
  await page.locator('.rr-preview').press('End');
  await expect(page.locator('.rr-preview')).toHaveText('归档文章 16');
  await page.locator('.rr-preview').press('Enter');
  await expect(page.getByTestId('active-page')).toHaveText('归档文章 16');
  await expect(page.getByRole('button', { name: '后面的唱片' })).toBeVisible();
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  for (const orientation of ['vertical', 'horizontal']) {
    test(`${placement}/${orientation}：展开盘面可用且选中文字在视口内`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByLabel('停靠位置').selectOption(placement);
      await page.getByLabel('排列方向').selectOption(orientation);
      const sleeve = page.getByRole('button', { name: '文字随笔', exact: true });
      await sleeve.focus(); await sleeve.press('Enter');
      await expect(page.locator('.rr-preview')).toBeFocused();
      await page.waitForTimeout(450);
      const box = await page.locator('.rr-preview').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(1440); expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
      expect(await page.locator('.rr-preview').evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      await page.locator('.rr-preview').press('ArrowDown');
      await page.locator('.rr-preview').press('Enter');
      await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
    });
  }
}

test('减少动态效果下仍能停稳导航', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGroup(page); await discWheel(page, 100);
  await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
});

 test('真实指针穿过包装与盘面，滚轮导航后离开常驻停靠', async ({ page }) => {
  await openGroup(page);
  await page.locator('.rr-preview').hover();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
  await page.mouse.move(800, 900);
  await expect(page.locator('.rr-root')).toHaveClass(/rr-parked/);
  await expect(page.locator('.rr-open')).toHaveAttribute('data-group', 'content');
});

test('小尺寸、浅抽出和1366×768视口下，预选文字不被包装遮挡', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByLabel('唱片尺寸', { exact: true }).fill('180');
  await withAdvanced(page, () => page.getByLabel('抽出比例', { exact: true }).fill('0.35'));
  await openGroup(page);
  await page.locator('.rr-preview').hover();
  await expect.poll(() => page.locator('.rr-preview').evaluate(el => {
    const r = el.getBoundingClientRect();
    return [r.x + 3, r.x + r.width - 3].every(x => el.contains(document.elementFromPoint(x, r.y + r.height / 2)));
  })).toBe(true);
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
});

test('悬停已露出包装片单且下张压叠，点击与二级选择不再移动包装', async ({ page }) => {
  const sleeve = page.getByRole('button', { name: '创作手记', exact: true });
  await sleeve.locator('.rr-label').hover();
  await page.waitForTimeout(400);
  // Hover previews the printed tracklist without opening the disc or navigating.
  await expect(sleeve).toHaveAttribute('aria-expanded', 'false');
  const summary = page.locator('[data-group="orders"] .rr-summary');
  expect(await summary.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  const openBox = await sleeve.boundingBox();
  const nextBox = await page.getByRole('button', { name: '技术博客', exact: true }).boundingBox();
  expect(nextBox!.y).toBeLessThan(openBox!.y + openBox!.height);
  const positions = () => page.locator('.rr-sleeve').evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  const before = await positions();
  await sleeve.locator('.rr-label').click();
  await expect.poll(positions).toEqual(before);
  await page.locator('.rr-preview').hover();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId('active-page')).toHaveText('灵感收集');
  expect(await positions()).toEqual(before);
});

test('独立标题唱片不可展开，收起包装贴边但标签仍完整可见', async ({ page }) => {
  await expect(page.locator('.rr-title-record')).toHaveCount(1);
  await expect(page.locator('.rr-title-record button')).toHaveCount(0);
  await expect(page.locator('.rr-title-record h2')).toHaveText('博客目录');
  const sleeve = page.getByRole('button', { name: '创作手记', exact: true });
  const box = await sleeve.boundingBox();
  expect(box!.x).toBeLessThan(0);
  const label = page.locator('[data-group="orders"] .rr-label strong');
  const labelBox = await label.boundingBox();
  expect(labelBox!.x).toBeGreaterThanOrEqual(0);
  expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('点击任意包装直接进入第一项，重复点击不重复导航', async ({ page }) => {
  await openGroup(page, '技术博客');
  await expect(page.getByTestId('active-page')).toHaveText('前端开发');
  await expect(page.locator('.rr-preview')).toHaveText('前端开发');
  await expect(page.getByTestId('nav-event')).toHaveCount(1);
  await openGroup(page, '技术博客');
  await expect(page.getByTestId('nav-event')).toHaveCount(1);
});

test('单屏上限包含标题唱片，超出部分可继续浏览', async ({ page }) => {
  await withAdvanced(page, () => page.getByLabel('菜单场景').selectOption('long'));
  await expect(page.locator('.rr-record:visible')).toHaveCount(8);
  await page.getByRole('button', { name: '后面的唱片' }).click();
  await expect(page.locator('.rr-record:visible')).toHaveCount(8);
  await expect(page.locator('.rr-title-record')).toBeHidden();
  await withAdvanced(page, () => page.getByRole('slider', { name: '单屏上限' }).fill('6'));
  await expect(page.locator('.rr-record:visible')).toHaveCount(6);
});

test('外部路由跳到窗口外的唱片时，恢复对应可见窗口', async ({ page }) => {
  await withAdvanced(page, () => page.getByLabel('菜单场景').selectOption('long'));
  const next = page.getByRole('button', { name: '后面的唱片' });
  for (let i = 0; i < 4 && await next.isEnabled(); i++) await next.click();
  await expect(page.getByRole('button', { name: '技术博客', exact: true })).toBeHidden();
  await withAdvanced(page, () => page.getByRole('button', { name: '外部切到开源项目' }).click());
  await expect(page.getByRole('button', { name: '技术博客', exact: true })).toBeVisible();
  await expect(page.locator('.rr-preview')).toHaveText('开源项目');
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：末张保持贴边且填满原尾部空间，不添加占位唱片`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('停靠位置').selectOption(placement);
    await page.waitForTimeout(350);
    const rackCount = await page.locator('.rr-record').count();
    const last = page.locator('[data-group="system"]');
    const before = await last.boundingBox();
    const sleeve = page.getByRole('button', { name: '关于本站', exact: true });
    await sleeve.focus(); await sleeve.press('Enter');
    await expect(page.getByTestId('active-page')).toHaveText('关于作者');
    await page.waitForTimeout(350);
    const after = await last.boundingBox();
    expect(after).toEqual(before);
    expect(await page.locator('.rr-record').count()).toBe(rackCount);
    await expect(page.locator('.rr-preview')).toBeVisible();
    expect(await page.locator('.rr-preview').evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
  });
}

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：文字沿自身直径排列，右侧及上下停靠滚轮反向`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('停靠位置').selectOption(placement);
    const sleeve = page.getByRole('button', { name: '文字随笔', exact: true });
    await sleeve.focus(); await sleeve.press('Enter');
    await page.waitForTimeout(350);
    expect(await page.locator('.rr-track:visible').evaluateAll(elements => elements.every(el => {
      const disc = el.parentElement!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const x = rect.x + rect.width / 2 - disc.x - disc.width / 2;
      const y = rect.y + rect.height / 2 - disc.y - disc.height / 2;
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      // Text baseline (a,b) must be parallel or antiparallel to the radial vector.
      return Math.abs(matrix.a * y - matrix.b * x) / Math.hypot(x, y) < .01;
    }))).toBe(true);
    if (placement === 'top') expect(await page.locator('.rr-preview').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).b)).toBeLessThan(-.99);
    await page.locator('.rr-preview').hover();
    await page.mouse.wheel(0, placement === 'left' ? 100 : -100);
    await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
    await page.mouse.wheel(0, placement === 'left' ? -100 : 100);
    await expect(page.getByTestId('active-page')).toHaveText('日常札记');
  });
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 560, height: 840 }]) {
  test(`博客演示 ${viewport.width}×${viewport.height}：主屏不滚动且常用设置完整可操作`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const placement of ['left', 'right', 'top', 'bottom']) {
      await page.getByLabel('停靠位置').selectOption(placement);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.controls').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      })).toBe(true);
      await page.getByRole('button', { name: '更多设置与演示' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: '关闭更多设置' }).press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByRole('button', { name: '更多设置与演示' })).toBeFocused();
    }
  });
}

test('更多设置在浮层内独立滚动，关闭后保留调整', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole('button', { name: '更多设置与演示' }).click();
  await page.getByLabel('标题唱片').fill('我的博客');
  await page.getByLabel('菜单场景').selectOption('long');
  await page.getByRole('button', { name: '卸载组件', exact: true }).scrollIntoViewIfNeeded();
  expect(await page.locator('.advanced-body').evaluate(el => el.scrollTop > 0 && el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.rr-title')).toHaveText('我的博客');
  await page.getByRole('button', { name: '更多设置与演示' }).click();
  await expect(page.getByLabel('菜单场景')).toHaveValue('long');
});

test('展开包装常显片单，其余只在悬停或键盘浏览时显示', async ({ page }) => {
  const summary = page.locator('[data-group="orders"] .rr-summary');
  await expect(summary).toBeHidden();
  const sleeve = page.getByRole('button', { name: '创作手记', exact: true });
  await sleeve.hover({ position: { x: 110, y: 22 } });
  await expect(summary).toBeVisible();
  await expect(page.locator('[data-group="content"] .rr-summary')).toBeVisible();
  await page.mouse.move(800, 700);
  await expect(summary).toBeHidden();
  await sleeve.focus();
  await sleeve.press('ArrowDown');
  await expect(page.locator('[data-group="operations"] .rr-summary')).toBeVisible();
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：面积足够的末张及前张常显，遮挡后恢复`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('停靠位置').selectOption(placement);
    await withAdvanced(page, () => page.getByRole('slider', { name: '退回距离', exact: true }).fill('0'));
    const tail = page.locator('[data-group="system"] .rr-summary');
    const previous = page.locator('[data-group="accounts"] .rr-summary');
    await expect(tail).toBeVisible();
    await expect(previous).toBeHidden();
    await page.getByRole('button', { name: '关于本站', exact: true }).press('Enter');
    await expect(previous).toBeVisible();
    await page.getByRole('button', { name: '文字随笔', exact: true }).press('Enter');
    await expect(previous).toBeHidden();
    await withAdvanced(page, () => page.getByRole('slider', { name: '退回距离', exact: true }).fill('108'));
    await expect(tail).toBeHidden();
  });
}
