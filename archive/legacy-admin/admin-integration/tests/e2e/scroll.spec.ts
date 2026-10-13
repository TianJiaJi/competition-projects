import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-09-11T04:00:00Z')});});

test('opens in a wide shot, locks input, approaches the saved framing and immediately rotates',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?alwaysOpen=1');
  const scene=page.locator('.scene-canvas'),presentation=page.locator('.scroll-presentation');
  await expect(scene).toHaveAttribute('data-intro-state',/loading|opening/);
  await expect(page.locator('.visitor-interface')).toHaveAttribute('inert','');
  await expect(scene).toHaveAttribute('data-distance',/157\./);
  const angle=await scene.getAttribute('data-azimuth');
  await page.mouse.move(800,550);await page.mouse.down();await page.mouse.move(1150,650,{steps:3});await page.mouse.up();await page.mouse.wheel(0,-250);await page.keyboard.press('Tab');
  await expect(scene).toHaveAttribute('data-azimuth',angle!);
  await expect(page.locator('.map-pin')).toHaveCount(0);
  await expect(presentation).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  await expect(page.locator('.visitor-interface')).not.toHaveAttribute('inert');
  await expect(scene).toHaveAttribute('data-distance','106.482');
  await expect(scene).toHaveAttribute('data-island-y','0.000');
  await expect(scene).toHaveAttribute('data-spinning','true');
  const before=Number(await scene.getAttribute('data-azimuth'));
  await page.clock.runFor(500);
  expect(Number(await scene.getAttribute('data-azimuth'))).toBeGreaterThan(before);
  await expect(scene).toHaveAttribute('data-scroll-layer','background');
  const scrollCamera=await scene.getAttribute('data-scroll-camera');
  await page.clock.runFor(200);await expect(scene).toHaveAttribute('data-scroll-camera',scrollCamera!);
  // Auto-rotation turns the floating model, while the base and shared camera keep their heading.
  const heading=await scene.getAttribute('data-scroll-azimuth');
  const cameraHeading=await scene.getAttribute('data-camera-azimuth'),island=await scene.getAttribute('data-island-transform');
  await page.clock.runFor(500);await expect(scene).toHaveAttribute('data-scroll-azimuth',heading!);
  await expect(scene).toHaveAttribute('data-camera-azimuth',cameraHeading!);
  await expect(scene).not.toHaveAttribute('data-island-transform',island!);
  await page.getByRole('button',{name:'人流',exact:true}).click();
  await expect(scene).toHaveAttribute('data-spinning','true');
  await page.clock.fastForward(121000);await page.clock.runFor(100);
  await expect(presentation).toHaveAttribute('data-intro-state','ready');
  await expect(page.getByRole('button',{name:'人流',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(scene).toHaveAttribute('data-intro-time','6.000');
  await page.reload();await expect(presentation).toHaveAttribute('data-intro-state',/loading|opening/);
  expect(errors).toEqual([]);
});

test('holds a slow preparation before opening and starts only after GPU warmup',async({page})=>{
  await page.route('**/packages/scenic/src/scene.ts*',async route=>{
    const response=await route.fetch();const code=await response.text();
    await route.fulfill({response,body:code.replace('renderer.compileAsync(scene, camera)','Promise.all([new Promise(resolve => { window.__releaseScenicCompile = resolve; }), renderer.compileAsync(scene, camera)])')});
  });
  await page.goto('/');const scene=page.locator('.scene-canvas');
  await expect(scene).toHaveAttribute('data-intro-state',/loading|opening/);
  const time=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});return document.querySelector<HTMLElement>('.scene-canvas')!.dataset.introTime;});
  await page.clock.runFor(800);await expect(scene).toHaveAttribute('data-intro-time',time!);
  await page.evaluate(()=>{delete (document as unknown as Record<string,unknown>).hidden;});
  await page.clock.runFor(3200);
  await expect(scene).toHaveAttribute('data-intro-state','loading');
  await expect(page.getByRole('progressbar',{name:'景区加载进度'})).toBeVisible();
  const progress=Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));expect(progress).toBeGreaterThanOrEqual(0);expect(progress).toBeLessThan(100);
  await expect(page.locator('.ink-path')).toHaveCount(2);
  await expect(page.locator('.scenic-loading-screen')).toHaveCSS('position','fixed');
  await expect(page.locator('.scenic-loading-screen h2')).toHaveText('青岚山境');
  expect((await page.getByRole('progressbar').boundingBox())!.width).toBeGreaterThan(1880);
  await page.screenshot({path:'.local/qa/ink-loading.png'});
  await expect(scene).toHaveAttribute('data-intro-time','0.000');
  await expect(page.locator('.map-pin')).toHaveCount(0);
  // Release the GPU gate explicitly, independent of screenshot or machine timing.
  await expect.poll(()=>page.evaluate(()=>typeof (window as unknown as {__releaseScenicCompile?:()=>void}).__releaseScenicCompile)).toBe('function');
  await page.evaluate(()=>(window as unknown as {__releaseScenicCompile:()=>void}).__releaseScenicCompile());
  await expect(scene).toHaveAttribute('data-intro-state','ready',{timeout:25000});
  await expect(scene).toHaveAttribute('data-prepared','true');
});

