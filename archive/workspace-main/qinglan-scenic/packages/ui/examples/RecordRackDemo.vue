<script setup lang="ts">
import { computed, ref } from 'vue';
import { RecordRackNav, type RecordRackGroup, type RackPlacement, type RackOrientation, type RackActivation, type RackTheme } from '../src/record-rack';
const groups: RecordRackGroup[] = [
  { id: 'overview', label: '首页', items: [{ id: 'overview', label: '最新文章', href: '#/overview' }] },
  { id: 'content', label: '文字随笔', items: [{ id: 'scenic', label: '日常札记' }, { id: 'articles', label: '阅读笔记' }, { id: 'pois', label: '城市漫游' }] },
  { id: 'orders', label: '创作手记', items: [{ id: 'notices', label: '写作练习' }, { id: 'orders', label: '灵感收集' }, { id: 'slots', label: '幕后故事' }] },
  { id: 'operations', label: '技术博客', items: [{ id: 'facilities', label: '前端开发' }, { id: 'inspections', label: '工具分享' }, { id: 'alerts', label: '开源项目' }] },
  { id: 'accounts', label: '读者来信', items: [{ id: 'users', label: '留言板' }, { id: 'chat', label: '问与答' }, { id: 'knowledge', label: '友情链接' }] },
  { id: 'system', label: '关于本站', items: [{ id: 'service-status', label: '关于作者' }] },
];
const nestedGroups: RecordRackGroup[] = groups.map(group => group.id === 'content' ? {
  ...group, items: [
    { id: 'scenic', label: '日常札记', children: [{ id: 'daily-morning', label: '清晨散步' }, { id: 'daily-weekend', label: '周末慢生活' }, { id: 'daily-letter', label: '给未来的信' }] },
    { id: 'articles', label: '阅读笔记' },
    { id: 'pois', label: '城市漫游', children: [{ id: 'city-streets', label: '街巷之间' }, { id: 'city-cafes', label: '咖啡馆地图' }, { id: 'city-night', label: '夜行记录' }] },
    { id: 'photos', label: '光影收藏', children: [{ id: 'photo-album', label: '本月相册' }] },
    { id: 'drafts', label: '未完待续', children: [{ id: 'draft-hidden', label: '整理中', disabled: true }] },
    { id: 'archive', label: '旧日档案', children: Array.from({ length: 16 }, (_, i) => ({ id: `archive-${i}`, label: i === 3 ? '那些值得被认真记录的平凡日子与微小发现' : `第 ${i + 1} 封旧信`, disabled: i === 1 })) },
  ],
} : group.id === 'operations' ? { ...group, items: group.items.map(item => item.id === 'facilities' ? { ...item, children: [{ id: 'dev-vue', label: 'Vue 实践' }, { id: 'dev-css', label: 'CSS 小实验' }, { id: 'dev-motion', label: '交互动效' }] } : item) } : group);
const advancedDialog = ref<HTMLDialogElement>();
function showAdvanced() { advancedDialog.value?.showModal(); }
const placement = ref<RackPlacement>('left');
const maxVisible = ref(8);
const rackTitle = ref('博客目录');
const orientation = ref<RackOrientation>('auto');
const activeId = ref('articles');
const size = ref(240), damping = ref(18), spacing = ref(62), retreat = ref(124), opacity = ref(.36), blur = ref(18), tilt = ref(-1.5), extract = ref(.5), probe = ref(16), duration = ref(260);
const themeName = ref('mist');
const scenario = ref('nested');
const removedChildIds = ref<string[]>([]);
const reject = ref(false), mounted = ref(true);
const events = ref<string[]>([]), preview = ref('—');
const items = computed<RecordRackGroup[]>(() => {
  if (scenario.value === 'nested') return nestedGroups.map(group => ({ ...group, items: group.items.map(item => ({ ...item, children: item.children?.filter(child => !removedChildIds.value.includes(child.id)) })) }));
  if (scenario.value === 'empty') return [{ id: 'empty', label: '空片单', items: [] }, { id: 'disabled', label: '不可用包装', disabled: true, items: [] }];
  if (scenario.value === 'long') return [...groups, ...Array.from({ length: 10 }, (_, n) => ({ id: `extra-${n}`, label: `专题归档 ${n + 1}`, items: Array.from({ length: 16 }, (_, i) => ({ id: `extra-${n}-${i}`, label: i === 3 ? '那些值得被认真记录的平凡日子与微小发现' : `归档文章 ${i + 1}`, disabled: i === 1 })) }))];
  if (scenario.value === 'removed') return groups.filter(g => !g.items.some(i => i.id === activeId.value));
  return groups;
});
const allLabels = computed(() => items.value.flatMap(group => [group, ...group.items.flatMap(item => [item, ...(item.children ?? [])])]));
const labelFor = (id: string) => items.value.flatMap(group => group.items.flatMap(item => [item, ...(item.children ?? [])])).find(item => item.id === id)?.label ?? allLabels.value.find(item => item.id === id)?.label ?? id;
const activeLabel = computed(() => labelFor(activeId.value));
const theme = computed<RackTheme>(() => ({
  ...(themeName.value === 'ink' ? { '--rack-tint': '30 48 55', '--rack-text': '#eef7f4', '--rack-muted': '#c0d2cc', '--rack-accent': '#a5e6cc', '--rack-active': '#c3f6df', '--rack-highlight': 'rgb(37 69 69 / .92)', '--rack-border': 'rgb(224 255 248 / .4)' } : themeName.value === 'rose' ? { '--rack-tint': '249 226 218', '--rack-text': '#593c41', '--rack-muted': '#795860', '--rack-accent': '#a04864', '--rack-active': '#943857', '--rack-highlight': 'rgb(255 237 233 / .92)' } : {}),
  '--rack-opacity': opacity.value, '--rack-blur': `${blur.value}px`,
}));
function activate(event: RackActivation) {
  events.value = [`${new Date().toLocaleTimeString()} · ${event.source} → ${[event.groupId, event.parentItemId, event.itemId].filter((id): id is string => !!id).map(labelFor).join(' / ')}${reject.value ? ' · 宿主拒绝' : ''}`, ...events.value].slice(0, 6);
  if (!reject.value) activeId.value = event.itemId;
}
</script>

