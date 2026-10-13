import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
const scenic=JSON.parse(await readFile(new URL('../packages/scenic/generated/mobile.json',import.meta.url),'utf8'));
const directory=resolve(process.argv[2]||'assets/景点二维码');await mkdir(directory,{recursive:true});
const items=[];
for(const point of scenic.points.filter(p=>p.kind==='attraction')){
 const url='https://m.starhusk.com/#/pages/detail/index?id='+encodeURIComponent(point.id),name=point.name+'.png';
 if(/[\\/]/.test(name))throw Error('不合法的文件名');
 const buffer=await QRCode.toBuffer(url,{type:'png',width:1024,margin:4,errorCorrectionLevel:'M'}),png=PNG.sync.read(buffer),decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
 if(decoded?.data!==url)throw Error('二维码解码校验失败：'+name);
 await writeFile(resolve(directory,name),buffer);items.push({id:point.id,name:point.name,file:name,url,decodeVerified:true});
}
await writeFile(resolve(directory,'映射清单.json'),JSON.stringify({origin:'https://m.starhusk.com',deploymentVerified:false,items},null,2)+'\n');console.log('已导出并解码验证 '+items.length+' 张景点二维码：'+directory);
