<script setup lang="ts">
import type {ScrollIntroState} from '@scene/scroll';
import {ScenicLoadingScreen} from '../progress';
withDefaults(defineProps<{state:ScrollIntroState;progress?:number;showProgress?:boolean}>(),{progress:0,showProgress:true});
</script>
<template>
 <div class="scroll-presentation" :data-intro-state="state" :aria-busy="state!=='ready'&&state!=='failed'">
  <slot />
  <ScenicLoadingScreen v-if="state==='loading' && showProgress" class="ink-loading" :progress="progress" />
  <div v-if="state!=='ready'&&state!=='failed'" class="scroll-input-shield" aria-hidden="true" @pointerdown.stop.prevent @wheel.stop.prevent @touchstart.stop.prevent />
 </div>
</template>
<style scoped>
.scroll-presentation{position:relative;width:100%;height:100%;}
.scroll-input-shield{position:absolute;inset:0;z-index:5;touch-action:none;}
</style>
