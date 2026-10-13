<script setup lang="ts">
import { ref } from 'vue';
import { ScenicIllustration, ScenicLogo, scenicArtCatalogue } from '../src/scenic-art';
const crop = ref(false);
const assets = import.meta.glob('../src/scenic-art/assets/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const download = (id: string) => assets[`../src/scenic-art/assets/${id}.svg`];
</script>
<template>
  <main>
    <header><div class="identity"><ScenicLogo :size="56" /><div><p class="eyebrow">QINGLAN · SCENIC ART</p><h1>青岚山境 · 山水图集</h1></div></div><p class="intro">山有轮廓，水有留白。十一幅青绿插画，描绘同一程风景。</p></header>
    <section class="logo-strip" aria-label="圆形品牌标志">
      <div><p class="eyebrow">01 / BRAND</p><h2>山水之间</h2><p>山峰与溪流，以负形相连。</p></div>
      <div class="sizes"><div v-for="size in [16,24,32,64]" :key="size"><ScenicLogo :size="size" /><small>{{ size }}px</small></div></div>
      <a :href="download('logo')" download="qinglan-logo.svg">下载 Logo ↗</a>
    </section>
    <section class="panorama"><ScenicIllustration fit="cover" style="aspect-ratio: 16 / 9" /><div><p class="eyebrow">02 / PANORAMA</p><h2>一程山水，自在游览。</h2><a :href="download('landscape')" download="qinglan-landscape.svg">下载全景 ↗</a></div></section>
    <div class="section-heading"><div><p class="eyebrow">03 / PLACES</p><h2>沿途九景</h2></div><label><input v-model="crop" type="checkbox" /> 横幅裁切预览 · 16:9</label></div>
    <section class="grid" aria-label="景点插画">
      <article v-for="item in scenicArtCatalogue.slice(1)" :key="item.id">
        <ScenicIllustration :point-id="item.id" :fit="crop ? 'cover' : 'contain'" :style="{ aspectRatio: crop ? '16/9' : '3/2' }" />
        <div class="caption"><div><h3>{{ item.name }}</h3><p>{{ item.alt }}</p></div><a :href="download(item.id)" :download="`qinglan-${item.id}.svg`" :aria-label="`下载${item.name} SVG`">SVG ↗</a></div>
      </article>
    </section>
    <footer>青岚山境 · 青绿山水 / 原生 SVG / 1200 × 800 <span>插画用于景观介绍，游览路线请查看导览地图。</span></footer>
  </main>
</template>
<style>
*{box-sizing:border-box}body{margin:0;background:#F8FCFA;color:#193B35;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}main{max-width:1440px;margin:auto;padding:56px 64px}h1,h2,h3,p{margin:0}h1,h2,h3{font-family:'Songti SC',serif;font-weight:600}h1{font-size:34px}h2{font-size:28px}h3{font-size:20px}.eyebrow{font-size:11px;letter-spacing:2px;color:#536B63;margin-bottom:12px}.identity{display:flex;align-items:center;gap:20px}.intro{margin-top:24px;color:#536B63;line-height:1.8}a{color:#175F54;text-decoration:none;font-size:13px;white-space:nowrap}a:hover{text-decoration:underline}.logo-strip{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:40px 0;padding:28px 0;border-block:1px solid #D4E2DB}.logo-strip p:not(.eyebrow){font-size:13px;color:#536B63;margin-top:8px}.sizes{display:flex;gap:36px;align-items:end}.sizes>div{display:flex;align-items:center;flex-direction:column;gap:12px}.sizes small{font-size:11px;color:#536B63}.panorama{position:relative;background:#EAF3EF;border-radius:16px;overflow:hidden}.panorama>div{position:absolute;left:32px;top:32px;max-width:48%}.panorama a{display:inline-block;margin-top:16px}.section-heading{display:flex;align-items:end;justify-content:space-between;margin:48px 0 24px}.section-heading label{font-size:13px;color:#536B63}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 24px}.grid article{min-width:0}.grid .scenic-illustration{border-radius:12px}.caption{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:16px 0}.caption p{margin-top:8px;font-size:12px;line-height:1.7;color:#536B63}footer{display:flex;justify-content:space-between;gap:16px;margin-top:48px;padding-top:24px;border-top:1px solid #D4E2DB;color:#536B63;font-size:11px}@media(max-width:800px){main{padding:28px 20px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:25px}.logo-strip{flex-wrap:wrap}.panorama>div{left:20px;top:20px}.panorama h2{font-size:23px}}@media(max-width:500px){.grid{grid-template-columns:1fr}.section-heading{align-items:start;gap:18px;flex-direction:column}.sizes{gap:28px}.panorama>div{max-width:80%}footer{flex-direction:column}.panorama .scenic-illustration{height:310px!important}}
</style>
