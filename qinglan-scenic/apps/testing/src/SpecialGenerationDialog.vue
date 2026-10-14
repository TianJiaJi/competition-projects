<script setup lang="ts">
import { computed } from 'vue';
import { Bot, Check, ChevronRight, FileCode2, Layers3, LoaderCircle, Sparkles } from 'lucide-vue-next';
import ModalFrame from './ModalFrame.vue';
import { assignments } from './campus-handoff';
import { specialGenerationStages, specialTemplates, type CompiledSpecialCase } from './special-plan';
const props=defineProps<{stage:number;assembled:CompiledSpecialCase[]}>();
const emit=defineEmits<{cancel:[]}>();
const progress=computed(()=>Math.round((props.stage+(props.stage===2?props.assembled.length/assignments.length:0))/specialGenerationStages.length*100));
const preview=computed(()=>props.assembled.at(-1));
</script>
<template>
  <ModalFrame title="编排专项测试用例" wide @close="emit('cancel')">
    <div class="special-generation-body">
      <div class="generation-heading"><span class="generation-bot"><Bot :size="25"/></span><div><h3>从后端要求，到可交互测试案例</h3><p>AI编排演示 · 使用本地场景模板，不连接远程AI，不执行真实业务请求</p></div><span class="badge"><Sparkles :size="13"/>约 3 秒</span></div>
      <div class="requirements-prompt"><span>输入 · 后端工程师的 4 项验收要求</span><p>{{assignments.map(item=>item.title).join('；')}}。保留原始验收标准，为每项拼装准备条件、触发请求和结果断言。</p></div>
      <div class="generation-columns">
        <ol class="generation-stages"><li v-for="(label,index) in specialGenerationStages" :key="label" :class="{done:stage>index,current:stage===index}"><Check v-if="stage>index" :size="15"/><LoaderCircle v-else-if="stage===index" class="spinning" :size="15"/><i v-else>{{index+1}}</i><div><b>{{label}}</b><small>{{['提取风险、业务入口与不可修改的验收标准','从本地模板库选择幂等、时段、权限和重试模板','组合条件构造、请求驱动及业务状态断言','核对 4 项场景、12 个模型断言及执行先后','发布场景配置，等待操作者发起测试'][index]}}</small></div></li></ol>
        <section class="generation-artifacts"><h4><Layers3 :size="15"/>模板匹配与拼装</h4><article v-for="template in specialTemplates" :key="template.id" :class="{assembled:assembled.some(item=>item.templateId===template.id)}"><FileCode2 :size="15"/><div><b>{{assignments.find(item=>item.id===template.scenarioId)?.title}}</b><code>{{template.id}}</code></div><span>{{assembled.some(item=>item.templateId===template.id)?'已拼装':stage>=1?'已匹配':'待检索'}}</span></article><div v-if="preview" class="assembled-blocks"><span v-for="block in preview.blocks" :key="block">{{block}}<ChevronRight :size="12"/></span></div><pre v-if="preview" aria-label="场景配置预览">{{JSON.stringify({scenario:preview.scenarioId,template:preview.templateId,endpoint:preview.endpointId,steps:preview.stages,executionMode:preview.executionMode},null,2)}}</pre><div v-else class="generation-preview-empty"><FileCode2 :size="27"/><span>正在将需求映射到场景模板…</span></div></section>
      </div>
      <div class="generation-progress" role="progressbar" aria-label="专项生成进度" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"><span>{{specialGenerationStages[Math.min(stage,specialGenerationStages.length-1)]}}</span><b>{{progress}}%</b><div><i :style="{width:`${progress}%`}"/></div></div>
    </div>
    <div class="dialog-footer"><span class="generation-source">仅生成用例，不会自动开始测试。</span><button class="secondary" @click="emit('cancel')">取消本次生成</button></div>
  </ModalFrame>
