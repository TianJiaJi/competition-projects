import {it,expect} from 'vitest';
import {formatNumber} from '../../packages/client/src/format-number';
it('显示小数固定两位，整数不补零，未知值不伪装为零',()=>{expect(formatNumber(2.345678)).toBe('2.35');expect(formatNumber(1.2)).toBe('1.20');expect(formatNumber(10000)).toBe('10,000');expect(formatNumber(null)).toBe('—');expect(formatNumber(NaN)).toBe('—');});
