<script setup lang="ts">
import {reset} from '../../model/store';
function clearCache(){uni.showModal({title:'清理设备缓存',content:'清理本机缓存和登录状态。服务端预约、聊天和游览记录保留。',success:r=>{if(r.confirm){reset();uni.reLaunch({url:'/pages/home/index'});}}});}
</script>
<template><view class="page"><view class="title">设备缓存</view><view class="subtle">景区时间、设施和到离场统一由演示控制端管理。</view><button @tap="clearCache">清理本机缓存</button></view></template>
