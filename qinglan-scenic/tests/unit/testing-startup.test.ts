import { expect, it, vi } from 'vitest';
// @ts-expect-error Node launcher is exercised directly without a TS wrapper.
import { services, probe, verifyIdentity, startupPlan, stopOwned } from '../../scripts/dev-testing.mjs';
it('仅接受目标项目身份；开放端口本身不是身份', async () => {
  expect(verifyIdentity({ id: 'mobile' }, 200, 'import "/@fs/D:/zhixing-campus/node_modules/a.js"')).toBe(true);
  expect(verifyIdentity({ id: 'staff' }, 200, 'import "/yunqi-community/a.js"')).toBe(false);
  expect(verifyIdentity({ id: 'booking' }, 403, '{"error":"教师身份不存在"}')).toBe(true);
  expect(verifyIdentity({ id: 'booking' }, 200, '{"data":{"ok":true}}')).toBe(false);
  const request = vi.fn(async () => ({ status: 200, text: async () => '<html>other app</html>' }));
  expect((await probe(services[0], request, async () => true)).state).toBe('conflict');
  expect((await probe(services[0], request, async () => false)).state).toBe('down');
});
it('首次启动七项；再次全部复用；冲突不启动和不杀进程', () => {
  const cold = services.map((s: object) => ({ ...s, state: 'down' }));
  expect(startupPlan(cold).start).toHaveLength(7);
  expect(startupPlan(cold.map((s: object) => ({ ...s, state: 'ready' }))).start).toEqual([]);
  expect(() => startupPlan([{ name: '未知进程', port: 5502, state: 'conflict', detail: '身份不符' }])).toThrow('身份不符');
});
it('停止只处理本次拥有的子进程并保留已退出进程', () => {
  const active = { pid: 123, exitCode: null, kill: vi.fn() }, exited = { pid: 124, exitCode: 0, kill: vi.fn() };
  const runner = vi.fn(() => ({ on: vi.fn() })); stopOwned([active, exited], runner, 'win32');
  expect(runner).toHaveBeenCalledWith('taskkill', ['/PID', '123', '/T', '/F'], { stdio: 'ignore' });
  expect(runner).toHaveBeenCalledTimes(1); stopOwned([active, exited], runner, 'linux'); expect(active.kill).toHaveBeenCalledWith('SIGTERM'); expect(exited.kill).not.toHaveBeenCalled();
});
