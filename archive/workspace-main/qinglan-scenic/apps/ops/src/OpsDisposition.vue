<script setup lang="ts">
import {formatNumber} from "../../../packages/client/src/format-number";
import {computed} from 'vue';
import {Activity} from 'lucide-vue-next';
import {ScenicChart,getChartTheme,type EChartsOption} from '@scenic/ui/charts';
import {LiquidGlassSurface} from '@scenic/ui/liquid-glass';
import type {OpsAlertStatistics} from '@scenic/contracts';
const props=defineProps<{stats:OpsAlertStatistics;theme:'dark'|'light'}>();
const emit=defineEmits<{ready:[id:string]}>();
const palette=computed(()=>getChartTheme(props.theme));
const states=computed(()=>[
  {name:'待处理',value:props.stats.pending,color:palette.value.colors.warning},
  {name:'处理中',value:props.stats.processing,color:palette.value.colors.blue},
  {name:'已处理',value:props.stats.resolved,color:palette.value.colors.green},
]);
const ring=computed<EChartsOption>(()=>({animation:false,tooltip:{...palette.value.tooltip,trigger:'item',formatter:'{b}：{c} 条'},series:[{type:'pie',radius:['65%','86%'],center:['50%','50%'],label:{show:false},data:states.value.map(s=>({name:s.name,value:s.value,itemStyle:{color:s.color}}))}]}));
const trend=computed<EChartsOption>(()=>({animation:false,textStyle:palette.value.text,grid:{left:22,right:8,top:12,bottom:22},tooltip:{...palette.value.tooltip,trigger:'axis'},xAxis:{type:'category',data:props.stats.trend.map(p=>p.time),axisLabel:{color:palette.value.colors.muted,fontSize:10,formatter:(v:string)=>v.slice(0,2)},axisLine:{show:false},axisTick:{show:false}},yAxis:{type:'value',minInterval:1,axisLabel:{color:palette.value.colors.muted,fontSize:10},splitLine:palette.value.gridLine},series:[['新增','created',palette.value.colors.warning],['完成','completed',palette.value.colors.green]].map(([name,key,color])=>({name,type:'line',symbolSize:4,lineStyle:{width:2},itemStyle:{color},data:props.stats.trend.map(p=>p[key as 'created'|'completed'])}))}));
</script>
<template>
<LiquidGlassSurface class="disposition-panel info-panel" :tint-opacity=".2">
  <div class="section-heading"><h2><Activity :size="17"/>今日告警处置</h2></div>
  <div class="disposition-ring"><ScenicChart :option="ring" label="今日告警状态分布" @ready="emit('ready','status')"/><div class="ring-total"><strong>{{stats.total}}</strong><span>今日事件</span></div></div>
  <div class="disposition-states"><div v-for="s in states" :key="s.name"><i :style="{background:s.color}"/><span>{{s.name}}</span><b>{{s.value}}</b></div></div>
  <div class="disposition-durations"><div><span>平均响应</span><p><b>{{formatNumber(stats.averageResponseMinutes)}}</b> 分钟</p></div><div><span>平均处理</span><p><b>{{formatNumber(stats.averageProcessingMinutes)}}</b> 分钟</p></div></div>
  <div class="disposition-trend-title"><span>分时处置 · 条</span><span><i class="new-dot"/>新增 <i class="done-dot"/>完成</span></div>
  <div class="disposition-trend"><ScenicChart :option="trend" label="今日分时新增与完成告警" @ready="emit('ready','handling-trend')"/></div>
</LiquidGlassSurface>
</template>
