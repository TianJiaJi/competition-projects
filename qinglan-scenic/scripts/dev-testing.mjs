import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const campus = resolve(root, '../zhixing-campus');
export const services = [
  { id: 'public', name: '公共大屏', port: 5500 }, { id: 'ops', name: '运行大屏', port: 5501 },
  { id: 'mobile', name: '学生服务端', port: 5502 }, { id: 'staff', name: '教师工作台', port: 5503 },
  { id: 'admin', name: '管理后台', port: 5504 }, { id: 'booking', name: '预约请假服务', port: 5606 },
  { id: 'testing', name: '测试工作台', port: 5180 },
];
export function listening(port) { return new Promise(resolve => { const socket = createConnection({ host: 'localhost', port }); socket.setTimeout(800); const done = value => { socket.destroy(); resolve(value); }; socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.once('timeout', () => done(false)); }); }
export function verifyIdentity(service, status, body, html = '') {
  if (service.id === 'booking') { try { return status === 403 && JSON.parse(body).error === '教师身份不存在'; } catch { return false; } }
  if (service.id === 'testing') return status === 200 && body.includes('simulatedSample') && html.includes('服务测试工作台');
  return status === 200 && body.includes('/zhixing-campus/') && body.includes('import');
}
export async function probe(service, request = fetch, portCheck = listening) {
  const url = `http://localhost:${service.port}`;
  if (!await portCheck(service.port)) return { ...service, url, state: 'down', detail: '等待启动' };
  try {
    const route = service.id === 'booking' ? '/api/bookings?teacher=__environment_probe__' : service.id === 'testing' ? '/src/engine.ts' : '/src/main.ts';
    const response = await request(url + route, { signal: AbortSignal.timeout(2500) });
    const body = await response.text();
    const html = service.id === 'testing' ? await (await request(url, { signal: AbortSignal.timeout(2500) })).text() : '';
    return { ...service, url, state: verifyIdentity(service, response.status, body, html) ? 'ready' : 'conflict', detail: verifyIdentity(service, response.status, body, html) ? '项目身份已核验' : '端口已占用，但不是预期项目；请检查已有进程' };
  } catch { return { ...service, url, state: 'conflict', detail: '端口可连接，但项目尚未就绪或无法核验' }; }
}
export async function environment() { return { at: new Date().toISOString(), services: await Promise.all(services.filter(s => s.id !== 'testing').map(s => probe(s))) }; }
export function stopOwned(children, runner = spawn, platform = process.platform) {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (platform === 'win32') runner('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', error => console.error('停止子进程失败：', error.message));
    else child.kill('SIGTERM');
  }
}
export function startupPlan(states) {
  const conflict = states.find(s => s.state === 'conflict');
  if (conflict) throw Error(`${conflict.name} ${conflict.port}：${conflict.detail}`);
  return { reuse: states.filter(s => s.state === 'ready'), start: states.filter(s => s.state === 'down') };
}
export async function launch() {
  const children = []; let stopping = false;
  const stop = code => { if (stopping) return; stopping = true; stopOwned(children); process.exitCode = code; };
  process.once('SIGINT', () => stop(0)); process.once('SIGTERM', () => stop(0));
  try {
    // Preflight all occupied ports before launching anything; never kill an existing process.
    const states = await Promise.all(services.map(s => probe(s)));
    startupPlan(states);
    for (const service of states) {
      if (service.state === 'ready') { console.log(`[复用] ${service.name} ${service.url}`); continue; }
      const child = service.id === 'booking'
        ? spawn(process.execPath, ['scripts/booking-service.mjs'], { cwd: campus, stdio: 'inherit' })
        : spawn('pnpm', ['--filter', `${service.id === 'testing' ? '@scenic/testing' : '@scene/' + service.id}`, 'dev'], { cwd: service.id === 'testing' ? root : campus, stdio: 'inherit', shell: process.platform === 'win32' });
      children.push(child); console.log(`[启动] ${service.name} ${service.url}`);
      child.once('error', error => { console.error(error.message); stop(1); });
      child.once('exit', code => { if (!stopping) { console.error(`${service.name}已退出（${code}）`); stop(1); } });
    }
    const deadline = Date.now() + 60000;
    while (!stopping && Date.now() < deadline) {
      const checks = await Promise.all(services.map(s => probe(s)));
      if (checks.every(s => s.state === 'ready')) { console.log('\n[全部就绪] 智慧校园与测试工作台：http://localhost:5180'); return; }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    if (!stopping) throw Error('项目启动超时，请检查上述端口和日志。');
  } catch (error) { console.error(`[启动失败] ${error.message}`); stop(1); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await launch();
