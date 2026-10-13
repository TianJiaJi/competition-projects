import { test, expect } from "@playwright/test";
import {buildSnapshot, type ScenarioId} from '../fixtures/ops';
// Fixtures enter through HTTP interception only; the shipped app has no sample mode.
let scenario: ScenarioId = 'alerts';
let notify: () => void;
test.beforeEach(async ({page}) => {
  scenario = 'alerts';
  await page.routeWebSocket('**/ws?*', socket => {notify = () => socket.send(JSON.stringify({type:'invalidate',runId:'ops-ui-test'}));});
  await page.route('**/api/v1/**', route => {
    const snapshot = buildSnapshot(scenario);
    const run = {id:'ops-ui-test', businessTime:snapshot.businessTime, scenario, mode:'replay', paused:true, speed:1};
    const data = route.request().url().endsWith('/runtime') ? {run} : {...snapshot, run, exitedToday:snapshot.checkedInToday-snapshot.public.visitors!};
    return route.fulfill({json:{data}});
  });
});
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
]) {
  test(`监控 ${viewport.width} 的数据、点位、筛选与气泡`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("in-park")).toHaveText("5,461");
    await expect(page.getByTestId("alert-count")).toHaveText("7");
    await expect(page.locator(".scene-canvas")).toHaveAttribute(
      "data-intro-state",
      "ready",
      { timeout: 60000 },
    );
    await expect(page.locator(".ops-screen")).toHaveAttribute("data-entry-state", "ready", {timeout:60000});
    await expect(page.locator(".map-pin")).toHaveCount(0);
    await expect(page.locator(".scene-canvas")).toHaveAttribute("data-region-label-count", "9");
    await expect(page.locator(".alert-marker")).toHaveCount(6);
    await expect(page.locator(".preview-toolbar")).toHaveCount(0);
    await expect(page.locator(".ring-total strong")).toHaveText("24");
    await expect(page.locator(".scenic-chart svg")).toHaveCount(4);
    expect(await page.locator("body").innerText()).not.toMatch(/暂无数据|—|MOCK|样例快照/);
    const originalCanvas = await page.locator('.scene-canvas canvas').boundingBox();
    await page.locator('[data-alert-id="A-231"]').click();
    await expect(page.getByRole("dialog")).toContainText("游客身体不适");
    const refreshed = page.waitForResponse('**/api/v1/screens/ops');
    notify();
    await refreshed;
    await expect(page.getByRole("dialog")).toContainText("游客身体不适");
    await expect(page.locator(".emergency-atmosphere")).toBeVisible();
    await expect(page.locator(".emergency-atmosphere")).toHaveCSS("pointer-events", "none");
    await expect(page.locator(".ops-region-label")).toHaveCount(0);
    await expect(page.locator(".region-leaders")).toHaveCount(0);
    await expect(page.locator('.ops-screen')).toHaveClass(/is-focused/);
    await expect(page.locator('.ops-screen')).toHaveClass(/feed-docked/);
    await expect(page.locator('.right-information')).toBeVisible();
    await expect(page.locator('.masthead')).toBeHidden();
    await page.waitForTimeout(650);
    const focusedCanvas = await page.locator('.scene-canvas canvas').boundingBox();
    expect(focusedCanvas!.width).toBe(viewport.width);
    expect(focusedCanvas!.height).toBe(viewport.height);
    const detail = await page.getByRole('dialog').boundingBox();
    expect(Math.abs(viewport.width-detail!.x-detail!.width-32)).toBeLessThan(2);
    expect(detail!.y).toBe(32);
    await expect(page.locator('.alert-marker:visible')).toHaveCount(1);
    await expect.poll(async()=>{const b=await page.locator('.alert-marker:visible').boundingBox();return Math.hypot(b!.x+b!.width/2-viewport.width/2,b!.y+b!.height/2-viewport.height/2);}).toBeLessThan(4);
    expect((await page.locator('.right-information').boundingBox())!.x).toBe(32);
    await expect(page.locator(".sibling-tabs button")).toHaveCount(2);
    await page.locator(".sibling-tabs button").nth(1).click();
    await expect(page.getByRole("dialog")).toContainText("音频模块异常");
    await expect(page.locator(".emergency-atmosphere")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".scene-canvas")).toHaveAttribute("data-region-label-count", "9");
    await page.getByLabel("告警级别").selectOption("critical");
    await expect(page.locator(".alert-row")).toHaveCount(1);
    await expect(page.locator(".alert-marker")).toHaveCount(1);
    await expect(page.getByTestId("alert-count")).toHaveText("7");
    await expect(page.locator(".ring-total strong")).toHaveText("24");
    await page.getByLabel("告警级别").selectOption("important");
    await expect(page.locator(".emergency-atmosphere")).toBeVisible();
    await page.getByLabel("告警级别").selectOption("");
    await page.getByLabel("暂停自转").click();
    const canvas = page.locator(".scene-canvas");
    await expect(canvas).toHaveAttribute("data-spinning", "false");
    await expect(canvas).toHaveAttribute("data-camera-motion", "overview");
    const before = await canvas.getAttribute("data-azimuth");
    await page.waitForTimeout(300);
    expect(await canvas.getAttribute("data-azimuth")).toBe(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
test("快照显示处置完成、高负载保留与复发", async ({ page }) => {
  await page.goto("/?preview=1");
  const select = {selectOption: async (value: ScenarioId) => {scenario = value; await page.reload();}};
  await select.selectOption("processing");
  await expect(page.locator('[data-alert-id="A-230"]')).toContainText("处理中");
  await select.selectOption("still-high");
  await expect(page.getByTestId("alert-count")).toHaveText("6");
  await expect(page.locator('[data-alert-id="A-230"]')).toHaveCount(0);
  await expect(
    page.locator('.alert-marker[data-anchor="region-Z4"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "历史", exact: true }).click();
  await page.locator('[data-alert-id="A-230"]').click();
  await expect(page.getByRole("dialog")).toContainText("已处理");
  await expect(page.getByRole("dialog")).toContainText("陈静");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "返回当前", exact: true }).click();
  await select.selectOption("recurrence");
  await expect(page.getByTestId("alert-count")).toHaveText("7");
  await page.locator('[data-alert-id="A-237"]').click();
  await expect(page.getByRole("dialog")).toContainText("关联上次事件：A-230");
  await page.keyboard.press("Escape");
  await select.selectOption("normal");
  await expect(page.getByTestId("alert-count")).toHaveText("0");
  await expect(page.getByText("当前无待处理事件")).toBeVisible();
  await expect(page.locator(".emergency-atmosphere")).toHaveCount(0);
});
test("无 WebGL 时仍保留完整图表和告警", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: any,
      ...args: any[]
    ) {
      if (String(type).includes("webgl")) return null;
      return original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByText("三维画面暂不可用")).toBeVisible();
  await expect(page.getByTestId("in-park")).toHaveText("5,461");
  await expect(page.locator(".scenic-chart svg")).toHaveCount(4);
  await page.locator('[data-alert-id="A-231"]').click();
  await expect(page.getByRole("dialog")).toContainText("游客身体不适");
});

