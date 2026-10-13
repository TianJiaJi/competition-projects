/** Display rounding only; calculation and ledger precision remain unchanged. */
export function formatNumber(value:number|null|undefined):string {
 if(value==null||!Number.isFinite(value))return '—';
 return value.toLocaleString('zh-CN',{minimumFractionDigits:Number.isInteger(value)?0:2,maximumFractionDigits:2});
}
