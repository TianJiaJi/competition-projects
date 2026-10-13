import { test, expect, type Page } from '@playwright/test';
const second = (page: Page) => page.locator('.rr-disc[data-level="2"]');
const third = (page: Page) => page.locator('.rr-disc[data-level="3"]');
async function advanced(page: Page, action: () => Promise<unknown>) {
  await page.getByRole('button', { name: '更多设置与演示' }).click(); await action();
  await page.getByRole('button', { name: '关闭更多设置' }).click();
}
async function open(page: Page) { await page.getByRole('button', { name: '文字随笔', exact: true }).press('Enter'); await expect(page.getByTestId('active-page')).toHaveText('清晨散步'); }
async function choose(page: Page, index: number) {
  await second(page).locator('.rr-preview').press('Home');
  for (let n = 0; n < index; n++) await second(page).locator('.rr-preview').press('ArrowDown');
  await second(page).locator('.rr-preview').press('Enter');
}
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/record-rack.html'); });

test('一级打开进入三级首项，二级叶子保留子包装，父架组内不移动', async ({ page }) => {
  await open(page); await expect(third(page)).toHaveCount(1);
  await second(page).locator('.rr-preview').press('Tab');
  await expect(third(page).locator('.rr-preview')).toBeFocused();
  await third(page).locator('.rr-preview').press('Escape');
  await expect(second(page).locator('.rr-preview')).toBeFocused();
  await expect(page.locator('.rr-child .rr-summary')).toHaveCount(0);
  await page.waitForTimeout(350);
  const before = await page.locator('.rr-primary:visible').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
  await choose(page, 1);
  await expect(page.getByTestId('active-page')).toHaveText('阅读笔记');
  await expect(third(page)).toHaveCount(0); await expect(page.locator('.rr-child:visible').first()).toBeVisible();
  await choose(page, 2); await expect(page.getByTestId('active-page')).toHaveText('街巷之间');
  await page.waitForTimeout(350);
  expect(await page.locator('.rr-primary:visible').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()))).toEqual(before);
});

test('二级滚动途中保留旧盘，停稳只进入最终三级首项，两盘输入互不串扰', async ({ page }) => {
  await open(page);
  await second(page).dispatchEvent('pointerenter');
  for (const delta of [60, 60, 80]) await second(page).dispatchEvent('wheel', { deltaY: delta });
  await expect(third(page)).toHaveAttribute('aria-label', '日常札记三级菜单');
  await expect(page.getByTestId('active-page')).toHaveText('街巷之间');
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
  await third(page).dispatchEvent('wheel', { deltaY: 100 });
  await expect(page.getByTestId('active-page')).toHaveText('咖啡馆地图');
  await expect(second(page).locator('.rr-preview')).toHaveText('城市漫游');
  await expect(page.getByTestId('nav-event')).toHaveCount(3);
});

test('共用包装、单项和禁用片单、三级键盘返回', async ({ page }) => {
  await open(page);
  await choose(page, 2);
  await second(page).locator('.rr-preview').press('Tab');
  await expect(third(page).locator('.rr-preview')).toBeFocused();
  await third(page).locator('.rr-preview').press('ArrowDown');
  await third(page).locator('.rr-preview').press('Enter');
  await expect(page.getByTestId('active-page')).toHaveText('咖啡馆地图');
  await third(page).locator('.rr-preview').press('Escape');
  await expect(second(page).locator('.rr-preview')).toBeFocused();
  await choose(page, 3); await expect(page.getByTestId('active-page')).toHaveText('本月相册');
  await choose(page, 4); await expect(third(page).locator('.rr-empty')).toBeVisible();
  await expect(page.getByTestId('active-page')).toHaveText('本月相册');
  await choose(page, 5); await expect(page.getByTestId('active-page')).toHaveText('第 1 封旧信');
  await third(page).locator('.rr-preview').press('ArrowDown');
  await expect(third(page).locator('.rr-preview')).toHaveText('第 3 封旧信');
});

