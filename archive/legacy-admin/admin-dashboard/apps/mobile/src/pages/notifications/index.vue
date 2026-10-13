<script setup lang="ts">
import {ref} from 'vue';import {onShow} from '@dcloudio/uni-app';import {request} from '../../services/qa';import {requireLogin} from '../../services/platform';
const items=ref<any[]>([]),error=ref('');onShow(async()=>{try{await requireLogin();items.value=(await request<any>('/notifications')).items;}catch(e){error.value=(e as Error).message;}});
function appeal(item:any){uni.showModal({title:'提交申诉',editable:true,placeholderText:'请说明申诉原因',success:async r=>{if(r.confirm)try{await request('/appeals','POST',{messageId:item.messageId,reason:r.content});uni.showToast({title:'申诉已提交'});}catch(e){error.value=(e as Error).message;}}});}
</script>
<template><view class="page"><view class="title">消息通知</view><view v-if="error" class="error">{{error}}</view><view class="panel" v-for="(item,i) in items" :key="i"><view class="heading">{{item.title}}</view><view class="body">{{item.body}}</view><button v-if="item.title==='消息已撤回'" class="secondary" @tap="appeal(item)">提交申诉</button></view><view v-if="!items.length" class="empty">暂无通知</view></view></template>
