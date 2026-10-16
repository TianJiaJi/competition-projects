<script setup lang="ts">
import ServicePage from "../../components/ServicePage.vue";
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
const category=ref('booking');
const refreshKey=ref(0);
onLoad(query=>{ category.value=String(query?.category || 'booking'); });
onShow(()=>{ refreshKey.value++; });
</script>
<template><ServicePage page="records" :initial-category="category" :refresh-key="refreshKey" /></template>
