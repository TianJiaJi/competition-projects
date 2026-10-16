export async function resetCampusDemo() {
  // The workbench and campus run on separate origins; reset the real service,
  // not the offline API-test fixtures and not another origin's browser storage.
  let response: Response;
  try {
    response = await fetch('http://localhost:5606/api/demo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'reset-campus-demo' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('无法确认校园重置结果，请确认预约请假服务（5606）已启动后重试；工作台记录已保留。');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.data?.reset !== true || typeof payload?.data?.revision !== 'string') {
    throw new Error('校园重置未完成，工作台记录已保留。' + (typeof payload?.error === 'string' ? payload.error : '请检查校园服务后重试。'));
  }
}
