/** Export reproducible review artifacts from the same independent map the user sees. */
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'.local/qa/qinglv');
const base=process.argv.find(a=>a.startsWith('--base-url='))?.slice(11)??'http://127.0.0.1:5174';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  await page.goto(`${base}/scenic-svg.html`);
  await page.locator('[data-map-style="qinglv"]').waitFor();
  await page.screenshot({path:path.join(out,'preview-page.png'),fullPage:true});
  const wait=page.waitForEvent('download');await page.getByRole('button',{name:'下载 SVG'}).click();
  const download=await wait;
  const svgPath=path.join(out,download.suggestedFilename());await download.saveAs(svgPath);
  const svg=await readFile(svgPath,'utf8');
  await page.getByRole('button',{name:'原版对照',exact:true}).click();
  const classic=await page.locator('.map-frame svg').first().evaluate(el=>el.outerHTML);
  await page.setViewportSize({width:2200,height:1160});
  await page.setContent(`<body style="margin:0;background:#fcf9f0;color:#3c5748;font-family:'Songti SC',serif"><div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:20px 35px"><section><h2 style="font-size:22px;font-weight:400">原版 · 平面导览</h2>${classic}</section><section><h2 style="font-size:22px;font-weight:400">青绿山水 · 曲线写意</h2>${svg}</section></div></body>`);
  await page.screenshot({path:path.join(out,'comparison.png'),fullPage:true});
  async function render(name,box,width,height){
    const artwork=box?svg.replace('viewBox="-37 -36 76 76"',`viewBox="${box.join(' ')}"`):svg;
    await page.setViewportSize({width,height});
    await page.setContent(`<body style="margin:0;background:#fcf9f0"><style>svg{display:block;width:100vw;height:100vh}</style>${artwork}</body>`);
    await page.screenshot({path:path.join(out,name)});
  }
  await render('map-full.png',null,1600,1600);
  await render('detail-summit.png',[-12,-34,30,22.5],1200,900);
  await render('detail-falls.png',[-21,-30,22,27],1000,1227);
  await render('detail-bamboo.png',[15,-6,20,16],1200,960);
  await render('detail-entry.png',[-25,15,46,22],1500,717);
  await render('zoom-200.png',[-20,-25,38,38],1200,1200);
  await render('zoom-400.png',[-15,-22,19,19],1200,1200);
  await writeFile(path.join(out,'README.md'),`# 青岚山境 · 青绿山水游览图\n\n- 独立 SVG：青岚山境-青绿山水游览图.svg\n- 整体效果：map-full.png\n- 预览页面：preview-page.png\n- 原版对照：comparison.png\n- 局部：detail-summit.png / detail-falls.png / detail-bamboo.png / detail-entry.png\n- 放大检查：zoom-200.png / zoom-400.png\n\n保留景点锚点和连接关系；采用独立曲线绘画路线，风格化优先。\n`);
  console.log(`Exported ${svg.length.toLocaleString()} SVG characters and 9 review images to ${out}`);
}finally{await browser.close();}
