<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {api,sync,rawWorkspace} from '../services/store';
import {useLiveRefresh} from '../app/live-refresh';
import FlowPage from '../components/FlowPage.vue';import FlowPanel from '../components/FlowPanel.vue';import PageHeader from '../components/PageHeader.vue';import AdminButton from '../components/AdminButton.vue';import DrawerPanel from '../components/DrawerPanel.vue';
const text=ref(''),error=ref(''),busy=ref(false),items=ref<any[]>([]),selected=ref<any>(null),reason=ref('');
const labels:Record<string,string>={queued:'等待AI检测',retry:'检测失败，等待重试',passed:'正常，保留',violation:'检测到违规',removed:'违规，已撤回',pending:'待人工复核',superseded:'内容已更新，原结果失效',restored:'已恢复',retained:'已保留',rejected:'已驳回'};
async function load(){const result=await sync();if(result.ok)items.value=rawWorkspace().business.moderation.slice().sort((a:any,b:any)=>b.createdAt?.localeCompare(a.createdAt)||0);else error.value=result.error.message;}
async function check(){busy.value=true;error.value='';try{await api.request('/admin/moderation/check','POST',{text:text.value});await sync(true);await load();text.value='';}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function review(decision:string){busy.value=true;try{await api.request('/admin/moderation/'+selected.value.id,'POST',{expectedVersion:selected.value.version,decision,reason:reason.value});selected.value=null;await sync(true);await load();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
onMounted(load);useLiveRefresh(load);
</script>
<template><FlowPage><PageHeader title="AI言论审核"/><FlowPanel><h2>文本检测</h2><p class="muted">输入游客言论进行试测，结果不会发布到聊天室，也不会触发消息撤回。</p><textarea class="input" v-model="text" aria-label="待检测游客言论" rows="4" maxlength="2000" placeholder="输入需要检测的游客言论"/><div class="toolbar"><AdminButton :disabled="busy||!text.trim()" @click="check">开始AI检测</AdminButton><AdminButton @click="load">刷新结果</AdminButton></div><p v-if="error" class="form-error-banner" role="alert">{{error}}</p></FlowPanel><FlowPanel><h2>检测与复核记录</h2><table class="data-table"><thead><tr><th>来源</th><th>内容</th><th>结果</th><th>依据</th><th>操作</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{item.sample?'文本试测':'聊天室消息'}}</td><td>{{item.text}}</td><td>{{labels[item.status]||item.status}}</td><td>{{item.reason||item.error||'等待模型返回'}}</td><td><AdminButton v-if="item.status==='pending'&&!item.sample" @click="selected=item;reason=''">人工复核</AdminButton></td></tr></tbody></table><p v-if="!items.length" class="muted">暂无检测记录</p></FlowPanel><DrawerPanel v-if="selected" title="言论人工复核" @close="selected=null"><p>{{selected.text}}</p><textarea class="input" v-model="reason" aria-label="复核理由" rows="4"/><div class="toolbar"><AdminButton :disabled="busy||!reason.trim()" @click="review('retained')">保留消息</AdminButton><AdminButton :disabled="busy||!reason.trim()" @click="review('removed')">撤回消息</AdminButton></div><p v-if="error" role="alert">{{error}}</p></DrawerPanel></FlowPage></template>

<style scoped>
.data-table th:first-child { min-width: 6em; }
.data-table td { overflow-wrap: anywhere; }
.toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-block:12px; }
</style>