test('reduced motion shows the final static composition and context failure restores list queries',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const scene=page.locator('.scene-canvas');
  await expect(scene).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  await expect(scene).toHaveAttribute('data-distance','106.482');
  await expect(scene).toHaveAttribute('data-paper-time','0.000');
  await page.clock.runFor(400);await expect(scene).toHaveAttribute('data-paper-time','0.000');await expect(scene).toHaveAttribute('data-spinning','false');
  await page.evaluate(()=>{const canvas=document.querySelector<HTMLCanvasElement>('.scene-canvas canvas')!;canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();});
  await expect(page.getByRole('alert')).toContainText('三维画面暂不可用');
  await expect(scene).toHaveAttribute('data-intro-state','failed');
  await page.getByRole('button',{name:'景点',exact:true}).click();
  await expect(page.locator('.point-list')).toBeVisible();
});

test('reuses a standalone SVG guide map with the same point and road identifiers',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const info=await page.evaluate(async(root)=>{
    const vueModule='/node_modules/.vite/deps/vue.js';
    const {createApp,h}=await import(vueModule);
    const {ScenicSvgMap,createScenicSvg,scenicSvgPoint}=await import(`${root}/packages/ui/src/scenic-svg/index.ts`);
    const {points,edges}=await import(`${root}/packages/scenic/src/data.ts`);
    (document.querySelector('#app') as HTMLElement & {__vue_app__?:{unmount:()=>void}}).__vue_app__?.unmount();
    const host=document.createElement('div');host.id='svg-map-fixture';host.style.cssText='position:absolute;inset:0;background:#f2eddc;padding:30px';document.body.append(host);
    createApp({render:()=>h(ScenicSvgMap)}).mount(host);
    const documentSvg=new DOMParser().parseFromString(createScenicSvg(),'image/svg+xml');
    return {parseErrors:documentSvg.querySelectorAll('parsererror').length,points:points.length,roads:edges.length,unknown:scenicSvgPoint('no-such-point')};
  },`/@fs${process.cwd()}`);
  expect(info.parseErrors).toBe(0);expect(info.unknown).toBeUndefined();
  await expect(page.locator('#svg-map-fixture [data-point-id]')).toHaveCount(info.points);
  expect(await page.locator('#svg-map-fixture [data-edge-id]').evaluateAll(els=>new Set(els.map(el=>el.getAttribute('data-edge-id'))).size)).toBe(info.roads);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('img',{name:'青岚山境景区导览地图'})).toBeVisible();
  await page.screenshot({path:'.local/qa/scenic-svg-map.png'});
});
