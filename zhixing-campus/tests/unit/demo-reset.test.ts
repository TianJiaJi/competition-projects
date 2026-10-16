import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchDemoReset } from '../../packages/bookings/src/demo-reset';

let revision = 'initial';
let stop: (() => void) | undefined;
let focus: EventTarget;
let visibility: EventTarget;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  revision = 'initial';
  focus = new EventTarget(); visibility = new EventTarget();
  vi.stubGlobal('window', focus); vi.stubGlobal('document', visibility);
  fetchMock.mockReset().mockImplementation(async () => ({ ok: true, json: async () => ({ data: { revision } }) }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { stop?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('初次连接不重置，版本变化时只恢复一次并释放监听', async () => {
  const reset = vi.fn();
  stop = watchDemoReset(reset, 'http://localhost:15606');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:15606/api/demo/revision');
  expect(reset).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(reset).not.toHaveBeenCalled();
  revision = 'reset';
  await vi.advanceTimersByTimeAsync(2000);
  expect(reset).toHaveBeenCalledTimes(1);
  focus.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(reset).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('离线不清空，重新切回页面时补查漏掉的重置', async () => {
  const reset = vi.fn(); stop = watchDemoReset(reset);
  await vi.advanceTimersByTimeAsync(0);
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await vi.advanceTimersByTimeAsync(2000);
  expect(reset).not.toHaveBeenCalled();
  revision = 'reset-while-hidden';
  visibility.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(reset).toHaveBeenCalledTimes(1);
});

it('无效响应不触发重置，停止后忽略尚未返回的请求', async () => {
  const reset = vi.fn(); stop = watchDemoReset(reset);
  await vi.advanceTimersByTimeAsync(0);
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) });
  await vi.advanceTimersByTimeAsync(2000);
  expect(reset).not.toHaveBeenCalled();
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  focus.dispatchEvent(new Event('focus'));
  stop();
  finish({ ok: true, json: async () => ({ data: { revision: 'too-late' } }) });
  await vi.advanceTimersByTimeAsync(0);
  expect(reset).not.toHaveBeenCalled();
});
