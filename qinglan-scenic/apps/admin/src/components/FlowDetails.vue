<script setup lang="ts">
import DrawerPanel from './DrawerPanel.vue';
defineProps<{ title: string; facts: Array<[string, unknown]>; wide?: boolean }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <DrawerPanel :title="title" :wide="wide" @close="$emit('close')">
    <dl class="definition-list"><template v-for="[label, value] in facts" :key="label"><dt>{{ label }}</dt><dd class="flow-read-body">{{ value ?? '—' }}</dd></template></dl>
    <slot />
  </DrawerPanel>
</template>
