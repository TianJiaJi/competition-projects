import {it,expect,vi} from 'vitest';
import {testStore} from '../helpers/postgres';
import {createPlatform} from '../../apps/server/src/platform/service';

it('继续后五档倍速按真实时差推进，暂停和恢复保持进度',async()=>{
 const fixture=await testStore(),platform=createPlatform(fixture.store);
 const clock=vi.spyOn(Date,'now');let now=Date.now();clock.mockImplementation(()=>now);
 try{
  const r=await platform.run(),admin=(await fixture.store.login('admin01','123456')).user;
  for(const speed of [1,5,30,60,180]){
   await platform.write(admin,r.id,'clock-speed-'+speed,'/demo/clock',{speed,paused:false});
   const before=await platform.run(r.id);
   now+=60000/speed;await platform.tick();
   const after=await platform.run(r.id);
   expect(Date.parse(after.businessTime)-Date.parse(before.businessTime)).toBe(60000);
   expect(after.revision).toBeGreaterThan(before.revision);
   await platform.write(admin,r.id,'clock-pause-'+speed,'/demo/clock',{paused:true});
   now+=60000;await platform.tick();
   expect((await platform.run(r.id)).businessTime).toBe(after.businessTime);
  }
 }finally{clock.mockRestore();await fixture.close();}
});

it('倍速切换结清旧时钟并保留不足一步的余量，补充演示预约不重复、不影响在园人数',async()=>{
 const fixture=await testStore(),{store}=fixture,platform=createPlatform(store);
 try{
  const r=await platform.run(),admin=(await store.login('admin01','123456')).user;
  r.paused=false;r.speed=30;r.anchorBusiness=r.simulation.time+3500;r.anchorReal=Date.now()-1000;
  await store.put('runs',r.id,r);
  const before=Date.now(),initial=r.simulation.time;
  await platform.write(admin,r.id,'clock-pause','/demo/clock',{paused:true});
  const paused=await platform.run(r.id);
  expect(paused.simulation.time-initial).toBeGreaterThanOrEqual(30000);
  expect(paused.anchorBusiness-paused.simulation.time).toBeGreaterThanOrEqual(0);
  expect(paused.anchorBusiness-paused.simulation.time).toBeLessThan(10000);
  expect(paused.anchorBusiness).toBeGreaterThanOrEqual(r.anchorBusiness+(before-r.anchorReal)*30);
  await platform.write(admin,r.id,'clock-speed','/demo/clock',{speed:60});
  expect((await platform.run(r.id)).anchorBusiness).toBe(paused.anchorBusiness);
  const visitors=(await platform.snapshot(r.id)).public.visitors;
  const first=await platform.write(admin,r.id,'orders-seed','/demo/seed-orders',{}) as {added:number};
  const second=await platform.write(admin,r.id,'orders-seed-again','/demo/seed-orders',{}) as {added:number};
  expect(first.added).toBe(15);expect(second.added).toBe(0);
  expect((await platform.snapshot(r.id)).public.visitors).toBe(visitors);
  for(const kind of ['entry','parking'])expect((await platform.slots(r.id,'2026-09-14',kind,kind==='parking'?'p1':undefined)).every(s=>s.remaining>=0)).toBe(true);
 }finally{await fixture.close();}
});

it('重启后的回放不会累计停机时间，快照拒绝总人数与区域合计冲突',async()=>{
 const fixture=await testStore(),platform=createPlatform(fixture.store);
 try{
  const r=await platform.run();expect(r.paused).toBe(true);
  r.paused=false;r.speed=60;r.anchorReal=Date.now()-86400000;
  await fixture.store.put('runs',r.id,r);
  await platform.restoreClocks();await platform.tick();
  const restored=await platform.run(r.id);
  expect(restored.paused).toBe(true);expect(restored.businessTime).toBe(r.businessTime);
  restored.simulation.snapshot.visitors!+=1;await fixture.store.put('runs',r.id,restored);
  await expect(platform.snapshot(r.id)).rejects.toThrow('运行快照不一致');
 }finally{await fixture.close();}
});

it('暂停的旧运行首次读取即迁移公式人流，时钟和实际预约不变',async()=>{
 const fixture=await testStore(),platform=createPlatform(fixture.store);
 try{
  const r=await platform.run();r.simulation.flowVersion=3;delete r.simulation.flow;
  const businessTime=r.businessTime,cohorts=structuredClone(r.simulation.cohorts),parking=[...r.simulation.parking];
  await fixture.store.put('runs',r.id,r);
  const [first,concurrent]=await Promise.all([platform.snapshot(r.id),platform.snapshot(r.id)]),migrated=await platform.run(r.id);
  expect(concurrent.public.visitorFlow).toEqual(first.public.visitorFlow);
  expect(migrated.simulation.flowVersion).toBe(4);expect(migrated.simulation.flow).toBeDefined();
  expect(migrated.businessTime).toBe(businessTime);expect(migrated.paused).toBe(true);
  expect(migrated.simulation.cohorts).toEqual(cohorts);expect(migrated.simulation.parking).toEqual(parking);
  expect(first.public.visitors).toBe(first.checkedInToday-first.exitedToday);
  expect(first.public.visitorFlow!.length).toBeGreaterThan(0);
  expect((await platform.snapshot(r.id)).public.visitorFlow).toEqual(first.public.visitorFlow);
 }finally{await fixture.close();}
});
