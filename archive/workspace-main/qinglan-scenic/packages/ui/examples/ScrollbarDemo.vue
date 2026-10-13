<script setup lang="ts">
import { ref } from 'vue';
import { ScrollArea, type ScrollState, type ScrollTheme, type ScrollVisibility } from '../src/scrollbar';
const theme = ref<ScrollTheme>('light'), visibility = ref<ScrollVisibility>('interaction');
const rows = ref(24), size = ref(6), mounted = ref(true), status = ref<ScrollState>();
const area = ref<InstanceType<typeof ScrollArea>>();
</script>
<template>
  <main :data-theme="theme" :style="{ '--scrollbar-size': `${size}px` }">
    <header><span class="eyebrow">青岚山境 / 共享组件</span><h1>液态玻璃滚动条</h1><p>原生滚动，轻盈的玻璃触感。悬停、滚动或聚焦即可发现滑块。</p></header>
    <section class="controls" aria-label="演示设置">
      <label>主题 <select v-model="theme"><option>light</option><option>dark</option><option>auto</option></select></label>
      <label>显示 <select v-model="visibility"><option value="interaction">交互时</option><option value="always">常驻</option><option value="scroll">滚动时</option></select></label>
      <label>粗细 <input v-model.number="size" type="range" min="4" max="12"></label>
      <button @click="rows += 8">添加内容</button><button @click="rows = 0">清空</button><button @click="rows = 24">重置</button>
      <button @click="area?.scrollTo({ top: 100000 })">滚到底部</button><button @click="mounted = !mounted">挂载 / 卸载</button>
    </section>
    <div class="grid">
      <section class="card"><h2>双向表格</h2><p>固定表头 · 拖拽滑块 · 轨道翻页</p>
        <ScrollArea v-if="mounted" ref="area" class="table-area" direction="both" :theme="theme" :visibility="visibility" label="景区数据表" @scroll="status = $event">
          <table><thead><tr><th>景点</th><th>客流</th><th>开放状态</th><th>巡检记录</th></tr></thead><tbody><tr v-for="n in rows" :key="n"><td>青岚山境 · {{ n }}</td><td>{{ 180 + n * 7 }} 人</td><td>正常开放</td><td><button>查看记录 {{ n }}</button></td></tr></tbody></table>
        </ScrollArea>
        <output>{{ status ? `位置 ${Math.round(status.left)}, ${Math.round(status.top)} / 最大 ${status.maxLeft}, ${status.maxTop}` : '等待滚动' }}</output>
      </section>
      <section class="card"><h2>嵌套内容</h2><p>手机可滑动内容，也可直接拖动滑块</p>
        <ScrollArea class="nested-area" :theme="theme" :visibility="visibility" label="景区介绍">
          <p v-for="n in 5" :key="n">沿溪入山，穿过竹林与石桥。这里保留浏览器原生触摸惯性，内容选择与键盘操作照常工作。</p>
          <ScrollArea class="inner-area" direction="horizontal" :visibility="visibility" label="横向景点"><div class="chips"><button v-for="n in 12" :key="n">景点 {{ n }}</button></div></ScrollArea>
          <label>原生输入框<textarea aria-label="游览笔记" :value="Array.from({length: 12}, (_, n) => `游览笔记 ${n + 1}`).join('\n')" /></label>
          <p v-for="n in 8" :key="n">山风轻拂，云雾缓缓散开。动态内容更新时，滑块自动同步长度和位置。</p>
        </ScrollArea>
      </section>
    </div>
    <section class="card"><h2>现有 DOM 适配</h2><div class="native-example" aria-label="现有滚动元素"><p v-for="n in 12" :key="n">{{ n }} / 无需替换宿主 DOM，保持原有滚动监听与焦点行为。</p></div></section>
    <footer>页面本身也使用同一套适配器。支持明暗主题、键盘与触摸输入。</footer>
  </main>
</template>
<style>
* { box-sizing: border-box; } body { margin: 0; font: 15px/1.6 system-ui, sans-serif; background: #e7eee9; color: #244b40; }
main { min-height: 120vh; padding: 48px max(24px, calc((100vw - 1200px)/2)); background: radial-gradient(ellipse at 90% 5%, #aacbbe99, transparent 50%), #eaf1ed; }
main[data-theme='dark'] { background: radial-gradient(ellipse at 90% 5%, #274f42, transparent 50%), #14251f; color: #e4eee8; }
h1 { font: 500 40px/1.3 Georgia, serif; margin: 12px 0; } h2 { font-size: 20px; margin: 0; }.eyebrow { font-size: 12px; letter-spacing: .18em; } header p, .card > p, footer { opacity: .7; }
.controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 28px 0; }.controls label { display: flex; gap: 8px; align-items: center; }
button, select { font: inherit; color: inherit; background: #b1cdb533; border: 1px solid #769f7f66; padding: 7px 12px; border-radius: 9px; } button { cursor: pointer; } select option { color: #244b40; background: white; }
.grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; }.card { min-width: 0; margin-bottom: 24px; padding: 24px; border: 1px solid #ffffff77; border-radius: 20px; background: #ffffff18; box-shadow: 0 12px 40px #244b4009; }
.table-area, .nested-area { height: 340px; border-radius: 10px; border: 1px solid #769f7f44; }.nested-area { padding: 0 28px 0 16px; }.inner-area { height: 84px; border: 1px solid #769f7f44; padding: 12px 8px 26px; }.chips { display: flex; gap: 8px; width: max-content; }
table { border-collapse: separate; border-spacing: 0; min-width: 800px; width: 100%; } th, td { text-align: left; padding: 13px 28px 13px 16px; border-bottom: 1px solid #769f7f33; } th { position: sticky; top: 0; background: #d9e7df; color: #244b40; z-index: 1; }
textarea { display: block; width: 100%; height: 100px; color: inherit; background: #ffffff15; border: 1px solid #769f7f66; padding: 8px; } output { display: block; font-size: 12px; min-height: 20px; margin-top: 12px; }.native-example { overflow: auto; height: 150px; padding-right: 28px; } footer { padding: 24px 0 80px; }
@media(max-width: 760px) { main { padding: 24px 16px; } .grid { grid-template-columns: 1fr; } h1 { font-size: 30px; } .card { padding: 16px; } }
</style>
