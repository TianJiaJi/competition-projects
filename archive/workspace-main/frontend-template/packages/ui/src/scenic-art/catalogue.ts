/** Lightweight metadata: safe for uni-app; no Vue, raw SVG or browser dependency. */
export const scenicArtCatalogue = [
  { id: 'landscape', name: '青岚山境', alt: '青绿群山、溪湖、飞瀑与亭阁组成的景区全景插画' },
  { id: 'entry', name: '景区入口', alt: '松树与远山环绕的景区入口' },
  { id: 'creek', name: '听溪台', alt: '溪水绕过青石，木台临水而筑' },
  { id: 'bamboo', name: '竹影幽径', alt: '疏竹掩映下蜿蜒向前的石阶' },
  { id: 'gorge', name: '叠翠峡', alt: '层叠山壁之间的一线溪谷' },
  { id: 'summit', name: '望岳台', alt: '云海之上的山顶观景亭与远山' },
  { id: 'falls', name: '飞瀑亭', alt: '山壁飞瀑落入碧潭，亭阁立于岸边' },
  { id: 'lake', name: '镜湖栈道', alt: '青山倒映湖面，栈道沿岸伸展' },
  { id: 'forest', name: '松风林', alt: '松林间的弯曲小径与休憩石凳' },
  { id: 'market', name: '归云集 · 出口商业区', alt: '山间集市的屋檐、摊棚与街巷' },
] as const;
export type ScenicArtId = typeof scenicArtCatalogue[number]['id'];
export type ScenicArtPointId = Exclude<ScenicArtId, 'landscape'>;
export function scenicArtForPoint(id?: string | null) {
  return scenicArtCatalogue.find(item => item.id === id) ?? scenicArtCatalogue[0];
}
/** Exported static resources; unknown point IDs intentionally use the panorama. */
export function scenicArtUrl(id?: string | null, target: 'web' | 'mobile' = 'web'): string {
  const key = scenicArtForPoint(id).id;
  return target === 'mobile' ? `/static/scenic-art/${key}.png` : `/assets/scenic-${key}.svg`;
}