</template>
<style scoped>
.special-generation-body { overflow:auto; padding:24px; min-height:0; }
.generation-heading { display:flex; align-items:center; gap:13px; margin-bottom:20px; }
.generation-bot { display:grid; place-items:center; width:46px; height:46px; border-radius:13px; background:#eaf3e3; color:#426e47; flex-shrink:0; }
.generation-heading h3 { font-size:18px; font-weight:500; }
.generation-heading p { font-size:10px; color:#879b7c; margin-top:7px; line-height:1.7; }
.generation-heading > .badge { margin-left:auto; }
.requirements-prompt { padding:15px 18px; border:1px solid #e0e8d8; border-radius:9px; background:#f6f9f1; }
.requirements-prompt > span { font-size:10px; color:#8a9d7d; }
.requirements-prompt p { font-size:12px; line-height:1.9; color:#617c54; margin-top:7px; }
.generation-columns { display:grid; grid-template-columns:minmax(220px,.8fr) minmax(0,1fr); gap:24px; margin:23px 0; }
.generation-stages { list-style:none; padding:0; margin:0; display:grid; align-content:start; }
.generation-stages li { display:flex; gap:10px; align-items:flex-start; color:#a4af9b; padding:12px 0; min-height:66px; }
.generation-stages li > svg,.generation-stages i { margin-top:2px; flex-shrink:0; }
.generation-stages i { font:10px var(--mono); display:grid; place-items:center; width:15px; height:15px; border:1px solid #dce5d5; border-radius:50%; }
.generation-stages b { font-size:12px; font-weight:500; }.generation-stages small { display:block; font-size:10px; line-height:1.8; margin-top:6px; color:#a2ae96; }
.generation-stages .current { color:#25634f; }.generation-stages .current b { font-weight:600; }.generation-stages .done { color:#729368; }
.generation-artifacts { min-width:0; padding:16px; background:#fbfcf8; border:1px solid #e4eadf; border-radius:10px; }
.generation-artifacts h4 { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:500; color:#617f53; margin-bottom:12px; }
.generation-artifacts article { display:flex; align-items:center; gap:9px; padding:9px 0; border-top:1px solid #edf0e9; color:#a1af96; }
.generation-artifacts article b { font-size:11px; font-weight:500; }.generation-artifacts article code { display:block; font-size:9px; margin-top:4px; }.generation-artifacts article > span { margin-left:auto; white-space:nowrap; font-size:10px; }
.generation-artifacts article.assembled { color:#527c49; }
.assembled-blocks { display:flex; flex-wrap:wrap; gap:4px; margin-top:12px; }.assembled-blocks span { display:inline-flex; align-items:center; gap:4px; font-size:9px; color:#79936b; }.assembled-blocks span:last-child svg { display:none; }
.generation-artifacts pre { font-size:10px; padding:12px; max-height:180px; overflow:auto; background:#f0f5e9; color:#5c7750; margin:12px 0 0; }
.generation-preview-empty { display:flex; align-items:center; justify-content:center; gap:10px; min-height:100px; font-size:11px; color:#a1af97; }
.generation-progress { display:grid; grid-template-columns:1fr auto; gap:10px; color:#779367; font-size:11px; }.generation-progress b { font:11px var(--mono); }.generation-progress > div { grid-column:1/-1; height:5px; border-radius:6px; background:#e5eddd; overflow:hidden; }.generation-progress i { display:block; height:100%; background:#4d8256; transition:width .2s; }
.generation-source { margin-right:auto; font-size:10px; color:#91a084; }
@media(max-width:700px) { .special-generation-body { padding:16px; }.generation-heading { flex-wrap:wrap; }.generation-heading h3 { font-size:16px; }.generation-heading > .badge { display:none; }.generation-columns { grid-template-columns:minmax(0,1fr); gap:14px; }.generation-stages li { min-height:0; padding:8px 0; }.generation-stages small { display:none; }.generation-artifacts pre { max-height:130px; }.generation-source { max-width:160px; line-height:1.7; } }
</style>
