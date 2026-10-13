import { testStore } from '../helpers/postgres';
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../apps/server/src/platform/store';
import { createPlatform } from '../../apps/server/src/platform/service';
import { initialSimulation, step, arrivalPlan } from '../../apps/server/src/platform/simulation';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const f of cleanups.splice(0))
        await f();
});
async function setup() {
    const fixture = await testStore(), store = fixture.store;
    cleanups.push(fixture.close);
    const platform = createPlatform(store);
    const admin = (await store.login('admin01', '123456')).user, staff = (await store.login('staff01', '123456')).user, visitor = (await store.login('visitor01', '123456')).user;
    const selected = (await platform.write(admin, (await platform.selected()), 'create-run-1', '/demo/runs', { mode: 'replay', scenario: 'oa' })) as {
        id: string;
    };
    return { store, platform, admin, staff, visitor, id: selected.id };
}
describe('统一景区平台', () => {
    it('工作日回放默认从开园边界开始，并支持180倍速', async () => {
        const { platform, admin } = await setup();
        const created = await platform.write(admin, await platform.selected(), 'create-weekday-boundary', '/demo/runs', { mode: 'replay', scenario: 'weekday' }) as { id: string };
        const current = await platform.run(created.id);
        expect(current.businessTime).toBe('2026-09-14T00:00:00.000Z');
        const result = await platform.write(admin, created.id, 'clock-speed-180', '/demo/clock', { speed: 180 });
        expect((result as any).speed).toBe(180);
    });
    it('账号统一密码、注册身份与登录持久化', async () => { const { store } = (await setup()); expect((await store.login('staff03', '123456')).user.name).toBe('赵文博'); const value = (await store.register('guest001', '林小溪', '123456')); expect((await store.authenticate(value.token))?.role).toBe('visitor'); await expect(async () => (await store.register('guest001', '另一个人', '123456'))).rejects.toThrow('用户名已存在'); await expect(async () => (await store.login('admin01', 'wrong'))).rejects.toThrow(); });
    it('审批撤回竞争和未决OA阻止结案', async () => { const { platform, admin, staff, id } = (await setup()); const task = (await platform.all<any>('tasks', id)).find(t => t.category === 'help'); const started = (await platform.write(staff, id, 'task-start-1', '/tasks/' + task.id + '/start', { expectedVersion: 1 })) as any; const oa = (await platform.write(staff, id, 'create-oa-1', '/oa-requests', { taskId: task.id, expectedVersion: started.version, type: 'supplies', reason: '需补充物资', needs: '饮用水' })) as any; await expect(async () => (await platform.write(staff, id, 'complete-1', '/tasks/' + task.id + '/complete', { expectedVersion: oa.task.version, result: '完成' }))).rejects.toThrow('仍有待审批'); const decided = (await platform.write(admin, id, 'decide-1', '/admin/oa-requests/' + oa.request.id + '/decision', { expectedVersion: 1, decision: 'approved', opinion: '已安排，请领取' })) as any; await expect(async () => (await platform.write(staff, id, 'withdraw-1', '/oa-requests/' + oa.request.id + '/withdraw', { expectedVersion: 1 }))).rejects.toThrow('数据已更新'); const done = (await platform.write(staff, id, 'complete-2', '/tasks/' + task.id + '/complete', { expectedVersion: decided.task.version, result: '已发放饮用水' })) as any; expect(done.status).toBe('resolved'); });
    it('订单幂等、配额守恒、模拟入离园不重复计数', async () => { const { platform, admin, visitor, id } = (await setup()); const input = { kind: 'entry', date: '2026-09-14', slot: '15:00', people: 3 }; const order = (await platform.write(visitor, id, 'booking-1', '/booking/orders', input)) as any; expect((await platform.write(visitor, id, 'booking-1', '/booking/orders', input))).toEqual(order); await expect(async () => (await platform.write(visitor, id, 'booking-1', '/booking/orders', { ...input, people: 4 }))).rejects.toThrow('幂等键'); const before = (await platform.snapshot(id)).public.visitors!; (await platform.write(admin, id, 'entry-001', '/demo/orders/' + order.id + '/enter', { expectedVersion: 1 })); expect((await platform.snapshot(id)).public.visitors).toBe(before + 3); (await platform.write(admin, id, 'entry-001', '/demo/orders/' + order.id + '/enter', { expectedVersion: 1 })); expect((await platform.snapshot(id)).public.visitors).toBe(before + 3); await expect(async () => (await platform.write(admin, id, 'entry-002', '/demo/orders/' + order.id + '/enter', { expectedVersion: 2 }))).rejects.toThrow('订单不可入场'); });
    it('管理员不可禁用员工，游客不能审批', async () => { const { platform, admin, visitor, id } = (await setup()); await expect(async () => (await platform.write(admin, id, 'disable-1', '/admin/users/staff01/disabled', { disabled: true }))).rejects.toThrow('员工状态只读'); await expect(async () => (await platform.write(visitor, id, 'demo-create', '/demo/runs', { mode: 'replay' }))).rejects.toThrow('无此权限'); });
    it('演示随机现场告警使用真实可维护设施', async () => { const { platform, admin, id } = (await setup()); const alert = await platform.write(admin, id, 'demo-alert-1', '/demo/alerts', {}) as any; expect(alert).toMatchObject({ status: 'pending', category: expect.any(String) }); expect(['t1', 't2', 't3', 't4', 't5', 't6', 'upper', 'lower', 'p1', 'p2', 'p3']).toContain(alert.anchorId); });
    it('模拟员工自动领取完成、人工任务不接管、到期公告移除', async () => {
        const { platform, store, admin, id } = (await setup());
        const task = (await platform.all<any>('tasks', id)).find(t => t.category === 'help');
        const jump = async (key: string, time: string) => (await platform.write(admin, id, key, '/demo/clock', { time, paused: true }));
        (await jump('advance-claim', '2026-09-14T14:01:00+08:00'));
        const claimed = (await store.get<any>('tasks', task.id, id));
        expect(claimed.status).toBe('processing');
        expect(claimed.records.at(-1).text).toContain('模拟员工');
        const employee = (await store.login(claimed.assigneeId, '123456')).user;
        const oa = (await platform.write(employee, id, 'employee-oa', '/oa-requests', { taskId: task.id, expectedVersion: claimed.version, type: 'supplies', reason: '需要物资', needs: '饮水' })) as any;
        (await jump('advance-blocked', '2026-09-14T14:10:00+08:00'));
        expect((await store.get<any>('tasks', task.id, id)).status).toBe('processing');
        (await platform.write(admin, id, 'approve-auto-oa', '/admin/oa-requests/' + oa.request.id + '/decision', { expectedVersion: 1, decision: 'approved', opinion: '物资已就绪' }));
        (await jump('advance-complete', '2026-09-14T14:11:00+08:00'));
        expect((await store.get<any>('tasks', task.id, id)).status).toBe('resolved');
        const notice = (await platform.write(admin, id, 'new-public-notice', '/admin/notices', { title: '临时通行提醒', body: '请走开放步道', expiresAt: '2026-09-14T14:12:00+08:00' })) as any;
        expect((await platform.snapshot(id)).public.announcements.some(n => n.id === notice.id)).toBe(true);
        (await jump('advance-expired', '2026-09-14T14:12:00+08:00'));
        expect((await platform.snapshot(id)).public.announcements.some(n => n.id === notice.id)).toBe(false);
        expect((await platform.snapshot(id, true)).public.announcements.some(n => n.id === notice.id)).toBe(false);
        expect((await store.get<any>('notices', notice.id, id)).active).toBe(false);
        await expect(async () => (await platform.write(admin, id, 'invalid-expiration', '/admin/notices', { title: '公告', body: '内容', expiresAt: 'invalid' }))).rejects.toThrow('公告结束时间无效');
    });
    it('关闭模拟员工后不自动领取，人工领取后不自动完成', async () => {
        const { platform, admin, staff, id, store } = (await setup());
        (await platform.write(admin, id, 'employees-off', '/demo/employees', { enabled: false }));
        const task = (await platform.all<any>('tasks', id)).find(t => t.category === 'help');
        (await platform.write(admin, id, 'advance-disabled', '/demo/clock', { time: '2026-09-14T14:10:00+08:00', paused: true }));
        expect((await store.get<any>('tasks', task.id, id)).status).toBe('pending');
        (await platform.write(staff, id, 'manual-claim', '/tasks/' + task.id + '/start', { expectedVersion: 1 }));
        (await platform.write(admin, id, 'employees-on', '/demo/employees', { enabled: true }));
        (await platform.write(admin, id, 'advance-manual', '/demo/clock', { time: '2026-09-14T14:20:00+08:00', paused: true }));
        expect((await store.get<any>('tasks', task.id, id)).status).toBe('processing');
    });
    it('工作日全天逐步满足人数、车位和卫生间守恒', () => {
        const s = initialSimulation(Date.parse('2026-09-14T00:00:00+08:00'));
        for (let i = 0; i < 8640; i++) {
            step(s, {});
            if (i % 60 === 0) {
                expect(Object.values(s.snapshot.regions).reduce((a, r) => a + (r.count || 0), 0)).toBe(s.snapshot.visitors);
                for (const p of Object.values(s.snapshot.points)) {
                    if (p.parkingCapacity)
                        expect(p.parkingFree).toBeGreaterThanOrEqual(0);
                    if (p.restroom)
                        for (const k of ['female', 'male', 'maleUrinals', 'accessible']) {
                            const r = (p.restroom as any)[k];
                            expect(r.occupiedStalls + r.availableStalls + r.effectivePaused).toBe(r.totalStalls);
                            if (r.queueCount > 0)
                                expect(r.availableStalls).toBe(0);
                        }
                }
            }
        }
        expect(arrivalPlan('2026-09-14')).toEqual(arrivalPlan('2026-09-14'));
        expect(s.snapshot.visitors).toBe(0);
    }, 60000);
});

