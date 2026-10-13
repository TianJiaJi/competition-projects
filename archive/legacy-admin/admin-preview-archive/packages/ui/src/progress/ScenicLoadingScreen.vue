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
.scenic-loading-screen{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:#eaf3ef;color:#175f54;isolation:isolate;}
.scenic-loading-content{width:calc(100vw - 32px);text-align:center;}
h2{font:500 28px/1.4 var(--serif,'Songti SC',serif);letter-spacing:6px;margin:15px 0 45px;}p{font:12px/1.6 sans-serif;margin:28px 0 0;color:#536b63;}svg{opacity:.75;}
.scenic-loading-screen[data-theme=dark]{background:#101f22;color:#83cbb6;}
[data-theme=dark] p{color:#a3bbb5;}
[data-theme=dark] :deep(.ink-progress){color:#83cbb6;}
[data-theme=dark] :deep(.ink-percentage){text-shadow:none;}
[data-theme=dark] :deep(.ink-flow){background:linear-gradient(176deg,transparent 5%,#83cbb650 18%,#83cbb6d9 43%,#a3dbc9ec 52%,#83cbb682 73%,transparent 94%);filter:drop-shadow(0 2px 3px #00000026);}
[data-theme=dark] :deep(.ink-flow::before){background:repeating-linear-gradient(178deg,transparent 0 2px,#101f2280 3px,transparent 4px 7px);}
[data-theme=dark] :deep(.ink-flow::after){background:#83cbb6d9;box-shadow:5px 1px 0 -4px #83cbb6aa,11px -4px 0 -5px #83cbb670;}
@media(forced-colors:active){.scenic-loading-screen{background:Canvas;color:CanvasText;}}
</style>
