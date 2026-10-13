import {seedDemoOrders} from './demo-orders.ts';
import {FLOW_VERSION,visitorDistribution} from './visitor-flow.ts';
import {asyncmap} from '../async-arrays.ts';
import { visitorNotice } from './notices.ts';
import { randomUUID } from 'node:crypto';
import type { Account, RunInfo, Task, OA, Booking, FacilityOverride, Notice, ChatMessage, Inspection, PlatformSnapshot } from '../../../../packages/contracts/src/platform.ts';
import { assert, integer, textField, type Store } from './store.ts';
import { initialSimulation, upgradeSimulationFlow, step, dateOf, midnight, hourOf, scenic, U, allocate, level, regionCapacities, type Simulation } from './simulation.ts';
export interface Runtime extends RunInfo {
    simulation: Simulation;
    anchorReal: number;
    anchorBusiness: number;
    botsEnabled: boolean;
    overrides: Record<string, FacilityOverride>;
    alertCycles: Record<string, {
        smooth: number;
        high: number;
        low: number;
        triggered: boolean;
    }>;
}
export const scenarios = [{ id: 'weekday', name: '工作日平稳', time: '2026-09-14T08:00:00+08:00' }, { id: 'weekend', name: '周末午间高峰', time: '2026-09-13T12:30:00+08:00' }, { id: 'crowd', name: '局部拥堵', time: '2026-09-13T13:30:00+08:00' }, { id: 'maintenance', name: '设施维护与卫生间暂停', time: '2026-09-14T11:00:00+08:00' }, { id: 'oa', name: '求助与OA审批', time: '2026-09-14T14:00:00+08:00' }, { id: 'closing', name: '闭园至跨日', time: '2026-09-14T18:00:00+08:00' }];
export function createPlatform(store: Store) {
    const { get, put, list } = store;
    async function selected() {
        const selection=await get<{id:string}>('settings','selected');
        assert(selection, 'DATABASE_NOT_READY', '尚未初始化演示运行，请执行演示播种', 503);
        return selection.id;
    }
    async function run(id?: string) {
        id ??= await selected();
        const r = await get<Runtime>('runs', id);
        assert(r, 'RUN_EXPIRED', '运行不存在或已失效', 410);
        if(r.simulation.flowVersion===FLOW_VERSION&&r.simulation.flow)return r;
        // Re-read under the same transaction lock used by clock and booking writes.
        return store.transaction(async()=>{
            const current=await get<Runtime>('runs',id!);
            assert(current,'RUN_EXPIRED','运行不存在或已失效',410);
            if(upgradeSimulationFlow(current.simulation))await saveRun(current);
            return current;
        });
    }
    function role(user: Account, roles: string[]) { assert(roles.includes(user.role), 'FORBIDDEN', '当前账号无此权限', 403); }
    function version(object: {
        version: number;
    }, input: Record<string, unknown>) { assert(object.version === input.expectedVersion, 'VERSION_CONFLICT', '数据已更新，请重新读取'); }
    async function all<T>(c: string, id: string) { return (await list<T>(c, id)); }
    async function saveRun(r: Runtime) { (await put('runs', r.id, r)); }
    async function checkpoint(r: Runtime) { const rows = (await store.db.prepare("SELECT collection,id,data FROM documents WHERE run_id=$1 AND collection!='checkpoints'").all(r.id)); (await put('checkpoints', r.businessTime, { runtime: r, rows }, r.id)); }
    async function createRun(mode: 'realtime' | 'replay', scenario = 'weekday', time?: number) {
        const preset = scenarios.find(s => s.id === scenario);
        assert(preset, 'VALIDATION_ERROR', '未知场景', 400);
        const target = time ?? (mode === 'realtime' ? Date.now() : Date.parse(preset.time));
        const r: Runtime = { id: randomUUID(), mode, scenario, businessTime: new Date(midnight(target)).toISOString(), speed: 1, paused: mode==='replay', revision: 0, configVersion: 'initial-1', simulation: initialSimulation(target), anchorReal: Date.now(), anchorBusiness: target, botsEnabled: false, overrides: {}, alertCycles: {} };
        (await saveRun(r));
        (await checkpoint(r));
        (await advance(r, target));
        (await saveRun(r));
        if (scenario === 'maintenance') {
            r.overrides.t3 = { availability: 'maintenance', reason: '场景维护' };
            r.overrides.t1 = { availability: 'open', reason: '清洁暂停', requestedPaused: { female: 10 } };
            (await saveRun(r));
        }
        if (scenario === 'oa')
            (await createAlert(r, 'help', 'help-creek', '游客现场求助', '场景事件，请前线核实', 'important'));
        r.anchorReal=Date.now();r.anchorBusiness=target;
        (await saveRun(r));
        (await checkpoint(r));
        return r;
    }
    async function interactive(r: Runtime) { const orders = (await all<Booking>('orders', r.id)); return { people: orders.filter(o => o.kind === 'entry' && o.entered && !o.exited).reduce((a, o) => a + o.people, 0), parking: [1, 2, 3].map(i => orders.filter(o => o.kind === 'parking' && o.lotId === 'p' + i && o.entered && !o.exited).reduce((a, o) => a + o.people, 0)) }; }
    async function advance(r: Runtime, target: number) {
        const extras = (await interactive(r));
        const config=await get('run-config','active',r.id)||{};
        const employees=(await store.db.prepare("SELECT * FROM accounts WHERE role='staff' AND disabled=false ORDER BY id").all()).map(store.account);
        const employeesEnabled=(await get<{enabled:boolean}>('employee-simulation','settings',r.id))?.enabled!==false;
        while (r.simulation.time + 10000 <= target) {
            step(r.simulation, r.overrides, extras.people, extras.parking, config);
            r.businessTime = new Date(r.simulation.time).toISOString();
            r.revision++;
            (await detectAlerts(r));
            if(employeesEnabled)(await processEmployees(r,employees));
            (await expireNotices(r));
        }
        r.businessTime = new Date(r.simulation.time).toISOString();
    }
    async function notice(r: Runtime, eventId: string, title: string, body: string, audience: 'public' | 'internal', active = true) {
        const id = 'notice-' + eventId, old = (await get<Notice>('notices', id, r.id));
        if (old?.suppressed)
            return;
        (await put('notices', id, { id, title, body, audience, active: true, suppressed: false, eventId, ...(!active ? { expiresAt: new Date(Date.parse(r.businessTime) + ((await get<{
                    announcementMinutes: number;
                }>('run-config', 'active', r.id))?.announcementMinutes ?? 10) * 60000).toISOString() } : {}) }, r.id));
    }
    const maintainableKinds = new Set(['toilet', 'cable', 'parking']);
    function maintainablePoint(id: string) {
        return scenic.points.find(p => p.id === id && maintainableKinds.has(p.kind));
    }
    async function createAlert(r: Runtime, category: Task['category'], anchorId: string, title: string, reason: string, severity: Task['severity'] = 'important') {
        const existing = (await all<Task>('tasks', r.id)).find(t => t.anchorId === anchorId && t.category === category && t.status !== 'resolved');
        if (existing)
            return existing;
        const point = scenic.points.find(p => p.id === anchorId);
        const id = randomUUID();
        const task: Task = { id, anchorId, regionId: point?.regionId || anchorId.replace('region-', ''), category, severity, status: 'pending', title, location: point?.name || anchorId, reason, metric: reason, startedAt: r.businessTime, records: [{ at: r.businessTime, kind: 'created', actor: '景区监测', text: reason }], version: 1, assigneeId: null, assigneeName: null, resolvedAt: null };
        (await put('tasks', id, task, r.id));
        const isPublic = ['crowd', 'parking', 'cable', 'restroom'].includes(category);
        const copy = isPublic ? visitorNotice(task, r.simulation.snapshot) : { title, body: reason };
        (await notice(r, id, copy.title, copy.body, isPublic ? 'public' : 'internal'));
        return task;
    }
    async function detectAlerts(r: Runtime) {
        for (const [id, point] of Object.entries(r.simulation.snapshot.points)) {
            if (point.availability !== 'open')
                continue;
            let metric = 0, threshold = 1, recover = .8, category: Task['category'] | undefined;
            if (point.parkingCapacity) {
                metric = 1 - point.parkingFree! / point.parkingCapacity;
                threshold = .9;
                recover = .8;
                category = 'parking';
            }
            if (point.cable) {
                metric = point.cable.waitMinutes || 0;
                threshold = 10;
                recover = 5;
                category = 'cable';
            }
            if (point.restroom) {
                const parts = point.restroom;
                metric = Math.max(...['female', 'male', 'maleUrinals', 'accessible'].map(k => { const p = (parts as any)[k]; return ((p?.occupiedStalls || 0) + (p?.queueCount || 0)) / (p?.totalStalls || 1); }));
                threshold = .9;
                recover = .8;
                category = 'restroom';
            }
            if (category)
                (await detect(r, id, metric, threshold, recover, category));
        }
        for (const [id, region] of Object.entries(r.simulation.snapshot.regions))
            (await detect(r, 'region-' + id, (region.count || 0) / [1000, 1100, 1100, 1000, 1300, 1300, 1000, 1000, 2500][Number(id.slice(1))], .85, .75, 'crowd'));
    }
    async function detect(r: Runtime, id: string, raw: number, threshold: number, recover: number, category: Task['category']) {
        const c = r.alertCycles[id] ??= { smooth: raw, high: 0, low: 0, triggered: false };
        c.smooth += (1 - Math.exp(-10 / 60)) * (raw - c.smooth);
        c.high = c.smooth >= threshold ? c.high + 10 : 0;
        c.low = c.smooth < recover ? c.low + 10 : 0;
        if (c.low >= 180 && c.triggered) {
            c.triggered = false;
            const task = (await all<Task>('tasks', r.id)).filter(t => t.anchorId === id && t.category === category).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
            if (task) {
                const copy = visitorNotice(task, r.simulation.snapshot);
                (await notice(r, task.id, copy.title, `${task.location}当前拥挤情况已缓解，请按现场指引有序通行。`, 'public', false));
            }
        }
        if (c.high >= 180 && !c.triggered) {
            (await createAlert(r, category, id, '运行负载提醒', `监测值 ${raw.toFixed(2)}，持续超过 ${threshold}`));
            c.triggered = true;
        }
    }
    async function expireNotices(r: Runtime) {
        for (const n of (await all<Notice>('notices', r.id)))
            if (n.active && n.expiresAt && Date.parse(n.expiresAt) <= r.simulation.time)
                (await put('notices', n.id, { ...n, active: false, effectiveState: 'expired' }, r.id));
    }
    async function processEmployees(r: Runtime, employees: Account[]) {
        if (!employees.length)
            return;
        for (const task of (await all<Task>('tasks', r.id))) {
            if (task.status === 'resolved')
                continue;
            let job = (await get<{
                staffId: string;
                completeAt: number;
            }>('employee-jobs', task.id, r.id));
            if (task.status === 'pending' && r.simulation.time - Date.parse(task.startedAt) >= (30 + Math.floor(U(task.id + 'claim') * 4) * 10) * 1000) {
                const employee = employees[Math.floor(U(task.id + 'employee') * employees.length)];
                (await mutate(employee, r, '/tasks/' + task.id + '/start', { expectedVersion: task.version }));
                job = { staffId: employee.id, completeAt: r.simulation.time + (120 + Math.floor(U(task.id + 'duration') * 19) * 10) * 1000 };
                (await put('employee-jobs', task.id, job, r.id));
                const claimed = (await get<Task>('tasks', task.id, r.id))!;
                claimed.records.at(-1)!.text = '模拟员工已领取，正在前往现场';
                (await put('tasks', task.id, claimed, r.id));
                (await store.db.prepare("INSERT INTO journal(run_id,business_time,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5)").run(r.id, r.businessTime, 'simulation/task-start', employee.id, JSON.stringify({ taskId: task.id })));
            }
            else if (job && task.status === 'processing' && task.assigneeId === job.staffId && r.simulation.time >= job.completeAt && !(await all<OA>('oa', r.id)).some(o => o.taskId === task.id && o.status === 'pending')) {
                const staffId = job.staffId;
                const employee = employees.find(e => e.id === staffId);
                if (!employee)
                    continue;
                const results: Record<string, string> = { crowd: '已到场开展分流，引导游客错峰通行；拥挤情况继续监测', parking: '已安排车辆引导并提示其他停车场余位；车位按实际到离场更新', cable: '已维持候乘秩序并引导分批乘坐；排队情况继续监测', restroom: '已完成现场保洁和排队引导；使用情况继续监测', help: '已到场了解游客需求并完成协助', cleaning: '已完成现场清洁并复查', equipment: '已完成现场排查与处置反馈', inspection: '已按检修要求完成检查并提交反馈' };
                (await mutate(employee, r, '/tasks/' + task.id + '/complete', { expectedVersion: task.version, result: '【模拟员工】' + (results[task.category] || '已完成现场处理') }));
                (await store.db.prepare("INSERT INTO journal(run_id,business_time,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5)").run(r.id, r.businessTime, 'simulation/task-complete', employee.id, JSON.stringify({ taskId: task.id })));
            }
        }
    }
    async function restoreClocks(){
        await store.transaction(async()=>{
            for(const r of await list<Runtime>('runs'))if(r.mode==='replay'){
                r.anchorReal=Date.now();r.anchorBusiness=r.simulation.time;r.paused=true;
                r.revision++;await saveRun(r);
            }
        });
    }
    async function tick() {
        for (const candidate of [await run()]) {
          await store.transaction(async()=>{
            const r=await run(candidate.id);
            const target = r.mode === 'realtime' ? Date.now() : r.paused ? r.anchorBusiness : r.anchorBusiness + (Date.now() - r.anchorReal) * r.speed;
            if (target - r.simulation.time < 10000)
                return;
            (await store.transaction(async () => {
                (await advance(r, Math.min(target,r.simulation.time+60000)));
                for (const order of (await all<Booking>('orders', r.id))) {
                    if (!order.entered && order.status === 'confirmed' && (order.date < dateOf(r.simulation.time) || (order.date === dateOf(r.simulation.time) && hourOf(r.simulation.time) >= 17))) {
                        order.status = 'expired';
                        order.version++;
                        (await put('orders', order.id, order, r.id));
                    }
                }
                for (const plan of (await list<Inspection>('inspections'))) {
                    let schedule = (await get<{
                        dueDate: string;
                        alertId?: string;
                    }>('inspection-schedule', plan.id, r.id)) || { dueDate: plan.nextDueDate };
                    if (plan.enabled && schedule.dueDate <= dateOf(r.simulation.time) && !schedule.alertId) {
                        const alert = (await createAlert(r, 'inspection', plan.facilityId, '设施定期检修', plan.instructions, 'reminder'));
                        schedule.alertId = alert.id;
                        (await put('inspection-schedule', plan.id, schedule, r.id));
                    }
                }
                for (const n of (await all<Notice>('notices', r.id))) {
                    if (n.active && n.expiresAt && Date.parse(n.expiresAt) <= r.simulation.time)
                        (await put('notices', n.id, { ...n, active: false, effectiveState: 'expired' }, r.id));
                }
                (await saveRun(r));
                if (r.simulation.time % 60000 === 0)
                    (await checkpoint(r));
            }));
          });
        }
    }
    async function snapshot(id: string, internal = false): Promise<PlatformSnapshot> {
        const r=await run(id),pub=structuredClone(r.simulation.snapshot);
        for(const p of scenic.points.filter(p=>p.kind==='safety'||p.kind==='terminal'))
            pub.points[p.id]={...(pub.points[p.id]??{availability:'open',load:'quiet'}),...r.overrides[p.id]};
        const regionTotal=Object.values(pub.regions).reduce((sum,region)=>sum+(region.count??0),0);
        assert(pub.visitors===regionTotal&&pub.updatedAt===r.businessTime,'SNAPSHOT_INCONSISTENT','运行快照不一致，请在演示控制端重新生成运行',503);
        pub.visitorFlow=visitorDistribution(r.simulation.flow!,r.simulation.time,0,{trajectory:true}).markers;
        pub.revision=r.revision;
        pub.visitorFlowClock={speed:r.mode==='realtime'?1:r.speed,paused:r.paused};
        pub.announcements=(await all<Notice>('notices',id))
            .filter(n=>n.active&&!n.suppressed&&(!(n as any).startsAt||Date.parse((n as any).startsAt)<=r.simulation.time)&&(internal||n.audience==='public')&&(!n.expiresAt||Date.parse(n.expiresAt)>r.simulation.time))
            .map(n=>({id:n.id,title:n.title,body:n.body}));
        const own=(await all<Booking>('orders',id)).filter(o=>o.kind==='entry'&&o.date===dateOf(r.simulation.time));
        return {run:info(r),public:pub,checkedInToday:r.simulation.entered+own.filter(o=>o.entered).reduce((sum,o)=>sum+o.people,0),
            exitedToday:r.simulation.exited+own.filter(o=>o.exited).reduce((sum,o)=>sum+o.people,0),windSpeedMps:r.simulation.windSpeedMps,
            history:r.simulation.history,alerts:internal?await all<Task>('tasks',id):[]};
    }
    function info(r: Runtime): RunInfo { const { simulation, anchorReal, anchorBusiness, botsEnabled, overrides, alertCycles, ...value } = r; return value; }
    async function slots(id: string, date: string, kind: string, lotId?: string) {
        assert(/^\d{4}-\d{2}-\d{2}$/.test(date), 'VALIDATION_ERROR', '日期格式无效', 400);
        const orders=await all<Booking>('orders',id),current=await run(id);
        return (await asyncmap(Array.from({length:9},(_,i)=>i), async (i) => {
            const slot = String(i + 8).padStart(2, '0') + ':00', key = [date, kind, lotId || '', slot].join('|'), quota = (await get<{
                capacity: number;
            }>('quotas', key, id))?.capacity ?? (kind === 'parking' ? 2 + Math.floor(U(key) * 3) : 20 + Math.floor(U(key) * 21)), used = orders.filter(o => o.date === date && o.kind === kind && o.slot === slot && o.lotId === lotId && o.status === 'confirmed').reduce((a, o) => a + o.people, 0);
            return { id: key, date, kind, lotId, slot, capacity: quota, used, remaining: quota - used, bookable:date>dateOf(current.simulation.time)||(date===dateOf(current.simulation.time)&&i+9>hourOf(current.simulation.time)) };
        }));
    }
    async function write(user: Account, id: string, key: string, path: string, input: Record<string, unknown>) { return (await store.command(id + '|' + user.id, key, { path, input }, async () => { const r = (await run(id)); const result = (await mutate(user, r, path, input)); r.revision++; (await saveRun(r)); (await store.db.prepare("INSERT INTO journal(run_id,business_time,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5)").run(id, r.businessTime, path, user.id, JSON.stringify(input))); (await checkpoint(r)); return result; })); }
    async function mutate(user: Account, r: Runtime, path: string, input: Record<string, unknown>): Promise<unknown> {
        const id = r.id, parts = path.split('/').filter(Boolean), tail = parts.at(-1);
        if (path.startsWith('/demo/')) {
            role(user, ['admin']);
            if(path==='/demo/seed-orders'){
                assert(process.env.NODE_ENV!=='production','FORBIDDEN','生产环境不生成演示预约',403);
                return seedDemoOrders(store,id,r.simulation.time);
            }
            if (path === '/demo/runs') {
                const mode = input.mode === 'realtime' ? 'realtime' : 'replay';
                const created = (await createRun(mode, String(input.scenario || 'weekday')));
                (await put('settings', 'selected', { id: created.id }));
                return info(created);
            }
            if (path === '/demo/select') {
                const next = (await run(String(input.runId)));
                if(next.mode==='replay'){next.anchorReal=Date.now();next.anchorBusiness=next.simulation.time;next.paused=true;await saveRun(next);}
                (await put('settings', 'selected', { id: next.id }));
                return info(next);
            }
            if (path === '/demo/clock') {
                assert(r.mode === 'replay', 'REALTIME_CLOCK', '现场模式不能暂停或跳时');
                const clockNow=Date.now();
                let settledTime=r.paused?r.anchorBusiness:r.anchorBusiness+(clockNow-r.anchorReal)*r.speed;
                if(input.time===undefined)await advance(r,settledTime);
                if (input.time !== undefined) {
                    const target = Date.parse(String(input.time));
                    assert(Number.isFinite(target), 'VALIDATION_ERROR', '无效时间', 400);
                    settledTime=target;
                    if (target < r.simulation.time) {
                        const checkpoints = (await all<{
                            runtime: Runtime;
                            rows: {
                                collection: string;
                                id: string;
                                data: string;
                            }[];
                        }>('checkpoints', id)).filter(c => c.runtime.simulation.time <= target).sort((a, b) => b.runtime.simulation.time - a.runtime.simulation.time);
                        assert(checkpoints.length, 'REPLAY_RANGE', '目标时间早于本运行最早可恢复时刻');
                        const base = structuredClone(checkpoints[0]), branch = base.runtime;
                        branch.parentId = id;
                        branch.id = randomUUID();
                        for (const row of base.rows.filter(row => row.collection !== 'checkpoints'))
                            (await put(row.collection, row.id, JSON.parse(row.data), branch.id));
                        branch.anchorReal = Date.now();
                        branch.anchorBusiness = target;
                        (await advance(branch, target));
                        (await saveRun(branch));
                        (await checkpoint(branch));
                        (await put('settings', 'selected', { id: branch.id }));
                        return info(branch);
                    }
                    (await advance(r, target));
                }
                if (input.speed !== undefined) {
                    assert([1, 5, 30, 60, 180].includes(Number(input.speed)), 'VALIDATION_ERROR', '不支持此倍速', 400);
                    r.speed = Number(input.speed);
                }
                if (input.paused !== undefined) {
                    assert(typeof input.paused === 'boolean', 'VALIDATION_ERROR', '暂停值无效', 400);
                    r.paused = input.paused;
                }
                r.anchorBusiness = settledTime;
                r.anchorReal = Date.now();
                return info(r);
            }
            if (path === '/demo/reset') {
                const fresh = (await createRun(r.mode, r.scenario, r.mode === 'replay' ? Date.parse(scenarios.find(s => s.id === r.scenario)!.time) : undefined));
                (await put('settings', 'selected', { id: fresh.id }));
                return info(fresh);
            }
            if (path === '/demo/config') {
                const demandScale = Number(input.demandScale), botMax = integer(input.botMax, 0, 2), announcementMinutes = integer(input.announcementMinutes, 1, 60);
                assert(Number.isFinite(demandScale) && demandScale >= .5 && demandScale <= 1.5, 'VALIDATION_ERROR', '需求系数范围0.5—1.5', 400);
                const config = { id: randomUUID(), demandScale, botMax, announcementMinutes, createdAt: r.businessTime };
                r.configVersion = config.id;
                (await put('configs', config.id, config));
                (await put('run-config', 'active', config, id));
                return config;
            }
            if (path === '/demo/employees') {
                assert(typeof input.enabled === 'boolean', 'VALIDATION_ERROR', '开关无效', 400);
                (await put('employee-simulation', 'settings', { enabled: input.enabled }, id));
                return { enabled: input.enabled };
            }
            if (path === '/demo/bots') {
                assert(typeof input.enabled === 'boolean', 'VALIDATION_ERROR', '开关无效', 400);
                r.botsEnabled = input.enabled;
                return { enabled: r.botsEnabled };
            }
            if (path === '/demo/alerts') {
                const candidates = scenic.points.filter(p => maintainableKinds.has(p.kind));
                assert(candidates.length > 0, 'NO_MAINTAINABLE_POINT', '当前没有可注入现场事件的设施', 503);
                const p = candidates[Math.floor(U(id + keyFor(r)) * candidates.length)], category = ['help', 'cleaning', 'equipment'][Math.floor(U(id + 'kind' + keyFor(r)) * 3)] as Task['category'];
                return (await createAlert(r, category, p.id, '现场事件提醒', '演示终端注入，请前线核实'));
            }
        }
        if (path === '/booking/orders') {
            role(user, ['visitor']);
            const kind = input.kind;
            assert(kind === 'entry' || kind === 'parking', 'VALIDATION_ERROR', '预约类型无效', 400);
            const date = textField(input.date, 10), slot = textField(input.slot, 5), people = integer(input.people, 1, kind === 'entry' ? 10 : 1), today = dateOf(r.simulation.time), tomorrow = dateOf(r.simulation.time + 86400000);
            assert(date === today || date === tomorrow, 'VALIDATION_ERROR', '只能预约今天或明天', 400);
            assert(date !== today || Number(slot.slice(0, 2)) + 1 > hourOf(r.simulation.time), 'ORDER_STATE_CONFLICT', '时段已结束');
            const lotId = kind === 'parking' ? textField(input.lotId, 8) : undefined;
            if (lotId)
                assert(['p1', 'p2', 'p3'].includes(lotId), 'VALIDATION_ERROR', '停车场无效', 400);
            assert(!lotId || !['closed', 'maintenance'].includes(r.overrides[lotId]?.availability || 'open'), 'FACILITY_CLOSED', '停车场暂停预约');
            const target = (await (await slots(id, date, kind, lotId)).find(s => s.slot === slot));
            assert(target && target.remaining >= people, 'SLOT_FULL', '剩余配额不足');
            const order: Booking = { id: randomUUID(), userId: user.id, kind, date, slot, people, lotId, status: 'confirmed', entered: false, exited: false, version: 1, createdAt: r.businessTime };
            (await put('orders', order.id, order, id));
            return order;
        }
        if (path.startsWith('/orders/') || path.startsWith('/admin/orders/') || path.startsWith('/demo/orders/')) {
            const orderId = parts[0] === 'orders' ? parts[1] : parts[2], o = (await get<Booking>('orders', orderId, id));
            assert(o, 'NOT_FOUND', '订单不存在', 404);
            assert(user.role === 'admin' || o.userId === user.id, 'FORBIDDEN', '不可访问该订单', 403);
            version(o, input);
            if (tail === 'cancel') {
                assert(o.status === 'confirmed' && !o.entered, 'ORDER_STATE_CONFLICT', '订单不能取消');
                o.status = 'cancelled';
            }
            else if (tail === 'reschedule') {
                assert(o.status === 'confirmed' && !o.entered, 'ORDER_STATE_CONFLICT', '订单不能改期');
                const date = textField(input.date, 10), slot = textField(input.slot, 5), today = dateOf(r.simulation.time);
                assert([today, dateOf(r.simulation.time + 86400000)].includes(date) && !(date === today && Number(slot.slice(0, 2)) + 1 <= hourOf(r.simulation.time)), 'ORDER_STATE_CONFLICT', '目标日期或时段不可约');
                if (date !== o.date || slot !== o.slot) {
                    assert(!o.lotId || !['closed', 'maintenance'].includes(r.overrides[o.lotId]?.availability || 'open'), 'FACILITY_CLOSED', '停车场暂停预约');
                    const target = (await (await slots(id, date, o.kind, o.lotId)).find(s => s.slot === slot));
                    assert(target && target.remaining >= o.people, 'SLOT_FULL', '目标时段配额不足');
                    o.date = date;
                    o.slot = slot;
                }
            }
            else if (tail === 'enter') {
                role(user, ['admin']);
                assert(o.status === 'confirmed' && !o.entered && o.date === dateOf(r.simulation.time), 'ORDER_STATE_CONFLICT', '订单不可入场');
                assert(hourOf(r.simulation.time) >= 8 && hourOf(r.simulation.time) < 17, 'FACILITY_CLOSED', '非入场时段');
                if (o.kind === 'entry')
                    assert((r.simulation.snapshot.visitors || 0) + o.people <= 10000, 'PARK_FULL', '全园容量已满');
                else {
                    assert(r.simulation.snapshot.points[o.lotId!].availability === 'open', 'FACILITY_CLOSED', '停车场不可用');
                    assert(r.simulation.snapshot.points[o.lotId!].parkingFree! >= o.people, 'PARKING_FULL', '没有实体车位');
                }
                o.entered = true;
            }
            else if (tail === 'exit') {
                role(user, ['admin']);
                assert(o.entered && !o.exited, 'ORDER_STATE_CONFLICT', '订单不可离场');
                o.exited = true;
            }
            else
                assert(false, 'NOT_FOUND', '未知订单动作', 404);
            o.version++;
            (await put('orders', o.id, o, id));
            (await refreshInteractive(r));
            return o;
        }
        if (path.startsWith('/admin/booking/slots/')) {
            role(user, ['admin']);
            const quotaId = decodeURIComponent(parts.at(-1)!), [date, kind, lot, slot] = quotaId.split('|'), capacity = integer(input.capacity);
            const target = (await (await slots(id, date, kind, lot || undefined)).find(s => s.slot === slot));
            assert(target && capacity >= target.used, 'SLOT_FULL', '配额不能小于已占用');
            (await put('quotas', quotaId, { capacity }, id));
            return { ...target, capacity, remaining: capacity - target.used };
        }
        if (path.startsWith('/admin/facilities/')) {
            role(user, ['admin']);
            const facilityId = parts[2];
            assert(scenic.points.some(p => p.id === facilityId) || scenic.edges.some(e => e.id === facilityId), 'NOT_FOUND', '设施不存在', 404);
            assert(['open', 'closed', 'maintenance'].includes(String(input.availability)), 'VALIDATION_ERROR', '状态无效', 400);
            assert(facilityId !== 'gate-out' || input.availability === 'open', 'RETURN_PATH_BLOCKED', '唯一出口不能停用');
            const old = r.overrides[facilityId], override: FacilityOverride = { availability: input.availability as FacilityOverride['availability'], reason: textField(input.reason) };
            if (input.requestedPaused) {
                assert(facilityId.startsWith('t'), 'VALIDATION_ERROR', '仅卫生间支持分项暂停', 400);
                const caps = (r.simulation.snapshot.points[facilityId].restroom as any);
                override.requestedPaused = {};
                for (const part of ['female', 'male', 'maleUrinals', 'accessible'])
                    override.requestedPaused[part] = integer((input.requestedPaused as any)[part] ?? 0, 0, caps[part].totalStalls);
            }
            r.overrides[facilityId] = override;
            if (facilityId === 'upper' || facilityId === 'lower') {
                r.overrides.upper = override;
                r.overrides.lower = override;
            }
            if (scenic.edges.some(e => e.id === facilityId) && override.availability !== 'open') {
                const reachable = new Set(['gate-out']);
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const edge of scenic.edges.filter(e => r.overrides[e.id]?.availability !== 'closed' && r.overrides[e.id]?.availability !== 'maintenance'))
                        if (reachable.has(edge.from) || reachable.has(edge.to)) {
                            const before = reachable.size;
                            reachable.add(edge.from);
                            reachable.add(edge.to);
                            changed ||= reachable.size > before;
                        }
                }
                assert(scenic.points.filter(p => p.kind === 'attraction').every(p => reachable.has(p.id)), 'RETURN_PATH_BLOCKED', '此变更阻断景点返程通路');
            }
            (await notice(r, 'facility-' + facilityId, override.availability === 'open' ? '设施恢复服务' : '设施服务调整', `${scenic.points.find(p => p.id === facilityId)?.name || facilityId}：${override.reason}`, 'public', override.availability !== 'open'));
            if (old?.availability === override.availability) { }
            (await refreshInteractive(r));
            return { id: facilityId, ...override };
        }
        if (path.startsWith('/tasks/')) {
            role(user, ['staff']);
            const task = (await get<Task>('tasks', parts[1], id));
            assert(task, 'NOT_FOUND', '任务不存在', 404);
            version(task, input);
            if (tail === 'start') {
                assert(task.status === 'pending', 'TASK_STATE_CONFLICT', '任务已被领取');
                task.status = 'processing';
                task.assigneeId = user.id;
                task.assigneeName = user.name;
                task.records.push({ at: r.businessTime, kind: 'started', actor: user.name, text: '领取任务' });
            }
            else if (tail === 'complete') {
                assert(task.status === 'processing' && task.assigneeId === user.id, 'FORBIDDEN', '仅负责人可完成', 403);
                assert(!(await all<OA>('oa', id)).some(o => o.taskId === task.id && o.status === 'pending'), 'OA_PENDING', '仍有待审批申请');
                const result = textField(input.result);
                task.status = 'resolved';
                task.resolvedAt = r.businessTime;
                task.records.push({ at: r.businessTime, kind: 'completed', actor: user.name, text: result });
                if (!['crowd', 'parking', 'cable', 'restroom'].includes(task.category))
                    (await notice(r, task.id, '现场任务已处理', result, 'internal', false));
                for (const plan of (await list<Inspection>('inspections'))) {
                    const schedule = (await get<{
                        dueDate: string;
                        alertId?: string;
                    }>('inspection-schedule', plan.id, id));
                    if (schedule?.alertId === task.id)
                        (await put('inspection-schedule', plan.id, { dueDate: dateOf(r.simulation.time + plan.intervalDays * 86400000) }, id));
                }
            }
            else
                assert(false, 'NOT_FOUND', '未知任务动作', 404);
            task.version++;
            (await put('tasks', task.id, task, id));
            return task;
        }
        if (path === '/oa-requests') {
            role(user, ['staff']);
            const task = (await get<Task>('tasks', String(input.taskId), id));
            assert(task && task.status === 'processing' && task.assigneeId === user.id, 'FORBIDDEN', '仅任务负责人可申请', 403);
            version(task, input);
            assert(['reinforcement', 'cordon', 'supplies', 'other'].includes(String(input.type)), 'VALIDATION_ERROR', '申请类型无效', 400);
            const request: OA = { id: randomUUID(), taskId: task.id, applicantId: user.id, type: input.type as OA['type'], reason: textField(input.reason), needs: textField(input.needs), status: 'pending', version: 1, createdAt: r.businessTime, records: [] };
            task.version++;
            (await put('tasks', task.id, task, id));
            (await put('oa', request.id, request, id));
            return { request, task };
        }
        if (path.startsWith('/oa-requests/') || path.startsWith('/admin/oa-requests/')) {
            const request = (await get<OA>('oa', parts[0] === 'admin' ? parts[2] : parts[1], id));
            assert(request, 'NOT_FOUND', '申请不存在', 404);
            version(request, input);
            assert(request.status === 'pending', 'OA_STATE_CONFLICT', '申请已结束');
            let opinion = '申请人撤回';
            if (tail === 'withdraw') {
                assert(request.applicantId === user.id, 'FORBIDDEN', '仅申请人可撤回', 403);
                request.status = 'withdrawn';
            }
            else {
                role(user, ['admin']);
                assert(tail === 'decision' && ['approved', 'rejected'].includes(String(input.decision)), 'VALIDATION_ERROR', '审批决定无效', 400);
                opinion = textField(input.opinion);
                request.status = input.decision as OA['status'];
            }
            request.version++;
            request.records.push({ at: r.businessTime, actorId: user.id, actorName: user.name, decision: request.status, opinion });
            const task = (await get<Task>('tasks', request.taskId, id))!;
            task.version++;
            (await put('tasks', task.id, task, id));
            (await put('oa', request.id, request, id));
            (await notice(r, request.id, 'OA处理进度', opinion, 'internal', false));
            return { request, task };
        }
        if (path === '/chat/messages') {
            role(user, ['visitor']);
            const mute = (await get<{
                until: number;
            }>('mutes', user.id, id));
            assert(!mute || mute.until <= Date.now(), 'MUTED', '当前账号已禁言', 403);
            const message: ChatMessage = { id: randomUUID(), roomId: textField(input.roomId, 64), authorId: user.id, authorName: user.name, text: textField(input.text, 2000), version: 1, removed: false, simulated: user.simulated, createdAt: r.businessTime };
            (await put('messages', message.id, message, id));
            (await put('moderation', message.id, { id: message.id, messageId: message.id, version: 1, status: 'queued', attempts: 0 }, id));
            return message;
        }
        if (path === '/reports' || path === '/appeals') {
            role(user, ['visitor']);
            const message = (await get<ChatMessage>('messages', String(input.messageId), id));
            assert(message, 'NOT_FOUND', '消息不存在', 404);
            if (path === '/appeals')
                assert(message.authorId === user.id && message.removed, 'FORBIDDEN', '只能申诉自己的撤回消息', 403);
            const record = { id: randomUUID(), messageId: message.id, messageVersion: message.version, userId: user.id, reason: textField(input.reason), status: 'pending', version: 1, createdAt: r.businessTime };
            (await put(path.slice(1), record.id, record, id));
            return record;
        }
        if (path === '/admin/moderation/check') {
            role(user, ['admin']);
            const sample = input.text !== undefined;
            const message = sample ? undefined : (await get<ChatMessage>('messages', String(input.messageId), id));
            assert(sample || message, 'NOT_FOUND', '消息不存在', 404);
            if (message)
                version(message, input);
            const job = { id: randomUUID(), messageId: message?.id, version: 1, messageVersion: message?.version, sample, text: sample ? textField(input.text, 2000) : message!.text, status: 'queued', attempts: 0, createdAt: r.businessTime, requestedBy: user.id };
            (await put('moderation', job.id, job, id));
            return job;
        }
        if (path.startsWith('/admin/messages/')) {
            role(user, ['admin']);
            const message = (await get<ChatMessage>('messages', parts[2], id));
            assert(message, 'NOT_FOUND', '消息不存在', 404);
            version(message, input);
            assert(tail === 'remove' || tail === 'restore', 'VALIDATION_ERROR', '动作无效', 400);
            const reason = textField(input.reason);
            message.removed = tail === 'remove';
            message.version++;
            (await put('messages', message.id, message, id));
            (await put('notifications', randomUUID(), { userId: message.authorId, title: message.removed ? '消息已撤回' : '消息已恢复', body: reason, messageId: message.id }, id));
            return message;
        }
        if (path.startsWith('/admin/users/')) {
            role(user, ['admin']);
            const target = (await store.db.prepare("SELECT * FROM accounts WHERE id=$1").get(parts[2])) as Record<string, unknown> | undefined;
            assert(target, 'NOT_FOUND', '账号不存在', 404);
            assert(target.role === 'visitor', 'FORBIDDEN', '员工状态只读', 403);
            if (tail === 'mute') {
                const minutes = integer(input.minutes, 0, 10080);
                (await put('mutes', String(target.id), { until: Date.now() + minutes * 60000, minutes, setAt: Date.now(), reason: textField(input.reason) }, id));
                return { muted: minutes > 0 };
            }
            assert(typeof input.disabled === 'boolean', 'VALIDATION_ERROR', '禁用状态无效', 400);
            (await store.db.prepare("UPDATE accounts SET disabled=$1 WHERE id=$2").run(input.disabled, String(target.id)));
            if (input.disabled)
                (await store.db.prepare("DELETE FROM auth_sessions WHERE user_id=$1").run(String(target.id)));
            return { id: target.id, disabled: input.disabled };
        }
        if (path === '/me/tour') {
            role(user, ['visitor']);
            const routeId = textField(input.routeId, 64), route = scenic.routes.find(r => r.id === routeId);
            assert(route, 'NOT_FOUND', '路线不存在', 404);
            assert(["select", 'start', 'pause'].includes(String(input.action)), 'VALIDATION_ERROR', '路线操作无效', 400);
            const profile = (await get<any>('profiles', user.id, id)) || { favourites: [], tour: null };
            const old = profile.tour;
            if (old?.status === 'running')
                old.progress = Math.min(1, old.progress + (r.simulation.time - old.anchorTime) / (Math.max(1, route.minutes) * 60000));
            if (input.action === 'start')
                assert(!route.edgeIds.some(edge => r.overrides[edge]?.availability && r.overrides[edge].availability !== 'open') && !route.nodeIds.some(point => r.simulation.snapshot.points[point] && r.simulation.snapshot.points[point].availability !== 'open'), 'FACILITY_CLOSED', '路线涉及关闭点位或道路');
            const order = (await all<Booking>('orders', id)).find(o => o.userId === user.id && o.kind === 'entry' && o.entered && !o.exited);
            const tour = { routeId, status: input.action === 'start' ? 'running' : input.action === 'pause' ? 'paused' : 'ready', progress: old?.routeId === routeId && input.action !== "select" ? old.progress : 0, orderId: order?.id || null, anchorTime: r.simulation.time };
            profile.routeId = routeId;
            profile.tour = tour;
            (await put('profiles', user.id, profile, id));
            return profile;
        }
        if (path === '/me/profile') {
            role(user, ['visitor']);
            const favourites = input.favourites;
            assert(Array.isArray(favourites) && favourites.every(id => scenic.points.some(p => p.id === id)), 'VALIDATION_ERROR', '收藏点位无效', 400);
            const profile = { ...(await get<any>('profiles', user.id, id)), favourites: [...new Set(favourites)], routeId: typeof input.routeId === 'string' ? input.routeId : null };
            (await put('profiles', user.id, profile, id));
            return profile;
        }
        if (path === '/admin/scenic' || path.startsWith('/admin/pois/')) {
            role(user, ['admin']);
            const target = path === '/admin/scenic' ? 'scenic' : parts[2];
            if (target !== 'scenic')
                assert(scenic.points.some(p => p.id === target), 'NOT_FOUND', '景点不存在', 404);
            const old = (await get<any>('content', target));
            if (old)
                version(old, input);
            const item = { ...old, id: target, updatedAt: r.businessTime, ...Object.fromEntries(['summary', 'address', 'servicePhone', 'coverUrl', 'openingText', 'imageUrls', 'sourceIds'].filter(k => input[k] !== undefined).map(k => [k, input[k]])), title: textField(input.title, 120), body: textField(input.body, 20000), version: (old?.version || 0) + 1 };
            (await put('content', target, item));
            return item;
        }
        if (path.startsWith('/admin/')) {
            role(user, ['admin']);
            const mapping: Record<string, string> = { articles: 'articles', notices: 'notices', knowledge: 'knowledge', rules: 'rules', inspections: 'inspections', reports: 'reports', appeals: 'appeals', moderation: 'moderation' };
            const collection = mapping[parts[1]];
            assert(collection, 'NOT_FOUND', '接口不存在', 404);
            const global = ['articles', 'knowledge', 'rules', 'inspections'].includes(collection), scope = global ? '' : id, recordId = parts[2] || randomUUID(), old = (await get<Record<string, unknown>>(collection, recordId, scope));
            if (old)
                version(old as {
                    version: number;
                }, input);
            if (input.action === "delete") {
                assert(['articles', 'notices'].includes(collection) && old, 'NOT_FOUND', '内容不存在', 404);
                if (collection === 'notices') {
                    (await put(collection, recordId, { ...old, active: false, published: false, suppressed: true, deleted: true, version: Number(old.version || 0) + 1 }, scope));
                }
                else {
                    (await store.db.prepare("DELETE FROM documents WHERE collection IN ($1,$2) AND id=$3 AND run_id=$4").run(collection, collection + '-published', recordId, scope));
                }
                return { id: recordId };
            }
            if (collection === 'inspections') {
                const facilityId = textField(input.facilityId, 64);
                assert(maintainablePoint(facilityId), 'VALIDATION_ERROR', '请选择可维护设施', 400);
                assert(!(await list<Inspection>(collection)).some(p => p.id !== recordId && p.facilityId === facilityId && p.enabled && input.enabled), 'INSPECTION_PLAN_CONFLICT', '该设施已有启用计划');
                const plan: Inspection = { id: recordId, facilityId, intervalDays: integer(input.intervalDays, 1, 365), nextDueDate: textField(input.nextDueDate, 10), instructions: textField(input.instructions), enabled: input.enabled === true, version: Number(old?.version || 0) + 1 };
                assert(/^\d{4}-\d{2}-\d{2}$/.test(plan.nextDueDate), 'VALIDATION_ERROR', '日期无效', 400);
                (await put(collection, recordId, plan));
                if (plan.enabled && plan.nextDueDate <= dateOf(r.simulation.time)) {
                    const schedule = (await get<any>('inspection-schedule', plan.id, id));
                    if (!schedule?.alertId) {
                        const alert = (await createAlert(r, 'inspection', plan.facilityId, '设施定期检修', plan.instructions, 'reminder'));
                        (await put('inspection-schedule', plan.id, { dueDate: plan.nextDueDate, alertId: alert.id }, id));
                    }
                }
                return plan;
            }
            if (collection === 'reports' || collection === 'appeals' || collection === 'moderation') {
                assert(old && old.status === 'pending', 'VERSION_CONFLICT', '记录已处理');
                const reason = textField(input.reason);
                assert(['retained', 'removed', 'restored', 'rejected'].includes(String(input.decision)), 'VALIDATION_ERROR', '处理决定无效', 400);
                const record = { ...old, status: String(input.decision), resolution: reason, version: Number(old.version) + 1 };
                if (collection !== 'reports' && ['removed', 'restored'].includes(String(input.decision))) {
                    const message = (await get<ChatMessage>('messages', String(old.messageId), id));
                    assert(message, 'NOT_FOUND', '消息不存在', 404);
                    if (old.messageVersion !== undefined)
                        assert(message.version === old.messageVersion, 'VERSION_CONFLICT', '消息已有更新，请复核新版本');
                    message.removed = input.decision === 'removed';
                    message.version++;
                    (await put('messages', message.id, message, id));
                    (await put('notifications', randomUUID(), { userId: message.authorId, title: '内容处理结果', body: reason, messageId: message.id }, id));
                }
                (await put(collection, recordId, record, id));
                return record;
            }
            if (collection === 'notices' && input.startsAt) {
                assert(Number.isFinite(Date.parse(String(input.startsAt))), 'VALIDATION_ERROR', '公告开始时间无效', 400);
                assert(!input.expiresAt || Date.parse(String(input.startsAt)) < Date.parse(String(input.expiresAt)), 'VALIDATION_ERROR', '公告开始时间必须早于结束时间', 400);
            }
            if (collection === 'notices' && input.expiresAt)
                assert(Number.isFinite(Date.parse(String(input.expiresAt))), 'VALIDATION_ERROR', '公告结束时间无效', 400);
            const title = textField(input.title, 120), body = textField(input.body, 20000), record = { ...old, id: recordId, title, body, ...Object.fromEntries(['category', 'summary', 'coverUrl', 'startsAt', 'poiId', 'keywords', 'sourceId'].filter(k => input[k] !== undefined).map(k => [k, input[k]])), version: Number(old?.version || 0) + 1, published: input.published === undefined ? old?.published === true : input.published === true, audience: input.audience === 'internal' ? 'internal' : 'public', active: input.active !== false, suppressed: input.suppressed === true, ...(collection === 'notices' ? { expiresAt: input.expiresAt ? new Date(String(input.expiresAt)).toISOString() : new Date(r.simulation.time + 3600000).toISOString() } : {}), updatedAt: r.businessTime };
            (await put(collection, recordId, record, scope));
            if (record.published)
                (await put(collection + '-published', recordId, record, scope));
            (await put(collection + '-versions', recordId + '|' + record.version, record, scope));
            return record;
        }
        assert(false, 'NOT_FOUND', '接口不存在', 404);
    }
    async function refreshInteractive(r: Runtime) {
        const extra = (await interactive(r)), pub = r.simulation.snapshot;
        const background = r.simulation.entered-r.simulation.exited;
        pub.visitors = background + extra.people;
        const ids = Object.keys(pub.regions).sort();
        const distribution=visitorDistribution(r.simulation.flow!,r.simulation.time,extra.people);
        const counts=distribution.counts;pub.visitorFlow=distribution.markers;
        ids.forEach((id, i) => { pub.regions[id].count = counts[i]; pub.regions[id].load = level(counts[i] / regionCapacities[Number(id.slice(1))], .3, .5); });
        [0, 1, 2].forEach(i => { const p = pub.points['p' + (i + 1)]; p.parkingFree = [700, 500, 300][i] - r.simulation.parking[i] - extra.parking[i]; p.load = p.availability === 'open' ? level(1 - p.parkingFree / p.parkingCapacity!, .7, .9) : 'unknown'; });
        pub.parkingFree = 1500 - r.simulation.parking.reduce((a, b) => a + b, 0) - extra.parking.reduce((a, b) => a + b, 0);
        for (const [id, o] of Object.entries(r.overrides)) {
            const p = pub.points[id];
            if (!p)
                continue;
            p.availability = o.availability;
            p.reason = o.reason;
            if (p.availability !== 'open')
                p.load = 'unknown';
            if (p.restroom) {
                for (const part of ['female', 'male', 'maleUrinals', 'accessible']) {
                    const counts = (p.restroom as any)[part], st = r.simulation.stalls[id]?.[part];
                    if (!counts || !st)
                        continue;
                    const requested = o.requestedPaused?.[part] || 0, target = o.availability === 'open' ? Math.max(counts.baselinePaused || 0, requested) : counts.totalStalls;
                    st.paused = Math.min(target, counts.totalStalls - st.occupied);
                    st.pending = target - st.paused;
                    Object.assign(counts, { requestedPaused: requested, effectivePaused: st.paused, pendingRelease: st.pending, availableStalls: counts.totalStalls - st.occupied - st.paused });
                }
                p.restroom.availableStalls = ['female', 'male', 'maleUrinals', 'accessible'].reduce((sum, k) => sum + (p.restroom as any)[k].availableStalls, 0);
            }
        }
        pub.closedEdgeIds = Object.entries(r.overrides).filter(([id, o]) => scenic.edges.some(e => e.id === id) && o.availability !== 'open').map(([id]) => id);
    }
    function keyFor(r: Runtime) { return r.businessTime + '|' + r.revision; }
    async function external<T>(id: string, kind: string, work: () => T | Promise<T>): Promise<Promise<T>> { return (await store.transaction(async () => { const result = await work(), r = (await run(id)); r.revision++; (await saveRun(r)); (await store.db.prepare("INSERT INTO journal(run_id,business_time,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5)").run(id, r.businessTime, kind, 'system', '{}')); (await checkpoint(r)); return result; })); }
    return { createRun, store, selected, run, info, all, role, write, tick, restoreClocks, snapshot, slots, scenarios, scenic, external };
}
export type Platform = ReturnType<typeof createPlatform>;
