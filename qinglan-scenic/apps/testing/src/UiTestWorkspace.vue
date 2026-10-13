<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Monitor, Smartphone, ExternalLink, RefreshCw, ClipboardCheck, Save, AlertCircle } from 'lucide-vue-next';
import { campusProject, projectUrl } from './campus-handoff';
import ThemeSelect from './ThemeSelect.vue';
import ModalFrame from './ModalFrame.vue';
const batchOpen=ref(false);
const resultOptions: {value: CheckResult; label:string}[] = [{value:'pending',label:'待检查'},{value:'passed',label:'通过'},{value:'issue',label:'需整改'}];
import { uiCheckKey, type UiCheck, type CheckResult } from './task-store';
const props = defineProps<{ checks: Record<string, UiCheck>; busy: boolean }>();
const emit = defineEmits<{ save: [checks: UiCheck[]]; opened: [name: string] }>();
const pageId = ref<string>('mobile'), device = ref<'phone' | 'desktop'>('phone'), reloadKey = ref(0), opened = ref(false), error = ref(''), frameLoaded = ref(false);
const viewSettings=reactive({phone:{width:390,density:70},desktop:{width:1280,density:100}});
const width=computed({get:()=>viewSettings[device.value].width,set:(value:number)=>{viewSettings[device.value].width=value;}});
const density=computed({get:()=>viewSettings[device.value].density,set:(value:number)=>{viewSettings[device.value].density=value;}});
const densityOptions=[{value:100,label:'原始 · 100%'},{value:85,label:'紧凑 · 85%'},{value:70,label:'更多内容 · 70%'}];
const viewport = ref<HTMLElement | null>(null), availableWidth = ref(500), availableHeight = ref(0), fitWindow = ref(false);
const drafts = reactive<Record<string, {result: CheckResult; note: string}>>({});
const page = computed(() => campusProject.pages.find(p => p.id === pageId.value)!);
const url = computed(() => projectUrl(page.value, window.location.hostname));
const checks = computed(() => page.value.checks.map((label, index) => { const key = uiCheckKey(pageId.value, index); if (!drafts[key]) drafts[key] = { result: props.checks[key]?.result || 'pending', note: props.checks[key]?.note || '' }; return { label, index, key, draft: drafts[key] }; }));
const widthScale = computed(()=>Math.min(1,Math.max(160,availableWidth.value-32)/width.value));
// Fit width only: adapt the logical viewport height instead of shrinking the whole desktop.
const scale = widthScale;
const frameHeight = computed(() => fitWindow.value && availableHeight.value>0 ? Math.max(100,availableHeight.value-24)/scale.value : device.value==='phone'?780:900);
// Increase the logical viewport, then scale it back into the same physical frame.
const contentWidth=computed(()=>width.value*100/density.value);
const contentHeight=computed(()=>frameHeight.value*100/density.value);
const contentScale=computed(()=>scale.value*density.value/100);
const dimensions = computed(() => ({ width: `${width.value * scale.value}px`, height: `${frameHeight.value * scale.value}px` }));
let observer: ResizeObserver | undefined;
onMounted(() => { if (viewport.value) { observer = new ResizeObserver(([entry]) => { availableWidth.value = entry.contentRect.width; availableHeight.value=entry.contentRect.height; fitWindow.value=window.innerWidth>1100; }); observer.observe(viewport.value); } });
onBeforeUnmount(() => observer?.disconnect());
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
  if(all.some(c=>c.result==='issue' && !c.note)){batchOpen.value=false;error.value='请先为需整改的检查项填写问题描述，再一键完成。';return;}
  for(const check of all)drafts[uiCheckKey(check.pageId,check.index)]={result:check.result,note:check.note};
  batchOpen.value=false;emit('save',all);
}
function saveChecks() {
  if (props.busy) return;
  if (checks.value.some(check => check.draft.result === 'issue' && !check.draft.note.trim())) { error.value = '请为需整改的检查项填写问题描述。'; return; }
  error.value = '';
  emit('save', checks.value.map(check => ({ pageId: pageId.value, index: check.index, result: check.draft.result, note: check.draft.note.trim(), savedAt: new Date().toISOString(), source: 'manual-observation' })));
}
</script>
<template>
  <div class="section-intro"><div><span class="eyebrow">UI REVIEW / MANUAL OBSERVATION</span><h1>打开真实项目，逐项检查界面。</h1><p>页面打开不代表测试通过，完成检查后手动保存结果。</p></div><div class="toolbar-actions"><span class="badge">{{ Object.values(props.checks).filter(c=>c.result!=='pending').length }} 项已检查</span><button class="secondary" :disabled="busy" @click="batchOpen=true">一键完成五端检查</button></div></div>
  <div class="ui-workspace"><section class="panel page-catalog"><div class="panel-heading"><h3>五端入口</h3></div><button v-for="entry in campusProject.pages" :key="entry.id" :disabled="busy" :class="{selected:pageId===entry.id}" @click="pageId=entry.id"><Smartphone v-if="entry.device==='phone'" :size="18"/><Monitor v-else :size="18"/><span><b>{{ entry.name }}</b><small>{{ entry.port }} · {{ entry.checks.length }} 项检查</small></span></button><p>交付页面来自校园项目，检查记录只保存在本测试任务。</p></section>
    <section class="panel preview-panel"><div class="preview-toolbar"><div class="device-switch"><button :class="{selected:device==='phone'}" :disabled="busy" @click="changeDevice('phone')"><Smartphone :size="15"/>手机</button><button :class="{selected:device==='desktop'}" :disabled="busy" @click="changeDevice('desktop')"><Monitor :size="15"/>桌面</button></div><div class="preview-settings"><ThemeSelect class="density-select" label="预览内容密度" v-model="density" :disabled="busy" :options="densityOptions"/><ThemeSelect class="viewport-select" label="预览视口宽度" v-model="width" :disabled="busy" :options="(device==='phone' ? [360,390,430] : [1280,1440,1920]).map(size=>({value:size,label:`${size} px`}))"/></div></div><div class="browser-address"><span class="browser-dots">● ● ●</span><code>{{ url }}</code><a :href="url" target="_blank" rel="noopener noreferrer" aria-label="在新窗口打开项目"><ExternalLink :size="15"/></a></div><div ref="viewport" class="project-viewport"><div v-if="!opened" class="empty-state preview-empty"><Monitor :size="40"/><h3>{{ page.name }}</h3><p>点击打开预览，将在这里加载校园项目。<br/>可切换尺寸观察布局，或新窗口打开。</p><button class="primary" :disabled="busy" @click="openPreview">打开项目预览</button></div><div v-else class="scaled-frame" :class="{phone:device==='phone'}" :style="dimensions"><iframe :key="`${pageId}:${reloadKey}`" :src="url" :title="`${page.name}项目预览`" :style="{width:`${contentWidth}px`,height:`${contentHeight}px`,transform:`scale(${contentScale})`}" @load="frameLoaded=true"/></div></div><footer class="preview-status"><span class="density-caption">{{device==='phone'?'手机预览':'桌面视口（不切换项目）'}} · {{density}}% · 实际视口 {{Math.round(contentWidth)}} × {{Math.round(contentHeight)}}<br/>{{ !opened ? '尚未打开预览' : frameLoaded ? '预览加载已返回，请确认页面内容；检查结果仍需手动保存' : '正在加载项目，请确认校园环境已就绪' }}</span><button class="text-button" :disabled="busy || !opened" @click="openPreview"><RefreshCw :size="14"/>重新加载</button></footer></section>
    <section class="panel ui-checklist"><div class="panel-heading"><h3><ClipboardCheck :size="17"/>页面检查清单</h3></div><div class="checklist-page"><b>{{ page.name }}</b><small>来源：前端交付页面</small></div><form @submit.prevent="saveChecks"><article v-for="check in checks" :key="check.key"><label :for="`check-${check.key}`"><span>{{ check.index+1 }}</span>{{ check.label }}</label><ThemeSelect :id="`check-${check.key}`" :label="`检查结果${check.index+1}`" v-model="check.draft.result" :disabled="busy" :options="resultOptions"/><textarea :aria-label="`检查备注${check.index+1}`" v-model="check.draft.note" :disabled="busy" maxlength="1000" rows="2" placeholder="观察记录 / 问题描述"/><small v-if="props.checks[check.key]">已保存 {{ new Date(props.checks[check.key].savedAt).toLocaleTimeString('zh-CN',{hour12:false}) }}</small></article><p v-if="error" class="inline-error" role="alert"><AlertCircle :size="14"/>{{ error }}</p><button class="primary" type="submit" data-select-obstacle :disabled="busy"><Save :size="15"/>保存页面检查</button></form></section>
  </div>
<ModalFrame v-if="batchOpen" title="确认完成五端UI检查" @close="batchOpen=false"><div class="environment-body"><p>请确认已人工检查全部五端页面。此操作将待检查项标记为通过并保存，已有需整改项和备注不会被覆盖。</p><p>这不是自动UI测试。完成后将生成UI测试记录并打开报告。</p></div><div class="dialog-footer"><button class="secondary" @click="batchOpen=false">返回继续检查</button><button class="primary" :disabled="busy" @click="completeAll">已人工检查，完成并生成报告</button></div></ModalFrame>
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
@media(max-width:700px) { .preview-settings { flex-wrap:wrap; } }
</style>