for (const placement of ['left', 'right', 'top', 'bottom']) for (const orientation of ['vertical', 'horizontal']) {
  test(`${placement}/${orientation}：三级盘面和选中标签在视口内可点击`, async ({ page }) => {
    await page.getByLabel('停靠位置').selectOption(placement); await page.getByLabel('排列方向').selectOption(orientation);
    await open(page); await page.waitForTimeout(400);
    expect(await third(page).locator('.rr-preview').evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
    await third(page).locator('.rr-preview').hover(); await page.mouse.wheel(0, placement === 'left' ? 100 : -100);
    await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
  });
}

test('外部三级路由同步到窗口外的包装，拒绝导航和删除取消临时浏览', async ({ page }) => {
  await advanced(page, () => page.getByRole('button', { name: '外部切到末封旧信' }).click());
  await expect(page.getByTestId('active-page')).toHaveText('第 16 封旧信');
  await expect(page.locator('.rr-child')).toHaveAttribute('data-parent-item', 'archive');
  await expect(third(page).locator('.rr-preview')).toHaveText('第 16 封旧信');
  await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
  await advanced(page, () => page.getByRole('checkbox').check());
  await choose(page, 0);
  await expect(page.getByTestId('active-page')).toHaveText('第 16 封旧信');
  await page.mouse.move(900, 700);
  await page.getByLabel('玻璃主题').focus();
  await expect(third(page).locator('.rr-preview')).toHaveText('第 16 封旧信');
  await advanced(page, () => page.getByRole('button', { name: '移除当前三级项' }).click());
  await expect(third(page)).toHaveCount(0);
  await expect(page.locator('[aria-current="page"]')).toHaveCount(0);
});

test('三级待提交滚动在父项切换和卸载后取消', async ({ page }) => {
  await open(page);
  await third(page).dispatchEvent('wheel', { deltaY: 100 });
  await choose(page, 1);
  await page.waitForTimeout(700);
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
  await choose(page, 2);
  await third(page).dispatchEvent('wheel', { deltaY: 100 });
  await advanced(page, () => page.getByRole('button', { name: '卸载组件' }).click());
  await page.waitForTimeout(700);
  await expect(page.getByTestId('nav-event')).toHaveCount(3);
});

test('真实鼠标从二级盘进入三级包装和盘面不误收起', async ({ page }) => {
  await open(page);
  await second(page).locator('.rr-preview').hover();
  await third(page).locator('.rr-preview').hover();
  await page.waitForTimeout(300);
  await expect(third(page)).toBeVisible();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：窄窗口两层选中项可用，子层不额外占用父架排列高度`, async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 840 });
    await page.getByLabel('停靠位置').selectOption(placement);
    await open(page); await page.waitForTimeout(400);
    for (const disc of [second(page), third(page)]) {
      expect(await disc.locator('.rr-preview').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    if (placement === 'left' || placement === 'right') {
      const parentBox = await page.locator('.rr-primary.rr-open').boundingBox();
      const childBox = await page.locator('.rr-child:visible').first().boundingBox();
      expect(childBox!.y - parentBox!.y).toBeCloseTo(12, 0);
    }
  });
}

test('切换一级组后键盘焦点进入新盘，减少动态效果和缩放手势仍可用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '技术博客', exact: true }).press('Enter');
  await expect(page.getByTestId('active-page')).toHaveText('Vue 实践');
  await expect(second(page).locator('.rr-preview')).toBeFocused();
  await second(page).locator('.rr-preview').press('Tab');
  await expect(third(page).locator('.rr-preview')).toBeFocused();
  await third(page).dispatchEvent('wheel', { deltaY: 100, ctrlKey: true });
  await page.waitForTimeout(250);
  await expect(page.getByTestId('nav-event')).toHaveCount(1);
  await third(page).dispatchEvent('wheel', { deltaY: 100 });
  await expect(page.getByTestId('active-page')).toHaveText('CSS 小实验');
});

test('只使用一个共用包装，折叠层级提示及抽盘占用紧凑', async ({ page }) => {
  await expect(page.locator('[data-group="operations"] .rr-hierarchy-hint')).toHaveCount(1);
  await open(page); await page.waitForTimeout(350);
  await expect(page.locator('.rr-child')).toHaveCount(1);
  await expect(page.locator('.rr-open .rr-hierarchy-hint')).toHaveCount(0);
  const origin = await page.locator('.rr-child').boundingBox();
  const parentDisc = await second(page).boundingBox();
  expect(parentDisc!.width / origin!.width).toBeCloseTo(.94, 2);
  expect((await third(page).boundingBox())!.width / origin!.width).toBeCloseTo(.94, 2);
  const yielding = await page.locator('.rr-child').evaluate(el => parseFloat((el as HTMLElement).style.getPropertyValue('--rr-yield-distance')));
  expect(parentDisc!.x - origin!.x).toBeCloseTo(origin!.width * .03 - yielding, 0);
  expect(origin!.y - parentDisc!.y).toBeCloseTo(12 - origin!.width * .03, 0);
  await choose(page, 2); await page.waitForTimeout(350);
  expect(await page.locator('.rr-child').boundingBox()).toEqual(origin);
  const disc = await third(page).boundingBox();
  expect(disc!.x + disc!.width - (origin!.x + origin!.width)).toBeCloseTo(origin!.width * .47, 0);
});

test('三级目录切换保留盘面节点，无下级时沿抽出路径收回', async ({ page }) => {
  await open(page); await page.waitForTimeout(350);
  const disc = await third(page).elementHandle();
  await choose(page, 2);
  expect(await disc!.evaluate(el => el.isConnected)).toBe(true);
  await expect(third(page)).toHaveAttribute('aria-label', '城市漫游三级菜单');
  expect(await third(page).evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  await choose(page, 1);
  await expect(page.locator('.rr-child-disc-leave-active')).toHaveCount(1);
  await expect(page.locator('.rr-child-disc-leave-active')).toHaveAttribute('inert', '');
  await expect(third(page)).toHaveCount(0);
  await choose(page, 0);
  await expect(third(page)).toBeVisible();
  await expect(third(page)).not.toHaveAttribute('inert', '');
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：打开时子层让路，跨层操作不追着指针移动`, async ({ page }) => {
    await page.getByLabel('停靠位置').selectOption(placement);
    await open(page); await page.waitForTimeout(350);
    const parentBefore = await second(page).boundingBox();
    const childBefore = await page.locator('.rr-child').boundingBox();
    expect(await page.locator('.rr-child').evaluate(el => parseFloat((el as HTMLElement).style.getPropertyValue('--rr-yield-distance')))).toBeGreaterThan(0);
    await second(page).locator('.rr-preview').press('Tab');
    await expect(third(page).locator('.rr-preview')).toBeFocused();
    await page.waitForTimeout(350);
    const childAfter = await page.locator('.rr-child').boundingBox();
    expect(await second(page).boundingBox()).toEqual(parentBefore);
    expect(childAfter).toEqual(childBefore);
    await third(page).locator('.rr-preview').press('Escape');
    await expect(second(page).locator('.rr-preview')).toBeFocused();
    await expect(page.locator('.rr-root')).toHaveClass(/rr-browsing-second/);
    await page.waitForTimeout(350);
    expect(await page.locator('.rr-child').boundingBox()).toEqual(childBefore);
    const track = second(page).locator('.rr-preview');
    expect(await track.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  });
}

test('轻滚停回原二级目录不重置已进入的三级页面', async ({ page }) => {
  await open(page);
  await third(page).locator('.rr-preview').press('ArrowDown');
  await third(page).locator('.rr-preview').press('Enter');
  await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
  await second(page).locator('.rr-preview').hover();
  await page.mouse.wheel(0, 14);
  await page.waitForTimeout(700);
  await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
  await expect(third(page).locator('.rr-preview')).toHaveText('周末慢生活');
  await expect(page.getByTestId('nav-event')).toHaveCount(2);
});

test('跨层取消半格预选并吸附，Shift Tab回二级且不提交旧滚动', async ({ page }) => {
  await open(page);
  await second(page).dispatchEvent('wheel', { deltaY: 140 });
  await page.waitForTimeout(80);
  await second(page).locator('.rr-preview').press('Tab');
  await expect(third(page).locator('.rr-preview')).toBeFocused();
  await third(page).locator('.rr-preview').press('Shift+Tab');
  await expect(second(page).locator('.rr-preview')).toBeFocused();
  const angle = await second(page).locator('.rr-preview').evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform); return Math.atan2(matrix.b, matrix.a);
  });
  expect(angle).toBeCloseTo(0, 4);
  await page.waitForTimeout(700);
  await expect(page.getByTestId('nav-event')).toHaveCount(1);
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：真实鼠标跨层后停在原坐标仍能滚动，预览文字可命中`, async ({ page }) => {
    await page.getByLabel('停靠位置').selectOption(placement);
    await open(page); await page.waitForTimeout(350);
    await second(page).locator('.rr-preview').hover();
    const secondary = await second(page).boundingBox();
    await third(page).locator('.rr-preview').hover();
    const child = await third(page).boundingBox();
    await page.waitForTimeout(400);
    expect(await third(page).boundingBox()).toEqual(child);
    expect(await second(page).boundingBox()).toEqual(secondary);
    await page.mouse.wheel(0, placement === 'left' ? 100 : -100);
    await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
    await second(page).locator('.rr-preview').hover();
    await page.mouse.wheel(0, placement === 'left' ? 200 : -200);
    await expect(page.getByTestId('active-page')).toHaveText('街巷之间');
    for (const track of await second(page).locator('.rr-track:visible').all()) {
      expect(await track.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    }
  });
}

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：三级展开后悬停其它包装，为包装片单让出空间`, async ({ page }) => {
    await page.getByLabel('停靠位置').selectOption(placement);
    await open(page); await page.waitForTimeout(350);
    const preview = page.getByRole('button', { name: '技术博客', exact: true });
    const following = page.getByRole('button', { name: '读者来信', exact: true });
    await preview.locator('.rr-label').hover();
    await page.waitForTimeout(350);
    await expect(preview.locator('.rr-summary')).toBeVisible();
    const after = await following.evaluate(el => el.parentElement!.getBoundingClientRect().toJSON());
    const previewBox = await preview.evaluate(el => el.parentElement!.getBoundingClientRect().toJSON());
    const along = placement === 'left' || placement === 'right' ? after!.y - previewBox!.y : after!.x - previewBox!.x;
    expect(along).toBeGreaterThan((await preview.evaluate(el => (el as HTMLElement).offsetWidth)) - 29);
    for (const row of await preview.locator('.rr-summary > span').all()) {
      expect(await row.evaluate(el => {
        const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el.closest('.rr-sleeve')!.contains(hit);
      })).toBe(true);
    }
    await page.getByRole('button', { name: '创作手记', exact: true }).locator('.rr-label').hover();
    await expect(page.getByRole('button', { name: '创作手记', exact: true }).locator('.rr-summary')).toBeVisible();
    await expect(page.getByTestId('active-page')).toHaveText('清晨散步');
    await expect(page.getByTestId('nav-event')).toHaveCount(1);
  });
}

