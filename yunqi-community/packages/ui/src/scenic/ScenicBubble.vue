<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { ScrollArea } from '../scrollbar';
defineOptions({inheritAttrs:false});
import { useScenicPopup, type ScenicAnchor } from './useScenicPopup';
const props=defineProps<{anchor?:ScenicAnchor;title:string;eyebrow?:string;fixedRight?:boolean;insets?:{top:number;bottom:number;right:number;left?:number}}>();
const emit=defineEmits<{close:[]}>();
const element=ref<HTMLElement>();
const anchor=computed(()=>props.anchor??{x:0,y:0,visible:false});
const {popupStyle,leader}=useScenicPopup(element,anchor,computed(()=>true),props.insets);
let trigger:HTMLElement|null=null;
onMounted(async()=>{trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;await nextTick();element.value?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});});
onBeforeUnmount(()=>{if(element.value?.contains(document.activeElement))trigger?.focus({preventScroll:true});});
</script>
<template>
  <div class="scenic-bubble-layer">
  <svg v-if="anchor.visible && !fixedRight" class="scenic-leader" aria-hidden="true"><line v-bind="leader"/><circle :cx="anchor.x" :cy="anchor.y" r="4"/></svg>
  <aside v-bind="$attrs" ref="element" class="scenic-bubble" :style="fixedRight ? {left: 'auto', right: `${insets?.right ?? 16}px`, top: `${insets?.top ?? 16}px`, maxHeight: `calc(100% - ${(insets?.top ?? 16) + (insets?.bottom ?? 16)}px)`} : popupStyle" role="dialog" :aria-label="title" @keydown.esc.stop="emit('close')">
    <header><div><small>{{eyebrow}}</small><h2>{{title}}</h2></div><button aria-label="关闭详情" @click="emit('close')"><X :size="24"/></button></header>
    <ScrollArea class="scenic-bubble-content" :label="title"><slot/></ScrollArea>
  </aside>
  </div>
</template>
<style scoped>
.scenic-bubble-layer{position:absolute;inset:0;z-index:20;pointer-events:none;}.scenic-bubble-layer .scenic-bubble{pointer-events:auto;}
.scenic-bubble {box-sizing:border-box;position:absolute;width:420px;max-width:calc(100% - 32px);max-height:calc(100% - 32px);z-index:20;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(140deg,#fffffff7,#f8fcfaeb);border:1px solid white;border-radius:22px;box-shadow:0 18px 65px #173e3424;backdrop-filter:blur(20px);color:#193b35;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:1px solid #d4e2db;}h2{font-size:25px;margin:4px 0 0;}small{font-size:12px;color:#536b63;}
button{display:grid;place-items:center;flex-shrink:0;width:56px;height:56px;border:1px solid #d4e2db;border-radius:16px;background:transparent;color:inherit;cursor:pointer;}button:focus-visible{outline:3px solid #175f54;outline-offset:3px;}
.scenic-bubble-content{overflow:auto;padding:18px 28px 18px 20px;overscroll-behavior:contain;}
.scenic-leader{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:19;overflow:visible;}.scenic-leader line{stroke:#376c60;stroke-width:1.5;}.scenic-leader circle{fill:#f8fcfa;stroke:#376c60;stroke-width:1.5;}
</style>
