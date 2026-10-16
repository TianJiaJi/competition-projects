<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import LeaveDetailPage from '../../components/LeaveDetailPage.vue';
const requestId = ref('');
const refreshKey = ref(0);
onLoad(query => { requestId.value = String(query?.id || ''); });
onShow(() => { refreshKey.value++; });
</script>
<template><LeaveDetailPage :request-id="requestId" :refresh-key="refreshKey" /></template>
