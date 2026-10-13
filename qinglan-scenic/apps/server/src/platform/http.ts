import {attachments} from './attachments.ts';
import {chatRooms} from './chat-control.ts';
import {people,trades,personActivity} from './people.ts';
import { asyncmap, asyncflatMap, asyncforEach, asyncfilter } from '../async-arrays.ts';
import { deviceSnapshot } from './devices.ts';
import { backgroundOrders, forecast } from './projections.ts';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { body, json, fail, RequestBodyError } from '../http.ts';
import { DomainError, assert, digest } from './store.ts';
import type { Platform } from './service.ts';
import type { Account, Task, OA, Booking, ChatMessage } from '../../../../packages/contracts/src/platform.ts';
export function platformHttp(platform: Platform) {
    const connections = new Map<WebSocket, {
        app: string;
        runId: string;
        lastSeen: number;
    }>();
    const { store } = platform;
    let ws: WebSocketServer;
    const limits = new Map<string, {
        at: number;
        count: number;
    }>();
    async function user(req: IncomingMessage) { return (await store.authenticate(req.headers.authorization?.replace(/^Bearer /, '') || '')); }
    async function runId(req: IncomingMessage) { return String(req.headers['x-run-id'] || (await platform.selected())); }
    function paginate<T>(items: T[], url: URL) { const rawPage = url.searchParams.get('page'), rawPageSize = url.searchParams.get('pageSize'), page = rawPage === null ? 1 : Number(rawPage), pageSize = rawPageSize === null ? 20 : Number(rawPageSize); assert(Number.isInteger(page) && page >= 1 && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 200, 'VALIDATION_ERROR', '分页参数无效', 400); return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }; }
    function filtered(items: any[], url: URL) {
        return items.filter(item => [...url.searchParams].every(([key, value]) => {
            if (['page', 'pageSize', 'runId', 'scope', 'q', 'keyword', 'from', 'to'].includes(key))
                return true;
            return String(item[key] ?? '') === value;
        }) && (!url.searchParams.get('q') || JSON.stringify(item).includes(url.searchParams.get('q')!)) && (!url.searchParams.get('keyword') || JSON.stringify(item).includes(url.searchParams.get('keyword')!))).sort((a, b) => String(b.createdAt || b.startedAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.startedAt || a.updatedAt || '')) || a.id.localeCompare(b.id));
    }
    async function broadcast() {
        if (!ws)
            return;
        const run=await store.db.readTransaction(()=>platform.run());
        const message=JSON.stringify({type:'invalidate',runId:run.id,revision:run.revision,serverTime:new Date().toISOString()});
        for(const client of ws.clients)if(client.readyState===WebSocket.OPEN){
            const connection=connections.get(client);
            if(connection)connection.runId=run.id;
            client.send(message);
        }
    }
    async function route(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = new URL(req.url || '/', 'http://localhost'), path = url.pathname.replace(/^\/api\/v1/, '');
        if (!url.pathname.startsWith('/api/v1/'))
            return false;
        if(path.startsWith('/qa/')||path==='/qa'||path.startsWith('/knowledge/')||path==='/scenic/state'||path==='/debug/scenic/state'||path==='/auth/experience'||path.startsWith('/health'))return false;
        try {
            const context = (await platform.run(path === '/runtime' || path.startsWith('/auth/') ? (await platform.selected()) : (await runId(req))));
            res.setHeader('X-Run-Id', context.id);
            res.setHeader('X-Revision', context.revision);
            if (['/auth/login', '/auth/register'].includes(path) && req.method === 'POST') {
                const address = req.socket.remoteAddress || 'unknown', entry = limits.get(address), now = Date.now(), counter = entry && now - entry.at < 60000 ? entry : { at: now, count: 0 };
                counter.count++;
                limits.set(address, counter);
                assert(counter.count <= 20, 'RATE_LIMITED', '登录操作过于频繁', 429);
                const input = await body(req);
                assert(typeof input.username === 'string' && typeof input.password === 'string', 'VALIDATION_ERROR', '请输入用户名和密码', 400);
                const result = path === '/auth/login' ? (await store.login(input.username.trim(), input.password)) : (await store.register(input.username.trim(), typeof input.name === 'string' ? input.name.trim() : '', input.password));
                json(res, path === '/auth/login' ? 200 : 201, { ...result, runId: (await platform.selected()) });
                return true;
            }
            if (path === '/runtime' && req.method === 'GET') {
                json(res, 200, { run: platform.info((await platform.run())), scenarios: platform.scenarios });
                return true;
            }
            if (path === '/public/snapshot' && req.method === 'GET') {
                json(res, 200, (await platform.snapshot((await runId(req)))).public);
                return true;
            }
            if (path === '/public/devices' && req.method === 'GET') {
                json(res, 200, (await deviceSnapshot(platform, (await runId(req)))));
                return true;
            }
            if (path === '/screens/ops' && req.method === 'GET') {
                const snapshot = (await platform.snapshot((await runId(req)), true));
                snapshot.public.announcements = [...(await platform.snapshot((await runId(req)))).public.announcements,...(await store.list<any>('notices',context.id)).filter(n=>n.screenVisible&&n.active&&!n.suppressed).map(n=>({id:n.id,title:n.screenTitle,body:n.screenBody}))];
                json(res, 200, snapshot);
                return true;
            }
            if (path === '/public/forecast' && req.method === 'GET') {
                json(res, 200, forecast((await platform.run((await runId(req))))));
                return true;
            }
            if (path === '/public/state' && req.method === 'GET') {
                json(res, 200, (await platform.snapshot((await runId(req)))));
                return true;
            }
            if (path === '/pois' && req.method === 'GET') {
                json(res, 200, { items: (await asyncmap(platform.scenic.points, async (p) => { const edit = (await store.get<any>('content', p.id)); return edit ? { ...p, name: edit.title, description: edit.body, version: edit.version } : p; })) });
                return true;
            }
            if (path.startsWith('/pois/') && req.method === 'GET') {
                const p = platform.scenic.points.find(p => p.id === path.split('/')[2]);
                assert(p, 'NOT_FOUND', '景点不存在', 404);
                const edit = (await store.get<any>('content', p.id));
                json(res, 200, edit ? { ...p, name: edit.title, description: edit.body, version: edit.version } : p);
                return true;
            }
            if (path === '/articles' && req.method === 'GET') {
                json(res, 200, paginate((await store.list<any>('articles')).filter(x => x.published), url));
                return true;
            }
            const account = (await user(req));
            if (path.startsWith('/qa/') || path === '/qa' || path.startsWith('/knowledge/') || path === '/scenic/state')
                return false;
            if (path === '/health' || path === '/auth/experience')
                return false;
            assert(account, 'AUTH_REQUIRED', '请先登录', 401);
            const id = (await runId(req));
            (await platform.run(id));
            if (path === '/auth/me') {
                json(res, 200, { user: account, runId: id });
                return true;
            }
            if (path === '/auth/logout' && req.method === 'POST') {
                (await store.db.prepare("DELETE FROM auth_sessions WHERE token=$1").run(digest(req.headers.authorization?.replace(/^Bearer /, '') || '')));
                json(res, 200, { ok: true });
                return true;
            }
            if(path==='/auth/password'&&req.method==='POST'){const input=await body(req);json(res,200,{...await store.changePassword(account,String(input.password||'')),runId:id});return true;}
            assert(!account.mustChangePassword,'PASSWORD_CHANGE_REQUIRED','请先修改临时密码',403);
            if(await attachments(store,account,id,req,res,path))return true;
            if (req.method === 'POST' || req.method === 'PUT' || req.method === "DELETE") {
                const input = await body(req);
                const result = (await platform.write(account, id, String(req.headers['idempotency-key'] || ''), path, input));
                res.setHeader('X-Revision', (await platform.run(id)).revision);
                json(res, 200, result);
                (await broadcast());
                return true;
            }
            if (req.method !== 'GET')
                throw new DomainError('METHOD_NOT_ALLOWED', '不支持此请求方法', 405);
            if(path==='/admin/people'){platform.role(account,['admin']);json(res,200,{items:await people(store),trades:await trades(store)});return true;}
            if(/^\/admin\/people\/[^/]+\/activity$/.test(path)){platform.role(account,['admin']);json(res,200,{items:await personActivity(store,path.split('/')[3],id)});return true;}
            if(path==='/workflow/workspace'){platform.role(account,['admin','staff']);const requests=(await store.list<any>('facility-requests',id)).filter(r=>account.role==='admin'||r.applicantId===account.id);const relatedOrders=new Set(requests.map(r=>r.workOrderId).filter(Boolean));json(res,200,{workOrders:(await store.list<any>('work-orders',id)).filter(w=>account.role==='admin'||w.assigneeId===account.id||relatedOrders.has(w.id)),requests,alerts:account.role==='admin'?await store.list('alerts',id):[],staff:account.role==='admin'?(await people(store)).filter(p=>p.role==='staff'&&!p.disabled&&!p.archived):[],facilities:platform.scenic.points});return true;}
            if(path==='/gate/workspace'){
                platform.role(account,['staff','admin']);
                json(res,200,{run:platform.info(await platform.run(id)),tasks:await platform.all<Task>('tasks',id),oa:await platform.all<OA>('oa',id),names:(await people(store)).filter(p=>p.role==='staff'||p.role==='admin').map(p=>({id:p.id,name:p.name})),workStatuses:(await store.list<any>('work-orders',id)).filter(w=>w.legacyTaskId).map(w=>({taskId:w.legacyTaskId,status:w.status}))});
                return true;
            }
            if (path === '/ops/snapshot') {
                platform.role(account, ['admin', 'staff']);
                json(res, 200, (await platform.snapshot(id, true)));
                return true;
            }
            if (path === '/demo/runs') {
                platform.role(account, ['admin']);
                json(res, 200, { items: (await store.list<any>('runs')).map(platform.info), selected: (await platform.selected()) });
                return true;
            }
            if (path === '/demo/employees') {
                platform.role(account, ['admin']);
                json(res, 200, (await store.get('employee-simulation', 'settings', id)) || { enabled: true });
                return true;
            }
            if (path === '/demo/config') {
                platform.role(account, ['admin']);
                json(res, 200, (await store.get('run-config', 'active', id)) || { id: 'initial-1', demandScale: 1, botMax: 2, announcementMinutes: 10 });
                return true;
            }
            if (path === '/demo/connections') {
                platform.role(account, ['admin']);
                json(res, 200, { items: [...connections.values()] });
                return true;
            }
            if (path === '/booking/slots' || path === '/admin/booking/slots') {
                if (path.startsWith('/admin'))
                    platform.role(account, ['admin']);
                json(res, 200, { items: (await platform.slots(id, url.searchParams.get('date') || (await platform.run(id)).businessTime.slice(0, 10), url.searchParams.get('kind') || 'entry', url.searchParams.get('lotId') || undefined)) });
                return true;
            }
            if (path === '/orders' || path === '/admin/orders') {
                if (path.startsWith('/admin'))
                    platform.role(account, ['admin']);
                json(res, 200, paginate(filtered([...(await platform.all<Booking>('orders', id)).filter(o => account.role === 'admin' || o.userId === account.id), ...(path.startsWith('/admin') ? backgroundOrders((await platform.run(id))) : [])], url), url));
                return true;
            }
            if (path === '/tasks' || path.startsWith('/tasks/') || path === '/ops/alerts' || path.startsWith('/ops/alerts/')) {
                platform.role(account, ['admin', 'staff']);
                const items = (await platform.all<Task>('tasks', id));
                if (path === '/tasks' || path === '/ops/alerts')
                    json(res, 200, paginate(filtered(items, url), url));
                else {
                    const task = items.find(t => t.id === path.split('/').at(-1));
                    assert(task, 'NOT_FOUND', '任务不存在', 404);
                    json(res, 200, task);
                }
                return true;
            }
            if (path === '/oa-requests' || path.startsWith('/oa-requests/')) {
                platform.role(account, ['admin', 'staff']);
                const items = (await platform.all<OA>('oa', id)).filter(o => url.searchParams.get('scope') !== 'mine' || o.applicantId === account.id);
                if (path === '/oa-requests')
                    json(res, 200, paginate(filtered(items, url), url));
                else {
                    const oa = items.find(o => o.id === path.split('/').at(-1));
                    assert(oa, 'NOT_FOUND', '申请不存在', 404);
                    json(res, 200, oa);
                }
                return true;
            }
            if(path==='/admin/chat-control'){platform.role(account,['admin']);json(res,200,{rooms:await chatRooms(store,id),global:await store.get('chat-control','global',id)||{id:'global',closed:false,version:0},controls:await store.list('chat-control',id)});return true;}
            if (path === '/chat/rooms') {
                json(res, 200, { items: (await chatRooms(store,id)).filter(r=>account.role!=='visitor'||!r.closed) });
                return true;
            }
            if (path === '/chat/messages') {
                const allowed=(await chatRooms(store,id)).filter(r=>!r.closed).map(r=>r.id);
                const messages = filtered((await platform.all<ChatMessage>('messages', id)).filter(m=>account.role!=='visitor'||allowed.includes(m.roomId)), url).map(m => ({ ...m, text: m.removed && account.role!=='admin' ? '消息已撤回' : m.text }));
                json(res, 200, paginate(messages, url));
                return true;
            }
            if (path === '/me/profile') {
                const profile = (await store.get<any>('profiles', account.id, id)) || { favourites: [], routeId: null, tour: null };
                if (profile.tour?.status === 'running') {
                    const route = platform.scenic.routes.find(r => r.id === profile.tour.routeId);
                    profile.tour.progress = Math.min(1, profile.tour.progress + ((await platform.run(id)).simulation.time - profile.tour.anchorTime) / (Math.max(1, route?.minutes || 60) * 60000));
                    if (profile.tour.progress >= 1)
                        profile.tour.status = 'completed';
                }
                json(res, 200, profile);
                return true;
            }
            if (path === '/notifications') {
                json(res, 200, { items: (await platform.all<any>('notifications', id)).filter(n => n.userId === account.id) });
                return true;
            }
            if (path === '/notices') {
                json(res, 200, { items: await asyncfilter((await platform.all<any>('notices', id)), async (n) => n.active && !n.suppressed && (!n.startsAt || Date.parse(n.startsAt) <= (await platform.run(id)).simulation.time) && (!n.expiresAt || Date.parse(n.expiresAt) > (await platform.run(id)).simulation.time) && (n.audience === 'public' || account.role !== 'visitor')) });
                return true;
            }
            if (path === '/admin/scenic') {
                platform.role(account, ['admin']);
                json(res, 200, (await store.get('content', 'scenic')) || { id: 'scenic', title: platform.scenic.name, body: '青岚山境，一程山水，自在游览。', version: 0 });
                return true;
            }
            if (path === '/admin/users') {
                platform.role(account, ['admin']);
                json(res, 200, paginate(filtered((await store.db.prepare("SELECT * FROM accounts").all()).map(r => store.account(r)), url), url));
                return true;
            }
            if (path === '/admin/facilities') {
                platform.role(account, ['admin']);
                const r = (await platform.run(id)),snapshot=await platform.snapshot(id);
                json(res, 200, { items: platform.scenic.points.map(p => ({ ...p, ...snapshot.public.points[p.id], ...r.overrides[p.id] })) });
                return true;
            }
            if (path === '/admin/devices') {
                platform.role(account, ['admin']);
                json(res, 200, (await deviceSnapshot(platform, id)));
                return true;
            }
            if (path === '/admin/service-status') {
                platform.role(account, ['admin']);
                const checkedAt = new Date().toISOString();
                json(res, 200, { source: 'mixed', checkedAt, modules: (await asyncmap(['backend', 'devices', 'visitor', 'admin', 'mobile', 'gate', 'ops'], async (module) => {
                        const connected = module === 'backend' || [...connections.values()].some(c => c.app === module && Date.now() - c.lastSeen < 15000);
                        if (module === 'devices') {
                            const devices = (await deviceSnapshot(platform, id));
                            return { id: module, name: module, source: 'mock', healthy: devices.items.filter(d => d.state === 'online').length, unhealthy: devices.items.filter(d => d.state === 'abnormal').length, unknown: devices.items.filter(d => d.state === 'offline').length, checkedAt: devices.checkedAt };
                        }
                        return { id: module, name: module, source: 'live', healthy: connected ? 1 : 0, unhealthy: 0, unknown: connected ? 0 : 1, checkedAt };
                    })) });
                return true;
            }
            if (path === '/admin/workspace') {
                platform.role(account, ['admin']);
                const run = (await platform.run(id)), snapshot = (await platform.snapshot(id, true));
                const global = Object.fromEntries((await asyncmap(['articles', 'knowledge', 'rules', 'inspections', 'content'], async (c) => [c, (await store.list(c))])));
                const business = Object.fromEntries((await asyncmap(['orders', 'notices', 'reports', 'appeals', 'moderation', 'mutes', 'inspection-schedule', 'oa'], async (c) => [c, (await store.list(c, id))])));
                const muteRows = (await store.db.prepare("SELECT id,data FROM documents WHERE collection='mutes' AND run_id=$1").all(id)) as {
                    id: string;
                    data: string;
                }[];
                business['inspection-schedule'] = ((await store.db.prepare("SELECT id,data FROM documents WHERE collection='inspection-schedule' AND run_id=$1").all(id)) as {
                    id: string;
                    data: string;
                }[]).map(row => ({ planId: row.id, ...JSON.parse(row.data) }));
                business.mutes = muteRows.map(row => ({ userId: row.id, ...JSON.parse(row.data) }));
                json(res, 200, { snapshot, global, business, users: (await store.db.prepare("SELECT * FROM accounts").all()).map(store.account), messages: (await platform.all<ChatMessage>('messages', id)).map(m => ({ ...m, text: m.removed && account.role!=='admin' ? '消息已撤回' : m.text })), background: backgroundOrders(run), overrides: run.overrides, slots: (await asyncflatMap([0, 1], async (offset) => { const date = new Date(run.simulation.time + offset * 86400000 + 8 * 3600000).toISOString().slice(0, 10); return (await [(await platform.slots(id, date, 'entry')), ...(await asyncmap(['p1', 'p2', 'p3'], async (lot) => (await platform.slots(id, date, 'parking', lot))))].flat()); })) });
                return true;
            }
            if (path === '/admin/dashboard') {
                platform.role(account, ['admin']);
                const snap = (await platform.snapshot(id, true));
                json(res, 200, { run: snap.run, visitors: snap.public.visitors, orders: (await platform.all('orders', id)).length, pendingAlerts: snap.alerts.filter(a => a.status !== 'resolved').length, pendingOA: (await platform.all<OA>('oa', id)).filter(o => o.status === 'pending').length, pendingReports: (await platform.all<any>('reports', id)).filter(o => o.status === 'pending').length });
                return true;
            }
            if (path.startsWith('/admin/')) {
                platform.role(account, ['admin']);
                const collection = path.split('/')[2];
                assert(['articles', 'notices', 'knowledge', 'rules', 'inspections', 'reports', 'appeals', 'moderation', 'logs', 'conversations'].includes(collection), 'NOT_FOUND', '接口不存在', 404);
                const items = await store.list<any>(collection, ['articles', 'knowledge', 'rules', 'inspections'].includes(collection) ? '' : id);
                const visible = collection === 'knowledge' ? items.filter(item => !item.deleted) : items;
                json(res, 200, paginate(filtered(visible, url), url));
                return true;
            }
            throw new DomainError('NOT_FOUND', '接口不存在', 404);
        }
        catch (error) {
            respondError(res,error);
            return true;
        }
    }
    function respondError(res:ServerResponse,error:unknown){
        if(res.headersSent)return;
        if(error instanceof DomainError||error instanceof RequestBodyError)fail(res,error.status,error.code,error.message);
        else if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01','57P02','57P03','53300'].includes(String((error as any)?.code))){
            fail(res,503,'DATABASE_UNAVAILABLE','数据库暂时不可用，请稍后重试');
        }else{console.error(error);fail(res,500,'INTERNAL_ERROR','服务处理失败，请重试');}
    }
    function attach(server: Server) {
        ws = new WebSocketServer({ server, path: '/ws' });
        ws.on('connection', (socket, req) => {
            const url=new URL(req.url||'/','http://localhost');
            const connection={app:url.searchParams.get('app')||'unknown',runId:url.searchParams.get('runId')||'',lastSeen:Date.now()};connections.set(socket,connection);
            socket.on('error',()=>socket.terminate());
            socket.on('message',()=>{connection.lastSeen=Date.now();if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'pong',runId:connection.runId,serverTime:new Date().toISOString()}));});
            socket.on('close',()=>connections.delete(socket));
            void platform.selected().then(id=>{connection.runId=id;if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'invalidate',runId:id}));}).catch(()=>socket.close(1013,'Database temporarily unavailable'));
        });
        let ticking=false;let tickDone:Promise<void>=Promise.resolve();
        const timer = setInterval(() => { if(ticking)return;ticking=true;tickDone=(async () => {
            try {
                const before = (await platform.run()).revision;
                (await platform.tick());
                if (before !== (await platform.run()).revision)
                    (await broadcast());
            }
            catch (e) {
                console.error('platform tick failed', e);
            }
        })().finally(()=>{ticking=false;}); }, 1000);
        timer.unref();
        return async () => { clearInterval(timer); ws.clients.forEach(c => c.terminate()); ws.close(); await tickDone; };
    }
    return { route:async(req:IncomingMessage,res:ServerResponse)=>{try{return await (req.method==='GET'?store.db.readTransaction(()=>route(req,res)):route(req,res));}catch(error){respondError(res,error);return true;}}, attach, user, runId, broadcast };
}
