<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: "neutral" | "success" | "warning" | "danger" | "info";
    icon?: string;
  }>(),
  { tone: "neutral", icon: "●" },
);
</script>

<template>
  <span class="tag" :class="tone !== 'neutral' ? `tag--${tone}` : undefined">
    <span aria-hidden="true">{{ icon }}</span
    >{{ label }}
  </span>
</template>
