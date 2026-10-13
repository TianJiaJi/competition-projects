<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { Server, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-vue-next';
import ModalFrame from './ModalFrame.vue';
interface Entry { id: string; name: string; port: number; url: string; state: 'ready' | 'down' | 'conflict'; detail: string }
const rows = ref<Entry[]>([]), checking = ref(false), open = ref(false), error = ref(''), checkedAt = ref('');
let controller: AbortController | undefined;
const ready = computed(() => rows.value.length === 6 && rows.value.every(r => r.state === 'ready'));
async function check() {
  controller?.abort(); const current = new AbortController(); controller = current; checking.value = true; error.value = '';
  try {
    const response = await fetch('/__campus_environment', { signal: AbortSignal.any([current.signal, AbortSignal.timeout(12000)]) });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.services) || data.services.length !== 6 || data.services.some((r: Entry) => !['ready', 'down', 'conflict'].includes(r.state))) throw Error('环境检查不可用');
    rows.value = data.services; checkedAt.value = data.at;
  } catch { if (!current.signal.aborted) { error.value = '环境检查暂不可用，可在UI测试中打开项目或重试。'; rows.value = []; } }
  finally { if (controller === current) checking.value = false; }
}
onMounted(check); onBeforeUnmount(() => controller?.abort());
</script>
<template>
  <button class="environment-button" :class="{ ready }" @click="open = true"><span class="status-dot"/><Server :size="14"/>{{ checking ? '校园环境检查中' : ready ? '校园环境已就绪' : '查看校园环境' }}</button>
  <ModalFrame v-if="open" title="校园项目运行环境" @close="open = false">
    <div class="environment-body"><p>环境检测只核对项目就绪情况，不执行任何测试。</p><p v-if="error" role="alert">{{ error }}</p>
      <article v-for="row in rows" :key="row.id" class="environment-row"><CheckCircle2 v-if="row.state === 'ready'" :size="19"/><AlertCircle v-else :size="19"/><div><b>{{ row.name }}</b><small>{{ row.detail }}</small></div><a :href="row.url" target="_blank" rel="noopener noreferrer">{{ row.port }}<ExternalLink :size="13"/></a></article>
      <small v-if="checkedAt">检查时间：{{ new Date(checkedAt).toLocaleTimeString('zh-CN', { hour12: false }) }}</small>
    </div><div class="dialog-footer"><button class="secondary" :disabled="checking" @click="check"><RefreshCw :size="15"/>{{ checking ? '检查中…' : '重新检查环境' }}</button></div>
  </ModalFrame>
</template>
