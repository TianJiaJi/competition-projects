// Run from the workspace root with the visitor preview already running on 5173.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  const { snapshot, ...staticData } = await page.evaluate(async root => {
    const scenic = await import(`${root}/packages/scenic/src/index.ts`);
    const client = await import(`${root}/packages/client/testing/snapshot.ts`);
    return {
      points: scenic.points, nodes: scenic.nodes, edges: scenic.edges, regions: scenic.regions,
      snapshot: client.sampleSnapshot(new Date('2026-09-11T04:00:00Z')),
    };
  }, `/@fs${process.cwd()}`);
  await mkdir('apps/visitor/docs', { recursive: true });
  for (const [name, data] of [
    ['静态点位与路网.json', staticData],
    ['演示快照-20260911-120000.json', snapshot],
  ]) await writeFile(`apps/visitor/docs/${name}`, `${JSON.stringify(data, null, 2)}\n`);
  console.log('游客端点位、完整路网和固定时刻快照已归档。');
} finally {
  await browser.close(); // Keep the existing preview server running.
}
