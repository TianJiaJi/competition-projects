<script setup lang="ts">
import ServicePage from "../../components/ServicePage.vue";
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
const category=ref('booking');
onLoad(query=>{ category.value=String(query?.category || 'booking'); });
</script>
<template><ServicePage page="records" :initial-category="category" /></template>
