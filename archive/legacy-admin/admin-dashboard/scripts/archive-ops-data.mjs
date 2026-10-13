// Export the current deterministic prototype, without starting a listening server.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, process.argv[2] ?? 'docs/archive/园方大屏-2026-09-12');
const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom', ssr: { noExternal: ['@scenic/client', '@scenic/scenic', '@scenic/contracts'] } });
const write = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
try {
  const { buildSnapshot, scenarios } = await server.ssrLoadModule('/tests/fixtures/ops.ts');
  const { summarizeAlerts } = await server.ssrLoadModule('/apps/ops/src/alert-stats.ts');
  const { regions, points } = await server.ssrLoadModule('/packages/scenic/src/index.ts');
  mkdirSync(output, { recursive: true });
  const samples = scenarios.map(({ id }) => {
    const snapshot = buildSnapshot(id);
    return { snapshot, statistics: summarizeAlerts(snapshot.alerts, snapshot.businessTime) };
  });
  write('运行场景快照.json', { description: '固定前端 Mock 归档，非接口响应；statistics 为当前前端派生结果', samples });
  write('区域与点位.json', { regions, points });
  write('数据校验清单.json', {
    algorithm: 'sha256',
    files: Object.fromEntries(['运行场景快照.json', '区域与点位.json'].map(name => [name, createHash('sha256').update(readFileSync(resolve(output, name))).digest('hex')])),
    scenarios: samples.map(({ snapshot: s, statistics }) => ({
      id: s.id, businessTime: s.businessTime, visitors: s.public.visitors,
      regionTotal: Object.values(s.public.regions).reduce((sum, r) => sum + r.count, 0),
      parkingFree: s.public.parkingFree,
      parkingTotalFree: points.filter(p => p.kind === 'parking').reduce((sum, p) => sum + s.public.points[p.id].parkingFree, 0),
      currentTrend: s.history.at(-1), active: s.alerts.filter(a => a.status !== 'resolved').length,
      criticalActive: s.alerts.filter(a => a.status !== 'resolved' && a.severity === 'critical').length,
      eventCount: s.events.length, statistics,
    })),
  });
  console.log(`已导出 ${samples.length} 种运行场景、${regions.length} 个区域、${points.length} 个点位：${output}`);
} finally { await server.close(); }
