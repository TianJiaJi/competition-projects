<script setup lang="ts">
import {computed,useId} from 'vue';
import {createScenicSvg} from '@scene/model';
const props=withDefaults(defineProps<{mapStyle?:'classic'|'qinglv';showLabels?:boolean;showFacilities?:boolean}>(),{mapStyle:'qinglv',showLabels:true,showFacilities:true});
const idPrefix=useId();
const markup=computed(()=>createScenicSvg({...props,style:props.mapStyle,idPrefix}));
</script>
<template><div class="scenic-svg-map" v-html="markup" /></template>
<style scoped>
.scenic-svg-map{width:100%;height:100%;min-height:0;}
.scenic-svg-map :deep(svg){display:block;width:100%;height:100%;}
</style>
