<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "surface" | "primary" | "danger" | "ghost";
    size?: "md" | "sm";
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    disabledReason?: string;
  }>(),
  { variant: "surface", size: "md", type: "button" },
);
defineEmits<{ click: [MouseEvent] }>();
</script>

<template>
  <button
    class="btn"
    :class="[`btn--${variant}`, size === 'sm' && 'btn--sm']"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :title="disabled && disabledReason ? disabledReason : undefined"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" style="width: 14px; height: 14px" />
    <slot />
  </button>
</template>
