<script setup lang="ts">
import { CheckCircle2 } from 'lucide-vue-next';
import type { ApiMaterial } from './campus-handoff';
import type { EndpointConfig } from './types';
defineProps<{ material: ApiMaterial; config: EndpointConfig }>();
</script>
<template>
  <div class="material-detail">
    <div class="material-title"><span class="method" :class="material.method.toLowerCase()">{{material.method}}</span><h3>{{config.name}}</h3><span class="badge muted">{{material.role}}</span></div>
    <code class="endpoint-path">http://localhost:5606{{config.path}}</code>
    <p>{{material.purpose}}</p>
    <div class="material-json">
      <section><h4>请求参数 / 交付示例</h4><pre>{{JSON.stringify(material.request,null,2)}}</pre></section>
      <section><h4>预期响应 · HTTP {{config.status}}</h4><pre>{{JSON.stringify(material.response,null,2)}}</pre></section>
    </div>
    <div class="contract-line"><CheckCircle2 :size="15"/><span>验收点：{{material.checkpoint}}</span></div>
  </div>
</template>
<style scoped>
.material-detail { padding:22px; }
.material-title { align-items:flex-start; }
.material-title h3 { flex:1; min-width:140px; line-height:1.6; color:#294b35; }
.material-detail > p { color:#819087; }
.endpoint-path { color:#617b69; background:#f5f8f1; line-height:1.8; }
.material-json { gap:14px; }
.material-json h4 { color:#72896b; }
.material-json pre { margin-top:9px; min-height:96px; max-height:230px; background:#f5f8f1; color:#355b40; font-size:11px; }
.contract-line { align-items:flex-start; }
@media(max-width:1200px) { .material-json { grid-template-columns:minmax(0,1fr); } }
@media(max-width:700px) { .material-detail { padding:16px; } }
</style>