it('PG并发幂等、配额与版本由同一事务保护，回滚后运行不变',async()=>{
 const {platform,store,admin,visitor,id}=await setup();
 const input={kind:'entry',date:'2026-09-14',slot:'15:00',people:1};
 const results=await Promise.all(Array.from({length:8},()=>platform.write(visitor,id,'concurrent-same','/booking/orders',input)));
 expect(new Set(results.map((r:any)=>r.id)).size).toBe(1);
 await expect(platform.write(visitor,id,'concurrent-same','/booking/orders',{...input,people:2})).rejects.toThrow('幂等键');
 const quota='2026-09-14|entry||15:00';await platform.write(admin,id,'set-small-quota','/admin/booking/slots/'+encodeURIComponent(quota),{capacity:2});
 const bookings=await Promise.allSettled(Array.from({length:6},(_,i)=>platform.write(visitor,id,'quota-race-'+i,'/booking/orders',input)));
 expect(bookings.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const notice:any=await platform.write(admin,id,'notice-version-base','/admin/notices',{title:'并发测试',body:'正文'});
 const edits=await Promise.allSettled([1,2].map(i=>platform.write(admin,id,'notice-race-'+i,'/admin/notices/'+notice.id,{expectedVersion:notice.version,title:'修改'+i,body:'正文'})));
 expect(edits.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const before=await platform.snapshot(id,true),journal=await store.db.query('SELECT count(*) AS n FROM journal');
 await expect(store.transaction(async()=>{await platform.write(admin,id,'rollback-forced','/demo/employees',{enabled:false});throw Error('forced failure');})).rejects.toThrow('forced failure');
 expect(await platform.snapshot(id,true)).toEqual(before);
 expect((await store.db.query('SELECT count(*) AS n FROM journal')).rows).toEqual(journal.rows);
 expect((await store.db.query('SELECT * FROM commands WHERE key=$1',['rollback-forced'])).rows).toHaveLength(0);
 const reopened=createPlatform(store);expect(await reopened.selected()).toBe(await platform.selected());expect(await reopened.snapshot(id,true)).toEqual(before);
});
