<script setup lang="ts">
import { Mountain } from 'lucide-vue-next';
import InkProgress from './InkProgress.vue';
withDefaults(defineProps<{progress?:number;title?:string;message?:string;label?:string;theme?:'dark'|'light'}>(),{
  progress:0,title:'青岚山境',message:'正在构建沙盘与卷轴',label:'景区加载进度',theme:'light',
});
defineEmits<{complete:[]}>();
</script>
<template>
  <div class="scenic-loading-screen global-loading" :data-theme="theme" aria-busy="true">
    <div class="scenic-loading-content">
      <Mountain :size="28" :stroke-width="1.3" aria-hidden="true" />
      <h2>{{ title }}</h2>
      <InkProgress :progress="progress" :label="label" @complete="$emit('complete')" />
      <p role="status">{{ progress>=100?'准备就绪':message }}</p>
    </div>
  </div>
</template>
<style scoped>
.scenic-loading-screen{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:var(--canvas,#eaf3ef);color:var(--brand,#175f54);isolation:isolate;}
.scenic-loading-content{width:calc(100vw - 32px);text-align:center;}
h2{font:500 28px/1.4 var(--serif,'Songti SC',serif);letter-spacing:6px;margin:15px 0 45px;}
p{font:12px/1.6 sans-serif;margin:28px 0 0;color:var(--muted,#536b63);}
svg{opacity:.75;}
[data-theme=dark] :deep(.ink-percentage){text-shadow:none;}
@media(forced-colors:active){.scenic-loading-screen{background:Canvas;color:CanvasText;}}
</style>
