import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const { Resvg } = require('@resvg/resvg-js');
const source = path.join(root, 'packages/ui/src/scenic-art/assets');
const mobile = path.join(root, 'apps/mobile/src/static/scenic-art');
await mkdir(mobile, { recursive: true });
for (const file of (await readdir(source)).filter(file => file.endsWith('.svg')).sort()) {
  const svg = await readFile(path.join(source, file), 'utf8');
  const key = path.basename(file, '.svg');
  for (const app of ['visitor', 'ops', 'admin']) {
    const publicDir = path.join(root, `apps/${app}/public`);
    await mkdir(path.join(publicDir, 'assets'), { recursive: true });
    await writeFile(path.join(publicDir, `assets/scenic-${key}.svg`), svg);
    if (key === 'logo') await writeFile(path.join(publicDir, 'favicon.svg'), svg);
  }
  await writeFile(path.join(mobile, `${key}.png`), new Resvg(svg, {
    fitTo: { mode: 'width', value: key === 'logo' ? 256 : 1200 },
  }).render().asPng());
}
console.log('Exported 11 shared SVG artworks to Web assets and mobile PNGs.');
