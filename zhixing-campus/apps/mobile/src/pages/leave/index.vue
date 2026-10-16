<script setup lang="ts">
import LeavePage from "../../components/LeavePage.vue";
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
const requestId = ref('');
onLoad(query => { requestId.value = String(query?.id || ''); });
</script>
<template><LeavePage :request-id="requestId" /></template>
