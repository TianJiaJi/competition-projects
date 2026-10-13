<script setup lang="ts">
import { computed, inject } from 'vue';
import { finiteClamp, glassContextKey } from './context';
import './material.css';
const props=withDefaults(defineProps<{as?:string;radius?:number;blur?:number;tintOpacity?:number}>(),{as:'div',radius:14,blur:2,tintOpacity:.18});
const scene=inject(glassContextKey,null);
const blur=computed(()=>scene?.status.value==='plain'?0:finiteClamp(props.blur,2,0,8));
const style=computed(()=>({'--glass-radius':`${finiteClamp(props.radius,14,0,9999)}px`,'--glass-blur':`${blur.value}px`,'--glass-tint-opacity':finiteClamp(props.tintOpacity,.18,0,1)}));
</script>
<template><component :is="as" class="liquid-glass-surface liquid-glass-material" :style="style" :data-glass-mode="blur>0?'css':'plain'"><slot/></component></template>
