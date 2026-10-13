import { testStore } from '../helpers/postgres';
import { it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../apps/server/src/platform/store';
import { createPlatform } from '../../apps/server/src/platform/service';
import { startAI } from '../../apps/server/src/platform/ai';
import { sources } from '../../apps/server/src/knowledge';
const dispose: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const f of dispose.splice(0).reverse())
        await f();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});
async function setup() { const fixture = await testStore(), store = fixture.store; dispose.push(fixture.close); const p = createPlatform(store), a = (await store.login('admin01', '123456')).user, v = (await store.login('visitor01', '123456')).user; const r = (await p.write(a, (await p.selected()), 'new-test-run', '/demo/runs', { mode: 'replay', scenario: 'weekday' })) as any; return { p, store, a, v, id: r.id }; }
it('核心景点知识包含可持续扩写的固定设定', () => { const lore = sources.filter(s => s.id.startsWith('poi-')).map(s => s.excerpt).join(''); expect(lore).toContain('核心设定：'); expect(lore).toContain('听溪台是青岚山境最早的观水点'); expect(lore).toContain('镜湖栈道沿着一处古老的山间堰湖展开'); expect(lore).toContain('松风林曾是护林人轮值歇脚的地方'); });
it('AI文本试测及真实消息检测使用模型结果，试测不撤回任何消息', async () => { const { p, store, a, v, id } = (await setup()); const message = (await p.write(v, id, 'new-visitor-message', '/chat/messages', { roomId: 'lobby', text: '服务很慢，希望改进' })) as any; const sample = (await p.write(a, id, 'new-sample-check', '/admin/moderation/check', { text: '检测用句子' })) as any; vi.stubEnv('DEEPSEEK_API_KEY', 'test-key'); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: 'pass', reason: '正常意见，予以保留', category: 'complaint' }) } }] }), { status: 200 })));  dispose.push(startAI(p, async () => { })); await vi.waitFor(async()=>expect((await store.get<any>('moderation',sample.id,id)).status).toBe('passed'),{timeout:15000}); expect((await store.get<any>('moderation', sample.id, id)).status).toBe('passed'); expect((await store.get<any>('messages', message.id, id)).removed).toBe(false); expect((await p.all('messages', id))).toHaveLength(1); await vi.waitFor(async()=>expect((await store.get<any>('moderation',message.id,id)).reason).toBe('正常意见，予以保留'),{timeout:10000}); });
it('未配置模型直接终止审核，不进入重试队列', async () => { const { p, store, a, id } = (await setup()); const sample = (await p.write(a, id, 'missing-model-check', '/admin/moderation/check', { text: '试测' })) as any; vi.stubEnv('DEEPSEEK_API_KEY', ''); dispose.push(startAI(p, async () => { })); await vi.waitFor(async()=>expect((await store.get<any>('moderation',sample.id,id)).status).toBe('skipped'),{timeout:10000}); expect((await store.get<any>('moderation', sample.id,id))).toMatchObject({ status: 'skipped', error: 'MODEL_NOT_CONFIGURED', attempts: 1 }); });
it('模型故障可追溯并等待重试，不伪装检测通过', async () => { const { p, store, a, id } = (await setup()); const sample = (await p.write(a, id, 'failed-model-check', '/admin/moderation/check', { text: '试测' })) as any; vi.stubEnv('DEEPSEEK_API_KEY', 'test-key'); vi.stubGlobal('fetch', vi.fn(async () => { throw Error('MODEL_TIMEOUT'); }));  dispose.push(startAI(p, async () => { })); await vi.waitFor(async()=>expect((await store.get<any>('moderation',sample.id,id)).status).toBe('retry'),{timeout:10000}); expect((await store.get<any>('moderation', sample.id, id))).toMatchObject({ status: 'retry', error: 'MODEL_TIMEOUT', attempts: 1 }); });
it('人工公告起止约束、草稿与删除抑制，资讯保留原表单字段', async () => { const { p, a, id } = (await setup()); const article = (await p.write(a, id, 'save-rich-article', '/admin/articles', { title: '测试资讯', body: '正文', summary: '摘要', category: 'news', coverUrl: '/assets/scenic-landscape.svg', published: true })) as any; expect(article).toMatchObject({ summary: '摘要', category: 'news', coverUrl: '/assets/scenic-landscape.svg' }); const n = (await p.write(a, id, 'future-notice-create', '/admin/notices', { title: '未来公告', body: '正文', published: true, startsAt: '2026-09-14T11:00:00+08:00', expiresAt: '2026-09-14T11:10:00+08:00' })) as any; expect((await p.snapshot(id)).public.announcements.some(x => x.id === n.id)).toBe(false); (await p.write(a, id, 'future-notice-delete', '/admin/notices/' + n.id, { action: 'delete', expectedVersion: n.version })); (await p.write(a, id, 'jump-to-notice-start', '/demo/clock', { time: '2026-09-14T11:01:00+08:00', paused: true })); expect((await p.snapshot(id)).public.announcements.some(x => x.id === n.id)).toBe(false); });
it('重复写入不会将检查点嵌套进检查点，回放状态仍可恢复', async () => {
    const { p, store, a, id } = (await setup());
    for (let i = 0; i < 24; i++)
        (await p.write(a, id, 'checkpoint-toggle-' + i, '/demo/employees', { enabled: i % 2 === 0 }));
    const checkpoints = (await store.list<any>('checkpoints', id));
    expect(checkpoints.length).toBeGreaterThan(0);
    for (const c of checkpoints) {
        expect(c.rows.some((row: any) => row.collection === 'checkpoints')).toBe(false);
        expect(JSON.stringify(c).length).toBeLessThan(500000);
    }
});