test('恢复三级菜单之前的260ms曲线、探出回正及离开退回', async ({ page }) => {
  await open(page); await page.mouse.move(1400, 950); await page.getByLabel('玻璃主题').focus();
  await expect(page.locator('.rr-root')).toHaveClass(/rr-parked/);
  const preview = page.getByRole('button', { name: '技术博客', exact: true });
  const record = page.locator('[data-group="operations"]');
  const before = await record.boundingBox();
  await preview.locator('.rr-label').hover(); await page.waitForTimeout(350);
  const after = await record.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(140, 0);
  expect(await preview.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
  expect(await record.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0.26s, 0.26s');
  expect(await record.evaluate(el => getComputedStyle(el).transitionTimingFunction)).toBe('cubic-bezier(0.2, 0.8, 0.2, 1), cubic-bezier(0.2, 0.8, 0.2, 1)');
  await page.mouse.move(1400, 950); await page.waitForTimeout(600);
  expect((await record.boundingBox())!.x).toBeCloseTo(before!.x, 0);
  expect(await preview.evaluate(el => getComputedStyle(el).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
});

test('离开后三级盘保持抽出并叠回父层，减少正文占用，重入仍能操作', async ({ page }) => {
  await open(page); await page.waitForTimeout(350);
  const expanded = await third(page).boundingBox();
  await page.mouse.move(1400, 950); await page.getByLabel('玻璃主题').focus();
  await expect(page.locator('.rr-root')).toHaveClass(/rr-parked/);
  await page.waitForTimeout(350);
  const parked = await third(page).boundingBox();
  expect(expanded!.x - parked!.x).toBeGreaterThan(200);
  expect(parked!.x + parked!.width).toBeLessThan(290);
  const parent = await second(page).boundingBox();
  expect(Math.abs(parked!.x - parent!.x)).toBeGreaterThan(40);
  expect(Math.abs(parked!.x - parent!.x)).toBeLessThan(48);
  expect(await third(page).evaluate(el => getComputedStyle(el).translate)).toBe('0px');
  await page.getByRole('button', { name: '文字随笔', exact: true }).locator('.rr-label').hover();
  await third(page).locator('.rr-preview').hover();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
});

for (const placement of ['left', 'right', 'top', 'bottom']) {
  test(`${placement}：预览其它包装时非焦点三级层叠回，返回所属组再展开`, async ({ page }) => {
    await page.getByLabel('停靠位置').selectOption(placement);
    await open(page); await page.waitForTimeout(350);
    await page.getByRole('button', { name: '技术博客', exact: true }).locator('.rr-label').hover();
    await expect(page.locator('.rr-root')).not.toHaveClass(/rr-parked/);
    await expect(page.locator('.rr-child')).toHaveClass(/rr-stacked/);
    await page.waitForTimeout(350);
    const parent = await page.locator('.rr-primary.rr-open').boundingBox();
    const child = await page.locator('.rr-child').boundingBox();
    const dx = placement === 'left' ? 1 : placement === 'right' ? -1 : 0;
    const dy = placement === 'top' ? 1 : placement === 'bottom' ? -1 : 0;
    expect(child!.x - parent!.x).toBeCloseTo(dx * parent!.width * .18, 0);
    expect(child!.y - parent!.y).toBeCloseTo(dy * parent!.width * .18 + 12, 0);
    await expect(third(page)).toHaveCount(1);
    await expect(page.getByTestId('active-page')).toHaveText('清晨散步');
    await page.getByRole('button', { name: '文字随笔', exact: true }).locator('.rr-label').hover();
    await expect(page.locator('.rr-child')).not.toHaveClass(/rr-stacked/);
    await third(page).locator('.rr-preview').hover();
    await page.mouse.wheel(0, placement === 'left' ? 100 : -100);
    await expect(page.getByTestId('active-page')).toHaveText('周末慢生活');
  });
}
