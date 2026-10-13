import landscape from './assets/landscape.svg?raw';
import entry from './assets/entry.svg?raw';
import creek from './assets/creek.svg?raw';
import bamboo from './assets/bamboo.svg?raw';
import gorge from './assets/gorge.svg?raw';
import summit from './assets/summit.svg?raw';
import falls from './assets/falls.svg?raw';
import lake from './assets/lake.svg?raw';
import forest from './assets/forest.svg?raw';
import market from './assets/market.svg?raw';
import logo from './assets/logo.svg?raw';
import { scenicArtForPoint } from './catalogue';
const sources = { landscape, entry, creek, bamboo, gorge, summit, falls, lake, forest, market, logo };
/** Only trusted, bundled artwork is inserted as markup. Every instance scopes its defs. */
export function scenicArtSvg(id: string | undefined, prefix: string, fit: 'contain' | 'cover' = 'contain') {
  const key = id === 'logo' ? 'logo' : scenicArtForPoint(id).id;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sources[key]
    .replace(/id="([^"]+)"/g, (_, name: string) => `id="${safePrefix}-${name}"`)
    .replace(/url\(#([^)]+)\)/g, (_, name: string) => `url(#${safePrefix}-${name})`)
    .replace('<svg ', `<svg aria-hidden="true" focusable="false" width="100%" height="100%" preserveAspectRatio="xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}" `);
}
