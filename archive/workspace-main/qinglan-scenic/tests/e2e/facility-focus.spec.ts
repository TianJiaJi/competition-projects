import {installVisitorFixture} from '../fixtures/visitor-http';
import {test,expect} from '@playwright/test';
test.beforeEach(async ({page}) => { await installVisitorFixture(page); });

test('flies facilities to the screen center, keeps one card leader and restores the overview',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-11T04:00:00Z')});
  await page.goto('/');
  const canvas=page.locator('.scene-canvas');
  await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  await page.getByRole('button',{name:'卫生间',exact:true}).click();
  const before=Number(await canvas.getAttribute('data-distance'));
  const savedTarget=await canvas.getAttribute('data-target');
  // Capture the saved pose and selection in a single turn, avoiding a rotating hit target.
  await page.locator('[data-point-id="t1"]').evaluate((el:HTMLElement)=>el.click());
  await expect(canvas).toHaveAttribute('data-camera-motion','flying');
  await page.clock.runFor(300);
  const middle=Number(await canvas.getAttribute('data-distance'));expect(middle).toBeLessThan(before);expect(middle).toBeGreaterThan(before*.48);
  await page.clock.runFor(1200);
  await expect(canvas).toHaveAttribute('data-camera-motion','focused');
  await expect(canvas).toHaveAttribute('data-focused-point','t1');
  await expect(page.locator('.card-leaders line')).toHaveCount(1);
  await expect(page.locator('.point-card-leader line')).toHaveCount(1);
  const pin=await page.locator('[data-point-id="t1"]').boundingBox();
  expect(pin!.x+pin!.width/2).toBeCloseTo(960,0);expect(pin!.y+pin!.height/2).toBeCloseTo(540,0);
  const line=page.locator('.point-card-leader line'),card=await page.locator('.detail-panel').boundingBox();
  expect(Number(await line.getAttribute('x2'))).toBeCloseTo(card!.x,0);
  expect(Number(await line.getAttribute('y2'))).toBe(540);
  await page.clock.fastForward(20000);await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute('data-spinning','false');
  // Selecting another facility during focus retargets from the current camera.
  await page.getByRole('button',{name:'设施',exact:true}).click();
  await expect(page.locator('.nav-card-leader line')).toHaveCount(1);
  await page.locator('.filter-row').getByRole('button',{name:'卫生间',exact:true}).click();
  await page.locator('.point-list').getByRole('button',{name:/山顶卫生间/}).click();
  await page.clock.runFor(1300);await expect(canvas).toHaveAttribute('data-focused-point','t4');
  const summit=await page.locator('[data-point-id="t4"]').boundingBox();expect(summit!.x+summit!.width/2).toBeCloseTo(960,0);
  await page.screenshot({path:'.local/qa/facility-camera-focused.png'});
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();
  await page.clock.runFor(1300);await expect(canvas).toHaveAttribute('data-camera-motion','overview');
  await expect(page.locator('.card-leaders')).toHaveCount(0);
  expect(Number(await canvas.getAttribute('data-distance'))).toBeCloseTo(before,1);
  expect(await canvas.getAttribute('data-target')).toBe(savedTarget);
  expect((await page.getByRole('button',{name:'放大沙盘',exact:true}).boundingBox())!.x).toBeLessThan(100);
  expect(errors).toEqual([]);
});