<template>
  <div class="demo" :class="[`dock-${placement}`, `theme-${themeName}`, `orientation-${orientation}`]">
    <div class="ambient ambient-one" /><div class="ambient ambient-two" />
    <header class="masthead"><a href="/">MARGIN / A PERSONAL BLOG</a><span>INTERACTION STUDY — 003</span></header>
    <main>
      <div class="eyebrow"><span /> GLASS RECORDS / 玻璃唱片架</div>
      <h1>把故事，<br />放进一张唱片。</h1>
      <p class="intro">探出、抽取、轻轻转动。<br />在日常、阅读与远行之间，翻到下一篇。</p>
      <section class="page-preview" aria-label="博客文章预览">
        <div class="page-top"><span>页边集 / 慢慢写，慢慢读</span><span class="live">● 持续更新</span></div>
        <div class="page-heading"><h2 data-testid="active-page">{{ activeLabel }}</h2><span class="page-badge">当前页面</span></div>
        <p class="article-excerpt">把走过的街道、读过的句子和一闪而过的灵感，留在这里。写作让日常有了回声，也让偶然路过的我们，有机会交换一种看世界的方式。</p>
        <footer><span>随手记录 · 约 4 分钟阅读</span><span>文 / 页边集</span></footer>
      </section>
      <div class="interaction-note"><span>01 悬停查看片单</span><span>02 点击进入首项</span><span>03 滚轮停稳进入</span></div>
    </main>
    <aside class="controls" aria-label="调参面板">
      <div class="control-title"><span>制作你的唱片架</span><small>LIVE TUNING</small></div>
      <p class="control-description">选一个位置，调一调手感。</p>
      <div class="select-grid"><label>停靠位置<select v-model="placement" aria-label="停靠位置"><option value="left">左侧</option><option value="right">右侧</option><option value="top">顶部</option><option value="bottom">底部</option></select></label>
<label>排列方向<select v-model="orientation" aria-label="排列方向"><option value="auto">自动</option><option value="vertical">纵排</option><option value="horizontal">横排</option></select></label>
<label>玻璃主题<select v-model="themeName" aria-label="玻璃主题"><option value="mist">雾青</option><option value="ink">墨玻璃</option><option value="rose">玫瑰石英</option></select></label></div>
      <div class="sliders"><label>唱片尺寸 <output>{{ size }} px</output><input v-model.number="size" aria-label="唱片尺寸" type="range" min="180" max="340" /></label>
