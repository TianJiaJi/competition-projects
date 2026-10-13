<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    white?: boolean;
    active?: boolean;
    size?: number;
  }>(),
  { size: 24 },
);
</script>
<template>
  <image
    :src="
      '/static/icons/' +
      name +
      (white ? '-white' : active ? '-active' : '') +
      '.png'
    "
    :style="{ width: size + 'px', height: size + 'px' }"
    class="icon"
    mode="aspectFit"
  />
</template>
