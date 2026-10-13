<script setup lang="ts">
import { ref } from 'vue';
import { ArrowUpRight, Navigation, RotateCcw } from 'lucide-vue-next';
import { LiquidGlassButton, LiquidGlassSurface, LiquidGlassScene, type GlassStatus } from '@scenic/ui/liquid-glass';
import landscape from './landscape.svg?url';
const radius = ref(14);
const blur = ref(2);
const opacity = ref(0.18);
const fallback = ref(false);
const mounted = ref(true);
const status = ref<GlassStatus>('css');
const count = ref(0);
const message = ref('选择一个操作，试试按钮的触感。');
function act(label: string) { count.value++; message.value = `${label} · 已触发 ${count.value} 次`; }
</script>

<template>
  <main>
    <header><a href="#" class="brand">青岚 <span>/ 共享组件</span></a><span class="version">LIQUID GLASS · VUE 3</span></header>
    <section class="intro"><p class="eyebrow">材质轻盈，轮廓利落</p><h1>更通透，也更轻盈。</h1><p>让山色透过玻璃，以细亮边和柔和反光勾勒轮廓。</p></section>
    <div class="workspace">
      <div class="preview">
        <LiquidGlassScene v-if="mounted" :background="landscape" :disabled="fallback" @status="status = $event" @error="message = $event.message">
          <div class="scene-layout">
            <div class="scene-caption"><span>青岚山水</span><small>公共按钮 · 实时预览</small></div>
            <div class="samples">
              <div class="sample"><small>01 / 默认 {{ radius }}px</small><LiquidGlassButton :radius="radius" :blur="blur" :tint-opacity="opacity" @click="act('开始游览')"><Navigation :size="18" />开始游览<ArrowUpRight :size="17" /></LiquidGlassButton></div>
              <div class="sample"><small>02 / 胶囊对比 24px</small><LiquidGlassButton :radius="24" :blur="blur" :tint-opacity="opacity" @click="act('原版对比')">胶囊形状对比<ArrowUpRight :size="17" /></LiquidGlassButton></div>
              <div class="sample"><small>03 / 品牌色</small><LiquidGlassButton variant="primary" :radius="radius" :blur="blur" :tint-opacity="opacity" @click="act('规划路线')">规划路线<ArrowUpRight :size="17" /></LiquidGlassButton></div>
              <div class="sample"><small>04 / 更通透</small><LiquidGlassButton variant="transparent" :radius="radius" :blur="blur" :tint-opacity="opacity / 2" style="--glass-text-color: #fff" @click="act('查看景点')">查看景点<ArrowUpRight :size="17" /></LiquidGlassButton></div>
            </div>
            <div class="scene-footer"><span>山色入玻璃，文字保持清晰。</span><span class="status">{{ status === 'css' ? '轻透玻璃' : '清透 · 无模糊' }}</span></div>
          </div>
        </LiquidGlassScene>
        <div v-else class="unmounted">预览已收起。</div>
        <p class="feedback" role="status">{{ message }}</p>
      </div>
      <aside>
        <h2>调到刚刚好</h2><p>14px 圆角，2px 轻柔模糊。</p>
        <label class="range-label" for="radius">圆角 <output>{{ radius }} px</output></label><input id="radius" v-model.number="radius" type="range" min="0" max="24" />
        <label class="range-label" for="blur">背景模糊 <output>{{ blur }} px</output></label><input id="blur" v-model.number="blur" type="range" min="0" max="8" />
        <label class="range-label" for="opacity">底色浓度 <output>{{ Math.round(opacity * 100) }}%</output></label><input id="opacity" v-model.number="opacity" type="range" min="0" max="0.6" step="0.01" />
        <label class="check"><input v-model="fallback" type="checkbox" />关闭模糊，保留通透感</label>
        <button class="reset" @click="radius = 14; blur = 2; opacity = 0.18"><RotateCcw :size="15" />恢复默认</button>
        <div class="note">底色浓度越低，越能看清后面的山色。悬停时只有反光轻轻亮起，文字保持清晰。</div>
      </aside>
    </div>
    <LiquidGlassSurface as="section" class="surface-example" aria-label="公共玻璃容器预览">
      <h2>容器与按钮</h2><p>容器使用第 1 款，普通按钮使用第 4 款，选中按钮使用第 3 款。</p>
      <LiquidGlassButton variant="transparent" :tint-opacity=".09" @click="act('容器内操作')">普通操作</LiquidGlassButton>
      <LiquidGlassButton variant="primary" :tint-opacity=".09" aria-pressed="true" @click="act('已选中')">已选中</LiquidGlassButton>
    </LiquidGlassSurface>
    <section class="states"><div><h2>状态也保持一致</h2><p>独立使用，也有同样的通透感。</p></div><LiquidGlassButton @click="act('独立按钮')">独立按钮</LiquidGlassButton><LiquidGlassButton disabled>暂不可用</LiquidGlassButton><LiquidGlassButton loading>正在处理</LiquidGlassButton><button class="reset" @click="mounted = !mounted">{{ mounted ? '卸载场景' : '挂载场景' }}</button></section>
    <footer>轻透玻璃 · Vue 共享组件 <span>青岚 · 公共视觉基础</span></footer>
  </main>
