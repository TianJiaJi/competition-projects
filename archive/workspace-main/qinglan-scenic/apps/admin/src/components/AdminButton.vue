<script setup lang="ts">
import { LiquidGlassButton } from "@scenic/ui/liquid-glass";
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
  <LiquidGlassButton
    :variant="variant === 'primary' ? 'primary' : variant === 'ghost' ? 'transparent' : 'surface'"
    :radius="14"
    class="btn"
    :class="[`btn--${variant}`, size === 'sm' && 'btn--sm']"
    :type="type"
    :disabled="disabled"
    :loading="loading"
    :aria-busy="loading || undefined"
    :title="disabled && disabledReason ? disabledReason : undefined"
    @click="$emit('click', $event)"
  >
    <slot />
  </LiquidGlassButton>
</template>
