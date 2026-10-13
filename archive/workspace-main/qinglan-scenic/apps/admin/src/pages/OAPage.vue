<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {api,rawWorkspace,sync} from '../services/store';
import type {OA} from '../../../../packages/contracts/src/platform';
import {askConfirm,pushToast} from '../app/state';
import {useLiveRefresh} from '../app/live-refresh';
import FlowPage from '../components/FlowPage.vue';
import FlowPanel from '../components/FlowPanel.vue';
import PageHeader from '../components/PageHeader.vue';
import AdminButton from '../components/AdminButton.vue';
import DrawerPanel from '../components/DrawerPanel.vue';
import FormField from '../components/FormField.vue';
const items=ref<OA[]>([]),selected=ref<OA|null>(null),opinion=ref(''),error=ref(''),busy=ref(false),filter=ref('pending');
const labels:Record<string,string>={pending:'待审批',approved:'已批准',rejected:'已驳回',withdrawn:'已撤回'};
async function load(){const r=await sync();if(!r.ok){error.value=r.error.message;return;}items.value=rawWorkspace().business.oa;}
function applicant(id:string){return rawWorkspace()?.users.find((u:any)=>u.id===id)?.name||id;}
function taskTitle(id:string){return rawWorkspace()?.snapshot.alerts.find((t:any)=>t.id===id)?.title||id;}
function open(item:OA){selected.value={...item,records:item.records.map(r=>({...r}))};opinion.value='';error.value='';}
async function decide(decision:'approved'|'rejected'){if(!selected.value||!opinion.value.trim())return;const target=selected.value,runId=api.runId;if(!await askConfirm({title:decision==='approved'?'批准申请':'驳回申请',message:opinion.value,confirmText:'确认提交'}))return;busy.value=true;try{await api.runtime();if(runId!==api.runId)throw Error('运行已切换，请重新打开申请');await api.request('/admin/oa-requests/'+target.id+'/decision','POST',{expectedVersion:target.version,decision,opinion:opinion.value});await sync(true);selected.value=null;await load();pushToast('success','审批已保存，前线将同步收到结果');}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
onMounted(load);useLiveRefresh(load);
</script>
<template><FlowPage><PageHeader title="OA审批"/><FlowPanel><div class="toolbar"><label>审批状态 <select class="select" v-model="filter"><option value="all">全部</option><option v-for="(label,key) in labels" :value="key">{{label}}</option></select></label><AdminButton @click="load">刷新</AdminButton></div><p v-if="error" class="form-error-banner" role="alert">{{error}}</p><div class="table-scroll"><table class="data-table"><thead><tr><th>申请原因</th><th>物资与协助需求</th><th>申请人</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in items.filter(i=>filter==='all'||i.status===filter)" :key="item.id"><td>{{item.reason}}</td><td>{{item.needs}}</td><td>{{applicant(item.applicantId)}}</td><td>{{labels[item.status]}}</td><td><AdminButton size="sm" @click="open(item)">查看申请</AdminButton></td></tr></tbody></table><p v-if="!items.length" class="muted">暂无OA申请</p></div></FlowPanel><DrawerPanel v-if="selected" title="OA申请详情" @close="selected=null"><p>关联任务：{{taskTitle(selected.taskId)}}</p><p>{{selected.reason}}</p><p>{{selected.needs}}</p><p>当前状态：{{labels[selected.status]}}</p><p v-for="record in selected.records">{{record.actorName}} · {{record.opinion}}</p><template v-if="selected.status==='pending'"><FormField label="审批意见" field="opinion" required><textarea class="input" id="oa-opinion" v-model="opinion" aria-label="审批意见" maxlength="500" rows="5"/></FormField><div class="toolbar"><AdminButton :disabled="busy||!opinion.trim()" @click="decide('approved')">批准</AdminButton><AdminButton :disabled="busy||!opinion.trim()" @click="decide('rejected')">驳回</AdminButton></div></template><p v-if="error" class="form-error-banner" role="alert">{{error}}</p></DrawerPanel></FlowPage></template>

<style scoped>
.data-table th:first-child { min-width: 6em; }
.data-table td { overflow-wrap: anywhere; }
.toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-block:12px; }
</style>