test('links all three bottom navigation buttons, supports reduced motion and reloads into browsing',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?terminalId=terminal-summit');
  const canvas=page.locator('.scene-canvas');await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  for(const name of ['景点','设施','路线']){
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('.card-leaders line')).toHaveCount(1);
    await expect(page.locator('.nav-card-leader line')).toHaveCount(1);
  }
  await page.getByRole('button',{name:'卫生间',exact:true}).click();
  await page.locator('[data-point-id="t1"]').click();
  await expect(canvas).toHaveAttribute('data-camera-motion','focused');
  await expect(page.getByTestId('stalls-total')).toContainText('46');
  await expect(page.getByTestId('stalls-available')).not.toContainText('暂无数据');
  await expect(page.getByTestId('male-total')).toHaveText('8个');
  await expect(page.getByTestId('female-total')).toHaveText('24个');
  await page.screenshot({path:'.local/qa/restroom-genders.png'});
  await page.reload();await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  await expect(page.getByRole('button',{name:'游览',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'卫生间',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await expect(page.locator('.is-current-terminal')).toHaveAttribute('data-point-id','terminal-summit');
});

for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  test(`centers every attraction and facility, with one fixed card anchor and all three exits at ${viewport.width}`,async({page})=>{
    test.slow(); // This case visits all 41 points and verifies each camera/connector transition.
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/');
    const canvas=page.locator('.scene-canvas');await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
    // Exercise every point after rotating the floating island, not only its initial pose.
    await page.mouse.move(viewport.width*.4,viewport.height*.5);await page.mouse.down();await page.mouse.move(viewport.width*.55,viewport.height*.5,{steps:8});await page.mouse.up();
    const overview=await canvas.evaluate(el=>[el.getAttribute('data-target'),el.getAttribute('data-distance'),el.getAttribute('data-azimuth')]);
    let index=0;
    for(const section of ['景点','设施']){
      await page.getByRole('button',{name:section,exact:true}).click();
      const ids=await page.locator('[data-point-choice]').evaluateAll(els=>els.map(el=>el.getAttribute('data-point-choice')!));
      for(const id of ids){
        await page.getByRole('button',{name:section,exact:true}).click();
        const navLine=page.locator('.nav-card-leader line');await expect(navLine).toHaveCount(1);
        expect(Number(await navLine.getAttribute('y2'))).toBe(viewport.height/2);
        await page.locator(`[data-point-choice="${id}"]`).click();
        await expect(canvas).toHaveAttribute('data-focused-point',id);
        await expect(canvas).toHaveAttribute('data-camera-motion','focused');
        const marker=page.locator(`[data-point-id="${id}"]`),disc=await marker.locator('.pin-disc').boundingBox();
        expect(disc!.x+disc!.width/2,id).toBeCloseTo(viewport.width/2,0);
        expect(disc!.y+disc!.height/2,id).toBeCloseTo(viewport.height/2,0);
        await expect(page.locator('.card-leaders line')).toHaveCount(1);
        await expect(page.locator('.nav-card-leader')).toHaveCount(0);
        const line=page.locator('.point-card-leader line'),card=await page.locator('.detail-panel').boundingBox();
        const info=await page.locator('.top-information').boundingBox();
        expect(card!.y-info!.y-info!.height).toBeGreaterThanOrEqual(15.5);
        expect(Number(await line.getAttribute('y2'))).toBe(viewport.height/2);
        expect(Number(await line.getAttribute('x2'))).toBeCloseTo(card!.x,0);
        expect(card!.y+card!.height).toBeGreaterThan(viewport.height/2);
        if(index===0)await page.screenshot({path:`.local/qa/point-centered-${viewport.width}.png`});
        if(index%3===0)await marker.click();
        // Low facilities can put another model in this corner after rotation.
        else if(index%3===1&&section==='景点')await page.mouse.click(3,3);
        else await page.getByRole('button',{name:'关闭详情',exact:true}).click();
        await expect(page.locator('.detail-panel')).toHaveCount(0);
        await expect(canvas).toHaveAttribute('data-camera-motion','overview');
        expect(await canvas.evaluate(el=>[el.getAttribute('data-target'),el.getAttribute('data-distance'),el.getAttribute('data-azimuth')]),id).toEqual(overview);
        index++;
      }
    }
  });
}

test('animates repeated zoom presses and restores the camera even after manually orbiting a focused point',async({page})=>{
  await page.clock.install({time:new Date('2026-09-11T04:00:00Z')});
  await page.goto('/');
  const canvas=page.locator('.scene-canvas');await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  const initial=Number(await canvas.getAttribute('data-distance'));
  await page.getByRole('button',{name:'放大沙盘',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-camera-motion','flying');
  await page.clock.runFor(300);
  const middle=Number(await canvas.getAttribute('data-distance'));expect(middle).toBeLessThan(initial);expect(middle).toBeGreaterThan(initial*.85);
  await page.getByRole('button',{name:'放大沙盘',exact:true}).click();
  await page.clock.runFor(1300);expect(Number(await canvas.getAttribute('data-distance'))).toBeCloseTo(initial*.85*.85,1);
  await page.getByRole('button',{name:'缩小沙盘',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-camera-motion','flying');await page.clock.runFor(1300);
  const saved=await canvas.evaluate(el=>[el.getAttribute('data-target'),el.getAttribute('data-distance'),el.getAttribute('data-azimuth')]);
  await page.getByRole('button',{name:'景点',exact:true}).click();await page.locator('[data-point-choice="summit"]').click();await page.clock.runFor(1300);
  await page.mouse.move(850,620);await page.mouse.down();await page.mouse.move(1150,620,{steps:10});await page.mouse.up();
  await expect(page.locator('.detail-panel')).toBeVisible();
  expect(await canvas.getAttribute('data-azimuth')).not.toBe(saved[2]);
  await page.getByRole('button',{name:'放大沙盘',exact:true}).click();await page.clock.runFor(1300);
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.clock.runFor(1300);
  expect(await canvas.evaluate(el=>[el.getAttribute('data-target'),el.getAttribute('data-distance')])).toEqual(saved.slice(0,2));
  expect(Number(await canvas.getAttribute('data-azimuth'))).toBeCloseTo(Number(saved[2]),1);
  await expect(canvas).toHaveAttribute('data-spinning','true');
});
