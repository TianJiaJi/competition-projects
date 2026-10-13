<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  foot?: string;
  to?: string;
}>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button class="metric-card" type="button" @click="$emit('open')">
    <span class="metric-card__label">{{ label }}</span>
    <span class="metric-card__value num">{{ value }}</span>
    <span v-if="foot" class="metric-card__foot">{{ foot }}</span>
  </button>
</template>
