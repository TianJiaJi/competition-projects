<script setup lang="ts">
import { provide, ref } from "vue";
import { flowKey } from "../app/flow";
import { useRoute } from "../router";
const route = useRoute();
provide(flowKey, { key: route.value.path, reset: ref(0) });
</script>
<template><section class="flow-page"><slot /></section></template>
