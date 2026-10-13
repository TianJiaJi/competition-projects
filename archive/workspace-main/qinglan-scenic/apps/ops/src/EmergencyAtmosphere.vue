<script setup lang="ts">
import {useId} from 'vue';
const filterId=`emergency-ink-${useId()}`;
</script>
<template>
  <svg class="emergency-atmosphere" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <filter :id="filterId" x="-20%" y="-25%" width="140%" height="150%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".012 .021" numOctaves="3" seed="17" result="ink"/>
        <feDisplacementMap in="SourceGraphic" in2="ink" scale="58" xChannelSelector="R" yChannelSelector="G"/>
        <feGaussianBlur stdDeviation="11"/>
      </filter>
    </defs>
    <g :filter="`url(#${filterId})`" fill="none">
      <rect x="-15" y="-15" width="1630" height="930" rx="58" stroke="#871e22" stroke-width="105" opacity=".67"/>
      <rect x="4" y="5" width="1592" height="890" rx="38" stroke="#df5142" stroke-width="28" opacity=".68"/>
      <path d="M0 60 Q180 10 350 35 M1570 0 Q1610 240 1582 365 M1590 865 Q1440 900 1260 880 M25 850 Q0 670 15 540" stroke="#d34437" stroke-width="37" opacity=".5"/>
    </g>
  </svg>
</template>
<style scoped>
.emergency-atmosphere{position:fixed;inset:0;width:100%;height:100%;z-index:25;pointer-events:none;}
.emergency-atmosphere>g{animation:emergency-breathe 7s ease-in-out infinite alternate;}
@keyframes emergency-breathe{from{opacity:.76}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.emergency-atmosphere>g{animation:none;}}
@media(forced-colors:active){.emergency-atmosphere{display:none;}}
</style>
