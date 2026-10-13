import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page },testInfo) => {
  // Business flows use the supported static mode. Rotation is exercised in its
  // own tests; moving bubbles deliberately never become stationary targets.
  if(!/pivot fixed|animates water|projected markers/.test(testInfo.title))await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.install({ time: new Date("2026-09-11T04:00:00Z") });
});
test("renders the scene, heat overlay, hidden attraction labels and a responsive detail panel", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator(".scroll-presentation").first()).toHaveAttribute("data-intro-state","ready",{timeout:25000});
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("visitors")).not.toHaveText("—");
  await expect(
    page.getByRole("button", { name: "人流", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.locator(".pin-name").filter({ hasText: "望岳台" }),
  ).toHaveCount(0);
  const marker = page.getByRole("button", { name: /入口卫生间，/ });
  await expect(marker).toHaveCount(0);
  await page.getByRole("button",{name:"卫生间",exact:true}).click();
  await expect(marker).toBeVisible();
  const before = await marker.boundingBox();
  await page.getByRole("button", { name: "放大沙盘", exact: true }).click();
  await expect
    .poll(async () =>
      Math.abs(((await marker.boundingBox())?.x ?? 0) - (before?.x ?? 0)),
    )
    .toBeGreaterThan(2);
  await page.getByRole("button", { name: "看全景", exact: true }).click();
  await page.getByRole("button", { name: "人流", exact: true }).click();
  await expect(page.locator(".heat-legend")).toBeVisible();
  await page.getByRole("button", { name: "景点", exact: true }).click();
  await page.locator(".point-list").getByRole("button", { name: /望岳台.*拥堵/ }).click();
  await expect(
    page.getByRole("heading", { name: "望岳台", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".pin-name").filter({ hasText: "望岳台" }),
  ).toBeVisible();
  const target = page.locator(".map-pin.is-selected"),
    panel = page.locator(".detail-panel");
  await expect(target).toBeVisible();
  const t = await target.boundingBox(),
    p = await panel.boundingBox();
  expect(t && p && (t.x+t.width<p.x || p.x+p.width<t.x || t.y+t.height<p.y || p.y+p.height<t.y)).toBeTruthy();
  expect(p!.x).toBeGreaterThanOrEqual(0);
  expect(p!.x+p!.width).toBeLessThanOrEqual(1920);
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await expect(page.locator(".route-result")).toBeVisible();
  await page.getByLabel("路线起点").selectOption("forest");
  await expect(page.getByLabel("路线起点")).toHaveValue("forest");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.screenshot({ path: ".local/qa/heat.png" });
  expect(errors).toEqual([]);
});
test("provides walk and cable returns and prevents routing to a closed attraction", async ({
  page,
}) => {
  await page.goto("/?terminalId=terminal-summit");
  await expect(page.locator(".scroll-presentation").first()).toHaveAttribute("data-intro-state","ready",{timeout:25000});
  await page.getByRole("button", { name: "景点", exact: true }).click();
  await page.locator(".point-list").getByRole("button", { name: /望岳台.*拥堵/ }).click();
  await page
    .getByRole("button", { name: "返回出口商业区", exact: true })
    .click();
  await expect(page.getByLabel("路线起点")).toHaveValue("terminal-summit");
  await page.getByRole("button", { name: "索道返程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "索道返程", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".route-result")).toContainText("含索道");
  await page.screenshot({ path: ".local/qa/cable-route.png" });
  await page.getByRole("button", { name: "步行返程", exact: true }).click();
  await expect(page.locator(".route-result")).toContainText("沿开放步道");
  await page.getByRole("button", { name: "景点", exact: true }).click();
  await page
    .locator(".point-list")
    .getByRole("button", { name: /镜湖栈道.*未开放/ })
    .click();
  await expect(
    page.getByRole("button", { name: "查看路线", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".reason")).toContainText("养护");
});
test("idle countdown can be cancelled and resets all browsing state after two minutes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".scroll-presentation").first()).toHaveAttribute("data-intro-state","ready",{timeout:25000});
  await page.getByRole("button", { name: "人流", exact: true }).click();
  await page.getByRole("button", { name: "路线", exact: true }).click();
  await page
    .locator(".point-list")
    .getByRole("button", { name: /望岳台/ })
    .click();
  await page.getByLabel("路线起点").selectOption("forest");
  await page.clock.fastForward(111000);
  await expect(
    page.getByRole("button", { name: "继续查看", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续查看", exact: true }).click();
  await expect(page.locator(".idle-notice")).toHaveCount(0);
  await expect(page.locator(".detail-panel")).toBeVisible();
  await page.clock.fastForward(121000);
  await expect(page.locator(".detail-panel")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "人流", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "路线", exact: true }).click();
  await page
    .locator(".point-list")
    .getByRole("button", { name: /望岳台/ })
    .click();
  await expect(page.getByLabel("路线起点")).toHaveValue("terminal-entry");
});
test("supports 1920 and 1366 wide-screen layouts without horizontal overflow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
  await expect(page.locator(".scroll-presentation").first()).toHaveAttribute("data-intro-state","ready",{timeout:25000});
    await page.getByRole("button", { name: "设施", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "关闭详情", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".filter-row").getByRole("button", { name: "卫生间", exact: true }).click();
    await page
      .locator(".point-list")
      .getByRole("button", { name: /入口卫生间/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "入口卫生间", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-point-id="t1"]')).toBeVisible();
  }
  await page.screenshot({ path: ".local/qa/widescreen-1366.png" });
});

test('keeps the pivot fixed and rotates immediately in overview, pausing during gestures and point focus',async({page})=>{
  await page.goto('/');const canvas=page.locator('.scene-canvas');await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  const polar=await canvas.getAttribute('data-polar'),distance=await canvas.getAttribute('data-distance');
  const assertCenter=async()=>{const center=JSON.parse((await canvas.getAttribute('data-center'))!);expect(center.x).toBeCloseTo(960,2);expect(center.y).toBeCloseTo(540,2);};
  await assertCenter();await expect(canvas).toHaveAttribute('data-spinning','true');
  const angle=await canvas.getAttribute('data-azimuth');
  await page.mouse.move(1250,680);await page.mouse.down();await page.mouse.move(1450,780,{steps:8});await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute('data-spinning','false');
  await page.mouse.up();await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute('data-polar',polar!);await expect(canvas).not.toHaveAttribute('data-azimuth',angle!);
  await expect(canvas).toHaveAttribute('data-spinning','true');await assertCenter();
  await page.getByRole('button',{name:'景点',exact:true}).click();await expect(canvas).toHaveAttribute('data-spinning','true');
  await page.locator('[data-point-choice="summit"]').click();await page.clock.runFor(1300);
  await assertCenter();expect(Number(await canvas.getAttribute('data-distance'))).toBeLessThan(Number(distance));
  await expect(canvas).toHaveAttribute('data-spinning','false');
  await page.clock.fastForward(16000);await page.clock.runFor(100);await expect(canvas).toHaveAttribute('data-spinning','false');
  await page.getByRole('button',{name:'人流',exact:true}).click();await page.clock.runFor(1300);
  await expect(canvas).toHaveAttribute('data-spinning','true');await expect(canvas).toHaveAttribute('data-distance',distance!);
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await page.getByRole('button',{name:'游览',exact:true}).click();await page.keyboard.press('Shift');await expect(canvas).toHaveAttribute('data-spinning','true');
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(100);
  const water=await canvas.getAttribute('data-animation-time'),cable=await canvas.getAttribute('data-cable-time');
  await page.clock.fastForward(16000);await page.clock.runFor(200);
  await expect(canvas).toHaveAttribute('data-spinning','false');await expect(canvas).toHaveAttribute('data-animation-time',water!);await expect(canvas).toHaveAttribute('data-cable-time',cable!);
});

test('animates water and cable and stops the cable when service closes',async({page})=>{
  await page.goto('/');await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state','ready',{timeout:25000});const canvas=page.locator('.scene-canvas');
  await expect(canvas).toHaveAttribute('data-cable-running','true');
  // Freeze and read in one browser turn so live RAF cannot race the assertion.
  const {water,cable}=await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    const element=document.querySelector<HTMLElement>('.scene-canvas')!;
    return {water:element.dataset.animationTime!,cable:element.dataset.cableTime!};
  });
  await page.clock.runFor(200);
  await expect(canvas).toHaveAttribute('data-animation-time',water!);
  await expect(canvas).toHaveAttribute('data-cable-time',cable!);
  await page.evaluate(()=>{delete (document as unknown as Record<string,unknown>).hidden;});
  await page.clock.runFor(200);
  await expect(canvas).not.toHaveAttribute('data-animation-time',water!);
  await expect(canvas).not.toHaveAttribute('data-cable-time',cable!);
  await page.clock.fastForward(8*3600000);await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute('data-cable-running','false');
  const stopped=await canvas.getAttribute('data-cable-time');
  await page.clock.runFor(200);await expect(canvas).toHaveAttribute('data-cable-time',stopped!);
});

test('reuses the complete sandbox and point details in a bounded container without visitor styles',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  await page.evaluate(async(root)=>{
    const vueModule='/node_modules/.vite/deps/vue.js';
    const {createApp,h,ref}=await import(vueModule);
    const {ScenicMap}=await import(`${root}/packages/ui/src/scenic/index.ts`);
    const {sampleSnapshot}=await import(`${root}/packages/client/src/index.ts`);
    (document.querySelector('#app') as HTMLElement & {__vue_app__?:{unmount:()=>void}}).__vue_app__?.unmount();
    document.querySelectorAll('style[data-vite-dev-id]').forEach(el=>{if(/apps\/visitor\/src\/style.css|packages\/ui\/src\/theme.css/.test(el.getAttribute('data-vite-dev-id')??''))el.remove();});
    const host=document.createElement('div');host.id='shared-map-fixture';host.style.cssText='position:relative;margin:60px;width:900px;height:650px;background:#eaf3ef';document.body.append(host);
    const selected=ref(null as string|null);
    const app=createApp({setup:()=>()=>h(ScenicMap,{snapshot:sampleSnapshot(new Date('2026-09-11T04:00:00Z')),heat:false,selected:selected.value,route:null,onSelect:(id:string)=>selected.value=id,onClose:()=>selected.value=null})});
    app.mount(host);
    (window as unknown as {unmountShared:()=>void}).unmountShared=()=>app.unmount();
  },`/@fs${process.cwd()}`);
  const host=page.locator('#shared-map-fixture');
  await expect(host.locator('canvas')).toBeVisible();
  const canvas=host.locator('.scene-canvas');
  await expect(canvas).toHaveAttribute('data-center',/450/);
  const pin=host.getByRole('button',{name:/景区入口，/});
  await expect(pin).toHaveCSS('width','56px');
  await pin.click();
  await expect(host.getByRole('heading',{name:'景区入口',exact:true})).toBeVisible();
  await expect(host.getByRole('button',{name:'查看路线',exact:true})).toBeEnabled();
  const bubble=await host.locator('.scenic-bubble').boundingBox(),box=await host.boundingBox();
  expect(bubble!.x).toBeGreaterThanOrEqual(box!.x);expect(bubble!.x+bubble!.width).toBeLessThanOrEqual(box!.x+box!.width);
  await page.keyboard.press('Escape');
  await expect(host.locator('.scenic-bubble')).toHaveCount(0);await expect(pin).toBeFocused();
  await page.evaluate(()=>{document.querySelector<HTMLElement>('#shared-map-fixture')!.style.width='700px';});
  await expect.poll(async()=>JSON.parse((await canvas.getAttribute('data-center'))!).x).toBeCloseTo(350,1);
  await page.screenshot({path:'.local/qa/shared-map-embedded.png'});
  await page.evaluate(()=>(window as unknown as {unmountShared:()=>void}).unmountShared());
  await expect(host.locator('canvas')).toHaveCount(0);
});

test('moves projected markers on every rendered rotation frame',async({page})=>{
  await page.goto('/');await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  const canvas=page.locator('.scene-canvas'),pin=page.getByRole('button',{name:/景区入口，/});
  await page.clock.fastForward(18000);await page.clock.runFor(200);
  await expect(canvas).toHaveAttribute('data-spinning','true');
  let previous=await pin.getAttribute('style'),updates=0;
  for(let frame=0;frame<10;frame++){
    await page.clock.runFor(17);
    const current=await pin.getAttribute('style');if(current!==previous)updates++;
    previous=current;
  }
  // A 50 ms marker throttle used to move only 3–4 times while the canvas moved 10.
  expect(updates).toBeGreaterThanOrEqual(9);
});

test('switches exclusive map layers with primary active buttons and one persistent location capsule',async({page})=>{
  await page.goto('/?terminalId=terminal-bamboo');
  await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  const capsule=page.locator('.is-current-terminal');
  await expect(capsule).toHaveAttribute('data-point-id','terminal-bamboo');
  await expect(capsule).toHaveText('我在这里');
  expect(await capsule.locator('.pin-name').count()).toBe(0);
  const disc=await capsule.locator('.pin-disc').boundingBox(),label=await capsule.locator('.current-terminal-label').boundingBox();
  expect(label!.x).toBeGreaterThan(disc!.x+disc!.width);expect(Math.abs(label!.y+label!.height/2-disc!.y-disc!.height/2)).toBeLessThan(3);
  await expect(page.locator('.map-pin[data-kind="terminal"]')).toHaveCount(4);
  await expect(page.locator('.map-pin[data-kind="safety"],.map-pin[data-kind="toilet"]')).toHaveCount(0);
  const canvas=page.locator('.scene-canvas');
  const camera=await canvas.evaluate(el=>[el.getAttribute('data-center'),el.getAttribute('data-distance'),el.getAttribute('data-azimuth')]);
  await page.getByRole('button',{name:'景点',exact:true}).click();
  await expect(page.getByRole('button',{name:'景点',exact:true})).toHaveClass(/liquid-glass-button--primary/);
  const panel=await page.locator('.detail-panel').boundingBox(),metrics=await page.locator('.metrics').boundingBox();
  expect(panel!.y).toBeGreaterThan(metrics!.y+metrics!.height);
  await page.getByRole('button',{name:'人流',exact:true}).click();
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await expect(page.locator('.region-count')).toHaveCount(9);
  await expect(page.locator('[data-region-id="Z4"]')).toContainText('约 1,268 人');
  await expect(page.locator('[data-region-id="Z5"]')).toContainText('未开放');
  await expect(page.getByRole('button',{name:'人流',exact:true})).toHaveClass(/liquid-glass-button--primary/);
  await page.getByRole('button',{name:'卫生间',exact:true}).click();
  await expect(page.locator('.region-count')).toHaveCount(0);
  await expect(page.locator('.map-pin[data-kind="toilet"]')).toHaveCount(6);
  await expect(canvas).toHaveAttribute('data-context-muted','true');
  expect(JSON.parse((await canvas.getAttribute('data-facility-colors'))!).t3).toBe('#616d6a');
  await expect(page.locator('.map-pin')).toHaveCount(7);
  await expect(page.getByRole('button',{name:'人流',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'安全',exact:true}).click();
  await expect(page.locator('.map-pin[data-kind="safety"]')).toHaveCount(15);
  await expect(canvas).toHaveAttribute('data-context-muted','true');
  expect(JSON.parse((await canvas.getAttribute('data-facility-colors'))!)['fire-bamboo']).toBe('#b33f36');
  await expect(page.locator('[data-point-id="fire-bamboo"]')).toHaveClass(/busy/);
  await expect(page.locator('[data-point-id="aed-entry"]')).toHaveClass(/quiet/);
  await page.locator('[data-point-id="fire-bamboo"]').click();
  await expect(page.locator('.detail-panel')).toContainText('不可用');
  await expect(page.getByRole('button',{name:'到这里',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();
  await page.locator('[data-point-id="aed-entry"]').click();
  await page.getByRole('button',{name:'到这里',exact:true}).click();
  await expect(page.getByLabel('路线起点')).toHaveValue('terminal-bamboo');
  await page.getByRole('button',{name:'安全',exact:true}).click();
  await expect(page.getByRole('button',{name:'安全',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.detail-panel')).toBeVisible();
  await page.getByRole('button',{name:'游览',exact:true}).click();
  await expect(page.locator('.map-pin[data-kind="terminal"]')).toHaveCount(4);
  await expect(page.locator('.map-pin[data-kind="safety"]')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-context-muted','false');
  await expect(page.getByRole('button',{name:'游览',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await canvas.evaluate(el=>[el.getAttribute('data-center'),el.getAttribute('data-distance'),el.getAttribute('data-azimuth')])).toEqual(camera);
});

test('keeps device location independent of manual route origins and validates terminal URLs',async({page})=>{
  await page.goto('/?terminalId=terminal-market');
  await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  const route=async()=>{await page.getByRole('button',{name:'路线',exact:true}).click();await page.locator('.point-list').getByRole('button',{name:/望岳台/}).click();};
  await route();await expect(page.getByLabel('路线起点')).toHaveValue('terminal-market');
  await page.getByLabel('路线起点').selectOption('forest');
  await expect(page.locator('.is-current-terminal')).toHaveAttribute('data-point-id','terminal-market');
  await route();await expect(page.getByLabel('路线起点')).toHaveValue('terminal-market');
  await page.getByLabel('路线起点').selectOption('forest');
  await page.clock.fastForward(121000);await expect(page.locator('.detail-panel')).toHaveCount(0);
  await route();await expect(page.getByLabel('路线起点')).toHaveValue('terminal-market');
  await page.goto('/?terminalId=invalid');
  await expect(page.locator('.scroll-presentation').first()).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  await expect(page.getByRole('status')).toContainText('终端编号无效，已使用入口终端');
  await expect(page.locator('.is-current-terminal')).toHaveAttribute('data-point-id','terminal-entry');
});

test('shows zero and unknown counts distinctly and unknown safety remains grey without navigation',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(root)=>{
    const vue='/node_modules/.vite/deps/vue.js';const {createApp,h,ref}=await import(vue);
    const {ScenicMap}=await import(`${root}/packages/ui/src/scenic/index.ts`);
    const {sampleSnapshot}=await import(`${root}/packages/client/src/index.ts`);
    const sample=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
    sample.regions.Z4.count=0;sample.regions.Z1.count=null;delete sample.points['aed-entry'];
    (document.querySelector('#app') as HTMLElement & {__vue_app__?:{unmount:()=>void}}).__vue_app__?.unmount();
    const host=document.createElement('div');host.id='status-fixture';host.style.cssText='position:relative;width:100vw;height:100vh;';document.body.append(host);
    const view=ref('crowd'),selected=ref(null as string|null);
    createApp({setup:()=>()=>h(ScenicMap,{snapshot:sample,viewMode:view.value,currentTerminalId:'terminal-entry',selected:selected.value,route:null,onSelect:(id:string)=>selected.value=id})}).mount(host);
    Object.assign(window,{fixtureSafety:()=>view.value='safety'});
  },`/@fs${process.cwd()}`);
  await expect(page.locator('#status-fixture [data-region-id="Z4"]')).toContainText('约 0 人');
  await expect(page.locator('#status-fixture [data-region-id="Z1"]')).toContainText('人数未知');
  await page.evaluate(()=>(window as unknown as {fixtureSafety:()=>void}).fixtureSafety());
  const pin=page.locator('#status-fixture [data-point-id="aed-entry"]');
  await expect(pin).toHaveClass(/unknown/);await expect(pin).toHaveAttribute('aria-label',/状态未知/);
  await pin.click();await expect(page.getByRole('button',{name:'到这里',exact:true})).toBeDisabled();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-context-muted','true');
  expect(JSON.parse((await page.locator('.scene-canvas').getAttribute('data-facility-colors'))!)['aed-entry']).toBe('#616d6a');
});