</template>

<style>
* { box-sizing: border-box; } body { margin: 0; background: #f4f5ef; color: #193b35; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; } button, input { font: inherit; } main { max-width: 1400px; margin: auto; padding: 30px 48px; } header, footer { display: flex; justify-content: space-between; align-items: center; } header { padding-bottom: 24px; border-bottom: 1px solid #d6ded4; } .brand { color: inherit; text-decoration: none; font-size: 21px; font-weight: 600; } .brand span { margin-left: 14px; font-size: 13px; font-weight: 400; color: #637569; } .version, .eyebrow { font-size: 12px; letter-spacing: 2px; } .version { color: #637569; } .intro { margin: 44px 0 30px; } .eyebrow { color: #577566; } h1 { margin: 10px 0 14px; font-family: 'Songti SC', serif; font-weight: 500; font-size: clamp(28px, 3.4vw, 46px); } .intro > p:last-child, aside > p, .states p { font-size: 14px; color: #637569; line-height: 1.7; } .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 24px; } .preview { min-width: 0; } .liquid-glass-scene { border-radius: 20px; } .scene-layout { min-height: 520px; padding: 32px; display: flex; flex-direction: column; justify-content: space-between; gap: 30px; } .scene-caption { display: flex; flex-direction: column; gap: 7px; } .scene-caption > span { font-family: 'Songti SC', serif; font-size: 24px; letter-spacing: 4px; } .scene-caption small { color: #46675c; font-size: 11px; letter-spacing: 1px; } .samples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 35px; align-self: center; } .sample { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; } .sample small { color: #133f35; font-size: 11px; background: #f4f5efd9; padding: 4px 8px; border-radius: 4px; } .sample .liquid-glass-button { min-width: 180px; font-size: 14px; } .scene-footer { color: white; display: flex; justify-content: space-between; gap: 15px; align-items: center; font-size: 11px; } .status { background: #123c36b3; border: 1px solid #ffffff45; padding: 6px 10px; border-radius: 5px; white-space: nowrap; } aside { background: #fafbf6; border: 1px solid #dce3d8; border-radius: 16px; padding: 25px; align-self: start; } h2 { margin: 0; font-size: 17px; font-weight: 500; } .range-label { display: flex; justify-content: space-between; margin-top: 26px; margin-bottom: 12px; font-size: 13px; } output { color: #577566; font-variant-numeric: tabular-nums; } input[type='range'] { width: 100%; accent-color: #175f54; } .check { display: flex; gap: 8px; align-items: center; margin: 28px 0 20px; font-size: 13px; } input[type='checkbox'] { accent-color: #175f54; } .reset { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid #ccd8cd; background: transparent; color: #193b35; border-radius: 8px; padding: 9px 12px; cursor: pointer; font-size: 12px; } .note { padding-top: 20px; border-top: 1px solid #dce3d8; margin-top: 22px; font-size: 12px; line-height: 1.8; color: #637569; } .feedback { min-height: 20px; font-size: 12px; color: #526d5f; } .states { display: flex; align-items: center; gap: 20px; padding: 25px 0; flex-wrap: wrap; } .states > div { margin-right: auto; } .states p { margin-bottom: 0; } .states .liquid-glass-button { font-size: 13px; } footer { margin-top: 15px; border-top: 1px solid #d6ded4; padding-top: 22px; font-size: 11px; color: #6c7d70; gap: 20px; flex-wrap: wrap; } .unmounted { height: 520px; display: grid; place-items: center; background: #e2e8df; border-radius: 20px; }
@media (max-width: 900px) { main { padding: 24px; } .workspace { grid-template-columns: 1fr; } aside { display: block; } .scene-layout { min-height: 480px; } }
@media (max-width: 520px) { main { padding: 20px 16px; } .version { display: none; } .intro { margin-top: 28px; } .scene-layout { min-height: 660px; padding: 24px; } .samples { grid-template-columns: 1fr; gap: 18px; } .sample .liquid-glass-button { min-width: 200px; } .scene-footer > span:first-child { display: none; } .states { gap: 12px; } .states > div { width: 100%; } }
</style>

<style scoped>
.surface-example{padding:24px;margin-top:20px;}.surface-example p{font-size:14px;color:#536b63;}.surface-example button{margin:0 10px 8px 0;}
</style>
