<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, CheckCircle2 } from 'lucide-vue-next';
import { workflowSteps, nextTestStep, type TestStep, type WorkflowSection } from './test-workflow';
import type { CampusTaskStore } from './task-store';
const props=defineProps<{store:CampusTaskStore;sections?:WorkflowSection[];current:string;busy:boolean;running:boolean}>();
const emit=defineEmits<{navigate:[tab:TestStep|'reports'];next:[tab:TestStep|'reports']}>();
const steps=computed(()=>workflowSteps(props.store,props.sections));
const currentStep=computed(()=>steps.value.find(step=>step.id===props.current));
const destination=computed(()=>nextTestStep(props.store,currentStep.value?.id,props.sections));
const destinationLabel=computed(()=>steps.value.find(step=>step.id===destination.value)?.label || '验收报告');
</script>
<template>
  <div class="header-test-navigation" aria-label="测试任务流程">
    <div class="workflow-steps" role="group" aria-label="测试阶段切换">
      <button v-for="(step,index) in steps" :key="step.id" :class="{active:current===step.id,done:step.done}" :disabled="busy" :aria-current="current===step.id?'step':undefined" :aria-label="`${step.label}，已完成${step.count}/${step.total}项`" :title="`${step.label} · ${step.count} / ${step.total} 项已记录`" @click="emit('navigate',step.id)"><CheckCircle2 v-if="step.done" :size="13"/><span v-else class="step-number">{{index+1}}</span><span>{{step.label}}</span><small>{{step.count}}/{{step.total}}</small></button>
    </div>
    <button v-if="current==='overview'" class="workflow-next" :disabled="busy || running" @click="emit('navigate',destination)">开始测试<ArrowRight :size="13"/></button>
    <button v-else-if="currentStep?.done" class="workflow-next" :disabled="busy || running" @click="emit('next',destination)">{{destination==='reports'?'下一步：汇总验收报告':`下一项：${destinationLabel}`}}<ArrowRight :size="13"/></button>
  </div>
</template>
<style scoped>
.header-test-navigation{display:flex;align-items:center;justify-content:center;gap:14px;flex:1;min-width:0}
.workflow-steps{display:flex;align-items:center;gap:4px;padding:3px;background:#f4f7f1;border:1px solid #e7ede2;border-radius:8px}
.workflow-steps button{height:30px;padding:0 10px;gap:6px;border-radius:5px;color:#84917c;font-size:11px;white-space:nowrap;border:1px solid transparent}
.workflow-steps button:hover:not(:disabled){background:#eaf1e4;color:#426b4c}
.workflow-steps .active{background:white;border-color:#dce7d5;color:#25634f;box-shadow:0 1px 3px #304f3810}
.step-number{font:9px var(--mono);color:#95a18c}.workflow-steps small{font:9px var(--mono);color:#98a48c}
.workflow-steps .done{background:#dceedd;border-color:#b8d5bb;color:#29633d}
.workflow-steps .done small{color:#4d7d52}
.workflow-steps .done:hover:not(:disabled){background:#cfe5d2;color:#245b36}
.workflow-steps .done.active{background:#d5e9d8;border-color:#679b72;box-shadow:inset 0 0 0 1px #679b7240}
.workflow-next{height:32px;padding:0 11px;border:1px solid #d9e5d1;border-radius:6px;font-size:11px;white-space:nowrap;color:#356f50;background:white}.workflow-next:hover:not(:disabled){background:#f0f6eb}
@media(max-width:1250px){.workflow-steps small{display:none}.workflow-steps button{padding:0 7px}.header-test-navigation{gap:8px}}
@media(max-width:1050px){.workflow-steps{display:none}.header-test-navigation{justify-content:flex-end}}
@media(max-width:700px){.workflow-next{font-size:10px;padding:0 7px;gap:4px}}
</style>
