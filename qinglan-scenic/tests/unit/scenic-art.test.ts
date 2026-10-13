import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { scenicArtCatalogue, scenicArtForPoint, scenicArtUrl } from '../../packages/ui/src/scenic-art/catalogue';
import { scenicArtSvg } from '../../packages/ui/src/scenic-art/svg';

describe('shared scenic artwork', () => {
  it('maps all nine destinations and falls back safely for facilities and unknown IDs', () => {
    expect(scenicArtCatalogue).toHaveLength(10);
    for (const item of scenicArtCatalogue) {
      expect(scenicArtForPoint(item.id)).toEqual(item);
      expect(scenicArtUrl(item.id)).toBe(`/assets/scenic-${item.id}.svg`);
      expect(scenicArtUrl(item.id, 'mobile')).toBe(`/static/scenic-art/${item.id}.png`);
    }
    for (const id of [undefined, null, '', 't1', 'upper', 'missing', '__proto__']) {
      expect(scenicArtForPoint(id).id).toBe('landscape');
    }
  });
  it('ships matching SVGs and correctly sized PNG derivatives without changing legacy URLs', () => {
    const source = 'packages/ui/src/scenic-art/assets';
    const files = readdirSync(source).filter(file => file.endsWith('.svg'));
    expect(files).toHaveLength(11);
    for (const file of files) {
      const id = file.replace('.svg', '');
      const svg = readFileSync(`${source}/${file}`, 'utf8');
      expect(svg).toContain(id === 'logo' ? 'viewBox="0 0 256 256"' : 'viewBox="0 0 1200 800"');
      expect(svg).not.toMatch(/<image|<script|<foreignObject|<text|<animate|<filter/);
      for (const app of ['visitor', 'ops', 'admin']) {
        expect(readFileSync(`apps/${app}/public/assets/scenic-${id}.svg`, 'utf8')).toBe(svg);
      }
      const png = readFileSync(`apps/mobile/src/static/scenic-art/${id}.png`);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(id === 'logo' ? 256 : 1200);
      expect(png.readUInt32BE(20)).toBe(id === 'logo' ? 256 : 800);
    }
  });
  it('scopes gradient references for repeated instances and supports cover cropping', () => {
    const first = scenicArtSvg('falls', 'first');
    const second = scenicArtSvg('falls', 'second', 'cover');
    expect(first).toContain('id="first-mountain"');
    expect(first).toContain('url(#first-mountain)');
    expect(second).toContain('id="second-mountain"');
    expect(second).not.toContain('first-mountain');
    expect(second).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(first).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(scenicArtSvg('missing', 'a')).toBe(scenicArtSvg('landscape', 'a'));
  });
});