<label>阻尼 <output>{{ damping }}</output><input v-model.number="damping" aria-label="阻尼" type="range" min="6" max="40" /></label></div>
      <button class="advanced-trigger" type="button" aria-haspopup="dialog" @click="showAdvanced">更多设置与演示 <span aria-hidden="true">↗</span></button>
    </aside>
    <dialog ref="advancedDialog" class="advanced-dialog" aria-labelledby="advanced-title" @click="$event.target === advancedDialog && advancedDialog?.close()">
      <div class="advanced-shell">
        <header class="advanced-header"><div><h2 id="advanced-title">唱片架的更多可能</h2><p>细调外观、运动与演示场景</p></div><button type="button" aria-label="关闭更多设置" autofocus @click="advancedDialog?.close()">×</button></header>
        <div class="advanced-body">
          <section aria-labelledby="appearance-title"><h3 id="appearance-title">外观与运动</h3>      <label class="title-setting">标题唱片<input v-model="rackTitle" aria-label="标题唱片" placeholder="留空隐藏标题唱片" /></label>
<div class="sliders advanced-grid"><label>单屏上限 <output>{{ maxVisible }} 张</output><input v-model.number="maxVisible" aria-label="单屏上限" type="range" min="3" max="12" /></label>
<label>错叠间距 <output>{{ spacing }} px</output><input v-model.number="spacing" aria-label="错叠间距" type="range" min="48" max="130" /></label>
<label>退回距离 <output>{{ retreat }} px</output><input v-model.number="retreat" aria-label="退回距离" type="range" min="0" max="144" /></label>
<label>玻璃浓度 <output>{{ Math.round(opacity * 100) }}%</output><input v-model.number="opacity" aria-label="玻璃浓度" type="range" min="0.08" max="0.9" step="0.01" /></label>
<label>模糊 <output>{{ blur }} px</output><input v-model.number="blur" aria-label="模糊" type="range" min="0" max="32" /></label>
<label>包装倾角 <output>{{ tilt }}°</output><input v-model.number="tilt" aria-label="包装倾角" type="range" min="-12" max="12" step="0.5" /></label>
<label>抽出比例 <output>{{ extract }}</output><input v-model.number="extract" aria-label="抽出比例" type="range" min="0.35" max="0.75" step="0.01" /></label>
<label>探出距离 <output>{{ probe }} px</output><input v-model.number="probe" aria-label="探出距离" type="range" min="0" max="100" /></label>
<label>过渡时长 <output>{{ duration }} ms</output><input v-model.number="duration" aria-label="过渡时长" type="range" min="0" max="1000" step="20" /></label></div></section>
          <section aria-labelledby="scenario-title"><h3 id="scenario-title">演示与验证</h3><label>菜单场景<select v-model="scenario" aria-label="菜单场景"><option value="nested">博客三级菜单</option><option value="normal">博客二级菜单</option><option value="long">长菜单 / 禁用项</option><option value="empty">空 / 禁用分组</option><option value="removed">移除当前分组</option></select></label>
            <label class="checkbox"><input v-model="reject" type="checkbox" /> 模拟宿主拒绝导航</label>
            <div v-if="scenario === 'nested'" class="demo-actions"><button @click="activeId = 'archive-15'">外部切到末封旧信</button><button @click="removedChildIds.push(activeId)">移除当前三级项</button><button @click="removedChildIds = []">恢复三级数据</button></div>
            <div class="demo-actions"><button @click="activeId = 'alerts'">外部切到开源项目</button><button @click="mounted = !mounted">{{ mounted ? '卸载组件' : '挂载组件' }}</button></div>
                  <div class="event-log"><span>预选 / {{ preview }}</span><p v-for="(event, i) in events" :key="i" data-testid="nav-event">{{ event }}</p><p v-if="!events.length">等待第一张唱片被播放…</p></div>
          </section>
        </div>
        <footer class="advanced-footer"><span>调整即时生效 · Esc 关闭</span><button type="button" @click="advancedDialog?.close()">完成</button></footer>
      </div>
    </dialog>
    <RecordRackNav v-if="mounted" :title="rackTitle" :items="items" :active-id="activeId" :placement="placement" :orientation="orientation" :layout="{ size, spacing, maxVisible, retreat, tilt, extract, probe }" :motion="{ damping, duration }" :theme="theme" @activate="activate" @preview-change="preview = [$event.parentItemId, $event.itemId].filter((id): id is string => !!id).map(labelFor).join(' / ') || '—'" />
    <div class="edition">V.01 / A QUIETER WAY TO NAVIGATE</div>
  </div>
