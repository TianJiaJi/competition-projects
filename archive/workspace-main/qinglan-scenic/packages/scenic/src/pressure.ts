import type { PublicSnapshot } from '@scenic/contracts';
import { regions } from './data';

/** Presentation only: do not reuse these bands for routing or operational alerts. */
export const pressureBands = [
  { min: 0, color: '#3869A1', label: '宽松', range: '<30%' },
  { min: .3, color: '#83CBB6', label: '舒适', range: '30%–50%' },
  { min: .5, color: '#F3D985', label: '客流适中', range: '50%–70%' },
  { min: .7, color: '#DDAF35', label: '客流较多', range: '70%–80%' },
  { min: .8, color: '#E58B36', label: '承载预警', range: '80%–90%' },
  { min: .9, color: '#B33F36', label: '接近满载', range: '≥90%' },
] as const;
export const pressureUnknownColor = '#616D6A';
export const pressureNote = '按区域参考容量估算';
export function referencePressure(count: number | null | undefined, capacity: number | null | undefined) {
  if (count == null || capacity == null || !Number.isFinite(count) || !Number.isFinite(capacity) || count < 0 || capacity <= 0)
    return { ratio: null, band: -1, color: pressureUnknownColor, label: '状态未知' };
  const ratio = count / capacity;
  const band = pressureBands.reduce((index, item, i) => ratio >= item.min ? i : index, 0);
  return { ratio, band, color: pressureBands[band].color, label: ratio > 1 ? '超载' : ratio === 1 ? '满载' : pressureBands[band].label };
}
export function regionPressure(snapshot: PublicSnapshot, id: string) {
  const state = snapshot.regions[id], region = regions.find(item => item.id === id);
  const result = referencePressure(state?.count, region?.capacity);
  if (state?.availability !== 'open') return { ...result, ratio: null, band: -1, color: pressureUnknownColor, label: state?.availability === 'closed' || state?.availability === 'maintenance' ? '未开放' : '状态未知' };
  return result;
}
export function regionPressureSummary(snapshot: PublicSnapshot, id: string) {
  const pressure = regionPressure(snapshot, id), count = snapshot.regions[id]?.count;
  return `${count != null && Number.isFinite(count) && count >= 0 ? `约 ${count.toLocaleString('zh-CN')} 人 · ` : ''}${pressure.label}`;
}
export function regionPressureDetail(snapshot: PublicSnapshot, id: string) {
  const region = regions.find(item => item.id === id), pressure = regionPressure(snapshot, id);
  return `${regionPressureSummary(snapshot, id)} · 参考容量 ${region?.capacity?.toLocaleString('zh-CN') ?? '未知'} 人 · 参考承载率 ${pressure.ratio == null ? '未知' : `${(pressure.ratio * 100).toFixed(2)}%`} · ${pressureNote}`;
}

export const pressureGradient = 'linear-gradient(90deg, #3869A1 0%, #3869A1 20%, #83CBB6 35%, #F3D985 55%, #DDAF35 75%, #E58B36 85%, #B33F36 95%)';
export const pressureLegendDescription = '蓝色：低于30%；绿色：30%至50%；浅黄色：50%至70%；深黄色：70%至80%；橙色：80%至90%；红色：达到90%。按区域参考容量估算，未开放或未知为灰色。';
