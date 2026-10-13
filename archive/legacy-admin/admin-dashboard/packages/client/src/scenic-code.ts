/** Stable POI links do not embed transient run IDs. */
export const scenicOrigin = 'https://m.starhusk.com';
export function scenicCodeUrl(id:string){return scenicOrigin+'/#/pages/detail/index?id='+encodeURIComponent(id);}
export function resolveScenicCode(value:string,knownIds:readonly string[]):string {
 const code=value.trim();let id='';
 if(code.startsWith('qinglan://poi/')){const match=code.match(/^qinglan:\/\/poi\/([a-z0-9-]+)$/);if(match)id=match[1];}
 else {try{const url=new URL(code);if(url.origin===scenicOrigin&&url.pathname==='/'&&url.hash.startsWith('#/pages/detail/index?')){const query=new URLSearchParams(url.hash.split('?')[1]);if([...query.keys()].every(k=>k==='id'))id=query.get('id')||'';}}catch{/* Invalid URLs are rejected below. */}}
 if(!knownIds.includes(id))throw Error('未识别到有效景点介绍码，请重试或选择景点。');return id;
}