test("减少动态效果时仍可查看区域与告警", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".scene-canvas")).toHaveAttribute(
    "data-intro-state",
    "ready",
    { timeout: 60000 },
  );
  await expect(page.locator(".scene-canvas")).toHaveAttribute(
    "data-spinning",
    "false",
  );
  await page.getByRole("button", { name: /定位山顶观景区/ }).click();
  await expect(page.locator(".region-focus-note")).toContainText("山顶观景区");
  await page.keyboard.press("Escape");
  await page.locator('[data-alert-id="A-231"]').click();
  await expect(page.getByRole("dialog")).toContainText("游客身体不适");
});

test("全局进度条等待所有模型准备完成，再错峰入场", async ({ page }) => {
  await page.route("**/packages/scenic/src/scene.ts*", async (route) => {
    const response = await route.fetch();
    const code = await response.text();
    await route.fulfill({
      response,
      body: code.replace(
        "renderer.compileAsync(scene, camera)",
        "Promise.all([new Promise(resolve => { window.__releaseOpsCompile = resolve; }), renderer.compileAsync(scene, camera)])",
      ),
    });
  });
  await page.goto("/");
  const progress = page.getByRole("progressbar", { name: "园方大屏加载进度" });
  await expect(progress).toBeVisible();
  expect((await progress.boundingBox())!.width).toBeGreaterThan(page.viewportSize()!.width * .97);
  await expect(page.locator(".global-loading")).toHaveCSS("position", "fixed");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __releaseOpsCompile?: () => void })
            .__releaseOpsCompile,
      ),
    )
    .toBe("function");
  expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(
    100,
  );
  await expect(page.locator(".scenic-chart svg")).toHaveCount(4);
  await expect(page.locator(".scene-canvas")).toHaveAttribute(
    "data-intro-state",
    "loading",
  );
  await page.evaluate(() =>
    (
      window as unknown as { __releaseOpsCompile: () => void }
    ).__releaseOpsCompile(),
  );
  await expect(page.locator(".ops-screen")).toHaveAttribute("data-entry-state", "entering", { timeout: 60000 });
  const entry = await page.locator(".map-area > .scroll-presentation").evaluate(el => {
    const animations=el.getAnimations();
    // Inspect the opening frame deterministically, independent of GPU/test scheduling.
    animations.forEach(animation=>{animation.pause();animation.currentTime=0;});
    const scene = getComputedStyle(el);
    const opacity=Number(scene.opacity);
    animations.forEach(animation=>animation.play());
    const panels = [...document.querySelectorAll(".metric,.info-panel,.environment-column,.map-legends,.map-controls")];
    return { delay: parseFloat(scene.animationDelay), opacity,
      lastPanel: Math.max(...panels.map(panel => { const s=getComputedStyle(panel); return parseFloat(s.animationDelay)+parseFloat(s.animationDuration); })) };
  });
  expect(entry.delay).toBeCloseTo(entry.lastPanel, 2);
  expect(entry.delay - entry.lastPanel).toBeLessThan(.02);
  expect(entry.opacity).toBe(0);
  await expect(page.locator(".ops-screen")).toHaveAttribute(
    "data-entry-state",
    "ready",
    { timeout: 60000 },
  );
  await expect(progress).toHaveCount(0);
  await expect(page.locator(".scene-canvas")).toHaveAttribute(
    "data-prepared",
    "true",
  );
  await expect(page.locator(".scene-canvas")).toHaveAttribute(
    "data-scroll-layer",
    "background",
  );
  await expect(page.locator(".environment-column")).toHaveCSS(
    "padding",
    "12px",
  );
  await expect(page.locator(".environment-column")).toHaveCSS(
    "--glass-tint-opacity",
    "0.09",
  );
  await expect(page.locator(".map-legends")).toHaveCSS(
    "--glass-tint-opacity",
    "0.09",
  );
  const environment = await page.locator(".environment-column").boundingBox(),
    legend = await page.locator(".map-legends").boundingBox();
  expect(environment!.x).toBeLessThan(960);
  expect(environment!.y + environment!.height).toBeLessThan(legend!.y);
});

