<script setup lang="ts">
import { computed, ref } from 'vue';
import { ContourBackground, type ContourTheme, type ContourVariant } from '@scenic/ui/contour';

const theme = ref<ContourTheme>('light');
const variant = ref<ContourVariant>('corners');
const custom = ref(false);
const background = ref('#eaf3ef');
const line = ref('#193b35');
const opacity = ref<number>();
const empty = ref(true);
const tall = ref(false);
const clicks = ref(0);
const effectiveOpacity = computed(() => opacity.value ?? (theme.value === 'dark' ? 0.06 : 0.05));
const settings = computed(() => ({
  theme: theme.value, variant: variant.value, lineOpacity: opacity.value,
  backgroundColor: custom.value ? background.value : undefined,
  lineColor: custom.value ? line.value : undefined,
}));
function reset() {
  theme.value = 'light'; variant.value = 'corners'; custom.value = false;
  background.value = '#eaf3ef'; line.value = '#193b35'; opacity.value = undefined;
  empty.value = true; tall.value = false;
}
</script>

<template>
  <main class="demo">
    <header class="masthead">
      <a class="brand" href="/contour.html">地形留白 <span>CONTOUR / UI</span></a>
      <a class="sibling" href="/">液态玻璃组件 ↗</a>
    </header>

    <section class="intro">
      <div><p class="eyebrow">SHARED BACKGROUND · 01</p><h1>让地形，退到背景里。</h1></div>
      <p class="intro-note">连续地形，疏密起伏。<br />为内容留出安静的空间。</p>
    </section>

    <section class="controls" aria-label="背景设置">
      <label>构图<select v-model="variant" aria-label="构图"><option value="corners">连续地形</option><option value="left">坡脊切片</option><option value="right">凹谷切片</option></select></label>
      <label>主题<select v-model="theme" aria-label="主题"><option value="light">暖灰白</option><option value="dark">炭灰</option></select></label>
      <label class="opacity">线条透明度 <output>{{ Math.round(effectiveOpacity * 100) }}%</output><input aria-label="线条透明度" type="range" min="0" max="0.15" step="0.01" :value="effectiveOpacity" @input="opacity = Number(($event.target as HTMLInputElement).value)" /></label>
      <label class="check"><input v-model="custom" type="checkbox" />自定义配色</label>
      <div v-if="custom" class="colors"><label>底色<input v-model="background" aria-label="底色" type="color" /></label><label>线色<input v-model="line" aria-label="线色" type="color" /></label></div>
      <button class="reset" @click="reset">恢复默认</button>
    </section>

    <div class="preview-label"><span>01 / 主背景</span><div><label class="check"><input v-model="empty" type="checkbox" />只看背景</label><label class="check"><input v-model="tall" type="checkbox" />长页面</label></div></div>
    <ContourBackground v-bind="settings" class="hero" :class="{ 'is-dark': theme === 'dark', 'is-tall': tall }" data-testid="contour-hero">
      <div class="hero-content" :class="{ 'is-empty': empty }">
        <div class="hero-top"><span>FIELD NOTES</span><span>山野之间 / 自有秩序</span></div>
        <div class="hero-copy"><p class="eyebrow">循着起伏，向远处走</p><h2>留白之处<br />自有风景。</h2><p class="description">让地形轻轻铺开，<br />把目光，交还给眼前的内容。</p><button class="explore" @click="clicks++">探索此刻 <span aria-hidden="true">↗</span></button><p class="feedback" aria-live="polite">{{ clicks ? `已响应 ${clicks} 次点击` : ' ' }}</p></div>
        <div class="hero-bottom"><span>全幅地形 · 1.5px · 静态背景</span><span>{{ theme === 'dark' ? 'DARK' : 'LIGHT' }} / {{ Math.round(effectiveOpacity * 100) }}%</span></div>
      </div>
    </ContourBackground>

    <section class="samples" aria-label="容器适配示例">
      <div class="sample-group"><div class="preview-label"><span>02 / 窄容器 · 与页面宽度无关</span><span>320 PX MAX</span></div><ContourBackground v-bind="settings" class="narrow" :class="{ 'is-dark': theme === 'dark' }" data-testid="contour-narrow"><div class="card-copy"><p class="eyebrow">一隅</p><h3>小空间，也有呼吸。</h3><p>窄容器截取局部地形，<br />线宽与间距保持自然。</p></div></ContourBackground></div>
      <div class="sample-group alternate"><div class="preview-label"><span>03 / {{ theme === 'light' ? '深色' : '浅色' }}对照 · 独立实例</span></div><ContourBackground :theme="theme === 'light' ? 'dark' : 'light'" variant="right" class="comparison" :class="{ 'is-dark': theme === 'light' }" data-testid="contour-comparison"><div class="card-copy"><p class="eyebrow">另一种明度</p><h3>看得见，<br />却不抢眼。</h3><p>同样的地形语言，适应不同底色。</p></div></ContourBackground></div>
    </section>
    <footer><span>ContourBackground · Vue 3 / SVG</span><span>全幅覆盖 / 疏密相间 / 静态呈现</span></footer>
  </main>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #fafaf7; color: #30352e; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