</template>

<style>
* { box-sizing: border-box; } body { margin: 0; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #25413e; background: #edf1eb; } button, input, select { font: inherit; } button, select, input { accent-color: #416e61; }
.demo { min-height: 100vh; position: relative; overflow: hidden; padding: 34px 42px 48px; background: radial-gradient(ellipse at 36% 30%, #faf9f1 0%, transparent 60%), linear-gradient(125deg, #e0e8dc, #edf0e9 60%, #e0e9e2); }
.ambient { position: absolute; pointer-events: none; border-radius: 50%; filter: blur(20px); }.ambient-one { width: 500px; height: 500px; background: #becdb780; left: -200px; top: 220px; }.ambient-two { width: 430px; height: 430px; border: 80px solid #dee5d480; right: 100px; bottom: -200px; }
.masthead { position: relative; display: flex; justify-content: space-between; font: 9px ui-monospace, monospace; letter-spacing: 2px; color: #6b7c73; }.masthead a { color: inherit; text-decoration: none; }
main { position: relative; }.eyebrow { font: 9px ui-monospace, monospace; letter-spacing: 2px; display: flex; align-items: center; gap: 8px; }.eyebrow > span { width: 6px; height: 6px; border-radius: 50%; background: #52765c; }
h1 { font-size: clamp(32px, 3.7vw, 54px); font-family: 'Songti SC', 'STSong', serif; font-weight: 500; line-height: 1.35; letter-spacing: -1px; margin: 24px 0 18px; }.intro { color: #7a877e; font-size: 12px; line-height: 1.9; margin-bottom: 32px; }
.page-preview { border: 1px solid #ffffffc9; border-radius: 15px; padding: 22px; background: #ffffff4d; box-shadow: 0 14px 40px #526c4b08; backdrop-filter: blur(5px); }.page-top { display: flex; justify-content: space-between; font-size: 9px; color: #77857d; }.live { color: #537464; }.page-heading { display: flex; gap: 12px; align-items: center; margin-top: 20px; }.page-heading h2 { font-size: 20px; font-weight: 500; margin: 0; }.page-badge { background: #dce8dd; color: #627f65; font-size: 8px; border-radius: 4px; padding: 4px 6px; }.page-preview footer { padding-top: 16px; margin-top: 12px; border-top: 1px solid #b2c1b42e; font-size: 9px; color: #8b968d; }.interaction-note { display: flex; justify-content: space-between; margin-top: 22px; font-size: 9px; color: #89968a; }
.controls { padding: 22px; border: 1px solid #ffffffa3; border-radius: 14px; background: #f9faf5a8; backdrop-filter: blur(18px); }.control-title { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 24px; }.control-title small { font: 7px monospace; letter-spacing: 1px; color: #8c978b; }.title-setting { display: block; margin-bottom: 16px; font-size: 10px; color: #788679; }.title-setting input { width: 100%; padding: 8px; margin-top: 7px; border: 1px solid #dce3d7; border-radius: 5px; background: #ffffff80; color: #45604b; font-size: 12px; }
.select-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; }.select-grid label, .sliders label { font-size: 10px; color: #788679; }select { display: block; width: 100%; margin-top: 7px; padding: 8px 4px; color: #45604b; border: 1px solid #dce3d7; border-radius: 5px; background: #ffffff80; font-size: 11px; }.sliders { display: grid; gap: 14px; margin-top: 24px; }.sliders output { float: right; font: 10px monospace; color: #596f59; }.sliders input { display: block; width: 100%; height: 3px; margin: 12px 0 4px; }.checkbox { display: flex; align-items: center; gap: 5px; margin-top: 18px; font-size: 10px; color: #74816f; }.demo-actions { display: flex; gap: 5px; margin-top: 12px; }.demo-actions button { border: 1px solid #d8e0d2; border-radius: 4px; background: #ffffff70; padding: 6px; font-size: 9px; color: #647761; cursor: pointer; }.event-log { margin-top: 20px; padding-top: 14px; border-top: 1px solid #dce3d7; font: 9px monospace; color: #7f8e7c; }.event-log p { font-size: 8px; line-height: 1.7; overflow-wrap: anywhere; }.edition { clear: both; position: relative; font: 8px monospace; letter-spacing: 2px; color: #8f9b8b; padding-top: 44px; margin-left: 330px; }
/* The demo is one viewport; only the advanced dialog scrolls. */
html, body, #app { height: 100%; overflow: hidden; }
.demo { height: 100dvh; min-height: 0; overflow: clip; display: grid; grid-template-columns: minmax(0, 1fr) 268px; grid-template-rows: minmax(0, 1fr); align-items: center; gap: 32px; padding: 66px 32px 44px 320px; }
.masthead { position: absolute; top: 26px; left: 32px; right: 32px; }
.demo main { margin: 0; max-width: 540px; min-width: 0; width: 100%; justify-self: center; grid-column: 1; grid-row: 1; }
.demo .controls { position: relative; float: none; width: 100%; margin: 0; padding: 20px; grid-column: 2; grid-row: 1; z-index: 45; }
.control-title { margin-bottom: 8px; }.control-description { margin: 0 0 18px; font-size: 11px; color: #7a877e; }.controls .select-grid label:last-child { grid-column: 1 / -1; }.controls .sliders { margin-top: 18px; gap: 16px; }
.advanced-trigger { display: flex; justify-content: space-between; width: 100%; margin-top: 22px; padding: 11px 12px; border: 1px solid #cbd8cf; border-radius: 7px; background: #e6eee7; color: #36584b; font-size: 11px; cursor: pointer; }
h1 { font-size: clamp(30px, 3.2vw, 46px); margin: 18px 0 12px; }.intro { margin-bottom: 20px; }.page-preview { padding: 20px; }.article-excerpt { font-size: 13px; line-height: 1.9; color: #6c7d71; margin: 18px 0 0; }.page-preview footer { display: flex; justify-content: space-between; gap: 12px; }.edition { position: absolute; bottom: 16px; right: 32px; padding: 0; margin: 0; }
.demo.dock-right { grid-template-columns: 268px minmax(0, 1fr); padding-left: 32px; padding-right: 320px; }.demo.dock-right main { grid-column: 2; }.demo.dock-right .controls { grid-column: 1; }
.demo.dock-top, .demo.dock-bottom { padding-left: 48px; }.demo.dock-top { padding-top: min(300px, 32dvh); }.demo.dock-bottom { padding-bottom: min(300px, 32dvh); }
.advanced-dialog { width: min(560px, calc(100vw - 32px)); max-width: none; max-height: none; padding: 0; border: 1px solid #ffffffdc; border-radius: 18px; background: #f4f7f0; color: #25413e; box-shadow: 0 24px 100px #183b3633; overflow: hidden; }
.advanced-dialog::backdrop { background: #173c3426; }
.advanced-shell { display: flex; flex-direction: column; max-height: min(760px, calc(100dvh - 32px)); }
.advanced-header { display: flex; justify-content: space-between; gap: 16px; padding: 22px 24px 18px; border-bottom: 1px solid #dce3d7; flex-shrink: 0; }.advanced-header h2 { font-size: 18px; font-weight: 500; margin: 0; }.advanced-header p { margin: 7px 0 0; font-size: 11px; color: #788679; }.advanced-header button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: #e4ece3; color: #45604b; font-size: 22px; cursor: pointer; }
.advanced-body { overflow-y: auto; min-height: 0; padding: 4px 24px 24px; overscroll-behavior: contain; }.advanced-body h3 { margin: 22px 0 18px; font-size: 12px; font-weight: 600; }.advanced-grid { grid-template-columns: 1fr 1fr; gap: 22px 24px; }.advanced-body section + section { margin-top: 26px; border-top: 1px solid #dce3d7; }.advanced-body label { font-size: 11px; color: #788679; }.advanced-footer { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 14px 24px; border-top: 1px solid #dce3d7; font-size: 10px; color: #788679; }.advanced-footer button { border: 0; border-radius: 6px; background: #416e61; color: white; padding: 9px 20px; cursor: pointer; }
@media (max-height: 850px) { .demo h1 { font-size: 32px; margin: 12px 0; }.demo .intro { display: none; }.demo .page-heading { margin-top: 12px; }.demo .article-excerpt { margin-top: 12px; }.demo .interaction-note { margin-top: 12px; } }
@media (max-height: 650px) { .demo .eyebrow, .demo .interaction-note, .demo .page-preview footer { display: none; }.demo .page-preview { padding: 14px; }.demo .article-excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }.demo .controls { padding: 14px; }.control-description { display: none; }.control-title { margin-bottom: 14px; }.demo.dock-top { padding-top: 180px; }.demo.dock-bottom { padding-bottom: 180px; } }
@media (max-width: 1000px) { .demo { gap: 18px; padding-left: 260px; padding-right: 20px; grid-template-columns: minmax(0, 1fr) 232px; }.demo.dock-right { grid-template-columns: 232px minmax(0, 1fr); padding-left: 20px; padding-right: 260px; }.demo.dock-top, .demo.dock-bottom { padding-left: 24px; }.demo .controls { padding: 16px; }.page-top .live, .control-title small { display: none; }.interaction-note { gap: 8px; }.page-heading { flex-wrap: wrap; }.page-preview footer { flex-wrap: wrap; } }
.demo select, .demo .title-setting input {
  appearance: none; min-height: 30px; padding: 5px 22px 5px 0; margin-top: 5px;
  border: 0; border-bottom: 1px solid #8da69666; border-radius: 0; background-color: transparent;
  color: #36584b; font-size: 12px; box-shadow: none;
}
.demo select { cursor: pointer; background-image: linear-gradient(45deg, transparent 50%, #6b8577 50%), linear-gradient(135deg, #6b8577 50%, transparent 50%); background-position: calc(100% - 8px) 13px, calc(100% - 4px) 13px; background-size: 4px 4px; background-repeat: no-repeat; }
.demo select option { background: #edf2e9; color: #36584b; }
.demo .title-setting input { padding-right: 0; }
.demo select:hover, .demo .title-setting input:hover { border-bottom-color: #527965; }
.demo :is(button, select, input):focus-visible { outline: 2px solid #527965; outline-offset: 4px; }
.demo .sliders input { appearance: none; height: 2px; border: 0; background: #a9bbab80; cursor: pointer; }
.demo .sliders input::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; border: 0; border-radius: 50%; background: #527965; box-shadow: 0 0 0 3px #52796512; }
.demo .sliders input::-moz-range-thumb { width: 10px; height: 10px; border: 0; border-radius: 50%; background: #527965; }
@media (max-width: 760px) {
  .demo, .demo.dock-right { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 18px; padding: 54px 18px 42px 176px; }
  .demo.dock-right { padding-left: 18px; padding-right: 176px; }
  .demo main, .demo.dock-right main { grid-column: 1; grid-row: 1; align-self: center; width: calc(100% - 110px); margin-left: 110px; }
  .demo.dock-right main { margin-left: 0; margin-right: 110px; }
  .demo.dock-top main, .demo.dock-bottom main { width: 100%; margin: 0; }
  .demo .controls, .demo.dock-right .controls { grid-column: 1; grid-row: 2; max-width: 420px; justify-self: center; padding: 14px; }
  .demo.dock-top { padding: 210px 20px 32px; }.demo.dock-bottom { padding: 50px 20px 210px; }
  .demo h1 { font-size: 25px; margin: 0 0 12px; }.demo h1 br { display: none; }
  .demo .eyebrow, .demo .intro, .demo .interaction-note, .demo .page-preview footer, .demo .page-top, .demo .control-description { display: none; }
  .demo .page-preview { padding: 14px; }.demo .page-heading { margin-top: 0; }.demo .article-excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; }
  .controls .select-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }.controls .select-grid label:last-child { grid-column: auto; }
  .controls .sliders { grid-template-columns: 1fr 1fr; gap: 18px; }.advanced-trigger { margin-top: 16px; }.control-title { margin-bottom: 16px; }
  .masthead { left: 18px; right: 18px; font-size: 7px; }.masthead > span { display: none; }
}
@media (max-width: 760px) and (max-height: 650px) { .demo .article-excerpt { display: none; }.demo h1 { font-size: 20px; }.demo.dock-top { padding-top: 175px; }.demo.dock-bottom { padding-bottom: 175px; } }
@media (max-width: 760px) {
  .demo.dock-bottom:has(.rr-child) .controls { grid-row: 1; align-self: start; }
  .demo.dock-bottom:has(.rr-child) main { grid-row: 2; }
}
.demo.dock-right.orientation-horizontal:has(.rr-child) .controls { align-self: start; }
</style>
