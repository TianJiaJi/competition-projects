<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Monitor, Smartphone, ExternalLink, RefreshCw, ClipboardCheck, Save, AlertCircle, Maximize2 } from 'lucide-vue-next';
import { lockPageScroll } from './scroll-lock';
import { campusProject, projectUrl } from './campus-handoff';
import ThemeSelect from './ThemeSelect.vue';
import type { UiReport } from './ui-report';
const expanded=ref(false), checklistOpen=ref(false);
const workspace=ref<HTMLElement|null>(null), closeButton=ref<HTMLButtonElement|null>(null);
let previousFocus: HTMLElement | null = null, unlockScroll: (()=>void) | undefined;
watch(expanded, value => {
  if(value){
    checklistOpen.value=false;
    previousFocus=document.activeElement as HTMLElement | null;
    unlockScroll=lockPageScroll();
    void nextTick(()=>{if(expanded.value)closeButton.value?.focus();});
  }else{
    unlockScroll?.();unlockScroll=undefined;
    void nextTick(()=>{if(!expanded.value && previousFocus?.isConnected)previousFocus.focus({preventScroll:true});});
  }
});
function previewKeyboard(event: KeyboardEvent){
  // Reports and other dialogs can appear above the enlarged preview after saving.
  if(!expanded.value || document.querySelector('.modal-backdrop'))return;
  if(event.key==='Escape'){event.preventDefault();expanded.value=false;return;}
  if(event.key!=='Tab')return;
  const focusable=[...(workspace.value?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), a[href], textarea:not(:disabled), iframe, [tabindex="0"]') || [])].filter(el=>el.getClientRects().length);
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
}
const resultOptions: {value: CheckResult; label:string}[] = [{value:'pending',label:'待检查'},{value:'passed',label:'通过'},{value:'issue',label:'需整改'}];
import { uiCheckKey, type UiCheck, type CheckResult } from './task-store';
const props = defineProps<{ checks: Record<string, UiCheck>; report?: UiReport; busy: boolean }>();
const emit = defineEmits<{ save: [checks: UiCheck[], openReport?: boolean]; opened: [name: string]; report: [id: string] }>();
const pageId = ref<string>('mobile'), device = ref<'phone' | 'desktop'>('phone'), reloadKey = ref(0), opened = ref(false), error = ref(''), frameLoaded = ref(false);
const viewSettings=reactive({phone:{width:390,density:70},desktop:{width:1280,density:100}});
const width=computed({get:()=>viewSettings[device.value].width,set:(value:number)=>{viewSettings[device.value].width=value;}});
// Enlarged phone previews use the real phone width instead of fitting extra content into it.
const expandedPhoneDensity=ref(100);
const density=computed({
  get:()=>expanded.value && device.value==='phone'?expandedPhoneDensity.value:viewSettings[device.value].density,
  set:(value:number)=>{if(expanded.value && device.value==='phone')expandedPhoneDensity.value=value;else viewSettings[device.value].density=value;}
});
const densityOptions=[{value:100,label:'原始 · 100%'},{value:85,label:'紧凑 · 85%'},{value:70,label:'更多内容 · 70%'}];
const viewport = ref<HTMLElement | null>(null), availableWidth = ref(500), availableHeight = ref(0), fitWindow = ref(false);
const drafts = reactive<Record<string, {result: CheckResult; note: string}>>({});
const reportReady=computed(()=>!!props.report && props.report.checks.every(check=>{
  const key=uiCheckKey(check.pageId,check.index),saved=props.checks[key],draft=drafts[key];
  return saved?.savedAt===check.savedAt && saved.result===check.result && saved.note===check.note && (!draft || draft.result===check.result && draft.note.trim()===check.note);
}));
const page = computed(() => campusProject.pages.find(p => p.id === pageId.value)!);
const url = computed(() => projectUrl(page.value, window.location.hostname));
const checks = computed(() => page.value.checks.map((label, index) => { const key = uiCheckKey(pageId.value, index); if (!drafts[key]) drafts[key] = { result: props.checks[key]?.result || 'pending', note: props.checks[key]?.note || '' }; return { label, index, key, draft: drafts[key] }; }));
const widthScale = computed(()=>{
  const widthFit=Math.max(160,availableWidth.value-(expanded.value?16:32))/width.value;
  // Fill the height while keeping a proper portrait viewport rather than a short, wide phone.
  return expanded.value && device.value==='phone'
    ? Math.min(1.5,widthFit,availableHeight.value>0?availableHeight.value/780:1)
    : Math.min(1,widthFit);
});
// Fit width only: adapt the logical viewport height instead of shrinking the whole desktop.
const scale = widthScale;
const frameHeight = computed(() => fitWindow.value && availableHeight.value>0 ? Math.max(100,availableHeight.value-(expanded.value?0:24))/scale.value : device.value==='phone'?780:900);
// Increase the logical viewport, then scale it back into the same physical frame.
const contentWidth=computed(()=>width.value*100/density.value);
const contentHeight=computed(()=>frameHeight.value*100/density.value);
const contentScale=computed(()=>scale.value*density.value/100);
const dimensions = computed(() => ({ width: `${width.value * scale.value}px`, height: `${frameHeight.value * scale.value}px` }));
let observer: ResizeObserver | undefined;
onMounted(() => {
  document.addEventListener('keydown',previewKeyboard);
  if (viewport.value) { observer = new ResizeObserver(([entry]) => { availableWidth.value = entry.contentRect.width; availableHeight.value=entry.contentRect.height; fitWindow.value=expanded.value || window.innerWidth>1100; }); observer.observe(viewport.value); }
});
onBeforeUnmount(() => { observer?.disconnect();document.removeEventListener('keydown',previewKeyboard);unlockScroll?.(); });
watch(pageId, () => { opened.value = false; frameLoaded.value = false; device.value = page.value.device; error.value = ''; });
function changeDevice(value: 'phone' | 'desktop') { device.value = value; }
function openPreview() { if (props.busy) return; opened.value = true; frameLoaded.value = false; reloadKey.value++; emit('opened', page.value.name); }
function completeAll(){
  if(props.busy)return;
  const at=new Date().toISOString();
  const all=campusProject.pages.flatMap(p=>p.checks.map((_,index)=>{
    const key=uiCheckKey(p.id,index),value=drafts[key] || props.checks[key] || {result:'pending' as CheckResult,note:''};
    return {pageId:p.id,index,result:value.result==='issue'?'issue' as const:'passed' as const,note:value.note.trim(),savedAt:at,source:'manual-observation' as const};
  }));
  if(all.some(c=>c.result==='issue' && !c.note)){error.value='请先为需整改的检查项填写问题描述，再一键完成。';return;}
  for(const check of all)drafts[uiCheckKey(check.pageId,check.index)]={result:check.result,note:check.note};
  error.value='';emit('save',all,false);
}
function saveChecks() {
  if (props.busy) return;
  if (checks.value.some(check => check.draft.result === 'issue' && !check.draft.note.trim())) { error.value = '请为需整改的检查项填写问题描述。'; return; }
  error.value = '';
  emit('save', checks.value.map(check => ({ pageId: pageId.value, index: check.index, result: check.draft.result, note: check.draft.note.trim(), savedAt: new Date().toISOString(), source: 'manual-observation' })));
}
</script>
<template>
  <div class="section-intro"><div><span class="eyebrow">UI REVIEW / MANUAL OBSERVATION</span><h1>打开真实项目，逐项检查界面。</h1><p>页面打开不代表测试通过，完成检查后手动保存结果。</p></div><div class="toolbar-actions"><span class="badge">{{ Object.values(props.checks).filter(c=>c.result!=='pending').length }} 项已检查</span><button class="secondary" :disabled="busy" :title="reportReady?'查看已保存的五端检查报告':'一键保存全部检查；保留已有整改及备注，不代表自动浏览器测试'" @click="reportReady && report ? emit('report',report.id) : completeAll()">{{reportReady?'查看报告':'一键完成五端检查'}}</button></div></div>
  <div v-if="expanded" class="preview-backdrop" aria-hidden="true" @click="expanded=false"/>
  <div ref="workspace" class="ui-workspace" :class="{'is-expanded':expanded}" :role="expanded?'dialog':undefined" :aria-modal="expanded?true:undefined" :aria-label="expanded?'放大项目预览':undefined">
    <section class="panel page-catalog"><div class="panel-heading"><h3>五端入口</h3></div><button v-for="entry in campusProject.pages" :key="entry.id" :disabled="busy" :class="{selected:pageId===entry.id}" @click="pageId=entry.id"><Smartphone v-if="entry.device==='phone'" :size="18"/><Monitor v-else :size="18"/><span><b>{{ entry.name }}</b><small>{{ entry.port }} · {{ entry.checks.length }} 项检查</small></span></button><p>交付页面来自校园项目，检查记录只保存在本测试任务。</p></section>
    <section class="panel preview-panel"><div class="preview-toolbar"><div class="device-switch"><button :class="{selected:device==='phone'}" :disabled="busy" @click="changeDevice('phone')"><Smartphone :size="15"/>手机</button><button :class="{selected:device==='desktop'}" :disabled="busy" @click="changeDevice('desktop')"><Monitor :size="15"/>桌面</button></div><div class="preview-settings"><button v-show="!expanded" class="secondary expand-preview" :disabled="busy" aria-label="放大项目预览" title="放大预览与测试清单" @click="expanded=true"><Maximize2 :size="15"/>放大</button><ThemeSelect class="density-select" label="预览内容密度" v-model="density" :disabled="busy" :options="densityOptions"/><ThemeSelect class="viewport-select" label="预览视口宽度" v-model="width" :disabled="busy" :options="(device==='phone' ? [360,390,430] : [1280,1440,1920]).map(size=>({value:size,label:`${size} px`}))"/><template v-if="expanded"><button class="preview-action preview-refresh" :disabled="busy || !opened" aria-label="重新加载项目预览" title="刷新当前预览" @click="openPreview"><RefreshCw :size="14" :class="{spinning:opened && !frameLoaded}"/>刷新</button><button class="icon-button checklist-toggle" aria-label="切换测试清单" :aria-expanded="checklistOpen" title="测试清单" @click="checklistOpen=!checklistOpen"><ClipboardCheck :size="16"/></button><button ref="closeButton" class="preview-action preview-close" aria-label="关闭放大预览" title="关闭放大预览（Esc）" @click="expanded=false">关闭</button></template></div></div><div class="browser-address"><span class="browser-dots">● ● ●</span><code>{{ url }}</code><a :href="url" target="_blank" rel="noopener noreferrer" aria-label="在新窗口打开项目"><ExternalLink :size="15"/></a></div><div ref="viewport" class="project-viewport"><div v-if="!opened" class="empty-state preview-empty"><Monitor :size="40"/><h3>{{ page.name }}</h3><p>点击打开预览，将在这里加载校园项目。<br/>可切换尺寸观察布局，或新窗口打开。</p><button class="primary" :disabled="busy" @click="openPreview">打开项目预览</button></div><div v-else class="scaled-frame" :class="{phone:device==='phone'}" :style="dimensions"><iframe :key="`${pageId}:${reloadKey}`" :src="url" :title="`${page.name}项目预览`" :style="{width:`${contentWidth}px`,height:`${contentHeight}px`,transform:`scale(${contentScale})`}" @load="frameLoaded=true"/></div></div><footer class="preview-status"><span class="density-caption">{{device==='phone'?'手机预览':'桌面视口（不切换项目）'}} · {{density}}% · 实际视口 {{Math.round(contentWidth)}} × {{Math.round(contentHeight)}}<br/>{{ !opened ? '尚未打开预览' : frameLoaded ? '预览加载已返回，请确认页面内容；检查结果仍需手动保存' : '正在加载项目，请确认校园环境已就绪' }}</span><button class="text-button" :disabled="busy || !opened" @click="openPreview"><RefreshCw :size="14"/>重新加载</button></footer></section>
    <section class="panel ui-checklist" :class="{'checklist-open':checklistOpen}"><div class="panel-heading"><h3><ClipboardCheck :size="17"/>页面检查清单</h3></div><div class="checklist-page"><b>{{ page.name }}</b><small>来源：前端交付页面</small></div><form @submit.prevent="saveChecks"><article v-for="check in checks" :key="check.key"><label :for="`check-${check.key}`"><span>{{ check.index+1 }}</span>{{ check.label }}</label><ThemeSelect :id="`check-${check.key}`" :label="`检查结果${check.index+1}`" v-model="check.draft.result" :disabled="busy" :options="resultOptions"/><textarea :aria-label="`检查备注${check.index+1}`" v-model="check.draft.note" :disabled="busy" maxlength="1000" rows="2" placeholder="观察记录 / 问题描述"/><small v-if="props.checks[check.key]">已保存 {{ new Date(props.checks[check.key].savedAt).toLocaleTimeString('zh-CN',{hour12:false}) }}</small></article><p v-if="error" class="inline-error" role="alert"><AlertCircle :size="14"/>{{ error }}</p><button class="primary" type="submit" data-select-obstacle :disabled="busy"><Save :size="15"/>保存页面检查</button></form></section>
  </div>
</template>
<style scoped>
.ui-checklist .panel-heading h3 { font-size:17px; font-weight:600; color:#243d34; }
.ui-checklist .checklist-page b { font-size:13px; font-weight:600; color:#355b40; }
.ui-checklist article label { font-size:13px; font-weight:500; color:#405b39; line-height:1.7; }
.ui-checklist article label span { font-size:11px; font-weight:500; color:#718568; padding-top:2px; }
.preview-settings { display:flex; align-items:center; gap:8px; }
.viewport-select { width:100px; margin-bottom:0; }
.density-select { width:140px; margin-bottom:0; }
.preview-toolbar { flex-wrap:wrap; }
.expand-preview { padding:8px 10px; font-size:11px; }
/* Keep the same preview/checklist DOM so opening and closing never reloads the iframe. */
.preview-backdrop { position:fixed; inset:0; z-index:78; background:rgba(45,48,52,.58); }
.ui-workspace.is-expanded { position:fixed; inset:8px; z-index:79; display:grid; grid-template-columns:minmax(0,1fr) 280px; grid-template-rows:minmax(0,1fr); align-items:stretch; gap:8px; min-height:0; padding:6px; background:#f5f7f3; border:1px solid #e4eae3; border-radius:12px; box-shadow:0 24px 90px #0004; }
.is-expanded .page-catalog,.is-expanded .browser-address,.is-expanded .preview-status { display:none; }
.is-expanded .preview-panel,.is-expanded .ui-checklist { display:flex; flex-direction:column; min-height:0; }
.is-expanded .preview-toolbar { flex-shrink:0; padding:4px 8px; gap:6px; border-bottom:1px solid var(--line); }
.is-expanded .preview-settings { gap:6px; }
.is-expanded .density-select { width:112px; }
.is-expanded .viewport-select { width:80px; }
.is-expanded .preview-settings :deep(.select-trigger) { min-height:30px; padding:6px 8px; }
.is-expanded .project-viewport { flex:1; min-height:0; align-items:center; padding:0; }
.is-expanded .scaled-frame.phone { border-radius:8px; }
.preview-action { min-height:30px; flex-shrink:0; gap:5px; padding:5px 10px; border:1px solid transparent; border-radius:7px; font-size:12px; font-weight:500; line-height:18px; white-space:nowrap; transition:background-color .15s,border-color .15s; }
.preview-refresh { min-width:66px; color:#355b40; background:#f3f7ef; border-color:#dce5d8; }
.preview-refresh:hover:not(:disabled) { background:#e4eedb; border-color:#a6bea0; }
.preview-close { min-width:52px; color:white; background:#25634f; border-color:#25634f; }
.preview-close:hover { background:#1c503f; border-color:#1c503f; }
.preview-action:focus-visible { outline:2px solid #94b28a; outline-offset:2px; }
.checklist-toggle { display:none; }
.is-expanded .ui-checklist { grid-column:auto; overflow:hidden; }
.is-expanded .ui-checklist .panel-heading,.is-expanded .checklist-page { flex-shrink:0; }
.is-expanded .ui-checklist form { flex:1; min-height:0; display:block; overflow:auto; overscroll-behavior:contain; padding:0 14px 12px; scroll-padding-bottom:68px; }
.is-expanded .ui-checklist .primary { position:sticky; bottom:0; z-index:40; margin:12px 0 0; box-shadow:0 -9px 0 5px white; }
@media(max-width:900px) { .ui-workspace.is-expanded { grid-template-columns:minmax(0,1fr) 260px; } }
@media(max-width:700px) {
  .preview-settings { flex-wrap:wrap; }
  .ui-workspace.is-expanded { inset:4px; padding:3px; grid-template-columns:minmax(0,1fr); }
  .is-expanded .preview-toolbar { padding:4px; }
  .is-expanded .density-select { width:108px; }
  .is-expanded .viewport-select { width:76px; }
  .is-expanded .checklist-toggle { display:inline-flex; }
  /* On narrow displays the checklist is a drawer, not a second row stealing phone height. */
  .is-expanded .ui-checklist { display:none; position:absolute; top:84px; right:4px; bottom:4px; width:min(300px,calc(100% - 8px)); z-index:2; box-shadow:-8px 8px 30px #243d3433; }
  .is-expanded .ui-checklist.checklist-open { display:flex; }
  .is-expanded .ui-checklist .panel-heading { padding:10px 14px; }
  .is-expanded .checklist-page { padding:0 14px 8px; }
}
</style>
