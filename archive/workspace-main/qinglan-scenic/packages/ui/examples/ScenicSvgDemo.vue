<script setup lang="ts">
import {computed,ref,onMounted,onUnmounted} from 'vue';
import {ScenicSvgMap,createScenicSvg} from '../src/scenic-svg';
const zoom=ref(1),comparison=ref(false),labels=ref(true),facilities=ref(true);
const scroller=ref<HTMLElement>();
const available=ref({width:1000,height:780});
let observer:ResizeObserver|undefined;
onMounted(()=>{observer=new ResizeObserver(([entry])=>{available.value={width:entry.contentRect.width,height:entry.contentRect.height};});if(scroller.value)observer.observe(scroller.value);});
onUnmounted(()=>observer?.disconnect());
const stageWidth=computed(()=>{
  const {width,height}=available.value;
  const columns=comparison.value&&width>760?2:1;
  return Math.min(width,(height-74)*columns+56+(columns-1)*26)*zoom.value;
});
const zoomText=computed(()=>`${Math.round(zoom.value*100)}%`);
function changeZoom(value:number){zoom.value=Math.max(1,Math.min(4,value));}
function reset(){zoom.value=1;scroller.value?.scrollTo({top:0,left:0,behavior:'smooth'});}
function download(){
  const svg=createScenicSvg({style:'qinglv',showLabels:labels.value,showFacilities:facilities.value,idPrefix:'qinglan-export'});
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='青岚山境-青绿山水游览图.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
</script>
<template>
  <div class="atlas-page">
    <header class="masthead">
      <a href="./scenic-svg.html" class="wordmark"><span class="seal">青<br>岚</span><span>青岚山境<small>山水图志 · 游览图</small></span></a>
      <div class="edition"><span></span> 青绿山水 · 精绘版 <i>壹</i></div>
      <button class="download" @click="download">下载 SVG <span aria-hidden="true">↗</span></button>
    </header>
    <main>
      <section class="intro">
        <div><p class="eyebrow">山 有 层 次 · 水 有 留 白</p><h1>一图入山境</h1><p class="subtitle">循石径入青山，随水声寻亭阁。展开细看，山水皆可游。</p></div>
        <div class="art-note"><span>青绿设色<br>墨骨写意</span><span class="note-rule"></span><p>峰峦、松竹与亭阁<br>落在同一张游览图中</p></div>
      </section>
      <section class="map-workspace" aria-label="地图预览">
        <div class="toolbar">
          <div class="view-switch"><button :class="{active:!comparison}" :aria-pressed="!comparison" @click="comparison=false">山水全图</button><button :class="{active:comparison}" :aria-pressed="comparison" @click="comparison=true">原版对照</button></div>
          <div class="layer-switch"><label><input v-model="labels" type="checkbox">景点名称</label><label><input v-model="facilities" type="checkbox">服务设施</label></div>
          <div class="zoom"><button aria-label="缩小" :disabled="zoom<=1" @click="changeZoom(zoom-.5)">−</button><output aria-live="polite">{{zoomText}}</output><button aria-label="放大" :disabled="zoom>=4" @click="changeZoom(zoom+.5)">＋</button><button class="reset" @click="reset">全图</button></div>
        </div>
        <div ref="scroller" class="map-scroll" tabindex="0" aria-label="可滚动地图，使用工具栏放大查看细节">
          <div class="map-stage" :class="{compare:comparison}" :style="{width:`${stageWidth}px`}">
            <figure v-if="comparison"><figcaption><span>01</span> 原版 · 平面导览</figcaption><div class="map-frame"><ScenicSvgMap map-style="classic" :show-labels="labels" :show-facilities="facilities" /></div></figure>
            <figure><figcaption><span>{{comparison?'02':'图卷'}}</span> 青绿山水 · 青岚山境 <em>北向朝上</em></figcaption><div class="map-frame" data-testid="qinglv-art"><ScenicSvgMap map-style="qinglv" :show-labels="labels" :show-facilities="facilities" /></div></figure>
          </div>
        </div>
        <footer class="map-footer"><span><i></i> 青绿山水游览图</span><p>支持 100%—400% 放大 · 放大后可横向及纵向滚动</p><span>QINGLAN · 山水图志</span></footer>
      </section>
      <section class="reading-notes"><div><span>01 / 观山</span><h2>千岩叠翠</h2><p>石青入山骨，石绿染坡面。远峰淡，近山实，松影落在皴线之间。</p></div><div><span>02 / 听水</span><h2>飞瀑入镜湖</h2><p>循白色水练而下，潭雾渐散。岸石、浅滩与疏朗水纹，接住一湖山色。</p></div><div><span>03 / 寻径</span><h2>亭阁有归处</h2><p>沿石径、山阶和木桥辨认方向，寻访望岳台、飞瀑亭与山间小集。</p></div></section>
    </main>
    <footer class="colophon"><span>青岚山境</span><p>青山可望 · 曲径可游</p><span>山水游览图 / 01</span></footer>
  </div>
</template>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f1e9;color:#31483f;font-family:"Songti SC","STSong",serif}button,a,input{-webkit-tap-highlight-color:transparent}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,.map-scroll:focus-visible{outline:2px solid #9b613f;outline-offset:4px}button:disabled{opacity:.3;cursor:default}.atlas-page{max-width:1800px;margin:auto;padding:0 56px}.masthead{height:110px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d9d9cc}.wordmark{display:flex;align-items:center;gap:14px;font-size:23px;letter-spacing:3px;color:inherit;text-decoration:none}.wordmark small{display:block;font-size:10px;letter-spacing:2px;margin-top:7px;color:#849080}.seal{background:#994d37;color:#faf0dc;font-size:17px;line-height:20px;padding:7px 9px;border:1px solid #f1dfc6;outline:1px solid #994d37;letter-spacing:0}.edition{display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:2px;color:#798573}.edition>span{width:5px;height:5px;background:#7b9277;border-radius:50%}.edition i{font-style:normal;border:1px solid #cbcdbb;padding:3px;font-size:10px;margin-left:12px}.download{border:1px solid #314e40;background:#314e40;color:#faf6e9;padding:13px 19px;font-size:12px;letter-spacing:1px;border-radius:2px}.download span{margin-left:28px}.intro{padding:49px 0 34px;display:flex;align-items:center;justify-content:space-between}.eyebrow{font-size:10px;letter-spacing:2px;color:#8d876f;margin:0 0 16px}h1{font-size:37px;font-weight:500;letter-spacing:4px;margin:0 0 15px}.subtitle{font-size:13px;letter-spacing:1px;color:#78816f;margin:0}.art-note{display:flex;align-items:center;gap:22px;font-size:12px;line-height:2;letter-spacing:2px;color:#73816c}.art-note>span:first-child{color:#536b54}.note-rule{height:44px;width:1px;background:#c6cbb9}.art-note p{font-size:11px;color:#8c927f}.map-workspace{border:1px solid #d6d9cb;border-radius:3px;background:#fbf8ef;box-shadow:0 12px 40px #414d3510;overflow:hidden}.toolbar{min-height:65px;display:flex;justify-content:space-between;align-items:center;padding:12px 23px;border-bottom:1px solid #dce0d2;gap:20px;background:#f9f7f0;font-family:system-ui,sans-serif;font-size:11px}.view-switch{display:flex;gap:4px}.view-switch button{padding:9px 14px;border:0;background:transparent;color:#7a8473;border-radius:3px}.view-switch .active{background:#e9ede2;color:#395943}.layer-switch{display:flex;gap:20px;margin-left:auto;margin-right:25px;color:#737e6d}.layer-switch label{display:flex;align-items:center;gap:6px;cursor:pointer}.layer-switch input{accent-color:#537254;width:12px;height:12px}.zoom{display:flex;align-items:center;gap:8px}.zoom button{border:0;background:transparent;font-size:17px;color:#5c715b;padding:5px 8px}.zoom output{font-size:11px;min-width:38px;text-align:center;font-variant-numeric:tabular-nums;color:#6f7c68}.zoom .reset{font-size:11px;border-left:1px solid #d2d8c8;border-radius:0;padding-left:16px;margin-left:6px}.map-scroll{overflow:auto;height:clamp(420px,76vh,1050px);min-height:400px;overscroll-behavior:contain;background:#fcf9f0;scrollbar-color:#b4bfa9 #f6f2e8}.map-stage{display:grid;grid-template-columns:1fr;margin-inline:auto;padding:22px 28px}.map-stage.compare{grid-template-columns:1fr 1fr;gap:26px}.map-stage figure{margin:0;min-width:0}.map-stage figcaption{font-size:10px;letter-spacing:1px;color:#8a927d;display:flex;align-items:center;gap:12px;height:24px}.map-stage figcaption span{font-size:9px;color:#a0a48d}.map-stage figcaption em{margin-left:auto;font-style:normal;font-size:9px}.map-frame{aspect-ratio:1;width:100%;max-width:none}.map-footer{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;gap:15px;border-top:1px solid #dde0d3;color:#8a9380;font-size:10px;letter-spacing:1px}.map-footer p{margin:0;font-size:10px}.map-footer i{display:inline-block;width:5px;height:5px;background:#9b7251;border-radius:50%;margin-right:8px}.map-footer>span:last-child{font-size:9px;letter-spacing:2px}.reading-notes{display:grid;grid-template-columns:repeat(3,1fr);gap:55px;padding:38px 0 42px}.reading-notes>div{padding-left:18px;border-left:1px solid #d6dbc9}.reading-notes span{font-size:9px;letter-spacing:2px;color:#9a9d83}.reading-notes h2{font-size:17px;font-weight:500;letter-spacing:2px;margin:11px 0}.reading-notes p{font-size:12px;line-height:1.9;margin:0;color:#869079;max-width:310px}.colophon{border-top:1px solid #d6d9cc;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#929781;padding:23px 0;letter-spacing:2px}.colophon p{margin:0}@media(max-width:760px){.atlas-page{padding:0 18px}.masthead{height:84px}.wordmark{font-size:19px}.edition{display:none}.download{padding:10px}.download span{margin-left:8px}.intro{padding:32px 0 25px}.intro h1{font-size:29px}.subtitle{font-size:11px;line-height:1.8}.art-note{display:none}.toolbar{flex-wrap:wrap;padding:10px 12px;gap:8px}.layer-switch{order:3;flex-basis:100%;margin:0;padding:6px}.zoom{gap:2px}.view-switch button{padding:8px 10px}.map-stage{padding:12px 8px}.map-stage.compare{grid-template-columns:1fr;gap:25px}.map-scroll{min-height:320px;max-height:75vh}.map-footer{padding:12px;flex-wrap:wrap;line-height:1.7}.map-footer>span:last-child{display:none}.reading-notes{gap:18px;grid-template-columns:1fr;padding:28px 0}.colophon{font-size:8px}}
</style>