button, input, select { font: inherit; }
button, select, input[type='checkbox'], input[type='color'] { cursor: pointer; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #677454; outline-offset: 4px; }
button, a, input, select { -webkit-tap-highlight-color: transparent; }
a { color: inherit; text-decoration: none; }
.demo { max-width: 1920px; padding: 0 48px; margin: auto; }
.masthead { min-height: 86px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #dedfd7; gap: 16px; }
.brand { font-size: 18px; font-weight: 600; letter-spacing: 2px; }
.brand span { font-size: 10px; font-weight: 400; margin-left: 22px; letter-spacing: 1.6px; }
.sibling { color: #6b7065; font-size: 12px; }
.intro { padding: 42px 0 30px; display: flex; align-items: end; justify-content: space-between; gap: 24px; }
.eyebrow { font-size: 10px; letter-spacing: 2px; font-weight: 500; }
h1 { font-size: clamp(25px, 3vw, 38px); font-weight: 500; letter-spacing: -1px; margin: 14px 0 0; }
.intro-note { font-size: 12px; color: #73786d; line-height: 1.9; margin: 0; }
.controls { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; padding: 20px 0; border-block: 1px solid #dedfd7; font-size: 11px; }
.controls > label { display: flex; align-items: center; gap: 10px; }
select { color: inherit; padding: 8px 28px 8px 10px; border: 1px solid #d7dacf; background: transparent; border-radius: 4px; }
.opacity { flex-wrap: wrap; }
.opacity output { min-width: 27px; font-variant-numeric: tabular-nums; }
input[type='range'] { width: 96px; accent-color: #6c765d; }
.check { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
input[type='checkbox'] { accent-color: #626e52; }
.colors { display: flex; gap: 12px; }
.colors label { display: flex; align-items: center; gap: 5px; }
input[type='color'] { width: 25px; height: 25px; padding: 1px; background: transparent; border: 1px solid #d7dacf; }
.reset { border: 0; background: transparent; color: #636b58; font-size: 11px; margin-left: auto; padding: 8px 0; text-decoration: underline; text-underline-offset: 4px; }
.preview-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 24px 0 12px; color: #767b70; font-size: 10px; letter-spacing: .5px; }
.preview-label > div { display: flex; gap: 16px; }
.hero { color: #33392f; border: 1px solid #00000006; border-radius: 3px; }
.hero-content { min-height: 640px; padding: 30px 34px; display: flex; flex-direction: column; justify-content: space-between; }
.is-tall .hero-content { min-height: 1800px; }
.hero-top, .hero-bottom { display: flex; justify-content: space-between; gap: 12px; font-size: 9px; letter-spacing: 1.5px; opacity: .55; }
.hero-copy { align-self: center; width: max-content; max-width: 100%; padding: 52px 0; }
.hero-copy > .eyebrow { opacity: .6; }
h2 { font-size: clamp(40px, 4.5vw, 62px); font-weight: 400; letter-spacing: 2px; line-height: 1.3; margin: 22px 0; }
.description { font-size: 12px; line-height: 2; opacity: .65; }
.explore { margin-top: 18px; background: transparent; color: inherit; border: 1px solid currentColor; border-radius: 2px; padding: 12px 18px; display: flex; gap: 46px; font-size: 11px; }
.explore:hover { background: #8080800c; }
.feedback { min-height: 16px; margin: 10px 0 0; font-size: 10px; opacity: .7; }
.is-empty > * { visibility: hidden; }
.is-dark { color: #e1e4da; color-scheme: dark; }
.samples { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 28px; margin: 8px 0 36px; }
.sample-group { min-width: 0; }
.narrow { max-width: 320px; min-height: 300px; border-radius: 3px; }
.comparison { min-height: 300px; border-radius: 3px; }
.card-copy { padding: 40px 30px; }
.comparison .card-copy { padding-left: clamp(30px, 7vw, 120px); }
h3 { font-size: 23px; font-weight: 400; line-height: 1.5; margin: 25px 0 16px; }
.card-copy > p:last-child { font-size: 11px; opacity: .6; line-height: 1.9; }
footer { display: flex; justify-content: space-between; gap: 16px; padding: 22px 0 30px; border-top: 1px solid #dedfd7; color: #777d6e; font-size: 10px; }
@media (max-width: 900px) { .demo { padding: 0 28px; } .samples { grid-template-columns: 320px minmax(0, 1fr); gap: 20px; } .controls { gap: 16px; } }
@media (max-width: 650px) {
  .demo { padding: 0 18px; } .masthead { min-height: 72px; } .brand { font-size: 16px; } .brand span { display: none; }
  .intro { padding: 30px 0 24px; } .intro-note { display: none; } .controls { gap: 14px; } .opacity { order: 1; } .colors { order: 2; }
  .hero-content { min-height: 600px; padding: 24px 20px; } .hero-top, .hero-bottom { font-size: 8px; letter-spacing: .3px; }
  .hero-copy { padding-block: 40px; } h2 { font-size: 42px; } .samples { grid-template-columns: 1fr; gap: 0; }
  .preview-label > div { gap: 8px; } .preview-label { font-size: 9px; } footer { flex-direction: column; gap: 8px; }
}
</style>