test("preview 参数不能开启本地数据或主题切换", async ({ page }) => {
  await page.goto("/?preview=1");
  await expect(page.locator('.ops-screen')).toHaveAttribute('data-entry-state', 'ready', {timeout:60000});
  await expect(page.locator('.ops-screen')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('运行场景')).toHaveCount(0);
  await expect(page.getByLabel('预览主题')).toHaveCount(0);
  await expect(page.getByTestId('in-park')).toHaveText('5,461');
});

test("专注容器缩放在同一帧重绘沙盘，不暴露清空的画布", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".ops-screen")).toHaveAttribute("data-entry-state", "ready", { timeout: 60000 });
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".scene-canvas canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const result = { dirty: false, resizes: 0, blankFrames: 0 };
    Object.assign(window, { resizeProbe: result });
    for (const key of ["width", "height"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key)!;
      Object.defineProperty(canvas, key, {
        get() { return descriptor.get!.call(canvas); },
        set(value) {
          result.dirty = true;
          result.resizes++;
          descriptor.set!.call(canvas, value);
        },
        configurable: true,
      });
    }
    for (const key of ["drawElements", "drawArrays"] as const) {
      const draw = gl[key].bind(gl) as (...args: number[]) => void;
      Object.defineProperty(gl, key, { value: (...args: number[]) => {
        draw(...args);
        result.dirty = false;
      }, configurable: true });
    }
    new ResizeObserver(() => {
      if (result.dirty) result.blankFrames++;
    }).observe(canvas.parentElement!);
  });
  await page.locator('[data-alert-id="A-231"]').click();
  await expect(page.locator(".ops-screen")).toHaveClass(/focus-expanded/);
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const result = await page.evaluate(() => (window as unknown as { resizeProbe: { resizes: number; blankFrames: number } }).resizeProbe);
  expect(result.resizes).toBeGreaterThan(4);
  expect(result.blankFrames).toBe(0);
});
